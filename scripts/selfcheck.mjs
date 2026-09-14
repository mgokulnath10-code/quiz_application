// Dependency-free self-check for the pure logic added with the
// quiz-engine / dashboard / admin work.
//
// Run with:  npm run selfcheck
//
// Prints one PASS/FAIL line per case and exits non-zero if any
// case fails. There is no test framework in this repository, and
// this script deliberately does not pretend to be one: it only
// exercises pure functions that take plain objects.
//
// Usage in CI: a non-zero exit status is the failure signal.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  scoreOutcomes,
  scoreQuiz,
  buildOutcomes,
  buildResultPayload,
  applyAdaptiveAnswer,
  pickAdaptiveQuestion,
  stepDifficulty,
  difficultyFallbackOrder,
  initialServedSequence,
  currentServedQuestion,
  nextQuestionIndex,
  isLastServedQuestion,
  servedProgressPercent,
  normalizeNegativeMarking,
  normalizeExamDuration,
  normalizeMode,
  describeNegativeMarking,
  formatScore,
  formatClock,
  formatDuration,
  accuracyPercent,
  OUTCOME,
  MODES,
} from "../src/utils/quizEngine.js";

import { summarizeResults } from "../src/utils/resultSummary.js";

import {
  buildRecommendations,
  topicEvidence,
  sortTopicsByAccuracy,
} from "../src/utils/recommendations.js";

// The backend keeps a CommonJS mirror of the summary maths. It
// must produce byte-identical output, or the dashboard and the
// API would disagree about the same attempts.
const require = createRequire(import.meta.url);

const backendSummary = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "backend",
    "utils",
    "resultSummary.js"
  )
);

const backendAnalytics = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "backend",
    "utils",
    "analytics.js"
  )
);

let passed = 0;
let failed = 0;

