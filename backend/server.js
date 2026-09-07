require("dotenv").config();
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

const Question = require("./models/Question");
const Result = require("./models/Result");
const auth = require("./middleware/auth");
const adminAuth = require("./middleware/adminAuth");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
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
   REGISTER
===================== */

app.post("/api/register", async (req, res) => {
  try {
    const { name, email, password } =
      req.body;

    const existingUser =
      await User.findOne({ email });

    if (existingUser) {
      return res.status(400).json({
        message: "User already exists",
      });
    }

    const user = new User({
      name,
      email,
      password: await bcrypt.hash(password, 10),
    });

    await user.save();

    res.status(201).json({
      message: "User Registered",
      user,
    });
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