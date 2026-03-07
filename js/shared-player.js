// js/shared-player.js — Centralized player identity cache
//
// Replaces 3 separate implementations of "get current player ID":
//   - app.js:fetchCurrentPlayerId()
//   - detail.zone.js:getCurrentPlayerId()
//   - auth.js:ensurePlayer() (select portion)
//
// Usage:  const playerId = await window.ABNPlayer.getId();
//         window.ABNPlayer.clear();  // on logout

(function () {
  let _cachedPlayerId = null;
  let _pendingFetch = null;

  async function fetchPlayerId() {
    const {
      data: { session },
    } = await window.abnGetSession();
    if (!session?.user?.id) return null;

    const { data, error } = await window.supabase
      .from("players")
      .select("id")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("ABNPlayer: error fetching player ID:", error);
      return null;
    }
    return data?.id || null;
  }

  window.ABNPlayer = {
    /**
     * Returns the current player's UUID, fetching once and caching.
     * Concurrent calls share the same in-flight request.
     */
    async getId() {
      if (_cachedPlayerId) return _cachedPlayerId;
      if (_pendingFetch) return _pendingFetch;

      _pendingFetch = fetchPlayerId().then((id) => {
        _cachedPlayerId = id;
        _pendingFetch = null;
        return id;
      });

      return _pendingFetch;
    },

    /** Clear cache (call on logout). */
    clear() {
      _cachedPlayerId = null;
      _pendingFetch = null;
    },

    /** Force a fresh fetch, bypassing cache. */
    async refresh() {
      this.clear();
      return this.getId();
    },
  };
})();
