(function initActiveSessionService(global) {
  const ns = (global.ABNActiveSession = global.ABNActiveSession || {});

  function parseIntOrNull(value) {
    const parsed = parseInt(value, 10);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function getBloodMaxByGeneration(generation) {
    if (generation <= 6) return 30;
    if (generation <= 7) return 20;
    if (generation <= 8) return 15;
    if (generation <= 9) return 14;
    if (generation <= 10) return 13;
    if (generation <= 11) return 12;
    if (generation <= 12) return 11;
    return 10;
  }

  function extractV20Stats(charData) {
    const data = charData || {};
    const clan = data.clan || "—";

    const humanityValue = parseIntOrNull(data["humanidad-value"]);

    const willPerm = parseIntOrNull(data["voluntadPerm-value"]);
    const willTemp = parseIntOrNull(data["voluntadTemp-value"]);
    const hasWill = willPerm !== null || willTemp !== null;
    const willpower = hasWill ? `${willTemp || 0}/${willPerm || 0}` : "—";

    const generation = parseIntOrNull(data.generacion) || 13;
    const maxBlood = getBloodMaxByGeneration(generation);
    const rawBlood = typeof data["blood-value"] === "string" ? data["blood-value"] : "";
    const currentBlood = rawBlood ? rawBlood.replace(/0/g, "").length : null;
    const blood = currentBlood === null ? "—" : `${currentBlood}/${maxBlood}`;

    const healthKeys = [
      "magullado-value",
      "lastimado-value",
      "lesionado-value",
      "herido-value",
      "malherido-value",
      "tullido-value",
      "incapacitado-value",
    ];
    const healthTrack = healthKeys.map((key) => {
      const val = parseIntOrNull(data[key]);
      return val === null ? 0 : Math.max(0, Math.min(3, val));
    });

    return {
      clan,
      humanity: humanityValue ?? "—",
      willpower,
      blood,
      healthTrack,
    };
  }

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
    if (!userId || !global.supabase) return null;
    const { data, error } = await global.supabase
      .from("players")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("ActiveSession: no se pudo resolver jugador actual:", error.message);
      return null;
    }
    return data || null;
  }

  async function getParticipation(chronicleId, playerId) {
    if (!chronicleId || !playerId || !global.supabase) return null;
    const { data, error } = await global.supabase
      .from("chronicle_participants")
      .select("id, role")
      .eq("chronicle_id", chronicleId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (error) {
      console.warn("ActiveSession: no se pudo resolver participación:", error.message);
      return null;
    }
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
    if (error) {
      console.warn(
        "ActiveSession: no se pudo resolver participación por user_id:",
        error.message,
      );
      return null;
    }
    return data || null;
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
    if (fallback?.data) {
      fallback.data.system_id = null;
    }
    return fallback;
  }

  async function getRosterSummary(chronicleId) {
    if (!chronicleId || !global.supabase) return [];
    const [participantsResult, charsResult] = await Promise.all([
      global.supabase
        .from("chronicle_participants")
        .select("player_id, player:players(id, name, user_id)")
        .eq("chronicle_id", chronicleId),
      global.supabase
        .from("chronicle_characters")
        .select(
          "character_sheet_id, character_sheet:character_sheets(id, name, data, avatar_url, user_id)",
        )
        .eq("chronicle_id", chronicleId),
    ]);

    if (participantsResult.error || charsResult.error) {
      console.warn(
        "ActiveSession: no se pudo cargar roster:",
        participantsResult.error?.message || charsResult.error?.message,
      );
      return [];
    }

    const participants = participantsResult.data || [];
    const characters = charsResult.data || [];
    const playerNameByUserId = new Map();
    participants.forEach((p) => {
      if (p?.player?.user_id) {
        playerNameByUserId.set(p.player.user_id, p.player.name || "Jugador");
      }
    });

    return characters
      .map((row) => {
        const sheet = row.character_sheet;
        if (!sheet) return null;
        const data = sheet.data || {};
        const v20 = extractV20Stats(data);
        return {
          id: sheet.id,
          name: sheet.name || "Sin hoja",
          playerName: playerNameByUserId.get(sheet.user_id) || "Jugador",
          avatarUrl: data.avatarThumbUrl || sheet.avatar_url || data.avatar_url || "",
          clan: v20.clan,
          humanity: v20.humanity,
          blood: v20.blood,
          willpower: v20.willpower,
          healthTrack: v20.healthTrack,
        };
      })
      .filter(Boolean);
  }

  function buildEncounterSnapshot(enc) {
    const data = enc?.data || {};
    return {
      encounterId: enc?.id || null,
      encounterName: enc?.name || null,
      round: data.round || 1,
      activeInstanceId: data.activeInstanceId || null,
      instances: data.instances || [],
      connected: !!enc?.id,
      isMyTurn: false,
    };
  }

  function createEncounterBridge({ chronicleId, onStateChange } = {}) {
    const state = {
      channel: null,
      watchChannel: null,
      encounterId: null,
      connected: false,
    };

    function emit(snapshot) {
      if (typeof onStateChange === "function") onStateChange(snapshot || null);
    }

    function unsubscribeEncounter() {
      if (!state.channel) return;
      try {
        state.channel.unsubscribe?.();
      } catch (_e) {}
      try {
        global.supabase?.removeChannel?.(state.channel);
      } catch (_e) {}
      state.channel = null;
    }

    function unwatchChronicle() {
      if (!state.watchChannel) return;
      try {
        state.watchChannel.unsubscribe?.();
      } catch (_e) {}
      try {
        global.supabase?.removeChannel?.(state.watchChannel);
      } catch (_e) {}
      state.watchChannel = null;
    }

    function disconnect() {
      unsubscribeEncounter();
      state.encounterId = null;
      state.connected = false;
      emit(null);
      watchChronicle();
    }

    function subscribeToEncounter(encounterId) {
      if (!global.supabase || !encounterId) return;
      unsubscribeEncounter();

      state.channel = global.supabase
        .channel(`active-session-encounter-${encounterId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "encounters",
            filter: `id=eq.${encounterId}`,
          },
          (payload) => {
            const updated = payload.new;
            if (!updated) return;
            if (updated.status !== "in_game") {
              disconnect();
              return;
            }
            state.connected = true;
            state.encounterId = updated.id;
            emit(buildEncounterSnapshot(updated));
          },
        )
        .subscribe();
    }

    function watchChronicle() {
      unwatchChronicle();
      if (!global.supabase || !chronicleId) return;
      state.watchChannel = global.supabase
        .channel(`active-session-chronicle-${chronicleId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "encounters",
            filter: `chronicle_id=eq.${chronicleId}`,
          },
          (payload) => {
            const updated = payload.new;
            if (!updated || state.connected) return;
            if (updated.status !== "in_game") return;
            state.connected = true;
            state.encounterId = updated.id;
            emit(buildEncounterSnapshot(updated));
            subscribeToEncounter(updated.id);
            unwatchChronicle();
          },
        )
        .subscribe();
    }

    async function connect() {
      if (!global.supabase || !chronicleId) {
        emit(null);
        return;
      }

      const { data: enc, error } = await global.supabase.rpc(
        "get_active_encounter_for_chronicle",
        { p_chronicle_id: chronicleId },
      );

      if (error) {
        console.warn("ActiveSession: error buscando encuentro activo:", error.message);
        emit(null);
        watchChronicle();
        return;
      }

      if (!enc) {
        emit(null);
        watchChronicle();
        return;
      }

      state.connected = true;
      state.encounterId = enc.id;
      emit(buildEncounterSnapshot(enc));
      subscribeToEncounter(enc.id);
    }

    function destroy() {
      unwatchChronicle();
      unsubscribeEncounter();
      state.encounterId = null;
      state.connected = false;
    }

    return {
      connect,
      destroy,
    };
  }

  ns.service = {
    getHashContext,
    getSession,
    getCurrentPlayerByUserId,
    getParticipation,
    getParticipationByUserId,
    getChronicle,
    getRosterSummary,
    createEncounterBridge,
  };
})(window);
