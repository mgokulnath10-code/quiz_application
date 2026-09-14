// Dependency-free self-check for the database-outage work:
// credential masking, the fail-fast guard's route classification, the TTL
// read cache, and the frontend's DB_UNAVAILABLE message handling.
//
// Run with:  npm run selfcheck:db
//
// Prints one PASS/FAIL line per case and exits non-zero if any case fails.
// The backend modules checked here are deliberately pure (no mongoose), so
// they can be required directly from this ESM script.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
  DB_UNAVAILABLE_CODE,
  DB_UNAVAILABLE_MESSAGE as FRONTEND_DB_MESSAGE,
  isDbUnavailable,
  messageForError,
} from "../src/utils/apiError.js";

const require = createRequire(import.meta.url);

const backendPath = (...parts) =>
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "backend",
    ...parts
  );

const {
  maskMongoTarget,
  describeMongoTarget,
  sanitizeDbError,
  readyStateLabel,
} = require(backendPath("utils", "dbDiagnostics.js"));

const { createTtlCache } = require(backendPath("utils", "ttlCache.js"));

const {
  DB_UNAVAILABLE_CODE: BACKEND_DB_CODE,
  isDatabaseRoute,
  createDbGuard,
} = require(backendPath("utils", "dbGuard.js"));

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

const assertAbsent = (haystack, needle, label = "secret") => {
  if (String(haystack).includes(needle)) {
    throw new Error(`${label} leaked into: ${haystack}`);
  }
};

console.log("");
console.log("BrainRace selfcheck: database diagnostics");
console.log("=========================================");
console.log("");

/* =====================
   A — CREDENTIAL MASKING
===================== */

console.log("-- maskMongoTarget --");

const SRV_URI =
  "mongodb+srv://alice:s3cr3t@cluster0.abcde.mongodb.net/BrainRace" +
  "?retryWrites=true&w=majority";

const MULTI_HOST_URI =
  "mongodb://bob:hunter2@h1:27017,h2:27017,h3:27017/mydb?authSource=admin";

case_("standard mongodb+srv URI: no credentials, host and db kept", () => {
  const masked = maskMongoTarget(SRV_URI);

  assertAbsent(masked, "alice", "username");
  assertAbsent(masked, "s3cr3t", "password");
  assertEqual(
    masked,
    "mongodb+srv://cluster0.abcde.mongodb.net/BrainRace",
    "masked"
  );
});

case_("multi-host URI keeps every host and drops the credentials", () => {
  const masked = maskMongoTarget(MULTI_HOST_URI);

  assertAbsent(masked, "bob", "username");
  assertAbsent(masked, "hunter2", "password");
  assertEqual(
    masked,
    "mongodb://h1:27017,h2:27017,h3:27017/mydb",
    "masked"
  );
});

case_("a URI with no credentials is reported as-is", () => {
  assertEqual(
    maskMongoTarget("mongodb://127.0.0.1:27017/BrainRace"),
    "mongodb://127.0.0.1:27017/BrainRace",
    "masked"
  );
});

case_("a password containing @ and : does not hide the host", () => {
  const masked = maskMongoTarget(
    "mongodb+srv://carol:p@ss:w0rd@cluster0.xyz.mongodb.net/db"
  );

  assertAbsent(masked, "p@ss", "password");
  assertAbsent(masked, "w0rd", "password");
  assertAbsent(masked, "carol", "username");
  assertEqual(
    masked,
    "mongodb+srv://cluster0.xyz.mongodb.net/db",
    "masked"
  );
});

case_("a missing or empty URI masks to an empty string", () => {
  assertEqual(maskMongoTarget(undefined), "", "undefined");
  assertEqual(maskMongoTarget(null), "", "null");
  assertEqual(maskMongoTarget(""), "", "empty");
  assertEqual(maskMongoTarget("not-a-uri"), "", "non-mongo");
});

case_("describeMongoTarget separates hosts, database and credentials", () => {
  const parsed = describeMongoTarget(MULTI_HOST_URI);

  assertEqual(parsed.scheme, "mongodb", "scheme");
  assertEqual(
    parsed.hosts,
    ["h1:27017", "h2:27017", "h3:27017"],
    "hosts"
  );
  assertEqual(parsed.database, "mydb", "database");
  assertEqual(parsed.hadCredentials, true, "hadCredentials");
});

/* =====================
   B — ERROR SANITISING
===================== */

console.log("");
console.log("-- sanitizeDbError --");

case_("a message embedding the URI is masked, not echoed", () => {
  const text = sanitizeDbError(
    new Error(`Server selection failed for ${SRV_URI}`),
    { uri: SRV_URI }
  );

  assertAbsent(text, "alice", "username");
  assertAbsent(text, "s3cr3t", "password");
  assertTrue(
    text.includes("cluster0.abcde.mongodb.net"),
    "host should remain for diagnosis"
  );
});

case_("a message embedding only the password is scrubbed", () => {
  const text = sanitizeDbError(
    new Error("authentication failed for password s3cr3t"),
    { uri: SRV_URI }
  );

  assertAbsent(text, "s3cr3t", "password");
});

