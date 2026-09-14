const nodemailer = require("nodemailer");

/* =====================
   TRANSPORT TIMEOUTS

   Render's free tier blocks outbound traffic to SMTP ports 25, 465 and 587,
   so an SMTP send from a free Render web service can never succeed. Without
   explicit timeouts nodemailer waits on its own multi-minute defaults and the
   request looks like it is hanging forever. These bounds turn a blocked or
   unreachable port into a fast, ordinary 503 EMAIL_SEND_FAILED.
===================== */

const SMTP_CONNECTION_TIMEOUT_MS = 6000;
const SMTP_GREETING_TIMEOUT_MS = 6000;
const SMTP_SOCKET_TIMEOUT_MS = 8000;

// Hard ceiling on one send attempt, whichever transport is used, so no code
// path can outlive this by much.
const SEND_DEADLINE_MS = 12000;

/* =====================
   HTTP TRANSPORTS

   Render blocks SMTP but not HTTPS, so production delivers over a provider's
   JSON-over-HTTPS API instead. The BASE_URL variables exist so a test can
   point the transport at a local stub; they default to the real endpoints and
   must never be set in production.
===================== */

const PROVIDERS = {
  resend: { defaultBaseUrl: "https://api.resend.com", path: "/emails" },
  brevo: {
    defaultBaseUrl: "https://api.brevo.com",
    path: "/v3/smtp/email",
  },
};

const HTTP_TRANSPORTS = ["resend", "brevo"];

const hasValue = (value) =>
  typeof value === "string" && value.trim() !== "";

/* =====================
   TRANSPORT SELECTION
===================== */

// True when every SMTP_* value the transporter needs is present.
const smtpConfigured = (env = process.env) =>
  !!(
    hasValue(env.SMTP_HOST) &&
    hasValue(env.SMTP_PORT) &&
    hasValue(env.SMTP_USER) &&
    hasValue(env.SMTP_PASS)
  );

const resendConfigured = (env = process.env) =>
  hasValue(env.RESEND_API_KEY);

const brevoConfigured = (env = process.env) =>
  hasValue(env.BREVO_API_KEY);

// Pure: reads only the passed env (defaults to process.env) and returns which
// transport a send would use right now.
//
// Precedence is deliberate and deterministic: an HTTP provider (which works on
// Render's free tier) wins over SMTP (which cannot). When both HTTP keys are
// present, Resend wins because it is checked first.
const chooseEmailTransport = (env = process.env) => {
  if (resendConfigured(env)) return "resend";
  if (brevoConfigured(env)) return "brevo";
  if (smtpConfigured(env)) return "smtp";
  return "none";
};

// Dev OTP is a deliberate opt-in: it must be enabled
// explicitly AND the server must not be running in
// production mode. Otherwise a code is never exposed
// through the API.
const devOtpAllowed = () =>
  process.env.ALLOW_DEV_OTP === "true" &&
  process.env.NODE_ENV !== "production";

// Typed delivery error so routes can map a failed send to
// a meaningful HTTP status instead of a generic 500.
class MailDeliveryError extends Error {
  constructor(message, code, status = 503) {
    super(message);

    this.name = "MailDeliveryError";
    this.code = code;
    this.status = status;
  }
}

/* =====================
   SENDER ADDRESS
===================== */

// "Name <user@host>" -> { name, email }; a bare address -> { email }.
// Pure, so the Brevo request shape can be asserted without any network call.
const parseAddress = (value) => {
  const raw = String(value || "").trim();

  const match = raw.match(/^(.*)<([^>]+)>\s*$/);

  if (match) {
    const name = match[1].trim().replace(/^"|"$/g, "");
    const email = match[2].trim();

    return name ? { name, email } : { email };
  }

  return { email: raw };
};

// The From address for a transport. EMAIL_FROM is the transport-agnostic
// variable to set on the host; SMTP_FROM and SMTP_USER are the existing
// SMTP-only fallbacks.
const resolveEmailFrom = (env = process.env, transport = "none") => {
  if (hasValue(env.EMAIL_FROM)) return env.EMAIL_FROM.trim();

  if (hasValue(env.SMTP_FROM)) return env.SMTP_FROM.trim();

  if (transport === "smtp" && hasValue(env.SMTP_USER)) {
    return `BrainRace <${env.SMTP_USER.trim()}>`;
  }

  return "BrainRace <no-reply@brainrace.invalid>";
};

/* =====================
   REQUEST BUILDING
===================== */

// The full HTTPS endpoint for a provider. `RESEND_BASE_URL` / `BREVO_BASE_URL`
// override the origin so a stub can capture the request; unset in production.
const endpointUrlFor = (transport, env = process.env) => {
  const provider = PROVIDERS[transport];

  if (!provider) return "";

  const override =
    transport === "resend" ? env.RESEND_BASE_URL : env.BREVO_BASE_URL;

  const base = hasValue(override)
    ? String(override).trim().replace(/\/+$/, "")
    : provider.defaultBaseUrl;

  return `${base}${provider.path}`;
};

