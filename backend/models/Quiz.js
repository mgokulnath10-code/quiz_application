const mongoose = require("mongoose");

const quizSchema = new mongoose.Schema({
  title: String,
  questions: Array
});

module.exports = mongoose.model(
  "Quiz",
  quizSchema
);
