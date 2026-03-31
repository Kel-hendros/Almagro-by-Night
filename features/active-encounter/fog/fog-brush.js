// Fog of War manual brush tool.
// Follows the same factory-function pattern as tile-painter.js.
// Paints continuous rectangular areas into fog.revealedAreas / fog.hiddenAreas.
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
    var paintEraseMode = false;
    var lastPaintPoint = null;
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
        map.requestDraw?.();
      }
    }

    function deactivate() {
      active = false;
      isPainting = false;
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.remove("fog-brush-active");
        map._fogBrushHover = null;
        map.requestDraw?.();
      }
    }

    function setBrushType(type) {
      brushType = type;
    }

    function setBrushSize(size) {
      brushSize = Math.max(1, Math.min(10, size || 1));
    }

    /**
     * Apply brush at a world position (grid units, but continuous).
     */
    function applyBrush(worldX, worldY, isErase) {
      var fog = getFog();
      if (!fog) return;
      if (!Array.isArray(fog.revealedAreas)) fog.revealedAreas = [];
      if (!Array.isArray(fog.hiddenAreas)) fog.hiddenAreas = [];

      var area = createBrushArea(worldX, worldY, brushSize);

      if (isErase) {
        fog.revealedAreas = fog.revealedAreas.filter(function (existing) {
          return !areasIntersect(existing, area);
        });
        fog.hiddenAreas = fog.hiddenAreas.filter(function (existing) {
          return !areasIntersect(existing, area);
        });
      } else if (brushType === "reveal") {
        fog.hiddenAreas = fog.hiddenAreas.filter(function (existing) {
          return !areasIntersect(existing, area);
        });
        pushArea(fog.revealedAreas, area);
      } else {
        fog.revealedAreas = fog.revealedAreas.filter(function (existing) {
          return !areasIntersect(existing, area);
        });
        pushArea(fog.hiddenAreas, area);
      }

      setFog(fog);
      var map = getMap?.();
      if (map) {
        map.setFogConfig?.(fog);
        map.invalidateFog?.();
        map.requestDraw?.();
      }
    }

    // ── Mouse Handlers ──

    function handleMouseDown(e, cellX, cellY) {
      if (!active || !canEdit()) return false;

      if (e.button === 0) {
        // Left click: paint reveal or hide
        isPainting = true;
        paintEraseMode = false;
        lastPaintPoint = null;
        paintAt(cellX, cellY, false);
        return true;
      }
      if (e.button === 2) {
        // Right click: erase manual override
        isPainting = true;
        paintEraseMode = true;
        lastPaintPoint = null;
        paintAt(cellX, cellY, true);
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
          x: cellX,
          y: cellY,
          size: brushSize,
          type: brushType,
        };
      }

      if (isPainting) {
        paintAt(cellX, cellY, paintEraseMode);
        return true;
      }

      // Request redraw for hover preview
      if (map) map.requestDraw?.();
      return false;
    }

    function handleMouseUp() {
      if (isPainting) {
        isPainting = false;
        paintEraseMode = false;
        lastPaintPoint = null;
        scheduleSave();
      }
    }

    function resetExploration() {
      if (!confirm("¿Reiniciar toda la exploración? Los jugadores perderán el mapa descubierto.")) return;
      var fog = getFog();
      if (!fog) return;
      fog.exploredAreas = [];
      fog.exploredBy = {};
      fog.revealedAreas = [];
      fog.hiddenAreas = [];
      fog.resetVersion = (parseInt(fog.resetVersion, 10) || 0) + 1;
      setFog(fog);
      var map = getMap?.();
      if (map) {
        map.clearFogDragPreview?.();
        map.setFogConfig?.(fog);
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.requestDraw?.();
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

    function paintAt(x, y, isErase) {
      var minStep = Math.max(0.18, brushSize * 0.22);
      if (lastPaintPoint) {
        var dx = x - lastPaintPoint.x;
        var dy = y - lastPaintPoint.y;
        if (dx * dx + dy * dy < minStep * minStep) return;
      }
      lastPaintPoint = { x: x, y: y };
      applyBrush(x, y, isErase);
    }

    function createBrushArea(x, y, size) {
      var half = size * 0.5;
      return {
        type: "rect",
        x: x - half,
        y: y - half,
        width: size,
        height: size,
      };
    }

    function areasIntersect(a, b) {
      if (!a || !b) return false;
      return !(
        a.x + a.width <= b.x ||
        b.x + b.width <= a.x ||
        a.y + a.height <= b.y ||
        b.y + b.height <= a.y
      );
    }

    function pushArea(list, area) {
      for (var i = list.length - 1; i >= 0; i--) {
        var existing = list[i];
        if (
          Math.abs(existing.x - area.x) < 0.001 &&
          Math.abs(existing.y - area.y) < 0.001 &&
          Math.abs(existing.width - area.width) < 0.001 &&
          Math.abs(existing.height - area.height) < 0.001
        ) {
          return;
        }
      }
      list.push(area);
    }
  }

  global.FogBrush = {
    createFogBrush: createFogBrush,
  };
})(window);
