import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Results.css";

function Results() {
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  const isAdmin =
    localStorage.getItem("isAdmin") === "true";

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await axios.get(
        "https://brain-race.onrender.com/api/results"
      );

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
      await axios.delete(
        `https://brain-race.onrender.com/api/results/${id}`
      );

      alert("✅ Result Deleted Successfully");

      fetchResults();
    } catch (error) {
      console.error(error);
      alert("❌ Failed to Delete Result");
    }
  };

  const totalAttempts = results.length;

  const highestScore =
    results.length > 0
      ? Math.max(
          ...results.map((r) => r.score)
        )
      : 0;

  const averageScore =
    results.length > 0
      ? (
          results.reduce(
            (sum, r) => sum + r.score,
            0
          ) / results.length
        ).toFixed(1)
      : 0;

  return (
    <div className="results-page">

      <div className="results-header">
        <button
          className="back-btn"
          onClick={() => navigate("/")}
        >
          🏠 Home
        </button>
      </div>

      <h1 className="results-title">
        🏆 Quiz Results
      </h1>

      <div className="results-stats">

        <div className="stat-card">
          <h2>{totalAttempts}</h2>
          <p>Total Attempts</p>
        </div>

        <div className="stat-card">
          <h2>{highestScore}</h2>
          <p>Highest Score</p>
        </div>

        <div className="stat-card">
          <h2>{averageScore}</h2>
          <p>Average Score</p>
        </div>

      </div>

      {results.length === 0 ? (
        <div className="empty-results">
          No Results Found
        </div>
      ) : (
        <div className="results-grid">

          {results.map((result, index) => (
            <div
              className="result-card"
              key={result._id}
            >

              <div className="rank-badge">
                #{index + 1}
              </div>

              <h3>
                👤 {result.user}
              </h3>

              <p>
                📚 Total Questions:{" "}
                {result.totalQuestions}
              </p>

              <p>
                📅 Date:{" "}
                {new Date(
                  result.date
                ).toLocaleString()}
              </p>

              <div className="score-badge">
                Score: {result.score}
              </div>

              {isAdmin && (
                <button
                  className="delete-btn"
                  onClick={() =>
                    deleteResult(
                      result._id
                    )
                  }
                >
                  🗑 Delete
                </button>
              )}

            </div>
          ))}

        </div>
      )}

    </div>
  );
}

export default Results;