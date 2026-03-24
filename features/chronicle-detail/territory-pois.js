(function initChronicleDetailTerritoryPois(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  function createTerritoryPoisApi(host) {
    const {
      state,
      getEls,
      kindMeta,
      canEditPoi,
      setSelectedKind,
      getSelectedKind,
      syncCoordsInputValue,
      renderPoiSummary,
      applyDraftCoords,
      refreshLucideIcons,
      setActiveAccordion,
      cssVar,
      POI_SOURCE_ID,
      POI_SELECTED_SOURCE_ID,
      POI_LAYER_IDS,
      global: globalRef,
    } = host;

    function selectedPoi() {
      return state.pois.find((poi) => poi.id === state.selectedPoiId) || null;
    }

    function syncSelectedPoiHighlight() {
      if (!state.map || !state.mapLoaded) return;
      const source = state.map.getSource(POI_SELECTED_SOURCE_ID);
      if (!source) return;
      const poi = selectedPoi();
      const hasCoords = Number.isFinite(poi?.lat) && Number.isFinite(poi?.lng);
      source.setData({
        type: "FeatureCollection",
        features: hasCoords
          ? [{
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
            }]
          : [],
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

      host.hideZoneCard?.();
      state.selectedZoneId = null;
      state.draftPolygon = [];
      host.syncSelectedZoneHighlight?.();
      host.syncDraftZoneSource?.();
      host.updateZoneListSelection?.();

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
      updatePoiListSelection();
    }

    function renderPoiListItem(poi) {
      const meta = kindMeta(poi.kind);
      const hasLocation = Number.isFinite(poi.lat) && Number.isFinite(poi.lng);
      const isSelected = poi.id === state.selectedPoiId;
      return `
        <button class="cd-territory-list-item${isSelected ? " selected" : ""}" data-poi-id="${poi.id}">
          <span class="cd-territory-list-item-dot${hasLocation ? "" : " no-location"}" data-kind="${poi.kind}"></span>
          <span class="cd-territory-list-item-name">${globalRef.escapeHtml?.(poi.title) || poi.title}</span>
          <span class="cd-territory-list-item-type">${meta.label}</span>
        </button>
      `;
    }

    function renderPoiListSection(kind, pois) {
      const meta = kindMeta(kind);
      const isCollapsed = state.collapsedSections.has(kind);
      return `
        <div class="cd-territory-list-section${isCollapsed ? " collapsed" : ""}" data-kind="${kind}">
          <div class="cd-territory-list-section-header">
            <span class="cd-territory-list-section-arrow"><i data-lucide="chevron-down"></i></span>
            <span class="cd-territory-list-section-dot" data-kind="${kind}"></span>
            <span class="cd-territory-list-section-name">${meta.label}</span>
            <span class="cd-territory-list-section-count">${pois.length}</span>
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

      if (searchClearBtn) searchClearBtn.classList.toggle("hidden", !isSearching);

      if (isSearching) {
        const results = filterPoisBySearch(query) || [];
        if (listGroupedEl) listGroupedEl.classList.add("hidden");
        if (listEmptyEl) listEmptyEl.classList.add("hidden");
        if (listResultsEl) {
          listResultsEl.classList.remove("hidden");
          listResultsEl.innerHTML = results.length === 0
            ? `<div class="cd-territory-list-empty"><span>No se encontraron lugares</span></div>`
            : results.map(renderPoiListItem).join("");
        }
      } else {
        if (listResultsEl) listResultsEl.classList.add("hidden");
        const pois = state.pois || [];
        if (pois.length === 0) {
          if (listGroupedEl) listGroupedEl.classList.add("hidden");
          if (listEmptyEl) listEmptyEl.classList.remove("hidden");
        } else {
          if (listEmptyEl) listEmptyEl.classList.add("hidden");
          if (listGroupedEl) {
            listGroupedEl.classList.remove("hidden");
            const groups = {};
            host.POI_KIND_ORDER.forEach((kind) => {
              groups[kind] = [];
            });
            pois.forEach((poi) => {
              const kind = poi.kind || "interest";
              if (!groups[kind]) groups[kind] = [];
              groups[kind].push(poi);
            });
            const collator = new Intl.Collator("es", { sensitivity: "base" });
            Object.values(groups).forEach((list) => {
              list.sort((a, b) => collator.compare(a.title || "", b.title || ""));
            });
            listGroupedEl.innerHTML = host.POI_KIND_ORDER
              .filter((kind) => groups[kind].length > 0)
              .map((kind) => renderPoiListSection(kind, groups[kind]))
              .join("");
          }
        }
      }

      refreshLucideIcons();
      bindPoiListEvents();
    }

    function bindPoiListEvents() {
      const { listGroupedEl, listResultsEl } = getEls();

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

      setActiveAccordion("pois");

      const hasLocation = Number.isFinite(poi.lat) && Number.isFinite(poi.lng);
      if (hasLocation && state.map) {
        state.map.easeTo({
          center: [poi.lng, poi.lat],
          zoom: Math.max(state.map.getZoom(), 14),
          duration: 500,
        });
      }

      selectPoiForEditing(poiId);
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
      state.map.addSource(POI_SELECTED_SOURCE_ID, {
        type: "geojson",
        data: { type: "FeatureCollection", features: [] },
      });
    }

    function ensurePoiLayersInternal() {
      if (!state.map || state.poiLayersReady) return;
      ensurePoiSource();

      const accentColor = cssVar("--color-accent", "#c41e3a");
      const textColor = cssVar("--color-text-primary", "#ffffff");
      const bgColor = cssVar("--color-bg-base", "#111111");

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

      state.map.addLayer({
        id: POI_LAYER_IDS.points,
        type: "circle",
        source: POI_SOURCE_ID,
        filter: ["!", ["has", "point_count"]],
        paint: {
          "circle-radius": 10,
          "circle-color": [
            "match", ["get", "kind"],
            "interest", cssVar("--color-info", "#4a90c4"),
            "haven", cssVar("--color-success", "#2d8a4e"),
            "threat", cssVar("--color-danger", "#c41e3a"),
            "ally", cssVar("--color-accent", "#c41e3a"),
            "hq", cssVar("--color-warning", "#d4a900"),
            cssVar("--color-info", "#4a90c4"),
          ],
          "circle-stroke-width": 2,
          "circle-stroke-color": bgColor,
        },
      });

      state.map.addLayer({
        id: POI_LAYER_IDS.selectedHalo,
        type: "circle",
        source: POI_SELECTED_SOURCE_ID,
        paint: {
          "circle-radius": 16,
          "circle-color": "rgba(0, 0, 0, 0)",
          "circle-stroke-width": 3,
          "circle-stroke-color": textColor,
          "circle-stroke-opacity": 0.95,
        },
      });

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
          try {
            state.map.removeLayer(layerId);
          } catch (_e) {}
        }
      });
      if (state.map.getSource(POI_SOURCE_ID)) {
        try {
          state.map.removeSource(POI_SOURCE_ID);
        } catch (_e) {}
      }
      if (state.map.getSource(POI_SELECTED_SOURCE_ID)) {
        try {
          state.map.removeSource(POI_SELECTED_SOURCE_ID);
        } catch (_e) {}
      }
      state.poiLayersReady = false;
    }

    function ensurePoiLayers() {
      syncPoiSource();
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
      const parsedCoords = rawCoords ? host.parseCoordsInput(rawCoords) : null;
      if (rawCoords && !parsedCoords) {
        alert('Pegá las coordenadas en formato "lat, long".');
        return;
      }

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
        result = await host.service()?.updateChronicleTerritoryPoi?.({
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
        result = await host.service()?.createChronicleTerritoryPoi?.({
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
      host.renderAll?.();
      syncPoiSource();
      await host.reload?.();
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
      const { error } = await host.service()?.deleteChronicleTerritoryPoi?.({
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
      await host.reload?.();
    }

    return {
      selectedPoi,
      syncSelectedPoiHighlight,
      setPoiEditorEnabled,
      hidePoiCard,
      showPoiCard,
      resetPoiEditor,
      selectPoiForEditing,
      renderPoiList,
      bindPoiListEvents,
      handlePoiListItemClick,
      updatePoiListSelection,
      buildPoiGeoJson,
      ensurePoiSource,
      ensurePoiLayersInternal,
      syncPoiSource,
      clearPoiLayers,
      ensurePoiLayers,
      handleSavePoi,
      handleDeletePoi,
    };
  }

  ns.createTerritoryPoisApi = createTerritoryPoisApi;
})(window);
