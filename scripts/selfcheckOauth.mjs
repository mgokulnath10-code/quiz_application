// Dependency-free self-check for the OAuth helpers.
//
// Run with:  npm run selfcheck:oauth
//
// Covered:
//   - backend/utils/oauthOrigin.js    the origin decision table
//   - backend/utils/oauthState.js     the per-provider state cookie and the
//                                     state check, as pure logic
//   - backend/utils/oauthDiagnose.js  classifyProviderProbe fixtures, the
//                                     rate limiter, and the probe URL builder
//
// The three modules import neither Express nor Mongoose, so everything except
// the structural check at the end runs with plain objects and fixtures. The
// fixtures for classifyProviderProbe are built from markers captured from the
// live Google pages; the reproduction is recorded in the module header.
//
// Prints one PASS/FAIL line per case and exits non-zero on any failure.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import fs from "node:fs";
import path from "node:path";

const require = createRequire(import.meta.url);

const utilsDir = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "backend",
  "utils"
);

const {
  buildOAuthAllowlist,
  resolveApiOrigin,
  resolveFrontendOrigin,
  callbackUriFor,
  candidateApiOrigins,
  resolveOAuthOrigins,
  stripTrailingSlashes,
} = require(path.join(utilsDir, "oauthOrigin.js"));

const {
  stateCookieName,
  buildStateCookie,
  sanitizeProviderErrorCode,
  validateOAuthState,
  STATE_FAILURES,
} = require(path.join(utilsDir, "oauthState.js"));

const {
  MAX_BODY_BYTES,
  PROBE_VERDICTS,
  PROBE_CODES,
  classifyProviderProbe,
  probeSupportFor,
  diagnosisMessage,
  createRateLimiter,
  buildProbeUrl,
  decodeAuthErrorHint,
} = require(path.join(utilsDir, "oauthDiagnose.js"));

let passed = 0;
let failed = 0;

const case_ = (name, fn) => {
  try {
    fn();

    passed += 1;

    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;

    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
};

const assertEqual = (actual, expected, label = "value") => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a !== b) {
    throw new Error(`${label}: expected ${b}, received ${a}`);
  }
};

const assertTrue = (value, label = "value") => {
  if (!value) throw new Error(`${label}: expected a truthy value`);
};

const assertFalse = (value, label = "value") => {
  if (value) throw new Error(`${label}: expected a falsy value`);
};

// The deployed backend/.env as reported in the bug report.
const PROD_ENV = {
  NODE_ENV: "production",
  SERVER_URL: "https://brain-race.onrender.com",
  FRONTEND_URL: "https://brainrace.netlify.app",
};

console.log("");
console.log("BrainRace OAuth selfcheck");
console.log("========================");
console.log("");

/* =====================
   A — REQUIRED CASES
===================== */

case_("(a) a production request from a non-allowlisted host falls back to SERVER_URL", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "https://evil.example.com",
    env: PROD_ENV,
    nodeEnv: "production",
  });

  assertEqual(
    resolved.apiOrigin,
    "https://brain-race.onrender.com",
    "api origin"
  );
});

case_("(b) a non-production request from http://localhost:5000 resolves to that origin", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://localhost:5000",
    env: { SERVER_URL: "https://brain-race.onrender.com" },
    nodeEnv: "development",
  });

  assertEqual(resolved.apiOrigin, "http://localhost:5000", "api origin");

  assertEqual(
    callbackUriFor(resolved.apiOrigin, "google"),
    "http://localhost:5000/api/auth/google/callback",
    "callback uri"
  );
});

case_("(c) an allowlisted extra origin from OAUTH_ALLOWED_ORIGINS resolves to itself", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://192.168.1.25:5000",
    env: {
      NODE_ENV: "production",
      SERVER_URL: "https://brain-race.onrender.com",
      OAUTH_ALLOWED_ORIGINS: "http://192.168.1.25:5000",
    },
    nodeEnv: "production",
  });

  assertEqual(
    resolved.apiOrigin,
    "http://192.168.1.25:5000",
    "api origin"
  );
});

case_("(d) a Host header that is not allowlisted is never used", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "https://attacker.test",
    env: PROD_ENV,
    nodeEnv: "production",
  });

  assertFalse(
    resolved.apiOrigin.includes("attacker.test"),
    "api origin must not use the forged host"
  );

  assertFalse(
    JSON.stringify(resolved.redirectUris).includes("attacker.test"),
    "redirect URIs must not advertise the forged host"
  );
});

