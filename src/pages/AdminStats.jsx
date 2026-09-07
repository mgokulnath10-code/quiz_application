import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import { FiArrowLeft } from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
} from "../utils/adminAuth";
import "../styles/AdminStats.css";

const API = "https://brain-race.onrender.com";

function AdminStats() {
  const [stats, setStats] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    axios
      .get(`${API}/api/stats`, getAdminAuth())
      .then((res) => {
        setStats(res.data);
      })
      .catch((error) => {
        if (!handleAdminError(error, navigate)) {
          console.error(error);
        }
      });
  }, []);

  if (!stats) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="loading-screen">Loading analytics...</div>
        </div>
      </div>
    );
  }

  const data = [
    { name: "Questions", value: stats.totalQuestions },
    { name: "Attempts", value: stats.totalResults },
    { name: "Avg Score", value: Number(stats.averageScore) },
  ];

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Analytics</h1>

            <p className="page-subtitle">
              Platform-wide quiz activity at a glance.
            </p>
          </div>

          <button
            className="btn btn-secondary"
            onClick={() => navigate("/admin")}
          >
            <FiArrowLeft />
            Admin dashboard
          </button>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{stats.totalQuestions}</div>
            <div className="stat-label">Total questions</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">{stats.totalResults}</div>
            <div className="stat-label">Total attempts</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">{stats.averageScore}</div>
            <div className="stat-label">Average score</div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Activity overview</h3>

          <p className="card-desc">
            Comparison of key platform metrics.
          </p>

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={320}>
              <BarChart data={data}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />

                <XAxis
                  dataKey="name"
                  tick={{ fill: "#475569", fontSize: 13 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                />

                <YAxis
                  tick={{ fill: "#475569", fontSize: 13 }}
                  axisLine={{ stroke: "#cbd5e1" }}
                  tickLine={false}
                />

                <Tooltip
                  cursor={{ fill: "rgba(79, 70, 229, 0.06)" }}
                  contentStyle={{
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    fontSize: 13,
                  }}
                />

                <Bar dataKey="value" fill="#4f46e5" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AdminStats;
