// Elements layer tools controller.
// Manages selection, walls, and doors/windows tools integrated into the unified toolbar.
// Now uses Paper.js for wall editing.
(function initAEElementsToolbar(global) {
  "use strict";

  var TOOL_STATE = {
    activeTool: "selection", // "selection" | "walls" | "doors" | "lights"
    wallElement: "wall",     // "wall" | "grate" | "curtain"
    wallShape: "polygon",    // "polygon" | "rectangle" | "circle"
    wallMode: "draw",        // "draw" | "erase"
    doorElement: "door",     // "door" | "window"
    doorMode: "draw",        // "draw" | "erase"
    lightElement: "light",   // "light" | "switch"
    measurementMode: false,
  };
  var GRID_DENSITY_STEPS = [
    { enabled: false, spacing: 1, density: 0, label: "Grid off" },
    { enabled: true, spacing: 1, density: 1, label: "Grid 1x" },
    { enabled: true, spacing: 0.5, density: 2, label: "Grid 2x" },
    { enabled: true, spacing: 0.25, density: 3, label: "Grid 4x" },
  ];

  function createController(ctx) {
    var getPaperEditor = ctx.getPaperEditor;
    var getWallDrawer = ctx.getWallDrawer; // Keep for backwards compatibility
    var canEditEncounter = ctx.canEditEncounter;
    var getMap = ctx.getMap;

    var toolsEl = null;        // #ae-elements-tools (inside main toolbar)
    var contextualBarEl = null; // #ae-elements-contextual-bar (separate floating bar)
    var contextualEl = null;    // #ae-elements-contextual (content inside bar)
    var separatorEl = null;     // #ae-toolbar-separator-2
    var gridBtnEl = null;       // #btn-ae-elements-grid
    var isVisible = false;
    var isBound = false;

    // ── DOM construction ──

    function ensureElements() {
      toolsEl = document.getElementById("ae-elements-tools");
      contextualBarEl = document.getElementById("ae-elements-contextual-bar");
      contextualEl = document.getElementById("ae-elements-contextual");
      separatorEl = document.getElementById("ae-toolbar-separator-2");
      gridBtnEl = document.getElementById("btn-ae-elements-grid");

      if (!toolsEl) return false;

      // Bind tool buttons only once
      if (!isBound) {
        isBound = true;

        // Prevent toolbar interactions from reaching canvas
        if (toolsEl) {
          toolsEl.addEventListener("mousedown", function (e) {
            e.stopPropagation();
          });
          toolsEl.addEventListener("mouseup", function (e) {
            e.stopPropagation();
          });
        }

        if (gridBtnEl) {
          gridBtnEl.addEventListener("mousedown", function (e) {
            e.stopPropagation();
          });
          gridBtnEl.addEventListener("mouseup", function (e) {
            e.stopPropagation();
          });
          gridBtnEl.addEventListener("click", function (e) {
            e.stopPropagation();
            e.preventDefault();
            toggleGrid();
          });
        }

        if (contextualBarEl) {
          contextualBarEl.addEventListener("mousedown", function (e) {
            e.stopPropagation();
          });
          contextualBarEl.addEventListener("mouseup", function (e) {
            e.stopPropagation();
          });
        }

        var toolBtns = toolsEl.querySelectorAll(".ae-layer-tool-btn");
        toolBtns.forEach(function (btn) {
          btn.addEventListener("click", function (e) {
            e.stopPropagation();
            e.preventDefault();
            selectTool(btn.dataset.tool);
          });
        });

        // Listen for return-to-selection events
        document.addEventListener("ae-wall-drawer-return-to-selection", function () {
          selectTool("selection");
        });
      }

      return true;
    }

    function selectTool(tool) {
      TOOL_STATE.measurementMode = false;
      TOOL_STATE.activeTool = tool;

      // Update button states
      updateToolButtonStates();

      // Update contextual toolbar
      renderContextualToolbar();

      // Update Paper.js editor + map interaction state
      var paperEditor = getPaperEditor?.();
      var map = getMap?.();
      if (map) {
        map._elementsPlacementMode = tool === "lights" ? TOOL_STATE.lightElement : null;
        map.canvas?.classList.toggle("light-placer-active", tool === "lights");
      }
      if (paperEditor && paperEditor.isActive()) {
        if (tool === "selection") {
          paperEditor.setInputEnabled(true);
          paperEditor.setDrawMode(null);
        } else if (tool === "walls") {
          paperEditor.setInputEnabled(true);
          paperEditor.setDrawMode(TOOL_STATE.wallElement || "wall");
          paperEditor.setShapeMode(TOOL_STATE.wallShape);
        } else if (tool === "doors") {
          paperEditor.setInputEnabled(true);
          var elementType = TOOL_STATE.doorElement === "window" ? "window" : "door";
          paperEditor.setDrawMode(elementType);
        } else if (tool === "lights") {
          paperEditor.setDrawMode(null);
          paperEditor.setInputEnabled(false);
        }
      }
      if (map && typeof map.setMeasurementToolActive === "function" && map.measureToolActive) {
        map.setMeasurementToolActive(false);
        var rulerBtn = document.getElementById("btn-ae-ruler");
        if (rulerBtn) rulerBtn.classList.remove("is-active");
      }
    }

    function updateToolButtonStates() {
      if (toolsEl) {
        var toolBtns = toolsEl.querySelectorAll(".ae-layer-tool-btn");
        toolBtns.forEach(function (btn) {
          var isActive = !TOOL_STATE.measurementMode && btn.dataset.tool === TOOL_STATE.activeTool;
          btn.classList.toggle("is-active", isActive);
        });
      }
    }

    function updateGridButtonState() {
      if (!gridBtnEl) return;
      var paperEditor = getPaperEditor?.();
      var gridState = paperEditor?.getGridState?.() || { enabled: false, spacing: 1 };
      var density = 0;
      if (gridState.enabled) {
        if (gridState.spacing <= 0.25) density = 3;
        else if (gridState.spacing <= 0.5) density = 2;
        else density = 1;
      }
      gridBtnEl.classList.toggle("is-active", density > 0);
      gridBtnEl.dataset.density = String(density);
      var title = "Grid de edición";
      if (density === 1) title = "Grid 1x (click: 2x, flechas: mover)";
      else if (density === 2) title = "Grid 2x (click: 4x, flechas: mover)";
      else if (density === 3) title = "Grid 4x (click: Off, flechas: mover)";
      else title = "Grid Off (click: 1x)";
      gridBtnEl.title = title;
    }

    function toggleGrid() {
      var paperEditor = getPaperEditor?.();
      if (!paperEditor || typeof paperEditor.setGridState !== "function") return;
      var current = paperEditor.getGridState?.() || { enabled: false, spacing: 1 };
      var currentIndex = 0;
      if (current.enabled) {
        if (current.spacing <= 0.25) currentIndex = 3;
        else if (current.spacing <= 0.5) currentIndex = 2;
        else currentIndex = 1;
      }
      var nextStep = GRID_DENSITY_STEPS[(currentIndex + 1) % GRID_DENSITY_STEPS.length];
      paperEditor.setGridState({
        enabled: nextStep.enabled,
        spacing: nextStep.spacing,
      });
      updateGridButtonState();
    }

    function renderContextualToolbar() {
      if (!contextualEl || !contextualBarEl) return;

      if (TOOL_STATE.measurementMode) {
        contextualEl.innerHTML = "";
        contextualBarEl.style.display = "none";
        return;
      }

      if (TOOL_STATE.activeTool === "walls") {
        renderWallsContextual();
        contextualBarEl.style.display = "block";
      } else if (TOOL_STATE.activeTool === "doors") {
        renderDoorsContextual();
        contextualBarEl.style.display = "block";
      } else if (TOOL_STATE.activeTool === "lights") {
        renderLightsContextual();
        contextualBarEl.style.display = "block";
      } else {
        contextualEl.innerHTML = "";
        contextualBarEl.style.display = "none";
      }
    }

    function renderWallsContextual() {
      contextualEl.innerHTML =
        '<div class="ae-elements-ctx-group">' +
          '<span class="ae-elements-ctx-label">Forma</span>' +
          '<div class="ae-elements-ctx-btns">' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.wallShape === "polygon" ? " is-active" : "") + '" data-shape="polygon" title="Polígono"><i data-lucide="pencil"></i></button>' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.wallShape === "rectangle" ? " is-active" : "") + '" data-shape="rectangle" title="Rectángulo"><i data-lucide="square"></i></button>' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.wallShape === "circle" ? " is-active" : "") + '" data-shape="circle" title="Círculo"><i data-lucide="circle"></i></button>' +
          '</div>' +
        '</div>' +
        '<div class="ae-elements-ctx-divider"></div>' +
        '<div class="ae-elements-ctx-group">' +
          '<span class="ae-elements-ctx-label">Tipo</span>' +
          '<div class="ae-elements-ctx-btns">' +
            '<button class="ae-elements-ctx-btn ae-elements-ctx-btn--text' + (TOOL_STATE.wallElement === "wall" ? " is-active" : "") + '" data-wall-element="wall" title="Pared">Pared</button>' +
            '<button class="ae-elements-ctx-btn ae-elements-ctx-btn--text' + (TOOL_STATE.wallElement === "grate" ? " is-active" : "") + '" data-wall-element="grate" title="Reja">Reja</button>' +
            '<button class="ae-elements-ctx-btn ae-elements-ctx-btn--text' + (TOOL_STATE.wallElement === "curtain" ? " is-active" : "") + '" data-wall-element="curtain" title="Cortina">Cortina</button>' +
          '</div>' +
        '</div>';

      // Re-init lucide icons
      if (window.lucide) window.lucide.createIcons();

      // Bind shape buttons
      contextualEl.querySelectorAll("[data-shape]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          TOOL_STATE.wallShape = btn.dataset.shape;
          renderWallsContextual();

          var paperEditor = getPaperEditor?.();
          if (paperEditor && paperEditor.isActive()) {
            paperEditor.setDrawMode(TOOL_STATE.wallElement || "wall");
            paperEditor.setShapeMode(TOOL_STATE.wallShape);
          }
        });
      });

      contextualEl.querySelectorAll("[data-wall-element]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          TOOL_STATE.wallElement = btn.dataset.wallElement || "wall";
          renderWallsContextual();

          var paperEditor = getPaperEditor?.();
          if (paperEditor && paperEditor.isActive()) {
            paperEditor.setDrawMode(TOOL_STATE.wallElement);
            paperEditor.setShapeMode(TOOL_STATE.wallShape);
          }
        });
      });
    }

    function renderDoorsContextual() {
      var hint = TOOL_STATE.doorElement === "door"
        ? "Click en una pared para colocar una puerta"
        : "Click en una pared para colocar una ventana";

      contextualEl.innerHTML =
        '<div class="ae-elements-ctx-group">' +
          '<span class="ae-elements-ctx-label">Elemento</span>' +
          '<div class="ae-elements-ctx-btns">' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.doorElement === "door" ? " is-active" : "") + '" data-element="door" title="Puerta">\uD83D\uDEAA</button>' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.doorElement === "window" ? " is-active" : "") + '" data-element="window" title="Ventana">\uD83E\uDE9F</button>' +
          '</div>' +
        '</div>' +
        '<span class="ae-elements-ctx-hint">' + hint + '</span>';

      // Bind element buttons
      contextualEl.querySelectorAll("[data-element]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          TOOL_STATE.doorElement = btn.dataset.element;
          renderDoorsContextual();

          var paperEditor = getPaperEditor?.();
          if (paperEditor && paperEditor.isActive()) {
            var elementType = TOOL_STATE.doorElement === "window" ? "window" : "door";
            paperEditor.setDrawMode(elementType);
          }
        });
      });
    }

    function renderLightsContextual() {
      var hint = TOOL_STATE.lightElement === "switch"
        ? "Click en el mapa para crear un interruptor"
        : "Click en el mapa para crear una luz";

      contextualEl.innerHTML =
        '<div class="ae-elements-ctx-group">' +
          '<span class="ae-elements-ctx-label">Elemento</span>' +
          '<div class="ae-elements-ctx-btns">' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.lightElement === "light" ? " is-active" : "") + '" data-light-element="light" title="Luz">\uD83D\uDCA1</button>' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.lightElement === "switch" ? " is-active" : "") + '" data-light-element="switch" title="Interruptor">\uD83C\uDF9A\uFE0F</button>' +
          '</div>' +
        '</div>' +
        '<span class="ae-elements-ctx-hint">' + hint + '</span>';

      contextualEl.querySelectorAll("[data-light-element]").forEach(function (btn) {
        btn.addEventListener("click", function (e) {
          e.stopPropagation();
          e.preventDefault();
          TOOL_STATE.lightElement = btn.dataset.lightElement === "switch" ? "switch" : "light";
          renderLightsContextual();

          var map = getMap?.();
          if (map) {
            map._elementsPlacementMode = TOOL_STATE.lightElement;
            map.canvas?.classList.add("light-placer-active");
          }
        });
      });
    }

    // ── Show / Hide ──

    function show() {
      if (!canEditEncounter?.()) return;
      if (!ensureElements()) return;

      // Only reset to selection if transitioning from hidden to visible
      var wasHidden = !isVisible;

      toolsEl.style.display = "flex";
      if (gridBtnEl) gridBtnEl.style.display = "flex";
      if (separatorEl) separatorEl.style.display = "block";
      isVisible = true;

      if (wasHidden) {
        // Reset to selection tool only on initial show
        selectTool("selection");
      }
      updateGridButtonState();
    }

    function hide() {
      if (toolsEl) toolsEl.style.display = "none";
      if (gridBtnEl) gridBtnEl.style.display = "none";
      if (contextualBarEl) contextualBarEl.style.display = "none";
      if (separatorEl) separatorEl.style.display = "none";
      var map = getMap?.();
      if (map) {
        map._elementsPlacementMode = null;
        map.canvas?.classList.remove("light-placer-active");
      }
      isVisible = false;

      // Clear draw mode in Paper.js
      var paperEditor = getPaperEditor?.();
      if (paperEditor && paperEditor.isActive()) {
        paperEditor.setDrawMode(null);
      }
    }

    function toggle() {
      if (isVisible) {
        hide();
      } else {
        show();
      }
    }

    function isToolbarVisible() {
      return isVisible;
    }

    function getActiveTool() {
      return TOOL_STATE.activeTool;
    }

    function setMeasurementMode(isActive) {
      TOOL_STATE.measurementMode = !!isActive;
      updateToolButtonStates();
      renderContextualToolbar();

      var paperEditor = getPaperEditor?.();
      var map = getMap?.();
      if (map) {
        map._elementsPlacementMode = null;
        map.canvas?.classList.remove("light-placer-active");
      }
      if (paperEditor && paperEditor.isActive()) {
        paperEditor.setDrawMode(null);
        paperEditor.setInputEnabled(!TOOL_STATE.measurementMode);
      }
    }

    function destroy() {
      hide();
      toolsEl = null;
      contextualBarEl = null;
      contextualEl = null;
      separatorEl = null;
      gridBtnEl = null;
    }

    return {
      show: show,
      hide: hide,
      toggle: toggle,
      isVisible: isToolbarVisible,
      getActiveTool: getActiveTool,
      selectTool: selectTool,
      setMeasurementMode: setMeasurementMode,
      destroy: destroy,
    };
  }

  global.AEElementsToolbar = { createController: createController };
})(window);
