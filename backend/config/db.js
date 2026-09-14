// MongoDB connection.
//
// Two behaviours matter here, and both exist to turn a database outage into
// something fast and diagnosable rather than a ten-second hang:
//
//   1. Command buffering is OFF and server selection is bounded, so a query
//      against a database that cannot be reached fails instead of queueing
//      for the driver's default 30s.
//   2. A failed initial connection is retried on a fixed delay, so the server
//      keeps listening (health reports the truth) and recovers on its own
//      once the database becomes reachable — no restart required.
//
// Connection errors are logged once, clearly, and with the URI credentials
// masked by utils/dbDiagnostics.js.

const mongoose = require("mongoose");

const { sanitizeDbError } = require("../utils/dbDiagnostics");

const DEFAULT_SERVER_SELECTION_TIMEOUT_MS = 5000;
const DEFAULT_RETRY_DELAY_MS = 10000;

const toPositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);

  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

const serverSelectionTimeoutMs = () =>
  toPositiveInt(
    process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS,
    DEFAULT_SERVER_SELECTION_TIMEOUT_MS
  );

const retryDelayMs = () =>
  toPositiveInt(process.env.MONGO_RETRY_DELAY_MS, DEFAULT_RETRY_DELAY_MS);

// Exported so the values can be asserted without opening a connection.
const connectionOptions = () => ({
  serverSelectionTimeoutMS: serverSelectionTimeoutMs(),
  connectTimeoutMS: serverSelectionTimeoutMs(),
  socketTimeoutMS: 45000,
  // A query is never queued behind a connection that is not there. Callers
  // (the routes, and the DB guard in front of them) then see a real error or
  // a fast 503 instead of a buffered promise.
  bufferCommands: false,
});

// The host has one shot at a clear message; repeat failures on the retry loop
// are summarised rather than reprinting the same stack every ten seconds.
let lastErrorMessage = "";
let retryTimer = null;
let connecting = false;
let bootstrapped = false;
let loggedDisconnect = false;

const maskUri = () => process.env.MONGO_URI;

const describe = (error) =>
  sanitizeDbError(error, { uri: maskUri() }) ||
  "unknown connection error";

const getLastConnectionError = () => lastErrorMessage;

const scheduleRetry = (attempt) => {
  if (retryTimer) return;

  const delay = retryDelayMs();

  retryTimer = setTimeout(() => {
    retryTimer = null;

    attempt();
  }, delay);

  // The HTTP server keeps the process alive; this timer must not.
  if (typeof retryTimer.unref === "function") retryTimer.unref();
};

// Connects, runs `onConnected` once after the first successful connection,
// and keeps retrying in the background until the database answers.
const connectDB = async ({ onConnected } = {}) => {
  // Belt and braces: bufferCommands:false is also passed per connection, but
  // this makes it the default for every model query.
  mongoose.set("bufferCommands", false);

  const connection = mongoose.connection;

  connection.on("connected", () => {
    loggedDisconnect = false;

    console.log("MongoDB Connected");
  });

  connection.on("disconnected", () => {
    if (loggedDisconnect) return;

    loggedDisconnect = true;

    console.warn(
      "[db] MongoDB disconnected. Database-backed requests will fail fast " +
        "with DB_UNAVAILABLE until the connection recovers; the driver " +
        "reconnects automatically."
    );
  });

  connection.on("error", (error) => {
    lastErrorMessage = describe(error);

    console.error("[db] MongoDB connection error:", lastErrorMessage);
  });

  const attempt = async () => {
    if (connecting || connection.readyState === 1) return;

    connecting = true;

    try {
      await mongoose.connect(process.env.MONGO_URI, connectionOptions());

      lastErrorMessage = "";

      if (onConnected && !bootstrapped) {
        bootstrapped = true;

        try {
          await onConnected();
        } catch (error) {
          console.error(
            "[db] Startup database tasks failed:",
            describe(error)
          );
        }
      }
    } catch (error) {
      lastErrorMessage = describe(error);

      console.error(
        "[db] Could not connect to MongoDB:",
        lastErrorMessage
      );

      console.error(
        `[db] The server is still running; database-backed routes return ` +
          `503 DB_UNAVAILABLE. Retrying in ${Math.round(
            retryDelayMs() / 1000
          )}s.`
      );

      scheduleRetry(attempt);
    } finally {
      connecting = false;
    }
  };

  await attempt();
};

module.exports = connectDB;
module.exports.connectionOptions = connectionOptions;
module.exports.getLastConnectionError = getLastConnectionError;
module.exports.DEFAULT_SERVER_SELECTION_TIMEOUT_MS =
  DEFAULT_SERVER_SELECTION_TIMEOUT_MS;
