import { useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/ForgotPassword.css";

function ForgotPassword() {
  const [email, setEmail] =
    useState("");

  const [newPassword, setNewPassword] =
    useState("");

  const navigate = useNavigate();

  const resetPassword = async () => {
    try {
      await axios.put(
        "https://brain-race.onrender.com/api/reset-password",
        {
          email,
          password: newPassword,
        }
      );

      alert(
        "✅ Password Updated Successfully"
      );

      navigate("/login");
    } catch (error) {
      alert("❌ User Not Found");
    }
  };

  return (
    <div className="forgot-page">

      <div className="forgot-card">

        <div className="forgot-header">
  <button
    className="home-btn"
    onClick={() => navigate("/")}
  >
    🏠 Home
  </button>
</div>

        <h1>Reset Password</h1>

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
          placeholder="New Password"
          value={newPassword}
          onChange={(e) =>
            setNewPassword(
              e.target.value
            )
          }
        />

        <button
          onClick={resetPassword}
        >
          Update Password
        </button>

      </div>

    </div>
  );
}

export default ForgotPassword;