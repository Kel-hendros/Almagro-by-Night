// js/session-cache.js — Lightweight in-memory cache with TTL
//
// Usage:
//   const data = await ABNCache.get("factions", () => loadGameFactions(id));
//   ABNCache.invalidate("factions");
//   ABNCache.clear();  // on logout
//
// TTL categories:
//   "session" — never expires within a browser session (player info, factions)
//   number   — milliseconds before auto-expiry (zone status = 5 min)

(function () {
  const DEFAULT_TTL = 5 * 60 * 1000; // 5 minutes
  const _store = new Map();

  window.ABNCache = {
    /**
     * Get a cached value, or fetch and cache it.
     * @param {string} key - Cache key
     * @param {Function} fetcher - Async function that returns the value
     * @param {Object} [opts]
     * @param {"session"|number} [opts.ttl] - TTL in ms, or "session" for no expiry
     * @returns {Promise<*>}
     */
    async get(key, fetcher, opts = {}) {
      const entry = _store.get(key);
      if (entry) {
        const isSessionScoped = entry.ttl === "session";
        const isAlive = isSessionScoped || Date.now() < entry.expiresAt;
        if (isAlive) {
          // If there's a pending fetch, await it (dedup concurrent calls)
          if (entry.pending) return entry.pending;
          return entry.value;
        }
      }

      // Deduplicate concurrent fetches for the same key
      const pending = fetcher().then((value) => {
        const ttl = opts.ttl ?? DEFAULT_TTL;
        _store.set(key, {
          value,
          ttl,
          expiresAt: ttl === "session" ? Infinity : Date.now() + ttl,
          pending: null,
        });
        return value;
      }).catch((err) => {
        // On error, remove the pending entry so next call retries
        _store.delete(key);
        throw err;
      });

      _store.set(key, { value: null, ttl: null, expiresAt: 0, pending });
      return pending;
    },

    /** Invalidate a single key. */
    invalidate(key) {
      _store.delete(key);
    },

    /** Clear all cached data (call on logout). */
    clear() {
      _store.clear();
    },

    /** Check if a key exists and is valid. */
    has(key) {
      const entry = _store.get(key);
      if (!entry || entry.pending) return false;
      return entry.ttl === "session" || Date.now() < entry.expiresAt;
    },
  };
})();
