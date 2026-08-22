import { useNavigate } from "react-router-dom";
import Navbar from "../components/Navbar";
import "../styles/Home.css";

function Home() {
  const navigate = useNavigate();

  const isLoggedIn =
    localStorage.getItem("isLoggedIn") ===
    "true";

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");

    alert("✅ Logout Successful!");

    navigate("/");
    window.location.reload();
  };

  return (
    <>
      <Navbar />

      <div className="home-page">

        <section className="hero">

          <h1>
            🧠 BrainRace Quiz Platform
          </h1>

          <p>
            Challenge your knowledge,
            compete with friends,
            earn certificates and
            climb the leaderboard.
          </p>

          <div className="hero-buttons">

            {!isLoggedIn ? (
              <>
                <button
                  onClick={() =>
                    navigate("/login")
                  }
                >
                  User Login
                </button>

                <button
                  onClick={() =>
                    navigate("/admin-login")
                  }
                >
                  Admin Login
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() =>
                    navigate("/quiz")
                  }
                >
                  ▶ Start Quiz
                </button>

                <button
                  onClick={() =>
                    navigate("/profile")
                  }
                >
                  👤 Profile
                </button>

                <button
                  onClick={() =>
                    navigate("/leaderboard")
                  }
                >
                  🏆 Leaderboard
                </button>

                <button
                  onClick={() =>
                    navigate("/results")
                  }
                >
                  📊 Results
                </button>

                <button
                  onClick={logout}
                >
                  🚪 Logout
                </button>
              </>
            )}

          </div>

        </section>

        <section className="features">

          <div className="feature-card">
            <h2>⚡ Live Quiz</h2>
            <p>
              Take interactive quizzes
              with real-time scoring.
            </p>
          </div>

          <div className="feature-card">
            <h2>🏆 Leaderboard</h2>
            <p>
              Compare scores with
              other participants.
            </p>
          </div>

          <div className="feature-card">
            <h2>🎓 Certificate</h2>
            <p>
              Earn certificates after
              completing quizzes.
            </p>
          </div>

          <div className="feature-card">
            <h2>📊 Analytics</h2>
            <p>
              Track performance and
              monitor progress.
            </p>
          </div>

        </section>

      </div>
    </>
  );
}

export default Home;