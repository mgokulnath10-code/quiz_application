// Audit-log writes.
//
// The contract the admin routes rely on: recordAudit NEVER throws and never
// rejects. A failed audit write is logged and swallowed so the underlying
// admin action (creating a question, disabling a user, ...) still succeeds.
// Losing an audit line is bad; failing an admin action because the log is
// unavailable is worse.

const AuditLog = require("../models/AuditLog");
const { buildAuditRecord } = require("./auditFormat");

const recordAudit = async (entry) => {
  try {
    const record = buildAuditRecord(entry);

    await AuditLog.create(record);
  } catch (error) {
    console.error(
      "[audit] could not record action:",
      entry && entry.action ? entry.action : "(unknown)",
      error && error.message ? error.message : error
    );
  }
};

module.exports = { recordAudit };
