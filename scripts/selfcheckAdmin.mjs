// Dependency-free self-check for the admin question-bank and audit helpers.
//
// Run with:  npm run selfcheck:admin
//
// Covers the three pieces of new pure logic:
//   - backend/utils/csv.js          quoted fields, escaped quotes, CRLF
//   - backend/utils/questionBank.js row validation, duplicate detection,
//                                   import preview, CSV export
//   - backend/utils/auditFormat.js  summary truncation, secret filtering
//
// None of these modules import Express or Mongoose, so no database or server
// is needed. Prints one PASS/FAIL line per case and exits non-zero on any
// failure.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);

const base = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
  "backend",
  "utils"
);

const { parseCsv, toCsv } = require(path.join(base, "csv.js"));

const {
  DIFFICULTIES,
  QUESTION_CSV_TEMPLATE,
  normalizeText,
  questionFingerprint,
  findDuplicateQuestion,
  validateQuestionRow,
  parseQuestionCsv,
  buildQuestionImportPreview,
  questionsToCsv,
  escapeRegExp,
} = require(path.join(base, "questionBank.js"));

const {
  AUDIT_ACTIONS,
  truncateSummary,
  sanitizeMeta,
  buildAuditRecord,
} = require(path.join(base, "auditFormat.js"));

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

console.log("");
console.log("BrainRace admin selfcheck");
console.log("=========================");
console.log("");

/* =====================
   CSV PARSING
===================== */

console.log("-- csv parsing --");

case_("parses a simple unquoted row", () => {
  assertEqual(parseCsv("a,b,c"), [["a", "b", "c"]], "row");
});

case_("a quoted field may contain commas", () => {
  assertEqual(
    parseCsv('"hello, world",b'),
    [["hello, world", "b"]],
    "row"
  );
});

case_("escaped quotes inside a quoted field become one quote", () => {
  assertEqual(
    parseCsv('"She said ""hi""",b'),
    [['She said "hi"', "b"]],
    "row"
  );
});

case_("a quoted field may contain a newline", () => {
  assertEqual(
    parseCsv('"line one\nline two",b'),
    [["line one\nline two", "b"]],
    "row"
  );
});

case_("CRLF and bare CR both end a row", () => {
  assertEqual(parseCsv("a,b\r\nc,d"), [["a", "b"], ["c", "d"]], "crlf");
  assertEqual(parseCsv("a,b\rc,d"), [["a", "b"], ["c", "d"]], "cr");
});

case_("a trailing newline does not add a phantom row", () => {
  assertEqual(parseCsv("a,b\n"), [["a", "b"]], "row count");
});

case_("empty fields are preserved", () => {
  assertEqual(parseCsv("a,,c"), [["a", "", "c"]], "row");
  assertEqual(parseCsv('"",b'), [["", "b"]], "quoted empty");
});

case_("a UTF-8 BOM is stripped", () => {
  assertEqual(parseCsv("\uFEFFa,b"), [["a", "b"]], "row");
});

case_("empty input yields no rows", () => {
  assertEqual(parseCsv(""), [], "rows");
  assertEqual(parseCsv(null), [], "null");
});

case_("toCsv quotes only the cells that need it", () => {
  assertEqual(
    toCsv([["plain", "has,comma"], ['has"quote', "line\nbreak"]]),
    'plain,"has,comma"\r\n"has""quote","line\nbreak"',
    "csv"
  );
});

case_("parseCsv and toCsv round-trip a tricky row", () => {
  const row = ['He said "go", then left', "second", "line\nbreak"];

  assertEqual(parseCsv(toCsv([row])), [row], "round trip");
});

/* =====================
   QUESTION VALIDATION
===================== */

console.log("");
console.log("-- question row validation --");

const goodRow = {
  question: "Which built-in function prints text in Python?",
  options: ["echo()", "print()", "printf()", "console.log()"],
  answer: "print()",
  difficulty: "easy",
  category: "programming",
  topic: "python",
};

case_("a complete row is valid and normalises to the store shape", () => {
  const result = validateQuestionRow(goodRow);

  assertTrue(result.valid, "valid");
  assertEqual(result.errors, [], "errors");
  assertEqual(result.value.answer, "print()", "answer");
  assertEqual(result.value.category, "programming", "category");
  assertEqual(result.value.topic, "python", "topic");
});

case_("missing question is rejected with a reason", () => {
  const result = validateQuestionRow({ ...goodRow, question: "  " });

  assertFalse(result.valid, "valid");
  assertTrue(
    result.errors.some((e) => e.includes("question is required")),
    "reason"
  );
});