case_("(e) the trailing slash is stripped", () => {
  assertEqual(
    stripTrailingSlashes("https://brain-race.onrender.com/"),
    "https://brain-race.onrender.com",
    "strip one"
  );

  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://localhost:5000/",
    env: { SERVER_URL: "https://brain-race.onrender.com//" },
    nodeEnv: "development",
  });

  assertEqual(resolved.apiOrigin, "http://localhost:5000", "api origin");

  assertEqual(
    resolveOAuthOrigins({
      requestOrigin: "https://weird.example",
      env: { SERVER_URL: "https://brain-race.onrender.com/" },
      nodeEnv: "production",
    }).apiOrigin,
    "https://brain-race.onrender.com",
    "fallback strips too"
  );
});

/* =====================
   B — ALLOWLIST COMPOSITION
===================== */

case_("loopback origins are allowlisted only outside production", () => {
  const dev = buildOAuthAllowlist({
    env: { PORT: "5050" },
    nodeEnv: "development",
  });

  assertTrue(dev.includes("http://localhost:5050"), "dev localhost");
  assertTrue(dev.includes("http://127.0.0.1:5050"), "dev 127.0.0.1");

  const prod = buildOAuthAllowlist({
    env: { PORT: "5050" },
    nodeEnv: "production",
  });

  assertFalse(prod.includes("http://localhost:5050"), "prod localhost");
  assertFalse(prod.includes("http://127.0.0.1:5050"), "prod 127.0.0.1");
});

case_("a local request cannot be hijacked in production", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://localhost:5000",
    env: PROD_ENV,
    nodeEnv: "production",
  });

  assertEqual(
    resolved.apiOrigin,
    "https://brain-race.onrender.com",
    "api origin"
  );
});

case_("OAUTH_ALLOWED_ORIGINS tolerates blanks and duplicates", () => {
  const allowlist = buildOAuthAllowlist({
    env: {
      OAUTH_ALLOWED_ORIGINS:
        " https://a.example , ,https://a.example,https://b.example/ ",
    },
    nodeEnv: "production",
  });

  assertEqual(
    allowlist,
    ["https://a.example", "https://b.example"],
    "allowlist"
  );
});

case_("an invalid value in OAUTH_ALLOWED_ORIGINS does not crash resolution", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "not a url",
    env: {
      NODE_ENV: "production",
      OAUTH_ALLOWED_ORIGINS: "not a url",
      SERVER_URL: "https://brain-race.onrender.com",
    },
    nodeEnv: "production",
  });

  assertEqual(
    resolved.apiOrigin,
    "https://brain-race.onrender.com",
    "api origin"
  );
});

/* =====================
   C — FRONTEND RETURN
===================== */

case_("the frontend return prefers the configured FRONTEND_URL", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://localhost:5000",
    env: {
      FRONTEND_URL: "https://brainrace.netlify.app",
      SERVER_URL: "https://brain-race.onrender.com",
    },
    nodeEnv: "development",
  });

  assertEqual(
    resolved.frontendOrigin,
    "https://brainrace.netlify.app",
    "frontend origin"
  );
});

case_("with no FRONTEND_URL the allowlisted request origin is the return target", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://localhost:5000",
    env: { SERVER_URL: "https://brain-race.onrender.com" },
    nodeEnv: "development",
  });

  assertEqual(
    resolved.frontendOrigin,
    "http://localhost:5000",
    "frontend origin"
  );
});

case_("a forged request origin never becomes the frontend return target", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "https://evil.example.com",
    env: { NODE_ENV: "production" },
    nodeEnv: "production",
  });

  assertEqual(resolved.frontendOrigin, null, "frontend origin");
});

case_("resolveFrontendOrigin ignores an origin the allowlist does not hold", () => {
  const origin = resolveFrontendOrigin({
    requestOrigin: "https://evil.example.com",
    allowlist: ["https://brainrace.netlify.app"],
    frontendUrl: "https://brainrace.netlify.app",
    serverUrl: "https://brain-race.onrender.com",
  });

  assertEqual(origin, "https://brainrace.netlify.app", "frontend origin");
});

/* =====================
   D — CALLBACK CANDIDATES
===================== */

case_("health diagnostics offer one copyable URI per provider", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "http://localhost:5000",
    env: {
      SERVER_URL: "https://brain-race.onrender.com",
      FRONTEND_URL: "https://brainrace.netlify.app",
    },
    nodeEnv: "development",
  });

  assertTrue(
    resolved.redirectUris.google.includes(
      "http://localhost:5000/api/auth/google/callback"
    ),
    "local google uri"
  );

  assertTrue(
    resolved.redirectUris.google.includes(
      "https://brain-race.onrender.com/api/auth/google/callback"
    ),
    "deployed google uri"
  );

  assertTrue(
    resolved.redirectUris.microsoft.every((uri) =>
      uri.endsWith("/api/auth/microsoft/callback")
    ),
    "microsoft uris"
  );

  assertTrue(
    resolved.redirectUris.github.every((uri) =>
      uri.endsWith("/api/auth/github/callback")
    ),
    "github uris"
  );

  assertEqual(
    Object.keys(resolved.redirectUris).sort(),
    ["github", "google", "microsoft"],
    "provider keys"
  );
});

