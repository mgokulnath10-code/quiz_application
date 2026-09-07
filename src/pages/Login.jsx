import { useState, useRef } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { FiZap, FiArrowLeft } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

function Login() {
  const navigate = useNavigate();

  const passwordRef = useRef(null);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async () => {
    if (!email || !password) {
      alert("Please enter your email and password.");
      return;
    }

    setLoading(true);

    try {
      const res = await axios.post(
        `${API}/api/login`,
        { email, password }
      );

      localStorage.setItem(
        "user",
        JSON.stringify(res.data.user)
      );

      localStorage.setItem(
        "token",
        res.data.token || ""
      );

      localStorage.setItem("isLoggedIn", "true");
      localStorage.setItem("isAdmin", "false");

      navigate("/");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Invalid email or password."
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
              ref={passwordRef}
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