case_("fewer than four options is rejected with a count", () => {
  const result = validateQuestionRow({
    ...goodRow,
    options: ["a", "b", "c"],
    answer: "a",
  });

  assertFalse(result.valid, "valid");
  assertTrue(
    result.errors[0].includes("exactly 4 options"),
    "reason names the count"
  );
});

case_("an empty option is rejected by position", () => {
  const result = validateQuestionRow({
    ...goodRow,
    options: ["a", "", "c", "d"],
    answer: "a",
  });

  assertFalse(result.valid, "valid");
  assertTrue(
    result.errors.some((e) => e.includes("option 2 is empty")),
    "reason"
  );
});

case_("duplicate options are rejected", () => {
  const result = validateQuestionRow({
    ...goodRow,
    options: ["a", "A", "c", "d"],
    answer: "a",
  });

  assertFalse(result.valid, "valid");
  assertTrue(
    result.errors.includes("options must be distinct"),
    "reason"
  );
});

case_("an answer outside the options is rejected", () => {
  const result = validateQuestionRow({ ...goodRow, answer: "nope" });

  assertFalse(result.valid, "valid");
  assertTrue(
    result.errors.some((e) => e.includes("answer must match")),
    "reason"
  );
});

case_("the stored answer matches an option's own spelling", () => {
  const result = validateQuestionRow({ ...goodRow, answer: "  PRINT()  " });

  assertTrue(result.valid, "valid");
  assertEqual(result.value.answer, "print()", "answer");
});

case_("an unknown difficulty is rejected and a blank one defaults to easy", () => {
  const bad = validateQuestionRow({ ...goodRow, difficulty: "impossible" });

  assertFalse(bad.valid, "valid");
  assertTrue(
    bad.errors.some((e) => e.includes("difficulty must be one of")),
    "reason"
  );

  const blank = validateQuestionRow({ ...goodRow, difficulty: "" });

  assertTrue(blank.valid, "blank valid");
  assertEqual(blank.value.difficulty, "easy", "default");
  assertEqual(DIFFICULTIES.length, 3, "difficulty set");
});

case_("missing category and topic fall back to general", () => {
  const result = validateQuestionRow({
    ...goodRow,
    category: "",
    topic: undefined,
  });

  assertTrue(result.valid, "valid");
  assertEqual(result.value.category, "general", "category");
  assertEqual(result.value.topic, "general", "topic");
});

/* =====================
   DUPLICATE DETECTION
===================== */

console.log("");
console.log("-- duplicate detection --");

case_("normalisation ignores case and extra whitespace", () => {
  assertEqual(
    normalizeText("  What   IS 2+2? "),
    "what is 2+2?",
    "normalised"
  );
});

case_("an exact duplicate is found", () => {
  const existing = [{ _id: "q1", ...goodRow }];

  const match = findDuplicateQuestion(goodRow, existing);

  assertTrue(match, "match");
  assertEqual(match._id, "q1", "id");
});

case_("a duplicate differing only by case and spacing is found", () => {
  const existing = [{ _id: "q1", ...goodRow }];

  const match = findDuplicateQuestion(
    {
      ...goodRow,
      question: "  which BUILT-IN function prints text in python? ",
    },
    existing
  );

  assertEqual(match._id, "q1", "id");
});

case_("a duplicate with the options in a different order is found", () => {
  const existing = [{ _id: "q1", ...goodRow }];

  const match = findDuplicateQuestion(
    { ...goodRow, options: [...goodRow.options].reverse() },
    existing
  );

  assertEqual(match._id, "q1", "id");
});

case_("a different question is not a duplicate", () => {
  const existing = [{ _id: "q1", ...goodRow }];

  assertEqual(
    findDuplicateQuestion({ ...goodRow, question: "Something else?" }, existing),
    null,
    "match"
  );
});

case_("a changed option set is not a duplicate", () => {
  const existing = [{ _id: "q1", ...goodRow }];

  assertEqual(
    findDuplicateQuestion(
      { ...goodRow, options: ["echo()", "print()", "printf()", "puts()"] },
      existing
    ),
    null,
    "match"
  );
});

case_("the fingerprint is stable regardless of option order", () => {
  const a = questionFingerprint(goodRow);
  const b = questionFingerprint({
    ...goodRow,
    options: [...goodRow.options].reverse(),
  });

  assertEqual(a, b, "fingerprint");
});

case_("an empty candidate never matches", () => {
  assertEqual(
    findDuplicateQuestion({ question: "", options: [] }, [{ _id: "x" }]),
    null,
    "match"
  );
});

/* =====================
   IMPORT PREVIEW
===================== */

console.log("");
console.log("-- import preview --");

