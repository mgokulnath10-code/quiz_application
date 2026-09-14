// Recharts needs concrete paint values, but the design rules
// require the theme tokens rather than one-off hex literals.
// CSS custom properties resolve inside SVG presentation
// attributes, so the tokens are used directly — one place to
// change if a token value moves.

export const CHART = {
  accent: "var(--accent)",
  accentSoft: "var(--accent-soft)",
  success: "var(--success)",
  warning: "var(--warning)",
  danger: "var(--danger)",
  info: "var(--info)",
  grid: "var(--border)",
  axis: "var(--border-strong)",
  tick: "var(--text-2)",
  surface: "var(--surface)",
  cursor: "rgba(79, 70, 229, 0.06)",
};

export const AXIS_PROPS = {
  tick: { fill: CHART.tick, fontSize: 12 },
  axisLine: { stroke: CHART.axis },
  tickLine: false,
};

export const TOOLTIP_PROPS = {
  contentStyle: {
    borderRadius: 10,
    border: "1px solid var(--border)",
    background: "var(--surface)",
    fontSize: 13,
    color: "var(--text)",
  },
  labelStyle: { color: "var(--text-2)", fontWeight: 600 },
  itemStyle: { color: "var(--text)" },
};

export const GRID_PROPS = {
  strokeDasharray: "3 3",
  stroke: CHART.grid,
  vertical: false,
};

// Difficulty keeps the same colour language as the rest of the
// app (easy = success, medium = warning, hard = danger).

export const DIFFICULTY_COLOR = {
  easy: "var(--success)",
  medium: "var(--warning)",
  hard: "var(--danger)",
};

export const difficultyColor = (difficulty) =>
  DIFFICULTY_COLOR[difficulty] || "var(--text-3)";
