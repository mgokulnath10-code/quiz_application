import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiArrowRight,
  FiPlay,
  FiCheck,
} from "react-icons/fi";
import "../styles/QuizSetup.css";

const API = "https://brain-race.onrender.com";

const DIFFICULTY_INFO = {
  easy: {
    label: "Easy",
    hint: "Basic syntax, variables, fundamentals",
  },
  medium: {
    label: "Medium",
    hint: "Functions, data structures, logic",
  },
  hard: {
    label: "Hard",
    hint: "Advanced concepts and internals",
  },
};

function QuizSetup() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);

  const [meta, setMeta] = useState([]);

  const [difficulty, setDifficulty] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");

  const [available, setAvailable] = useState(null);

  useEffect(() => {
    axios
      .get(`${API}/api/questions/meta`)
      .then((res) => setMeta(res.data))
      .catch((error) => console.error(error));
  }, []);

  const categories = [
    ...new Set(meta.map((m) => m.category)),
  ];

  const topics = meta.filter(
    (m) => m.category === category
  );

  const selectDifficulty = (value) => {
    setDifficulty(value);
    setStep(2);
  };

  const selectCategory = (value) => {
    setCategory(value);
    setTopic("");
    setStep(3);
  };

  const selectTopic = async (value) => {
    setTopic(value);

    try {
      const res = await axios.get(`${API}/api/questions`, {
        params: { difficulty, topic: value },
      });

      setAvailable(res.data.length);
    } catch (error) {
      console.error(error);

      setAvailable(null);
    }
  };

  const startQuiz = () => {
    navigate("/quiz", {
      state: { difficulty, topic, category },
    });
  };

  return (
    <div className="page">
      <div className="page-inner narrow">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Set up your quiz</h1>

            <p className="page-subtitle">
              Pick a difficulty and topic — questions are
              generated from the bank automatically.
            </p>
          </div>

          <button className="btn btn-ghost" onClick={() => navigate("/")}>
            <FiArrowLeft />
            Home
          </button>
        </div>

        {/* Progress steps */}

        <div className="setup-steps">
          {["Difficulty", "Category", "Topic"].map(
            (label, index) => (
              <div
                key={label}
                className={`setup-step ${
                  step > index + 1 ? "done" : ""
                } ${step === index + 1 ? "active" : ""}`}
              >
                <span className="setup-step-dot">
                  {step > index + 1 ? <FiCheck /> : index + 1}
                </span>

                {label}
              </div>
            )
          )}
        </div>

        {/* Step 1 — difficulty */}

        {step === 1 && (
          <div className="card">
            <h3 className="card-title">
              Step 1 — Select difficulty
            </h3>

            <p className="card-desc">
              Easy covers fundamentals, medium covers
              working knowledge, hard covers advanced
              topics.
            </p>

            <div className="setup-options">
              {Object.entries(DIFFICULTY_INFO).map(
                ([value, info]) => (
                  <button
                    key={value}
                    className={`setup-option ${`diff-${value}`} ${
                      difficulty === value ? "selected" : ""
                    }`}
                    onClick={() => selectDifficulty(value)}
                  >
                    <span className="setup-option-title">
                      {info.label}
                    </span>

                    <span className="setup-option-hint">
                      {info.hint}
                    </span>
                  </button>
                )
              )}
            </div>
          </div>
        )}

        {/* Step 2 — category */}

        {step === 2 && (
          <div className="card">
            <h3 className="card-title">
              Step 2 — Select category
            </h3>

            <p className="card-desc">
              Difficulty: <strong>{DIFFICULTY_INFO[difficulty]?.label}</strong>
            </p>

            <div className="setup-options">
              {categories.length === 0 && (
                <p className="muted">
                  No categories available yet.
                </p>
              )}

              {categories.map((value) => (
                <button
                  key={value}
                  className="setup-option"
                  onClick={() => selectCategory(value)}
                >
                  <span className="setup-option-title" style={{ textTransform: "capitalize" }}>
                    {value}
                  </span>
                </button>
              ))}
            </div>

            <button
              className="btn btn-ghost"
              style={{ marginTop: 16 }}
              onClick={() => setStep(1)}
            >
              <FiArrowLeft />
              Back
            </button>
          </div>
        )}

        {/* Step 3 — topic */}

        {step === 3 && (
          <div className="card">
            <h3 className="card-title">
              Step 3 — Select topic
            </h3>

            <p className="card-desc">
              {DIFFICULTY_INFO[difficulty]?.label} ·{" "}
              <span style={{ textTransform: "capitalize" }}>
                {category}
              </span>
            </p>

            <div className="setup-options">
              {topics.length === 0 && (
                <p className="muted">
                  No topics in this category yet.
                </p>
              )}

              {topics.map((entry) => (
                <button
                  key={entry.topic}
                  className={`setup-option ${
                    topic === entry.topic ? "selected" : ""
                  }`}
                  style={{ textTransform: "capitalize" }}
                  onClick={() => selectTopic(entry.topic)}
                >
                  <span className="setup-option-title">
                    {entry.topic}
                  </span>

                  {topic === entry.topic && available !== null && (
                    <span className="setup-option-hint">
                      {available} question
                      {available === 1 ? "" : "s"} available
                    </span>
                  )}
                </button>
              ))}
            </div>

            <div className="row" style={{ marginTop: 16 }}>
              <button
                className="btn btn-ghost"
                onClick={() => setStep(2)}
              >
                <FiArrowLeft />
                Back
              </button>

              <button
                className="btn btn-primary"
                disabled={!topic || available === 0}
                onClick={startQuiz}
              >
                <FiPlay />
                Start quiz
              </button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

export default QuizSetup;
