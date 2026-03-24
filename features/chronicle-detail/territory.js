(function initChronicleDetailTerritory(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const mapApi = () => global.ABNSharedMap;
  const service = () => ns.service;
  const support = ns.territorySupport || {};
  const DEFAULT_VIEW = support.DEFAULT_VIEW;
  const POI_KIND_META = support.POI_KIND_META;
  const POI_KIND_ORDER = support.POI_KIND_ORDER;
  const POI_SOURCE_ID = support.POI_SOURCE_ID;
  const POI_SELECTED_SOURCE_ID = support.POI_SELECTED_SOURCE_ID;
  const POI_LAYER_IDS = support.POI_LAYER_IDS;
  const ZONE_SOURCE_ID = support.ZONE_SOURCE_ID;
  const ZONE_LAYER_IDS = support.ZONE_LAYER_IDS;
  const DRAFT_ZONE_SOURCE_ID = support.DRAFT_ZONE_SOURCE_ID;
  const DRAFT_ZONE_LAYER_IDS = support.DRAFT_ZONE_LAYER_IDS;
  const state = support.createInitialState ? support.createInitialState() : {};
  const getEls = support.getEls || (() => ({}));
  const cssVar = support.cssVar || (() => "");
  const kindMeta = support.kindMeta || ((kind) => POI_KIND_META[kind] || POI_KIND_META.interest);
  const zoneTipoMeta =
    support.zoneTipoMeta || ((tipo) => ((support.ZONE_TIPO_META || {})[tipo] || (support.ZONE_TIPO_META || {}).territorio));
  const zoneEstadoMeta =
    support.zoneEstadoMeta || ((estado) => ((support.ZONE_ESTADO_META || {})[estado] || (support.ZONE_ESTADO_META || {}).libre));
  const polygonToGeoJsonCoords = support.polygonToGeoJsonCoords || (() => null);
  const getPolygonBounds = support.getPolygonBounds || (() => null);
  const formatCoords = support.formatCoords || (() => "");
  const parseCoordsInput = support.parseCoordsInput || (() => null);
  const buildGoogleMapsUrl = support.buildGoogleMapsUrl || ((lat, lng) => `https://www.google.com/maps?q=${lat},${lng}`);
  const formatBaseViewValue = support.formatBaseViewValue || ((value) => String(value ?? ""));
  const normalizeNumber = support.normalizeNumber || ((value, fallback = null) => fallback);

  function canEditPoi(poi) {
    return support.canEditPoi ? support.canEditPoi(state, poi) : false;
  }

  function canEditZone() {
    return support.canEditZone ? support.canEditZone(state) : Boolean(state.isNarrator);
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

  function addManagedListener(target, eventName, handler, options) {
    if (!target?.addEventListener || typeof handler !== "function") return;
    target.addEventListener(eventName, handler, options);
    state.cleanupFns.push(() => {
      try {
        target.removeEventListener(eventName, handler, options);
      } catch (_e) {}
    });
  }

  function cleanupManagedResources() {
    const cleanupFns = Array.isArray(state.cleanupFns) ? state.cleanupFns.splice(0) : [];
    cleanupFns.reverse().forEach((cleanup) => {
      try {
        cleanup();
      } catch (_e) {}
    });
  }

  function destroyMap() {
    if (!state.map) return;
    clearZoneLayers();
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

  function resetState() {
    if (!support.createInitialState) return;
    Object.assign(state, support.createInitialState());
  }

  function destroy() {
    service()?.unsubscribeChannel?.(state.subscription);
    state.subscription = null;
    try {
      state.configModal?.destroy?.();
    } catch (_e) {}
    state.configModal = null;
    try {
      state.viewportObserver?.disconnect?.();
    } catch (_e) {}
    state.viewportObserver = null;
    destroyMap();
    cleanupManagedResources();
    state.viewportSyncBound = false;
    state.contextMenuOutsideBound = false;
    state.poiKindOutsideBound = false;
    state.zoneEscBound = false;
    state.routeGuardBound = false;
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
    addManagedListener(global, "resize", onViewportChange);
    addManagedListener(global.visualViewport, "resize", onViewportChange);

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

  function bindRouteGuard() {
    if (state.routeGuardBound) return;
    addManagedListener(global, "hashchange", () => {
      const nextHash = String(global.location.hash || "").replace(/^#/, "");
      if (!nextHash.startsWith("chronicle")) {
        destroy();
      }
    });
    state.routeGuardBound = true;
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

  const host = {
    state,
    getEls,
    kindMeta,
    zoneTipoMeta,
    canEditPoi,
    canEditZone,
    setSelectedKind,
    getSelectedKind,
    syncCoordsInputValue,
    renderPoiSummary,
    applyDraftCoords,
    refreshLucideIcons,
    setActiveAccordion,
    setStatus,
    cssVar,
    getPolygonBounds,
    polygonToGeoJsonCoords,
    POI_SOURCE_ID,
    POI_SELECTED_SOURCE_ID,
    POI_LAYER_IDS,
    POI_KIND_ORDER,
    ZONE_SOURCE_ID,
    ZONE_LAYER_IDS,
    DRAFT_ZONE_SOURCE_ID,
    DRAFT_ZONE_LAYER_IDS,
    parseCoordsInput,
    service,
    renderAll,
    reload,
    syncZoneSource,
    syncDraftZoneSource,
    syncSelectedZoneHighlight,
    syncSelectedPoiHighlight,
    updateZoneListSelection,
    updatePoiListSelection,
    hidePoiCard,
    hideZoneCard,
    global,
  };
  const poisApi = ns.createTerritoryPoisApi?.(host) || {};
  const zonesApi = ns.createTerritoryZonesApi?.(host) || {};

  function selectedZone() {
    return zonesApi.selectedZone?.() || null;
  }

  function selectedPoi() {
    return poisApi.selectedPoi?.() || null;
  }

  function syncSelectedPoiHighlight() {
    poisApi.syncSelectedPoiHighlight?.();
  }

  function setPoiEditorEnabled(enabled) {
    poisApi.setPoiEditorEnabled?.(enabled);
  }

  function hidePoiCard() {
    poisApi.hidePoiCard?.();
  }

  function showPoiCard() {
    poisApi.showPoiCard?.();
  }

  function resetPoiEditor(options = {}) {
    poisApi.resetPoiEditor?.(options);
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone Card Management
  // ─────────────────────────────────────────────────────────────────────────────

  function hideZoneCard() {
    zonesApi.hideZoneCard?.();
  }

  function showZoneCard() {
    zonesApi.showZoneCard?.();
  }

  function setZoneEditorEnabled(enabled) {
    zonesApi.setZoneEditorEnabled?.(enabled);
  }

  function zoneDraftSnapshot() {
    return zonesApi.zoneDraftSnapshot?.() || null;
  }

  function renderZoneSummary(snapshot = null) {
    zonesApi.renderZoneSummary?.(snapshot);
  }

  function resetZoneEditor(options = {}) {
    zonesApi.resetZoneEditor?.(options);
  }

  function populateZoneParentDropdown(excludeZoneId) {
    zonesApi.populateZoneParentDropdown?.(excludeZoneId);
  }

  function selectZoneForEditing(zoneId) {
    zonesApi.selectZoneForEditing?.(zoneId);
  }

  function syncSelectedZoneHighlight() {
    zonesApi.syncSelectedZoneHighlight?.();
  }

  function selectPoiForEditing(poiId) {
    poisApi.selectPoiForEditing?.(poiId);
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

  function renderPoiList() {
    poisApi.renderPoiList?.();
  }

  function renderZoneList() {
    zonesApi.renderZoneList?.();
  }

  function bindZoneListEvents() {
    zonesApi.bindZoneListEvents?.();
  }

  async function handleZoneReparent(zoneId, newParentId) {
    await zonesApi.handleZoneReparent?.(zoneId, newParentId);
  }

  function handleZoneListItemClick(zoneId) {
    zonesApi.handleZoneListItemClick?.(zoneId);
  }

  function toggleZoneCollapse(zoneId) {
    zonesApi.toggleZoneCollapse?.(zoneId);
  }

  function toggleZoneVisibility(zoneId) {
    zonesApi.toggleZoneVisibility?.(zoneId);
  }

  function updateZoneListSelection() {
    zonesApi.updateZoneListSelection?.();
  }

  function bindPoiListEvents() {
    poisApi.bindPoiListEvents?.();
  }

  function handlePoiListItemClick(poiId) {
    poisApi.handlePoiListItemClick?.(poiId);
  }

  function updatePoiListSelection() {
    poisApi.updatePoiListSelection?.();
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
    return poisApi.buildPoiGeoJson?.() || { type: "FeatureCollection", features: [] };
  }

  function ensurePoiSource() {
    poisApi.ensurePoiSource?.();
  }

  function ensurePoiLayersInternal() {
    poisApi.ensurePoiLayersInternal?.();
  }

  function syncPoiSource() {
    poisApi.syncPoiSource?.();
  }

  function clearPoiLayers() {
    poisApi.clearPoiLayers?.();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone GeoJSON and Layers
  // ─────────────────────────────────────────────────────────────────────────────

  function buildZoneGeoJson() {
    return zonesApi.buildZoneGeoJson?.() || { type: "FeatureCollection", features: [] };
  }

  function buildDraftZoneGeoJson() {
    return zonesApi.buildDraftZoneGeoJson?.() || { type: "FeatureCollection", features: [] };
  }

  function ensureZoneSource() {
    zonesApi.ensureZoneSource?.();
  }

  function ensureDraftZoneSource() {
    zonesApi.ensureDraftZoneSource?.();
  }

  function ensureZoneLayersInternal() {
    zonesApi.ensureZoneLayersInternal?.();
  }

  function ensureDraftZoneLayers() {
    zonesApi.ensureDraftZoneLayers?.();
  }

  function syncZoneSource() {
    zonesApi.syncZoneSource?.();
  }

  function syncDraftZoneSource() {
    zonesApi.syncDraftZoneSource?.();
  }

  function clearZoneLayers() {
    zonesApi.clearZoneLayers?.();
  }

  function ensureZoneLayers() {
    zonesApi.ensureZoneLayers?.();
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
    poisApi.ensurePoiLayers?.();
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
      destroyMap();
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
    await poisApi.handleSavePoi?.();
  }

  async function handleDeletePoi() {
    await poisApi.handleDeletePoi?.();
  }

  // ─────────────────────────────────────────────────────────────────────────────
  // Zone Save/Delete Handlers
  // ─────────────────────────────────────────────────────────────────────────────

  async function handleSaveZone() {
    await zonesApi.handleSaveZone?.();
  }

  async function handleDeleteZone() {
    await zonesApi.handleDeleteZone?.();
  }

  function openNewZoneCard() {
    zonesApi.openNewZoneCard?.();
  }

  function startDrawingPolygon() {
    zonesApi.startDrawingPolygon?.();
  }

  function cancelZoneDrawing() {
    zonesApi.cancelZoneDrawing?.();
  }

  function closePolygon() {
    zonesApi.closePolygon?.();
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
    if (contextMenuEl && !state.contextMenuOutsideBound) {
      addManagedListener(document, "click", (e) => {
        if (!contextMenuEl.contains(e.target)) {
          hideContextMenu();
        }
      });
      state.contextMenuOutsideBound = true;
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
        if (!state.poiKindOutsideBound) {
          addManagedListener(document, "click", (e) => {
            if (!poiKindInput.contains(e.target)) {
              poiKindInput.classList.remove("open");
              btn.setAttribute("aria-expanded", "false");
            }
          });
          state.poiKindOutsideBound = true;
        }
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
        if (!zone || !canEditZone()) return;
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
    if (!state.zoneEscBound) {
      addManagedListener(document, "keydown", (e) => {
        if (e.key === "Escape" && (state.drawingZone || state.zoneCardVisible)) {
          cancelZoneDrawing();
        }
      });
      state.zoneEscBound = true;
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
    destroy();
    resetState();
    state.chronicleId = config.chronicleId;
    state.currentPlayerId = config.currentPlayerId;
    state.currentPlayerName = String(config.currentPlayerName || "");
    state.isNarrator = Boolean(config.isNarrator);
    state.activeTab = document.querySelector("#chronicle-tabs .app-tab.active")?.dataset.tab || null;

    bindUi();
    bindRouteGuard();
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
    destroy,
  };
})(window);