const case_ = (name, fn) => {
  try {
    fn();

    passed += 1;

    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;

    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
};

const assertEqual = (actual, expected, label = "value") => {
  const a = JSON.stringify(actual);
  const b = JSON.stringify(expected);

  if (a !== b) {
    throw new Error(`${label}: expected ${b}, received ${a}`);
  }
};

const assertTrue = (value, label = "value") => {
  if (!value) throw new Error(`${label}: expected a truthy value`);
};

const assertFalse = (value, label = "value") => {
  if (value) throw new Error(`${label}: expected a falsy value`);
};

const question = (id, difficulty, answer = "A") => ({
  _id: id,
  question: `Q${id}`,
  options: ["A", "B", "C", "D"],
  answer,
  difficulty,
  topic: "python",
  category: "programming",
});

console.log("");
console.log("BrainRace selfcheck");
console.log("===================");
console.log("");

/* =====================
   A1 — NEGATIVE MARKING
===================== */

console.log("-- negative marking --");

case_("no marking: score equals the number correct", () => {
  const result = scoreOutcomes(
    [OUTCOME.CORRECT, OUTCOME.CORRECT, OUTCOME.WRONG],
    0
  );

  assertEqual(result.correct, 2, "correct");
  assertEqual(result.wrong, 1, "wrong");
  assertEqual(result.score, 2, "score");
});

case_("0.25 per wrong answer is deducted", () => {
  const result = scoreOutcomes(
    [OUTCOME.CORRECT, OUTCOME.CORRECT, OUTCOME.WRONG],
    0.25
  );

  assertEqual(result.score, 1.75, "score");
  assertEqual(result.penalty, 0.25, "penalty");
});

case_("0.5 per wrong answer is deducted", () => {
  const result = scoreOutcomes(
    [
      OUTCOME.CORRECT,
      OUTCOME.CORRECT,
      OUTCOME.CORRECT,
      OUTCOME.WRONG,
      OUTCOME.WRONG,
    ],
    0.5
  );

  assertEqual(result.correct, 3, "correct");
  assertEqual(result.wrong, 2, "wrong");
  assertEqual(result.score, 2, "score");
});

case_("1 per wrong answer can cancel every correct answer", () => {
  const result = scoreOutcomes(
    [OUTCOME.CORRECT, OUTCOME.WRONG],
    1
  );

  assertEqual(result.score, 0, "score");
});

case_("unanswered questions are never penalised", () => {
  const withBlanks = scoreOutcomes(
    [OUTCOME.CORRECT, OUTCOME.UNANSWERED, OUTCOME.UNANSWERED],
    1
  );

  assertEqual(withBlanks.score, 1, "score");
  assertEqual(withBlanks.unanswered, 2, "unanswered");
  assertEqual(withBlanks.penalty, 0, "penalty");
});

case_("score is floored at zero", () => {
  const result = scoreOutcomes(
    [OUTCOME.WRONG, OUTCOME.WRONG, OUTCOME.WRONG, OUTCOME.WRONG],
    1
  );

  assertEqual(result.rawScore, -4, "rawScore");
  assertEqual(result.score, 0, "score");
});

case_("multiples of 0.25 stay exact for a 20-question run", () => {
  const outcomes = Array.from({ length: 13 }, () => OUTCOME.CORRECT)
    .concat(Array.from({ length: 7 }, () => OUTCOME.WRONG));

  const result = scoreOutcomes(outcomes, 0.25);

  assertEqual(result.score, 11.25, "score");
});

case_("buildOutcomes maps blank and missing answers to unanswered", () => {
  const questions = [
    question("1", "easy"),
    question("2", "easy"),
    question("3", "easy"),
  ];

  const outcomes = buildOutcomes(questions, ["A", "", undefined]);

  assertEqual(
    outcomes,
    [OUTCOME.CORRECT, OUTCOME.UNANSWERED, OUTCOME.UNANSWERED],
    "outcomes"
  );
});

case_("buildOutcomes tolerates surrounding whitespace", () => {
  const outcomes = buildOutcomes(
    [question("1", "easy")],
    ["  A  "]
  );

  assertEqual(outcomes, [OUTCOME.CORRECT], "outcomes");
});

case_("scoreQuiz ties questions to answers by position", () => {
  const questions = [
    question("1", "easy"),
    question("2", "easy"),
    question("3", "easy"),
  ];

  const result = scoreQuiz(questions, ["A", "B", "C"], 0.5);

  assertEqual(result.correct, 1, "correct");
  assertEqual(result.wrong, 2, "wrong");
  assertEqual(result.score, 0, "score");
});

case_("normalizeNegativeMarking rejects unsupported values", () => {
  assertEqual(normalizeNegativeMarking("0.5"), 0.5, "0.5");
  assertEqual(normalizeNegativeMarking(3), 0, "3 -> default");
  assertEqual(normalizeNegativeMarking(undefined), 0, "undefined");
  assertEqual(normalizeNegativeMarking("abc"), 0, "abc");
});

case_("describeNegativeMarking reads as a rule", () => {
  assertEqual(
    describeNegativeMarking(0),
    "No negative marking",
    "none"
  );
  assertEqual(
    describeNegativeMarking(0.5),
    "−0.5 marks per wrong answer",
    "half"
  );
  assertEqual(
    describeNegativeMarking(1),
    "−1 mark per wrong answer",
    "one"
  );
});

/* =====================
   A2 — EXAM CLOCK
===================== */

console.log("");
console.log("-- exam clock --");

case_("normalizeExamDuration only accepts the offered durations", () => {
  [0, 5, 10, 15, 20].forEach((value) => {
    assertEqual(normalizeExamDuration(value), value, String(value));
  });

  assertEqual(normalizeExamDuration(7), 0, "7 -> no limit");
  assertEqual(normalizeExamDuration(null), 0, "null");
});

case_("formatClock renders mm:ss and never goes negative", () => {
  assertEqual(formatClock(0), "00:00", "zero");
  assertEqual(formatClock(59), "00:59", "59s");
  assertEqual(formatClock(60), "01:00", "1min");
  assertEqual(formatClock(1200), "20:00", "20min");
  assertEqual(formatClock(-5), "00:00", "negative clamps");
});

case_("normalizeMode falls back to practice", () => {
  assertEqual(normalizeMode("exam"), MODES.EXAM, "exam");
  assertEqual(normalizeMode("adaptive"), MODES.ADAPTIVE, "adaptive");
  assertEqual(normalizeMode("nonsense"), MODES.PRACTICE, "fallback");
  assertEqual(normalizeMode(undefined), MODES.PRACTICE, "undefined");
});

case_("an expired exam scores unserved questions as unanswered", () => {
  // The candidate answered 2 of 5 and the clock ran out.
  const questions = [
    question("1", "easy"),
    question("2", "easy"),
    null,
    null,
    null,
  ];

  const result = scoreQuiz(questions, ["A", "A", "", "", ""], 0.5);

  assertEqual(result.total, 5, "total");
  assertEqual(result.correct, 2, "correct");
  assertEqual(result.wrong, 0, "wrong");
  assertEqual(result.unanswered, 3, "unanswered");
  assertEqual(result.score, 2, "score");
});

case_("an expired exam still deducts for answers already given", () => {
  const questions = [
    question("1", "easy"),
    question("2", "easy"),
    null,
    null,
  ];

  const result = scoreQuiz(questions, ["A", "B", "", ""], 1);

  assertEqual(result.correct, 1, "correct");
  assertEqual(result.wrong, 1, "wrong");
  assertEqual(result.unanswered, 2, "unanswered");
  assertEqual(result.score, 0, "score");
});

case_("accuracyPercent reports null for an empty run", () => {
  assertEqual(accuracyPercent({ total: 0, correct: 0 }), null, "empty");
  assertEqual(
    accuracyPercent({ total: 4, correct: 3 }),
    75,
    "3/4"
  );
});

case_("formatScore drops trailing zeros but keeps quarters", () => {
  assertEqual(formatScore(3), "3", "3");
  assertEqual(formatScore(2.5), "2.5", "2.5");
  assertEqual(formatScore(11.25), "11.25", "11.25");
  assertEqual(formatScore(0), "0", "0");
  assertEqual(formatScore(null), "—", "null");
});

case_("formatDuration renders seconds and minutes", () => {
  assertEqual(formatDuration(45), "45s", "45s");
  assertEqual(formatDuration(60), "1m", "1m");
  assertEqual(formatDuration(125), "2m 5s", "2m5s");
  assertEqual(formatDuration(-1), "—", "negative");
});

/* =====================
   A3 — ADAPTIVE DIFFICULTY
===================== */

console.log("");
console.log("-- adaptive difficulty --");

case_("one correct answer does not move the level", () => {
  const next = applyAdaptiveAnswer(
    { difficulty: "medium", correctStreak: 0, wrongStreak: 0 },
    OUTCOME.CORRECT
  );

  assertEqual(next.difficulty, "medium", "difficulty");
  assertEqual(next.correctStreak, 1, "correctStreak");
  assertEqual(next.stepped, null, "stepped");
});

case_("two consecutive correct answers step up", () => {
  const first = applyAdaptiveAnswer(
    { difficulty: "medium", correctStreak: 0, wrongStreak: 0 },
    OUTCOME.CORRECT
  );

  const second = applyAdaptiveAnswer(first, OUTCOME.CORRECT);

  assertEqual(second.difficulty, "hard", "difficulty");
  assertEqual(second.correctStreak, 0, "streak resets after a step");
  assertEqual(second.stepped, "up", "stepped");
});

case_("two consecutive wrong answers step down", () => {
  const first = applyAdaptiveAnswer(
    { difficulty: "medium", correctStreak: 0, wrongStreak: 0 },
    OUTCOME.WRONG
  );

  const second = applyAdaptiveAnswer(first, OUTCOME.WRONG);

  assertEqual(second.difficulty, "easy", "difficulty");
  assertEqual(second.stepped, "down", "stepped");
});

case_("a correct answer breaks a wrong streak", () => {
  const wrong = applyAdaptiveAnswer(
    { difficulty: "medium", correctStreak: 0, wrongStreak: 0 },
    OUTCOME.WRONG
  );

  const right = applyAdaptiveAnswer(wrong, OUTCOME.CORRECT);

  assertEqual(right.wrongStreak, 0, "wrongStreak");
  assertEqual(right.difficulty, "medium", "difficulty unchanged");
});

case_("difficulty is bounded at hard", () => {
  let state = { difficulty: "hard", correctStreak: 0, wrongStreak: 0 };

  for (let i = 0; i < 6; i += 1) {
    state = applyAdaptiveAnswer(state, OUTCOME.CORRECT);
  }

  assertEqual(state.difficulty, "hard", "difficulty");
});

case_("difficulty is bounded at easy", () => {
  let state = { difficulty: "easy", correctStreak: 0, wrongStreak: 0 };

  for (let i = 0; i < 6; i += 1) {
    state = applyAdaptiveAnswer(state, OUTCOME.WRONG);
  }

  assertEqual(state.difficulty, "easy", "difficulty");
});

case_("an unanswered question is neutral and resets both streaks", () => {
  const next = applyAdaptiveAnswer(
    { difficulty: "medium", correctStreak: 1, wrongStreak: 0 },
    OUTCOME.UNANSWERED
  );

  assertEqual(next.difficulty, "medium", "difficulty");
  assertEqual(next.correctStreak, 0, "correctStreak");
  assertEqual(next.wrongStreak, 0, "wrongStreak");
  assertEqual(next.stepped, null, "stepped");
});

case_("stepDifficulty clamps at both ends", () => {
  assertEqual(stepDifficulty("easy", "down"), "easy", "easy down");
  assertEqual(stepDifficulty("hard", "up"), "hard", "hard up");
  assertEqual(stepDifficulty("easy", "up"), "medium", "easy up");
  assertEqual(stepDifficulty("hard", "down"), "medium", "hard down");
});

case_("difficultyFallbackOrder prefers the nearest level", () => {
  assertEqual(
    difficultyFallbackOrder("medium"),
    ["medium", "easy", "hard"],
    "from medium"
  );
  assertEqual(
    difficultyFallbackOrder("easy"),
    ["easy", "medium", "hard"],
    "from easy"
  );
  assertEqual(
    difficultyFallbackOrder("hard"),
    ["hard", "medium", "easy"],
    "from hard"
  );
});

case_("pickAdaptiveQuestion returns an unseen question at the level", () => {
  const pool = [
    question("e1", "easy"),
    question("m1", "medium"),
    question("m2", "medium"),
    question("h1", "hard"),
  ];

  const pick = pickAdaptiveQuestion({
    pool,
    usedIds: new Set(["m1"]),
    target: "medium",
  });

  assertEqual(pick.question._id, "m2", "picked id");
  assertEqual(pick.difficulty, "medium", "picked difficulty");
});

case_("pickAdaptiveQuestion falls back to the nearest level", () => {
  const pool = [
    question("e1", "easy"),
    question("h1", "hard"),
  ];

  const pick = pickAdaptiveQuestion({
    pool,
    usedIds: new Set(),
    target: "medium",
  });

  assertEqual(pick.difficulty, "easy", "nearest level");
  assertEqual(pick.question._id, "e1", "picked id");
});

case_("pickAdaptiveQuestion returns null on an exhausted pool", () => {
  const pool = [question("e1", "easy")];

  const pick = pickAdaptiveQuestion({
    pool,
    usedIds: new Set(["e1"]),
    target: "easy",
  });

  assertEqual(pick, null, "pick");
});

case_("an adaptive run records the level actually served", () => {
  const pool = [
    question("e1", "easy"),
    question("e2", "easy"),
    question("m1", "medium"),
    question("m2", "medium"),
    question("h1", "hard"),
  ];

  let state = { difficulty: "easy", correctStreak: 0, wrongStreak: 0 };
  const used = new Set();
  const progression = [];

  // Answer correctly twice, then wrongly once: easy, easy, medium.
  const outcomes = [
    OUTCOME.CORRECT,
    OUTCOME.CORRECT,
    OUTCOME.WRONG,
  ];

  outcomes.forEach((outcome, index) => {
    const pick = pickAdaptiveQuestion({
      pool,
      usedIds: used,
      target: state.difficulty,
    });

    progression.push({ index, difficulty: pick.difficulty });

    used.add(String(pick.question._id));

    state = applyAdaptiveAnswer(state, outcome);
  });

  assertEqual(
    progression,
    [
      { index: 0, difficulty: "easy" },
      { index: 1, difficulty: "easy" },
      { index: 2, difficulty: "medium" },
    ],
    "progression"
  );
});

/* =====================
   A3b — SERVED SEQUENCE (one question at a time)
===================== */

console.log("");
console.log("-- served sequence --");

// Drives the pure helpers exactly the way Quiz.jsx does: the
// served sequence starts as one question and grows by one entry
// per answer, ending once the question on screen is the last of
// the planned run.

const serveNext = (served, pool, plannedTotal) => {
  if (isLastServedQuestion(served, plannedTotal)) {
    return { served, ended: true };
  }

  const next = pool[nextQuestionIndex(served)] || null;

  if (!next) return { served, ended: true };

  return { served: [...served, next], ended: false };
};

const threeQuestionPool = () => [
  question("1", "easy"),
  question("2", "easy"),
  question("3", "easy"),
];

case_("(a) a 3-question pool starts with exactly one question — the first", () => {
  const pool = threeQuestionPool();
  const served = initialServedSequence(pool);

  assertEqual(served.length, 1, "served length");
  assertEqual(served[0]._id, "1", "the first question is served");
  assertEqual(
    currentServedQuestion(served)._id,
    "1",
    "current question"
  );
  assertEqual(nextQuestionIndex(served), 1, "question number on screen");
  assertFalse(
    isLastServedQuestion(served, pool.length),
    "the first question is not the end of the run"
  );
});

case_("(a) the fallback bank also starts on its first question", () => {
  const fallback = [
    question("f1", "easy"),
    question("f2", "medium"),
    question("f3", "hard"),
  ];

  const served = initialServedSequence(fallback);

  assertEqual(served.length, 1, "served length");
  assertEqual(served[0]._id, "f1", "first question of the pool");
});

case_("(b) the 3rd question is served on the 3rd serving, and only a 3rd answer ends the run", () => {
  const pool = threeQuestionPool();
  const plannedTotal = pool.length;

  let served = initialServedSequence(pool);
  const onScreen = [currentServedQuestion(served)._id];
  const endedAfter = [];

  // One question reaches the screen per answer; the run ends
  // only on the answer given to the final question.
  for (let answer = 0; answer < 3; answer += 1) {
    const stepped = serveNext(served, pool, plannedTotal);

    endedAfter.push(stepped.ended);

    if (stepped.ended) break;

    served = stepped.served;
    onScreen.push(currentServedQuestion(served)._id);
  }

  assertEqual(onScreen, ["1", "2", "3"], "questions served in order");
  assertEqual(endedAfter, [false, false, true], "the run ends on answer 3");
});

case_("(c) isLastServedQuestion is false for answers 1 and 2, true for answer 3", () => {
  const pool = threeQuestionPool();
  const plannedTotal = pool.length;

  let served = initialServedSequence(pool);
  const flags = [];

  for (let answer = 0; answer < 3; answer += 1) {
    // Value the button caption and the end-of-run test see when
    // this answer is submitted.
    flags.push(isLastServedQuestion(served, plannedTotal));

    served = serveNext(served, pool, plannedTotal).served;
  }

  assertEqual(flags, [false, false, true], "flags per answer");
});

case_("(d) a 1-question pool ends after its first answer", () => {
  const pool = [question("only", "easy")];
  const served = initialServedSequence(pool);

  assertEqual(served.length, 1, "served length");
  assertTrue(
    isLastServedQuestion(served, pool.length),
    "the only question is the last"
  );

  const stepped = serveNext(served, pool, pool.length);

  assertTrue(stepped.ended, "the run ends");
  assertEqual(stepped.served.length, 1, "nothing was appended");
});

case_("(e) progress is 0 on the first question and never decreases", () => {
  const pool = threeQuestionPool();
  const plannedTotal = pool.length;

  let served = initialServedSequence(pool);
  const points = [servedProgressPercent(served, plannedTotal)];

  for (let answer = 0; answer < 2; answer += 1) {
    served = serveNext(served, pool, plannedTotal).served;
    points.push(servedProgressPercent(served, plannedTotal));
  }

  assertEqual(points[0], 0, "starts at 0");

  for (let i = 1; i < points.length; i += 1) {
    assertTrue(
      points[i] >= points[i - 1],
      `point ${i} (${points[i]}) is below point ${i - 1} (${points[i - 1]})`
    );
  }

  assertTrue(points[1] > points[0], "progress moves after an answer");
});

case_("practice, exam and adaptive all serve the pool's first question", () => {
  const pool = threeQuestionPool();

  [MODES.PRACTICE, MODES.EXAM].forEach((mode) => {
    const served = initialServedSequence(pool);

    assertEqual(served.length, 1, `${mode} served length`);
    assertEqual(served[0]._id, "1", `${mode} first question`);
  });

  // Adaptive picks its opening question by difficulty, then hands
  // it through the same initial-served-sequence rule.
  const firstPick = pickAdaptiveQuestion({
    pool,
    usedIds: new Set(),
    target: "easy",
  });

  const adaptiveServed = initialServedSequence(pool, firstPick.question);

  assertEqual(adaptiveServed.length, 1, "adaptive served length");
  assertEqual(adaptiveServed[0]._id, "1", "adaptive first question");
});

case_("every mode serves the whole pool once and then ends", () => {
  const pool = threeQuestionPool();
  const plannedTotal = pool.length;

  [MODES.PRACTICE, MODES.EXAM, MODES.ADAPTIVE].forEach((mode) => {
    const adaptive = mode === MODES.ADAPTIVE;

    const opening = adaptive
      ? pickAdaptiveQuestion({
          pool,
          usedIds: new Set(),
          target: "easy",
        }).question
      : null;

    let served = initialServedSequence(pool, opening);
    const order = [currentServedQuestion(served)._id];

    for (let step = 0; step < 10; step += 1) {
      if (isLastServedQuestion(served, plannedTotal)) break;

      const next = adaptive
        ? (pickAdaptiveQuestion({
            pool,
            usedIds: new Set(
              served.map((entry) => String(entry._id))
            ),
            target: currentServedQuestion(served).difficulty,
          }) || {}).question || null
        : pool[nextQuestionIndex(served)] || null;

      if (!next) break;

      served = [...served, next];
      order.push(currentServedQuestion(served)._id);
    }

    assertEqual(order, ["1", "2", "3"], `${mode} served order`);
    assertEqual(served.length, plannedTotal, `${mode} served count`);
  });
});

/* =====================
   A3c — THE OLD vs FIXED FLOW, VIA THE REAL SCORER
===================== */

console.log("");
console.log("-- served-sequence regression: old vs fixed flow --");

case_("old flow scores the single WRONG padded to 3 as the on-screen 0/3", () => {
  // The defect served the whole pool, so the candidate answered
  // the last question once and the run ended. The single answer
  // was padded out to the planned 3 with unanswered slots.
  const result = scoreOutcomes(
    [OUTCOME.WRONG, OUTCOME.UNANSWERED, OUTCOME.UNANSWERED],
    0.25
  );

  assertEqual(result.total, 3, "total");
  assertEqual(result.correct, 0, "correct");
  assertEqual(result.wrong, 1, "wrong");
  assertEqual(result.unanswered, 2, "unanswered");
  assertEqual(result.penalty, 0.25, "penalty");
  assertEqual(result.score, 0, "score");
});

case_("fixed flow records all three served questions", () => {
  // Q1 answered wrong, Q2 and Q3 reached and answered.
  const result = scoreOutcomes(
    [OUTCOME.WRONG, OUTCOME.CORRECT, OUTCOME.WRONG],
    0.25
  );

  assertEqual(result.total, 3, "total");
  assertEqual(result.unanswered, 0, "unanswered");
  assertEqual(result.correct, 1, "correct");
  assertEqual(result.wrong, 2, "wrong");
  assertEqual(result.penalty, 0.5, "penalty");
  assertEqual(result.score, 0.5, "score");
});

/* =====================
   A4 — RESULT PAYLOAD
===================== */

console.log("");
console.log("-- result payload --");

case_("buildResultPayload carries the additive fields", () => {
  const questions = [
    question("1", "easy"),
    question("2", "medium"),
  ];

  const payload = buildResultPayload({
    questions,
    answers: ["A", "B"],
    topic: "python",
    difficulty: "easy",
    mode: MODES.ADAPTIVE,
    negativeMarking: 0.5,
    durationSeconds: 92.4,
    difficultyProgression: [
      { index: 0, difficulty: "easy" },
      { index: 1, difficulty: "medium" },
    ],
  });

  assertEqual(payload.topic, "python", "topic");
  assertEqual(payload.difficulty, "easy", "difficulty");
  assertEqual(payload.mode, "adaptive", "mode");
  assertEqual(payload.correct, 1, "correct");
  assertEqual(payload.wrong, 1, "wrong");
  assertEqual(payload.unanswered, 0, "unanswered");
  assertEqual(payload.negativeMarking, 0.5, "negativeMarking");
  assertEqual(payload.durationSeconds, 92, "durationSeconds rounded");
  assertEqual(payload.totalQuestions, 2, "totalQuestions");
  assertEqual(payload.score, 0.5, "score");
  assertEqual(payload.responses.length, 2, "responses");
  assertEqual(
    payload.responses[0],
    {
      questionId: "1",
      topic: "python",
      difficulty: "easy",
      outcome: "correct",
    },
    "first response"
  );
});

case_("buildResultPayload omits fields it has no value for", () => {
  const payload = buildResultPayload({
    questions: [question("1", "easy")],
    answers: ["A"],
    mode: undefined,
    negativeMarking: undefined,
    durationSeconds: undefined,
  });

  assertEqual(payload.topic, undefined, "topic");
  assertEqual(payload.difficulty, undefined, "difficulty");
  assertEqual(payload.durationSeconds, undefined, "durationSeconds");
  assertEqual(payload.mode, "practice", "mode defaults to practice");
  assertEqual(payload.negativeMarking, 0, "negativeMarking defaults to 0");
});

case_("buildResultPayload never sends the correct answer text", () => {
  const payload = buildResultPayload({
    questions: [question("1", "easy", "A")],
    answers: ["B"],
    mode: MODES.PRACTICE,
  });

  assertFalse(
    JSON.stringify(payload).includes('"answer"'),
    "payload must not carry an answer field"
  );
});

/* =====================
   B — RESULT SUMMARY MATHS
===================== */

console.log("");
console.log("-- result summaries --");

const legacyResults = [
  // Newest first, as the API returns them.
  {
    _id: "r4",
    score: 8,
    totalQuestions: 10,
    topic: "python",
    difficulty: "hard",
    correct: 8,
    wrong: 1,
    unanswered: 1,
    mode: "practice",
    date: "2026-09-04T10:00:00.000Z",
  },
  {
    _id: "r3",
    score: 2,
    totalQuestions: 10,
    topic: "python",
    difficulty: "easy",
    correct: 2,
    wrong: 0,
    unanswered: 8,
    mode: "practice",
    date: "2026-09-03T10:00:00.000Z",
  },
  {
    _id: "r2",
    score: 5,
    totalQuestions: 10,
    topic: "java",
    difficulty: "medium",
    correct: 5,
    wrong: 5,
    unanswered: 0,
    mode: "exam",
    date: "2026-09-02T10:00:00.000Z",
  },
  // Predates every new field.
  {
    _id: "r1",
    score: 6,
    totalQuestions: 10,
    date: "2026-09-01T10:00:00.000Z",
  },
];

case_("summary counts attempts and derives averages", () => {
  const summary = summarizeResults(legacyResults);

  assertEqual(summary.attempts, 4, "attempts");
  assertEqual(summary.averageScore, 5.25, "averageScore");
  assertEqual(summary.bestScore, 8, "bestScore");
});

case_("legacy attempts are excluded from accuracy, not guessed at", () => {
  const summary = summarizeResults(legacyResults);

  assertEqual(summary.scoredAttempts, 3, "scoredAttempts");
  assertEqual(summary.questionsAnswered, 30, "questionsAnswered");
  assertEqual(summary.correctAnswers, 15, "correctAnswers");
  assertEqual(summary.accuracy, 0.5, "accuracy");
});

case_("accuracy is null when no attempt recorded outcomes", () => {
  const summary = summarizeResults([legacyResults[3]]);

  assertEqual(summary.attempts, 1, "attempts");
  assertEqual(summary.accuracy, null, "accuracy");
  assertEqual(summary.bestScore, 6, "bestScore");
});

case_("current streak stops at the first attempt under 50%", () => {
  const summary = summarizeResults(legacyResults);

  // r4 is 8/10 (pass), r3 is 2/10 (fail) -> streak of 1.
  assertEqual(summary.currentStreak, 1, "currentStreak");
});

case_("current streak counts a run from the newest attempt", () => {
  const summary = summarizeResults([
    { score: 6, totalQuestions: 10 },
    { score: 5, totalQuestions: 10 },
    { score: 1, totalQuestions: 10 },
  ]);

  assertEqual(summary.currentStreak, 2, "currentStreak");
});

case_("per-topic rows report attempts and accuracy", () => {
  const summary = summarizeResults(legacyResults);

  assertEqual(
    summary.topics,
    [
      {
        key: "java",
        attempts: 1,
        scoredAttempts: 1,
        correct: 5,
        questions: 10,
        accuracy: 0.5,
      },
      {
        key: "python",
        attempts: 2,
        scoredAttempts: 2,
        correct: 10,
        questions: 20,
        accuracy: 0.5,
      },
    ],
    "topics"
  );
});

case_("per-difficulty rows are derived from stored difficulty", () => {
  const summary = summarizeResults(legacyResults);

  assertEqual(
    summary.difficulties.map((row) => row.key),
    ["easy", "hard", "medium"],
    "difficulty keys"
  );
});

case_("a topic with no recorded accuracy still counts attempts", () => {
  const summary = summarizeResults([
    {
      score: 3,
      totalQuestions: 5,
      topic: "cpp",
      difficulty: "easy",
    },
  ]);

  assertEqual(summary.topics[0].attempts, 1, "attempts");
  assertEqual(summary.topics[0].accuracy, null, "accuracy");
  assertEqual(summary.topics[0].correct, null, "correct");
});

case_("an empty history produces nulls, never zeros", () => {
  const summary = summarizeResults([]);

  assertEqual(summary.attempts, 0, "attempts");
  assertEqual(summary.averageScore, null, "averageScore");
  assertEqual(summary.bestScore, null, "bestScore");
  assertEqual(summary.accuracy, null, "accuracy");
  assertEqual(summary.currentStreak, 0, "currentStreak");
});

case_("the backend copy of the summary maths agrees exactly", () => {
  const frontend = summarizeResults(legacyResults);
  const backend = backendSummary.summarizeResults(legacyResults);

  assertEqual(backend, frontend, "backend vs frontend summary");
});

case_("the backend summary agrees on an empty history", () => {
  assertEqual(
    backendSummary.summarizeResults([]),
    summarizeResults([]),
    "empty summary"
  );
});

case_("the backend summary tolerates non-numeric legacy scores", () => {
  const docs = [
    { score: null, totalQuestions: 10 },
    { score: "8", totalQuestions: 10 },
    { score: 4, totalQuestions: 10 },
  ];

  assertEqual(
    backendSummary.summarizeResults(docs),
    summarizeResults(docs),
    "mixed summary"
  );

  assertEqual(
    summarizeResults(docs).averageScore,
    4,
    "average ignores unparsable scores"
  );
});

/* =====================
   E — ADMIN AGGREGATES
===================== */

console.log("");
console.log("-- admin aggregates --");

case_("score distribution buckets by percentage of questions", () => {
  const buckets = backendAnalytics.scoreDistribution([
    { score: 1, totalQuestions: 10 },
    { score: 5, totalQuestions: 10 },
    { score: 7, totalQuestions: 10 },
    { score: 10, totalQuestions: 10 },
  ]);

  assertEqual(
    buckets,
    [
      { bucket: "0-20%", count: 1 },
      { bucket: "21-40%", count: 0 },
      { bucket: "41-60%", count: 1 },
      { bucket: "61-80%", count: 1 },
      { bucket: "81-100%", count: 1 },
    ],
    "buckets"
  );
});

case_("a perfect score lands in the last bucket, not off the end", () => {
  const buckets = backendAnalytics.scoreDistribution([
    { score: 20, totalQuestions: 20 },
  ]);

  assertEqual(buckets[4].count, 1, "100% bucket");
});

case_("attempts over time fills the gaps with zero", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  const series = backendAnalytics.attemptsOverTime(
    [
      { date: "2026-09-10T08:00:00.000Z" },
      { date: "2026-09-10T09:00:00.000Z" },
      { date: "2026-09-08T09:00:00.000Z" },
      { date: "2026-01-01T09:00:00.000Z" },
    ],
    now,
    3
  );

  assertEqual(series.length, 3, "window length");
  assertEqual(
    series.map((point) => point.attempts),
    [1, 0, 2],
    "daily counts"
  );
});

