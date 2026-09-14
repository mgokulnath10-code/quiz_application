// Environment-aware OAuth origin resolution.
//
// The bug this replaces: `callbackUrl()` preferred process.env.SERVER_URL
// unconditionally, so a sign-in started on a local frontend sent Google a
// redirect_uri pointing at the deployed Render host. Google answered
// `redirect_uri_mismatch` because that URI was never registered for the
// client. The redirect target must follow the environment the browser is
// actually talking to.
//
// This module is deliberately pure — no Express, no Mongoose — so the
// decision table can be verified without a database or a server. The caller
// passes the request's own origin (`protocol` + `host`) plus the environment
// it should be judged against.
//
// Security rule: the request origin is trusted only when it appears in the
// explicit allowlist. A forged `Host` header therefore cannot redirect the
// OAuth flow anywhere, and no query parameter ever influences the result.
//
// CommonJS on purpose: the backend is CommonJS and scripts/*.mjs loads this
// through createRequire for the dependency-free self-check.

const DEFAULT_PORT = 5000;

const OAUTH_PROVIDERS = ["google", "microsoft", "github"];

// Origins never carry a trailing slash in an OAuth redirect_uri. Stripping
// it here means a copy-pasted `https://host/` in an env file still matches
// the request origin and still produces a registrable URI.
const stripTrailingSlashes = (value) =>
  String(value == null ? "" : value)
    .trim()
    .replace(/\/+$/, "");

