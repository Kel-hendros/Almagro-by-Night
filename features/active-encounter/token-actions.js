(function initAEEncounterTokenActionsModule(global) {
  function createController(ctx) {
    const {
      state,
      canEditEncounter,
      canControlTokenById,
      persistPlayerInstanceState,
      render,
      saveEncounter,
    } = ctx;
    const METERS_PER_UNIT = 1.5;
    const DISCIPLINE_ID_BY_ALIAS = (() => {
      const fallbackAliases = {
        5: ["celeridad", "celerity"],
        11: ["fortaleza", "fortitude"],
        27: ["obtenebracion", "obtenebración", "obtenebration"],
      };
      const byAlias = new Map();
      Object.entries(fallbackAliases).forEach(([id, aliases]) => {
        aliases.forEach((alias) => byAlias.set(normalizeText(alias), Number(id)));
      });
      const repo = Array.isArray(global.DISCIPLINE_REPO) ? global.DISCIPLINE_REPO : [];
      repo.forEach((entry) => {
        const id = Number(entry?.id) || 0;
        if (!id) return;
        const es = normalizeText(entry?.name_es || "");
        const en = normalizeText(entry?.name_en || "");
        if (es) byAlias.set(es, id);
        if (en) byAlias.set(en, id);
      });
      return byAlias;
    })();

    function normalizeText(value) {
      return String(value || "")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .trim()
        .toLowerCase();
    }

    function parseLevel(value) {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? Math.max(0, n) : 0;
    }

    function removeTokenById(tokenId) {
      if (!canEditEncounter()) return false;
      if (!state.encounter?.data || !tokenId) return false;

      const data = state.encounter.data;
      const prevLen = (data.tokens || []).length;
      data.tokens = (data.tokens || []).filter((token) => token.id !== tokenId);
      if (data.tokens.length === prevLen) return false;

      state.selectedTokenId = null;
      if (state.map) {
        state.map.selectedTokenId = null;
      }

      render();
      saveEncounter();
      return true;
    }

    function setTokenCondition(tokenId, conditionKey, forceValue) {
      if (!state.encounter?.data || !tokenId || !conditionKey) return false;
      if (!canUseToken(tokenId)) return false;

      const token = (state.encounter.data.tokens || []).find(
        (item) => item.id === tokenId,
      );
      if (!token?.instanceId) return false;

      const instance = (state.encounter.data.instances || []).find(
        (item) => item.id === token.instanceId,
      );
      if (!instance) return false;

      const normalizedKey = String(conditionKey).toLowerCase();
      if (
        normalizedKey !== "flying" &&
        normalizedKey !== "prone" &&
        normalizedKey !== "blinded" &&
        normalizedKey !== "hidden"
      ) {
        return false;
      }

      const conditions =
        instance.conditions && typeof instance.conditions === "object"
          ? { ...instance.conditions }
          : {};
      if (typeof forceValue === "boolean") {
        conditions[normalizedKey] = forceValue;
      } else {
        conditions[normalizedKey] = !Boolean(conditions[normalizedKey]);
      }
      instance.conditions = conditions;

      render();
      if (canEditEncounter()) {
        saveEncounter();
      } else if (typeof persistPlayerInstanceState === "function") {
        persistPlayerInstanceState(instance.id, { conditions }).catch((error) => {
          console.warn("No se pudo persistir condición de instancia:", error?.message || error);
        });
      }
      return true;
    }

    function getInstanceByTokenId(tokenId) {
      const token = (state.encounter?.data?.tokens || []).find(
        (item) => item.id === tokenId,
      );
      if (!token?.instanceId) return null;
      return (
        (state.encounter?.data?.instances || []).find(
          (instance) => instance.id === token.instanceId,
        ) || null
      );
    }

    function getAvailablePowers(tokenId) {
      const resolver = global.AEEncounterPowers?.resolveAvailablePowers;
      if (typeof resolver !== "function") return [];
      return resolver({ tokenId, state });
    }

    function canUseToken(tokenId) {
      if (!tokenId) return false;
      if (canEditEncounter()) return true;
      if (typeof canControlTokenById === "function") {
        return !!canControlTokenById(tokenId);
      }
      return false;
    }

    function getTokenById(tokenId) {
      return (state.encounter?.data?.tokens || []).find((item) => item.id === tokenId) || null;
    }

    function invokePower(tokenId, powerId) {
      if (!canUseToken(tokenId)) return false;
      const power = global.AEEncounterPowers?.getPowerById?.(powerId);
      if (!power?.mapAction || !tokenId) return false;

      const action = power.mapAction;
      const activationMode = action.activation || "instant";
      if (action.type === "toggleCondition" && action.condition) {
        if (activationMode === "toggle") {
          const active = isPowerActive(tokenId, powerId);
          return setTokenCondition(tokenId, action.condition, !active);
        }
        return setTokenCondition(tokenId, action.condition, true);
      }
      if (action.type === "toggleObfuscation") {
        const active = isPowerActive(tokenId, powerId);
        return setObfuscationState(tokenId, !active);
      }
      if (action.type === "createMapEffect" && action.effectType) {
        if (activationMode === "toggle" && isPowerActive(tokenId, powerId)) {
          return removeMapEffectFromPower(tokenId, action);
        }
        let overrides = null;
        if (action.promptDiameterMeters) {
          overrides = promptMapEffectDiameter(action);
          if (!overrides) return false;
        }
        return createOrUpdateMapEffectFromPower(tokenId, action, overrides);
      }
      if (action.type === "summonTentacles") {
        return summonTentaclesFromPower(tokenId, action);
      }
      return false;
    }

    function isPowerActive(tokenId, powerId) {
      const power = global.AEEncounterPowers?.getPowerById?.(powerId);
      if (!power?.mapAction || !tokenId || !state.encounter?.data) return false;
      const action = power.mapAction;
      if (action.activation !== "toggle") return false;

      if (action.type === "toggleCondition" && action.condition) {
        const instance = getInstanceByTokenId(tokenId);
        const conditions =
          instance?.conditions && typeof instance.conditions === "object"
            ? instance.conditions
            : {};
        return !!conditions[String(action.condition).toLowerCase()];
      }
      if (action.type === "toggleObfuscation") {
        const instance = getInstanceByTokenId(tokenId);
        const effects =
          instance?.effects && typeof instance.effects === "object"
            ? instance.effects
            : {};
        return !!effects.obfuscateActive;
      }
      if (action.type === "createMapEffect" && action.effectType) {
        const token = (state.encounter.data.tokens || []).find(
          (item) => item.id === tokenId,
        );
        const sourceInstanceId = token?.instanceId || null;
        if (!sourceInstanceId) return false;
        const effectId = `${String(action.effectType)}:${sourceInstanceId}`;
        return (state.encounter.data.mapEffects || []).some(
          (effect) => effect?.id === effectId,
        );
      }
      return false;
    }

    function setObfuscationState(tokenId, enabled) {
      if (!state.encounter?.data || !tokenId) return false;
      const instance = getInstanceByTokenId(tokenId);
      if (!instance) return false;

      const conditions =
        instance.conditions && typeof instance.conditions === "object"
          ? { ...instance.conditions }
          : {};
      const effects =
        instance.effects && typeof instance.effects === "object"
          ? { ...instance.effects }
          : {};

      if (enabled) {
        effects.obfuscateActive = true;
        const alreadyHidden = !!conditions.hidden;
        if (!alreadyHidden) {
          conditions.hidden = true;
          effects.obfuscateAppliedHidden = true;
        } else {
          effects.obfuscateAppliedHidden = false;
        }
      } else {
        const appliedHidden = effects.obfuscateAppliedHidden === true;
        delete effects.obfuscateActive;
        delete effects.obfuscateAppliedHidden;
        if (appliedHidden) {
          delete conditions.hidden;
        }
      }

      instance.conditions = conditions;
      instance.effects = effects;
      render();
      if (canEditEncounter()) {
        saveEncounter();
      } else if (typeof persistPlayerInstanceState === "function") {
        persistPlayerInstanceState(instance.id, { conditions, effects }).catch((error) => {
          console.warn("No se pudo persistir estado de Ofuscación:", error?.message || error);
        });
      }
      return true;
    }

    function promptMapEffectDiameter(action) {
      const minDiameter = Math.max(0.1, parseFloat(action?.minDiameterMeters) || 0.5);
      const maxDiameter = Math.max(minDiameter, parseFloat(action?.maxDiameterMeters) || 120);
      const defaultDiameter = Math.min(
        maxDiameter,
        Math.max(minDiameter, parseFloat(action?.defaultDiameterMeters) || 3),
      );
      const raw = global.prompt?.(
        `Diámetro deseado en metros (${minDiameter}-${maxDiameter})`,
        String(defaultDiameter),
      );
      if (raw == null) return null;
      const diameterMeters = parseFloat(String(raw).trim().replace(",", "."));
      if (!Number.isFinite(diameterMeters) || diameterMeters < minDiameter || diameterMeters > maxDiameter) {
        global.alert?.(`Ingresa un número entre ${minDiameter} y ${maxDiameter}.`);
        return null;
      }
      return {
        diameterMeters,
        radiusMeters: diameterMeters / 2,
      };
    }

    function createOrUpdateMapEffectFromPower(tokenId, action, overrides = null) {
      if (!state.encounter?.data || !tokenId || !action?.effectType) return false;
      const token = getTokenById(tokenId);
      if (!token?.instanceId) return false;

      if (!Array.isArray(state.encounter.data.mapEffects)) {
        state.encounter.data.mapEffects = [];
      }
      const mapEffects = state.encounter.data.mapEffects;
      const effectType = String(action.effectType);
      const radiusMeters = Math.max(
        0.5,
        parseFloat(overrides?.radiusMeters) ||
          parseFloat(action.radiusMeters) ||
          0,
      );
      const diameterMeters =
        parseFloat(overrides?.diameterMeters) ||
        parseFloat(action.diameterMeters) ||
        radiusMeters * 2;
      const radiusCells =
        radiusMeters > 0 ? radiusMeters / METERS_PER_UNIT : parseFloat(action.radiusCells) || 0;
      const sourceInstanceId = token.instanceId;
      const sourceTokenId = token.id;
      const effectId = `${effectType}:${sourceInstanceId}`;
      let effectX = null;
      let effectY = null;

      if (effectType === "night_shroud") {
        const spawn = findNearestMapEffectSpawnCell(token);
        if (spawn) {
          effectX = spawn.x + 0.5;
          effectY = spawn.y + 0.5;
        } else {
          effectX = (parseFloat(token.x) || 0) + 0.5;
          effectY = (parseFloat(token.y) || 0) + 0.5;
        }
      }

      const normalizedEffect = {
        id: effectId,
        type: effectType,
        sourceTokenId,
        sourceInstanceId,
        radiusMeters,
        diameterMeters,
        radiusCells,
        x: effectX,
        y: effectY,
        createdAt: Date.now(),
      };

      const idx = mapEffects.findIndex((effect) => effect?.id === effectId);
      if (idx >= 0) {
        mapEffects[idx] = {
          ...mapEffects[idx],
          ...normalizedEffect,
        };
      } else {
        mapEffects.push(normalizedEffect);
      }

      render();
      saveEncounter();
      return true;
    }

    function findNearestMapEffectSpawnCell(casterToken) {
      if (!casterToken) return null;
      const originX = Math.round(parseFloat(casterToken.x) || 0);
      const originY = Math.round(parseFloat(casterToken.y) || 0);
      const occupied = getOccupiedCells();
      const picks = findNearestFreeCellsAround(originX, originY, 1, 1, occupied);
      return picks[0] || null;
    }

    function removeMapEffectFromPower(tokenId, action) {
      if (!state.encounter?.data || !tokenId || !action?.effectType) return false;
      const token = getTokenById(tokenId);
      const sourceInstanceId = token?.instanceId || null;
      if (!sourceInstanceId) return false;
      if (!Array.isArray(state.encounter.data.mapEffects)) return false;

      const effectId = `${String(action.effectType)}:${sourceInstanceId}`;
      const prevLen = state.encounter.data.mapEffects.length;
      state.encounter.data.mapEffects = state.encounter.data.mapEffects.filter(
        (effect) => effect?.id !== effectId,
      );
      if (state.encounter.data.mapEffects.length === prevLen) return false;

      render();
      saveEncounter();
      return true;
    }

    function promptTentaclesCount(action) {
      const minCount = Math.max(1, parseInt(action?.minCount, 10) || 1);
      const maxCount = Math.max(minCount, parseInt(action?.maxCount, 10) || 12);
      const defaultCount = Math.min(
        maxCount,
        Math.max(minCount, parseInt(action?.defaultCount, 10) || 2),
      );
      const raw = global.prompt?.(
        `¿Cuántos tentáculos quieres invocar? (${minCount}-${maxCount})`,
        String(defaultCount),
      );
      if (raw == null) return null;
      const value = parseInt(String(raw).trim(), 10);
      if (!Number.isFinite(value) || value < minCount || value > maxCount) {
        global.alert?.(`Ingresa un número entre ${minCount} y ${maxCount}.`);
        return null;
      }
      return value;
    }

    function resolveControllerUserId(instance) {
      if (!instance) return null;
      if (instance.controllerUserId) return instance.controllerUserId;
      if (!instance.isPC || !instance.characterSheetId) return null;
      const sheet = (state.characterSheets || []).find(
        (item) => item.id === instance.characterSheetId,
      );
      return sheet?.user_id || null;
    }

    function resolveDisciplineLevels(casterInstance) {
      const levels = new Map();
      const setLevel = (id, level) => {
        const discId = Number(id) || 0;
        const discLevel = parseLevel(level);
        if (!discId || discLevel <= 0) return;
        const prev = levels.get(discId) || 0;
        if (discLevel > prev) levels.set(discId, discLevel);
      };

      if (casterInstance?.isPC && casterInstance.characterSheetId) {
        const sheet = (state.characterSheets || []).find(
          (item) => item.id === casterInstance.characterSheetId,
        );
        const disciplines = Array.isArray(sheet?.data?.disciplines)
          ? sheet.data.disciplines
          : [];
        disciplines.forEach((item) => {
          if (!item) return;
          const byId = Number(item.id) || 0;
          if (byId) {
            setLevel(byId, item.level);
            return;
          }
          const alias = normalizeText(item.name || item.customName || "");
          const foundId = DISCIPLINE_ID_BY_ALIAS.get(alias) || 0;
          if (foundId) setLevel(foundId, item.level);
        });
      }

      const candidates = [];
      const stats = casterInstance?.stats && typeof casterInstance.stats === "object"
        ? casterInstance.stats
        : {};
      Object.entries(stats).forEach(([name, value]) => candidates.push({ name, value }));
      const groups = Array.isArray(casterInstance?.groups) ? casterInstance.groups : [];
      groups.forEach((group) => {
        const fields = Array.isArray(group?.fields) ? group.fields : [];
        fields.forEach((field) => {
          candidates.push({ name: field?.name, value: field?.value });
        });
      });

      candidates.forEach(({ name, value }) => {
        const alias = normalizeText(name);
        if (!alias) return;
        const discId = DISCIPLINE_ID_BY_ALIAS.get(alias) || 0;
        if (!discId) return;
        setLevel(discId, value);
      });

      return levels;
    }

    function buildTentacleStats(casterInstance) {
      const disciplineLevels = resolveDisciplineLevels(casterInstance);
      const obtenebracion = disciplineLevels.get(27) || 0;
      const fortaleza = disciplineLevels.get(11) || 0;
      const celeridad = disciplineLevels.get(5) || 0;
      const fuerza = Math.max(1, obtenebracion + fortaleza);
      const destreza = Math.max(1, obtenebracion + celeridad);

      return {
        stats: {
          Fuerza: fuerza,
          Destreza: destreza,
        },
        groups: [
          {
            name: "Atributos",
            fields: [
              { name: "Fuerza", value: fuerza, type: "Físicos" },
              { name: "Destreza", value: destreza, type: "Físicos" },
            ],
          },
        ],
      };
    }

    function getOccupiedCells(ignoreTokenId = null) {
      const occupied = new Set();
      const tokens = state.encounter?.data?.tokens || [];
      tokens.forEach((token) => {
        if (!token || token.id === ignoreTokenId) return;
        const size = Math.max(1, Math.round(parseFloat(token.size) || 1));
        const baseX = Math.round(parseFloat(token.x) || 0);
        const baseY = Math.round(parseFloat(token.y) || 0);
        for (let dx = 0; dx < size; dx += 1) {
          for (let dy = 0; dy < size; dy += 1) {
            occupied.add(`${baseX + dx},${baseY + dy}`);
          }
        }
      });
      return occupied;
    }

    function isAreaFree(occupied, x, y, size) {
      for (let dx = 0; dx < size; dx += 1) {
        for (let dy = 0; dy < size; dy += 1) {
          if (occupied.has(`${x + dx},${y + dy}`)) return false;
        }
      }
      return true;
    }

    function markAreaOccupied(occupied, x, y, size) {
      for (let dx = 0; dx < size; dx += 1) {
        for (let dy = 0; dy < size; dy += 1) {
          occupied.add(`${x + dx},${y + dy}`);
        }
      }
    }

    function findNearestFreeCellsAround(originX, originY, neededCount, tokenSize, occupied) {
      const picks = [];
      const maxRadius = 40;
      for (let radius = 1; radius <= maxRadius && picks.length < neededCount; radius += 1) {
        const ringCandidates = [];
        for (let dy = -radius; dy <= radius; dy += 1) {
          for (let dx = -radius; dx <= radius; dx += 1) {
            if (Math.max(Math.abs(dx), Math.abs(dy)) !== radius) continue;
            ringCandidates.push({
              x: originX + dx,
              y: originY + dy,
              distance: Math.hypot(dx, dy),
            });
          }
        }
        ringCandidates
          .sort((a, b) => a.distance - b.distance)
          .forEach((candidate) => {
            if (picks.length >= neededCount) return;
            if (!isAreaFree(occupied, candidate.x, candidate.y, tokenSize)) return;
            picks.push({ x: candidate.x, y: candidate.y });
            markAreaOccupied(occupied, candidate.x, candidate.y, tokenSize);
          });
      }
      return picks;
    }

    function allocateSummonInitiatives(casterInstanceId, casterInitiative, count) {
      const instances = state.encounter?.data?.instances || [];
      const sorted = [...instances].sort(
        (a, b) => (Number(b.initiative) || 0) - (Number(a.initiative) || 0),
      );
      const casterIndex = sorted.findIndex((instance) => instance.id === casterInstanceId);
      const high = Number.isFinite(Number(casterInitiative))
        ? Number(casterInitiative)
        : Number(sorted[casterIndex]?.initiative) || 0;

      let low = high - 1;
      if (casterIndex >= 0 && casterIndex < sorted.length - 1) {
        const nextVal = Number(sorted[casterIndex + 1]?.initiative);
        if (Number.isFinite(nextVal)) low = nextVal;
      }
      if (!(low < high)) low = high - 1;

      const gap = high - low;
      const minStep = 0.001;
      const step = gap > minStep * (count + 1) ? gap / (count + 1) : 0.01;

      return Array.from({ length: count }, (_, index) => high - step * (index + 1));
    }

    function nextTentacleCodeNumber() {
      const instances = state.encounter?.data?.instances || [];
      let max = 0;
      instances.forEach((instance) => {
        const match = String(instance?.code || "").match(/^T(\d+)$/i);
        if (!match) return;
        const value = parseInt(match[1], 10);
        if (Number.isFinite(value) && value > max) max = value;
      });
      return max + 1;
    }

    function summonTentaclesFromPower(tokenId, action) {
      if (!state.encounter?.data) return false;
      const casterToken = getTokenById(tokenId);
      if (!casterToken?.instanceId) return false;
      const casterInstance = getInstanceByTokenId(tokenId);
      if (!casterInstance) return false;

      const count = promptTentaclesCount(action);
      if (!count) return false;

      const tokenSize = Math.max(1, Math.round(parseFloat(action?.tokenSize) || 1));
      const originX = Math.round(parseFloat(casterToken.x) || 0);
      const originY = Math.round(parseFloat(casterToken.y) || 0);
      const occupied = getOccupiedCells();
      const placements = findNearestFreeCellsAround(
        originX,
        originY,
        count,
        tokenSize,
        occupied,
      );
      while (placements.length < count) {
        placements.push({
          x: originX + placements.length + 1,
          y: originY,
        });
      }

      const initiatives = allocateSummonInitiatives(
        casterInstance.id,
        casterInstance.initiative,
        count,
      );
      const controllerUserId = resolveControllerUserId(casterInstance);
      const imageUrl = String(action?.imageUrl || "images/svgs/tentaculo.svg");
      const tentacleProfile = buildTentacleStats(casterInstance);
      let codeNumber = nextTentacleCodeNumber();

      for (let i = 0; i < count; i += 1) {
        const instanceId = crypto.randomUUID();
        const tokenSummonId = crypto.randomUUID();
        const summonIndex = i + 1;
        state.encounter.data.instances.push({
          id: instanceId,
          templateId: null,
          name: `Tentáculo ${summonIndex}`,
          code: `T${codeNumber}`,
          status: "active",
          initiative: initiatives[i],
          groups: tentacleProfile.groups,
          stats: tentacleProfile.stats,
          notes:
            "El fuego y la luz solar le afectan igual que a los vampiros y absorbe daño contundente " +
            "y letal usando la Resistencia + Fortaleza del vampiro. No puede absorber daño agravado.\n\n" +
            "Los tentáculos pueden apresar enemigos infligiendo un daño letal de Fuerza +1 cada turno. " +
            "Para librarse de su agarre hay que vencer en una tirada enfrentada de Fuerza contra el tentáculo " +
            "(dificultad 6 para ambos). Por el contrario, no se pueden usar para ningún tipo de manipulación, " +
            "como teclear o guiar.",
          health: 4,
          maxHealth: 4,
          isPC: false,
          isSummon: true,
          summonType: "obtenebration_tentacle",
          summonedByInstanceId: casterInstance.id,
          summonedByTokenId: casterToken.id,
          controllerUserId: controllerUserId || null,
        });

        state.encounter.data.tokens.push({
          id: tokenSummonId,
          instanceId,
          x: placements[i].x,
          y: placements[i].y,
          size: tokenSize,
          imgUrl: imageUrl,
          badgeText: String(summonIndex),
        });
        codeNumber += 1;
      }

      render();
      saveEncounter();
      return true;
    }

    return {
      removeTokenById,
      setTokenCondition,
      getAvailablePowers,
      invokePower,
      isPowerActive,
    };
  }

  global.AEEncounterTokenActions = {
    createController,
  };
})(window);
