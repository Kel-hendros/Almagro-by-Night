(function () {
  const state = {
    encounterId: null,
    encounter: null,
    templates: [],
    characterSheets: [],
    user: null,
    currentPlayer: null,
    canManageEncounter: false,
    canViewEncounter: false,
    encounterHasUpdatedAt: false,
    encounterUpdatedAt: null,
    selectedInstanceId: null,
    selectedTokenId: null,
    isApplyingRemoteUpdate: false,
    encounterSyncTimer: null,
    lastEncounterSyncKey: null,
    backgroundPersistTimer: null,
    browserMode: null, // 'npc' | 'pc'
    browserActiveTags: [],
    designAssets: [],
    activeMapLayer: "entities",
    map: null,
    realtimeChannels: [],
    lastViewTargetTs: null,
    lastPingTs: null,
  };
  const runtime = {
    isBooted: false,
    beforeUnloadHandler: null,
    hashChangeHandler: null,
    documentClickHandler: null,
    documentKeydownHandler: null,
    windowScrollHandler: null,
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
  const MAP_LAYER_LABELS = window.AEEncounterLayers?.LAYER_LABELS || {
    background: "Fondo",
    decor: "Decorado",
    entities: "Entidades",
  };
  const MAP_LAYER_DEFAULTS = {
    backgroundPath: null,
    backgroundUrl: "",
    preserveAspect: true,
    x: 0,
    y: 0,
    widthCells: 20,
    heightCells: 20,
    opacity: 1,
    gridOpacity: 1,
    showGrid: true,
  };
  const DESIGN_TOKEN_DEFAULTS = {
    x: 0,
    y: 0,
    size: 1,
    widthCells: null,
    heightCells: null,
    rotationDeg: 0,
    fill: "#666",
    opacity: 1,
    layer: "underlay",
    zIndex: 0,
  };
  const MAP_EFFECT_DEFAULTS = {
    id: "",
    type: "",
    sourceTokenId: null,
    sourceInstanceId: null,
    radiusMeters: 0,
    radiusCells: 0,
    createdAt: null,
  };
  const encounterTurns = window.AEEncounterTurns;
  let layersController = null;
  let assetsService = null;
  let browserController = null;
  let drawerController = null;
  let tilePainter = null;
  let wallDrawer = null;
  let fogBrush = null;
  let tokenActionsController = null;
  let tokenContextMenuController = null;

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

  function embedNavigateAway() {
    try {
      window.parent.postMessage({ type: "abn-encounter-embed-close" }, "*");
    } catch (_e) {}
  }

  function navigateAway(hash) {
    if (window.__abnEmbedMode) {
      embedNavigateAway();
      return;
    }
    window.location.hash = hash;
  }

  async function init() {
    if (!encounterTurns) {
      alert("Error cargando módulo de turnos del encuentro.");
      return false;
    }

    state.isEmbedMode = !!window.__abnEmbedMode;

    const rawHash = window.location.hash.split("?")[1];
    const params = new URLSearchParams(rawHash);
    state.encounterId = params.get("id");

    if (!state.encounterId) {
      alert("No se especificó un encuentro ID.");
      return false;
    }

    const {
      data: { session },
    } = await window.abnGetSession();
    if (!session) {
      navigateAway("welcome");
      return false;
    }
    state.user = session.user;
    state.currentPlayer = await fetchCurrentPlayerByUserId(session.user.id);

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
    els.browserTokenOption = document.getElementById("ae-browser-token-option");
    els.browserUploadAssetBtn = document.getElementById(
      "btn-ae-browser-upload-asset",
    );
    els.browserUploadInput = document.getElementById("ae-browser-upload-input");
    els.mapUploadBgInput = document.getElementById("ae-map-bg-input");
    els.layerToolbar = document.getElementById("ae-layer-toolbar");
    els.layerMenu = document.getElementById("ae-layer-menu");
    els.layerMenuToggle = document.getElementById("btn-ae-layer-menu");
    els.layerCurrentLabel = document.getElementById("ae-layer-current-label");
    els.uploadOverlay = document.getElementById("ae-upload-overlay");
    els.uploadMessage = document.getElementById("ae-upload-message");
    els.drawerTab_entities = document.getElementById("btn-ae-tab-entities");
    els.drawerTabPane_entities = document.getElementById("ae-drawer-tab-entities-content");
    els.drawerTab_terrain = document.getElementById("btn-ae-tab-terrain");
    els.drawerTabPane_terrain = document.getElementById("ae-drawer-tab-terrain-content");
    els.drawerTab_settings = document.getElementById("btn-ae-tab-settings");
    els.drawerTabPane_settings = document.getElementById("ae-drawer-tab-settings-content");
    els.gridOpacityLevels = document.getElementById("ae-grid-opacity-levels");
    els.listBackground = document.getElementById("ae-list-background");
    els.listDecor = document.getElementById("ae-list-decor");
    els.listEntitiesNpc = document.getElementById("ae-list-entities-npc");
    els.listEntitiesPc = document.getElementById("ae-list-entities-pc");

    // Detail Modal Els
    els.modal = document.getElementById("ae-modal");

    els.modalStats = document.getElementById("ae-modal-stats");
    els.modalTitle = document.getElementById("ae-modal-title");
    els.modalHpFill = document.getElementById("ae-modal-hp-fill");
    els.modalHpText = document.getElementById("ae-modal-hp-text");
    els.modalNotes = document.getElementById("ae-modal-notes");

    layersController = window.AEEncounterLayers?.createController?.({
      state,
      els,
      getMap: () => state.map,
    });
    assetsService = window.AEEncounterAssets?.createService?.({
      state,
      supabase,
      normalizeMapLayerData,
      render,
      saveEncounter,
      canEditEncounter,
      onBusyChange: setUploadBusy,
    });
    browserController = window.AEEncounterEntityBrowser?.createController?.({
      state,
      els,
      canEditEncounter,
      setActiveMapLayer: (...args) => setActiveMapLayer(...args),
      loadDesignAssets: () => loadDesignAssets(),
      addNPC: (...args) => addNPC(...args),
      addPC: (...args) => addPC(...args),
      addDesignTokenFromAsset: (...args) => addDesignTokenFromAsset(...args),
      getEncounterAssetPublicUrl: (path) =>
        assetsService?.getEncounterAssetPublicUrl(path) || "",
    });
    drawerController = window.AEEncounterDrawer?.createController?.({
      state,
      els,
      canEditEncounter,
      requireAdminAction,
      setActiveMapLayer: (...args) => setActiveMapLayer(...args),
      openBrowser: (...args) => browserController?.openBrowser(...args),
      loadDesignAssets: () => loadDesignAssets(),
      openModal: (...args) => openModal(...args),
      requestBackgroundUpload: () => els.mapUploadBgInput?.click(),
      removeEncounterBackground: () => removeEncounterBackground(),
      getMap: () => state.map,
      saveEncounter: () => saveEncounter(),
      getTilePainter: () => tilePainter,
      getWallDrawer: () => wallDrawer,
      getFogBrush: () => fogBrush,
      addLight: (x, y) => addLight(x, y),
      findLightAt: (x, y) => findLightAt(x, y),
      openLightPopover: (light) => openLightPopover(light),
      removeLight: (id) => removeLight(id),
      addSwitch: (x, y, lid) => addSwitch(x, y, lid),
      findSwitchAt: (x, y) => findSwitchAt(x, y),
      openSwitchPopover: (sw) => openSwitchPopover(sw),
      handleLinkModeClick: (x, y) => handleLinkModeClick(x, y),
      isLinkMode: () => !!state._linkMode,
    });
    tokenActionsController = window.AEEncounterTokenActions?.createController?.({
      state,
      canEditEncounter,
      canControlTokenById: (tokenId) => {
        const token = (state.encounter?.data?.tokens || []).find(
          (item) => item.id === tokenId,
        );
        return !!token && canCurrentUserControlToken(token);
      },
      persistPlayerInstanceState: async (instanceId, patch = {}) =>
        persistPlayerInstanceStateViaRpc(instanceId, patch),
      render,
      saveEncounter,
    });
    tokenContextMenuController =
      window.AEEncounterTokenContextMenu?.createController?.({
        state,
        canEditEncounter,
        getMap: () => state.map,
        onOpenDetails: (tokenId) => openTokenDetailsFromContext(tokenId),
        onUnsummonToken: (tokenId) => unsummonTokenFromContext(tokenId),
        onRemoveToken: (tokenId) => tokenActionsController?.removeTokenById(tokenId),
        onApplyCondition: (tokenId, conditionKey) =>
          tokenActionsController?.setTokenCondition(tokenId, conditionKey),
        onGetAvailablePowers: (tokenId) =>
          tokenActionsController?.getAvailablePowers(tokenId) || [],
        onInvokePower: (tokenId, powerId) =>
          tokenActionsController?.invokePower(tokenId, powerId),
        onIsPowerActive: (tokenId, powerId) =>
          !!tokenActionsController?.isPowerActive(tokenId, powerId),
        onToggleVisibility: (tokenId) => toggleTokenVisibility(tokenId),
        onToggleImpersonate: (tokenId) => {
          var token = (state.encounter?.data?.tokens || []).find(t => t.id === tokenId);
          if (!token) return;
          var instance = (state.encounter?.data?.instances || []).find(i => i.id === token.instanceId);
          if (!instance || !state.map) return;
          var fog = state.map._fog;
          var currentId = fog?.impersonateInstanceId || null;
          var nextId = currentId === instance.id ? null : instance.id;
          state.map.setFogImpersonate(nextId);
          state.map.draw();
        },
      });

    setupListeners();

    await loadCharacterSheets();
    const ok = await loadEncounterData();
    if (!ok) return false;
    await loadTemplates();
    await loadDesignAssets();
    setupRealtimeSubscription();

    // Init Map
    state.map = new TacticalMap("ae-map-canvas", "ae-map-container");
    state.map.freeMovement = !!state.encounter?.data?.freeMovement;
    // Ensure tileMap and walls exist
    if (!state.encounter.data.tileMap || typeof state.encounter.data.tileMap !== "object") {
      state.encounter.data.tileMap = {};
    }
    if (!Array.isArray(state.encounter.data.walls)) {
      state.encounter.data.walls = [];
    }
    if (!Array.isArray(state.encounter.data.lights)) {
      state.encounter.data.lights = [];
    }
    if (!Array.isArray(state.encounter.data.switches)) {
      state.encounter.data.switches = [];
    }
    if (!state.encounter.data.ambientLight) {
      state.encounter.data.ambientLight = { color: "#8090b0", intensity: 0.5 };
    }
    state.map.setData(
      state.encounter?.data?.tokens,
      state.encounter?.data?.instances,
      {
        map: state.encounter?.data?.map || null,
        designTokens: state.encounter?.data?.designTokens || [],
        mapEffects: state.encounter?.data?.mapEffects || [],
        tileMap: state.encounter.data.tileMap,
        walls: state.encounter.data.walls,
        lights: state.encounter.data.lights,
        switches: state.encounter.data.switches,
      },
    );

    // Init Tile Painter (narrator only)
    if (window.TilePainter) {
      tilePainter = window.TilePainter.createTilePainter({
        getMap: () => state.map,
        getTileMap: () => state.encounter?.data?.tileMap || {},
        setTileMap: (newMap) => {
          if (state.encounter?.data) {
            state.encounter.data.tileMap = newMap;
            if (state.map) state.map.tileMap = newMap;
          }
        },
        onChanged: () => saveEncounter(),
      });
      state.map._tilePainter = tilePainter;
    }

    // Init Wall Drawer (narrator only)
    if (window.WallDrawer) {
      wallDrawer = window.WallDrawer.createWallDrawer({
        getMap: () => state.map,
        getWalls: () => state.encounter?.data?.walls || [],
        setWalls: (walls) => {
          if (state.encounter?.data) {
            state.encounter.data.walls = walls;
            if (state.map) state.map.walls = walls;
          }
        },
        onChanged: () => { state.map?.recomputeRooms?.(); state.map?.invalidateFog?.(); state.map?.invalidateLighting?.(); saveEncounter(); },
        canEdit: canEditEncounter,
      });
      state.map._wallDrawer = wallDrawer;
    }

    // Ambient light reference on the map
    state.map._ambientLight = state.encounter.data.ambientLight || { color: "#8090b0", intensity: 0 };
    state.map.recomputeRooms();

    // Init Fog of War
    if (!state.encounter.data.fog) {
      state.encounter.data.fog = { enabled: false, mode: "auto", revealed: {}, hidden: {}, explored: {} };
    }
    if (typeof state.map.initFog === "function") {
      state.map.initFog(state.encounter.data.fog, canEditEncounter());
      // For players: set which instances they control so fog is per-player
      if (!canEditEncounter()) {
        var myInstanceIds = (state.encounter.data.instances || [])
          .filter(function (inst) {
            if (!inst.isPC || !inst.characterSheetId) return false;
            var sheet = state.characterSheets.find(function (s) { return s.id === inst.characterSheetId; });
            return !!sheet && !!state.user && sheet.user_id === state.user.id;
          })
          .map(function (inst) { return inst.id; });
        state.map.setFogViewerInstances(myInstanceIds.length ? myInstanceIds : null);
      }
    }

    // Init Fog Brush (narrator only)
    if (window.FogBrush) {
      fogBrush = window.FogBrush.createFogBrush({
        getMap: () => state.map,
        getFog: () => state.encounter?.data?.fog || {},
        setFog: (fog) => {
          if (state.encounter?.data) {
            state.encounter.data.fog = fog;
          }
        },
        onChanged: () => saveEncounter(),
        canEdit: canEditEncounter,
      });
      state.map._fogBrush = fogBrush;
    }

    state.map.setActiveInstance(
      state.encounter?.data?.activeInstanceId || null,
    );
    state.map.setInteractionLayer(state.activeMapLayer);
    state.map.onTokenMove = async (id, x, y, oldX, oldY) => {
      const t = state.encounter.data.tokens.find((tk) => tk.id === id);
      if (t) {
        if (canEditEncounter()) {
          t.x = x;
          t.y = y;
          // Only invalidate fog when a PC moves (NPCs don't affect visibility)
          var movedInst = (state.encounter.data.instances || []).find(function (i) { return i.id === t.instanceId; });
          if (movedInst && movedInst.isPC) state.map.invalidateFog?.();
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
      if (!tokenInfo || !tokenInfo.tokenId) {
        tokenContextMenuController?.hide?.();
        return;
      }
      const token = (state.encounter?.data?.tokens || []).find(
        (item) => item.id === tokenInfo.tokenId,
      );
      if (!token) {
        tokenContextMenuController?.hide?.();
        return;
      }
      if (!canEditEncounter() && !canCurrentUserControlToken(token)) {
        tokenContextMenuController?.hide?.();
        return;
      }
      tokenContextMenuController?.open?.(tokenInfo);
    };
    state.map.canDragToken = (token) => canCurrentUserControlToken(token);
    state.map.canDragMapEffect = () => canEditEncounter();
    state.map.onMapEffectChange = (id, patch = {}) => {
      const list = state.encounter?.data?.mapEffects || [];
      const effect = list.find((item) => item.id === id);
      if (!effect) return;
      Object.assign(effect, patch || {});
      scheduleBackgroundPersist();
    };
    state.map.canDragDesignToken = () => canEditEncounter();
    state.map.onDesignTokenMove = (id, x, y) => {
      const list = state.encounter?.data?.designTokens || [];
      const token = list.find((item) => item.id === id);
      if (!token) return;
      token.x = x;
      token.y = y;
      scheduleBackgroundPersist();
    };
    state.map.onDesignTokenChange = (id, patch = {}) => {
      const list = state.encounter?.data?.designTokens || [];
      const token = list.find((item) => item.id === id);
      if (!token) return;
      Object.assign(token, patch || {});
      scheduleBackgroundPersist();
    };
    state.map.onDesignTokenSelect = () => {};
    state.map.onDesignTokenContext = (tokenInfo) => {
      if (!tokenInfo?.tokenId || !canEditEncounter()) return;
      openDesignTokenContextMenu(tokenInfo);
    };
    state.map.onEmptyContext = (info) => {
      if (!canEditEncounter()) return;
      openMapContextMenu(info);
    };
    state.map.onPing = (info) => {
      sendPing(info.cellX, info.cellY);
    };
    state.map.canEditBackground = () => canEditEncounter();
    state.map.onBackgroundChange = (nextMap) => {
      if (!state.encounter?.data) return;
      state.encounter.data.map = normalizeMapLayerData(nextMap);
      render();
      scheduleBackgroundPersist();
    };

    state.map.onSwitchToggle = (switchId) => {
      if (!state.encounter?.data) return;
      toggleSwitch(switchId);
    };

    state.map.onSwitchMove = () => {
      if (!state.encounter?.data) return;
      saveEncounter();
    };

    state.map.onLightMove = () => {
      if (!state.encounter?.data || !canEditEncounter()) return;
      saveEncounter();
    };

    state.map.onWallDoorToggle = (door) => {
      if (!state.encounter?.data || !canEditEncounter()) return;
      state.map.invalidateFog?.();
      state.map.invalidateLighting?.();
      saveEncounter();
    };

    // ── Light placement mode ──
    state._lightPlaceMode = false;
    state._lightPopover = null;
    state._lightDragId = null;

    setupMapControls();
    applyPermissionsUI();
    render();
    registerGlobalLifecycleListeners();
    return true;
  }

  function registerGlobalLifecycleListeners() {
    runtime.beforeUnloadHandler = () => stopEncounterSyncPolling();
    runtime.hashChangeHandler = () => {
      if (!window.location.hash.startsWith("#active-encounter")) {
        stopEncounterSyncPolling();
      }
    };
    window.addEventListener("beforeunload", runtime.beforeUnloadHandler);
    window.addEventListener("hashchange", runtime.hashChangeHandler);
  }

  function removeGlobalLifecycleListeners() {
    if (runtime.beforeUnloadHandler) {
      window.removeEventListener("beforeunload", runtime.beforeUnloadHandler);
      runtime.beforeUnloadHandler = null;
    }
    if (runtime.hashChangeHandler) {
      window.removeEventListener("hashchange", runtime.hashChangeHandler);
      runtime.hashChangeHandler = null;
    }
  }

  async function fetchCurrentPlayerByUserId(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("players")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("No se pudo resolver jugador actual:", error.message);
      return null;
    }
    return data || null;
  }

  function normalizeEncounterStatus(status) {
    if (status === "active") {
      return ENCOUNTER_STATUS.IN_GAME;
    }
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

  function normalizeMapLayerData(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...MAP_LAYER_DEFAULTS };
    }

    const hasGridOpacity = Object.prototype.hasOwnProperty.call(raw, "gridOpacity");
    const gridOpacity = Math.min(
      1,
      Math.max(
        0,
        hasGridOpacity ? parseFloat(raw.gridOpacity) || 0 : MAP_LAYER_DEFAULTS.gridOpacity,
      ),
    );

    return {
      backgroundPath:
        typeof raw.backgroundPath === "string" && raw.backgroundPath
          ? raw.backgroundPath
          : null,
      backgroundUrl:
        typeof raw.backgroundUrl === "string" ? raw.backgroundUrl : "",
      preserveAspect: raw.preserveAspect !== false,
      x: parseFloat(raw.x) || 0,
      y: parseFloat(raw.y) || 0,
      widthCells: Math.max(
        1,
        parseFloat(raw.widthCells) || MAP_LAYER_DEFAULTS.widthCells,
      ),
      heightCells: Math.max(
        1,
        parseFloat(raw.heightCells) || MAP_LAYER_DEFAULTS.heightCells,
      ),
      opacity: Math.min(1, Math.max(0, parseFloat(raw.opacity) || 1)),
      gridOpacity,
      showGrid: raw.showGrid !== false && gridOpacity > 0,
    };
  }

  function normalizeDesignTokensData(rawTokens) {
    if (!Array.isArray(rawTokens)) return [];

    return rawTokens
      .map((token, index) => {
        if (!token || typeof token !== "object") return null;
        const layer = token.layer === "overlay" ? "overlay" : "underlay";
        return {
          ...DESIGN_TOKEN_DEFAULTS,
          ...token,
          id: token.id || `design-token-${index}`,
          x: parseFloat(token.x) || 0,
          y: parseFloat(token.y) || 0,
          size: Math.max(0.2, parseFloat(token.size) || 1),
          widthCells:
            token.widthCells == null ? null : Math.max(0.2, parseFloat(token.widthCells) || 0),
          heightCells:
            token.heightCells == null ? null : Math.max(0.2, parseFloat(token.heightCells) || 0),
          rotationDeg: parseFloat(token.rotationDeg) || 0,
          opacity: Math.min(1, Math.max(0, parseFloat(token.opacity) || 1)),
          layer,
          zIndex: parseInt(token.zIndex, 10) || 0,
        };
      })
      .filter(Boolean);
  }

  function normalizeEncounterLayerData(data) {
    if (!data || typeof data !== "object") return;
    data.map = normalizeMapLayerData(data.map);
    data.designTokens = normalizeDesignTokensData(data.designTokens);
    data.mapEffects = normalizeMapEffectsData(data.mapEffects);
  }

  function normalizeMapEffectsData(rawEffects) {
    if (!Array.isArray(rawEffects)) return [];
    return rawEffects
      .map((effect, index) => {
        if (!effect || typeof effect !== "object") return null;
        const type = String(effect.type || "").trim();
        if (!type) return null;
        const radiusMeters = Math.max(0, parseFloat(effect.radiusMeters) || 0);
        const radiusCells = Math.max(
          0,
          parseFloat(effect.radiusCells) ||
            (radiusMeters > 0 ? radiusMeters / 1.5 : 0),
        );
        return {
          ...MAP_EFFECT_DEFAULTS,
          ...effect,
          id: effect.id || `map-effect-${type}-${index}`,
          type,
          sourceTokenId: effect.sourceTokenId || null,
          sourceInstanceId: effect.sourceInstanceId || null,
          radiusMeters,
          radiusCells,
          x: Number.isFinite(Number(effect.x)) ? Number(effect.x) : null,
          y: Number.isFinite(Number(effect.y)) ? Number(effect.y) : null,
          createdAt:
            Number.isFinite(Number(effect.createdAt)) ? Number(effect.createdAt) : null,
        };
      })
      .filter(Boolean);
  }

  function canEditEncounter() {
    return state.canManageEncounter;
  }

  function setUploadBusy(isBusy, message) {
    if (els.uploadOverlay) {
      els.uploadOverlay.classList.toggle("ae-hidden", !isBusy);
    }
    if (els.uploadMessage && typeof message === "string" && message) {
      els.uploadMessage.textContent = message;
    } else if (els.uploadMessage && !isBusy) {
      els.uploadMessage.textContent = "Subiendo imagen...";
    }

    drawerController?.setBusy(isBusy);
    if (els.browserUploadAssetBtn) {
      els.browserUploadAssetBtn.disabled = !!isBusy;
      els.browserUploadAssetBtn.style.opacity = isBusy ? "0.65" : "";
      els.browserUploadAssetBtn.style.pointerEvents = isBusy ? "none" : "";
    }
  }

  function scheduleBackgroundPersist(delayMs = 180) {
    if (state.backgroundPersistTimer) {
      clearTimeout(state.backgroundPersistTimer);
    }
    state.backgroundPersistTimer = setTimeout(() => {
      state.backgroundPersistTimer = null;
      saveEncounter();
    }, delayMs);
  }

  function canCurrentUserControlToken(token) {
    if (!token || !state.encounter?.data) return false;
    if (canEditEncounter()) return true;

    const status = normalizeEncounterStatus(state.encounter.status);
    if (status !== ENCOUNTER_STATUS.IN_GAME) return false;

    const inst = (state.encounter.data.instances || []).find(
      (i) => i.id === token.instanceId,
    );
    if (!inst) return false;

    if (inst.controllerUserId && state.user?.id) {
      return inst.controllerUserId === state.user.id;
    }

    if (!inst.isPC || !inst.characterSheetId) return false;

    const sheet = state.characterSheets.find(
      (s) => s.id === inst.characterSheetId,
    );
    return !!sheet && !!state.user && sheet.user_id === state.user.id;
  }

  function canCurrentUserOpenInstanceDetails(instance) {
    if (!instance) return false;
    if (canEditEncounter()) return true;

    const status = normalizeEncounterStatus(state.encounter?.status);
    if (status !== ENCOUNTER_STATUS.IN_GAME) return false;

    if (instance.controllerUserId && state.user?.id) {
      return instance.controllerUserId === state.user.id;
    }

    if (!instance.isPC || !instance.characterSheetId) return false;
    const sheet = state.characterSheets.find(
      (item) => item.id === instance.characterSheetId,
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

  async function unsummonInstanceViaRpc(instanceId) {
    const { error } = await supabase.rpc("unsummon_encounter_instance", {
      p_encounter_id: state.encounterId,
      p_instance_id: instanceId,
    });
    if (error) throw error;
  }

  async function persistPlayerInstanceStateViaRpc(instanceId, patch = {}) {
    const conditions =
      patch?.conditions && typeof patch.conditions === "object"
        ? patch.conditions
        : null;
    const effects =
      patch?.effects && typeof patch.effects === "object" ? patch.effects : null;
    const { error } = await supabase.rpc("patch_encounter_instance_state", {
      p_encounter_id: state.encounterId,
      p_instance_id: instanceId,
      p_conditions: conditions,
      p_effects: effects,
    });
    if (error) throw error;
  }

  function removeInstanceLocal(id) {
    const d = state.encounter?.data;
    if (!d || !id) return false;
    const prevLen = (d.instances || []).length;
    d.instances = (d.instances || []).filter((item) => item.id !== id);
    d.tokens = (d.tokens || []).filter((token) => token.instanceId !== id);
    if ((d.instances || []).length === prevLen) return false;

    if (d.activeInstanceId === id) {
      d.activeInstanceId = null;
      ensureActiveInstance();
    }
    if (state.selectedInstanceId === id) {
      closeModal();
    }
    return true;
  }

  function openTokenDetailsFromContext(tokenId) {
    if (!tokenId || !state.encounter?.data) return;
    const token = (state.encounter.data.tokens || []).find((item) => item.id === tokenId);
    if (!token?.instanceId) return;
    const instance = (state.encounter.data.instances || []).find(
      (item) => item.id === token.instanceId,
    );
    if (!instance) return;
    if (!canCurrentUserOpenInstanceDetails(instance)) return;
    openModal(instance);
  }

  async function unsummonTokenFromContext(tokenId) {
    if (!tokenId || !state.encounter?.data) return;
    const token = (state.encounter.data.tokens || []).find((item) => item.id === tokenId);
    if (!token?.instanceId) return;
    const instance = (state.encounter.data.instances || []).find(
      (item) => item.id === token.instanceId,
    );
    if (!instance?.isSummon) return;
    if (!canEditEncounter() && !canCurrentUserControlToken(token)) return;

    const ok = await ABNShared.modal.confirm(
      `¿Eliminar ${instance.name}? Esto lo quita del mapa y de iniciativa.`,
    );
    if (!ok) return;

    if (canEditEncounter()) {
      const removed = removeInstanceLocal(instance.id);
      if (!removed) return;
      render();
      saveEncounter();
      return;
    }

    try {
      await unsummonInstanceViaRpc(instance.id);
      const removed = removeInstanceLocal(instance.id);
      if (removed) render();
    } catch (error) {
      alert(error?.message || "No se pudo eliminar esta invocación.");
    }
  }

  function applyPermissionsUI() {
    const adminOnlyIds = [
      "btn-ae-next-turn",
      "btn-ae-reroll",
    ];

    const isAdmin = canEditEncounter();
    adminOnlyIds.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      el.style.display = isAdmin ? "" : "none";
    });

    const roundLabel = document.getElementById("ae-round-label");
    if (roundLabel) {
      roundLabel.style.display = isAdmin ? "none" : "";
      roundLabel.textContent = `Ronda ${state.encounter?.data?.round || 1}`;
    }

    const roundInfo = document.querySelector(".ae-round-info");
    if (roundInfo) {
      roundInfo.style.display = isAdmin ? "" : "none";
    }

    drawerController?.applyPermissions();

    const toolsToggle = document.getElementById("btn-ae-toggle-tools");
    if (toolsToggle) {
      toolsToggle.style.display = canEditEncounter() ? "flex" : "none";
    }
    const toolsDrawer = document.getElementById("ae-tools-drawer");
    if (toolsDrawer) {
      toolsDrawer.classList.remove("open");
      toolsDrawer.style.display = canEditEncounter() ? "" : "none";
    }
    if (els.layerToolbar) {
      els.layerToolbar.style.display = "flex";
    }
    if (els.layerMenuToggle) {
      els.layerMenuToggle.style.display = canEditEncounter() ? "flex" : "none";
    }
    if (els.layerMenu && !canEditEncounter()) {
      els.layerMenu.style.display = "none";
    }
    if (!canEditEncounter() && state.activeMapLayer !== "entities") {
      setActiveMapLayer("entities", { persist: false, closeMenu: true });
    }
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

  // ── Light management ──

  function generateLightId() {
    return "light-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 5);
  }

  function addLight(x, y) {
    if (!state.encounter?.data) return;
    var lights = state.encounter.data.lights || [];
    lights.push({ id: generateLightId(), x: x, y: y, radius: 4, color: "#ffcc66", intensity: 0.8 });
    state.encounter.data.lights = lights;
    if (state.map) { state.map.lights = lights; state.map.invalidateLighting?.(); state.map.draw(); }
    saveEncounter();
  }

  function updateLight(lightId, patch) {
    var lights = state.encounter?.data?.lights || [];
    var light = lights.find(function (l) { return l.id === lightId; });
    if (!light) return;
    for (var key in patch) light[key] = patch[key];
    if (state.map) { state.map.invalidateLighting?.(); state.map.draw(); }
    saveEncounter();
  }

  function removeLight(lightId) {
    if (!state.encounter?.data) return;
    state.encounter.data.lights = (state.encounter.data.lights || []).filter(function (l) { return l.id !== lightId; });
    if (state.map) { state.map.lights = state.encounter.data.lights; state.map.invalidateLighting?.(); state.map.draw(); }
    closeLightPopover();
    saveEncounter();
  }

  function findLightAt(cellX, cellY) {
    var lights = state.encounter?.data?.lights || [];
    var best = null, bestDist = 0.6; // threshold in cells
    for (var i = 0; i < lights.length; i++) {
      var l = lights[i];
      var dx = cellX - l.x, dy = cellY - l.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = l; }
    }
    return best;
  }

  function openLightPopover(light) {
    closeLightPopover();
    if (!light || !state.map) return;
    var gs = state.map.gridSize;
    var scale = state.map.scale;
    var rect = state.map.canvas.getBoundingClientRect();
    var screenX = rect.left + state.map.offsetX + light.x * gs * scale;
    var screenY = rect.top + state.map.offsetY + light.y * gs * scale;

    var pop = document.createElement("div");
    pop.className = "ae-light-popover";
    pop.innerHTML =
      '<div class="ae-light-popover-row"><label>Color</label><input type="color" id="ae-lp-color" value="' + (light.color || "#ffcc66") + '"></div>' +
      '<div class="ae-light-popover-row"><label>Radio</label><input type="range" id="ae-lp-radius" min="1" max="15" step="0.5" value="' + (light.radius || 4) + '"><span class="ae-light-range-val" id="ae-lp-radius-val">' + (light.radius || 4) + '</span></div>' +
      '<div class="ae-light-popover-row"><label>Fuerza</label><input type="range" id="ae-lp-intensity" min="0.1" max="1" step="0.05" value="' + (light.intensity != null ? light.intensity : 0.8) + '"><span class="ae-light-range-val" id="ae-lp-int-val">' + Math.round((light.intensity != null ? light.intensity : 0.8) * 100) + '%</span></div>' +
      '<button class="ae-btn ae-btn--secondary ae-btn--full" id="ae-lp-create-switch" type="button" style="margin-top:4px;">Crear interruptor</button>' +
      '<button class="ae-btn ae-btn--secondary ae-btn--full" id="ae-lp-link-switch" type="button">Vincular a interruptor</button>' +
      '<button class="ae-btn ae-btn--danger ae-btn--full" id="ae-lp-delete" type="button" style="margin-top:4px;">Eliminar luz</button>';

    pop.style.left = Math.round(Math.min(screenX + 20, window.innerWidth - 220)) + "px";
    pop.style.top = Math.round(Math.min(screenY - 60, window.innerHeight - 180)) + "px";
    document.body.appendChild(pop);
    state._lightPopover = { el: pop, lightId: light.id };

    pop.querySelector("#ae-lp-color").addEventListener("input", function (e) {
      updateLight(light.id, { color: e.target.value });
    });
    pop.querySelector("#ae-lp-radius").addEventListener("input", function (e) {
      var v = parseFloat(e.target.value); pop.querySelector("#ae-lp-radius-val").textContent = v;
      updateLight(light.id, { radius: v });
    });
    pop.querySelector("#ae-lp-intensity").addEventListener("input", function (e) {
      var v = parseFloat(e.target.value); pop.querySelector("#ae-lp-int-val").textContent = Math.round(v * 100) + "%";
      updateLight(light.id, { intensity: v });
    });
    pop.querySelector("#ae-lp-delete").addEventListener("click", function () { removeLight(light.id); });
    pop.querySelector("#ae-lp-create-switch").addEventListener("click", function () {
      closeLightPopover();
      addSwitch(light.x + 1, light.y, light.id);
    });
    pop.querySelector("#ae-lp-link-switch").addEventListener("click", function () {
      closeLightPopover();
      enterLinkMode("light", light.id);
    });

    // Close on outside click (deferred so current click doesn't trigger it)
    setTimeout(function () {
      function onOutside(e) {
        if (pop.contains(e.target)) return;
        closeLightPopover();
        document.removeEventListener("mousedown", onOutside);
      }
      document.addEventListener("mousedown", onOutside);
    }, 50);
  }

  function closeLightPopover() {
    if (state._lightPopover?.el) {
      state._lightPopover.el.remove();
    }
    state._lightPopover = null;
  }

  // ── Switch management ──

  function generateSwitchId() {
    return "sw-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 5);
  }

  function addSwitch(x, y, linkedLightId) {
    if (!state.encounter?.data) return null;
    var sw = { id: generateSwitchId(), x: x, y: y, on: true, lightIds: linkedLightId ? [linkedLightId] : [] };
    if (!state.encounter.data.switches) state.encounter.data.switches = [];
    state.encounter.data.switches.push(sw);
    if (state.map) { state.map.switches = state.encounter.data.switches; state.map.invalidateLighting?.(); state.map.draw(); }
    saveEncounter();
    return sw;
  }

  function removeSwitch(switchId) {
    if (!state.encounter?.data) return;
    state.encounter.data.switches = (state.encounter.data.switches || []).filter(function (s) { return s.id !== switchId; });
    if (state.map) { state.map.switches = state.encounter.data.switches; state.map.selectedSwitchId = null; state.map.draw(); }
    closeSwitchPopover();
    saveEncounter();
  }

  function toggleSwitch(switchId) {
    var switches = state.encounter?.data?.switches || [];
    var lights = state.encounter?.data?.lights || [];
    var sw = switches.find(function (s) { return s.id === switchId; });
    if (!sw) return;
    sw.on = !sw.on;
    (sw.lightIds || []).forEach(function (lid) {
      var light = lights.find(function (l) { return l.id === lid; });
      if (light) light.on = sw.on;
    });
    if (state.map) { state.map.invalidateLighting?.(); state.map.draw(); }
    saveEncounter();
  }

  function linkSwitchToLight(switchId, lightId) {
    var sw = (state.encounter?.data?.switches || []).find(function (s) { return s.id === switchId; });
    if (!sw) return;
    if (!sw.lightIds) sw.lightIds = [];
    if (sw.lightIds.indexOf(lightId) === -1) sw.lightIds.push(lightId);
    if (state.map) { state.map.invalidateLighting?.(); state.map.draw(); }
    saveEncounter();
  }

  function unlinkSwitchFromLight(switchId, lightId) {
    var sw = (state.encounter?.data?.switches || []).find(function (s) { return s.id === switchId; });
    if (!sw) return;
    sw.lightIds = (sw.lightIds || []).filter(function (id) { return id !== lightId; });
    if (state.map) state.map.draw();
    saveEncounter();
  }

  function findSwitchAt(cellX, cellY) {
    var switches = state.encounter?.data?.switches || [];
    var best = null, bestDist = 0.6;
    for (var i = 0; i < switches.length; i++) {
      var s = switches[i];
      var dx = cellX - s.x, dy = cellY - s.y;
      var d = Math.sqrt(dx * dx + dy * dy);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
  }

  function openSwitchPopover(sw) {
    closeSwitchPopover();
    closeLightPopover();
    if (!sw || !state.map) return;
    var gs = state.map.gridSize;
    var scale = state.map.scale;
    var rect = state.map.canvas.getBoundingClientRect();
    var screenX = rect.left + state.map.offsetX + sw.x * gs * scale;
    var screenY = rect.top + state.map.offsetY + sw.y * gs * scale;

    var lights = state.encounter?.data?.lights || [];
    var linkedLights = (sw.lightIds || []).map(function (lid) {
      return lights.find(function (l) { return l.id === lid; });
    }).filter(Boolean);

    var pop = document.createElement("div");
    pop.className = "ae-light-popover";

    var toggleLabel = sw.on !== false ? "Encendido" : "Apagado";
    var toggleClass = sw.on !== false ? "ae-btn--secondary" : "ae-btn--danger";
    var html = '<div class="ae-light-popover-row" style="justify-content:space-between;"><label>Interruptor</label>' +
      '<button id="ae-sp-toggle" class="ae-btn ' + toggleClass + '" type="button" style="padding:3px 10px;font-size:0.7rem;">' + toggleLabel + '</button></div>';

    if (linkedLights.length > 0) {
      html += '<div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Luces conectadas</div>';
      for (var i = 0; i < linkedLights.length; i++) {
        var l = linkedLights[i];
        html += '<div class="ae-light-popover-row" style="justify-content:space-between;">' +
          '<span style="font-size:0.7rem;color:#ccc;">Luz (' + (l.radius || 4) + 'c)</span>' +
          '<button class="ae-sp-unlink" data-light-id="' + l.id + '" style="background:none;border:none;color:#cf5f5f;cursor:pointer;font-size:0.8rem;" title="Desvincular">✕</button></div>';
      }
    } else {
      html += '<div style="font-size:0.68rem;color:#666;padding:4px 0;">Sin luces conectadas</div>';
    }

    html += '<button id="ae-sp-link" class="ae-btn ae-btn--secondary ae-btn--full" type="button" style="margin-top:4px;">+ Vincular luz</button>';
    html += '<button id="ae-sp-delete" class="ae-btn ae-btn--danger ae-btn--full" type="button" style="margin-top:2px;">Eliminar</button>';

    pop.innerHTML = html;
    pop.style.left = Math.round(Math.min(screenX + 20, window.innerWidth - 230)) + "px";
    pop.style.top = Math.round(Math.min(screenY - 60, window.innerHeight - 200)) + "px";
    document.body.appendChild(pop);
    state._switchPopover = { el: pop, switchId: sw.id };

    pop.querySelector("#ae-sp-toggle").addEventListener("click", function () {
      toggleSwitch(sw.id);
      openSwitchPopover(sw); // re-render
    });
    pop.querySelector("#ae-sp-link").addEventListener("click", function () {
      closeSwitchPopover();
      enterLinkMode("switch", sw.id);
    });
    pop.querySelector("#ae-sp-delete").addEventListener("click", function () { removeSwitch(sw.id); });
    pop.querySelectorAll(".ae-sp-unlink").forEach(function (btn) {
      btn.addEventListener("click", function () {
        unlinkSwitchFromLight(sw.id, btn.dataset.lightId);
        openSwitchPopover(sw); // re-render
      });
    });

    setTimeout(function () {
      function onOutside(e) {
        if (pop.contains(e.target)) return;
        closeSwitchPopover();
        document.removeEventListener("mousedown", onOutside);
      }
      document.addEventListener("mousedown", onOutside);
    }, 50);
  }

  function closeSwitchPopover() {
    if (state._switchPopover?.el) state._switchPopover.el.remove();
    state._switchPopover = null;
  }

  // ── Link mode (connect lights ↔ switches) ──

  function enterLinkMode(fromType, fromId) {
    state._linkMode = { fromType: fromType, fromId: fromId };
    state.map?.canvas?.classList.add("light-placer-active");
  }

  function exitLinkMode() {
    state._linkMode = null;
    state.map?.canvas?.classList.remove("light-placer-active");
  }

  function handleLinkModeClick(cellX, cellY) {
    if (!state._linkMode) return false;
    var mode = state._linkMode;

    if (mode.fromType === "switch") {
      // Looking for a light to link to this switch
      var light = findLightAt(cellX, cellY);
      if (light) {
        linkSwitchToLight(mode.fromId, light.id);
        exitLinkMode();
        return true;
      }
    } else if (mode.fromType === "light") {
      // Looking for a switch to link to this light
      var sw = findSwitchAt(cellX, cellY);
      if (sw) {
        linkSwitchToLight(sw.id, mode.fromId);
        exitLinkMode();
        return true;
      }
    }

    // Click on empty → cancel
    exitLinkMode();
    return true;
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

    const rulerBtn = document.getElementById("btn-ae-ruler");
    rulerBtn?.addEventListener("click", () => {
      if (!state.map || typeof state.map.setMeasurementToolActive !== "function") {
        return;
      }
      const nextActive = !state.map.measureToolActive;
      state.map.setMeasurementToolActive(nextActive);
      rulerBtn.classList.toggle("is-active", nextActive);
    });
  }

  function setupRealtimeSubscription() {
    teardownRealtimeSubscriptions();

    const characterSheetsChannel = supabase
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

    const encounterChannel = supabase
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

    state.realtimeChannels.push(characterSheetsChannel, encounterChannel);

    // Roll feed: subscribe to broadcast channel for dice roll notifications
    if (window.AERollFeed) {
      window.AERollFeed.destroy();
      window.AERollFeed.create(state.encounterId, {
        onInitiativeRoll: applyBroadcastInitiative,
      });
    }

    startEncounterSyncPolling();
  }

  function teardownRealtimeSubscriptions() {
    if (window.AERollFeed) {
      window.AERollFeed.destroy();
    }

    if (!Array.isArray(state.realtimeChannels) || state.realtimeChannels.length === 0) {
      return;
    }
    state.realtimeChannels.forEach((channel) => {
      if (!channel) return;
      try {
        channel.unsubscribe?.();
      } catch (_error) {}
      try {
        supabase.removeChannel?.(channel);
      } catch (_error) {}
    });
    state.realtimeChannels = [];
  }

  function applyRemoteEncounterUpdate(updated) {
    if (!updated || !state.encounter) return;
    // Preserve local tileMap when the tile painter is active or has pending saves
    var localTileMap = (tilePainter && tilePainter.isActive())
      ? state.encounter.data.tileMap
      : null;
    // Preserve local walls when the wall drawer is active
    var localWalls = (wallDrawer && wallDrawer.isActive())
      ? state.encounter.data.walls
      : null;
    // Preserve local fog when the fog brush is active
    var localFog = (fogBrush && fogBrush.isActive())
      ? state.encounter.data.fog
      : null;
    state.encounter.status = normalizeEncounterStatus(updated.status);
    state.encounter.data = updated.data || state.encounter.data;
    if (localTileMap) {
      state.encounter.data.tileMap = localTileMap;
    }
    if (localWalls) {
      state.encounter.data.walls = localWalls;
    }
    if (localFog) {
      state.encounter.data.fog = localFog;
    }
    if (state.encounterHasUpdatedAt && updated.updated_at) {
      state.encounterUpdatedAt = updated.updated_at;
    }
    state.lastEncounterSyncKey = buildEncounterSyncKey(updated);
    sanitizeEncounterTokens();
    ensureActiveInstance();
    // Update fog config from remote data
    if (state.map && typeof state.map.setFogConfig === "function") {
      state.map.setFogConfig(state.encounter.data.fog || null);
      state.map.invalidateFog?.();
    }
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
        .select(
          state.encounterHasUpdatedAt
            ? "id, status, data, updated_at"
            : "id, status, data",
        )
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
    if (state.backgroundPersistTimer) {
      clearTimeout(state.backgroundPersistTimer);
      state.backgroundPersistTimer = null;
    }
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
    alert("Solo el narrador de la crónica puede realizar esta acción.");
    return false;
  }

  function setupListeners() {
    document.getElementById("btn-ae-back").addEventListener("click", () => {
      navigateAway("chronicle");
    });
    document
      .getElementById("btn-ae-next-turn")
      .addEventListener("click", () => {
        if (!requireAdminAction()) return;
        nextTurn();
      });
    document.getElementById("btn-ae-reroll").addEventListener("click", async () => {
      if (!requireAdminAction()) return;
      const ok = await ABNShared.modal.confirm(
        "¿Resetear iniciativa? Esto reiniciará la ronda y mezclará el orden.",
      );
      if (ok) rerollAllInitiatives();
    });

    document
      .getElementById("ae-encounter-status")
      ?.addEventListener("change", async (event) => {
        if (!requireAdminAction()) return;
        const nextStatus = normalizeEncounterStatus(event.target?.value);
        const changed = await updateEncounterStatus(nextStatus);
        if (!changed && state.encounter) {
          event.target.value = normalizeEncounterStatus(state.encounter.status);
        }
      });

    layersController?.bindLayerMenuEvents(requireAdminAction);

    drawerController?.bindEvents();

    // Browser Modal Listeners
    document
      .getElementById("btn-ae-browser-close")
      .addEventListener("click", () => browserController?.closeBrowser());
    els.browserSearch.addEventListener("input", () => {
      browserController?.renderBrowserItems();
    });
    els.browserUploadAssetBtn?.addEventListener("click", () => {
      if (!requireAdminAction()) return;
      els.browserUploadInput?.click();
    });
    els.browserUploadInput?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      if (!requireAdminAction()) return;
      await uploadDesignAsset(file);
      event.target.value = "";
    });
    els.mapUploadBgInput?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0];
      if (!file) return;
      if (!requireAdminAction()) return;
      await uploadEncounterBackground(file);
      event.target.value = "";
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

    runtime.documentClickHandler = (e) => {
      if (
        tokenContextMenuController?.isOpen?.() &&
        !tokenContextMenuController?.contains?.(e.target)
      ) {
        tokenContextMenuController?.hide?.();
      }

      if (
        isDesignTokenMenuOpen() &&
        designTokenMenuEl &&
        !designTokenMenuEl.contains(e.target)
      ) {
        closeDesignTokenContextMenu();
      }

      if (
        isMapContextMenuOpen() &&
        mapContextMenuEl &&
        !mapContextMenuEl.contains(e.target)
      ) {
        closeMapContextMenu();
      }

      if (els.layerMenu && els.layerToolbar && !els.layerToolbar.contains(e.target)) {
        els.layerMenu.style.display = "none";
      }
    };
    runtime.documentKeydownHandler = (e) => {
      if (e.key === "Escape") {
        tokenContextMenuController?.hide?.();
        closeDesignTokenContextMenu();
        closeMapContextMenu();
      }

      if (!canEditEncounter()) return;
      if (!state.map) return;

      const target = e.target;
      const isTypingTarget =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);
      if (isTypingTarget) return;

      const isBackgroundEdit =
        state.activeMapLayer === "background" && state.map.selectedBackground;
      const isDecorEdit =
        state.activeMapLayer === "decor" && !!state.map.selectedDesignTokenId;
      if (!isBackgroundEdit && !isDecorEdit) return;

      let handled = false;
      if (e.key === "ArrowLeft") {
        handled = isBackgroundEdit
          ? state.map.nudgeBackgroundPixels(-1, 0)
          : state.map.nudgeSelectedDesignTokenPixels(-1, 0);
      } else if (e.key === "ArrowRight") {
        handled = isBackgroundEdit
          ? state.map.nudgeBackgroundPixels(1, 0)
          : state.map.nudgeSelectedDesignTokenPixels(1, 0);
      } else if (e.key === "ArrowUp") {
        handled = isBackgroundEdit
          ? state.map.nudgeBackgroundPixels(0, -1)
          : state.map.nudgeSelectedDesignTokenPixels(0, -1);
      } else if (e.key === "ArrowDown") {
        handled = isBackgroundEdit
          ? state.map.nudgeBackgroundPixels(0, 1)
          : state.map.nudgeSelectedDesignTokenPixels(0, 1);
      } else if (e.key === "+" || e.key === "=" || e.code === "NumpadAdd") {
        handled = isBackgroundEdit
          ? state.map.scaleBackgroundPixels(1)
          : state.map.scaleSelectedDesignTokenPixels(1);
      } else if (
        e.key === "-" ||
        e.key === "_" ||
        e.code === "NumpadSubtract"
      ) {
        handled = isBackgroundEdit
          ? state.map.scaleBackgroundPixels(-1)
          : state.map.scaleSelectedDesignTokenPixels(-1);
      }

      if (handled) {
        e.preventDefault();
      }
    };
    runtime.windowScrollHandler = () => {
      tokenContextMenuController?.hide?.();
    };
    document.addEventListener("click", runtime.documentClickHandler);
    document.addEventListener("keydown", runtime.documentKeydownHandler);
    window.addEventListener("scroll", runtime.windowScrollHandler, true);
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
      .or(`user_id.eq.${state.user.id},is_system.eq.true`)
      .order("name");
    if (data) {
      state.templates = data;
    }
  }

  async function loadDesignAssets() {
    if (assetsService?.loadDesignAssets) {
      await assetsService.loadDesignAssets();
      return;
    }
    state.designAssets = [];
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
    state.encounterHasUpdatedAt = Object.prototype.hasOwnProperty.call(
      data,
      "updated_at",
    );
    state.encounterUpdatedAt = state.encounterHasUpdatedAt
      ? data.updated_at || null
      : null;
    state.encounter.status = normalizeEncounterStatus(state.encounter.status);
    state.lastEncounterSyncKey = buildEncounterSyncKey(state.encounter);

    const access = await resolveEncounterAccess(state.encounter);
    state.canManageEncounter = access.canManage;
    state.canViewEncounter = access.canView;
    if (!state.canViewEncounter) {
      alert("No tienes acceso a este encuentro.");
      navigateAway("chronicle");
      return false;
    }

    if (
      !canEditEncounter() &&
      normalizeEncounterStatus(state.encounter.status) !==
        ENCOUNTER_STATUS.IN_GAME
    ) {
      alert("Este encuentro no está disponible para jugadores.");
      navigateAway("chronicle");
      return false;
    }

    // Data migration & Health Init
    if (Array.isArray(state.encounter.data)) {
      state.encounter.data = {
        instances: state.encounter.data,
        tokens: [],
        map: { ...MAP_LAYER_DEFAULTS },
        designTokens: [],
        mapEffects: [],
        round: 1,
        activeInstanceId: null,
      };
    } else if (!state.encounter.data) {
      state.encounter.data = {
        instances: [],
        tokens: [],
        map: { ...MAP_LAYER_DEFAULTS },
        designTokens: [],
        mapEffects: [],
        round: 1,
        activeInstanceId: null,
      };
    }

    // Ensure tokens array exists
    if (!state.encounter.data.tokens) {
      state.encounter.data.tokens = [];
    }
    normalizeEncounterLayerData(state.encounter.data);
    const uiLayer = state.encounter.data?.ui?.activeLayer;
    if (MAP_LAYER_LABELS[uiLayer]) {
      state.activeMapLayer = uiLayer;
    } else {
      state.activeMapLayer = "entities";
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

    // Seed timestamps so existing DB data doesn't replay animations on load
    var existingVt = state.encounter.data.viewTarget;
    if (existingVt && existingVt.ts) state.lastViewTargetTs = existingVt.ts;
    var existingPg = state.encounter.data.ping;
    if (existingPg && existingPg.ts) state.lastPingTs = existingPg.ts;

    render();
    if (changed) {
      saveEncounter();
    }
    return true;
  }

  async function resolveEncounterAccess(encounter) {
    const none = { canManage: false, canView: false };
    if (!encounter || !state.currentPlayer) return none;

    const playerId = state.currentPlayer.id;
    const encounterOwnerId = encounter.user_id || null;

    if (!encounter.chronicle_id) {
      const canLegacy = encounterOwnerId === state.user?.id;
      return { canManage: canLegacy, canView: canLegacy };
    }

    const [chronicleRes, participationRes] = await Promise.all([
      supabase
        .from("chronicles")
        .select("id, creator_id")
        .eq("id", encounter.chronicle_id)
        .maybeSingle(),
      supabase
        .from("chronicle_participants")
        .select("role")
        .eq("chronicle_id", encounter.chronicle_id)
        .eq("player_id", playerId)
        .maybeSingle(),
    ]);

    const creatorId = chronicleRes.data?.creator_id || null;
    const role = participationRes.data?.role || null;
    const isNarrator = role === "narrator" || creatorId === playerId;
    const isParticipant = Boolean(role) || creatorId === playerId;

    return { canManage: isNarrator, canView: isParticipant };
  }

  async function updateEncounterStatus(nextStatus, options = {}) {
    if (!state.encounter || !nextStatus) return;
    const prevStatus = normalizeEncounterStatus(state.encounter.status);
    if (prevStatus === nextStatus) return false;

    if (nextStatus === ENCOUNTER_STATUS.ARCHIVED && !options.skipArchiveConfirm) {
      const ok = await ABNShared.modal.confirm(
        `¿Archivar "${state.encounter?.name || "este encuentro"}"? No aparecerá en la lista de encuentros activos.`,
      );
      if (!ok) return false;
    }

    // Enforce single active encounter per chronicle
    if (nextStatus === ENCOUNTER_STATUS.IN_GAME && state.encounter.chronicle_id) {
      const { count } = await supabase
        .from("encounters")
        .select("id", { count: "exact", head: true })
        .eq("chronicle_id", state.encounter.chronicle_id)
        .eq("status", "in_game")
        .neq("id", state.encounterId);
      if (count > 0) {
        alert("Ya hay un encuentro activo en esta crónica. Archivá o sacá de juego el actual primero.");
        return false;
      }
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
      return false;
    }
    state.encounter.status = nextStatus;
    render();
    if (nextStatus === ENCOUNTER_STATUS.ARCHIVED) {
      navigateAway("chronicle");
      return true;
    }
    setTimeout(() => {
      state.isApplyingRemoteUpdate = false;
    }, 200);
    return true;
  }

  function ensureActiveInstance() {
    if (!state.encounter?.data) return;
    encounterTurns.ensureActiveInstance(state.encounter.data);
  }

  // --- RENDER ---

  function render() {
    if (!state.encounter) return;
    sanitizeEncounterTokens();

    els.name.textContent = state.encounter.name;
    const status = normalizeEncounterStatus(state.encounter.status);
    if (els.status) {
      els.status.value = status;
      els.status.className = `ae-status-chip-select ${status}`;
      els.status.disabled = !canEditEncounter();
    }
    const currentRound = state.encounter.data.round || 1;
    els.roundCounter.textContent = currentRound;
    const roundLabel = document.getElementById("ae-round-label");
    if (roundLabel && roundLabel.style.display !== "none") {
      roundLabel.textContent = `Ronda ${currentRound}`;
    }
    setActiveMapLayer(state.activeMapLayer, { persist: false, closeMenu: true });
    drawerController?.renderAssetLists();

    // Refresh Map Data
    if (state.map) {
      state.map.freeMovement = !!state.encounter.data.freeMovement;
      state.map.setInteractionLayer(state.activeMapLayer);
      const isAdmin = canEditEncounter();
      const allTokens = state.encounter.data.tokens;
      const allInstances = state.encounter.data.instances;
      const allDesignTokens = state.encounter.data.designTokens || [];

      const hiddenInstanceIds = isAdmin
        ? null
        : (function () {
            var directlyHidden = new Set(
              (allInstances || [])
                .filter((i) => i.visible === false)
                .map((i) => i.id),
            );
            (allInstances || []).forEach(function (i) {
              if (i.extraActionSourceInstanceId &&
                  directlyHidden.has(i.extraActionSourceInstanceId)) {
                directlyHidden.add(i.id);
              }
            });
            return directlyHidden;
          })();

      const mapTokens = hiddenInstanceIds
        ? allTokens.filter((t) => !hiddenInstanceIds.has(t.instanceId))
        : allTokens;
      const mapInstances = hiddenInstanceIds
        ? allInstances.filter((i) => !hiddenInstanceIds.has(i.id))
        : allInstances;
      const mapDesignTokens = isAdmin
        ? allDesignTokens
        : allDesignTokens.filter((dt) => dt.visible !== false);

      state.map.setData(mapTokens, mapInstances, {
        map: state.encounter.data.map || null,
        designTokens: mapDesignTokens,
        mapEffects: state.encounter.data.mapEffects || [],
        tileMap: state.encounter.data.tileMap || {},
        walls: state.encounter.data.walls || [],
        lights: state.encounter.data.lights || [],
        switches: state.encounter.data.switches || [],
      });
      // Keep ambient light reference in sync after remote data updates
      state.map._ambientLight = state.encounter.data.ambientLight || { color: "#8090b0", intensity: 0.5 };
      state.map.setActiveInstance(state.encounter.data.activeInstanceId);

      // Handle narrator's "Ver aquí" — pan players to target + show pin
      var vt = state.encounter.data.viewTarget;
      if (
        vt && typeof vt.x === "number" && typeof vt.y === "number" &&
        vt.ts && vt.ts !== state.lastViewTargetTs
      ) {
        state.lastViewTargetTs = vt.ts;
        if (!canEditEncounter()) {
          state.map.panToCell(vt.x, vt.y, true);
          var pinLabel = vt.narrator || "Narrador";
          setTimeout(function () {
            if (state.map) state.map.showViewPin(vt.x, vt.y, pinLabel);
          }, 550);
        }
      }

      // Handle ping — show attention indicator from any player
      var pg = state.encounter.data.ping;
      if (
        pg && typeof pg.x === "number" && typeof pg.y === "number" &&
        pg.ts && pg.ts !== state.lastPingTs
      ) {
        state.lastPingTs = pg.ts;
        state.map.showPing(pg.x, pg.y, pg.player || "Jugador");
      }
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
      const parentHidden = inst.extraActionSourceInstanceId &&
        instances.some((p) => p.id === inst.extraActionSourceInstanceId && p.visible === false);
      const isHidden = inst.visible === false || parentHidden;
      if (isHidden && !canEditEncounter()) return;

      const row = document.createElement("div");
      row.className = "ae-timeline-row";

      const isActive = activeId && inst.id === activeId;
      const isDead = isInstanceDown(inst);
      const isPC = inst.isPC === true;
      const initiativeDisplay = Math.trunc(Number(inst.initiative) || 0);

      const hpPct = (inst.health / inst.maxHealth) * 100;
      const hpClass = getHealthClass(inst.health, inst.maxHealth, inst.status);

      const isOwn = isPC && inst.characterSheetId && state.user?.id &&
        state.characterSheets.some((s) => s.id === inst.characterSheetId && s.user_id === state.user.id);
      const pcClass = isPC ? "pc" : "";
      const ownClass = isOwn ? "own" : "";
      const activeClass = isActive ? "active" : "";
      const deadClass = isDead ? "dead" : "";
      const hiddenClass = isHidden ? "narrator-hidden" : "";

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
        <div class="ae-init-bubble ${activeClass}" style="${isDead ? "visibility: hidden !important; opacity: 0;" : ""}">
          ${isDead ? "" : `<input type="number" class="init-input ae-bubble-input" value="${initiativeDisplay}" step="1">`}
        </div>

        <div class="ae-card ${activeClass} ${deadClass} ${pcClass} ${ownClass} ${hiddenClass}" data-id="${inst.id}">
          <button class="ae-btn-delete" title="Eliminar">&times;</button>
          <div class="ae-card-header">
            <div class="ae-card-title">
              <span class="ae-card-name" title="${escapeHtml(inst.name)}">${escapeHtml(inst.name)}</span>
              <span class="ae-card-code">| ${escapeHtml(inst.code)}</span>
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
        if (!canCurrentUserOpenInstanceDetails(inst)) return;
        openModal(inst);
      });

      const cardEl = row.querySelector(".ae-card");
      if (!canCurrentUserOpenInstanceDetails(inst)) {
        cardEl.style.cursor = "default";
        cardEl.style.opacity = "0.72";
        cardEl.title = "Sin permiso para ver detalle";
      }

      // Hover → highlight token on map
      cardEl.addEventListener("mouseenter", () => {
        var token = (state.encounter?.data?.tokens || []).find(
          (t) => t.instanceId === inst.id,
        );
        state.map?.setHoverFocus?.({
          type: "entity",
          instanceId: inst.id,
          tokenId: token?.id || null,
        });
      });
      cardEl.addEventListener("mouseleave", () => {
        state.map?.clearHoverFocus?.();
      });

      // Delete button
      row.querySelector(".ae-btn-delete").addEventListener("click", async (e) => {
        e.stopPropagation();
        if (!requireAdminAction()) return;
        const ok = await ABNShared.modal.confirm(`¿Eliminar ${inst.name} (${inst.code})?`);
        if (ok) removeInstance(inst.id);
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

    // Sync state to parent when running inside persiana embed
    if (state.isEmbedMode) {
      try {
        window.parent.postMessage({
          type: "abn-encounter-embed-state",
          encounterId: state.encounterId,
          encounterName: state.encounter.name,
          round: state.encounter.data.round || 1,
          activeInstanceId: state.encounter.data.activeInstanceId || null,
          instances: state.encounter.data.instances || [],
        }, "*");
      } catch (_e) {}
    }
  }

  // --- ADD NPC ---

  async function addNPC(tplId, count, options) {
    if (!canEditEncounter()) return;
    if (!tplId) return;
    count = count || 1;
    var opts = options || {};

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

      const inst = {
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
      };
      if (opts.hidden) inst.visible = false;
      instances.push(inst);

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
    const removed = removeInstanceLocal(id);
    if (!removed) return;
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

  function applyBroadcastInitiative(roll) {
    if (!state.encounter?.data?.instances) return;
    const instances = state.encounter.data.instances;
    const total = parseInt(roll.total, 10);
    if (!Number.isFinite(total)) return;

    // Match by sheetId first, fallback to character name
    let inst = null;
    if (roll.sheetId) {
      inst = instances.find(
        (i) => i.isPC && i.characterSheetId === roll.sheetId,
      );
    }
    if (!inst && roll.characterName) {
      inst = instances.find(
        (i) => i.isPC && i.name === roll.characterName,
      );
    }
    if (!inst) return;

    inst.initiative = total;
    render();
    saveEncounter();
  }

  function rerollAllInitiatives() {
    if (!canEditEncounter()) return;
    const changed = encounterTurns.rerollAllInitiatives(state.encounter?.data);
    if (!changed) return;

    ensureActiveInstance();
    render();
    saveEncounter();
  }

  // --- TURN MANAGEMENT ---

  function nextTurn() {
    if (!canEditEncounter()) return;
    const changed = encounterTurns.nextTurn(state.encounter?.data);
    if (!changed) return;
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

    ensureActiveInstance();
    render();
    if (state.selectedInstanceId === id) updateModalUI(inst);
    saveEncounter();
  }

  // --- VISIBILITY ---

  function toggleTokenVisibility(tokenId) {
    if (!canEditEncounter()) return;
    const token = (state.encounter?.data?.tokens || []).find((t) => t.id === tokenId);
    if (!token?.instanceId) return;
    const inst = (state.encounter?.data?.instances || []).find((i) => i.id === token.instanceId);
    if (!inst) return;
    inst.visible = inst.visible === false ? true : false;
    ensureActiveInstance();
    render();
    saveEncounter();
  }

  function toggleDesignTokenVisibility(tokenId) {
    if (!canEditEncounter()) return;
    const dt = (state.encounter?.data?.designTokens || []).find((t) => t.id === tokenId);
    if (!dt) return;
    dt.visible = dt.visible === false ? true : false;
    render();
    saveEncounter();
  }

  // --- DESIGN TOKEN CONTEXT MENU ---

  let designTokenMenuEl = null;

  function openDesignTokenContextMenu(tokenInfo) {
    closeDesignTokenContextMenu();
    const dt = (state.encounter?.data?.designTokens || []).find((t) => t.id === tokenInfo.tokenId);
    if (!dt) return;

    const menu = document.createElement("div");
    menu.className = "ae-token-context-menu ae-design-token-context-menu is-open";
    menu.dataset.tokenId = tokenInfo.tokenId;

    const isVisible = dt.visible !== false;
    menu.innerHTML = `
      <div class="ae-token-context-body">
        <div class="ae-token-context-primary">
          <button type="button" class="ae-token-context-action ae-token-context-action--visibility ${isVisible ? "" : "is-active"}"
            data-action="visibility">${isVisible ? "Visible" : "Oculto"}</button>
          <button type="button" class="ae-token-context-action ae-token-context-action--danger"
            data-action="delete">Borrar decorado</button>
        </div>
      </div>
    `;

    menu.addEventListener("click", (e) => {
      e.stopPropagation();
      const action = e.target.closest("[data-action]")?.dataset.action;
      if (!action) return;
      const id = menu.dataset.tokenId;
      if (action === "visibility") {
        toggleDesignTokenVisibility(id);
        const updated = (state.encounter?.data?.designTokens || []).find((t) => t.id === id);
        const btn = menu.querySelector('[data-action="visibility"]');
        if (btn && updated) {
          const vis = updated.visible !== false;
          btn.textContent = vis ? "Visible" : "Oculto";
          btn.classList.toggle("is-active", !vis);
        }
      } else if (action === "delete") {
        closeDesignTokenContextMenu();
        removeDesignToken(id);
      }
    });

    document.body.appendChild(menu);
    designTokenMenuEl = menu;

    const margin = 10;
    const menuWidth = menu.offsetWidth || 180;
    const menuHeight = menu.offsetHeight || 80;
    const left = Math.min(tokenInfo.clientX, window.innerWidth - menuWidth - margin);
    const top = Math.min(tokenInfo.clientY, window.innerHeight - menuHeight - margin);
    menu.style.left = `${Math.max(margin, left)}px`;
    menu.style.top = `${Math.max(margin, top)}px`;
  }

  function closeDesignTokenContextMenu() {
    if (designTokenMenuEl?.parentNode) {
      designTokenMenuEl.parentNode.removeChild(designTokenMenuEl);
    }
    designTokenMenuEl = null;
  }

  function isDesignTokenMenuOpen() {
    return !!designTokenMenuEl;
  }

  function removeDesignToken(tokenId) {
    if (!canEditEncounter()) return;
    const list = state.encounter?.data?.designTokens;
    if (!Array.isArray(list)) return;
    const idx = list.findIndex((t) => t.id === tokenId);
    if (idx === -1) return;
    list.splice(idx, 1);
    render();
    saveEncounter();
  }

  // --- MAP CONTEXT MENU ("Ver aqui") ---

  let mapContextMenuEl = null;

  function openMapContextMenu(info) {
    closeMapContextMenu();

    const menu = document.createElement("div");
    menu.className = "ae-token-context-menu ae-map-context-menu is-open";

    menu.innerHTML =
      '<div class="ae-token-context-body">' +
      '<div class="ae-token-context-primary">' +
      '<button type="button" class="ae-token-context-action ae-token-context-action--viewhere" ' +
      'data-action="viewhere">Ver aquí</button>' +
      "</div></div>";

    menu.addEventListener("click", function (e) {
      e.stopPropagation();
      var action = e.target.closest("[data-action]")?.dataset.action;
      if (action === "viewhere") {
        closeMapContextMenu();
        setViewTarget(info.cellX, info.cellY);
      }
    });

    document.body.appendChild(menu);
    mapContextMenuEl = menu;

    var margin = 10;
    var menuWidth = menu.offsetWidth || 160;
    var menuHeight = menu.offsetHeight || 44;
    var left = Math.min(info.clientX, window.innerWidth - menuWidth - margin);
    var top = Math.min(info.clientY, window.innerHeight - menuHeight - margin);
    menu.style.left = Math.max(margin, left) + "px";
    menu.style.top = Math.max(margin, top) + "px";
  }

  function closeMapContextMenu() {
    if (mapContextMenuEl?.parentNode) {
      mapContextMenuEl.parentNode.removeChild(mapContextMenuEl);
    }
    mapContextMenuEl = null;
  }

  function isMapContextMenuOpen() {
    return !!mapContextMenuEl;
  }

  function setViewTarget(cellX, cellY) {
    if (!state.encounter?.data) return;
    var narratorName = state.currentPlayer?.name || "Narrador";
    state.encounter.data.viewTarget = {
      x: cellX, y: cellY, ts: Date.now(), narrator: narratorName,
    };
    saveEncounter();
    if (state.map) {
      state.map.showViewPin(cellX, cellY, narratorName);
    }
  }

  var _pingCooldownUntil = 0;

  function sendPing(cellX, cellY) {
    if (!state.encounter?.data || !state.encounterId) return;
    if (Date.now() < _pingCooldownUntil) return;
    _pingCooldownUntil = Date.now() + 3000;
    var playerName = state.currentPlayer?.name || "Jugador";
    var ts = Date.now();
    state.encounter.data.ping = {
      x: cellX, y: cellY, ts: ts, player: playerName,
    };
    state.lastPingTs = ts;
    if (state.map) {
      state.map.showPing(cellX, cellY, playerName);
    }
    supabase.rpc("send_encounter_ping", {
      p_encounter_id: state.encounterId,
      p_x: cellX,
      p_y: cellY,
      p_player: playerName,
      p_ts: ts,
    }).then(function (res) {
      if (res.error) console.warn("Ping error:", res.error.message);
    });
  }

  // --- ENTITY BROWSER ---

  function openBrowser(mode) {
    browserController?.openBrowser(mode);
  }

  function setActiveMapLayer(layer, options = {}) {
    if (layersController?.setActiveMapLayer) {
      layersController.setActiveMapLayer(layer, options);
      return;
    }
    state.activeMapLayer = MAP_LAYER_LABELS[layer] ? layer : "entities";
  }

  function closeBrowser() {
    browserController?.closeBrowser();
  }

  function collectAllTags() {
    return [];
  }

  function renderBrowserTags() {
    browserController?.renderBrowserTags();
  }

  function renderBrowserItems() {
    browserController?.renderBrowserItems();
  }

  function renderDecorBrowser(search, activeTags) {
    browserController?.renderBrowserItems();
  }

  function renderNPCBrowser(search, activeTags) {
    browserController?.renderBrowserItems();
  }

  function renderPCBrowser(search) {
    browserController?.renderBrowserItems();
  }

  function getEncounterAssetPublicUrl(path) {
    return assetsService?.getEncounterAssetPublicUrl(path) || "";
  }

  async function uploadEncounterBackground(file) {
    if (assetsService?.uploadEncounterBackground) {
      await assetsService.uploadEncounterBackground(file);
    }
  }

  async function removeEncounterBackground() {
    if (assetsService?.removeEncounterBackground) {
      await assetsService.removeEncounterBackground();
    }
  }

  async function uploadDesignAsset(file) {
    if (assetsService?.uploadDesignAsset) {
      await assetsService.uploadDesignAsset(file, () => {
        browserController?.renderBrowserTags();
        browserController?.renderBrowserItems();
      });
    }
  }

  function addDesignTokenFromAsset(assetId) {
    assetsService?.addDesignTokenFromAsset(assetId);
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
    const clanName = charData.clan ? `, del Clan ${escapeHtml(charData.clan)}` : "";
    els.modalTitle.innerHTML = `<span class="ae-title-name">${escapeHtml(inst.name)}${clanName}</span> <span class="ae-pc-badge">PJ</span>`;

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
    const prevText = btn?.textContent || "";
    if (btn) btn.textContent = "Guardando...";

    // Remove runtime-only image objects before persisting.
    const cleanData = {
      ...state.encounter.data,
      map: normalizeMapLayerData(state.encounter.data.map),
      tokens: (state.encounter.data.tokens || []).map(({ img, ...token }) => ({
        ...token,
      })),
      designTokens: normalizeDesignTokensData(
        (state.encounter.data.designTokens || []).map(({ img, ...token }) => ({
          ...token,
        })),
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
    let error = null;

    if (state.encounterHasUpdatedAt) {
      let query = supabase
        .from("encounters")
        .update({ data: cleanData })
        .eq("id", state.encounterId);

      if (state.encounterUpdatedAt) {
        query = query.eq("updated_at", state.encounterUpdatedAt);
      }

      const { data, error: updateErr } = await query
        .select("updated_at")
        .maybeSingle();
      error = updateErr || null;

      if (!error) {
        if (state.encounterUpdatedAt && !data) {
          alert(
            "Otro usuario actualizó este encuentro antes. Refresca y vuelve a intentar.",
          );
          await loadEncounterData();
          if (btn) btn.textContent = prevText;
          state.isApplyingRemoteUpdate = false;
          return;
        }
        if (data?.updated_at) {
          state.encounterUpdatedAt = data.updated_at;
        }
      }
    } else {
      const { error: updateErr } = await supabase
        .from("encounters")
        .update({ data: cleanData })
        .eq("id", state.encounterId);
      error = updateErr || null;
    }

    if (error) alert("Error: " + error.message);

    if (btn) {
      btn.textContent = "Guardado";
      setTimeout(() => (btn.textContent = prevText), 1000);
    }
    setTimeout(() => {
      state.isApplyingRemoteUpdate = false;
    }, 200);
  }

  function teardownGlobalDocumentListeners() {
    if (runtime.documentClickHandler) {
      document.removeEventListener("click", runtime.documentClickHandler);
      runtime.documentClickHandler = null;
    }
    if (runtime.documentKeydownHandler) {
      document.removeEventListener("keydown", runtime.documentKeydownHandler);
      runtime.documentKeydownHandler = null;
    }
    if (runtime.windowScrollHandler) {
      window.removeEventListener("scroll", runtime.windowScrollHandler, true);
      runtime.windowScrollHandler = null;
    }
  }

  function teardownEncounterView() {
    stopEncounterSyncPolling();
    teardownRealtimeSubscriptions();
    teardownGlobalDocumentListeners();
    removeGlobalLifecycleListeners();
    tokenContextMenuController?.destroy?.();
    tokenContextMenuController = null;
    closeDesignTokenContextMenu();
    closeMapContextMenu();
    tokenActionsController = null;

    if (state.map && typeof state.map.destroy === "function") {
      state.map.destroy();
    }
    state.map = null;
    state.selectedInstanceId = null;
    state.selectedTokenId = null;
  }

  // --- UTILITIES ---

  function calculateInitiative(data) {
    return encounterTurns.calculateInitiative(data);
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
    return encounterTurns.isInstanceDown(inst);
  }

  async function boot() {
    if (runtime.isBooted) return;
    runtime.isBooted = true;
    try {
      const ok = await init();
      if (!ok) {
        runtime.isBooted = false;
      }
    } catch (error) {
      runtime.isBooted = false;
      throw error;
    }
  }

  function destroy() {
    teardownEncounterView();
    runtime.isBooted = false;
  }

  window.__ActiveEncounterFeatureModule = { boot, destroy };
})();
