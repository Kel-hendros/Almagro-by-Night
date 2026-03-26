(function initEncounterBridge(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  const state = {
    sheetId: null,
    chronicleId: null,
    encounterId: null,
    encounterName: null,
    round: 0,
    activeInstanceId: null,
    myInstance: null,
    instances: [],
    connected: false,
    channel: null,
    listeningForFrameMessages: false,
    frameLoadBound: false,
  };

  function getSupabase() {
    return global.supabase || null;
  }

  function getSheetId() {
    return ns.service?.getSheetIdFromHash?.() || null;
  }

  function getChronicleId() {
    return localStorage.getItem("currentChronicleId") || null;
  }

  function emit(eventName, detail) {
    global.dispatchEvent(
      new CustomEvent(eventName, { detail: detail || {} }),
    );
  }

  function buildFramePayload() {
    return {
      type: "abn-encounter-state",
      connected: state.connected,
      encounterId: state.encounterId,
      sheetId: state.sheetId,
      round: state.round,
      isMyTurn: isMyTurn(),
      activeInstanceId: state.activeInstanceId,
    };
  }

  function postToFrame(data) {
    try {
      const frame = document.getElementById("acs-frame");
      if (frame?.contentWindow) {
        frame.contentWindow.postMessage(data, "*");
      }
    } catch (_e) {}
  }

  function handleFrameLoad() {
    // Re-send encounter state when iframe finishes loading
    if (state.connected) {
      postToFrame(buildFramePayload());
    }
  }

  function bindFrameLoad() {
    if (state.frameLoadBound) return;
    const frame = document.getElementById("acs-frame");
    if (frame) {
      frame.addEventListener("load", handleFrameLoad);
      state.frameLoadBound = true;
    }
  }

  function unbindFrameLoad() {
    if (!state.frameLoadBound) return;
    const frame = document.getElementById("acs-frame");
    if (frame) {
      frame.removeEventListener("load", handleFrameLoad);
    }
    state.frameLoadBound = false;
  }

  function findMyInstance(instances, sheetId) {
    if (!Array.isArray(instances) || !sheetId) return null;
    return (
      instances.find(
        (i) =>
          i.characterSheetId === sheetId &&
          i.isPC &&
          !i.isExtraAction,
      ) || null
    );
  }

  function isMyTurn() {
    if (!state.connected || !state.myInstance) return false;
    return state.activeInstanceId === state.myInstance.id;
  }

  function applyEncounterData(enc) {
    if (!enc) {
      disconnect();
      return;
    }

    const prevRound = state.round;
    const prevActiveId = state.activeInstanceId;

    state.encounterId = enc.id;
    state.encounterName = enc.name || null;
    state.round = enc.round || 1;
    state.activeInstanceId = enc.activeInstanceId || null;
    state.instances = enc.instances || [];
    state.myInstance = findMyInstance(state.instances, state.sheetId);

    if (!state.connected) {
      state.connected = true;
      emit("abn-encounter-connected", snapshot());
    }

    emit("abn-encounter-updated", snapshot());

    if (prevActiveId !== state.activeInstanceId) {
      emit("abn-encounter-turn-changed", snapshot());
    }

    if (prevRound !== state.round && prevRound > 0) {
      emit("abn-encounter-round-changed", snapshot());
    }

    // Notify iframe for blood-per-turn tracking and Celerity
    postToFrame(buildFramePayload());
  }

  function snapshot() {
    return {
      encounterId: state.encounterId,
      encounterName: state.encounterName,
      round: state.round,
      activeInstanceId: state.activeInstanceId,
      myInstance: state.myInstance,
      isMyTurn: isMyTurn(),
      instances: state.instances,
      connected: state.connected,
    };
  }

  function subscribeToEncounter(encounterId) {
    const supabase = getSupabase();
    if (!supabase || !encounterId) return;

    unsubscribe();

    const channel = supabase
      .channel(`sheet-encounter-bridge-${encounterId}`)
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

          const data = updated.data || {};
          applyEncounterData({
            id: updated.id,
            name: updated.name,
            round: data.round || 1,
            activeInstanceId: data.activeInstanceId || null,
            instances: data.instances || [],
          });
        },
      )
      .subscribe();

    state.channel = channel;
  }

  function unsubscribe() {
    if (!state.channel) return;
    const supabase = getSupabase();
    try {
      state.channel.unsubscribe?.();
    } catch (_e) {}
    try {
      supabase?.removeChannel?.(state.channel);
    } catch (_e) {}
    state.channel = null;
  }

  function disconnect() {
    const wasConnected = state.connected;
    teardownRollBroadcastChannel();
    unsubscribe();
    state.encounterId = null;
    state.encounterName = null;
    state.round = 0;
    state.activeInstanceId = null;
    state.myInstance = null;
    state.instances = [];
    state.connected = false;

    if (wasConnected) {
      emit("abn-encounter-disconnected", {});
      postToFrame({ type: "abn-encounter-state", connected: false, round: 0 });
      // Resume watching for a new encounter in the chronicle
      if (state.chronicleId) watchChronicle();
    }
  }

  function handleFrameMessage(event) {
    const data = event.data;
    if (!data) return;

    // Embed encounter posts live state — update bridge instantly
    if (data.type === "abn-encounter-embed-state") {
      if (data.encounterId && data.encounterId === state.encounterId) {
        applyEncounterData({
          id: data.encounterId,
          name: data.encounterName,
          round: data.round,
          activeInstanceId: data.activeInstanceId,
          instances: data.instances || [],
        });
      }
      return;
    }

    // Dice roll result from character sheet — broadcast to encounter and/or chronicle
    if (data.type === "abn-dice-roll-result") {
      // Broadcast if connected to encounter OR if we have a chronicle ID
      if ((state.connected && state.encounterId) || state.chronicleId) {
        broadcastDiceRoll(data);
      }
      return;
    }

    if (data.type !== "abn-celeridad-activate") return;
    if (!state.connected) return;

    const encId = data.encounterId || state.encounterId;
    const sId = data.sheetId || state.sheetId;
    const count = parseInt(data.count, 10);
    if (!encId || !sId || isNaN(count) || count < 0) return;

    callExtraActionsRPC(encId, sId, count);
  }

  // --- Dice roll broadcast channel (chronicle-level) ---
  let rollBroadcastChannel = null;

  function ensureRollBroadcastChannel() {
    if (rollBroadcastChannel) return rollBroadcastChannel;
    const sb = getSupabase();
    if (!sb || !state.chronicleId) return null;
    rollBroadcastChannel = sb
      .channel("chronicle-rolls-" + state.chronicleId)
      .subscribe();
    return rollBroadcastChannel;
  }

  function broadcastDiceRoll(data) {
    const ch = ensureRollBroadcastChannel();
    if (!ch) return;
    ch.send({
      type: "broadcast",
      event: "dice-roll",
      payload: Object.assign({}, data, { sheetId: state.sheetId }),
    });

    // Persist roll as notification (full payload for toast rendering)
    if (window.ABNNotifications?.controller && state.chronicleId) {
      var rollLabel = data.rollType || data.rollName || "Tirada";
      var rollPayload = Object.assign({}, data, { sheetId: state.sheetId });
      // Strip postMessage overhead
      delete rollPayload.type;
      delete rollPayload.source;
      window.ABNNotifications.controller.pushNotification({
        chronicleId: state.chronicleId,
        type: "dice_roll",
        title: (data.characterName || "?") + " — " + rollLabel,
        body: data.result || "",
        icon: "dices",
        metadata: rollPayload,
        visibility: "all",
      });
    }
  }

  function teardownRollBroadcastChannel() {
    if (!rollBroadcastChannel) return;
    const sb = getSupabase();
    try {
      rollBroadcastChannel.unsubscribe?.();
    } catch (_e) {}
    try {
      sb?.removeChannel?.(rollBroadcastChannel);
    } catch (_e) {}
    rollBroadcastChannel = null;
  }

  async function callExtraActionsRPC(encId, sId, count) {
    const supabase = getSupabase();
    if (!supabase) return;

    const { error } = await supabase.rpc("add_encounter_extra_actions", {
      p_encounter_id: encId,
      p_character_sheet_id: sId,
      p_action_type: "celeridad",
      p_count: count,
    });

    if (error) {
      console.warn("[EncounterBridge] Celerity RPC error:", error.message);
    }
  }

  async function connect() {
    const supabase = getSupabase();
    if (!supabase) return;

    // Bind listeners once
    if (!state.listeningForFrameMessages) {
      global.addEventListener("message", handleFrameMessage);
      state.listeningForFrameMessages = true;
    }
    bindFrameLoad();

    state.sheetId = getSheetId();
    state.chronicleId = getChronicleId();

    if (!state.sheetId) return;

    // If no chronicle ID in localStorage, look it up via chronicle_characters
    if (!state.chronicleId) {
      const { data: link } = await supabase
        .from("chronicle_characters")
        .select("chronicle_id")
        .eq("character_sheet_id", state.sheetId)
        .limit(1)
        .maybeSingle();

      if (link?.chronicle_id) {
        state.chronicleId = link.chronicle_id;
      }
    }

    if (!state.chronicleId) return;

    // Call the RPC to get the active encounter
    const { data: enc, error } = await supabase.rpc(
      "get_active_encounter_for_chronicle",
      { p_chronicle_id: state.chronicleId },
    );

    if (error) {
      console.warn("[EncounterBridge] RPC error:", error.message);
      return;
    }

    if (!enc) {
      // No active encounter — watch for one to appear via realtime
      watchChronicle();
      return;
    }

    applyEncounterData(enc);
    subscribeToEncounter(enc.id);
  }

  // Watch for an encounter becoming active in this chronicle (realtime)
  let watchChannel = null;

  function watchChronicle() {
    unwatchChronicle();
    const supabase = getSupabase();
    if (!supabase || !state.chronicleId) return;

    watchChannel = supabase
      .channel("sheet-chronicle-watch-" + state.chronicleId)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "encounters",
          filter: "chronicle_id=eq." + state.chronicleId,
        },
        function (payload) {
          var updated = payload.new;
          if (!updated || state.connected) return;
          if (updated.status === "in_game") {
            unwatchChronicle();
            var data = updated.data || {};
            applyEncounterData({
              id: updated.id,
              name: updated.name,
              round: data.round || 1,
              activeInstanceId: data.activeInstanceId || null,
              instances: data.instances || [],
            });
            subscribeToEncounter(updated.id);
          }
        },
      )
      .subscribe();
  }

  function unwatchChronicle() {
    if (!watchChannel) return;
    var supabase = getSupabase();
    try { watchChannel.unsubscribe?.(); } catch (_e) {}
    try { supabase?.removeChannel?.(watchChannel); } catch (_e) {}
    watchChannel = null;
  }

  function destroy() {
    unwatchChronicle();
    disconnect();
    unbindFrameLoad();
    if (state.listeningForFrameMessages) {
      global.removeEventListener("message", handleFrameMessage);
      state.listeningForFrameMessages = false;
    }
    state.sheetId = null;
    state.chronicleId = null;
  }

  ns.encounterBridge = {
    connect,
    disconnect,
    destroy,
    snapshot,
    isMyTurn,
    get state() {
      return snapshot();
    },
  };
})(window);
