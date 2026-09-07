import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import { FiTrendingUp } from "react-icons/fi";
import "../styles/Leaderboard.css";

const API = "https://brain-race.onrender.com";

function Leaderboard() {
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await axios.get(`${API}/api/results`);

      const sorted = [...res.data].sort((a, b) => b.score - a.score);

      setResults(sorted);
    } catch (error) {
      console.error(error);
    }
  };

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

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/")}
          >
            Back to home
          </button>
        </div>

        {results.length === 0 ? (
          <div className="card empty-state">
            <span className="empty-icon">
              <FiTrendingUp />
            </span>

            <p>No results yet. Be the first on the board.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Participant</th>
                  <th>Score</th>
                  <th>Questions</th>
                </tr>
              </thead>

              <tbody>
                {results.map((result, index) => (
                  <tr key={index}>
                    <td>
                      <span className={`rank-chip r${index + 1}`}>
                        {index + 1}
                      </span>
                    </td>

                    <td>
                      <strong>{result.user}</strong>
                    </td>

                    <td className="num">
                      <strong>{result.score}</strong>
                    </td>

                    <td className="num">{result.totalQuestions}</td>
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
