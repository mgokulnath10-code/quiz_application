const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { createAuthCache } = require("../utils/authCache");

// User-token guard. The contract is unchanged: the raw token
// is sent in the Authorization header (no "Bearer " prefix).
//
// The account is still re-read so an admin disable takes effect
// promptly — a token issued before the lock must stop working —
// but the result is cached briefly. The room endpoints the
// client polls every 2-3 seconds would otherwise pay a database
// round trip on every request. A disable through
// PATCH /api/admin/users/:id/disabled invalidates the entry
// immediately, so the only staleness is for changes made
// outside this process, bounded by the TTL.

const accountCache = createAuthCache({
  lookup: async (id) => {
    const account = await User.findById(id)
      .select("name email disabled")
      .lean();

    return account || null;
  },
});

const auth = async (req, res, next) => {
  const token = req.header("Authorization");

  if (!token) {
    return res.status(401).json({
      message: "Access Denied",
      code: "AUTH_REQUIRED",
    });
  }

  let verified;

  try {
    verified = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(400).json({
      message: "Invalid Token",
      code: "INVALID_TOKEN",
    });
  }

  // Admin tokens carry a role and no account id; they are
  // not valid on user routes.

  if (!verified || !verified.id) {
    return res.status(401).json({
      message: "Invalid Token",
      code: "INVALID_TOKEN",
    });
  }

  try {
    const account = await accountCache.get(verified.id);

    if (!account) {
      return res.status(401).json({
        message: "This account no longer exists.",
        code: "ACCOUNT_NOT_FOUND",
      });
    }

    if (account.disabled) {
      return res.status(403).json({
        message:
          "This account has been disabled by an administrator.",
        code: "ACCOUNT_DISABLED",
      });
    }

    req.user = verified;

    // Fresh account fields, so routes do not have to re-query.
    req.account = account;

    next();
  } catch (error) {
    console.log(error);

    return res.status(500).json({
      message: "Could not verify the account. Please try again.",
      code: "SERVER_ERROR",
    });
  }
};

// Drop a user's cached account status so an admin enable/disable
// is visible on the very next request rather than after the TTL.
auth.invalidateAccount = (id) => accountCache.invalidate(id);

auth.accountCache = accountCache;

module.exports = auth;
