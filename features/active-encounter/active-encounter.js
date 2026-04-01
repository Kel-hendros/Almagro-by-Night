(function () {
  const state = {
    encounterId: null,
    encounter: null,
    templates: [],
    characterSheets: [],
    characterSheetsLoaded: false,
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
    encounterViewState: null,
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
  const DEFAULT_ENCOUNTER_VIEW_STATE = Object.freeze({
    activeLayer: "entities",
    toolsDrawerOpen: false,
    timelineCollapsed: false,
    mapTransform: null,
  });
  const DEFAULT_EDITOR_GRID_STATE = Object.freeze({
    enabled: false,
    spacing: 1,
    offsetX: 0,
    offsetY: 0,
  });
  const MAP_EFFECT_DEFAULTS = {
    id: "",
    type: "",
    geometry: "circle",
    sourceTokenId: null,
    sourceInstanceId: null,
    radiusMeters: 0,
    radiusCells: 0,
    createdAt: null,
  };
  const MAP_METERS_PER_UNIT = 1.5;
  const encounterTurns = window.AEEncounterTurns;
  let layersController = null;
  let assetsService = null;
  let browserController = null;
  let drawerController = null;
  let tilePainter = null;
  let wallDrawer = null;
  let paperWallEditor = null;
  let tokenActionsController = null;
  let tokenContextMenuController = null;
  let persistenceController = null;
  let designTokenMenuController = null;
  let mapContextMenuController = null;
  let markerContextMenuController = null;
  let wallContextMenuController = null;
  let elementsToolbarController = null;
  let modalController = null;

  // PC_ATTR_MAP & PC_ABILITY_MAP — moved to modal/instance-modal.js
  const PC_ATTR_MAP = window.AEInstanceModal?.PC_ATTR_MAP || {};
  const PC_ABILITY_MAP = window.AEInstanceModal?.PC_ABILITY_MAP || {};

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

  function createDefaultEncounterViewState() {
    return {
      activeLayer: DEFAULT_ENCOUNTER_VIEW_STATE.activeLayer,
      toolsDrawerOpen: DEFAULT_ENCOUNTER_VIEW_STATE.toolsDrawerOpen,
      timelineCollapsed: DEFAULT_ENCOUNTER_VIEW_STATE.timelineCollapsed,
      mapTransform: null,
      editorGrid: { ...DEFAULT_EDITOR_GRID_STATE },
    };
  }

  function sanitizeEditorGridState(raw) {
    const base = { ...DEFAULT_EDITOR_GRID_STATE };
    if (!raw || typeof raw !== "object") return base;

    base.enabled = raw.enabled === true;
    if (Number.isFinite(raw.spacing) && raw.spacing > 0) {
      base.spacing = raw.spacing;
    }
    if (Number.isFinite(raw.offsetX)) {
      base.offsetX = raw.offsetX;
    }
    if (Number.isFinite(raw.offsetY)) {
      base.offsetY = raw.offsetY;
    }
    return base;
  }

  function getEncounterViewStateStorageKey() {
    if (!state.user?.id || !state.encounterId) return null;
    return `abn:encounter-view:${state.user.id}:${state.encounterId}`;
  }

  function sanitizeEncounterViewState(raw) {
    const base = createDefaultEncounterViewState();
    if (!raw || typeof raw !== "object") return base;

    if (MAP_LAYER_LABELS[raw.activeLayer]) {
      base.activeLayer = raw.activeLayer;
    }
    base.toolsDrawerOpen = raw.toolsDrawerOpen === true;
    base.timelineCollapsed = raw.timelineCollapsed === true;

    const transform = raw.mapTransform;
    if (
      transform &&
      Number.isFinite(transform.scale) &&
      transform.scale > 0 &&
      Number.isFinite(transform.offsetX) &&
      Number.isFinite(transform.offsetY)
    ) {
      base.mapTransform = {
        scale: transform.scale,
        offsetX: transform.offsetX,
        offsetY: transform.offsetY,
      };
    }

    base.editorGrid = sanitizeEditorGridState(raw.editorGrid);

    return base;
  }

  function loadEncounterViewState() {
    const key = getEncounterViewStateStorageKey();
    const fallback = createDefaultEncounterViewState();
    if (!key) {
      state.encounterViewState = fallback;
      return fallback;
    }

    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? JSON.parse(raw) : null;
      const nextState = sanitizeEncounterViewState(parsed);
      state.encounterViewState = nextState;
      return nextState;
    } catch (_error) {
      state.encounterViewState = fallback;
      return fallback;
    }
  }

  function persistEncounterViewState(patch = {}) {
    const key = getEncounterViewStateStorageKey();
    const nextState = sanitizeEncounterViewState({
      ...(state.encounterViewState || createDefaultEncounterViewState()),
      ...(patch || {}),
    });
    state.encounterViewState = nextState;
    if (!key) return nextState;

    try {
      window.localStorage.setItem(key, JSON.stringify(nextState));
    } catch (_error) {}
    return nextState;
  }

  function scheduleEncounterViewStatePersist(patch = {}, delayMs = 120) {
    const nextState = sanitizeEncounterViewState({
      ...(state.encounterViewState || createDefaultEncounterViewState()),
      ...(patch || {}),
    });
    state.encounterViewState = nextState;

    const key = getEncounterViewStateStorageKey();
    if (!key) return nextState;

    if (runtime.encounterViewPersistTimer) {
      clearTimeout(runtime.encounterViewPersistTimer);
    }
    runtime.encounterViewPersistTimer = setTimeout(function () {
      runtime.encounterViewPersistTimer = null;
      try {
        window.localStorage.setItem(key, JSON.stringify(state.encounterViewState || nextState));
      } catch (_error) {}
    }, Math.max(0, delayMs));
    return nextState;
  }

  function setToolsDrawerOpen(isOpen) {
    const drawer = document.getElementById("ae-tools-drawer");
    if (!drawer) return;
    drawer.classList.toggle("open", !!isOpen && canEditEncounter());
  }

  function setTimelineCollapsed(isCollapsed) {
    const timelineSidebar = document.querySelector(".ae-timeline-sidebar");
    const timelineToggle = document.getElementById("btn-ae-toggle-timeline");
    if (timelineSidebar) {
      timelineSidebar.classList.toggle("collapsed", !!isCollapsed);
    }
    if (timelineToggle) {
      timelineToggle.classList.toggle("is-collapsed", !!isCollapsed);
    }
  }

  function restoreEncounterChromeState() {
    const viewState = state.encounterViewState || createDefaultEncounterViewState();
    setToolsDrawerOpen(viewState.toolsDrawerOpen);
    setTimelineCollapsed(viewState.timelineCollapsed);
  }

  function restoreEncounterMapTransform() {
    const map = state.map;
    const transform = state.encounterViewState?.mapTransform;
    if (!map || !transform) return;
    map.scale = transform.scale;
    map.offsetX = transform.offsetX;
    map.offsetY = transform.offsetY;
    map.draw();
  }

  function setupEncounterViewPersistence() {
    if (runtime.encounterViewPersistenceBound) return;
    runtime.encounterViewPersistenceBound = true;

    document.addEventListener("ae-map-transform", function (event) {
      const detail = event?.detail || {};
      if (
        !Number.isFinite(detail.scale) ||
        !Number.isFinite(detail.offsetX) ||
        !Number.isFinite(detail.offsetY)
      ) {
        return;
      }
      scheduleEncounterViewStatePersist({
        mapTransform: {
          scale: detail.scale,
          offsetX: detail.offsetX,
          offsetY: detail.offsetY,
        },
      });
    });

    document.addEventListener("ae-layer-change", function (event) {
      const layer = event?.detail?.layer;
      if (!MAP_LAYER_LABELS[layer]) return;
      persistEncounterViewState({ activeLayer: layer });
    });

    const toolsDrawer = document.getElementById("ae-tools-drawer");
    if (toolsDrawer && typeof MutationObserver !== "undefined") {
      runtime.toolsDrawerObserver = new MutationObserver(function () {
        persistEncounterViewState({
          toolsDrawerOpen: toolsDrawer.classList.contains("open"),
        });
      });
      runtime.toolsDrawerObserver.observe(toolsDrawer, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }

    const timelineSidebar = document.querySelector(".ae-timeline-sidebar");
    if (timelineSidebar && typeof MutationObserver !== "undefined") {
      runtime.timelineSidebarObserver = new MutationObserver(function () {
        persistEncounterViewState({
          timelineCollapsed: timelineSidebar.classList.contains("collapsed"),
        });
      });
      runtime.timelineSidebarObserver.observe(timelineSidebar, {
        attributes: true,
        attributeFilter: ["class"],
      });
    }
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
    loadEncounterViewState();

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

    persistenceController = window.AEEncounterPersistence?.createController?.({
      state,
      supabase,
      canEditEncounter,
      pruneEncounterRoster: () => pruneEncounterRoster(),
      normalizeMapLayerData,
      normalizeDesignTokensData,
      normalizeMapEffectsData,
      loadEncounterData: () => loadEncounterData(),
    });
    designTokenMenuController = window.AEDesignTokenMenu?.createController?.({
      getEncounterData: () => state.encounter?.data,
      canEditEncounter,
      render: () => render(),
      saveEncounter: () => saveEncounter(),
    });
    mapContextMenuController = window.AEMapContextMenu?.createController?.({
      state,
      supabase,
      saveEncounter: () => saveEncounter(),
      getMap: () => state.map,
    });
    markerContextMenuController = window.AEMarkerContextMenu?.createController?.({
      state,
      canEditEncounter,
      getMap: () => state.map,
      getLightSwitchManager: () => lightSwitchManager,
      updateEncounterWallSegment: (wallId, updater, options) =>
        updateEncounterWallSegment(wallId, updater, options),
      saveEncounter: () => saveEncounter(),
    });
    wallContextMenuController = window.AEWallContextMenu?.createController?.({
      state,
      canEditEncounter,
      getMap: () => state.map,
      getWallDrawer: () => wallDrawer,
      getPaperEditor: () => paperWallEditor,
      saveEncounter: () => saveEncounter(),
    });
    elementsToolbarController = window.AEElementsToolbar?.createController?.({
      getWallDrawer: () => wallDrawer,
      getPaperEditor: () => paperWallEditor,
      getMap: () => state.map,
      canEditEncounter,
      saveEncounter: () => saveEncounter(),
    });
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
    lightSwitchManager = window.AELightSwitchManager?.createManager?.({
      getEncounterData: () => state.encounter?.data,
      getMap: () => state.map,
      saveEncounter: () => saveEncounter(),
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
      addLight: (x, y) => lightSwitchManager?.addLight(x, y),
      findLightAt: (x, y) => lightSwitchManager?.findLightAt(x, y),
      removeLight: (id) => lightSwitchManager?.removeLight(id),
      handleLinkModeClick: (x, y, options) => lightSwitchManager?.handleLinkModeClick(x, y, options),
      isLinkMode: () => lightSwitchManager?.isLinkMode() || false,
    });
    modalController = window.AEInstanceModal?.createController?.({
      state,
      els,
      canEditEncounter,
      ensureActiveInstance: () => ensureActiveInstance(),
      render: () => render(),
      saveEncounter: () => saveEncounter(),
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

    syncController = window.AEEncounterSync?.createController?.({
      state,
      els,
      supabase,
      canEditEncounter,
      normalizeEncounterStatus,
      loadCharacterSheets: () => loadCharacterSheets(),
      pruneEncounterRoster: () => pruneEncounterRoster(),
      sanitizeEncounterTokens: () => sanitizeEncounterTokens(),
      ensureActiveInstance: () => ensureActiveInstance(),
      render: () => render(),
      openModal: (inst) => openModal(inst),
      getTilePainter: () => tilePainter,
      getWallDrawer: () => wallDrawer,
      getPaperEditor: () => paperWallEditor,
      getApplyBroadcastInitiative: () => applyBroadcastInitiative,
    });
    instanceManager = window.AEInstanceManager?.createController?.({
      state,
      canEditEncounter,
      removeInstanceLocal: (id) => removeInstanceLocal(id),
      render: () => render(),
      saveEncounter: () => saveEncounter(),
      encounterTurns,
      extractPCHealth: (charData) => extractPCHealth(charData),
    });

    setupListeners();

    const ok = await loadEncounterData();
    if (!ok) return false;
    if (MAP_LAYER_LABELS[state.encounterViewState?.activeLayer]) {
      state.activeMapLayer = state.encounterViewState.activeLayer;
    }
    restoreEncounterChromeState();
    await loadCharacterSheets();
    const rosterResult = pruneEncounterRoster();
    syncEncounterPCDataFromSheets();
    render();
    if (rosterResult.changed && canEditEncounter()) {
      await saveEncounter();
    }
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
    ensureEncounterWallData(state.encounter.data);
    if (!Array.isArray(state.encounter.data.lights)) {
      state.encounter.data.lights = [];
    }
    if (!Array.isArray(state.encounter.data.switches)) {
      state.encounter.data.switches = [];
    }
    if (!state.encounter.data.ambientLight) {
      state.encounter.data.ambientLight = { color: "#8090b0", intensity: 0.5, tintStrength: 0.35 };
    } else if (state.encounter.data.ambientLight.tintStrength == null) {
      state.encounter.data.ambientLight.tintStrength = 0.35;
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
    state.map._elementsEditorGrid = sanitizeEditorGridState(state.encounterViewState?.editorGrid);
    restoreEncounterMapTransform();

    // Init Tile Painter (narrator only)
    if (window.TilePainter) {
      tilePainter = window.TilePainter.createTilePainter({
        getMap: () => state.map,
        getTileMap: () => state.encounter?.data?.tileMap || {},
        setTileMap: (newMap) => {
          if (state.encounter?.data) {
            state.encounter.data.tileMap = newMap;
            if (state.map) {
              state.map.tileMap = newMap;
              state.map.invalidateTileRenderCache?.();
            }
          }
        },
        onChanged: () => saveEncounter(),
        onSelectionChange: () => {
          document.dispatchEvent(new CustomEvent("ae-terrain-selection-change"));
        },
      });
      state.map._tilePainter = tilePainter;
    }

    wallDrawer = null;
    state.map._wallDrawer = null;

    // Init Paper.js Wall Editor (for elements layer editing)
    if (window.PaperWallEditor) {
      var mapContainer = document.getElementById("ae-map-container");
      paperWallEditor = window.PaperWallEditor.createEditor({
        container: mapContainer,
        getWallPaths: () => state.encounter?.data?.wallPaths || [],
        setWallPaths: (wallPaths) => {
          if (state.encounter?.data) {
            state.encounter.data.wallPaths = window.AEWallPaths?.normalizeWallPaths?.(wallPaths || []) || [];
          }
        },
        setWalls: (walls) => {
          if (state.encounter?.data) {
            var previousWalls = state.map?.walls || state.encounter.data.walls || [];
            state.encounter.data.walls = walls;
            if (state.map) {
              state.map.walls = walls;
              if (typeof state.map._updateWallSpatialIndex === "function") {
                state.map._updateWallSpatialIndex(previousWalls, walls);
              }
            }
          }
        },
        onChanged: () => {
          state.map?.invalidateFog?.();
          state.map?.invalidateLightingWalls?.();
          state.map?.draw();
          saveEncounter();
        },
        getTransform: () => ({
          scale: state.map?.scale || 1,
          offsetX: state.map?.offsetX || 0,
          offsetY: state.map?.offsetY || 0,
          gridSize: state.map?.gridSize || 40,
        }),
        getGridState: () => sanitizeEditorGridState(state.encounterViewState?.editorGrid),
        onGridStateChange: (gridState) => {
          const nextGridState = sanitizeEditorGridState(gridState);
          persistEncounterViewState({
            editorGrid: nextGridState,
          });
          if (state.map) {
            state.map._elementsEditorGrid = nextGridState;
          }
        },
        getInteractiveMarkerAt: (x, y) => {
          if (!state.map || state.activeMapLayer !== "elements") return null;
          return typeof state.map.getMarkerAt === "function"
            ? state.map.getMarkerAt(x, y)
            : null;
        },
        clearInteractiveMarkerSelection: () => {
          if (!state.map) return;
          if (!state.map.selectedLightId && !state.map.selectedSwitchId) return;
          state.map.selectedLightId = null;
          state.map.selectedSwitchId = null;
          state.map.invalidateLighting?.();
          state.map.draw?.();
        },
        // Start panning on the map directly
        onStartPan: (clientX, clientY) => {
          if (state.map) {
            if (typeof state.map.startPan === "function") {
              state.map.startPan(clientX, clientY);
            } else {
              state.map.isPanning = true;
              state.map.dragStart = { x: clientX, y: clientY };
            }
          }
        },
        // Context menu for vertices/walls
        onWallContext: (info) => {
          if (!canEditEncounter()) return;

          // Convert Paper.js info to context menu format
          if (info.type === "vertex") {
            wallContextMenuController?.open({
              type: "vertex",
              vertex: { x: info.point.x, y: info.point.y },
              clientX: info.clientX,
              clientY: info.clientY,
              // Paper.js objects for manipulation
              _paperSegment: info.segment,
              _paperPath: info.path
            });
          } else if (info.type === "wall") {
            wallContextMenuController?.open({
              type: "wall",
              wall: info.wall || null,
              curveIndex: info.curveIndex,
              curveType: info.curveType,
              isDoorOpen: info.isDoorOpen,
              cellX: info.location?.point?.x,
              cellY: info.location?.point?.y,
              clientX: info.clientX,
              clientY: info.clientY,
              // Paper.js objects for manipulation
              _paperPath: info.path,
              _paperLocation: info.location
            });
          }
        },
      });
    }

    // Ambient light reference on the map (always use the encounter data object)
    state.map._ambientLight = state.encounter.data.ambientLight;

    // Init Fog of War
    if (!state.encounter.data.fog) {
      state.encounter.data.fog = {
        enabled: false,
        mode: "auto",
        revealedAreas: [],
        hiddenAreas: [],
        exploredAreas: [],
        exploredBy: {},
        resetVersion: 0,
      };
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

    state.map.setActiveInstance(
      state.encounter?.data?.activeInstanceId || null,
    );
    state.map.setInteractionLayer(state.activeMapLayer);
    // Live drag broadcast — all participants see token movement in real-time
    if (window.AETokenDragBroadcast && state.encounterId && state.user) {
      dragBroadcast?.destroy?.();
      dragBroadcast = window.AETokenDragBroadcast.create(state.encounterId, {
        supabase: window.supabase,
        getMap: () => state.map,
        userId: state.user.id,
      });
      state.map.onTokenDrag = (tokenId, x, y) => {
        dragBroadcast?.broadcastDrag(tokenId, x, y);
      };
      state.map.onTokenDragEnd = (tokenId, x, y) => {
        dragBroadcast?.broadcastDragEnd(tokenId, x, y);
      };
    }

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
          state._playerInteractionUntil = Date.now() + 3000;
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
    state.map.canDragMapEffect = (effect) => canCurrentUserControlMapEffect(effect);
    state.map.onMapEffectChange = async (id, patch = {}, oldX, oldY) => {
      const list = state.encounter?.data?.mapEffects || [];
      const effect = list.find((item) => item.id === id);
      if (!effect) return;

      const prevX =
        oldX != null ? oldX : Number.isFinite(Number(effect.x)) ? Number(effect.x) : null;
      const prevY =
        oldY != null ? oldY : Number.isFinite(Number(effect.y)) ? Number(effect.y) : null;
      const applyWallSync = () => {
        if (isNightShroudEffect(effect)) {
          syncEncounterWalls({
            invalidateFog: true,
            invalidateFogWalls: true,
            invalidateLightingWalls: true,
            draw: true,
          });
          return;
        }
        state.map?.draw?.();
      };

      if (!canCurrentUserControlMapEffect(effect)) {
        effect.x = prevX;
        effect.y = prevY;
        applyWallSync();
        return;
      }

      Object.assign(effect, patch || {});
      applyWallSync();

      if (canEditEncounter()) {
        scheduleBackgroundPersist();
        return;
      }

      try {
        state._playerInteractionUntil = Date.now() + 3000;
        await moveMapEffectViaRpc(id, effect.x, effect.y);
      } catch (err) {
        effect.x = prevX;
        effect.y = prevY;
        applyWallSync();
        alert(err?.message || "No tienes permisos para mover este efecto.");
      }
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
      designTokenMenuController?.open(tokenInfo);
    };
    state.map.onEmptyContext = (info) => {
      if (!canEditEncounter()) return;
      // Only show context menu in entities layer
      if (state.activeMapLayer !== "entities") return;
      mapContextMenuController?.open(info);
    };
    state.map.onMarkerContext = (info) => {
      if (!canEditEncounter()) return;
      const isElementsLayer = state.activeMapLayer === "elements";
      const isEntitiesLayer = state.activeMapLayer === "entities";
      const isLightMarker = info?.type === "light" || info?.type === "switch";
      if (isLightMarker) {
        if (!isElementsLayer) return;
      } else if (!isEntitiesLayer) {
        return;
      }
      markerContextMenuController?.open(info);
    };
    state.map.onWallContext = (info) => {
      if (!canEditEncounter()) return;
      // Only show wall context menu in elements layer
      if (state.activeMapLayer !== "elements") return;
      wallContextMenuController?.open(info);
    };
    state.map.onPing = (info) => {
      mapContextMenuController?.sendPing(info.cellX, info.cellY);
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
      // Player proximity check
      if (!canEditEncounter()) {
        var sw = (state.encounter.data.switches || []).find(s => s.id === switchId);
        if (!sw || !isPlayerNearPosition(sw.x, sw.y, PLAYER_INTERACT_RANGE)) return;
      }
      lightSwitchManager?.toggleSwitch(switchId);
      // Player: persist via RPC (saveEncounter is a no-op for players)
      if (!canEditEncounter()) {
        state._playerInteractionUntil = Date.now() + 3000;
        window.supabase.rpc('toggle_encounter_switch', {
          p_encounter_id: state.encounterId,
          p_switch_id: switchId,
        }).then(result => {
          if (result.error) console.error('Switch toggle RPC failed:', result.error);
        });
      }
    };

    state.map.onSwitchMove = () => {
      if (!state.encounter?.data) return;
      saveEncounter();
    };

    state.map.onLinkModeClick = (x, y) => {
      lightSwitchManager?.handleLinkModeClick(x, y);
    };
    state.map.onLinkModeHover = (x, y) => {
      lightSwitchManager?.updateLinkModePointer(x, y);
    };
    state.map.isLinkModeActive = () => lightSwitchManager?.isLinkMode() || false;

    state.map.onCreateLight = (x, y) => {
      if (!state.encounter?.data || !canEditEncounter()) return;
      lightSwitchManager?.addLight(x, y);
    };

    state.map.onCreateSwitch = (x, y) => {
      if (!state.encounter?.data || !canEditEncounter()) return;
      lightSwitchManager?.addSwitch(x, y);
    };

    state.map.onLightMove = (light) => {
      if (!state.encounter?.data || !canEditEncounter()) return;
      state._lightDragId = light?.id || null;
      state._lightLocalChangeUntil = Date.now() + 1800;
      saveEncounter();
    };

    state.map.onWallDoorToggle = (door) => {
      if (!state.encounter?.data) return;
      updateEncounterWallSegment(door.id, function (segment) {
        segment.doorOpen = !!door.doorOpen;
        return segment;
      }, { draw: false });
      // Player checks — revert if locked or too far (tryToggleDoor already mutated)
      if (!canEditEncounter()) {
        if (door.locked) {
          door.doorOpen = !door.doorOpen;
          updateEncounterWallSegment(door.id, function (segment) {
            segment.doorOpen = !!door.doorOpen;
            return segment;
          }, { draw: false });
          state.map.draw();
          return;
        }
        var midX = (door.x1 + door.x2) / 2;
        var midY = (door.y1 + door.y2) / 2;
        if (!isPlayerNearPosition(midX, midY, PLAYER_INTERACT_RANGE)) {
          door.doorOpen = !door.doorOpen;
          updateEncounterWallSegment(door.id, function (segment) {
            segment.doorOpen = !!door.doorOpen;
            return segment;
          }, { draw: false });
          state.map.draw();
          return;
        }
      }
      // Use wall-specific invalidation for better cache performance
      if (typeof state.map.invalidateFogWalls === "function") {
        state.map.invalidateFogWalls();
      } else {
        state.map.invalidateFog?.();
      }
      if (typeof state.map.invalidateLightingWalls === "function") {
        state.map.invalidateLightingWalls();
      } else {
        state.map.invalidateLighting?.();
      }
      if (canEditEncounter()) {
        saveEncounter();
      } else {
        state._playerInteractionUntil = Date.now() + 3000;
        window.supabase.rpc('toggle_encounter_door', {
          p_encounter_id: state.encounterId,
          p_x1: door.x1, p_y1: door.y1,
          p_x2: door.x2, p_y2: door.y2,
        }).then(result => {
          if (result.error) console.error('Door toggle RPC failed:', result.error);
        });
      }
    };

    // ── Light placement mode ──
    state._lightPlaceMode = false;
    state._lightDragId = null;
    state._lightLocalChangeUntil = 0;

    setupMapControls();
    setupElementsToolbarListener();
    setupEncounterViewPersistence();
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

  function isNightShroudEffect(effect) {
    return !!effect && effect.type === "night_shroud";
  }

  function resolveMapEffectCenterCells(effect, data) {
    if (!effect) return null;
    var ex = parseFloat(effect.x);
    var ey = parseFloat(effect.y);
    if (Number.isFinite(ex) && Number.isFinite(ey)) {
      return { x: ex, y: ey };
    }
    var tokens = Array.isArray(data?.tokens) ? data.tokens : [];
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (!token) continue;
      if (
        (effect.sourceTokenId && token.id === effect.sourceTokenId) ||
        (effect.sourceInstanceId && token.instanceId === effect.sourceInstanceId)
      ) {
        var size = Math.max(0.2, parseFloat(token.size) || 1);
        return {
          x: (parseFloat(token.x) || 0) + size / 2,
          y: (parseFloat(token.y) || 0) + size / 2,
        };
      }
    }
    return null;
  }

  function buildRuntimeWallsFromMapEffect(effect, data) {
    if (!isNightShroudEffect(effect)) return [];
    var center = resolveMapEffectCenterCells(effect, data);
    if (!center) return [];

    var radiusCells = Math.max(0, parseFloat(effect?.radiusCells) || 0);
    if (radiusCells <= 0) return [];

    var circumference = Math.PI * 2 * radiusCells;
    var segmentCount = Math.round(circumference / 2);
    if (!Number.isFinite(segmentCount) || segmentCount < 16) segmentCount = 16;
    if (segmentCount > 96) segmentCount = 96;

    var walls = [];
    for (var i = 0; i < segmentCount; i++) {
      var angle1 = (i / segmentCount) * Math.PI * 2;
      var angle2 = ((i + 1) / segmentCount) * Math.PI * 2;
      walls.push({
        id: "map-effect-wall:" + effect.id + ":" + i,
        type: "curtain",
        x1: center.x + Math.cos(angle1) * radiusCells,
        y1: center.y + Math.sin(angle1) * radiusCells,
        x2: center.x + Math.cos(angle2) * radiusCells,
        y2: center.y + Math.sin(angle2) * radiusCells,
        doorOpen: false,
        locked: false,
        name: "Manto de la Noche",
        pathId: "map-effect-path:" + effect.id,
        segmentIndex: i,
        runtimeSource: "mapEffect",
        sourceMapEffectId: effect.id,
      });
    }
    return walls;
  }

  function buildRuntimeMapEffectWalls(data) {
    if (!Array.isArray(data?.mapEffects)) return [];
    var walls = [];
    for (var i = 0; i < data.mapEffects.length; i++) {
      walls.push.apply(walls, buildRuntimeWallsFromMapEffect(data.mapEffects[i], data));
    }
    return walls;
  }

  function composeEncounterWalls(data, structuralWalls) {
    var baseWalls = Array.isArray(structuralWalls)
      ? structuralWalls
      : (window.AEWallPaths?.compileWalls?.(data?.wallPaths || []) || []);
    baseWalls = baseWalls.filter(function (wall) {
      return !!wall && wall.runtimeSource !== "mapEffect";
    });
    return baseWalls.concat(buildRuntimeMapEffectWalls(data));
  }

  function normalizeEncounterLayerData(data) {
    if (!data || typeof data !== "object") return;
    data.map = normalizeMapLayerData(data.map);
    data.designTokens = normalizeDesignTokensData(data.designTokens);
    data.mapEffects = normalizeMapEffectsData(data.mapEffects);
  }

  function ensureEncounterWallData(data) {
    if (!data || typeof data !== "object") return;
    var wallPathsDomain = window.AEWallPaths;
    var sourcePaths = Array.isArray(data.wallPaths) ? data.wallPaths : null;
    if (!sourcePaths && Array.isArray(data.walls) && data.walls.length) {
      var persistedWalls = data.walls.filter(function (wall) {
        return !!wall && wall.runtimeSource !== "mapEffect" && !wall.sourceMapEffectId;
      });
      sourcePaths = wallPathsDomain?.createWallPathsFromWalls?.(persistedWalls) || [];
    }
    data.wallPaths = wallPathsDomain?.normalizeWallPaths?.(sourcePaths || []) || [];
    var structuralWalls = wallPathsDomain?.compileWalls?.(data.wallPaths) || [];
    data.walls = composeEncounterWalls(data, structuralWalls);
  }

  function syncEncounterWalls(options) {
    if (!state.encounter?.data) return [];
    ensureEncounterWallData(state.encounter.data);
    var walls = state.encounter.data.walls || [];
    if (state.map) {
      var previousWalls = state.map.walls || [];
      state.map.walls = walls;
      if (typeof state.map._updateWallSpatialIndex === "function") {
        state.map._updateWallSpatialIndex(previousWalls, walls);
      }
      if (options?.invalidateFog) state.map.invalidateFog?.();
      if (options?.invalidateFogWalls) state.map.invalidateFogWalls?.();
      if (options?.invalidateLightingWalls) state.map.invalidateLightingWalls?.();
      if (options?.draw) state.map.draw();
    }
    return walls;
  }

  function setEncounterWallPaths(nextWallPaths, options = {}) {
    if (!state.encounter?.data) return [];
    state.encounter.data.wallPaths = window.AEWallPaths?.normalizeWallPaths?.(nextWallPaths || []) || [];
    var structuralWalls =
      window.AEWallPaths?.compileWalls?.(state.encounter.data.wallPaths) || [];
    state.encounter.data.walls = composeEncounterWalls(
      state.encounter.data,
      structuralWalls,
    );
    if (!options.skipMapSync) {
      syncEncounterWalls({
        invalidateFog: !!options.invalidateFog,
        invalidateFogWalls: !!options.invalidateFogWalls,
        invalidateLightingWalls: !!options.invalidateLightingWalls,
        draw: !!options.draw,
      });
    }
    return state.encounter.data.walls;
  }

  function updateEncounterWallSegment(wallId, updater, options = {}) {
    if (!state.encounter?.data?.wallPaths) return null;
    var result = window.AEWallPaths?.updateWallSegment?.(state.encounter.data.wallPaths, wallId, updater);
    if (!result?.changed) return result?.wall || null;
    setEncounterWallPaths(result.wallPaths, {
      invalidateFog: !!options.invalidateFog,
      invalidateFogWalls: !!options.invalidateFogWalls,
      invalidateLightingWalls: !!options.invalidateLightingWalls,
      draw: !!options.draw,
    });
    return result.wall || null;
  }

  function normalizeMapEffectsData(rawEffects) {
    if (!Array.isArray(rawEffects)) return [];
    return rawEffects
      .map((effect, index) => {
        if (!effect || typeof effect !== "object") return null;
        const type = String(effect.type || "").trim();
        if (!type) return null;
        const geometry = "circle";
        const radiusMeters = Math.max(0, parseFloat(effect.radiusMeters) || 0);
        const radiusCells = Math.max(
          0,
          parseFloat(effect.radiusCells) ||
            (radiusMeters > 0 ? radiusMeters / MAP_METERS_PER_UNIT : 0),
        );
        if (radiusCells <= 0) {
          return null;
        }
        return {
          ...MAP_EFFECT_DEFAULTS,
          ...effect,
          id: effect.id || `map-effect-${type}-${index}`,
          type,
          geometry,
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

  const PLAYER_INTERACT_RANGE_METERS = 3;
  const PLAYER_INTERACT_RANGE = PLAYER_INTERACT_RANGE_METERS / 1.5; // convert meters to coordinate units

  function isPlayerNearPosition(targetX, targetY, maxDist) {
    var tokens = state.encounter?.data?.tokens || [];
    var instances = state.encounter?.data?.instances || [];
    var userId = state.user?.id;
    if (!userId) return false;
    var mySheetIds = new Set(
      state.characterSheets
        .filter(function (s) { return s.user_id === userId; })
        .map(function (s) { return s.id; })
    );
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var inst = null;
      for (var j = 0; j < instances.length; j++) {
        if (instances[j].id === token.instanceId) { inst = instances[j]; break; }
      }
      if (!inst || !inst.isPC || !inst.characterSheetId) continue;
      if (!mySheetIds.has(inst.characterSheetId)) continue;
      var tSize = token.size || 1;
      var cx = (parseFloat(token.x) || 0) + tSize / 2;
      var cy = (parseFloat(token.y) || 0) + tSize / 2;
      var dx = cx - targetX;
      var dy = cy - targetY;
      if (dx * dx + dy * dy <= maxDist * maxDist) return true;
    }
    return false;
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

  // scheduleBackgroundPersist — delegated to persistence/encounter-persistence.js
  function scheduleBackgroundPersist(delayMs) {
    persistenceController?.scheduleBackgroundPersist(delayMs);
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

  function getMapEffectSourceInstance(effect) {
    if (!effect || !state.encounter?.data) return null;

    let sourceInstanceId = effect.sourceInstanceId || null;
    if (!sourceInstanceId && effect.sourceTokenId) {
      const sourceToken = (state.encounter.data.tokens || []).find(
        (item) => item.id === effect.sourceTokenId,
      );
      sourceInstanceId = sourceToken?.instanceId || null;
    }
    if (!sourceInstanceId) return null;

    return (state.encounter.data.instances || []).find(
      (item) => item.id === sourceInstanceId,
    ) || null;
  }

  function canCurrentUserControlMapEffect(effect) {
    if (!effect || !state.encounter?.data) return false;
    if (canEditEncounter()) return true;

    const status = normalizeEncounterStatus(state.encounter.status);
    if (status !== ENCOUNTER_STATUS.IN_GAME) return false;

    if (effect.sourceTokenId) {
      const sourceToken = (state.encounter.data.tokens || []).find(
        (item) => item.id === effect.sourceTokenId,
      );
      if (sourceToken) return canCurrentUserControlToken(sourceToken);
    }

    return canCurrentUserOpenInstanceDetails(getMapEffectSourceInstance(effect));
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

  async function moveMapEffectViaRpc(effectId, x, y) {
    const { error } = await supabase.rpc("move_encounter_map_effect", {
      p_encounter_id: state.encounterId,
      p_effect_id: effectId,
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
      toolsDrawer.style.display = canEditEncounter() ? "" : "none";
      setToolsDrawerOpen(canEditEncounter() && !!state.encounterViewState?.toolsDrawerOpen);
    }
    if (els.layerToolbar) {
      els.layerToolbar.style.display = "flex";
    }
    // Hide layer selector (dropdown) for non-admins
    const layerSelectorEl = els.layerMenuToggle?.closest(".ae-layer-selector");
    const separator1 = document.getElementById("ae-toolbar-separator-1");
    if (layerSelectorEl) {
      layerSelectorEl.style.display = canEditEncounter() ? "flex" : "none";
    }
    if (separator1) {
      separator1.style.display = canEditEncounter() ? "block" : "none";
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

  // ── Light & Switch management (delegated to lighting/light-switch-manager.js) ──
  let lightSwitchManager = null;

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
        state.map.dispatchTransformEvent?.();
        state.map.draw();
      }
    });

    const rulerBtn = document.getElementById("btn-ae-ruler");
    rulerBtn?.addEventListener("click", () => {
      if (!state.map || typeof state.map.setMeasurementToolActive !== "function") {
        return;
      }
      const nextActive = !state.map.measureToolActive;
      if (nextActive) {
        drawerController?.deactivateTerrainPainter?.();
      }
      elementsToolbarController?.setMeasurementMode?.(nextActive);
      state.map.setMeasurementToolActive(nextActive);
      rulerBtn.classList.toggle("is-active", nextActive);
    });
  }

  function setupElementsToolbarListener() {
    document.addEventListener("ae-layer-change", function (e) {
      var detail = e.detail || {};
      var showElements = detail.showElements && canEditEncounter();
      if (showElements) {
        elementsToolbarController?.show();
        // Activate Paper.js editor for wall editing
        if (paperWallEditor && !paperWallEditor.isActive()) {
          paperWallEditor.activate();
          // Tell TacticalMap to skip wall rendering (Paper.js handles it)
          if (state.map) {
            state.map._paperWallEditorActive = true;
            state.map._elementsLayerActive = true;
            state.map.draw();
          }
        }
        // Refresh Lucide icons in the toolbar
        if (window.lucide && typeof window.lucide.createIcons === "function") {
          setTimeout(function () { window.lucide.createIcons(); }, 10);
        }
      } else {
        elementsToolbarController?.hide();
        // Deactivate Paper.js editor
        if (paperWallEditor && paperWallEditor.isActive()) {
          paperWallEditor.deactivate();
          // Re-enable TacticalMap wall rendering
          if (state.map) {
            state.map._paperWallEditorActive = false;
            state.map._elementsLayerActive = false;
          }
          state.map?.draw();
        }
      }
    });

    // Check initial state after a short delay to ensure everything is initialized
    setTimeout(function () {
      if (state.activeMapLayer === "elements" && canEditEncounter()) {
        elementsToolbarController?.show();
        // Activate Paper.js editor
        if (paperWallEditor && !paperWallEditor.isActive()) {
          paperWallEditor.activate();
          if (state.map) {
            state.map._paperWallEditorActive = true;
            state.map._elementsLayerActive = true;
            state.map.draw();
          }
        }
        if (window.lucide && typeof window.lucide.createIcons === "function") {
          setTimeout(function () { window.lucide.createIcons(); }, 10);
        }
      }
    }, 100);
  }

  // --- REALTIME SYNC — delegated to realtime/encounter-sync.js ---
  let syncController = null;
  let dragBroadcast = null;

  function setupRealtimeSubscription() { syncController?.setup(); }
  function teardownRealtimeSubscriptions() { syncController?.teardown(); }
  function startEncounterSyncPolling() { syncController?.startPolling(); }
  function stopEncounterSyncPolling() { syncController?.stopPolling(); }
  function extractPCHealth(charData) {
    return syncController?.extractPCHealth(charData) || [0, 0, 0, 0, 0, 0, 0];
  }
  function buildEncounterSyncKey(encounterLike) {
    if (syncController) return syncController.buildSyncKey(encounterLike);
    if (!encounterLike) return "";
    return JSON.stringify({
      status: normalizeEncounterStatus(encounterLike.status),
      data: encounterLike.data || {},
    });
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

    // Timeline sidebar toggle
    const timelineToggle = document.getElementById("btn-ae-toggle-timeline");
    const timelineSidebar = document.querySelector(".ae-timeline-sidebar");
    if (timelineToggle && timelineSidebar) {
      timelineToggle.addEventListener("click", () => {
        timelineSidebar.classList.toggle("collapsed");
        timelineToggle.classList.toggle("is-collapsed");
      });
    }

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
      .addEventListener("click", () => modalController?.handleModalAction("dmg"));
    document
      .getElementById("btn-modal-heal")
      .addEventListener("click", () => modalController?.handleModalAction("heal"));

    runtime.documentClickHandler = (e) => {
      if (
        tokenContextMenuController?.isOpen?.() &&
        !tokenContextMenuController?.contains?.(e.target)
      ) {
        tokenContextMenuController?.hide?.();
      }

      if (
        designTokenMenuController?.isOpen?.() &&
        !designTokenMenuController?.contains?.(e.target)
      ) {
        designTokenMenuController?.close();
      }

      if (
        mapContextMenuController?.isOpen?.() &&
        !mapContextMenuController?.contains?.(e.target)
      ) {
        mapContextMenuController?.close();
      }

      if (els.layerMenu && els.layerToolbar && !els.layerToolbar.contains(e.target)) {
        els.layerMenu.style.display = "none";
        // Close chevron animation
        const selectorEl = els.layerMenuToggle?.closest(".ae-layer-selector");
        if (selectorEl) selectorEl.classList.remove("is-open");
      }
    };
    runtime.documentKeydownHandler = (e) => {
      if (e.key === "Escape") {
        tokenContextMenuController?.hide?.();
        designTokenMenuController?.close?.();
        mapContextMenuController?.close?.();
        markerContextMenuController?.hide?.();
        wallContextMenuController?.hide?.();
        lightSwitchManager?.exitLinkMode?.();
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
    state.characterSheetsLoaded = false;

    if (state.encounter?.chronicle_id) {
      const { data, error } = await supabase
        .from("chronicle_characters")
        .select(
          "character_sheet:character_sheets(id, name, data, avatar_url, user_id)",
        )
        .eq("chronicle_id", state.encounter.chronicle_id);

      if (error) {
        console.error("Error loading chronicle character sheets:", error);
        state.characterSheets = [];
        return false;
      }

      state.characterSheets = (data || [])
        .map((row) => row.character_sheet)
        .filter(Boolean)
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "es"));
      state.characterSheetsLoaded = true;
      return true;
    }

    state.characterSheets = [];
    return false;
  }

  function pruneEncounterRoster() {
    const data = state.encounter?.data;
    if (!data || !state.characterSheetsLoaded) {
      return { changed: false, removedInstanceIds: [], removedTokenIds: [] };
    }

    const validSheetIds = new Set(
      state.characterSheets.map((sheet) => sheet.id).filter(Boolean),
    );
    const removedInstanceIds = [];
    const nextInstances = [];

    (data.instances || []).forEach((instance) => {
      if (!instance) return;

      const shouldRemove =
        instance.isPC === true &&
        (!instance.characterSheetId || !validSheetIds.has(instance.characterSheetId));

      if (shouldRemove) {
        if (instance.id) removedInstanceIds.push(instance.id);
        return;
      }

      nextInstances.push(instance);
    });

    if (!removedInstanceIds.length) {
      return { changed: false, removedInstanceIds: [], removedTokenIds: [] };
    }

    const removedInstanceIdSet = new Set(removedInstanceIds);
    const removedTokenIds = [];
    const nextTokens = (data.tokens || []).filter((token) => {
      const remove = token && removedInstanceIdSet.has(token.instanceId);
      if (remove && token.id) removedTokenIds.push(token.id);
      return !remove;
    });
    const removedTokenIdSet = new Set(removedTokenIds);

    data.instances = nextInstances;
    data.tokens = nextTokens;

    if (Array.isArray(data.mapEffects)) {
      data.mapEffects = data.mapEffects.filter((effect) => {
        if (!effect) return false;
        if (
          effect.sourceInstanceId &&
          removedInstanceIdSet.has(effect.sourceInstanceId)
        ) {
          return false;
        }
        if (effect.sourceTokenId && removedTokenIdSet.has(effect.sourceTokenId)) {
          return false;
        }
        return true;
      });
    }

    if (data.activeInstanceId && removedInstanceIdSet.has(data.activeInstanceId)) {
      data.activeInstanceId = null;
    }

    if (data.fog && Array.isArray(data.fog.viewerInstanceIds)) {
      data.fog.viewerInstanceIds = data.fog.viewerInstanceIds.filter(
        (instanceId) => !removedInstanceIdSet.has(instanceId),
      );
    }
    if (
      data.fog?.impersonateInstanceId &&
      removedInstanceIdSet.has(data.fog.impersonateInstanceId)
    ) {
      data.fog.impersonateInstanceId = null;
    }

    if (
      state.selectedTokenId &&
      removedTokenIdSet.has(state.selectedTokenId)
    ) {
      state.selectedTokenId = null;
      if (state.map) state.map.selectedTokenId = null;
    }

    if (
      state.selectedInstanceId &&
      removedInstanceIdSet.has(state.selectedInstanceId)
    ) {
      closeModal();
    }

    ensureActiveInstance();

    sanitizeEncounterTokens();

    return {
      changed: true,
      removedInstanceIds: removedInstanceIds,
      removedTokenIds: removedTokenIds,
    };
  }

  function syncEncounterPCDataFromSheets() {
    if (!state.encounter?.data?.instances || !state.characterSheetsLoaded) return;

    state.encounter.data.instances.forEach((inst) => {
      if (!inst.isPC) return;

      const sheet = state.characterSheets.find(
        (s) => s.id === inst.characterSheetId,
      );
      if (!sheet) return;

      inst.pcHealth = extractPCHealth(sheet.data);
      inst.avatarUrl = sheet.avatar_url || inst.avatarUrl;

      const token = state.encounter.data.tokens.find(
        (t) => t.instanceId === inst.id,
      );
      if (token && sheet.avatar_url) {
        token.imgUrl = sheet.avatar_url;
      }
    });
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
    ensureEncounterWallData(state.encounter.data);
    state.lastEncounterSyncKey = buildEncounterSyncKey(state.encounter);
    state.activeMapLayer = "entities";

    const { changed } = sanitizeEncounterTokens();

    syncEncounterPCDataFromSheets();

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

    // Notification is generated automatically by DB trigger on encounters status change.

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
    ensureEncounterWallData(state.encounter.data);

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
      // Keep ambient light reference in sync (always point to the encounter data object)
      state.map._ambientLight = state.encounter.data.ambientLight;
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

  // --- INSTANCE MANAGEMENT — delegated to instances/instance-manager.js ---
  let instanceManager = null;

  function addNPC(tplId, count, options) { return instanceManager?.addNPC(tplId, count, options); }
  function addPC(sheetId) { return instanceManager?.addPC(sheetId); }
  function removeInstance(id) { return instanceManager?.removeInstance(id); }

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

  // --- HEALTH & COMBAT — delegated to modal/instance-modal.js ---

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

  // --- DESIGN TOKEN CONTEXT MENU — delegated to context-menus/design-token-menu.js ---
  // --- MAP CONTEXT MENU — delegated to context-menus/map-context-menu.js ---

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

  // --- MODAL — delegated to modal/instance-modal.js ---

  function openModal(inst) {
    modalController?.openModal(inst);
  }

  function closeModal() {
    modalController?.closeModal();
  }

  function updateModalUI(inst) {
    modalController?.updateModalUI(inst);
  }

  // --- SAVE ---

  // sanitizeEncounterTokens & saveEncounter — delegated to persistence/encounter-persistence.js
  function sanitizeEncounterTokens() {
    return persistenceController?.sanitizeEncounterTokens() || { changed: false, removedCount: 0 };
  }

  async function saveEncounter() {
    return persistenceController?.saveEncounter();
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
    if (runtime.encounterViewPersistTimer) {
      clearTimeout(runtime.encounterViewPersistTimer);
      runtime.encounterViewPersistTimer = null;
    }
    runtime.toolsDrawerObserver?.disconnect?.();
    runtime.toolsDrawerObserver = null;
    runtime.timelineSidebarObserver?.disconnect?.();
    runtime.timelineSidebarObserver = null;
    tokenContextMenuController?.destroy?.();
    tokenContextMenuController = null;
    lightSwitchManager?.destroy?.();
    lightSwitchManager = null;
    persistenceController?.destroy?.();
    persistenceController = null;
    designTokenMenuController?.destroy?.();
    designTokenMenuController = null;
    mapContextMenuController?.destroy?.();
    mapContextMenuController = null;
    markerContextMenuController?.destroy?.();
    markerContextMenuController = null;
    wallContextMenuController?.destroy?.();
    wallContextMenuController = null;
    elementsToolbarController?.destroy?.();
    elementsToolbarController = null;
    modalController = null;
    syncController = null;
    dragBroadcast?.destroy?.();
    dragBroadcast = null;
    instanceManager = null;
    tokenActionsController = null;

    if (state.map && typeof state.map.destroy === "function") {
      state.map.destroy();
    }
    state.map = null;
    state.selectedInstanceId = null;
    state.selectedTokenId = null;
  }

  // --- UTILITIES ---

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
