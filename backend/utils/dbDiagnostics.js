// Pure, dependency-free helpers for reporting on the MongoDB connection
// without ever exposing a credential.
//
// No mongoose, no I/O: every function takes plain strings so the masking
// rules can be self-checked (see scripts/selfcheckDb.mjs). The server must be
// able to publish "what database am I pointed at" to an operator it does not
// trust with the password, so masking here is the only thing standing between
// an error message and a leaked connection string.

const MONGODB_URI_PATTERN = /mongodb(\+srv)?:\/\/[^\s"'<>]+/gi;

const REDACTED = "[redacted]";

const READY_STATE_LABELS = {
  0: "disconnected",
  1: "connected",
  2: "connecting",
  3: "disconnecting",
  99: "uninitialized",
};

// Human label for mongoose.connection.readyState.
const readyStateLabel = (state) =>
  READY_STATE_LABELS[state] || "unknown";

// The first "/", "?" or "#" after the authority marks the end of the host
// section. Splitting here — before looking for "@" — is what keeps a password
// that legally contains "@" or ":" from being mistaken for a host separator.
const firstDelimiterIndex = (value) => {
  let end = value.length;

  ["/", "?", "#"].forEach((delimiter) => {
    const index = value.indexOf(delimiter);

    if (index !== -1 && index < end) end = index;
  });

  return end;
};

// Parses the non-secret shape of a connection string:
//   { scheme, hosts: [...], database, hadCredentials, target }
// `target` is the masked, credential-free summary safe to publish.
const describeMongoTarget = (uri) => {
  const empty = {
    scheme: null,
    hosts: [],
    database: null,
    hadCredentials: false,
    target: "",
  };

  const match = /^(mongodb(?:\+srv)?):\/\/(.*)$/i.exec(String(uri || "").trim());

  if (!match) return empty;

  const scheme = match[1].toLowerCase();
  const rest = match[2];

  const authority = rest.slice(0, firstDelimiterIndex(rest));
  const tail = rest.slice(authority.length);

  // The host section starts after the LAST "@" in the authority. A password
  // containing "@" leaves earlier "@" characters inside the credentials, so
  // only the final one separates credentials from hosts.
  const at = authority.lastIndexOf("@");
  const hadCredentials = at !== -1;
  const hostSection = hadCredentials
    ? authority.slice(at + 1)
    : authority;

  const hosts = hostSection
    .split(",")
    .map((host) => host.trim())
    .filter(Boolean);

  // Drop the query string entirely: options such as authSource are not
  // secrets, but there is no diagnostic value in echoing them and no need to
  // widen what leaves the server.
  const pathPart = tail.split("?")[0].replace(/^\/+/, "");
  const database = pathPart ? decodeURIComponentSafe(pathPart) : null;

  const target = `${scheme}://${hosts.join(",")}${
    database ? `/${database}` : ""
  }`;

  return { scheme, hosts, database, hadCredentials, target };
};

const decodeURIComponentSafe = (value) => {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
};

// Credential-masked connection target: scheme + host names (+ database), with
// any userinfo removed. Safe to log or return in a public health response.
const maskMongoTarget = (uri) => describeMongoTarget(uri).target;

// The password embedded in a URI, both percent-encoded and decoded, so it can
// be scrubbed wherever it turns up. Returns [] when there is nothing to hide.
const passwordsInUri = (uri) => {
  const match = /^(?:mongodb(?:\+srv)?):\/\/(.*)$/i.exec(String(uri || "").trim());

  if (!match) return [];

  const authority = match[1].slice(0, firstDelimiterIndex(match[1]));
  const at = authority.lastIndexOf("@");

  if (at === -1) return [];

  const userinfo = authority.slice(0, at);
  const colon = userinfo.indexOf(":");

  if (colon === -1) return [];

  const encoded = userinfo.slice(colon + 1);

  if (!encoded) return [];

  const decoded = decodeURIComponentSafe(encoded);

  return encoded === decoded ? [encoded] : [encoded, decoded];
};

// Turns any error into a short, credential-free reason string. URIs found in
// the text are masked, and known secrets (an explicit password, or the
// password inside the supplied URI) are replaced wherever they appear.
const sanitizeDbError = (error, { uri, password } = {}) => {
  let text = "";

  if (error === null || error === undefined) return "";

  if (typeof error === "string") {
    text = error;
  } else {
    text = error.message || String(error);
  }

  const secrets = new Set();

  if (password) secrets.add(String(password));

  passwordsInUri(uri).forEach((secret) => secrets.add(secret));

  text = text.replace(
    MONGODB_URI_PATTERN,
    (found) => maskMongoTarget(found) || REDACTED
  );

  // Longest first, so a password that contains another secret is removed
  // before the shorter one can split it.
  [...secrets]
    .sort((a, b) => b.length - a.length)
    .forEach((secret) => {
      if (secret) text = text.split(secret).join(REDACTED);
    });

  // Last resort: any remaining user:pass@ pair in a URL-shaped string.
  text = text.replace(
    /:\/\/([^/\s:@]+):([^/\s@]+)@/g,
    `://${REDACTED}@`
  );

  return text.trim().slice(0, 500);
};

module.exports = {
  maskMongoTarget,
  describeMongoTarget,
  sanitizeDbError,
  readyStateLabel,
};
