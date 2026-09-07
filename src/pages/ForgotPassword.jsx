import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import { FiZap, FiArrowLeft } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const navigate = useNavigate();

  const resetPassword = async () => {
    if (!email || !newPassword) {
      alert("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      await axios.put(
        `${API}/api/reset-password`,
        {
          email,
          password: newPassword,
        }
      );

      alert("Password updated. Please log in with your new password.");

      navigate("/login");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "No account found with that email."
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
          Confirm your email and choose a new password.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            resetPassword();
          }}
        >
          <div className="field">
            <label htmlFor="fp-email">Email</label>

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

          <div className="field">
            <label htmlFor="fp-password">New password</label>

            <input
              id="fp-password"
              className="input"
              type="password"
              placeholder="Choose a new password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
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
