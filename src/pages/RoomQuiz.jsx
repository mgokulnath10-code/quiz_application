import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiClock,
  FiLogOut,
  FiAlertTriangle,
  FiCheckCircle,
  FiXCircle,
  FiAward,
  FiLock,
} from "react-icons/fi";
import RoomChat from "../components/RoomChat";
import "../styles/Rooms.css";
import "../styles/Quiz.css";

const API = "https://brain-race.onrender.com";

const getAuth = () => ({
  headers: {
    Authorization: localStorage.getItem("token") || "",
  },
});

const STATUS_BADGE = {
  waiting: { label: "Waiting to start", cls: "badge-warning" },
  active: { label: "Quiz live", cls: "badge-success" },
  ended: { label: "Ended", cls: "badge-neutral" },
};

function RoomQuiz() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [notFound, setNotFound] = useState(false);
  const [needsJoin, setNeedsJoin] = useState(false);

  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState("");
  const [answers, setAnswers] = useState([]);
  const [score, setScore] = useState(0);
  const [timeLeft, setTimeLeft] = useState(30);
  const [submitting, setSubmitting] = useState(false);
  const [terminated, setTerminated] = useState(false);

  const terminatedRef = useRef(false);

  const user = JSON.parse(localStorage.getItem("user")) || { name: "Guest" };

  const roomSettings = room?.settings || {};

  const questionTimer = roomSettings.questionTimer || 30;

  useEffect(() => {
    fetchRoom();

    const timer = setInterval(fetchRoom, 3000);

    return () => clearInterval(timer);
  }, [roomId]);

  const fetchRoom = async () => {
    try {
      const res = await axios.get(`${API}/api/rooms/${roomId}`, getAuth());

      setRoom(res.data);
      setNeedsJoin(false);
    } catch (error) {
      if (error.response?.status === 403) {
        setNeedsJoin(true);
      } else if (error.response?.status === 404) {
        setNotFound(true);
      }

      console.error(error);
    }
  };

  const joinRoom = async () => {
    try {
      await axios.post(
        `${API}/api/rooms/join`,
        { roomId: roomId.toUpperCase(), name: user.name },
        getAuth()
      );

      fetchRoom();
    } catch (error) {
      alert(error.response?.data?.message || "Could not join room");
    }
  };

  const leaveRoom = async () => {
    try {
      await axios.post(`${API}/api/rooms/${roomId}/leave`, {}, getAuth());
    } catch (error) {
      console.error(error);
    }

    navigate("/rooms");
  };

  const submitScore = async (finalScore, finalAnswers) => {
    if (submitting) return;

    setSubmitting(true);

    try {
      await axios.post(
        `${API}/api/rooms/${roomId}/submit`,
        {
          score: finalScore,
          total: room.questions.length,
          answers: finalAnswers,
        },
        getAuth()
      );

      fetchRoom();
    } catch (error) {
      alert(error.response?.data?.message || "Could not submit score");
    } finally {
      setSubmitting(false);
    }
  };

  const handleNext = () => {
    let newScore = score;

    const isCorrect =
      selectedAnswer === room.questions[currentIndex].answer;

    if (isCorrect) {
      newScore++;
      setScore(newScore);
    }

    const newAnswers = [...answers];
    newAnswers[currentIndex] = selectedAnswer;
    setAnswers(newAnswers);

    setSelectedAnswer("");
    setTimeLeft(questionTimer);

    if (currentIndex < room.questions.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      submitScore(newScore, newAnswers);
    }
  };

  const me = room?.participants.find(
    (p) => p.userId === user._id
  );

  const quizActive =
    room &&
    room.status === "active" &&
    me &&
    !me.submitted &&
    !me.removed &&
    !terminated;

  /* Start every attempt at the room's configured timer */

  useEffect(() => {
    if (quizActive) {
      setTimeLeft(questionTimer);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room?.status, room?.roomId]);

  /* Per-question countdown */

  useEffect(() => {
    if (!quizActive) return;

    if (timeLeft === 0) {
      handleNext();
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeft, quizActive]);

  /* Anti-cheat: strict mode terminates the attempt
     when the participant leaves the quiz window */

  const terminateQuiz = () => {
    if (terminatedRef.current) return;

    terminatedRef.current = true;

    setTerminated(true);

    // Lock the attempt by submitting the score
    // earned so far, so a refresh cannot restart it.

    const newAnswers = [...answers];
    newAnswers[currentIndex] = selectedAnswer;

    const newScore =
      score +
      (selectedAnswer === room.questions[currentIndex].answer ? 1 : 0);

    setScore(newScore);

    submitScore(newScore, newAnswers);
  };

  useEffect(() => {
    if (!quizActive || roomSettings.strictMode === false) return;

    const handleVisibility = () => {
      if (document.hidden) {
        terminateQuiz();
      }
    };

    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };

    document.addEventListener("visibilitychange", handleVisibility);
    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quizActive, roomSettings.strictMode]);

  /* Anti-cheat: block copy, cut, paste, select-all,
     right click and devtools shortcuts during the quiz */

  useEffect(() => {
    if (!quizActive) return;

    const prevent = (e) => e.preventDefault();

    const handleKeyDown = (e) => {
      const key = e.key.toLowerCase();

      if (
        e.ctrlKey &&
        ["a", "c", "x", "u", "s", "p"].includes(key)
      ) {
        e.preventDefault();
      }

      if (e.key === "F12") {
        e.preventDefault();
      }
    };

    document.addEventListener("contextmenu", prevent);
    document.addEventListener("copy", prevent);
    document.addEventListener("cut", prevent);
    document.addEventListener("paste", prevent);
    document.addEventListener("selectstart", prevent);
    document.addEventListener("keydown", handleKeyDown);

    document.body.style.userSelect = "none";

    return () => {
      document.removeEventListener("contextmenu", prevent);
      document.removeEventListener("copy", prevent);
      document.removeEventListener("cut", prevent);
      document.removeEventListener("paste", prevent);
      document.removeEventListener("selectstart", prevent);
      document.removeEventListener("keydown", handleKeyDown);

      document.body.style.userSelect = "";
    };
  }, [quizActive]);

  if (notFound) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="card empty-state">
            <span className="empty-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <FiAlertTriangle />
            </span>

            <p>No room exists with the code {roomId.toUpperCase()}.</p>

            <button
              className="btn btn-secondary"
              style={{ marginTop: 16 }}
              onClick={() => navigate("/rooms")}
            >
              <FiArrowLeft />
              Back to rooms
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (needsJoin && !room) {
    return (
      <div className="page">
        <div className="page-inner narrow">
          <div className="card empty-state">
            <h3>Join room {roomId.toUpperCase()}?</h3>

            <p style={{ marginTop: 8 }}>
              You need to join this room before entering it.
            </p>

            <div className="row" style={{ justifyContent: "center", marginTop: 16 }}>
              <button className="btn btn-primary" onClick={joinRoom}>
                Join room
              </button>

              <button className="btn btn-secondary" onClick={() => navigate("/rooms")}>
                <FiArrowLeft />
                Back to rooms
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="loading-screen">Loading room...</div>
        </div>
      </div>
    );
  }

  const isAdminRoom = room.admin.userId === user._id;

  const leaderboard = room.participants
    .filter((p) => p.submitted && !p.removed)
    .sort((a, b) => b.score - a.score);

  if (me?.removed) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="card empty-state">
            <span className="empty-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <FiAlertTriangle />
            </span>

            <p>You were removed from this room by the admin.</p>

            <button
              className="btn btn-secondary"
              style={{ marginTop: 16 }}
              onClick={() => navigate("/rooms")}
            >
              <FiArrowLeft />
              Back to rooms
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ===== TERMINATED SCREEN ===== */

  if (terminated && room.status === "active" && !me?.submitted) {
    return (
      <div className="page">
        <div className="page-inner narrow">
          <div className="card empty-state">
            <span className="empty-icon" style={{ background: "var(--danger-soft)", color: "var(--danger)" }}>
              <FiAlertTriangle />
            </span>

            <h3>Quiz terminated</h3>

            <p style={{ marginTop: 8 }}>
              Reason: <strong>Left the quiz window</strong>
            </p>

            <p className="muted" style={{ marginTop: 6 }}>
              Strict mode is enabled for this room. Your score so far has
              been recorded.
            </p>

            <button
              className="btn btn-secondary"
              style={{ marginTop: 16 }}
              onClick={() => navigate("/rooms")}
            >
              <FiArrowLeft />
              Back to rooms
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ===== QUIZ PHASE ===== */

  if (room.status === "active" && !me?.submitted) {
    if (room.questions.length === 0) {
      return (
        <div className="quiz-result-page">
          <div className="quiz-result-card">
            <h1 className="quiz-result-title">No questions yet</h1>

            <p className="quiz-result-sub">
              The admin hasn't added any questions to this room.
            </p>
          </div>
        </div>
      );
    }

    return (
      <div className="quiz-page">
        <div className="quiz-card">
          <div className="quiz-topbar">
            <span className="quiz-meta">
              {room.name}

              <span className="room-code">{room.roomId}</span>
            </span>

            <span className={`quiz-timer ${timeLeft <= 10 ? "urgent" : ""}`}>
              <FiClock />
              {timeLeft}s
            </span>
          </div>

          <div className="progress-container">
            <div
              className="progress-fill"
              style={{
                width: `${((currentIndex + 1) / room.questions.length) * 100}%`,
              }}
            />
          </div>

          <h2 className="question-text">
            {room.questions[currentIndex].question}
          </h2>

          {room.questions[currentIndex].options.map((option, index) => (
            <label
              key={index}
              className={`option ${selectedAnswer === option ? "selected" : ""}`}
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
              {currentIndex === room.questions.length - 1
                ? "Submit quiz"
                : "Next question"}
            </button>
          </div>
        </div>
      </div>
    );
  }

  /* ===== SUBMITTED / ENDED PHASE ===== */

  if (me?.submitted || room.status === "ended") {
    const badge = STATUS_BADGE[room.status] || STATUS_BADGE.waiting;

    const threshold = roomSettings.certificateThreshold ?? 70;

    const percentage =
      me && me.total > 0
        ? Math.round((me.score / me.total) * 100)
        : 0;

    const certificateEligible =
      me?.submitted && percentage >= threshold;

    const allowReview =
      roomSettings.allowReview !== false && !!me?.submitted;

    return (
      <div className="page">
        <div className="page-inner">

          <div className="page-topbar">
            <div>
              <h1 className="page-title">
                {room.status === "ended" ? "Quiz ended" : "Result submitted"}
              </h1>

              <p className="page-subtitle">{room.name}</p>
            </div>

            <button className="btn btn-secondary" onClick={() => navigate("/rooms")}>
              <FiArrowLeft />
              Back to rooms
            </button>
          </div>

          <div className="card" style={{ marginBottom: 20 }}>
            <div className="row between" style={{ justifyContent: "space-between" }}>
              <div>
                <span className={`badge ${badge.cls}`}>
                  <span className="status-dot" />
                  {badge.label}
                </span>

                <p className="muted" style={{ marginTop: 10 }}>
                  {room.status === "ended"
                    ? "Final results for this room."
                    : "Waiting for the admin to end the quiz..."}
                </p>
              </div>

              {me?.submitted && (
                <div style={{ textAlign: "right" }}>
                  <div className="stat-value" style={{ fontSize: 32, fontWeight: 700 }}>
                    {me.score}/{me.total}
                  </div>

                  <div className="stat-label">{percentage}% correct</div>
                </div>
              )}
            </div>
          </div>

          {me?.submitted && (
            <div className="card" style={{ marginBottom: 20 }}>
              <h3 className="card-title">Certificate</h3>

              {certificateEligible ? (
                <>
                  <p className="card-desc">
                    You scored {percentage}%, above the {threshold}%
                    requirement. Congratulations!
                  </p>

                  <button
                    className="btn btn-primary"
                    onClick={() =>
                      navigate("/certificate", {
                        state: { score: me.score, total: me.total },
                      })
                    }
                  >
                    <FiAward />
                    View certificate
                  </button>
                </>
              ) : (
                <>
                  <p className="card-desc">
                    You need at least <strong>{threshold}%</strong> to earn
                    the certificate for this room.
                  </p>

                  <div className="row">
                    <span className="badge badge-danger">
                      <FiLock />
                      Certificate locked
                    </span>

                    <span className="badge badge-neutral">
                      Required: {threshold}%
                    </span>

                    <span className="badge badge-neutral">
                      Your score: {percentage}%
                    </span>
                  </div>
                </>
              )}
            </div>
          )}

          <h2 className="room-section-title">
            Leaderboard

            <span className="count">{leaderboard.length}</span>
          </h2>

          {leaderboard.length === 0 ? (
            <div className="card empty-state">
              <p>No submissions yet.</p>
            </div>
          ) : (
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Rank</th>
                    <th>Participant</th>
                    <th>Score</th>
                  </tr>
                </thead>

                <tbody>
                  {leaderboard.map((p, index) => (
                    <tr key={p.userId}>
                      <td>
                        <span className={`rank-chip r${index + 1}`}>
                          {index + 1}
                        </span>
                      </td>

                      <td>
                        <strong>{p.name}</strong>

                        {p.userId === user._id && (
                          <span className="badge badge-accent" style={{ marginLeft: 8 }}>
                            You
                          </span>
                        )}
                      </td>

                      <td className="num">
                        {p.score}/{p.total}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {allowReview && (
            <>
              <h2 className="room-section-title">Review answers</h2>

              {room.questions.map((q, index) => {
                const yourAnswer = me?.answers?.[index];

                const isCorrect = yourAnswer === q.answer;

                return (
                  <div className="room-question-card" key={index}>
                    <h4>
                      Question {index + 1}: {q.question}
                    </h4>

                    <div className="review-row">
                      <span className="muted">Your answer:</span>

                      {yourAnswer ? (
                        <span
                          className={`badge ${
                            isCorrect ? "badge-success" : "badge-danger"
                          }`}
                        >
                          {isCorrect ? <FiCheckCircle /> : <FiXCircle />}
                          {yourAnswer}
                        </span>
                      ) : (
                        <span className="badge badge-neutral">
                          Not answered
                        </span>
                      )}
                    </div>

                    <div className="review-row">
                      <span className="muted">Correct answer:</span>

                      <span className="badge badge-success">{q.answer}</span>
                    </div>
                  </div>
                );
              })}
            </>
          )}

          <h2 className="room-section-title">Chat</h2>

          <RoomChat roomId={room.roomId} />

        </div>
      </div>
    );
  }

  /* ===== WAITING PHASE ===== */

  const badge = STATUS_BADGE[room.status] || STATUS_BADGE.waiting;

  const activeParticipants = room.participants.filter((p) => !p.removed);

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">{room.name}</h1>

            <p className="page-subtitle">
              <span className="room-code" style={{ marginLeft: 0 }}>
                {room.roomId}
              </span>
            </p>
          </div>

          <div className="row">
            {!isAdminRoom && (
              <button className="btn btn-danger-soft" onClick={leaveRoom}>
                <FiLogOut />
                Leave room
              </button>
            )}

            <button className="btn btn-ghost" onClick={() => navigate("/rooms")}>
              <FiArrowLeft />
              Rooms
            </button>
          </div>
        </div>

        <div className="card waiting-card" style={{ marginBottom: 20 }}>
          <div className="waiting-spinner" />

          <h2>Waiting for the admin to start</h2>

          <p className="muted">
            The quiz will begin automatically — keep this page open.
          </p>

          <div className="row" style={{ justifyContent: "center", marginBottom: 14 }}>
            <span className={`badge ${badge.cls}`}>
              <span className="status-dot" />
              {badge.label}
            </span>

            <span className="badge badge-neutral">
              <FiClock />
              {questionTimer}s per question
            </span>

            {roomSettings.strictMode !== false && (
              <span className="badge badge-warning">Strict mode</span>
            )}

            <span className="badge badge-neutral">
              Certificate at {roomSettings.certificateThreshold ?? 70}%
            </span>
          </div>

          {roomSettings.strictMode !== false && (
            <p className="room-code-hint">
              Leaving this window during the quiz will terminate your
              attempt.
            </p>
          )}
        </div>

        <h2 className="room-section-title">
          Participants

          <span className="count">{activeParticipants.length}</span>
        </h2>

        {activeParticipants.map((p) => (
          <div className="participant-row" key={p.userId}>
            <span className="p-name">
              <span className="p-avatar">{p.name.charAt(0).toUpperCase()}</span>

              {p.name}

              {p.userId === room.admin.userId && (
                <span className="badge badge-accent">Admin</span>
              )}

              {p.userId === user._id && (
                <span className="badge badge-neutral">You</span>
              )}
            </span>

            {p.submitted && (
              <span className="badge badge-success">
                <FiCheckCircle />
                Submitted
              </span>
            )}
          </div>
        ))}

        <h2 className="room-section-title">Chat</h2>

        <RoomChat roomId={room.roomId} />

      </div>
    </div>
  );
}

export default RoomQuiz;
