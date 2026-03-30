// Elements layer tools controller.
// Manages selection, walls, and doors/windows tools integrated into the unified toolbar.
// Now uses Paper.js for wall editing.
(function initAEElementsToolbar(global) {
  "use strict";

  var TOOL_STATE = {
    activeTool: "selection", // "selection" | "walls" | "doors"
    wallShape: "polygon",    // "polygon" | "rectangle" | "circle"
    wallMode: "draw",        // "draw" | "erase"
    doorElement: "door",     // "door" | "window"
    doorMode: "draw",        // "draw" | "erase"
  };

  function createController(ctx) {
    var getPaperEditor = ctx.getPaperEditor;
    var getWallDrawer = ctx.getWallDrawer; // Keep for backwards compatibility
    var canEditEncounter = ctx.canEditEncounter;
    var saveEncounter = ctx.saveEncounter;

    var toolsEl = null;        // #ae-elements-tools (inside main toolbar)
    var contextualBarEl = null; // #ae-elements-contextual-bar (separate floating bar)
    var contextualEl = null;    // #ae-elements-contextual (content inside bar)
    var separatorEl = null;     // #ae-toolbar-separator-2
    var isVisible = false;
    var isBound = false;

    // ── DOM construction ──

    function ensureElements() {
      toolsEl = document.getElementById("ae-elements-tools");
      contextualBarEl = document.getElementById("ae-elements-contextual-bar");
      contextualEl = document.getElementById("ae-elements-contextual");
      separatorEl = document.getElementById("ae-toolbar-separator-2");

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
      TOOL_STATE.activeTool = tool;

      // Update button states
      if (toolsEl) {
        var toolBtns = toolsEl.querySelectorAll(".ae-layer-tool-btn");
        toolBtns.forEach(function (btn) {
          btn.classList.toggle("is-active", btn.dataset.tool === tool);
        });
      }

      // Update contextual toolbar
      renderContextualToolbar();

      // Update Paper.js editor state
      var paperEditor = getPaperEditor?.();
      if (paperEditor && paperEditor.isActive()) {
        if (tool === "selection") {
          paperEditor.setDrawMode(null);
        } else if (tool === "walls") {
          paperEditor.setDrawMode("wall");
          paperEditor.setShapeMode(TOOL_STATE.wallShape);
        } else if (tool === "doors") {
          var elementType = TOOL_STATE.doorElement === "window" ? "window" : "door";
          paperEditor.setDrawMode(elementType);
        }
      }
    }

    function renderContextualToolbar() {
      if (!contextualEl || !contextualBarEl) return;

      if (TOOL_STATE.activeTool === "walls") {
        renderWallsContextual();
        contextualBarEl.style.display = "block";
      } else if (TOOL_STATE.activeTool === "doors") {
        renderDoorsContextual();
        contextualBarEl.style.display = "block";
      } else {
        contextualEl.innerHTML = "";
        contextualBarEl.style.display = "none";
      }
    }

    function renderWallsContextual() {
      var hints = {
        polygon: "Click para agregar puntos, doble-click o Enter para terminar",
        rectangle: "Arrastra para dibujar un rectángulo (Shift = cuadrado)",
        circle: "Arrastra desde el centro para dibujar un círculo"
      };
      var hint = hints[TOOL_STATE.wallShape] || "";

      contextualEl.innerHTML =
        '<div class="ae-elements-ctx-group">' +
          '<span class="ae-elements-ctx-label">Forma</span>' +
          '<div class="ae-elements-ctx-btns">' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.wallShape === "polygon" ? " is-active" : "") + '" data-shape="polygon" title="Polígono"><i data-lucide="pencil"></i></button>' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.wallShape === "rectangle" ? " is-active" : "") + '" data-shape="rectangle" title="Rectángulo"><i data-lucide="square"></i></button>' +
            '<button class="ae-elements-ctx-btn' + (TOOL_STATE.wallShape === "circle" ? " is-active" : "") + '" data-shape="circle" title="Círculo"><i data-lucide="circle"></i></button>' +
          '</div>' +
        '</div>' +
        '<span class="ae-elements-ctx-hint">' + hint + '</span>';

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
            paperEditor.setDrawMode("wall");
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

    // ── Show / Hide ──

    function show() {
      if (!canEditEncounter?.()) return;
      if (!ensureElements()) return;

      // Only reset to selection if transitioning from hidden to visible
      var wasHidden = !isVisible;

      toolsEl.style.display = "flex";
      if (separatorEl) separatorEl.style.display = "block";
      isVisible = true;

      if (wasHidden) {
        // Reset to selection tool only on initial show
        selectTool("selection");
      }
    }

    function hide() {
      if (toolsEl) toolsEl.style.display = "none";
      if (contextualBarEl) contextualBarEl.style.display = "none";
      if (separatorEl) separatorEl.style.display = "none";
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

    function destroy() {
      hide();
      toolsEl = null;
      contextualBarEl = null;
      contextualEl = null;
      separatorEl = null;
    }

    return {
      show: show,
      hide: hide,
      toggle: toggle,
      isVisible: isToolbarVisible,
      getActiveTool: getActiveTool,
      selectTool: selectTool,
      destroy: destroy,
    };
  }

  global.AEElementsToolbar = { createController: createController };
})(window);
