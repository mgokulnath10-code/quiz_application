import { useEffect, useState } from "react";
import axios from "axios";
import { Link, useNavigate } from "react-router-dom";
import {
  FiHome,
  FiClock,
  FiAlertTriangle,
  FiRefreshCw,
  FiPlay,
} from "react-icons/fi";
import { formatScore, describeMode } from "../utils/quizEngine";
import { isFiniteNumber } from "../utils/resultSummary";
import useSlowFlag from "../utils/useSlowFlag";
import "../styles/Profile.css";

import API from "../config/api";

const DASH = "—";

function Profile() {
  const [results, setResults] = useState([]);
  const [summary, setSummary] = useState(null);
  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const slowLoad = useSlowFlag(state === "loading");

  const navigate = useNavigate();

  const user =
    JSON.parse(localStorage.getItem("user")) || {
      name: "Guest",
      email: "",
    };

  const token = localStorage.getItem("token") || "";

  const fetchResults = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      // The profile reads the caller's own attempts rather than
      // filtering the platform list by display name, so two
      // accounts sharing a name no longer see each other.
      const res = await axios.get(`${API}/api/results/me`, {
        headers: { Authorization: token },
      });

      setResults(res.data?.results || []);
      setSummary(res.data?.summary || null);
      setState("ready");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.response?.data?.message ||
          "Your quiz history could not be loaded."
      );

      setState("error");
    }
  };

  useEffect(() => {
    fetchResults();
    // Loaded once on mount; the retry button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const totalQuizzes = summary?.attempts ?? results.length;

  const highestScore = summary?.bestScore ?? null;

  const averageScore = summary?.averageScore ?? null;

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Profile</h1>

            <p className="page-subtitle">
              Your account and quiz history.
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
              <FiHome />
              Back to home
            </button>
          </div>
        </div>

        <div className="card profile-card">

          <div className="profile-identity">
            <span className="profile-avatar">
              {(user.name || "U").charAt(0).toUpperCase()}
            </span>

            <div>
              <h2 className="profile-name">{user.name}</h2>

              <p className="profile-email">{user.email || DASH}</p>
            </div>
          </div>

          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="stat-value">{totalQuizzes}</div>
              <div className="stat-label">Quizzes taken</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {highestScore === null ? DASH : formatScore(highestScore)}
              </div>
              <div className="stat-label">Best score</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {averageScore === null ? DASH : formatScore(averageScore)}
              </div>
              <div className="stat-label">Average score</div>
            </div>
          </div>

        </div>

        <div className="card">
          <h3 className="card-title">Quiz history</h3>

          <p className="card-desc">
            Your most recent attempts, newest first. “—” marks a
            field the attempt predates.
          </p>

          {state === "loading" && (
            <>
              <div className="loading-screen" style={{ minHeight: "18vh" }}>
                Loading your history…
              </div>

              {slowLoad && (
                <p className="muted" role="status" style={{ textAlign: "center" }}>
                  This is taking longer than expected.
                </p>
              )}
            </>
          )}

          {state === "error" && (
            <div className="empty-state" role="alert">
              <span
                className="empty-icon"
                style={{
                  background: "var(--danger-soft)",
                  color: "var(--danger)",
                }}
              >
                <FiAlertTriangle />
              </span>

              <h4 className="card-title">History unavailable</h4>

              <p style={{ marginBottom: 16 }}>{errorMessage}</p>

              <button className="btn btn-primary" onClick={fetchResults}>
                <FiRefreshCw />
                Try again
              </button>
            </div>
          )}

          {state === "ready" && results.length === 0 && (
            <div className="empty-state">
              <span className="empty-icon">
                <FiClock />
              </span>

              <h4 className="card-title">No quiz history yet</h4>

              <p style={{ marginBottom: 16 }}>
                Finish a quiz and it will be listed here with its
                score, topic and mode.
              </p>

              <Link to="/quiz-setup" className="btn btn-primary">
                <FiPlay />
                Take your first quiz
              </Link>
            </div>
          )}

          {state === "ready" && results.length > 0 && (
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Topic</th>
                    <th>Level</th>
                    <th>Mode</th>
                    <th className="num">Score</th>
                    <th className="num">Time</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((item) => (
                    <tr key={item._id}>
                      <td>
                        {new Date(item.date).toLocaleDateString(
                          undefined,
                          {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                          }
                        )}
                      </td>

                      <td
                        className="dash-cell-truncate"
                        style={{ textTransform: "capitalize" }}
                        title={item.topic || ""}
                      >
                        {item.topic || DASH}
                      </td>

                      <td style={{ textTransform: "capitalize" }}>
                        {item.difficulty || DASH}
                      </td>

                      <td>
                        {item.mode ? describeMode(item.mode) : DASH}
                      </td>

                      <td className="num">
                        <strong>
                          {isFiniteNumber(item.score)
                            ? formatScore(item.score)
                            : DASH}
                        </strong>
                        /{item.totalQuestions ?? DASH}
                      </td>

                      <td className="num">
                        {isFiniteNumber(item.durationSeconds)
                          ? `${Math.round(item.durationSeconds / 60)}m ${
                              item.durationSeconds % 60
                            }s`
                          : DASH}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}

export default Profile;
