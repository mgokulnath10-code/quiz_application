// Pure quiz-engine logic for the solo quiz: negative marking,
// the exam clock and adaptive difficulty stepping.
//
// No React, no DOM, no network — scripts/selfcheck.mjs imports
// this file directly under Node and asserts every rule below.

export const DIFFICULTY_ORDER = ["easy", "medium", "hard"];

export const MODES = {
  PRACTICE: "practice",
  EXAM: "exam",
  ADAPTIVE: "adaptive",
};

export const NEGATIVE_MARKING_OPTIONS = [
  { value: 0, label: "None", hint: "No deduction for a wrong answer" },
  { value: 0.25, label: "0.25", hint: "Quarter mark off per wrong answer" },
  { value: 0.5, label: "0.5", hint: "Half mark off per wrong answer" },
  { value: 1, label: "1", hint: "One mark off per wrong answer" },
];

export const EXAM_DURATION_OPTIONS = [
  { value: 0, label: "No limit", hint: "Take as long as you need" },
  { value: 5, label: "5 min" },
  { value: 10, label: "10 min" },
  { value: 15, label: "15 min" },
  { value: 20, label: "20 min" },
];

// Streak length that triggers a difficulty step in each
// direction. The setup screen and the quiz header both print
// this number, so the rule is never a hidden assumption.
export const ADAPTIVE_STREAK = 2;

export const OUTCOME = {
  CORRECT: "correct",
  WRONG: "wrong",
  UNANSWERED: "unanswered",
};

export const isFiniteNumber = (value) =>
  typeof value === "number" && Number.isFinite(value);

// Keeps a setup-screen value inside the supported set, so a
// hand-typed query parameter can never produce a quiz with an
// unsupported rule.

export const normalizeNegativeMarking = (value) => {
  const parsed = Number(value);

  return NEGATIVE_MARKING_OPTIONS.some(
    (option) => option.value === parsed
  )
    ? parsed
    : 0;
};

export const normalizeExamDuration = (value) => {
  const parsed = Number(value);

  return EXAM_DURATION_OPTIONS.some(
    (option) => option.value === parsed
  )
    ? parsed
    : 0;
};

export const normalizeMode = (value) =>
  Object.values(MODES).includes(value) ? value : MODES.PRACTICE;

export const normalizeDifficulty = (value) =>
  DIFFICULTY_ORDER.includes(value) ? value : "medium";

export const isNegativeMarking = (value) =>
  normalizeNegativeMarking(value) > 0;

// "0.5 mark deducted per wrong answer" — the exact wording
// shown on the setup screen, during the quiz and on the
// result screen, so all three agree.

export const describeNegativeMarking = (value) => {
  const marking = normalizeNegativeMarking(value);

  if (marking === 0) {
    return "No negative marking";
  }

  return `−${marking} mark${marking === 1 ? "" : "s"} per wrong answer`;
};

export const describeExamDuration = (value) => {
  const minutes = normalizeExamDuration(value);

  return minutes === 0
    ? "No overall time limit"
    : `${minutes} minute${minutes === 1 ? "" : "s"} for the whole exam`;
};

export const describeMode = (value) => {
  switch (normalizeMode(value)) {
    case MODES.EXAM:
      return "Exam";
    case MODES.ADAPTIVE:
      return "Adaptive";
    default:
      return "Practice";
  }
};

// The score is computed from the recorded outcomes rather
// than incremented as the quiz runs, so a re-render or a
// timeout can never double-count or miss a deduction.

export const scoreOutcomes = (outcomes, negativeMarking) => {
  const marking = normalizeNegativeMarking(negativeMarking);
  const list = Array.isArray(outcomes) ? outcomes : [];

  const correct = list.filter(
    (outcome) => outcome === OUTCOME.CORRECT
  ).length;

  const wrong = list.filter(
    (outcome) => outcome === OUTCOME.WRONG
  ).length;

  const unanswered = list.filter(
    (outcome) => outcome === OUTCOME.UNANSWERED
  ).length;

  const penalty = wrong * marking;

  // Unanswered questions are never penalised, and a run can
  // never score below zero.
  const score = Math.max(0, correct - penalty);

  return {
    correct,
    wrong,
    unanswered,
    total: list.length,
    penalty: Math.round(penalty * 100) / 100,
    rawScore: Math.round((correct - penalty) * 100) / 100,
    score: Math.round(score * 100) / 100,
    maxScore: list.length,
  };
};