case_("the frontend host is not advertised as a callback host", () => {
  const resolved = resolveOAuthOrigins({
    requestOrigin: "https://brain-race.onrender.com",
    env: PROD_ENV,
    nodeEnv: "production",
  });

  assertFalse(
    resolved.redirectUris.google.some((uri) =>
      uri.includes("netlify.app")
    ),
    "netlify must not be a callback candidate"
  );
});

case_("candidateApiOrigins dedupes SERVER_URL and the resolved origin", () => {
  const origins = candidateApiOrigins({
    requestOrigin: "https://brain-race.onrender.com",
    env: PROD_ENV,
    nodeEnv: "production",
  });

  assertEqual(
    origins,
    ["https://brain-race.onrender.com"],
    "origins"
  );
});

case_("callbackUriFor returns null for an unresolved origin", () => {
  assertEqual(callbackUriFor(null, "google"), null, "null");
  assertEqual(callbackUriFor("", "google"), null, "empty");
  assertEqual(
    callbackUriFor("https://x.example/", "google"),
    "https://x.example/api/auth/google/callback",
    "trailing slash"
  );
});

case_("resolveApiOrigin falls back through SERVER_URL then FRONTEND_URL", () => {
  const allowlist = ["https://frontend.example"];

  assertEqual(
    resolveApiOrigin({
      requestOrigin: "https://unknown.example",
      allowlist,
      serverUrl: "",
      frontendUrl: "https://frontend.example",
    }),
    "https://frontend.example",
    "frontend fallback"
  );

  assertEqual(
    resolveApiOrigin({
      requestOrigin: "https://unknown.example",
      allowlist,
      serverUrl: "",
      frontendUrl: "",
    }),
    null,
    "no configuration"
  );
});

/* =====================
   E — STATE COOKIE SHAPE
===================== */

console.log("-- state cookie --");

case_("the state cookie name is per provider", () => {
  assertEqual(
    stateCookieName("google"),
    "oauth_state_google",
    "google"
  );

  assertEqual(
    stateCookieName("microsoft"),
    "oauth_state_microsoft",
    "microsoft"
  );

  assertEqual(stateCookieName("github"), "oauth_state_github", "github");

  assertTrue(
    stateCookieName("google") !== stateCookieName("microsoft"),
    "provider names must not collide"
  );
});

case_("an unexpected provider name cannot produce a malformed cookie name", () => {
  assertEqual(stateCookieName(""), "oauth_state_unknown", "empty");
  assertEqual(stateCookieName(null), "oauth_state_unknown", "null");
  assertEqual(
    stateCookieName("go ogle; Path=/evil"),
    "oauth_state_unknown",
    "injection attempt"
  );

  const cookie = buildStateCookie({
    provider: "go ogle; Path=/",
    value: "abc",
    maxAge: 600,
    secure: false,
  });

  assertEqual(
    cookie.split(";").length,
    5,
    "attribute count must stay fixed"
  );
});

case_("the state cookie keeps Path, Max-Age, SameSite and HttpOnly", () => {
  const cookie = buildStateCookie({
    provider: "google",
    value: "abc123",
    maxAge: 600,
    secure: false,
  });

  assertEqual(
    cookie,
    "oauth_state_google=abc123; Path=/; Max-Age=600; " +
      "SameSite=Lax; HttpOnly",
    "cookie"
  );
});

case_("Secure is added only when the request is https", () => {
  assertTrue(
    buildStateCookie({
      provider: "google",
      value: "x",
      maxAge: 600,
      secure: true,
    }).endsWith("; Secure"),
    "secure"
  );

  assertFalse(
    buildStateCookie({
      provider: "google",
      value: "x",
      maxAge: 600,
      secure: false,
    }).includes("Secure"),
    "plain http"
  );
});

/* =====================
   F — STATE CHECK RULES
===================== */

console.log("-- state check --");

const googleQuery = { code: "4/0abc", state: "s1" };

case_("a matching per-provider state passes", () => {
  const decision = validateOAuthState({
    provider: "google",
    query: googleQuery,
    cookieHeader: "oauth_state_google=s1",
  });

  assertTrue(decision.ok, "ok");
  assertEqual(decision.state, "s1", "state");
});

