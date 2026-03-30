(function initAEEncounterLayersModule(global) {
  const LAYER_LABELS = {
    background: "Fondo",
    elements: "Elementos",
    decor: "Decorado",
    entities: "Entidades",
  };

  function createController(ctx) {
    const { state, els, getMap } = ctx;
    let lastDispatchedLayer = null;

    function setActiveMapLayer(layer, options = {}) {
      const nextLayer = LAYER_LABELS[layer] ? layer : "entities";
      const persist = options.persist !== false;
      const closeMenu = options.closeMenu !== false;
      const openDrawer = options.openDrawer === true;
      const forceEvent = options.forceEvent === true;

      state.activeMapLayer = nextLayer;

      if (els.layerCurrentLabel) {
        els.layerCurrentLabel.textContent = LAYER_LABELS[nextLayer];
      }

      if (els.layerMenu) {
        els.layerMenu
          .querySelectorAll(".ae-layer-option")
          .forEach((option) => {
            option.classList.toggle("active", option.dataset.layer === nextLayer);
          });
        if (closeMenu) {
          els.layerMenu.style.display = "none";
          // Close chevron animation
          const selectorEl = els.layerMenuToggle?.closest(".ae-layer-selector");
          if (selectorEl) selectorEl.classList.remove("is-open");
        }
      }

      const mapArea = document.getElementById("ae-map-container");
      if (mapArea) {
        mapArea.dataset.layer = nextLayer;
      }

      const map = typeof getMap === "function" ? getMap() : null;
      if (map && typeof map.setInteractionLayer === "function") {
        map.setInteractionLayer(nextLayer);
      }

      const showEntities = nextLayer === "entities";
      const showDecor = nextLayer === "decor";
      const showBackground = nextLayer === "background";
      const showElements = nextLayer === "elements";

      const npcBtn = document.getElementById("btn-ae-browse-npc");
      const pcBtn = document.getElementById("btn-ae-browse-pc");
      const decorBtn = document.getElementById("btn-ae-browse-decor");
      const mapUploadBtn = document.getElementById("btn-ae-map-upload-bg");
      const mapRemoveBtn = document.getElementById("btn-ae-map-remove-bg");

      // Elements layer sections (walls, lights, etc.)
      const wallsSection = document.getElementById("ae-walls-section");
      const lightsSection = document.getElementById("ae-lights-section");

      if (npcBtn) npcBtn.style.display = showEntities ? "" : "none";
      if (pcBtn) pcBtn.style.display = showEntities ? "" : "none";
      if (decorBtn) decorBtn.style.display = showDecor ? "" : "none";
      if (mapUploadBtn) mapUploadBtn.style.display = showBackground ? "" : "none";
      if (mapRemoveBtn) mapRemoveBtn.style.display = showBackground ? "" : "none";
      if (wallsSection) wallsSection.style.display = showElements ? "" : "none";
      if (lightsSection) lightsSection.style.display = showElements ? "" : "none";

      // Dispatch event for other modules to react to layer change
      // Only dispatch if layer actually changed (avoid spurious events from render())
      if (forceEvent || nextLayer !== lastDispatchedLayer) {
        lastDispatchedLayer = nextLayer;
        document.dispatchEvent(new CustomEvent("ae-layer-change", {
          detail: { layer: nextLayer, showElements }
        }));
      }

      if (persist && state.encounter?.data) {
        state.encounter.data.ui = {
          ...(state.encounter.data.ui || {}),
          activeLayer: nextLayer,
        };

        if (openDrawer) {
          const drawer = document.getElementById("ae-tools-drawer");
          if (drawer) drawer.classList.add("open");
        }
      }
    }

    function bindLayerMenuEvents(requireAdminAction) {
      els.layerMenuToggle?.addEventListener("click", (event) => {
        event.stopPropagation();
        if (!els.layerMenu) return;
        const isOpen = els.layerMenu.style.display !== "none";
        els.layerMenu.style.display = isOpen ? "none" : "flex";

        // Toggle chevron animation class on parent selector
        const selectorEl = els.layerMenuToggle.closest(".ae-layer-selector");
        if (selectorEl) {
          selectorEl.classList.toggle("is-open", !isOpen);
        }
      });

      els.layerMenu?.querySelectorAll(".ae-layer-option").forEach((option) => {
        option.addEventListener("click", () => {
          if (typeof requireAdminAction === "function" && !requireAdminAction()) {
            return;
          }
          setActiveMapLayer(option.dataset.layer);
        });
      });
    }

    return {
      setActiveMapLayer,
      bindLayerMenuEvents,
      isValidLayer: (layer) => !!LAYER_LABELS[layer],
    };
  }

  global.AEEncounterLayers = {
    createController,
    LAYER_LABELS,
  };
})(window);
