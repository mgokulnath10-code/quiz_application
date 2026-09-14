// Dependency-free self-check for the account-status TTL cache
// used by backend/middleware/auth.js.
//
// Run with:  npm run selfcheck:auth
//
// The cache module has no Mongoose import by design: the lookup
// function is injected here as a counting fake, so these cases
// exercise the caching behaviour without a database.
//
// Prints one PASS/FAIL line per case and exits non-zero if any
// case fails.

import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import path from "node:path";

const require = createRequire(import.meta.url);

const {
  createAuthCache,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
} = require(
  path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "backend",
    "utils",
    "authCache.js"
  )
);

let passed = 0;
let failed = 0;

// Cases are async (the cache API is), so they are registered now
// and awaited in order at the bottom; a synchronous helper would
// report PASS before the promise settled.
const cases = [];

const case_ = (name, fn) => {
  cases.push({ name, fn });
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

// A lookup that counts calls and returns a scripted account.
const makeFakeLookup = (account) => {
  const state = { calls: 0, ids: [] };

  const lookup = async (id) => {
    state.calls += 1;
    state.ids.push(id);

    return typeof account === "function" ? account(id) : account;
  };

  return { state, lookup };
};

// A controllable clock so TTL expiry is tested without waiting.
const makeClock = (start = 0) => {
  const state = { time: start };

  return {
    state,
    now: () => state.time,
    advance: (ms) => {
      state.time += ms;
    },
  };
};

console.log("");
console.log("BrainRace auth cache selfcheck");
console.log("==============================");
console.log("");

case_("the first call performs the lookup, the second within the TTL does not", async () => {
  const { state, lookup } = makeFakeLookup({ name: "Ann", disabled: false });
  const clock = makeClock();

  const cache = createAuthCache({ lookup, ttlMs: 15000, now: clock.now });

  const first = await cache.get("u1");
  const second = await cache.get("u1");

  assertEqual(first, { name: "Ann", disabled: false }, "first value");
  assertEqual(second, { name: "Ann", disabled: false }, "second value");
  assertEqual(state.calls, 1, "lookup calls");
});

case_("a cache hit does not advance the lookup count across a short window", async () => {
  const { state, lookup } = makeFakeLookup({ name: "Ann", disabled: false });
  const clock = makeClock();

  const cache = createAuthCache({ lookup, ttlMs: 15000, now: clock.now });

  await cache.get("u1");
  clock.advance(1000);
  await cache.get("u1");
  clock.advance(13000);
  await cache.get("u1");

  assertEqual(state.calls, 1, "lookup calls");
});

case_("expiry causes a new lookup", async () => {
  const { state, lookup } = makeFakeLookup({ name: "Ann", disabled: false });
  const clock = makeClock();

  const cache = createAuthCache({ lookup, ttlMs: 15000, now: clock.now });

  await cache.get("u1");

  // Exactly at the boundary the entry is already stale.
  clock.advance(15000);
  await cache.get("u1");

  assertEqual(state.calls, 2, "lookup calls after expiry");
});

case_("explicit invalidation causes a new lookup", async () => {
  const { state, lookup } = makeFakeLookup({ name: "Ann", disabled: false });
  const clock = makeClock();

  const cache = createAuthCache({ lookup, ttlMs: 15000, now: clock.now });

  await cache.get("u1");
  await cache.get("u1");

  assertEqual(state.calls, 1, "cached");

  cache.invalidate("u1");

  await cache.get("u1");

  assertEqual(state.calls, 2, "lookup calls after invalidation");
});

case_("a disable stored after invalidation is seen on the next call", async () => {
  const account = { name: "Ann", disabled: false };
  const { state, lookup } = makeFakeLookup(() => ({ ...account }));
  const clock = makeClock();

  const cache = createAuthCache({ lookup, ttlMs: 15000, now: clock.now });

  const before = await cache.get("u1");

  assertEqual(before.disabled, false, "before");

  // What the admin PATCH handler does after flipping the flag.
  account.disabled = true;
  cache.invalidate("u1");

  const after = await cache.get("u1");

  assertEqual(after.disabled, true, "after");
  assertEqual(state.calls, 2, "lookup calls");
});

case_("keys are normalised so a string id and a number do not collide", async () => {
  const { state, lookup } = makeFakeLookup({ name: "Ann", disabled: false });
  const cache = createAuthCache({ lookup, ttlMs: 15000, now: makeClock().now });

  await cache.get("123");
  await cache.get(123);

  assertEqual(state.calls, 1, "same id reused the cache");
});

case_("distinct ids are cached independently", async () => {
  const { state, lookup } = makeFakeLookup((id) => ({ id, disabled: false }));
  const cache = createAuthCache({ lookup, ttlMs: 15000, now: makeClock().now });

  await cache.get("u1");
  await cache.get("u2");
  await cache.get("u1");
  await cache.get("u2");

  assertEqual(state.calls, 2, "lookup calls");
});

case_("a missing account is cached as null, not re-queried", async () => {
  const { state, lookup } = makeFakeLookup(null);
  const cache = createAuthCache({ lookup, ttlMs: 15000, now: makeClock().now });

  const first = await cache.get("deleted");

  assertEqual(first, null, "first value");

  const second = await cache.get("deleted");

  assertEqual(second, null, "second value");
  assertEqual(state.calls, 1, "lookup calls");
});

case_("a rejected lookup is not cached", async () => {
  let calls = 0;

  const cache = createAuthCache({
    lookup: async () => {
      calls += 1;

      throw new Error("mongo down");
    },
    ttlMs: 15000,
    now: makeClock().now,
  });

  let firstError = null;
  let secondError = null;

  try {
    await cache.get("u1");
  } catch (error) {
    firstError = error;
  }

  try {
    await cache.get("u1");
  } catch (error) {
    secondError = error;
  }

  assertTrue(firstError, "first call rejected");
  assertTrue(secondError, "second call rejected");
  assertEqual(calls, 2, "lookup calls (error not remembered)");
  assertEqual(cache.size(), 0, "cache size");
});

case_("the cache stays bounded when many ids are inserted", async () => {
  const maxEntries = 50;
  const { state, lookup } = makeFakeLookup({ disabled: false });

  const cache = createAuthCache({
    lookup,
    ttlMs: 15000,
    maxEntries,
    now: makeClock().now,
  });

  for (let i = 0; i < maxEntries * 4; i += 1) {
    await cache.get(`user-${i}`);
  }

  assertEqual(cache.size(), maxEntries, "cache size");
  assertEqual(state.calls, maxEntries * 4, "each new id looked up once");
  assertTrue(
    cache.size() <= maxEntries,
    "size must never exceed maxEntries"
  );
});

case_("eviction drops the oldest id, not a recently used one", async () => {
  const { lookup } = makeFakeLookup({ disabled: false });
  const cache = createAuthCache({
    lookup,
    ttlMs: 15000,
    maxEntries: 2,
    now: makeClock().now,
  });

  await cache.get("a");
  await cache.get("b");

  // Touch "a" so "b" becomes the oldest entry.
  await cache.get("a");

  await cache.get("c");

  assertFalse(cache.has("b"), "b evicted");
  assertTrue(cache.has("a"), "a retained");
  assertTrue(cache.has("c"), "c present");
  assertEqual(cache.size(), 2, "cache size");
});

case_("the constructor rejects a missing lookup or invalid bounds", () => {
  const expectThrow = (fn, label) => {
    let threw = false;

    try {
      fn();
    } catch {
      threw = true;
    }

    assertTrue(threw, label);
  };

  expectThrow(() => createAuthCache({}), "no lookup");
  expectThrow(
    () => createAuthCache({ lookup: () => null, ttlMs: 0 }),
    "ttlMs 0"
  );
  expectThrow(
    () => createAuthCache({ lookup: () => null, maxEntries: 0 }),
    "maxEntries 0"
  );
});

case_("defaults are sane for the auth middleware's use", () => {
  assertEqual(DEFAULT_TTL_MS, 15000, "default ttl");
  assertTrue(DEFAULT_MAX_ENTRIES > 0, "default cap");
  assertTrue(DEFAULT_MAX_ENTRIES <= 100000, "default cap is small");
});

for (const { name, fn } of cases) {
  try {
    await fn();

    passed += 1;

    console.log(`PASS  ${name}`);
  } catch (error) {
    failed += 1;

    console.log(`FAIL  ${name}`);
    console.log(`      ${error.message}`);
  }
}

console.log("");
console.log("==============================");
console.log(`${passed} passed, ${failed} failed`);
console.log("");

if (failed > 0) {
  process.exit(1);
}

process.exit(0);
