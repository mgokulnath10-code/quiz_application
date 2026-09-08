const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
  },
  // SHA-256 hash of the 6-digit code
  codeHash: {
    type: String,
    required: true,
  },
  // "register" | "reset"
  purpose: {
    type: String,
    required: true,
  },
  attempts: {
    type: Number,
    default: 0,
  },
  consumed: {
    type: Boolean,
    default: false,
  },
  expiresAt: {
    type: Date,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

otpSchema.index({ email: 1, purpose: 1 });
otpSchema.index(
  { expiresAt: 1 },
  { expireAfterSeconds: 0 }
);

module.exports = mongoose.model(
  "Otp",
  otpSchema
);
