(function initRevelationsArchiveService(global) {
  const ns = (global.ABNRevelationsArchive = global.ABNRevelationsArchive || {});

  function getHashContext() {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    return {
      chronicleId: params.get("id") || localStorage.getItem("currentChronicleId") || null,
    };
  }

  async function getSession() {
    const {
      data: { session },
    } = await global.abnGetSession();
    return session || null;
  }

  async function getCurrentPlayerByUserId(userId) {
    return global.ABNShared?.handouts?.getCurrentPlayerByUserId?.(userId) || null;
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
      .select("id, role")
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
      .select("id, role, players!inner(user_id)")
      .eq("chronicle_id", chronicleId)
      .eq("players.user_id", userId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  async function getRecipients(chronicleId, currentPlayerId) {
    const rows =
      (await global.ABNShared?.handouts?.getChronicleParticipants?.(chronicleId)) || [];
    return rows.filter(
      (row) =>
        row?.player?.id &&
        row.player.id !== currentPlayerId &&
        String(row.role || "").toLowerCase() === "player",
    );
  }

  async function createHandout(payload) {
    return global.ABNShared?.handouts?.createHandout?.(payload) || { handout: null, error: null };
  }

  async function listHandoutsByChronicle(chronicleId) {
    return global.ABNShared?.handouts?.listHandoutsByChronicle?.(chronicleId) || [];
  }

  async function listPlayerDeliveries(playerId, chronicleId) {
    return (
      (await global.ABNShared?.handouts?.listPendingDeliveries?.({
        playerId,
        chronicleId,
      })) || []
    );
  }

  async function revokeDelivery(associationId) {
    return global.ABNShared?.handouts?.revokeDelivery?.(associationId) || { error: null };
  }

  async function deleteHandout(revelationId) {
    return global.ABNShared?.handouts?.deleteHandout?.(revelationId) || { error: null };
  }

  function subscribeDeliveriesForPlayer({ playerId, onChange }) {
    return (
      global.ABNShared?.handouts?.subscribeDeliveriesForPlayer?.({ playerId, onChange }) || null
    );
  }

  function unsubscribeChannel(channel) {
    global.ABNShared?.handouts?.unsubscribeChannel?.(channel);
  }

  ns.service = {
    getHashContext,
    getSession,
    getCurrentPlayerByUserId,
    getChronicle,
    getParticipation,
    getParticipationByUserId,
    getRecipients,
    createHandout,
    listHandoutsByChronicle,
    listPlayerDeliveries,
    revokeDelivery,
    deleteHandout,
    subscribeDeliveriesForPlayer,
    unsubscribeChannel,
  };
})(window);