case_("per-topic accuracy is weakest first and null-safe", () => {
  const rows = backendAnalytics.topicAccuracy([
    { topic: "java", correct: 9, wrong: 1, unanswered: 0 },
    { topic: "python", correct: 2, wrong: 8, unanswered: 0 },
    { topic: "cpp" },
  ]);

  assertEqual(
    rows.map((row) => row.topic),
    ["python", "java", "cpp"],
    "order"
  );
  assertEqual(rows[0].accuracy, 20, "python accuracy");
  assertEqual(rows[2].accuracy, null, "cpp accuracy");
});

case_("most-missed questions needs recorded responses", () => {
  const rows = backendAnalytics.mostMissedQuestions(
    [
      {
        responses: [
          { questionId: "q1", outcome: "wrong" },
          { questionId: "q1", outcome: "wrong" },
          { questionId: "q2", outcome: "correct" },
        ],
      },
      {
        responses: [{ questionId: "q1", outcome: "correct" }],
      },
      { score: 5, totalQuestions: 10 },
    ],
    5
  );

  assertEqual(rows.length, 1, "rows");
  assertEqual(rows[0].questionId, "q1", "question");
  assertEqual(rows[0].misses, 2, "misses");
  assertEqual(rows[0].served, 3, "served");
  assertEqual(rows[0].missRate, 66.7, "missRate");
});

