// Provider redirect-URI diagnosis.
//
// The problem this solves: `redirect_uri_mismatch` is invisible until a user is
// bounced to the provider, and the provider's reply then lands on the provider's
// own error page — not on ours. This module answers "will the provider accept
// the redirect URI we send?" by asking the provider directly, before any user is
// involved, and by classifying the answer.
//
// The technique was verified against the live endpoints while writing this:
//
//   Google, registered client_id + unregistered redirect_uri
//     status 200, final URL https://accounts.google.com/signin/oauth/error?...
//     body: "Error 400: redirect_uri_mismatch" / "Access blocked: ..."
//
//   Google, registered client_id + registered redirect_uri
//     status 200, final URL
//     https://accounts.google.com/v3/signin/identifier?...&client_id=...&
//     redirect_uri=...&continue=...%2Fsignin%2Foauth%2Flegacy%2Fconsent...
//     body: "Sign in with Google" / "Email or phone"
//
//   Google, unknown client_id
//     status 200, final URL .../signin/oauth/error?...
//     body: "Error 401: invalid_client" / "The OAuth client was not found."
//
//   Microsoft, unknown client_id (GUID shaped)
//     status 200, final URL unchanged, body: the normal "Sign in to your
//     account" page — no error at all.
//
//   GitHub, unknown client_id
//     status 200, final URL https://github.com/login?client_id=...&return_to=...
//     it simply redirects to its own sign-in page.
//
// The Microsoft and GitHub observations are why neither provider gets an
// automatic verdict: both answer with their ordinary sign-in page, so a probe
// cannot tell "accepted" apart from "rejected" and would report a reassuring
// false result. `probeSupportFor` says so instead.
//
// IMPORTANT: Google's error page is ~800 KB of HTML and the
// `redirect_uri_mismatch` marker was measured at byte ~760,000 — near the very
// end. Never truncate the body before classifying it: a 200 KB cap would look
// like a passing check. The readable code is also present in the final URL's
// base64url `authError` parameter, which `decodeAuthErrorHint` reads as a second
// independent signal.
//
// CommonJS and dependency-free (only Node built-ins) so
// scripts/selfcheckOauth.mjs can load it through createRequire.

const PROBE_SCOPE = "openid email profile";

// Hard safety cap only. It sits far above the ~800 KB observed, so it can never
// hide the marker described above; it exists to bound memory on a hostile reply.
const MAX_BODY_BYTES = 4 * 1024 * 1024;

const PROBE_VERDICTS = {
  ACCEPTED: "accepted",
  MISMATCH: "redirect_uri_mismatch",
  INVALID_CLIENT: "invalid_client",
  NOT_CONFIGURED: "not_configured",
  UNKNOWN: "unknown",
};

const PROBE_CODES = {
  EMPTY_RESPONSE: "empty_response",
  PROBE_BLOCKED: "probe_blocked",
  MISMATCH: "redirect_uri_mismatch",
  INVALID_CLIENT: "invalid_client",
  PROVIDER_ERROR_PAGE: "provider_error_page",
  HTTP_ERROR: "http_error",
  CONSENT_PAGE: "consent_page",
  UNRECOGNISED_RESPONSE: "unrecognised_response",
  PROBE_TIMEOUT: "probe_timeout",
  PROBE_FAILED: "probe_failed",
  PROBE_NOT_SUPPORTED: "probe_not_supported",
  NO_REDIRECT_URI: "no_redirect_uri",
  NOT_CONFIGURED: "not_configured",
  RATE_LIMITED: "rate_limited",
};

// Google's own error wording. They appear in the body, and the code also
// appears in the final URL once `authError` is decoded.
const MISMATCH_MARKERS = ["redirect_uri_mismatch"];
const INVALID_CLIENT_MARKERS = ["invalid_client"];

// Any of these mean "Google served its OAuth error page", whatever the code.
const ERROR_PAGE_URL_MARKERS = ["/signin/oauth/error"];
const ERROR_PAGE_BODY_MARKERS = ["access blocked"];

// Positive evidence of a real sign-in or consent page. Requiring positive
// evidence, rather than treating "no error seen" as success, is what keeps an
// interstitial or a captcha page from being reported as a pass.
const ACCEPTED_URL_MARKERS = [
  "/signin/identifier",
  "/signin/v2/identifier",
  "/signin/oauth/consent",
  "/signin/oauth/legacy/consent",
  "/oauth2/consent",
];

const ACCEPTED_BODY_MARKERS = [
  "sign in with google",
  "sign in to continue to",
  "choose an account",
  "use your google account",
];

// Google answers automated traffic with an interstitial that has no error
// markers in it, which would otherwise read as a pass.
const BLOCKED_URL_MARKERS = ["/sorry/"];
const BLOCKED_BODY_MARKERS = ["unusual traffic"];

