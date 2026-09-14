// Shared handling for the backend's fail-fast database outage response.
//
// When the server cannot reach its database it answers 503 with
// `{ code: "DB_UNAVAILABLE" }` (see backend/utils/dbGuard.js). That is a
// server-side problem, so the UI must name it plainly and offer a retry
// instead of spinning forever or showing a generic failure.
//
// Pure and dependency-free so it can be covered by scripts/selfcheckDb.mjs.

export const DB_UNAVAILABLE_CODE = "DB_UNAVAILABLE";

export const DB_UNAVAILABLE_MESSAGE =
  "The server cannot reach its database, so this data could not be loaded. " +
  "This is a server configuration problem — not a problem with your " +
  "account or device. Please retry in a moment; if it keeps failing, the " +
  "site operator needs to check the database connection.";

export const isDbUnavailable = (error) => {
  const response = error?.response;

  return (
    response?.status === 503 &&
    response?.data?.code === DB_UNAVAILABLE_CODE
  );
};

// The message to show for a failed request: the database outage gets its own
// explanation, a server-supplied message wins otherwise, and `fallback` is
// the last resort. Genuine errors keep their existing shape.
export const messageForError = (error, fallback) => {
  if (isDbUnavailable(error)) return DB_UNAVAILABLE_MESSAGE;

  const message = error?.response?.data?.message;

  return typeof message === "string" && message.trim()
    ? message
    : fallback;
};
