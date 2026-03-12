(function initDocumentArchiveService(global) {
  const ns = (global.ABNDocumentArchive = global.ABNDocumentArchive || {});

  function getHashContext() {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
    const params = new URLSearchParams(query);

    return {
      chronicleId: params.get("id") || localStorage.getItem("currentChronicleId") || null,
      type: params.get("type") || null,
      characterSheetId: params.get("charId") || null,
    };
  }

  async function getSession() {
    const {
      data: { session },
    } = await global.abnGetSession();
    return session || null;
  }

  async function getCurrentPlayerByUserId(userId) {
    if (!userId || !global.supabase) return null;
    const { data, error } = await global.supabase
      .from("players")
      .select("id, name, user_id")
      .eq("user_id", userId)
      .limit(1);
    if (error) return null;
    return Array.isArray(data) ? data[0] || null : null;
  }

  async function getChronicle(chronicleId) {
    if (!chronicleId || !global.supabase) return { data: null, error: null };

    const primary = await global.supabase
      .from("chronicles")
      .select("id, name, creator_id, system_id")
      .eq("id", chronicleId)
      .maybeSingle();

    if (!primary?.error) return primary;

    const message = String(primary.error.message || "").toLowerCase();
    const missingSystemId =
      primary.error.code === "42703" ||
      (message.includes("system_id") && message.includes("does not exist"));

    if (!missingSystemId) return primary;

    const fallback = await global.supabase
      .from("chronicles")
      .select("id, name, creator_id")
      .eq("id", chronicleId)
      .maybeSingle();

    if (fallback?.data) fallback.data.system_id = null;
    return fallback;
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

  async function getParticipationByUserId(chronicleId, userId) {
    if (!chronicleId || !userId || !global.supabase) return null;
    const { data, error } = await global.supabase
      .from("chronicle_participants")
      .select("role, player_id, players!inner(user_id)")
      .eq("chronicle_id", chronicleId)
      .eq("players.user_id", userId);
    if (error) return null;
    return Array.isArray(data) ? data[0] || null : null;
  }

  ns.service = {
    getHashContext,
    getSession,
    getCurrentPlayerByUserId,
    getChronicle,
    getParticipation,
    getParticipationByUserId,
  };
})(window);
