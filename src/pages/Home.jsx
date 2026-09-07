import { useNavigate } from "react-router-dom";
import {
  FiPlay,
  FiZap,
  FiTrendingUp,
  FiAward,
  FiBarChart2,
  FiLogOut,
  FiArrowRight,
} from "react-icons/fi";
import Navbar from "../components/Navbar";
import "../styles/Home.css";

function Home() {
  const navigate = useNavigate();

  const isLoggedIn =
    localStorage.getItem("isLoggedIn") === "true";

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");

    navigate("/");
  };

  return (
    <div className="home-page">

      <Navbar />

      <section className="hero">
        <div className="hero-inner">

          <span className="hero-eyebrow">
            Live quiz platform
          </span>

          <h1 className="hero-title">
            Challenge your knowledge.
            <br />

            Compete in real time.
          </h1>

          <p className="hero-copy">
            Create quiz rooms, invite friends with a
            room code, and climb the leaderboard.
            Track every attempt and earn certificates
            as you improve.
          </p>

          <div className="hero-actions">
            {isLoggedIn ? (
              <>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate("/quiz")}
                >
                  <FiPlay />

                  Start a quiz
                </button>

                <button
                  className="btn btn-secondary btn-lg"
                  onClick={() => navigate("/rooms")}
                >
                  Browse rooms

                  <FiArrowRight />
                </button>

                <button
                  className="btn btn-ghost btn-lg"
                  onClick={logout}
                >
                  <FiLogOut />

                  Log out
                </button>
              </>
            ) : (
              <>
                <button
                  className="btn btn-primary btn-lg"
                  onClick={() => navigate("/register")}
                >
                  Create free account

                  <FiArrowRight />
                </button>

                <button
                  className="btn btn-secondary btn-lg"
                  onClick={() => navigate("/login")}
                >
                  Log in
                </button>
              </>
            )}
          </div>

        </div>
      </section>

      <section className="features">
        <div className="features-inner">

          <div className="feature-card">
            <span className="feature-icon">
              <FiZap />
            </span>

            <h3>Live quizzes</h3>

            <p>
              Take timed quizzes with instant scoring
              and tab-switch protection.
            </p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">
              <FiTrendingUp />
            </span>

            <h3>Leaderboards</h3>

            <p>
              Compare scores with other participants
              across every quiz.
            </p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">
              <FiAward />
            </span>

            <h3>Certificates</h3>

            <p>
              Earn a downloadable certificate for
              every completed quiz.
            </p>
          </div>

          <div className="feature-card">
            <span className="feature-icon">
              <FiBarChart2 />
            </span>

            <h3>Analytics</h3>

            <p>
              Track attempts, averages and best
              scores on your profile.
            </p>
          </div>

        </div>
      </section>

    </div>
  );
}

export default Home;
