const mongoose = require("mongoose");

const roomQuestionSchema = new mongoose.Schema({
  question: {
    type: String,
    required: true,
  },
  options: {
    type: [String],
    required: true,
  },
  answer: {
    type: String,
    required: true,
  },
});

const participantSchema = new mongoose.Schema(
  {
    userId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
    score: {
      type: Number,
      default: 0,
    },
    total: {
      type: Number,
      default: 0,
    },
    // Selected option for each question, in question order
    answers: {
      type: [String],
      default: [],
    },
    submitted: {
      type: Boolean,
      default: false,
    },
    removed: {
      type: Boolean,
      default: false,
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const chatMessageSchema = new mongoose.Schema(
  {
    userId: String,
    name: String,
    message: String,
    createdAt: {
      type: Date,
      default: Date.now,
    },
  }
  // keeps an auto _id so clients can de-duplicate messages
);

const roomSettingsSchema = new mongoose.Schema(
  {
    // Seconds allowed per question
    questionTimer: {
      type: Number,
      default: 30,
      min: 5,
      max: 300,
    },
    // Minimum percentage required to earn the certificate
    certificateThreshold: {
      type: Number,
      default: 70,
      min: 10,
      max: 100,
    },
    // Participants can compare their answers with the correct ones
    allowReview: {
      type: Boolean,
      default: true,
    },
    // Leaving the quiz window terminates the attempt
    strictMode: {
      type: Boolean,
      default: true,
    },
  },
  { _id: false }
);

const roomSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
  },
  roomId: {
    type: String,
    required: true,
    unique: true,
  },
  admin: {
    userId: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      required: true,
    },
  },
  status: {
    type: String,
    enum: ["waiting", "active", "ended"],
    default: "waiting",
  },
  settings: {
    type: roomSettingsSchema,
    default: () => ({}),
  },
  questions: [roomQuestionSchema],
  participants: [participantSchema],
  chat: [chatMessageSchema],
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model(
  "Room",
  roomSchema
);
