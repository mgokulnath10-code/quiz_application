// Bounded, in-memory TTL cache for authenticated-account lookups.
//
// middleware/auth.js used to run User.findById on every
// authenticated request, including the room endpoints the client
// polls every few seconds. This cache keeps the security property
// (a disabled or deleted account stops working) while removing
// that per-request round trip from the hot paths.
//
// It has no Mongoose dependency: the lookup function is injected,
// so scripts/selfcheckAuth.mjs can drive it with a fake and no
// database. Keys are normalised with String() so a JWT id and an
// ObjectId route param always address the same entry.
//
// Contract:
//   - get(id)       -> lookup on miss/expiry, cached value otherwise
//   - invalidate(id)-> drop one entry so the next get re-looks-up
//   - clear()       -> drop everything
//   - size()/has(id)-> introspection used by the self-check
//
// A rejected lookup is never cached: a transient database error
// must not be remembered as "account missing". A resolved null is
// cached (the account genuinely does not exist) so a token for a
// deleted account keeps failing promptly without a round trip.

const DEFAULT_TTL_MS = 15000;
const DEFAULT_MAX_ENTRIES = 5000;

function createAuthCache({
  lookup,
  ttlMs = DEFAULT_TTL_MS,
  maxEntries = DEFAULT_MAX_ENTRIES,
  now = () => Date.now(),
} = {}) {
  if (typeof lookup !== "function") {
    throw new TypeError("createAuthCache requires a lookup function");
  }

  if (!(ttlMs > 0)) {
    throw new TypeError("ttlMs must be a positive number");
  }

  if (!(maxEntries > 0)) {
    throw new TypeError("maxEntries must be a positive number");
  }

  // Map preserves insertion order, so keys().next() is the oldest
  // entry. Re-inserting on a hit makes this a cheap LRU and keeps
  // the hard cap meaningful under a churning id space.
  const entries = new Map();

  const evictOverflow = () => {
    while (entries.size > maxEntries) {
      const oldest = entries.keys().next().value;

      entries.delete(oldest);
    }
  };

  const get = async (id) => {
    const key = String(id);
    const hit = entries.get(key);

    if (hit && hit.expiresAt > now()) {
      entries.delete(key);
      entries.set(key, hit);

      return hit.value;
    }

    if (hit) {
      entries.delete(key);
    }

    const value = await lookup(key);

    entries.set(key, { value, expiresAt: now() + ttlMs });

    evictOverflow();

    return value;
  };

  const invalidate = (id) => entries.delete(String(id));

  const clear = () => entries.clear();

  return {
    get,
    invalidate,
    clear,
    size: () => entries.size,
    has: (id) => {
      const hit = entries.get(String(id));

      return Boolean(hit) && hit.expiresAt > now();
    },
  };
}

module.exports = {
  createAuthCache,
  DEFAULT_TTL_MS,
  DEFAULT_MAX_ENTRIES,
};
