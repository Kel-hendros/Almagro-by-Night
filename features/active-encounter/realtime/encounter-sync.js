(function initAEEncounterSync(global) {
  function createController(ctx) {
    var state = ctx.state;
    var els = ctx.els;
    var supabase = ctx.supabase;
    var normalizeEncounterStatus = ctx.normalizeEncounterStatus;
    var sanitizeEncounterTokens = ctx.sanitizeEncounterTokens;
    var ensureActiveInstance = ctx.ensureActiveInstance;
    var render = ctx.render;
    var openModal = ctx.openModal;
    var getTilePainter = ctx.getTilePainter;
    var getWallDrawer = ctx.getWallDrawer;
    var getRoomDrawer = ctx.getRoomDrawer;
    var getApplyBroadcastInitiative = ctx.getApplyBroadcastInitiative;

    function extractPCHealth(charData) {
      if (!charData) return [0, 0, 0, 0, 0, 0, 0];
      var healthKeys = [
        "magullado-value", "lastimado-value", "lesionado-value",
        "herido-value", "malherido-value", "tullido-value", "incapacitado-value",
      ];
      return healthKeys.map(function (key) { return parseInt(charData[key]) || 0; });
    }

    function buildEncounterSyncKey(encounterLike) {
      if (!encounterLike) return "";
      return JSON.stringify({
        status: normalizeEncounterStatus(encounterLike.status),
        data: encounterLike.data || {},
      });
    }

    function applyRemoteEncounterUpdate(updated) {
      if (!updated || !state.encounter) return;
      var tilePainter = getTilePainter();
      var wallDrawer = getWallDrawer();
      var localTileMap = (tilePainter && tilePainter.isActive())
        ? state.encounter.data.tileMap : null;
      var localWalls = (wallDrawer && wallDrawer.isActive())
        ? state.encounter.data.walls : null;
      var roomDrawer = getRoomDrawer();
      var localRooms = (roomDrawer && roomDrawer.isActive())
        ? state.encounter.data.rooms : null;
      var preserveLights = !!(
        (state.map && state.map._isDraggingLight) ||
        (state._lightLocalChangeUntil && Date.now() < state._lightLocalChangeUntil)
      );
      var localLights = preserveLights
        ? state.encounter.data.lights
        : null;

      state.encounter.status = normalizeEncounterStatus(updated.status);
      state.encounter.data = updated.data || state.encounter.data;
      if (!state.encounter.data.ambientLight) {
        state.encounter.data.ambientLight = { color: "#8090b0", intensity: 0.5 };
      }
      if (localTileMap) state.encounter.data.tileMap = localTileMap;
      if (localWalls) state.encounter.data.walls = localWalls;
      if (localRooms) state.encounter.data.rooms = localRooms;
      if (localLights) state.encounter.data.lights = localLights;
      if (state.encounterHasUpdatedAt && updated.updated_at) {
        state.encounterUpdatedAt = updated.updated_at;
      }
      state.lastEncounterSyncKey = buildEncounterSyncKey(updated);
      sanitizeEncounterTokens();
      ensureActiveInstance();
      if (state.map) {
        state.map.recomputeRooms?.();
        if (typeof state.map.setFogConfig === "function") {
          state.map.setFogConfig(state.encounter.data.fog || null);
        }
        state.map.invalidateFog?.();
        state.map.invalidateLighting?.();
      }
      render();
    }

    function setupRealtimeSubscription() {
      teardownRealtimeSubscriptions();

      var characterSheetsChannel = supabase
        .channel("character-sheets-changes")
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "character_sheets",
        }, function (payload) {
          var updatedSheet = payload.new;
          var sheetIdx = state.characterSheets.findIndex(function (s) { return s.id === updatedSheet.id; });
          if (sheetIdx !== -1) {
            state.characterSheets[sheetIdx] = updatedSheet;
          } else {
            state.characterSheets.push(updatedSheet);
          }
          var d = state.encounter && state.encounter.data;
          if (d && d.instances) {
            var inst = d.instances.find(function (i) { return i.characterSheetId === updatedSheet.id; });
            if (inst) {
              inst.pcHealth = extractPCHealth(updatedSheet.data);
              render();
              if (state.selectedInstanceId === inst.id && els.modal.style.display !== "none") {
                openModal(inst);
              }
            }
          }
        }).subscribe();

      var encounterChannel = supabase
        .channel("encounter-" + state.encounterId + "-changes")
        .on("postgres_changes", {
          event: "UPDATE", schema: "public", table: "encounters",
          filter: "id=eq." + state.encounterId,
        }, function (payload) {
          if (state.isApplyingRemoteUpdate) return;
          var updated = payload.new;
          if (!updated) return;
          applyRemoteEncounterUpdate(updated);
        }).subscribe();

      state.realtimeChannels.push(characterSheetsChannel, encounterChannel);

      // Use global roll notifications component (skip if embedded in iframe - parent handles it)
      var isEmbedded = global.self !== global.top;
      var chronicleId = state.encounter?.chronicle_id || null;
      if (!isEmbedded && global.ABNRollNotifications && chronicleId) {
        global.ABNRollNotifications.destroy();
        var mapContainer = document.getElementById("ae-map-container");
        global.ABNRollNotifications.create({
          chronicleId: chronicleId,
          container: mapContainer,
          onInitiativeRoll: getApplyBroadcastInitiative(),
        });
      }

      startEncounterSyncPolling();
    }

    function teardownRealtimeSubscriptions() {
      var isEmbedded = global.self !== global.top;
      if (!isEmbedded && global.ABNRollNotifications) {
        global.ABNRollNotifications.destroy();
      }
      if (!Array.isArray(state.realtimeChannels) || state.realtimeChannels.length === 0) return;
      state.realtimeChannels.forEach(function (channel) {
        if (!channel) return;
        try { channel.unsubscribe?.(); } catch (_e) {}
        try { supabase.removeChannel?.(channel); } catch (_e) {}
      });
      state.realtimeChannels = [];
    }

    function startEncounterSyncPolling() {
      stopEncounterSyncPolling();
      // Safety-net polling — realtime is the primary sync channel.
      // Runs every 10s to catch anything realtime may have missed.
      state.encounterSyncTimer = setInterval(async function () {
        if (!state.encounterId || state.isApplyingRemoteUpdate) return;
        // Skip during player interaction cooldown (avoid overwriting optimistic local state)
        if (state._playerInteractionUntil && Date.now() < state._playerInteractionUntil) return;
        var result = await supabase
          .from("encounters")
          .select(state.encounterHasUpdatedAt ? "id, status, data, updated_at" : "id, status, data")
          .eq("id", state.encounterId)
          .maybeSingle();
        if (result.error || !result.data) return;
        var incomingKey = buildEncounterSyncKey(result.data);
        if (!state.lastEncounterSyncKey || incomingKey !== state.lastEncounterSyncKey) {
          applyRemoteEncounterUpdate(result.data);
        }
      }, 10000);
    }

    function stopEncounterSyncPolling() {
      if (!state.encounterSyncTimer) return;
      clearInterval(state.encounterSyncTimer);
      state.encounterSyncTimer = null;
    }

    return {
      setup: setupRealtimeSubscription,
      teardown: teardownRealtimeSubscriptions,
      startPolling: startEncounterSyncPolling,
      stopPolling: stopEncounterSyncPolling,
      extractPCHealth: extractPCHealth,
      buildSyncKey: buildEncounterSyncKey,
    };
  }

  global.AEEncounterSync = { createController: createController };
})(window);
