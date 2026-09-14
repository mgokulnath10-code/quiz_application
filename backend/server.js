require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

// Render (and most PaaS hosts) terminate TLS at a proxy,
// so trust the forwarded protocol/host for OAuth callbacks.
app.set("trust proxy", 1);

app.use(cors());
app.use(express.json());

const Question = require("./models/Question");
const Result = require("./models/Result");
const Room = require("./models/Room");
const Otp = require("./models/Otp");
const User = require("./models/User");
const adminAuth = require("./middleware/adminAuth");
const {
  sendOtpEmail,
  smtpConfigured,
  devOtpAllowed,
  MailDeliveryError,
} = require("./utils/mailer");
const questionBank = require("./data/questionBank");

mongoose
  .connect(process.env.MONGO_URI)
  .then(async () => {
    console.log("MongoDB Connected");

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

    if (!smtpConfigured()) {
      if (devOtpAllowed()) {
        console.warn(
          "WARNING: SMTP is not configured. ALLOW_DEV_OTP=true " +
            "and NODE_ENV is not production, so OTP codes will be " +
            "exposed through the API for development only."
        );
      } else {
        console.warn(
          "WARNING: SMTP is not configured and dev OTP is off — " +
            "users cannot receive OTP emails. Set SMTP_HOST / " +
            "SMTP_PORT / SMTP_USER / SMTP_PASS."
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
  })
  .catch((err) => {
    console.log(err);
  });

const roomRoutes = require("./routes/roomRoutes");

/* =====================
   HOME
===================== */

app.get("/", (req, res) => {
  res.send("Backend Running");
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
        requiresVerification: true,
        email,
        emailSent: sent,
        devCode,
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
  res.json({
    adminConfigured: !!(
      process.env.ADMIN_USERNAME && process.env.ADMIN_PASSWORD
    ),
    smtpConfigured: smtpConfigured(),
    googleConfigured: !!(
      process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
    ),
    microsoftConfigured: !!(
      process.env.MICROSOFT_CLIENT_ID &&
      process.env.MICROSOFT_CLIENT_SECRET
    ),
    mongoConnected: mongoose.connection.readyState === 1,
    env: process.env.NODE_ENV || "development",
    devOtpAllowed: devOtpAllowed(),
  });
});

/* =====================
   QUESTIONS
===================== */

// Add Question (Admin only)

// Add Question (Admin only) — difficulty/category/topic aware

app.post("/api/questions", adminAuth, async (req, res) => {
  try {
    const question = new Question({
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
    });

    await question.save();

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

    res.json(meta);
  } catch (error) {
    res.status(500).json(error);
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

    res.json(updatedQuestion);
  } catch (error) {
    res.status(500).json(error);
  }
});

// Delete Question (Admin only)

app.delete("/api/questions/:id", adminAuth, async (req, res) => {
  try {
    await Question.findByIdAndDelete(
      req.params.id
    );

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

// Save Result

app.post("/api/results", async (req, res) => {
  try {
    const result = new Result({
      user: req.body.user,
      score: req.body.score,
      totalQuestions:
        req.body.totalQuestions,
      date: req.body.date,
    });

    await result.save();

    res.status(201).json({
      success: true,
      message: "Result Saved",
    });
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
    });
  }
});

// Get Results

app.get("/api/results", async (req, res) => {
  try {
    const results =
      await Result.find().sort({
        score: -1,
      });

    res.json(results);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
    });
  }
});

/* =====================
   ROOMS
===================== */

app.use("/api/rooms", roomRoutes);

/* =====================
   OAUTH (Google + Microsoft)
   Authorization-code flow. Needs
   GOOGLE_CLIENT_ID / SECRET and
   MICROSOFT_CLIENT_ID / SECRET in .env.
   Redirects back to FRONTEND_URL/oauth/callback
   with token + profile query params.
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
});

// Which social logins the Login page should show.

app.get("/api/auth/providers", (req, res) => {
  const config = providers();

  res.json({
    google: config.google.configured,
    microsoft: config.microsoft.configured,
  });
});

const frontendBaseUrl = (req) =>
  (process.env.FRONTEND_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/+$/, "");

const serverBaseUrl = (req) =>
  (process.env.SERVER_URL ||
    `${req.protocol}://${req.get("host")}`
  ).replace(/\/+$/, "");

// Registered at the provider console — MUST match exactly.
const callbackUrl = (req, providerName) =>
  `${serverBaseUrl(req)}/api/auth/${providerName}/callback`;

// Cookie parsing that tolerates "=" inside values.

const parseCookies = (header) =>
  (header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");

      if (index === -1) return acc;

      acc[part.slice(0, index).trim()] = part
        .slice(index + 1)
        .trim();

      return acc;
    }, {});

const stateCookie = (req, value, maxAge) =>
  `oauth_state=${value}; Path=/; Max-Age=${maxAge}; ` +
  `SameSite=Lax; HttpOnly` +
  (req.secure || req.protocol === "https" ? "; Secure" : "");

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
  const url = new URL(
    `${frontendBaseUrl(req)}/oauth/callback`
  );

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

  const state = crypto.randomBytes(16).toString("hex");

  res.setHeader(
    "Set-Cookie",
    stateCookie(req, state, 600)
  );

  const url = new URL(config.authUrl);

  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set(
    "redirect_uri",
    callbackUrl(req, providerName)
  );
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

    const cookies = parseCookies(req.headers.cookie);

    // The state cookie is single-use.

    res.setHeader(
      "Set-Cookie",
      stateCookie(req, "", 0)
    );

    if (
      !req.query.code ||
      !req.query.state ||
      req.query.state !== cookies.oauth_state
    ) {
      return redirectOAuthError(
        req,
        res,
        "The sign-in request expired. Please try again."
      );
    }

    const tokenRes = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
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

    const email = String(
      profile.email ||
        profile.preferred_username ||
        profile.upn ||
        profile.unique_name ||
        ""
    ).trim();

    if (!email) {
      return redirectOAuthError(
        req,
        res,
        "The provider did not share an email address for this account."
      );
    }

    let user = await User.findOne({ email });

    if (!user) {
      user = await User.create({
        name:
          profile.name ||
          profile.given_name ||
          email.split("@")[0],
        email,
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

    res.redirect(
      `${frontendBaseUrl(req)}/oauth/callback?${params.toString()}`
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

/* =====================
   SERVER
===================== */
app.get("/api/stats", adminAuth, async (req, res) => {
  try {
    const totalQuestions =
      await Question.countDocuments();

    const totalResults =
      await Result.countDocuments();

    const results =
      await Result.find();

    let averageScore = 0;

    if (results.length > 0) {
      const totalScore = results.reduce(
        (sum, result) =>
          sum + result.score,
        0
      );

      averageScore =
        totalScore / results.length;
    }

    res.json({
      totalQuestions,
      totalResults,
      averageScore:
        averageScore.toFixed(2),
    });
  } catch (error) {
    res.status(500).json(error);
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
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server Started on port ${PORT}`);
});