// Pure description of the outbound HTTP request, or null for a non-HTTP
// transport. The send function below only performs the fetch; every field in
// the request comes from here, so it can be asserted in tests without
// touching the network.
const buildEmailRequest = (
  transport,
  env = process.env,
  message = {}
) => {
  if (!HTTP_TRANSPORTS.includes(transport)) return null;

  const to = String(message.to || "").trim();
  const subject = String(message.subject || "");
  const text = String(message.text || "");
  const from = resolveEmailFrom(env, transport);

  if (transport === "resend") {
    return {
      transport,
      url: endpointUrlFor("resend", env),
      method: "POST",
      headers: {
        Authorization: `Bearer ${String(env.RESEND_API_KEY).trim()}`,
        "Content-Type": "application/json",
      },
      body: { from, to: [to], subject, text },
    };
  }

  return {
    transport: "brevo",
    url: endpointUrlFor("brevo", env),
    method: "POST",
    headers: {
      "api-key": String(env.BREVO_API_KEY).trim(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: {
      sender: parseAddress(from),
      to: [{ email: to }],
      subject,
      textContent: text,
    },
  };
};

/* =====================
   SENDING
===================== */

// Rejects after `ms` even if the given promise never settles. The late
// rejection is swallowed so a timeout can never surface as an unhandled
// rejection, and `onTimeout` releases whatever the attempt was holding.
const withDeadline = (promise, ms, onTimeout) => {
  promise.catch(() => {});

  let timer;

  const timeout = new Promise((resolve, reject) => {
    timer = setTimeout(() => {
      if (onTimeout) onTimeout();

      reject(new Error(`Email send timed out after ${ms}ms`));
    }, ms);
  });

  return Promise.race([promise, timeout]).finally(() =>
    clearTimeout(timer)
  );
};

// The nodemailer options, built from the environment. Pure and exported so the
// bounded timeouts can be asserted without opening a socket.
const buildSmtpOptions = (env = process.env) => {
  const port = Number(env.SMTP_PORT);

  return {
    host: env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: {
      user: env.SMTP_USER,
      pass: env.SMTP_PASS,
    },
    connectionTimeout: SMTP_CONNECTION_TIMEOUT_MS,
    greetingTimeout: SMTP_GREETING_TIMEOUT_MS,
    socketTimeout: SMTP_SOCKET_TIMEOUT_MS,
  };
};

// SMTP delivery with bounded connection, greeting and socket timeouts plus an
// overall deadline. The transporter is closed on the way out so a blocked port
// cannot leave a socket half-open.
const sendViaSmtp = async (env, message) => {
  const transporter = nodemailer.createTransport(
    buildSmtpOptions(env)
  );

  try {
    return await withDeadline(
      transporter.sendMail({
        from: resolveEmailFrom(env, "smtp"),
        to: message.to,
        subject: message.subject,
        text: message.text,
      }),
      SEND_DEADLINE_MS,
      () => transporter.close()
    );
  } finally {
    transporter.close();
  }
};

// HTTPS delivery through a provider API. Non-2xx responses are turned into an
// Error so the caller maps them to the same MailDeliveryError shape as SMTP.
const sendViaHttp = async (transport, env, message) => {
  const request = buildEmailRequest(transport, env, message);

  const controller = new AbortController();

  const timer = setTimeout(
    () => controller.abort(),
    SEND_DEADLINE_MS
  );

  let response;

  try {
    response = await fetch(request.url, {
      method: request.method,
      headers: request.headers,
      body: JSON.stringify(request.body),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    const detail = await response.text().catch(() => "");

    throw new Error(
      `${transport} rejected the message with HTTP ${response.status}` +
        (detail ? `: ${detail.slice(0, 300)}` : "")
    );
  }

  return response;
};

// Sends the OTP email.
//   - resolves { delivered: true } when the mail was accepted
//   - resolves { delivered: false, reason: "not_configured" } when no
//     transport is configured (the caller decides if dev OTP applies)
//   - throws MailDeliveryError when a transport IS configured but the
//     send fails, so the API never reports a phantom success.
const sendOtpEmail = async (email, code, purpose) => {
  const subject =
    purpose === "register"
      ? "Verify your BrainRace account"
      : "Reset your BrainRace password";

  const text =
    `Your BrainRace verification code is:\n\n` +
    `  ${code}\n\n` +
    `It expires in 10 minutes. If you did not request this, ignore this email.`;

  const transport = chooseEmailTransport(process.env);

  if (transport === "none") {
    console.log(
      `[DEV MAIL] to=${email} purpose=${purpose} otp=${code} ` +
        `(set RESEND_API_KEY / BREVO_API_KEY, or SMTP_HOST/PORT/USER/PASS ` +
        `for local SMTP, to send real email)`
    );

    return { delivered: false, reason: "not_configured" };
  }

  try {
    // Resolved at send time, so the transport follows the environment rather
    // than being frozen when the module was first loaded.
    if (transport === "smtp") {
      await sendViaSmtp(process.env, { to: email, subject, text });
    } else {
      await sendViaHttp(transport, process.env, {
        to: email,
        subject,
        text,
      });
    }

    return { delivered: true };
  } catch (error) {
    // Log the real provider error so operators can
    // diagnose bad credentials / blocked ports.

    console.error(
      `[MAIL ERROR] transport=${transport} to=${email} ` +
        `purpose=${purpose}:`,
      (error && error.message) || error
    );

    throw new MailDeliveryError(
      "The server could not send the verification email. " +
        "Please try again shortly or contact the administrator.",
      "EMAIL_SEND_FAILED",
      503
    );
  }
};

module.exports = {
  sendOtpEmail,
  smtpConfigured,
  resendConfigured,
  brevoConfigured,
  chooseEmailTransport,
  resolveEmailFrom,
  parseAddress,
  buildEmailRequest,
  buildSmtpOptions,
  devOtpAllowed,
  MailDeliveryError,
  SEND_DEADLINE_MS,
  SMTP_CONNECTION_TIMEOUT_MS,
  SMTP_GREETING_TIMEOUT_MS,
  SMTP_SOCKET_TIMEOUT_MS,
};
