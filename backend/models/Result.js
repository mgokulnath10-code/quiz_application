const mongoose = require("mongoose");

// Per-question outcome recorded by the solo quiz engine.
// Optional: attempts made before this existed have none,
// so every read must tolerate a missing array.

const responseSchema = new mongoose.Schema(
  {
    questionId: String,
    topic: String,
    difficulty: String,
    // "correct" | "wrong" | "unanswered"
    outcome: String,
  },
  { _id: false }
);

const progressionSchema = new mongoose.Schema(
  { index: Number, difficulty: String },
  { _id: false }
);

const resultSchema = new mongoose.Schema({
  // Display name. Kept as the primary leaderboard field for
  // backwards compatibility with pre-existing documents.
  user: {
    type: String,
    required: true,
  },
  // Owning account. Missing on documents created before the
  // results API was locked down, hence not required.
  userId: {
    type: String,
    index: true,
  },
  score: {
    type: Number,
    required: true,
  },
  totalQuestions: {
    type: Number,
    required: true,
  },
  // --- Added with the quiz-engine work. All optional. ---
  topic: String,
  difficulty: String,
  // "practice" | "exam" | "adaptive"
  mode: String,
  correct: Number,
  wrong: Number,
  unanswered: Number,
  // Marks deducted per wrong answer (0 when unset).
  negativeMarking: Number,
  durationSeconds: Number,
  // Difficulty actually served for each question, in order.
  difficultyProgression: [progressionSchema],
  responses: [responseSchema],
  date: {
    type: Date,
    default: Date.now,
  },
});

// The platform results list / leaderboard reads the top scores newest
// first; without this index every read sorts the whole collection.
resultSchema.index({ score: -1, date: -1 });

module.exports = mongoose.model(
  "Result",
  resultSchema
);
