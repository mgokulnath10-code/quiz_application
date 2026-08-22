import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import "../styles/Leaderboard.css";

function Leaderboard() {
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/results"
      );

      const sorted = [...res.data].sort(
        (a, b) => b.score - a.score
      );

      setResults(sorted);
    } catch (error) {
      console.error(error);
    }
  };

  const top3 = results.slice(0, 3);

  return (
    <div className="leaderboard-page">

      {/* Navigation Buttons */}

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "20px",
        }}
      >
        <button
          className="back-btn"
          onClick={() => navigate("/")}
        >
          🏠 Home
        </button>

        <button
          className="back-btn"
          onClick={() => navigate("/results")}
        >
          📊 Results
        </button>
      </div>

      <h1 className="leaderboard-title">
        🏆 Leaderboard
      </h1>

      {results.length === 0 ? (
        <h2
          style={{
            textAlign: "center",
            color: "white",
          }}
        >
          No Results Available
        </h2>
      ) : (
        <>
          {top3.length >= 3 && (
            <div className="podium">

              <div className="second-place">
                <div className="medal">🥈</div>
                <h3>{top3[1]?.user}</h3>
                <p>{top3[1]?.score} pts</p>
              </div>

              <div className="first-place">
                <div className="medal">🥇</div>
                <h3>{top3[0]?.user}</h3>
                <p>{top3[0]?.score} pts</p>
              </div>

              <div className="third-place">
                <div className="medal">🥉</div>
                <h3>{top3[2]?.user}</h3>
                <p>{top3[2]?.score} pts</p>
              </div>

            </div>
          )}

          <div className="table-container">

            <table>

              <thead>
                <tr>
                  <th>Rank</th>
                  <th>Name</th>
                  <th>Score</th>
                </tr>
              </thead>

              <tbody>

                {results.map(
                  (result, index) => (
                    <tr key={index}>
                      <td>
                        #{index + 1}
                      </td>

                      <td>
                        {result.user}
                      </td>

                      <td>
                        {result.score}
                      </td>
                    </tr>
                  )
                )}

              </tbody>

            </table>

          </div>
        </>
      )}
    </div>
  );
}

export default Leaderboard;