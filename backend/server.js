// backend/.env is resolved from this file's directory, not the process CWD,
// so `node backend/server.js` (how the Render service starts) and
// `cd backend && npm start` both read the same configuration. In production
// the host's environment variables are authoritative and this file is absent.
require("dotenv").config({ path: require("path").join(__dirname, ".env") });
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const express = require("express");
const path = require("path");
const fs = require("fs");
const cors = require("cors");
const compression = require("compression");
const mongoose = require("mongoose");

const connectDB = require("./config/db");
const {
  getLastConnectionError,
} = require("./config/db");
const {
  describeMongoTarget,
  sanitizeDbError,
  readyStateLabel,
} = require("./utils/dbDiagnostics");
const { createDbGuard } = require("./utils/dbGuard");
const { createTtlCache } = require("./utils/ttlCache");

const app = express();

// Render (and most PaaS hosts) terminate TLS at a proxy,
// so trust the forwarded protocol/host for OAuth callbacks.
app.set("trust proxy", 1);

app.use(cors());
// Raised from the 100kb default so an admin can paste / upload a CSV batch.
app.use(express.json({ limit: "1mb" }));
// Gzip every compressible response (JSON API replies and the served SPA).
// The hashed asset filenames let clients cache for a year, but the first
// visit still downloads them, so shrinking them matters.
app.use(compression());

// Fail fast when the database cannot be reached. Registered before every
// route so a database-backed request answers 503 DB_UNAVAILABLE immediately
// instead of buffering on the driver. Routes that never touch the database
// (health, admin login, the OAuth handshake) are deliberately exempt — they
// are how an operator sees that the database is down. See utils/dbGuard.js.
app.use(
  createDbGuard({
    isConnected: () => mongoose.connection.readyState === 1,
  })
);

const Question = require("./models/Question");
const Result = require("./models/Result");
const Room = require("./models/Room");
const Otp = require("./models/Otp");
const User = require("./models/User");
const adminAuth = require("./middleware/adminAuth");
const userAuth = require("./middleware/auth");
const {
  sendOtpEmail,
  smtpConfigured,
  chooseEmailTransport,
  devOtpAllowed,
  MailDeliveryError,
} = require("./utils/mailer");
const {
  summarizeResults,
  isFiniteNumber,
} = require("./utils/resultSummary");
const {
  buildAdminAnalytics,
  buildUserStats,
} = require("./utils/analytics");
const questionBank = require("./data/questionBank");
const {
  resolveOAuthOrigins,
  callbackUriFor,
} = require("./utils/oauthOrigin");
const {
  buildStateCookie,
  validateOAuthState,
} = require("./utils/oauthState");
const {
  PROBE_CODES,
  PROBE_VERDICTS,
  classifyProviderProbe,
  createRateLimiter,
  diagnosisMessage,
  buildProbeUrl,
  probeSupportFor,
} = require("./utils/oauthDiagnose");
const {
  DIFFICULTIES,
  findDuplicateQuestion,
  escapeRegExp,
  buildQuestionImportPreview,
  questionsToCsv,
  QUESTION_CSV_TEMPLATE,
} = require("./utils/questionBank");
const { toCsv } = require("./utils/csv");
const { AUDIT_ACTIONS } = require("./utils/auditFormat");
const { recordAudit } = require("./utils/audit");
const AuditLog = require("./models/AuditLog");

// Accepts either an admin Bearer token or a raw user token.
// Keeps the two existing auth contracts intact rather than
// inventing a third one.

const userOrAdminAuth = (req, res, next) => {
  const header = req.header("Authorization") || "";

  if (!header) {
    return res.status(401).json({
      message: "Access Denied",
      code: "AUTH_REQUIRED",
    });
  }

  if (/^Bearer\s+/i.test(header)) {
    return adminAuth(req, res, next);
  }

  return userAuth(req, res, next);
};

// Runs once, after the first successful connection. Kept separate from the
// connection itself so a database that is unreachable at boot does not stop
// the HTTP server from listening — connectDB retries and calls this when the
// database finally answers.
const bootstrapDatabase = async () => {
  // Existing accounts predate OTP verification —
  // treat them as already verified.

  await User.updateMany(
    { verified: { $exists: false } },
    { $set: { verified: true } }
  );

  // Seed the starter question bank once.

  const count = await Question.countDocuments();

  if (count === 0) {
    await Question.insertMany(questionBank);

    console.log(
      `Seeded ${questionBank.length} starter questions`
    );
  }

  if (chooseEmailTransport() === "none") {
    if (devOtpAllowed()) {
      console.warn(
        "WARNING: No email transport is configured. ALLOW_DEV_OTP=true " +
          "and NODE_ENV is not production, so OTP codes will be " +
          "exposed through the API for development only."
      );
    } else {
      console.warn(
        "WARNING: No email transport is configured and dev OTP is off — " +
          "users cannot receive OTP emails. Set RESEND_API_KEY or " +
          "BREVO_API_KEY (HTTPS, works on Render's free tier), or " +
          "SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS."
      );
    }
  }

  // One-time hygiene: strip stray whitespace from
  // stored questions so answer comparison is exact.

  await Question.updateMany(
    {},
    [
      {
        $set: {
          question: { $trim: { input: "$question" } },
          answer: { $trim: { input: "$answer" } },
          options: {
            $map: {
              input: "$options",
              as: "option",
              in: { $trim: { input: "$$option" } },
            },
          },
        },
      },
    ],
    { updatePipeline: true }
  );

  await Room.updateMany(
    {},
    [
      {
        $set: {
          questions: {
            $map: {
              input: "$questions",
              as: "q",
              in: {
                _id: "$$q._id",
                question: {
                  $trim: { input: "$$q.question" },
                },
                answer: {
                  $trim: { input: "$$q.answer" },
                },
                options: {
                  $map: {
                    input: "$$q.options",
                    as: "option",
                    in: { $trim: { input: "$$option" } },
                  },
                },
              },
            },
          },
        },
      },
    ],
    { updatePipeline: true }
  );
};

connectDB({ onConnected: bootstrapDatabase });

// Short-lived read cache for the two read-only endpoints the quiz setup
// wizard hits hardest. A 30s TTL removes repeated identical queries; every
// question-bank mutation clears it explicitly so an edit is visible at once.
const QUESTION_READ_CACHE_TTL_MS = 30000;

const questionReadCache = createTtlCache({
  ttlMs: QUESTION_READ_CACHE_TTL_MS,
  maxEntries: 60,
});

const invalidateQuestionReadCache = () => questionReadCache.clear();

const roomRoutes = require("./routes/roomRoutes");

/* =====================
   HEALTH
===================== */

// Production serves the SPA from this origin too, so `/` belongs to the
// frontend shell. Operators and the platform health check poll this
// machine-readable endpoint instead. Not a database route, so it keeps
// answering while MongoDB is unreachable (see utils/dbGuard.js).
app.get("/api/health", (req, res) => {
  res.json({ status: "ok" });
});

/* =====================
   OTP HELPERS
===================== */

const hashOtp = (code) =>
  crypto
    .createHash("sha256")
    .update(String(code))
    .digest("hex");

// Creates a fresh OTP, invalidates previous ones.
// Resolves { sent, devCode } on success. Throws an error
// carrying .status/.code when the code cannot be delivered,
// so the route can return a clear 503 instead of faking success.

const issueOtp = async (email, purpose) => {
  const code = String(
    Math.floor(100000 + Math.random() * 900000)
  );

  await Otp.updateMany(
    { email, purpose, consumed: false },
    { $set: { consumed: true } }
  );

  await Otp.create({
    email,
    purpose,
    codeHash: hashOtp(code),
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
  });

  // May throw MailDeliveryError when SMTP is configured
  // but the provider rejects the send.

  const result = await sendOtpEmail(email, code, purpose);

  if (result.delivered) {
    return { sent: true, devCode: null };
  }

  // SMTP is absent. Only expose the code when the server
  // has explicitly opted in to development OTP.

  if (devOtpAllowed()) {
    return { sent: false, devCode: code };
  }

  const error = new Error(
    "Email delivery is not configured on the server, so the " +
      "verification code cannot be sent. Ask the administrator " +
      "to set SMTP_HOST / SMTP_PORT / SMTP_USER / SMTP_PASS."
  );

  error.code = "EMAIL_NOT_CONFIGURED";
  error.status = 503;

  throw error;
};

// Maps OTP delivery failures to a clear client-facing status.

const sendOtpError = (res, error) => {
  if (
    error instanceof MailDeliveryError ||
    error.code === "EMAIL_NOT_CONFIGURED" ||
    error.code === "EMAIL_SEND_FAILED"
  ) {
    return res.status(error.status || 503).json({
      message: error.message,
      code: error.code,
    });
  }

  console.log(error);

  return res.status(500).json({
    message: "Something went wrong. Please try again.",
    code: "SERVER_ERROR",
  });
};

// Validates without consuming; tracks attempts.

const checkOtp = async (email, purpose, code) => {
  const otp = await Otp.findOne({
    email,
    purpose,
    consumed: false,
  }).sort({ createdAt: -1 });

  if (!otp) {
    return { ok: false, message: "No active code. Request a new one." };
  }

  if (otp.expiresAt < new Date()) {
    return { ok: false, message: "Code expired. Request a new one." };
  }

  if (otp.attempts >= 5) {
    return { ok: false, message: "Too many attempts. Request a new code." };
  }

  if (otp.codeHash !== hashOtp(code)) {
    otp.attempts += 1;

    await otp.save();

    return { ok: false, message: "Incorrect code" };
  }

  return { ok: true, otp };
};