case_("another provider's cookie cannot satisfy this provider", () => {
  // The recorded bug: one shared cookie name meant a Google sign-in clobbered
  // a Microsoft attempt happening in another tab.
  const decision = validateOAuthState({
    provider: "microsoft",
    query: googleQuery,
    cookieHeader: "oauth_state_google=s1",
  });

  assertFalse(decision.ok, "must not pass");
  assertEqual(
    decision.reason,
    STATE_FAILURES.MISSING_COOKIE,
    "reason"
  );
});

case_("a google attempt survives while a microsoft attempt is in flight", () => {
  const cookieHeader =
    "oauth_state_microsoft=ms1; oauth_state_google=go1";

  const google = validateOAuthState({
    provider: "google",
    query: { code: "c", state: "go1" },
    cookieHeader,
  });

  const microsoft = validateOAuthState({
    provider: "microsoft",
    query: { code: "c", state: "ms1" },
    cookieHeader,
  });

  assertTrue(google.ok, "google");
  assertTrue(microsoft.ok, "microsoft");
});

case_("the same cookie name in another tab does not clobber a newer attempt", () => {
  // Tab A and tab B both start Google sign-in; only the newer cookie value
  // survives. The older callback is a mismatch — reported as a mismatch, not
  // as an expiry, and the newer attempt still validates afterwards.
  const older = validateOAuthState({
    provider: "google",
    query: { code: "c", state: "old" },
    cookieHeader: "oauth_state_google=new",
  });

  assertEqual(older.reason, STATE_FAILURES.MISMATCH, "older reason");
  assertFalse(older.ok, "older must not pass");

  const newer = validateOAuthState({
    provider: "google",
    query: { code: "c", state: "new" },
    cookieHeader: "oauth_state_google=new",
  });

  assertTrue(newer.ok, "newer must still pass");
});

case_("validateOAuthState is pure and consumes nothing", () => {
  // This is what makes "clear the cookie only after the check" implementable:
  // the decision does not mutate any state of its own, so the caller owns the
  // clearing step. See the structural check at the end of this file for the
  // ordering inside the callback.
  const args = {
    provider: "google",
    query: googleQuery,
    cookieHeader: "oauth_state_google=s1",
  };

  assertTrue(validateOAuthState(args).ok, "first");
  assertTrue(validateOAuthState(args).ok, "second");
});

case_("the four failure modes are distinct and separately worded", () => {
  const providerError = validateOAuthState({
    provider: "google",
    query: { error: "access_denied", state: "s1" },
    cookieHeader: "oauth_state_google=s1",
  });

  const noCode = validateOAuthState({
    provider: "google",
    query: { state: "s1" },
    cookieHeader: "oauth_state_google=s1",
  });

  const noState = validateOAuthState({
    provider: "google",
    query: { code: "c" },
    cookieHeader: "oauth_state_google=s1",
  });

  const missingCookie = validateOAuthState({
    provider: "google",
    query: googleQuery,
    cookieHeader: "",
  });

  const mismatch = validateOAuthState({
    provider: "google",
    query: { code: "c", state: "wrong" },
    cookieHeader: "oauth_state_google=s1",
  });

  assertEqual(
    providerError.reason,
    STATE_FAILURES.PROVIDER_ERROR,
    "provider error"
  );

  assertEqual(noCode.reason, STATE_FAILURES.NO_CODE, "no code");
  assertEqual(noState.reason, STATE_FAILURES.NO_STATE, "no state");
  assertEqual(
    missingCookie.reason,
    STATE_FAILURES.MISSING_COOKIE,
    "missing cookie"
  );

  assertEqual(mismatch.reason, STATE_FAILURES.MISMATCH, "mismatch");

  const messages = [
    providerError.message,
    noCode.message,
    noState.message,
    missingCookie.message,
    mismatch.message,
  ];

  assertEqual(
    new Set(messages).size,
    5,
    "every failure mode needs its own sentence"
  );

  assertTrue(
    messages.every((message) => message.length > 20),
    "messages must be readable sentences"
  );

  assertFalse(
    messages.some((message) =>
      message.includes("The sign-in request expired")
    ),
    "the old catch-all sentence must be gone"
  );
});

case_("a provider refusal surfaces the provider's own reason", () => {
  const decision = validateOAuthState({
    provider: "google",
    query: {
      error: "access_denied",
      error_description: "The user denied the request",
    },
    cookieHeader: "oauth_state_google=s1",
  });

  assertEqual(decision.code, "access_denied", "code");
  assertTrue(
    decision.message.includes("access_denied"),
    "message must name the reason"
  );
});

