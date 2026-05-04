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
  let _cachedIsAdmin = null;
  let _pendingFetch = null;

  async function fetchPlayerRow() {
    const {
      data: { session },
    } = await window.abnGetSession();
    if (!session?.user?.id) return null;

    const { data, error } = await window.supabase
      .from("players")
      .select("id, is_admin")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error && error.code !== "PGRST116") {
      console.error("ABNPlayer: error fetching player row:", error);
      return null;
    }
    return data || null;
  }

  function ensureFetch() {
    if (_pendingFetch) return _pendingFetch;
    _pendingFetch = fetchPlayerRow().then((row) => {
      _cachedPlayerId = row?.id || null;
      _cachedIsAdmin = !!row?.is_admin;
      _pendingFetch = null;
      return row;
    });
    return _pendingFetch;
  }

  window.ABNPlayer = {
    /**
     * Returns the current player's UUID, fetching once and caching.
     * Concurrent calls share the same in-flight request.
     */
    async getId() {
      if (_cachedPlayerId) return _cachedPlayerId;
      const row = await ensureFetch();
      return row?.id || null;
    },

    /** Returns whether the current user is an admin (cached). */
    async isAdmin() {
      if (_cachedIsAdmin !== null) return _cachedIsAdmin;
      await ensureFetch();
      return !!_cachedIsAdmin;
    },

    /** Clear cache (call on logout). */
    clear() {
      _cachedPlayerId = null;
      _cachedIsAdmin = null;
      _pendingFetch = null;
    },

    /** Force a fresh fetch, bypassing cache. */
    async refresh() {
      this.clear();
      return this.getId();
    },
  };
})();