/* =====================
   REGISTER
   (creates an unverified
   account, then OTP)
===================== */

app.post("/api/register", async (req, res) => {
  try {
    const { name, password } = req.body;
    const email = String(req.body.email || "").trim();

    if (!name || !email || !password) {
      return res.status(400).json({
        message: "Name, email and password are required",
      });
    }

    const existingUser = await User.findOne({ email });

    if (existingUser) {
      if (!existingUser.verified) {
        // Account exists but was never verified —
        // resend the code instead of erroring.

        const { sent, devCode } = await issueOtp(
          email,
          "register"
        );

        return res.status(200).json({
          message: "Verification code re-sent",
          requiresVerification: true,
          email,
          emailSent: sent,
          devCode,
        });
      }

      return res.status(400).json({
        message: "User already exists",
      });
    }

    const user = new User({
      name,
      email,
      password: await bcrypt.hash(password, 10),
      verified: false,
      provider: "local",
    });

    await user.save();

    const { sent, devCode } = await issueOtp(email, "register");

    res.status(201).json({
      message: "Verification code sent to your email",
      requiresVerification: true,
      email,
      emailSent: sent,
      devCode,
    });
  } catch (error) {
    sendOtpError(res, error);
  }
});

/* =====================
   VERIFY OTP
   purpose=register -> marks the account verified
   purpose=reset    -> validates only (consumed
   later by reset-password)
===================== */

app.post("/api/verify-otp", async (req, res) => {
  try {
    const { otp, purpose } = req.body;
    const email = String(req.body.email || "").trim();

    if (!email || !otp || !purpose) {
      return res.status(400).json({
        message: "email, otp and purpose are required",
      });
    }

    const result = await checkOtp(email, purpose, otp);

    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }

    if (purpose === "register") {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({
          message: "Account not found",
        });
      }

      user.verified = true;

      await user.save();

      result.otp.consumed = true;

      await result.otp.save();

      return res.json({ message: "Email verified. You can log in now." });
    }

    res.json({ message: "Code verified" });
  } catch (error) {
    res.status(500).json(error);
  }
});

/* =====================
   FORGOT PASSWORD
   (sends a reset OTP)
===================== */

app.post("/api/forgot-password", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim();

    const user = await User.findOne({ email });

    // Generic response: never reveal whether the
    // email is registered.

    if (!user) {
      return res.json({
        message:
          "If that email is registered, a reset code has been sent.",
      });
    }

    const { sent, devCode } = await issueOtp(email, "reset");

    res.json({
      message:
        "If that email is registered, a reset code has been sent.",
      emailSent: sent,
      devCode,
    });
  } catch (error) {
    sendOtpError(res, error);
  }
});

/* =====================
   RESET PASSWORD
   (consumes a verified
   reset OTP)
===================== */

