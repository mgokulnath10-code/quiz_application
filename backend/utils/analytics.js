// Pure platform-analytics maths for the admin panel. Takes
// plain Result documents and returns aggregates that are
// derived only from fields the database actually stores.
//
// Where the stored data cannot answer a question (for example
// most-missed questions, which needs per-question responses
// that older attempts do not have) the aggregate comes back
// empty and the UI shows an explanatory empty state instead
// of a fabricated number.

const {
  isFiniteNumber,
  roundTo,
  attemptOutcomes,
} = require("./resultSummary");

const DAY_MS = 24 * 60 * 60 * 1000;

const SCORE_BUCKETS = [
  { bucket: "0-20%", min: 0, max: 20 },
  { bucket: "21-40%", min: 20, max: 40 },
  { bucket: "41-60%", min: 40, max: 60 },
  { bucket: "61-80%", min: 60, max: 80 },
  { bucket: "81-100%", min: 80, max: 100.01 },
];

const dayKey = (date) => {
  const parsed = date instanceof Date ? date : new Date(date);

  if (Number.isNaN(parsed.getTime())) return null;

  return parsed.toISOString().slice(0, 10);
};

// Stable identity for "distinct users" counting. New attempts
// carry userId; older ones only have the display name.

const attemptOwner = (doc) => {
  if (typeof doc.userId === "string" && doc.userId.trim() !== "") {
    return `id:${doc.userId}`;
  }

  if (typeof doc.user === "string" && doc.user.trim() !== "") {
    return `name:${doc.user}`;
  }

  return null;
};

const attemptPercentage = (doc) => {
  if (
    !isFiniteNumber(doc.score) ||
    !isFiniteNumber(doc.totalQuestions) ||
    doc.totalQuestions <= 0
  ) {
    return null;
  }

  return (doc.score / doc.totalQuestions) * 100;
};

// One row per calendar day for the window, gaps filled with
// zero so the chart does not imply missing days.

const attemptsOverTime = (docs, now, days) => {
  const series = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const date = new Date(now.getTime() - offset * DAY_MS);

    series.push({ date: dayKey(date), attempts: 0 });
  }

  const index = new Map(series.map((point) => [point.date, point]));

  docs.forEach((doc) => {
    const key = dayKey(doc.date);
    const point = key ? index.get(key) : null;

    if (point) point.attempts += 1;
  });

  return series;
};

const scoreDistribution = (docs) => {
  const counts = SCORE_BUCKETS.map((entry) => ({
    bucket: entry.bucket,
    count: 0,
  }));

  docs.forEach((doc) => {
    const percentage = attemptPercentage(doc);

    if (percentage === null) return;

    const position = SCORE_BUCKETS.findIndex(
      (entry) => percentage >= entry.min && percentage < entry.max
    );

    if (position !== -1) counts[position].count += 1;
  });

  return counts;
};

const topicAccuracy = (docs) => {
  const groups = {};

  docs.forEach((doc) => {
    if (typeof doc.topic !== "string" || doc.topic.trim() === "") {
      return;
    }

    if (!groups[doc.topic]) {
      groups[doc.topic] = {
        topic: doc.topic,
        attempts: 0,
        scoredAttempts: 0,
        correct: 0,
        questions: 0,
        scoreSum: 0,
      };
    }

    const group = groups[doc.topic];

    group.attempts += 1;

    if (isFiniteNumber(doc.score)) {
      group.scoreSum += doc.score;
    }

    const outcomes = attemptOutcomes(doc);

    if (outcomes) {
      group.scoredAttempts += 1;
      group.correct += outcomes.correct;
      group.questions += outcomes.questions;
    }
  });

  return Object.values(groups)
    .map((group) => ({
      topic: group.topic,
      attempts: group.attempts,
      accuracy:
        group.questions > 0
          ? roundTo((group.correct / group.questions) * 100, 1)
          : null,
    }))
    .sort((a, b) => {
      if (a.accuracy === null && b.accuracy === null) {
        return a.topic.localeCompare(b.topic);
      }

      if (a.accuracy === null) return 1;
      if (b.accuracy === null) return -1;

      return a.accuracy - b.accuracy;
    });
};

// Most-missed questions. Requires per-question responses,
// which only attempts recorded by the current quiz engine
// carry — so this is often empty on an existing database.

const mostMissedQuestions = (docs, limit) => {
  const groups = {};

  docs.forEach((doc) => {
    if (!Array.isArray(doc.responses)) return;

    doc.responses.forEach((response) => {
      const id = response && response.questionId;

      if (!id) return;

      if (!groups[id]) {
        groups[id] = {
          questionId: String(id),
          topic: response.topic || null,
          difficulty: response.difficulty || null,
          served: 0,
          misses: 0,
        };
      }

      const group = groups[id];

      group.served += 1;

      if (response.outcome === "wrong") group.misses += 1;

      if (!group.topic && response.topic) group.topic = response.topic;
      if (!group.difficulty && response.difficulty) {
        group.difficulty = response.difficulty;
      }
    });
  });

  return Object.values(groups)
    .filter((group) => group.misses > 0)
    .map((group) => ({
      ...group,
      missRate: roundTo((group.misses / group.served) * 100, 1),
    }))
    .sort((a, b) => {
      if (b.misses !== a.misses) return b.misses - a.misses;

      return a.questionId.localeCompare(b.questionId);
    })
    .slice(0, limit);
};

