import { useState } from "react";
import axios from "axios";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FiZap, FiMail } from "react-icons/fi";
import { messageForAuthError } from "../utils/apiError";
import "../styles/Auth.css";

import API from "../config/api";

function Register() {
  const navigate = useNavigate();
  const location = useLocation();

  // Arriving from Login with an unverified email
  // jumps straight to the OTP step.
  const [mode, setMode] = useState(
    location.state?.verifyEmail ? "verify" : "register"
  );

  const [name, setName] = useState("");
  const [email, setEmail] = useState(
    location.state?.email || ""
  );
  const [password, setPassword] = useState("");
  const [otp, setOtp] = useState("");

  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState(
    location.state?.notice ||
      (location.state?.verifyEmail
        ? "Your email isn't verified yet. Enter the code we just sent you."
        : "")
  );
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // Only ever populated when the server explicitly enables
  // dev OTP (ALLOW_DEV_OTP=true and not production).

  const [devCode, setDevCode] = useState("");

  const clearFieldError = (field) =>
    setFieldErrors((prev) =>
      prev[field] ? { ...prev, [field]: "" } : prev
    );

  const handleRegister = async () => {
    const nextFieldErrors = {};

    if (!name.trim()) nextFieldErrors.name = "Enter your full name.";

    if (!email.trim()) nextFieldErrors.email = "Enter your email address.";

    if (!password) nextFieldErrors.password = "Choose a password.";

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      setError("");

      return;
    }

    setLoading(true);
    setNotice("");
    setError("");

    try {
      const res = await axios.post(`${API}/api/register`, {
        name,
        email,
        password,
      });

      if (res.data.requiresVerification) {
        setMode("verify");

        setNotice(res.data.message);

        setDevCode(res.data.devCode || "");
      }
    } catch (err) {
      setError(
        messageForAuthError(err, "Registration failed. Please try again.")
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp || otp.length !== 6) {
      setFieldErrors({
        otp: "Enter the 6-digit code from your email.",
      });
      setError("");

      return;
    }

    setFieldErrors({});
    setLoading(true);
    setError("");

    try {
      await axios.post(`${API}/api/verify-otp`, {
        email,
        otp,
        purpose: "register",
      });

      // The confirmation rides along with the navigation instead of
      // interrupting the user with a dialog.
      navigate("/login", {
        state: { notice: "Email verified. Please log in." },
      });
    } catch (err) {
      setError(
        messageForAuthError(err, "Verification failed. Please try again.")
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

        {mode === "register" ? (
          <>
            <h1 className="auth-title">
              Create your account
            </h1>

            <p className="auth-subtitle">
              Join BrainRace and start competing today.
            </p>

            {error && (
              <p className="auth-banner auth-banner-danger" role="alert">
                {error}
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleRegister();
              }}
            >
              <div className="field">
                <label htmlFor="reg-name">Full name</label>

                <input
                  id="reg-name"
                  className="input"
                  type="text"
                  placeholder="Your name"
                  value={name}
                  onChange={(e) => {
                    setName(e.target.value);
                    clearFieldError("name");
                  }}
                  aria-invalid={fieldErrors.name ? true : undefined}
                  aria-describedby={
                    fieldErrors.name ? "reg-name-error" : undefined
                  }
                  autoFocus
                />

                {fieldErrors.name && (
                  <p
                    className="auth-field-error"
                    id="reg-name-error"
                    role="alert"
                  >
                    {fieldErrors.name}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="reg-email">Email</label>

                <input
                  id="reg-email"
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    clearFieldError("email");
                  }}
                  aria-invalid={fieldErrors.email ? true : undefined}
                  aria-describedby={
                    fieldErrors.email ? "reg-email-error" : undefined
                  }
                />

                {fieldErrors.email && (
                  <p
                    className="auth-field-error"
                    id="reg-email-error"
                    role="alert"
                  >
                    {fieldErrors.email}
                  </p>
                )}
              </div>

              <div className="field">
                <label htmlFor="reg-password">Password</label>

                <input
                  id="reg-password"
                  className="input"
                  type="password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    clearFieldError("password");
                  }}
                  aria-invalid={fieldErrors.password ? true : undefined}
                  aria-describedby={
                    fieldErrors.password ? "reg-password-error" : undefined
                  }
                />

                {fieldErrors.password && (
                  <p
                    className="auth-field-error"
                    id="reg-password-error"
                    role="alert"
                  >
                    {fieldErrors.password}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
              >
                {loading ? "Creating account..." : "Create account"}
              </button>
            </form>

            <p className="auth-footer">
              Already have an account?{" "}

              <Link to="/login">Log in</Link>
            </p>
          </>
        ) : (
          <>
            <h1 className="auth-title">
              Verify your email
            </h1>

            <p className="auth-subtitle">
              We sent a 6-digit code to{" "}

              <strong>{email}</strong>
            </p>

            {notice && (
              <p className="auth-banner auth-banner-info" role="status">
                {notice}
              </p>
            )}

            {devCode && (
              <p
                className="badge badge-warning"
                style={{ marginBottom: 14, padding: "6px 12px" }}
              >
                Email service not configured — dev code:{" "}
                <strong>{devCode}</strong>
              </p>
            )}

            {error && (
              <p className="auth-banner auth-banner-danger" role="alert">
                {error}
              </p>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleVerify();
              }}
            >
              <div className="field">
                <label htmlFor="reg-otp">Verification code</label>

                <input
                  id="reg-otp"
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
                  onChange={(e) => {
                    setOtp(e.target.value.replace(/\D/g, ""));
                    clearFieldError("otp");
                  }}
                  aria-invalid={fieldErrors.otp ? true : undefined}
                  aria-describedby={
                    fieldErrors.otp ? "reg-otp-error" : undefined
                  }
                  autoFocus
                />

                {fieldErrors.otp && (
                  <p
                    className="auth-field-error"
                    id="reg-otp-error"
                    role="alert"
                  >
                    {fieldErrors.otp}
                  </p>
                )}
              </div>

              <button
                type="submit"
                className="btn btn-primary btn-block"
                disabled={loading}
              >
                {loading ? "Verifying..." : "Verify email"}
              </button>
            </form>

            <div className="auth-secondary">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setMode("register");

                  setOtp("");

                  setFieldErrors({});
                }}
              >
                <FiMail />
                Use a different email
              </button>
            </div>
          </>
        )}

      </div>

    </div>
  );
}

export default Register;
