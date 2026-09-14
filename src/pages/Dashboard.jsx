import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import axios from "axios";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import {
  FiAlertTriangle,
  FiRefreshCw,
  FiTrendingUp,
  FiPlay,
  FiTarget,
  FiAward,
  FiActivity,
  FiBarChart2,
  FiClock,
  FiArrowRight,
} from "react-icons/fi";

import { summarizeResults, isFiniteNumber } from "../utils/resultSummary";
import {
  buildRecommendations,
  sortTopicsByAccuracy,
  MIN_TOPIC_ATTEMPTS,
  MIN_TOTAL_ATTEMPTS,
} from "../utils/recommendations";
import { describeMode, formatScore, formatDuration } from "../utils/quizEngine";
import useSlowFlag from "../utils/useSlowFlag";
import {
  CHART,
  AXIS_PROPS,
  TOOLTIP_PROPS,
  GRID_PROPS,
  difficultyColor,
} from "../utils/chartTheme";
import "../styles/Dashboard.css";

import API from "../config/api";

const DASH = "—";

const orDash = (value) =>
  value === null || value === undefined || value === ""
    ? DASH
    : value;

const formatDate = (value) => {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) return DASH;

  return date.toLocaleDateString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
};

const formatPercent = (ratio) =>
  isFiniteNumber(ratio) ? `${Math.round(ratio * 100)}%` : DASH;

const truncate = (text, length = 16) =>
  typeof text === "string" && text.length > length
    ? `${text.slice(0, length - 1)}…`
    : text;

