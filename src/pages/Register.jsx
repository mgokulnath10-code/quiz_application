import { useState } from "react";
import axios from "axios";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { FiZap, FiMail } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

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
    location.state?.verifyEmail
      ? "Your email isn't verified yet. Enter the code we just sent you."
      : ""
  );
  const [devCode, setDevCode] = useState(location.state?.devCode || "");

  const handleRegister = async () => {
    if (!name || !email || !password) {
      alert("Please fill in all fields.");
      return;
    }

    setLoading(true);
    setNotice("");

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
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Registration failed."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (!otp || otp.length !== 6) {
      alert("Enter the 6-digit code from your email.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(`${API}/api/verify-otp`, {
        email,
        otp,
        purpose: "register",
      });

      alert("Email verified. Please log in.");

      navigate("/login");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Verification failed."
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
                  onChange={(e) => setName(e.target.value)}
                  autoFocus
                />
              </div>

              <div className="field">
                <label htmlFor="reg-email">Email</label>

                <input
                  id="reg-email"
                  className="input"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>

              <div className="field">
                <label htmlFor="reg-password">Password</label>

                <input
                  id="reg-password"
                  className="input"
                  type="password"
                  placeholder="Choose a password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
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
              <p
                className="badge badge-accent"
                style={{ marginBottom: 14, padding: "6px 12px" }}
              >
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
                {loading ? "Verifying..." : "Verify email"}
              </button>
            </form>

            <div className="auth-secondary">
              <button
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  setMode("register");

                  setOtp("");
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
