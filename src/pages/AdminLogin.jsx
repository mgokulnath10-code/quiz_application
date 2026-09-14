import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiShield,
  FiArrowLeft,
  FiCopy,
  FiCheck,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiHelpCircle,
  FiSlash,
} from "react-icons/fi";
import "../styles/Auth.css";

import API from "../config/api";

const PROVIDER_LABEL = {
  google: "Google",
  microsoft: "Microsoft",
  github: "GitHub",
};

const PROVIDER_ORDER = ["google", "microsoft", "github"];

// Each verdict is distinguished by an icon and a word, not by colour alone.
// `supported === false` takes precedence over the verdict: a provider whose
// redirect URI genuinely cannot be checked must not read as "no problems
// found", and it must not read as "failed" either.
const VERDICT_VIEW = {
  accepted: {
    label: "Accepted",
    icon: FiCheckCircle,
    tone: "success",
  },
  redirect_uri_mismatch: {
    label: "Not registered",
    icon: FiAlertTriangle,
    tone: "danger",
  },
  invalid_client: {
    label: "Bad client id",
    icon: FiXCircle,
    tone: "danger",
  },
  not_configured: {
    label: "Not configured",
    icon: FiSlash,
    tone: "neutral",
  },
  unknown: {
    label: "No verdict",
    icon: FiHelpCircle,
    tone: "warning",
  },
};

const UNSUPPORTED_VIEW = {
  label: "Not supported",
  icon: FiSlash,
  tone: "neutral",
};

const viewFor = (result) => {
  if (!result) return null;

  if (result.supported === false) {
    return { ...UNSUPPORTED_VIEW, reason: result.supportReason };
  }

  const view = VERDICT_VIEW[result.verdict] || VERDICT_VIEW.unknown;

  return { ...view, reason: result.supportReason };
};

