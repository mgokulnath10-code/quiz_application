const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema({
  title: String,
  questions: Array
});

module.exports = mongoose.model(
  "Quiz",
  quizSchema
);
<button
  onClick={() =>
    (window.location.href =
      "/leaderboard")
  }
>
  Leaderboard
</button>