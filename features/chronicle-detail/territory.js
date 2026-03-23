(function initChronicleDetailTerritory(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const mapApi = () => global.ABNSharedMap;
  const service = () => ns.service;

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

  const POI_SOURCE_ID = "cd-territory-pois";
  const POI_LAYER_IDS = {
    clusters: "cd-territory-poi-clusters",
    clusterCount: "cd-territory-poi-cluster-count",
    points: "cd-territory-poi-points",
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
  const ZONE_TIPO_ORDER = ["dominio", "coto_de_caza", "territorio"];

  const state = {
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
    // Zone state
    selectedZoneId: null,
    drawingZone: false,
    draftPolygon: [],
    zoneCardVisible: false,
    zoneMode: "view",
    hiddenZoneIds: new Set(),
    collapsedZoneIds: new Set(),
    // Accordion state: "zones" or "pois"
    activeAccordion: "pois",
    // Drag state for zone reparenting
    draggedZoneId: null,
    // Layer visibility
    zonesLayerHidden: false,
    poisLayerHidden: false,
  };

  // Order for displaying POI sections
  const POI_KIND_ORDER = ["haven", "threat", "ally", "hq", "interest"];

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback || "";
  }

  function currentViewConfig() {
    const config = state.config || {};
    return {
      centerLabel: String(config.center_label || DEFAULT_VIEW.centerLabel),
      lat: Number(config.center_lat ?? DEFAULT_VIEW.lat),
      lng: Number(config.center_lng ?? DEFAULT_VIEW.lng),
      zoom: Number(config.zoom ?? DEFAULT_VIEW.zoom),
    };
  }

  function currentSummaryView() {
    if (state.pendingConfigView) return state.pendingConfigView;
    return currentViewConfig();
  }

  function canEditPoi(poi) {
    if (!poi) return false;
    return state.isNarrator || poi.created_by_player_id === state.currentPlayerId;
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

  function selectedZone() {
    return state.zones.find((z) => z.id === state.selectedZoneId) || null;
  }

  function polygonToGeoJsonCoords(polygon) {
    if (!Array.isArray(polygon) || polygon.length < 3) return null;
    const coords = polygon.map((pt) => [Number(pt.lng), Number(pt.lat)]);
    // Close the polygon
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
    let minLat = Infinity, maxLat = -Infinity;
    let minLng = Infinity, maxLng = -Infinity;
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

  function setActiveAccordion(name) {
    state.activeAccordion = name;
    const { zonesSection, poisSection } = getEls();
    if (zonesSection) {
      zonesSection.classList.toggle("collapsed", name !== "zones");
    }
    if (poisSection) {
      poisSection.classList.toggle("collapsed", name !== "pois");
    }
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

  function showContextMenu(screenX, screenY, coords) {
    const { contextMenuEl } = getEls();
    const mapAreaEl = document.querySelector(".cd-territory-map-area");
    if (!contextMenuEl || !mapAreaEl) return;

    state.contextMenuCoords = coords;
    const areaRect = mapAreaEl.getBoundingClientRect();

    // Position relative to map area container
    let x = screenX - areaRect.left;
    let y = screenY - areaRect.top;

    // Ensure menu stays within bounds
    const menuWidth = 180;
    const menuHeight = 40;
    if (x + menuWidth > areaRect.width) x = areaRect.width - menuWidth - 8;
    if (y + menuHeight > areaRect.height) y = areaRect.height - menuHeight - 8;

    contextMenuEl.style.left = `${x}px`;
    contextMenuEl.style.top = `${y}px`;
    contextMenuEl.classList.remove("hidden");
    refreshLucideIcons();
  }

  function hideContextMenu() {
    const { contextMenuEl } = getEls();
    if (contextMenuEl) contextMenuEl.classList.add("hidden");
    state.contextMenuCoords = null;
  }

  function formatBaseViewValue(value, decimals) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric.toFixed(decimals) : "—";
  }

  function normalizeNumber(value, fallback = null) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function getEls() {
    return {
      panelEl: document.querySelector('.cd-tab-panel[data-panel="territorio"]'),
      stageEl: document.querySelector(".cd-territory-stage"),
      mapEl: document.getElementById("cd-territory-map"),
      titleEl: document.getElementById("cd-territory-title"),
      statusEl: document.getElementById("cd-territory-map-status"),
      // List drawer elements
      listDrawerEl: document.getElementById("cd-territory-list-drawer"),
      searchInput: document.getElementById("cd-territory-search"),
      searchClearBtn: document.getElementById("cd-territory-search-clear"),
      listContentEl: document.getElementById("cd-territory-list-content"),
      listGroupedEl: document.getElementById("cd-territory-list-grouped"),
      listResultsEl: document.getElementById("cd-territory-list-results"),
      listEmptyEl: document.getElementById("cd-territory-list-empty"),
      // Zone list elements
      zoneListGroupedEl: document.getElementById("cd-territory-zone-list-grouped"),
      zoneListEmptyEl: document.getElementById("cd-territory-zone-list-empty"),
      zonesSection: document.getElementById("cd-territory-zones-section"),
      poisSection: document.getElementById("cd-territory-pois-section"),
      // Action buttons
      addPoiBtn: document.getElementById("cd-territory-add-poi"),
      addZoneBtn: document.getElementById("cd-territory-add-zone"),
      toggleZonesBtn: document.getElementById("cd-territory-toggle-zones"),
      togglePoisBtn: document.getElementById("cd-territory-toggle-pois"),
      openConfigBtn: document.getElementById("cd-territory-open-config"),
      focusMapBtn: document.getElementById("cd-territory-focus-map"),
      // POI card elements
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
      // Zone card elements
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
      // Config modal elements
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

  function setStatus(message) {
    const { statusEl } = getEls();
    if (!statusEl) return;
    const normalized = String(message || "").trim();
    statusEl.textContent = normalized;
    statusEl.classList.toggle("hidden", !normalized);
  }

  function refreshLucideIcons() {
    try {
      global.lucide?.createIcons?.();
    } catch (_e) {}
  }

  function getSelectedKind() {
    const { poiKindInput } = getEls();
    if (!poiKindInput) return "interest";
    const selectedOption = poiKindInput.querySelector(".cd-territory-kind-option.selected");
    return selectedOption?.dataset.kind || "interest";
  }

  function setSelectedKind(kind) {
    const { poiKindInput } = getEls();
    if (!poiKindInput) return;
    const normalizedKind = kind || "interest";
    const meta = kindMeta(normalizedKind);
    // Update button display
    const btn = poiKindInput.querySelector(".cd-territory-kind-select-btn");
    const dot = btn?.querySelector(".cd-territory-kind-dot");
    const label = btn?.querySelector(".cd-territory-kind-select-label");
    if (dot) dot.dataset.kind = normalizedKind;
    if (label) label.textContent = meta.label;
    // Update selected option
    poiKindInput.querySelectorAll(".cd-territory-kind-option").forEach((opt) => {
      opt.classList.toggle("selected", opt.dataset.kind === normalizedKind);
    });
  }

  function poiDraftSnapshot() {
    const { poiTitleInput, poiVisibilityInput, poiDescriptionInput } = getEls();
    const selected = selectedPoi();
    const coords = state.draftCoords || (selected ? { lat: selected.lat, lng: selected.lng } : null);
    return {
      id: selected?.id || null,
      title: String(poiTitleInput?.value || "").trim() || selected?.title || "Punto de interés",
      kind: getSelectedKind() || selected?.kind || "interest",
      visibility: poiVisibilityInput?.value || selected?.visibility || "public",
      description: String(poiDescriptionInput?.value || selected?.description || ""),
      lat: coords?.lat ?? null,
      lng: coords?.lng ?? null,
      author_name:
        selected?.author_name ||
        state.currentPlayerName ||
        (state.isNarrator ? "Narrador" : "Vos"),
    };
  }

  function renderPoiSummary(snapshot = null) {
    const {
      poiFormEl,
      poiAuthorEl,
      poiDescriptionViewEl,
      poiDescriptionInput,
      poiCoordsInput,
      poiNoLocationEl,
      openGmapsLink,
      editPoiBtn,
      savePoiBtn,
      deletePoiBtn,
    } = getEls();
    const data = snapshot || poiDraftSnapshot();
    const isViewMode = state.poiMode === "view";
    const editable = !data.id || canEditPoi(data);
    const hasCoords = Number.isFinite(data.lat) && Number.isFinite(data.lng);

    if (poiAuthorEl) poiAuthorEl.textContent = `Autor: ${data.author_name || "—"}`;
    if (poiFormEl) poiFormEl.classList.toggle("view-mode", isViewMode);

    // Render markdown description for view mode
    if (poiDescriptionViewEl) {
      const markdown = String(poiDescriptionInput?.value || data.description || "").trim();
      poiDescriptionViewEl.innerHTML = markdown
        ? (global.renderMarkdown?.(markdown) || markdown.replace(/\n/g, "<br>"))
        : "";
    }

    // Toggle no-location indicator in view mode
    const showNoLocation = isViewMode && !hasCoords;
    if (poiCoordsInput) poiCoordsInput.classList.toggle("hidden", showNoLocation);
    if (poiNoLocationEl) poiNoLocationEl.classList.toggle("hidden", !showNoLocation);

    // Google Maps link (only in view mode with coordinates)
    if (openGmapsLink) {
      const showGmaps = isViewMode && hasCoords;
      openGmapsLink.classList.toggle("hidden", !showGmaps);
      if (showGmaps) {
        openGmapsLink.href = buildGoogleMapsUrl(data.lat, data.lng);
      }
    }

    // Button visibility
    if (editPoiBtn) editPoiBtn.classList.toggle("hidden", !(isViewMode && editable && data.id));
    if (savePoiBtn) savePoiBtn.classList.toggle("hidden", isViewMode);
    if (deletePoiBtn) deletePoiBtn.classList.toggle("hidden", !(state.poiMode === "edit" && editable && data.id));

    setPoiEditorEnabled(!isViewMode && editable);
  }

  function syncViewportLayout() {
    const { panelEl, stageEl } = getEls();
    if (!panelEl || !stageEl) return;
    const viewportHeight = Math.round(
      global.visualViewport?.height || global.innerHeight || document.documentElement.clientHeight || 0
    );
    const stageTop = stageEl.getBoundingClientRect().top;
    const availableHeight = Math.max(0, Math.floor(viewportHeight - Math.max(stageTop, 0)));
    panelEl.style.setProperty("--cd-territory-viewport-height", `${availableHeight}px`);
  }

  function syncCoordsInputValue() {
    const { poiCoordsInput } = getEls();
    if (!poiCoordsInput) return;
    poiCoordsInput.value = formatCoords(state.draftCoords);
  }

  function applyDraftCoords(coords, options = {}) {
    const { centerMap = false } = options;
    state.draftCoords =
      coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng)
        ? { lat: Number(coords.lat), lng: Number(coords.lng) }
        : null;
    syncCoordsInputValue();
    if (centerMap && state.map && state.draftCoords) {
      state.map.easeTo({
        center: [state.draftCoords.lng, state.draftCoords.lat],
        duration: 450,
      });
    }
  }

  function queueViewportLayoutSync() {
    global.requestAnimationFrame(() => {
      syncViewportLayout();
      state.map?.resize?.();
    });
  }

  function bindViewportSync() {
    if (state.viewportSyncBound) return;
    const onViewportChange = () => {
      if (state.activeTab !== "territorio") return;
      queueViewportLayoutSync();
    };
    state.viewportResizeHandler = onViewportChange;
    global.addEventListener("resize", onViewportChange);
    global.visualViewport?.addEventListener?.("resize", onViewportChange);

    if (global.ResizeObserver) {
      const stickyHeader = document.querySelector(".cd-sticky-header");
      if (stickyHeader) {
        state.viewportObserver = new ResizeObserver(() => {
          if (state.activeTab !== "territorio") return;
          queueViewportLayoutSync();
        });
        state.viewportObserver.observe(stickyHeader);
      }
    }

    state.viewportSyncBound = true;
  }

  function setBannerCollapsed(collapsed) {
    const banner = document.getElementById("chronicle-banner-area");
    const { focusMapBtn } = getEls();
    state.bannerCollapsed = Boolean(collapsed);
    if (banner) {
      banner.classList.toggle("cd-banner--territory-hidden", state.bannerCollapsed);
    }
    if (focusMapBtn) {
      focusMapBtn.classList.toggle("active", state.bannerCollapsed);
      focusMapBtn.title = state.bannerCollapsed ? "Restaurar banner" : "Maximizar mapa";
      focusMapBtn.setAttribute("aria-label", focusMapBtn.title);
      focusMapBtn.innerHTML = state.bannerCollapsed
        ? '<i data-lucide="minimize-2"></i>'
        : '<i data-lucide="maximize-2"></i>';
      refreshLucideIcons();
    }
    queueViewportLayoutSync();
  }

  function selectedPoi() {
    return state.pois.find((poi) => poi.id === state.selectedPoiId) || null;
  }

  function syncSelectedPoiHighlight() {
    if (!state.map || !state.poiLayersReady) return;
    (state.pois || []).forEach((poi) => {
      state.map.setFeatureState(
        { source: POI_SOURCE_ID, id: poi.id },
        { selected: poi.id === state.selectedPoiId }
      );
    });
  }

  function setPoiEditorEnabled(enabled) {
    const {
      poiTitleInput,
      poiKindInput,
      poiVisibilityInput,
      poiDescriptionInput,
      poiCoordsInput,
      pickOnMapBtn,
      savePoiBtn,
    } = getEls();
    [poiTitleInput, poiVisibilityInput, poiDescriptionInput, poiCoordsInput].forEach((el) => {
      if (el) el.disabled = !enabled;
    });
    // Custom dropdown: disable the trigger button
    if (poiKindInput) {
      const btn = poiKindInput.querySelector(".cd-territory-kind-select-btn");
      if (btn) btn.disabled = !enabled;
      poiKindInput.classList.toggle("disabled", !enabled);
    }
    if (pickOnMapBtn) pickOnMapBtn.disabled = !enabled;
    if (savePoiBtn) savePoiBtn.disabled = !enabled;
  }

  function hidePoiCard() {
    state.poiCardVisible = false;
    const { poiCardEl } = getEls();
    if (poiCardEl) poiCardEl.classList.add("hidden");
  }

  function showPoiCard() {
    state.poiCardVisible = true;
    const { poiCardEl } = getEls();
    if (poiCardEl) poiCardEl.classList.remove("hidden");
  }

  function resetPoiEditor(options = {}) {
    const { keepDraft = false, keepVisible = false } = options;
    const {
      poiTitleInput,
      poiVisibilityInput,
      poiDescriptionInput,
      savePoiBtn,
      pickOnMapBtn,
    } = getEls();

    state.selectedPoiId = null;
    state.poiMode = "edit";
    if (!keepDraft) {
      state.draftCoords = null;
      state.placingPoi = false;
    }

    if (poiTitleInput) poiTitleInput.value = "";
    setSelectedKind("interest");
    if (poiVisibilityInput) poiVisibilityInput.value = "public";
    if (poiDescriptionInput) poiDescriptionInput.value = "";
    syncCoordsInputValue();
    if (savePoiBtn) {
      savePoiBtn.classList.remove("hidden");
      savePoiBtn.textContent = "Guardar";
    }
    if (pickOnMapBtn) {
      pickOnMapBtn.classList.toggle("placing", state.placingPoi);
      pickOnMapBtn.title = state.placingPoi ? "Esperando click en el mapa…" : "Marcar en el mapa";
    }
    syncSelectedPoiHighlight();
    renderPoiSummary({
      kind: getSelectedKind(),
      visibility: poiVisibilityInput?.value || "public",
      description: "",
      author_name: state.currentPlayerName || (state.isNarrator ? "Narrador" : "Vos"),
      lat: state.draftCoords?.lat,
      lng: state.draftCoords?.lng,
    });
    if (keepVisible) {
      showPoiCard();
    } else {
      hidePoiCard();
    }
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone Card Management
  // ─────────────────────────────────────────────────────────────────────────────

  function hideZoneCard() {
    state.zoneCardVisible = false;
    const { zoneCardEl } = getEls();
    if (zoneCardEl) zoneCardEl.classList.add("hidden");
  }

  function showZoneCard() {
    state.zoneCardVisible = true;
    const { zoneCardEl } = getEls();
    if (zoneCardEl) zoneCardEl.classList.remove("hidden");
  }

  function setZoneEditorEnabled(enabled) {
    const {
      zoneNombreInput,
      zoneTipoInput,
      zoneEstadoInput,
      zoneRegenteInput,
      zoneColorInput,
      zoneVisibilityInput,
      zoneParentInput,
      zoneDescriptionInput,
      saveZoneBtn,
    } = getEls();
    [zoneNombreInput, zoneTipoInput, zoneEstadoInput, zoneRegenteInput, zoneColorInput, zoneVisibilityInput, zoneParentInput, zoneDescriptionInput].forEach((el) => {
      if (el) el.disabled = !enabled;
    });
    if (saveZoneBtn) saveZoneBtn.disabled = !enabled;
  }

  function zoneDraftSnapshot() {
    const {
      zoneNombreInput,
      zoneTipoInput,
      zoneEstadoInput,
      zoneRegenteInput,
      zoneColorInput,
      zoneVisibilityInput,
      zoneParentInput,
      zoneDescriptionInput,
    } = getEls();
    const selected = selectedZone();
    const polygon = state.draftPolygon.length > 0 ? state.draftPolygon : (selected?.polygon || []);
    return {
      id: selected?.id || null,
      nombre: String(zoneNombreInput?.value || "").trim() || selected?.nombre || "Nueva zona",
      tipo: zoneTipoInput?.value || selected?.tipo || "territorio",
      estado: zoneEstadoInput?.value || selected?.estado || "libre",
      regente: String(zoneRegenteInput?.value || "").trim() || selected?.regente || "",
      color: zoneColorInput?.value || selected?.color || "#c41e3a",
      visibility: zoneVisibilityInput?.value || selected?.visibility || "public",
      parent_id: zoneParentInput?.value || selected?.parent_id || null,
      descripcion: String(zoneDescriptionInput?.value || selected?.descripcion || ""),
      polygon,
      author_name: selected?.author_name || state.currentPlayerName || "Narrador",
    };
  }

  function renderZoneSummary(snapshot = null) {
    const {
      zoneFormEl,
      zoneDescriptionViewEl,
      zoneDescriptionInput,
      zoneVertexCountEl,
      editZoneBtn,
      saveZoneBtn,
      deleteZoneBtn,
      drawZoneBtn,
    } = getEls();
    const data = snapshot || zoneDraftSnapshot();
    const isViewMode = state.zoneMode === "view";
    const hasPolygon = (data.polygon?.length || 0) >= 3;

    if (zoneFormEl) zoneFormEl.classList.toggle("view-mode", isViewMode);

    // Render markdown description for view mode
    if (zoneDescriptionViewEl) {
      const markdown = String(zoneDescriptionInput?.value || data.descripcion || "").trim();
      zoneDescriptionViewEl.innerHTML = markdown
        ? (global.renderMarkdown?.(markdown) || markdown.replace(/\n/g, "<br>"))
        : "";
    }

    // Vertex count
    if (zoneVertexCountEl) {
      const count = data.polygon?.length || 0;
      zoneVertexCountEl.textContent = count === 0
        ? "Sin polígono (grupo)"
        : `${count} vértice${count !== 1 ? "s" : ""}`;
    }

    // Button visibility
    if (editZoneBtn) editZoneBtn.classList.toggle("hidden", !(isViewMode && data.id));
    if (saveZoneBtn) saveZoneBtn.classList.toggle("hidden", isViewMode);
    if (deleteZoneBtn) deleteZoneBtn.classList.toggle("hidden", !(state.zoneMode === "edit" && data.id));
    if (drawZoneBtn) {
      drawZoneBtn.classList.toggle("hidden", isViewMode || state.drawingZone);
      drawZoneBtn.textContent = hasPolygon ? "Redibujar" : "Dibujar";
    }

    setZoneEditorEnabled(!isViewMode);
  }

  function resetZoneEditor(options = {}) {
    const { keepDraft = false, keepVisible = false } = options;
    const {
      zoneNombreInput,
      zoneTipoInput,
      zoneEstadoInput,
      zoneRegenteInput,
      zoneColorInput,
      zoneVisibilityInput,
      zoneParentInput,
      zoneDescriptionInput,
      saveZoneBtn,
    } = getEls();

    state.selectedZoneId = null;
    state.zoneMode = "edit";
    if (!keepDraft) {
      state.draftPolygon = [];
      state.drawingZone = false;
    }

    if (zoneNombreInput) zoneNombreInput.value = "";
    if (zoneTipoInput) zoneTipoInput.value = "territorio";
    if (zoneEstadoInput) zoneEstadoInput.value = "libre";
    if (zoneRegenteInput) zoneRegenteInput.value = "";
    if (zoneColorInput) zoneColorInput.value = "#c41e3a";
    if (zoneVisibilityInput) zoneVisibilityInput.value = "public";
    if (zoneDescriptionInput) zoneDescriptionInput.value = "";

    // Populate and reset parent dropdown
    populateZoneParentDropdown(null);
    if (zoneParentInput) zoneParentInput.value = "";

    if (saveZoneBtn) {
      saveZoneBtn.classList.remove("hidden");
      saveZoneBtn.textContent = "Guardar";
    }
    syncSelectedZoneHighlight();
    renderZoneSummary({
      tipo: zoneTipoInput?.value || "territorio",
      estado: zoneEstadoInput?.value || "libre",
      color: zoneColorInput?.value || "#c41e3a",
      visibility: zoneVisibilityInput?.value || "public",
      descripcion: "",
      polygon: state.draftPolygon,
      author_name: state.currentPlayerName || "Narrador",
    });
    if (keepVisible) {
      showZoneCard();
    } else {
      hideZoneCard();
    }
    syncDraftZoneSource();
  }

  function getZoneDescendantIds(zoneId) {
    const descendants = new Set();
    function collect(parentId) {
      (state.zones || []).forEach((z) => {
        if (z.parent_id === parentId && !descendants.has(z.id)) {
          descendants.add(z.id);
          collect(z.id);
        }
      });
    }
    collect(zoneId);
    return descendants;
  }

  function populateZoneParentDropdown(excludeZoneId) {
    const { zoneParentInput } = getEls();
    if (!zoneParentInput) return;

    // Get descendants of current zone to prevent circular refs
    const excludeIds = new Set();
    if (excludeZoneId) {
      excludeIds.add(excludeZoneId);
      getZoneDescendantIds(excludeZoneId).forEach((id) => excludeIds.add(id));
    }

    // Filter available parents (exclude self and descendants)
    const availableParents = (state.zones || []).filter((z) => !excludeIds.has(z.id));

    // Sort by nombre
    const collator = new Intl.Collator("es", { sensitivity: "base" });
    availableParents.sort((a, b) => collator.compare(a.nombre || "", b.nombre || ""));

    // Build options HTML
    let html = '<option value="">— Sin padre —</option>';
    availableParents.forEach((z) => {
      const escapedName = global.escapeHtml?.(z.nombre) || z.nombre;
      const tipoLabel = zoneTipoMeta(z.tipo).label;
      html += `<option value="${z.id}">${escapedName} (${tipoLabel})</option>`;
    });
    zoneParentInput.innerHTML = html;
  }

  function selectZoneForEditing(zoneId) {
    const zone = state.zones.find((item) => item.id === zoneId);
    const {
      zoneNombreInput,
      zoneTipoInput,
      zoneEstadoInput,
      zoneRegenteInput,
      zoneColorInput,
      zoneVisibilityInput,
      zoneParentInput,
      zoneDescriptionInput,
      saveZoneBtn,
    } = getEls();

    if (!zone) {
      resetZoneEditor();
      return;
    }

    // Close POI card if open
    hidePoiCard();
    state.selectedPoiId = null;

    state.selectedZoneId = zone.id;
    state.zoneMode = "view";
    state.draftPolygon = Array.isArray(zone.polygon) ? [...zone.polygon] : [];
    state.drawingZone = false;
    showZoneCard();

    if (zoneNombreInput) zoneNombreInput.value = zone.nombre || "";
    if (zoneTipoInput) zoneTipoInput.value = zone.tipo || "territorio";
    if (zoneEstadoInput) zoneEstadoInput.value = zone.estado || "libre";
    if (zoneRegenteInput) zoneRegenteInput.value = zone.regente || "";
    if (zoneColorInput) zoneColorInput.value = zone.color || "#c41e3a";
    if (zoneVisibilityInput) zoneVisibilityInput.value = zone.visibility || "public";
    if (zoneDescriptionInput) zoneDescriptionInput.value = zone.descripcion || "";

    // Populate parent dropdown
    populateZoneParentDropdown(zone.id);
    if (zoneParentInput) zoneParentInput.value = zone.parent_id || "";

    if (saveZoneBtn) saveZoneBtn.textContent = "Guardar";
    renderZoneSummary(zone);
    syncSelectedZoneHighlight();
    syncDraftZoneSource();
    updateZoneListSelection();
  }

  function syncSelectedZoneHighlight() {
    if (!state.map || !state.zoneLayersReady) return;
    (state.zones || []).forEach((zone) => {
      state.map.setFeatureState(
        { source: ZONE_SOURCE_ID, id: zone.id },
        { selected: zone.id === state.selectedZoneId }
      );
    });
  }

  function selectPoiForEditing(poiId) {
    const poi = state.pois.find((item) => item.id === poiId);
    const {
      poiTitleInput,
      poiVisibilityInput,
      poiDescriptionInput,
      savePoiBtn,
      pickOnMapBtn,
    } = getEls();

    if (!poi) {
      resetPoiEditor();
      return;
    }

    // Close zone card if open
    hideZoneCard();
    state.selectedZoneId = null;

    state.selectedPoiId = poi.id;
    state.poiMode = "view";
    applyDraftCoords({ lat: Number(poi.lat), lng: Number(poi.lng) });
    state.placingPoi = false;
    showPoiCard();

    if (poiTitleInput) poiTitleInput.value = poi.title || "";
    setSelectedKind(poi.kind || "interest");
    if (poiVisibilityInput) poiVisibilityInput.value = poi.visibility || "public";
    if (poiDescriptionInput) poiDescriptionInput.value = poi.description || "";
    if (pickOnMapBtn) {
      pickOnMapBtn.classList.remove("placing");
      pickOnMapBtn.title = "Marcar en el mapa";
    }

    if (savePoiBtn) savePoiBtn.textContent = "Guardar";
    renderPoiSummary(poi);
    syncSelectedPoiHighlight();
  }

  function renderHeader() {
    const { titleEl, openConfigBtn, configNoteEl } = getEls();
    const view = currentViewConfig();

    if (titleEl) titleEl.textContent = view.centerLabel || "Territorio de la Crónica";
    if (openConfigBtn) openConfigBtn.classList.toggle("hidden", !state.isNarrator);
    if (configNoteEl) {
      configNoteEl.textContent = "";
      configNoteEl.classList.add("hidden");
    }
  }

  function renderConfigModal() {
    const { centerLabelInput, configLatEl, configLngEl, configZoomEl } = getEls();
    const view = currentViewConfig();
    if (!state.pendingConfigView) {
      state.pendingConfigView = {
        lat: view.lat,
        lng: view.lng,
        zoom: view.zoom,
      };
    }
    if (centerLabelInput) centerLabelInput.value = view.centerLabel;
    if (configLatEl) configLatEl.textContent = formatBaseViewValue(state.pendingConfigView?.lat, 5);
    if (configLngEl) configLngEl.textContent = formatBaseViewValue(state.pendingConfigView?.lng, 5);
    if (configZoomEl) configZoomEl.textContent = formatBaseViewValue(state.pendingConfigView?.zoom, 1);
  }

  function renderPoiListItem(poi) {
    const meta = kindMeta(poi.kind);
    const hasLocation = Number.isFinite(poi.lat) && Number.isFinite(poi.lng);
    const isSelected = poi.id === state.selectedPoiId;
    return `
      <button class="cd-territory-list-item${isSelected ? " selected" : ""}" data-poi-id="${poi.id}">
        <span class="cd-territory-list-item-dot${hasLocation ? "" : " no-location"}" data-kind="${poi.kind}"></span>
        <span class="cd-territory-list-item-name">${global.escapeHtml?.(poi.title) || poi.title}</span>
        <span class="cd-territory-list-item-type">${meta.label}</span>
      </button>
    `;
  }

  function renderPoiListSection(kind, pois) {
    const meta = kindMeta(kind);
    const isCollapsed = state.collapsedSections.has(kind);
    const count = pois.length;
    return `
      <div class="cd-territory-list-section${isCollapsed ? " collapsed" : ""}" data-kind="${kind}">
        <div class="cd-territory-list-section-header">
          <span class="cd-territory-list-section-arrow"><i data-lucide="chevron-down"></i></span>
          <span class="cd-territory-list-section-dot" data-kind="${kind}"></span>
          <span class="cd-territory-list-section-name">${meta.label}</span>
          <span class="cd-territory-list-section-count">${count}</span>
        </div>
        <div class="cd-territory-list-section-items">
          ${pois.map(renderPoiListItem).join("")}
        </div>
      </div>
    `;
  }

  function filterPoisBySearch(query) {
    const normalizedQuery = String(query || "").toLowerCase().trim();
    if (!normalizedQuery) return null;
    const collator = new Intl.Collator("es", { sensitivity: "base" });
    return (state.pois || [])
      .filter((poi) => {
        const title = String(poi.title || "").toLowerCase();
        const description = String(poi.description || "").toLowerCase();
        return title.includes(normalizedQuery) || description.includes(normalizedQuery);
      })
      .sort((a, b) => collator.compare(a.title || "", b.title || ""));
  }

  function renderPoiList() {
    const {
      listGroupedEl,
      listResultsEl,
      listEmptyEl,
      searchClearBtn,
    } = getEls();

    const query = state.searchQuery;
    const isSearching = Boolean(query.trim());

    // Toggle clear button visibility
    if (searchClearBtn) searchClearBtn.classList.toggle("hidden", !isSearching);

    if (isSearching) {
      // Search mode: flat list of results
      const results = filterPoisBySearch(query) || [];
      if (listGroupedEl) listGroupedEl.classList.add("hidden");
      if (listEmptyEl) listEmptyEl.classList.add("hidden");
      if (listResultsEl) {
        listResultsEl.classList.remove("hidden");
        if (results.length === 0) {
          listResultsEl.innerHTML = `<div class="cd-territory-list-empty"><span>No se encontraron lugares</span></div>`;
        } else {
          listResultsEl.innerHTML = results.map(renderPoiListItem).join("");
        }
      }
    } else {
      // Grouped mode
      if (listResultsEl) listResultsEl.classList.add("hidden");

      const pois = state.pois || [];
      if (pois.length === 0) {
        if (listGroupedEl) listGroupedEl.classList.add("hidden");
        if (listEmptyEl) listEmptyEl.classList.remove("hidden");
      } else {
        if (listEmptyEl) listEmptyEl.classList.add("hidden");
        if (listGroupedEl) {
          listGroupedEl.classList.remove("hidden");
          // Group POIs by kind
          const groups = {};
          POI_KIND_ORDER.forEach((kind) => { groups[kind] = []; });
          pois.forEach((poi) => {
            const kind = poi.kind || "interest";
            if (!groups[kind]) groups[kind] = [];
            groups[kind].push(poi);
          });
          // Sort each group alphabetically by title
          const collator = new Intl.Collator("es", { sensitivity: "base" });
          Object.values(groups).forEach((list) => {
            list.sort((a, b) => collator.compare(a.title || "", b.title || ""));
          });
          // Render sections (only those with items)
          listGroupedEl.innerHTML = POI_KIND_ORDER
            .filter((kind) => groups[kind].length > 0)
            .map((kind) => renderPoiListSection(kind, groups[kind]))
            .join("");
        }
      }
    }

    refreshLucideIcons();
    bindPoiListEvents();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone List Rendering
  // ─────────────────────────────────────────────────────────────────────────────

  function renderZoneListItem(zone, depth = 0, hasChildren = false) {
    const isSelected = zone.id === state.selectedZoneId;
    const isHidden = state.hiddenZoneIds.has(zone.id);
    const isCollapsed = state.collapsedZoneIds.has(zone.id);
    const hasPolygon = Array.isArray(zone.polygon) && zone.polygon.length >= 3;
    const eyeIcon = isHidden ? "eye-off" : "eye";
    const collapseIcon = isCollapsed ? "chevron-right" : "chevron-down";
    const indentClass = depth > 0 ? ` cd-zone-child cd-zone-depth-${Math.min(depth, 3)}` : "";
    const groupClass = !hasPolygon ? " cd-zone-group" : "";
    const draggableAttr = state.isNarrator ? 'draggable="true"' : "";

    const collapseBtn = hasChildren
      ? `<button class="cd-territory-zone-collapse-toggle" data-zone-id="${zone.id}" title="${isCollapsed ? "Desplegar" : "Colapsar"}">
          <i data-lucide="${collapseIcon}"></i>
        </button>`
      : `<span class="cd-territory-zone-collapse-spacer"></span>`;

    return `
      <div class="cd-territory-list-item cd-territory-zone-item${isSelected ? " selected" : ""}${isHidden ? " cd-zone-hidden" : ""}${indentClass}${groupClass}" data-zone-id="${zone.id}" ${draggableAttr}>
        ${collapseBtn}
        <button class="cd-territory-zone-visibility-toggle" data-zone-id="${zone.id}" title="${isHidden ? "Mostrar en mapa" : "Ocultar del mapa"}">
          <i data-lucide="${eyeIcon}"></i>
        </button>
        <span class="cd-territory-zone-swatch" style="background-color: ${global.escapeHtml?.(zone.color) || zone.color}"></span>
        <span class="cd-territory-list-item-name">${global.escapeHtml?.(zone.nombre) || zone.nombre}</span>
      </div>
    `;
  }

  function buildHierarchicalZoneList(zones) {
    // Build a map of children by parent_id
    const childrenMap = {};
    const rootZones = [];
    zones.forEach((zone) => {
      if (zone.parent_id) {
        if (!childrenMap[zone.parent_id]) childrenMap[zone.parent_id] = [];
        childrenMap[zone.parent_id].push(zone);
      } else {
        rootZones.push(zone);
      }
    });

    // Sort each level alphabetically
    const collator = new Intl.Collator("es", { sensitivity: "base" });
    const sortFn = (a, b) => collator.compare(a.nombre || "", b.nombre || "");
    rootZones.sort(sortFn);
    Object.values(childrenMap).forEach((arr) => arr.sort(sortFn));

    // Build flat list with depth info
    const result = [];
    function traverse(zone, depth) {
      const children = childrenMap[zone.id] || [];
      const hasChildren = children.length > 0;
      const isCollapsed = state.collapsedZoneIds.has(zone.id);
      result.push({ zone, depth, hasChildren });
      // Only traverse children if not collapsed
      if (!isCollapsed) {
        children.forEach((child) => traverse(child, depth + 1));
      }
    }
    rootZones.forEach((zone) => traverse(zone, 0));
    return result;
  }

  function renderZoneList() {
    const { zoneListGroupedEl, zoneListEmptyEl, zonesSection, addZoneBtn } = getEls();

    // Show/hide add zone button based on narrator status
    if (addZoneBtn) addZoneBtn.classList.toggle("hidden", !state.isNarrator);

    const zones = state.zones || [];
    if (zones.length === 0) {
      if (zoneListGroupedEl) zoneListGroupedEl.classList.add("hidden");
      if (zoneListEmptyEl) zoneListEmptyEl.classList.remove("hidden");
    } else {
      if (zoneListEmptyEl) zoneListEmptyEl.classList.add("hidden");
      if (zoneListGroupedEl) {
        zoneListGroupedEl.classList.remove("hidden");
        // Build hierarchical list (no grouping by tipo)
        const hierarchical = buildHierarchicalZoneList(zones);
        zoneListGroupedEl.innerHTML = `
          <div class="cd-territory-zone-list-flat cd-zone-drop-root" data-drop-root="true">
            ${hierarchical.map(({ zone, depth, hasChildren }) => renderZoneListItem(zone, depth, hasChildren)).join("")}
          </div>
        `;
      }
    }

    refreshLucideIcons();
    bindZoneListEvents();
  }

  function bindZoneListEvents() {
    const { zoneListGroupedEl } = getEls();

    // Collapse toggle clicks
    if (zoneListGroupedEl) {
      zoneListGroupedEl.querySelectorAll(".cd-territory-zone-collapse-toggle").forEach((btn) => {
        if (btn.dataset.boundClick) return;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const zoneId = btn.dataset.zoneId;
          if (!zoneId) return;
          toggleZoneCollapse(zoneId);
        });
        btn.dataset.boundClick = "1";
      });
    }

    // Visibility toggle clicks
    if (zoneListGroupedEl) {
      zoneListGroupedEl.querySelectorAll(".cd-territory-zone-visibility-toggle").forEach((btn) => {
        if (btn.dataset.boundClick) return;
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const zoneId = btn.dataset.zoneId;
          if (!zoneId) return;
          toggleZoneVisibility(zoneId);
        });
        btn.dataset.boundClick = "1";
      });
    }

    // Zone item clicks (select for editing)
    if (zoneListGroupedEl) {
      zoneListGroupedEl.querySelectorAll(".cd-territory-zone-item").forEach((item) => {
        if (item.dataset.boundClick) return;
        item.addEventListener("click", (e) => {
          // Don't trigger if clicking on collapse or visibility toggle
          if (e.target.closest(".cd-territory-zone-collapse-toggle")) return;
          if (e.target.closest(".cd-territory-zone-visibility-toggle")) return;
          const zoneId = item.dataset.zoneId;
          if (!zoneId) return;
          handleZoneListItemClick(zoneId);
        });
        item.dataset.boundClick = "1";
      });
    }

    // Drag and drop for reparenting zones (narrator only)
    if (state.isNarrator && zoneListGroupedEl) {
      bindZoneDragDrop(zoneListGroupedEl);
    }
  }

  function bindZoneDragDrop(container) {
    // Dragstart on zone items
    container.querySelectorAll(".cd-territory-zone-item[draggable='true']").forEach((item) => {
      if (item.dataset.boundDrag) return;

      item.addEventListener("dragstart", (e) => {
        state.draggedZoneId = item.dataset.zoneId;
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", state.draggedZoneId);
        item.classList.add("cd-zone-dragging");
        // Mark valid drop targets
        markValidDropTargets(state.draggedZoneId, container);
      });

      item.addEventListener("dragend", () => {
        item.classList.remove("cd-zone-dragging");
        state.draggedZoneId = null;
        clearDropTargetStyles(container);
      });

      item.dataset.boundDrag = "1";
    });

    // Drop targets: other zone items (to make child) and section headers (to make root)
    container.querySelectorAll(".cd-territory-zone-item").forEach((item) => {
      if (item.dataset.boundDrop) return;

      item.addEventListener("dragover", (e) => {
        if (!state.draggedZoneId || item.dataset.zoneId === state.draggedZoneId) return;
        if (!item.classList.contains("cd-zone-drop-valid")) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        item.classList.add("cd-zone-drop-hover");
      });

      item.addEventListener("dragleave", () => {
        item.classList.remove("cd-zone-drop-hover");
      });

      item.addEventListener("drop", (e) => {
        e.preventDefault();
        e.stopPropagation(); // Prevent bubbling to root drop target
        item.classList.remove("cd-zone-drop-hover");
        const targetZoneId = item.dataset.zoneId;
        if (!state.draggedZoneId || state.draggedZoneId === targetZoneId) return;
        if (!item.classList.contains("cd-zone-drop-valid")) return;
        handleZoneReparent(state.draggedZoneId, targetZoneId);
      });

      item.dataset.boundDrop = "1";
    });

    // Section headers as root drop targets
    container.querySelectorAll(".cd-zone-drop-root").forEach((header) => {
      if (header.dataset.boundDrop) return;

      header.addEventListener("dragover", (e) => {
        if (!state.draggedZoneId) return;
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
        header.classList.add("cd-zone-drop-hover");
      });

      header.addEventListener("dragleave", () => {
        header.classList.remove("cd-zone-drop-hover");
      });

      header.addEventListener("drop", (e) => {
        e.preventDefault();
        header.classList.remove("cd-zone-drop-hover");
        if (!state.draggedZoneId) return;
        // Set parent to null (make root)
        handleZoneReparent(state.draggedZoneId, null);
      });

      header.dataset.boundDrop = "1";
    });
  }

  function markValidDropTargets(draggedZoneId, container) {
    // Get descendants of dragged zone (invalid targets to prevent circular refs)
    const invalidIds = new Set([draggedZoneId]);
    getZoneDescendantIds(draggedZoneId).forEach((id) => invalidIds.add(id));

    container.querySelectorAll(".cd-territory-zone-item").forEach((item) => {
      const zoneId = item.dataset.zoneId;
      if (!invalidIds.has(zoneId)) {
        item.classList.add("cd-zone-drop-valid");
      }
    });
  }

  function clearDropTargetStyles(container) {
    container.querySelectorAll(".cd-zone-drop-valid, .cd-zone-drop-hover, .cd-zone-dragging").forEach((el) => {
      el.classList.remove("cd-zone-drop-valid", "cd-zone-drop-hover", "cd-zone-dragging");
    });
  }

  async function handleZoneReparent(zoneId, newParentId) {
    const zone = state.zones.find((z) => z.id === zoneId);
    if (!zone) return;

    // Optimistic update
    const oldParentId = zone.parent_id;
    zone.parent_id = newParentId;
    renderZoneList();
    syncZoneSource();

    // Persist to database
    const { error } = await service()?.updateChronicleTerritoryZone?.({
      zoneId: zone.id,
      chronicleId: state.chronicleId,
      nombre: zone.nombre,
      descripcion: zone.descripcion,
      tipo: zone.tipo,
      estado: zone.estado,
      regente: zone.regente,
      color: zone.color,
      visibility: zone.visibility,
      polygon: zone.polygon,
      parentId: newParentId,
    }) || { error: new Error("Servicio no disponible") };

    if (error) {
      // Revert on error
      zone.parent_id = oldParentId;
      renderZoneList();
      syncZoneSource();
      alert("No se pudo mover la zona: " + (error.message || error));
    }
  }

  function handleZoneListItemClick(zoneId) {
    const zone = state.zones.find((z) => z.id === zoneId);
    if (!zone) return;

    // Expand zones accordion
    setActiveAccordion("zones");

    // Center map on zone bounds
    const bounds = getPolygonBounds(zone.polygon);
    if (bounds && state.map) {
      state.map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
        duration: 500,
      });
    }

    // Open detail drawer
    selectZoneForEditing(zoneId);
  }

  function toggleZoneCollapse(zoneId) {
    if (state.collapsedZoneIds.has(zoneId)) {
      state.collapsedZoneIds.delete(zoneId);
    } else {
      state.collapsedZoneIds.add(zoneId);
    }
    renderZoneList();
  }

  function toggleZoneVisibility(zoneId) {
    const isCurrentlyHidden = state.hiddenZoneIds.has(zoneId);
    const descendantIds = getZoneDescendantIds(zoneId);

    // Toggle this zone and all its descendants
    const idsToToggle = [zoneId, ...descendantIds];

    if (isCurrentlyHidden) {
      // Show: remove from hidden set
      idsToToggle.forEach((id) => state.hiddenZoneIds.delete(id));
    } else {
      // Hide: add to hidden set
      idsToToggle.forEach((id) => state.hiddenZoneIds.add(id));
    }

    // Re-render zone list to update eye icons
    renderZoneList();
    // Update map source
    syncZoneSource();
  }

  function updateZoneListSelection() {
    const { zoneListGroupedEl } = getEls();
    if (zoneListGroupedEl) {
      zoneListGroupedEl.querySelectorAll(".cd-territory-zone-item").forEach((item) => {
        item.classList.toggle("selected", item.dataset.zoneId === state.selectedZoneId);
      });
    }
  }

  function bindPoiListEvents() {
    const { listGroupedEl, listResultsEl } = getEls();

    // Section collapse/expand
    if (listGroupedEl) {
      listGroupedEl.querySelectorAll(".cd-territory-list-section-header").forEach((header) => {
        if (header.dataset.bound) return;
        header.addEventListener("click", () => {
          const section = header.closest(".cd-territory-list-section");
          const kind = section?.dataset.kind;
          if (!kind) return;
          if (state.collapsedSections.has(kind)) {
            state.collapsedSections.delete(kind);
          } else {
            state.collapsedSections.add(kind);
          }
          section.classList.toggle("collapsed", state.collapsedSections.has(kind));
        });
        header.dataset.bound = "1";
      });
    }

    // POI item clicks
    [listGroupedEl, listResultsEl].forEach((container) => {
      if (!container) return;
      container.querySelectorAll(".cd-territory-list-item").forEach((item) => {
        if (item.dataset.boundClick) return;
        item.addEventListener("click", () => {
          const poiId = item.dataset.poiId;
          if (!poiId) return;
          handlePoiListItemClick(poiId);
        });
        item.dataset.boundClick = "1";
      });
    });
  }

  function handlePoiListItemClick(poiId) {
    const poi = state.pois.find((p) => p.id === poiId);
    if (!poi) return;

    // Expand POIs accordion
    setActiveAccordion("pois");

    // Center map if POI has coordinates
    const hasLocation = Number.isFinite(poi.lat) && Number.isFinite(poi.lng);
    if (hasLocation && state.map) {
      state.map.easeTo({
        center: [poi.lng, poi.lat],
        zoom: Math.max(state.map.getZoom(), 14),
        duration: 500,
      });
    }

    // Open detail drawer
    selectPoiForEditing(poiId);

    // Update selected state in list
    updatePoiListSelection();
  }

  function updatePoiListSelection() {
    const { listGroupedEl, listResultsEl } = getEls();
    [listGroupedEl, listResultsEl].forEach((container) => {
      if (!container) return;
      container.querySelectorAll(".cd-territory-list-item").forEach((item) => {
        item.classList.toggle("selected", item.dataset.poiId === state.selectedPoiId);
      });
    });
  }

  function renderAll() {
    renderHeader();
    renderConfigModal();
    renderZoneList();
    renderPoiList();
    if (state.selectedZoneId) {
      selectZoneForEditing(state.selectedZoneId);
      return;
    }
    if (state.zoneCardVisible) {
      resetZoneEditor({ keepDraft: state.draftPolygon.length > 0, keepVisible: true });
      return;
    }
    if (state.selectedPoiId) {
      selectPoiForEditing(state.selectedPoiId);
      return;
    }
    if (state.poiCardVisible) {
      resetPoiEditor({ keepDraft: Boolean(state.draftCoords), keepVisible: true });
      return;
    }
    resetPoiEditor();
    resetZoneEditor();
  }

  function buildPoiGeoJson() {
    const features = (state.pois || [])
      .filter((poi) => Number.isFinite(poi.lat) && Number.isFinite(poi.lng))
      .map((poi) => ({
        type: "Feature",
        id: poi.id,
        geometry: {
          type: "Point",
          coordinates: [Number(poi.lng), Number(poi.lat)],
        },
        properties: {
          id: poi.id,
          title: poi.title || "",
          kind: poi.kind || "interest",
        },
      }));
    return { type: "FeatureCollection", features };
  }

  function ensurePoiSource() {
    if (!state.map || state.map.getSource(POI_SOURCE_ID)) return;
    state.map.addSource(POI_SOURCE_ID, {
      type: "geojson",
      data: buildPoiGeoJson(),
      cluster: true,
      clusterMaxZoom: 14,
      clusterRadius: 50,
    });
  }

  function ensurePoiLayersInternal() {
    if (!state.map || state.poiLayersReady) return;
    ensurePoiSource();

    const accentColor = cssVar("--color-accent", "#c41e3a");
    const textColor = cssVar("--color-text-primary", "#ffffff");
    const bgColor = cssVar("--color-bg-base", "#111111");

    // Cluster circles
    state.map.addLayer({
      id: POI_LAYER_IDS.clusters,
      type: "circle",
      source: POI_SOURCE_ID,
      filter: ["has", "point_count"],
      paint: {
        "circle-color": accentColor,
        "circle-radius": ["step", ["get", "point_count"], 18, 5, 24, 10, 30],
        "circle-stroke-width": 2,
        "circle-stroke-color": bgColor,
      },
    });

    // Cluster count text
    state.map.addLayer({
      id: POI_LAYER_IDS.clusterCount,
      type: "symbol",
      source: POI_SOURCE_ID,
      filter: ["has", "point_count"],
      layout: {
        "text-field": ["get", "point_count_abbreviated"],
        "text-font": ["Open Sans Bold", "Arial Unicode MS Bold"],
        "text-size": 12,
        "text-allow-overlap": true,
      },
      paint: {
        "text-color": textColor,
      },
    });

    // Individual POI circles
    state.map.addLayer({
      id: POI_LAYER_IDS.points,
      type: "circle",
      source: POI_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      paint: {
        "circle-radius": ["case", ["boolean", ["feature-state", "selected"], false], 14, 10],
        "circle-color": [
          "match", ["get", "kind"],
          "interest", cssVar("--color-info", "#4a90c4"),
          "haven", cssVar("--color-success", "#2d8a4e"),
          "threat", cssVar("--color-danger", "#c41e3a"),
          "ally", cssVar("--color-accent", "#c41e3a"),
          "hq", cssVar("--color-warning", "#d4a900"),
          cssVar("--color-info", "#4a90c4"),
        ],
        "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 2],
        "circle-stroke-color": ["case", ["boolean", ["feature-state", "selected"], false], textColor, bgColor],
      },
    });

    // POI labels
    state.map.addLayer({
      id: POI_LAYER_IDS.labels,
      type: "symbol",
      source: POI_SOURCE_ID,
      filter: ["!", ["has", "point_count"]],
      layout: {
        "text-field": ["get", "title"],
        "text-font": ["Open Sans Semibold", "Arial Unicode MS Regular"],
        "text-size": 11,
        "text-offset": [0, 1.8],
        "text-anchor": "top",
        "text-max-width": 10,
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": textColor,
        "text-halo-color": bgColor,
        "text-halo-width": 1.5,
      },
    });

    state.poiLayersReady = true;
  }

  function syncPoiSource() {
    if (!state.map || !state.mapLoaded) return;
    ensurePoiLayersInternal();
    const source = state.map.getSource(POI_SOURCE_ID);
    if (source) source.setData(buildPoiGeoJson());
    syncSelectedPoiHighlight();
  }

  function clearPoiLayers() {
    if (!state.map) return;
    Object.values(POI_LAYER_IDS).forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        try { state.map.removeLayer(layerId); } catch (_e) {}
      }
    });
    if (state.map.getSource(POI_SOURCE_ID)) {
      try { state.map.removeSource(POI_SOURCE_ID); } catch (_e) {}
    }
    state.poiLayersReady = false;
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone GeoJSON and Layers
  // ─────────────────────────────────────────────────────────────────────────────

  function buildZoneGeoJson() {
    const features = (state.zones || [])
      .filter((zone) => Array.isArray(zone.polygon) && zone.polygon.length >= 3)
      .filter((zone) => !state.hiddenZoneIds.has(zone.id))
      .map((zone) => {
        const coords = polygonToGeoJsonCoords(zone.polygon);
        if (!coords) return null;
        return {
          type: "Feature",
          id: zone.id,
          geometry: {
            type: "Polygon",
            coordinates: coords,
          },
          properties: {
            id: zone.id,
            nombre: zone.nombre || "",
            tipo: zone.tipo || "territorio",
            estado: zone.estado || "libre",
            color: zone.color || "#c41e3a",
          },
        };
      })
      .filter(Boolean);
    return { type: "FeatureCollection", features };
  }

  function buildDraftZoneGeoJson() {
    if (!state.drawingZone && state.draftPolygon.length === 0) {
      return {
        type: "FeatureCollection",
        features: [],
      };
    }

    const features = [];
    const polygon = state.draftPolygon;
    const isEditing = state.zoneMode === "edit" || state.drawingZone;

    // Polygon fill/outline (only if we have at least 3 points)
    if (polygon.length >= 3) {
      const coords = polygonToGeoJsonCoords(polygon);
      if (coords) {
        features.push({
          type: "Feature",
          geometry: {
            type: "Polygon",
            coordinates: coords,
          },
          properties: { type: "polygon" },
        });
      }
    } else if (polygon.length >= 2) {
      // Line for 2+ points
      const lineCoords = polygon.map((pt) => [Number(pt.lng), Number(pt.lat)]);
      features.push({
        type: "Feature",
        geometry: {
          type: "LineString",
          coordinates: lineCoords,
        },
        properties: { type: "line" },
      });
    }

    // Vertices as points - only in edit mode
    if (isEditing) {
      polygon.forEach((pt, idx) => {
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [Number(pt.lng), Number(pt.lat)],
          },
          properties: {
            type: "vertex",
            index: idx,
            isFirst: idx === 0,
          },
        });
      });
    }

    return { type: "FeatureCollection", features };
  }

  function ensureZoneSource() {
    if (!state.map || state.map.getSource(ZONE_SOURCE_ID)) return;
    state.map.addSource(ZONE_SOURCE_ID, {
      type: "geojson",
      data: buildZoneGeoJson(),
      promoteId: "id",
    });
  }

  function ensureDraftZoneSource() {
    if (!state.map || state.map.getSource(DRAFT_ZONE_SOURCE_ID)) return;
    state.map.addSource(DRAFT_ZONE_SOURCE_ID, {
      type: "geojson",
      data: buildDraftZoneGeoJson(),
    });
  }

  function ensureZoneLayersInternal() {
    if (!state.map || state.zoneLayersReady) return;
    ensureZoneSource();

    const bgColor = cssVar("--color-bg-base", "#111111");

    // Zone fill layer
    state.map.addLayer({
      id: ZONE_LAYER_IDS.fill,
      type: "fill",
      source: ZONE_SOURCE_ID,
      paint: {
        "fill-color": ["get", "color"],
        "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.45, 0.25],
      },
    });

    // Zone outline layer
    state.map.addLayer({
      id: ZONE_LAYER_IDS.outline,
      type: "line",
      source: ZONE_SOURCE_ID,
      paint: {
        "line-color": ["get", "color"],
        "line-width": ["case", ["boolean", ["feature-state", "selected"], false], 3, 1.5],
        "line-opacity": 0.9,
      },
    });

    state.zoneLayersReady = true;
  }

  function ensureDraftZoneLayers() {
    if (!state.map) return;
    ensureDraftZoneSource();

    const accentColor = cssVar("--color-accent", "#c41e3a");
    const bgColor = cssVar("--color-bg-base", "#111111");

    if (!state.map.getLayer(DRAFT_ZONE_LAYER_IDS.fill)) {
      state.map.addLayer({
        id: DRAFT_ZONE_LAYER_IDS.fill,
        type: "fill",
        source: DRAFT_ZONE_SOURCE_ID,
        filter: ["==", ["get", "type"], "polygon"],
        paint: {
          "fill-color": accentColor,
          "fill-opacity": 0.25,
        },
      });
    }

    if (!state.map.getLayer(DRAFT_ZONE_LAYER_IDS.outline)) {
      state.map.addLayer({
        id: DRAFT_ZONE_LAYER_IDS.outline,
        type: "line",
        source: DRAFT_ZONE_SOURCE_ID,
        filter: ["any", ["==", ["get", "type"], "polygon"], ["==", ["get", "type"], "line"]],
        paint: {
          "line-color": accentColor,
          "line-width": 2,
          "line-dasharray": [4, 2],
        },
      });
    }

    if (!state.map.getLayer(DRAFT_ZONE_LAYER_IDS.vertices)) {
      state.map.addLayer({
        id: DRAFT_ZONE_LAYER_IDS.vertices,
        type: "circle",
        source: DRAFT_ZONE_SOURCE_ID,
        filter: ["==", ["get", "type"], "vertex"],
        paint: {
          "circle-radius": ["case", ["get", "isFirst"], 10, 6],
          "circle-color": ["case", ["get", "isFirst"], accentColor, bgColor],
          "circle-stroke-width": 2,
          "circle-stroke-color": accentColor,
        },
      });
    }
  }

  function syncZoneSource() {
    if (!state.map || !state.mapLoaded) return;
    ensureZoneLayersInternal();
    const source = state.map.getSource(ZONE_SOURCE_ID);
    if (source) source.setData(buildZoneGeoJson());
    syncSelectedZoneHighlight();
  }

  function syncDraftZoneSource() {
    if (!state.map || !state.mapLoaded) return;
    ensureDraftZoneLayers();
    const source = state.map.getSource(DRAFT_ZONE_SOURCE_ID);
    if (source) source.setData(buildDraftZoneGeoJson());
  }

  function clearZoneLayers() {
    if (!state.map) return;
    Object.values(ZONE_LAYER_IDS).forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        try { state.map.removeLayer(layerId); } catch (_e) {}
      }
    });
    Object.values(DRAFT_ZONE_LAYER_IDS).forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        try { state.map.removeLayer(layerId); } catch (_e) {}
      }
    });
    if (state.map.getSource(ZONE_SOURCE_ID)) {
      try { state.map.removeSource(ZONE_SOURCE_ID); } catch (_e) {}
    }
    if (state.map.getSource(DRAFT_ZONE_SOURCE_ID)) {
      try { state.map.removeSource(DRAFT_ZONE_SOURCE_ID); } catch (_e) {}
    }
    state.zoneLayersReady = false;
  }

  function ensureZoneLayers() {
    syncZoneSource();
  }

  function applyZonesLayerVisibility() {
    if (!state.map) return;
    const visibility = state.zonesLayerHidden ? "none" : "visible";
    Object.values(ZONE_LAYER_IDS).forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        try { state.map.setLayoutProperty(layerId, "visibility", visibility); } catch (_e) {}
      }
    });
  }

  function applyPoisLayerVisibility() {
    if (!state.map) return;
    const visibility = state.poisLayerHidden ? "none" : "visible";
    Object.values(POI_LAYER_IDS).forEach((layerId) => {
      if (state.map.getLayer(layerId)) {
        try { state.map.setLayoutProperty(layerId, "visibility", visibility); } catch (_e) {}
      }
    });
  }

  function toggleZonesLayer() {
    state.zonesLayerHidden = !state.zonesLayerHidden;
    applyZonesLayerVisibility();
    updateLayerToggleIcon("zones");
  }

  function togglePoisLayer() {
    state.poisLayerHidden = !state.poisLayerHidden;
    applyPoisLayerVisibility();
    updateLayerToggleIcon("pois");
  }

  function updateLayerToggleIcon(layer) {
    const { toggleZonesBtn, togglePoisBtn } = getEls();
    if (layer === "zones" && toggleZonesBtn) {
      const icon = toggleZonesBtn.querySelector("i");
      if (icon) icon.setAttribute("data-lucide", state.zonesLayerHidden ? "eye-off" : "eye");
      toggleZonesBtn.title = state.zonesLayerHidden ? "Mostrar zonas" : "Ocultar zonas";
      toggleZonesBtn.setAttribute("data-hidden", state.zonesLayerHidden ? "true" : "false");
      refreshLucideIcons();
    }
    if (layer === "pois" && togglePoisBtn) {
      const icon = togglePoisBtn.querySelector("i");
      if (icon) icon.setAttribute("data-lucide", state.poisLayerHidden ? "eye-off" : "eye");
      togglePoisBtn.title = state.poisLayerHidden ? "Mostrar lugares" : "Ocultar lugares";
      togglePoisBtn.setAttribute("data-hidden", state.poisLayerHidden ? "true" : "false");
      refreshLucideIcons();
    }
  }

  function ensurePoiLayers() {
    syncPoiSource();
  }

  function attachMapEvents() {
    if (!state.map) return;

    // Click on zone fill
    state.map.on("click", ZONE_LAYER_IDS.fill, (e) => {
      if (state.drawingZone || state.placingPoi) return;
      const features = state.map.queryRenderedFeatures(e.point, { layers: [ZONE_LAYER_IDS.fill] });
      if (!features.length) return;
      const zoneId = features[0].properties.id;
      if (zoneId) {
        setActiveAccordion("zones");
        selectZoneForEditing(zoneId);
      }
    });

    // Cursor pointer on zones
    state.map.on("mouseenter", ZONE_LAYER_IDS.fill, () => {
      if (!state.drawingZone) state.map.getCanvas().style.cursor = "pointer";
    });
    state.map.on("mouseleave", ZONE_LAYER_IDS.fill, () => {
      if (!state.drawingZone) state.map.getCanvas().style.cursor = "";
    });

    // Click on individual POI
    state.map.on("click", POI_LAYER_IDS.points, (e) => {
      if (state.placingPoi || state.drawingZone) return;
      const features = state.map.queryRenderedFeatures(e.point, { layers: [POI_LAYER_IDS.points] });
      if (!features.length) return;
      const poiId = features[0].properties.id;
      if (poiId) {
        setActiveAccordion("pois");
        selectPoiForEditing(poiId);
      }
    });

    // Cursor pointer on POI points only (not clusters)
    state.map.on("mouseenter", POI_LAYER_IDS.points, () => { state.map.getCanvas().style.cursor = "pointer"; });
    state.map.on("mouseleave", POI_LAYER_IDS.points, () => { state.map.getCanvas().style.cursor = ""; });

    // Click on map for zone drawing or POI placing
    state.map.on("click", (event) => {
      // Zone drawing mode
      if (state.drawingZone) {
        const coords = { lat: Number(event.lngLat.lat), lng: Number(event.lngLat.lng) };

        // Check if clicking near first vertex to close
        if (state.draftPolygon.length >= 3) {
          const firstPt = state.draftPolygon[0];
          const firstPixel = state.map.project([firstPt.lng, firstPt.lat]);
          const clickPixel = event.point;
          const distance = Math.sqrt(
            Math.pow(firstPixel.x - clickPixel.x, 2) +
            Math.pow(firstPixel.y - clickPixel.y, 2)
          );
          if (distance < 15) {
            closePolygon();
            return;
          }
        }

        state.draftPolygon.push(coords);
        syncDraftZoneSource();
        renderZoneSummary();
        return;
      }

      // POI placing mode
      if (state.placingPoi) {
        const poiFeatures = state.map.queryRenderedFeatures(event.point, { layers: [POI_LAYER_IDS.points, POI_LAYER_IDS.clusters] });
        if (poiFeatures.length > 0) return;
        applyDraftCoords({ lat: Number(event.lngLat.lat), lng: Number(event.lngLat.lng) });
        const { pickOnMapBtn } = getEls();
        if (pickOnMapBtn) {
          pickOnMapBtn.classList.remove("placing");
          pickOnMapBtn.title = "Marcar en el mapa";
        }
        state.placingPoi = false;
        showPoiCard();
      }
    });

    // Double-click to close polygon
    state.map.on("dblclick", (event) => {
      if (!state.drawingZone) return;
      event.preventDefault();
      if (state.draftPolygon.length >= 3) {
        closePolygon();
      }
    });

    // Hide context menu on regular click
    state.map.on("click", () => {
      hideContextMenu();
    });

    // Right-click context menu
    state.map.on("contextmenu", (event) => {
      event.preventDefault();
      const coords = { lat: event.lngLat.lat, lng: event.lngLat.lng };
      showContextMenu(event.originalEvent.clientX, event.originalEvent.clientY, coords);
    });

    // Drawing cursor when in drawing mode
    state.map.on("mousemove", () => {
      if (state.drawingZone) {
        state.map.getCanvas().style.cursor = "crosshair";
      }
    });
  }

  async function initMap() {
    const { mapEl } = getEls();
    if (!mapEl || !mapApi()?.createMap) return;

    if (state.map) {
      clearPoiLayers();
      try {
        state.themeSyncCleanup?.();
      } catch (_e) {}
      state.themeSyncCleanup = null;
      try {
        state.map.remove();
      } catch (_e) {}
      state.map = null;
      state.mapLoaded = false;
    }

    const view = currentViewConfig();
    mapEl.innerHTML = "";
    state.map = mapApi().createMap({
      container: mapEl,
      center: [view.lng, view.lat],
      zoom: view.zoom,
    });

    state.map.on("load", async () => {
      state.mapLoaded = true;
      // Order: Zones -> POIs (POIs on top)
      ensureZoneLayers();
      ensureDraftZoneLayers();
      ensurePoiLayers();
      attachMapEvents();
      setStatus("");
      queueViewportLayoutSync();
      if (state.activeTab === "territorio") {
        setTimeout(() => {
          state.map?.resize?.();
        }, 0);
      }
    });

    state.themeSyncCleanup = mapApi()?.bindThemeSync?.(state.map, {
      onStyleReload: () => {
        state.poiLayersReady = false;
        state.zoneLayersReady = false;
        ensureZoneLayers();
        ensureDraftZoneLayers();
        ensurePoiLayers();
      },
    }) || null;
  }

  async function reload() {
    const result = await service()?.fetchChronicleTerritory?.(state.chronicleId);
    if (result?.error) {
      console.error("chronicle-detail.territory.reload:", result.error);
      setStatus("No se pudo cargar el territorio de la crónica.");
      return;
    }

    state.config = result?.config || null;
    state.pois = Array.isArray(result?.pois) ? result.pois : [];
    state.zones = Array.isArray(result?.zones) ? result.zones : [];
    state.pendingConfigView = null;
    if (state.selectedPoiId && !state.pois.some((poi) => poi.id === state.selectedPoiId)) {
      state.selectedPoiId = null;
      state.draftCoords = null;
      state.poiCardVisible = false;
    }
    if (state.selectedZoneId && !state.zones.some((zone) => zone.id === state.selectedZoneId)) {
      state.selectedZoneId = null;
      state.draftPolygon = [];
      state.zoneCardVisible = false;
    }

    setStatus("");
    renderAll();
    syncZoneSource();
    syncPoiSource();
  }

  function updatePendingViewFromMap() {
    if (!state.map) return;
    const center = state.map.getCenter();
    state.pendingConfigView = {
      lat: Number(center.lat),
      lng: Number(center.lng),
      zoom: Number(state.map.getZoom()),
    };
    renderConfigModal();
  }

  function openConfigModal() {
    state.pendingConfigView = null;
    renderConfigModal();
    state.configModal?.open?.();
  }

  async function handleSaveConfig() {
    const { centerLabelInput, saveConfigBtn } = getEls();
    const centerLabel = String(centerLabelInput?.value || "").trim() || DEFAULT_VIEW.centerLabel;
    const view = currentSummaryView();

    if (!Number.isFinite(view.lat) || !Number.isFinite(view.lng) || !Number.isFinite(view.zoom)) {
      alert("No hay una posición base válida para guardar.");
      return;
    }

    if (saveConfigBtn) saveConfigBtn.disabled = true;
    const { data, error } = await service()?.upsertChronicleTerritoryConfig?.({
      chronicleId: state.chronicleId,
      playerId: state.currentPlayerId,
      centerLabel,
      centerLat: view.lat,
      centerLng: view.lng,
      zoom: view.zoom,
    }) || { data: null, error: new Error("Servicio no disponible") };
    if (saveConfigBtn) saveConfigBtn.disabled = false;

    if (error) {
      alert("No se pudo guardar la configuración: " + (error.message || error));
      return;
    }

    state.config = data || null;
    state.pendingConfigView = null;
    renderHeader();
    state.configModal?.close?.();
    if (state.map) {
      state.map.easeTo({
        center: [view.lng, view.lat],
        zoom: view.zoom,
        duration: 500,
      });
    }
  }

  async function handleSavePoi() {
    const {
      poiTitleInput,
      poiVisibilityInput,
      poiDescriptionInput,
      poiCoordsInput,
      savePoiBtn,
    } = getEls();
    const title = String(poiTitleInput?.value || "").trim();
    if (!title) {
      alert("Poné un nombre para el punto.");
      return;
    }

    const rawCoords = String(poiCoordsInput?.value || "").trim();
    const parsedCoords = rawCoords ? parseCoordsInput(rawCoords) : null;
    if (rawCoords && !parsedCoords) {
      alert("Pegá las coordenadas en formato \"lat, long\".");
      return;
    }

    // Coordinates are optional - POIs can exist without a known location
    const coords = parsedCoords || state.draftCoords || null;
    const hasCoords = coords && Number.isFinite(coords.lat) && Number.isFinite(coords.lng);

    if (hasCoords) {
      applyDraftCoords(coords);
    } else {
      state.draftCoords = null;
    }

    if (savePoiBtn) savePoiBtn.disabled = true;

    const selected = selectedPoi();
    let result;
    if (selected) {
      if (!canEditPoi(selected)) {
        if (savePoiBtn) savePoiBtn.disabled = false;
        alert("No tenés permisos para editar este punto.");
        return;
      }
      result = await service()?.updateChronicleTerritoryPoi?.({
        poiId: selected.id,
        chronicleId: state.chronicleId,
        title,
        description: String(poiDescriptionInput?.value || "").trim(),
        kind: getSelectedKind(),
        visibility: poiVisibilityInput?.value || "public",
        lat: hasCoords ? coords.lat : null,
        lng: hasCoords ? coords.lng : null,
      });
    } else {
      result = await service()?.createChronicleTerritoryPoi?.({
        chronicleId: state.chronicleId,
        currentPlayerId: state.currentPlayerId,
        title,
        description: String(poiDescriptionInput?.value || "").trim(),
        kind: getSelectedKind(),
        visibility: poiVisibilityInput?.value || "public",
        lat: hasCoords ? coords.lat : null,
        lng: hasCoords ? coords.lng : null,
      });
    }

    if (savePoiBtn) savePoiBtn.disabled = false;

    if (result?.error) {
      alert("No se pudo guardar el punto: " + (result.error.message || result.error));
      return;
    }

    const optimisticPoi = {
      ...(selected || {}),
      ...(result?.data || {}),
      title,
      description: String(poiDescriptionInput?.value || "").trim(),
      kind: getSelectedKind(),
      visibility: poiVisibilityInput?.value || "public",
      lat: hasCoords ? coords.lat : null,
      lng: hasCoords ? coords.lng : null,
      author_name: selected?.author_name || state.currentPlayerName || (state.isNarrator ? "Narrador" : "Vos"),
    };

    state.selectedPoiId = optimisticPoi.id || state.selectedPoiId;
    state.placingPoi = false;
    state.poiCardVisible = true;
    state.poiMode = "view";
    if (selected) {
      state.pois = state.pois.map((poi) => (poi.id === optimisticPoi.id ? optimisticPoi : poi));
    } else {
      state.pois = [optimisticPoi, ...state.pois];
    }
    if (state.map && hasCoords) {
      state.map.easeTo({
        center: [coords.lng, coords.lat],
        duration: 450,
      });
    }
    renderAll();
    syncPoiSource();
    await reload();
  }

  async function handleDeletePoi() {
    const poi = selectedPoi();
    if (!poi) return;
    if (!canEditPoi(poi)) {
      alert("No tenés permisos para eliminar este punto.");
      return;
    }
    if (!confirm(`¿Eliminar "${poi.title}" del territorio?`)) return;

    const { deletePoiBtn } = getEls();
    if (deletePoiBtn) deletePoiBtn.disabled = true;
    const { error } = await service()?.deleteChronicleTerritoryPoi?.({
      poiId: poi.id,
      chronicleId: state.chronicleId,
    }) || { error: new Error("Servicio no disponible") };
    if (deletePoiBtn) deletePoiBtn.disabled = false;

    if (error) {
      alert("No se pudo eliminar el punto: " + (error.message || error));
      return;
    }

    state.selectedPoiId = null;
    state.draftCoords = null;
    state.poiCardVisible = false;
    await reload();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone Save/Delete Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleSaveZone() {
    const {
      zoneNombreInput,
      zoneTipoInput,
      zoneEstadoInput,
      zoneRegenteInput,
      zoneColorInput,
      zoneVisibilityInput,
      zoneParentInput,
      zoneDescriptionInput,
      saveZoneBtn,
    } = getEls();
    const nombre = String(zoneNombreInput?.value || "").trim();
    if (!nombre) {
      alert("Ingresá un nombre para la zona.");
      return;
    }

    // Polygon is optional - zones without polygon are container/group zones
    // If 1-2 vertices, clear them (incomplete polygon)
    const polygon = state.draftPolygon.length >= 3 ? state.draftPolygon : [];

    if (saveZoneBtn) saveZoneBtn.disabled = true;

    const parentId = zoneParentInput?.value || null;
    const selected = selectedZone();
    let result;
    if (selected) {
      result = await service()?.updateChronicleTerritoryZone?.({
        zoneId: selected.id,
        chronicleId: state.chronicleId,
        nombre,
        descripcion: String(zoneDescriptionInput?.value || "").trim(),
        tipo: zoneTipoInput?.value || "territorio",
        estado: zoneEstadoInput?.value || "libre",
        regente: String(zoneRegenteInput?.value || "").trim(),
        color: zoneColorInput?.value || "#c41e3a",
        visibility: zoneVisibilityInput?.value || "public",
        polygon,
        parentId,
      });
    } else {
      result = await service()?.createChronicleTerritoryZone?.({
        chronicleId: state.chronicleId,
        currentPlayerId: state.currentPlayerId,
        nombre,
        descripcion: String(zoneDescriptionInput?.value || "").trim(),
        tipo: zoneTipoInput?.value || "territorio",
        estado: zoneEstadoInput?.value || "libre",
        regente: String(zoneRegenteInput?.value || "").trim(),
        color: zoneColorInput?.value || "#c41e3a",
        visibility: zoneVisibilityInput?.value || "public",
        polygon,
        parentId,
      });
    }

    if (saveZoneBtn) saveZoneBtn.disabled = false;

    if (result?.error) {
      alert("No se pudo guardar la zona: " + (result.error.message || result.error));
      return;
    }

    const optimisticZone = {
      ...(selected || {}),
      ...(result?.data || {}),
      nombre,
      descripcion: String(zoneDescriptionInput?.value || "").trim(),
      tipo: zoneTipoInput?.value || "territorio",
      estado: zoneEstadoInput?.value || "libre",
      regente: String(zoneRegenteInput?.value || "").trim(),
      color: zoneColorInput?.value || "#c41e3a",
      visibility: zoneVisibilityInput?.value || "public",
      polygon,
      parent_id: parentId,
      author_name: selected?.author_name || state.currentPlayerName || "Narrador",
    };

    state.selectedZoneId = optimisticZone.id || state.selectedZoneId;
    state.drawingZone = false;
    state.zoneCardVisible = true;
    state.zoneMode = "view";
    if (selected) {
      state.zones = state.zones.map((zone) => (zone.id === optimisticZone.id ? optimisticZone : zone));
    } else {
      state.zones = [optimisticZone, ...state.zones];
    }
    // Fit to zone bounds
    const bounds = getPolygonBounds(polygon);
    if (bounds && state.map) {
      state.map.fitBounds(bounds, {
        padding: 50,
        maxZoom: 15,
        duration: 450,
      });
    }
    renderAll();
    syncZoneSource();
    syncDraftZoneSource();
    await reload();
  }

  async function handleDeleteZone() {
    const zone = selectedZone();
    if (!zone) return;
    if (!confirm(`¿Eliminar la zona "${zone.nombre}"?`)) return;

    const { deleteZoneBtn } = getEls();
    if (deleteZoneBtn) deleteZoneBtn.disabled = true;
    const { error } = await service()?.deleteChronicleTerritoryZone?.({
      zoneId: zone.id,
      chronicleId: state.chronicleId,
    }) || { error: new Error("Servicio no disponible") };
    if (deleteZoneBtn) deleteZoneBtn.disabled = false;

    if (error) {
      alert("No se pudo eliminar la zona: " + (error.message || error));
      return;
    }

    state.selectedZoneId = null;
    state.draftPolygon = [];
    state.zoneCardVisible = false;
    state.drawingZone = false;
    syncDraftZoneSource();
    await reload();
  }

  function openNewZoneCard() {
    if (!state.isNarrator) return;
    // Clear any existing selection
    state.selectedZoneId = null;
    state.selectedPoiId = null;
    hidePoiCard();
    // Open card without drawing mode
    state.drawingZone = false;
    state.draftPolygon = [];
    state.zoneMode = "edit";
    state.zoneCardVisible = true;
    resetZoneEditor({ keepDraft: true, keepVisible: true });
    syncDraftZoneSource();
    const { zoneNombreInput } = getEls();
    zoneNombreInput?.focus?.();
  }

  function startDrawingPolygon() {
    if (!state.isNarrator) return;
    state.drawingZone = true;
    state.draftPolygon = [];
    setStatus("Click en el mapa para agregar vértices. Doble-click o click en el primer vértice para cerrar.");
    syncDraftZoneSource();
    renderZoneSummary();
  }

  function cancelZoneDrawing() {
    state.drawingZone = false;
    state.draftPolygon = [];
    state.zoneCardVisible = false;
    state.selectedZoneId = null;
    setStatus("");
    syncDraftZoneSource();
    resetZoneEditor();
    updateZoneListSelection();
  }

  function closePolygon() {
    if (state.draftPolygon.length < 3) {
      alert("Necesitás al menos 3 vértices para cerrar el polígono.");
      return;
    }
    state.drawingZone = false;
    setStatus("");
    syncDraftZoneSource();
    renderZoneSummary();
    // Focus on name input
    const { zoneNombreInput } = getEls();
    zoneNombreInput?.focus?.();
  }

  function bindUi() {
    const {
      searchInput,
      searchClearBtn,
      addPoiBtn,
      openConfigBtn,
      focusMapBtn,
      useMapViewBtn,
      saveConfigBtn,
      poiTitleInput,
      poiKindInput,
      poiVisibilityInput,
      poiDescriptionInput,
      poiCoordsInput,
      pickOnMapBtn,
      editPoiBtn,
      savePoiBtn,
      deletePoiBtn,
      cancelEditBtn,
      contextMenuEl,
      ctxGmapsBtn,
      configOverlay,
      configCloseBtn,
      configCancelBtn,
    } = getEls();

    if (!state.configModal && configOverlay) {
      state.configModal =
        global.ABNShared?.modal?.createController?.({
          overlay: configOverlay,
          closeButtons: [configCloseBtn, configCancelBtn],
        }) || null;
    }

    // Search functionality
    if (searchInput && !searchInput.dataset.bound) {
      searchInput.addEventListener("input", () => {
        state.searchQuery = searchInput.value;
        renderPoiList();
      });
      searchInput.dataset.bound = "1";
    }

    if (searchClearBtn && !searchClearBtn.dataset.bound) {
      searchClearBtn.addEventListener("click", () => {
        if (searchInput) searchInput.value = "";
        state.searchQuery = "";
        renderPoiList();
        searchInput?.focus?.();
      });
      searchClearBtn.dataset.bound = "1";
    }

    // Context menu: open in Google Maps
    if (ctxGmapsBtn && !ctxGmapsBtn.dataset.bound) {
      ctxGmapsBtn.addEventListener("click", () => {
        if (state.contextMenuCoords) {
          const url = buildGoogleMapsUrl(state.contextMenuCoords.lat, state.contextMenuCoords.lng);
          window.open(url, "_blank", "noopener");
        }
        hideContextMenu();
      });
      ctxGmapsBtn.dataset.bound = "1";
    }

    // Close context menu when clicking outside
    if (contextMenuEl && !contextMenuEl.dataset.boundOutside) {
      document.addEventListener("click", (e) => {
        if (!contextMenuEl.contains(e.target)) {
          hideContextMenu();
        }
      });
      contextMenuEl.dataset.boundOutside = "1";
    }

    if (openConfigBtn && !openConfigBtn.dataset.bound) {
      openConfigBtn.addEventListener("click", () => {
        if (!state.isNarrator) return;
        openConfigModal();
      });
      openConfigBtn.dataset.bound = "1";
    }

    if (focusMapBtn && !focusMapBtn.dataset.bound) {
      focusMapBtn.addEventListener("click", () => {
        setBannerCollapsed(!state.bannerCollapsed);
      });
      focusMapBtn.dataset.bound = "1";
    }

    // addPoiBtn is now handled in accordion bindings below

    if (useMapViewBtn && !useMapViewBtn.dataset.bound) {
      useMapViewBtn.addEventListener("click", updatePendingViewFromMap);
      useMapViewBtn.dataset.bound = "1";
    }

    if (saveConfigBtn && !saveConfigBtn.dataset.bound) {
      saveConfigBtn.addEventListener("click", () => void handleSaveConfig());
      saveConfigBtn.dataset.bound = "1";
    }

    [poiTitleInput, poiVisibilityInput, poiDescriptionInput].forEach((el) => {
      if (!el || el.dataset.boundPoiSummary) return;
      const eventName = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(eventName, () => {
        if (!state.poiCardVisible) return;
        renderPoiSummary();
      });
      el.dataset.boundPoiSummary = "1";
    });

    // Custom dropdown for POI kind
    if (poiKindInput && !poiKindInput.dataset.boundKindDropdown) {
      const btn = poiKindInput.querySelector(".cd-territory-kind-select-btn");
      const dropdown = poiKindInput.querySelector(".cd-territory-kind-dropdown");
      const options = poiKindInput.querySelectorAll(".cd-territory-kind-option");

      if (btn && dropdown) {
        btn.addEventListener("click", (e) => {
          e.stopPropagation();
          const isOpen = poiKindInput.classList.contains("open");
          poiKindInput.classList.toggle("open", !isOpen);
          btn.setAttribute("aria-expanded", String(!isOpen));
        });

        options.forEach((opt) => {
          opt.addEventListener("click", (e) => {
            e.stopPropagation();
            const kind = opt.dataset.kind || "interest";
            setSelectedKind(kind);
            poiKindInput.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
            if (state.poiCardVisible) renderPoiSummary();
          });
        });

        // Close dropdown on click outside
        document.addEventListener("click", (e) => {
          if (!poiKindInput.contains(e.target)) {
            poiKindInput.classList.remove("open");
            btn.setAttribute("aria-expanded", "false");
          }
        });
      }
      poiKindInput.dataset.boundKindDropdown = "1";
    }

    if (poiCoordsInput && !poiCoordsInput.dataset.boundCoords) {
      poiCoordsInput.addEventListener("input", () => {
        const raw = String(poiCoordsInput.value || "").trim();
        if (!raw) {
          state.draftCoords = null;
          return;
        }
        const parsed = parseCoordsInput(raw);
        if (!parsed) return;
        applyDraftCoords(parsed, { centerMap: true });
      });
      poiCoordsInput.dataset.boundCoords = "1";
    }

    if (pickOnMapBtn && !pickOnMapBtn.dataset.bound) {
      pickOnMapBtn.addEventListener("click", () => {
        state.placingPoi = true;
        pickOnMapBtn.classList.add("placing");
        pickOnMapBtn.title = "Esperando click en el mapa…";
        showPoiCard();
      });
      pickOnMapBtn.dataset.bound = "1";
    }

    if (editPoiBtn && !editPoiBtn.dataset.bound) {
      editPoiBtn.addEventListener("click", () => {
        const poi = selectedPoi();
        if (!poi || !canEditPoi(poi)) return;
        state.poiMode = "edit";
        renderPoiSummary(poi);
        poiTitleInput?.focus?.();
      });
      editPoiBtn.dataset.bound = "1";
    }

    if (savePoiBtn && !savePoiBtn.dataset.bound) {
      savePoiBtn.addEventListener("click", () => void handleSavePoi());
      savePoiBtn.dataset.bound = "1";
    }

    if (deletePoiBtn && !deletePoiBtn.dataset.bound) {
      deletePoiBtn.addEventListener("click", () => void handleDeletePoi());
      deletePoiBtn.dataset.bound = "1";
    }

    if (cancelEditBtn && !cancelEditBtn.dataset.bound) {
      cancelEditBtn.addEventListener("click", () => {
        state.selectedPoiId = null;
        state.draftCoords = null;
        state.poiCardVisible = false;
        state.placingPoi = false;
        resetPoiEditor();
        updatePoiListSelection();
      });
      cancelEditBtn.dataset.bound = "1";
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Zone UI Bindings
    // ─────────────────────────────────────────────────────────────────────────────

    const {
      addZoneBtn,
      toggleZonesBtn,
      togglePoisBtn,
      zoneNombreInput,
      zoneTipoInput,
      zoneEstadoInput,
      zoneRegenteInput,
      zoneColorInput,
      zoneVisibilityInput,
      zoneDescriptionInput,
      editZoneBtn,
      saveZoneBtn,
      deleteZoneBtn,
      drawZoneBtn,
      cancelZoneEditBtn,
    } = getEls();

    // addZoneBtn is now handled in accordion bindings below

    [zoneNombreInput, zoneTipoInput, zoneEstadoInput, zoneRegenteInput, zoneColorInput, zoneVisibilityInput, zoneDescriptionInput].forEach((el) => {
      if (!el || el.dataset.boundZoneSummary) return;
      const eventName = (el.tagName === "SELECT" || el.type === "color") ? "change" : "input";
      el.addEventListener(eventName, () => {
        if (!state.zoneCardVisible) return;
        renderZoneSummary();
        // Update draft zone preview color
        if (el === zoneColorInput && state.map && state.mapLoaded) {
          syncDraftZoneSource();
        }
      });
      el.dataset.boundZoneSummary = "1";
    });

    if (editZoneBtn && !editZoneBtn.dataset.bound) {
      editZoneBtn.addEventListener("click", () => {
        const zone = selectedZone();
        if (!zone) return;
        state.zoneMode = "edit";
        state.draftPolygon = Array.isArray(zone.polygon) ? [...zone.polygon] : [];
        renderZoneSummary(zone);
        zoneNombreInput?.focus?.();
        syncDraftZoneSource();
      });
      editZoneBtn.dataset.bound = "1";
    }

    if (saveZoneBtn && !saveZoneBtn.dataset.bound) {
      saveZoneBtn.addEventListener("click", () => void handleSaveZone());
      saveZoneBtn.dataset.bound = "1";
    }

    if (deleteZoneBtn && !deleteZoneBtn.dataset.bound) {
      deleteZoneBtn.addEventListener("click", () => void handleDeleteZone());
      deleteZoneBtn.dataset.bound = "1";
    }

    if (drawZoneBtn && !drawZoneBtn.dataset.bound) {
      drawZoneBtn.addEventListener("click", () => {
        startDrawingPolygon();
      });
      drawZoneBtn.dataset.bound = "1";
    }

    if (cancelZoneEditBtn && !cancelZoneEditBtn.dataset.bound) {
      cancelZoneEditBtn.addEventListener("click", () => {
        cancelZoneDrawing();
      });
      cancelZoneEditBtn.dataset.bound = "1";
    }

    // ESC key to cancel drawing
    if (!document.documentElement.dataset.zoneEscBound) {
      document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && (state.drawingZone || state.zoneCardVisible)) {
          cancelZoneDrawing();
        }
      });
      document.documentElement.dataset.zoneEscBound = "1";
    }

    // ─────────────────────────────────────────────────────────────────────────────
    // Accordion Bindings
    // ─────────────────────────────────────────────────────────────────────────────

    const { zonesSection, poisSection } = getEls();

    // Zones accordion header click
    const zonesHeader = zonesSection?.querySelector(".cd-territory-accordion-header");
    if (zonesHeader && !zonesHeader.dataset.boundAccordion) {
      zonesHeader.addEventListener("click", (e) => {
        // Don't toggle if clicking the action button
        if (e.target.closest(".cd-territory-accordion-action")) {
          e.stopPropagation();
          return;
        }
        // Toggle: if already active, switch to the other
        setActiveAccordion(state.activeAccordion === "zones" ? "pois" : "zones");
      });
      zonesHeader.dataset.boundAccordion = "1";
    }

    // POIs accordion header click
    const poisHeader = poisSection?.querySelector(".cd-territory-accordion-header");
    if (poisHeader && !poisHeader.dataset.boundAccordion) {
      poisHeader.addEventListener("click", (e) => {
        // Don't toggle if clicking the action button
        if (e.target.closest(".cd-territory-accordion-action")) {
          e.stopPropagation();
          return;
        }
        // Toggle: if already active, switch to the other
        setActiveAccordion(state.activeAccordion === "pois" ? "zones" : "pois");
      });
      poisHeader.dataset.boundAccordion = "1";
    }

    // Action buttons - stop propagation and handle their own logic
    if (addZoneBtn && !addZoneBtn.dataset.boundAccordionAction) {
      addZoneBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveAccordion("zones");
        openNewZoneCard();
      });
      addZoneBtn.dataset.boundAccordionAction = "1";
    }

    if (toggleZonesBtn && !toggleZonesBtn.dataset.boundAction) {
      toggleZonesBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        toggleZonesLayer();
      });
      toggleZonesBtn.dataset.boundAction = "1";
    }

    if (togglePoisBtn && !togglePoisBtn.dataset.boundAction) {
      togglePoisBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        togglePoisLayer();
      });
      togglePoisBtn.dataset.boundAction = "1";
    }

    if (addPoiBtn && !addPoiBtn.dataset.boundAccordionAction) {
      addPoiBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        setActiveAccordion("pois");
        state.draftCoords = state.map
          ? {
              lat: Number(state.map.getCenter().lat),
              lng: Number(state.map.getCenter().lng),
            }
          : null;
        state.placingPoi = true;
        state.poiCardVisible = true;
        resetPoiEditor({ keepDraft: true, keepVisible: true });
        const { poiTitleInput } = getEls();
        poiTitleInput?.focus?.();
      });
      addPoiBtn.dataset.boundAccordionAction = "1";
    }

    // Apply initial accordion state
    setActiveAccordion(state.activeAccordion);
  }

  function subscribe() {
    service()?.unsubscribeChannel?.(state.subscription);
    state.subscription = service()?.subscribeChronicleTerritory?.({
      chronicleId: state.chronicleId,
      onChange: () => {
        void reload();
      },
    }) || null;
  }

  async function init(config) {
    state.chronicleId = config.chronicleId;
    state.currentPlayerId = config.currentPlayerId;
    state.currentPlayerName = String(config.currentPlayerName || "");
    state.isNarrator = Boolean(config.isNarrator);
    state.selectedPoiId = null;
    state.draftCoords = null;
    state.placingPoi = false;
    state.poiCardVisible = false;
    state.pendingConfigView = null;
    state.bannerCollapsed = false;
    state.activeTab = document.querySelector("#chronicle-tabs .app-tab.active")?.dataset.tab || null;
    // Zone state reset
    state.selectedZoneId = null;
    state.draftPolygon = [];
    state.drawingZone = false;
    state.zoneCardVisible = false;
    state.zoneMode = "view";
    state.activeAccordion = "pois";

    bindUi();
    setBannerCollapsed(false);
    bindViewportSync();
    await reload();
    await initMap();
    subscribe();
  }

  function handleTabActivated(tabName) {
    state.activeTab = tabName;
    if (tabName !== "territorio") {
      if (state.bannerCollapsed) {
        setBannerCollapsed(false);
      }
      return;
    }
    queueViewportLayoutSync();
  }

  ns.territory = {
    init,
    handleTabActivated,
  };
})(window);
