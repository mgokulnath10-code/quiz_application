const mongoose = require("mongoose");

const UserSchema = new mongoose.Schema(
  {
    name: String,
    email: {
      type: String,
      unique: true,
    },
    password: String,
    // Email verified via OTP (or instantly for OAuth users)
    verified: {
      type: Boolean,
      default: true,
    },
    // "local" | "google" | "microsoft"
    provider: {
      type: String,
      default: "local",
    },
  },
  {
    toJSON: {
      transform(doc, ret) {
        delete ret.password;
        delete ret.__v;
      },
    },
  }
);

module.exports = mongoose.model(
  "User",
  UserSchema
);
