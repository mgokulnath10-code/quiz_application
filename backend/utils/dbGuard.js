// The fail-fast guard for database-backed routes.
//
// When the MongoDB connection is not established, a request that would query
// the database must not wait on the driver's server-selection timeout and
// then surface as a generic 500. This middleware answers immediately with
// 503 DB_UNAVAILABLE and an actionable message.
//
// Which routes are database-backed is decided from the request path only, so
// the classification is pure and can be self-checked without a server. The
// list is explicit in both directions: adding a route never silently starts
// hanging, and a route that does not touch the database is never blocked by a
// database outage.

const DB_UNAVAILABLE_CODE = "DB_UNAVAILABLE";

const DB_UNAVAILABLE_MESSAGE =
  "The server cannot reach its database right now, so this request could " +
  "not be completed. This is a server configuration problem, not a problem " +
  "with your account, browser or network. Please try again shortly; if it " +
  "keeps failing, the site operator needs to check the database connection.";

// Prefixes of API routes that read or write the database.
const DB_ROUTE_PREFIXES = [
  "/api/register",
  "/api/verify-otp",
  "/api/forgot-password",
  "/api/reset-password",
  "/api/login",
  "/api/questions",
  "/api/users",
  "/api/admin/users",
  "/api/admin/questions",
  "/api/quizzes",
  "/api/results",
  "/api/stats",
  "/api/admin/results",
  "/api/admin/audit-log",
  "/api/rooms",
];

// Routes that never touch the database. Health, admin login (credentials come
// from the environment) and the OAuth handshake must keep working during an
// outage — they are how an operator sees that the database is down.
const NON_DB_PATHS = new Set([
  "/",
  "/api/health/config",
  "/api/health/db",
  "/api/admin/login",
  "/api/auth/providers",
  "/api/admin/questions/template",
]);

// The whole /api/auth/* surface (start, callback, providers, diagnose) runs
// against the identity provider, not the database.
const NON_DB_PREFIXES = ["/api/auth/"];

const normalizePath = (value) => {
  let path = String(value || "").split("?")[0];

  if (path.length > 1) path = path.replace(/\/+$/, "");

  return path || "/";
};

const matchesPrefix = (path, prefix) =>
  path === prefix || path.startsWith(`${prefix}/`);

const isDatabaseRoute = (rawPath) => {
  const path = normalizePath(rawPath);

  if (NON_DB_PATHS.has(path)) return false;

  if (NON_DB_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return false;
  }

  return DB_ROUTE_PREFIXES.some((prefix) => matchesPrefix(path, prefix));
};

// `isConnected` is injected so this module stays free of mongoose.
const createDbGuard = ({ isConnected }) => (req, res, next) => {
  if (!isDatabaseRoute(req.path)) return next();

  if (isConnected()) return next();

  return res.status(503).json({
    message: DB_UNAVAILABLE_MESSAGE,
    code: DB_UNAVAILABLE_CODE,
  });
};

module.exports = {
  DB_UNAVAILABLE_CODE,
  DB_UNAVAILABLE_MESSAGE,
  DB_ROUTE_PREFIXES,
  NON_DB_PATHS,
  normalizePath,
  isDatabaseRoute,
  createDbGuard,
};