app.post("/api/reset-password", async (req, res) => {
  try {
    const { otp, newPassword } = req.body;
    const email = String(req.body.email || "").trim();

    if (!email || !otp || !newPassword) {
      return res.status(400).json({
        message: "email, otp and newPassword are required",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(404).json({ message: "Account not found" });
    }

    const result = await checkOtp(email, "reset", otp);

    if (!result.ok) {
      return res.status(400).json({ message: result.message });
    }

    user.password = await bcrypt.hash(newPassword, 10);

    await user.save();

    result.otp.consumed = true;

    await result.otp.save();

    res.json({ message: "Password updated. Please log in." });
  } catch (error) {
    res.status(500).json(error);
  }
});
/* =====================
   LOGIN
===================== */

// Accepts bcrypt hashes; legacy plaintext
// passwords are verified directly and
// upgraded to a hash on successful login.

const verifyPassword = async (stored, given) => {
  if (stored.startsWith("$2")) {
    // Recover from passwords registered with a stray
    // leading/trailing space (common on mobile keyboards).

    const candidates = [
      ...new Set([
        given,
        given.trim(),
        given + " ",
        " " + given,
      ]),
    ].filter((candidate) => candidate.length > 0);

    for (const candidate of candidates) {
      if (await bcrypt.compare(candidate, stored)) {
        return true;
      }
    }

    return false;
  }

  return stored === given;
};

app.post("/api/login", async (req, res) => {
  try {
    const email = String(
      req.body.email || ""
    ).trim();

    const password = String(req.body.password ?? "");

    const user =
      await User.findOne({
        email,
      });

    if (!user) {
      return res.status(401).json({
        message: "Invalid Credentials",
      });
    }

    if (!user.verified) {
      const { sent, devCode } = await issueOtp(
        email,
        "register"
      );

      return res.status(403).json({
        message: "Email not verified. A new code has been sent.",
        code: "EMAIL_NOT_VERIFIED",
        requiresVerification: true,
        email,
        emailSent: sent,
        devCode,
      });
    }

    // An admin-disabled account can never log in. Checked
    // after verification so a locked account still receives
    // a freshly sent code and then hits this clean 403.

    if (user.disabled) {
      return res.status(403).json({
        message:
          "This account has been disabled by an administrator.",
        code: "ACCOUNT_DISABLED",
      });
    }

    const valid = await verifyPassword(
      user.password,
      password
    );

    if (!valid) {
      return res.status(401).json({
        message: "Invalid Credentials",
      });
    }

    if (!user.password.startsWith("$2")) {
      user.password = await bcrypt.hash(
        password,
        10
      );

      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id,
        email: user.email,
      },
      process.env.JWT_SECRET,
      {
        expiresIn: "7d",
      }
    );

    res.json({
      message: "Login Successful",
      token,
      user,
    });
  } catch (error) {
    sendOtpError(res, error);
  }
});

/* =====================
   ADMIN LOGIN
   Issues a signed admin JWT — required by
   every admin API below.
===================== */

app.post("/api/admin/login", async (req, res) => {
  try {
    // Trim both sides: env files and mobile keyboards
    // both routinely carry stray whitespace.

    const adminUsername = String(
      process.env.ADMIN_USERNAME || ""
    ).trim();

    const adminPassword = String(
      process.env.ADMIN_PASSWORD || ""
    ).trim();

    // No silent fallback to admin/admin123: a server
    // with no credentials must fail loudly and say so.

    if (!adminUsername || !adminPassword) {
      return res.status(503).json({
        message:
          "Admin login is not configured on this server. " +
          "Set ADMIN_USERNAME and ADMIN_PASSWORD in the " +
          "backend environment, then redeploy.",
        code: "ADMIN_NOT_CONFIGURED",
      });
    }

    const username = String(
      req.body.username || ""
    ).trim();

    const password = String(
      req.body.password || ""
    ).trim();

    if (
      username !== adminUsername ||
      password !== adminPassword
    ) {
      return res.status(401).json({
        message: "Invalid Credentials",
        code: "INVALID_CREDENTIALS",
      });
    }

    const adminToken = jwt.sign(
      { role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "12h" }
    );

    await recordAudit({
      action: AUDIT_ACTIONS.ADMIN_LOGIN,
      summary: "Admin signed in",
    });

    res.json({
      message: "Login Successful",
      adminToken,
    });
  } catch {
    res.status(500).json({
      message: "Admin login failed. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

/* =====================
   HEALTH / CONFIG
   Booleans only — never secret values.
===================== */

app.get("/api/health/config", (req, res) => {
  // The exact callback URIs this server would send the provider, so the
  // operator can copy the right one into Google / Microsoft / GitHub instead
  // of guessing. These are public OAuth values, not secrets.

  const oauth = resolveOAuthOrigins({
    requestOrigin: `${req.protocol}://${req.get("host") || ""}`,
    env: process.env,
    nodeEnv: process.env.NODE_ENV,
  });

  res.json({
    adminConfigured: !!(
      process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD
    ),
    smtpConfigured: smtpConfigured(),
    // Which transport a send would actually use right now: an HTTP provider
    // ("resend" / "brevo", both usable on Render's free tier) wins over SMTP,
    // which Render blocks on ports 25/465/587. Names only — never a key.
    emailTransport: chooseEmailTransport(),
    googleConfigured: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    microsoftConfigured: !!(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET
    ),
    githubConfigured: !!(
      process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET
    ),
    mongoConnected: mongoose.connection.readyState === 1,
    // The raw ready-state so the client can tell "connecting" and
    // "disconnected" apart, not just connected / not connected.
    mongoReadyState: mongoose.connection.readyState,
    mongoReadyStateLabel: readyStateLabel(
      mongoose.connection.readyState
    ),
    env: process.env.NODE_ENV || "development",
    devOtpAllowed: devOtpAllowed(),
    oauthRedirectUris: oauth.redirectUris,
  });
});

/* =====================
   HEALTH / DB
   A real ping, reported without any credential.

   This is the endpoint an operator reaches for when the app "feels slow":
   the connection string is never echoed, only its host names, and the ping
   time plus verdict say whether the server can actually reach its database.
===================== */

const DB_PING_TIMEOUT_MS = 2000;

// Resolves with the promise's value, or rejects if it has not settled in
// time. The late rejection is swallowed so a timeout can never surface as an
// unhandled rejection.
const withTimeout = (promise, ms) => {
  promise.catch(() => {});

  let timer;

  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out after ${ms}ms`)),
      ms
    );
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer)
  );
};

const dbUnreachableMessage = (detail) => {
  const base =
    "The server cannot reach its database. This is a server configuration " +
    "problem, not a problem with the caller. Check MONGO_URI on the host, " +
    "and the MongoDB Atlas network access allow-list so this server's " +
    "outbound IP is permitted.";

  return detail ? `${base} Detail: ${detail}` : base;
};

app.get("/api/health/db", async (req, res) => {
  const readyState = mongoose.connection.readyState;
  const parsed = describeMongoTarget(process.env.MONGO_URI);

  const base = {
    readyState,
    readyStateLabel: readyStateLabel(readyState),
    connected: readyState === 1,
    // Masked: scheme + host names only. Never the username or password.
    target: parsed.target,
    hosts: parsed.hosts,
    database: mongoose.connection.name || parsed.database || null,
    credentialsConfigured: parsed.hadCredentials,
    checkedAt: new Date().toISOString(),
    pingMs: null,
    ok: false,
    verdict: "unreachable",
    message: dbUnreachableMessage(
      sanitizeDbError(getLastConnectionError(), {
        uri: process.env.MONGO_URI,
      })
    ),
  };

  if (readyState !== 1 || !mongoose.connection.db) {
    return res.status(200).json({
      ...base,
      verdict: readyState === 2 ? "connecting" : "unreachable",
      message:
        readyState === 2
          ? "The server is still connecting to its database. Retry in a " +
            "moment; no restart is needed."
          : base.message,
    });
  }

  const started = Date.now();

  let pingError = null;

  try {
    await withTimeout(
      mongoose.connection.db.admin().command({ ping: 1 }),
      DB_PING_TIMEOUT_MS
    );
  } catch (error) {
    pingError = error;
  }

  const pingMs = Date.now() - started;

  if (pingError) {
    return res.status(200).json({
      ...base,
      pingMs,
      verdict: "unreachable",
      message: dbUnreachableMessage(
        sanitizeDbError(pingError, { uri: process.env.MONGO_URI })
      ),
    });
  }

  return res.status(200).json({
    ...base,
    pingMs,
    ok: true,
    verdict: "healthy",
    message: `The server reached its database with a ping in ${pingMs} ms.`,
  });
});

/* =====================
   QUESTIONS
===================== */

// Shared query helpers for the admin question-bank views. Parsing is
// defensive: an unparsable page number falls back to 1, and pageSize is
// capped so a caller cannot ask for the whole bank in one request.

const parsePagination = (query = {}, defaultPageSize = 20) => {
  const parsedPage = Number.parseInt(query.page, 10);
  const parsedSize = Number.parseInt(query.pageSize, 10);

  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;

  const pageSize = Number.isFinite(parsedSize) && parsedSize > 0
    ? Math.min(parsedSize, 100)
    : defaultPageSize;

  return { page, pageSize };
};

// Turns the admin filters into a Mongo query. `all` means "no filter" so the
// UI can send its select value verbatim.

const buildQuestionFilter = (query = {}) => {
  const filter = {};

  const difficulty = String(query.difficulty || "").trim().toLowerCase();
  const category = String(query.category || "").trim().toLowerCase();
  const topic = String(query.topic || "").trim().toLowerCase();
  const search = String(query.search || query.q || "").trim();

  if (difficulty && difficulty !== "all") {
    filter.difficulty = difficulty;
  }

  if (category && category !== "all") {
    filter.category = category;
  }

  if (topic && topic !== "all") {
    filter.topic = topic;
  }

  if (search) {
    // Input is escaped before it reaches the RegExp, so a search for ".*"
    // is a literal search rather than a match-everything pattern.
    const pattern = new RegExp(escapeRegExp(search), "i");

    filter.$or = [
      { question: pattern },
      { topic: pattern },
      { category: pattern },
      { options: pattern },
    ];
  }

  return filter;
};

// Add Question (Admin only) — difficulty/category/topic aware

app.post("/api/questions", adminAuth, async (req, res) => {
  try {
    const candidate = {
      question: String(req.body.question || "").trim(),
      options: (req.body.options || []).map((option) =>
        String(option).trim()
      ),
      answer: String(req.body.answer || "").trim(),
      difficulty: req.body.difficulty || "easy",
      category: req.body.category || "programming",
      topic: String(req.body.topic || "general")
        .toLowerCase()
        .trim(),
    };

    if (!candidate.question || candidate.options.length !== 4) {
      return res.status(400).json({
        success: false,
        message: "A question and exactly 4 options are required.",
        code: "INVALID_QUESTION",
      });
    }

    // Warn about an equivalent question before writing anything. The admin
    // client must send confirmDuplicate: true to proceed. The candidate
    // query tolerates whitespace differences; the fingerprint comparison
    // then decides on the normalised text + option set.
    if (req.body.confirmDuplicate !== true) {
      const words = candidate.question
        .replace(/\s+/g, " ")
        .split(" ")
        .map(escapeRegExp);

      const existing = await Question.find({
        question: new RegExp(`^\\s*${words.join("\\s+")}\\s*$`, "i"),
      })
        .select("question options")
        .lean();

      const duplicate = findDuplicateQuestion(candidate, existing);

      if (duplicate) {
        return res.status(409).json({
          success: false,
          message: "An equivalent question already exists in the bank.",
          code: "DUPLICATE_QUESTION",
          existing: {
            _id: duplicate._id,
            question: duplicate.question,
            options: duplicate.options,
          },
        });
      }
    }

    const question = new Question(candidate);

    await question.save();

    // The bank changed, so the cached meta/pool reads are stale.
    invalidateQuestionReadCache();

    await recordAudit({
      action: AUDIT_ACTIONS.QUESTION_CREATE,
      summary: `Created question “${candidate.question}”`,
      targetType: "question",
      targetId: String(question._id),
      meta: {
        difficulty: question.difficulty,
        topic: question.topic,
        confirmedDuplicate: req.body.confirmDuplicate === true,
      },
    });

    res.status(201).json({
      success: true,
      message: "Question Saved",
      question,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Error Saving Question",
    });
  }
});

// List Users (Admin only)

app.get("/api/users", adminAuth, async (req, res) => {
  try {
    const users = await User.find();
    res.json(users);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Manage Users (Admin only).
//
// Accounts are never deleted here — only enabled/disabled —
// so an attempt history can never be orphaned.

app.get("/api/admin/users", adminAuth, async (req, res) => {
  try {
    const [users, results] = await Promise.all([
      User.find()
        .select("name email provider verified disabled")
        .sort({ name: 1 })
        .lean(),
      Result.find()
        .select(
          "user userId score totalQuestions correct wrong unanswered date"
        )
        .lean(),
    ]);

    res.json({
      users: buildUserStats(users, results),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not load users. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

// Enable / disable an account (Admin only).
//
// middleware/auth.js caches the account status briefly, so the
// cache entry is invalidated below: an already-issued token stops
// working on the very next request.

app.patch(
  "/api/admin/users/:id/disabled",
  adminAuth,
  async (req, res) => {
    try {
      if (typeof req.body.disabled !== "boolean") {
        return res.status(400).json({
          message: "disabled must be true or false.",
          code: "INVALID_STATUS",
        });
      }

      if (!mongoose.isValidObjectId(req.params.id)) {
        return res.status(400).json({
          message: "That user id is not valid.",
          code: "INVALID_USER_ID",
        });
      }

      const user = await User.findByIdAndUpdate(
        req.params.id,
        { $set: { disabled: req.body.disabled } },
        { new: true }
      );

      if (!user) {
        return res.status(404).json({
          message: "User not found.",
          code: "USER_NOT_FOUND",
        });
      }

      // middleware/auth.js caches account status for a few
      // seconds on the hot polling paths. Drop this user's entry
      // so the admin action applies on the very next request.
      userAuth.invalidateAccount(req.params.id);

      await recordAudit({
        action: req.body.disabled
          ? AUDIT_ACTIONS.USER_DISABLE
          : AUDIT_ACTIONS.USER_ENABLE,
        summary: req.body.disabled
          ? `Disabled account ${user.name || user.email}`
          : `Re-enabled account ${user.name || user.email}`,
        targetType: "user",
        targetId: String(user._id),
      });

      res.json({
        message: req.body.disabled
          ? "Account disabled. Existing sessions stop working immediately."
          : "Account re-enabled.",
        user,
      });
    } catch (error) {
      console.log(error);

      res.status(500).json({
        message: "Could not update the account.",
        code: "SERVER_ERROR",
      });
    }
  }
);

// Get All Questions (filterable)

app.get("/api/questions", async (req, res) => {
  try {
    const filter = {};

    if (req.query.difficulty) {
      filter.difficulty = req.query.difficulty;
    }

    if (req.query.topic) {
      filter.topic = req.query.topic;
    }

    const questions = await Question.find(filter);

    res.json(questions);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
    });
  }
});

// Available categories / topics / difficulties
// for the quiz setup wizard.

app.get("/api/questions/meta", async (req, res) => {
  const cacheKey = "questions:meta";

  const cached = questionReadCache.get(cacheKey);

  if (cached !== undefined) {
    return res.json(cached);
  }

  try {
    const questions = await Question.find();

    const topics = {};

    questions.forEach((question) => {
      const topic = question.topic || "general";

      if (!topics[topic]) {
        topics[topic] = {
          topic,
          category: question.category || "general",
          difficulties: new Set(),
        };
      }

      topics[topic].difficulties.add(question.difficulty);
    });

    const meta = Object.values(topics).map((entry) => ({
      topic: entry.topic,
      category: entry.category,
      difficulties: [...entry.difficulties],
    }));

    questionReadCache.set(cacheKey, meta);

    res.json(meta);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Adaptive-difficulty pool: every difficulty for one topic
// (or category), grouped so the client can step between
// levels without re-fetching the bank on each answer.

app.get("/api/questions/pool", async (req, res) => {
  try {
    const filter = {};

    if (req.query.topic) {
      filter.topic = String(req.query.topic).toLowerCase().trim();
    }

    if (req.query.category) {
      filter.category = String(req.query.category).toLowerCase().trim();
    }

    if (Object.keys(filter).length === 0) {
      return res.status(400).json({
        message: "Provide a topic or a category to build a pool from.",
        code: "POOL_FILTER_REQUIRED",
      });
    }

    const cacheKey = `questions:pool:${filter.topic || ""}:${
      filter.category || ""
    }`;

    const cached = questionReadCache.get(cacheKey);

    if (cached !== undefined) {
      return res.json(cached);
    }

    const questions = await Question.find(filter);

    const byDifficulty = { easy: [], medium: [], hard: [] };
    const counts = { easy: 0, medium: 0, hard: 0 };

    questions.forEach((question) => {
      // Unknown difficulty values are dropped rather than
      // silently filed under "easy".

      if (!byDifficulty[question.difficulty]) return;

      byDifficulty[question.difficulty].push(question);
      counts[question.difficulty] += 1;
    });

    const payload = {
      topic: filter.topic || null,
      category: filter.category || null,
      total: questions.length,
      available: Object.keys(counts).filter(
        (level) => counts[level] > 0
      ),
      counts,
      byDifficulty,
    };

    questionReadCache.set(cacheKey, payload);

    res.json(payload);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not build the question pool.",
      code: "SERVER_ERROR",
    });
  }
});

// Update Question (Admin only)

app.put("/api/questions/:id", adminAuth, async (req, res) => {
  try {
    const updatedQuestion =
      await Question.findByIdAndUpdate(
        req.params.id,
        req.body,
        { new: true }
      );

    if (!updatedQuestion) {
      return res.status(404).json({
        message: "That question no longer exists.",
        code: "QUESTION_NOT_FOUND",
      });
    }

    invalidateQuestionReadCache();

    await recordAudit({
      action: AUDIT_ACTIONS.QUESTION_UPDATE,
      summary: `Updated question “${updatedQuestion.question}”`,
      targetType: "question",
      targetId: String(updatedQuestion._id),
      meta: { difficulty: updatedQuestion.difficulty },
    });

    res.json(updatedQuestion);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Delete Question (Admin only)

app.delete("/api/questions/:id", adminAuth, async (req, res) => {
  try {
    const removed = await Question.findByIdAndDelete(
      req.params.id
    );

    invalidateQuestionReadCache();

    await recordAudit({
      action: AUDIT_ACTIONS.QUESTION_DELETE,
      summary: removed
        ? `Deleted question “${removed.question}”`
        : `Deleted question ${req.params.id}`,
      targetType: "question",
      targetId: req.params.id,
    });

    res.json({
      success: true,
      message: "Question Deleted",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
    });
  }
});
/* =====================
   ADMIN QUESTION BANK
   Server-side search, filter, pagination, CSV export and bulk CSV import.
   Every route here is admin-only. The public GET /api/questions used by the
   quiz engine is untouched.
===================== */

// Paginated, filtered listing. This is what the admin page loads instead of
// downloading the whole bank.

app.get("/api/admin/questions", adminAuth, async (req, res) => {
  try {
    const { page, pageSize } = parsePagination(req.query);
    const filter = buildQuestionFilter(req.query);

    const total = await Question.countDocuments(filter);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));

    // A request for a page past the end (a filter shrank the result set)
    // is served as the last page rather than an empty one.
    const currentPage = Math.min(page, totalPages);
    const skip = (currentPage - 1) * pageSize;

    const [items, topics, categories] = await Promise.all([
      Question.find(filter)
        .sort({ _id: -1 })
        .skip(skip)
        .limit(pageSize)
        .lean(),
      Question.distinct("topic"),
      Question.distinct("category"),
    ]);

    res.json({
      items,
      total,
      page: currentPage,
      pageSize,
      totalPages,
      facets: {
        topics: topics.filter(Boolean).sort(),
        categories: categories.filter(Boolean).sort(),
        difficulties: DIFFICULTIES,
      },
      appliedFilters: {
        search: String(req.query.search || "").trim(),
        difficulty: String(req.query.difficulty || "all"),
        topic: String(req.query.topic || "all"),
        category: String(req.query.category || "all"),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not load the question bank. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

// CSV export of the currently filtered view (not just the current page).

app.get("/api/admin/questions/export", adminAuth, async (req, res) => {
  try {
    const filter = buildQuestionFilter(req.query);

    const questions = await Question.find(filter)
      .sort({ _id: -1 })
      .limit(5000)
      .lean();

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="brainrace-questions.csv"'
    );

    res.send(questionsToCsv(questions));
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not export the question bank.",
      code: "SERVER_ERROR",
    });
  }
});

// Downloadable import template.

app.get("/api/admin/questions/template", adminAuth, (req, res) => {
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader(
    "Content-Disposition",
    'attachment; filename="brainrace-questions-template.csv"'
  );

  res.send(QUESTION_CSV_TEMPLATE);
});

const MAX_IMPORT_ROWS = 2000;
const MAX_IMPORT_CHARS = 750000;

/* =====================
   AI QUESTION GENERATION
===================== */

// Generates draft questions with the Gemini API and returns them in the
// SAME CSV shape the bulk-import route accepts. Deliberately no write:
// the admin previews the draft through the existing import preview (with
// its duplicate detection) and confirms there, so the AI can never add
// anything to the bank without the operator seeing it first.

const GEMINI_API_BASE =
  "https://generativelanguage.googleapis.com/v1beta/models";

const AI_CATEGORIES = [
  "Programming",
  "Science",
  "Mathematics",
  "History",
  "General",
];

const AI_DIFFICULTIES = ["easy", "medium", "hard"];

const MAX_QUESTIONS_PER_GENERATION = 30;

// The model must answer with JSON only; still, strip the fences models
// like to wrap around it and take the outermost array defensively.
const extractJsonArray = (text) => {
  const cleaned = String(text || "")
    .replace(/^\s*```(?:json)?/i, "")
    .replace(/```\s*$/i, "")
    .trim();

  const start = cleaned.indexOf("[");
  const end = cleaned.lastIndexOf("]");

  if (start === -1 || end === -1 || end <= start) {
    throw new Error("The model reply did not contain a question list.");
  }

  return JSON.parse(cleaned.slice(start, end + 1));
};

const sanitizeGeneratedQuestion = (raw, fallbackTopic) => {
  const question = String(raw?.question || "").trim();
  const options = Array.isArray(raw?.options)
    ? raw.options.map((option) => String(option || "").trim())
    : [];
  const answer = String(raw?.answer || "").trim();

  if (!question || question.length > 300) return null;
  if (options.length !== 4 || options.some((option) => !option)) return null;
  if (new Set(options).size !== 4) return null;
  if (!options.includes(answer)) return null;

  const difficulty = AI_DIFFICULTIES.includes(
    String(raw?.difficulty || "").toLowerCase()
  )
    ? String(raw.difficulty).toLowerCase()
    : "medium";

  const category = AI_CATEGORIES.includes(String(raw?.category || "").trim())
    ? String(raw.category).trim()
    : "General";

  const topic = String(raw?.topic || fallbackTopic || "")
    .trim()
    .toLowerCase()
    .slice(0, 40);

  return {
    question,
    options,
    answer,
    difficulty,
    category,
    topic,
  };
};

app.post("/api/admin/questions/generate", adminAuth, async (req, res) => {
  const apiKey = process.env.GEMINI_API_KEY;

  if (!apiKey) {
    return res.status(503).json({
      message:
        "AI generation is not configured on this server. Set GEMINI_API_KEY " +
        "in the backend environment (a free key works: " +
        "aistudio.google.com/apikey) and restart.",
      code: "AI_NOT_CONFIGURED",
    });
  }

  const topic = String(req.body?.topic || "").trim().slice(0, 60);
  const difficulty = AI_DIFFICULTIES.includes(
    String(req.body?.difficulty || "").toLowerCase()
  )
    ? String(req.body.difficulty).toLowerCase()
    : "";
  const count = Math.min(
    Math.max(Number.parseInt(req.body?.count, 10) || 10, 1),
    MAX_QUESTIONS_PER_GENERATION
  );

  if (!topic) {
    return res.status(400).json({
      message: "Enter a topic for the questions first.",
      code: "TOPIC_REQUIRED",
    });
  }

  const prompt =
    `Write ${count} original multiple-choice quiz questions about "${topic}" ` +
    `for a general quiz platform.` +
    (difficulty
      ? ` All questions must be ${difficulty} difficulty.`
      : ` Mix easy, medium and hard difficulties.`) +
    ` Each question must have exactly 4 distinct answer options and exactly ` +
    `one correct answer that is byte-identical to one of the options. ` +
    `Keep questions self-contained and answerable without images. ` +
    `Reply with ONLY a JSON array, no prose, no code fences, where every ` +
    `element is {"question": string, "options": [4 strings], "answer": ` +
    `string, "difficulty": "easy"|"medium"|"hard", "category": one of ` +
    `[${AI_CATEGORIES.join(", ")}], "topic": "${topic.toLowerCase()}"}.`;

  let generated;

  try {
    const controller = new AbortController();

    const timeout = setTimeout(() => controller.abort(), 45000);

    const response = await fetch(
      `${GEMINI_API_BASE}/${process.env.GEMINI_MODEL || "gemini-2.0-flash"}:generateContent`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-goog-api-key": apiKey,
        },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { temperature: 0.7, maxOutputTokens: 8192 },
        }),
        signal: controller.signal,
      }
    );

    clearTimeout(timeout);

    if (!response.ok) {
      const detail = await response.text().catch(() => "");

      console.log(
        `Gemini generate failed (${response.status}): ${detail.slice(0, 300)}`
      );

      return res.status(502).json({
        message:
          response.status === 429
            ? "The AI provider rate-limited the request. Try again in a minute."
            : "The AI provider rejected the request. Check GEMINI_API_KEY and try again.",
        code: "AI_PROVIDER_ERROR",
      });
    }

    const payload = await response.json();

    const text = payload?.candidates?.[0]?.content?.parts
      ?.map((part) => part?.text || "")
      .join("");

    generated = extractJsonArray(text).map((item) =>
      sanitizeGeneratedQuestion(item, topic)
    );
  } catch (error) {
    console.log(`AI generation failed: ${error.message}`);

    return res.status(502).json({
      message:
        error.name === "AbortError"
          ? "The AI took too long to answer. Try fewer questions."
          : "Could not generate questions from the AI provider. Try again.",
      code: "AI_PROVIDER_ERROR",
    });
  }

  const valid = generated.filter(Boolean);

  if (valid.length === 0) {
    return res.status(502).json({
      message:
        "The AI replied but produced no usable questions. Try a different topic.",
      code: "AI_EMPTY_RESULT",
    });
  }

  const csv = toCsv([
    [
      "question",
      "option1",
      "option2",
      "option3",
      "option4",
      "answer",
      "difficulty",
      "category",
      "topic",
    ],
    ...valid.map((item) => [
      item.question,
      ...item.options,
      item.answer,
      item.difficulty,
      item.category,
      item.topic,
    ]),
  ]);

  res.json({
    message: `Generated ${valid.length} draft question(s). Preview them, then confirm the import.`,
    csv,
    count: valid.length,
    requested: count,
  });
});

// Dry run by default; writes only when the body carries confirm: true. The
// preview is recomputed on the confirming request, so what gets written is
// exactly what the response reports.

app.post("/api/admin/questions/import", adminAuth, async (req, res) => {
  try {
    const csvText =
      typeof req.body?.csv === "string" ? req.body.csv : "";
    const confirm = req.body?.confirm === true;

    if (!csvText.trim()) {
      return res.status(400).json({
        message: "Paste or upload CSV content first.",
        code: "CSV_REQUIRED",
      });
    }

    if (csvText.length > MAX_IMPORT_CHARS) {
      return res.status(413).json({
        message: `That CSV is too large. Keep it under ${MAX_IMPORT_CHARS} characters per import and split it into batches.`,
        code: "CSV_TOO_LARGE",
      });
    }

    // Duplicate detection needs the bank's questions. Selecting only the two
    // compared fields keeps this cheap even on a large bank.
    const existing = await Question.find()
      .select("question options")
      .lean();

    const preview = buildQuestionImportPreview({ csvText, existing });

    if (preview.valid.length > MAX_IMPORT_ROWS) {
      return res.status(413).json({
        message: `That import has ${preview.valid.length} valid rows; the limit is ${MAX_IMPORT_ROWS} per import. Split it into batches.`,
        code: "IMPORT_TOO_LARGE",
      });
    }

    if (!confirm) {
      return res.json({
        dryRun: true,
        message: "Preview only — nothing has been written yet.",
        ...preview,
      });
    }

    const added = [];
    const failed = [];

    // Sequential on purpose: a partial failure is reported per row instead
    // of a bulk-write error that cannot say which rows landed.
    for (const row of preview.valid) {
      try {
        const created = await Question.create({
          question: row.question,
          options: row.options,
          answer: row.answer,
          difficulty: row.difficulty,
          category: row.category,
          topic: row.topic,
        });

        added.push({ line: row.line, id: String(created._id) });
      } catch (error) {
        failed.push({
          line: row.line,
          reason: error.message || "Could not save this row.",
        });
      }
    }

    const skipped = preview.duplicates.length;
    const rejected = preview.invalid.length;

    // Only a confirmed import writes, so only that invalidates the cache.
    if (added.length > 0) invalidateQuestionReadCache();

    await recordAudit({
      action: AUDIT_ACTIONS.QUESTIONS_IMPORT,
      summary: `Imported ${added.length} question(s) from CSV (${skipped} duplicate(s) skipped, ${rejected} row(s) rejected, ${failed.length} failed)`,
      targetType: "questions",
      meta: {
        added: added.length,
        skipped,
        rejected,
        failed: failed.length,
      },
    });

    res.status(201).json({
      dryRun: false,
      message: `Imported ${added.length} question(s).`,
      added: added.length,
      skipped,
      rejected,
      failed: failed.length,
      failures: failed,
      total: preview.total,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not process the CSV import.",
      code: "SERVER_ERROR",
    });
  }
});

/* =====================
   QUIZ API
===================== */

app.get("/api/quizzes", async (req, res) => {
  try {
    const questions =
      await Question.find();

    res.json([
      {
        id: 1,
        title: "BrainRace Quiz",
        questions,
      },
    ]);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
    });
  }
});

/* =====================
   RESULTS
===================== */

const RESULT_MODES = ["practice", "exam", "adaptive"];
const RESULT_DIFFICULTIES = ["easy", "medium", "hard"];

const toOptionalNumber = (value) => {
  if (value === null || value === undefined || value === "") {
    return undefined;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : undefined;
};

const toOptionalString = (value, max = 120) => {
  if (value === null || value === undefined) return undefined;

  const text = String(value).trim();

  if (!text) return undefined;

  return text.slice(0, max);
};

// Save Result (authenticated).
//
// The owner is taken from the verified token, never from the
// request body — otherwise anyone could file a result under
// another user's name and poison /api/results/me.

app.post("/api/results", userAuth, async (req, res) => {
  try {
    const score = toOptionalNumber(req.body.score);
    const totalQuestions = toOptionalNumber(
      req.body.totalQuestions
    );

    if (score === undefined || totalQuestions === undefined) {
      return res.status(400).json({
        message: "score and totalQuestions are required numbers.",
        code: "INVALID_RESULT",
      });
    }

    if (totalQuestions <= 0) {
      return res.status(400).json({
        message: "totalQuestions must be greater than zero.",
        code: "INVALID_RESULT",
      });
    }

    const mode = toOptionalString(req.body.mode, 20);

    if (mode && !RESULT_MODES.includes(mode)) {
      return res.status(400).json({
        message: `mode must be one of: ${RESULT_MODES.join(", ")}.`,
        code: "INVALID_RESULT",
      });
    }

    const difficulty = toOptionalString(
      req.body.difficulty,
      20
    );

    if (
      difficulty &&
      !RESULT_DIFFICULTIES.includes(difficulty)
    ) {
      return res.status(400).json({
        message: `difficulty must be one of: ${RESULT_DIFFICULTIES.join(", ")}.`,
        code: "INVALID_RESULT",
      });
    }

    const negativeMarking =
      toOptionalNumber(req.body.negativeMarking) ?? 0;

    if (negativeMarking < 0 || negativeMarking > 1) {
      return res.status(400).json({
        message: "negativeMarking must be between 0 and 1.",
        code: "INVALID_RESULT",
      });
    }

    // Per-question outcomes power the "most missed questions"
    // admin aggregate. Capped so a single request cannot store
    // an unbounded array.

    const responses = Array.isArray(req.body.responses)
      ? req.body.responses
          .slice(0, 200)
          .map((entry) => ({
            questionId: toOptionalString(entry?.questionId),
            topic: toOptionalString(entry?.topic),
            difficulty: toOptionalString(entry?.difficulty, 20),
            outcome: toOptionalString(entry?.outcome, 20),
          }))
          .filter((entry) => entry.outcome)
      : [];

    const progression = Array.isArray(
      req.body.difficultyProgression
    )
      ? req.body.difficultyProgression
          .slice(0, 200)
          .map((entry) => ({
            index: toOptionalNumber(entry?.index),
            difficulty: toOptionalString(entry?.difficulty, 20),
          }))
          .filter((entry) => entry.difficulty)
      : [];

    const result = new Result({
      user: req.account?.name || req.user.email || "User",
      userId: String(req.user.id),
      score,
      totalQuestions,
      topic: toOptionalString(req.body.topic, 80),
      difficulty,
      mode,
      correct: toOptionalNumber(req.body.correct),
      wrong: toOptionalNumber(req.body.wrong),
      unanswered: toOptionalNumber(req.body.unanswered),
      negativeMarking,
      durationSeconds: toOptionalNumber(
        req.body.durationSeconds
      ),
      difficultyProgression: progression,
      responses,
      date: req.body.date || new Date(),
    });

    await result.save();

    res.status(201).json({
      success: true,
      message: "Result Saved",
      result,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
      message: "Could not save the result.",
      code: "SERVER_ERROR",
    });
  }
});

// The caller's own attempts, newest first, with a summary.
// Documents written before userId existed are matched by the
// display name of the authenticated account so an existing
// history is not silently lost.

app.get("/api/results/me", userAuth, async (req, res) => {
  try {
    const userId = String(req.user.id);
    const name = req.account?.name;

    const ownerFilter = name
      ? {
          $or: [
            { userId },
            { userId: { $exists: false }, user: name },
            { userId: null, user: name },
          ],
        }
      : { userId };

    const results = await Result.find(ownerFilter)
      .sort({ date: -1, _id: -1 })
      .limit(500)
      .lean();

    const legacyCount = results.filter(
      (doc) => !doc.userId
    ).length;

    res.json({
      results,
      summary: summarizeResults(results),
      // So the UI can explain why accuracy uses fewer
      // attempts than the attempt count.
      legacyCount,
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not load your results. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

// Get Results (authenticated).
//
// Previously this returned every attempt of every user to
// anonymous callers. It now requires a signed-in user or an
// admin, and returns a leaderboard-shaped projection only —
// no per-account detail (topic, difficulty, per-question
// outcomes) leaves the server here.

app.get("/api/results", userOrAdminAuth, async (req, res) => {
  try {
    const results = await Result.find()
      .select("user score totalQuestions date")
      .sort({ score: -1, date: -1 })
      .limit(200)
      .lean();

    res.json(results);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not load results. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

/* =====================
   ROOMS
===================== */

// Audit the two main-admin room mutations. roomRoutes.js is out of scope for
// this change, so the observation happens here, before the router. The write
// is fire-and-forget after a successful response: a failed audit write can
// never turn a completed force-end/delete into an error for the admin.

const auditRoomAdminAction = (req, res, next) => {
  const ending =
    req.method === "POST" && /^\/admin\/[^/]+\/end\/?$/.test(req.path);

  const removing =
    req.method === "DELETE" && /^\/admin\/[^/]+\/?$/.test(req.path);

  if (!ending && !removing) return next();

  res.on("finish", () => {
    if (res.statusCode >= 400) return;

    const roomId = decodeURIComponent(
      req.path.replace(/^\/admin\//, "").replace(/\/(end\/?)?$/, "")
    );

    recordAudit({
      action: ending
        ? AUDIT_ACTIONS.ROOM_FORCE_END
        : AUDIT_ACTIONS.ROOM_DELETE,
      summary: ending
        ? `Force-ended room ${roomId}`
        : `Deleted room ${roomId}`,
      targetType: "room",
      targetId: roomId,
    });
  });

  next();
};

app.use("/api/rooms", auditRoomAdminAction, roomRoutes);

/* =====================
   OAUTH (Google + Microsoft + GitHub)
   Authorization-code flow. Needs
   GOOGLE_CLIENT_ID / SECRET,
   MICROSOFT_CLIENT_ID / SECRET and/or
   GITHUB_CLIENT_ID / SECRET in .env.
   Redirects back to FRONTEND_URL/oauth/callback
   with token + profile query params.

   GitHub is OAuth2 only (no OIDC id_token), so its
   callback takes a separate branch that reads the
   profile from api.github.com with the access token.
===================== */

const providers = () => ({
  google: {
    configured: !!(
      process.env.GOOGLE_CLIENT_ID &&
      process.env.GOOGLE_CLIENT_SECRET
    ),
    authUrl:
      "https://accounts.google.com/o/oauth2/v2/auth",
    tokenUrl: "https://oauth2.googleapis.com/token",
    scope: "openid email profile",
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
  },
  microsoft: {
    configured: !!(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET
    ),
    authUrl:
      "https://login.microsoftonline.com/common/oauth2/v2.0/authorize",
    tokenUrl:
      "https://login.microsoftonline.com/common/oauth2/v2.0/token",
    scope: "openid email profile",
    clientId: process.env.MICROSOFT_CLIENT_ID,
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET,
  },
  github: {
    configured: !!(
      process.env.GITHUB_CLIENT_ID &&
      process.env.GITHUB_CLIENT_SECRET
    ),
    authUrl: "https://github.com/login/oauth/authorize",
    tokenUrl: "https://github.com/login/oauth/access_token",
    // GitHub needs user:email (or a public address) to hand
    // back a verified address.
    scope: "read:user user:email",
    clientId: process.env.GITHUB_CLIENT_ID,
    clientSecret: process.env.GITHUB_CLIENT_SECRET,
  },
});

// Which social logins the Login page should show.

app.get("/api/auth/providers", (req, res) => {
  const config = providers();

  res.json({
    google: config.google.configured,
    microsoft: config.microsoft.configured,
    github: config.github.configured,
  });
});

const frontendBaseUrl = (req) =>
  resolveOAuthOrigins({
    requestOrigin: `${req.protocol}://${req.get("host") || ""}`,
    env: process.env,
    nodeEnv: process.env.NODE_ENV,
  }).frontendOrigin;

// The origin this request is actually being served from, judged against the
// OAUTH_ALLOWED_ORIGINS / SERVER_URL / FRONTEND_URL allowlist (plus loopback
// hosts outside production). A Host header that is not allowlisted is
// ignored, so the redirect target can never be attacker-controlled.

const callbackUrl = (req, providerName) =>
  callbackUriFor(
    resolveOAuthOrigins({
      requestOrigin: `${req.protocol}://${req.get("host") || ""}`,
      env: process.env,
      nodeEnv: process.env.NODE_ENV,
    }).apiOrigin,
    providerName
  );

// Cookie parsing and the state cookie shape live in
// utils/oauthState.js so the state rules can be self-checked without a server.
// Two behaviours changed with that move: the cookie is named per provider
// (`oauth_state_google`, not a shared `oauth_state`), so a sign-in started with
// one provider — or in another tab — cannot invalidate another; and the cookie
// is cleared only *after* the state check succeeds, so a stray or replayed
// callback cannot destroy a legitimate concurrent attempt.

// id_token payload decode with structure validation.

const decodeIdToken = (idToken) => {
  const parts = String(idToken || "").split(".");

  if (parts.length !== 3 || !parts[1]) return null;

  try {
    return JSON.parse(
      Buffer.from(parts[1], "base64url").toString()
    );
  } catch {
    return null;
  }
};

// OAuth failures land back on the SPA so the user sees
// a page instead of raw JSON on the API host.

const redirectOAuthError = (req, res, message) => {
  const base = frontendBaseUrl(req);

  // Every allowlisted path failed, so there is nowhere safe to send the
  // browser. Say so instead of falling back to a forged Host header.
  if (!base) {
    return res.status(503).json({
      message:
        "No frontend origin is configured for OAuth returns. Set " +
        "FRONTEND_URL or add the origin to OAUTH_ALLOWED_ORIGINS.",
      code: "OAUTH_ORIGIN_NOT_CONFIGURED",
    });
  }

  const url = new URL(`${base}/oauth/callback`);

  url.searchParams.set("error", message);

  return res.redirect(url.toString());
};

const oauthStart = (providerName) => (req, res) => {
  const config = providers()[providerName];

  if (!config.configured) {
    return res.status(404).json({
      message: `${providerName} login is not configured`,
      code: "PROVIDER_NOT_CONFIGURED",
    });
  }

  // The redirect_uri must match a URI registered at the provider console.
  // If this server has no usable origin, fail with a clear message rather
  // than sending the provider a URI it will reject. Resolved before the state
  // cookie is written so a request that cannot proceed leaves no cookie behind.

  const redirectUri = callbackUrl(req, providerName);

  if (!redirectUri) {
    return res.status(503).json({
      message:
        `No public origin is configured for ${providerName} sign-in. ` +
        "Set SERVER_URL (or OAUTH_ALLOWED_ORIGINS) to this server's URL.",
      code: "OAUTH_ORIGIN_NOT_CONFIGURED",
    });
  }

  const state = crypto.randomBytes(16).toString("hex");

  res.setHeader(
    "Set-Cookie",
    buildStateCookie({
      provider: providerName,
      value: state,
      maxAge: 600,
      secure: req.secure || req.protocol === "https",
    })
  );

  const url = new URL(config.authUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", config.scope);
  url.searchParams.set("state", state);

  // Google needs both to reliably return a refresh token
  // and to be able to offer account selection.

  if (providerName === "google") {
    url.searchParams.set("access_type", "online");
    url.searchParams.set("prompt", "select_account");
  }

  res.redirect(url.toString());
};

// GitHub has no OIDC id_token. The profile comes from
// POST-free REST calls with the access token, and the primary
// *verified* address has to be read from /user/emails —
// /user only exposes whatever the user chose to publish.
//
// Returns { email, name } or null.

const fetchGithubProfile = async (accessToken) => {
  const headers = {
    Authorization: `Bearer ${accessToken}`,
    Accept: "application/vnd.github+json",
    "User-Agent": "BrainRace",
  };

  const userRes = await fetch("https://api.github.com/user", {
    headers,
  });

  if (!userRes.ok) {
    console.error(
      "[OAUTH github] profile lookup failed:",
      userRes.status
    );

    return null;
  }

  const profile = await userRes.json();

  const emailRes = await fetch(
    "https://api.github.com/user/emails",
    { headers }
  );

  if (!emailRes.ok) {
    console.error(
      "[OAUTH github] email lookup failed:",
      emailRes.status
    );

    return null;
  }

  const addresses = await emailRes.json();

  if (!Array.isArray(addresses)) return null;

  const verified = addresses.filter(
    (entry) =>
      entry && entry.verified === true && entry.email
  );

  const chosen =
    verified.find((entry) => entry.primary === true) ||
    verified[0];

  if (!chosen) return null;

  const login = String(profile.login || "").trim();
  const name = String(profile.name || "").trim();

  return {
    email: String(chosen.email).trim().toLowerCase(),
    name: name || login || String(chosen.email).split("@")[0],
  };
};

const oauthCallback = (providerName) => async (req, res) => {
  try {
    const config = providers()[providerName];

    if (!config.configured) {
      return redirectOAuthError(
        req,
        res,
        `${providerName} sign-in is not configured on the server`
      );
    }

    // The state check is the single-use CSRF guard. Each failure mode gets its
    // own message, because "The sign-in request expired" used to cover a
    // provider refusal, a missing code, a missing cookie and a genuine mismatch
    // alike — which left the next occurrence undiagnosable.

    const stateCheck = validateOAuthState({
      provider: providerName,
      query: req.query,
      cookieHeader: req.headers.cookie,
    });

    if (!stateCheck.ok) {
      return redirectOAuthError(req, res, stateCheck.message);
    }

    // Cleared here, after the check has passed — so a duplicate, refreshed or
    // prefetched callback cannot destroy a legitimate concurrent attempt — and
    // before the token exchange, which is what keeps the state single-use.

    res.setHeader(
      "Set-Cookie",
      buildStateCookie({
        provider: providerName,
        value: "",
        maxAge: 0,
        secure: req.secure || req.protocol === "https",
      })
    );

    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        // GitHub answers form-encoded unless JSON is asked for.
        Accept: "application/json",
        // GitHub rejects token requests without a User-Agent.
        "User-Agent": "BrainRace",
      },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        code: req.query.code,
        grant_type: "authorization_code",
        redirect_uri: callbackUrl(req, providerName),
      }),
    });

    const tokens = await tokenRes.json();

    let displayName = "";
    let resolvedEmail = "";

    if (providerName === "github") {
      // GitHub is OAuth2 only — there is no id_token to
      // decode, so the profile is read from the REST API
      // with the access token instead.

      if (!tokenRes.ok || !tokens.access_token) {
        console.error(
          "[OAUTH github] token exchange failed:",
          tokens.error_description ||
            tokens.error ||
            tokenRes.status
        );

        return redirectOAuthError(
          req,
          res,
          "Could not complete sign-in with GitHub. Please try again."
        );
      }

      const profile = await fetchGithubProfile(
        tokens.access_token
      );

      if (!profile) {
        return redirectOAuthError(
          req,
          res,
          "GitHub did not share a verified email address for " +
            "this account. Add and verify an email on GitHub, " +
            "then try again."
        );
      }

      resolvedEmail = profile.email;
      displayName = profile.name;
    } else {
      if (!tokenRes.ok || !tokens.id_token) {
        console.error(
          `[OAUTH ${providerName}] token exchange failed:`,
          tokens.error_description ||
            tokens.error ||
            tokenRes.status
        );

        return redirectOAuthError(
          req,
          res,
          "Could not complete sign-in with the provider. Please try again."
        );
      }

      const profile = decodeIdToken(tokens.id_token);

      if (!profile) {
        return redirectOAuthError(
          req,
          res,
          "The provider returned an unreadable profile."
        );
      }

      // Google marks whether it has verified the address.
      // Only trust it when the provider says the email is verified.

      if (
        profile.email_verified === false ||
        profile.email_verified === "false"
      ) {
        return redirectOAuthError(
          req,
          res,
          "Your provider account has no verified email address."
        );
      }

      // Microsoft may omit `email` from the id_token and
      // expose preferred_username / upn instead.

      resolvedEmail = String(
        profile.email ||
          profile.preferred_username ||
          profile.upn ||
          profile.unique_name ||
          ""
      ).trim();

      displayName = String(
        profile.name ||
          profile.given_name ||
          resolvedEmail.split("@")[0] ||
          ""
      ).trim();
    }

    if (!resolvedEmail) {
      return redirectOAuthError(
        req,
        res,
        "The provider did not share an email address for this account."
      );
    }

    let user = await User.findOne({ email: resolvedEmail });

    // A disabled account cannot sign in through any provider.
    // Checked before the new-account branch so a lock is not
    // bypassed by simply re-running the OAuth flow.

    if (user && user.disabled) {
      return redirectOAuthError(
        req,
        res,
        "This account has been disabled by an administrator."
      );
    }

    if (!user) {
      user = await User.create({
        name:
          displayName ||
          resolvedEmail.split("@")[0],
        email: resolvedEmail,
        // OAuth accounts never use a local password
        password: await bcrypt.hash(
          crypto.randomBytes(24).toString("hex"),
          10
        ),
        verified: true,
        provider: providerName,
      });
    } else if (!user.verified) {
      user.verified = true;

      user.provider = providerName;

      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET,
      { expiresIn: "7d" }
    );

    const params = new URLSearchParams({
      token,
      id: String(user._id),
      name: user.name || "",
      email: user.email,
    });

    const returnBase = frontendBaseUrl(req);

    if (!returnBase) {
      return res.status(503).json({
        message:
          "Sign-in succeeded but no frontend origin is configured to " +
          "return to. Set FRONTEND_URL or OAUTH_ALLOWED_ORIGINS.",
        code: "OAUTH_ORIGIN_NOT_CONFIGURED",
      });
    }

    res.redirect(
      `${returnBase}/oauth/callback?${params.toString()}`
    );
  } catch (error) {
    console.log(error);

    return redirectOAuthError(
      req,
      res,
      "Sign-in failed. Please try again."
    );
  }
};

app.get("/api/auth/google", oauthStart("google"));

app.get(
  "/api/auth/google/callback",
  oauthCallback("google")
);

app.get("/api/auth/microsoft", oauthStart("microsoft"));

app.get(
  "/api/auth/microsoft/callback",
  oauthCallback("microsoft")
);

app.get("/api/auth/github", oauthStart("github"));

app.get(
  "/api/auth/github/callback",
  oauthCallback("github")
);

/* =====================
   OAUTH REDIRECT-URI DIAGNOSIS

   GET /api/auth/:provider/diagnose

   Answers "will the provider accept the redirect_uri we send?" without
   bouncing a user to the provider first. A `redirect_uri_mismatch` is
   otherwise invisible until someone tries to sign in and lands on the
   provider's own error page, which never tells our server anything.

   The outbound URL is assembled only from a hardcoded provider endpoint in
   `providers()`, the configured client id and the computed redirect URI.
   No part of the request can change the host or the path, so this cannot be
   pointed at an arbitrary address. No secret is sent: the client secret is not
   needed to have the authorize endpoint validate a redirect URI.

   Bounded on purpose — this endpoint makes an outbound request, so it carries
   a per-caller and a global in-memory limit, and a 10s timeout.
===================== */

const PROBE_TIMEOUT_MS = 10000;

// Per caller, so one visitor cannot use the panel as a request amplifier.
const diagnoseLimiter = createRateLimiter({
  limit: 8,
  windowMs: 60000,
  maxKeys: 200,
});

// Across all callers, so a distributed caller cannot do it either. Kept well
// above three providers per click so the panel still works behind one NAT.
const diagnoseGlobalLimiter = createRateLimiter({
  limit: 40,
  windowMs: 60000,
  maxKeys: 4,
});

// One bounded outbound call. Returns the response the classifier needs, or a
// failure sentinel the caller turns into an `unknown` verdict.
const probeProviderAuthorize = async ({
  authUrl,
  clientId,
  redirectUri,
}) => {
  const url = buildProbeUrl({
    authUrl,
    clientId,
    redirectUri,
    state: crypto.randomBytes(16).toString("hex"),
  });

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    PROBE_TIMEOUT_MS
  );

  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "User-Agent": "BrainRace-diagnose" },
    });

    // Read the whole body. Google's error page is ~800 KB and the
    // `redirect_uri_mismatch` marker sits near the end of it, so truncating
    // here would make a failing check look like a passing one.
    const body = await response.text();

    return {
      finalUrl: response.url,
      body,
      status: response.status,
      failure: null,
    };
  } catch (error) {
    const aborted = error && error.name === "AbortError";

    console.error(
      "[OAUTH diagnose] probe failed:",
      aborted ? "timeout" : (error && error.message) || error
    );

    return {
      finalUrl: "",
      body: "",
      status: 0,
      failure: aborted
        ? PROBE_CODES.PROBE_TIMEOUT
        : PROBE_CODES.PROBE_FAILED,
    };
  } finally {
    clearTimeout(timer);
  }
};

