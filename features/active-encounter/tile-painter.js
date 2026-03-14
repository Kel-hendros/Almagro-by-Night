// Tile painting mode: lets the narrator paint terrain textures onto grid cells.
(function initTilePainterModule(global) {
  const BRUSH_SIZES = [1, 2, 3];

  function createTilePainter(opts) {
    const { getMap, getTileMap, setTileMap, onChanged } = opts;

    let active = false;
    let selectedTexture = null;
    let brushSize = 1;
    let isPainting = false;
    let isErasing = false;

    function isActive() {
      return active;
    }

    function activate(textureId) {
      active = true;
      selectedTexture = textureId || null;
      const map = getMap();
      if (map) map.canvas.classList.add("tile-painter-active");
    }

    function deactivate() {
      active = false;
      isPainting = false;
      isErasing = false;
      const map = getMap();
      if (map) map.canvas.classList.remove("tile-painter-active");
    }

    function setTexture(textureId) {
      selectedTexture = textureId;
      if (!active && textureId) activate(textureId);
    }

    function getTexture() {
      return selectedTexture;
    }

    function setBrushSize(size) {
      brushSize = Math.max(1, Math.min(3, size));
    }

    function getBrushSize() {
      return brushSize;
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
        if (map) map.draw();
      }
      return changed;
    }

    function clearAll() {
      setTileMap({});
      const map = getMap();
      if (map) map.draw();
      if (onChanged) onChanged();
    }

    // Mouse event handlers — called from tactical-map-interactions when painter is active.
    function handleMouseDown(e, cellX, cellY) {
      if (e.button === 2) {
        isErasing = true;
        applyBrush(cellX, cellY, true);
        if (onChanged) onChanged();
        return true;
      }
      if (e.button === 0) {
        isPainting = true;
        applyBrush(cellX, cellY, false);
        if (onChanged) onChanged();
        return true;
      }
      return false;
    }

    function handleMouseMove(cellX, cellY) {
      if (isPainting) {
        if (applyBrush(cellX, cellY, false)) {
          if (onChanged) onChanged();
        }
        return true;
      }
      if (isErasing) {
        if (applyBrush(cellX, cellY, true)) {
          if (onChanged) onChanged();
        }
        return true;
      }
      // Draw hover preview
      const map = getMap();
      if (map) {
        map._tilePainterHover = { cellX: Math.floor(cellX), cellY: Math.floor(cellY), brushSize, textureId: selectedTexture };
        map.draw();
      }
      return false;
    }

    function handleMouseUp() {
      isPainting = false;
      isErasing = false;
    }

    return {
      isActive,
      activate,
      deactivate,
      setTexture,
      getTexture,
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