function AdminLogin() {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [configWarning, setConfigWarning] = useState("");
  const [config, setConfig] = useState(null);
  const [copied, setCopied] = useState("");

  // Provider redirect-URI diagnosis. Kept separate from the config fetch: the
  // check makes the server talk to the provider, so it runs only when asked.
  const [diagnosing, setDiagnosing] = useState(false);
  const [diagnosingProvider, setDiagnosingProvider] = useState("");
  const [diagnosis, setDiagnosis] = useState([]);
  const [diagnoseError, setDiagnoseError] = useState("");

  const navigate = useNavigate();

  // Ask the server whether admin credentials exist at all.
  // The most common real-world cause is a deployed backend
  // that cannot read the developer's local backend/.env.
  //
  // The same response carries the exact OAuth callback URIs this server
  // will send the provider, so the operator can copy the correct string into
  // Google Cloud Console instead of guessing at it.

  useEffect(() => {
    axios
      .get(`${API}/api/health/config`)
      .then((res) => {
        setConfig(res.data || null);

        if (res.data && res.data.adminConfigured === false) {
          setConfigWarning(
            `This server (${API}) has no ADMIN_USERNAME / ADMIN_PASSWORD ` +
              "configured, so no credentials can be accepted. Set them in the " +
              "backend environment (e.g. Render) and redeploy."
          );
        }
      })
      .catch(() => {});
  }, []);

  const copyUri = async (uri) => {
    try {
      await navigator.clipboard.writeText(uri);

      setCopied(uri);

      setTimeout(() => setCopied(""), 2000);
    } catch {
      setCopied("");
    }
  };

  // Runs the server-side check for every provider, one at a time so a partial
  // run stays readable and a single rate-limit reply does not discard the
  // results that already arrived.
  const runDiagnosis = async () => {
    setDiagnosing(true);
    setDiagnoseError("");
    setDiagnosis([]);

    const collected = [];

    try {
      for (const provider of PROVIDER_ORDER) {
        setDiagnosingProvider(provider);

        const res = await axios.get(
          `${API}/api/auth/${provider}/diagnose`
        );

        collected.push(res.data);

        setDiagnosis([...collected]);
      }
    } catch (err) {
      const data = err.response?.data;

      setDiagnosis([...collected]);

      setDiagnoseError(
        data?.message ||
          "The check could not be completed. The server may be offline."
      );
    } finally {
      setDiagnosingProvider("");
      setDiagnosing(false);
    }
  };

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

        {config && (
          <details className="login-diagnostics">
            <summary>Server diagnostics</summary>

            <div className="diagnostics-body">
              <p className="muted">
                Server: <code>{API}</code>
              </p>

              <ul className="diagnostics-list">
                <li>
                  Admin credentials:{" "}
                  {config.adminConfigured ? "configured" : "not configured"}
                </li>
                <li>
                  Google sign-in:{" "}
                  {config.googleConfigured ? "configured" : "not configured"}
                </li>
                <li>
                  Microsoft sign-in:{" "}
                  {config.microsoftConfigured ? "configured" : "not configured"}
                </li>
                <li>
                  GitHub sign-in:{" "}
                  {config.githubConfigured ? "configured" : "not configured"}
                </li>
                <li>Environment: {config.env || "unknown"}</li>
              </ul>

              {config.oauthRedirectUris && (
                <>
                  <p className="diagnostics-help">
                    These are the exact OAuth callback URIs this server will
                    send. Register the one that matches where you are signing
                    in at the provider console (Google Cloud Console →
                    Credentials → Authorized redirect URIs).
                  </p>

                  {Object.entries(config.oauthRedirectUris).map(
                    ([provider, uris]) => (
                      <div key={provider} className="diagnostics-provider">
                        <p className="diagnostics-provider-name">
                          {PROVIDER_LABEL[provider] || provider}
                        </p>

                        {(uris || []).length === 0 ? (
                          <p className="muted">
                            No origin could be resolved on this server. Set
                            SERVER_URL or OAUTH_ALLOWED_ORIGINS.
                          </p>
                        ) : (
                          (uris || []).map((uri) => (
                            <div className="uri-row" key={uri}>
                              <code className="uri-value">{uri}</code>

                              <button
                                type="button"
                                className="btn btn-secondary btn-sm"
                                onClick={() => copyUri(uri)}
                                aria-label={`Copy ${uri}`}
                              >
                                {copied === uri ? <FiCheck /> : <FiCopy />}
                                {copied === uri ? "Copied" : "Copy"}
                              </button>
                            </div>
                          ))
                        )}
                      </div>
                    )
                  )}

                  <p className="muted" role="status">
                    {copied ? `Copied ${copied}` : ""}
                  </p>
                </>
              )}

              {config.adminConfigured === false && (
                <p className="badge badge-warning diagnostics-warning">
                  <FiAlertTriangle aria-hidden="true" />
                  Admin login is unavailable on this server until
                  ADMIN_USERNAME / ADMIN_PASSWORD are set.
                </p>
              )}

              <div className="diagnostics-check">
                <p className="diagnostics-help">
                  A wrong redirect URI is invisible until someone is sent to
                  the provider, and the provider's own error page never tells
                  this server anything. Run the check to ask each provider
                  directly whether it accepts the URI above. No password or
                  secret is sent, and no account is signed in.
                </p>

                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={runDiagnosis}
                  disabled={diagnosing}
                  aria-busy={diagnosing}
                >
                  <FiShield aria-hidden="true" />
                  {diagnosing
                    ? `Checking ${
                        PROVIDER_LABEL[diagnosingProvider] ||
                        diagnosingProvider
                      }...`
                    : "Check provider redirect URIs"}
                </button>

                <div
                  className="diagnostics-results"
                  aria-live="polite"
                  role="status"
                >
                  {diagnosing && (
                    <p className="muted">
                      Contacting{" "}
                      {PROVIDER_LABEL[diagnosingProvider] ||
                        "the provider"}
                      ... This can take a few seconds.
                    </p>
                  )}

                  {diagnoseError && (
                    <p className="badge badge-danger diagnostics-warning">
                      <FiXCircle aria-hidden="true" />
                      {diagnoseError}
                    </p>
                  )}

                  {!diagnosing &&
                    !diagnoseError &&
                    diagnosis.length === 0 && (
                      <p className="muted">
                        Not run yet. No verdict is recorded for any provider
                        until the check is run.
                      </p>
                    )}

                  {diagnosis.map((result) => {
                    const view = viewFor(result);
                    const VerdictIcon = view.icon;

                    return (
                      <div
                        className="diagnostics-result"
                        key={result.provider}
                      >
                        <div className="diagnostics-result-head">
                          <span className="diagnostics-provider-name">
                            {PROVIDER_LABEL[result.provider] ||
                              result.provider}
                          </span>

                          <span className={`badge badge-${view.tone}`}>
                            <VerdictIcon aria-hidden="true" />
                            {view.label}
                          </span>
                        </div>

                        <div className="uri-row">
                          <code className="uri-value">
                            {result.redirectUri || "—"}
                          </code>

                          {result.redirectUri && (
                            <button
                              type="button"
                              className="btn btn-secondary btn-sm"
                              onClick={() => copyUri(result.redirectUri)}
                              aria-label={`Copy ${result.redirectUri}`}
                            >
                              {copied === result.redirectUri ? (
                                <FiCheck />
                              ) : (
                                <FiCopy />
                              )}
                              {copied === result.redirectUri
                                ? "Copied"
                                : "Copy"}
                            </button>
                          )}
                        </div>

                        {result.message && (
                          <p className="diagnostics-result-message">
                            {result.message}
                          </p>
                        )}

                        {view.reason && (
                          <p className="muted diagnostics-result-reason">
                            {view.reason}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>
        )}

      </div>

    </div>
  );
}

export default AdminLogin;
