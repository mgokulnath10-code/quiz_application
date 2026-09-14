import { useEffect, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import axios from "axios";
import {
  FiClock,
  FiCheckCircle,
  FiXCircle,
  FiMinusCircle,
  FiAward,
  FiHome,
  FiLogOut,
  FiAlertTriangle,
  FiRefreshCw,
  FiBarChart2,
  FiTrendingUp,
} from "react-icons/fi";

import {
  MODES,
  OUTCOME,
  ADAPTIVE_STREAK,
  normalizeMode,
  normalizeNegativeMarking,
  normalizeExamDuration,
  normalizeDifficulty,
  describeNegativeMarking,
  describeExamDuration,
  describeMode,
  formatScore,
  formatClock,
  formatDuration,
  accuracyPercent,
  scoreOutcomes,
  buildResultPayload,
  applyAdaptiveAnswer,
  pickAdaptiveQuestion,
  initialServedSequence,
  currentServedQuestion,
  nextQuestionIndex,
  isLastServedQuestion,
  servedProgressPercent,
} from "../utils/quizEngine";
import useSlowFlag from "../utils/useSlowFlag";

import "../styles/Quiz.css";
import "../styles/QuizResult.css";

import API from "../config/api";

const QUESTION_SECONDS = 30;

// Pads a served/short array out to the planned question count.
// Trailing slots read as "unanswered", which is exactly what
// they were: never reached.

const padWith = (list, length, value) => {
  const padded = [...list];

  while (padded.length < length) padded.push(value);

  return padded;
};

const countByDifficulty = (progression) => {
  const counts = {};

  progression.forEach((entry) => {
    counts[entry.difficulty] = (counts[entry.difficulty] || 0) + 1;
  });

  return counts;
};

function Quiz() {
  const navigate = useNavigate();
  const location = useLocation();

  const state = location.state || {};

  const requestedDifficulty = state.difficulty;
  const requestedTopic = state.topic;
  const mode = normalizeMode(state.mode);
  const negativeMarking = normalizeNegativeMarking(
    state.negativeMarking
  );
  const examDurationMinutes = normalizeExamDuration(
    state.examDurationMinutes
  );

  const isAdaptive = mode === MODES.ADAPTIVE;

  const [phase, setPhase] = useState("loading");
  const slowLoad = useSlowFlag(phase === "loading");

  const [loadError, setLoadError] = useState("");

  const [pool, setPool] = useState([]);
  const [plannedTotal, setPlannedTotal] = useState(0);
  const [servingFallback, setServingFallback] = useState(false);
  const [availableLevels, setAvailableLevels] = useState([]);

  // The served question sequence — always one question at a
  // time, starting with the first the run will ask. In adaptive
  // mode the next question is chosen by difficulty; otherwise it
  // is the next question of the pool.
  const [sequence, setSequence] = useState([]);
  const [answers, setAnswers] = useState([]);
  const [outcomes, setOutcomes] = useState([]);
  const [progression, setProgression] = useState([]);

  const [adaptive, setAdaptive] = useState(() => ({
    difficulty: normalizeDifficulty(requestedDifficulty),
    correctStreak: 0,
    wrongStreak: 0,
  }));

  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [questionSeconds, setQuestionSeconds] = useState(
    QUESTION_SECONDS
  );

  const [examSeconds, setExamSeconds] = useState(
    examDurationMinutes * 60
  );

  const [finished, setFinished] = useState(false);
  const [timeUp, setTimeUp] = useState(false);
  const [summary, setSummary] = useState(null);
  const [finalProgression, setFinalProgression] = useState([]);

  const [saveState, setSaveState] = useState("idle");
  const [saveError, setSaveError] = useState("");

  const startedAtRef = useRef(null);
  const deadlineRef = useRef(null);
  const savedPayloadRef = useRef(null);

  const [tabChanged, setTabChanged] = useState(false);

  const user =
    JSON.parse(localStorage.getItem("user")) || { name: "Guest" };

  const token = localStorage.getItem("token") || "";

  /* =====================
     LOAD THE QUESTIONS
  ===================== */

  const loadQuestions = async () => {
    setPhase("loading");
    setLoadError("");

    try {
      if (isAdaptive) {
        if (!requestedTopic) {
          setLoadError(
            "Adaptive mode needs a topic, because it steps " +
              "between the difficulty levels within one topic."
          );
          setPhase("error");

          return;
        }

        // One request returns every difficulty for the topic,
        // so stepping always has unseen material to draw on.
        const res = await axios.get(`${API}/api/questions/pool`, {
          params: { topic: requestedTopic },
        });

        const byDifficulty = res.data?.byDifficulty || {};

        const flat = [
          ...(byDifficulty.easy || []),
          ...(byDifficulty.medium || []),
          ...(byDifficulty.hard || []),
        ];

        setAvailableLevels(
          Array.isArray(res.data?.available) ? res.data.available : []
        );

        if (flat.length === 0) {
          setPhase("empty");

          return;
        }

        const first = pickAdaptiveQuestion({
          pool: flat,
          usedIds: new Set(),
          target: adaptive.difficulty,
        });

        if (!first) {
          setPhase("empty");

          return;
        }

        setPool(flat);
        setPlannedTotal(flat.length);
        setServingFallback(false);
        setSequence(initialServedSequence(flat, first.question));
        setPhase("ready");

        return;
      }

      const res = await axios.get(`${API}/api/questions`, {
        params: {
          ...(requestedDifficulty
            ? { difficulty: requestedDifficulty }
            : {}),
          ...(requestedTopic ? { topic: requestedTopic } : {}),
        },
      });

      if (res.data.length > 0) {
        setPool(res.data);
        setPlannedTotal(res.data.length);
        setServingFallback(false);
        // Serve the first question only; the rest follow as the
        // candidate answers. plannedTotal stays the full pool so
        // padding and scoring still cover every planned question.
        setSequence(initialServedSequence(res.data));
        setPhase("ready");

        return;
      }

      // Nothing matches the selection. The original behaviour
      // was to fall back to the full bank, which is kept — but
      // it is now labelled on screen, and the run is no longer
      // filed against the topic or difficulty it did not use.

      const fallback = await axios.get(`${API}/api/questions`);

      if (fallback.data.length === 0) {
        setPhase("empty");

        return;
      }

      setPool(fallback.data);
      setPlannedTotal(fallback.data.length);
      setServingFallback(true);
      setSequence(initialServedSequence(fallback.data));
      setPhase("ready");
    } catch (error) {
      console.error(error);

      setLoadError(
        error.response?.data?.message ||
          "The request for questions did not complete. This is " +
            "usually a dropped connection or a server that is " +
            "still starting up."
      );

      setPhase("error");
    }
  };

  useEffect(() => {
    startedAtRef.current = Date.now();

    deadlineRef.current =
      examDurationMinutes > 0
        ? Date.now() + examDurationMinutes * 60 * 1000
        : null;

    loadQuestions();
    // Loaded once per mount: the setup screen owns the config.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* =====================
     DURATION, FOR THE RESULT PAYLOAD AND THE SAVE REQUEST
  ===================== */

  const elapsedSeconds = () => {
    const startedAt = startedAtRef.current;

    if (!startedAt) return 1;

    return Math.max(1, Math.round((Date.now() - startedAt) / 1000));
  };

  /* =====================
     EXISTING GUARD RAILS
     (unchanged behaviour)
  ===================== */

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

  const logout = () => {
    localStorage.removeItem("user");
    localStorage.removeItem("isLoggedIn");
    localStorage.removeItem("token");

    navigate("/");
  };

  /* =====================
     SAVING THE RESULT
  ===================== */

  const persistResult = async (payload) => {
    setSaveState("saving");
    setSaveError("");

    try {
      const res = await axios.post(`${API}/api/results`, payload, {
        headers: { Authorization: token },
      });

      if (res.status === 201) setSaveState("saved");
    } catch (error) {
      console.error(error);

      setSaveError(
        error.response?.data?.message ||
          "The score could not be saved to your account."
      );

      setSaveState("error");
    }
  };

  /* =====================
     FINISHING
  ===================== */

  const finishAttempt = ({
    finalAnswers,
    finalOutcomes,
    finalProgression,
    timeUp: endedByClock,
  }) => {
    // Questions beyond the ones served were never reached, so
    // they are scored as unanswered rather than guessed at.
    const scoredQuestions = padWith(
      sequence,
      plannedTotal,
      null
    );

    const paddedAnswers = padWith(
      finalAnswers,
      plannedTotal,
      ""
    );

    const result = scoreOutcomes(
      padWith(finalOutcomes, plannedTotal, OUTCOME.UNANSWERED),
      negativeMarking
    );

    const durationSeconds = elapsedSeconds();

    const payload = buildResultPayload({
      questions: scoredQuestions,
      answers: paddedAnswers,
      // A fallback run did not use the topic or difficulty it
      // was set up for, so it is not filed under them.
      topic: servingFallback ? undefined : requestedTopic,
      difficulty: servingFallback
        ? undefined
        : requestedDifficulty,
      mode,
      negativeMarking,
      durationSeconds,
      difficultyProgression: finalProgression,
    });

    setSummary({
      ...result,
      ...payload,
      durationSeconds,
      accuracy: accuracyPercent(result),
    });

    setFinalProgression(finalProgression);
    setFinished(true);
    setTimeUp(Boolean(endedByClock));

    savedPayloadRef.current = payload;

    persistResult(payload);
  };

  /* =====================
     ANSWERING
  ===================== */

  // Records the current question's outcome and either serves
  // the next question or ends the run.
  //
  // `useSelection` is false only when the whole-exam clock runs
  // out; even then a selection the candidate had already made
  // is counted, matching the per-question timer's behaviour.

  const submitAnswer = ({ useSelection = true } = {}) => {
    if (finished || phase !== "ready") return;

    const current = currentServedQuestion(sequence);

    if (!current) return;

    const given = useSelection ? selectedAnswer : "";

    const outcome =
      given === "" || given === null || given === undefined
        ? OUTCOME.UNANSWERED
        : String(given).trim() ===
            String(current.answer ?? "").trim()
          ? OUTCOME.CORRECT
          : OUTCOME.WRONG;

    const nextAnswers = [...answers, given];
    const nextOutcomes = [...outcomes, outcome];
    const nextProgression = [
      ...progression,
      {
        index: nextQuestionIndex(sequence) - 1,
        difficulty: current.difficulty || requestedDifficulty || null,
      },
    ];

    const nextAdaptive = isAdaptive
      ? applyAdaptiveAnswer(adaptive, outcome)
      : adaptive;

    setAnswers(nextAnswers);
    setOutcomes(nextOutcomes);
    setProgression(nextProgression);
    setAdaptive(nextAdaptive);
    setSelectedAnswer("");
    setQuestionSeconds(QUESTION_SECONDS);

    const reachedEnd = isLastServedQuestion(
      sequence,
      plannedTotal
    );

    if (reachedEnd) {
      finishAttempt({
        finalAnswers: nextAnswers,
        finalOutcomes: nextOutcomes,
        finalProgression: nextProgression,
        timeUp: false,
      });

      return;
    }

    let nextQuestion = null;

    if (isAdaptive) {
      const used = new Set(
        sequence.map((question) => String(question._id))
      );

      const pick = pickAdaptiveQuestion({
        pool,
        usedIds: used,
        target: nextAdaptive.difficulty,
      });

      nextQuestion = pick ? pick.question : null;
    } else {
      nextQuestion = pool[nextQuestionIndex(sequence)] || null;
    }

    if (!nextQuestion) {
      finishAttempt({
        finalAnswers: nextAnswers,
        finalOutcomes: nextOutcomes,
        finalProgression: nextProgression,
        timeUp: false,
      });

      return;
    }

    setSequence((previous) => [...previous, nextQuestion]);
  };

  // The timers run outside the render that created them, so the
  // latest handler is kept in a ref rather than captured.

  const submitRef = useRef(submitAnswer);

  useEffect(() => {
    submitRef.current = submitAnswer;
  });

  /* =====================
     PER-QUESTION TIMER (30s, unchanged)
  ===================== */

  useEffect(() => {
    if (finished || phase !== "ready") return undefined;

    if (questionSeconds <= 0) {
      submitRef.current();

      return undefined;
    }

    const timer = setTimeout(() => {
      setQuestionSeconds((previous) => previous - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [questionSeconds, finished, phase]);

  /* =====================
     WHOLE-EXAM COUNTDOWN
  ===================== */

  useEffect(() => {
    if (!examDurationMinutes || finished || phase !== "ready") {
      return undefined;
    }

    const tick = () => {
      const deadline = deadlineRef.current;

      if (!deadline) return;

      const remaining = Math.max(
        0,
        Math.ceil((deadline - Date.now()) / 1000)
      );

      setExamSeconds(remaining);

      if (remaining <= 0) {
        submitRef.current({ useSelection: true });
        // Mark the run as clock-ended before the handler's own
        // state update lands, so the result screen can say so.
        setTimeUp(true);
      }
    };

    tick();

    const id = setInterval(tick, 1000);

    return () => clearInterval(id);
  }, [examDurationMinutes, finished, phase]);

  /* =====================
     RENDER STATES
  ===================== */

  if (phase === "loading") {
    return (
      <div className="quiz-page">
        <div className="quiz-card">
          <div className="loading-screen" style={{ minHeight: "20vh" }}>
            Loading questions…
          </div>

          {slowLoad && (
            <p className="quiz-status-note" role="status">
              This is taking longer than expected. The server may be
              waking up — the quiz will start on its own.
            </p>
          )}
        </div>
      </div>
    );
  }

  if (phase === "error") {
    return (
      <div className="quiz-page">
        <div className="quiz-card">
          <h2 className="question-text">Questions unavailable</h2>

          <p className="quiz-lead" role="alert">
            {loadError}
          </p>

          <div className="row">
            <button
              className="btn btn-primary"
              onClick={loadQuestions}
            >
              <FiRefreshCw />
              Try again
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/quiz-setup")}
            >
              Back to setup
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (phase === "empty") {
    return (
      <div className="quiz-page">
        <div className="quiz-card">
          <div className="quiz-result-icon" style={{ background: "var(--surface-2)", color: "var(--text-3)" }}>
            <FiAlertTriangle />
          </div>

          <h2 className="question-text" style={{ textAlign: "center" }}>
            No questions to run
          </h2>

          <p className="quiz-lead" style={{ textAlign: "center" }}>
            {requestedTopic
              ? `The bank has no questions recorded for “${requestedTopic}”, so there is nothing to ask.`
              : "The question bank is empty, so there is nothing to ask."}
          </p>

          <div className="row" style={{ justifyContent: "center" }}>
            <button
              className="btn btn-primary"
              onClick={() => navigate("/quiz-setup")}
            >
              Choose another topic
            </button>
          </div>
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

  if (finished && summary) {
    const progressionCounts = countByDifficulty(finalProgression);
    const levelsUsed = Object.keys(progressionCounts);

    return (
      <div className="quiz-result-page">
        <div className="quiz-result-card quiz-result-wide">
          <div
            className="quiz-result-icon"
            style={
              timeUp
                ? {
                    background: "var(--warning-soft)",
                    color: "var(--warning)",
                  }
                : undefined
            }
          >
            {timeUp ? <FiClock /> : <FiCheckCircle />}
          </div>

          <h1 className="quiz-result-title">
            {timeUp ? "Time's up" : "Quiz completed"}
          </h1>

          <p className="quiz-result-sub">
            {timeUp
              ? `The ${examDurationMinutes}-minute exam clock ran out, ` +
                "so the quiz was submitted automatically. Your " +
                "selection on the question you were on was counted; " +
                "questions you had not reached were left unanswered."
              : `Well done, ${user.name}. Here is your result.`}
          </p>

          <div className="quiz-score">
            {formatScore(summary.score)}/{summary.total}
          </div>

          <div className="quiz-percent">
            {summary.accuracy === null
              ? "— correct"
              : `${summary.accuracy}% correct`}
          </div>

          <div className="result-fact-grid">
            <div className="result-fact">
              <span className="result-fact-icon" style={{ color: "var(--success)" }}>
                <FiCheckCircle />
              </span>

              <div>
                <div className="result-fact-value">{summary.correct}</div>
                <div className="result-fact-label">Correct</div>
              </div>
            </div>

            <div className="result-fact">
              <span className="result-fact-icon" style={{ color: "var(--danger)" }}>
                <FiXCircle />
              </span>

              <div>
                <div className="result-fact-value">{summary.wrong}</div>
                <div className="result-fact-label">
                  Wrong
                  {negativeMarking > 0
                    ? ` (−${formatScore(summary.penalty)} marks)`
                    : ""}
                </div>
              </div>
            </div>

            <div className="result-fact">
              <span className="result-fact-icon" style={{ color: "var(--text-3)" }}>
                <FiMinusCircle />
              </span>

              <div>
                <div className="result-fact-value">
                  {summary.unanswered}
                </div>
                <div className="result-fact-label">
                  Unanswered · never penalised
                </div>
              </div>
            </div>

            <div className="result-fact">
              <span className="result-fact-icon" style={{ color: "var(--accent)" }}>
                <FiClock />
              </span>

              <div>
                <div className="result-fact-value">
                  {formatDuration(summary.durationSeconds)}
                </div>
                <div className="result-fact-label">Time taken</div>
              </div>
            </div>
          </div>

          <div className="result-rule-list">
            <div>
              <span className="muted">Mode</span>
              <strong>{describeMode(mode)}</strong>
            </div>

            <div>
              <span className="muted">Topic</span>
              <strong style={{ textTransform: "capitalize" }}>
                {servingFallback
                  ? "Mixed (fallback bank)"
                  : requestedTopic || "—"}
              </strong>
            </div>

            <div>
              <span className="muted">Difficulty</span>
              <strong style={{ textTransform: "capitalize" }}>
                {isAdaptive
                  ? `adaptive from ${
                      requestedDifficulty || adaptive.difficulty
                    }`
                  : servingFallback
                    ? "Mixed"
                    : requestedDifficulty || "—"}
              </strong>
            </div>

            <div>
              <span className="muted">Wrong answers</span>
              <strong>{describeNegativeMarking(negativeMarking)}</strong>
            </div>

            <div>
              <span className="muted">Overall time</span>
              <strong>{describeExamDuration(examDurationMinutes)}</strong>
            </div>
          </div>

          {isAdaptive && levelsUsed.length > 0 && (
            <p className="quiz-status-note">
              Served{" "}
              {levelsUsed
                .map(
                  (level) =>
                    `${level} ×${progressionCounts[level]}`
                )
                .join(", ")}{" "}
              — the level moved after {ADAPTIVE_STREAK} answers in
              a row.
            </p>
          )}

          {saveState === "saving" && (
            <p className="quiz-status-note" role="status">
              Saving your result…
            </p>
          )}

          {saveState === "saved" && (
            <p className="quiz-status-note" role="status">
              Saved to your account. It now appears on your
              dashboard.
            </p>
          )}

          {saveState === "error" && (
            <div className="quiz-save-error" role="alert">
              <FiAlertTriangle aria-hidden="true" />

              <span>
                {saveError} Your score is shown above and has not
                been lost — retry to add it to your history.
              </span>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => persistResult(savedPayloadRef.current)}
              >
                <FiRefreshCw />
                Retry save
              </button>
            </div>
          )}

          <div className="result-buttons">
            <button
              className="btn btn-primary btn-block"
              onClick={() =>
                navigate("/certificate", {
                  state: {
                    score: summary.score,
                    total: summary.total,
                  },
                })
              }
            >
              <FiAward />
              View certificate
            </button>

            <button
              className="btn btn-secondary btn-block"
              onClick={() => navigate("/dashboard")}
            >
              <FiBarChart2 />
              View dashboard
            </button>

            <button
              className="btn btn-secondary btn-block"
              onClick={() => navigate("/quiz-setup")}
            >
              <FiTrendingUp />
              Take another quiz
            </button>

            <button
              className="btn btn-ghost btn-block"
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

  const current = currentServedQuestion(sequence);

  if (!current) {
    return (
      <div className="quiz-page">
        <div className="loading-screen">Preparing the quiz…</div>
      </div>
    );
  }

  const servedDifficulty = isAdaptive
    ? current.difficulty || adaptive.difficulty
    : requestedDifficulty;

  const servedNumber = nextQuestionIndex(sequence);
  const progressPercent = servedProgressPercent(
    sequence,
    plannedTotal
  );
  const onLastQuestion = isLastServedQuestion(
    sequence,
    plannedTotal
  );

  return (
    <div className="quiz-page">
      <div className="quiz-card">
        <div className="quiz-topbar">
          <span className="quiz-meta">
            Question {servedNumber} of {plannedTotal}

            <span
              className="badge badge-accent"
              style={{ marginLeft: 10 }}
            >
              {describeMode(mode)}
            </span>

            {servedDifficulty && (
              <span
                className="badge badge-neutral"
                style={{ marginLeft: 6, textTransform: "capitalize" }}
              >
                {servedDifficulty}
              </span>
            )}

            {requestedTopic && !servingFallback && (
              <span
                className="badge badge-neutral"
                style={{ marginLeft: 6, textTransform: "capitalize" }}
              >
                {requestedTopic}
              </span>
            )}
          </span>

          <span className="quiz-timer-group">
            {examDurationMinutes > 0 && (
              <span
                className={`quiz-timer ${
                  examSeconds <= 60 ? "urgent" : ""
                }`}
                role="timer"
                aria-live="off"
                title="Time left for the whole exam"
              >
                <FiBarChart2 />
                Exam {formatClock(examSeconds)}
              </span>
            )}

            <span
              className={`quiz-timer ${
                questionSeconds <= 10 ? "urgent" : ""
              }`}
              role="timer"
              aria-live="off"
              title="Time left on this question"
            >
              <FiClock />
              {questionSeconds}s
            </span>
          </span>
        </div>

        <p className="quiz-rule-line">
          {describeNegativeMarking(negativeMarking)}
          {examDurationMinutes > 0
            ? ` · ${describeExamDuration(examDurationMinutes)}`
            : ""}
          {isAdaptive
            ? ` · level moves after ${ADAPTIVE_STREAK} in a row` +
              (availableLevels.length > 0
                ? ` · levels in this pool: ${availableLevels.join(", ")}`
                : "")
            : ""}
        </p>

        <div className="progress-container">
          <div
            className="progress-fill"
            style={{ width: `${progressPercent}%` }}
          />
        </div>

        {servingFallback && (
          <div className="quiz-notice" role="status">
            <FiAlertTriangle aria-hidden="true" />

            <span>
              No questions matched your selection, so this run uses
              the whole bank. It will not be filed against the
              topic you picked.
            </span>
          </div>
        )}

        <h2 className="question-text">{current.question}</h2>

        {(current.options || []).map((option, index) => (
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
            Answered: <strong>{outcomes.length}</strong> ·{" "}
            <span className="muted">
              {outcomes.filter((o) => o === OUTCOME.CORRECT).length}{" "}
              correct
            </span>
          </span>

          <div className="row">
            <button
              className="btn btn-secondary"
              onClick={() => submitAnswer({ useSelection: false })}
              title="Skip this question — it counts as unanswered and is never penalised"
            >
              Skip
            </button>

            <button
              className="btn btn-primary"
              onClick={() => submitAnswer()}
            >
              {onLastQuestion ? "Submit quiz" : "Next question"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Quiz;