case_("an explicit password option is scrubbed too", () => {
  const text = sanitizeDbError(
    new Error("bad auth: hunter2 is wrong"),
    { password: "hunter2" }
  );

  assertAbsent(text, "hunter2", "password");
});

case_("a plain connection error is kept for diagnosis", () => {
  const text = sanitizeDbError(
    new Error("connect ECONNREFUSED 127.0.0.1:27099")
  );

  assertEqual(
    text,
    "connect ECONNREFUSED 127.0.0.1:27099",
    "message"
  );
});

case_("null and message-less errors do not throw", () => {
  assertEqual(sanitizeDbError(null), "", "null");
  assertEqual(sanitizeDbError(undefined), "", "undefined");
  assertEqual(sanitizeDbError(""), "", "empty string");
  assertTrue(
    sanitizeDbError({ code: "ECONNREFUSED" }).length > 0,
    "object with no message should stringify"
  );
});

case_("a URI-shaped user:pass pair is redacted even without context", () => {
  const text = sanitizeDbError(
    "failed to connect to redis://user:topsecret@cache:6379"
  );

  assertAbsent(text, "topsecret", "password");
  assertTrue(text.includes("[redacted]"), "should mark the redaction");
});

/* =====================
   C — READY-STATE LABELS
===================== */

console.log("");
console.log("-- readyStateLabel --");

case_("every mongoose ready-state has a label", () => {
  assertEqual(readyStateLabel(0), "disconnected", "0");
  assertEqual(readyStateLabel(1), "connected", "1");
  assertEqual(readyStateLabel(2), "connecting", "2");
  assertEqual(readyStateLabel(3), "disconnecting", "3");
  assertEqual(readyStateLabel(99), "uninitialized", "99");
  assertEqual(readyStateLabel(42), "unknown", "unknown code");
});

/* =====================
   D — TTL CACHE
===================== */

console.log("");
console.log("-- ttl cache --");

const makeClock = (start = 0) => {
  let current = start;

  return {
    now: () => current,
    advance: (ms) => {
      current += ms;
    },
  };
};

case_("a miss is undefined and a set value is a hit", () => {
  const cache = createTtlCache({ ttlMs: 30000, now: () => 0 });

  assertEqual(cache.get("missing"), undefined, "miss");
  cache.set("a", { value: 1 });
  assertEqual(cache.get("a"), { value: 1 }, "hit");
});

case_("an entry expires once the TTL passes", () => {
  const clock = makeClock(1000);
  const cache = createTtlCache({ ttlMs: 30000, now: clock.now });

  cache.set("a", "value");
  clock.advance(29999);
  assertEqual(cache.get("a"), "value", "still fresh");

  clock.advance(1);
  assertEqual(cache.get("a"), undefined, "expired at the boundary");
});

case_("delete and clear invalidate immediately", () => {
  const cache = createTtlCache({ ttlMs: 30000, now: () => 0 });

  cache.set("a", 1);
  cache.set("b", 2);

  assertEqual(cache.delete("a"), true, "delete reports a removal");
  assertEqual(cache.get("a"), undefined, "deleted key misses");
  assertEqual(cache.get("b"), 2, "other key survives");

  cache.clear();
  assertEqual(cache.get("b"), undefined, "clear removes everything");
  assertEqual(cache.size(), 0, "size after clear");
});

case_("the cache is bounded and evicts the oldest entry", () => {
  const cache = createTtlCache({ ttlMs: 30000, maxEntries: 3, now: () => 0 });

  cache.set("a", 1);
  cache.set("b", 2);
  cache.set("c", 3);
  cache.set("d", 4);

  assertEqual(cache.size(), 3, "size stays at the cap");
  assertEqual(cache.get("a"), undefined, "oldest evicted");
  assertEqual(cache.get("d"), 4, "newest kept");
});

case_("undefined is never cached as a phantom hit", () => {
  const cache = createTtlCache({ ttlMs: 30000, now: () => 0 });

  cache.set("a", undefined);
  assertEqual(cache.get("a"), undefined, "still a miss");
  assertEqual(cache.size(), 0, "nothing stored");
});

case_("re-setting a key refreshes it instead of duplicating it", () => {
  const clock = makeClock(0);
  const cache = createTtlCache({ ttlMs: 100, now: clock.now });

  cache.set("a", 1);
  clock.advance(80);
  cache.set("a", 2);

  clock.advance(80);
  assertEqual(cache.get("a"), 2, "value refreshed before expiry");
  assertEqual(cache.size(), 1, "single entry");
});

/* =====================
   E — DB GUARD ROUTE CLASSIFICATION
===================== */

console.log("");
console.log("-- db guard route classification --");

const dbRoutes = [
  "/api/register",
  "/api/verify-otp",
  "/api/forgot-password",
  "/api/reset-password",
  "/api/login",
  "/api/questions",
  "/api/questions/meta",
  "/api/questions/pool",
  "/api/quizzes",
  "/api/users",
  "/api/admin/users",
  "/api/admin/users/abc/disabled",
  "/api/admin/questions",
  "/api/admin/questions/import",
  "/api/results",
  "/api/results/me",
  "/api/stats",
  "/api/admin/results/export",
  "/api/admin/audit-log",
  "/api/rooms",
  "/api/rooms/ABCD",
];

