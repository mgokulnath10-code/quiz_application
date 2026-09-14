import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiTrendingUp,
  FiAlertTriangle,
  FiRefreshCw,
} from "react-icons/fi";
import useSlowFlag from "../utils/useSlowFlag";
import "../styles/Leaderboard.css";

import API from "../config/api";

const DASH = "—";

function Leaderboard() {
  const [results, setResults] = useState([]);
  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const slowLoad = useSlowFlag(state === "loading");

  const navigate = useNavigate();

  const token = localStorage.getItem("token") || "";

  const fetchResults = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      // The results endpoint now requires a signed-in caller and
      // returns leaderboard fields only.
      const res = await axios.get(`${API}/api/results`, {
        headers: { Authorization: token },
      });

      const sorted = [...res.data].sort((a, b) => b.score - a.score);

      setResults(sorted);
      setState("ready");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.response?.data?.message ||
          "The leaderboard could not be loaded."
      );

      setState("error");
    }
  };

  useEffect(() => {
    fetchResults();
    // Loaded once on mount; the retry button re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Leaderboard</h1>

            <p className="page-subtitle">
              Top scores across all quiz attempts.
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

        {state === "loading" && (
          <div className="card">
            <div className="loading-screen" style={{ minHeight: "24vh" }}>
              Loading the leaderboard…
            </div>

            {slowLoad && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. The server may be
                waking up.
              </p>
            )}
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

            <h3 className="card-title">Could not load the leaderboard</h3>

            <p style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              {errorMessage}
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={fetchResults}>
                <FiRefreshCw />
                Try again
              </button>
            </div>
          </div>
        )}

        {state === "ready" && results.length === 0 && (
          <div className="card empty-state">
            <span className="empty-icon">
              <FiTrendingUp />
            </span>

            <h3 className="card-title">No scores yet</h3>

            <p style={{ marginBottom: 16 }}>
              Nobody has completed a quiz on this server yet. The
              first submitted attempt takes the top spot.
            </p>

            <button
              className="btn btn-primary"
              onClick={() => navigate("/quiz-setup")}
            >
              Take the first quiz
            </button>
          </div>
        )}

        {state === "ready" && results.length > 0 && (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  <th className="num">Score</th>
                  <th className="num">Questions</th>
                </tr>
              </thead>

              <tbody>
                {results.map((result, index) => (
                  <tr key={result._id || index}>
                    <td>
                      <span className={`rank-chip r${index + 1}`}>
                        {index + 1}
                      </span>
                    </td>

                    <td
                      className="dash-cell-truncate"
                      title={result.user || ""}
                    >
                      <strong>{result.user || DASH}</strong>
                    </td>

                    <td className="num">
                      <strong>{result.score}</strong>
                    </td>

                    <td className="num">
                      {result.totalQuestions ?? DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}

export default Leaderboard;