// A usable origin is scheme + host (+ optional port) and nothing else. A
// typo, a pasted URL with a path, or a stray word is dropped rather than
// becoming an entry that could match a crafted request.
const isHttpOrigin = (value) =>
  /^https?:\/\/[^\s/?#]+$/i.test(stripTrailingSlashes(value));

const cleanOrigin = (value) => {
  const candidate = stripTrailingSlashes(value);

  return isHttpOrigin(candidate) ? candidate : "";
};

// Comma-separated list. Blank and malformed entries are dropped rather than
// becoming an empty or unvalidatable origin.
const parseOriginList = (value) => {
  if (typeof value !== "string") return [];

  return value
    .split(",")
    .map(cleanOrigin)
    .filter(Boolean);
};

const dedupe = (values) => [...new Set(values.filter(Boolean))];

// Only used to explain the allowlist in diagnostics; never used to grant
// access on its own.
const isLoopbackOrigin = (origin) =>
  /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(
    stripTrailingSlashes(origin)
  );

// The full set of origins the OAuth flow may ever use. `FRONTEND_URL` is
// included because a server with no SERVER_URL legitimately falls back to it,
// but it is not offered as a callback candidate unless it is actually used.
const buildOAuthAllowlist = ({ env = {}, nodeEnv } = {}) => {
  const resolvedNodeEnv = nodeEnv || env.NODE_ENV || "development";

  const origins = [
    ...parseOriginList(env.OAUTH_ALLOWED_ORIGINS),
    cleanOrigin(env.SERVER_URL),
    cleanOrigin(env.FRONTEND_URL),
  ];

  // Loopback origins exist only so local development works without any
  // configuration. In production a request for localhost must not be
  // honoured.
  if (resolvedNodeEnv !== "production") {
    const port = String(env.PORT || DEFAULT_PORT);

    origins.push(
      `http://localhost:${port}`,
      `http://127.0.0.1:${port}`
    );
  }

  return dedupe(origins);
};

// The origin used for `redirect_uri` and for the token exchange. Both must be
// byte-identical or the provider rejects the exchange.
const resolveApiOrigin = ({
  requestOrigin,
  allowlist,
  serverUrl,
  frontendUrl,
}) => {
  const candidate = cleanOrigin(requestOrigin);

  if (candidate && allowlist.includes(candidate)) {
    return candidate;
  }

  // Explicit deployment configuration wins once the request origin is not
  // allowlisted. This is the production path.
  return cleanOrigin(serverUrl) || cleanOrigin(frontendUrl) || null;
};

// The origin the SPA is sent back to after a successful sign-in. The
// configured FRONTEND_URL is the authority when present, because the API host
// and the SPA host are different origins in every real deployment (and the
// frontend dev server listens on a different port locally). The request
// origin is only a fallback, and only when allowlisted.
const resolveFrontendOrigin = ({
  requestOrigin,
  allowlist,
  frontendUrl,
  serverUrl,
}) => {
  const configured = cleanOrigin(frontendUrl);

  if (configured && allowlist.includes(configured)) {
    return configured;
  }

  const candidate = cleanOrigin(requestOrigin);

  if (candidate && allowlist.includes(candidate)) {
    return candidate;
  }

  return cleanOrigin(serverUrl) || null;
};

const callbackUriFor = (origin, providerName) => {
  const base = cleanOrigin(origin);

  if (!base) return null;

  return `${base}/api/auth/${providerName}/callback`;
};

// Origins that could legitimately receive a provider callback for this
// server. FRONTEND_URL is only included when it is the fallback actually in
// use, so the diagnostics never suggest registering a frontend host.
const candidateApiOrigins = ({ env = {}, nodeEnv, requestOrigin } = {}) => {
  const resolvedNodeEnv = nodeEnv || env.NODE_ENV || "development";
  const allowlist = buildOAuthAllowlist({ env, nodeEnv: resolvedNodeEnv });

  const apiOrigin = resolveApiOrigin({
    requestOrigin,
    allowlist,
    serverUrl: env.SERVER_URL,
    frontendUrl: env.FRONTEND_URL,
  });

  const loopbacks =
    resolvedNodeEnv !== "production"
      ? [
          `http://localhost:${String(env.PORT || DEFAULT_PORT)}`,
          `http://127.0.0.1:${String(env.PORT || DEFAULT_PORT)}`,
        ]
      : [];

  return dedupe([
    apiOrigin,
    cleanOrigin(env.SERVER_URL),
    ...parseOriginList(env.OAUTH_ALLOWED_ORIGINS),
    ...loopbacks,
  ]);
};

const resolveOAuthOrigins = ({ requestOrigin, env = {}, nodeEnv } = {}) => {
  const resolvedNodeEnv = nodeEnv || env.NODE_ENV || "development";

  const allowlist = buildOAuthAllowlist({
    env,
    nodeEnv: resolvedNodeEnv,
  });

  const apiOrigin = resolveApiOrigin({
    requestOrigin,
    allowlist,
    serverUrl: env.SERVER_URL,
    frontendUrl: env.FRONTEND_URL,
  });

  const frontendOrigin = resolveFrontendOrigin({
    requestOrigin,
    allowlist,
    frontendUrl: env.FRONTEND_URL,
    serverUrl: env.SERVER_URL,
  });

  const candidates = candidateApiOrigins({
    env,
    nodeEnv: resolvedNodeEnv,
    requestOrigin,
  });

  const redirectUris = {};

  OAUTH_PROVIDERS.forEach((provider) => {
    redirectUris[provider] = candidates
      .map((origin) => callbackUriFor(origin, provider))
      .filter(Boolean);
  });

  return {
    nodeEnv: resolvedNodeEnv,
    isProduction: resolvedNodeEnv === "production",
    allowlist,
    apiOrigin,
    frontendOrigin,
    candidateApiOrigins: candidates,
    redirectUris,
  };
};

module.exports = {
  DEFAULT_PORT,
  OAUTH_PROVIDERS,
  stripTrailingSlashes,
  isHttpOrigin,
  cleanOrigin,
  parseOriginList,
  isLoopbackOrigin,
  buildOAuthAllowlist,
  resolveApiOrigin,
  resolveFrontendOrigin,
  callbackUriFor,
  candidateApiOrigins,
  resolveOAuthOrigins,
};
