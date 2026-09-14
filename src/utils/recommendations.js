// Deterministic learning-path recommendations derived only
// from the user's own recorded attempts. No model, no
// inference beyond arithmetic that the UI re-states as
// evidence ("40% accuracy over 3 attempts").
//
// Everything here is a pure function so scripts/selfcheck.mjs
// can pin the ordering rules.

import {
  isFiniteNumber,
  isNonEmptyString,
  attemptOutcomes,
} from "./resultSummary.js";
import {
  DIFFICULTY_ORDER,
  stepDifficulty,
  normalizeDifficulty,
} from "./quizEngine.js";

// A topic needs this many recorded attempts before it can be
// called out as weak — one bad run is noise, not evidence.
export const MIN_TOPIC_ATTEMPTS = 2;

// Below this many attempts overall there is not enough
// history to recommend anything honestly.
export const MIN_TOTAL_ATTEMPTS = 3;

export const WEAK_THRESHOLD = 0.6;
export const STRONG_THRESHOLD = 0.85;

export const MAX_RECOMMENDATIONS = 3;

export const PLACEMENT_HREF = "/quiz-setup?mode=placement";

const round1 = (value) => Math.round(value * 10) / 10;

const percent = (ratio) => Math.round(ratio * 100);

// Aggregates each recorded attempt into per-topic evidence.
// Attempts without outcome counts are counted (so "over N
// attempts" stays truthful) but contribute no accuracy.

export const topicEvidence = (results) => {
  const groups = {};

  (Array.isArray(results) ? results : []).forEach((result) => {
    if (!isNonEmptyString(result?.topic)) return;

    const key = result.topic.trim();

    if (!groups[key]) {
      groups[key] = {
        topic: key,
        attempts: 0,
        scoredAttempts: 0,
        correct: 0,
        questions: 0,
        difficultiesSeen: new Set(),
      };
    }

    const group = groups[key];

    group.attempts += 1;

    if (isNonEmptyString(result.difficulty)) {
      group.difficultiesSeen.add(
        normalizeDifficulty(result.difficulty)
      );
    }

    const outcomes = attemptOutcomes(result);

    if (outcomes) {
      group.scoredAttempts += 1;
      group.correct += outcomes.correct;
      group.questions += outcomes.questions;
    }
  });

  return Object.values(groups)
    .map((group) => {
      const levels = DIFFICULTY_ORDER.filter((level) =>
        group.difficultiesSeen.has(level)
      );

      return {
        topic: group.topic,
        attempts: group.attempts,
        scoredAttempts: group.scoredAttempts,
        correct: group.correct,
        questions: group.questions,
        accuracy:
          group.questions > 0
            ? group.correct / group.questions
            : null,
        difficulties: levels,
        lowestDifficulty: levels[0] || null,
        highestDifficulty:
          levels[levels.length - 1] || null,
      };
    })
    .sort((a, b) => a.topic.localeCompare(b.topic));
};

// Where to send the user next for one topic, and why. The
// reason string is built from the same numbers the card shows,
// so the explanation cannot drift from the data.

const chooseDifficulty = (evidence) => {
  const attempted = evidence.difficulties.length > 0;

  if (evidence.accuracy < WEAK_THRESHOLD) {
    const difficulty = attempted
      ? evidence.lowestDifficulty
      : "easy";

    return {
      difficulty,
      action: attempted
        ? `Rebuild the basics at ${difficulty}`
        : "Start at easy",
    };
  }

  if (evidence.accuracy >= STRONG_THRESHOLD) {
    const next = attempted
      ? stepDifficulty(evidence.highestDifficulty, "up")
      : "medium";

    return {
      difficulty: next,
      action:
        next === evidence.highestDifficulty
          ? "Already at the hardest level — keep it sharp"
          : `Move up to ${next}`,
    };
  }

  const difficulty = attempted
    ? evidence.highestDifficulty
    : "medium";

  return {
    difficulty,
    action: `Consolidate at ${difficulty}`,
  };
};

