import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import { FiHome, FiClock } from "react-icons/fi";
import "../styles/Profile.css";

const API = "https://brain-race.onrender.com";

function Profile() {
  const [results, setResults] = useState([]);
  const navigate = useNavigate();

  const user =
    JSON.parse(localStorage.getItem("user")) || {
      name: "Guest",
      email: "",
    };

  useEffect(() => {
    fetchResults();
  }, []);

  const fetchResults = async () => {
    try {
      const res = await axios.get(`${API}/api/results`);

      const userResults = res.data.filter(
        (r) => r.user === user.name
      );

      setResults([...userResults].reverse());
    } catch (error) {
      console.error(error);
    }
  };

  const totalQuizzes = results.length;

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
            <h1 className="page-title">Profile</h1>

            <p className="page-subtitle">
              Your account and quiz history.
            </p>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/")}
          >
            <FiHome />
            Back to home
          </button>
        </div>

        <div className="card profile-card">

          <div className="profile-identity">
            <span className="profile-avatar">
              {(user.name || "U").charAt(0).toUpperCase()}
            </span>

            <div>
              <h2 className="profile-name">{user.name}</h2>

              <p className="profile-email">{user.email}</p>
            </div>
          </div>

          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="stat-value">{totalQuizzes}</div>
              <div className="stat-label">Quizzes taken</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{highestScore}</div>
              <div className="stat-label">Best score</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{averageScore}</div>
              <div className="stat-label">Average score</div>
            </div>
          </div>

        </div>

        <div className="card">
          <h3 className="card-title">Quiz history</h3>

          <p className="card-desc">
            Your most recent attempts, newest first.
          </p>

          {results.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">
                <FiClock />
              </span>

              <p>No quiz history yet.</p>
            </div>
          ) : (
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Score</th>
                    <th>Questions</th>
                    <th>Date</th>
                  </tr>
                </thead>

                <tbody>
                  {results.map((item, index) => (
                    <tr key={index}>
                      <td className="num">
                        <strong>{item.score}</strong>
                      </td>

                      <td className="num">{item.totalQuestions}</td>

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
