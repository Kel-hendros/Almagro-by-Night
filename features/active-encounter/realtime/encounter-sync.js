(function initAEEncounterSync(global) {
  function createController(ctx) {
    var state = ctx.state;
    var els = ctx.els;
    var supabase = ctx.supabase;
    var canEditEncounter = ctx.canEditEncounter;
    var normalizeEncounterStatus = ctx.normalizeEncounterStatus;
    var loadCharacterSheets = ctx.loadCharacterSheets;
    var pruneEncounterRoster = ctx.pruneEncounterRoster;
    var sanitizeEncounterTokens = ctx.sanitizeEncounterTokens;
    var ensureActiveInstance = ctx.ensureActiveInstance;
    var render = ctx.render;
    var openModal = ctx.openModal;
    var getTilePainter = ctx.getTilePainter;
    var getWallDrawer = ctx.getWallDrawer;
    var getPaperEditor = ctx.getPaperEditor || function () { return null; };
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

    function cloneJson(value) {
      if (value == null) return value;
      try {
        return JSON.parse(JSON.stringify(value));
      } catch (_err) {
        return value;
      }
    }

    function mergeUniqueAreas(baseAreas, extraAreas) {
      var merged = Array.isArray(baseAreas) ? cloneJson(baseAreas) : [];
      if (!Array.isArray(extraAreas) || extraAreas.length === 0) return merged;
      var seen = new Set(merged.map(function (area) { return JSON.stringify(area); }));
      for (var i = 0; i < extraAreas.length; i++) {
        var key = JSON.stringify(extraAreas[i]);
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(cloneJson(extraAreas[i]));
      }
      return merged;
    }

    function mergeExploredBy(remoteExploredBy, localExploredBy) {
      var merged = {};
      var remote = remoteExploredBy && typeof remoteExploredBy === "object" ? remoteExploredBy : {};
      var local = localExploredBy && typeof localExploredBy === "object" ? localExploredBy : {};
      var ids = new Set(Object.keys(remote).concat(Object.keys(local)));
      ids.forEach(function (id) {
        merged[id] = mergeUniqueAreas(remote[id], local[id]);
      });
      return merged;
    }

    function mergeFogMemory(remoteFog, localFog) {
      var remote = remoteFog && typeof remoteFog === "object" ? cloneJson(remoteFog) : {};
      var local = localFog && typeof localFog === "object" ? localFog : null;
      if (!local) return remote;
      var remoteResetVersion = parseInt(remote.resetVersion, 10) || 0;
      var localResetVersion = parseInt(local.resetVersion, 10) || 0;
      if (remoteResetVersion > localResetVersion) {
        return remote;
      }
      if (localResetVersion > remoteResetVersion) {
        remote.resetVersion = localResetVersion;
      }
      remote.exploredAreas = mergeUniqueAreas(remote.exploredAreas, local.exploredAreas);
      remote.exploredBy = mergeExploredBy(remote.exploredBy, local.exploredBy);
      return remote;
    }

    function applyRemoteEncounterUpdate(updated) {
      if (!updated || !state.encounter) return;
      var tilePainter = getTilePainter();
      var wallDrawer = getWallDrawer();
      var paperEditor = getPaperEditor();
      var wallPathsDomain = global.AEWallPaths;
      var localTileMap = (tilePainter && tilePainter.isActive())
        ? state.encounter.data.tileMap : null;
      var preserveLocalWallEditorState = !!(
        (wallDrawer && wallDrawer.isActive()) ||
        (paperEditor && paperEditor.isActive && paperEditor.isActive())
      );
      var localWallPaths = preserveLocalWallEditorState
        ? state.encounter.data.wallPaths
        : null;
      var localWalls = preserveLocalWallEditorState
        ? state.encounter.data.walls
        : null;
      var preserveLights = !!(
        (state.map && state.map._isDraggingLight) ||
        (state._lightLocalChangeUntil && Date.now() < state._lightLocalChangeUntil)
      );
      var localLights = preserveLights
        ? state.encounter.data.lights
        : null;
      var preserveLocalFogMemory = !canEditEncounter();
      var localFog = preserveLocalFogMemory
        ? state.encounter.data.fog
        : null;

      state.encounter.status = normalizeEncounterStatus(updated.status);
      // Preserve local design-layer data when we have unsaved draft changes
      var preserveDraft = !!state._draftDirty;
      var localDesignData = null;
      if (preserveDraft) {
        localDesignData = {
          tileMap: state.encounter.data.tileMap,
          designTokens: state.encounter.data.designTokens,
          props: state.encounter.data.props,
          map: state.encounter.data.map,
          mapEffects: state.encounter.data.mapEffects,
          ambientLight: state.encounter.data.ambientLight,
        };
      }
      state.encounter.data = updated.data || state.encounter.data;
      if (preserveDraft && localDesignData) {
        state.encounter.data.tileMap = localDesignData.tileMap;
        state.encounter.data.designTokens = localDesignData.designTokens;
        state.encounter.data.props = localDesignData.props;
        state.encounter.data.map = localDesignData.map;
        state.encounter.data.mapEffects = localDesignData.mapEffects;
        state.encounter.data.ambientLight = localDesignData.ambientLight;
      }
      state.encounter.data.wallPaths =
        wallPathsDomain?.normalizeWallPaths?.(state.encounter.data.wallPaths || []) || [];
      state.encounter.data.wallPaths =
        wallPathsDomain?.reconcileWallPathsFromWalls?.(
          state.encounter.data.wallPaths,
          state.encounter.data.walls || [],
        ) || state.encounter.data.wallPaths;
      if (preserveLocalFogMemory) {
        state.encounter.data.fog = mergeFogMemory(state.encounter.data.fog, localFog);
      }
      if (!state.encounter.data.ambientLight) {
        state.encounter.data.ambientLight = { color: "#8090b0", intensity: 0.5, tintStrength: 0.35 };
      } else if (state.encounter.data.ambientLight.tintStrength == null) {
        state.encounter.data.ambientLight.tintStrength = 0.35;
      }
      if (localTileMap) state.encounter.data.tileMap = localTileMap;
      if (localWallPaths) {
        state.encounter.data.wallPaths = wallPathsDomain?.normalizeWallPaths?.(localWallPaths) || [];
      }
      state.encounter.data.walls = localWalls ||
        wallPathsDomain?.compileWalls?.(state.encounter.data.wallPaths) ||
        [];
      if (localLights) state.encounter.data.lights = localLights;
      if (state.encounterHasUpdatedAt && updated.updated_at) {
        state.encounterUpdatedAt = updated.updated_at;
      }
      state.lastEncounterSyncKey = buildEncounterSyncKey(updated);
      sanitizeEncounterTokens();
      ensureActiveInstance();
      if (state.map) {
        if (typeof state.map.setFogConfig === "function") {
          state.map.setFogConfig(state.encounter.data.fog || null);
        }
        state.map.invalidateFog?.();
        state.map.invalidateLightingWalls?.();
      }
      render();
      if (!preserveLocalWallEditorState && paperEditor?.isActive?.()) {
        paperEditor.reload?.();
      }
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
          if (sheetIdx === -1) return;

          state.characterSheets[sheetIdx] = updatedSheet;
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

      var chronicleCharactersChannel = null;
      if (state.encounter?.chronicle_id) {
        chronicleCharactersChannel = supabase
          .channel("encounter-" + state.encounterId + "-chronicle-characters")
          .on("postgres_changes", {
            event: "*",
            schema: "public",
            table: "chronicle_characters",
            filter: "chronicle_id=eq." + state.encounter.chronicle_id,
          }, async function () {
            if (typeof loadCharacterSheets === "function") {
              await loadCharacterSheets();
            }
            if (typeof pruneEncounterRoster === "function") {
              pruneEncounterRoster();
            }
            render();
          }).subscribe();
      }

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
      if (chronicleCharactersChannel) {
        state.realtimeChannels.push(chronicleCharactersChannel);
      }

      // Listen for initiative rolls via the global notification system.
      // Roll toast display is handled globally by ABNNotifications.
      var isEmbedded = global.self !== global.top;
      if (!isEmbedded) {
        state._initiativeHandler = function (e) {
          var data = e.detail;
          if (!data || data.rollType !== "initiative") return;
          var applyFn = getApplyBroadcastInitiative();
          if (applyFn) {
            applyFn({
              sheetId: data.sheetId || null,
              characterName: data.characterName || null,
              total: data.total,
            });
          }
        };
        global.addEventListener("abn-roll-notification", state._initiativeHandler);
      }

      startEncounterSyncPolling();
    }

    function teardownRealtimeSubscriptions() {
      if (state._initiativeHandler) {
        global.removeEventListener("abn-roll-notification", state._initiativeHandler);
        state._initiativeHandler = null;
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
