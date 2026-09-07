import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FiTrash2, FiBarChart2 } from "react-icons/fi";
import "../styles/Results.css";

const API = "https://brain-race.onrender.com";

function Results() {
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  const isAdmin = localStorage.getItem("isAdmin") === "true";

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await axios.get(`${API}/api/results`);

      setResults(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const deleteResult = async (id) => {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this result?"
    );

    if (!confirmDelete) return;

    try {
      await axios.delete(`${API}/api/results/${id}`);

      fetchResults();
    } catch (error) {
      console.error(error);
      alert("Failed to delete result.");
    }
  };

  const totalAttempts = results.length;

  const highestScore =
    results.length > 0
      ? Math.max(...results.map((r) => r.score))
      : 0;

  const averageScore =
    results.length > 0
      ? (
          results.reduce((sum, r) => sum + r.score, 0) / results.length
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

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/")}
          >
            Back to home
          </button>
        </div>

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

            <p>No results yet. Complete a quiz to see it here.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Participant</th>
                  <th>Score</th>
                  <th>Questions</th>
                  <th>Date</th>
                  {isAdmin && <th></th>}
                </tr>
              </thead>

              <tbody>
                {results.map((result) => (
                  <tr key={result._id}>
                    <td>{result.user}</td>

                    <td className="num">
                      <strong>{result.score}</strong>
                    </td>

                    <td className="num">{result.totalQuestions}</td>

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

      </div>
    </div>
  );
}

export default Results;