app.get("/api/auth/:provider/diagnose", async (req, res) => {
  const provider = String(req.params.provider || "").toLowerCase();

  const config = providers()[provider];

  // An unrecognised provider is rejected before any budget is spent.
  if (!config) {
    return res.status(404).json({
      message:
        "Unknown sign-in provider. Supported values are google, microsoft " +
        "and github.",
      code: "PROVIDER_UNKNOWN",
    });
  }

  const caller = req.ip || "unknown";

  const callerGate = diagnoseLimiter.check(caller);
  const globalGate = diagnoseGlobalLimiter.check("global");

  if (!callerGate.allowed || !globalGate.allowed) {
    const retryAfterMs = Math.max(
      callerGate.retryAfterMs,
      globalGate.retryAfterMs,
      1000
    );

    return res.status(429).json({
      message:
        "Too many provider checks in a short time. Wait a moment and run " +
        "the check again.",
      code: "RATE_LIMITED",
      retryAfterMs,
    });
  }

  // The redirect URI this server would actually send. Allowlist-derived, so it
  // is never a value the caller supplied.
  const redirectUri = callbackUrl(req, provider);

  const support = probeSupportFor(provider);

  const base = {
    provider,
    configured: config.configured,
    supported: support.supported,
    supportReason: support.reason,
    redirectUri,
    checkedAt: new Date().toISOString(),
  };

  const respond = (verdict, code, message) =>
    res.json({ ...base, verdict, code, message });

  if (!config.configured) {
    return respond(
      PROBE_VERDICTS.NOT_CONFIGURED,
      PROBE_CODES.NOT_CONFIGURED,
      diagnosisMessage({
        provider,
        verdict: PROBE_VERDICTS.NOT_CONFIGURED,
        redirectUri,
        code: PROBE_CODES.NOT_CONFIGURED,
      })
    );
  }

  if (!support.supported) {
    return respond(
      PROBE_VERDICTS.UNKNOWN,
      PROBE_CODES.PROBE_NOT_SUPPORTED,
      diagnosisMessage({
        provider,
        verdict: PROBE_VERDICTS.UNKNOWN,
        redirectUri,
        code: PROBE_CODES.PROBE_NOT_SUPPORTED,
        supportReason:
          `${support.reason} This server will not report a verdict it ` +
          "cannot stand behind.",
      })
    );
  }

  if (!redirectUri) {
    return respond(
      PROBE_VERDICTS.UNKNOWN,
      PROBE_CODES.NO_REDIRECT_URI,
      "No public origin is configured for this server, so there is no " +
        "redirect URI to check. Set SERVER_URL (or OAUTH_ALLOWED_ORIGINS) " +
        "to this server's URL."
    );
  }

  const probe = await probeProviderAuthorize({
    authUrl: config.authUrl,
    clientId: config.clientId,
    redirectUri,
  });

  if (probe.failure) {
    return respond(
      PROBE_VERDICTS.UNKNOWN,
      probe.failure,
      probe.failure === PROBE_CODES.PROBE_TIMEOUT
        ? "The provider did not answer within 10 seconds, so no verdict was " +
          `recorded. Check this URI by hand: ${redirectUri}`
        : "The provider could not be reached from this server, so no verdict " +
          `was recorded. Check this URI by hand: ${redirectUri}`
    );
  }

  const verdict = classifyProviderProbe(probe);

  // `evidence` names the marker that produced the verdict, so a surprising
  // result can be traced back to the provider's own words.
  return res.json({
    ...base,
    verdict: verdict.verdict,
    code: verdict.code,
    evidence: verdict.evidence,
    message: diagnosisMessage({
      provider,
      verdict: verdict.verdict,
      redirectUri,
      code: verdict.code,
    }),
  });
});

