import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { FiZap } from "react-icons/fi";
import {
  messageForAuthError,
  messageForLoginError,
} from "../utils/apiError";
import "../styles/Auth.css";

import API, { API_ORIGIN } from "../config/api";

// Inline brand marks for the social buttons
// (Feather has no Google/Microsoft glyphs).

const GoogleIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#4285F4" d="M23.5 12.3c0-.9-.1-1.5-.3-2.2H12v4.1h6.5c-.1 1.1-.8 2.7-2.4 3.8l3.7 2.9c2.2-2 3.7-5 3.7-8.6z" />
    <path fill="#34A853" d="M12 24c3.2 0 5.9-1.1 7.9-2.9l-3.7-2.9c-1 .7-2.4 1.2-4.2 1.2-3.2 0-5.9-2.1-6.9-5l-3.9 3C3.2 21.3 7.3 24 12 24z" />
    <path fill="#FBBC05" d="M5.1 14.4c-.2-.7-.4-1.5-.4-2.4s.2-1.7.4-2.4l-3.9-3C.4 8.2 0 10 0 12s.4 3.8 1.2 5.4l3.9-3z" />
    <path fill="#EA4335" d="M12 4.7c1.8 0 3 .8 3.7 1.4l3.3-3.2C17.9 1.1 15.2 0 12 0 7.3 0 3.2 2.7 1.2 6.6l3.9 3c1-2.9 3.7-4.9 6.9-4.9z" />
  </svg>
);

const MicrosoftIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path fill="#F25022" d="M2 2h9.5v9.5H2z" />
    <path fill="#7FBA00" d="M12.5 2H22v9.5h-9.5z" />
    <path fill="#00A4EF" d="M2 12.5h9.5V22H2z" />
    <path fill="#FFB900" d="M12.5 12.5H22V22h-9.5z" />
  </svg>
);

const GitHubIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
    <path
      fill="#181717"
      d="M12 .5A11.5 11.5 0 0 0 .5 12a11.5 11.5 0 0 0 7.86 10.92c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.53-1.34-1.3-1.7-1.3-1.7-1.05-.72.08-.71.08-.71 1.17.08 1.78 1.2 1.78 1.2 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.7 0-1.26.45-2.29 1.19-3.1-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11 11 0 0 1 5.8 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.12 3.05.74.81 1.18 1.84 1.18 3.1 0 4.43-2.69 5.4-5.25 5.69.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12A11.5 11.5 0 0 0 12 .5z"
    />
  </svg>
);

const SOCIAL_LABEL = {
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
};

// Order the buttons appear in, and the icon each one uses.
const SOCIAL_PROVIDERS = [
  { key: "google", Icon: GoogleIcon },
  { key: "microsoft", Icon: MicrosoftIcon },
  { key: "github", Icon: GitHubIcon },
];

const UNAVAILABLE_STYLE = {
  display: "block",
  whiteSpace: "normal",
  padding: "6px 12px",
  textAlign: "center",
};

function Login() {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  // Failures are reported inline, never in a blocking dialog.
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  // A message carried here by the register / reset flow (e.g. after the
  // email was verified) is shown once, above the form.
  const [notice, setNotice] = useState(location.state?.notice || "");

  const [social, setSocial] = useState({
    google: false,
    microsoft: false,
    github: false,
  });

  // null = still loading; true = the providers endpoint failed.
  const [providersError, setProvidersError] = useState(false);

  useEffect(() => {
    axios
      .get(`${API}/api/auth/providers`)
      .then((res) => {
        setSocial({
          google: !!res.data?.google,
          microsoft: !!res.data?.microsoft,
          github: !!res.data?.github,
        });
      })
      .catch(() => setProvidersError(true));
  }, []);

  const clearFieldError = (field) =>
    setFieldErrors((prev) =>
      prev[field] ? { ...prev, [field]: "" } : prev
    );

  const handleLogin = async () => {
    const nextFieldErrors = {};

    if (!email.trim()) nextFieldErrors.email = "Enter your email address.";

    if (!password) nextFieldErrors.password = "Enter your password.";

    setFieldErrors(nextFieldErrors);

    if (Object.keys(nextFieldErrors).length > 0) {
      setError("");
      setNotice("");

      return;
    }

    setLoading(true);
    setError("");
    setNotice("");

    try {
      const res = await axios.post(`${API}/api/login`, {
        email,
        password,
      });

      localStorage.setItem("user", JSON.stringify(res.data.user));
      localStorage.setItem("token", res.data.token || "");
      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("isAdmin", "false");

      navigate("/");
    } catch (err) {
      const data = err.response?.data;

      if (data?.requiresVerification) {
        // Unverified accounts keep going to the same place as before; the
        // server's explanation now travels with the navigation and is shown
        // on the register page instead of interrupting with a dialog.
        navigate("/register", {
          state: {
            verifyEmail: true,
            email,
            notice: data.message,
          },
        });

        return;
      }

      if (data?.code === "ACCOUNT_DISABLED") {
        setError(
          messageForAuthError(
            err,
            "This account has been disabled by an administrator."
          )
        );

        return;
      }

      setError(
        messageForLoginError(
          err,
          "We could not sign you in. Please try again."
        )
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
          Welcome back
        </h1>

        <p className="auth-subtitle">
          Log in to continue to your account.
        </p>

        {notice && (
          <p className="auth-banner auth-banner-success" role="status">
            {notice}
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
            handleLogin();
          }}
        >
          <div className="field">
            <label htmlFor="login-email">Email</label>

            <input
              id="login-email"
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
                fieldErrors.email ? "login-email-error" : undefined
              }
              autoFocus
            />

            {fieldErrors.email && (
              <p
                className="auth-field-error"
                id="login-email-error"
                role="alert"
              >
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>

            <input
              id="login-password"
              className="input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                clearFieldError("password");
              }}
              aria-invalid={fieldErrors.password ? true : undefined}
              aria-describedby={
                fieldErrors.password ? "login-password-error" : undefined
              }
            />

            {fieldErrors.password && (
              <p
                className="auth-field-error"
                id="login-password-error"
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
            {loading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="auth-secondary">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/forgot-password")}
          >
            Forgot password?
          </button>
        </div>

        <div className="auth-divider">
          or continue with
        </div>

        <div className="auth-social">
          {providersError ? (
            <p
              className="badge badge-warning"
              style={UNAVAILABLE_STYLE}
            >
              Social sign-in is unavailable: the server ({API_ORIGIN}) could not
              report its OAuth configuration.
            </p>
          ) : (
            <>
              {SOCIAL_PROVIDERS.map(({ key, Icon }) => {
                const label = SOCIAL_LABEL[key];

                return social[key] ? (
                  <a
                    key={key}
                    href={`${API}/api/auth/${key}`}
                    className="btn btn-secondary btn-block"
                  >
                    <Icon />
                    Continue with {label}
                  </a>
                ) : (
                  <p
                    key={key}
                    className="badge badge-warning"
                    style={UNAVAILABLE_STYLE}
                  >
                    {label} sign-in is unavailable: OAuth is not configured
                    on {API_ORIGIN}.
                  </p>
                );
              })}
            </>
          )}
        </div>

        <p className="auth-footer">
          Don't have an account?{" "}

          <Link to="/register">Sign up</Link>
        </p>

        <div className="auth-divider">
          More
        </div>

        <button
          className="btn btn-secondary btn-block"
          onClick={() => navigate("/admin-login")}
        >
          Admin login
        </button>

      </div>

    </div>
  );
}

export default Login;
