import { useEffect, useState } from "react";
import axios from "axios";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid
} from "recharts";

function AdminStats() {
  const [stats, setStats] = useState(null);
    const darkMode =
  localStorage.getItem("theme") ===
  "dark";
  useEffect(() => {
    axios
      .get("http://localhost:5000/api/stats")
      .then((res) => {
        setStats(res.data);
      });
  }, []);

  if (!stats) {
    return <h2>Loading...</h2>;
  }

  const data = [
    {
      name: "Questions",
      value: stats.totalQuestions,
    },
    {
      name: "Attempts",
      value: stats.totalResults,
    },
    {
      name: "Avg Score",
      value: Number(stats.averageScore),
    },
  ];

  return (
    <div
      style={{
        padding: "20px",
        textAlign: "center",
      }}
    >
      <h1>📊 Admin Analytics</h1>

      <BarChart
        width={700}
        height={350}
        data={data}
      >
        <CartesianGrid strokeDasharray="3 3" />

        <XAxis dataKey="name" />

        <YAxis />

        <Tooltip />

        <Bar dataKey="value" />
      </BarChart>
      <button
  className="back-btn"
  onClick={() => navigate("/admin")}
>
  ← Admin Dashboard
</button>
    </div>
  );
}

export default AdminStats;