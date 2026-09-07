import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { FiShield, FiArrowLeft } from "react-icons/fi";
import "../styles/Auth.css";

function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");

  const navigate = useNavigate();

  const handleLogin = () => {
    if (username === "admin" && password === "admin123") {
      localStorage.setItem("adminLoggedIn", "true");
      localStorage.setItem("isAdmin", "true");

      navigate("/admin");
    } else {
      alert("Invalid admin credentials.");
    }
  };

  return (
    <div className="auth-page">

      <div className="auth-card">

        <div className="auth-brand">
          <span className="brand-mark">
            <FiShield />
          </span>

          <span className="brand-name">
            Admin Portal
          </span>
        </div>

        <h1 className="auth-title">
          Administrator sign in
        </h1>

        <p className="auth-subtitle">
          Restricted area. Authorized staff only.
        </p>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleLogin();
          }}
        >
          <div className="field">
            <label htmlFor="admin-user">Username</label>

            <input
              id="admin-user"
              className="input"
              type="text"
              placeholder="Admin username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
            />
          </div>

          <div className="field">
            <label htmlFor="admin-pass">Password</label>

            <input
              id="admin-pass"
              className="input"
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-block"
          >
            Sign in
          </button>
        </form>

        <div className="auth-secondary">
          <button
            className="btn btn-ghost btn-sm"
            onClick={() => navigate("/")}
          >
            <FiArrowLeft />

            Back to home
          </button>
        </div>

      </div>

    </div>
  );
}

export default AdminLogin;