// Builds the outcome list from the questions and the answers
// the candidate actually submitted. `answers` is indexed by
// question position; a missing or blank entry is unanswered.

export const buildOutcomes = (questions, answers) =>
  (Array.isArray(questions) ? questions : []).map(
    (question, index) => {
      const given = answers ? answers[index] : null;

      if (given === null || given === undefined || given === "") {
        return OUTCOME.UNANSWERED;
      }

      return String(given).trim() ===
        String(question?.answer ?? "").trim()
        ? OUTCOME.CORRECT
        : OUTCOME.WRONG;
    }
  );

export const scoreQuiz = (questions, answers, negativeMarking) =>
  scoreOutcomes(
    buildOutcomes(questions, answers),
    negativeMarking
  );

// Accuracy is "questions answered correctly out of questions
// served" — unanswered counts against it, which is what a
// percentage on a result screen means to a candidate.

export const accuracyPercent = (summary) => {
  if (!summary || summary.total <= 0) return null;

  return Math.round((summary.correct / summary.total) * 100);
};

// Trims a stored score for display: 3, 2.5, 2.75 — never
// "2.50" or a floating point artefact like 2.7500000000000004.

export const formatScore = (value) => {
  if (!isFiniteNumber(value)) return "—";

  return String(Number(value.toFixed(2)));
};

export const formatClock = (seconds) => {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));

  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return `${String(minutes).padStart(2, "0")}:${String(
    remainder
  ).padStart(2, "0")}`;
};

export const formatDuration = (seconds) => {
  if (!isFiniteNumber(seconds) || seconds < 0) return "—";

  const total = Math.round(seconds);

  if (total < 60) return `${total}s`;

  const minutes = Math.floor(total / 60);
  const remainder = total % 60;

  return remainder === 0
    ? `${minutes}m`
    : `${minutes}m ${remainder}s`;
};

/* =====================
   SERVED SEQUENCE
===================== */

// A quiz is served strictly one question at a time. The served
// sequence holds only the questions that have actually been put
// in front of the candidate: it starts with exactly one question
// (the first the run will ask) and grows by one entry per answer.
//
// The helpers below make that invariant explicit. Previously the
// "Question X of Y" label, the progress bar, the button caption
// and the end-of-run test each derived the active question from
// the raw sequence length, so a sequence that held the whole pool
// started the run on its last question and ended it after one
// answer. Every consumer now goes through these functions.

export const initialServedSequence = (pool, first) => {
  const opening = first || (Array.isArray(pool) ? pool[0] : null);

  return opening ? [opening] : [];
};

export const currentServedQuestion = (served) => {
  const list = Array.isArray(served) ? served : [];

  return list.length > 0 ? list[list.length - 1] : null;
};

// How many questions have been served. This is also the 1-based
// number of the question on screen and the pool index of the
// question that follows it.
export const nextQuestionIndex = (served) =>
  Array.isArray(served) ? served.length : 0;

// True once the question on screen is the final one the run will
// ask, so the primary button reads "Submit quiz" and the next
// submission ends the attempt.
export const isLastServedQuestion = (served, plannedTotal) => {
  const total = Number(plannedTotal);

  if (!Number.isFinite(total) || total <= 0) return true;

  return nextQuestionIndex(served) >= total;
};

// Progress counts the questions already answered, so it is 0 on
// the first question and never moves backwards.
export const servedProgressPercent = (served, plannedTotal) => {
  const total = Number(plannedTotal);

  if (!Number.isFinite(total) || total <= 0) return 0;

  const answered = Math.max(0, nextQuestionIndex(served) - 1);

  return Math.min(100, (answered / total) * 100);
};

/* =====================
   ADAPTIVE DIFFICULTY
===================== */

export const stepDifficulty = (current, direction) => {
  const index = DIFFICULTY_ORDER.indexOf(
    normalizeDifficulty(current)
  );

  if (direction === "up") {
    return DIFFICULTY_ORDER[
      Math.min(DIFFICULTY_ORDER.length - 1, index + 1)
    ];
  }

  if (direction === "down") {
    return DIFFICULTY_ORDER[Math.max(0, index - 1)];
  }

  return DIFFICULTY_ORDER[index];
};

// Applies one answer to the adaptive state.
//
// Steps up after ADAPTIVE_STREAK consecutive correct answers
// and down after ADAPTIVE_STREAK consecutive wrong answers,
// bounded at easy and hard. An unanswered question is neither
// correct nor wrong, so it resets both counters and never
// moves the difficulty on its own.

