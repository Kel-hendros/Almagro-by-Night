(function () {
  const state = {
    encounterId: null,
    encounter: null,
    templates: [],
    characterSheets: [],
    user: null,
    isAdmin: false,
    selectedInstanceId: null,
    selectedTokenId: null,
    isApplyingRemoteUpdate: false,
    encounterSyncTimer: null,
    lastEncounterSyncKey: null,
    browserMode: null, // 'npc' | 'pc'
    browserActiveTags: [],
  };

  const els = {};
  const ENCOUNTER_STATUS = {
    WIP: "wip",
    READY: "ready",
    IN_GAME: "in_game",
    ARCHIVED: "archived",
  };
  const STATUS_LABELS = {
    [ENCOUNTER_STATUS.WIP]: "WIP",
    [ENCOUNTER_STATUS.READY]: "Listo",
    [ENCOUNTER_STATUS.IN_GAME]: "En juego",
    [ENCOUNTER_STATUS.ARCHIVED]: "Archivado",
  };

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
    if (session) {
      state.user = session.user;
      state.isAdmin = await fetchIsAdmin(session.user.id);
    }

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

    await Promise.all([loadTemplates(), loadCharacterSheets()]);
    const ok = await loadEncounterData();
    if (!ok) return;
    setupRealtimeSubscription();

    // Init Map
    state.map = new TacticalMap("ae-map-canvas", "ae-map-container");
    state.map.setData(
      state.encounter?.data?.tokens,
      state.encounter?.data?.instances,
    );
    state.map.setActiveInstance(
      state.encounter?.data?.activeInstanceId || null,
    );
    state.map.onTokenMove = async (id, x, y, oldX, oldY) => {
      const t = state.encounter.data.tokens.find((tk) => tk.id === id);
      if (t) {
        if (state.isAdmin) {
          t.x = x;
          t.y = y;
          saveEncounter();
          return;
        }

        try {
          await moveTokenViaRpc(id, x, y);
        } catch (err) {
          t.x = oldX ?? t.x;
          t.y = oldY ?? t.y;
          if (state.map) state.map.draw();
          alert(err?.message || "No tienes permisos para mover este token.");
        }
      }
    };
    state.map.onTokenSelect = (instId) => {
      handleTokenSelection(instId);
    };
    state.map.onTokenContext = (tokenInfo) => {
      if (!canEditEncounter()) return;
      if (!tokenInfo || !tokenInfo.tokenId) {
        hideTokenContextMenu();
        return;
      }
      openTokenContextMenu(tokenInfo);
    };
    state.map.canDragToken = (token) => canCurrentUserControlToken(token);

    setupMapControls();
    applyPermissionsUI();
    render();
    window.addEventListener("beforeunload", stopEncounterSyncPolling);
    window.addEventListener("hashchange", () => {
      if (!window.location.hash.startsWith("#active-encounter")) {
        stopEncounterSyncPolling();
      }
    });
  }

  async function fetchIsAdmin(userId) {
    if (!userId) return false;
    const { data, error } = await supabase
      .from("players")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("No se pudo resolver rol admin:", error.message);
      return false;
    }
    return !!data?.is_admin;
  }

  function normalizeEncounterStatus(status) {
    if (status === "active") return ENCOUNTER_STATUS.IN_GAME;
    if (
      status === ENCOUNTER_STATUS.WIP ||
      status === ENCOUNTER_STATUS.READY ||
      status === ENCOUNTER_STATUS.IN_GAME ||
      status === ENCOUNTER_STATUS.ARCHIVED
    ) {
      return status;
    }
    return ENCOUNTER_STATUS.WIP;
  }

  function getEncounterStatusLabel(status) {
    return STATUS_LABELS[normalizeEncounterStatus(status)] || "WIP";
  }

  function canEditEncounter() {
    return state.isAdmin;
  }

  function canCurrentUserControlToken(token) {
    if (!token || !state.encounter?.data) return false;
    if (state.isAdmin) return true;

    const status = normalizeEncounterStatus(state.encounter.status);
    if (status !== ENCOUNTER_STATUS.IN_GAME) return false;

    const inst = (state.encounter.data.instances || []).find(
      (i) => i.id === token.instanceId,
    );
    if (!inst || !inst.isPC || !inst.characterSheetId) return false;

    const sheet = state.characterSheets.find(
      (s) => s.id === inst.characterSheetId,
    );
    return !!sheet && !!state.user && sheet.user_id === state.user.id;
  }

  async function moveTokenViaRpc(tokenId, x, y) {
    const { error } = await supabase.rpc("move_encounter_token", {
      p_encounter_id: state.encounterId,
      p_token_id: tokenId,
      p_x: x,
      p_y: y,
    });
    if (error) throw error;
  }

  function applyPermissionsUI() {
    const adminOnlyIds = [
      "btn-ae-browse-npc",
      "btn-ae-browse-pc",
      "btn-ae-save",
      "btn-ae-status-ready",
      "btn-ae-status-in-game",
      "btn-ae-status-pause",
      "btn-ae-archive",
      "btn-ae-next-turn",
      "btn-ae-reroll",
    ];

    adminOnlyIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = canEditEncounter() ? "" : "none";
    });
  }

  function handleTokenSelection(selection) {
    state.selectedTokenId = selection?.tokenId || null;

    // Clear previous selection
    document.querySelectorAll(".ae-card.selected-token").forEach((el) => {
      el.classList.remove("selected-token");
    });

    const instanceId =
      selection && typeof selection === "object" ? selection.instanceId : null;
    if (instanceId) {
      const card = document.querySelector(`.ae-card[data-id="${instanceId}"]`);
      if (card) {
        card.classList.add("selected-token");
        card.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    }
  }

  function ensureTokenContextMenu() {
    if (els.tokenContextMenu) return els.tokenContextMenu;

    const menu = document.createElement("div");
    menu.id = "ae-token-context-menu";
    menu.style.position = "fixed";
    menu.style.display = "none";
    menu.style.zIndex = "2000";
    menu.style.background = "rgba(18, 18, 18, 0.98)";
    menu.style.border = "1px solid rgba(255, 255, 255, 0.14)";
    menu.style.borderRadius = "8px";
    menu.style.padding = "4px";
    menu.style.minWidth = "140px";
    menu.style.boxShadow = "0 8px 24px rgba(0, 0, 0, 0.45)";

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.textContent = "Borrar token";
    deleteBtn.style.width = "100%";
    deleteBtn.style.background = "transparent";
    deleteBtn.style.border = "none";
    deleteBtn.style.color = "var(--color-cream, #e4d7c5)";
    deleteBtn.style.padding = "8px 10px";
    deleteBtn.style.textAlign = "left";
    deleteBtn.style.borderRadius = "6px";
    deleteBtn.style.cursor = "pointer";
    deleteBtn.style.fontSize = "0.86rem";

    deleteBtn.addEventListener("mouseenter", () => {
      deleteBtn.style.background = "rgba(173, 56, 56, 0.2)";
    });
    deleteBtn.addEventListener("mouseleave", () => {
      deleteBtn.style.background = "transparent";
    });
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const tokenId = menu.dataset.tokenId;
      hideTokenContextMenu();
      if (tokenId) removeTokenById(tokenId);
    });

    menu.appendChild(deleteBtn);
    document.body.appendChild(menu);
    els.tokenContextMenu = menu;
    return menu;
  }

  function hideTokenContextMenu() {
    const menu = els.tokenContextMenu;
    if (!menu) return;
    menu.style.display = "none";
    delete menu.dataset.tokenId;
  }

  function openTokenContextMenu(tokenInfo) {
    const menu = ensureTokenContextMenu();
    menu.dataset.tokenId = tokenInfo.tokenId;

    const maxX = window.innerWidth - 160;
    const maxY = window.innerHeight - 56;
    const x = Math.max(8, Math.min(tokenInfo.clientX || 8, maxX));
    const y = Math.max(8, Math.min(tokenInfo.clientY || 8, maxY));

    menu.style.left = `${x}px`;
    menu.style.top = `${y}px`;
    menu.style.display = "block";
  }

  function setupMapControls() {
    document
      .getElementById("btn-map-zoom-in")
      ?.addEventListener("click", () => {
        if (state.map) {
          state.map.zoomIn();
          state.map.draw();
        }
      });
    document
      .getElementById("btn-map-zoom-out")
      ?.addEventListener("click", () => {
        if (state.map) {
          state.map.zoomOut();
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

    supabase
      .channel(`encounter-${state.encounterId}-changes`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "encounters",
          filter: `id=eq.${state.encounterId}`,
        },
        (payload) => {
          if (state.isApplyingRemoteUpdate) return;
          const updated = payload.new;
          if (!updated) return;
          applyRemoteEncounterUpdate(updated);
        },
      )
      .subscribe();

    startEncounterSyncPolling();
  }

  function applyRemoteEncounterUpdate(updated) {
    if (!updated || !state.encounter) return;
    state.encounter.status = normalizeEncounterStatus(updated.status);
    state.encounter.data = updated.data || state.encounter.data;
    state.lastEncounterSyncKey = buildEncounterSyncKey(updated);
    sanitizeEncounterTokens();
    ensureActiveInstance();
    render();
  }

  function buildEncounterSyncKey(encounterLike) {
    if (!encounterLike) return "";
    return JSON.stringify({
      status: normalizeEncounterStatus(encounterLike.status),
      data: encounterLike.data || {},
    });
  }

  function startEncounterSyncPolling() {
    stopEncounterSyncPolling();
    state.encounterSyncTimer = setInterval(async () => {
      if (!state.encounterId || state.isApplyingRemoteUpdate) return;

      const { data, error } = await supabase
        .from("encounters")
        .select("id, status, data")
        .eq("id", state.encounterId)
        .maybeSingle();
      if (error || !data) return;

      const incomingKey = buildEncounterSyncKey(data);
      if (
        !state.lastEncounterSyncKey ||
        incomingKey !== state.lastEncounterSyncKey
      ) {
        applyRemoteEncounterUpdate(data);
      }
    }, 1500);
  }

  function stopEncounterSyncPolling() {
    if (!state.encounterSyncTimer) return;
    clearInterval(state.encounterSyncTimer);
    state.encounterSyncTimer = null;
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

  function requireAdminAction() {
    if (canEditEncounter()) return true;
    alert("Solo administradores pueden realizar esta acción.");
    return false;
  }

  function setupListeners() {
    document.getElementById("btn-ae-back").addEventListener("click", () => {
      window.location.hash = "combat-tracker";
    });

    document.getElementById("btn-ae-save").addEventListener("click", () => {
      if (!requireAdminAction()) return;
      saveEncounter();
    });
    document
      .getElementById("btn-ae-browse-npc")
      .addEventListener("click", () => {
        if (!requireAdminAction()) return;
        openBrowser("npc");
      });
    document
      .getElementById("btn-ae-browse-pc")
      .addEventListener("click", () => {
        if (!requireAdminAction()) return;
        openBrowser("pc");
      });
    document
      .getElementById("btn-ae-next-turn")
      .addEventListener("click", () => {
        if (!requireAdminAction()) return;
        nextTurn();
      });
    document.getElementById("btn-ae-reroll").addEventListener("click", () => {
      if (!requireAdminAction()) return;
      if (
        confirm(
          "¿Resetear iniciativa? Esto reiniciará la ronda y mezclará el orden.",
        )
      ) {
        rerollAllInitiatives();
      }
    });

    document
      .getElementById("btn-ae-status-ready")
      ?.addEventListener("click", async () => {
        if (!requireAdminAction()) return;
        await updateEncounterStatus(ENCOUNTER_STATUS.READY);
      });
    document
      .getElementById("btn-ae-status-in-game")
      ?.addEventListener("click", async () => {
        if (!requireAdminAction()) return;
        await updateEncounterStatus(ENCOUNTER_STATUS.IN_GAME);
      });
    document
      .getElementById("btn-ae-status-pause")
      ?.addEventListener("click", async () => {
        if (!requireAdminAction()) return;
        await updateEncounterStatus(ENCOUNTER_STATUS.READY);
      });

    document
      .getElementById("btn-ae-archive")
      .addEventListener("click", async () => {
        if (!requireAdminAction()) return;
        if (
          confirm(
            `¿Archivar "${state.encounter?.name || "este encuentro"}"? No aparecerá en la lista de encuentros activos.`,
          )
        ) {
          const { error } = await supabase
            .from("encounters")
            .update({ status: ENCOUNTER_STATUS.ARCHIVED })
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

    document.addEventListener("click", (e) => {
      if (
        !els.tokenContextMenu ||
        els.tokenContextMenu.style.display === "none"
      )
        return;
      if (!els.tokenContextMenu.contains(e.target)) hideTokenContextMenu();
    });
    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape") hideTokenContextMenu();
    });
    window.addEventListener(
      "scroll",
      () => {
        hideTokenContextMenu();
      },
      true,
    );
  }

  // --- DATA LOADING ---

  async function loadTemplates() {
    if (!canEditEncounter()) {
      state.templates = [];
      return;
    }
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
      .select("id, name, data, avatar_url, user_id")
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
      return false;
    }
    state.encounter = data;
    state.encounter.status = normalizeEncounterStatus(state.encounter.status);
    state.lastEncounterSyncKey = buildEncounterSyncKey(state.encounter);

    // Legacy migration: active -> in_game
    if (data.status === "active" && canEditEncounter()) {
      updateEncounterStatus(ENCOUNTER_STATUS.IN_GAME, { silent: true });
    }

    if (
      !canEditEncounter() &&
      normalizeEncounterStatus(state.encounter.status) !==
        ENCOUNTER_STATUS.IN_GAME
    ) {
      alert("Este encuentro no está disponible para jugadores.");
      window.location.hash = "combat-tracker";
      return false;
    }

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

    const { changed } = sanitizeEncounterTokens();

    // Sync PC data from character sheets on load
    state.encounter.data.instances.forEach((inst) => {
      if (inst.isPC) {
        const sheet = state.characterSheets.find(
          (s) => s.id === inst.characterSheetId,
        );
        if (sheet) {
          inst.pcHealth = extractPCHealth(sheet.data);
          inst.avatarUrl = sheet.avatar_url || inst.avatarUrl;

          // Also update token imgUrl
          const token = state.encounter.data.tokens.find(
            (t) => t.instanceId === inst.id,
          );
          if (token && sheet.avatar_url) {
            token.imgUrl = sheet.avatar_url;
          }
        }
      }
    });

    ensureActiveInstance();
    render();
    if (changed) {
      saveEncounter();
    }
    return true;
  }

  async function updateEncounterStatus(nextStatus, options = {}) {
    if (!state.encounter || !nextStatus) return;
    const prevStatus = normalizeEncounterStatus(state.encounter.status);
    if (prevStatus === nextStatus) return;

    const allowedTransitions = {
      [ENCOUNTER_STATUS.WIP]: [
        ENCOUNTER_STATUS.READY,
        ENCOUNTER_STATUS.ARCHIVED,
      ],
      [ENCOUNTER_STATUS.READY]: [
        ENCOUNTER_STATUS.IN_GAME,
        ENCOUNTER_STATUS.ARCHIVED,
      ],
      [ENCOUNTER_STATUS.IN_GAME]: [
        ENCOUNTER_STATUS.READY,
        ENCOUNTER_STATUS.ARCHIVED,
      ],
      [ENCOUNTER_STATUS.ARCHIVED]: [],
    };
    const canTransition =
      nextStatus === ENCOUNTER_STATUS.ARCHIVED ||
      (allowedTransitions[prevStatus] || []).includes(nextStatus);
    if (!canTransition) {
      if (!options.silent) {
        alert("Transición de estado no permitida.");
      }
      return;
    }

    state.isApplyingRemoteUpdate = true;
    const { error } = await supabase
      .from("encounters")
      .update({ status: nextStatus })
      .eq("id", state.encounterId);
    if (error) {
      if (!options.silent) alert("Error actualizando estado: " + error.message);
      setTimeout(() => {
        state.isApplyingRemoteUpdate = false;
      }, 200);
      return;
    }
    state.encounter.status = nextStatus;
    render();
    setTimeout(() => {
      state.isApplyingRemoteUpdate = false;
    }, 200);
  }

  function ensureActiveInstance() {
    const d = state.encounter.data;
    if (!d.instances || d.instances.length === 0) {
      d.activeInstanceId = null;
      return;
    }

    const current = d.instances.find((i) => i.id === d.activeInstanceId);
    if (current && !isInstanceDown(current)) return;

    const alive = d.instances.filter((i) => !isInstanceDown(i));
    if (alive.length > 0) {
      const sortedAlive = [...alive].sort(
        (a, b) => (b.initiative || 0) - (a.initiative || 0),
      );
      d.activeInstanceId = sortedAlive[0].id;
      return;
    }

    d.activeInstanceId = null;
  }

  // --- RENDER ---

  function render() {
    if (!state.encounter) return;
    sanitizeEncounterTokens();
    hideTokenContextMenu();

    els.name.textContent = state.encounter.name;
    const status = normalizeEncounterStatus(state.encounter.status);
    els.status.textContent = getEncounterStatusLabel(status);
    els.status.className = `ae-status-chip ${status}`;
    els.roundCounter.textContent = state.encounter.data.round || 1;
    updateStatusButtons(status);

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
      const isDead = isInstanceDown(inst);
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
        <div class="ae-init-bubble" style="${isDead ? "visibility: hidden !important; opacity: 0;" : ""}">
          ${isDead ? "" : `<input type="number" class="init-input ae-bubble-input" value="${inst.initiative || 0}">`}
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
      if (inputInit) {
        inputInit.disabled = !canEditEncounter();
        inputInit.addEventListener("change", (e) =>
          updateInitiative(inst.id, e.target.value),
        );
      }

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
        if (!requireAdminAction()) return;
        if (confirm(`¿Eliminar ${inst.name} (${inst.code})?`)) {
          removeInstance(inst.id);
        }
      });

      if (!canEditEncounter()) {
        const delBtn = row.querySelector(".ae-btn-delete");
        if (delBtn) delBtn.style.display = "none";
      }

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

  function updateStatusButtons(status) {
    const btnReady = document.getElementById("btn-ae-status-ready");
    const btnInGame = document.getElementById("btn-ae-status-in-game");
    const btnPause = document.getElementById("btn-ae-status-pause");
    if (!btnReady || !btnInGame || !btnPause) return;

    if (!canEditEncounter()) {
      btnReady.style.display = "none";
      btnInGame.style.display = "none";
      btnPause.style.display = "none";
      return;
    }

    btnReady.style.display = status === ENCOUNTER_STATUS.WIP ? "" : "none";
    btnInGame.style.display = status === ENCOUNTER_STATUS.READY ? "" : "none";
    btnPause.style.display = status === ENCOUNTER_STATUS.IN_GAME ? "" : "none";
  }

  // --- ADD NPC ---

  async function addNPC(tplId, count) {
    if (!canEditEncounter()) return;
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
    if (!canEditEncounter()) return;
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
    const flatAttrMap = {
      ...PC_ATTR_MAP.physical,
      ...PC_ATTR_MAP.social,
      ...PC_ATTR_MAP.mental,
    };
    const flatAbilityMap = {
      ...PC_ABILITY_MAP.talents,
      ...PC_ABILITY_MAP.skills,
      ...PC_ABILITY_MAP.knowledges,
    };

    // Build Atributos
    const attrFields = Object.entries(flatAttrMap).map(([key, name]) => {
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
    const skillFields = Object.entries(flatAbilityMap).map(([key, name]) => {
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
    if (!canEditEncounter()) return;
    const d = state.encounter.data;
    d.instances = d.instances.filter((i) => i.id !== id);
    d.tokens = (d.tokens || []).filter((t) => t.instanceId !== id);

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

  function removeTokenById(tokenId) {
    if (!canEditEncounter()) return;
    if (!state.encounter?.data) return;
    const d = state.encounter.data;
    const prevLen = (d.tokens || []).length;
    d.tokens = (d.tokens || []).filter((t) => t.id !== tokenId);
    if (d.tokens.length === prevLen) return;

    state.selectedTokenId = null;
    if (state.map) {
      state.map.selectedTokenId = null;
    }

    render();
    saveEncounter();
  }

  function updateInitiative(id, val) {
    if (!canEditEncounter()) return;
    const inst = state.encounter.data.instances.find((i) => i.id === id);
    if (inst) {
      inst.initiative = parseInt(val) || 0;
      render();
      saveEncounter();
    }
  }

  function rerollAllInitiatives() {
    if (!canEditEncounter()) return;
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
    if (!canEditEncounter()) return;
    const d = state.encounter.data;
    if (!d.instances || d.instances.length === 0) return;

    const alive = d.instances.filter((i) => !isInstanceDown(i));
    if (alive.length === 0) {
      d.activeInstanceId = null;
      render();
      saveEncounter();
      return;
    }

    const sorted = [...alive].sort(
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
    if (!canEditEncounter()) return;
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
    if (!canEditEncounter()) return;
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

    const dmgBtn = document.getElementById("btn-modal-dmg");
    const healBtn = document.getElementById("btn-modal-heal");
    const dmgInput = document.getElementById("ae-damage-amount");
    const healInput = document.getElementById("ae-heal-amount");
    [dmgBtn, healBtn, dmgInput, healInput].forEach((el) => {
      if (el) el.disabled = !canEditEncounter();
    });

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
      if (!canEditEncounter()) return;
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
    if (healthControls)
      healthControls.style.display = canEditEncounter() ? "block" : "none";

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

    // Token Section
    els.modalStats.appendChild(renderTokenSection(inst, els.modalStats));

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
            if (!canEditEncounter()) return;
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

    // Token Section
    els.modalStats.appendChild(renderTokenSection(inst, els.modalStats));

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

  function renderTokenSection(inst, container) {
    // Check if token already exists
    const token = state.encounter.data.tokens.find(
      (t) => t.instanceId === inst.id,
    );
    const isOnMap = !!token;

    const section = document.createElement("div");
    section.className = "ae-token-section";
    section.style.textAlign = "center";
    section.style.marginBottom = "16px";
    section.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
    section.style.paddingBottom = "16px";

    const title = document.createElement("h4");
    title.textContent = "Token";
    title.style.color = "#aaa";
    title.style.textTransform = "uppercase";
    title.style.fontSize = "0.7rem";
    title.style.letterSpacing = "1px";
    title.style.marginBottom = "8px";
    section.appendChild(title);

    const previewContainer = document.createElement("div");
    previewContainer.className = `ae-token-preview ${isOnMap ? "active" : ""}`;
    previewContainer.style.width = "60px";
    previewContainer.style.height = "60px";
    previewContainer.style.borderRadius = "50%";
    previewContainer.style.margin = "0 auto";
    previewContainer.style.cursor = "pointer";
    previewContainer.style.position = "relative";
    previewContainer.style.overflow = "hidden";

    let borderColor = "#444"; // Default off-map/inactive
    if (isOnMap) {
      borderColor = inst.isPC
        ? "var(--color-gold, #c5a059)"
        : "var(--color-selected-token, #ff9800)";
    }

    previewContainer.style.border = `2px solid ${borderColor}`;
    previewContainer.style.transition = "all 0.2s ease";

    // Image logic
    const imgUrl = inst.avatarUrl || inst.data?.avatarUrl;
    if (imgUrl) {
      const img = document.createElement("img");
      img.src = imgUrl;
      img.style.width = "100%";
      img.style.height = "100%";
      img.style.objectFit = "cover";
      previewContainer.appendChild(img);
    } else {
      const initials = document.createElement("div");
      initials.textContent = inst.name[0];
      initials.style.width = "100%";
      initials.style.height = "100%";
      initials.style.display = "flex";
      initials.style.alignItems = "center";
      initials.style.justifyContent = "center";
      initials.style.backgroundColor = "#333";
      initials.style.color = "#ccc";
      initials.style.fontSize = "1.5rem";
      initials.style.fontWeight = "bold";
      previewContainer.appendChild(initials);
    }

    // Code Overlay (mimic map)
    if (!imgUrl) {
      const codeOverlay = document.createElement("div");
      codeOverlay.textContent = inst.code;
      codeOverlay.style.position = "absolute";
      codeOverlay.style.top = "50%";
      codeOverlay.style.left = "50%";
      codeOverlay.style.transform = "translate(-50%, -50%)";
      codeOverlay.style.color = "#fff";
      codeOverlay.style.fontWeight = "bold";
      codeOverlay.style.fontSize = "0.9rem";
      codeOverlay.style.textShadow = "0 0 3px #000";
      codeOverlay.style.background = "rgba(0,0,0,0.5)";
      codeOverlay.style.borderRadius = "50%";
      codeOverlay.style.width = "36px";
      codeOverlay.style.height = "36px";
      codeOverlay.style.display = "flex";
      codeOverlay.style.alignItems = "center";
      codeOverlay.style.justifyContent = "center";
      previewContainer.appendChild(codeOverlay);
    }

    section.appendChild(previewContainer);

    const statusText = document.createElement("div");
    statusText.textContent = isOnMap
      ? "En Mapa (Click para quitar)"
      : "Oculto (Click para agregar)";
    statusText.style.fontSize = "0.7rem";
    statusText.style.marginTop = "6px";
    statusText.style.color = isOnMap ? "#2ecc71" : "#888"; // Green if active, gray if not
    section.appendChild(statusText);

    // Toggle Click Logic
    previewContainer.addEventListener("click", () => {
      if (!canEditEncounter()) return;
      if (isOnMap) {
        // Remove token
        state.encounter.data.tokens = state.encounter.data.tokens.filter(
          (t) => t.instanceId !== inst.id,
        );
      } else {
        // Add token
        // Calculate center of view
        let x = 0;
        let y = 0;
        if (state.map) {
          // Center of viewport in world coords
          const canvasW = state.map.canvas.width;
          const canvasH = state.map.canvas.height;
          x = Math.round(
            (-state.map.offsetX + canvasW / 2) / state.map.scale / 50,
          );
          y = Math.round(
            (-state.map.offsetY + canvasH / 2) / state.map.scale / 50,
          );
        }

        state.encounter.data.tokens.push({
          id: crypto.randomUUID(),
          instanceId: inst.id,
          x: x,
          y: y,
          size: 1,
          imgUrl: imgUrl || null,
        });
      }

      saveEncounter();
      render(); // Updates map

      // Re-render this section in place to update UI
      if (container.contains(section)) {
        const newSection = renderTokenSection(inst, container);
        container.replaceChild(newSection, section);
      }
    });

    return section;
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

  function sanitizeEncounterTokens() {
    const d = state.encounter?.data;
    if (!d) return { changed: false, removedCount: 0 };

    const validIds = new Set((d.instances || []).map((i) => i.id));
    const tokens = d.tokens || [];
    const nextTokens = tokens.filter((t) => t && validIds.has(t.instanceId));
    const removedCount = tokens.length - nextTokens.length;
    const changed = removedCount > 0;

    if (changed) {
      d.tokens = nextTokens;
      if (state.selectedTokenId) {
        const stillExists = nextTokens.some(
          (t) => t.id === state.selectedTokenId,
        );
        if (!stillExists) {
          state.selectedTokenId = null;
          if (state.map) state.map.selectedTokenId = null;
        }
      }
    }

    return { changed, removedCount };
  }

  async function saveEncounter() {
    if (!state.encounter) return;
    if (!canEditEncounter()) return;
    sanitizeEncounterTokens();
    const btn = document.getElementById("btn-ae-save");
    const prevText = btn.textContent;
    btn.textContent = "Guardando...";

    // Remove runtime-only image objects before persisting.
    const cleanData = {
      ...state.encounter.data,
      tokens: (state.encounter.data.tokens || []).map(({ img, ...token }) => ({
        ...token,
      })),
    };

    state.isApplyingRemoteUpdate = true;
    const { error } = await supabase
      .from("encounters")
      .update({ data: cleanData })
      .eq("id", state.encounterId);

    if (error) alert("Error: " + error.message);

    btn.textContent = "Guardado";
    setTimeout(() => (btn.textContent = prevText), 1000);
    setTimeout(() => {
      state.isApplyingRemoteUpdate = false;
    }, 200);
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

  function isInstanceDown(inst) {
    if (!inst) return false;

    if (
      inst.status === "dead" ||
      inst.status === "incapacitated" ||
      (parseInt(inst.health, 10) || 0) <= 0
    ) {
      return true;
    }

    if (inst.isPC && Array.isArray(inst.pcHealth) && inst.pcHealth.length > 0) {
      return inst.pcHealth.every((val) => (parseInt(val, 10) || 0) > 0);
    }

    return false;
  }

  // Auto-init
  init();
})();
