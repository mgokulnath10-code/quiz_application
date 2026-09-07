import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiPlus,
  FiLogIn,
  FiCopy,
  FiUsers,
  FiHelpCircle,
  FiShield,
} from "react-icons/fi";
import "../styles/Rooms.css";

const API = "https://brain-race.onrender.com";

const getAuth = () => ({
  headers: {
    Authorization: localStorage.getItem("token") || "",
  },
});

const STATUS_BADGE = {
  waiting: { label: "Waiting", cls: "badge-warning" },
  active: { label: "Live", cls: "badge-success" },
  ended: { label: "Ended", cls: "badge-neutral" },
};

function Rooms() {
  const navigate = useNavigate();

  const user = JSON.parse(localStorage.getItem("user")) || { name: "Guest" };

  const [roomName, setRoomName] = useState("");
  const [joinId, setJoinId] = useState("");

  const [myRooms, setMyRooms] = useState([]);
  const [joinedRooms, setJoinedRooms] = useState([]);

  const [createdRoom, setCreatedRoom] = useState(null);

  const fetchRooms = async () => {
    try {
      const mine = await axios.get(`${API}/api/rooms/mine`, getAuth());

      const joined = await axios.get(`${API}/api/rooms/joined`, getAuth());

      setMyRooms(mine.data);
      setJoinedRooms(joined.data);
    } catch (error) {
      console.error(error);
    }
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const createRoom = async () => {
    if (!roomName.trim()) {
      alert("Please enter a room name.");
      return;
    }

    try {
      const res = await axios.post(
        `${API}/api/rooms`,
        { name: roomName.trim(), adminName: user.name },
        getAuth()
      );

      setCreatedRoom(res.data.room);
      setRoomName("");
      fetchRooms();
    } catch (error) {
      alert(error.response?.data?.message || "Error creating room");
    }
  };

  const joinRoom = async () => {
    if (!joinId.trim()) {
      alert("Please enter a room ID.");
      return;
    }

    try {
      await axios.post(
        `${API}/api/rooms/join`,
        { roomId: joinId.trim().toUpperCase(), name: user.name },
        getAuth()
      );

      navigate(`/room/${joinId.trim().toUpperCase()}`);
    } catch (error) {
      alert(error.response?.data?.message || "Could not join room");
    }
  };

  const copyRoomId = (roomId) => {
    navigator.clipboard.writeText(roomId);
  };

  const isRoomAdmin = (room) =>
    room.admin.userId ===
    (JSON.parse(localStorage.getItem("user")) || {})._id;

  const renderRoomTile = (room) => {
    const badge = STATUS_BADGE[room.status] || STATUS_BADGE.waiting;

    return (
      <div className="room-tile" key={room.roomId}>
        <div className="room-tile-head">
          <h3>{room.name}</h3>

          <span className={`badge ${badge.cls}`}>
            <span className="status-dot" />
            {badge.label}
          </span>
        </div>

        <span className="room-code">{room.roomId}</span>

        <div className="room-tile-meta">
          <span>
            <FiUsers />
            {room.participants.length} participants
          </span>

          <span>
            <FiHelpCircle />
            {room.questions.length} questions
          </span>
        </div>

        <div className="row">
          {isRoomAdmin(room) ? (
            <>
              <button
                className="btn btn-primary btn-sm"
                onClick={() => navigate(`/room-admin/${room.roomId}`)}
              >
                <FiShield />
                Admin panel
              </button>

              <button
                className="btn btn-secondary btn-sm"
                onClick={() => navigate(`/room/${room.roomId}`)}
              >
                Open room
              </button>
            </>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={() => navigate(`/room/${room.roomId}`)}
            >
              Enter room
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Quiz rooms</h1>

            <p className="page-subtitle">
              Create a room and invite people with its code, or join an
              existing room.
            </p>
          </div>

          <div className="row">
            <button className="btn btn-secondary" onClick={fetchRooms}>
              <FiRefreshCw />
              Refresh
            </button>

            <button className="btn btn-ghost" onClick={() => navigate("/")}>
              <FiArrowLeft />
              Home
            </button>
          </div>
        </div>

        {createdRoom && (
          <div className="card" style={{ marginBottom: 20 }}>
            <h3 className="card-title">Room created</h3>

            <p className="card-desc">
              Share this code so participants can join. You are the admin
              of this room.
            </p>

            <div style={{ textAlign: "center", padding: "8px 0 4px" }}>
              <button
                className="room-code-hero"
                title="Click to copy"
                onClick={() => copyRoomId(createdRoom.roomId)}
              >
                {createdRoom.roomId}

                <FiCopy />
              </button>

              <p className="room-code-hint">
                Click the code to copy it to your clipboard
              </p>
            </div>

            <div className="row">
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/room-admin/${createdRoom.roomId}`)}
              >
                <FiShield />
                Go to admin panel
              </button>

              <button
                className="btn btn-ghost"
                onClick={() => setCreatedRoom(null)}
              >
                Close
              </button>
            </div>
          </div>
        )}

        <div className="grid-2">
          <div className="card">
            <h3 className="card-title">Create a room</h3>

            <p className="card-desc">
              You become the room admin: start or end the quiz, manage
              participants and add your own questions.
            </p>

            <div className="field">
              <label htmlFor="room-name">Room name</label>

              <input
                id="room-name"
                className="input"
                type="text"
                placeholder="e.g. Java Quiz Room"
                value={roomName}
                onChange={(e) => setRoomName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createRoom();
                }}
              />
            </div>

            <button className="btn btn-primary" onClick={createRoom}>
              <FiPlus />
              Create room
            </button>
          </div>

          <div className="card">
            <h3 className="card-title">Join a room</h3>

            <p className="card-desc">
              Enter the code shared by the room creator to participate in
              the quiz.
            </p>

            <div className="field">
              <label htmlFor="room-join">Room code</label>

              <input
                id="room-join"
                className="input"
                type="text"
                placeholder="e.g. BR1234"
                style={{ letterSpacing: ".08em", textTransform: "uppercase" }}
                value={joinId}
                onChange={(e) => setJoinId(e.target.value.toUpperCase())}
                onKeyDown={(e) => {
                  if (e.key === "Enter") joinRoom();
                }}
              />
            </div>

            <button className="btn btn-primary" onClick={joinRoom}>
              <FiLogIn />
              Join room
            </button>
          </div>
        </div>

        <h2 className="room-section-title">
          Rooms you administer

          <span className="count">{myRooms.length}</span>
        </h2>

        {myRooms.length === 0 ? (
          <p className="muted">You haven't created any rooms yet.</p>
        ) : (
          <div className="room-list">{myRooms.map(renderRoomTile)}</div>
        )}

        <h2 className="room-section-title">
          Rooms you joined

          <span className="count">{joinedRooms.length}</span>
        </h2>

        {joinedRooms.length === 0 ? (
          <p className="muted">You haven't joined any rooms yet.</p>
        ) : (
          <div className="room-list">{joinedRooms.map(renderRoomTile)}</div>
        )}

      </div>
    </div>
  );
}

export default Rooms;