case_("active users counts distinct owners in the window", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  const analytics = backendAnalytics.buildAdminAnalytics(
    [
      { userId: "u1", date: "2026-09-10T08:00:00.000Z" },
      { userId: "u1", date: "2026-09-09T08:00:00.000Z" },
      { user: "Legacy Name", date: "2026-09-05T08:00:00.000Z" },
      // Inside the 30-day window, outside the 7-day one.
      { userId: "u2", date: "2026-08-20T08:00:00.000Z" },
      // Outside both windows.
      { userId: "u3", date: "2026-07-01T08:00:00.000Z" },
    ],
    { now, windowDays: 30 }
  );

  assertEqual(analytics.activeUsers.last7Days, 2, "last 7 days");
  assertEqual(analytics.activeUsers.last30Days, 3, "last 30 days");
  assertEqual(analytics.usersWithAttempts, 4, "distinct owners");
});

case_("attempts in the future are not counted as active", () => {
  const now = new Date("2026-09-10T12:00:00.000Z");

  const analytics = backendAnalytics.buildAdminAnalytics(
    [{ userId: "u1", date: "2030-01-01T08:00:00.000Z" }],
    { now, windowDays: 30 }
  );

  assertEqual(analytics.activeUsers.last30Days, 0, "last 30 days");
});

