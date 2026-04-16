(function initAEEncounterPersistence(global) {
  var AUTO_FLUSH_INTERVAL_MS = 60000;

  function createController(ctx) {
    var state = ctx.state;
    var supabase = ctx.supabase;
    var canEditEncounter = ctx.canEditEncounter;
    var isEditMode = ctx.isEditMode || function () { return false; };
    var pruneEncounterRoster = ctx.pruneEncounterRoster;
    var normalizeMapLayerData = ctx.normalizeMapLayerData;
    var normalizeDesignTokensData = ctx.normalizeDesignTokensData;
    var normalizeMapEffectsData = ctx.normalizeMapEffectsData;
    var loadEncounterData = ctx.loadEncounterData;

    var designDraftPersistTimer = null;
    var autoFlushTimer = null;
    var draftDirty = false;
    var saveIndicatorResetTimer = null;

    // ── Helpers ──

    function getDraftKey() {
      return state.encounterId ? "abn_encounter_draft_" + state.encounterId : null;
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

    function markRestoredDraftDirty() {
      draftDirty = true;
      state._draftDirty = true;
      updateSaveIndicator("dirty");
    }

    function saveDesignDraft() {
      var key = getDraftKey();
      if (!key) return;
      try {
        var cleanData = buildCleanData();
        if (!cleanData) return;
        localStorage.setItem(key, JSON.stringify({
          data: cleanData,
          savedAt: Date.now(),
        }));
        markRestoredDraftDirty();
      } catch (err) {
        console.warn("Draft save to localStorage failed:", err);
        // Fallback: flush directly to Supabase
        saveRuntimeState();
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

    async function flushDesignDraft() {
      if (!draftDirty) return;
      await flushToSupabase();
    }

    function hasPendingDesignDraft() {
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

    async function saveRuntimeState() {
      await flushToSupabase();
    }

    function scheduleDesignDraftPersist(delayMs) {
      if (delayMs === undefined) delayMs = 180;
      if (designDraftPersistTimer) {
        clearTimeout(designDraftPersistTimer);
      }
      designDraftPersistTimer = setTimeout(function () {
        designDraftPersistTimer = null;
        saveDesignDraft();
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
      if (designDraftPersistTimer) {
        clearTimeout(designDraftPersistTimer);
        designDraftPersistTimer = null;
      }
      stopAutoFlush();
      if (saveIndicatorResetTimer) {
        clearTimeout(saveIndicatorResetTimer);
        saveIndicatorResetTimer = null;
      }
    }

    return {
      sanitizeEncounterTokens: sanitizeEncounterTokens,
      saveDesignDraft: saveDesignDraft,
      flushDesignDraft: flushDesignDraft,
      saveRuntimeState: saveRuntimeState,
      scheduleDesignDraftPersist: scheduleDesignDraftPersist,
      hasPendingDesignDraft: hasPendingDesignDraft,
      loadDraftFromLocalStorage: loadDraftFromLocalStorage,
      markRestoredDraftDirty: markRestoredDraftDirty,
      clearDraft: clearDraft,
      destroy: destroy,
    };
  }

  global.AEEncounterPersistence = { createController: createController };
})(window);