case_("an attacker-shaped error code is reduced to a short token", () => {
  assertEqual(
    sanitizeProviderErrorCode("<script>alert(1)</script>"),
    "scriptalert1script",
    "sanitized"
  );

  assertTrue(
    sanitizeProviderErrorCode("x".repeat(500)).length <= 64,
    "length capped"
  );

  const decision = validateOAuthState({
    provider: "google",
    query: { error: "<img src=x onerror=alert(1)>" },
    cookieHeader: "",
  });

  assertFalse(
    decision.message.includes("<"),
    "no raw markup in the message"
  );
});

case_("a provider refusal is not reported as a missing code", () => {
  // Google sends error=access_denied without a code, so the order of checks
  // decides which of the two messages the user sees.
  const decision = validateOAuthState({
    provider: "google",
    query: { error: "access_denied" },
    cookieHeader: "",
  });

  assertEqual(
    decision.reason,
    STATE_FAILURES.PROVIDER_ERROR,
    "provider error wins"
  );
});

/* =====================
   G — classifyProviderProbe FIXTURES
===================== */

console.log("-- classifyProviderProbe --");

// The base64url `authError` payloads below are the real prefixes observed on
// Google's error page: they decode to the error code in plain text.
const MISMATCH_AUTH_ERROR = "ChVyZWRpcmVjdF91cmlfbWlzbWF0Y2gSsAEKWW91IGNhbid0";

const INVALID_CLIENT_AUTH_ERROR =
  "Cg5pbnZhbGlkX2NsaWVudBIfVGhlIE9BdXRoIGNsaWVudCB3YXMgbm90IGZvdW5k";

const MISMATCH_FIXTURE = {
  finalUrl:
    "https://accounts.google.com/signin/oauth/error?authError=" +
    MISMATCH_AUTH_ERROR +
    "&flowName=GeneralOAuthLite&client_id=1085266620807-" +
    "rlc6l0suuk8cp5r62q0uun3r9ejs4s27.apps.googleusercontent.com",
  status: 200,
  body:
    "<!doctype html><html><head><title>Sign in with Google</title></head>" +
    "<body><div>Access blocked: This app's request is invalid</div>" +
    "<h1>Error 400: redirect_uri_mismatch</h1>" +
    "<p>You can't sign in to this app because it doesn't comply with " +
    "Google's OAuth 2.0 policy. If you're the app developer, register the " +
    "redirect URI in the Google Cloud Console.</p>" +
    "<p>Request details: redirect_uri=http://localhost:5000/api/auth/" +
    "google/callback</p></body></html>",
};

const ACCEPTED_FIXTURE = {
  finalUrl:
    "https://accounts.google.com/v3/signin/identifier?opparams=%253F&" +
    "dsh=S990097926%3A1789361694646564&client_id=407408718192.apps." +
    "googleusercontent.com&o2v=2&redirect_uri=https%3A%2F%2Fdevelopers." +
    "google.com%2Foauthplayground&response_type=code&scope=openid+email+" +
    "profile&service=lso&state=probe&flowName=GeneralOAuthLite&continue=" +
    "https%3A%2F%2Faccounts.google.com%2Fsignin%2Foauth%2Flegacy%2Fconsent" +
    "%3Fauthuser%3Dunknown",
  status: 200,
  body:
    "<!doctype html><html><head><title>Sign in - Google Accounts</title>" +
    "</head><body><h1>Sign in with Google</h1>" +
    "<p>Sign in to continue to Google OAuth 2.0 Playground</p>" +
    "<label>Email or phone</label></body></html>",
};

const INVALID_CLIENT_FIXTURE = {
  finalUrl:
    "https://accounts.google.com/signin/oauth/error?authError=" +
    INVALID_CLIENT_AUTH_ERROR +
    "&flowName=GeneralOAuthLite&client_id=000000000000-notarealclient." +
    "apps.googleusercontent.com",
  status: 200,
  body:
    "<!doctype html><html><body>" +
    "<div>Access blocked: Authorization Error</div>" +
    "<p>The OAuth client was not found.</p>" +
    "<h1>Error 401: invalid_client</h1></body></html>",
};

case_("fixture: the Google mismatch page is a mismatch", () => {
  const verdict = classifyProviderProbe(MISMATCH_FIXTURE);

  assertEqual(
    verdict.verdict,
    PROBE_VERDICTS.MISMATCH,
    "verdict"
  );

  assertEqual(verdict.code, PROBE_CODES.MISMATCH, "code");
  assertEqual(verdict.evidence, "redirect_uri_mismatch", "evidence");
});

case_("fixture: an accepted consent page is accepted", () => {
  const verdict = classifyProviderProbe(ACCEPTED_FIXTURE);

  assertEqual(
    verdict.verdict,
    PROBE_VERDICTS.ACCEPTED,
    "verdict"
  );

  assertEqual(verdict.code, PROBE_CODES.CONSENT_PAGE, "code");
});

