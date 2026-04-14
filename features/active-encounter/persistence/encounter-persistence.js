(function initAEEncounterPersistence(global) {
  var DESIGN_LAYERS = { background: true, elements: true, decor: true };
  var AUTO_FLUSH_INTERVAL_MS = 60000;

  function createController(ctx) {
    var state = ctx.state;
    var supabase = ctx.supabase;
    var canEditEncounter = ctx.canEditEncounter;
    var pruneEncounterRoster = ctx.pruneEncounterRoster;
    var normalizeMapLayerData = ctx.normalizeMapLayerData;
    var normalizeDesignTokensData = ctx.normalizeDesignTokensData;
    var normalizeMapEffectsData = ctx.normalizeMapEffectsData;
    var loadEncounterData = ctx.loadEncounterData;

    var backgroundPersistTimer = null;
    var autoFlushTimer = null;
    var draftDirty = false;
    var saveIndicatorResetTimer = null;

    // ── Helpers ──

    function getDraftKey() {
      return state.encounterId ? "abn_encounter_draft_" + state.encounterId : null;
    }

    function isDesignLayer() {
      return !!(state.activeMapLayer && DESIGN_LAYERS[state.activeMapLayer]);
    }

    function updateSaveIndicator(nextState) {
      var btn = document.getElementById("btn-ae-draft-save");
      var label = document.getElementById("ae-draft-label");
      if (!btn) return;
      btn.classList.remove("is-dirty", "is-saving", "is-saved");
      if (nextState === "dirty") {
        btn.classList.add("is-dirty");
        btn.title = "Cambios sin guardar — click para guardar";
        if (label) label.textContent = "Cambios sin guardar";
      } else if (nextState === "saving") {
        btn.classList.add("is-saving");
        btn.title = "Guardando...";
        if (label) label.textContent = "Guardando...";
      } else if (nextState === "saved") {
        btn.classList.add("is-saved");
        btn.title = "Guardado";
        if (label) label.textContent = "Guardado";
        if (saveIndicatorResetTimer) clearTimeout(saveIndicatorResetTimer);
        saveIndicatorResetTimer = setTimeout(function () {
          btn.classList.remove("is-saved");
          btn.title = "Sin cambios pendientes";
          if (label) label.textContent = "";
          saveIndicatorResetTimer = null;
        }, 2000);
      } else {
        btn.title = "Sin cambios pendientes";
        if (label) label.textContent = "";
      }
    }

    // ── Build clean data (shared between localStorage and Supabase paths) ──

    function buildCleanData() {
      if (!state.encounter) return null;
      if (typeof pruneEncounterRoster === "function") {
        pruneEncounterRoster();
      }
      sanitizeEncounterTokens();
      var wallPathsDomain = global.AEWallPaths;
      var wallPaths = wallPathsDomain?.normalizeWallPaths?.(state.encounter.data.wallPaths || []) || [];
      var compiledWalls = wallPathsDomain?.compileWalls?.(wallPaths) || [];
      state.encounter.data.wallPaths = wallPaths;
      state.encounter.data.walls = compiledWalls;

      var cleanData = {
        ...state.encounter.data,
        map: normalizeMapLayerData(state.encounter.data.map),
        tokens: (state.encounter.data.tokens || []).map(function (_ref) {
          var img = _ref.img, token = Object.assign({}, _ref);
          delete token.img;
          return token;
        }),
        designTokens: normalizeDesignTokensData(
          (state.encounter.data.designTokens || []).map(function (_ref) {
            var img = _ref.img, token = Object.assign({}, _ref);
            delete token.img;
            return token;
          }),
        ),
        props: (state.encounter.data.props || []).map(function (_ref) {
          var prop = Object.assign({}, _ref);
          delete prop._img;
          return prop;
        }),
        mapEffects: normalizeMapEffectsData(state.encounter.data.mapEffects),
        tileMap: state.encounter.data.tileMap || {},
        wallPaths: wallPaths,
        walls: compiledWalls,
        lights: state.encounter.data.lights || [],
        switches: state.encounter.data.switches || [],
        ambientLight: state.encounter.data.ambientLight || null,
        fog: state.encounter.data.fog || null,
      };
      delete cleanData.paperPaths;
      return cleanData;
    }

    // ── Draft (localStorage) ──

    function saveDraftToLocalStorage() {
      var key = getDraftKey();
      if (!key) return;
      try {
        var cleanData = buildCleanData();
        if (!cleanData) return;
        localStorage.setItem(key, JSON.stringify({
          data: cleanData,
          savedAt: Date.now(),
        }));
        draftDirty = true;
        state._draftDirty = true;
        updateSaveIndicator("dirty");
      } catch (err) {
        console.warn("Draft save to localStorage failed:", err);
        // Fallback: flush directly to Supabase
        flushToSupabase();
      }
    }

    function loadDraftFromLocalStorage() {
      var key = getDraftKey();
      if (!key) return null;
      try {
        var raw = localStorage.getItem(key);
        if (!raw) return null;
        return JSON.parse(raw);
      } catch (err) {
        return null;
      }
    }

    function clearDraft() {
      var key = getDraftKey();
      if (key) {
        try { localStorage.removeItem(key); } catch (_e) { /* ignore */ }
      }
      draftDirty = false;
      state._draftDirty = false;
      updateSaveIndicator("idle");
    }

    // ── Flush to Supabase ──

    async function flushToSupabase() {
      if (!state.encounter) return;
      if (!canEditEncounter()) return;

      var cleanData = buildCleanData();
      if (!cleanData) return;

      updateSaveIndicator("saving");
      state.isApplyingRemoteUpdate = true;
      var error = null;

      if (state.encounterHasUpdatedAt) {
        var query = supabase
          .from("encounters")
          .update({ data: cleanData })
          .eq("id", state.encounterId);

        if (state.encounterUpdatedAt) {
          query = query.eq("updated_at", state.encounterUpdatedAt);
        }

        var result = await query.select("updated_at").maybeSingle();
        error = result.error || null;

        if (!error) {
          if (state.encounterUpdatedAt && !result.data) {
            alert("Otro usuario actualizó este encuentro antes. Refresca y vuelve a intentar.");
            await loadEncounterData();
            state.isApplyingRemoteUpdate = false;
            updateSaveIndicator("idle");
            return;
          }
          if (result.data && result.data.updated_at) {
            state.encounterUpdatedAt = result.data.updated_at;
          }
        }
      } else {
        var updateResult = await supabase
          .from("encounters")
          .update({ data: cleanData })
          .eq("id", state.encounterId);
        error = updateResult.error || null;
      }

      if (error) {
        alert("Error: " + error.message);
        updateSaveIndicator("dirty");
      } else {
        clearDraft();
        updateSaveIndicator("saved");
      }

      setTimeout(function () {
        state.isApplyingRemoteUpdate = false;
      }, 200);
    }

    // ── Public API: flush if dirty ──

    async function flushIfDirty() {
      if (!draftDirty) return;
      await flushToSupabase();
    }

    function isDirty() {
      return draftDirty;
    }

    // ── Sanitize tokens ──

    function sanitizeEncounterTokens() {
      var d = state.encounter && state.encounter.data;
      if (!d) return { changed: false, removedCount: 0 };

      var validIds = new Set((d.instances || []).map(function (i) { return i.id; }));
      var tokens = d.tokens || [];
      var nextTokens = tokens.filter(function (t) { return t && validIds.has(t.instanceId); });
      var removedCount = tokens.length - nextTokens.length;
      var changed = removedCount > 0;

      if (changed) {
        d.tokens = nextTokens;
        if (state.selectedTokenId) {
          var stillExists = nextTokens.some(function (t) { return t.id === state.selectedTokenId; });
          if (!stillExists) {
            state.selectedTokenId = null;
            if (state.map) state.map.selectedTokenId = null;
          }
        }
      }

      return { changed: changed, removedCount: removedCount };
    }

    // ── Main save entry point (called by all 40+ callers) ──

    async function saveEncounter() {
      if (!state.encounter) return;
      if (!canEditEncounter()) return;

      if (isDesignLayer()) {
        // Design layer: save to localStorage, defer Supabase write
        saveDraftToLocalStorage();
      } else {
        // Entities layer or other: flush everything to Supabase immediately
        await flushToSupabase();
      }
    }

    function scheduleBackgroundPersist(delayMs) {
      if (delayMs === undefined) delayMs = 180;
      if (backgroundPersistTimer) {
        clearTimeout(backgroundPersistTimer);
      }
      backgroundPersistTimer = setTimeout(function () {
        backgroundPersistTimer = null;
        saveEncounter();
      }, delayMs);
    }

    // ── Auto-flush timer ──

    function startAutoFlush() {
      stopAutoFlush();
      autoFlushTimer = setInterval(function () {
        if (draftDirty && canEditEncounter()) {
          flushToSupabase();
        }
      }, AUTO_FLUSH_INTERVAL_MS);
    }

    function stopAutoFlush() {
      if (autoFlushTimer) {
        clearInterval(autoFlushTimer);
        autoFlushTimer = null;
      }
    }

    startAutoFlush();

    // ── Cleanup ──

    function destroy() {
      if (backgroundPersistTimer) {
        clearTimeout(backgroundPersistTimer);
        backgroundPersistTimer = null;
      }
      stopAutoFlush();
      if (saveIndicatorResetTimer) {
        clearTimeout(saveIndicatorResetTimer);
        saveIndicatorResetTimer = null;
      }
    }

    return {
      sanitizeEncounterTokens: sanitizeEncounterTokens,
      saveEncounter: saveEncounter,
      scheduleBackgroundPersist: scheduleBackgroundPersist,
      flushIfDirty: flushIfDirty,
      isDirty: isDirty,
      loadDraftFromLocalStorage: loadDraftFromLocalStorage,
      clearDraft: clearDraft,
      destroy: destroy,
    };
  }

  global.AEEncounterPersistence = { createController: createController };
})(window);