case_("admin accuracy is null when nothing recorded outcomes", () => {
  const analytics = backendAnalytics.buildAdminAnalytics([
    { score: 5, totalQuestions: 10 },
  ]);

  assertEqual(analytics.recordedAccuracy, null, "recordedAccuracy");
  assertEqual(analytics.accuracySampleSize, 0, "sample size");
});

/* =====================
   E10 — MANAGE USERS ROLLUP
===================== */

console.log("");
console.log("-- user rollup --");

case_("user stats join attempts by id and by legacy name", () => {
  const rows = backendAnalytics.buildUserStats(
    [
      { _id: "u1", name: "Gokul", email: "g@x.com", provider: "github" },
      { _id: "u2", name: "Legacy Name", email: "l@x.com" },
      { _id: "u3", name: "Quiet", email: "q@x.com" },
    ],
    [
      {
        userId: "u1",
        score: 9,
        totalQuestions: 10,
        correct: 9,
        wrong: 1,
        unanswered: 0,
        date: "2026-09-04T10:00:00.000Z",
      },
      {
        userId: "u1",
        score: 7,
        totalQuestions: 10,
        date: "2026-09-05T10:00:00.000Z",
      },
      {
        user: "Legacy Name",
        score: 4,
        totalQuestions: 10,
        date: "2026-09-03T10:00:00.000Z",
      },
    ]
  );

  const gokul = rows.find((row) => row._id === "u1");
  const legacy = rows.find((row) => row._id === "u2");
  const quiet = rows.find((row) => row._id === "u3");

  assertEqual(gokul.attempts, 2, "gokul attempts");
  assertEqual(gokul.averageScore, 8, "gokul average");
  assertEqual(gokul.bestScore, 9, "gokul best");
  assertEqual(gokul.accuracy, 90, "gokul accuracy");
  assertEqual(gokul.lastActivity, "2026-09-05T10:00:00.000Z", "last activity");
  assertEqual(gokul.disabled, false, "disabled defaults to false");

  assertEqual(legacy.attempts, 1, "legacy attempts");
  assertEqual(legacy.legacyAttempts, 1, "legacy flagged");

  assertEqual(quiet.attempts, 0, "no attempts");
  assertEqual(quiet.averageScore, null, "no average");
  assertEqual(quiet.bestScore, null, "no best");
  assertEqual(quiet.lastActivity, null, "no activity");
});