case_("fixture: an invalid client is reported as invalid_client", () => {
  const verdict = classifyProviderProbe(INVALID_CLIENT_FIXTURE);

  assertEqual(
    verdict.verdict,
    PROBE_VERDICTS.INVALID_CLIENT,
    "verdict"
  );

  assertEqual(verdict.code, PROBE_CODES.INVALID_CLIENT, "code");
});

case_("fixture: an empty response is unknown, never accepted", () => {
  assertEqual(
    classifyProviderProbe({ finalUrl: "", body: "", status: 0 }).code,
    PROBE_CODES.EMPTY_RESPONSE,
    "empty"
  );

  assertEqual(
    classifyProviderProbe({}).verdict,
    PROBE_VERDICTS.UNKNOWN,
    "no argument"
  );

  assertEqual(
    classifyProviderProbe({ finalUrl: "", body: "   ", status: 0 }).verdict,
    PROBE_VERDICTS.UNKNOWN,
    "whitespace"
  );
});

case_("fixture: an unexpected page is unknown, not accepted", () => {
  const verdict = classifyProviderProbe({
    finalUrl: "https://accounts.google.com/gsi/select",
    body: "<html><body>Something this checker has never seen</body></html>",
    status: 200,
  });

  assertEqual(verdict.verdict, PROBE_VERDICTS.UNKNOWN, "verdict");
  assertEqual(
    verdict.code,
    PROBE_CODES.UNRECOGNISED_RESPONSE,
    "code"
  );
});

case_("an error page with an unrecognised code is unknown", () => {
  // A real Google error page, but not a redirect_uri or client_id problem.
  const verdict = classifyProviderProbe({
    finalUrl:
      "https://accounts.google.com/signin/oauth/error?authError=" +
      "Cg9kZWxldGVkX2NsaWVudA",
    body:
      "<html><body>Access blocked: Authorization Error" +
      "<h1>Error 401: deleted_client</h1></body></html>",
    status: 200,
  });

  assertEqual(verdict.verdict, PROBE_VERDICTS.UNKNOWN, "verdict");
  assertEqual(
    verdict.code,
    PROBE_CODES.PROVIDER_ERROR_PAGE,
    "code"
  );
});

case_("an anti-bot interstitial is unknown, not accepted", () => {
  const verdict = classifyProviderProbe({
    finalUrl: "https://www.google.com/sorry/index?continue=https://x",
    body: "<html><body>Our systems have detected unusual traffic</body></html>",
    status: 200,
  });

  assertEqual(verdict.verdict, PROBE_VERDICTS.UNKNOWN, "verdict");
  assertEqual(verdict.code, PROBE_CODES.PROBE_BLOCKED, "code");
});

case_("a plain HTTP error is unknown", () => {
  const verdict = classifyProviderProbe({
    finalUrl: "https://accounts.google.com/o/oauth2/v2/auth",
    body: "<html><body>Service Unavailable</body></html>",
    status: 503,
  });

  assertEqual(verdict.verdict, PROBE_VERDICTS.UNKNOWN, "verdict");
  assertEqual(verdict.code, PROBE_CODES.HTTP_ERROR, "code");
});

case_("the mismatch code is found even when the body does not carry it", () => {
  // The code also lives in the URL's base64url authError parameter, which is
  // the second independent signal. Verified against the live page, where the
  // marker sits near the very end of an ~800 KB document.
  assertTrue(
    decodeAuthErrorHint(MISMATCH_FIXTURE.finalUrl).includes(
      "redirect_uri_mismatch"
    ),
    "authError decodes to the code"
  );

  const verdict = classifyProviderProbe({
    finalUrl: MISMATCH_FIXTURE.finalUrl,
    body: "",
    status: 200,
  });

  assertEqual(
    verdict.verdict,
    PROBE_VERDICTS.MISMATCH,
    "verdict from the URL alone"
  );

  assertEqual(decodeAuthErrorHint("not a url"), "", "unparsable");
  assertEqual(decodeAuthErrorHint(""), "", "empty");
});

case_("a marker late in the body is still found", () => {
  // The real Google page carries the marker at byte ~760,000 of ~800,000. Any
  // cap below that would silently turn a failing check into a passing one.
  const verdict = classifyProviderProbe({
    finalUrl: "https://accounts.google.com/signin/oauth/error",
    body:
      "x".repeat(300000) + "Error 400: redirect_uri_mismatch",
    status: 200,
  });

  assertEqual(
    verdict.verdict,
    PROBE_VERDICTS.MISMATCH,
    "verdict"
  );

  assertTrue(
    MAX_BODY_BYTES > 800490,
    "the safety cap must stay above the observed page size"
  );
});

/* =====================
   H — PROBE SUPPORT AND MESSAGES
===================== */

