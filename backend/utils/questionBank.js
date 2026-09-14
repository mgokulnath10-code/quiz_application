// Question-bank helpers: normalisation, duplicate detection, CSV row
// parsing/normalisation for the admin import preview, and CSV export.
//
// Pure by design — no Mongoose, no Express — so scripts/selfcheckAdmin.mjs can
// exercise every rule with plain objects. The route handlers pass lean
// Question documents in and take plain values out.

const { parseCsv, toCsv } = require("./csv");

const DIFFICULTIES = ["easy", "medium", "hard"];

const DEFAULT_DIFFICULTY = "easy";
const DEFAULT_CATEGORY = "general";
const DEFAULT_TOPIC = "general";

const MAX_QUESTION_LENGTH = 500;
const MAX_OPTION_LENGTH = 200;

// Collapse whitespace and case so "What  is 2+2?" and "what is 2+2?" are the
// same question. Punctuation is left alone: two questions differing only by
// punctuation are usually different questions.
const normalizeText = (value) =>
  String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();

// Stable identity for an "equivalent" question: normalised text plus the set
// of normalised options. Option order is ignored, because the same four
// choices in a different order are the same question.
const questionFingerprint = (entry = {}) => {
  const question = normalizeText(entry.question);

  const options = (Array.isArray(entry.options) ? entry.options : [])
    .map(normalizeText)
    .filter(Boolean)
    .sort();

  return `${question}\u0000${options.join("\u0001")}`;
};

// Returns the matching existing question (so the UI can name it), or null.
const findDuplicateQuestion = (candidate, existing) => {
  if (!normalizeText(candidate && candidate.question)) return null;

  const fingerprint = questionFingerprint(candidate);

  for (const item of Array.isArray(existing) ? existing : []) {
    if (questionFingerprint(item) === fingerprint) {
      return item;
    }
  }

  return null;
};

// Validates one assembled row and returns the normalised document to store.
// Nothing is written when `errors` is non-empty.
const validateQuestionRow = (raw = {}) => {
  const errors = [];

  const question = String(raw.question == null ? "" : raw.question)
    .replace(/\s+/g, " ")
    .trim();

  const options = (Array.isArray(raw.options) ? raw.options : []).map(
    (option) => String(option == null ? "" : option).trim()
  );

  const answerRaw = String(
    raw.answer == null ? "" : raw.answer
  ).trim();

  const difficultyRaw = normalizeText(raw.difficulty);
  const categoryRaw = normalizeText(raw.category);
  const topicRaw = normalizeText(raw.topic);

  if (!question) {
    errors.push("question is required");
  } else if (question.length > MAX_QUESTION_LENGTH) {
    errors.push(
      `question is longer than ${MAX_QUESTION_LENGTH} characters`
    );
  }

  if (options.length !== 4) {
    errors.push(
      `exactly 4 options are required (found ${options.length})`
    );
  } else {
    options.forEach((option, position) => {
      if (!option) {
        errors.push(`option ${position + 1} is empty`);
      } else if (option.length > MAX_OPTION_LENGTH) {
        errors.push(
          `option ${position + 1} is longer than ${MAX_OPTION_LENGTH} characters`
        );
      }
    });

    const normalised = options.map(normalizeText);

    if (new Set(normalised).size !== normalised.length) {
      errors.push("options must be distinct");
    }
  }

  if (!answerRaw) {
    errors.push("answer is required");
  } else if (
    options.length === 4 &&
    !options.some(
      (option) => normalizeText(option) === normalizeText(answerRaw)
    )
  ) {
    errors.push("answer must match one of the 4 options");
  }

  let difficulty = DEFAULT_DIFFICULTY;

  if (difficultyRaw) {
    if (DIFFICULTIES.includes(difficultyRaw)) {
      difficulty = difficultyRaw;
    } else {
      errors.push(
        `difficulty must be one of: ${DIFFICULTIES.join(", ")}`
      );
    }
  }

  // Store the option's own spelling so the quiz's exact answer comparison
  // keeps working.
  const answer =
    options.find(
      (option) => normalizeText(option) === normalizeText(answerRaw)
    ) || answerRaw;

  return {
    valid: errors.length === 0,
    errors,
    value: {
      question,
      options,
      answer,
      difficulty,
      category: categoryRaw || DEFAULT_CATEGORY,
      topic: topicRaw || DEFAULT_TOPIC,
    },
  };
};

/* =====================
   CSV IMPORT
===================== */

const HEADERS = [
  "question",
  "option1",
  "option2",
  "option3",
  "option4",
  "answer",
  "difficulty",
  "category",
  "topic",
];

const normalizeHeader = (value) =>
  String(value == null ? "" : value)
    .toLowerCase()
    .replace(/[_\s]+/g, " ")
    .trim();

const HEADER_ALIASES = {
  question: ["question", "q", "prompt"],
  option1: ["option1", "option 1", "optiona", "option a"],
  option2: ["option2", "option 2", "optionb", "option b"],
  option3: ["option3", "option 3", "optionc", "option c"],
  option4: ["option4", "option 4", "optiond", "option d"],
  answer: ["answer", "correct", "correct answer", "correct option"],
  difficulty: ["difficulty", "level"],
  category: ["category", "subject"],
  topic: ["topic", "tag"],
};

