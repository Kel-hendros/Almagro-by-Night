(function initChronicleDetailTerritorySupport(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  const DEFAULT_VIEW = {
    centerLabel: "Buenos Aires",
    lat: -34.6037,
    lng: -58.3816,
    zoom: 11,
  };

  const POI_KIND_META = {
    interest: { label: "Interés", icon: "map-pinned", colorVar: "--color-info", glyph: "•" },
    haven: { label: "Refugio", icon: "house", colorVar: "--color-success", glyph: "⌂" },
    threat: { label: "Amenaza", icon: "triangle-alert", colorVar: "--color-danger", glyph: "!" },
    ally: { label: "Aliado", icon: "handshake", colorVar: "--color-accent", glyph: "✦" },
    hq: { label: "Sede", icon: "building-2", colorVar: "--color-warning", glyph: "▣" },
  };

  const POI_KIND_ORDER = ["haven", "threat", "ally", "hq", "interest"];

  const POI_SOURCE_ID = "cd-territory-pois";
  const POI_SELECTED_SOURCE_ID = "cd-territory-poi-selected";
  const POI_LAYER_IDS = {
    clusters: "cd-territory-poi-clusters",
    clusterCount: "cd-territory-poi-cluster-count",
    points: "cd-territory-poi-points",
    selectedHalo: "cd-territory-poi-selected-halo",
    labels: "cd-territory-poi-labels",
  };

  const ZONE_SOURCE_ID = "cd-territory-zones";
  const ZONE_LAYER_IDS = {
    fill: "cd-territory-zone-fill",
    outline: "cd-territory-zone-outline",
  };

  const DRAFT_ZONE_SOURCE_ID = "cd-territory-draft-zone";
  const DRAFT_ZONE_LAYER_IDS = {
    fill: "cd-territory-draft-zone-fill",
    outline: "cd-territory-draft-zone-outline",
    vertices: "cd-territory-draft-zone-vertices",
  };

  const ZONE_TIPO_META = {
    dominio: { label: "Dominio", colorVar: "--color-accent" },
    coto_de_caza: { label: "Coto de Caza", colorVar: "--color-warning" },
    territorio: { label: "Territorio", colorVar: "--color-info" },
  };

  const ZONE_ESTADO_META = {
    disputado: { label: "Disputado", badgeClass: "cd-zone-badge--disputado" },
    controlado: { label: "Controlado", badgeClass: "cd-zone-badge--controlado" },
    libre: { label: "Libre", badgeClass: "cd-zone-badge--libre" },
  };

  function createInitialState() {
    return {
      chronicleId: null,
      currentPlayerId: null,
      currentPlayerName: "",
      isNarrator: false,
      config: null,
      pois: [],
      zones: [],
      map: null,
      mapLoaded: false,
      activeTab: null,
      subscription: null,
      themeSyncCleanup: null,
      configModal: null,
      pendingConfigView: null,
      selectedPoiId: null,
      draftCoords: null,
      placingPoi: false,
      poiCardVisible: false,
      poiMode: "view",
      poiLayersReady: false,
      zoneLayersReady: false,
      bannerCollapsed: false,
      viewportSyncBound: false,
      viewportResizeHandler: null,
      viewportObserver: null,
      searchQuery: "",
      collapsedSections: new Set(),
      collapsedZoneSections: new Set(),
      contextMenuCoords: null,
      selectedZoneId: null,
      drawingZone: false,
      draftPolygon: [],
      zoneCardVisible: false,
      zoneMode: "view",
      hiddenZoneIds: new Set(),
      collapsedZoneIds: new Set(),
      activeAccordion: "pois",
      draggedZoneId: null,
      zonesLayerHidden: false,
      poisLayerHidden: false,
      cleanupFns: [],
      uiBound: false,
      contextMenuOutsideBound: false,
      poiKindOutsideBound: false,
      zoneEscBound: false,
      routeGuardBound: false,
    };
  }

  function getEls() {
    return {
      panelEl: document.querySelector('.cd-tab-panel[data-panel="territorio"]'),
      stageEl: document.querySelector(".cd-territory-stage"),
      mapEl: document.getElementById("cd-territory-map"),
      titleEl: document.getElementById("cd-territory-title"),
      statusEl: document.getElementById("cd-territory-map-status"),
      listDrawerEl: document.getElementById("cd-territory-list-drawer"),
      searchInput: document.getElementById("cd-territory-search"),
      searchClearBtn: document.getElementById("cd-territory-search-clear"),
      listContentEl: document.getElementById("cd-territory-list-content"),
      listGroupedEl: document.getElementById("cd-territory-list-grouped"),
      listResultsEl: document.getElementById("cd-territory-list-results"),
      listEmptyEl: document.getElementById("cd-territory-list-empty"),
      zoneListGroupedEl: document.getElementById("cd-territory-zone-list-grouped"),
      zoneListEmptyEl: document.getElementById("cd-territory-zone-list-empty"),
      zonesSection: document.getElementById("cd-territory-zones-section"),
      poisSection: document.getElementById("cd-territory-pois-section"),
      addPoiBtn: document.getElementById("cd-territory-add-poi"),
      addZoneBtn: document.getElementById("cd-territory-add-zone"),
      toggleZonesBtn: document.getElementById("cd-territory-toggle-zones"),
      togglePoisBtn: document.getElementById("cd-territory-toggle-pois"),
      openConfigBtn: document.getElementById("cd-territory-open-config"),
      focusMapBtn: document.getElementById("cd-territory-focus-map"),
      poiCardEl: document.getElementById("cd-territory-poi-card"),
      poiFormEl: document.querySelector(".cd-territory-poi-form"),
      poiAuthorEl: document.getElementById("cd-territory-poi-author"),
      poiTitleInput: document.getElementById("cd-territory-poi-title"),
      poiKindInput: document.getElementById("cd-territory-poi-kind"),
      poiVisibilityInput: document.getElementById("cd-territory-poi-visibility"),
      poiDescriptionViewEl: document.getElementById("cd-territory-poi-description-view"),
      poiDescriptionInput: document.getElementById("cd-territory-poi-description"),
      poiCoordsInput: document.getElementById("cd-territory-poi-coords"),
      poiNoLocationEl: document.getElementById("cd-territory-poi-no-location"),
      pickOnMapBtn: document.getElementById("cd-territory-pick-on-map"),
      openGmapsLink: document.getElementById("cd-territory-open-gmaps"),
      contextMenuEl: document.getElementById("cd-territory-context-menu"),
      ctxGmapsBtn: document.getElementById("cd-territory-ctx-gmaps"),
      editPoiBtn: document.getElementById("cd-territory-edit-poi"),
      savePoiBtn: document.getElementById("cd-territory-save-poi"),
      deletePoiBtn: document.getElementById("cd-territory-delete-poi"),
      cancelEditBtn: document.getElementById("cd-territory-cancel-edit"),
      zoneCardEl: document.getElementById("cd-territory-zone-card"),
      zoneFormEl: document.querySelector(".cd-territory-zone-form"),
      zoneNombreInput: document.getElementById("cd-territory-zone-nombre"),
      zoneTipoInput: document.getElementById("cd-territory-zone-tipo"),
      zoneEstadoInput: document.getElementById("cd-territory-zone-estado"),
      zoneRegenteInput: document.getElementById("cd-territory-zone-regente"),
      zoneColorInput: document.getElementById("cd-territory-zone-color"),
      zoneVisibilityInput: document.getElementById("cd-territory-zone-visibility"),
      zoneParentInput: document.getElementById("cd-territory-zone-parent"),
      zoneDescriptionViewEl: document.getElementById("cd-territory-zone-description-view"),
      zoneDescriptionInput: document.getElementById("cd-territory-zone-description"),
      zoneVertexCountEl: document.getElementById("cd-territory-zone-vertex-count"),
      editZoneBtn: document.getElementById("cd-territory-edit-zone"),
      saveZoneBtn: document.getElementById("cd-territory-save-zone"),
      deleteZoneBtn: document.getElementById("cd-territory-delete-zone"),
      drawZoneBtn: document.getElementById("cd-territory-draw-zone"),
      cancelZoneEditBtn: document.getElementById("cd-territory-cancel-zone-edit"),
      configOverlay: document.getElementById("cd-territory-config-modal"),
      configCloseBtn: document.getElementById("cd-territory-config-close"),
      configCancelBtn: document.getElementById("cd-territory-config-cancel"),
      centerLabelInput: document.getElementById("cd-territory-center-label"),
      configLatEl: document.getElementById("cd-territory-config-lat"),
      configLngEl: document.getElementById("cd-territory-config-lng"),
      configZoomEl: document.getElementById("cd-territory-config-zoom"),
      useMapViewBtn: document.getElementById("cd-territory-use-map-view"),
      saveConfigBtn: document.getElementById("cd-territory-save-config"),
      configNoteEl: document.getElementById("cd-territory-config-note"),
    };
  }

  function canEditPoi(state, poi) {
    if (!poi) return false;
    return state.isNarrator || poi.created_by_player_id === state.currentPlayerId;
  }

  function canEditZone(state) {
    return Boolean(state?.isNarrator);
  }

  function kindMeta(kind) {
    return POI_KIND_META[kind] || POI_KIND_META.interest;
  }

  function zoneTipoMeta(tipo) {
    return ZONE_TIPO_META[tipo] || ZONE_TIPO_META.territorio;
  }

  function zoneEstadoMeta(estado) {
    return ZONE_ESTADO_META[estado] || ZONE_ESTADO_META.libre;
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback || "";
  }

  function polygonToGeoJsonCoords(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return null;
    const coords = polygon.map((pt) => [Number(pt.lng), Number(pt.lat)]);
    if (coords.length > 0) {
      const first = coords[0];
      const last = coords[coords.length - 1];
      if (first[0] !== last[0] || first[1] !== last[1]) {
        coords.push([first[0], first[1]]);
      }
    }
    return [coords];
  }

  function getPolygonBounds(polygon) {
    if (!Array.isArray(polygon) || polygon.length === 0) return null;
    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLng = Infinity;
    let maxLng = -Infinity;
    for (const pt of polygon) {
      const lat = Number(pt.lat);
      const lng = Number(pt.lng);
      if (Number.isFinite(lat) && Number.isFinite(lng)) {
        minLat = Math.min(minLat, lat);
        maxLat = Math.max(maxLat, lat);
        minLng = Math.min(minLng, lng);
        maxLng = Math.max(maxLng, lng);
      }
    }
    if (!Number.isFinite(minLat)) return null;
    return [[minLng, minLat], [maxLng, maxLat]];
  }

  function formatCoords(coords) {
    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      return "";
    }
    return `${coords.lat.toFixed(6)}, ${coords.lng.toFixed(6)}`;
  }

  function parseCoordsInput(raw) {
    const text = String(raw || "").trim();
    if (!text) return null;
    const matches = text.match(/-?\d+(?:\.\d+)?/g);
    if (!matches || matches.length < 2) return null;
    const lat = Number(matches[0]);
    const lng = Number(matches[1]);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  function buildGoogleMapsUrl(lat, lng) {
    return `https://www.google.com/maps?q=${lat},${lng}`;
  }

  function formatBaseViewValue(value, decimals) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(decimals) : "—";
  }

  function normalizeNumber(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  ns.territorySupport = {
    DEFAULT_VIEW,
    POI_KIND_META,
    POI_KIND_ORDER,
    POI_SOURCE_ID,
    POI_SELECTED_SOURCE_ID,
    POI_LAYER_IDS,
    ZONE_SOURCE_ID,
    ZONE_LAYER_IDS,
    DRAFT_ZONE_SOURCE_ID,
    DRAFT_ZONE_LAYER_IDS,
    ZONE_TIPO_META,
    ZONE_ESTADO_META,
    createInitialState,
    getEls,
    canEditPoi,
    canEditZone,
    kindMeta,
    zoneTipoMeta,
    zoneEstadoMeta,
    cssVar,
    polygonToGeoJsonCoords,
    getPolygonBounds,
    formatCoords,
    parseCoordsInput,
    buildGoogleMapsUrl,
    formatBaseViewValue,
    normalizeNumber,
  };
})(window);
