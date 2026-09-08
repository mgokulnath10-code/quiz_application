require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

const Question = require("./models/Question");
const Result = require("./models/Result");
const Otp = require("./models/Otp");
const auth = require("./middleware/auth");
const adminAuth = require("./middleware/adminAuth");
const { sendOtpEmail, smtpConfigured } = require("./utils/mailer");
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
  })
  .catch((err) => {
    console.log(err);
  });

const User = require("./models/User");
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

  const sent = await sendOtpEmail(email, code, purpose);

  // In dev mode (no SMTP configured) the caller
  // shows the OTP directly so the flow is testable.

  return { sent, devCode: sent ? null : code };
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
    const { name, email, password } = req.body;

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
    res.status(500).json(error);
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
    const { email, otp, purpose } = req.body;

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
    const { email } = req.body;

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
    res.status(500).json(error);
  }
});

/* =====================
   RESET PASSWORD
   (consumes a verified
   reset OTP)
===================== */

app.post("/api/reset-password", async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;

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
    return bcrypt.compare(given, stored);
  }

  return stored === given;
};

app.post("/api/login", async (req, res) => {
  try {
    const { email, password } =
      req.body;

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
    res.status(500).json(error);
  }
});

/* =====================
   ADMIN LOGIN
   Issues a signed admin JWT — required by
   every admin API below.
===================== */

app.post("/api/admin/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    const adminUsername =
      process.env.ADMIN_USERNAME || "admin";

    const adminPassword =
      process.env.ADMIN_PASSWORD || "admin123";

    if (
      username !== adminUsername ||
      password !== adminPassword
    ) {
      return res.status(401).json({
        message: "Invalid Credentials",
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
  } catch (error) {
    res.status(500).json(error);
  }
});

/* =====================
   QUESTIONS
===================== */

// Add Question (Admin only)

app.post("/api/questions", adminAuth, async (req, res) => {
  try {
    const question = new Question({
      question: req.body.question,
      options: req.body.options,
      answer: req.body.answer,
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

app.put(
  "/api/reset-password",
  async (req, res) => {
    try {
      const { email, password } =
        req.body;

      const user =
        await User.findOne({
          email,
        });

      if (!user) {
        return res.status(404).json({
          message: "User Not Found",
        });
      }

      user.password = await bcrypt.hash(
        password,
        10
      );

      await user.save();

      res.json({
        message:
          "Password Updated",
      });
    } catch (error) {
      res.status(500).json(error);
    }
  }
);

// Get All Questions

app.get("/api/questions", async (req, res) => {
  try {
    const questions =
      await Question.find();

    res.json(questions);
  } catch (error) {
    console.log(error);

    res.status(500).json({
      success: false,
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