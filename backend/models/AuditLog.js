const mongoose = require("mongoose");

// Append-only record of admin actions. Deliberately narrow: a one-line
// summary plus optional non-sensitive metadata. It must never hold a
// credential, a token, or a request body — utils/auditFormat.js filters the
// metadata it accepts so a caller cannot accidentally persist one.

const auditLogSchema = new mongoose.Schema({
  // Who performed the action. The admin role is shared, so this is a label
  // ("admin"), not an account id.
  actor: {
    type: String,
    default: "admin",
  },
  // Machine-readable action key, e.g. "question.create".
  action: {
    type: String,
    required: true,
  },
  // One-line human summary, already truncated by the caller helper.
  summary: {
    type: String,
    required: true,
  },
  targetType: String,
  targetId: String,
  // Counts and other small scalars only.
  meta: {
    type: mongoose.Schema.Types.Mixed,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

// Newest-first reads are the only access pattern.
auditLogSchema.index({ createdAt: -1, _id: -1 });
auditLogSchema.index({ action: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