/* =====================
   SERVER
===================== */
app.get("/api/stats", adminAuth, async (req, res) => {
  try {
    const [totalQuestions, totalUsers, results] =
      await Promise.all([
        Question.countDocuments(),
        User.countDocuments(),
        Result.find()
          .select(
            "user userId score totalQuestions topic difficulty " +
              "correct wrong unanswered responses date"
          )
          .lean(),
      ]);

    const totalResults = results.length;

    // The three original metrics are unchanged: averageScore
    // is still the mean of the stored score field.

    let averageScore = 0;

    if (results.length > 0) {
      const totalScore = results.reduce(
        (sum, result) =>
          sum + (isFiniteNumber(result.score) ? result.score : 0),
        0
      );

      averageScore = totalScore / results.length;
    }

    const analytics = buildAdminAnalytics(results, {
      windowDays: 30,
      missedLimit: 5,
    });

    // Most-missed questions arrive as ids; resolve the text
    // here so the client never has to guess at a label.

    const missedIds = analytics.mostMissedQuestions
      .map((entry) => entry.questionId)
      .filter((id) => mongoose.isValidObjectId(id));

    const missedQuestions =
      missedIds.length > 0
        ? await Question.find({ _id: { $in: missedIds } })
            .select("question topic difficulty")
            .lean()
        : [];

    const missedById = new Map(
      missedQuestions.map((question) => [
        String(question._id),
        question,
      ])
    );

    res.json({
      totalQuestions,
      totalResults,
      averageScore: averageScore.toFixed(2),
      // Everything below is new and derived from stored
      // fields only. Nulls mean "not recorded yet".
      totalUsers,
      recordedAccuracy: analytics.recordedAccuracy,
      accuracySampleSize: analytics.accuracySampleSize,
      usersWithAttempts: analytics.usersWithAttempts,
      windowDays: analytics.windowDays,
      activeUsers: analytics.activeUsers,
      attemptsOverTime: analytics.attemptsOverTime,
      scoreDistribution: analytics.scoreDistribution,
      topicAccuracy: analytics.topicAccuracy,
      mostMissedQuestions: analytics.mostMissedQuestions.map(
        (entry) => ({
          ...entry,
          question:
            missedById.get(entry.questionId)?.question || null,
        })
      ),
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not load analytics. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

// CSV export of the per-attempt results the analytics view aggregates.
// Every column is a stored Result field; a missing value exports as blank.

const RESULT_EXPORT_HEADERS = [
  "user",
  "userId",
  "score",
  "totalQuestions",
  "topic",
  "difficulty",
  "mode",
  "correct",
  "wrong",
  "unanswered",
  "negativeMarking",
  "durationSeconds",
  "date",
];

app.get("/api/admin/results/export", adminAuth, async (req, res) => {
  try {
    const results = await Result.find()
      .sort({ date: -1, _id: -1 })
      .limit(20000)
      .lean();

    const rows = [
      RESULT_EXPORT_HEADERS,
      ...results.map((result) => [
        result.user,
        result.userId,
        result.score,
        result.totalQuestions,
        result.topic,
        result.difficulty,
        result.mode,
        result.correct,
        result.wrong,
        result.unanswered,
        result.negativeMarking,
        result.durationSeconds,
        result.date ? new Date(result.date).toISOString() : "",
      ]),
    ];

    const csv = toCsv(
      rows.map((row) =>
        row.map((cell) => (cell === null || cell === undefined ? "" : cell))
      )
    );

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      'attachment; filename="brainrace-results.csv"'
    );

    res.send(csv);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not export results.",
      code: "SERVER_ERROR",
    });
  }
});

// Admin audit log, newest first, paginated and filtered.

app.get("/api/admin/audit-log", adminAuth, async (req, res) => {
  try {
    const { page, pageSize } = parsePagination(req.query, 25);

    const filter = {};

    const action = String(req.query.action || "").trim();

    if (action && action !== "all") {
      filter.action = action;
    }

    const actor = String(req.query.actor || "").trim();

    if (actor && actor !== "all") {
      filter.actor = actor;
    }

    const search = String(req.query.search || "").trim();

    if (search) {
      const pattern = new RegExp(escapeRegExp(search), "i");

      filter.$or = [
        { summary: pattern },
        { action: pattern },
        { targetId: pattern },
      ];
    }

    const from = req.query.from ? new Date(req.query.from) : null;
    const to = req.query.to ? new Date(req.query.to) : null;

    if (from && !Number.isNaN(from.getTime())) {
      filter.createdAt = {
        ...(filter.createdAt || {}),
        $gte: from,
      };
    }

    if (to && !Number.isNaN(to.getTime())) {
      // Make the upper bound inclusive of the whole day.
      const end = new Date(to);

      end.setHours(23, 59, 59, 999);

      filter.createdAt = {
        ...(filter.createdAt || {}),
        $lte: end,
      };
    }

    const total = await AuditLog.countDocuments(filter);

    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const currentPage = Math.min(page, totalPages);

    const [items, actions] = await Promise.all([
      AuditLog.find(filter)
        .sort({ createdAt: -1, _id: -1 })
        .skip((currentPage - 1) * pageSize)
        .limit(pageSize)
        .lean(),
      AuditLog.distinct("action"),
    ]);

    res.json({
      items,
      total,
      page: currentPage,
      pageSize,
      totalPages,
      facets: {
        actions: actions.filter(Boolean).sort(),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      message: "Could not load the audit log. Please try again.",
      code: "SERVER_ERROR",
    });
  }
});

app.delete(
  "/api/results/:id",
  adminAuth,
  async (req, res) => {
    try {
      await Result.findByIdAndDelete(
        req.params.id
      );

      res.json({
        message:
          "Result Deleted"
      });
    } catch (error) {
      res.status(500).json(error);
    }
  }
);
/* =====================
   STATIC SPA
===================== */

// Production is a single Render web service: this app serves the API under
// /api/* and the built Vite SPA (../dist) everywhere else. Registered after
// every API route so no API path can be shadowed, and skipped entirely when
// dist/ is absent so a backend-only local run still boots.
const distDir = path.resolve(__dirname, "..", "dist");
const spaIndex = path.join(distDir, "index.html");
const spaBuilt = fs.existsSync(spaIndex);

if (spaBuilt) {
  // index: false keeps `/` out of the static handler; the fallback below
  // owns the shell so `/` and deep links take exactly one path.
  // Hashed /assets filenames are immutable, so the browser may cache them
  // for a year; the shell itself must revalidate on every load so a new
  // deploy is picked up immediately.
  app.use(
    express.static(distDir, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader(
            "Cache-Control",
            "public, max-age=31536000, immutable"
          );
        } else {
          res.setHeader("Cache-Control", "no-cache");
        }
      },
    })
  );

  // A missing /assets/<hash>.js must not silently receive the HTML shell:
  // the browser would fail with a confusing MIME error instead of a 404.
  const ASSET_EXTENSIONS = new Set([
    ".js", ".mjs", ".css", ".map", ".svg", ".png", ".jpg", ".jpeg", ".gif",
    ".webp", ".ico", ".woff", ".woff2", ".ttf", ".txt", ".json",
  ]);

  app.use((req, res, next) => {
    if (req.method !== "GET" && req.method !== "HEAD") return next();

    if (req.path.startsWith("/api/")) return next();

    const ext = path.extname(req.path).toLowerCase();
    if (ASSET_EXTENSIONS.has(ext)) {
      return res.status(404).json({
        message: "Not found",
        code: "STATIC_ASSET_NOT_FOUND",
      });
    }

    // Client-side routes (/login, /rooms, /oauth/callback, ...) get the
    // shell and let the router take over.
    return res.sendFile(spaIndex);
  });
} else {
  console.warn(
    "No frontend build found at " +
      distDir +
      " - the API is served, but `/` answers a placeholder. Run `npm run build` at the repository root (or let the deploy build it) to serve the SPA."
  );

  app.get("/", (req, res) => {
    res.send("Backend Running (frontend build not found)");
  });
}

// Unmatched API paths stay JSON: a typo'd fetch() must never receive the
// HTML shell and appear to succeed. All methods are covered.
app.use("/api", (req, res) => {
  res.status(404).json({
    message: "Not found",
    code: "API_ROUTE_NOT_FOUND",
  });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server Started on port ${PORT}`);
});