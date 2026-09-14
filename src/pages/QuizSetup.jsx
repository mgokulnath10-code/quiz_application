import { useEffect, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiPlay,
  FiCheck,
  FiAlertTriangle,
  FiRefreshCw,
  FiInfo,
} from "react-icons/fi";
import {
  DIFFICULTY_ORDER,
  MODES,
  NEGATIVE_MARKING_OPTIONS,
  EXAM_DURATION_OPTIONS,
  ADAPTIVE_STREAK,
  describeNegativeMarking,
  describeExamDuration,
} from "../utils/quizEngine";
import useSlowFlag from "../utils/useSlowFlag";
import "../styles/QuizSetup.css";

import API from "../config/api";

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

const STEP_LABELS = [
  "Difficulty",
  "Category",
  "Topic",
  "Options",
];

// One request returns every difficulty for a topic, which is
// what adaptive stepping needs; the fixed difficulties just
// read their own count out of it. Module scope so both the
// topic picker and the deep-link pre-select can use it.

const fetchPool = (topicValue) =>
  axios
    .get(`${API}/api/questions/pool`, {
      params: { topic: topicValue },
    })
    .then((res) => res.data);

const MODE_INFO = [
  {
    value: MODES.PRACTICE,
    label: "Practice",
    hint: "Fixed difficulty you picked. No overall clock.",
  },
  {
    value: MODES.EXAM,
    label: "Exam",
    hint: "One countdown for the whole paper, auto-submitted.",
  },
  {
    value: MODES.ADAPTIVE,
    label: "Adaptive",
    hint: `Starts at your level, moves up after ${ADAPTIVE_STREAK} right and down after ${ADAPTIVE_STREAK} wrong.`,
  },
];