const nonDbRoutes = [
  "/",
  "/api/health/config",
  "/api/health/db",
  "/api/admin/login",
  "/api/auth/providers",
  "/api/auth/google",
  "/api/auth/google/callback",
  "/api/auth/microsoft",
  "/api/auth/github/callback",
  "/api/auth/google/diagnose",
  "/api/admin/questions/template",
];

case_("database-backed routes are classified as such", () => {
  const missed = dbRoutes.filter((route) => !isDatabaseRoute(route));

  assertEqual(missed, [], "routes not guarded");
});

case_("non-database routes are never guarded", () => {
  const wronglyGuarded = nonDbRoutes.filter((route) =>
    isDatabaseRoute(route)
  );

  assertEqual(wronglyGuarded, [], "routes wrongly guarded");
});

case_("trailing slashes and query strings do not change the decision", () => {
  assertTrue(isDatabaseRoute("/api/questions/meta/"), "db trailing slash");
  assertTrue(isDatabaseRoute("/api/questions?topic=python"), "db query");
  assertFalse(
    isDatabaseRoute("/api/admin/questions/template/"),
    "template trailing slash"
  );
  assertFalse(isDatabaseRoute("/api/health/db?verbose=1"), "health query");
});

const fakeRes = () => {
  const res = { statusCode: null, body: null };

  res.status = (code) => {
    res.statusCode = code;

    return res;
  };

  res.json = (body) => {
    res.body = body;

    return res;
  };

  return res;
};

case_("guard: a disconnected database answers 503 DB_UNAVAILABLE at once", () => {
  const guard = createDbGuard({ isConnected: () => false });
  const res = fakeRes();
  let nextCalled = false;

  guard(
    { path: "/api/admin/users", method: "GET" },
    res,
    () => {
      nextCalled = true;
    }
  );

  assertFalse(nextCalled, "must not call next");
  assertEqual(res.statusCode, 503, "status");
  assertEqual(res.body.code, BACKEND_DB_CODE, "code");
  assertEqual(res.body.code, "DB_UNAVAILABLE", "code literal");
  assertTrue(
    res.body.message.includes("cannot reach its database"),
    "message names the cause"
  );
});

case_("guard: a connected database passes the request through", () => {
  const guard = createDbGuard({ isConnected: () => true });
  const res = fakeRes();
  let nextCalled = false;

  guard({ path: "/api/admin/users" }, res, () => {
    nextCalled = true;
  });

  assertTrue(nextCalled, "next called");
  assertEqual(res.statusCode, null, "no response written");
});

case_("guard: non-database routes pass even while disconnected", () => {
  const guard = createDbGuard({ isConnected: () => false });

  nonDbRoutes.forEach((route) => {
    const res = fakeRes();
    let nextCalled = false;

    guard({ path: route }, res, () => {
      nextCalled = true;
    });

    assertTrue(nextCalled, `${route} should reach its handler`);
    assertEqual(res.statusCode, null, `${route} should not be answered`);
  });
});

/* =====================
   F — FRONTEND ERROR MAPPING
===================== */

console.log("");
console.log("-- frontend apiError --");

const dbUnavailableError = {
  response: {
    status: 503,
    data: { code: "DB_UNAVAILABLE", message: "server says so" },
  },
};

case_("a 503 DB_UNAVAILABLE response is recognised", () => {
  assertTrue(isDbUnavailable(dbUnavailableError), "recognised");
  assertFalse(
    isDbUnavailable({ response: { status: 500, data: {} } }),
    "a plain 500 is not a database outage"
  );
  assertFalse(
    isDbUnavailable({
      response: { status: 503, data: { code: "OTHER" } },
    }),
    "a different 503 code is not a database outage"
  );
  assertFalse(isDbUnavailable(new Error("network")), "no response");
});

case_("the database outage gets its own plain-language message", () => {
  assertEqual(
    messageForError(dbUnavailableError, "fallback"),
    FRONTEND_DB_MESSAGE,
    "message"
  );
  assertTrue(
    FRONTEND_DB_MESSAGE.includes("cannot reach its database"),
    "names the cause"
  );
});

case_("a server message wins, then the fallback", () => {
  assertEqual(
    messageForError(
      { response: { status: 400, data: { message: "Bad input" } } },
      "fallback"
    ),
    "Bad input",
    "server message"
  );

  assertEqual(
    messageForError({ response: { status: 500, data: {} } }, "fallback"),
    "fallback",
    "fallback"
  );

  assertEqual(messageForError(undefined, "fallback"), "fallback", "no error");
});

case_("the backend and frontend agree on the DB_UNAVAILABLE code", () => {
  assertEqual(BACKEND_DB_CODE, DB_UNAVAILABLE_CODE, "code");
});

/* =====================
   RESULT
===================== */

console.log("");
console.log("=========================================");
console.log(`${passed} passed, ${failed} failed`);
console.log("");

if (failed > 0) {
  process.exit(1);
}

process.exit(0);