function Dashboard() {
  const navigate = useNavigate();

  const [state, setState] = useState("loading");
  const [errorMessage, setErrorMessage] = useState("");
  const [payload, setPayload] = useState(null);
  const slowLoad = useSlowFlag(state === "loading");

  const token = localStorage.getItem("token") || "";

  const user = JSON.parse(localStorage.getItem("user")) || {};

  const load = async () => {
    setState("loading");
    setErrorMessage("");

    try {
      const res = await axios.get(`${API}/api/results/me`, {
        headers: { Authorization: token },
      });

      setPayload(res.data);
      setState("ready");
    } catch (error) {
      console.error(error);

      setErrorMessage(
        error.response?.data?.message ||
          "The dashboard could not reach the results service."
      );

      setState("error");
    }
  };

  useEffect(() => {
    load();
    // Loaded once on mount. The fetch re-runs from the Refresh
    // button, so `load` is deliberately not a dependency.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const results = useMemo(
    () => payload?.results || [],
    [payload]
  );

  const summary = useMemo(
    () => payload?.summary || summarizeResults([]),
    [payload]
  );

  // Charts read chronologically; the API returns newest first.

  const timeline = useMemo(
    () =>
      [...results]
        .reverse()
        .map((result, index) => {
          const total = Number(result.totalQuestions);
          const score = Number(result.score);

          const percent =
            Number.isFinite(total) && total > 0 && Number.isFinite(score)
              ? Math.round((score / total) * 100)
              : null;

          return {
            index: index + 1,
            label: formatDate(result.date),
            percent,
            score: Number.isFinite(score) ? score : null,
            total: Number.isFinite(total) ? total : null,
          };
        })
        .filter((point) => point.percent !== null),
    [results]
  );

  const topicRows = useMemo(
    () =>
      sortTopicsByAccuracy(summary.topics)
        .filter((row) => row.accuracy !== null)
        .map((row) => ({
          ...row,
          label: truncate(row.key),
          percent: Math.round(row.accuracy * 100),
        })),
    [summary]
  );

  const recommendations = useMemo(
    () => buildRecommendations(results),
    [results]
  );

  /* =====================
     STATES
  ===================== */

  if (state === "loading") {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-topbar">
            <div>
              <h1 className="page-title">Dashboard</h1>

              <p className="page-subtitle">
                Your quiz history at a glance.
              </p>
            </div>
          </div>

          <div className="card">
            <div className="loading-screen" style={{ minHeight: "24vh" }}>
              Loading your results…
            </div>

            {slowLoad && (
              <p className="muted" role="status" style={{ textAlign: "center" }}>
                This is taking longer than expected. The server may be
                waking up; the dashboard will fill in on its own.
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
          <div className="page-topbar">
            <div>
              <h1 className="page-title">Dashboard</h1>

              <p className="page-subtitle">
                Your quiz history at a glance.
              </p>
            </div>
          </div>

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

            <h3 className="card-title">
              We could not load your dashboard
            </h3>

            <p style={{ maxWidth: 520, margin: "0 auto 18px" }}>
              {errorMessage} Nothing has been changed — your saved
              attempts are still on the server.
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <button className="btn btn-primary" onClick={load}>
                <FiRefreshCw />
                Try again
              </button>

              <button
                className="btn btn-secondary"
                onClick={() => navigate("/quiz-setup")}
              >
                <FiPlay />
                Start a quiz
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (results.length === 0) {
    return (
      <div className="page">
        <div className="page-inner">
          <div className="page-topbar">
            <div>
              <h1 className="page-title">Dashboard</h1>

              <p className="page-subtitle">
                Your quiz history at a glance.
              </p>
            </div>
          </div>

          <div className="card dash-onboarding">
            <span
              className="empty-icon"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              <FiBarChart2 />
            </span>

            <h2 className="dash-onboarding-title">
              No attempts yet{user.name ? `, ${user.name}` : ""}
            </h2>

            <p className="dash-onboarding-lead">
              This dashboard is built from your own quiz attempts:
              score over time, accuracy by topic, difficulty mix and
              a running streak. There is nothing to plot until you
              finish one quiz.
            </p>

            <div className="row" style={{ justifyContent: "center" }}>
              <Link to="/quiz-setup" className="btn btn-primary">
                <FiPlay />
                Take your first quiz
              </Link>

              <Link to="/rooms" className="btn btn-secondary">
                Or join a room
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  /* =====================
     POPULATED
  ===================== */

  const recent = results.slice(0, 10);

  const hasScoredTopic = topicRows.length > 0;

  return (
    <div className="page">
      <div className="page-inner">

        <div className="page-topbar">
          <div>
            <h1 className="page-title">Dashboard</h1>

            <p className="page-subtitle">
              {summary.attempts} recorded attempt
              {summary.attempts === 1 ? "" : "s"}, newest first.
            </p>
          </div>

          <div className="row">
            <button className="btn btn-secondary" onClick={load}>
              <FiRefreshCw />
              Refresh
            </button>

            <Link to="/quiz-setup" className="btn btn-primary">
              <FiPlay />
              New quiz
            </Link>
          </div>
        </div>

        <div className="stat-grid">
          <div className="stat-card">
            <div className="stat-value">{summary.attempts}</div>
            <div className="stat-label">Attempts</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {summary.bestScore === null
                ? DASH
                : formatScore(summary.bestScore)}
            </div>
            <div className="stat-label">Best score</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {summary.averageScore === null
                ? DASH
                : formatScore(summary.averageScore)}
            </div>
            <div className="stat-label">Average score</div>
          </div>

          <div className="stat-card">
            <div className="stat-value">
              {formatPercent(summary.accuracy)}
            </div>
            <div className="stat-label">
              Accuracy
              {summary.questionsAnswered
                ? ` · ${summary.correctAnswers}/${summary.questionsAnswered}`
                : ""}
            </div>
          </div>

          <div className="stat-card">
            <div className="stat-value">{summary.currentStreak}</div>
            <div className="stat-label">
              Streak · attempts at 50%+ in a row
            </div>
          </div>
        </div>

        {summary.scoredAttempts < summary.attempts && (
          <p className="muted dash-note" role="status">
            Accuracy uses the {summary.scoredAttempts} of{" "}
            {summary.attempts} attempts that recorded per-question
            results. Older attempts still count towards attempts,
            best and average score.
          </p>
        )}

        <div className="grid-2 dash-grid">
          <div className="card">
            <h3 className="card-title">Score over time</h3>

            <p className="card-desc">
              Each attempt as a percentage of the questions asked,
              oldest first.
            </p>

            {timeline.length < 2 ? (
              <div className="dash-chart-empty">
                <FiTrendingUp aria-hidden="true" />

                <p>
                  A trend needs at least two attempts with a
                  recorded score. You have {timeline.length}.
                </p>
              </div>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <LineChart
                    data={timeline}
                    margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
                  >
                    <CartesianGrid {...GRID_PROPS} />

                    <XAxis dataKey="label" {...AXIS_PROPS} />

                    <YAxis domain={[0, 100]} unit="%" {...AXIS_PROPS} />

                    <Tooltip
                      {...TOOLTIP_PROPS}
                      cursor={{ stroke: CHART.grid }}
                      formatter={(value) => [`${value}%`, "Score"]}
                      labelFormatter={(label, rows) =>
                        rows?.[0]?.payload
                          ? `${label} · ${rows[0].payload.score}/${rows[0].payload.total}`
                          : label
                      }
                    />

                    <Line
                      type="monotone"
                      dataKey="percent"
                      stroke={CHART.accent}
                      strokeWidth={2}
                      dot={{ r: 3, fill: CHART.accent }}
                      activeDot={{ r: 5 }}
                      isAnimationActive={false}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>

          <div className="card">
            <h3 className="card-title">Accuracy by topic</h3>

            <p className="card-desc">
              Weakest first. Topics without recorded per-question
              results are left out rather than shown as zero.
            </p>

            {!hasScoredTopic ? (
              <div className="dash-chart-empty">
                <FiTarget aria-hidden="true" />

                <p>
                  No attempt has recorded per-question results yet,
                  so topic accuracy cannot be calculated.
                </p>
              </div>
            ) : (
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart
                    data={topicRows}
                    margin={{ top: 8, right: 12, bottom: 0, left: -18 }}
                  >
                    <CartesianGrid {...GRID_PROPS} />

                    <XAxis dataKey="label" {...AXIS_PROPS} />

                    <YAxis domain={[0, 100]} unit="%" {...AXIS_PROPS} />

                    <Tooltip
                      {...TOOLTIP_PROPS}
                      cursor={{ fill: CHART.cursor }}
                      formatter={(value, _name, entry) => [
                        `${value}%`,
                        `${entry?.payload?.key || "—"} · ${
                          entry?.payload?.attempts ?? 0
                        } attempt(s)`,
                      ]}
                    />

                    <Bar dataKey="percent" radius={[6, 6, 0, 0]}>
                      {topicRows.map((row) => (
                        <Cell
                          key={row.key}
                          fill={
                            row.percent < 60
                              ? CHART.danger
                              : row.percent < 85
                                ? CHART.warning
                                : CHART.success
                          }
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}
          </div>
        </div>

        {/* Recommendations — workstream D */}

        <div className="card dash-recs">
          <h3 className="card-title">Where to go next</h3>

          <p className="card-desc">
            Built only from your own recorded accuracy. Every row
            prints the evidence it came from.
          </p>

          {recommendations.ready ? (
            <ul className="dash-rec-list">
              {recommendations.items.map((item) => (
                <li key={`${item.topic}-${item.difficulty}`}>
                  <div className="dash-rec-body">
                    <span
                      className="badge"
                      style={{
                        background: "var(--surface-2)",
                        color: difficultyColor(item.difficulty),
                        textTransform: "capitalize",
                      }}
                    >
                      {item.difficulty}
                    </span>

                    <div>
                      <div className="dash-rec-topic">
                        {item.topic}
                      </div>

                      <div className="dash-rec-evidence">
                        {item.evidence} · {item.correct}/
                        {item.questions} questions correct
                      </div>

                      <div className="dash-rec-action">
                        {item.action}
                      </div>
                    </div>
                  </div>

                  <Link
                    to={item.href}
                    className="btn btn-secondary btn-sm"
                  >
                    Practise
                    <FiArrowRight />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <div className="dash-rec-empty">
              <FiAlertTriangle aria-hidden="true" />

              <p>
                {recommendations.reason} A recommendation needs at
                least {MIN_TOTAL_ATTEMPTS} attempts and{" "}
                {MIN_TOPIC_ATTEMPTS} of them on the same topic.
              </p>

              <Link
                to={recommendations.placementHref}
                className="btn btn-primary btn-sm"
              >
                <FiPlay />
                {recommendations.placementLabel}
              </Link>
            </div>
          )}
        </div>

        {/* Difficulty breakdown */}

        <div className="card">
          <h3 className="card-title">Difficulty breakdown</h3>

          <p className="card-desc">
            How your attempts spread across the levels, and how you
            did at each. Levels you have not played are not listed.
          </p>

          {summary.difficulties.length === 0 ? (
            <div className="dash-chart-empty">
              <FiActivity aria-hidden="true" />

              <p>
                Your attempts do not record a difficulty yet. Quizzes
                taken from now on always will.
              </p>
            </div>
          ) : (
            <div className="table-wrap" style={{ boxShadow: "none" }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Difficulty</th>
                    <th className="num">Attempts</th>
                    <th className="num">Questions</th>
                    <th className="num">Correct</th>
                    <th className="num">Accuracy</th>
                  </tr>
                </thead>

                <tbody>
                  {summary.difficulties.map((row) => (
                    <tr key={row.key}>
                      <td>
                        <span
                          className="badge"
                          style={{
                            background: "var(--surface-2)",
                            color: difficultyColor(row.key),
                            textTransform: "capitalize",
                          }}
                        >
                          {row.key}
                        </span>
                      </td>

                      <td className="num">{row.attempts}</td>

                      <td className="num">
                        {row.questions === null ? DASH : row.questions}
                      </td>

                      <td className="num">
                        {row.correct === null ? DASH : row.correct}
                      </td>

                      <td className="num">
                        {row.accuracy === null
                          ? DASH
                          : `${Math.round(row.accuracy * 100)}%`}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Recent attempts */}

        <div className="card">
          <h3 className="card-title">Recent attempts</h3>

          <p className="card-desc">
            Showing {recent.length} of {summary.attempts}, newest
            first. “—” marks a field the attempt predates.
          </p>

          <div className="table-wrap" style={{ boxShadow: "none" }}>
            <table className="data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Topic</th>
                  <th>Level</th>
                  <th>Mode</th>
                  <th className="num">Score</th>
                  <th className="num">Correct</th>
                  <th className="num">Time</th>
                </tr>
              </thead>

              <tbody>
                {recent.map((result) => (
                  <tr key={result._id}>
                    <td>{formatDate(result.date)}</td>

                    <td
                      title={result.topic || ""}
                      className="dash-cell-truncate"
                      style={{ textTransform: "capitalize" }}
                    >
                      {orDash(result.topic)}
                    </td>

                    <td style={{ textTransform: "capitalize" }}>
                      {orDash(result.difficulty)}
                    </td>

                    <td>{result.mode ? describeMode(result.mode) : DASH}</td>

                    <td className="num">
                      <strong>
                        {result.score === null ||
                        result.score === undefined
                          ? DASH
                          : formatScore(result.score)}
                      </strong>
                      /{orDash(result.totalQuestions)}
                    </td>

                    <td className="num">
                      {result.correct === null ||
                      result.correct === undefined
                        ? DASH
                        : `${result.correct} of ${result.totalQuestions}`}
                    </td>

                    <td className="num">
                      {isFiniteNumber(result.durationSeconds)
                        ? formatDuration(result.durationSeconds)
                        : DASH}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="row dash-footer-actions">
          <Link to="/leaderboard" className="btn btn-secondary">
            <FiTrendingUp />
            Leaderboard
          </Link>

          <Link to="/profile" className="btn btn-ghost">
            <FiAward />
            Profile
          </Link>

          <Link to="/results" className="btn btn-ghost">
            <FiClock />
            All results
          </Link>
        </div>

      </div>
    </div>
  );
}

export default Dashboard;
