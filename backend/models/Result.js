const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  user: {
    type: String,
    required: true,
  },
  score: {
    type: Number,
    required: true,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  date: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "Result",
  resultSchema
);