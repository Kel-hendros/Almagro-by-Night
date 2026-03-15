(function initAEEncounterPersistence(global) {
  function createController(ctx) {
    var state = ctx.state;
    var supabase = ctx.supabase;
    var canEditEncounter = ctx.canEditEncounter;
    var normalizeMapLayerData = ctx.normalizeMapLayerData;
    var normalizeDesignTokensData = ctx.normalizeDesignTokensData;
    var normalizeMapEffectsData = ctx.normalizeMapEffectsData;
    var loadEncounterData = ctx.loadEncounterData;

    var backgroundPersistTimer = null;

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

    async function saveEncounter() {
      if (!state.encounter) return;
      if (!canEditEncounter()) return;
      sanitizeEncounterTokens();
      var btn = document.getElementById("btn-ae-save");
      var prevText = (btn && btn.textContent) || "";
      if (btn) btn.textContent = "Guardando...";

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
        mapEffects: normalizeMapEffectsData(state.encounter.data.mapEffects),
        tileMap: state.encounter.data.tileMap || {},
        walls: state.encounter.data.walls || [],
        lights: state.encounter.data.lights || [],
        switches: state.encounter.data.switches || [],
        ambientLight: state.encounter.data.ambientLight || null,
        fog: state.encounter.data.fog || null,
      };

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
            if (btn) btn.textContent = prevText;
            state.isApplyingRemoteUpdate = false;
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

      if (error) alert("Error: " + error.message);

      if (btn) {
        btn.textContent = "Guardado";
        setTimeout(function () { btn.textContent = prevText; }, 1000);
      }
      setTimeout(function () {
        state.isApplyingRemoteUpdate = false;
      }, 200);
    }

    return {
      sanitizeEncounterTokens: sanitizeEncounterTokens,
      saveEncounter: saveEncounter,
      scheduleBackgroundPersist: scheduleBackgroundPersist,
      destroy: function () {
        if (backgroundPersistTimer) {
          clearTimeout(backgroundPersistTimer);
          backgroundPersistTimer = null;
        }
      },
    };
  }

  global.AEEncounterPersistence = { createController: createController };
})(window);