// Google puts the plaintext error code inside a base64url `authError`
// parameter on the final URL. Decoding it gives an independent read on the
// rejection that does not depend on where the marker sits in the body.
const decodeAuthErrorHint = (finalUrl) => {
  const raw = String(finalUrl || "");

  if (!raw) return "";

  try {
    const value = new URL(raw).searchParams.get("authError");

    if (!value) return "";

    return Buffer.from(
      value.replace(/-/g, "+").replace(/_/g, "/"),
      "base64"
    ).toString("latin1");
  } catch {
    return "";
  }
};

// Classifies one probe response. Pure and synchronous, so the decision table is
// testable from fixtures without network access.
//
// Returns { verdict, code, evidence }. `verdict` is one of PROBE_VERDICTS;
// `code` names which rule fired; `evidence` is the marker (or the empty case)
// that drove it, kept for the self-check output and for support questions.
const classifyProviderProbe = ({ finalUrl, body, status } = {}) => {
  const url = String(finalUrl == null ? "" : finalUrl);
  const text = String(body == null ? "" : body).slice(0, MAX_BODY_BYTES);
  const hint = decodeAuthErrorHint(url);
  const apiStatus = Number.isFinite(Number(status)) ? Number(status) : 0;

  const urlLower = url.toLowerCase();
  const searchable = `${text}\n${hint}`.toLowerCase();

  if (!url && !text.trim()) {
    return {
      verdict: PROBE_VERDICTS.UNKNOWN,
      code: PROBE_CODES.EMPTY_RESPONSE,
      evidence: "",
    };
  }

  const blockedMarker = [
    ...BLOCKED_URL_MARKERS,
    ...BLOCKED_BODY_MARKERS,
  ].find(
    (marker) =>
      urlLower.includes(marker) || searchable.includes(marker)
  );

  if (blockedMarker) {
    return {
      verdict: PROBE_VERDICTS.UNKNOWN,
      code: PROBE_CODES.PROBE_BLOCKED,
      evidence: blockedMarker,
    };
  }

  // Checked before `invalid_client`: both are Google error pages, and only one
  // of the two phrases is ever present.
  const mismatchMarker = MISMATCH_MARKERS.find((marker) =>
    searchable.includes(marker)
  );

  if (mismatchMarker) {
    return {
      verdict: PROBE_VERDICTS.MISMATCH,
      code: PROBE_CODES.MISMATCH,
      evidence: mismatchMarker,
    };
  }

  const invalidClientMarker = INVALID_CLIENT_MARKERS.find((marker) =>
    searchable.includes(marker)
  );

  if (invalidClientMarker) {
    return {
      verdict: PROBE_VERDICTS.INVALID_CLIENT,
      code: PROBE_CODES.INVALID_CLIENT,
      evidence: invalidClientMarker,
    };
  }

  // An error page with a code we do not recognise is reported as unknown
  // rather than as a pass.
  const errorPageMarker = [
    ...ERROR_PAGE_URL_MARKERS,
    ...ERROR_PAGE_BODY_MARKERS,
  ].find(
    (marker) => urlLower.includes(marker) || searchable.includes(marker)
  );

  if (errorPageMarker) {
    return {
      verdict: PROBE_VERDICTS.UNKNOWN,
      code: PROBE_CODES.PROVIDER_ERROR_PAGE,
      evidence: errorPageMarker,
    };
  }

  if (apiStatus >= 400) {
    return {
      verdict: PROBE_VERDICTS.UNKNOWN,
      code: PROBE_CODES.HTTP_ERROR,
      evidence: `status_${apiStatus}`,
    };
  }

  const acceptedMarker = [
    ...ACCEPTED_URL_MARKERS,
    ...ACCEPTED_BODY_MARKERS,
  ].find(
    (marker) =>
      urlLower.includes(marker) || searchable.includes(marker)
  );

  if (acceptedMarker) {
    return {
      verdict: PROBE_VERDICTS.ACCEPTED,
      code: PROBE_CODES.CONSENT_PAGE,
      evidence: acceptedMarker,
    };
  }

  return {
    verdict: PROBE_VERDICTS.UNKNOWN,
    code: PROBE_CODES.UNRECOGNISED_RESPONSE,
    evidence: "",
  };
};

const PROVIDER_LABEL = {
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
};

const providerLabel = (provider) =>
  PROVIDER_LABEL[provider] || String(provider || "The provider");

// Only Google's authorize endpoint was observed to reject an unregistered
// redirect_uri up front. Microsoft and GitHub both answer with their ordinary
// sign-in page, so no honest verdict can be derived from a probe.
const PROBE_SUPPORT = {
  google: {
    supported: true,
    reason: null,
  },
  microsoft: {
    supported: false,
    reason:
      "Microsoft shows its normal sign-in page even when the redirect URI is " +
      "not registered, so a probe cannot tell the two cases apart.",
  },
  github: {
    supported: false,
    reason:
      "GitHub redirects to its own sign-in page without validating the " +
      "redirect URI, so a probe cannot tell the two cases apart.",
  },
};

const probeSupportFor = (provider) => {
  const entry = PROBE_SUPPORT[String(provider || "").toLowerCase()];

  return entry || { supported: false, reason: "Unknown provider." };
};