const mapHeaderRow = (cells) => {
  const columns = {};

  (cells || []).forEach((cell, index) => {
    const normalised = normalizeHeader(cell);

    Object.entries(HEADER_ALIASES).forEach(([key, aliases]) => {
      if (aliases.includes(normalised) && columns[key] === undefined) {
        columns[key] = index;
      }
    });
  });

  // Only treat the first row as a header when it actually describes the
  // required fields; otherwise fall back to positional columns.
  if (columns.question === undefined || columns.answer === undefined) {
    return null;
  }

  if (
    columns.option1 === undefined ||
    columns.option2 === undefined ||
    columns.option3 === undefined ||
    columns.option4 === undefined
  ) {
    return null;
  }

  return columns;
};

const readByHeader = (cells, columns) => ({
  question: cells[columns.question],
  options: [
    cells[columns.option1],
    cells[columns.option2],
    cells[columns.option3],
    cells[columns.option4],
  ],
  answer: cells[columns.answer],
  difficulty: columns.difficulty === undefined ? "" : cells[columns.difficulty],
  category: columns.category === undefined ? "" : cells[columns.category],
  topic: columns.topic === undefined ? "" : cells[columns.topic],
});

// Positional order when there is no header row:
// question, option1..4, answer, difficulty, category, topic
const readByPosition = (cells) => ({
  question: cells[0],
  options: [cells[1], cells[2], cells[3], cells[4]],
  answer: cells[5],
  difficulty: cells[6],
  category: cells[7],
  topic: cells[8],
});

const isBlankRow = (cells) =>
  !(cells || []).some((cell) => String(cell == null ? "" : cell).trim() !== "");

const parseQuestionCsv = (text) => {
  const raw = parseCsv(text);

  const rows = raw
    .map((cells, index) => ({ cells, line: index + 1 }))
    .filter((entry) => !isBlankRow(entry.cells));

  if (rows.length === 0) {
    return {
      hasHeader: false,
      columns: HEADERS,
      total: 0,
      rows: [],
    };
  }

  const headerColumns = mapHeaderRow(rows[0].cells);
  const hasHeader = headerColumns !== null;
  const body = hasHeader ? rows.slice(1) : rows;

  const parsed = body.map((entry) => {
    const assembled = hasHeader
      ? readByHeader(entry.cells, headerColumns)
      : readByPosition(entry.cells);

    const result = validateQuestionRow(assembled);

    return {
      line: entry.line,
      valid: result.valid,
      errors: result.errors,
      ...result.value,
    };
  });

  return {
    hasHeader,
    columns: hasHeader
      ? Object.keys(headerColumns)
      : HEADERS,
    total: parsed.length,
    rows: parsed,
  };
};

// Dry-run preview. Distinguishes three outcomes:
//   valid      — well-formed and not already in the bank
//   duplicates — well-formed but an equivalent question already exists,
//                either earlier in this file or in the bank
//   invalid    — a required field is missing or malformed
const buildQuestionImportPreview = ({ csvText, existing } = {}) => {
  const parsed = parseQuestionCsv(csvText);

  const valid = [];
  const duplicates = [];
  const invalid = [];

  const seen = new Set();

  parsed.rows.forEach((row) => {
    const fields = {
      line: row.line,
      question: row.question,
      options: row.options,
      answer: row.answer,
      difficulty: row.difficulty,
      category: row.category,
      topic: row.topic,
    };

    if (!row.valid) {
      invalid.push({
        ...fields,
        reason: row.errors.join("; "),
      });

      return;
    }

    const existingMatch = findDuplicateQuestion(row, existing);

    if (existingMatch) {
      duplicates.push({
        ...fields,
        reason: "an equivalent question already exists in the bank",
        existingId: String(existingMatch._id || ""),
      });

      return;
    }

    const fingerprint = questionFingerprint(row);

    if (seen.has(fingerprint)) {
      duplicates.push({
        ...fields,
        reason: "duplicated by an earlier row in this file",
      });

      return;
    }

    seen.add(fingerprint);

    valid.push(fields);
  });

  return {
    hasHeader: parsed.hasHeader,
    columns: parsed.columns,
    total: parsed.total,
    valid,
    duplicates,
    invalid,
    counts: {
      total: parsed.total,
      valid: valid.length,
      duplicates: duplicates.length,
      invalid: invalid.length,
    },
  };
};

/* =====================
   CSV EXPORT
===================== */

const questionsToCsv = (questions) => {
  const rows = [HEADERS];

  (Array.isArray(questions) ? questions : []).forEach((question) => {
    const options = Array.isArray(question.options)
      ? question.options
      : [];

    rows.push([
      question.question || "",
      options[0] || "",
      options[1] || "",
      options[2] || "",
      options[3] || "",
      question.answer || "",
      question.difficulty || DEFAULT_DIFFICULTY,
      question.category || DEFAULT_CATEGORY,
      question.topic || DEFAULT_TOPIC,
    ]);
  });

  return toCsv(rows);
};

const QUESTION_CSV_TEMPLATE = toCsv([
  HEADERS,
  [
    "Which built-in function prints text in Python?",
    "echo()",
    "print()",
    "printf()",
    "console.log()",
    "print()",
    "easy",
    "programming",
    "python",
  ],
]);

// Escapes user input before it is placed in a RegExp for the admin search.
const escapeRegExp = (value) =>
  String(value == null ? "" : value).replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );

module.exports = {
  DIFFICULTIES,
  DEFAULT_DIFFICULTY,
  DEFAULT_CATEGORY,
  DEFAULT_TOPIC,
  MAX_QUESTION_LENGTH,
  MAX_OPTION_LENGTH,
  QUESTION_CSV_HEADERS: HEADERS,
  QUESTION_CSV_TEMPLATE,
  normalizeText,
  questionFingerprint,
  findDuplicateQuestion,
  validateQuestionRow,
  parseQuestionCsv,
  buildQuestionImportPreview,
  questionsToCsv,
  escapeRegExp,
};
