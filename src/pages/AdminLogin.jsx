import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FiShield, FiArrowLeft } from "react-icons/fi";
import "../styles/Auth.css";

const API = "https://brain-race.onrender.com";

function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configWarning, setConfigWarning] = useState("");

  const navigate = useNavigate();

  // Ask the server whether admin credentials exist at all.
  // The most common real-world cause is a deployed backend
  // that cannot read the developer's local backend/.env.

  useEffect(() => {
    axios
      .get(`${API}/api/health/config`)
      .then((res) => {
        if (res.data && res.data.adminConfigured === false) {
          setConfigWarning(
            "This server has no ADMIN_USERNAME / ADMIN_PASSWORD configured, " +
              "so no credentials can be accepted. Set them in the backend " +
              "environment (e.g. Render) and redeploy."
          );
        }
      })
      .catch(() => {});
  }, []);

  const handleLogin = async () => {
    if (!username || !password) {
      setError("Please enter both fields.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const res = await axios.post(
        `${API}/api/admin/login`,
        { username, password }
      );

      localStorage.setItem(
        "adminToken",
        res.data.adminToken
      );

      localStorage.setItem("adminLoggedIn", "true");
      localStorage.setItem("isAdmin", "true");

      navigate("/admin");
    } catch (err) {
      const data = err.response?.data;

      if (data?.code === "ADMIN_NOT_CONFIGURED") {
        setConfigWarning(data.message);
        setError(data.message);
      } else {
        setError(data?.message || "Invalid admin credentials.");
      }
    } finally {
      setLoading(false);
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

        {configWarning && (
          <p
            className="badge badge-warning"
            style={{
              marginBottom: 16,
              padding: "6px 12px",
              display: "block",
              whiteSpace: "normal",
            }}
          >
            {configWarning}
          </p>
        )}

        {error && (
          <p
            className="badge badge-danger"
            style={{ marginBottom: 16, padding: "6px 12px" }}
          >
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
            disabled={loading}
          >
            {loading ? "Signing in..." : "Sign in"}
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
