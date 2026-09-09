import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { FiZap } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

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

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const [social, setSocial] = useState({
    google: false,
    microsoft: false,
  });

  useEffect(() => {
    axios
      .get(`${API}/api/auth/providers`)
      .then((res) => setSocial(res.data))
      .catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    setLoading(true);

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
    } catch (error) {
      const data = error.response?.data;

      if (data?.requiresVerification) {
        alert(data.message);

        navigate("/register", {
          state: {
            verifyEmail: true,
            email,
            devCode: data.devCode,
          },
        });

        return;
      }

      alert(data?.message || "Invalid email or password.");
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
              onChange={(e) => setEmail(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="login-password">Password</label>

            <input
              id="login-password"
              className="input"
              type="password"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
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

        {(social.google || social.microsoft) && (
          <>
            <div className="auth-divider">
              or continue with
            </div>

            <div className="auth-social">
              {social.google && (
                <a
                  href={`${API}/api/auth/google`}
                  className="btn btn-secondary btn-block"
                >
                  <GoogleIcon />
                  Continue with Google
                </a>
              )}

              {social.microsoft && (
                <a
                  href={`${API}/api/auth/microsoft`}
                  className="btn btn-secondary btn-block"
                >
                  <MicrosoftIcon />
                  Continue with Microsoft
                </a>
              )}
            </div>
          </>
        )}

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
