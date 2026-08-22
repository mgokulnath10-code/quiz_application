import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";

import "../styles/Quiz.css";
import "../styles/QuizResult.css";

function Quiz() {
  const [questions, setQuestions] = useState([]);
  const [currentQuestion, setCurrentQuestion] =
    useState(0);
  const [selectedAnswer, setSelectedAnswer] =
    useState("");
  const [score, setScore] = useState(0);
  const [showResult, setShowResult] =
    useState(false);
  const [timeLeft, setTimeLeft] =
    useState(30);

  const navigate = useNavigate();

  const user =
    JSON.parse(localStorage.getItem("user")) ||
    { name: "Guest" };

  useEffect(() => {
    fetchQuestions();
  }, []);

  const fetchQuestions = async () => {
    try {
      const res = await axios.get(
        "http://localhost:5000/api/questions"
      );

      setQuestions(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");

    alert("✅ Logout Successful!");

    navigate("/");
  };

  const saveResult = async (finalScore) => {
    try {
      await axios.post(
        "http://localhost:5000/api/results",
        {
          user: user.name,
          score: finalScore,
          totalQuestions:
            questions.length,
          date: new Date(),
        }
      );
    } catch (error) {
      console.error(error);
    }
  };

  const handleNext = async () => {
    let newScore = score;

    if (
      selectedAnswer ===
      questions[currentQuestion].answer
    ) {
      newScore++;
      setScore(newScore);
    }

    setSelectedAnswer("");
    setTimeLeft(30);

    if (
      currentQuestion <
      questions.length - 1
    ) {
      setCurrentQuestion(
        currentQuestion + 1
      );
    } else {
      await saveResult(newScore);
      setShowResult(true);
    }
  };

  useEffect(() => {
    if (
      showResult ||
      questions.length === 0
    )
      return;

    if (timeLeft === 0) {
      handleNext();
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [
    timeLeft,
    showResult,
    questions,
  ]);

  if (questions.length === 0) {
    return (
      <div className="loading">
        <h2>Loading Questions...</h2>
      </div>
    );
  }

  if (showResult) {
    return (
      <div className="quiz-result-page">

        <div className="quiz-result-card">

          <div className="quiz-result-icon">
            🎉
          </div>

          <h1 className="quiz-result-title">
            Quiz Completed
          </h1>

          <div className="quiz-score">
            {score}/{questions.length}
          </div>

          <div className="quiz-percent">
            Percentage:{" "}
            {Math.round(
              (score /
                questions.length) *
                100
            )}
            %
          </div>

          <div className="result-buttons">

            <button
              className="result-btn certificate-btn"
              onClick={() =>
                navigate(
                  "/certificate",
                  {
                    state: {
                      score,
                      total:
                        questions.length,
                    },
                  }
                )
              }
            >
              🎓 Certificate
            </button>

            <button
              className="result-btn home-btn"
              onClick={() =>
                navigate("/")
              }
            >
              🏠 Home
            </button>

            <button
              className="result-btn logout-btn"
              onClick={logout}
            >
              🚪 Logout
            </button>

          </div>

        </div>

      </div>
    );
  }

  return (
    <div className="quiz-page">

      <div className="quiz-card">

        <div className="quiz-header">

          <h3>
            Welcome, {user.name}
          </h3>

          <button
            className="logout-btn"
            onClick={logout}
          >
            Logout
          </button>

        </div>

        <h2>
          Question{" "}
          {currentQuestion + 1}
          {" "}of{" "}
          {questions.length}
        </h2>

        <div className="progress-container">

          <div
            className="progress-fill"
            style={{
              width: `${
                ((currentQuestion +
                  1) /
                  questions.length) *
                100
              }%`,
            }}
          />

        </div>

        <div className="timer">
          ⏳ {timeLeft}s
        </div>

        <h2 className="question-text">
          {
            questions[
              currentQuestion
            ].question
          }
        </h2>

        {questions[
          currentQuestion
        ].options.map(
          (option, index) => (
            <label
              key={index}
              className="option"
            >
              <input
                type="radio"
                name="answer"
                value={option}
                checked={
                  selectedAnswer ===
                  option
                }
                onChange={(e) =>
                  setSelectedAnswer(
                    e.target.value
                  )
                }
              />

              {option}
            </label>
          )
        )}

        <button
          className="next-btn"
          disabled={!selectedAnswer}
          onClick={handleNext}
        >
          {currentQuestion ===
          questions.length - 1
            ? "Submit Quiz"
            : "Next Question"}
        </button>

        <div className="bottom-buttons">

          

         
        </div>

        <h3 className="score">
          Current Score: {score}
        </h3>

      </div>

    </div>
  );
}

export default Quiz;