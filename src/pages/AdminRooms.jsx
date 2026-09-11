import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import axios from "axios";
import {
  FiArrowLeft,
  FiRefreshCw,
  FiSquare,
  FiTrash2,
  FiUsers,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
} from "../utils/adminAuth";
import "../styles/Rooms.css";

const API = "https://brain-race.onrender.com";

const STATUS_BADGE = {
  waiting: { label: "Waiting", cls: "badge-warning" },
  active: { label: "Live", cls: "badge-success" },
  ended: { label: "Ended", cls: "badge-neutral" },
};

function AdminRooms() {
  const navigate = useNavigate();

  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    fetchRooms();
  }, []);

  const fetchRooms = async () => {
    try {
      const res = await axios.get(
        `${API}/api/rooms/admin/all`,
        getAdminAuth()
      );

      setRooms(res.data);
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        console.error(error);

        alert(
          error.response?.data?.message ||
            "Could not load rooms"
        );
      }
    }
  };

  const forceEnd = async (room) => {
    if (!window.confirm(`Force end the quiz in "${room.name}"?`)) {
      return;
    }

    try {
      await axios.post(
        `${API}/api/rooms/admin/${room.roomId}/end`,
        {},
        getAdminAuth()
      );

      fetchRooms();
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        alert(error.response?.data?.message || "Could not end room");
      }
    }
  };

  const deleteRoom = async (room) => {
    if (
      !window.confirm(
        `Permanently delete room "${room.name}" (${room.roomId})? This cannot be undone.`
      )
    ) {
      return;
    }

    try {
      await axios.delete(
        `${API}/api/rooms/admin/${room.roomId}`,
        getAdminAuth()
      );

      fetchRooms();
    } catch (error) {
      if (!handleAdminError(error, navigate)) {
        alert(error.response?.data?.message || "Could not delete room");
      }
    }
  };

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Rooms</h1>

            <p className="page-subtitle">
              All quiz rooms on the platform. Main admin controls.
            </p>
          </div>

          <div className="row">
            <button className="btn btn-secondary" onClick={fetchRooms}>
              <FiRefreshCw />
              Refresh
            </button>

            <button
              className="btn btn-ghost"
              onClick={() => navigate("/admin")}
            >
              <FiArrowLeft />
              Admin dashboard
            </button>
          </div>
        </div>

        {rooms.length === 0 ? (
          <div className="card empty-state">
            <span className="empty-icon">
              <FiUsers />
            </span>

            <p>No rooms have been created yet.</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Room</th>
                  <th>Admin</th>
                  <th>Status</th>
                  <th>Participants</th>
                  <th>Questions</th>
                  <th></th>
                </tr>
              </thead>

              <tbody>
                {rooms.map((room) => {
                  const badge = STATUS_BADGE[room.status] || STATUS_BADGE.waiting;

                  return (
                    <tr key={room.roomId}>
                      <td>
                        <strong>{room.name}</strong>

                        <span className="room-code">{room.roomId}</span>
                      </td>

                      <td>{room.admin.name}</td>

                      <td>
                        <span className={`badge ${badge.cls}`}>
                          {badge.label}
                        </span>
                      </td>

                      <td className="num">{room.participants.length}</td>

                      <td className="num">{room.questions.length}</td>

                      <td style={{ textAlign: "right" }}>
                        <div className="row" style={{ justifyContent: "flex-end" }}>
                          {room.status !== "ended" && (
                            <button
                              className="btn btn-secondary btn-sm"
                              onClick={() => forceEnd(room)}
                            >
                              <FiSquare />
                              Force end
                            </button>
                          )}

                          <button
                            className="btn btn-danger-soft btn-sm"
                            onClick={() => deleteRoom(room)}
                          >
                            <FiTrash2 />
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

      </div>
    </div>
  );
}

export default AdminRooms;
