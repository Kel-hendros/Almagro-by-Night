(function initTacticalMapInteractionsModule(global) {
  function applyInteractionMethods(TacticalMap) {
    if (!TacticalMap || TacticalMap.__interactionMethodsApplied) return;
    TacticalMap.__interactionMethodsApplied = true;
    const proto = TacticalMap.prototype;

    proto.setupInteractions = function setupInteractions() {
      this._onWheel = (e) => this.handleWheel(e);
      this._onMouseDown = (e) => this.handleMouseDown(e);
      this._onDoubleClick = (e) => this.handleDoubleClick(e);
      this._onContextMenu = (e) => e.preventDefault();
      this._onMouseMove = (e) => this.handleMouseMove(e);
      this._onMouseUp = (e) => this.handleMouseUp(e);

      this.canvas.addEventListener("wheel", this._onWheel);
      this.canvas.addEventListener("mousedown", this._onMouseDown);
      this.canvas.addEventListener("dblclick", this._onDoubleClick);
      this.canvas.addEventListener("contextmenu", this._onContextMenu);
      window.addEventListener("mousemove", this._onMouseMove);
      window.addEventListener("mouseup", this._onMouseUp);
    };

    proto.disposeInteractions = function disposeInteractions() {
      if (!this.canvas) return;
      if (this._onWheel) this.canvas.removeEventListener("wheel", this._onWheel);
      if (this._onMouseDown) {
        this.canvas.removeEventListener("mousedown", this._onMouseDown);
      }
      if (this._onDoubleClick) {
        this.canvas.removeEventListener("dblclick", this._onDoubleClick);
      }
      if (this._onContextMenu) {
        this.canvas.removeEventListener("contextmenu", this._onContextMenu);
      }
      if (this._onMouseMove) {
        window.removeEventListener("mousemove", this._onMouseMove);
      }
      if (this._onMouseUp) window.removeEventListener("mouseup", this._onMouseUp);
    };

    proto.handleWheel = function handleWheel(e) {
      e.preventDefault();
      this.wheelDeltaAccumulator += e.deltaY;
      const now = performance.now();
      const absDelta = Math.abs(this.wheelDeltaAccumulator);

      if (absDelta < this.wheelStepThreshold) return;
      if (now - this.lastWheelStepAt < this.wheelStepCooldownMs) return;

      const direction = this.wheelDeltaAccumulator > 0 ? -1 : 1;
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      this.stepZoom(direction, mouseX, mouseY);
      this.draw();

      this.lastWheelStepAt = now;
      this.wheelDeltaAccumulator = 0;
    };

    proto.getNearestZoomIndex = function getNearestZoomIndex() {
      let nearestIdx = 0;
      let nearestDist = Infinity;
      for (let i = 0; i < this.zoomLevels.length; i++) {
        const dist = Math.abs(this.zoomLevels[i] - this.scale);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearestIdx = i;
        }
      }
      return nearestIdx;
    };

    proto.setZoomByIndex = function setZoomByIndex(index, focusX, focusY) {
      const safeIndex = Math.max(0, Math.min(this.zoomLevels.length - 1, index));
      const newScale = this.zoomLevels[safeIndex];
      const fx = focusX ?? this.canvas.width / 2;
      const fy = focusY ?? this.canvas.height / 2;

      const worldX = (fx - this.offsetX) / this.scale;
      const worldY = (fy - this.offsetY) / this.scale;

      this.scale = newScale;
      this.offsetX = fx - worldX * newScale;
      this.offsetY = fy - worldY * newScale;
      this.dispatchTransformEvent();
    };

    proto.dispatchTransformEvent = function dispatchTransformEvent() {
      document.dispatchEvent(new CustomEvent("ae-map-transform", {
        detail: {
          scale: this.scale,
          offsetX: this.offsetX,
          offsetY: this.offsetY,
          gridSize: this.gridSize,
        },
      }));
    };

    proto.getElementsGridState = function getElementsGridState() {
      return this._elementsEditorGrid || null;
    };

    proto.snapElementsCellToGrid = function snapElementsCellToGrid(cellX, cellY) {
      const gridState = this.getElementsGridState();
      if (!gridState || gridState.enabled !== true) {
        return { x: cellX, y: cellY };
      }
      const spacing = Number.isFinite(gridState.spacing) && gridState.spacing > 0
        ? gridState.spacing
        : 1;
      const offsetX = Number.isFinite(gridState.offsetX) ? gridState.offsetX : 0;
      const offsetY = Number.isFinite(gridState.offsetY) ? gridState.offsetY : 0;
      const snappedX = Math.round((cellX - offsetX) / spacing) * spacing + offsetX;
      const snappedY = Math.round((cellY - offsetY) / spacing) * spacing + offsetY;
      return {
        x: Math.round(snappedX * 1000) / 1000,
        y: Math.round(snappedY * 1000) / 1000,
      };
    };

    proto.startPan = function startPan(clientX, clientY) {
      this.isPanning = true;
      this.dragStart = { x: clientX, y: clientY };
    };

    proto.stepZoom = function stepZoom(direction, focusX, focusY) {
      const currentIndex = this.getNearestZoomIndex();
      const nextIndex = currentIndex + direction;
      this.setZoomByIndex(nextIndex, focusX, focusY);
    };

    proto.zoomIn = function zoomIn(focusX, focusY) {
      this.stepZoom(1, focusX, focusY);
    };

    proto.zoomOut = function zoomOut(focusX, focusY) {
      this.stepZoom(-1, focusX, focusY);
    };

    proto.getTokenAt = function getTokenAt(worldX, worldY) {
      return [...this.tokens].reverse().find((t) => {
        const tx = t.x * this.gridSize;
        const ty = t.y * this.gridSize;
        const size = (t.size || 1) * this.gridSize;
        return (
          worldX >= tx &&
          worldX <= tx + size &&
          worldY >= ty &&
          worldY <= ty + size
        );
      });
    };

    proto.getMapEffectAt = function getMapEffectAt(worldX, worldY) {
      const effects = Array.isArray(this.mapEffects) ? this.mapEffects : [];
      return [...effects].reverse().find((effect) => {
        if (!effect || effect.type !== "night_shroud") return false;
        const center =
          typeof this.getMapEffectCenter === "function"
            ? this.getMapEffectCenter(effect, performance.now())
            : null;
        if (!center) return false;
        const radiusCells = Math.max(0, parseFloat(effect.radiusCells) || 0);
        if (radiusCells <= 0) return false;
        const dx = worldX - center.x * this.gridSize;
        const dy = worldY - center.y * this.gridSize;
        return dx * dx + dy * dy <= Math.pow(radiusCells * this.gridSize, 2);
      });
    };

    proto.getTokenClientAnchor = function getTokenClientAnchor(token) {
      if (!token || !this.canvas) return null;
      const rect = this.canvas.getBoundingClientRect();
      const renderPos =
        typeof this.getTokenRenderPosition === "function"
          ? this.getTokenRenderPosition(token, performance.now())
          : { x: token.x, y: token.y };
      const size = (parseFloat(token.size) || 1) * this.gridSize;
      const centerWorldX = (parseFloat(renderPos.x) || 0) * this.gridSize + size / 2;
      const centerWorldY = (parseFloat(renderPos.y) || 0) * this.gridSize + size / 2;
      return {
        x: rect.left + this.offsetX + centerWorldX * this.scale,
        y: rect.top + this.offsetY + centerWorldY * this.scale,
        radiusPx: (size * this.scale) / 2,
      };
    };

    proto.getDesignTokenAt = function getDesignTokenAt(worldX, worldY) {
      const all = Array.isArray(this.designTokens) ? this.designTokens : [];
      return [...all].reverse().find((t) => {
        const rect = this.getDesignTokenRect(t);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const angle = this.getDesignTokenRotationRad(t);
        const local = this.rotatePointAround(worldX, worldY, cx, cy, -angle);
        const tx = rect.x;
        const ty = rect.y;
        const width = rect.width;
        const height = rect.height;
        return (
          local.x >= tx &&
          local.x <= tx + width &&
          local.y >= ty &&
          local.y <= ty + height
        );
      });
    };

    /**
     * Find a wall vertex (shared endpoint) near a cell position.
     * Returns { x, y } or null.
     */
    proto.getVertexAt = function getVertexAt(cellX, cellY) {
      var THRESHOLD = 0.35;
      var walls = this.walls || [];
      // Build a registry of unique vertices
      var vertices = [];
      var seen = new Set();
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var k1 = Math.round(w.x1 * 1000) + "," + Math.round(w.y1 * 1000);
        var k2 = Math.round(w.x2 * 1000) + "," + Math.round(w.y2 * 1000);
        if (!seen.has(k1)) { seen.add(k1); vertices.push({ x: w.x1, y: w.y1 }); }
        if (!seen.has(k2)) { seen.add(k2); vertices.push({ x: w.x2, y: w.y2 }); }
      }
      for (var vi = 0; vi < vertices.length; vi++) {
        var v = vertices[vi];
        var dx = cellX - v.x, dy = cellY - v.y;
        if (Math.sqrt(dx * dx + dy * dy) < THRESHOLD) return v;
      }
      return null;
    };

    /**
     * Find a wall segment near a cell position.
     * Returns wall object or null.
     */
    proto.getWallAt = function getWallAt(cellX, cellY) {
      var THRESHOLD = 0.4;
      var walls = this.walls || [];
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var dist = this._pointToSegmentDist(cellX, cellY, w.x1, w.y1, w.x2, w.y2);
        if (dist < THRESHOLD) return w;
      }
      return null;
    };

    proto._pointToSegmentDist = function _pointToSegmentDist(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1, dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      if (lenSq < 0.0001) return Math.sqrt((px - x1) * (px - x1) + (py - y1) * (py - y1));
      var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      var projX = x1 + t * dx, projY = y1 + t * dy;
      return Math.sqrt((px - projX) * (px - projX) + (py - projY) * (py - projY));
    };

    /**
     * Find an interactive marker (door/window, light, switch) near a cell position.
     * Returns { type, wall|light|sw } or null.
     */
    proto.getMarkerAt = function getMarkerAt(cellX, cellY, screenX, screenY) {
      var CELL_THRESHOLD = 0.6;
      var SCREEN_THRESHOLD_PX = 14;
      var bestHit = null;
      var bestDistance = Infinity;

      function considerMarker(markerCellX, markerCellY, payload) {
        var distance = Infinity;
        if (Number.isFinite(screenX) && Number.isFinite(screenY)) {
          var markerScreenX = markerCellX * this.gridSize * this.scale + this.offsetX;
          var markerScreenY = markerCellY * this.gridSize * this.scale + this.offsetY;
          var dxPx = screenX - markerScreenX;
          var dyPx = screenY - markerScreenY;
          distance = Math.sqrt(dxPx * dxPx + dyPx * dyPx);
          if (distance > SCREEN_THRESHOLD_PX) return;
        } else {
          var dxCell = cellX - markerCellX;
          var dyCell = cellY - markerCellY;
          distance = Math.sqrt(dxCell * dxCell + dyCell * dyCell);
          if (distance > CELL_THRESHOLD) return;
        }
        if (distance < bestDistance) {
          bestDistance = distance;
          bestHit = payload;
        }
      }

      // Doors / Windows
      var walls = this.walls || [];
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        if (w.type !== "door" && w.type !== "window") continue;
        if (typeof this.isWallMarkerVisibleToViewer === "function" && !this.isWallMarkerVisibleToViewer(w)) {
          continue;
        }
        var mx = (w.x1 + w.x2) / 2;
        var my = (w.y1 + w.y2) / 2;
        considerMarker.call(this, mx, my, { type: w.type, wall: w });
      }
      // Lights
      var lights = this.lights || [];
      for (var li = 0; li < lights.length; li++) {
        var l = lights[li];
        if (typeof this.isLightVisibleToViewer === "function" && !this.isLightVisibleToViewer(l)) {
          continue;
        }
        considerMarker.call(this, l.x, l.y, { type: "light", light: l });
      }
      // Switches
      var switches = this.switches || [];
      for (var si = 0; si < switches.length; si++) {
        var s = switches[si];
        if (typeof this.isSwitchVisibleToViewer === "function" && !this.isSwitchVisibleToViewer(s)) {
          continue;
        }
        considerMarker.call(this, s.x, s.y, { type: "switch", sw: s });
      }
      return bestHit;
    };

    proto.getDesignTokenRotateHandleAt = function getDesignTokenRotateHandleAt(
      worldX,
      worldY,
    ) {
      if (this.activeLayer !== "decor" || !this.selectedDesignTokenId) return null;
      const token = (this.designTokens || []).find(
        (t) => t.id === this.selectedDesignTokenId,
      );
      if (!token) return null;
      const handle = this.getDesignTokenRotateHandlePx(token);
      if (!handle) return null;
      const radius = Math.max(10 / this.scale, 7);
      const dx = worldX - handle.x;
      const dy = worldY - handle.y;
      if (dx * dx + dy * dy <= radius * radius) {
        return { tokenId: token.id };
      }
      return null;
    };

    proto.getBackgroundHandleAt = function getBackgroundHandleAt(worldX, worldY) {
      if (this.activeLayer !== "background" || !this.selectedBackground) return null;
      const rect = this.getBackgroundRect();
      const px = rect.x * this.gridSize;
      const py = rect.y * this.gridSize;
      const pw = rect.width * this.gridSize;
      const ph = rect.height * this.gridSize;
      const handleRadius = Math.max(10 / this.scale, 0.18 * this.gridSize);
      const points = [
        { id: "left", x: px, y: py + ph / 2 },
        { id: "right", x: px + pw, y: py + ph / 2 },
        { id: "top", x: px + pw / 2, y: py },
        { id: "bottom", x: px + pw / 2, y: py + ph },
      ];

      return points.find((pt) => {
        const dx = worldX - pt.x;
        const dy = worldY - pt.y;
        return dx * dx + dy * dy <= handleRadius * handleRadius;
      });
    };

    proto.getDesignTokenHandleAt = function getDesignTokenHandleAt(worldX, worldY) {
      if (this.activeLayer !== "decor" || !this.selectedDesignTokenId) return null;
      const token = (this.designTokens || []).find(
        (t) => t.id === this.selectedDesignTokenId,
      );
      if (!token) return null;

      const rect = this.getDesignTokenRect(token);
      const px = rect.x;
      const py = rect.y;
      const pw = rect.width;
      const ph = rect.height;
      const handleRadius = Math.max(10 / this.scale, 0.18 * this.gridSize);
      const points = [
        { id: "left", x: px, y: py + ph / 2 },
        { id: "right", x: px + pw, y: py + ph / 2 },
        { id: "top", x: px + pw / 2, y: py },
        { id: "bottom", x: px + pw / 2, y: py + ph },
      ];

      const handle = points.find((pt) => {
        const dx = worldX - pt.x;
        const dy = worldY - pt.y;
        return dx * dx + dy * dy <= handleRadius * handleRadius;
      });
      if (!handle) return null;
      return { tokenId: token.id, handleId: handle.id };
    };

    proto.resizeBackgroundFromHandle = function resizeBackgroundFromHandle(
      handleId,
      worldX,
      worldY,
    ) {
      const bg = this.mapLayer || {};
      const minCells = 2;
      const x = parseFloat(bg.x) || 0;
      const y = parseFloat(bg.y) || 0;
      const width = Math.max(minCells, parseFloat(bg.widthCells) || 20);
      const height = Math.max(minCells, parseFloat(bg.heightCells) || 20);
      const aspect = width / height;
      const px = worldX / this.gridSize;
      const py = worldY / this.gridSize;

      let nextX = x;
      let nextY = y;
      let nextW = width;
      let nextH = height;

      if (handleId === "right") {
        const left = x;
        nextW = Math.max(minCells, px - left);
        nextH = nextW / aspect;
        nextX = left;
        nextY = y + (height - nextH) / 2;
      } else if (handleId === "left") {
        const right = x + width;
        nextW = Math.max(minCells, right - px);
        nextH = nextW / aspect;
        nextX = right - nextW;
        nextY = y + (height - nextH) / 2;
      } else if (handleId === "bottom") {
        const top = y;
        nextH = Math.max(minCells, py - top);
        nextW = nextH * aspect;
        nextY = top;
        nextX = x + (width - nextW) / 2;
      } else if (handleId === "top") {
        const bottom = y + height;
        nextH = Math.max(minCells, bottom - py);
        nextW = nextH * aspect;
        nextY = bottom - nextH;
        nextX = x + (width - nextW) / 2;
      }

      this.mapLayer = {
        ...this.mapLayer,
        x: nextX,
        y: nextY,
        widthCells: nextW,
        heightCells: nextH,
        preserveAspect: true,
      };
    };

    proto.getPropAt = function getPropAt(worldX, worldY) {
      const all = Array.isArray(this.props) ? this.props : [];
      return [...all].reverse().find((p) => {
        const rect = this.getPropRect(p);
        const cx = rect.x + rect.width / 2;
        const cy = rect.y + rect.height / 2;
        const angle = this.getPropRotationRad(p);
        const local = this.rotatePointAround(worldX, worldY, cx, cy, -angle);
        return (
          local.x >= rect.x &&
          local.x <= rect.x + rect.width &&
          local.y >= rect.y &&
          local.y <= rect.y + rect.height
        );
      });
    };

    proto.getPropGroupHandleAt = function getPropGroupHandleAt(worldX, worldY) {
      if (this.activeLayer !== "background" || !this.selectedPropIds || this.selectedPropIds.size === 0) return null;
      const bounds = this.getSelectedPropsBounds();
      if (!bounds) return null;
      const handleRadius = Math.max(10 / this.scale, 0.18 * this.gridSize);
      const corners = [
        { id: "top-left", x: bounds.x, y: bounds.y },
        { id: "top-right", x: bounds.x + bounds.width, y: bounds.y },
        { id: "bottom-right", x: bounds.x + bounds.width, y: bounds.y + bounds.height },
        { id: "bottom-left", x: bounds.x, y: bounds.y + bounds.height },
      ];
      const handle = corners.find((pt) => {
        const dx = worldX - pt.x;
        const dy = worldY - pt.y;
        return dx * dx + dy * dy <= handleRadius * handleRadius;
      });
      if (!handle) return null;
      return { handleId: handle.id };
    };

    proto.getPropGroupRotateHandleAt = function getPropGroupRotateHandleAt(worldX, worldY) {
      if (this.activeLayer !== "background" || !this.selectedPropIds || this.selectedPropIds.size === 0) return null;
      const bounds = this.getSelectedPropsBounds();
      if (!bounds) return null;
      const topCenterX = bounds.x + bounds.width / 2;
      const topCenterY = bounds.y;
      const offset = Math.max(22 / this.scale, 14);
      const rhx = topCenterX;
      const rhy = topCenterY - offset;
      const radius = Math.max(10 / this.scale, 7);
      const dx = worldX - rhx;
      const dy = worldY - rhy;
      if (dx * dx + dy * dy <= radius * radius) return { x: rhx, y: rhy };
      return null;
    };

    // resizePropFromHandle removed — group resize uses scale factor instead

    proto.resizeDesignTokenFromHandle = function resizeDesignTokenFromHandle(
      token,
      handleId,
      worldX,
      worldY,
    ) {
      if (!token) return;
      const minCells = 0.2;
      const rect = this.getDesignTokenRectCells(token);
      const x = rect.x;
      const y = rect.y;
      const width = Math.max(minCells, rect.width);
      const height = Math.max(minCells, rect.height);
      const aspect = width / height;
      const px = worldX / this.gridSize;
      const py = worldY / this.gridSize;

      let nextX = x;
      let nextY = y;
      let nextW = width;
      let nextH = height;

      if (handleId === "right") {
        const left = x;
        nextW = Math.max(minCells, px - left);
        nextH = nextW / aspect;
        nextX = left;
        nextY = y + (height - nextH) / 2;
      } else if (handleId === "left") {
        const right = x + width;
        nextW = Math.max(minCells, right - px);
        nextH = nextW / aspect;
        nextX = right - nextW;
        nextY = y + (height - nextH) / 2;
      } else if (handleId === "bottom") {
        const top = y;
        nextH = Math.max(minCells, py - top);
        nextW = nextH * aspect;
        nextY = top;
        nextX = x + (width - nextW) / 2;
      } else if (handleId === "top") {
        const bottom = y + height;
        nextH = Math.max(minCells, bottom - py);
        nextW = nextH * aspect;
        nextY = bottom - nextH;
        nextX = x + (width - nextW) / 2;
      }

      token.x = nextX;
      token.y = nextY;
      token.widthCells = nextW;
      token.heightCells = nextH;
    };

    proto.handleMouseDown = function handleMouseDown(e) {
      if (e.button === 1 || e.metaKey) {
        e.preventDefault();
        this.startPan(e.clientX, e.clientY);
        return;
      }

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      const worldCellX = worldX / this.gridSize;
      const worldCellY = worldY / this.gridSize;
      const layer = this.activeLayer || "entities";
      const markerHit = this.getMarkerAt(worldCellX, worldCellY, mouseX, mouseY);

      // Tile painter intercept
      if (this._tilePainter && this._tilePainter.isActive()) {
        if (this._tilePainter.handleMouseDown(e, worldCellX, worldCellY)) {
          e.preventDefault();
          return;
        }
      }

      // Wall drawer intercept (active drawing OR elements layer contextual editing)
      if (this._wallDrawer && (this._wallDrawer.isActive() || this._wallDrawer.isElementsLayerActive?.())) {
        if (this._wallDrawer.handleMouseDown(e, worldCellX, worldCellY)) {
          e.preventDefault();
          return;
        }
      }

      if (this.measureToolActive) {
        if (e.button === 0) {
          e.preventDefault();
          if (!this.measureStart || this.measureEnd) {
            this.measureStart = { x: worldCellX, y: worldCellY };
            this.measureEnd = null;
            this.measurePreview = { x: worldCellX, y: worldCellY };
          } else {
            this.measureEnd = { x: worldCellX, y: worldCellY };
            this.measurePreview = null;
          }
          this.draw();
          return;
        }
        if (e.button === 2) {
          e.preventDefault();
          this.startPan(e.clientX, e.clientY);
          return;
        }
      }

      if (e.button === 0 && typeof this.isLinkModeActive === "function" && this.isLinkModeActive()) {
        if (typeof this.onLinkModeClick === "function") {
          this.onLinkModeClick(worldCellX, worldCellY);
          e.preventDefault();
          this.draw();
          return;
        }
      }

      // Light interaction: only on elements layer
      if (e.button === 0 && layer === "elements" && this.lights && this.lights.length) {
        var clickedLight = markerHit && markerHit.type === "light" ? markerHit.light : null;
        if (clickedLight) {
          this.selectedLightId = clickedLight.id;
          this.selectedSwitchId = null;
          this._isDraggingLight = false;
          this._lightDragPending = true;
          this._draggedLight = clickedLight;
          this._dragLightStartPointer = { x: e.clientX, y: e.clientY };
          this._dragLightOffset = {
            x: worldX - clickedLight.x * this.gridSize,
            y: worldY - clickedLight.y * this.gridSize,
          };
          e.preventDefault();
          this.draw();
          return;
        } else {
          // Clicked empty space on elements layer: deselect light/switch
          if (this.selectedLightId || this.selectedSwitchId) {
            this.selectedLightId = null;
            this.selectedSwitchId = null;
            this._lightDragPending = false;
            this._switchDragPending = false;
            this._draggedLight = null;
            this._draggedSwitch = null;
            if (typeof this.invalidateLighting === "function") this.invalidateLighting();
            this.draw();
          }
        }
      }

      // Switch interaction: only on elements layer
      if (e.button === 0 && layer === "elements" && this.switches && this.switches.length) {
        var clickedSwitch = markerHit && markerHit.type === "switch" ? markerHit.sw : null;
        if (clickedSwitch) {
          this.selectedSwitchId = clickedSwitch.id;
          this.selectedLightId = null;
          this._isDraggingSwitch = false;
          this._switchDragPending = true;
          this._draggedSwitch = clickedSwitch;
          this._dragSwitchStartPointer = { x: e.clientX, y: e.clientY };
          this._dragSwitchOffset = {
            x: worldX - clickedSwitch.x * this.gridSize,
            y: worldY - clickedSwitch.y * this.gridSize,
          };
          e.preventDefault();
          this.draw();
          return;
        }
      }

      if (e.button === 0 && layer === "elements" && this._elementsPlacementMode) {
        const snappedPlacement = this.snapElementsCellToGrid(worldCellX, worldCellY);
        if (this._elementsPlacementMode === "light") {
          if (typeof this.onCreateLight === "function") {
            this.onCreateLight(snappedPlacement.x, snappedPlacement.y);
            e.preventDefault();
            return;
          }
        } else if (this._elementsPlacementMode === "switch") {
          if (typeof this.onCreateSwitch === "function") {
            this.onCreateSwitch(snappedPlacement.x, snappedPlacement.y);
            e.preventDefault();
            return;
          }
        }
      }

      // Switch toggle from any layer (like door toggle)
      if (e.button === 0 && this.switches && this.switches.length && layer !== "background") {
        if (markerHit && markerHit.type === "switch" && typeof this.onSwitchToggle === "function") {
          this.onSwitchToggle(markerHit.sw.id);
          e.preventDefault();
          return;
        }
      }

      // Door toggle intercept (works in any layer, narrator only, left-click)
      // BUT: if there's a token at this position, the token takes priority (player needs to move it)
      if (e.button === 0 && this.walls && this.walls.length &&
          typeof window.WallDrawer?.tryToggleDoor === "function" &&
          !(this._wallDrawer && this._wallDrawer.isActive())) {
        var tokenAtClick = typeof this.getTokenAt === "function" ? this.getTokenAt(worldX, worldY) : null;
        if (!tokenAtClick && (!markerHit || markerHit.type === "door" || markerHit.type === "window")) {
          var toggledDoor = window.WallDrawer.tryToggleDoor(worldCellX, worldCellY, this.walls);
          if (toggledDoor && typeof this.onWallDoorToggle === "function") {
            this.onWallDoorToggle(toggledDoor);
            this.draw();
            e.preventDefault();
            return;
          }
        }
      }

      // Right-click on interactive markers — works from any layer
      if (e.button === 2) {
        if (markerHit && this.onMarkerContext) {
          e.preventDefault();
          markerHit.clientX = e.clientX;
          markerHit.clientY = e.clientY;
          this.onMarkerContext(markerHit);
          return;
        }
      }

      // Right-click on walls/vertices — only in elements layer
      if (e.button === 2 && layer === "elements" && this.onWallContext) {
        // Check vertex first (smaller hit area, higher priority)
        var vertexHit = this.getVertexAt(worldCellX, worldCellY);
        if (vertexHit) {
          e.preventDefault();
          this.onWallContext({
            type: "vertex",
            vertex: vertexHit,
            cellX: worldCellX,
            cellY: worldCellY,
            clientX: e.clientX,
            clientY: e.clientY,
          });
          return;
        }
        // Then check wall segment
        var wallHit = this.getWallAt(worldCellX, worldCellY);
        if (wallHit) {
          e.preventDefault();
          this.onWallContext({
            type: "wall",
            wall: wallHit,
            cellX: worldCellX,
            cellY: worldCellY,
            clientX: e.clientX,
            clientY: e.clientY,
          });
          return;
        }
      }

      if (layer === "background") {
        const canEdit =
          typeof this.canEditBackground === "function"
            ? !!this.canEditBackground()
            : true;

        // Prop interactions (higher priority than background image)
        if (canEdit) {
          // Group rotate handle
          const groupRotate = this.getPropGroupRotateHandleAt(worldX, worldY);
          if (e.button === 0 && groupRotate) {
            const bounds = this.getSelectedPropsBounds();
            if (bounds) {
              const cx = bounds.x + bounds.width / 2;
              const cy = bounds.y + bounds.height / 2;
              const startAngle = Math.atan2(worldY - cy, worldX - cx);
              const radius = Math.hypot(worldX - cx, worldY - cy);
              this.isRotatingProp = true;
              this.rotatingPropStartAngle = startAngle;
              this._propGroupRotateCenter = { x: cx, y: cy };
              this._propRotateRadius = radius;
              this._propRotateCurrentAngle = startAngle;
              this._propRotateTotalDeg = 0;
              this._propGroupRotateStartPositions = this.getSelectedProps().map((p) => {
                const w = parseFloat(p.widthCells) || 1;
                const h = parseFloat(p.heightCells) || 1;
                return {
                  id: p.id,
                  cx: ((parseFloat(p.x) || 0) + w / 2) * this.gridSize,
                  cy: ((parseFloat(p.y) || 0) + h / 2) * this.gridSize,
                  widthCells: w,
                  heightCells: h,
                  rotationDeg: parseFloat(p.rotationDeg) || 0,
                };
              });
              return;
            }
          }

          // Group resize handle
          const groupHandle = this.getPropGroupHandleAt(worldX, worldY);
          if (e.button === 0 && groupHandle) {
            this.isResizingProp = true;
            this.resizingPropHandle = groupHandle.handleId;
            this._propGroupResizeStartBounds = this.getSelectedPropsBounds();
            this._propGroupResizeStartProps = this.getSelectedProps().map((p) => ({
              id: p.id,
              x: parseFloat(p.x) || 0, y: parseFloat(p.y) || 0,
              widthCells: parseFloat(p.widthCells) || 1,
              heightCells: parseFloat(p.heightCells) || 1,
            }));
            this.draw();
            return;
          }
        }

        const clickedProp = canEdit ? this.getPropAt(worldX, worldY) : null;

        if (e.button === 2 && clickedProp) {
          e.preventDefault();
          // Add to selection if not already selected
          if (!this.selectedPropIds.has(clickedProp.id)) {
            this.selectedPropIds = new Set([clickedProp.id]);
          }
          if (this.onPropContext) {
            this.onPropContext({
              propId: clickedProp.id,
              clientX: e.clientX,
              clientY: e.clientY,
            });
          }
          this.draw();
          this.selectedTokenId = null;
          this.selectedDesignTokenId = null;
          this.selectedBackground = false;
          return;
        }

        if (e.button === 0 && clickedProp) {
          const isShift = !!e.shiftKey;
          if (isShift) {
            // Toggle membership
            if (this.selectedPropIds.has(clickedProp.id)) {
              this.selectedPropIds.delete(clickedProp.id);
            } else {
              this.selectedPropIds.add(clickedProp.id);
            }
          } else {
            // Replace selection unless clicking an already-selected prop (to allow drag)
            if (!this.selectedPropIds.has(clickedProp.id)) {
              this.selectedPropIds = new Set([clickedProp.id]);
            }
          }

          // Start group drag
          if (!isShift && this.selectedPropIds.size > 0) {
            this.isDraggingProp = true;
            this._propGroupDragStart = { worldX, worldY };
            this._propGroupDragStartPositions = this.getSelectedProps().map((p) => ({
              id: p.id,
              x: parseFloat(p.x) || 0,
              y: parseFloat(p.y) || 0,
            }));
          }

          this.selectedBackground = false;
          this.draw();
          this.selectedTokenId = null;
          this.selectedDesignTokenId = null;
          if (this.onTokenSelect) this.onTokenSelect(null);
          if (this.onDesignTokenSelect) this.onDesignTokenSelect(null);
          return;
        }

        // No prop hit — deselect all props and fall through to background handling
        if (e.button === 0 || e.button === 2) {
          this.selectedPropIds = new Set();
        }

        // Background image handling
        const bgHandle = this.getBackgroundHandleAt(worldX, worldY);

        if (e.button === 0 && bgHandle && canEdit) {
          this.isResizingBackground = true;
          this.resizingBackgroundHandle = bgHandle.id;
          return;
        }

        if (e.button === 2) {
          e.preventDefault();
          this.startPan(e.clientX, e.clientY);
        } else if (e.button === 0) {
          const clickedBackground = this.isPointInsideBackground(worldX, worldY);
          this.selectedBackground = clickedBackground;
          if (clickedBackground && canEdit) {
            const rect = this.getBackgroundRect();
            this.isDraggingBackground = true;
            this.backgroundDragStart = {
              mouseWorldX: worldX,
              mouseWorldY: worldY,
              mapX: rect.x,
              mapY: rect.y,
            };
          } else if (!clickedBackground) {
            this.startPan(e.clientX, e.clientY);
          }
          this.draw();
        }
        this.selectedTokenId = null;
        this.selectedDesignTokenId = null;
        if (this.onTokenSelect) this.onTokenSelect(null);
        if (this.onDesignTokenSelect) this.onDesignTokenSelect(null);
        if (this.onTokenContext) this.onTokenContext(null);
        if (this.onDesignTokenContext) this.onDesignTokenContext(null);
        return;
      }

      if (layer === "decor") {
        const rotateHandle = this.getDesignTokenRotateHandleAt(worldX, worldY);
        const decorHandle = this.getDesignTokenHandleAt(worldX, worldY);
        const clickedDecor = this.getDesignTokenAt(worldX, worldY);

        if (e.button === 0 && rotateHandle) {
          const targetToken = (this.designTokens || []).find(
            (token) => token.id === rotateHandle.tokenId,
          );
          const canEdit =
            typeof this.canDragDesignToken === "function"
              ? !!this.canDragDesignToken(targetToken)
              : true;
          if (targetToken && canEdit) {
            const center = this.getDesignTokenCenterPx(targetToken);
            const startAngle = Math.atan2(worldY - center.y, worldX - center.x);
            this.isRotatingDesignToken = true;
            this.rotatingDesignTokenId = targetToken.id;
            this.rotatingDesignTokenStartAngle = startAngle;
            this.rotatingDesignTokenStartDeg =
              parseFloat(targetToken.rotationDeg) || 0;
            return;
          }
        }

        if (e.button === 0 && decorHandle) {
          const targetToken = (this.designTokens || []).find(
            (token) => token.id === decorHandle.tokenId,
          );
          const canEdit =
            typeof this.canDragDesignToken === "function"
              ? !!this.canDragDesignToken(targetToken)
              : true;
          if (targetToken && canEdit) {
            this.selectedDesignTokenId = targetToken.id;
            this.isResizingDesignToken = true;
            this.resizingDesignTokenId = targetToken.id;
            this.resizingDesignTokenHandle = decorHandle.handleId;
            if (this.onTokenSelect) this.onTokenSelect(null);
            if (this.onDesignTokenSelect) {
              this.onDesignTokenSelect({ tokenId: targetToken.id });
            }
            if (this.onDesignTokenContext) this.onDesignTokenContext(null);
            this.draw();
            return;
          }
        }

        if (e.button === 2) {
          if (clickedDecor) {
            e.preventDefault();
            this.selectedDesignTokenId = clickedDecor.id;
            this.selectedTokenId = null;
            if (this.onTokenSelect) this.onTokenSelect(null);
            if (this.onDesignTokenSelect) {
              this.onDesignTokenSelect({ tokenId: clickedDecor.id });
            }
            if (this.onDesignTokenContext) {
              this.onDesignTokenContext({
                tokenId: clickedDecor.id,
                clientX: e.clientX,
                clientY: e.clientY,
              });
            }
          } else {
            if (this.onEmptyContext) {
              this.onEmptyContext({
                worldX, worldY,
                cellX: worldCellX, cellY: worldCellY,
                clientX: e.clientX, clientY: e.clientY,
              });
            } else {
              this.startPan(e.clientX, e.clientY);
            }
            if (this.onDesignTokenContext) this.onDesignTokenContext(null);
          }
          return;
        }

        if (e.button === 0) {
          if (clickedDecor) {
            const canDrag =
              typeof this.canDragDesignToken === "function"
                ? !!this.canDragDesignToken(clickedDecor)
                : true;

            this.isDraggingDesignToken = canDrag;
            this.draggedDesignToken = canDrag ? clickedDecor : null;
            this.dragStartDesignTokenPos = canDrag
              ? { x: clickedDecor.x, y: clickedDecor.y }
              : null;
            this.dragDesignTokenOffset = {
              x: worldX - clickedDecor.x * this.gridSize,
              y: worldY - clickedDecor.y * this.gridSize,
            };
            this.selectedDesignTokenId = clickedDecor.id;
            this.selectedTokenId = null;
            if (this.onTokenSelect) this.onTokenSelect(null);
            if (this.onDesignTokenSelect) {
              this.onDesignTokenSelect({ tokenId: clickedDecor.id });
            }
            if (this.onDesignTokenContext) this.onDesignTokenContext(null);
            this.draw();
          } else {
            this.selectedDesignTokenId = null;
            this.startPan(e.clientX, e.clientY);
            if (this.onDesignTokenSelect) this.onDesignTokenSelect(null);
            if (this.onDesignTokenContext) this.onDesignTokenContext(null);
            this.draw();
          }
        }
        return;
      }

      const clickedToken = this.getTokenAt(worldX, worldY);
      const clickedMapEffect =
        !clickedToken && this.activeLayer === "entities"
          ? this.getMapEffectAt(worldX, worldY)
          : null;

      if (e.button === 2) {
        if (clickedToken) {
          e.preventDefault();
          this.selectedTokenId = clickedToken.id;
          if (this.onTokenSelect) {
            this.onTokenSelect({
              tokenId: clickedToken.id,
              instanceId: clickedToken.instanceId || null,
            });
          }
          if (this.onTokenContext) {
            const anchor = this.getTokenClientAnchor(clickedToken);
            this.onTokenContext({
              tokenId: clickedToken.id,
              instanceId: clickedToken.instanceId || null,
              clientX: e.clientX,
              clientY: e.clientY,
              anchorX: anchor?.x ?? null,
              anchorY: anchor?.y ?? null,
              anchorRadiusPx: anchor?.radiusPx ?? null,
            });
          }
          } else {
            if (this.onEmptyContext) {
              this.onEmptyContext({
                worldX, worldY,
                cellX: worldCellX, cellY: worldCellY,
                clientX: e.clientX, clientY: e.clientY,
              });
            } else {
              this.startPan(e.clientX, e.clientY);
            }
            if (this.onTokenContext) this.onTokenContext(null);
          }
        return;
      }

      if (e.button === 0) {
        if (clickedToken) {
          const clickedInstance = this.instances.find(
            (i) => i.id === clickedToken.instanceId,
          );
          const hasSatellites =
            typeof this.tokenHasSatellites === "function"
              ? this.tokenHasSatellites(clickedToken, clickedInstance)
              : false;
          const canDrag =
            typeof this.canDragToken === "function"
              ? !!this.canDragToken(clickedToken, clickedInstance)
              : true;

          this.isDraggingToken = canDrag;
          this.selectedTokenId = clickedToken.id;
          this.draggedToken = canDrag ? clickedToken : null;
          if (canDrag) {
            this.dragStartTokenPos = { x: clickedToken.x, y: clickedToken.y };
          } else {
            this.dragStartTokenPos = null;
          }
          this.dragTokenOffset = {
            x: worldX - clickedToken.x * this.gridSize,
            y: worldY - clickedToken.y * this.gridSize,
          };
          if (this.onTokenSelect && clickedToken) {
            this.onTokenSelect({
              tokenId: clickedToken.id,
              instanceId: clickedToken.instanceId || null,
            });
          }
          if (hasSatellites && typeof this.triggerSatellitePop === "function") {
            this.triggerSatellitePop(clickedToken.id);
          }
          this.selectedMapEffectId = null;
          if (this.onTokenContext) this.onTokenContext(null);
        } else if (clickedMapEffect) {
          const canDrag =
            typeof this.canDragMapEffect === "function"
              ? !!this.canDragMapEffect(clickedMapEffect)
              : true;
          this.selectedMapEffectId = clickedMapEffect.id;
          this.selectedTokenId = null;
          this.draggedMapEffect = canDrag ? clickedMapEffect : null;
          this.isDraggingMapEffect = canDrag;
          if (canDrag) {
            const center =
              typeof this.getMapEffectCenter === "function"
                ? this.getMapEffectCenter(clickedMapEffect, performance.now())
                : null;
            this.dragStartMapEffectPos = {
              x: parseFloat(clickedMapEffect.x) || center?.x || 0,
              y: parseFloat(clickedMapEffect.y) || center?.y || 0,
            };
            this.dragMapEffectOffset = {
              x: worldX - (this.dragStartMapEffectPos.x || 0) * this.gridSize,
              y: worldY - (this.dragStartMapEffectPos.y || 0) * this.gridSize,
            };
          } else {
            this.dragStartMapEffectPos = null;
          }
          if (this.onTokenSelect) this.onTokenSelect(null);
          if (this.onTokenContext) this.onTokenContext(null);
          this.draw();
        } else {
          this.selectedTokenId = null;
          this.selectedMapEffectId = null;
          this.startPan(e.clientX, e.clientY);

          if (this.onTokenSelect) this.onTokenSelect(null);
          if (this.onTokenContext) this.onTokenContext(null);
        }
      }
    };

    proto.handleMouseMove = function handleMouseMove(e) {
      // Skip expensive coordinate math when mouse is over a modal/overlay and
      // nothing is being dragged.  The listener lives on `window` so it fires
      // even when the cursor is nowhere near the canvas — the getBoundingClientRect
      // call below forces a synchronous layout reflow which, combined with CSS
      // hover repaints on overlay elements, causes visible jank.
      var isDragging = this.isPanning || this.isDraggingToken || this.isDraggingMapEffect
        || this.isDraggingDesignToken || this.isResizingDesignToken
        || this.isRotatingDesignToken || this.isDraggingProp
        || this.isResizingProp || this.isRotatingProp
        || this.isDraggingBackground || this.isResizingBackground
        || this._isDraggingLight || this._isDraggingSwitch
        || this._lightDragPending || this._switchDragPending;
      if (!isDragging && this.canvas && !this.canvas.contains(e.target)) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      const cellX = worldX / this.gridSize;
      const cellY = worldY / this.gridSize;

      if (this._lightDragPending && this._draggedLight && !this._isDraggingLight) {
        const start = this._dragLightStartPointer || null;
        const threshold = this._dragActivationThresholdPx || 4;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= threshold) {
          this._isDraggingLight = true;
          this._lightDragPending = false;
          if (typeof this.invalidateLighting === "function") this.invalidateLighting();
        }
      }
      if (this._switchDragPending && this._draggedSwitch && !this._isDraggingSwitch) {
        const start = this._dragSwitchStartPointer || null;
        const threshold = this._dragActivationThresholdPx || 4;
        if (start && Math.hypot(e.clientX - start.x, e.clientY - start.y) >= threshold) {
          this._isDraggingSwitch = true;
          this._switchDragPending = false;
          if (typeof this.invalidateLighting === "function") this.invalidateLighting();
        }
      }

      if (typeof this.isLinkModeActive === "function" && this.isLinkModeActive()) {
        if (typeof this.onLinkModeHover === "function") {
          this.onLinkModeHover(cellX, cellY);
        }
      }

      // Tile painter intercept
      if (this._tilePainter && this._tilePainter.isActive()) {
        if (this._tilePainter.handleMouseMove(cellX, cellY)) return;
      }

      // Wall drawer mousemove (active drawing OR elements layer contextual editing)
      if (this._wallDrawer && (this._wallDrawer.isActive() || this._wallDrawer.isElementsLayerActive?.())) {
        const rect2 = this.canvas.getBoundingClientRect();
        const mx = e.clientX - rect2.left;
        const my = e.clientY - rect2.top;
        const wx = (mx - this.offsetX) / this.scale;
        const wy = (my - this.offsetY) / this.scale;
        this._wallDrawer.handleMouseMove(e, wx / this.gridSize, wy / this.gridSize);
      }

      // Switch drag
      if (this._isDraggingSwitch && this._draggedSwitch) {
        const sRect = this.canvas.getBoundingClientRect();
        const smx = e.clientX - sRect.left;
        const smy = e.clientY - sRect.top;
        const swx = (smx - this.offsetX) / this.scale;
        const swy = (smy - this.offsetY) / this.scale;
        const snappedSwitch = this.snapElementsCellToGrid(
          (swx - this._dragSwitchOffset.x) / this.gridSize,
          (swy - this._dragSwitchOffset.y) / this.gridSize,
        );
        this._draggedSwitch.x = snappedSwitch.x;
        this._draggedSwitch.y = snappedSwitch.y;
        this.requestDraw?.();
        return;
      }

      // Light drag
      if (this._isDraggingLight && this._draggedLight) {
        const lRect = this.canvas.getBoundingClientRect();
        const lmx = e.clientX - lRect.left;
        const lmy = e.clientY - lRect.top;
        const lwx = (lmx - this.offsetX) / this.scale;
        const lwy = (lmy - this.offsetY) / this.scale;
        const snappedLight = this.snapElementsCellToGrid(
          (lwx - this._dragLightOffset.x) / this.gridSize,
          (lwy - this._dragLightOffset.y) / this.gridSize,
        );
        this._draggedLight.x = snappedLight.x;
        this._draggedLight.y = snappedLight.y;
        // Use granular invalidation for single light when available
        if (typeof this.invalidateLightingForLight === "function" && this._draggedLight.id) {
          this.invalidateLightingForLight(this._draggedLight.id);
        } else if (typeof this.invalidateLighting === "function") {
          this.invalidateLighting();
        }
        this.requestDraw?.();
        return;
      }

      if (this.isPanning) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.offsetX += dx;
        this.offsetY += dy;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.dispatchTransformEvent();
        this.requestDraw?.();
      } else if (this.measureToolActive && this.measureStart && !this.measureEnd) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        this.measurePreview = {
          x: worldX / this.gridSize,
          y: worldY / this.gridSize,
        };
        this.requestDraw?.();
      } else if (this.isDraggingToken && this.draggedToken) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;

        const rawGridX = (worldX - this.dragTokenOffset.x) / this.gridSize;
        const rawGridY = (worldY - this.dragTokenOffset.y) / this.gridSize;

        var nextX = rawGridX;
        var nextY = rawGridY;

        const liveToken = (this.tokens || []).find(
          (token) => token.id === this.draggedToken.id,
        );
        var curToken = liveToken || this.draggedToken;
        var prevX = curToken.x;
        var prevY = curToken.y;

        // Determine if dragged token is a PC (affects wall collision + fog)
        var dragInst = null;
        var dragIsPC = false;
        if (curToken.instanceId) {
          for (var ii = 0; ii < (this.instances || []).length; ii++) {
            if (this.instances[ii].id === curToken.instanceId) { dragInst = this.instances[ii]; break; }
          }
          dragIsPC = !!(dragInst && dragInst.isPC);
        }

        // Wall collision: only block PCs. NPCs move freely (narrator controls them).
        if (dragIsPC && this.walls && this.walls.length && typeof window.WallDrawer?.checkMovementCollision === "function") {
          if (nextX !== prevX || nextY !== prevY) {
            var collision = window.WallDrawer.checkMovementCollision(
              prevX, prevY, nextX, nextY, this.walls, curToken.size || 1,
            );
            if (collision.blocked) {
              nextX = collision.lastX;
              nextY = collision.lastY;
              // Keep drag alive after impact so the player can slide or pull back
              // without having to release and grab the token again.
              this.dragTokenOffset = {
                x: worldX - nextX * this.gridSize,
                y: worldY - nextY * this.gridSize,
              };
            }
          }
        }

        if (liveToken) {
          liveToken.x = nextX;
          liveToken.y = nextY;
          this.draggedToken = liveToken;
        } else {
          this.draggedToken.x = nextX;
          this.draggedToken.y = nextY;
        }
        // Fog: update during drag for PCs so walls occlude vision.
        // Throttle to every 50ms during drag for smoother movement (~20 FPS).
        if (
          dragIsPC &&
          typeof this.isFogPlayerViewActive === "function" &&
          this.isFogPlayerViewActive()
        ) {
          var now = performance.now();
          var DRAG_FOG_THROTTLE = 50; // ms between fog updates during drag
          if (!this._lastDragFogUpdate || (now - this._lastDragFogUpdate) >= DRAG_FOG_THROTTLE) {
            this._lastDragFogUpdate = now;
            if (typeof this.invalidateFogForToken === "function" && curToken.instanceId) {
              this.invalidateFogForToken(curToken.instanceId);
            } else if (typeof this.invalidateFog === "function") {
              this.invalidateFog();
            }
          }
        }
        // Broadcast drag position to other clients in real-time
        if (typeof this.onTokenDrag === "function") {
          this.onTokenDrag(curToken.id, curToken.x, curToken.y);
        }
        this.requestDraw?.();
      } else if (this.isDraggingMapEffect && this.draggedMapEffect) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const nextX = (worldX - this.dragMapEffectOffset.x) / this.gridSize;
        const nextY = (worldY - this.dragMapEffectOffset.y) / this.gridSize;
        const liveEffect = (this.mapEffects || []).find(
          (effect) => effect.id === this.draggedMapEffect.id,
        );
        if (liveEffect) {
          liveEffect.x = nextX;
          liveEffect.y = nextY;
          this.draggedMapEffect = liveEffect;
        } else {
          this.draggedMapEffect.x = nextX;
          this.draggedMapEffect.y = nextY;
        }
        this.requestDraw?.();
      } else if (this.isDraggingProp && this._propGroupDragStart) {
        // Group drag — move all selected props
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const dx = (worldX - this._propGroupDragStart.worldX) / this.gridSize;
        const dy = (worldY - this._propGroupDragStart.worldY) / this.gridSize;
        const starts = this._propGroupDragStartPositions || [];
        for (const start of starts) {
          const prop = (this.props || []).find((p) => p.id === start.id);
          if (prop) {
            prop.x = start.x + dx;
            prop.y = start.y + dy;
          }
        }
        this.invalidatePropCache();
        this.requestDraw?.();
      } else if (this.isRotatingProp && this._propGroupRotateCenter) {
        // Group rotate — rigid rotation around group center
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const cx = this._propGroupRotateCenter.x;
        const cy = this._propGroupRotateCenter.y;
        const rawAngle = Math.atan2(worldY - cy, worldX - cx);
        let deltaRad = rawAngle - this.rotatingPropStartAngle;
        let deltaDeg = (deltaRad * 180) / Math.PI;
        // Shift-snap to 45° increments
        if (e.shiftKey) {
          deltaDeg = Math.round(deltaDeg / 45) * 45;
          deltaRad = (deltaDeg * Math.PI) / 180;
        }
        // Store for rendering
        this._propRotateCurrentAngle = this.rotatingPropStartAngle + deltaRad;
        this._propRotateTotalDeg = deltaDeg;
        const starts = this._propGroupRotateStartPositions || [];
        for (const start of starts) {
          const prop = (this.props || []).find((p) => p.id === start.id);
          if (!prop) continue;
          const rotated = this.rotatePointAround(start.cx, start.cy, cx, cy, deltaRad);
          prop.x = (rotated.x / this.gridSize) - start.widthCells / 2;
          prop.y = (rotated.y / this.gridSize) - start.heightCells / 2;
          prop.rotationDeg = (start.rotationDeg + deltaDeg + 3600) % 360;
        }
        this.invalidatePropCache();
        this.requestDraw?.();
      } else if (this.isResizingProp && this._propGroupResizeStartBounds) {
        // Group scale from corner — uniform scale based on distance from anchor
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const sb = this._propGroupResizeStartBounds;
        const sbx = sb.x / this.gridSize;
        const sby = sb.y / this.gridSize;
        const sbw = sb.width / this.gridSize;
        const sbh = sb.height / this.gridSize;
        const px = worldX / this.gridSize;
        const py = worldY / this.gridSize;
        // Anchor is the opposite corner
        let anchorX, anchorY, origDragX, origDragY;
        const h = this.resizingPropHandle;
        if (h === "top-left")     { anchorX = sbx + sbw; anchorY = sby + sbh; origDragX = sbx;       origDragY = sby; }
        else if (h === "top-right")    { anchorX = sbx;       anchorY = sby + sbh; origDragX = sbx + sbw; origDragY = sby; }
        else if (h === "bottom-right") { anchorX = sbx;       anchorY = sby;       origDragX = sbx + sbw; origDragY = sby + sbh; }
        else if (h === "bottom-left")  { anchorX = sbx + sbw; anchorY = sby;       origDragX = sbx;       origDragY = sby + sbh; }
        else { anchorX = sbx; anchorY = sby; origDragX = sbx + sbw; origDragY = sby + sbh; }
        const origDist = Math.hypot(origDragX - anchorX, origDragY - anchorY) || 1;
        const curDist = Math.hypot(px - anchorX, py - anchorY);
        const scale = Math.max(0.1, curDist / origDist);
        const starts = this._propGroupResizeStartProps || [];
        for (const start of starts) {
          const prop = (this.props || []).find((p) => p.id === start.id);
          if (!prop) continue;
          prop.widthCells = Math.max(0.2, start.widthCells * scale);
          prop.heightCells = Math.max(0.2, start.heightCells * scale);
          prop.x = anchorX + (start.x - anchorX) * scale;
          prop.y = anchorY + (start.y - anchorY) * scale;
        }
        this.invalidatePropCache();
        this.requestDraw?.();
      } else if (this.isDraggingDesignToken && this.draggedDesignToken) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;

        const rawGridX = (worldX - this.dragDesignTokenOffset.x) / this.gridSize;
        const rawGridY = (worldY - this.dragDesignTokenOffset.y) / this.gridSize;

        const liveDesignToken = (this.designTokens || []).find(
          (token) => token.id === this.draggedDesignToken.id,
        );
        if (liveDesignToken) {
          liveDesignToken.x = rawGridX;
          liveDesignToken.y = rawGridY;
          this.draggedDesignToken = liveDesignToken;
        } else {
          this.draggedDesignToken.x = rawGridX;
          this.draggedDesignToken.y = rawGridY;
        }
        this.requestDraw?.();
      } else if (this.isRotatingDesignToken && this.rotatingDesignTokenId) {
        const token = (this.designTokens || []).find(
          (item) => item.id === this.rotatingDesignTokenId,
        );
        if (!token) return;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const center = this.getDesignTokenCenterPx(token);
        const currentAngle = Math.atan2(worldY - center.y, worldX - center.x);
        const deltaRad = currentAngle - this.rotatingDesignTokenStartAngle;
        token.rotationDeg =
          (this.rotatingDesignTokenStartDeg + (deltaRad * 180) / Math.PI + 3600) %
          360;
        this.requestDraw?.();
      } else if (this.isResizingDesignToken && this.resizingDesignTokenId) {
        const token = (this.designTokens || []).find(
          (item) => item.id === this.resizingDesignTokenId,
        );
        if (!token) return;
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        this.resizeDesignTokenFromHandle(
          token,
          this.resizingDesignTokenHandle,
          worldX,
          worldY,
        );
        this.requestDraw?.();
      } else if (this.isResizingBackground && this.resizingBackgroundHandle) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        this.resizeBackgroundFromHandle(
          this.resizingBackgroundHandle,
          worldX,
          worldY,
        );
        this.requestDraw?.();
      } else if (this.isDraggingBackground && this.backgroundDragStart) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const deltaCellsX =
          (worldX - this.backgroundDragStart.mouseWorldX) / this.gridSize;
        const deltaCellsY =
          (worldY - this.backgroundDragStart.mouseWorldY) / this.gridSize;
        this.mapLayer = {
          ...this.mapLayer,
          x: this.backgroundDragStart.mapX + deltaCellsX,
          y: this.backgroundDragStart.mapY + deltaCellsY,
        };
        this.requestDraw?.();
      }
    };

    proto.handleMouseUp = function handleMouseUp(e) {
      var wasPanning = !!this.isPanning;
      // Tile painter intercept
      if (this._tilePainter && this._tilePainter.isActive()) {
        this._tilePainter.handleMouseUp();
      }
      // Wall drawer mouseup (needed for rectangle/circle shape drag AND elements layer contextual editing)
      if (this._wallDrawer && (this._wallDrawer.isActive() || this._wallDrawer.isElementsLayerActive?.())) {
        var wRect = this.canvas.getBoundingClientRect();
        var wmx = (e?.clientX || 0) - wRect.left;
        var wmy = (e?.clientY || 0) - wRect.top;
        var wwx = (wmx - this.offsetX) / this.scale;
        var wwy = (wmy - this.offsetY) / this.scale;
        this._wallDrawer.handleMouseUp(e, wwx / this.gridSize, wwy / this.gridSize);
      }

      // Switch drag end
      if (this._isDraggingSwitch) {
        this._isDraggingSwitch = false;
        if (typeof this.onSwitchMove === "function" && this._draggedSwitch) {
          this.onSwitchMove(this._draggedSwitch);
        }
        this.requestDraw?.();
      }
      this._switchDragPending = false;
      this._draggedSwitch = null;
      this._dragSwitchStartPointer = null;

      // Light drag end
      if (this._isDraggingLight) {
        this._isDraggingLight = false;
        if (typeof this.onLightMove === "function" && this._draggedLight) {
          this.onLightMove(this._draggedLight);
        }
        this.requestDraw?.();
      }
      this._lightDragPending = false;
      this._draggedLight = null;
      this._dragLightStartPointer = null;

      this.isPanning = false;
      if (wasPanning) {
        this.requestDraw?.();
      }
      if (this.isDraggingToken) {
        this.isDraggingToken = false;
        this._lastDragFogUpdate = 0;
        // Only invalidate fog if dragged token is a PC
        if (this.draggedToken && typeof this.invalidateFog === "function") {
          var upInst = null;
          for (var ui = 0; ui < (this.instances || []).length; ui++) {
            if (this.instances[ui].id === this.draggedToken.instanceId) { upInst = this.instances[ui]; break; }
          }
          if (
            upInst &&
            upInst.isPC &&
            typeof this.isFogPlayerViewActive === "function" &&
            this.isFogPlayerViewActive()
          ) {
            this.invalidateFog();
          }
        }
        if (this.onTokenMove && this.draggedToken) {
          const oldX = this.dragStartTokenPos ? this.dragStartTokenPos.x : null;
          const oldY = this.dragStartTokenPos ? this.dragStartTokenPos.y : null;
          const moved =
            oldX == null ||
            oldY == null ||
            this.draggedToken.x !== oldX ||
            this.draggedToken.y !== oldY;
          // Broadcast drag end so other clients stop the live override
          if (moved && typeof this.onTokenDragEnd === "function") {
            this.onTokenDragEnd(
              this.draggedToken.id,
              this.draggedToken.x,
              this.draggedToken.y,
            );
          }
          if (moved) {
            if (typeof this.markLocalTokenMove === "function") {
              this.markLocalTokenMove(
                this.draggedToken.id,
                this.draggedToken.x,
                this.draggedToken.y,
              );
            }
            this.onTokenMove(
              this.draggedToken.id,
              this.draggedToken.x,
              this.draggedToken.y,
              oldX,
              oldY,
            );
          }
        }
        this.draggedToken = null;
        this.dragStartTokenPos = null;
      }
      if (this.isDraggingMapEffect) {
        this.isDraggingMapEffect = false;
        if (this.onMapEffectChange && this.draggedMapEffect) {
          const oldX = this.dragStartMapEffectPos ? this.dragStartMapEffectPos.x : null;
          const oldY = this.dragStartMapEffectPos ? this.dragStartMapEffectPos.y : null;
          const moved =
            oldX == null ||
            oldY == null ||
            Math.abs((this.draggedMapEffect.x || 0) - oldX) > 0.0001 ||
            Math.abs((this.draggedMapEffect.y || 0) - oldY) > 0.0001;
          if (moved) {
            this.onMapEffectChange(
              this.draggedMapEffect.id,
              { x: this.draggedMapEffect.x, y: this.draggedMapEffect.y },
              oldX,
              oldY,
            );
          }
        }
        this.draggedMapEffect = null;
        this.dragStartMapEffectPos = null;
      }
      if (this.isDraggingDesignToken) {
        this.isDraggingDesignToken = false;
        if (this.onDesignTokenMove && this.draggedDesignToken) {
          const oldX = this.dragStartDesignTokenPos
            ? this.dragStartDesignTokenPos.x
            : null;
          const oldY = this.dragStartDesignTokenPos
            ? this.dragStartDesignTokenPos.y
            : null;
          const moved =
            oldX == null ||
            oldY == null ||
            Math.abs(this.draggedDesignToken.x - oldX) > 0.0001 ||
            Math.abs(this.draggedDesignToken.y - oldY) > 0.0001;
          if (moved) {
            this.onDesignTokenMove(
              this.draggedDesignToken.id,
              this.draggedDesignToken.x,
              this.draggedDesignToken.y,
              oldX,
              oldY,
            );
          }
        }
        this.draggedDesignToken = null;
        this.dragStartDesignTokenPos = null;
      }
      if (this.isResizingDesignToken) {
        const token = (this.designTokens || []).find(
          (item) => item.id === this.resizingDesignTokenId,
        );
        this.isResizingDesignToken = false;
        this.resizingDesignTokenId = null;
        this.resizingDesignTokenHandle = null;
        if (token && this.onDesignTokenChange) {
          this.onDesignTokenChange(token.id, {
            x: token.x,
            y: token.y,
            widthCells: token.widthCells,
            heightCells: token.heightCells,
          });
        }
      }
      if (this.isRotatingDesignToken) {
        const token = (this.designTokens || []).find(
          (item) => item.id === this.rotatingDesignTokenId,
        );
        this.isRotatingDesignToken = false;
        this.rotatingDesignTokenId = null;
        this.rotatingDesignTokenStartAngle = null;
        this.rotatingDesignTokenStartDeg = null;
        if (token && this.onDesignTokenChange) {
          this.onDesignTokenChange(token.id, {
            rotationDeg: parseFloat(token.rotationDeg) || 0,
          });
        }
      }
      if (this.isDraggingProp) {
        this.isDraggingProp = false;
        const starts = this._propGroupDragStartPositions || [];
        let anyMoved = false;
        for (const start of starts) {
          const prop = (this.props || []).find((p) => p.id === start.id);
          if (!prop) continue;
          if (Math.abs(prop.x - start.x) > 0.0001 || Math.abs(prop.y - start.y) > 0.0001) {
            anyMoved = true;
            break;
          }
        }
        if (anyMoved && this.onPropChange) {
          // Notify with first selected prop to trigger save
          const first = this.getSelectedProps()[0];
          if (first) this.onPropChange(first.id, { x: first.x, y: first.y });
        }
        this._propGroupDragStart = null;
        this._propGroupDragStartPositions = null;
        this.invalidatePropCache();
      }
      if (this.isResizingProp) {
        this.isResizingProp = false;
        this.resizingPropHandle = null;
        if (this.onPropChange) {
          const first = this.getSelectedProps()[0];
          if (first) this.onPropChange(first.id, { x: first.x, y: first.y, widthCells: first.widthCells, heightCells: first.heightCells });
        }
        this._propGroupResizeStartBounds = null;
        this._propGroupResizeStartProps = null;
        this.invalidatePropCache();
      }
      if (this.isRotatingProp) {
        this.isRotatingProp = false;
        this.rotatingPropStartAngle = null;
        if (this.onPropChange) {
          const first = this.getSelectedProps()[0];
          if (first) this.onPropChange(first.id, { rotationDeg: first.rotationDeg });
        }
        this._propGroupRotateCenter = null;
        this._propGroupRotateStartPositions = null;
        this._propRotateRadius = null;
        this._propRotateCurrentAngle = null;
        this._propRotateTotalDeg = null;
        this.invalidatePropCache();
      }
      if (this.isResizingBackground) {
        this.isResizingBackground = false;
        const changedMap = this.mapLayer ? { ...this.mapLayer } : null;
        this.resizingBackgroundHandle = null;
        if (this.onBackgroundChange && changedMap) {
          this.onBackgroundChange(changedMap);
        }
      }
      if (this.isDraggingBackground) {
        this.isDraggingBackground = false;
        this.backgroundDragStart = null;
        const changedMap = this.mapLayer ? { ...this.mapLayer } : null;
        if (this.onBackgroundChange && changedMap) {
          this.onBackgroundChange(changedMap);
        }
      }
    };

    proto.handleDoubleClick = function handleDoubleClick(e) {
      if (e.button !== 0) return;

      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;
      const worldCellX = worldX / this.gridSize;
      const worldCellY = worldY / this.gridSize;

      // Decor layer: rotate handle on double-click
      if (this.activeLayer === "decor") {
        const rotateHandle = this.getDesignTokenRotateHandleAt(worldX, worldY);
        if (rotateHandle) {
          const token = (this.designTokens || []).find(
            (item) => item.id === rotateHandle.tokenId,
          );
          if (token) {
            const canEdit =
              typeof this.canDragDesignToken === "function"
                ? !!this.canDragDesignToken(token)
                : true;
            if (canEdit) {
              const current = ((parseFloat(token.rotationDeg) || 0) % 360 + 360) % 360;
              const next = (((Math.floor(current / 45) + 1) * 45) % 360 + 360) % 360;
              token.rotationDeg = next;
              this.draw();
              if (this.onDesignTokenChange) {
                this.onDesignTokenChange(token.id, { rotationDeg: next });
              }
              e.preventDefault();
              e.stopPropagation();
              return;
            }
          }
        }
      }

      // Ping on double-click empty space (skip on background layer)
      if (this.activeLayer === "background") return;
      var clickedToken = this.getTokenAt(worldX, worldY);
      var clickedDecor = this.getDesignTokenAt(worldX, worldY);
      var clickedMapEffect =
        typeof this.getMapEffectAt === "function"
          ? this.getMapEffectAt(worldX, worldY)
          : null;
      var clickedMarker =
        typeof this.getMarkerAt === "function"
          ? this.getMarkerAt(worldCellX, worldCellY, mouseX, mouseY)
          : null;
      if (!clickedToken && !clickedDecor && !clickedMapEffect && !clickedMarker && this.onPing) {
        this.onPing({
          cellX: worldCellX,
          cellY: worldCellY,
          clientX: e.clientX,
          clientY: e.clientY,
        });
        e.preventDefault();
        e.stopPropagation();
      }
    };
  }

  global.__applyTacticalMapInteractions = applyInteractionMethods;
  if (global.TacticalMap) {
    applyInteractionMethods(global.TacticalMap);
  }
})(window);