console.log("-- probe support and messages --");

case_("only google gets an automatic verdict", () => {
  assertTrue(probeSupportFor("google").supported, "google");
  assertFalse(probeSupportFor("microsoft").supported, "microsoft");
  assertFalse(probeSupportFor("github").supported, "github");
  assertFalse(probeSupportFor("").supported, "empty");
  assertFalse(probeSupportFor(null).supported, "null");

  assertTrue(
    probeSupportFor("microsoft").reason.includes("sign-in page"),
    "microsoft reason must explain why"
  );

  assertTrue(
    probeSupportFor("github").reason.includes("sign-in page"),
    "github reason must explain why"
  );
});

case_("a mismatch message names the exact URI to register", () => {
  const uri = "http://localhost:5000/api/auth/google/callback";

  const message = diagnosisMessage({
    provider: "google",
    verdict: PROBE_VERDICTS.MISMATCH,
    redirectUri: uri,
    code: PROBE_CODES.MISMATCH,
  });

  assertTrue(message.includes(uri), "must name the URI");
  assertTrue(
    message.includes("Google Cloud Console"),
    "must name the console"
  );
});

case_("an accepted message does not tell anyone to register anything", () => {
  const message = diagnosisMessage({
    provider: "google",
    verdict: PROBE_VERDICTS.ACCEPTED,
    redirectUri: "http://localhost:5000/api/auth/google/callback",
    code: PROBE_CODES.CONSENT_PAGE,
  });

  assertFalse(message.includes("Register"), "no registration advice");
});

case_("every verdict has its own message", () => {
  const messages = Object.values(PROBE_VERDICTS).map((verdict) =>
    diagnosisMessage({
      provider: "google",
      verdict,
      redirectUri: "http://localhost:5000/api/auth/google/callback",
      code: verdict,
    })
  );

  assertEqual(
    new Set(messages).size,
    Object.values(PROBE_VERDICTS).length,
    "one message per verdict"
  );
});

case_("with no redirect URI the message claims nothing about a URI", () => {
  const message = diagnosisMessage({
    provider: "google",
    verdict: PROBE_VERDICTS.UNKNOWN,
    redirectUri: null,
    code: PROBE_CODES.NO_REDIRECT_URI,
  });

  assertTrue(message.includes("SERVER_URL"), "says what to configure");
  assertFalse(message.includes("http"), "no URI is invented");
  assertFalse(message.includes("null"), "no placeholder leaks through");
  assertFalse(message.includes("undefined"), "no placeholder leaks through");
});

/* =====================
   I — PROBE URL BUILDER
===================== */

console.log("-- probe url builder --");

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";

case_("the probe URL is the constant endpoint plus the two known values", () => {
  const built = buildProbeUrl({
    authUrl: GOOGLE_AUTH_URL,
    clientId: "client-123",
    redirectUri: "http://localhost:5000/api/auth/google/callback",
    state: "throwaway",
  });

  const url = new URL(built);

  assertEqual(url.origin, "https://accounts.google.com", "origin");
  assertEqual(url.pathname, "/o/oauth2/v2/auth", "path");
  assertEqual(url.searchParams.get("client_id"), "client-123", "client");
  assertEqual(
    url.searchParams.get("redirect_uri"),
    "http://localhost:5000/api/auth/google/callback",
    "redirect uri"
  );

  assertEqual(url.searchParams.get("response_type"), "code", "response");
  assertEqual(url.searchParams.get("scope"), "openid email profile", "scope");
  assertEqual(url.searchParams.get("state"), "throwaway", "state");
});

case_("a crafted redirect URI cannot add or replace a probe parameter", () => {
  // The redirect URI is computed from an allowlist, but the builder must not
  // depend on that: query syntax inside it is encoded, not interpreted.
  const built = buildProbeUrl({
    authUrl: GOOGLE_AUTH_URL,
    clientId: "client-123",
    redirectUri:
      "http://localhost:5000/api/auth/google/callback" +
      "&client_id=attacker&scope=openid&state=attacker",
    state: "throwaway",
  });

  const url = new URL(built);

  assertEqual(
    url.searchParams.getAll("client_id"),
    ["client-123"],
    "client_id is not duplicated"
  );

  assertEqual(url.searchParams.get("state"), "throwaway", "state is ours");
  assertEqual(
    url.searchParams.get("scope"),
    "openid email profile",
    "scope is ours"
  );

  assertEqual(url.origin, "https://accounts.google.com", "origin");
});

