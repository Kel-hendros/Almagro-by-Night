(function initAEEncounterDrawerModule(global) {
  function createController(ctx) {
    const {
      state,
      els,
      canEditEncounter,
      requireAdminAction,
      setActiveMapLayer,
      openBrowser,
      loadDesignAssets,
      openModal,
      requestBackgroundUpload,
      removeEncounterBackground,
      getMap,
      getTilePainter,
      getWallDrawer,
      addLight,
      findLightAt,
      removeLight,
    } = ctx;

    function setDrawerTab(tab) {
      var tabs = ["entities", "terrain", "settings"];
      tabs.forEach(function (t) {
        var btn = els["drawerTab_" + t];
        var pane = els["drawerTabPane_" + t];
        if (btn) btn.classList.toggle("active", t === tab);
        if (pane) pane.classList.toggle("active", t === tab);
      });
    }

    function clampGridLevel(level) {
      const n = parseInt(level, 10);
      if (!Number.isFinite(n)) return 5;
      return Math.max(0, Math.min(5, n));
    }

    function getGridLevelFromMapData() {
      const mapData = state.encounter?.data?.map || {};
      const opacity = Math.min(
        1,
        Math.max(0, parseFloat(mapData.gridOpacity) || 0),
      );
      return clampGridLevel(Math.round(opacity * 5));
    }

    function refreshGridOpacityButtons() {
      const level = getGridLevelFromMapData();
      const buttons = els.gridOpacityLevels?.querySelectorAll("[data-level]") || [];
      buttons.forEach((btn) => {
        const btnLevel = clampGridLevel(btn.dataset.level);
        btn.classList.toggle("active", btnLevel === level);
        btn.disabled = !canEditEncounter();
      });
    }

    function applyGridOpacityLevel(level) {
      if (!canEditEncounter()) return;
      const safeLevel = clampGridLevel(level);
      const gridOpacity = safeLevel / 5;
      const nextMap = {
        ...(state.encounter?.data?.map || {}),
        gridOpacity,
        showGrid: gridOpacity > 0,
      };
      if (state.encounter?.data) {
        state.encounter.data.map = nextMap;
      }
      const map = getMap?.();
      if (map) {
        map.mapLayer = {
          ...map.mapLayer,
          gridOpacity,
          showGrid: gridOpacity > 0,
        };
        map.draw();
      }
      if (typeof map?.onBackgroundChange === "function") {
        map.onBackgroundChange(nextMap);
      }
      refreshGridOpacityButtons();
    }

    function bindAddBtn(id, handler) {
      document.getElementById(id)?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handler();
      });
    }

    function bindEvents() {
      bindAddBtn("btn-ae-add-bg", () => {
        if (!requireAdminAction()) return;
        setActiveMapLayer("background", { openDrawer: false });
        requestBackgroundUpload();
      });

      bindAddBtn("btn-ae-add-decor", async () => {
        if (!requireAdminAction()) return;
        await loadDesignAssets();
        openBrowser("decor");
      });

      bindAddBtn("btn-ae-add-entity-npc", () => {
        if (!requireAdminAction()) return;
        openBrowser("npc");
      });
      bindAddBtn("btn-ae-add-entity-pc", () => {
        if (!requireAdminAction()) return;
        openBrowser("pc");
      });

      const drawer = document.getElementById("ae-tools-drawer");
      const toggleBtn = document.getElementById("btn-ae-toggle-tools");
      if (toggleBtn && drawer) {
        toggleBtn.addEventListener("click", () => {
          drawer.classList.toggle("open");
        });
      }

      document
        .getElementById("btn-ae-map-remove-bg")
        ?.addEventListener("click", async () => {
          if (!requireAdminAction()) return;
          await removeEncounterBackground();
        });

      els.drawerTab_entities?.addEventListener("click", () => setDrawerTab("entities"));
      els.drawerTab_terrain?.addEventListener("click", () => setDrawerTab("terrain"));
      els.drawerTab_settings?.addEventListener("click", () => setDrawerTab("settings"));
      els.gridOpacityLevels
        ?.querySelectorAll("[data-level]")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            applyGridOpacityLevel(btn.dataset.level);
          });
        });

      // freeMovement toggle removed — coordinates are always continuous (no grid snapping)

      // Terrain palette
      renderTerrainPalette();
      bindTerrainEvents();

      // Wall tools
      bindWallEvents();

      // Light tools
      bindLightEvents();

      // Fog tools (toggle + mode only, brush removed)
      bindFogEvents();

      setDrawerTab("entities");
      refreshGridOpacityButtons();
    }

    function renderTerrainPalette() {
      const palette = document.getElementById("ae-terrain-palette");
      if (!palette || !global.TileTextures) return;
      const TT = global.TileTextures;
      palette.innerHTML = TT.TEXTURE_IDS.map((id) => {
        const label = TT.TEXTURE_LABELS[id] || id;
        const thumb = TT.getThumbnailDataUrl(id);
        return '<button class="ae-terrain-swatch" data-texture="' + id + '" title="' + label + '">' +
          '<img src="' + thumb + '" alt="' + label + '" width="36" height="36">' +
          '<span>' + label + '</span></button>';
      }).join("");
    }

    function bindTerrainEvents() {
      const palette = document.getElementById("ae-terrain-palette");
      if (palette) {
        palette.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-texture]");
          if (!btn || !requireAdminAction()) return;
          const painter = getTilePainter?.();
          if (!painter) return;
          const textureId = btn.dataset.texture;
          const wasActive = painter.getTexture() === textureId && painter.isActive();
          if (wasActive) {
            painter.deactivate();
          } else {
            deactivateOtherTools("tilePainter");
            painter.setTexture(textureId);
          }
          refreshTerrainPaletteUI();
        });
      }

      const brushBtns = document.getElementById("ae-brush-sizes");
      if (brushBtns) {
        brushBtns.addEventListener("click", (e) => {
          const btn = e.target.closest("[data-brush]");
          if (!btn) return;
          const painter = getTilePainter?.();
          if (!painter) return;
          painter.setBrushSize(parseInt(btn.dataset.brush, 10) || 1);
          refreshBrushSizeUI();
        });
      }

      document.getElementById("btn-ae-terrain-eraser")?.addEventListener("click", () => {
        if (!requireAdminAction()) return;
        const painter = getTilePainter?.();
        if (!painter) return;
        if (painter.isActive() && !painter.getTexture()) {
          painter.deactivate();
        } else {
          deactivateOtherTools("tilePainter");
          painter.setTexture(null);
          painter.activate(null);
        }
        refreshTerrainPaletteUI();
      });

      document.getElementById("btn-ae-terrain-clear")?.addEventListener("click", () => {
        if (!requireAdminAction()) return;
        const painter = getTilePainter?.();
        if (!painter) return;
        if (confirm("¿Limpiar todo el terreno?")) {
          painter.clearAll();
        }
      });
    }

    function refreshTerrainPaletteUI() {
      const painter = getTilePainter?.();
      const activeTexture = painter?.isActive() ? painter.getTexture() : null;
      const isEraserActive = painter?.isActive() && !painter.getTexture();
      const swatches = document.querySelectorAll(".ae-terrain-swatch");
      swatches.forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.texture === activeTexture);
      });
      const eraserBtn = document.getElementById("btn-ae-terrain-eraser");
      if (eraserBtn) eraserBtn.classList.toggle("active", isEraserActive);
      refreshBrushSizeUI();
    }

    function refreshBrushSizeUI() {
      const painter = getTilePainter?.();
      const currentSize = painter?.getBrushSize() || 1;
      const btns = document.querySelectorAll("#ae-brush-sizes [data-brush]");
      btns.forEach((btn) => {
        btn.classList.toggle("active", parseInt(btn.dataset.brush, 10) === currentSize);
      });
    }

    // ── Mutual exclusion helper ──

    function deactivateOtherTools(except) {
      if (except !== "tilePainter") {
        var painter = getTilePainter?.();
        if (painter?.isActive()) {
          painter.deactivate();
          refreshTerrainPaletteUI();
        }
      }
      if (except !== "wallDrawer") {
        var wd = getWallDrawer?.();
        if (wd?.isActive()) {
          wd.deactivate();
          refreshWallUI();
        }
      }
      if (except !== "lightPlacer" && lightPlaceMode) {
        deactivateLightPlacer();
      }
    }

    // ── Wall Tools ──

    function bindWallEvents() {
      // Mode selector buttons (Draw / Edit / Erase)
      document.querySelectorAll("[data-wall-mode]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!requireAdminAction()) return;
          var wd = getWallDrawer?.();
          if (!wd) return;
          var targetMode = btn.dataset.wallMode;
          var isCurrentMode = wd.isActive() && wd.getMode() === targetMode;

          if (isCurrentMode) {
            // Clicking active mode deactivates
            wd.deactivate();
          } else {
            deactivateOtherTools("wallDrawer");
            if (!wd.isActive()) wd.activate(wd.getType() || "wall");
            wd.setMode(targetMode);
          }
          refreshWallUI();
        });
      });

      // Wall type buttons (in draw mode)
      var typeBtns = document.querySelectorAll(".ae-wall-type-btn");
      typeBtns.forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!requireAdminAction()) return;
          var wd = getWallDrawer?.();
          if (!wd) return;
          var type = btn.dataset.wallType;
          var wasActive = wd.isActive() && wd.getType() === type && wd.getMode() === "draw";
          if (wasActive) {
            wd.deactivate();
          } else {
            deactivateOtherTools("wallDrawer");
            wd.activate(type);
            wd.setMode("draw");
          }
          refreshWallUI();
        });
      });

      // Shape buttons
      document.querySelectorAll("[data-wall-shape]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          var wd = getWallDrawer?.();
          if (!wd) return;
          wd.setDrawShape(btn.dataset.wallShape);
          refreshWallUI();
        });
      });

      // Delete selected button
      document.getElementById("btn-delete-selected")?.addEventListener("click", function () {
        if (!requireAdminAction()) return;
        var wd = getWallDrawer?.();
        if (!wd) return;
        var editor = wd.getWallEditor?.();
        if (editor) {
          editor.deleteSelected();
          refreshWallUI();
        }
      });

      // Snap toggle checkboxes
      document.querySelectorAll("#ae-wall-snap-options input[type='checkbox']").forEach(function (cb) {
        // Load saved settings
        var snapping = global.WallSnapping;
        if (snapping) {
          var settings = snapping.loadSettings();
          if (cb.id === "snap-endpoint") cb.checked = settings.endpoint !== false;
          if (cb.id === "snap-angle") cb.checked = !!settings.angle;
          if (cb.id === "snap-length") cb.checked = !!settings.length;
          if (cb.id === "snap-alignment") cb.checked = !!settings.alignment;
        }

        cb.addEventListener("change", function () {
          var wd = getWallDrawer?.();
          var wallSnapping = wd?.getWallSnapping?.();
          if (!wallSnapping) return;

          var key = null;
          if (cb.id === "snap-endpoint") key = "endpoint";
          if (cb.id === "snap-angle") key = "angle";
          if (cb.id === "snap-length") key = "length";
          if (cb.id === "snap-alignment") key = "alignment";

          if (key) {
            wallSnapping.setSetting(key, cb.checked);
          }
        });
      });

      document.getElementById("btn-ae-wall-clear")?.addEventListener("click", function () {
        if (!requireAdminAction()) return;
        var wd = getWallDrawer?.();
        if (!wd) return;
        wd.clearAll();
        refreshWallUI();
      });

      // Keyboard: D, E, X for modes, Escape to cancel, Delete for selection
      document.addEventListener("keydown", function (e) {
        // Skip if focus is in an input
        if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") return;

        var wd = getWallDrawer?.();

        // Mode shortcuts when wall drawer is active or we're in the walls section
        if (wd && canEditEncounter()) {
          // D = Draw mode
          if (e.key === "d" || e.key === "D") {
            if (!wd.isActive()) {
              deactivateOtherTools("wallDrawer");
              wd.activate("wall");
            }
            wd.setMode("draw");
            refreshWallUI();
            e.preventDefault();
            return;
          }
          // E = Edit mode
          if (e.key === "e" || e.key === "E") {
            if (!wd.isActive()) {
              deactivateOtherTools("wallDrawer");
              wd.activate("wall");
            }
            wd.setMode("edit");
            refreshWallUI();
            e.preventDefault();
            return;
          }
          // X = Erase mode
          if (e.key === "x" || e.key === "X") {
            if (!wd.isActive()) {
              deactivateOtherTools("wallDrawer");
              wd.activate("wall");
            }
            wd.setMode("erase");
            refreshWallUI();
            e.preventDefault();
            return;
          }
        }

        // Pass through to wall drawer for Escape, Delete, etc.
        if (!wd || !wd.isActive()) return;
        if (wd.handleKeyDown(e)) {
          e.preventDefault();
          refreshWallUI();
          return;
        }
        if (e.key === "Escape") {
          wd.deactivate();
          refreshWallUI();
          e.preventDefault();
        }
      });
    }

    function refreshWallUI() {
      var wd = getWallDrawer?.();
      var isActive = wd?.isActive() || false;
      var currentType = isActive ? wd.getType() : null;
      var currentMode = isActive ? wd.getMode() : null;

      // Mode selector buttons
      document.querySelectorAll("[data-wall-mode]").forEach(function (btn) {
        btn.classList.toggle("active", isActive && btn.dataset.wallMode === currentMode);
      });

      // Show/hide subsections based on mode
      var drawOptions = document.getElementById("ae-wall-draw-options");
      var editOptions = document.getElementById("ae-wall-edit-options");
      if (drawOptions) drawOptions.hidden = currentMode !== "draw";
      if (editOptions) editOptions.hidden = currentMode !== "edit";

      // Wall type buttons (in draw mode)
      document.querySelectorAll(".ae-wall-type-btn").forEach(function (btn) {
        btn.classList.toggle("active", isActive && btn.dataset.wallType === currentType && currentMode === "draw");
      });

      // Shape buttons
      var currentShape = wd?.getDrawShape() || "polygon";
      document.querySelectorAll("[data-wall-shape]").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.wallShape === currentShape);
      });

      // Delete button enabled state
      var deleteBtn = document.getElementById("btn-delete-selected");
      if (deleteBtn) {
        var selection = wd?.getSelection?.();
        var hasSelection = selection ? selection.hasSelection() : false;
        deleteBtn.disabled = !hasSelection;
      }

      // Wall count
      var countEl = document.getElementById("ae-wall-count");
      if (countEl) {
        var count = wd?.getWallCount() || 0;
        countEl.textContent = count + " segmento" + (count !== 1 ? "s" : "");
      }

      // Selection summary
      var selectionEl = document.getElementById("ae-wall-selection");
      if (selectionEl) {
        var selection = wd?.getSelection?.();
        selectionEl.textContent = selection ? selection.getSelectionSummary() : "";
      }
    }

    // ── Light Tools ──

    var lightPlaceMode = false;

    function deactivateLightPlacer() {
      lightPlaceMode = false;
      var addBtn = document.getElementById("btn-ae-add-light");
      if (addBtn) addBtn.classList.remove("active");
      var map = getMap?.();
      if (map) map.canvas?.classList.remove("light-placer-active");
    }

    function bindLightEvents() {
      // Ambient light controls
      var ambientColor = document.getElementById("ae-ambient-color");
      var ambientIntensity = document.getElementById("ae-ambient-intensity");
      var ambientVal = document.getElementById("ae-ambient-intensity-val");
      var _ambientSaveTimer = null;

      function debouncedSaveAmbient() {
        if (_ambientSaveTimer) clearTimeout(_ambientSaveTimer);
        _ambientSaveTimer = setTimeout(function () {
          _ambientSaveTimer = null;
          ctx.saveEncounter?.();
        }, 500);
      }

      if (ambientColor) {
        ambientColor.addEventListener("input", function () {
          if (!requireAdminAction()) return;
          var al = state.encounter?.data?.ambientLight;
          if (!al) return;
          al.color = ambientColor.value;
          var map = getMap?.();
          if (map) { map.invalidateLighting?.(); map.draw(); }
          debouncedSaveAmbient();
        });
      }
      if (ambientIntensity) {
        ambientIntensity.addEventListener("input", function () {
          if (!requireAdminAction()) return;
          var al = state.encounter?.data?.ambientLight;
          if (!al) return;
          al.intensity = parseFloat(ambientIntensity.value) || 0;
          if (ambientVal) ambientVal.textContent = Math.round(al.intensity * 100) + "%";
          var map = getMap?.();
          if (map) { map.invalidateLighting?.(); map.draw(); }
          debouncedSaveAmbient();
        });
      }

      var addBtn = document.getElementById("btn-ae-add-light");
      if (addBtn) {
        addBtn.addEventListener("click", function (event) {
          event.preventDefault();
          event.stopPropagation();
          if (!requireAdminAction()) return;
          // Toggle light placement mode
          lightPlaceMode = !lightPlaceMode;
          addBtn.classList.toggle("active", lightPlaceMode);
          var map = getMap?.();
          if (map) {
            map.canvas?.classList.toggle("light-placer-active", lightPlaceMode);
          }
          if (lightPlaceMode) {
            deactivateOtherTools("lightPlacer");
          }
        });
      }

      // Escape to exit light placement / link mode
      document.addEventListener("keydown", function (e) {
        if (e.key === "Escape" && ctx.isLinkMode?.()) {
          ctx.handleLinkModeClick?.(-9999, -9999); // cancel
          e.preventDefault();
          return;
        }
        if (e.key === "Escape" && lightPlaceMode) {
          deactivateLightPlacer();
          e.preventDefault();
        }
      });

      // Listen for clicks on the canvas to place lights
      var canvas = document.getElementById("ae-map-canvas");
      if (canvas) {
        canvas.addEventListener("click", function (e) {
          var map = getMap?.();
          if (!map) return;
          var rect = canvas.getBoundingClientRect();
          var mx = e.clientX - rect.left;
          var my = e.clientY - rect.top;
          var wx = (mx - map.offsetX) / map.scale;
          var wy = (my - map.offsetY) / map.scale;
          var cellX = wx / map.gridSize;
          var cellY = wy / map.gridSize;

          // Link mode takes priority
          if (ctx.isLinkMode?.()) {
            ctx.handleLinkModeClick?.(cellX, cellY);
            return;
          }

          if (!lightPlaceMode || !canEditEncounter()) return;

          // Skip if clicking on existing light
          var existing = findLightAt?.(cellX, cellY);
          if (existing) return;

          addLight?.(cellX, cellY);
          renderLightList();
        });
      }
    }

    function renderLightList() {
      var listEl = document.getElementById("ae-list-lights");
      if (!listEl) return;
      var lights = state.encounter?.data?.lights || [];
      if (!lights.length) {
        listEl.innerHTML = '<button class="ae-drawer-item empty" disabled>Sin luces</button>';
        return;
      }
      listEl.innerHTML = lights.map(function (l) {
        var label = "Luz (" + (l.radius || 4) + " celdas)";
        return '<button class="ae-drawer-item ae-drawer-item--light" data-light-id="' + l.id + '">' +
          '<span class="ae-light-swatch" style="background:' + (l.color || "#ffcc66") + '"></span>' +
          '<span>' + label + '</span></button>';
      }).join("");

    }

    // ── Fog Tools ──

    function bindFogEvents() {
      // Master toggle
      var fogCheck = document.getElementById("ae-fog-enabled-check");
      if (fogCheck) {
        fogCheck.checked = !!state.encounter?.data?.fog?.enabled;
        fogCheck.addEventListener("change", function () {
          if (!requireAdminAction()) { fogCheck.checked = !fogCheck.checked; return; }
          var fog = state.encounter?.data?.fog;
          if (!fog) return;
          fog.enabled = fogCheck.checked;
          var map = getMap?.();
          if (map) {
            map.setFogConfig?.(fog);
            map.invalidateFog?.();
            map.invalidateLighting?.(); // darkness level changes when fog is toggled
            map.draw();
          }
          ctx.saveEncounter?.();
        });
      }

      // Mode selector
      document.querySelectorAll("[data-fog-mode]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!requireAdminAction()) return;
          var fog = state.encounter?.data?.fog;
          if (!fog) return;
          fog.mode = btn.dataset.fogMode;
          var map = getMap?.();
          if (map) {
            map.setFogConfig?.(fog);
            map.invalidateFog?.();
            map.draw();
          }
          refreshFogUI();
          ctx.saveEncounter?.();
        });
      });

      // Reset exploration
      document.getElementById("btn-ae-fog-reset")?.addEventListener("click", function () {
        if (!requireAdminAction()) return;
        var fog = state.encounter?.data?.fog;
        if (!fog) return;
        if (!confirm("\u00bfReiniciar toda la exploraci\u00f3n? Los jugadores perder\u00e1n el mapa descubierto.")) return;
        fog.exploredAreas = [];
        fog.exploredBy = {};
        fog.revealedAreas = [];
        fog.hiddenAreas = [];
        fog.resetVersion = (parseInt(fog.resetVersion, 10) || 0) + 1;
        var map = getMap?.();
        if (map) {
          map.clearFogDragPreview?.();
          map.setFogConfig?.(fog);
          map.invalidateFog?.();
          map.invalidateLighting?.();
          map.draw();
        }
        ctx.saveEncounter?.();
      });
    }

    function refreshFogUI() {
      // Fog mode buttons
      var currentMode = state.encounter?.data?.fog?.mode || "auto";
      document.querySelectorAll("[data-fog-mode]").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.fogMode === currentMode);
      });

      // Fog enabled checkbox
      var fogCheck = document.getElementById("ae-fog-enabled-check");
      if (fogCheck) fogCheck.checked = !!state.encounter?.data?.fog?.enabled;
    }

    function refreshAmbientUI() {
      var al = state.encounter?.data?.ambientLight;
      if (!al) return;
      var ambientColor = document.getElementById("ae-ambient-color");
      var ambientIntensity = document.getElementById("ae-ambient-intensity");
      var ambientVal = document.getElementById("ae-ambient-intensity-val");
      if (ambientColor) ambientColor.value = al.color || "#8090b0";
      if (ambientIntensity) ambientIntensity.value = al.intensity != null ? al.intensity : 0;
      if (ambientVal) ambientVal.textContent = Math.round((al.intensity != null ? al.intensity : 0) * 100) + "%";
    }

    function renderAssetLists() {
      if (!els.listBackground || !els.listDecor || !els.listEntitiesNpc || !els.listEntitiesPc) return;
      refreshGridOpacityButtons();
      refreshAmbientUI();
      refreshFogUI();
      renderLightList();
      const map = getMap();

      const mapData = state.encounter?.data?.map || {};
      const hasBg = !!mapData.backgroundUrl;
      const bgLabel = hasBg
        ? `Fondo cargado (${(mapData.widthCells || 0).toFixed(1)} x ${(mapData.heightCells || 0).toFixed(1)} celdas)`
        : "Sin fondo cargado";
      els.listBackground.innerHTML = `<button class="ae-drawer-item ${hasBg ? "" : "empty"}" data-role="background-main">${bgLabel}</button>`;

      const bgBtn = els.listBackground.querySelector('[data-role="background-main"]');
      bgBtn?.addEventListener("click", () => {
        if (!hasBg) return;
        setActiveMapLayer("background", { openDrawer: false });
        if (map) {
          map.selectedBackground = true;
          map.draw();
        }
      });
      bgBtn?.addEventListener("mouseenter", () => {
        if (!hasBg || !map?.setHoverFocus) return;
        map.setHoverFocus({ type: "background" });
      });
      els.listBackground.onmouseleave = () => map?.clearHoverFocus?.();

      const allDecor = state.encounter?.data?.designTokens || [];
      const decor = canEditEncounter()
        ? allDecor
        : allDecor.filter((dt) => dt.visible !== false);
      if (!decor.length) {
        els.listDecor.innerHTML =
          '<button class="ae-drawer-item empty" disabled>Sin decorados</button>';
        els.listDecor.onmouseleave = () => map?.clearHoverFocus?.();
      } else {
        els.listDecor.innerHTML = decor
          .map((token) => {
            const name = global.escapeHtml(token.name || "Decorado");
            const x = Math.round((parseFloat(token.x) || 0) * 10) / 10;
            const y = Math.round((parseFloat(token.y) || 0) * 10) / 10;
            return `<button class="ae-drawer-item" data-role="decor" data-id="${token.id}">${name} · (${x}, ${y})</button>`;
          })
          .join("");

        els.listDecor.querySelectorAll('[data-role="decor"]').forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            setActiveMapLayer("decor", { openDrawer: false });
            if (map) {
              map.selectedDesignTokenId = id;
              map.draw();
            }
          });
          btn.addEventListener("mouseenter", () => {
            const id = btn.dataset.id;
            map?.setHoverFocus?.({ type: "decor", tokenId: id });
          });
        });
        els.listDecor.onmouseleave = () => map?.clearHoverFocus?.();
      }

      const allInstances = state.encounter?.data?.instances || [];
      const instances = canEditEncounter()
        ? allInstances
        : allInstances.filter((inst) => inst.visible !== false);
      const npcInstances = [...instances]
        .filter((inst) => !inst?.isPC)
        .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));
      const pcInstances = [...instances]
        .filter((inst) => !!inst?.isPC)
        .sort((a, b) => String(a?.name || "").localeCompare(String(b?.name || "")));

      function bindEntityList(listEl, listItems, roleClass = "") {
        if (!listEl) return;
        if (!listItems.length) {
          listEl.innerHTML = '<button class="ae-drawer-item empty" disabled>Sin entidades</button>';
          listEl.onmouseleave = () => map?.clearHoverFocus?.();
          return;
        }
        listEl.innerHTML = listItems
          .map((inst) => {
            const name = global.escapeHtml(inst.name || "Entidad");
            const code = global.escapeHtml(inst.code || "-");
            return `<button class="ae-drawer-item${roleClass}" data-role="entity" data-id="${inst.id}">${name} · ${code}</button>`;
          })
          .join("");

        listEl.querySelectorAll('[data-role="entity"]').forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            setActiveMapLayer("entities", { openDrawer: false });
            const token = (state.encounter?.data?.tokens || []).find(
              (t) => t.instanceId === id,
            );
            if (map && token) {
              map.selectedTokenId = token.id;
              map.draw();
            }
            const inst = (state.encounter?.data?.instances || []).find(
              (item) => item.id === id,
            );
            if (inst) openModal(inst);
          });
          btn.addEventListener("mouseenter", () => {
            const id = btn.dataset.id;
            const token = (state.encounter?.data?.tokens || []).find(
              (t) => t.instanceId === id,
            );
            map?.setHoverFocus?.({
              type: "entity",
              instanceId: id,
              tokenId: token?.id || null,
            });
          });
        });
        listEl.onmouseleave = () => map?.clearHoverFocus?.();
      }

      bindEntityList(els.listEntitiesNpc, npcInstances);
      bindEntityList(els.listEntitiesPc, pcInstances, " ae-drawer-item--pc");
    }

    function setBusy(isBusy) {
      const uploadButtons = [
        document.getElementById("btn-ae-add-bg"),
        document.getElementById("btn-ae-map-remove-bg"),
      ];
      uploadButtons.forEach((btn) => {
        if (!btn) return;
        btn.disabled = !!isBusy;
        btn.style.opacity = isBusy ? "0.65" : "";
        btn.style.pointerEvents = isBusy ? "none" : "";
      });
    }

    function applyPermissions() {
      const adminOnlyIds = [
        "btn-ae-add-bg",
        "btn-ae-add-decor",
        "btn-ae-add-entity-npc",
        "btn-ae-add-entity-pc",
        "btn-ae-map-remove-bg",
      ];

      adminOnlyIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = canEditEncounter() ? "" : "none";
      });

      var narratorOnlySections = ["ae-terrain-section", "ae-walls-section", "ae-lights-section", "ae-fog-section"];
      narratorOnlySections.forEach(function (id) {
        var section = document.getElementById(id);
        if (section) section.style.display = canEditEncounter() ? "" : "none";
      });
      refreshGridOpacityButtons();

      // freeMovement toggle removed — coordinates are always continuous
    }

    return {
      bindEvents,
      renderAssetLists,
      setBusy,
      applyPermissions,
      refreshTerrainPaletteUI,
      refreshWallUI,
      refreshFogUI,
    };
  }

  global.AEEncounterDrawer = {
    createController,
  };
})(window);