const REGISTER_HINT = {
  google:
    "Register it in Google Cloud Console → APIs & Services → Credentials → " +
    "your OAuth 2.0 client → Authorized redirect URIs.",
  microsoft:
    "Register it in Microsoft Entra ID → App registrations → your app → " +
    "Authentication → Redirect URIs.",
  github:
    "Register it in GitHub → Settings → Developer settings → OAuth Apps → " +
    "your app → Authorization callback URL.",
};

// The human-readable half of the answer. Kept separate from the classifier so
// the classifier stays free of presentation and of the redirect URI.
const diagnosisMessage = ({
  provider,
  verdict,
  redirectUri,
  code,
  supportReason,
}) => {
  const label = providerLabel(provider);

  // Nothing to check, so nothing is claimed: no URI is printed rather than a
  // placeholder that could be mistaken for a real value.
  if (!redirectUri) {
    return (
      `${label} could not be checked because this server has no public ` +
      "origin, so no redirect URI could be resolved. Set SERVER_URL (or add " +
      "this server's origin to OAUTH_ALLOWED_ORIGINS) and run the check " +
      "again."
    );
  }

  switch (verdict) {
    case PROBE_VERDICTS.ACCEPTED:
      return (
        `${label} accepted ${redirectUri}. Sign-in can proceed from an ` +
        "address on this origin."
      );

    case PROBE_VERDICTS.MISMATCH:
      return (
        `${label} rejected ${redirectUri}. ${REGISTER_HINT[provider] || ""} ` +
        `This exact string must be present: ${redirectUri}`
      )
        .replace(/\s+/g, " ")
        .trim();

    case PROBE_VERDICTS.INVALID_CLIENT:
      return (
        `${label} did not recognise the client id, so the redirect URI could ` +
        `not be checked at all. Check the ${String(
          provider || ""
        ).toUpperCase()}_CLIENT_ID value, then run the check again.`
      );

    case PROBE_VERDICTS.NOT_CONFIGURED:
      return (
        `${label} sign-in is not configured on this server, so there is ` +
        `nothing to check. Set the ${String(
          provider || ""
        ).toUpperCase()}_CLIENT_ID and _CLIENT_SECRET values first.`
      );

    default:
      return (
        `No verdict was recorded for ${label} (${code || "unknown"}). ` +
        (supportReason ? `${supportReason} ` : "") +
        `Check this URI by hand: ${redirectUri}`
      );
  }
};

// Fixed-window limiter with an injected clock, so expiry is tested without
// waiting. `maxKeys` bounds the Map: keys are per-caller identifiers that a
// stranger can vary, so an unbounded Map would be its own small leak. When the
// key budget is exhausted with none of them expired, the map is emptied — that
// hands fresh allowance to whoever is in flight, which is the safe direction,
// and the global limiter is what actually caps outbound requests.
const createRateLimiter = ({
  limit = 8,
  windowMs = 60_000,
  maxKeys = 500,
  now = () => Date.now(),
} = {}) => {
  const hits = new Map();

  const prune = (time) => {
    hits.forEach((timestamps, key) => {
      const kept = timestamps.filter((at) => time - at < windowMs);

      if (kept.length === 0) {
        hits.delete(key);
      } else {
        hits.set(key, kept);
      }
    });
  };

  return {
    check(key) {
      const time = now();
      const id = String(key == null ? "unknown" : key);

      // Bounded before the insert, so the map can never exceed maxKeys.
      if (!hits.has(id) && hits.size >= maxKeys) {
        prune(time);

        if (hits.size >= maxKeys) hits.clear();
      }

      const timestamps = (hits.get(id) || []).filter(
        (at) => time - at < windowMs
      );

      if (timestamps.length >= limit) {
        const oldest = timestamps[0];

        return {
          allowed: false,
          remaining: 0,
          retryAfterMs: Math.max(windowMs - (time - oldest), 0),
        };
      }

      timestamps.push(time);
      hits.set(id, timestamps);

      return {
        allowed: true,
        remaining: limit - timestamps.length,
        retryAfterMs: 0,
      };
    },

    size() {
      return hits.size;
    },

    reset() {
      hits.clear();
    },
  };
};

// Builds the authorize URL used for the probe. Only three inputs are allowed:
// a hardcoded provider endpoint, the configured client id, and the computed
// redirect URI. Nothing from the request can reach this function, so a caller
// cannot aim the probe at another host.
const buildProbeUrl = ({ authUrl, clientId, redirectUri, state }) => {
  const url = new URL(authUrl);

  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", PROBE_SCOPE);
  // Throwaway: the probe never completes a flow, and a state value is required
  // for Google to answer normally rather than complaining about the request.
  url.searchParams.set("state", state);

  return url.toString();
};

module.exports = {
  PROBE_SCOPE,
  MAX_BODY_BYTES,
  PROBE_VERDICTS,
  PROBE_CODES,
  PROVIDER_LABEL,
  PROBE_SUPPORT,
  REGISTER_HINT,
  decodeAuthErrorHint,
  classifyProviderProbe,
  probeSupportFor,
  providerLabel,
  diagnosisMessage,
  createRateLimiter,
  buildProbeUrl,
};
