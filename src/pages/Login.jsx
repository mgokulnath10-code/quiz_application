import { useState } from "react";
import axios from "axios";
import { useNavigate, Link } from "react-router-dom";
import "../styles/Login.css";

function Login() {
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");

  const handleLogin = async () => {
    try {
      const res = await axios.post(
        "http://localhost:5000/api/login",
        {
          email,
          password,
        }
      );

      localStorage.setItem(
        "user",
        JSON.stringify(res.data.user)
      );

      localStorage.setItem(
        "token",
        res.data.token || ""
      );

      localStorage.setItem(
        "isLoggedIn",
        "true"
      );
      localStorage.setItem(
  "isAdmin",
  "false"
);

      alert("✅ Login Successful!");

      navigate("/");

    } catch (error) {
      alert("❌ Invalid Login");

      console.error(error);
    }
  };

  return (
    <div className="login-page">

      <div className="bg-circle circle1"></div>
      <div className="bg-circle circle2"></div>

      <div className="login-card">

        <div className="logo">
          🧠
        </div>

        <h1 className="title">
          BrainRace
        </h1>

        <p className="subtitle">
          Test Your Knowledge
        </p>

        <input
          type="email"
          placeholder="Email Address"
          value={email}
          onChange={(e) =>
            setEmail(e.target.value)
          }
        />

        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) =>
            setPassword(e.target.value)
          }
        />

        <button
          className="login-btn"
          onClick={handleLogin}
        >
          LOGIN
        </button>

        <p className="register-link">
          Don't have an account?{" "}
          <Link to="/register">
            Register
          </Link>
        </p>

        <button
          className="back-btn"
          onClick={() => navigate("/")}
        >
          🏠 Back Home
        </button>

      </div>

    </div>
  );
}

export default Login;