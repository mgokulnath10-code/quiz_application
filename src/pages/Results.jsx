import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  FiTrash2,
  FiBarChart2,
  FiAlertTriangle,
  FiRefreshCw,
  FiLogIn,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
} from "../utils/adminAuth";
import { getResultsAuth } from "../utils/resultsAuth";
import useSlowFlag from "../utils/useSlowFlag";
import "../styles/Results.css";

import API from "../config/api";

const DASH = "—";

function Results() {
  const [results, setResults] = useState([]);
  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [notice, setNotice] = useState("");
  const slowLoad = useSlowFlag(state === "loading");

  const navigate = useNavigate();

  const isAdmin = localStorage.getItem("isAdmin") === "true";

  const fetchResults = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      // Authenticated now, and returns leaderboard fields only —
      // the per-account detail stays behind /api/results/me. The
      // header carries either the signed-in user's raw token or the
      // admin token, so both identities read the same list.
      const res = await axios.get(`${API}/api/results`, getResultsAuth());

      setResults(res.data);
      setState("ready");
    } catch (error) {
      console.error(error);

      const status = error.response?.status;
      const code = error.response?.data?.code;

      // The platform results list requires a signed-in account. A 401 means
      // the token was missing, expired or rejected, which is a signed-out
      // state — not a broken page — so it gets its own explanation and a way
      // back in instead of the raw "Access Denied".
      if (status === 401 || code === "AUTH_REQUIRED") {
        setState("signed-out");
        return;
      }

      setErrorMessage(
        error.response?.data?.message ||
          "The results list could not be loaded."
      );

      setState("error");
    }
  };

  useEffect(() => {
    fetchResults();
    // Loaded once on mount; the retry button re-runs it.
  }, []);

  const deleteResult = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this result?"
    );

    if (!confirmDelete) return;

    setNotice("");

    try {
      await axios.delete(
        `${API}/api/results/${id}`,
        getAdminAuth()
      );

      setNotice("Result deleted.");

      fetchResults();
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        console.error(error);

        setNotice(
          error.response?.data?.message ||
            "Failed to delete the result. Nothing was removed."
        );
      }
    }
  };

  const totalAttempts = results.length;

  const highestScore =
    results.length > 0
      ? Math.max(...results.map((r) => Number(r.score) || 0))
      : 0;

  const averageScore =
    results.length > 0
      ? (
          results.reduce((sum, r) => sum + (Number(r.score) || 0), 0) /
          results.length
        ).toFixed(1)
      : 0;

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Results</h1>

            <p className="page-subtitle">
              All quiz attempts across the platform.
            </p>
          </div>

          <div className="row">
            <button className="btn btn-secondary" onClick={fetchResults}>
              <FiRefreshCw />
              Refresh
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/")}
            >
              Back to home
            </button>
          </div>
        </div>

        {notice && (
          <p className="badge badge-info results-notice" role="status">
            {notice}
          </p>
        )}

        {state === "loading" && (
          <div className="card">
            <div className="loading-screen" style={{ minHeight: "24vh" }}>
              Loading results…
            </div>

            {slowLoad && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. The server may be
                waking up.
              </p>
            )}
          </div>
        )}

        {state === "signed-out" && (
          <div className="card empty-state">
            <span
              className="empty-icon"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <FiLogIn />
            </span>

            <h3 className="card-title">Log in to view results</h3>

            <p
              role="alert"
              style={{ maxWidth: 520, margin: "0 auto 18px" }}
            >
              You are signed out, or your session has expired. The platform
              results list is only available to signed-in accounts.
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <button
                className="btn btn-primary"
                onClick={() => navigate("/login")}
              >
                <FiLogIn />
                Log in
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => navigate("/")}
              >
                Back to home
              </button>
            </div>
          </div>
        )}

        {state === "error" && (
          <div className="card empty-state" role="alert">
            <span
              className="empty-icon"
              style={{
                background: "var(--danger-soft)",
                color: "var(--danger)",
              }}
            >
              <FiAlertTriangle />
            </span>

            <h3 className="card-title">Could not load the results</h3>

            <p style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              {errorMessage} Your own attempts are always available on
              your dashboard.
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={fetchResults}>
                <FiRefreshCw />
                Try again
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => navigate("/dashboard")}
              >
                My dashboard
              </button>
            </div>
          </div>
        )}

        {state === "ready" && (
          <>
            <div className="stat-grid">
              <div className="stat-card">
                <div className="stat-value">{totalAttempts}</div>
                <div className="stat-label">Total attempts</div>
              </div>

              <div className="stat-card">
                <div className="stat-value">{highestScore}</div>
                <div className="stat-label">Highest score</div>
              </div>

              <div className="stat-card">
                <div className="stat-value">{averageScore}</div>
                <div className="stat-label">Average score</div>
              </div>
            </div>

            {results.length === 0 ? (
              <div className="card empty-state">
                <span className="empty-icon">
                  <FiBarChart2 />
                </span>

                <h3 className="card-title">No results yet</h3>

                <p style={{ marginBottom: 16 }}>
                  Complete a quiz to see it here.
                </p>

                <button
                  className="btn btn-primary"
                  onClick={() => navigate("/quiz-setup")}
                >
                  Start a quiz
                </button>
              </div>
            ) : (
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Participant</th>
                      <th className="num">Score</th>
                      <th className="num">Questions</th>
                      <th>Date</th>
                      {isAdmin && <th></th>}
                    </tr>
                  </thead>

                  <tbody>
                    {results.map((result) => (
                      <tr key={result._id}>
                        <td
                          className="dash-cell-truncate"
                          title={result.user || ""}
                        >
                          {result.user || DASH}
                        </td>

                        <td className="num">
                          <strong>{result.score}</strong>
                        </td>

                        <td className="num">
                          {result.totalQuestions ?? DASH}
                        </td>

                        <td>
                          {new Date(result.date).toLocaleDateString(
                            undefined,
                            {
                              year: "numeric",
                              month: "short",
                              day: "numeric",
                            }
                          )}
                        </td>

                        {isAdmin && (
                          <td style={{ textAlign: "right" }}>
                            <button
                              className="btn btn-danger-soft btn-sm"
                              onClick={() => deleteResult(result._id)}
                            >
                              <FiTrash2 />
                              Delete
                            </button>
                          </td>
                        )}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}

      </div>
    </div>
  );
}

export default Results;
