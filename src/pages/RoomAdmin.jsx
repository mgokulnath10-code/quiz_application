import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiPlay,
  FiSquare,
  FiTrash2,
  FiPlus,
  FiCopy,
  FiUserMinus,
} from "react-icons/fi";
import RoomChat from "../components/RoomChat";
import "../styles/Rooms.css";

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

function RoomAdmin() {
  const { roomId } = useParams();
  const navigate = useNavigate();

  const [room, setRoom] = useState(null);
  const [tab, setTab] = useState("participants");

  const [question, setQuestion] = useState("");
  const [option1, setOption1] = useState("");
  const [option2, setOption2] = useState("");
  const [option3, setOption3] = useState("");
  const [option4, setOption4] = useState("");
  const [answer, setAnswer] = useState("");

  const user = JSON.parse(localStorage.getItem("user")) || {};

  useEffect(() => {
    fetchRoom();

    const timer = setInterval(fetchRoom, 3000);

    return () => clearInterval(timer);
  }, [roomId]);

  const fetchRoom = async () => {
    try {
      const res = await axios.get(`${API}/api/rooms/${roomId}`, getAuth());

      setRoom(res.data);
    } catch (error) {
      console.error(error);
    }
  };

  const startQuiz = async () => {
    if (!window.confirm("Start the quiz for all participants?")) return;

    try {
      await axios.post(`${API}/api/rooms/${roomId}/start`, {}, getAuth());

      fetchRoom();
    } catch (error) {
      alert(error.response?.data?.message || "Could not start quiz");
    }
  };

  const endQuiz = async () => {
    if (
      !window.confirm(
        "End the quiz for everyone? This cannot be undone."
      )
    ) {
      return;
    }

    try {
      await axios.post(`${API}/api/rooms/${roomId}/end`, {}, getAuth());

      fetchRoom();
    } catch (error) {
      alert(error.response?.data?.message || "Could not end quiz");
    }
  };

  const removeParticipant = async (participant) => {
    if (
      !window.confirm(`Remove ${participant.name} from the room?`)
    ) {
      return;
    }

    try {
      await axios.delete(
        `${API}/api/rooms/${roomId}/participants/${participant.userId}`,
        getAuth()
      );

      fetchRoom();
    } catch (error) {
      alert(
        error.response?.data?.message || "Could not remove participant"
      );
    }
  };

  const addQuestion = async () => {
    if (!question || !option1 || !option2 || !option3 || !option4 || !answer) {
      alert("Please fill in all fields.");
      return;
    }

    try {
      await axios.post(
        `${API}/api/rooms/${roomId}/questions`,
        {
          question,
          options: [option1, option2, option3, option4],
          answer,
        },
        getAuth()
      );

      setQuestion("");
      setOption1("");
      setOption2("");
      setOption3("");
      setOption4("");
      setAnswer("");

      fetchRoom();
    } catch (error) {
      alert(error.response?.data?.message || "Could not add question");
    }
  };

  const deleteQuestion = async (questionId) => {
    if (!window.confirm("Delete this question?")) return;

    try {
      await axios.delete(
        `${API}/api/rooms/${roomId}/questions/${questionId}`,
        getAuth()
      );

      fetchRoom();
    } catch (error) {
      alert(error.response?.data?.message || "Could not delete question");
    }
  };

  const copyRoomId = () => {
    navigator.clipboard.writeText(room.roomId);
  };

  if (!room) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="loading-screen">Loading room...</div>
        </div>
      </div>
    );
  }

  if (room.admin.userId !== user._id) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="card empty-state">
            <h3>Not authorized</h3>

            <p style={{ marginTop: 8 }}>
              Only the room creator can open the admin panel.
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

  const badge = STATUS_BADGE[room.status] || STATUS_BADGE.waiting;

  const leaderboard = room.participants
    .filter((p) => p.submitted && !p.removed)
    .sort((a, b) => b.score - a.score);

  const activeParticipants = room.participants.filter((p) => !p.removed);

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">{room.name}</h1>

            <p className="page-subtitle">
              Room admin panel
            </p>
          </div>

          <div className="row">
            {room.status === "waiting" && (
              <button
                className="btn btn-primary"
                onClick={startQuiz}
                disabled={room.questions.length === 0}
                title={
                  room.questions.length === 0
                    ? "Add at least one question first"
                    : ""
                }
              >
                <FiPlay />
                Start quiz
              </button>
            )}

            {room.status === "active" && (
              <button className="btn btn-danger" onClick={endQuiz}>
                <FiSquare />
                End quiz
              </button>
            )}

            <button className="btn btn-ghost" onClick={() => navigate("/rooms")}>
              <FiArrowLeft />
              Rooms
            </button>
          </div>
        </div>

        <div className="card room-panel-head" style={{ marginBottom: 20 }}>
          <div>
            <span className={`badge ${badge.cls}`}>
              <span className="status-dot" />
              {badge.label}
            </span>

            <div style={{ marginTop: 16 }}>
              <button
                className="room-code-hero"
                title="Click to copy"
                onClick={copyRoomId}
              >
                {room.roomId}

                <FiCopy />
              </button>

              <p className="room-code-hint">
                Share this code so participants can join
              </p>
            </div>
          </div>

          <div className="stat-grid" style={{ marginBottom: 0, flex: 1, minWidth: 220 }}>
            <div className="stat-card">
              <div className="stat-value">{activeParticipants.length}</div>
              <div className="stat-label">Participants</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{room.questions.length}</div>
              <div className="stat-label">Questions</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">{leaderboard.length}</div>
              <div className="stat-label">Submissions</div>
            </div>
          </div>
        </div>

        <div className="tabs">
          <button
            className={`tab ${tab === "participants" ? "active" : ""}`}
            onClick={() => setTab("participants")}
          >
            Participants ({activeParticipants.length})
          </button>

          <button
            className={`tab ${tab === "questions" ? "active" : ""}`}
            onClick={() => setTab("questions")}
          >
            Questions ({room.questions.length})
          </button>

          <button
            className={`tab ${tab === "leaderboard" ? "active" : ""}`}
            onClick={() => setTab("leaderboard")}
          >
            Leaderboard
          </button>

          <button
            className={`tab ${tab === "chat" ? "active" : ""}`}
            onClick={() => setTab("chat")}
          >
            Chat
          </button>
        </div>

        {tab === "participants" && (
          <div>
            {room.status === "waiting" && room.questions.length === 0 && (
              <div
                className="badge badge-warning"
                style={{ marginBottom: 14 }}
              >
                Add at least one question in the Questions tab before starting
              </div>
            )}

            {activeParticipants.length === 0 ? (
              <div className="card empty-state">
                <p>
                  No participants yet. Share the room code{" "}
                  <strong>{room.roomId}</strong> so others can join.
                </p>
              </div>
            ) : (
              activeParticipants.map((p) => (
                <div className="participant-row" key={p.userId}>
                  <span className="p-name">
                    <span className="p-avatar">
                      {p.name.charAt(0).toUpperCase()}
                    </span>

                    {p.name}

                    {p.userId === room.admin.userId && (
                      <span className="badge badge-accent">Admin</span>
                    )}

                    {p.submitted && (
                      <span className="badge badge-success">Submitted</span>
                    )}
                  </span>

                  <span className="row">
                    {p.submitted && (
                      <strong className="num" style={{ fontSize: 14 }}>
                        {p.score}/{p.total}
                      </strong>
                    )}

                    {p.userId !== room.admin.userId && (
                      <button
                        className="btn btn-danger-soft btn-sm"
                        onClick={() => removeParticipant(p)}
                      >
                        <FiUserMinus />
                        Remove
                      </button>
                    )}
                  </span>
                </div>
              ))
            )}
          </div>
        )}

        {tab === "questions" && (
          <div>
            {room.status !== "waiting" && (
              <div
                className="badge badge-neutral"
                style={{ marginBottom: 14 }}
              >
                Questions are locked once the quiz has started
              </div>
            )}

            <div className="card" style={{ marginBottom: 20 }}>
              <h3 className="card-title">Add a room question</h3>

              <p className="card-desc">
                These questions are only used in this room.
              </p>

              <div className="field">
                <label>Question</label>

                <input
                  className="input"
                  type="text"
                  placeholder="Question text"
                  value={question}
                  disabled={room.status !== "waiting"}
                  onChange={(e) => setQuestion(e.target.value)}
                />
              </div>

              <div className="options-grid" style={{ marginBottom: 0 }}>
                <div className="field">
                  <label>Option 1</label>

                  <input
                    className="input"
                    type="text"
                    value={option1}
                    disabled={room.status !== "waiting"}
                    onChange={(e) => setOption1(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Option 2</label>

                  <input
                    className="input"
                    type="text"
                    value={option2}
                    disabled={room.status !== "waiting"}
                    onChange={(e) => setOption2(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Option 3</label>

                  <input
                    className="input"
                    type="text"
                    value={option3}
                    disabled={room.status !== "waiting"}
                    onChange={(e) => setOption3(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label>Option 4</label>

                  <input
                    className="input"
                    type="text"
                    value={option4}
                    disabled={room.status !== "waiting"}
                    onChange={(e) => setOption4(e.target.value)}
                  />
                </div>
              </div>

              <div className="field">
                <label>Correct answer</label>

                <input
                  className="input"
                  type="text"
                  placeholder="Must match one of the options exactly"
                  value={answer}
                  disabled={room.status !== "waiting"}
                  onChange={(e) => setAnswer(e.target.value)}
                />
              </div>

              <button
                className="btn btn-primary"
                disabled={room.status !== "waiting"}
                onClick={addQuestion}
              >
                <FiPlus />
                Save question
              </button>
            </div>

            {room.questions.map((q) => (
              <div className="room-question-card" key={q._id}>
                <h4>{q.question}</h4>

                <ul>
                  {q.options.map((option, index) => (
                    <li key={index}>{option}</li>
                  ))}
                </ul>

                <p className="answer-text">Answer: {q.answer}</p>

                {room.status === "waiting" && (
                  <button
                    className="btn btn-danger-soft btn-sm"
                    onClick={() => deleteQuestion(q._id)}
                  >
                    <FiTrash2 />
                    Delete
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        {tab === "leaderboard" && (
          <div>
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
                      <th>Percentage</th>
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
                        </td>

                        <td className="num">
                          {p.score}/{p.total}
                        </td>

                        <td className="num">
                          {p.total > 0
                            ? Math.round((p.score / p.total) * 100) + "%"
                            : "-"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {tab === "chat" && <RoomChat roomId={room.roomId} />}

      </div>
    </div>
  );
}

export default RoomAdmin;
