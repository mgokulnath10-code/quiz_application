// Shared handling for the backend's fail-fast database outage response.
//
// When the server cannot reach its database it answers 503 with
// `{ code: "DB_UNAVAILABLE" }` (see backend/utils/dbGuard.js). That is a
// server-side problem, so the UI must name it plainly and offer a retry
// instead of spinning forever or showing a generic failure.
//
// Pure and dependency-free so it can be covered by scripts/selfcheckDb.mjs.

export const DB_UNAVAILABLE_CODE = "DB_UNAVAILABLE";

export const DB_UNAVAILABLE_MESSAGE =
  "The server cannot reach its database, so this data could not be loaded. " +
  "This is a server configuration problem — not a problem with your " +
  "account or device. Please retry in a moment; if it keeps failing, the " +
  "site operator needs to check the database connection.";

export const isDbUnavailable = (error) => {
  const response = error?.response;

  return (
    response?.status === 503 &&
    response?.data?.code === DB_UNAVAILABLE_CODE
  );
};

// The message to show for a failed request: the database outage gets its own
// explanation, a server-supplied message wins otherwise, and `fallback` is
// the last resort. Genuine errors keep their existing shape.
export const messageForError = (error, fallback) => {
  if (isDbUnavailable(error)) return DB_UNAVAILABLE_MESSAGE;

  const message = error?.response?.data?.message;

  return typeof message === "string" && message.trim()
    ? message
    : fallback;
};

/* =====================
   AUTH PAGES
===================== */

// The auth pages show failures inline, so each kind of failure needs one
// plain sentence of its own. These are the two the server cannot phrase for
// us: a request that never reached the server, and a rejected sign-in.

export const NETWORK_MESSAGE =
  "We could not reach the server. Check your internet connection and try " +
  "again.";

export const INVALID_CREDENTIALS_MESSAGE =
  "The email or password is incorrect. Check both and try again.";

export const SERVER_FAILURE_MESSAGE =
  "The server could not complete the request. Please try again in a moment.";

export const isNetworkError = (error) => !error?.response;

export const isInvalidCredentials = (error) =>
  error?.response?.status === 401;

// A deliberate API error names itself with an uppercase code (DB_UNAVAILABLE,
// EMAIL_NOT_CONFIGURED, …). A 5xx body without one is a raw failure: two OTP
// routes answer `res.status(500).json(error)`, which serialises the caught
// object, so that text must never be shown to the user.
const isIntentionalErrorCode = (value) =>
  typeof value === "string" && /^[A-Z][A-Z0-9_]*$/.test(value);

// The message for a failed request on the auth pages. Order matters: the
// database outage and a dead connection each get their own explanation, an
// uncoded 5xx falls back to the page's own sentence, and anything else keeps
// the server's message via messageForError.
export const messageForAuthError = (error, fallback) => {
  if (isDbUnavailable(error)) return DB_UNAVAILABLE_MESSAGE;

  if (isNetworkError(error)) return NETWORK_MESSAGE;

  const status = error?.response?.status;

  if (
    typeof status === "number" &&
    status >= 500 &&
    !isIntentionalErrorCode(error?.response?.data?.code)
  ) {
    return fallback || SERVER_FAILURE_MESSAGE;
  }

  return messageForError(error, fallback);
};

// Sign-in adds one distinction the other auth forms do not have: a 401 means
// the email/password pair was rejected, which the server answers with the
// terse "Invalid Credentials".
export const messageForLoginError = (error, fallback) =>
  isInvalidCredentials(error)
    ? INVALID_CREDENTIALS_MESSAGE
    : messageForAuthError(error, fallback);
