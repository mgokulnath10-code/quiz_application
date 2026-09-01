import { useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Register.css";

function Register() {
  const navigate = useNavigate();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] =
    useState("");

  const handleRegister = async () => {
  try {
    await axios.post(
      "https://brain-race.onrender.com/api/register",
      {
        name,
        email,
        password,
      }
    );

    alert("Registration Successful");
    navigate("/");
  } catch (error) {
    console.error(error);

    alert(
      error.response?.data?.message ||
      "Registration Failed"
    );
  }
};

  return (
    <div className="register-page">

      <div className="stars"></div>

      <div className="register-card">

        <h1>🚀 Join BrainRace</h1>

        <p>
          Create your account and
          start competing.
        </p>

        <input
          type="text"
          placeholder="Full Name"
          value={name}
          onChange={(e) =>
            setName(e.target.value)
          }
        />

        <input
          type="email"
          placeholder="Email"
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
          onClick={handleRegister}
        >
          CREATE ACCOUNT
        </button>

        <p className="login-link">
          Already registered?
          <Link to="/">
            Login
          </Link>
        </p>
<button
  className="back-btn"
  onClick={() => navigate("/login")}
>
  ← Back Login
</button>
      </div>

    </div>
  );
}

export default Register;