const csvWithHeader = [
  "question,option1,option2,option3,option4,answer,difficulty,category,topic",
  'What is 2+2?,3,4,5,6,4,easy,mathematics,arithmetic',
  'Which planet is largest?,Mars,Jupiter,Venus,Mercury,Jupiter,medium,science,astronomy',
  'Broken row,only,three,options,,yes,hard,science,astronomy',
  'What is 2+2?,3,4,5,6,4,easy,mathematics,arithmetic',
].join("\n");

case_("the header row is detected and mapped", () => {
  const parsed = parseQuestionCsv(csvWithHeader);

  assertTrue(parsed.hasHeader, "hasHeader");
  assertEqual(parsed.total, 4, "data rows");
});

case_("an invalid row is listed with a reason and the others are valid", () => {
  const preview = buildQuestionImportPreview({
    csvText: csvWithHeader,
    existing: [],
  });

  assertEqual(preview.counts.invalid, 1, "invalid count");
  assertEqual(preview.invalid[0].line, 4, "invalid line");
  assertTrue(
    preview.invalid[0].reason.includes("option 4 is empty"),
    "reason names the empty option"
  );
});

case_("a duplicate within the file is separated from the importable rows", () => {
  const preview = buildQuestionImportPreview({
    csvText: csvWithHeader,
    existing: [],
  });

  assertEqual(preview.counts.valid, 2, "valid count");
  assertEqual(preview.counts.duplicates, 1, "duplicate count");
  assertTrue(
    preview.duplicates[0].reason.includes("earlier row"),
    "reason"
  );
});

case_("a row already in the bank is a duplicate, not invalid", () => {
  const preview = buildQuestionImportPreview({
    csvText: csvWithHeader,
    existing: [{ _id: "q1", ...goodRow }],
  });

  assertEqual(preview.counts.valid, 2, "valid count");
});

case_("duplicate rows are matched against the bank by normalised content", () => {
  const csv = [
    "question,option1,option2,option3,option4,answer,difficulty,category,topic",
    "which built-in FUNCTION prints text in python?,echo(),PRINT(),printf(),console.log(),print(),easy,programming,python",
  ].join("\n");

  const preview = buildQuestionImportPreview({ csvText: csv, existing: [goodRow] });

  assertEqual(preview.counts.valid, 0, "valid count");
  assertEqual(preview.counts.duplicates, 1, "duplicate count");
});

case_("a headerless file is read positionally", () => {
  const csv = [
    "Capital of France?,Berlin,Paris,Rome,Madrid,Paris,easy,general,geography",
  ].join("\n");

  const preview = buildQuestionImportPreview({ csvText: csv, existing: [] });

  assertEqual(preview.counts.valid, 1, "valid count");
  assertEqual(preview.valid[0].answer, "Paris", "answer");
  assertEqual(preview.valid[0].topic, "geography", "topic");
});

case_("quoted fields with commas survive the import preview", () => {
  const csv = [
    "question,option1,option2,option3,option4,answer,difficulty,category,topic",
    '"Which is 1, 2, or 3?",1,2,3,4,"1",easy,general,numbers',
  ].join("\n");

  const preview = buildQuestionImportPreview({ csvText: csv, existing: [] });

  assertEqual(preview.counts.valid, 1, "valid count");
  assertEqual(
    preview.valid[0].question,
    "Which is 1, 2, or 3?",
    "question"
  );
});

case_("blank lines are ignored", () => {
  const csv = [
    "question,option1,option2,option3,option4,answer,difficulty,category,topic",
    "",
    'Q?,a,b,c,d,a,easy,general,t',
    "",
  ].join("\n");

  const preview = buildQuestionImportPreview({ csvText: csv, existing: [] });

  assertEqual(preview.total, 1, "total");
  assertEqual(preview.counts.valid, 1, "valid");
});

case_("an empty CSV produces an empty preview, not an error", () => {
  const preview = buildQuestionImportPreview({ csvText: "", existing: [] });

  assertEqual(preview.counts.total, 0, "total");
  assertEqual(preview.counts.invalid, 0, "invalid");
});

case_("header aliases like 'correct answer' and 'level' are accepted", () => {
  const csv = [
    "question,option 1,option 2,option 3,option 4,correct answer,level,category,topic",
    "Q?,a,b,c,d,a,hard,general,t",
  ].join("\n");

  const preview = buildQuestionImportPreview({ csvText: csv, existing: [] });

  assertEqual(preview.counts.valid, 1, "valid");
  assertEqual(preview.valid[0].difficulty, "hard", "difficulty");
});

/* =====================
   CSV EXPORT
===================== */

console.log("");
console.log("-- csv export --");

case_("the template downloads with a header and one example row", () => {
  const rows = parseCsv(QUESTION_CSV_TEMPLATE);

  assertEqual(rows.length, 2, "rows");
  assertEqual(rows[0][0], "question", "first header");
  assertEqual(rows[0].length, 9, "column count");
});

