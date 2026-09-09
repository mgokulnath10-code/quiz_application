import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { FiZap } from "react-icons/fi";
import "../styles/Auth.css";

// The backend redirects here after a successful
// Google / Microsoft sign-in with the token in
// the query string. We store the session and go
// home — exactly like a normal login.

function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handledRef = useRef(false);

  useEffect(() => {
    if (handledRef.current) return;

    const token = searchParams.get("token");
    const name = searchParams.get("name");
    const email = searchParams.get("email");

    if (!token) {
      alert("Social sign-in failed. Please try again.");

      navigate("/login");

      return;
    }

    handledRef.current = true;

    localStorage.setItem(
      "user",
      JSON.stringify({ name: name || email, email })
    );

    localStorage.setItem("token", token);
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("isAdmin", "false");

    navigate("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="auth-page">
      <div className="auth-card" style={{ textAlign: "center" }}>
        <div className="auth-brand" style={{ justifyContent: "center" }}>
          <span className="brand-mark">
            <FiZap />
          </span>
        </div>

        <h1 className="auth-title">Signing you in</h1>

        <p className="auth-subtitle">
          Completing your sign-in...
        </p>

        <div className="waiting-spinner" style={{ margin: "10px auto 0" }} />
      </div>
    </div>
  );
}

export default OAuthCallback;
