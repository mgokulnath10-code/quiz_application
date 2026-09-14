// Pure shaping/filtering rules for audit-log entries.
//
// Kept apart from utils/audit.js (which owns the Mongoose write) so
// scripts/selfcheckAdmin.mjs can verify the "never store credentials" rule
// without a database.

const AUDIT_ACTIONS = {
  ADMIN_LOGIN: "admin.login",
  QUESTION_CREATE: "question.create",
  QUESTION_UPDATE: "question.update",
  QUESTION_DELETE: "question.delete",
  QUESTIONS_IMPORT: "questions.import",
  USER_ENABLE: "user.enable",
  USER_DISABLE: "user.disable",
  ROOM_FORCE_END: "room.force_end",
  ROOM_DELETE: "room.delete",
};

const MAX_SUMMARY_LENGTH = 240;
const MAX_META_KEYS = 12;
const MAX_META_STRING = 120;

// Keys whose value is a credential or an opaque payload. Dropped even if a
// caller passes them, so the rule is enforced centrally rather than by
// remembering at every call site.
const BLOCKED_KEY = /pass|secret|token|auth|cookie|credential|session|hash|otp/i;

const truncateSummary = (value, max = MAX_SUMMARY_LENGTH) => {
  const text = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();

  if (text.length <= max) return text;

  return `${text.slice(0, Math.max(0, max - 1))}…`;
};

// Keeps only small scalars and drops anything that looks like a secret. A
// nested object (a full request body) is rejected outright.
const sanitizeMeta = (value) => {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const clean = {};

  Object.entries(value).forEach(([key, entry]) => {
    if (Object.keys(clean).length >= MAX_META_KEYS) return;

    if (BLOCKED_KEY.test(key)) return;

    if (
      typeof entry === "string" ||
      typeof entry === "number" ||
      typeof entry === "boolean"
    ) {
      clean[key] =
        typeof entry === "string"
          ? entry.slice(0, MAX_META_STRING)
          : entry;
    }
  });

  return Object.keys(clean).length > 0 ? clean : undefined;
};

const buildAuditRecord = ({
  actor = "admin",
  action,
  summary,
  targetType,
  targetId,
  meta,
  now,
} = {}) => {
  if (!action) {
    throw new TypeError("buildAuditRecord requires an action");
  }

  return {
    actor: truncateSummary(actor, 40) || "admin",
    action: truncateSummary(action, 60),
    summary: truncateSummary(summary),
    targetType: targetType ? truncateSummary(targetType, 40) : undefined,
    targetId:
      targetId === null || targetId === undefined || targetId === ""
        ? undefined
        : truncateSummary(targetId, 80),
    meta: sanitizeMeta(meta),
    createdAt: now instanceof Date ? now : new Date(),
  };
};

module.exports = {
  AUDIT_ACTIONS,
  MAX_SUMMARY_LENGTH,
  truncateSummary,
  sanitizeMeta,
  buildAuditRecord,
};
