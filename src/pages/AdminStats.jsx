import { useEffect, useState } from "react";
import axios from "axios";
import { useNavigate } from "react-router-dom";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  Cell,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
} from "recharts";
import {
  FiArrowLeft,
  FiAlertTriangle,
  FiRefreshCw,
  FiActivity,
  FiUsers,
  FiDownload,
} from "react-icons/fi";
import {
  getAdminAuth,
  handleAdminError,
} from "../utils/adminAuth";
import useSlowFlag from "../utils/useSlowFlag";
import {
  CHART,
  AXIS_PROPS,
  TOOLTIP_PROPS,
  GRID_PROPS,
} from "../utils/chartTheme";
import "../styles/AdminStats.css";

import API from "../config/api";

const DASH = "—";

const orDash = (value) =>
  value === null || value === undefined || value === ""
    ? DASH
    : value;

const shortDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return DASH;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
};

function AdminStats() {
  const [stats, setStats] = useState(null);
  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const slowLoad = useSlowFlag(state === "loading");

  const navigate = useNavigate();

  const exportResults = async () => {
    setExportBusy(true);
    setExportError("");

    try {
      const res = await axios.get(`${API}/api/admin/results/export`, {
        ...getAdminAuth(),
        responseType: "blob",
      });

      const url = URL.createObjectURL(res.data);
      const link = document.createElement("a");

      link.href = url;
      link.download = "brainrace-results.csv";
      document.body.appendChild(link);
      link.click();
      link.remove();

      URL.revokeObjectURL(url);
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      console.error(error);

      setExportError("Could not export results. Please try again.");
    } finally {
      setExportBusy(false);
    }
  };

  const load = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      const res = await axios.get(`${API}/api/stats`, getAdminAuth());

      setStats(res.data);
      setState("ready");
    } catch (error) {
      if (handleAdminError(error, navigate)) return;

      console.error(error);

      setErrorMessage(
        error.response?.data?.message ||
          "The analytics service did not respond."
      );

      setState("error");
    }
  };

  useEffect(() => {
    load();
    // Loaded once on mount; Refresh re-runs it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (state === "loading") {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="card">
            <div className="loading-screen" style={{ minHeight: "24vh" }}>
              Loading analytics…
            </div>

            {slowLoad && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. Large result sets
                take a moment to aggregate.
              </p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (state === "error") {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="card empty-state" role="alert">
            <span
              className="empty-icon"
              style={{
                background: "var(--danger-soft)",
                color: "var(--danger)",
              }}
            >
              <FiAlertTriangle />
            </span>

            <h3 className="card-title">Could not load analytics</h3>

            <p style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              {errorMessage}
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={load}>
                <FiRefreshCw />
                Try again
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => navigate("/admin")}
              >
                <FiArrowLeft />
                Admin dashboard
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const attemptsOverTime = stats.attemptsOverTime || [];
  const scoreDistribution = stats.scoreDistribution || [];
  const topicAccuracy = stats.topicAccuracy || [];
  const mostMissed = stats.mostMissedQuestions || [];

  const windowTotal = attemptsOverTime.reduce(
    (sum, point) => sum + point.attempts,
    0
  );

  const comparison = [
    { name: "Questions", value: stats.totalQuestions },
    { name: "Attempts", value: stats.totalResults },
    { name: "Accounts", value: stats.totalUsers ?? 0 },
    { name: "Avg score", value: Number(stats.averageScore) || 0 },
  ];

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Analytics</h1>

            <p className="page-subtitle">
              Platform-wide quiz activity, aggregated from saved
              results.
            </p>
          </div>

          <div className="row">
            <button
              className="btn btn-secondary"
              onClick={exportResults}
              disabled={exportBusy}
            >
              <FiDownload />
              {exportBusy ? "Exporting…" : "Export results CSV"}
            </button>

            <button className="btn btn-secondary" onClick={load}>
              <FiRefreshCw />
              Refresh
            </button>

            <button
              className="btn btn-secondary"
              onClick={() => navigate("/admin")}
            >
              <FiArrowLeft />
              Admin dashboard
            </button>
          </div>
        </div>

        {exportError && (
          <div className="admin-notice admin-notice-error" role="alert">
            <FiAlertTriangle aria-hidden="true" />
            <span>{exportError}</span>
          </div>
        )}

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

          <div className="stat-card">
            <div className="stat-value">{orDash(stats.totalUsers)}</div>
            <div className="stat-label">Registered accounts</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {orDash(stats.recordedAccuracy)}
              {stats.recordedAccuracy !== null ? "%" : ""}
            </div>
            <div className="stat-label">
              Recorded accuracy
              {stats.accuracySampleSize
                ? ` · ${stats.accuracySampleSize} attempt(s)`
                : " · no per-question data yet"}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {orDash(stats.activeUsers?.last7Days)}
            </div>
            <div className="stat-label">
              Active in 7 days ·{" "}
              {orDash(stats.activeUsers?.last30Days)} in 30
            </div>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Activity overview</h3>

          <p className="card-desc">
            Comparison of key platform metrics.
          </p>

          <div className="chart-wrap">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={comparison}>
                <CartesianGrid {...GRID_PROPS} />

                <XAxis dataKey="name" {...AXIS_PROPS} />

                <YAxis {...AXIS_PROPS} />

                <Tooltip
                  {...TOOLTIP_PROPS}
                  cursor={{ fill: CHART.cursor }}
                />

                <Bar
                  dataKey="value"
                  fill={CHART.accent}
                  radius={[6, 6, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">
            Attempts over time · last {stats.windowDays ?? 30} days
          </h3>

          <p className="card-desc">
            {windowTotal} attempt{windowTotal === 1 ? "" : "s"} recorded
            in the window. Days with no attempts still appear.
          </p>

          {stats.totalResults === 0 ? (
            <div className="stats-empty">
              <FiActivity aria-hidden="true" />

              <p>No attempts have been saved yet.</p>
            </div>
          ) : (
            <div className="chart-wrap">
              <ResponsiveContainer width="100%" height={280}>
                <LineChart
                  data={attemptsOverTime}
                  margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
                >
                  <CartesianGrid {...GRID_PROPS} />

                  <XAxis
                    dataKey="date"
                    tickFormatter={shortDate}
                    minTickGap={24}
                    {...AXIS_PROPS}
                  />

                  <YAxis allowDecimals={false} {...AXIS_PROPS} />

                  <Tooltip
                    {...TOOLTIP_PROPS}
                    cursor={{ stroke: CHART.grid }}
                    labelFormatter={(label) => shortDate(label)}
                  />

                  <Line
                    type="monotone"
                    dataKey="attempts"
                    stroke={CHART.accent}
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>

        <div className="grid-2">
          <div className="card">
            <h3 className="card-title">Score distribution</h3>

            <p className="card-desc">
              Attempts bucketed by score as a share of the questions
              asked.
            </p>

            {stats.totalResults === 0 ? (
              <div className="stats-empty">
                <FiActivity aria-hidden="true" />

                <p>No attempts to distribute yet.</p>
              </div>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={scoreDistribution}
                    margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
                  >
                    <CartesianGrid {...GRID_PROPS} />

                    <XAxis dataKey="bucket" {...AXIS_PROPS} />

                    <YAxis allowDecimals={false} {...AXIS_PROPS} />

                    <Tooltip
                      {...TOOLTIP_PROPS}
                      cursor={{ fill: CHART.cursor }}
                      formatter={(value) => [value, "Attempts"]}
                    />

                    <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                      {scoreDistribution.map((entry, index) => (
                        <Cell
                          key={entry.bucket}
                          fill={
                            index >= 3 ? CHART.success : CHART.warning
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Accuracy by topic</h3>

            <p className="card-desc">
              Weakest first. Topics with no recorded per-question
              results are listed as “—” rather than zero.
            </p>

            {topicAccuracy.length === 0 ? (
              <div className="stats-empty">
                <FiActivity aria-hidden="true" />

                <p>
                  No attempt has recorded a topic yet. Quizzes taken
                  from now on always will.
                </p>
              </div>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    layout="vertical"
                    data={topicAccuracy}
                    margin={{ top: 8, right: 16, bottom: 0, left: 24 }}
                  >
                    <CartesianGrid {...GRID_PROPS} horizontal={false} vertical />

                    <XAxis
                      type="number"
                      domain={[0, 100]}
                      unit="%"
                      {...AXIS_PROPS}
                    />

                    <YAxis
                      type="category"
                      dataKey="topic"
                      width={90}
                      {...AXIS_PROPS}
                    />

                    <Tooltip
                      {...TOOLTIP_PROPS}
                      cursor={{ fill: CHART.cursor }}
                      formatter={(value, _name, entry) => [
                        value === null ? DASH : `${value}%`,
                        `${entry?.payload?.attempts ?? 0} attempt(s)`,
                      ]}
                    />

                    <Bar
                      dataKey="accuracy"
                      radius={[0, 6, 6, 0]}
                      fill={CHART.accent}
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        <div className="card">
          <h3 className="card-title">Most-missed questions</h3>

          <p className="card-desc">
            Ranked by the number of wrong answers, across attempts
            that recorded per-question outcomes.
          </p>

          {mostMissed.length === 0 ? (
            <div className="stats-empty">
              <FiAlertTriangle aria-hidden="true" />

              <p>
                No attempt has recorded per-question outcomes yet, so
                this cannot be calculated. It fills in as new quizzes
                are submitted.
              </p>
            </div>
          ) : (
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Question</th>
                    <th>Topic</th>
                    <th>Level</th>
                    <th className="num">Served</th>
                    <th className="num">Wrong</th>
                    <th className="num">Miss rate</th>
                  </tr>
                </thead>

                <tbody>
                  {mostMissed.map((entry) => (
                    <tr key={entry.questionId}>
                      <td
                        className="dash-cell-truncate"
                        style={{ maxWidth: 380 }}
                        title={entry.question || entry.questionId}
                      >
                        {entry.question || `Question ${entry.questionId}`}
                      </td>

                      <td style={{ textTransform: "capitalize" }}>
                        {orDash(entry.topic)}
                      </td>

                      <td style={{ textTransform: "capitalize" }}>
                        {orDash(entry.difficulty)}
                      </td>

                      <td className="num">{entry.served}</td>

                      <td className="num">
                        <strong>{entry.misses}</strong>
                      </td>

                      <td className="num">
                        <span className="badge badge-danger">
                          {entry.missRate}%
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <div className="card">
          <h3 className="card-title">Accounts</h3>

          <p className="card-desc">
            Distinct accounts that have saved at least one attempt.
          </p>

          <div className="stat-grid" style={{ marginBottom: 0 }}>
            <div className="stat-card">
              <div className="stat-value">
                {orDash(stats.usersWithAttempts)}
              </div>
              <div className="stat-label">With at least one attempt</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {orDash(stats.activeUsers?.last7Days)}
              </div>
              <div className="stat-label">Active in the last 7 days</div>
            </div>

            <div className="stat-card">
              <div className="stat-value">
                {orDash(stats.activeUsers?.last30Days)}
              </div>
              <div className="stat-label">Active in the last 30 days</div>
            </div>
          </div>

          <p className="muted" style={{ marginTop: 16 }}>
            <FiUsers aria-hidden="true" /> Aggregates are computed over
            every saved result at request time
            {stats.generatedAt
              ? ` · generated ${new Date(
                  stats.generatedAt
                ).toLocaleString()}`
              : ""}
            .
          </p>
        </div>

      </div>
    </div>
  );
}

export default AdminStats;
