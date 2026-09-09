import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { FiZap, FiArrowLeft } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

function ForgotPassword() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1); // 1 email, 2 OTP, 3 new password

  const [email, setEmail] = useState("");
  const [otp, setOtp] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [info, setInfo] = useState("");
  const [devCode, setDevCode] = useState("");

  // Step 1 — request the reset code. The server
  // answers the same whether or not the email
  // exists, so we simply continue to the OTP step.

  const requestCode = async () => {
    if (!email) {
      alert("Enter your email.");
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(
        `${API}/api/forgot-password`,
        { email }
      );

      setInfo(res.data.message);

      setDevCode(res.data.devCode || "");

      setStep(2);
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Could not send the code."
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 2 — validate the code (not consumed yet).

  const verifyCode = async () => {
    if (otp.length !== 6) {
      alert("Enter the 6-digit code.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/api/verify-otp`, {
        email,
        otp,
        purpose: "reset",
      });

      setStep(3);
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Incorrect or expired code."
      );
    } finally {
      setLoading(false);
    }
  };

  // Step 3 — set the new password (consumes the code).

  const resetPassword = async () => {
    if (newPassword.length < 6) {
      alert("Password must be at least 6 characters.");
      return;
    }

    if (newPassword !== confirmPassword) {
      alert("Passwords do not match.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/api/reset-password`, {
        email,
        otp,
        newPassword,
      });

      alert("Password updated. Please log in.");

      navigate("/login");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Could not reset the password."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-card">

        <Link to="/" className="auth-brand">
          <span className="brand-mark">
            <FiZap />
          </span>

          <span className="brand-name">
            BrainRace
          </span>
        </Link>

        <h1 className="auth-title">
          Reset your password
        </h1>

        <p className="auth-subtitle">
          {step === 1 && "We'll email you a 6-digit code."}
          {step === 2 && `Enter the code sent to ${email}.`}
          {step === 3 && "Choose a new password for your account."}
        </p>

        {devCode && (
          <p
            className="badge badge-warning"
            style={{ marginBottom: 14, padding: "6px 12px" }}
          >
            Email service not configured — dev code:{" "}
            <strong>{devCode}</strong>
          </p>
        )}

        {step === 1 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              requestCode();
            }}
          >
            <div className="field">
              <label htmlFor="fp-email">Registered email</label>

              <input
                id="fp-email"
                className="input"
                type="email"
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              {loading ? "Sending..." : "Send code"}
            </button>
          </form>
        )}

        {step === 2 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              verifyCode();
            }}
          >
            <div className="field">
              <label htmlFor="fp-otp">Verification code</label>

              <input
                id="fp-otp"
                className="input"
                type="text"
                inputMode="numeric"
                maxLength={6}
                placeholder="123456"
                style={{
                  letterSpacing: ".4em",
                  textAlign: "center",
                  fontSize: 18,
                }}
                value={otp}
                onChange={(e) =>
                  setOtp(e.target.value.replace(/\D/g, ""))
                }
                autoFocus
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              {loading ? "Verifying..." : "Verify code"}
            </button>
          </form>
        )}

        {step === 3 && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              resetPassword();
            }}
          >
            <div className="field">
              <label htmlFor="fp-new">New password</label>

              <input
                id="fp-new"
                className="input"
                type="password"
                placeholder="At least 6 characters"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoFocus
              />
            </div>

            <div className="field">
              <label htmlFor="fp-confirm">Confirm password</label>

              <input
                id="fp-confirm"
                className="input"
                type="password"
                placeholder="Repeat the password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>

            <button
              type="submit"
              className="btn btn-primary btn-block"
              disabled={loading}
            >
              {loading ? "Updating..." : "Update password"}
            </button>
          </form>
        )}

        <div className="auth-secondary">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/login")}
          >
            <FiArrowLeft />

            Back to login
          </button>
        </div>

      </div>

    </div>
  );
}

export default ForgotPassword;