function QuizSetup() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [step, setStep] = useState(1);

  const [meta, setMeta] = useState([]);
  const [metaState, setMetaState] = useState("loading");
  const metaSlow = useSlowFlag(metaState === "loading");

  const [difficulty, setDifficulty] = useState("");
  const [category, setCategory] = useState("");
  const [topic, setTopic] = useState("");

  const [pool, setPool] = useState(null);
  const [poolState, setPoolState] = useState("idle");
  const poolSlow = useSlowFlag(poolState === "loading");

  const [mode, setMode] = useState(MODES.PRACTICE);
  const [negativeMarking, setNegativeMarking] = useState(0);
  const [examDuration, setExamDuration] = useState(0);

  const [presetNote, setPresetNote] = useState("");

  const presetApplied = useRef(false);

  const loadMeta = async () => {
    setMetaState("loading");

    try {
      const res = await axios.get(`${API}/api/questions/meta`);

      setMeta(Array.isArray(res.data) ? res.data : []);
      setMetaState("ready");
    } catch (error) {
      console.error(error);

      setMetaState("error");
    }
  };

  useEffect(() => {
    loadMeta();
  }, []);

  // Deep link from a recommendation or from the placement CTA:
  // /quiz-setup?topic=python&difficulty=easy
  // The selections are applied on the step they belong to, so
  // the wizard still reads left to right.

  useEffect(() => {
    if (metaState !== "ready" || presetApplied.current) return;

    const wantedTopic = searchParams.get("topic");
    const wantedDifficulty = searchParams.get("difficulty");
    const wantedMode = searchParams.get("mode");

    if (!wantedTopic && !wantedDifficulty && !wantedMode) {
      presetApplied.current = true;
      return;
    }

    presetApplied.current = true;

    const entry = wantedTopic
      ? meta.find((row) => row.topic === wantedTopic)
      : null;

    if (wantedMode === "placement") {
      setPresetNote(
        "Placement quiz: pick a difficulty, then a category and " +
          "topic. Your result will start building recommendations."
      );
    }

    if (wantedTopic && !entry) {
      setPresetNote(
        `We could not find the topic “${wantedTopic}” in the ` +
          "question bank, so nothing was pre-selected."
      );

      return;
    }

    if (entry) {
      setCategory(entry.category);
      setTopic(entry.topic);

      // The options step (and its Start button) needs the pool,
      // so a deep link loads it rather than landing on a step
      // that cannot be started.

      setPoolState("loading");

      fetchPool(entry.topic)
        .then((data) => {
          setPool(data);
          setPoolState("ready");
        })
        .catch((error) => {
          console.error(error);

          setPool(null);
          setPoolState("error");
        });
    }

    if (DIFFICULTY_ORDER.includes(wantedDifficulty)) {
      setDifficulty(wantedDifficulty);
    }

    if (entry && DIFFICULTY_ORDER.includes(wantedDifficulty)) {
      setStep(4);
    } else if (entry) {
      setStep(1);
    }
  }, [meta, metaState, searchParams]);

  const categories = [...new Set(meta.map((m) => m.category))];

  const topics = meta.filter((m) => m.category === category);

  const selectDifficulty = (value) => {
    setDifficulty(value);
    setStep(2);
  };

  const selectCategory = (value) => {
    setCategory(value);
    setTopic("");
    setPool(null);
    setPoolState("idle");
    setStep(3);
  };

  const selectTopic = async (value) => {
    setTopic(value);
    setPool(null);
    setPoolState("loading");

    try {
      setPool(await fetchPool(value));
      setPoolState("ready");
    } catch (error) {
      console.error(error);

      setPool(null);
      setPoolState("error");
    }
  };

  const startQuiz = () => {
    navigate("/quiz", {
      state: {
        difficulty,
        topic,
        category,
        mode,
        negativeMarking,
        examDurationMinutes: examDuration,
      },
    });
  };

  const questionCountForRun =
    pool === null
      ? null
      : mode === MODES.ADAPTIVE
        ? pool.total
        : (pool.counts?.[difficulty] ?? 0);

  const poolIsEmpty = questionCountForRun === 0;

  const adaptiveLevels = pool?.available?.length || 0;

  const canStart =
    Boolean(topic) &&
    poolState === "ready" &&
    !poolIsEmpty &&
    (mode !== MODES.ADAPTIVE || adaptiveLevels >= 1);

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

        {presetNote && (
          <div className="card setup-note" role="status">
            <FiInfo aria-hidden="true" />

            <span>{presetNote}</span>
          </div>
        )}

        {/* Progress steps */}

        <div className="setup-steps">
          {STEP_LABELS.map((label, index) => (
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
          ))}
        </div>

        {metaState === "loading" && (
          <div className="card">
            <div className="loading-screen" style={{ minHeight: "20vh" }}>
              Loading the question bank…
            </div>

            {metaSlow && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. The server may
                be waking up — the wizard will continue on its own.
              </p>
            )}
          </div>
        )}

        {metaState === "error" && (
          <div className="card setup-error" role="alert">
            <span className="setup-error-icon">
              <FiAlertTriangle aria-hidden="true" />
            </span>

            <h3 className="card-title">
              Could not load the question bank
            </h3>

            <p className="card-desc">
              The setup wizard needs the list of topics from the
              server, and the request failed. This is usually a
              dropped connection or a backend that is still
              starting. Nothing you entered has been lost.
            </p>

            <button className="btn btn-primary" onClick={loadMeta}>
              <FiRefreshCw />
              Try again
            </button>
          </div>
        )}

        {metaState === "ready" && categories.length === 0 && (
          <div className="card empty-state">
            <span className="empty-icon">
              <FiAlertTriangle />
            </span>

            <h3 className="card-title">No questions yet</h3>

            <p>
              The question bank is empty, so there is nothing to
              practise. An administrator can add questions from
              the admin dashboard.
            </p>
          </div>
        )}

        {/* Step 1 — difficulty */}

        {metaState === "ready" && categories.length > 0 && step === 1 && (
          <div className="card">
            <h3 className="card-title">
              Step 1 — Select difficulty
            </h3>

            <p className="card-desc">
              Easy covers fundamentals, medium covers
              working knowledge, hard covers advanced
              topics. In adaptive mode this is where you
              start.
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

        {metaState === "ready" && categories.length > 0 && step === 2 && (
          <div className="card">
            <h3 className="card-title">
              Step 2 — Select category
            </h3>

            <p className="card-desc">
              Difficulty: <strong>{DIFFICULTY_INFO[difficulty]?.label || "—"}</strong>
            </p>

            <div className="setup-options">
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

        {metaState === "ready" && categories.length > 0 && step === 3 && (
          <div className="card">
            <h3 className="card-title">
              Step 3 — Select topic
            </h3>

            <p className="card-desc">
              {DIFFICULTY_INFO[difficulty]?.label || "—"} ·{" "}
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

                  {topic === entry.topic && poolState === "ready" && (
                    <span className="setup-option-hint">
                      {pool.counts?.[difficulty] ?? 0} question
                      {(pool.counts?.[difficulty] ?? 0) === 1 ? "" : "s"}{" "}
                      at {difficulty} · {pool.total} in total
                    </span>
                  )}

                  {topic === entry.topic && poolState === "loading" && (
                    <span className="setup-option-hint">
                      Checking the bank…
                    </span>
                  )}
                </button>
              ))}
            </div>

            {poolSlow && poolState === "loading" && (
              <p className="muted" role="status" style={{ marginTop: 12 }}>
                This is taking longer than expected.
              </p>
            )}

            {poolState === "error" && (
              <div className="setup-inline-error" role="alert">
                <FiAlertTriangle aria-hidden="true" />

                <span>
                  Could not count the questions for{" "}
                  <strong>{topic}</strong>. Check your connection
                  and try again.
                </span>

                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => selectTopic(topic)}
                >
                  <FiRefreshCw />
                  Retry
                </button>
              </div>
            )}

            {poolState === "ready" && poolIsEmpty && (
              <div className="setup-inline-error" role="alert">
                <FiAlertTriangle aria-hidden="true" />

                <span>
                  There are no {difficulty} questions for{" "}
                  <strong>{topic}</strong> yet. Pick another
                  difficulty or topic
                  {mode === MODES.ADAPTIVE
                    ? ", or switch to a mode that can use the levels that do exist."
                    : "."}
                </span>
              </div>
            )}

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
                disabled={!topic || poolState !== "ready" || poolIsEmpty}
                onClick={() => setStep(4)}
              >
                Quiz options
              </button>
            </div>
          </div>
        )}

        {/* Step 4 — options: mode, negative marking, exam clock */}

        {metaState === "ready" && categories.length > 0 && step === 4 && (
          <>
            <div className="card">
              <h3 className="card-title">Step 4 — Quiz options</h3>

              <p className="card-desc">
                These rules apply to the whole run and are shown
                again during the quiz.
              </p>

              <h4 className="setup-group-title">Mode</h4>

              <div className="setup-options">
                {MODE_INFO.map((info) => (
                  <button
                    key={info.value}
                    className={`setup-option ${
                      mode === info.value ? "selected" : ""
                    }`}
                    onClick={() => setMode(info.value)}
                    aria-pressed={mode === info.value}
                  >
                    <span className="setup-option-title">
                      {info.label}
                    </span>

                    <span className="setup-option-hint">
                      {info.hint}
                    </span>
                  </button>
                ))}
              </div>

              {mode === MODES.ADAPTIVE && poolState === "ready" && (
                <p className="muted" style={{ marginTop: 12 }}>
                  Starting at{" "}
                  <strong>
                    {DIFFICULTY_INFO[difficulty]?.label || difficulty}
                  </strong>
                  .{" "}
                  {adaptiveLevels >= 2
                    ? `This topic has questions at ${pool.available.join(
                        ", "
                      )}, so the difficulty can move.`
                    : `This topic only has ${pool.available.join(
                        ", "
                      )} questions, so the difficulty will stay there.`}
                </p>
              )}

              <h4 className="setup-group-title">
                Negative marking
              </h4>

              <div className="setup-options">
                {NEGATIVE_MARKING_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`setup-option ${
                      negativeMarking === option.value
                        ? "selected"
                        : ""
                    }`}
                    onClick={() => setNegativeMarking(option.value)}
                    aria-pressed={negativeMarking === option.value}
                  >
                    <span className="setup-option-title">
                      {option.label}
                    </span>

                    <span className="setup-option-hint">
                      {option.hint || "Deducted per wrong answer"}
                    </span>
                  </button>
                ))}
              </div>

              <h4 className="setup-group-title">Exam time limit</h4>

              <div className="setup-options">
                {EXAM_DURATION_OPTIONS.map((option) => (
                  <button
                    key={option.value}
                    className={`setup-option ${
                      examDuration === option.value ? "selected" : ""
                    }`}
                    onClick={() => setExamDuration(option.value)}
                    aria-pressed={examDuration === option.value}
                  >
                    <span className="setup-option-title">
                      {option.label}
                    </span>

                    <span className="setup-option-hint">
                      {option.hint || "Whole-exam countdown"}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="card setup-summary">
              <h3 className="card-title">This quiz</h3>

              <p className="card-desc">
                Exactly what will be enforced when you start.
              </p>

              <dl className="setup-summary-list">
                <div>
                  <dt>Mode</dt>
                  <dd>
                    {MODE_INFO.find((m) => m.value === mode)?.label}
                  </dd>
                </div>

                <div>
                  <dt>Topic</dt>
                  <dd style={{ textTransform: "capitalize" }}>
                    {topic || "—"}
                  </dd>
                </div>

                <div>
                  <dt>
                    {mode === MODES.ADAPTIVE
                      ? "Starting difficulty"
                      : "Difficulty"}
                  </dt>
                  <dd>
                    {DIFFICULTY_INFO[difficulty]?.label || "—"}
                  </dd>
                </div>

                <div>
                  <dt>Questions</dt>
                  <dd>
                    {questionCountForRun === null
                      ? "—"
                      : questionCountForRun}
                  </dd>
                </div>

                <div>
                  <dt>Wrong answers</dt>
                  <dd>{describeNegativeMarking(negativeMarking)}</dd>
                </div>

                <div>
                  <dt>Overall time</dt>
                  <dd>{describeExamDuration(examDuration)}</dd>
                </div>

                <div>
                  <dt>Per question</dt>
                  <dd>30s per question, unchanged</dd>
                </div>

                <div>
                  <dt>Score floor</dt>
                  <dd>Never below 0</dd>
                </div>
              </dl>

              <div className="row" style={{ marginTop: 18 }}>
                <button
                  className="btn btn-ghost"
                  onClick={() => setStep(3)}
                >
                  <FiArrowLeft />
                  Back
                </button>

                <button
                  className="btn btn-primary"
                  disabled={!canStart}
                  onClick={startQuiz}
                >
                  <FiPlay />
                  Start quiz
                </button>
              </div>
            </div>
          </>
        )}

      </div>
    </div>
  );
}

export default QuizSetup;
