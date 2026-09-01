import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import "../styles/AdminLogin.css";
function AdminLogin() {
  const [username, setUsername] =
    useState("");

  const [password, setPassword] =
    useState("");

  const navigate = useNavigate();

  const handleLogin = () => {

    if (
      username === "admin" &&
      password === "admin123"
    ) {

      localStorage.setItem(
        "adminLoggedIn",
        "true"
      );
      localStorage.setItem(
  "isAdmin",
  "true"
);

      navigate("/admin");

    } else {

      alert("Invalid Admin Login");

    }
  };

  return (
  <div className="admin-login-page">

    <div className="admin-login-card">

      <div className="admin-shield">
        🛡️
      </div>

      <h1 className="admin-login-title">
        Admin Portal
      </h1>

     <input
  type="text"
  placeholder="Admin Username"
  value={username}
  onChange={(e) => setUsername(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      document.getElementById("adminPassword").focus();
    }
  }}
/>
<input
  id="adminPassword"
  type="password"
  placeholder="Password"
  value={password}
  onChange={(e) => setPassword(e.target.value)}
  onKeyDown={(e) => {
    if (e.key === "Enter") {
      handleLogin();
    }
  }}
/>

      <button
        className="admin-login-btn"
        onClick={handleLogin}
      >
        Login
      </button>


      <p className="admin-note">
        Authorized Administrators Only
      </p>
      <button
  className="back-btn"
  onClick={() => navigate("/")}
>
  ← Home
</button>

    </div>

  </div>
);
}

export default AdminLogin;