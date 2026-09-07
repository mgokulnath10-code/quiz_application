import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import { FiZap } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleRegister = async () => {
    if (!name || !email || !password) {
      alert("Please fill in all fields.");
      return;
    }

    setLoading(true);

    try {
      await axios.post(
        `${API}/api/register`,
        { name, email, password }
      );

      alert("Account created. Please log in.");

      navigate("/login");
    } catch (error) {
      alert(
        error.response?.data?.message ||
          "Registration failed."
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

      </div>

    </div>
  );
}

export default Register;
