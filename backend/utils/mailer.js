const nodemailer = require("nodemailer");

const smtpConfigured = () =>
  !!(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
  );

// Returns true when mail was actually sent.
// Without SMTP env vars the OTP is logged to
// the server console and returned to the caller
// (dev mode) so the flow stays testable.

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

    return false;
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

  await transporter.sendMail({
    from:
      process.env.SMTP_FROM ||
      `BrainRace <${process.env.SMTP_USER}>`,
    to: email,
    subject,
    text,
  });

  return true;
};

module.exports = { sendOtpEmail, smtpConfigured };
