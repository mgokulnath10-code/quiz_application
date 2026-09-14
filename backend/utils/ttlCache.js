// A tiny bounded TTL cache.
//
// Pure and dependency-free: the clock is injectable, so expiry can be checked
// deterministically (see scripts/selfcheckDb.mjs) instead of with timers.
//
// The size bound matters as much as the TTL: `get`/`set` are keyed by query
// input, so without a cap a caller could grow the map without limit. When the
// cap is reached the oldest entry is evicted (Map preserves insertion order),
// and re-setting a key refreshes its recency.

const createTtlCache = ({
  ttlMs = 30000,
  maxEntries = 100,
  now = Date.now,
} = {}) => {
  const store = new Map();

  const limit = Math.max(1, Number.parseInt(maxEntries, 10) || 1);
  const lifetime = Math.max(0, Number.parseInt(ttlMs, 10) || 0);

  const isExpired = (entry) => entry.expiresAt <= now();

  const purgeExpired = () => {
    store.forEach((entry, key) => {
      if (isExpired(entry)) store.delete(key);
    });
  };

  return {
    get(key) {
      const entry = store.get(key);

      if (!entry) return undefined;

      if (isExpired(entry)) {
        store.delete(key);

        return undefined;
      }

      return entry.value;
    },

    has(key) {
      return this.get(key) !== undefined;
    },

    set(key, value) {
      // An undefined value is indistinguishable from a miss, so it is never
      // stored: callers keep recomputing rather than caching a phantom hit.
      if (value === undefined) return;

      // Re-inserting refreshes recency, so a hot key is not evicted while it
      // is still being read.
      if (store.has(key)) store.delete(key);

      while (store.size >= limit) {
        const oldest = store.keys().next().value;

        store.delete(oldest);
      }

      store.set(key, { value, expiresAt: now() + lifetime });
    },

    delete(key) {
      return store.delete(key);
    },

    clear() {
      store.clear();
    },

    // Expired entries are dropped first so the reported size is truthful.
    size() {
      purgeExpired();

      return store.size;
    },
  };
};

module.exports = { createTtlCache };