case_("a user with no name is not given another user's legacy rows", () => {
  const rows = backendAnalytics.buildUserStats(
    [{ _id: "u9", name: "", email: "noname@x.com" }],
    [{ user: "", score: 5, totalQuestions: 10 }]
  );

  assertEqual(rows[0].attempts, 0, "attempts");
});

/* =====================
   D — RECOMMENDATIONS
===================== */

console.log("");
console.log("-- recommendations --");

const attempt = (topic, difficulty, correct, total) => ({
  topic,
  difficulty,
  correct,
  wrong: total - correct,
  unanswered: 0,
  score: correct,
  totalQuestions: total,
  date: "2026-09-01T10:00:00.000Z",
});

case_("too little history returns a placement suggestion", () => {
  const result = buildRecommendations([
    attempt("python", "easy", 2, 10),
    attempt("python", "easy", 2, 10),
  ]);

  assertFalse(result.ready, "ready");
  assertEqual(result.items.length, 0, "items");
  assertEqual(result.placementHref, "/quiz-setup?mode=placement", "href");
  assertTrue(
    result.reason.includes("2 recorded attempts"),
    "reason names the count"
  );
});

case_("zero history is explained, not faked", () => {
  const result = buildRecommendations([]);

  assertFalse(result.ready, "ready");
  assertEqual(result.reason, "No attempts recorded yet.", "reason");
});

