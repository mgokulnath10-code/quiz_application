// OAuth `state` handling, extracted so the rules are testable.
//
// Two defects motivated this module:
//
//   1. The state cookie was named `oauth_state` for every provider and every
//      browser tab. Starting a Google sign-in therefore overwrote the cookie a
//      Microsoft sign-in was waiting on, and the Microsoft callback failed the
//      state check. The cookie is now named per provider.
//
//   2. The cookie was cleared *before* the state was validated, so one stray or
//      replayed callback destroyed the state a legitimate concurrent attempt
//      still needed. The caller clears it only after validation succeeds, which
//      is also what keeps the state single-use.
//
// The failed check used to collapse into one message ("The sign-in request
// expired"), which made the next occurrence undiagnosable. Each failure mode
// below now carries its own plain-language message.
//
// CommonJS and dependency-free on purpose: the backend is CommonJS and
// scripts/selfcheckOauth.mjs loads this through createRequire.

// Cookie names must be a single HTTP token, so the provider name is reduced to
// the characters a token allows. An unexpected value becomes `unknown` rather
// than producing a malformed Set-Cookie header.
const stateCookieName = (provider) => {
  const name = String(provider == null ? "" : provider)
    .trim()
    .toLowerCase();

  const safe = /^[a-z0-9_-]+$/.test(name) ? name : "unknown";

  return `oauth_state_${safe}`;
};

// Cookie parsing that tolerates "=" inside values. Lives here so the state
// rules can be exercised without Express.
const parseCookieHeader = (header) =>
  (header || "")
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .reduce((acc, part) => {
      const index = part.indexOf("=");

      if (index === -1) return acc;

      acc[part.slice(0, index).trim()] = part.slice(index + 1).trim();

      return acc;
    }, {});

// Path=/ is required because the callback lives under /api/auth/... .
// SameSite=Lax keeps the cookie attached to the provider's top-level redirect
// back to us while blocking cross-site subrequests. HttpOnly keeps it away from
// script. Secure is conditional so plain-HTTP local development still works.
const buildStateCookie = ({ provider, value, maxAge, secure }) => {
  const parts = [
    `${stateCookieName(provider)}=${value}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "SameSite=Lax",
    "HttpOnly",
  ];

  if (secure) parts.push("Secure");

  return parts.join("; ");
};

const STATE_FAILURES = {
  PROVIDER_ERROR: "provider_error",
  NO_CODE: "no_code",
  NO_STATE: "no_state",
  MISSING_COOKIE: "missing_cookie",
  MISMATCH: "mismatch",
};

// The provider's own error code is echoed back to the user, so it is reduced to
// a short token before it reaches a message.
const sanitizeProviderErrorCode = (value) =>
  String(value == null ? "" : value)
    .trim()
    .replace(/[^a-zA-Z0-9_.-]/g, "")
    .slice(0, 64);

// Deliberately different from each other: the same sentence used to cover all
// four failures, which hid which one had actually happened.
const STATE_MESSAGES = {
  [STATE_FAILURES.PROVIDER_ERROR]:
    "The provider declined this sign-in request. Please start again from the " +
    "login page.",

  [STATE_FAILURES.NO_CODE]:
    "The provider's reply did not include an authorization code. Please start " +
    "the sign-in again from the login page.",

  [STATE_FAILURES.NO_STATE]:
    "The provider's reply did not include its security state value. Please " +
    "start the sign-in again from the login page.",

  [STATE_FAILURES.MISSING_COOKIE]:
    "This browser has no sign-in attempt in progress, so this reply cannot be " +
    "matched to one. The attempt may have expired, or the reply arrived at a " +
    "different web address than the one the sign-in started from.",

  [STATE_FAILURES.MISMATCH]:
    "This sign-in reply does not match the attempt in this browser. It may be " +
    "an old reply or a repeated one. Please start the sign-in again.",
};

// Decides whether a callback may proceed. Pure: it reads only the query object
// and the raw Cookie header, and returns a decision plus the message to show.
//
// Order matters. A provider that refuses the request (for example
// `error=access_denied`) also omits `code`, so the provider's own reason is
// checked first and surfaced instead of being reported as a missing code.
const validateOAuthState = ({
  provider,
  query = {},
  cookieHeader = "",
}) => {
  const providerError = sanitizeProviderErrorCode(query.error);

  if (providerError) {
    return {
      ok: false,
      reason: STATE_FAILURES.PROVIDER_ERROR,
      code: providerError,
      message:
        `${STATE_MESSAGES[STATE_FAILURES.PROVIDER_ERROR]} ` +
        `(${providerError})`,
    };
  }

  if (!query.code) {
    return {
      ok: false,
      reason: STATE_FAILURES.NO_CODE,
      code: null,
      message: STATE_MESSAGES[STATE_FAILURES.NO_CODE],
    };
  }

  if (!query.state) {
    return {
      ok: false,
      reason: STATE_FAILURES.NO_STATE,
      code: null,
      message: STATE_MESSAGES[STATE_FAILURES.NO_STATE],
    };
  }

  // Only this provider's cookie is consulted, so a sign-in started with
  // another provider (or in another tab) cannot invalidate this one.
  const expected = parseCookieHeader(cookieHeader)[
    stateCookieName(provider)
  ];

  if (!expected) {
    return {
      ok: false,
      reason: STATE_FAILURES.MISSING_COOKIE,
      code: null,
      message: STATE_MESSAGES[STATE_FAILURES.MISSING_COOKIE],
    };
  }

  if (query.state !== expected) {
    return {
      ok: false,
      reason: STATE_FAILURES.MISMATCH,
      code: null,
      message: STATE_MESSAGES[STATE_FAILURES.MISMATCH],
    };
  }

  // The caller clears the cookie here — after the check, never before — which
  // both preserves concurrent attempts and keeps the state single-use.
  return {
    ok: true,
    reason: null,
    code: null,
    message: null,
    state: String(query.state),
  };
};

module.exports = {
  stateCookieName,
  parseCookieHeader,
  buildStateCookie,
  sanitizeProviderErrorCode,
  validateOAuthState,
  STATE_FAILURES,
  STATE_MESSAGES,
};
