require("dotenv").config();
const jwt = require("jsonwebtoken");

const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const app = express();

app.use(cors());
app.use(express.json());

const Question = require("./models/Question");
const Result = require("./models/Result");

mongoose
  .connect(process.env.MONGO_URI)
  .then(() => {
    console.log("MongoDB Connected");
  })
  .catch((err) => {
    console.log(err);
  });

const users = require("./data/users");

/* =====================
   HOME
===================== */

app.get("/", (req, res) => {
  res.send("Backend Running");
});

/* =====================
   REGISTER
===================== */

app.post("/api/register", (req, res) => {
  const { name, email, password } = req.body;

  const newUser = {
    id: Date.now(),
    name,
    email,
    password,
  };

  users.push(newUser);

  res.status(201).json({
    message: "User Registered",
    user: newUser,
  });
});

/* =====================
   LOGIN
===================== */

app.post("/api/login", (req, res) => {

  const { email, password } = req.body;

  const user = users.find(
    (u) =>
      u.email === email &&
      u.password === password
  );

  if (!user) {
    return res.status(401).json({
      message: "Invalid Credentials"
    });
  }

  const token = jwt.sign(
    {
      id: user.id,
      email: user.email
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "7d"
    }
  );

  res.json({
    message: "Login Successful",
    token,
    user
  });

});

/* =====================
   QUESTIONS
===================== */

// Add Question

app.post("/api/questions", async (req, res) => {
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

app.get("/api/users", (req, res) => {
  res.json(users);
});

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

// Delete Question

app.delete("/api/questions/:id", async (req, res) => {
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

app.put("/api/questions/:id", async (req, res) => {
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
app.put("/api/questions/:id", async (req, res) => {
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
app.delete("/api/questions/:id", async (req, res) => {
  try {
    await Question.findByIdAndDelete(
      req.params.id
    );

    res.json({
      success: true,
      message: "Question Deleted",
    });
  } catch (error) {
    res.status(500).json(error);
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
   SERVER
===================== */
app.get("/api/stats", async (req, res) => {
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
app.listen(5000, () => {
  console.log("Server Started");
});