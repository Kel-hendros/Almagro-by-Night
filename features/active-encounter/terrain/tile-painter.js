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
    const {
      getMap, getTileMap, setTileMap,
      getTileHeights, setTileHeights,
      onChanged, onSelectionChange,
    } = opts;

    let active = false;
    let selectedTexture = null;
    let brushSize = 1;
    let mode = "paint";
    let isPainting = false;
    let isErasing = false;
    let selectedHeight = 0;
    let heightEditMode = false;
    let _dirty = false;
    let _saveTimer = null;
    const SAVE_DELAY = 800; // ms after last stroke before persisting

    function clampHeight(h) {
      const n = Math.round(Number(h) || 0);
      return Math.max(-10, Math.min(10, n));
    }

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
          height: selectedHeight,
          heightEditMode,
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
      // Per spec: switching texture resets the height-being-painted to 0.
      selectedTexture = resolvedTexture;
      selectedHeight = 0;
      mode = "paint";
      if (!active) {
        activate(resolvedTexture);
        return;
      }
      notifySelectionChange();
    }

    function setHeight(h) {
      selectedHeight = clampHeight(h);
      notifySelectionChange();
      // Update the live hover preview so the height label refreshes
      // without needing a mouse move.
      const map = getMap();
      if (map && map._tilePainterHover) {
        map._tilePainterHover.height = selectedHeight;
        map.requestDraw?.();
      }
    }

    function getHeight() {
      return selectedHeight;
    }

    function setHeightEditMode(on) {
      heightEditMode = !!on;
      notifySelectionChange();
      const map = getMap();
      if (map) {
        map._heightEditMode = heightEditMode;
        map.requestDraw?.();
      }
    }

    function isHeightEditMode() {
      return heightEditMode;
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
      // Sampling copies both texture AND height so the narrator can extend
      // an area without manually reading and re-entering the height.
      const tileHeights = typeof getTileHeights === "function" ? getTileHeights() : null;
      const sampledHeight = tileHeights && typeof tileHeights[key] === "number" ? tileHeights[key] : 0;
      selectedHeight = clampHeight(sampledHeight);
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
      const tileHeights = typeof getTileHeights === "function" ? getTileHeights() : null;
      const half = Math.floor(brushSize / 2);
      let textureChanged = false;
      let heightChanged = false;
      for (let dy = 0; dy < brushSize; dy++) {
        for (let dx = 0; dx < brushSize; dx++) {
          const cx = Math.floor(cellX) - half + dx;
          const cy = Math.floor(cellY) - half + dy;
          const key = cx + "," + cy;
          if (erase) {
            if (tileMap[key] !== undefined) {
              delete tileMap[key];
              textureChanged = true;
            }
            if (tileHeights && tileHeights[key] !== undefined) {
              delete tileHeights[key];
              heightChanged = true;
            }
          } else if (heightEditMode) {
            // Height edit mode: only adjust height on cells that already
            // have a texture. Untextured cells are ignored.
            if (tileMap[key] !== undefined && tileHeights) {
              if (tileHeights[key] !== selectedHeight) {
                if (selectedHeight === 0) delete tileHeights[key];
                else tileHeights[key] = selectedHeight;
                heightChanged = true;
              }
            }
          } else if (selectedTexture) {
            if (tileMap[key] !== selectedTexture) {
              tileMap[key] = selectedTexture;
              textureChanged = true;
            }
            if (tileHeights) {
              if (selectedHeight === 0) {
                if (tileHeights[key] !== undefined) {
                  delete tileHeights[key];
                  heightChanged = true;
                }
              } else if (tileHeights[key] !== selectedHeight) {
                tileHeights[key] = selectedHeight;
                heightChanged = true;
              }
            }
          }
        }
      }
      if (textureChanged) setTileMap(tileMap);
      if (heightChanged && typeof setTileHeights === "function") setTileHeights(tileHeights);
      if (textureChanged || heightChanged) {
        const map = getMap();
        if (map) {
          map.invalidateTileRenderCache?.();
          map.requestDraw?.();
        }
      }
      return textureChanged || heightChanged;
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
      // Always keep the hover preview tracking the cursor, even while
      // dragging a paint or erase stroke.
      const map = getMap();
      if (map) {
        map._tilePainterHover = {
          cellX: Math.floor(cellX),
          cellY: Math.floor(cellY),
          brushSize,
          textureId: mode === "erase" ? null : selectedTexture,
          mode,
          height: selectedHeight,
          heightEditMode,
        };
        map.requestDraw?.();
      }
      if (isPainting) {
        applyBrush(cellX, cellY, false);
        return true;
      }
      if (isErasing) {
        applyBrush(cellX, cellY, true);
        return true;
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
      setHeight,
      getHeight,
      setHeightEditMode,
      isHeightEditMode,
      clearAll,
      handleMouseDown,
      handleMouseMove,
      handleMouseUp,
      BRUSH_SIZES,
    };
  }

  global.TilePainter = { createTilePainter };
})(window);
