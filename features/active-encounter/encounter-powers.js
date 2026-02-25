(function initAEEncounterPowersModule(global) {
  const FALLBACK_DISCIPLINE_NAMES_BY_ID = {
    2: ["animalismo", "animalism"],
    3: ["auspex"],
    5: ["celeridad", "celerity"],
    9: ["dominacion", "dominación", "dominate"],
    11: ["fortaleza", "fortitude"],
    24: ["necromancia", "necromancy"],
    27: ["obtenebracion", "obtenebración", "obtenebration"],
    29: ["ofuscacion", "ofuscación", "obfuscate"],
    30: ["potencia", "potence"],
    31: ["presencia", "presence"],
    39: ["taumaturgia", "thaumaturgy"],
    44: ["vuelo", "flight"],
  };

  const MAP_POWERS = [
    {
      id: "power_obfuscation_veil",
      label: "Ofuscación",
      disciplineId: 29,
      disciplineName: "Ofuscación",
      minLevel: 1,
      mapAction: {
        type: "toggleObfuscation",
        activation: "toggle",
      },
    },
    {
      id: "power_obtenebration_night_shroud",
      label: "Manto de la Noche",
      disciplineId: 27,
      disciplineName: "Obtenebración",
      minLevel: 2,
      mapAction: {
        type: "createMapEffect",
        activation: "toggle",
        effectType: "night_shroud",
        promptDiameterMeters: true,
        defaultDiameterMeters: 3,
        minDiameterMeters: 0.5,
        maxDiameterMeters: 120,
      },
    },
    {
      id: "power_obtenebration_tentacles",
      label: "Brazos del Abismo",
      disciplineId: 27,
      disciplineName: "Obtenebración",
      minLevel: 3,
      mapAction: {
        type: "summonTentacles",
        activation: "instant",
        defaultCount: 2,
        minCount: 1,
        maxCount: 12,
        imageUrl: "images/svgs/tentaculo.svg",
      },
    },
    {
      id: "power_quietus_silence_sphere",
      label: "Esfera de Silencio",
      disciplineId: 10,
      disciplineName: "Extinción",
      minLevel: 1,
      mapAction: {
        type: "createMapEffect",
        activation: "toggle",
        effectType: "silence_sphere",
        radiusMeters: 6,
      },
    },
    {
      id: "power_fly",
      label: "Volar",
      disciplineId: 44,
      disciplineName: "Vuelo",
      minLevel: 1,
      mapAction: { type: "toggleCondition", activation: "toggle", condition: "flying" },
    },
  ];

  function normalize(value) {
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

  function getDisciplineAliasesById(id) {
    const aliases = new Set();
    const fallback = FALLBACK_DISCIPLINE_NAMES_BY_ID[id] || [];
    fallback.forEach((name) => aliases.add(normalize(name)));

    const repo = Array.isArray(global.DISCIPLINE_REPO) ? global.DISCIPLINE_REPO : [];
    const entry = repo.find((item) => Number(item.id) === Number(id));
    if (entry) {
      aliases.add(normalize(entry.name_es));
      aliases.add(normalize(entry.name_en));
    }
    return aliases;
  }

  function collectDisciplinesFromCharacterSheet(characterData) {
    const result = [];
    const list = Array.isArray(characterData?.disciplines)
      ? characterData.disciplines
      : [];
    list.forEach((item) => {
      if (!item) return;
      const level = parseLevel(item.level);
      if (level <= 0) return;
      result.push({
        id: Number(item.id) || null,
        level,
        name: item.name || item.customName || "",
      });
    });
    return result;
  }

  function collectDisciplinesFromInstanceStats(instance) {
    const byName = new Map();

    function upsert(name, level, id = null) {
      const key = normalize(name);
      if (!key) return;
      const safeLevel = parseLevel(level);
      if (safeLevel <= 0) return;
      const prev = byName.get(key);
      if (!prev || safeLevel > prev.level) {
        byName.set(key, { id, name: String(name || "").trim(), level: safeLevel });
      }
    }

    const candidates = [];
    const stats = instance?.stats && typeof instance.stats === "object" ? instance.stats : {};
    Object.entries(stats).forEach(([name, value]) => candidates.push({ name, value }));

    const groups = Array.isArray(instance?.groups) ? instance.groups : [];
    groups.forEach((group) => {
      const fields = Array.isArray(group?.fields) ? group.fields : [];
      fields.forEach((field) => {
        candidates.push({ name: field?.name, value: field?.value });
      });
    });

    const repo = Array.isArray(global.DISCIPLINE_REPO) ? global.DISCIPLINE_REPO : [];
    const aliasToId = new Map();
    repo.forEach((entry) => {
      const id = Number(entry?.id) || null;
      if (!id) return;
      const es = normalize(entry.name_es);
      const en = normalize(entry.name_en);
      if (es) aliasToId.set(es, id);
      if (en) aliasToId.set(en, id);
    });
    Object.entries(FALLBACK_DISCIPLINE_NAMES_BY_ID).forEach(([id, aliases]) => {
      aliases.forEach((alias) => aliasToId.set(normalize(alias), Number(id)));
    });

    candidates.forEach(({ name, value }) => {
      const normalizedName = normalize(name);
      if (!normalizedName) return;
      const id = aliasToId.get(normalizedName) || null;
      if (!id) return;
      upsert(name, value, id);
    });

    return [...byName.values()];
  }

  function collectAvailableDisciplines({ tokenId, state }) {
    if (!tokenId || !state?.encounter?.data) return [];
    const token = (state.encounter.data.tokens || []).find((item) => item.id === tokenId);
    if (!token?.instanceId) return [];
    const instance = (state.encounter.data.instances || []).find(
      (item) => item.id === token.instanceId,
    );
    if (!instance) return [];

    const collected = [];
    if (instance.isPC && instance.characterSheetId) {
      const sheet = (state.characterSheets || []).find(
        (item) => item.id === instance.characterSheetId,
      );
      if (sheet?.data) {
        collected.push(...collectDisciplinesFromCharacterSheet(sheet.data));
      }
    }
    collected.push(...collectDisciplinesFromInstanceStats(instance));

    const byKey = new Map();
    collected.forEach((disc) => {
      const idKey = Number(disc.id) > 0 ? `id:${Number(disc.id)}` : "";
      const nameKey = normalize(disc.name);
      const key = idKey || `name:${nameKey}`;
      if (!key) return;
      const prev = byKey.get(key);
      if (!prev || disc.level > prev.level) {
        byKey.set(key, disc);
      }
    });
    return [...byKey.values()];
  }

  function hasDisciplinePowerRequirement(power, availableDisciplines) {
    const requiredId = Number(power.disciplineId) || null;
    const minLevel = parseLevel(power.minLevel);
    const powerDisciplineName = normalize(power.disciplineName);
    const aliases = requiredId ? getDisciplineAliasesById(requiredId) : new Set();
    if (powerDisciplineName) aliases.add(powerDisciplineName);

    return availableDisciplines.some((disc) => {
      if ((parseLevel(disc.level) || 0) < minLevel) return false;
      if (requiredId && Number(disc.id) === requiredId) return true;
      const discName = normalize(disc.name);
      if (!discName) return false;
      return aliases.has(discName);
    });
  }

  function resolveAvailablePowers({ tokenId, state }) {
    const availableDisciplines = collectAvailableDisciplines({ tokenId, state });
    if (!availableDisciplines.length) return [];
    return MAP_POWERS.filter((power) =>
      hasDisciplinePowerRequirement(power, availableDisciplines),
    );
  }

  function getPowerById(powerId) {
    return MAP_POWERS.find((power) => power.id === powerId) || null;
  }

  global.AEEncounterPowers = {
    MAP_POWERS,
    getPowerById,
    resolveAvailablePowers,
  };
})(window);
