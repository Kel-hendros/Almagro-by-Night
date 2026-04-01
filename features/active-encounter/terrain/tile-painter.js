// Tile painting mode: lets the narrator paint terrain textures onto grid cells.
(function initTilePainterModule(global) {
  const BRUSH_SIZES = [1, 2, 4];

  function normalizeBrushSize(size) {
    const numericSize = Math.round(Number(size) || BRUSH_SIZES[0]);
    if (BRUSH_SIZES.includes(numericSize)) return numericSize;

    return BRUSH_SIZES.reduce(function (closest, candidate) {
      return Math.abs(candidate - numericSize) < Math.abs(closest - numericSize)
        ? candidate
        : closest;
    }, BRUSH_SIZES[0]);
  }

  function createTilePainter(opts) {
    const { getMap, getTileMap, setTileMap, onChanged, onSelectionChange } = opts;

    let active = false;
    let selectedTexture = null;
    let brushSize = 1;
    let mode = "paint";
    let isPainting = false;
    let isErasing = false;
    let _dirty = false;
    let _saveTimer = null;
    const SAVE_DELAY = 800; // ms after last stroke before persisting

    function resolveTextureId(textureId) {
      return global.TileTextures?.resolveTextureId?.(textureId) || textureId || null;
    }

    function notifySelectionChange() {
      if (typeof onSelectionChange === "function") {
        onSelectionChange({
          active,
          textureId: selectedTexture,
          brushSize,
          mode,
        });
      }
    }

    function scheduleSave() {
      _dirty = true;
      if (_saveTimer) clearTimeout(_saveTimer);
      _saveTimer = setTimeout(function () {
        _saveTimer = null;
        if (_dirty && onChanged) {
          _dirty = false;
          onChanged();
        }
      }, SAVE_DELAY);
    }

    function flushSave() {
      if (_saveTimer) { clearTimeout(_saveTimer); _saveTimer = null; }
      if (_dirty && onChanged) {
        _dirty = false;
        onChanged();
      }
    }

    function isActive() {
      return active;
    }

    function activate(textureId) {
      active = true;
      const resolvedTexture = resolveTextureId(textureId);
      if (resolvedTexture) {
        selectedTexture = resolvedTexture;
        mode = "paint";
      } else if (textureId === null) {
        mode = "erase";
      }
      const map = getMap();
      if (map) map.canvas.classList.add("tile-painter-active");
      notifySelectionChange();
    }

    function deactivate() {
      active = false;
      isPainting = false;
      isErasing = false;
      flushSave();
      const map = getMap();
      if (map) {
        map._tilePainterHover = null;
        map.canvas.classList.remove("tile-painter-active");
        map.requestDraw?.();
      }
      notifySelectionChange();
    }

    function setTexture(textureId) {
      const resolvedTexture = resolveTextureId(textureId);
      if (!resolvedTexture) return;
      selectedTexture = resolvedTexture;
      mode = "paint";
      if (!active) {
        activate(resolvedTexture);
        return;
      }
      notifySelectionChange();
    }

    function getTexture() {
      return selectedTexture;
    }

    function setBrushSize(size) {
      brushSize = normalizeBrushSize(size);
      notifySelectionChange();
    }

    function getBrushSize() {
      return brushSize;
    }

    function setMode(nextMode) {
      mode = nextMode === "erase" ? "erase" : "paint";
      if (!active) {
        activate(mode === "erase" ? null : selectedTexture);
        return;
      }
      notifySelectionChange();
    }

    function getMode() {
      return mode;
    }

    function isEraseMode() {
      return active && mode === "erase";
    }

    function sampleTexture(cellX, cellY) {
      const tileMap = getTileMap();
      if (!tileMap) return false;
      const key = Math.floor(cellX) + "," + Math.floor(cellY);
      const sampledTexture = resolveTextureId(tileMap[key]);
      if (!sampledTexture) return false;
      selectedTexture = sampledTexture;
      mode = "paint";
      isPainting = false;
      isErasing = false;
      const map = getMap();
      if (map) {
        map._tilePainterHover = {
          cellX: Math.floor(cellX),
          cellY: Math.floor(cellY),
          brushSize,
          textureId: selectedTexture,
          mode,
        };
        map.requestDraw?.();
      }
      notifySelectionChange();
      return true;
    }

    // Paint or erase cells covered by the brush at (cellX, cellY).
    function applyBrush(cellX, cellY, erase) {
      const tileMap = getTileMap();
      if (!tileMap) return;
      const half = Math.floor(brushSize / 2);
      let changed = false;
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const cx = Math.floor(cellX) - half + dx;
          const cy = Math.floor(cellY) - half + dy;
          const key = cx + "," + cy;
          if (erase) {
            if (tileMap[key] !== undefined) {
              delete tileMap[key];
              changed = true;
            }
          } else if (selectedTexture) {
            if (tileMap[key] !== selectedTexture) {
              tileMap[key] = selectedTexture;
              changed = true;
            }
          }
        }
      }
      if (changed) {
        setTileMap(tileMap);
        const map = getMap();
        if (map) {
          map.invalidateTileRenderCache?.();
          map.requestDraw?.();
        }
      }
      return changed;
    }

    function clearAll() {
      setTileMap({});
      const map = getMap();
      if (map) {
        map.invalidateTileRenderCache?.();
        map.requestDraw?.();
      }
      if (onChanged) onChanged();
    }

    // Mouse event handlers — called from tactical-map-interactions when painter is active.
    // Painting is fully local; persistence is debounced until the stroke ends.
    function handleMouseDown(e, cellX, cellY) {
      if (e.button === 2) {
        sampleTexture(cellX, cellY);
        return true;
      }
      if (e.button === 0) {
        if (mode === "erase") {
          isErasing = true;
          applyBrush(cellX, cellY, true);
        } else if (selectedTexture) {
          isPainting = true;
          applyBrush(cellX, cellY, false);
        }
        return true;
      }
      return false;
    }

    function handleMouseMove(cellX, cellY) {
      if (isPainting) {
        applyBrush(cellX, cellY, false);
        return true;
      }
      if (isErasing) {
        applyBrush(cellX, cellY, true);
        return true;
      }
      // Draw hover preview
      const map = getMap();
      if (map) {
        map._tilePainterHover = {
          cellX: Math.floor(cellX),
          cellY: Math.floor(cellY),
          brushSize,
          textureId: mode === "erase" ? null : selectedTexture,
          mode,
        };
        map.requestDraw?.();
      }
      return false;
    }

    function handleMouseUp() {
      const wasPainting = isPainting || isErasing;
      isPainting = false;
      isErasing = false;
      if (wasPainting) scheduleSave();
    }

    return {
      isActive,
      activate,
      deactivate,
      setTexture,
      getTexture,
      setMode,
      getMode,
      isEraseMode,
      setBrushSize,
      getBrushSize,
      clearAll,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      BRUSH_SIZES,
    };
  }

  global.TilePainter = { createTilePainter };
})(window);