case_("the probe sends no credential", () => {
  const built = buildProbeUrl({
    authUrl: GOOGLE_AUTH_URL,
    clientId: "client-123",
    redirectUri: "http://localhost:5000/api/auth/google/callback",
    state: "throwaway",
  });

  const keys = [...new URL(built).searchParams.keys()].sort();

  assertEqual(
    keys,
    [
      "client_id",
      "redirect_uri",
      "response_type",
      "scope",
      "state",
    ],
    "exactly five parameters, no secret"
  );
});

/* =====================
   J — RATE LIMITER
===================== */

console.log("-- rate limiter --");

case_("the limiter allows the burst it is configured for, then blocks", () => {
  const limiter = createRateLimiter({ limit: 3, windowMs: 1000 });

  assertTrue(limiter.check("a").allowed, "first");
  assertTrue(limiter.check("a").allowed, "second");
  assertTrue(limiter.check("a").allowed, "third");

  const blocked = limiter.check("a");

  assertFalse(blocked.allowed, "fourth");
  assertEqual(blocked.remaining, 0, "remaining");
  assertTrue(blocked.retryAfterMs > 0, "retry hint");
});

case_("the limiter is per key", () => {
  const limiter = createRateLimiter({ limit: 1, windowMs: 1000 });

  assertTrue(limiter.check("a").allowed, "a");
  assertFalse(limiter.check("a").allowed, "a again");
  assertTrue(limiter.check("b").allowed, "b is unaffected");
});

case_("a new window restores the allowance", () => {
  let time = 0;

  const limiter = createRateLimiter({
    limit: 1,
    windowMs: 1000,
    now: () => time,
  });

  assertTrue(limiter.check("a").allowed, "first window");

  time = 500;

  assertFalse(limiter.check("a").allowed, "still inside the window");

  time = 1001;

  assertTrue(limiter.check("a").allowed, "window has rolled over");
});

case_("the limiter map stays bounded when keys are varied", () => {
  const limiter = createRateLimiter({
    limit: 5,
    windowMs: 60000,
    maxKeys: 4,
  });

  for (let index = 0; index < 50; index += 1) {
    limiter.check(`caller-${index}`);
  }

  assertTrue(limiter.size() <= 4, `size is bounded (${limiter.size()})`);
});

/* =====================
   K — STRUCTURAL: THE COOKIE IS CLEARED AFTER THE CHECK
===================== */

console.log("-- callback ordering --");

case_("the callback validates the state before clearing the cookie", () => {
  // The clearing step is Express code and cannot be exercised without a
  // server, so the ordering requirement is asserted against the source: inside
  // oauthCallback the state check must appear before the Set-Cookie write.
  const serverPath = path.join(utilsDir, "..", "server.js");

  const source = fs.readFileSync(serverPath, "utf8");

  const start = source.indexOf("const oauthCallback =");

  assertTrue(start !== -1, "oauthCallback must exist");

  const end = source.indexOf('app.get("/api/auth/google"', start);

  assertTrue(end > start, "oauthCallback must end before the routes");

  const callbackBody = source.slice(start, end);

  const checkAt = callbackBody.indexOf("validateOAuthState(");
  const clearAt = callbackBody.indexOf('"Set-Cookie"');

  assertTrue(checkAt !== -1, "the callback must run the state check");
  assertTrue(clearAt !== -1, "the callback must clear the cookie");

  assertTrue(
    checkAt < clearAt,
    "the state check must come before the cookie is cleared"
  );

  assertFalse(
    callbackBody.includes("oauth_state="),
    "the callback must not hardcode the shared cookie name"
  );
});

case_("the callback returns before clearing when the state check fails", () => {
  const serverPath = path.join(utilsDir, "..", "server.js");

  const source = fs.readFileSync(serverPath, "utf8");

  const start = source.indexOf("const oauthCallback =");
  const end = source.indexOf('app.get("/api/auth/google"', start);
  const callbackBody = source.slice(start, end);

  const checkAt = callbackBody.indexOf("validateOAuthState(");
  const guardAt = callbackBody.indexOf("if (!stateCheck.ok)");

  assertTrue(guardAt !== -1, "failures must be guarded");
  assertTrue(
    checkAt < guardAt,
    "the guard follows the check"
  );

  // Searched from the guard, because the callback has earlier failure returns
  // (an unconfigured provider) that legitimately sit above the state check.
  const returnAt = callbackBody.indexOf(
    "return redirectOAuthError",
    guardAt
  );

  assertTrue(returnAt > guardAt, "a failed check returns instead of continuing");
  assertTrue(
    returnAt < callbackBody.indexOf('"Set-Cookie"'),
    "a failed check never reaches the clearing step"
  );
});

/* =====================
   RESULT
===================== */

console.log("");
console.log("================================");
console.log(`${passed} passed, ${failed} failed`);
console.log("");

if (failed > 0) {
  process.exit(1);
}

process.exit(0);
