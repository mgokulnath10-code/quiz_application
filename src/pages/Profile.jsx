import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import "../styles/Profile.css";

function Profile() {
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  const user =
    JSON.parse(localStorage.getItem("user")) || {
      name: "Guest",
      email: "guest@gmail.com",
    };

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/results"
      );

      const userResults = res.data.filter(
        (r) => r.user === user.name
      );

      setResults(userResults);
    } catch (error) {
      console.error(error);
    }
  };

  const totalQuizzes = results.length;

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
    <div className="profile-page">

      <div className="profile-header">
        <button
          className="home-btn"
          onClick={() => navigate("/")}
        >
          🏠 Home
        </button>
      </div>

      <div className="profile-card">

        <div className="avatar">
          🧠
        </div>

        <h1>{user.name}</h1>

        <p className="email">
          {user.email}
        </p>

        <div className="stats-grid">

          <div className="stat-box">
            <h2>{totalQuizzes}</h2>
            <p>Quizzes</p>
          </div>

          <div className="stat-box">
            <h2>{highestScore}</h2>
            <p>Best Score</p>
          </div>

          <div className="stat-box">
            <h2>{averageScore}</h2>
            <p>Average Score</p>
          </div>

        </div>

        <h2 className="history-title">
          Quiz History
        </h2>

        <div className="history-list">

          {results.length === 0 ? (
            <div className="history-card">
              <h3>No Quiz History Found</h3>
            </div>
          ) : (
            results.map((item, index) => (
              <div
                key={index}
                className="history-card"
              >
                <h3>
                  Score: {item.score}
                </h3>

                <p>
                  {new Date(
                    item.date
                  ).toLocaleDateString()}
                </p>
              </div>
            ))
          )}

        </div>

      </div>

    </div>
  );
}

export default Profile;