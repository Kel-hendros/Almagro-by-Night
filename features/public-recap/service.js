(function initPublicRecapService(global) {
  const ns = (global.ABNPublicRecap = global.ABNPublicRecap || {});

  function getHashContext() {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
    const params = new URLSearchParams(query);

    return {
      token: params.get("token") || "",
    };
  }

  async function getSession() {
    const {
      data: { session },
    } = await global.abnGetSession();
    return session || null;
  }

  async function fetchPublicShare(token) {
    if (!token || !global.supabase) return { data: null, error: null };

    return global.supabase
      .rpc("get_public_recap_share", { p_share_token: token })
      .maybeSingle();
  }

  async function getCurrentPlayerByUserId(userId) {
    if (!userId || !global.supabase) return null;

    const { data, error } = await global.supabase
      .from("players")
      .select("id, user_id")
      .eq("user_id", userId)
      .limit(1);

    if (error) return null;
    return Array.isArray(data) ? data[0] || null : null;
  }

  async function getParticipation(chronicleId, playerId) {
    if (!chronicleId || !playerId || !global.supabase) return null;

    const { data, error } = await global.supabase
      .from("chronicle_participants")
      .select("role")
      .eq("chronicle_id", chronicleId)
      .eq("player_id", playerId)
      .maybeSingle();

    if (error) return null;
    return data || null;
  }

  ns.service = {
    fetchPublicShare,
    getCurrentPlayerByUserId,
    getHashContext,
    getParticipation,
    getSession,
  };
})(window);
