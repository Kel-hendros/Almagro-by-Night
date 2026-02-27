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

  async function getRecipientCharacters(chronicleId, currentPlayerId) {
    if (!chronicleId || !global.supabase) return [];

    const { data: ccRows, error: ccError } = await global.supabase
      .from("chronicle_characters")
      .select("character_sheet:character_sheets(id, name, user_id, data, avatar_url)")
      .eq("chronicle_id", chronicleId);
    if (ccError) {
      console.warn("Revelaciones: personajes de crónica no disponibles:", ccError.message);
      return [];
    }

    const sheets = (ccRows || [])
      .map((row) => row.character_sheet)
      .filter((sheet) => sheet?.id && sheet?.user_id);
    if (!sheets.length) return [];

    const userIds = Array.from(new Set(sheets.map((sheet) => String(sheet.user_id))));
    if (!userIds.length) return [];

    const { data: players, error: playersError } = await global.supabase
      .from("players")
      .select("id, name, user_id")
      .in("user_id", userIds);
    if (playersError) {
      console.warn("Revelaciones: jugadores de personajes no disponibles:", playersError.message);
      return [];
    }

    const playerByUserId = new Map();
    (players || []).forEach((player) => {
      if (player?.user_id) playerByUserId.set(String(player.user_id), player);
    });

    return sheets
      .map((sheet) => {
        const player = playerByUserId.get(String(sheet.user_id));
        if (!player?.id || player.id === currentPlayerId) return null;
        const data = sheet.data || {};
        return {
          character_sheet_id: sheet.id,
          character_name: sheet.name || "Personaje",
          avatar_url: data.avatarThumbUrl || sheet.avatar_url || data.avatar_url || "",
          player_id: player.id,
          player_name: player.name || "Jugador",
          user_id: sheet.user_id,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.character_name).localeCompare(String(b.character_name), "es"));
  }

  async function createHandout(payload) {
    return global.ABNShared?.handouts?.createHandout?.(payload) || { handout: null, error: null };
  }

  async function updateHandout(payload) {
    return global.ABNShared?.handouts?.updateHandout?.(payload) || { handout: null, error: null };
  }

  async function uploadHandoutImage(payload) {
    return global.ABNShared?.handouts?.uploadHandoutImage?.(payload) || { imageRef: null, error: null };
  }

  async function deleteHandoutImage(imageRef) {
    return global.ABNShared?.handouts?.deleteHandoutImage?.(imageRef) || { error: null };
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
    getRecipientCharacters,
    createHandout,
    updateHandout,
    uploadHandoutImage,
    deleteHandoutImage,
    listHandoutsByChronicle,
    listPlayerDeliveries,
    revokeDelivery,
    deleteHandout,
    subscribeDeliveriesForPlayer,
    unsubscribeChannel,
  };
})(window);
