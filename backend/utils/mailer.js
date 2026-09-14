const nodemailer = require("nodemailer");

// True when every SMTP_* value the transporter needs is present.
const smtpConfigured = () =>
  !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

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

// Sends the OTP email.
//   - resolves { delivered: true } when the mail was accepted
//   - resolves { delivered: false, reason: "not_configured" } when
//     SMTP is absent (the caller decides if dev OTP applies)
//   - throws MailDeliveryError when SMTP IS configured but the
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

  if (!smtpConfigured()) {
    console.log(
      `[DEV MAIL] to=${email} purpose=${purpose} otp=${code} ` +
        `(set SMTP_HOST/PORT/USER/PASS to send real email)`
    );

    return { delivered: false, reason: "not_configured" };
  }

  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  try {
    await transporter.sendMail({
      from:
        process.env.SMTP_FROM ||
        `BrainRace <${process.env.SMTP_USER}>`,
      to: email,
      subject,
      text,
    });

    return { delivered: true };
  } catch (error) {
    // Log the real provider error so operators can
    // diagnose bad credentials / blocked ports.

    console.error(
      `[MAIL ERROR] to=${email} purpose=${purpose}:`,
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
  devOtpAllowed,
  MailDeliveryError,
};
