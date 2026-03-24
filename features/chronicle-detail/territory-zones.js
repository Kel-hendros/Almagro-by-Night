(function initChronicleDetailTerritoryZones(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  function createTerritoryZonesApi(host) {
    const {
      state,
      getEls,
      zoneTipoMeta,
      getPolygonBounds,
      polygonToGeoJsonCoords,
      canEditZone,
      refreshLucideIcons,
      setActiveAccordion,
      setStatus,
      cssVar,
      ZONE_SOURCE_ID,
      ZONE_LAYER_IDS,
      DRAFT_ZONE_SOURCE_ID,
      DRAFT_ZONE_LAYER_IDS,
      global: globalRef,
    } = host;

    function selectedZone() {
      return state.zones.find((z) => z.id === state.selectedZoneId) || null;
    }

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
      [
        zoneNombreInput,
        zoneTipoInput,
        zoneEstadoInput,
        zoneRegenteInput,
        zoneColorInput,
        zoneVisibilityInput,
        zoneParentInput,
        zoneDescriptionInput,
      ].forEach((el) => {
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
      const editable = canEditZone();

      if (zoneFormEl) zoneFormEl.classList.toggle("view-mode", isViewMode);

      if (zoneDescriptionViewEl) {
        const markdown = String(zoneDescriptionInput?.value || data.descripcion || "").trim();
        zoneDescriptionViewEl.innerHTML = markdown
          ? (globalRef.renderMarkdown?.(markdown) || markdown.replace(/\n/g, "<br>"))
          : "";
      }

      if (zoneVertexCountEl) {
        const count = data.polygon?.length || 0;
        zoneVertexCountEl.textContent = count === 0
          ? "Sin polígono (grupo)"
          : `${count} vértice${count !== 1 ? "s" : ""}`;
      }

      if (editZoneBtn) editZoneBtn.classList.toggle("hidden", !(isViewMode && editable && data.id));
      if (saveZoneBtn) saveZoneBtn.classList.toggle("hidden", isViewMode || !editable);
      if (deleteZoneBtn) {
        deleteZoneBtn.classList.toggle("hidden", !(state.zoneMode === "edit" && editable && data.id));
      }
      if (drawZoneBtn) {
        drawZoneBtn.classList.toggle("hidden", isViewMode || state.drawingZone || !editable);
        drawZoneBtn.textContent = hasPolygon ? "Redibujar" : "Dibujar";
      }

      setZoneEditorEnabled(!isViewMode && editable);
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
      host.syncDraftZoneSource?.();
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

      const excludeIds = new Set();
      if (excludeZoneId) {
        excludeIds.add(excludeZoneId);
        getZoneDescendantIds(excludeZoneId).forEach((id) => excludeIds.add(id));
      }

      const availableParents = (state.zones || []).filter((z) => !excludeIds.has(z.id));
      const collator = new Intl.Collator("es", { sensitivity: "base" });
      availableParents.sort((a, b) => collator.compare(a.nombre || "", b.nombre || ""));

      let html = '<option value="">— Sin padre —</option>';
      availableParents.forEach((z) => {
        const escapedName = globalRef.escapeHtml?.(z.nombre) || z.nombre;
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

      host.hidePoiCard?.();
      state.selectedPoiId = null;
      state.draftCoords = null;
      host.syncSelectedPoiHighlight?.();
      host.updatePoiListSelection?.();

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

      populateZoneParentDropdown(zone.id);
      if (zoneParentInput) zoneParentInput.value = zone.parent_id || "";

      if (saveZoneBtn) saveZoneBtn.textContent = "Guardar";
      renderZoneSummary(zone);
      syncSelectedZoneHighlight();
      host.syncDraftZoneSource?.();
      updateZoneListSelection();
    }

    function syncSelectedZoneHighlight() {
      if (!state.map || !state.zoneLayersReady) return;
      (state.zones || []).forEach((zone) => {
        state.map.setFeatureState(
          { source: ZONE_SOURCE_ID, id: zone.id },
          { selected: zone.id === state.selectedZoneId },
        );
      });
    }

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
          <span class="cd-territory-zone-swatch" style="background-color: ${globalRef.escapeHtml?.(zone.color) || zone.color}"></span>
          <span class="cd-territory-list-item-name">${globalRef.escapeHtml?.(zone.nombre) || zone.nombre}</span>
        </div>
      `;
    }

    function buildHierarchicalZoneList(zones) {
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

      const collator = new Intl.Collator("es", { sensitivity: "base" });
      const sortFn = (a, b) => collator.compare(a.nombre || "", b.nombre || "");
      rootZones.sort(sortFn);
      Object.values(childrenMap).forEach((arr) => arr.sort(sortFn));

      const result = [];
      function traverse(zone, depth) {
        const children = childrenMap[zone.id] || [];
        const hasChildren = children.length > 0;
        const isCollapsed = state.collapsedZoneIds.has(zone.id);
        result.push({ zone, depth, hasChildren });
        if (!isCollapsed) {
          children.forEach((child) => traverse(child, depth + 1));
        }
      }
      rootZones.forEach((zone) => traverse(zone, 0));
      return result;
    }

    function renderZoneList() {
      const { zoneListGroupedEl, zoneListEmptyEl, addZoneBtn } = getEls();
      if (addZoneBtn) addZoneBtn.classList.toggle("hidden", !state.isNarrator);

      const zones = state.zones || [];
      if (zones.length === 0) {
        if (zoneListGroupedEl) zoneListGroupedEl.classList.add("hidden");
        if (zoneListEmptyEl) zoneListEmptyEl.classList.remove("hidden");
      } else {
        if (zoneListEmptyEl) zoneListEmptyEl.classList.add("hidden");
        if (zoneListGroupedEl) {
          zoneListGroupedEl.classList.remove("hidden");
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

      if (zoneListGroupedEl) {
        zoneListGroupedEl.querySelectorAll(".cd-territory-zone-item").forEach((item) => {
          if (item.dataset.boundClick) return;
          item.addEventListener("click", (e) => {
            if (e.target.closest(".cd-territory-zone-collapse-toggle")) return;
            if (e.target.closest(".cd-territory-zone-visibility-toggle")) return;
            const zoneId = item.dataset.zoneId;
            if (!zoneId) return;
            handleZoneListItemClick(zoneId);
          });
          item.dataset.boundClick = "1";
        });
      }

      if (state.isNarrator && zoneListGroupedEl) {
        bindZoneDragDrop(zoneListGroupedEl);
      }
    }

    function bindZoneDragDrop(container) {
      container.querySelectorAll(".cd-territory-zone-item[draggable='true']").forEach((item) => {
        if (item.dataset.boundDrag) return;

        item.addEventListener("dragstart", (e) => {
          state.draggedZoneId = item.dataset.zoneId;
          e.dataTransfer.effectAllowed = "move";
          e.dataTransfer.setData("text/plain", state.draggedZoneId);
          item.classList.add("cd-zone-dragging");
          markValidDropTargets(state.draggedZoneId, container);
        });

        item.addEventListener("dragend", () => {
          item.classList.remove("cd-zone-dragging");
          state.draggedZoneId = null;
          clearDropTargetStyles(container);
        });

        item.dataset.boundDrag = "1";
      });

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
          e.stopPropagation();
          item.classList.remove("cd-zone-drop-hover");
          const targetZoneId = item.dataset.zoneId;
          if (!state.draggedZoneId || state.draggedZoneId === targetZoneId) return;
          if (!item.classList.contains("cd-zone-drop-valid")) return;
          handleZoneReparent(state.draggedZoneId, targetZoneId);
        });

        item.dataset.boundDrop = "1";
      });

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
          handleZoneReparent(state.draggedZoneId, null);
        });

        header.dataset.boundDrop = "1";
      });
    }

    function markValidDropTargets(draggedZoneId, container) {
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

      const oldParentId = zone.parent_id;
      zone.parent_id = newParentId;
      renderZoneList();
      host.syncZoneSource?.();

      const { error } = await host.service()?.updateChronicleTerritoryZone?.({
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
        zone.parent_id = oldParentId;
        renderZoneList();
        host.syncZoneSource?.();
        alert("No se pudo mover la zona: " + (error.message || error));
      }
    }

    function handleZoneListItemClick(zoneId) {
      const zone = state.zones.find((z) => z.id === zoneId);
      if (!zone) return;

      setActiveAccordion("zones");

      const bounds = getPolygonBounds(zone.polygon);
      if (bounds && state.map) {
        state.map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 500,
        });
      }

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
      const idsToToggle = [zoneId, ...descendantIds];

      if (isCurrentlyHidden) {
        idsToToggle.forEach((id) => state.hiddenZoneIds.delete(id));
      } else {
        idsToToggle.forEach((id) => state.hiddenZoneIds.add(id));
      }

      renderZoneList();
      host.syncZoneSource?.();
    }

    function updateZoneListSelection() {
      const { zoneListGroupedEl } = getEls();
      if (zoneListGroupedEl) {
        zoneListGroupedEl.querySelectorAll(".cd-territory-zone-item").forEach((item) => {
          item.classList.toggle("selected", item.dataset.zoneId === state.selectedZoneId);
        });
      }
    }

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

      state.map.addLayer({
        id: ZONE_LAYER_IDS.fill,
        type: "fill",
        source: ZONE_SOURCE_ID,
        paint: {
          "fill-color": ["get", "color"],
          "fill-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.45, 0.25],
        },
      });

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
          try {
            state.map.removeLayer(layerId);
          } catch (_e) {}
        }
      });
      Object.values(DRAFT_ZONE_LAYER_IDS).forEach((layerId) => {
        if (state.map.getLayer(layerId)) {
          try {
            state.map.removeLayer(layerId);
          } catch (_e) {}
        }
      });
      if (state.map.getSource(ZONE_SOURCE_ID)) {
        try {
          state.map.removeSource(ZONE_SOURCE_ID);
        } catch (_e) {}
      }
      if (state.map.getSource(DRAFT_ZONE_SOURCE_ID)) {
        try {
          state.map.removeSource(DRAFT_ZONE_SOURCE_ID);
        } catch (_e) {}
      }
      state.zoneLayersReady = false;
    }

    function ensureZoneLayers() {
      syncZoneSource();
    }

    async function handleSaveZone() {
      if (!canEditZone()) {
        alert("Solo el narrador puede editar zonas.");
        return;
      }
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

      const polygon = state.draftPolygon.length >= 3 ? state.draftPolygon : [];
      if (saveZoneBtn) saveZoneBtn.disabled = true;

      const parentId = zoneParentInput?.value || null;
      const selected = selectedZone();
      let result;
      if (selected) {
        result = await host.service()?.updateChronicleTerritoryZone?.({
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
        result = await host.service()?.createChronicleTerritoryZone?.({
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

      const bounds = getPolygonBounds(polygon);
      if (bounds && state.map) {
        state.map.fitBounds(bounds, {
          padding: 50,
          maxZoom: 15,
          duration: 450,
        });
      }
      host.renderAll?.();
      host.syncZoneSource?.();
      host.syncDraftZoneSource?.();
      await host.reload?.();
    }

    async function handleDeleteZone() {
      const zone = selectedZone();
      if (!zone) return;
      if (!canEditZone()) {
        alert("Solo el narrador puede eliminar zonas.");
        return;
      }
      if (!confirm(`¿Eliminar la zona "${zone.nombre}"?`)) return;

      const { deleteZoneBtn } = getEls();
      if (deleteZoneBtn) deleteZoneBtn.disabled = true;
      const { error } = await host.service()?.deleteChronicleTerritoryZone?.({
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
      host.syncDraftZoneSource?.();
      await host.reload?.();
    }

    function openNewZoneCard() {
      if (!state.isNarrator) return;
      state.selectedZoneId = null;
      state.selectedPoiId = null;
      host.hidePoiCard?.();
      state.drawingZone = false;
      state.draftPolygon = [];
      state.zoneMode = "edit";
      state.zoneCardVisible = true;
      resetZoneEditor({ keepDraft: true, keepVisible: true });
      host.syncDraftZoneSource?.();
      const { zoneNombreInput } = getEls();
      zoneNombreInput?.focus?.();
    }

    function startDrawingPolygon() {
      if (!state.isNarrator) return;
      state.drawingZone = true;
      state.draftPolygon = [];
      setStatus("Click en el mapa para agregar vértices. Doble-click o click en el primer vértice para cerrar.");
      host.syncDraftZoneSource?.();
      renderZoneSummary();
    }

    function cancelZoneDrawing() {
      state.drawingZone = false;
      state.draftPolygon = [];
      state.zoneCardVisible = false;
      state.selectedZoneId = null;
      setStatus("");
      host.syncDraftZoneSource?.();
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
      host.syncDraftZoneSource?.();
      renderZoneSummary();
      const { zoneNombreInput } = getEls();
      zoneNombreInput?.focus?.();
    }

    return {
      selectedZone,
      hideZoneCard,
      showZoneCard,
      setZoneEditorEnabled,
      zoneDraftSnapshot,
      renderZoneSummary,
      resetZoneEditor,
      getZoneDescendantIds,
      populateZoneParentDropdown,
      selectZoneForEditing,
      syncSelectedZoneHighlight,
      renderZoneList,
      bindZoneListEvents,
      handleZoneReparent,
      handleZoneListItemClick,
      toggleZoneCollapse,
      toggleZoneVisibility,
      updateZoneListSelection,
      buildZoneGeoJson,
      buildDraftZoneGeoJson,
      ensureZoneSource,
      ensureDraftZoneSource,
      ensureZoneLayersInternal,
      ensureDraftZoneLayers,
      syncZoneSource,
      syncDraftZoneSource,
      clearZoneLayers,
      ensureZoneLayers,
      handleSaveZone,
      handleDeleteZone,
      openNewZoneCard,
      startDrawingPolygon,
      cancelZoneDrawing,
      closePolygon,
    };
  }

  ns.createTerritoryZonesApi = createTerritoryZonesApi;
})(window);