case_("attempts without outcomes cannot drive a recommendation", () => {
  const result = buildRecommendations([
    { topic: "python", score: 5, totalQuestions: 10 },
    { topic: "python", score: 5, totalQuestions: 10 },
    { topic: "java", score: 5, totalQuestions: 10 },
  ]);

  assertFalse(result.ready, "ready");
  assertTrue(
    result.reason.includes("per-question results"),
    "reason explains the gap"
  );
});

case_("the weakest topic is recommended first", () => {
  const result = buildRecommendations([
    attempt("python", "easy", 4, 10),
    attempt("python", "easy", 4, 10),
    attempt("java", "medium", 9, 10),
    attempt("java", "medium", 9, 10),
    attempt("cpp", "medium", 6, 10),
    attempt("cpp", "medium", 7, 10),
  ]);

  assertTrue(result.ready, "ready");
  assertEqual(
    result.items.map((item) => item.topic),
    ["python", "cpp", "java"],
    "order"
  );
});

case_("ties break on more evidence, then alphabetically", () => {
  const result = buildRecommendations([
    attempt("java", "easy", 5, 10),
    attempt("java", "easy", 5, 10),
    attempt("cpp", "easy", 5, 10),
    attempt("cpp", "easy", 5, 10),
    attempt("ruby", "easy", 5, 10),
    attempt("ruby", "easy", 5, 10),
    attempt("go", "easy", 5, 10),
    attempt("go", "easy", 5, 10),
  ]);

  assertEqual(
    result.items.map((item) => item.topic),
    ["cpp", "go", "java"],
    "alphabetical among equals"
  );
});

