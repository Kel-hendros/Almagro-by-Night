// Fog of War manual brush tool.
// Follows the same factory-function pattern as tile-painter.js.
// Paints into fog.revealed{} or fog.hidden{} dictionaries.
(function initFogBrushModule(global) {
  "use strict";

  /**
   * Create a fog brush tool instance.
   * @param {Object} opts
   * @param {Function} opts.getMap - returns TacticalMap instance
   * @param {Function} opts.getFog - returns encounter.data.fog object
   * @param {Function} opts.setFog - updates fog object
   * @param {Function} opts.onChanged - callback for save (debounced internally)
   * @param {Function} opts.canEdit - returns boolean (is narrator)
   */
  function createFogBrush(opts) {
    var getMap = opts.getMap;
    var getFog = opts.getFog;
    var setFog = opts.setFog;
    var onChanged = opts.onChanged;
    var canEdit = opts.canEdit || function () { return true; };

    var active = false;
    var brushType = "reveal"; // "reveal" | "hide"
    var brushSize = 1;
    var isPainting = false;
    var saveTimer = null;
    var SAVE_DELAY = 800;

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        if (typeof onChanged === "function") onChanged();
      }, SAVE_DELAY);
    }

    function isActive() {
      return active;
    }

    function getBrushType() {
      return brushType;
    }

    function getBrushSize() {
      return brushSize;
    }

    function activate(type) {
      if (!canEdit()) return;
      active = true;
      brushType = type || brushType;
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.add("fog-brush-active");
        map.draw();
      }
    }

    function deactivate() {
      active = false;
      isPainting = false;
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.remove("fog-brush-active");
        map._fogBrushHover = null;
        map.draw();
      }
    }

    function setBrushType(type) {
      brushType = type;
    }

    function setBrushSize(size) {
      brushSize = Math.max(1, Math.min(10, size || 1));
    }

    /**
     * Apply brush at a cell position.
     */
    function applyBrush(cellX, cellY, isErase) {
      var fog = getFog();
      if (!fog) return;
      if (!fog.revealed) fog.revealed = {};
      if (!fog.hidden) fog.hidden = {};

      var half = Math.floor(brushSize / 2);
      for (var dy = 0; dy < brushSize; dy++) {
        for (var dx = 0; dx < brushSize; dx++) {
          var cx = Math.floor(cellX) - half + dx;
          var cy = Math.floor(cellY) - half + dy;
          var key = cx + "," + cy;

          if (isErase) {
            // Right-click: remove manual override, let auto determine
            delete fog.revealed[key];
            delete fog.hidden[key];
          } else if (brushType === "reveal") {
            fog.revealed[key] = true;
            delete fog.hidden[key];
          } else {
            // hide
            fog.hidden[key] = true;
            delete fog.revealed[key];
          }
        }
      }

      setFog(fog);
      var map = getMap?.();
      if (map) {
        map.setFogConfig?.(fog);
        map.invalidateFog?.();
        map.draw();
      }
    }

    // ── Mouse Handlers ──

    function handleMouseDown(e, cellX, cellY) {
      if (!active || !canEdit()) return false;

      if (e.button === 0) {
        // Left click: paint reveal or hide
        isPainting = true;
        applyBrush(cellX, cellY, false);
        return true;
      }
      if (e.button === 2) {
        // Right click: erase manual override
        isPainting = true;
        applyBrush(cellX, cellY, true);
        return true;
      }
      return false;
    }

    function handleMouseMove(cellX, cellY) {
      if (!active) return false;

      // Update hover preview
      var map = getMap?.();
      if (map) {
        map._fogBrushHover = {
          cellX: Math.floor(cellX),
          cellY: Math.floor(cellY),
          size: brushSize,
          type: brushType,
        };
      }

      if (isPainting) {
        // Continue painting while dragging
        // Determine if right-click drag (erase) — we track this via the brushType
        applyBrush(cellX, cellY, false);
        return true;
      }

      // Request redraw for hover preview
      if (map) map.draw();
      return false;
    }

    function handleMouseUp() {
      if (isPainting) {
        isPainting = false;
        scheduleSave();
      }
    }

    function resetExploration() {
      if (!confirm("¿Reiniciar toda la exploración? Los jugadores perderán el mapa descubierto.")) return;
      var fog = getFog();
      if (!fog) return;
      fog.explored = {};
      fog.exploredBy = {};
      fog.revealed = {};
      fog.hidden = {};
      setFog(fog);
      var map = getMap?.();
      if (map) {
        map.setFogConfig?.(fog);
        map.invalidateFog?.();
        map.draw();
      }
      onChanged?.();
    }

    return {
      isActive: isActive,
      getBrushType: getBrushType,
      getBrushSize: getBrushSize,
      activate: activate,
      deactivate: deactivate,
      setBrushType: setBrushType,
      setBrushSize: setBrushSize,
      handleMouseDown: handleMouseDown,
      handleMouseMove: handleMouseMove,
      handleMouseUp: handleMouseUp,
      resetExploration: resetExploration,
    };
  }

  global.FogBrush = {
    createFogBrush: createFogBrush,
  };
})(window);
