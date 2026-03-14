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
    } = ctx;

    function setDrawerTab(tab) {
      const useAssets = tab !== "settings";
      els.drawerTabAssets?.classList.toggle("active", useAssets);
      els.drawerTabSettings?.classList.toggle("active", !useAssets);
      els.drawerTabAssetsPane?.classList.toggle("active", useAssets);
      els.drawerTabSettingsPane?.classList.toggle("active", !useAssets);
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

      els.drawerTabAssets?.addEventListener("click", () => setDrawerTab("assets"));
      els.drawerTabSettings?.addEventListener("click", () => setDrawerTab("settings"));
      els.gridOpacityLevels
        ?.querySelectorAll("[data-level]")
        .forEach((btn) => {
          btn.addEventListener("click", () => {
            applyGridOpacityLevel(btn.dataset.level);
          });
        });

      var freeMovCheck = document.getElementById("ae-free-movement-check");
      if (freeMovCheck) {
        freeMovCheck.checked = !!state.encounter?.data?.freeMovement;
        freeMovCheck.disabled = !canEditEncounter();
        freeMovCheck.addEventListener("change", function () {
          if (!canEditEncounter()) return;
          if (state.encounter?.data) {
            state.encounter.data.freeMovement = freeMovCheck.checked;
          }
          var map = getMap?.();
          if (map) map.freeMovement = freeMovCheck.checked;
          if (typeof ctx.saveEncounter === "function") ctx.saveEncounter();
        });
      }

      // Terrain palette
      renderTerrainPalette();
      bindTerrainEvents();

      setDrawerTab("assets");
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

    function renderAssetLists() {
      if (!els.listBackground || !els.listDecor || !els.listEntitiesNpc || !els.listEntitiesPc) return;
      refreshGridOpacityButtons();
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

      const terrainSection = document.getElementById("ae-terrain-section");
      if (terrainSection) {
        terrainSection.style.display = canEditEncounter() ? "" : "none";
      }
      refreshGridOpacityButtons();

      var freeMovCheck = document.getElementById("ae-free-movement-check");
      if (freeMovCheck) {
        freeMovCheck.disabled = !canEditEncounter();
        freeMovCheck.checked = !!state.encounter?.data?.freeMovement;
      }
    }

    return {
      bindEvents,
      renderAssetLists,
      setBusy,
      applyPermissions,
      refreshTerrainPaletteUI,
    };
  }

  global.AEEncounterDrawer = {
    createController,
  };
})(window);
