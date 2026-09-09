import { useEffect, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  FiClock,
  FiCheckCircle,
  FiAward,
  FiHome,
  FiLogOut,
  FiAlertTriangle,
} from "react-icons/fi";

import "../styles/Quiz.css";
import "../styles/QuizResult.css";

const API = "https://brain-race.onrender.com";

function Quiz() {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);

  useEffect(() => {
    const disableRightClick = (e) => {
      e.preventDefault();
    };

    document.addEventListener("contextmenu", disableRightClick);

    return () => {
      document.removeEventListener("contextmenu", disableRightClick);
    };
  }, []);

  useEffect(() => {
    const preventCopy = (e) => {
      e.preventDefault();
      alert("Copying is disabled during the quiz.");
    };

    document.addEventListener("copy", preventCopy);
    document.addEventListener("cut", preventCopy);
    document.addEventListener("paste", preventCopy);

    return () => {
      document.removeEventListener("copy", preventCopy);
      document.removeEventListener("cut", preventCopy);
      document.removeEventListener("paste", preventCopy);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (
        e.ctrlKey &&
        (e.key === "c" || e.key === "u" || e.key === "s" || e.key === "a")
      ) {
        e.preventDefault();
      }

      if (e.key === "F12") {
        e.preventDefault();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const [tabChanged, setTabChanged] = useState(false);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        setTabChanged(true);
      }
    };

    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, []);

  const navigate = useNavigate();
  const location = useLocation();

  // Selected in the /quiz-setup wizard
  const difficulty = location.state?.difficulty;
  const topic = location.state?.topic;

  const user =
    JSON.parse(localStorage.getItem("user")) || { name: "Guest" };

  useEffect(() => {
    fetchQuestions();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get(`${API}/api/questions`, {
        params: {
          ...(difficulty ? { difficulty } : {}),
          ...(topic ? { topic } : {}),
        },
      });

      if (res.data.length > 0) {
        setQuestions(res.data);

        return;
      }

      // Nothing matches the selection yet —
      // fall back to the full bank.

      const fallback = await axios.get(`${API}/api/questions`);

      setQuestions(fallback.data);
    } catch (error) {
      console.error(error);
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");

    navigate("/");
  };

  const saveResult = async (finalScore) => {
    try {
      await axios.post(`${API}/api/results`, {
        user: user.name,
        score: finalScore,
        totalQuestions: questions.length,
        date: new Date(),
      });
    } catch (error) {
      console.error(error);
    }
  };

  const handleNext = async () => {
    let newScore = score;

    if (selectedAnswer === questions[currentQuestion].answer) {
      newScore++;
      setScore(newScore);
    }

    setSelectedAnswer("");
    setTimeLeft(30);

    if (currentQuestion < questions.length - 1) {
      setCurrentQuestion(currentQuestion + 1);
    } else {
      await saveResult(newScore);
      setShowResult(true);
    }
  };

  useEffect(() => {
    if (showResult || questions.length === 0) return;

    if (timeLeft === 0) {
      handleNext();
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [timeLeft, showResult, questions]);

  if (questions.length === 0) {
    return (
      <div className="quiz-page">
        <div className="loading-screen">
          Loading questions...
        </div>
      </div>
    );
  }

  if (tabChanged) {
    return (
      <div className="quiz-result-page">
        <div className="quiz-result-card">
          <div className="quiz-result-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
            <FiAlertTriangle />
          </div>

          <h1 className="quiz-result-title">Quiz terminated</h1>

          <p className="quiz-result-sub">
            You switched tabs during the quiz.
          </p>

          <div className="result-buttons">
            <button
              className="btn btn-secondary btn-block"
              onClick={() => navigate("/")}
            >
              <FiHome />
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (showResult) {
    const percentage = Math.round((score / questions.length) * 100);

    return (
      <div className="quiz-result-page">
        <div className="quiz-result-card">
          <div className="quiz-result-icon">
            <FiCheckCircle />
          </div>

          <h1 className="quiz-result-title">Quiz completed</h1>

          <p className="quiz-result-sub">
            Well done, {user.name}. Here is your result.
          </p>

          <div className="quiz-score">
            {score}/{questions.length}
          </div>

          <div className="quiz-percent">
            {percentage}% correct
          </div>

          <div className="result-buttons">
            <button
              className="btn btn-primary btn-block"
              onClick={() =>
                navigate("/certificate", {
                  state: { score, total: questions.length },
                })
              }
            >
              <FiAward />
              View certificate
            </button>

            <button
              className="btn btn-secondary btn-block"
              onClick={() => navigate("/")}
            >
              <FiHome />
              Back to home
            </button>

            <button
              className="btn btn-ghost btn-block"
              onClick={logout}
            >
              <FiLogOut />
              Log out
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="quiz-page">
      <div className="quiz-card">
        <div className="quiz-topbar">
          <span className="quiz-meta">
            Question {currentQuestion + 1} of {questions.length}

            {difficulty && (
              <span className="badge badge-accent" style={{ marginLeft: 10, textTransform: "capitalize" }}>
                {difficulty}
              </span>
            )}

            {topic && (
              <span className="badge badge-neutral" style={{ marginLeft: 6, textTransform: "capitalize" }}>
                {topic}
              </span>
            )}
          </span>

          <span
            className={`quiz-timer ${timeLeft <= 10 ? "urgent" : ""}`}
          >
            <FiClock />
            {timeLeft}s
          </span>
        </div>

        <div className="progress-container">
          <div
            className="progress-fill"
            style={{
              width: `${((currentQuestion + 1) / questions.length) * 100}%`,
            }}
          />
        </div>

        <h2 className="question-text">
          {questions[currentQuestion].question}
        </h2>

        {questions[currentQuestion].options.map((option, index) => (
          <label
            key={index}
            className={`option ${
              selectedAnswer === option ? "selected" : ""
            }`}
          >
            <input
              type="radio"
              name="answer"
              value={option}
              checked={selectedAnswer === option}
              onChange={(e) => setSelectedAnswer(e.target.value)}
            />

            {option}
          </label>
        ))}

        <div className="quiz-footer">
          <span className="quiz-score-inline">
            Score: <strong>{score}</strong>
          </span>

          <button
            className="btn btn-primary"
            disabled={!selectedAnswer}
            onClick={handleNext}
          >
            {currentQuestion === questions.length - 1
              ? "Submit quiz"
              : "Next question"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default Quiz;
