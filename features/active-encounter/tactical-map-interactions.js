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
        this.isPanning = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
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

      // Tile painter intercept
      if (this._tilePainter && this._tilePainter.isActive()) {
        if (this._tilePainter.handleMouseDown(e, worldCellX, worldCellY)) {
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
          this.isPanning = true;
          this.dragStart = { x: e.clientX, y: e.clientY };
          return;
        }
      }

      if (layer === "background") {
        const bgHandle = this.getBackgroundHandleAt(worldX, worldY);

        if (e.button === 0 && bgHandle) {
          const canEdit =
            typeof this.canEditBackground === "function"
              ? !!this.canEditBackground()
              : true;
          if (canEdit) {
            this.isResizingBackground = true;
            this.resizingBackgroundHandle = bgHandle.id;
            return;
          }
        }

        if (e.button === 2) {
          e.preventDefault();
          this.isPanning = true;
          this.dragStart = { x: e.clientX, y: e.clientY };
        } else if (e.button === 0) {
          const clickedBackground = this.isPointInsideBackground(worldX, worldY);
          const canEdit =
            typeof this.canEditBackground === "function"
              ? !!this.canEditBackground()
              : true;
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
            this.isPanning = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
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
              this.isPanning = true;
              this.dragStart = { x: e.clientX, y: e.clientY };
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
            this.isPanning = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
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
            this.isPanning = true;
            this.dragStart = { x: e.clientX, y: e.clientY };
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
          this.isPanning = true;
          this.dragStart = { x: e.clientX, y: e.clientY };

          if (this.onTokenSelect) this.onTokenSelect(null);
          if (this.onTokenContext) this.onTokenContext(null);
        }
      }
    };

    proto.handleMouseMove = function handleMouseMove(e) {
      // Tile painter intercept
      if (this._tilePainter && this._tilePainter.isActive()) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;
        const cellX = worldX / this.gridSize;
        const cellY = worldY / this.gridSize;
        if (this._tilePainter.handleMouseMove(cellX, cellY)) return;
      }

      if (this.isPanning) {
        const dx = e.clientX - this.dragStart.x;
        const dy = e.clientY - this.dragStart.y;
        this.offsetX += dx;
        this.offsetY += dy;
        this.dragStart = { x: e.clientX, y: e.clientY };
        this.draw();
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
        this.draw();
      } else if (this.isDraggingToken && this.draggedToken) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        const worldX = (mouseX - this.offsetX) / this.scale;
        const worldY = (mouseY - this.offsetY) / this.scale;

        const rawGridX = (worldX - this.dragTokenOffset.x) / this.gridSize;
        const rawGridY = (worldY - this.dragTokenOffset.y) / this.gridSize;

        const nextX = this.freeMovement ? rawGridX : Math.round(rawGridX);
        const nextY = this.freeMovement ? rawGridY : Math.round(rawGridY);
        const liveToken = (this.tokens || []).find(
          (token) => token.id === this.draggedToken.id,
        );
        if (liveToken) {
          liveToken.x = nextX;
          liveToken.y = nextY;
          this.draggedToken = liveToken;
        } else {
          this.draggedToken.x = nextX;
          this.draggedToken.y = nextY;
        }
        this.draw();
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
        this.draw();
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
        this.draw();
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
        this.draw();
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
        this.draw();
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
        this.draw();
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
        this.draw();
      }
    };

    proto.handleMouseUp = function handleMouseUp() {
      // Tile painter intercept
      if (this._tilePainter && this._tilePainter.isActive()) {
        this._tilePainter.handleMouseUp();
      }

      this.isPanning = false;
      if (this.isDraggingToken) {
        this.isDraggingToken = false;
        if (this.onTokenMove && this.draggedToken) {
          const oldX = this.dragStartTokenPos ? this.dragStartTokenPos.x : null;
          const oldY = this.dragStartTokenPos ? this.dragStartTokenPos.y : null;
          const moved =
            oldX == null ||
            oldY == null ||
            this.draggedToken.x !== oldX ||
            this.draggedToken.y !== oldY;
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

      // Any layer: ping on double-click empty space
      var clickedToken = this.getTokenAt(worldX, worldY);
      var clickedDecor = this.getDesignTokenAt(worldX, worldY);
      if (!clickedToken && !clickedDecor && this.onPing) {
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