export const buildRecommendations = (results) => {
  const attempts = Array.isArray(results) ? results : [];
  const evidence = topicEvidence(attempts);

  const usable = evidence.filter(
    (entry) =>
      entry.attempts >= MIN_TOPIC_ATTEMPTS &&
      entry.accuracy !== null
  );

  const scoredAttempts = evidence.reduce(
    (sum, entry) => sum + entry.scoredAttempts,
    0
  );

  // The reasons are ordered most-specific first: "no outcomes at
  // all" is a more useful thing to tell someone than "not many
  // attempts", and it used to be masked by the count check.

  const notReady = (reason) => ({
    ready: false,
    reason,
    items: [],
    placementHref: PLACEMENT_HREF,
    placementLabel: "Take a placement quiz",
  });

  if (attempts.length === 0) {
    return notReady("No attempts recorded yet.");
  }

  if (scoredAttempts === 0) {
    return notReady(
      "Your attempts do not yet record per-question results, so " +
        "topic accuracy cannot be calculated. Take one more quiz " +
        "to start building the picture."
    );
  }

  if (
    attempts.length < MIN_TOTAL_ATTEMPTS ||
    scoredAttempts < MIN_TOPIC_ATTEMPTS
  ) {
    return notReady(
      `Only ${attempts.length} recorded attempt${
        attempts.length === 1 ? "" : "s"
      } (${scoredAttempts} with per-question results) so far — ` +
        "too few to name a weak topic."
    );
  }

  if (usable.length === 0) {
    return notReady(
      "No single topic has enough recorded attempts yet to be " +
        `named weak — that needs ${MIN_TOPIC_ATTEMPTS} attempts ` +
        "on the same topic."
    );
  }

  // Weakest first. Ties break on the topic with more evidence,
  // then alphabetically, so the order never depends on the
  // order the API happened to return rows in.

  const ranked = [...usable].sort((a, b) => {
    if (a.accuracy !== b.accuracy) return a.accuracy - b.accuracy;

    if (a.attempts !== b.attempts) return b.attempts - a.attempts;

    return a.topic.localeCompare(b.topic);
  });

  const items = ranked
    .slice(0, MAX_RECOMMENDATIONS)
    .map((entry) => {
      const choice = chooseDifficulty(entry);

      return {
        topic: entry.topic,
        difficulty: choice.difficulty,
        action: choice.action,
        accuracy: percent(entry.accuracy),
        attempts: entry.attempts,
        correct: entry.correct,
        questions: entry.questions,
        // The single sentence the card renders as evidence.
        evidence: `${percent(entry.accuracy)}% accuracy over ${
          entry.attempts
        } attempt${entry.attempts === 1 ? "" : "s"}`,
        href:
          `/quiz-setup?topic=${encodeURIComponent(entry.topic)}` +
          `&difficulty=${choice.difficulty}`,
      };
    });

  return {
    ready: true,
    reason: "",
    items,
    placementHref: PLACEMENT_HREF,
    placementLabel: "Take a placement quiz",
  };
};

// Sort key used by the dashboard's topic chart so the weakest
// topics appear first, matching the recommendation order.

export const sortTopicsByAccuracy = (rows) =>
  [...(Array.isArray(rows) ? rows : [])].sort((a, b) => {
    const accuracyA = isFiniteNumber(a?.accuracy)
      ? a.accuracy
      : null;
    const accuracyB = isFiniteNumber(b?.accuracy)
      ? b.accuracy
      : null;

    if (accuracyA === null && accuracyB === null) {
      return String(a.key).localeCompare(String(b.key));
    }

    if (accuracyA === null) return 1;
    if (accuracyB === null) return -1;

    return accuracyA - accuracyB;
  });

export const toPercent = (ratio) =>
  isFiniteNumber(ratio) ? round1(ratio * 100) : null;