case_("exported questions re-import as the same rows", () => {
  const questions = [
    { ...goodRow },
    {
      question: 'Has "quotes" and, commas',
      options: ["a", "b", "c", "d"],
      answer: "a",
      difficulty: "hard",
      category: "general",
      topic: "misc",
    },
  ];

  const csv = questionsToCsv(questions);
  const preview = buildQuestionImportPreview({ csvText: csv, existing: [] });

  assertEqual(preview.counts.valid, 2, "valid");
  assertEqual(preview.valid[0].question, goodRow.question, "question");
  assertEqual(
    preview.valid[1].question,
    'Has "quotes" and, commas',
    "quoted question"
  );
});

case_("export tolerates missing optional fields", () => {
  const csv = questionsToCsv([
    { question: "Bare?", options: ["a", "b"], answer: "a" },
  ]);

  const rows = parseCsv(csv);

  assertEqual(rows[1][2], "b", "option 2");
  assertEqual(rows[1][5], "a", "answer");
  assertEqual(rows[1][6], "easy", "difficulty default");
  assertEqual(rows[1][7], "general", "category default");
});

case_("export of nothing is just the header", () => {
  assertEqual(parseCsv(questionsToCsv([])).length, 1, "rows");
  assertEqual(parseCsv(questionsToCsv(null)).length, 1, "null");
});

/* =====================
   SEARCH ESCAPING
===================== */

console.log("");
console.log("-- search escaping --");

case_("regex metacharacters in a search term are escaped", () => {
  assertEqual(escapeRegExp("a.b*c"), "a\\.b\\*c", "escaped");
  assertEqual(escapeRegExp("(x)[y]"), "\\(x\\)\\[y\\]", "brackets");
  assertEqual(escapeRegExp("plain"), "plain", "plain");
});

/* =====================
   AUDIT FORMAT
===================== */

console.log("");
console.log("-- audit format --");

case_("a summary is single-lined and truncated with an ellipsis", () => {
  assertEqual(truncateSummary("a\nb   c"), "a b c", "single line");

  const long = truncateSummary("x".repeat(500));

  assertEqual(long.length, 240, "length");
  assertTrue(long.endsWith("…"), "ellipsis");
});

case_("sanitizeMeta drops credentials and nested payloads", () => {
  const clean = sanitizeMeta({
    count: 3,
    added: true,
    password: "hunter2",
    token: "abc",
    authorization: "Bearer x",
    cookie: "a=b",
    nested: { deep: true },
    arr: [1, 2],
  });

  assertEqual(clean, { count: 3, added: true }, "meta");
});

case_("sanitizeMeta returns undefined when nothing safe remains", () => {
  assertEqual(sanitizeMeta({ token: "x" }), undefined, "only secret");
  assertEqual(sanitizeMeta(null), undefined, "null");
  assertEqual(sanitizeMeta("string"), undefined, "string");
});

case_("buildAuditRecord produces the stored shape", () => {
  const when = new Date("2026-09-14T10:00:00.000Z");

  const record = buildAuditRecord({
    action: AUDIT_ACTIONS.QUESTION_CREATE,
    summary: "Created question “What is 2+2?”",
    targetType: "question",
    targetId: "abc123",
    meta: { difficulty: "easy", token: "nope" },
    now: when,
  });

  assertEqual(record.actor, "admin", "actor");
  assertEqual(record.action, "question.create", "action");
  assertEqual(record.targetId, "abc123", "targetId");
  assertEqual(record.meta, { difficulty: "easy" }, "meta");
  assertEqual(record.createdAt, when, "createdAt");
});

case_("buildAuditRecord rejects an entry without an action", () => {
  let threw = false;

  try {
    buildAuditRecord({ summary: "no action" });
  } catch {
    threw = true;
  }

  assertTrue(threw, "throws");
});

case_("every audited action has a stable key", () => {
  assertEqual(AUDIT_ACTIONS.ADMIN_LOGIN, "admin.login", "login");
  assertEqual(AUDIT_ACTIONS.ROOM_FORCE_END, "room.force_end", "end");
  assertEqual(AUDIT_ACTIONS.ROOM_DELETE, "room.delete", "delete");
  assertEqual(AUDIT_ACTIONS.USER_DISABLE, "user.disable", "disable");
  assertEqual(AUDIT_ACTIONS.QUESTIONS_IMPORT, "questions.import", "import");
});

/* =====================
   RESULT
===================== */

console.log("");
console.log("=========================");
console.log(`${passed} passed, ${failed} failed`);
console.log("");

if (failed > 0) {
  process.exit(1);
}

process.exit(0);