case_("a weak topic steps down to the easiest level attempted", () => {
  const result = buildRecommendations([
    attempt("python", "easy", 5, 10),
    attempt("python", "hard", 3, 10),
    attempt("python", "hard", 2, 10),
    attempt("java", "medium", 8, 10),
    attempt("java", "medium", 8, 10),
  ]);

  const python = result.items.find((item) => item.topic === "python");

  assertEqual(python.accuracy, 33, "accuracy");
  assertEqual(python.difficulty, "easy", "difficulty");
  assertEqual(python.evidence, "33% accuracy over 3 attempts", "evidence");
  assertEqual(
    python.href,
    "/quiz-setup?topic=python&difficulty=easy",
    "href"
  );
});

case_("a strong topic steps up", () => {
  const result = buildRecommendations([
    attempt("python", "easy", 9, 10),
    attempt("python", "easy", 9, 10),
    attempt("python", "easy", 9, 10),
    attempt("java", "medium", 5, 10),
    attempt("java", "medium", 5, 10),
  ]);

  const python = result.items.find((item) => item.topic === "python");

  assertEqual(python.accuracy, 90, "accuracy");
  assertEqual(python.difficulty, "medium", "difficulty");
});

case_("a mastered topic stays at hard", () => {
  const result = buildRecommendations([
    attempt("python", "hard", 9, 10),
    attempt("python", "hard", 9, 10),
    attempt("java", "medium", 5, 10),
    attempt("java", "medium", 5, 10),
  ]);

  const python = result.items.find((item) => item.topic === "python");

  assertEqual(python.difficulty, "hard", "difficulty");
  assertTrue(
    python.action.includes("hardest level"),
    "action explains the ceiling"
  );
});

case_("at most three topics are recommended", () => {
  const rows = [];

  ["a", "b", "c", "d", "e"].forEach((topic) => {
    rows.push(attempt(topic, "easy", 3, 10));
    rows.push(attempt(topic, "easy", 3, 10));
  });

  assertEqual(buildRecommendations(rows).items.length, 3, "items");
});

case_("topic evidence keeps attempts even without outcomes", () => {
  const rows = topicEvidence([
    { topic: "python", score: 5, totalQuestions: 10 },
    { topic: "python", correct: 8, wrong: 2, unanswered: 0, difficulty: "hard" },
  ]);

  assertEqual(rows[0].attempts, 2, "attempts");
  assertEqual(rows[0].scoredAttempts, 1, "scoredAttempts");
  assertEqual(rows[0].accuracy, 0.8, "accuracy");
  assertEqual(rows[0].highestDifficulty, "hard", "highestDifficulty");
});

case_("topics sort weakest first with nulls last", () => {
  const sorted = sortTopicsByAccuracy([
    { key: "b", accuracy: 0.2 },
    { key: "c", accuracy: null },
    { key: "a", accuracy: 0.9 },
  ]);

  assertEqual(
    sorted.map((row) => row.key),
    ["b", "a", "c"],
    "order"
  );
});

/* =====================
   RESULT
===================== */

console.log("");
console.log("===================");
console.log(`${passed} passed, ${failed} failed`);
console.log("");

if (failed > 0) {
  process.exit(1);
}

process.exit(0);
