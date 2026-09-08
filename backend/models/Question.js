const mongoose = require("mongoose");

const questionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true
  },

  options: {
    type: [String],
    required: true
  },

  answer: {
    type: String,
    required: true
  },

  difficulty: {
    type: String,
    enum: ["easy", "medium", "hard"],
    default: "easy"
  },

  category: {
    type: String,
    default: "programming"
  },

  topic: {
    type: String,
    default: "general"
  }
});

questionSchema.index({ difficulty: 1, category: 1, topic: 1 });

module.exports = mongoose.model(
  "Question",
  questionSchema
);
