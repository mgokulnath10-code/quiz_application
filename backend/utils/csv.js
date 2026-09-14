// Minimal, dependency-free CSV reader/writer.
//
// The import feature needs real CSV semantics — quoted fields containing
// commas and newlines, and doubled quotes for a literal quote — so a
// `split(",")` would silently corrupt rows. No CSV package is added; this is
// the whole grammar:
//
//   field      := quoted | bare
//   quoted     := '"' ( char | '""' )* '"'
//   bare       := any char except ',' CR or LF
//   row        := field ( ',' field )* ( CR LF | LF | CR | EOF )
//
// The parser is permissive on purpose: it never throws, so a malformed line
// is reported as a row the caller can reject with a reason instead of taking
// the whole import down.

const BOM = "\uFEFF";

const parseCsv = (text) => {
  const input = typeof text === "string" ? text.replace(BOM, "") : "";

  const rows = [];

  let row = [];
  let field = "";
  let inQuotes = false;
  let touched = false;

  let index = 0;

  const endField = () => {
    row.push(field);
    field = "";
    touched = false;
  };

  const endRow = () => {
    endField();
    rows.push(row);
    row = [];
  };

  while (index < input.length) {
    const char = input[index];

    if (inQuotes) {
      if (char === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 2;
          continue;
        }

        inQuotes = false;
        index += 1;
        continue;
      }

      field += char;
      index += 1;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      touched = true;
      index += 1;
      continue;
    }

    if (char === ",") {
      endField();
      index += 1;
      continue;
    }

    if (char === "\r") {
      endRow();
      index += input[index + 1] === "\n" ? 2 : 1;
      continue;
    }

    if (char === "\n") {
      endRow();
      index += 1;
      continue;
    }

    field += char;
    touched = true;
    index += 1;
  }

  // A trailing newline already closed the last row; only push a final row
  // when something was actually typed after it.
  if (touched || field !== "" || row.length > 0) {
    endRow();
  }

  return rows;
};

const needsQuoting = (value) =>
  /[",\r\n]/.test(value) ||
  value !== value.trim();

const quoteCell = (value) => {
  const text = value === null || value === undefined ? "" : String(value);

  if (!needsQuoting(text)) return text;

  return `"${text.replace(/"/g, '""')}"`;
};

const toCsv = (rows) =>
  rows.map((row) => row.map(quoteCell).join(",")).join("\r\n");

module.exports = {
  parseCsv,
  toCsv,
  quoteCell,
};
