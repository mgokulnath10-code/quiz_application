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
