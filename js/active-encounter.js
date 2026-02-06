(function () {
  const state = {
    encounterId: null,
    encounter: null,
    templates: [],
    characterSheets: [],
    user: null,
    selectedInstanceId: null,
    browserMode: null, // 'npc' | 'pc'
    browserActiveTags: [],
  };

  const els = {};

  // --- Field mapping: character sheet flat keys → display names ---
  const PC_ATTR_MAP = {
    physical: {
      "fuerza-value": "Fuerza",
      "destreza-value": "Destreza",
      "resistencia-value": "Resistencia",
    },
    social: {
      "carisma-value": "Carisma",
      "manipulacion-value": "Manipulación",
      "apariencia-value": "Apariencia",
    },
    mental: {
      "percepcion-value": "Percepción",
      "inteligencia-value": "Inteligencia",
      "astucia-value": "Astucia",
    },
  };

  const PC_ABILITY_MAP = {
    talents: {
      "alerta-value": "Alerta",
      "atletismo-value": "Atletismo",
      "callejeo-value": "Callejeo",
      "consciencia-value": "Consciencia",
      "empatia-value": "Empatía",
      "expresion-value": "Expresión",
      "intimidacion-value": "Intimidación",
      "liderazgo-value": "Liderazgo",
      "pelea-value": "Pelea",
      "subterfugio-value": "Subterfugio",
    },
    skills: {
      "tratoConAnimales-value": "Trato Animales",
      "conducir-value": "Conducir",
      "etiqueta-value": "Etiqueta",
      "armasDeFuego-value": "A. Fuego",
      "peleaConArmas-value": "Armas C.C.",
      "interpretacion-value": "Interprete",
      "latrocinio-value": "Latrocinio",
      "sigilo-value": "Sigilo",
      "supervivencia-value": "Supervivencia",
      "pericia-value": "Pericia",
    },
    knowledges: {
      "academicismo-value": "Académico",
      "ciencias-value": "Ciencias",
      "finanzas-value": "Finanzas",
      "informatica-value": "Informática",
      "investigacion-value": "Investiga.",
      "leyes-value": "Leyes",
      "medicina-value": "Medicina",
      "ocultismo-value": "Ocultismo",
      "politica-value": "Política",
      "tecnologia-value": "Tecnología",
    },
  };

  async function init() {
    const rawHash = window.location.hash.split("?")[1];
    const params = new URLSearchParams(rawHash);
    state.encounterId = params.get("id");

    if (!state.encounterId) {
      alert("No se especificó un encuentro ID.");
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (session) state.user = session.user;

    // DOM Elements
    els.name = document.getElementById("ae-encounter-name");
    els.status = document.getElementById("ae-encounter-status");
    els.timeline = document.getElementById("ae-timeline-container");
    els.roundCounter = document.getElementById("ae-round-counter");

    // Browser Modal Els
    els.browserModal = document.getElementById("ae-browser-modal");
    els.browserTitle = document.getElementById("ae-browser-title");
    els.browserSearch = document.getElementById("ae-browser-search");
    els.browserTags = document.getElementById("ae-browser-tags");
    els.browserGrid = document.getElementById("ae-browser-grid");

    // Detail Modal Els
    els.modal = document.getElementById("ae-modal");

    els.modalStats = document.getElementById("ae-modal-stats");
    els.modalTitle = document.getElementById("ae-modal-title");
    els.modalHpFill = document.getElementById("ae-modal-hp-fill");
    els.modalHpText = document.getElementById("ae-modal-hp-text");
    els.modalNotes = document.getElementById("ae-modal-notes");

    setupListeners();
    setupRealtimeSubscription();

    await Promise.all([loadTemplates(), loadCharacterSheets()]);
    await loadEncounterData();

    // Init Map
    state.map = new TacticalMap("ae-map-canvas", "ae-map-container");
    state.map.setData(
      state.encounter?.data?.tokens,
      state.encounter?.data?.instances,
    );
    state.map.onTokenMove = (id, x, y) => {
      const t = state.encounter.data.tokens.find((tk) => tk.id === id);
      if (t) {
        t.x = x;
        t.y = y;
        saveEncounter();
      }
    };

    setupMapControls();
  }

  function setupMapControls() {
    document
      .getElementById("btn-map-zoom-in")
      ?.addEventListener("click", () => {
        if (state.map) {
          state.map.scale = Math.min(5, state.map.scale + 0.2);
          state.map.draw();
        }
      });
    document
      .getElementById("btn-map-zoom-out")
      ?.addEventListener("click", () => {
        if (state.map) {
          state.map.scale = Math.max(0.1, state.map.scale - 0.2);
          state.map.draw();
        }
      });
    document.getElementById("btn-map-reset")?.addEventListener("click", () => {
      if (state.map) {
        state.map.offsetX = 0;
        state.map.offsetY = 0;
        state.map.scale = 1.0;
        state.map.draw();
      }
    });
  }

  function setupRealtimeSubscription() {
    supabase
      .channel("character-sheets-changes")
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "character_sheets",
        },
        (payload) => {
          const updatedSheet = payload.new;

          // Update characterSheets cache
          const sheetIdx = state.characterSheets.findIndex(
            (s) => s.id === updatedSheet.id,
          );
          if (sheetIdx !== -1) {
            state.characterSheets[sheetIdx] = updatedSheet;
          } else {
            state.characterSheets.push(updatedSheet);
          }

          const d = state.encounter?.data;
          if (d && d.instances) {
            const inst = d.instances.find(
              (i) => i.characterSheetId === updatedSheet.id,
            );
            if (inst) {
              inst.pcHealth = extractPCHealth(updatedSheet.data);
              render();

              // If modal is open for this instance, refresh it
              if (
                state.selectedInstanceId === inst.id &&
                els.modal.style.display !== "none"
              ) {
                openModal(inst);
              }
            }
          }
        },
      )
      .subscribe();
  }

  function extractPCHealth(charData) {
    if (!charData) return [0, 0, 0, 0, 0, 0, 0];
    const healthKeys = [
      "magullado-value",
      "lastimado-value",
      "lesionado-value",
      "herido-value",
      "malherido-value",
      "tullido-value",
      "incapacitado-value",
    ];
    return healthKeys.map((key) => parseInt(charData[key]) || 0);
  }

  function setupListeners() {
    document.getElementById("btn-ae-back").addEventListener("click", () => {
      window.location.hash = "combat-tracker";
    });

    document
      .getElementById("btn-ae-save")
      .addEventListener("click", saveEncounter);
    document
      .getElementById("btn-ae-browse-npc")
      .addEventListener("click", () => openBrowser("npc"));
    document
      .getElementById("btn-ae-browse-pc")
      .addEventListener("click", () => openBrowser("pc"));
    document
      .getElementById("btn-ae-next-turn")
      .addEventListener("click", nextTurn);
    document.getElementById("btn-ae-reroll").addEventListener("click", () => {
      if (
        confirm(
          "¿Resetear iniciativa? Esto reiniciará la ronda y mezclará el orden.",
        )
      ) {
        rerollAllInitiatives();
      }
    });

    document
      .getElementById("btn-ae-archive")
      .addEventListener("click", async () => {
        if (
          confirm(
            `¿Archivar "${state.encounter?.name || "este encuentro"}"? No aparecerá en la lista de encuentros activos.`,
          )
        ) {
          const { error } = await supabase
            .from("encounters")
            .update({ status: "archived" })
            .eq("id", state.encounterId);
          if (!error) window.location.hash = "combat-tracker";
        }
      });

    // Drawer Toggles
    const drawer = document.getElementById("ae-tools-drawer");
    const toggleBtn = document.getElementById("btn-ae-toggle-tools");
    const closeDrawerBtn = document.getElementById("btn-ae-close-tools");

    if (toggleBtn && drawer) {
      toggleBtn.addEventListener("click", () => {
        drawer.classList.add("open");
      });
    }

    if (closeDrawerBtn && drawer) {
      closeDrawerBtn.addEventListener("click", () => {
        drawer.classList.remove("open");
      });
    }

    // Browser Modal Listeners
    document
      .getElementById("btn-ae-browser-close")
      .addEventListener("click", closeBrowser);
    els.browserSearch.addEventListener("input", () => {
      renderBrowserItems();
    });

    // Detail Modal Listeners
    document
      .getElementById("btn-ae-modal-close")
      .addEventListener("click", closeModal);
    document
      .getElementById("btn-modal-dmg")
      .addEventListener("click", () => handleModalAction("dmg"));
    document
      .getElementById("btn-modal-heal")
      .addEventListener("click", () => handleModalAction("heal"));
  }

  // --- DATA LOADING ---

  async function loadTemplates() {
    const { data } = await supabase
      .from("templates")
      .select("*")
      .eq("type", "npc")
      .order("name");
    if (data) {
      state.templates = data;
    }
  }

  async function loadCharacterSheets() {
    const { data } = await supabase
      .from("character_sheets")
      .select("id, name, data, avatar_url")
      .order("name");
    if (data) {
      state.characterSheets = data;
    }
  }

  async function loadEncounterData() {
    const { data, error } = await supabase
      .from("encounters")
      .select("*")
      .eq("id", state.encounterId)
      .single();
    if (error || !data) {
      alert("Error cargando encuentro: " + (error?.message || "No encontrado"));
      return;
    }
    state.encounter = data;

    // Data migration & Health Init
    if (Array.isArray(state.encounter.data)) {
      state.encounter.data = {
        instances: state.encounter.data,
        round: 1,
        activeInstanceId: null,
      };
    } else if (!state.encounter.data) {
      state.encounter.data = {
        instances: [],
        tokens: [],
        round: 1,
        activeInstanceId: null,
      };
    }

    // Ensure tokens array exists
    if (!state.encounter.data.tokens) {
      state.encounter.data.tokens = [];
    }

    // Sync PC data from character sheets on load
    state.encounter.data.instances.forEach((inst) => {
      if (inst.isPC) {
        const sheet = state.characterSheets.find(
          (s) => s.id === inst.characterSheetId,
        );
        if (sheet) {
          inst.pcHealth = extractPCHealth(sheet.data);
          inst.avatarUrl = sheet.avatar_url || inst.avatarUrl;
        }
      }
    });

    ensureActiveInstance();
    render();
  }

  function ensureActiveInstance() {
    const d = state.encounter.data;
    if (!d.activeInstanceId && d.instances && d.instances.length > 0) {
      const sorted = [...d.instances].sort(
        (a, b) => (b.initiative || 0) - (a.initiative || 0),
      );
      d.activeInstanceId = sorted[0].id;
    }
  }

  // --- RENDER ---

  function render() {
    if (!state.encounter) return;

    els.name.textContent = state.encounter.name;
    els.status.textContent = state.encounter.status;
    els.roundCounter.textContent = state.encounter.data.round || 1;

    // Refresh Map Data
    if (state.map) {
      state.map.setData(
        state.encounter.data.tokens,
        state.encounter.data.instances,
      );
      state.map.setActiveInstance(state.encounter.data.activeInstanceId);
    }

    const instances = state.encounter.data.instances || [];
    const activeId = state.encounter.data.activeInstanceId;

    els.timeline.innerHTML = "";

    const sorted = [...instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0),
    );

    if (sorted.length === 0) {
      els.timeline.innerHTML =
        "<p style='text-align:center; color:#666'>Sin participantes. Agrega PNJs o PJs desde el panel lateral.</p>";
      return;
    }

    sorted.forEach((inst) => {
      const row = document.createElement("div");
      row.className = "ae-timeline-row";

      const isActive = activeId && inst.id === activeId;
      const isDead = inst.status === "dead" || inst.health <= 0;
      const isPC = inst.isPC === true;

      const hpPct = (inst.health / inst.maxHealth) * 100;
      const hpClass = getHealthClass(inst.health, inst.maxHealth, inst.status);

      const pcClass = isPC ? "pc" : "";
      const activeClass = isActive ? "active" : "";
      const deadClass = isDead ? "dead" : "";

      let healthHTML = "";
      if (isPC && inst.pcHealth) {
        const healthLevelNames = [
          "Magullado",
          "Lastimado",
          "Lesionado",
          "Herido",
          "Malherido",
          "Tullido",
          "Incapacitado",
        ];
        const movementPenalties = [
          "Sin penalización.",
          "Sin penalización.",
          "Velocidad al correr se divide a la mitad.",
          "No puede correr. Solo puede moverse o atacar.",
          "Solo puede cojear (3 metros por turno).",
          "Solo puede arrastrarse (1 metro por turno).",
          "Incapaz de moverse.",
        ];

        // Find the most severe level that has damage
        let currentLevelIndex = -1;
        for (let i = 0; i < inst.pcHealth.length; i++) {
          if (inst.pcHealth[i] > 0) {
            currentLevelIndex = i;
          }
        }

        let tooltip = "Salud: Sin daño";
        if (currentLevelIndex !== -1) {
          tooltip = `${healthLevelNames[currentLevelIndex]}: ${movementPenalties[currentLevelIndex]}`;
        }

        const types = ["", "contundente", "letal", "agravado"];
        const boxes = inst.pcHealth
          .map(
            (val) => `<span class="ae-health-sq ${types[val] || ""}"></span>`,
          )
          .join("");
        healthHTML = `<div class="ae-pc-health-row" title="${tooltip}">${boxes}</div>`;
      } else {
        healthHTML = `
          <div class="ae-card-hp-bar">
            <div class="ae-card-hp-fill ${hpClass}" style="width: ${hpPct}%"></div>
          </div>
        `;
      }

      row.innerHTML = `
        <div class="ae-init-bubble">
          <input type="number" class="init-input ae-bubble-input" value="${inst.initiative || 0}">
        </div>

        <div class="ae-card ${activeClass} ${deadClass} ${pcClass}" data-id="${inst.id}">
          <button class="ae-btn-delete" title="Eliminar">&times;</button>
          <div class="ae-card-header">
            <div class="ae-card-title">
              <span class="ae-card-name" title="${inst.name}">${inst.name}</span>
              <span class="ae-card-code">| ${inst.code}</span>
            </div>
          </div>

          ${healthHTML}
        </div>
      `;

      // Initiative change
      const inputInit = row.querySelector(".init-input");
      inputInit.addEventListener("change", (e) =>
        updateInitiative(inst.id, e.target.value),
      );

      // Card click -> Open Modal
      row.querySelector(".ae-card").addEventListener("click", (e) => {
        // Don't open modal if clicking delete or kill buttons
        if (
          e.target.closest(".ae-btn-delete") ||
          e.target.closest(".ae-btn-kill")
        )
          return;
        openModal(inst);
      });

      // Delete button
      row.querySelector(".ae-btn-delete").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`¿Eliminar ${inst.name} (${inst.code})?`)) {
          removeInstance(inst.id);
        }
      });

      els.timeline.appendChild(row);
    });

    // Auto-scroll to active card
    requestAnimationFrame(() => {
      const activeCard = els.timeline.querySelector(".ae-card.active");
      if (activeCard) {
        activeCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    });
  }

  // --- ADD NPC ---

  async function addNPC(tplId, count) {
    if (!tplId) return;
    count = count || 1;

    const tpl = state.templates.find((t) => t.id === tplId);
    if (!tpl) return;

    const d = state.encounter.data;
    const instances = d.instances;
    const tplData = tpl.data;

    // Deep clone groups for each instance
    const baseLetter = tpl.name[0].toUpperCase();
    let maxNum = findMaxCode(instances, baseLetter);

    for (let i = 0; i < count; i++) {
      maxNum++;
      const groups = JSON.parse(JSON.stringify(tplData.groups || []));

      // Build flat stats for easy lookup
      const stats = {};
      groups.forEach((g) => {
        g.fields.forEach((f) => {
          stats[f.name] = f.value;
        });
      });

      const initVal = calculateInitiative({ groups, stats });

      const instanceId = crypto.randomUUID();

      instances.push({
        id: instanceId,
        templateId: tpl.id,
        name: tpl.name,
        code: `${baseLetter}${maxNum}`,
        status: "active",
        initiative: initVal,
        groups: groups,
        stats: stats,
        notes: tplData.notes || "",
        health: tplData.maxHealth || 7,
        maxHealth: tplData.maxHealth || 7,
        isPC: false,
      });

      // Auto-create token if requested (or default behavior)
      // For now we assume yes if adding to map, or maybe we add a checkbox later?
      // Let's check a fictional "addToken" global state or argument for now, or just ALWAYS add it to 0,0

      // Check checkbox from browser
      const addToken = document.getElementById("ae-add-token-check")?.checked;

      if (addToken) {
        state.encounter.data.tokens.push({
          id: crypto.randomUUID(),
          instanceId: instanceId,
          x: Math.round(-state.map.offsetX / state.map.scale / 50) + 2, // Spawn near center view
          y: Math.round(-state.map.offsetY / state.map.scale / 50) + 2,
          size: 1,
          imgUrl: tpl.driver?.avatarUrl || tpl.data?.avatarUrl || null,
        });
      }
    }

    ensureActiveInstance();
    render();
    saveEncounter();
  }

  // --- ADD PC from Character Sheet ---

  async function addPC(sheetId) {
    if (!sheetId) return;

    const sheet = state.characterSheets.find((s) => s.id === sheetId);
    if (!sheet || !sheet.data) return;

    const d = state.encounter.data;
    const instances = d.instances;

    // Check if this PC is already in the encounter
    const alreadyAdded = instances.find(
      (i) => i.isPC && i.characterSheetId === sheetId,
    );
    if (alreadyAdded) {
      alert(`${sheet.name} ya está en este encuentro.`);
      return;
    }

    const charData = sheet.data;
    const pcName =
      charData.nombre || charData.name || sheet.name || "PJ Sin Nombre";

    // Build groups structure from flat character data
    const groups = buildPCGroups(charData);
    const stats = {};
    groups.forEach((g) => {
      g.fields.forEach((f) => {
        stats[f.name] = f.value;
      });
    });

    // Generate code
    const baseLetter = pcName[0].toUpperCase();
    const maxNum = findMaxCode(instances, baseLetter) + 1;

    const initVal = calculateInitiative({ groups, stats });

    // Get max health from character sheet or default to 7
    const maxHealth = 7;

    const instanceId = crypto.randomUUID();

    instances.push({
      id: instanceId,
      characterSheetId: sheetId,
      templateId: null,
      name: pcName,
      code: `${baseLetter}${maxNum}`,
      status: "active",
      initiative: initVal,
      groups: groups,
      stats: stats,
      notes: charData.clan ? `Clan: ${charData.clan}` : "",
      health: maxHealth,
      maxHealth: maxHealth,
      pcHealth: extractPCHealth(charData),
      isPC: true,
      avatarUrl: sheet.avatar_url || null,
    });

    // Check checkbox
    const addToken = document.getElementById("ae-add-token-check")?.checked;

    if (addToken) {
      state.encounter.data.tokens.push({
        id: crypto.randomUUID(),
        instanceId: instanceId,
        x: Math.round(-state.map.offsetX / state.map.scale / 50) + 3,
        y: Math.round(-state.map.offsetY / state.map.scale / 50) + 3,
        size: 1,
        imgUrl: sheet.avatar_url || null,
      });
    }

    ensureActiveInstance();
    render();
    saveEncounter();
  }

  function buildPCGroups(charData) {
    // Build Atributos
    const attrFields = Object.entries(PC_FIELD_MAP).map(([key, name]) => {
      const def = window.TEMPLATE_DEFINITIONS.npc.groups[0].fields.find(
        (f) => f.name === name,
      );
      return {
        name: name,
        value: parseInt(charData[key]) || 1,
        type: def ? def.type : "Físicos",
      };
    });

    // Build Habilidades
    const skillFields = Object.entries(PC_SKILL_MAP).map(([key, name]) => {
      const def = window.TEMPLATE_DEFINITIONS.npc.groups[1].fields.find(
        (f) => f.name === name,
      );
      return {
        name: name,
        value: parseInt(charData[key]) || 0,
        type: def ? def.type : "Talentos",
      };
    });

    // Build Otros
    const otherFields = [
      {
        name: "Salud máxima",
        value: 7,
        type: "Rasgos",
      },
      {
        name: "Fuerza de Voluntad",
        value: parseInt(charData["voluntadPerm-value"]) || 5,
        type: "Rasgos",
      },
    ];

    return [
      { name: "Atributos", fields: attrFields },
      { name: "Habilidades", fields: skillFields },
      { name: "Otros", fields: otherFields },
    ];
  }

  // --- INSTANCE MANAGEMENT ---

  function removeInstance(id) {
    const d = state.encounter.data;
    d.instances = d.instances.filter((i) => i.id !== id);

    if (d.activeInstanceId === id) {
      d.activeInstanceId = null;
      ensureActiveInstance();
    }

    // Close modal if viewing deleted instance
    if (state.selectedInstanceId === id) {
      closeModal();
    }

    render();
    saveEncounter();
  }

  function updateInitiative(id, val) {
    const inst = state.encounter.data.instances.find((i) => i.id === id);
    if (inst) {
      inst.initiative = parseInt(val) || 0;
      render();
      saveEncounter();
    }
  }

  function rerollAllInitiatives() {
    const d = state.encounter.data;
    if (!d.instances || d.instances.length === 0) return;

    d.instances.forEach((inst) => {
      inst.initiative = calculateInitiative({
        groups: inst.groups,
        stats: inst.stats,
      });
    });

    // Reset active to highest initiative
    const sorted = [...d.instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0),
    );
    d.activeInstanceId = sorted[0].id;
    d.round = 1;

    render();
    saveEncounter();
  }

  // --- TURN MANAGEMENT ---

  function nextTurn() {
    const d = state.encounter.data;
    if (!d.instances || d.instances.length === 0) return;

    const sorted = [...d.instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0),
    );

    const currId = d.activeInstanceId;
    let idx = -1;
    if (currId) idx = sorted.findIndex((i) => i.id === currId);

    idx++;
    if (idx >= sorted.length) {
      idx = 0;
      d.round = (d.round || 1) + 1;
    }

    d.activeInstanceId = sorted[idx].id;
    render();
    saveEncounter();
  }

  // --- HEALTH & COMBAT ---

  function handleModalAction(type) {
    if (!state.selectedInstanceId) return;
    handleAction(state.selectedInstanceId, type);
  }

  function handleAction(id, type) {
    const inst = state.encounter.data.instances.find((i) => i.id === id);
    if (!inst) return;

    if (type === "dmg") {
      const amount =
        parseInt(document.getElementById("ae-damage-amount")?.value) || 1;
      inst.health = Math.max(0, inst.health - amount);
    } else if (type === "heal") {
      const amount =
        parseInt(document.getElementById("ae-heal-amount")?.value) || 1;
      inst.health = Math.min(inst.maxHealth, inst.health + amount);
    }

    if (inst.health === 0 && inst.status !== "dead")
      inst.status = "incapacitated";
    else if (inst.health > 0 && inst.status === "incapacitated")
      inst.status = "active";

    render();
    if (state.selectedInstanceId === id) updateModalUI(inst);
    saveEncounter();
  }

  // --- ENTITY BROWSER ---

  function openBrowser(mode) {
    state.browserMode = mode;
    state.browserActiveTags = [];
    els.browserSearch.value = "";

    if (mode === "npc") {
      els.browserTitle.textContent = "Agregar PNJ";
    } else {
      els.browserTitle.textContent = "Agregar PJ";
    }

    renderBrowserTags();
    renderBrowserItems();
    els.browserModal.style.display = "flex";

    // Close drawer
    const drawer = document.getElementById("ae-tools-drawer");
    if (drawer) drawer.classList.remove("open");

    // Focus search
    setTimeout(() => els.browserSearch.focus(), 100);
  }

  function closeBrowser() {
    els.browserModal.style.display = "none";
    state.browserMode = null;
    state.browserActiveTags = [];
  }

  function collectAllTags() {
    const tags = new Set();
    state.templates.forEach((t) => {
      const tplTags = t.data?.tags || [];
      tplTags.forEach((tag) => tags.add(tag));
    });
    return [...tags].sort();
  }

  function renderBrowserTags() {
    if (state.browserMode !== "npc") {
      els.browserTags.innerHTML = "";
      return;
    }

    const allTags = collectAllTags();
    if (allTags.length === 0) {
      els.browserTags.innerHTML = "";
      return;
    }

    els.browserTags.innerHTML = allTags
      .map((tag) => {
        const isActive = state.browserActiveTags.includes(tag);
        return `<span class="ae-browser-tag${isActive ? " active" : ""}" data-tag="${tag}">${tag}</span>`;
      })
      .join("");

    els.browserTags.querySelectorAll(".ae-browser-tag").forEach((el) => {
      el.addEventListener("click", () => {
        const tag = el.dataset.tag;
        const idx = state.browserActiveTags.indexOf(tag);
        if (idx === -1) {
          state.browserActiveTags.push(tag);
        } else {
          state.browserActiveTags.splice(idx, 1);
        }
        renderBrowserTags();
        renderBrowserItems();
      });
    });
  }

  function renderBrowserItems() {
    const mode = state.browserMode;
    const search = (els.browserSearch.value || "").toLowerCase().trim();
    const activeTags = state.browserActiveTags;

    if (mode === "npc") {
      renderNPCBrowser(search, activeTags);
    } else {
      renderPCBrowser(search);
    }
  }

  function renderNPCBrowser(search, activeTags) {
    let items = state.templates;

    if (search) {
      items = items.filter((t) => t.name.toLowerCase().includes(search));
    }

    if (activeTags.length > 0) {
      items = items.filter((t) => {
        const tplTags = t.data?.tags || [];
        return activeTags.every((tag) => tplTags.includes(tag));
      });
    }

    if (items.length === 0) {
      els.browserGrid.innerHTML =
        '<div class="ae-browser-empty">No se encontraron plantillas</div>';
      return;
    }

    els.browserGrid.innerHTML = items
      .map((t) => {
        const hp = t.data?.maxHealth || 7;
        const stats = {};
        (t.data?.groups || []).forEach((g) => {
          g.fields.forEach((f) => {
            stats[f.name] = f.value;
          });
        });
        const fue = stats["Fuerza"] || 0;
        const des = stats["Destreza"] || 0;
        const pel = stats["Pelea"] || 0;

        const tags = (t.data?.tags || [])
          .map((tag) => `<span class="ae-browser-card-tag">${tag}</span>`)
          .join("");

        const initial = t.name[0].toUpperCase();

        return `
          <div class="ae-browser-card" data-id="${t.id}">
            <div class="ae-browser-card-top">
              <div class="ae-browser-card-avatar">${initial}</div>
              <div class="ae-browser-card-info">
                <div class="ae-browser-card-name">${t.name}</div>
                <div class="ae-browser-card-meta">
                  <span>HP ${hp}</span>
                  <span>F${fue} D${des} P${pel}</span>
                </div>
              </div>
            </div>
            ${tags ? `<div class="ae-browser-card-tags">${tags}</div>` : ""}
            <div class="ae-browser-card-actions">
              <input type="number" class="ae-browser-qty" value="1" min="1" max="20"
                onclick="event.stopPropagation()">
              <button class="ae-browser-add-btn" data-tpl-id="${t.id}">Agregar</button>
            </div>
          </div>
        `;
      })
      .join("");

    // Bind add buttons
    els.browserGrid.querySelectorAll(".ae-browser-add-btn").forEach((btn) => {
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        const tplId = btn.dataset.tplId;
        const qtyInput = btn
          .closest(".ae-browser-card")
          .querySelector(".ae-browser-qty");
        const count = parseInt(qtyInput?.value) || 1;
        addNPC(tplId, count);
        closeBrowser();
      });
    });

    // Stop qty input clicks from bubbling
    els.browserGrid.querySelectorAll(".ae-browser-qty").forEach((input) => {
      input.addEventListener("click", (e) => e.stopPropagation());
    });
  }

  function renderPCBrowser(search) {
    let items = state.characterSheets;

    if (search) {
      items = items.filter((s) => {
        const name = (s.name || "").toLowerCase();
        const clan = (s.data?.clan || "").toLowerCase();
        return name.includes(search) || clan.includes(search);
      });
    }

    const existingPCIds = (state.encounter?.data?.instances || [])
      .filter((i) => i.isPC)
      .map((i) => i.characterSheetId);

    if (items.length === 0) {
      els.browserGrid.innerHTML =
        '<div class="ae-browser-empty">No se encontraron personajes</div>';
      return;
    }

    els.browserGrid.innerHTML = items
      .map((s) => {
        const name = s.name || "Sin nombre";
        const clan = s.data?.clan || "";
        const isAdded = existingPCIds.includes(s.id);
        const initial = name[0].toUpperCase();
        const avatarHTML = s.avatar_url
          ? `<img src="${s.avatar_url}" alt="${name}">`
          : initial;

        return `
          <div class="ae-browser-card${isAdded ? " disabled" : ""}" data-sheet-id="${s.id}">
            <div class="ae-browser-card-top">
              <div class="ae-browser-card-avatar">${avatarHTML}</div>
              <div class="ae-browser-card-info">
                <div class="ae-browser-card-name">${name}</div>
                <div class="ae-browser-card-meta">
                  ${clan ? `<span>${clan}</span>` : ""}
                </div>
              </div>
            </div>
            ${isAdded ? '<span class="ae-browser-added-badge">Ya en encuentro</span>' : ""}
          </div>
        `;
      })
      .join("");

    // Bind card clicks for PCs (not disabled ones)
    els.browserGrid
      .querySelectorAll(".ae-browser-card:not(.disabled)")
      .forEach((card) => {
        card.addEventListener("click", () => {
          const sheetId = card.dataset.sheetId;
          addPC(sheetId);
          closeBrowser();
        });
      });
  }

  // --- MODAL ---

  function openModal(inst) {
    if (window.AE_Picker) window.AE_Picker.init();

    if (inst.isPC) {
      renderPCModal(inst);
    } else {
      renderNPCModal(inst);
    }

    updateModalUI(inst);
    els.modal.style.display = "flex";
  }

  function renderNPCModal(inst) {
    state.selectedInstanceId = inst.id;
    els.modalTitle.innerHTML = "";
    const nameSpan = document.createElement("span");
    nameSpan.className = "ae-title-name";
    nameSpan.textContent = inst.name;
    nameSpan.style.cursor = "pointer";
    nameSpan.title = "Click para editar nombre";

    const codeSpan = document.createElement("span");
    codeSpan.className = "ae-title-code";
    codeSpan.textContent = ` | ${inst.code}`;

    els.modalTitle.appendChild(nameSpan);
    els.modalTitle.appendChild(codeSpan);

    nameSpan.addEventListener("click", () => {
      const input = document.createElement("input");
      input.type = "text";
      input.value = inst.name;
      input.className = "ae-input";
      input.style.fontSize = "1.5rem";
      input.style.width = "auto";
      input.style.minWidth = "200px";
      input.style.color = "var(--color-red-accent)";
      input.style.background = "#111";
      input.style.border = "1px solid #444";
      input.style.display = "inline-block";

      const saveName = () => {
        const newName = input.value.trim();
        if (newName && newName !== inst.name) {
          inst.name = newName;
          nameSpan.textContent = newName;
          render(); // Updates timeline
          saveEncounter();
        }
        if (els.modalTitle.contains(input)) {
          els.modalTitle.replaceChild(nameSpan, input);
        }
      };

      input.addEventListener("blur", saveName);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
          input.blur();
        } else if (e.key === "Escape") {
          if (els.modalTitle.contains(input)) {
            els.modalTitle.replaceChild(nameSpan, input);
          }
        }
      });

      els.modalTitle.replaceChild(input, nameSpan);
      input.focus();
    });

    // Show health controls for NPCs
    const healthControls = els.modal.querySelector(".ae-health-section");
    if (healthControls) healthControls.style.display = "block";

    // Show Notes for NPCs
    if (els.modalNotes) {
      els.modalNotes.style.display = "block";
      els.modalNotes.textContent =
        inst.notes || inst.data?.notes || "Sin notas.";
    }
    els.modalStats.innerHTML = "";
    els.modalStats.className = "";

    if (els.modalNotes)
      els.modalNotes.textContent =
        inst.notes || inst.data?.notes || "Sin notas.";

    const groups = inst.groups
      ? inst.groups
      : window.TEMPLATE_DEFINITIONS.npc.groups;

    groups.forEach((group, gIdx) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "ae-group-fieldset";

      const legend = document.createElement("legend");
      legend.textContent = group.name;
      fieldset.appendChild(legend);

      const grid = document.createElement("div");
      grid.className = "ae-stat-grid-3col";

      const byType = {};
      group.fields.forEach((f) => {
        if (!byType[f.type]) byType[f.type] = [];
        byType[f.type].push(f);
      });

      Object.entries(byType).forEach(([typeName, fields]) => {
        const col = document.createElement("div");
        col.className = "ae-stat-col";

        const subTitle = document.createElement("h4");
        subTitle.textContent = typeName;
        col.appendChild(subTitle);

        fields.forEach((f) => {
          let val = f.value;
          if (!inst.groups && inst.stats && inst.stats[f.name] !== undefined) {
            val = inst.stats[f.name];
          }

          const row = document.createElement("div");
          row.className = "ae-stat-row";

          const labelSpan = document.createElement("span");
          labelSpan.className = "stat-label";
          labelSpan.textContent = f.name;

          const valSpan = document.createElement("span");
          valSpan.className = "stat-val editable-stat";
          valSpan.textContent = val;
          valSpan.dataset.statName = f.name;

          valSpan.addEventListener("click", (e) => {
            e.stopPropagation();
            const currentInt = parseInt(valSpan.textContent) || 0;
            if (window.AE_Picker) {
              window.AE_Picker.open(valSpan, currentInt, (newVal) => {
                valSpan.textContent = newVal;

                if (inst.groups) {
                  const g = inst.groups.find((gr) => gr.name === group.name);
                  if (g) {
                    const field = g.fields.find((fi) => fi.name === f.name);
                    if (field) field.value = newVal;
                  }
                }

                if (!inst.stats) inst.stats = {};
                inst.stats[f.name] = newVal;

                if (f.name === "Salud máxima") {
                  inst.maxHealth = newVal;
                  if (inst.health > inst.maxHealth)
                    inst.health = inst.maxHealth;
                  updateModalUI(inst);
                  render();
                }

                saveEncounter();
              });
            }
          });

          row.appendChild(labelSpan);
          row.appendChild(valSpan);
          col.appendChild(row);
        });
        grid.appendChild(col);
      });

      fieldset.appendChild(grid);
      els.modalStats.appendChild(fieldset);
    });
  }

  function renderPCModal(inst) {
    state.selectedInstanceId = inst.id;
    const sheet = state.characterSheets.find(
      (s) => s.id === inst.characterSheetId,
    );
    if (!sheet) {
      els.modalStats.innerHTML = "<p>No se encontró la hoja de personaje.</p>";
      return;
    }

    const charData = sheet.data || {};
    const clanName = charData.clan ? `, del Clan ${charData.clan}` : "";
    els.modalTitle.innerHTML = `<span class="ae-title-name">${inst.name}${clanName}</span> <span class="ae-pc-badge">PJ</span>`;

    // Hide NPC health controls, we'll draw our own
    const healthControls = els.modal.querySelector(".ae-health-section");
    if (healthControls) healthControls.style.display = "none";

    els.modalStats.innerHTML = "";
    els.modalStats.className = "ae-pc-readonly-view";

    // Attributes
    const attrFieldset = document.createElement("fieldset");
    attrFieldset.className = "ae-group-fieldset";
    attrFieldset.innerHTML = "<legend>Atributos</legend>";
    const attrGrid = document.createElement("div");
    attrGrid.className = "ae-stat-grid-3col";

    const categories = [
      { name: "Físicos", map: PC_ATTR_MAP.physical, temp: true },
      { name: "Sociales", map: PC_ATTR_MAP.social },
      { name: "Mentales", map: PC_ATTR_MAP.mental },
    ];

    categories.forEach((cat) => {
      const col = document.createElement("div");
      col.className = "ae-stat-col";
      col.innerHTML = `<h4>${cat.name}</h4>`;

      Object.entries(cat.map).forEach(([id, name]) => {
        let val = parseInt(charData[id]) || 0;
        let tempHtml = "";
        if (cat.temp) {
          const tempId =
            "temp" +
            id.split("-")[0].charAt(0).toUpperCase() +
            id.split("-")[0].slice(1);
          const tempVal = parseInt(charData[tempId]) || 0;
          if (tempVal > 0) {
            tempHtml = `<span class="ae-stat-temp">+${tempVal}</span>`;
          }
        }
        col.innerHTML += `
          <div class="ae-stat-row">
            <span class="stat-label">${name}</span>
            <span class="stat-val">${val}${tempHtml}</span>
          </div>`;
      });
      attrGrid.appendChild(col);
    });
    attrFieldset.appendChild(attrGrid);
    els.modalStats.appendChild(attrFieldset);

    // Abilities
    const abilFieldset = document.createElement("fieldset");
    abilFieldset.className = "ae-group-fieldset";
    abilFieldset.innerHTML = "<legend>Habilidades</legend>";
    const abilGrid = document.createElement("div");
    abilGrid.className = "ae-stat-grid-3col";

    const abilCats = [
      { name: "Talentos", map: PC_ABILITY_MAP.talents },
      { name: "Técnicas", map: PC_ABILITY_MAP.skills },
      { name: "Conocimientos", map: PC_ABILITY_MAP.knowledges },
    ];

    abilCats.forEach((cat) => {
      const col = document.createElement("div");
      col.className = "ae-stat-col";
      col.innerHTML = `<h4>${cat.name}</h4>`;

      Object.entries(cat.map).forEach(([id, name]) => {
        let val = parseInt(charData[id]) || 0;
        col.innerHTML += `
          <div class="ae-stat-row">
            <span class="stat-label">${name}</span>
            <span class="stat-val">${val}</span>
          </div>`;
      });
      abilGrid.appendChild(col);
    });
    abilFieldset.appendChild(abilGrid);
    els.modalStats.appendChild(abilFieldset);

    // Other Stats: Humanity, Willpower, Health & Blood
    const otherFieldset = document.createElement("fieldset");
    otherFieldset.className = "ae-group-fieldset";
    otherFieldset.innerHTML = "<legend>Otros</legend>";
    const otherGrid = document.createElement("div");
    otherGrid.className = "ae-stat-grid-4col";

    // Humanity
    const humCol = document.createElement("div");
    humCol.className = "ae-stat-col";
    const humanityName = charData["humanidad"] || "Humanidad/Senda";
    const humanityVal = parseInt(charData["humanidad-value"]) || 0;
    humCol.innerHTML = `<h4>Senda</h4>
      <div class="ae-stat-row">
        <span class="stat-label">${humanityName}</span>
        <span class="stat-val">${humanityVal}</span>
      </div>`;
    otherGrid.appendChild(humCol);

    // Willpower
    const willCol = document.createElement("div");
    willCol.className = "ae-stat-col";
    const willPerm = parseInt(charData["voluntadPerm-value"]) || 0;
    const willTemp = parseInt(charData["voluntadTemp-value"]) || 0;
    willCol.innerHTML = `<h4>Voluntad</h4>
      <div class="ae-stat-row">
        <span class="stat-label">Permanente</span>
        <span class="stat-val">${willPerm}</span>
      </div>
      <div class="ae-stat-row">
        <span class="stat-label">Temporal</span>
        <span class="stat-val">${willTemp}</span>
      </div>`;
    otherGrid.appendChild(willCol);

    // Blood Pool
    const bloodCol = document.createElement("div");
    bloodCol.className = "ae-stat-col";

    const getBloodMax = (gen) => {
      if (gen <= 6) return 30;
      if (gen <= 7) return 20;
      if (gen <= 8) return 15;
      if (gen <= 9) return 14;
      if (gen <= 10) return 13;
      if (gen <= 11) return 12;
      if (gen <= 12) return 11;
      return 10;
    };

    const gen = parseInt(charData["generacion"]) || 13;
    const maxBlood = getBloodMax(gen);
    const currentBloodStr = charData["blood-value"] || "";
    const currentBlood = currentBloodStr.replace(/0/g, "").length;
    const isLowBlood = currentBlood < 5;
    const bloodStyle = isLowBlood
      ? 'style="color: var(--color-red-accent);"'
      : "";

    bloodCol.innerHTML = `<h4>Sangre</h4>
      <div class="ae-stat-row">
        <span class="stat-label">Actual / Max</span>
        <span class="stat-val" ${bloodStyle}>${currentBlood} / ${maxBlood}</span>
      </div>
      ${isLowBlood ? '<div style="font-size: 0.7em; color: var(--color-red-accent); margin-top: 4px; font-weight: bold;">¡RESERVA BAJA!</div>' : ""}`;
    otherGrid.appendChild(bloodCol);

    // Health Squares inside modal
    const healthCol = document.createElement("div");
    healthCol.className = "ae-stat-col";
    const types = ["", "contundente", "letal", "agravado"];
    const boxes = (inst.pcHealth || [0, 0, 0, 0, 0, 0, 0])
      .map((val) => `<span class="ae-health-sq ${types[val] || ""}"></span>`)
      .join("");

    // Calculate movement penalty for modal as well
    const healthLevelNames = [
      "Magullado",
      "Lastimado",
      "Lesionado",
      "Herido",
      "Malherido",
      "Tullido",
      "Incapacitado",
    ];
    const movementPenalties = [
      "Sin penalización.",
      "Sin penalización.",
      "Velocidad al correr se divide a la mitad.",
      "No puede correr. Solo puede moverse o atacar.",
      "Solo puede cojear (3 metros por turno).",
      "Solo puede arrastrarse (1 metro por turno).",
      "Incapaz de moverse.",
    ];
    let currentLevelIndex = -1;
    const pcH = inst.pcHealth || [];
    for (let i = 0; i < pcH.length; i++) {
      if (pcH[i] > 0) currentLevelIndex = i;
    }
    let tooltip = "Salud: Sin daño";
    if (currentLevelIndex !== -1) {
      tooltip = `${healthLevelNames[currentLevelIndex]}: ${movementPenalties[currentLevelIndex]}`;
    }

    healthCol.innerHTML = `<h4>Salud</h4>
      <div class="ae-pc-health-row" style="justify-content: flex-start;" title="${tooltip}">
        ${boxes}
      </div>
      <div style="font-size: 0.8em; color: #888; margin-top: 5px;">${tooltip}</div>`;
    otherGrid.appendChild(healthCol);

    otherFieldset.appendChild(otherGrid);
    els.modalStats.appendChild(otherFieldset);

    // Hide Code and Notes for PCs

    if (els.modalNotes) {
      els.modalNotes.style.display = "none";
    }
  }

  function closeModal() {
    els.modal.style.display = "none";
    state.selectedInstanceId = null;
  }

  function updateModalUI(inst) {
    const hpPct = (inst.health / inst.maxHealth) * 100;
    let hpClass = "high";
    if (hpPct < 50) hpClass = "med";
    if (hpPct < 20) hpClass = "low";
    if (inst.health === 0) hpClass = "dead";

    els.modalHpFill.className = "ae-hp-fill " + hpClass;
    els.modalHpFill.style.width = hpPct + "%";
    els.modalHpText.textContent = `${inst.health} / ${inst.maxHealth}`;
  }

  // --- SAVE ---

  async function saveEncounter() {
    if (!state.encounter) return;
    const btn = document.getElementById("btn-ae-save");
    const prevText = btn.textContent;
    btn.textContent = "Guardando...";

    const { error } = await supabase
      .from("encounters")
      .update({ data: state.encounter.data })
      .eq("id", state.encounterId);

    if (error) alert("Error: " + error.message);

    btn.textContent = "Guardado";
    setTimeout(() => (btn.textContent = prevText), 1000);
  }

  // --- UTILITIES ---

  function calculateInitiative(data) {
    let dex = 0;
    let wits = 0;

    if (data && data.groups && data.groups.length > 0) {
      const findVal = (name) => {
        for (const g of data.groups) {
          const f = g.fields.find((field) => field.name === name);
          if (f) return f.value;
        }
        return 0;
      };
      dex = parseInt(findVal("Destreza")) || 0;
      wits = parseInt(findVal("Astucia")) || 0;
    } else if (data && data.stats) {
      dex = parseInt(data.stats["Destreza"]) || 0;
      wits = parseInt(data.stats["Astucia"]) || 0;
    }

    return dex + wits + Math.ceil(Math.random() * 10);
  }

  function findMaxCode(instances, baseLetter) {
    let maxNum = 0;
    const regex = new RegExp(`^${baseLetter}(\\d+)$`);
    instances.forEach((i) => {
      const m = i.code.match(regex);
      if (m) {
        const n = parseInt(m[1]);
        if (n > maxNum) maxNum = n;
      }
    });
    return maxNum;
  }

  function getHealthClass(current, max, status) {
    if (status === "dead" || current === 0) return "dead";
    const pct = (current / max) * 100;
    if (pct > 50) return "high";
    if (pct > 20) return "med";
    return "low";
  }

  // Auto-init
  init();
})();
