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
  const BACKDROP_LAYER_IDS = [
    "cd-territory-backdrop-fill",
    "cd-territory-backdrop-outline",
    "cd-territory-backdrop-locations",
  ];

  const state = {
    chronicleId: null,
    currentPlayerId: null,
    currentPlayerName: "",
    isNarrator: false,
    backdrop: null,
    config: null,
    pois: [],
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
    backdropData: null,
    showBackdrop: true,
    poiMarkers: new Map(),
    bannerCollapsed: false,
    viewportSyncBound: false,
    viewportResizeHandler: null,
    viewportObserver: null,
  };

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback || "";
  }

  function escapeHtml(value) {
    return global.escapeHtml ? global.escapeHtml(value) : String(value || "");
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

  function formatKind(kind) {
    return kindMeta(kind).label;
  }

  function formatVisibility(visibility) {
    return visibility === "private" ? "Privada" : "Pública";
  }

  function formatVisibilityHelp(visibility) {
    return visibility === "private"
      ? "Solo la ven el autor y el Narrador"
      : "La ve toda la crónica";
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
      backdropToggleRowEl: document.getElementById("cd-territory-backdrop-toggle-row"),
      backdropToggleEl: document.getElementById("cd-territory-backdrop-toggle"),
      statusEl: document.getElementById("cd-territory-map-status"),
      addPoiBtn: document.getElementById("cd-territory-add-poi"),
      openConfigBtn: document.getElementById("cd-territory-open-config"),
      focusMapBtn: document.getElementById("cd-territory-focus-map"),
      poiCardEl: document.getElementById("cd-territory-poi-card"),
      poiViewEl: document.getElementById("cd-territory-poi-view"),
      poiBodyEl: document.getElementById("cd-territory-poi-body"),
      poiViewCoordsEl: document.getElementById("cd-territory-poi-view-coords"),
      poiEditFieldsEl: document.getElementById("cd-territory-poi-edit-fields"),
      poiKindPillEl: document.getElementById("cd-territory-poi-kind-pill"),
      poiKindIconEl: document.getElementById("cd-territory-poi-kind-icon"),
      poiKindLabelEl: document.getElementById("cd-territory-poi-kind-label"),
      poiAuthorEl: document.getElementById("cd-territory-poi-author"),
      poiVisibilityLabelEl: document.getElementById("cd-territory-poi-visibility-label"),
      poiTitleInput: document.getElementById("cd-territory-poi-title"),
      poiKindInput: document.getElementById("cd-territory-poi-kind"),
      poiVisibilityInput: document.getElementById("cd-territory-poi-visibility"),
      poiDescriptionInput: document.getElementById("cd-territory-poi-description"),
      poiCoordsInput: document.getElementById("cd-territory-poi-coords"),
      pickOnMapBtn: document.getElementById("cd-territory-pick-on-map"),
      editPoiBtn: document.getElementById("cd-territory-edit-poi"),
      savePoiBtn: document.getElementById("cd-territory-save-poi"),
      deletePoiBtn: document.getElementById("cd-territory-delete-poi"),
      cancelEditBtn: document.getElementById("cd-territory-cancel-edit"),
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

  function poiDraftSnapshot() {
    const { poiTitleInput, poiKindInput, poiVisibilityInput, poiDescriptionInput } = getEls();
    const selected = selectedPoi();
    return {
      id: selected?.id || null,
      title: String(poiTitleInput?.value || "").trim() || selected?.title || "Punto de interés",
      kind: poiKindInput?.value || selected?.kind || "interest",
      visibility: poiVisibilityInput?.value || selected?.visibility || "public",
      description: String(poiDescriptionInput?.value || selected?.description || ""),
      author_name:
        selected?.author_name ||
        state.currentPlayerName ||
        (state.isNarrator ? "Narrador" : "Vos"),
    };
  }

  function renderPoiSummary(snapshot = null) {
    const {
      poiViewEl,
      poiBodyEl,
      poiViewCoordsEl,
      poiEditFieldsEl,
      poiKindPillEl,
      poiKindIconEl,
      poiKindLabelEl,
      poiAuthorEl,
      poiVisibilityLabelEl,
      editPoiBtn,
      savePoiBtn,
      deletePoiBtn,
    } = getEls();
    const data = snapshot || poiDraftSnapshot();
    const meta = kindMeta(data.kind);
    const color = cssVar(meta.colorVar, cssVar("--color-info", "#4a90c4"));
    let shouldRefreshIcons = false;

    if (poiKindPillEl) poiKindPillEl.style.setProperty("--cd-poi-kind-color", color);
    if (poiKindIconEl) {
      poiKindIconEl.style.setProperty("--cd-poi-kind-color", color);
      if (poiKindIconEl.dataset.icon !== meta.icon) {
        poiKindIconEl.innerHTML = `<i data-lucide="${meta.icon}"></i>`;
        poiKindIconEl.dataset.icon = meta.icon;
        shouldRefreshIcons = true;
      }
    }
    if (poiKindLabelEl) poiKindLabelEl.textContent = meta.label;
    if (poiAuthorEl) poiAuthorEl.textContent = `Autor: ${data.author_name || "—"}`;
    if (poiVisibilityLabelEl) {
      poiVisibilityLabelEl.textContent = `${formatVisibility(data.visibility)} · ${formatVisibilityHelp(data.visibility)}`;
    }
    if (poiBodyEl) {
      const markdown = String(data.description || "").trim();
      poiBodyEl.innerHTML = markdown
        ? global.renderMarkdown?.(markdown) || escapeHtml(markdown).replace(/\n/g, "<br>")
        : "<p>Sin descripción.</p>";
    }
    if (poiViewCoordsEl) {
      poiViewCoordsEl.textContent = formatCoords({
        lat: normalizeNumber(data.lat, state.draftCoords?.lat),
        lng: normalizeNumber(data.lng, state.draftCoords?.lng),
      });
    }
    const editable = !data.id || canEditPoi(data);
    if (poiViewEl) poiViewEl.classList.toggle("hidden", state.poiMode !== "view");
    if (poiEditFieldsEl) poiEditFieldsEl.classList.toggle("hidden", state.poiMode !== "edit");
    if (editPoiBtn) editPoiBtn.classList.toggle("hidden", !(state.poiMode === "view" && editable && data.id));
    if (savePoiBtn) savePoiBtn.classList.toggle("hidden", state.poiMode !== "edit");
    if (deletePoiBtn) deletePoiBtn.classList.toggle("hidden", !(state.poiMode === "edit" && editable && data.id));
    setPoiEditorEnabled(state.poiMode === "edit" && editable);
    if (state.poiMode === "view" && poiEditFieldsEl) {
      const { pickOnMapBtn } = getEls();
      if (pickOnMapBtn) pickOnMapBtn.textContent = "Marcar en el mapa";
    }
    if (shouldRefreshIcons) refreshLucideIcons();
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
    state.poiMarkers.forEach((entry, poiId) => {
      entry.element?.classList?.toggle("is-selected", poiId === state.selectedPoiId);
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
    [poiTitleInput, poiKindInput, poiVisibilityInput, poiDescriptionInput].forEach((el) => {
      if (el) el.disabled = !enabled;
    });
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
      poiKindInput,
      poiVisibilityInput,
      poiDescriptionInput,
      savePoiBtn,
      deletePoiBtn,
      pickOnMapBtn,
    } = getEls();

    state.selectedPoiId = null;
    state.poiMode = "edit";
    if (!keepDraft) {
      state.draftCoords = null;
      state.placingPoi = false;
    }

    if (poiTitleInput) poiTitleInput.value = "";
    if (poiKindInput) poiKindInput.value = "interest";
    if (poiVisibilityInput) poiVisibilityInput.value = "public";
    if (poiDescriptionInput) poiDescriptionInput.value = "";
    syncCoordsInputValue();
    if (savePoiBtn) {
      savePoiBtn.classList.remove("hidden");
      savePoiBtn.textContent = "Guardar punto";
    }
    if (pickOnMapBtn) {
      pickOnMapBtn.textContent = state.placingPoi ? "Esperando click…" : "Marcar en el mapa";
    }
    syncSelectedPoiHighlight();
    renderPoiSummary({
      kind: poiKindInput?.value || "interest",
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

  function selectPoiForEditing(poiId) {
    const poi = state.pois.find((item) => item.id === poiId);
    const {
      poiTitleInput,
      poiKindInput,
      poiVisibilityInput,
      poiDescriptionInput,
      savePoiBtn,
      deletePoiBtn,
      pickOnMapBtn,
    } = getEls();

    if (!poi) {
      resetPoiEditor();
      return;
    }

    state.selectedPoiId = poi.id;
    state.poiMode = "view";
    applyDraftCoords({ lat: Number(poi.lat), lng: Number(poi.lng) });
    state.placingPoi = false;
    showPoiCard();

    if (poiTitleInput) poiTitleInput.value = poi.title || "";
    if (poiKindInput) poiKindInput.value = poi.kind || "interest";
    if (poiVisibilityInput) poiVisibilityInput.value = poi.visibility || "public";
    if (poiDescriptionInput) poiDescriptionInput.value = poi.description || "";
    if (pickOnMapBtn) pickOnMapBtn.textContent = "Marcar en el mapa";

    if (savePoiBtn) savePoiBtn.textContent = "Guardar cambios";
    renderPoiSummary(poi);
    syncSelectedPoiHighlight();
  }

  function renderHeader() {
    const { titleEl, backdropToggleRowEl, backdropToggleEl, openConfigBtn, configNoteEl } = getEls();
    const view = currentViewConfig();
    const hasBackdrop = Boolean(state.backdrop?.maptiler_dataset_url);

    if (titleEl) titleEl.textContent = view.centerLabel || "Territorio de la Crónica";
    if (backdropToggleRowEl) backdropToggleRowEl.classList.toggle("hidden", !hasBackdrop);
    if (backdropToggleEl) backdropToggleEl.checked = hasBackdrop && state.showBackdrop;
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

  function renderAll() {
    renderHeader();
    renderConfigModal();
    if (state.selectedPoiId) {
      selectPoiForEditing(state.selectedPoiId);
      return;
    }
    if (state.poiCardVisible) {
      resetPoiEditor({ keepDraft: Boolean(state.draftCoords), keepVisible: true });
      return;
    }
    resetPoiEditor();
  }

  function clearPoiMarkers() {
    state.poiMarkers.forEach((entry) => {
      try {
        entry.marker?.remove?.();
      } catch (_e) {}
    });
    state.poiMarkers.clear();
  }

  function createPoiMarker(poi) {
    if (!state.map) return null;
    const meta = kindMeta(poi.kind);
    const color = cssVar(meta.colorVar, cssVar("--color-info", "#4a90c4"));
    const element = document.createElement("button");
    element.type = "button";
    element.className = "cd-territory-marker";
    element.title = poi.title || meta.label;
    element.setAttribute("aria-label", poi.title || meta.label);
    element.innerHTML = `<span class="cd-territory-marker-core" style="--cd-poi-kind-color:${color}"><span class="cd-territory-marker-glyph">${escapeHtml(meta.glyph || "•")}</span></span>`;
    element.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      selectPoiForEditing(poi.id);
    });
    const marker = new maplibregl.Marker({ element, anchor: "center" })
      .setLngLat([Number(poi.lng), Number(poi.lat)])
      .addTo(state.map);
    return { marker, element };
  }

  function syncPoiMarkers() {
    if (!state.mapLoaded || !state.map) return;
    const activeIds = new Set((state.pois || []).map((poi) => poi.id));
    state.poiMarkers.forEach((entry, poiId) => {
      if (activeIds.has(poiId)) return;
      try {
        entry.marker?.remove?.();
      } catch (_e) {}
      state.poiMarkers.delete(poiId);
    });

    (state.pois || []).forEach((poi) => {
      const existing = state.poiMarkers.get(poi.id);
      const meta = kindMeta(poi.kind);
      const color = cssVar(meta.colorVar, cssVar("--color-info", "#4a90c4"));
      if (!existing) {
        const created = createPoiMarker(poi);
        if (created) state.poiMarkers.set(poi.id, created);
        return;
      }
      existing.marker?.setLngLat?.([Number(poi.lng), Number(poi.lat)]);
      existing.element.title = poi.title || meta.label;
      existing.element.setAttribute("aria-label", poi.title || meta.label);
      existing.element.innerHTML = `<span class="cd-territory-marker-core" style="--cd-poi-kind-color:${color}"><span class="cd-territory-marker-glyph">${escapeHtml(meta.glyph || "•")}</span></span>`;
    });

    syncSelectedPoiHighlight();
  }

  function applyBackdropVisibility() {
    if (!state.map) return;
    const visibility = state.showBackdrop ? "visible" : "none";
    BACKDROP_LAYER_IDS.forEach((layerId) => {
      if (!state.map.getLayer(layerId)) return;
      try {
        state.map.setLayoutProperty(layerId, "visibility", visibility);
      } catch (_error) {}
    });
  }

  function ensurePoiLayers() {
    syncPoiMarkers();
  }

  async function loadBackdropDataset() {
    if (!state.map || !state.backdrop?.maptiler_dataset_url) return;
    try {
      state.backdropData = await mapApi()?.fetchGeoJson(state.backdrop.maptiler_dataset_url);
      mapApi()?.addDatasetLayers(state.map, {
        sourceId: "cd-territory-backdrop",
        data: state.backdropData,
        zoneFillId: "cd-territory-backdrop-fill",
        zoneOutlineId: "cd-territory-backdrop-outline",
        locationCircleId: "cd-territory-backdrop-locations",
        zoneHighlightId: "cd-territory-backdrop-highlight-zone",
        locationHighlightId: "cd-territory-backdrop-highlight-location",
        zoneFillColor: cssVar("--color-info-soft", "#1a3a5c"),
        zoneFillOpacity: 0.18,
        zoneOutlineColor: cssVar("--color-border-strong", "#44444a"),
        locationFillColor: cssVar("--color-info", "#4a90c4"),
        locationStrokeColor: cssVar("--color-bg-base", "#111111"),
        locationRadius: 4,
        highlightLineColor: "transparent",
        highlightLineWidth: 0,
        highlightCircleColor: "transparent",
        highlightCircleRadius: 0,
        highlightCircleOpacity: 0,
      });
      applyBackdropVisibility();

      if (!state.config) {
        mapApi()?.fitMapToGeoJson(state.map, state.backdropData, {
          padding: 50,
          maxZoom: 12,
          duration: 0,
        });
      }
    } catch (error) {
      console.warn("chronicle-detail.territory.backdrop:", error);
      setStatus("No se pudo cargar el fondo territorial. El mapa base sigue disponible.");
    }
  }

  function attachMapEvents() {
    if (!state.map) return;

    state.map.on("click", (event) => {
      if (!state.placingPoi) return;
      applyDraftCoords({
        lat: Number(event.lngLat.lat),
        lng: Number(event.lngLat.lng),
      });
      const { pickOnMapBtn } = getEls();
      if (pickOnMapBtn) pickOnMapBtn.textContent = "Marcar en el mapa";
      state.placingPoi = false;
      showPoiCard();
    });
  }

  async function initMap() {
    const { mapEl } = getEls();
    if (!mapEl || !mapApi()?.createMap) return;

    if (state.map) {
      clearPoiMarkers();
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
      await loadBackdropDataset();
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
        void loadBackdropDataset().then(() => {
          ensurePoiLayers();
          applyBackdropVisibility();
        });
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
    state.pendingConfigView = null;
    if (state.selectedPoiId && !state.pois.some((poi) => poi.id === state.selectedPoiId)) {
      state.selectedPoiId = null;
      state.draftCoords = null;
      state.poiCardVisible = false;
    }

    setStatus("");
    renderAll();
    syncPoiMarkers();
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
      poiKindInput,
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

    const coords =
      parsedCoords ||
      state.draftCoords ||
      (state.map
        ? {
            lat: Number(state.map.getCenter().lat),
            lng: Number(state.map.getCenter().lng),
          }
        : null);

    if (!coords || !Number.isFinite(coords.lat) || !Number.isFinite(coords.lng)) {
      alert("Elegí una ubicación en el mapa antes de guardar.");
      return;
    }

    applyDraftCoords(coords);

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
        kind: poiKindInput?.value || "interest",
        visibility: poiVisibilityInput?.value || "public",
        lat: coords.lat,
        lng: coords.lng,
      });
    } else {
      result = await service()?.createChronicleTerritoryPoi?.({
        chronicleId: state.chronicleId,
        currentPlayerId: state.currentPlayerId,
        title,
        description: String(poiDescriptionInput?.value || "").trim(),
        kind: poiKindInput?.value || "interest",
        visibility: poiVisibilityInput?.value || "public",
        lat: coords.lat,
        lng: coords.lng,
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
      kind: poiKindInput?.value || "interest",
      visibility: poiVisibilityInput?.value || "public",
      lat: coords.lat,
      lng: coords.lng,
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
    if (state.map) {
      state.map.easeTo({
        center: [coords.lng, coords.lat],
        duration: 450,
      });
    }
    renderAll();
    syncPoiMarkers();
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

  function bindUi() {
    const {
      addPoiBtn,
      openConfigBtn,
      focusMapBtn,
      useMapViewBtn,
      saveConfigBtn,
      backdropToggleEl,
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

    if (addPoiBtn && !addPoiBtn.dataset.bound) {
      addPoiBtn.addEventListener("click", () => {
        state.draftCoords = state.map
          ? {
              lat: Number(state.map.getCenter().lat),
              lng: Number(state.map.getCenter().lng),
            }
          : null;
        state.placingPoi = true;
        state.poiCardVisible = true;
        resetPoiEditor({ keepDraft: true, keepVisible: true });
        poiTitleInput?.focus?.();
      });
      addPoiBtn.dataset.bound = "1";
    }

    if (useMapViewBtn && !useMapViewBtn.dataset.bound) {
      useMapViewBtn.addEventListener("click", updatePendingViewFromMap);
      useMapViewBtn.dataset.bound = "1";
    }

    if (saveConfigBtn && !saveConfigBtn.dataset.bound) {
      saveConfigBtn.addEventListener("click", () => void handleSaveConfig());
      saveConfigBtn.dataset.bound = "1";
    }

    [poiTitleInput, poiKindInput, poiVisibilityInput, poiDescriptionInput].forEach((el) => {
      if (!el || el.dataset.boundPoiSummary) return;
      const eventName = el.tagName === "SELECT" ? "change" : "input";
      el.addEventListener(eventName, () => {
        if (!state.poiCardVisible) return;
        renderPoiSummary();
      });
      el.dataset.boundPoiSummary = "1";
    });

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

    if (backdropToggleEl && !backdropToggleEl.dataset.bound) {
      backdropToggleEl.addEventListener("change", () => {
        state.showBackdrop = Boolean(backdropToggleEl.checked);
        applyBackdropVisibility();
      });
      backdropToggleEl.dataset.bound = "1";
    }

    if (pickOnMapBtn && !pickOnMapBtn.dataset.bound) {
      pickOnMapBtn.addEventListener("click", () => {
        state.placingPoi = true;
        pickOnMapBtn.textContent = "Esperando click…";
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
      });
      cancelEditBtn.dataset.bound = "1";
    }
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
    state.backdrop = config.gameBackdrop || null;
    state.selectedPoiId = null;
    state.draftCoords = null;
    state.placingPoi = false;
    state.poiCardVisible = false;
    state.pendingConfigView = null;
    state.showBackdrop = true;
    state.bannerCollapsed = false;
    state.activeTab = document.querySelector("#chronicle-tabs .app-tab.active")?.dataset.tab || null;

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