const activeUserCount = (docs, now, days) => {
  const cutoff = now.getTime() - days * DAY_MS;
  const ceiling = now.getTime();

  const owners = new Set();

  docs.forEach((doc) => {
    const parsed = doc.date instanceof Date
      ? doc.date
      : new Date(doc.date);

    if (Number.isNaN(parsed.getTime())) return;

    // "Active in the last N days" is a closed window. A result
    // stamped in the future (a skewed client clock) is not
    // activity in the window, so it is excluded rather than
    // counted forever.

    const stamp = parsed.getTime();

    if (stamp < cutoff || stamp > ceiling) return;

    const owner = attemptOwner(doc);

    if (owner) owners.add(owner);
  });

  return owners.size;
};

const buildAdminAnalytics = (docs, options = {}) => {
  const attempts = Array.isArray(docs) ? docs : [];
  const now = options.now instanceof Date ? options.now : new Date();
  const windowDays = options.windowDays || 30;
  const missedLimit = options.missedLimit || 5;

  const scored = attempts
    .map(attemptOutcomes)
    .filter(Boolean);

  const totalCorrect = scored.reduce(
    (sum, entry) => sum + entry.correct,
    0
  );

  const totalScoredQuestions = scored.reduce(
    (sum, entry) => sum + entry.questions,
    0
  );

  const scores = attempts
    .map((doc) => (isFiniteNumber(doc.score) ? doc.score : null))
    .filter((value) => value !== null);

  return {
    windowDays,
    attemptsOverTime: attemptsOverTime(attempts, now, windowDays),
    scoreDistribution: scoreDistribution(attempts),
    topicAccuracy: topicAccuracy(attempts),
    mostMissedQuestions: mostMissedQuestions(attempts, missedLimit),
    activeUsers: {
      last7Days: activeUserCount(attempts, now, 7),
      last30Days: activeUserCount(attempts, now, 30),
    },
    recordedAccuracy:
      totalScoredQuestions > 0
        ? roundTo((totalCorrect / totalScoredQuestions) * 100, 1)
        : null,
    accuracySampleSize: scored.length,
    usersWithAttempts: new Set(
      attempts.map(attemptOwner).filter(Boolean)
    ).size,
    scoreSampleSize: scores.length,
  };
};

// Per-account rollup for the Manage Users admin page.
//
// Attempts written before Result.userId existed are matched
// by display name, which is the only link those documents
// carry. If two accounts share a display name both inherit
// the same legacy rows — the alternative is dropping real
// history, and the page labels the source of the numbers.

const buildUserStats = (users, docs) => {
  const byUserId = new Map();
  const byLegacyName = new Map();

  (Array.isArray(docs) ? docs : []).forEach((doc) => {
    if (typeof doc.userId === "string" && doc.userId.trim() !== "") {
      const key = doc.userId.trim();

      if (!byUserId.has(key)) byUserId.set(key, []);

      byUserId.get(key).push(doc);

      return;
    }

    const name = typeof doc.user === "string" ? doc.user.trim() : "";

    if (!name) return;

    if (!byLegacyName.has(name)) byLegacyName.set(name, []);

    byLegacyName.get(name).push(doc);
  });

  return (Array.isArray(users) ? users : []).map((user) => {
    const id = String(user._id);

    const owned = byUserId.get(id) || [];
    const legacy =
      typeof user.name === "string"
        ? byLegacyName.get(user.name.trim()) || []
        : [];

    const attempts = [...owned, ...legacy];

    const scores = attempts
      .map((doc) => (isFiniteNumber(doc.score) ? doc.score : null))
      .filter((value) => value !== null);

    const dates = attempts
      .map((doc) => new Date(doc.date))
      .filter((date) => !Number.isNaN(date.getTime()));

    const scored = attempts
      .map(attemptOutcomes)
      .filter(Boolean);

    const correct = scored.reduce(
      (sum, entry) => sum + entry.correct,
      0
    );

    const questions = scored.reduce(
      (sum, entry) => sum + entry.questions,
      0
    );

    return {
      _id: id,
      name: user.name || null,
      email: user.email || null,
      provider: user.provider || "local",
      verified: user.verified !== false,
      disabled: user.disabled === true,
      attempts: attempts.length,
      // Kept apart from `attempts` so the UI never presents a
      // legacy attempt as if it had recorded accuracy.
      recordedAttempts: scored.length,
      averageScore:
        scores.length > 0
          ? roundTo(
              scores.reduce((sum, value) => sum + value, 0) /
                scores.length,
              2
            )
          : null,
      bestScore:
        scores.length > 0 ? Math.max(...scores) : null,
      accuracy:
        questions > 0
          ? roundTo((correct / questions) * 100, 1)
          : null,
      legacyAttempts: legacy.length,
      lastActivity:
        dates.length > 0
          ? new Date(Math.max(...dates.map((d) => d.getTime())))
              .toISOString()
          : null,
    };
  });
};

module.exports = {
  DAY_MS,
  SCORE_BUCKETS,
  dayKey,
  attemptOwner,
  attemptPercentage,
  attemptsOverTime,
  scoreDistribution,
  topicAccuracy,
  mostMissedQuestions,
  buildAdminAnalytics,
  buildUserStats,
};
