import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { FiZap } from "react-icons/fi";
import "../styles/Auth.css";

// The backend redirects here after a successful
// Google / Microsoft sign-in with the token in
// the query string. We store the session and go
// home — exactly like a normal login.
// On failure the backend redirects here with ?error=...

function OAuthCallback() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const handledRef = useRef(false);

  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    if (handledRef.current) return;

    handledRef.current = true;

    const error = searchParams.get("error");

    if (error) {
      setErrorMsg(error);
      return;
    }

    const token = searchParams.get("token");
    const id = searchParams.get("id");
    const name = searchParams.get("name");
    const email = searchParams.get("email");

    if (!token) {
      setErrorMsg("Social sign-in failed. Please try again.");
      return;
    }

    // _id is required by the room features (participant
    // matching and the room-admin check), so it must be
    // persisted alongside the token.

    localStorage.setItem(
      "user",
      JSON.stringify({ _id: id || undefined, name: name || email, email })
    );

    localStorage.setItem("token", token);
    localStorage.setItem("isLoggedIn", "true");
    localStorage.setItem("isAdmin", "false");

    navigate("/");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (errorMsg) {
    return (
      <div className="auth-page">
        <div className="auth-card" style={{ textAlign: "center" }}>
          <div className="auth-brand" style={{ justifyContent: "center" }}>
            <span className="brand-mark">
              <FiZap />
            </span>
          </div>

          <h1 className="auth-title">Sign-in failed</h1>

          <p className="auth-subtitle">{errorMsg}</p>

          <Link to="/login" className="btn btn-primary btn-block">
            Back to login
          </Link>
        </div>
      </div>
    );
  }

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