export const applyAdaptiveAnswer = (state, outcome) => {
  const previous = {
    difficulty: normalizeDifficulty(state?.difficulty),
    correctStreak: Math.max(0, state?.correctStreak || 0),
    wrongStreak: Math.max(0, state?.wrongStreak || 0),
  };

  if (outcome === OUTCOME.CORRECT) {
    const correctStreak = previous.correctStreak + 1;

    if (correctStreak >= ADAPTIVE_STREAK) {
      const difficulty = stepDifficulty(previous.difficulty, "up");

      return {
        difficulty,
        correctStreak: 0,
        wrongStreak: 0,
        stepped: difficulty !== previous.difficulty ? "up" : null,
      };
    }

    return {
      difficulty: previous.difficulty,
      correctStreak,
      wrongStreak: 0,
      stepped: null,
    };
  }

  if (outcome === OUTCOME.WRONG) {
    const wrongStreak = previous.wrongStreak + 1;

    if (wrongStreak >= ADAPTIVE_STREAK) {
      const difficulty = stepDifficulty(previous.difficulty, "down");

      return {
        difficulty,
        correctStreak: 0,
        wrongStreak: 0,
        stepped: difficulty !== previous.difficulty ? "down" : null,
      };
    }

    return {
      difficulty: previous.difficulty,
      correctStreak: 0,
      wrongStreak,
      stepped: null,
    };
  }

  return {
    difficulty: previous.difficulty,
    correctStreak: 0,
    wrongStreak: 0,
    stepped: null,
  };
};

// Order in which levels are tried when the requested level has
// run out of unseen questions: the requested level first, then
// the nearest neighbour, then the far one.

export const difficultyFallbackOrder = (target) => {
  const index = DIFFICULTY_ORDER.indexOf(
    normalizeDifficulty(target)
  );

  return [...DIFFICULTY_ORDER].sort((a, b) => {
    const distanceA = Math.abs(DIFFICULTY_ORDER.indexOf(a) - index);
    const distanceB = Math.abs(DIFFICULTY_ORDER.indexOf(b) - index);

    if (distanceA !== distanceB) return distanceA - distanceB;

    return DIFFICULTY_ORDER.indexOf(a) - DIFFICULTY_ORDER.indexOf(b);
  });
};

// Picks the next unseen question at (or as close as possible
// to) the requested difficulty. Returns null when the pool is
// exhausted.

export const pickAdaptiveQuestion = ({ pool, usedIds, target }) => {
  const questions = Array.isArray(pool) ? pool : [];
  const used = usedIds instanceof Set ? usedIds : new Set(usedIds || []);

  for (const level of difficultyFallbackOrder(target)) {
    const match = questions.find(
      (question) =>
        question &&
        question.difficulty === level &&
        !used.has(String(question._id))
    );

    if (match) {
      return { question: match, difficulty: level };
    }
  }

  return null;
};

// The whole adaptive run is planned one question at a time —
// how many questions there will be is fixed up front (the pool
// size) even though the difficulty path is not.

export const buildResultPayload = ({
  questions,
  answers,
  topic,
  difficulty,
  mode,
  negativeMarking,
  durationSeconds,
  difficultyProgression,
}) => {
  const summary = scoreQuiz(questions, answers, negativeMarking);

  const outcomes = buildOutcomes(questions, answers);

  return {
    topic: topic || undefined,
    difficulty: difficulty || undefined,
    mode: normalizeMode(mode),
    score: summary.score,
    totalQuestions: summary.total,
    correct: summary.correct,
    wrong: summary.wrong,
    unanswered: summary.unanswered,
    negativeMarking: normalizeNegativeMarking(negativeMarking),
    durationSeconds: isFiniteNumber(durationSeconds)
      ? Math.max(0, Math.round(durationSeconds))
      : undefined,
    difficultyProgression: Array.isArray(difficultyProgression)
      ? difficultyProgression
      : undefined,
    // Compact per-question trail, used by the admin
    // "most-missed questions" aggregate. The answer text is
    // never sent — only the id and the outcome.
    responses: (Array.isArray(questions) ? questions : [])
      .map((question, index) => ({
        questionId: question?._id ? String(question._id) : null,
        topic: question?.topic || undefined,
        difficulty: question?.difficulty || undefined,
        outcome: outcomes[index],
      }))
      .filter((entry) => entry.questionId),
  };
};
