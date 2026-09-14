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
    // "local" | "google" | "microsoft" | "github"
    provider: {
      type: String,
      default: "local",
    },
    // Admin-controlled lock. A disabled account cannot log in,
    // and any token issued before the lock stops working
    // because middleware/auth.js re-reads the account.
    // Absent on old documents, so it is read as falsy.
    disabled: {
      type: Boolean,
      default: false,
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
