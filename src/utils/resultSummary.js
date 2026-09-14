// Pure result-summary maths, shared by the dashboard and the
// recommendation engine. No DOM, no network — plain functions
// over plain objects, so scripts/selfcheck.mjs can import this
// directly under Node.
//
// MIRROR: backend/utils/resultSummary.js holds the server copy
// of the same logic (CommonJS, because the backend is CJS).
// The two are kept identical on purpose; scripts/selfcheck.mjs
// asserts they agree on shared fixtures. Change both together.

// An attempt counts as "passing" for the streak when the
// score reaches half of the questions asked. The UI labels
// the rule next to the number, so it is never a hidden
// assumption.
export const PASS_RATIO = 0.5;

export const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

export const roundTo = (value, places = 2) => {
  const factor = 10 ** places;

  return Math.round(value * factor) / factor;
};

export const isNonEmptyString = (value) =>
  typeof value === "string" && value.trim() !== "";

// Pulls the per-question outcome counts off an attempt.
// Returns null when the attempt predates those fields, so
// the attempt is excluded from accuracy instead of being
// guessed at.

export const attemptOutcomes = (doc) => {
  if (
    !isFiniteNumber(doc.correct) ||
    !isFiniteNumber(doc.wrong) ||
    !isFiniteNumber(doc.unanswered)
  ) {
    return null;
  }

  const questions = doc.correct + doc.wrong + doc.unanswered;

  if (questions <= 0) return null;

  return {
    questions,
    correct: doc.correct,
    wrong: doc.wrong,
    unanswered: doc.unanswered,
  };
};

export const attemptAccuracy = (doc) => {
  const outcomes = attemptOutcomes(doc);

  return outcomes ? outcomes.correct / outcomes.questions : null;
};

export const isPassingAttempt = (doc) => {
  if (
    !isFiniteNumber(doc.score) ||
    !isFiniteNumber(doc.totalQuestions) ||
    doc.totalQuestions <= 0
  ) {
    return false;
  }

  return doc.score >= doc.totalQuestions * PASS_RATIO;
};

const attemptScore = (doc) => {
  if (!isFiniteNumber(doc.score)) return null;

  return doc.score;
};

const accumulate = (groups, key, doc) => {
  if (!isNonEmptyString(key)) return;

  if (!groups[key]) {
    groups[key] = {
      key,
      attempts: 0,
      scoredAttempts: 0,
      correct: 0,
      questions: 0,
    };
  }

  const group = groups[key];

  group.attempts += 1;

  const outcomes = attemptOutcomes(doc);

  if (outcomes) {
    group.scoredAttempts += 1;
    group.correct += outcomes.correct;
    group.questions += outcomes.questions;
  }
};

const toRows = (groups) =>
  Object.values(groups)
    .map((group) => ({
      key: group.key,
      attempts: group.attempts,
      scoredAttempts: group.scoredAttempts,
      correct: group.scoredAttempts > 0 ? group.correct : null,
      questions: group.scoredAttempts > 0 ? group.questions : null,
      accuracy:
        group.scoredAttempts > 0 && group.questions > 0
          ? roundTo(group.correct / group.questions, 4)
          : null,
    }))
    .sort((a, b) => a.key.localeCompare(b.key));

// Summarises a user's attempts. `docs` may be in any order;
// the caller passes them newest-first (the API guarantees it).
//
// Anything that cannot be derived from stored fields is
// returned as null so the UI can render "—" rather than a
// made-up figure.

export const summarizeResults = (docs) => {
  const attempts = Array.isArray(docs) ? docs : [];

  const scores = attempts
    .map(attemptScore)
    .filter((value) => value !== null);

  const totalScoredQuestions = attempts
    .map(attemptOutcomes)
    .filter(Boolean)
    .reduce((sum, outcomes) => sum + outcomes.questions, 0);

  const totalCorrect = attempts
    .map(attemptOutcomes)
    .filter(Boolean)
    .reduce((sum, outcomes) => sum + outcomes.correct, 0);

  let currentStreak = 0;

  for (const doc of attempts) {
    if (!isPassingAttempt(doc)) break;

    currentStreak += 1;
  }

  const topicGroups = {};
  const difficultyGroups = {};

  attempts.forEach((doc) => {
    accumulate(topicGroups, doc.topic, doc);
    accumulate(difficultyGroups, doc.difficulty, doc);
  });

  return {
    attempts: attempts.length,
    scoredAttempts: attempts.filter(attemptOutcomes).length,
    averageScore:
      scores.length > 0
        ? roundTo(
            scores.reduce((sum, value) => sum + value, 0) /
              scores.length,
            2
          )
        : null,
    bestScore: scores.length > 0 ? Math.max(...scores) : null,
    totalScore:
      scores.length > 0
        ? roundTo(
            scores.reduce((sum, value) => sum + value, 0),
            2
          )
        : null,
    accuracy:
      totalScoredQuestions > 0
        ? roundTo(totalCorrect / totalScoredQuestions, 4)
        : null,
    correctAnswers:
      totalScoredQuestions > 0 ? totalCorrect : null,
    questionsAnswered:
      totalScoredQuestions > 0 ? totalScoredQuestions : null,
    currentStreak,
    passRatio: PASS_RATIO,
    topics: toRows(topicGroups),
    difficulties: toRows(difficultyGroups),
  };
};
