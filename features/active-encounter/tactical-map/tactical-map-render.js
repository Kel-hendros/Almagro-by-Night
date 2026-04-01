(function initTacticalMapRenderModule(global) {
  function applyRenderMethods(TacticalMap) {
    if (!TacticalMap || TacticalMap.__renderMethodsApplied) return;
    TacticalMap.__renderMethodsApplied = true;
    const proto = TacticalMap.prototype;

    proto.getHoverFocusType = function getHoverFocusType() {
      return this.hoverFocus?.type || null;
    };

    proto.isBackgroundHoverFocused = function isBackgroundHoverFocused() {
      return this.getHoverFocusType() === "background";
    };

    proto.isTokenHoverFocused = function isTokenHoverFocused(token) {
      const hover = this.hoverFocus;
      if (!hover || hover.type !== "entity" || !token) return false;
      if (hover.tokenId && hover.tokenId === token.id) return true;
      if (hover.instanceId && hover.instanceId === token.instanceId) return true;
      return false;
    };

    proto.isDesignTokenHoverFocused = function isDesignTokenHoverFocused(token) {
      const hover = this.hoverFocus;
      if (!hover || hover.type !== "decor" || !token) return false;
      return hover.tokenId === token.id;
    };

    /**
     * Draw hover halo for the focused token ABOVE the fog/lighting overlay.
     * Called after drawFogOfWar in the pipeline so it's never dimmed.
     */
    proto.drawTokenHoverOverlay = function drawTokenHoverOverlay(timestamp) {
      if (this.isPerformanceConstrained?.()) return;
      if (!this.hoverFocus || this.hoverFocus.type !== "entity") return;
      var hover = this.hoverFocus;
      var token = null;
      for (var i = 0; i < this.tokens.length; i++) {
        var t = this.tokens[i];
        if ((hover.tokenId && t.id === hover.tokenId) ||
            (hover.instanceId && t.instanceId === hover.instanceId)) {
          token = t;
          break;
        }
      }
      if (!token) return;

      // If fog hides this token (opacity ~0), don't show hover either
      if (this._tokenFogOpacity && this._tokenFogOpacity[token.id] != null
          && this._tokenFogOpacity[token.id] < 0.01) return;

      var pos = this.getTokenRenderPosition(token, timestamp);
      var size = (token.size || 1) * this.gridSize;
      var radius = size * 0.4;
      var cx = pos.x * this.gridSize + size / 2;
      var cy = pos.y * this.gridSize + size / 2;
      this.drawHoverHalo(cx, cy, radius + 2);
    };

    proto.drawHoverHalo = function drawHoverHalo(cx, cy, radius) {
      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.closePath();
      this.ctx.strokeStyle = "rgba(98, 239, 148, 0.95)";
      this.ctx.lineWidth = Math.max(2.5 / this.scale, 2);
      this.ctx.shadowColor = "rgba(98, 239, 148, 0.75)";
      this.ctx.shadowBlur = Math.max(14 / this.scale, 8);
      this.ctx.stroke();
      this.ctx.restore();
    };

    proto.drawHoverRectHalo = function drawHoverRectHalo(x, y, width, height) {
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(98, 239, 148, 0.95)";
      this.ctx.lineWidth = Math.max(2.5 / this.scale, 2);
      this.ctx.shadowColor = "rgba(98, 239, 148, 0.75)";
      this.ctx.shadowBlur = Math.max(14 / this.scale, 8);
      this.ctx.strokeRect(x, y, width, height);
      this.ctx.restore();
    };

    proto.drawStatusBadge = function drawStatusBadge(
      cx,
      cy,
      radius,
      svgImg,
      options = {},
    ) {
      const badgeRadius = Math.max(7 / this.scale, radius * 0.3);
      const extraOffset = options?.extraOffset || 0;
      const slotIndex = Number(options?.slotIndex) || 0;
      const slotCount = Math.max(1, Number(options?.slotCount) || 1);
      const baseOffset = radius * 1.55 + extraOffset;
      const centeredSlot = slotIndex - (slotCount - 1) / 2;
      const baseAngle = (3 * Math.PI) / 4; // Bottom-left anchor.
      const angleStep = Math.min(
        0.58,
        (badgeRadius * 2.35) / Math.max(baseOffset, 1),
      );
      const angle = baseAngle + centeredSlot * angleStep;
      const badgeX = cx + Math.cos(angle) * baseOffset;
      const badgeY = cy + Math.sin(angle) * baseOffset;

      this.ctx.save();
      this.ctx.beginPath();
      this.ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
      this.ctx.closePath();
      this.ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
      this.ctx.fill();
      if (svgImg && svgImg.complete && svgImg.naturalWidth > 0) {
        const size = badgeRadius * 1.68;
        this.ctx.save();
        this.ctx.beginPath();
        this.ctx.arc(
          badgeX,
          badgeY,
          badgeRadius - Math.max(0.7 / this.scale, 0.4),
          0,
          Math.PI * 2,
        );
        this.ctx.closePath();
        this.ctx.clip();
        this.ctx.drawImage(svgImg, badgeX - size / 2, badgeY - size / 2, size, size);
        this.ctx.restore();
      }
      this.ctx.restore();
    };

    proto.getSatellitePopOffset = function getSatellitePopOffset(
      tokenId,
      now,
      radius,
    ) {
      const anim = this.satellitePopAnim;
      if (!anim || anim.tokenId !== tokenId) return 0;
      const elapsed = now - anim.startAt;
      if (elapsed <= 0) return 0;
      if (elapsed >= anim.duration) {
        this.satellitePopAnim = null;
        return 0;
      }
      const t = elapsed / anim.duration;
      const factor = Math.sin(Math.PI * t);
      return radius * 0.34 * Math.max(0, factor);
    };

    proto.drawMapEffects = function drawMapEffects(timestamp) {
      const now = typeof timestamp === "number" ? timestamp : performance.now();
      const effects = Array.isArray(this.mapEffects) ? this.mapEffects : [];
      if (!effects.length) return;
      const perfMode = !!this.isPerformanceConstrained?.();
      if (!perfMode) {
        this.scheduleCosmeticAnimationFrame?.(80, now);
      }

      effects.forEach((effect) => {
        if (!effect || (effect.type !== "silence_sphere" && effect.type !== "night_shroud")) return;
        const sourceToken =
          this.getTokenById?.(effect.sourceTokenId) ||
          this.getTokenByInstanceId?.(effect.sourceInstanceId);
        const center =
          typeof this.getMapEffectCenter === "function"
            ? this.getMapEffectCenter(effect, now)
            : null;
        if (!center && !sourceToken) return;
        const t = now / 1000;
        const breath = 0.5 + 0.5 * Math.sin(t * 1.65);
        const shimmer = 0.5 + 0.5 * Math.sin(t * 2.35 + 0.9);

        const cx = ((center?.x ?? 0) * this.gridSize);
        const cy = ((center?.y ?? 0) * this.gridSize);
        const radiusCells = Math.max(0, parseFloat(effect.radiusCells) || 0);
        if (radiusCells <= 0) return;
        const radiusPx = radiusCells * this.gridSize;

        if (perfMode) {
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
          this.ctx.closePath();
          this.ctx.fillStyle =
            effect.type === "night_shroud"
              ? "rgba(8, 10, 16, 0.72)"
              : "rgba(120, 156, 214, 0.14)";
          this.ctx.fill();
          this.ctx.strokeStyle =
            effect.type === "night_shroud"
              ? "rgba(28, 30, 48, 0.72)"
              : "rgba(198, 222, 255, 0.56)";
          this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
          this.ctx.stroke();
          if (this.selectedMapEffectId === effect.id) {
            this.ctx.strokeStyle = "rgba(255, 172, 68, 0.92)";
            this.ctx.lineWidth = Math.max(2.2 / this.scale, 1.2);
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, radiusPx * 1.03, 0, Math.PI * 2);
            this.ctx.stroke();
          }
          this.ctx.restore();
          return;
        }

        if (effect.type === "night_shroud") {
          this.ctx.save();
          const swell = 1 + Math.sin(t * 1.3 + (effect.createdAt || 0) * 0.0007) * 0.03;
          const baseRadius = radiusPx * swell;

          const outer = this.ctx.createRadialGradient(
            cx,
            cy,
            baseRadius * 0.2,
            cx,
            cy,
            baseRadius * 1.08,
          );
          outer.addColorStop(0, "rgba(6, 7, 12, 0.78)");
          outer.addColorStop(0.65, "rgba(7, 8, 15, 0.74)");
          outer.addColorStop(1, "rgba(4, 5, 10, 0.24)");
          this.ctx.fillStyle = outer;
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, baseRadius, 0, Math.PI * 2);
          this.ctx.closePath();
          this.ctx.fill();

          this.ctx.strokeStyle = `rgba(28, 30, 48, ${0.52 + breath * 0.16})`;
          this.ctx.lineWidth = Math.max(2.2 / this.scale, 1.3);
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, baseRadius * 0.98, 0, Math.PI * 2);
          this.ctx.stroke();

          this.ctx.globalCompositeOperation = "lighter";
          this.ctx.strokeStyle = `rgba(138, 96, 182, ${0.2 + shimmer * 0.1})`;
          this.ctx.lineWidth = Math.max(1.4 / this.scale, 0.9);
          this.ctx.setLineDash([
            Math.max(14 / this.scale, 7),
            Math.max(10 / this.scale, 5),
          ]);
          this.ctx.lineDashOffset = -(t * 30);
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, baseRadius * 0.82, 0, Math.PI * 2);
          this.ctx.stroke();
          if (this.selectedMapEffectId === effect.id) {
            this.ctx.setLineDash([]);
            this.ctx.globalCompositeOperation = "source-over";
            this.ctx.strokeStyle = "rgba(255, 172, 68, 0.92)";
            this.ctx.lineWidth = Math.max(2.6 / this.scale, 1.4);
            this.ctx.beginPath();
            this.ctx.arc(cx, cy, baseRadius * 1.04, 0, Math.PI * 2);
            this.ctx.stroke();
          }
          this.ctx.restore();
          return;
        }

        this.ctx.save();
        // 1) Subtle glass dome fill.
        const domeGradient = this.ctx.createRadialGradient(
          cx - radiusPx * 0.2,
          cy - radiusPx * 0.24,
          radiusPx * 0.12,
          cx,
          cy,
          radiusPx,
        );
        domeGradient.addColorStop(0, `rgba(214, 232, 255, ${0.06 + shimmer * 0.04})`);
        domeGradient.addColorStop(0.55, `rgba(128, 164, 220, ${0.09 + breath * 0.05})`);
        domeGradient.addColorStop(1, `rgba(78, 112, 172, ${0.16 + breath * 0.07})`);
        this.ctx.globalAlpha = 1;
        this.ctx.fillStyle = domeGradient;
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.fill();

        // 2) Refractive outer ring.
        this.ctx.strokeStyle = `rgba(198, 222, 255, ${0.66 + breath * 0.16})`;
        this.ctx.lineWidth = Math.max(2.5 / this.scale, 1.35);
        this.ctx.setLineDash([]);
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radiusPx, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.stroke();

        // Inner faint ring for crystal depth.
        this.ctx.save();
        this.ctx.filter = `blur(${Math.max(1.2 / this.scale, 0.8)}px)`;
        this.ctx.strokeStyle = `rgba(160, 190, 245, ${0.26 + breath * 0.1})`;
        this.ctx.lineWidth = Math.max(1.25 / this.scale, 0.8);
        this.ctx.beginPath();
        this.ctx.arc(cx, cy, radiusPx * 0.965, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.stroke();
        this.ctx.restore();

        // 3) Gentle interior pressure waves.
        const waveBase = radiusPx * (0.42 + breath * 0.03);
        for (let i = 0; i < 2; i++) {
          const wavePhase = t * (0.95 + i * 0.18) + i * 1.2;
          const waveRadius = waveBase + radiusPx * 0.16 * i + Math.sin(wavePhase) * radiusPx * 0.02;
          this.ctx.strokeStyle = `rgba(176, 206, 255, ${0.1 + (1 - i) * 0.05})`;
          this.ctx.lineWidth = Math.max(1.1 / this.scale, 0.7);
          this.ctx.beginPath();
          this.ctx.arc(cx, cy, waveRadius, 0, Math.PI * 2);
          this.ctx.stroke();
        }

        this.ctx.restore();
      });
    };

    proto.drawTileMap = function drawTileMap() {
      const tileMap = this.tileMap;
      if (!tileMap || typeof tileMap !== "object") return;
      const cache =
        typeof this.ensureTileRenderCache === "function"
          ? this.ensureTileRenderCache()
          : null;
      if (!cache || !cache.chunks || cache.chunks.size === 0) return;

      const gs = this.gridSize;
      const viewportWidth = this.canvas.width / this.scale;
      const viewportHeight = this.canvas.height / this.scale;
      const startX = -this.offsetX / this.scale;
      const startY = -this.offsetY / this.scale;
      const minCellX = Math.floor(startX / gs) - 1;
      const maxCellX = Math.ceil((startX + viewportWidth) / gs) + 1;
      const minCellY = Math.floor(startY / gs) - 1;
      const maxCellY = Math.ceil((startY + viewportHeight) / gs) + 1;

      const TT = global.TileTextures;
      if (!TT) return;
      const chunkSize = cache.chunkSize || 8;
      const minChunkX = Math.floor(minCellX / chunkSize);
      const maxChunkX = Math.floor(maxCellX / chunkSize);
      const minChunkY = Math.floor(minCellY / chunkSize);
      const maxChunkY = Math.floor(maxCellY / chunkSize);

      this.ctx.save();
      for (let chunkX = minChunkX; chunkX <= maxChunkX; chunkX++) {
        for (let chunkY = minChunkY; chunkY <= maxChunkY; chunkY++) {
          const chunk = cache.chunks.get(chunkX + "," + chunkY);
          if (!chunk || chunk.length === 0) continue;
          for (let i = 0; i < chunk.length; i++) {
            const entry = chunk[i];
            const cx = entry.cx;
            const cy = entry.cy;
            if (cx < minCellX || cx > maxCellX || cy < minCellY || cy > maxCellY) continue;
            const pattern = TT.getOrCreatePattern(this.ctx, entry.textureId);
            if (!pattern) continue;
            // Align pattern origin to cell so every cell looks identical
            if (typeof pattern.setTransform === "function") {
              pattern.setTransform(new DOMMatrix().translateSelf(cx * gs, cy * gs));
            }
            this.ctx.fillStyle = pattern;
            // Overlap by 0.5px to eliminate grid-line gaps between tiles
            this.ctx.fillRect(cx * gs - 0.5, cy * gs - 0.5, gs + 1, gs + 1);
          }
        }
      }
      this.ctx.restore();
    };

    proto.drawTilePainterHover = function drawTilePainterHover() {
      const hover = this._tilePainterHover;
      if (!hover) return;
      const gs = this.gridSize;
      const half = Math.floor(hover.brushSize / 2);
      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 255, 255, 0.7)";
      this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
      this.ctx.setLineDash([Math.max(4 / this.scale, 2), Math.max(3 / this.scale, 2)]);
      for (let dy = 0; dy < hover.brushSize; dy++) {
        for (let dx = 0; dx < hover.brushSize; dx++) {
          const cx = (hover.cellX - half + dx) * gs;
          const cy = (hover.cellY - half + dy) * gs;
          this.ctx.strokeRect(cx, cy, gs, gs);
        }
      }
      this.ctx.setLineDash([]);
      this.ctx.restore();
    };

    proto.drawBackground = function drawBackground() {
      if (!this.mapLayer || !this.backgroundImage) return;
      if (!this.backgroundImage.complete || this.backgroundImage.naturalWidth <= 0)
        return;

      const bg = this.mapLayer || {};
      const gridX = parseFloat(bg.x) || 0;
      const gridY = parseFloat(bg.y) || 0;
      const widthCells = Math.max(1, parseFloat(bg.widthCells) || 20);
      let heightCells = Math.max(1, parseFloat(bg.heightCells) || 20);
      const opacity = Math.min(1, Math.max(0, parseFloat(bg.opacity) || 1));
      const preserveAspect = bg.preserveAspect !== false;

      const px = gridX * this.gridSize;
      const py = gridY * this.gridSize;
      const pw = widthCells * this.gridSize;
      if (preserveAspect) {
        const aspect =
          this.backgroundImage.naturalWidth / this.backgroundImage.naturalHeight;
        if (Number.isFinite(aspect) && aspect > 0) {
          heightCells = widthCells / aspect;
        }
      }
      const ph = heightCells * this.gridSize;

      const hoverType = this.getHoverFocusType();
      const isFocused = hoverType === "background";
      const isDimmed = !!hoverType && !isFocused;

      this.ctx.save();
      this.ctx.globalAlpha = opacity * (isDimmed ? 0.2 : 1);
      this.ctx.drawImage(this.backgroundImage, px, py, pw, ph);
      this.ctx.restore();

      if (isFocused) {
        this.ctx.save();
        this.ctx.strokeStyle = "rgba(98, 239, 148, 0.95)";
        this.ctx.lineWidth = Math.max(2.5 / this.scale, 2);
        this.ctx.shadowColor = "rgba(98, 239, 148, 0.8)";
        this.ctx.shadowBlur = Math.max(16 / this.scale, 10);
        this.ctx.strokeRect(px, py, pw, ph);
        this.ctx.restore();
      }

      if (this.activeLayer === "background" && this.selectedBackground) {
        this.drawBackgroundControls(px, py, pw, ph);
      }
    };

    proto.drawBackgroundControls = function drawBackgroundControls(px, py, pw, ph) {
      const handleRadius = Math.max(6 / this.scale, 0.12 * this.gridSize);
      const points = [
        { id: "left", x: px, y: py + ph / 2 },
        { id: "right", x: px + pw, y: py + ph / 2 },
        { id: "top", x: px + pw / 2, y: py },
        { id: "bottom", x: px + pw / 2, y: py + ph },
      ];

      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 206, 117, 0.9)";
      this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
      this.ctx.strokeRect(px, py, pw, ph);

      points.forEach((pt) => {
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.fillStyle = "rgba(22, 22, 22, 0.95)";
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(255, 206, 117, 0.95)";
        this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
        this.ctx.stroke();
      });
      this.ctx.restore();
    };

    proto.drawDesignTokenControls = function drawDesignTokenControls(x, y, w, h) {
      const handleRadius = Math.max(6 / this.scale, 0.12 * this.gridSize);
      const points = [
        { id: "left", x, y: y + h / 2 },
        { id: "right", x: x + w, y: y + h / 2 },
        { id: "top", x: x + w / 2, y },
        { id: "bottom", x: x + w / 2, y: y + h },
      ];

      this.ctx.save();
      this.ctx.strokeStyle = "rgba(255, 206, 117, 0.9)";
      this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
      this.ctx.strokeRect(x, y, w, h);

      points.forEach((pt) => {
        this.ctx.beginPath();
        this.ctx.arc(pt.x, pt.y, handleRadius, 0, Math.PI * 2);
        this.ctx.closePath();
        this.ctx.fillStyle = "rgba(22, 22, 22, 0.95)";
        this.ctx.fill();
        this.ctx.strokeStyle = "rgba(255, 206, 117, 0.95)";
        this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
        this.ctx.stroke();
      });
      this.ctx.restore();
    };

    proto.drawGrid = function drawGrid() {
      const viewportWidth = this.canvas.width / this.scale;
      const viewportHeight = this.canvas.height / this.scale;
      const startX = -this.offsetX / this.scale;
      const startY = -this.offsetY / this.scale;

      const gridOpacity = Math.min(
        1,
        Math.max(0, parseFloat(this.mapLayer?.gridOpacity) || 0),
      );
      this.ctx.strokeStyle = `rgba(51, 51, 51, ${gridOpacity})`;
      this.ctx.lineWidth = 1;
      this.ctx.beginPath();

      const buffer = 100;
      const gridMinX =
        Math.floor((startX - buffer) / this.gridSize) * this.gridSize;
      const gridMaxX =
        Math.floor((startX + viewportWidth + buffer) / this.gridSize) *
        this.gridSize;
      const gridMinY =
        Math.floor((startY - buffer) / this.gridSize) * this.gridSize;
      const gridMaxY =
        Math.floor((startY + viewportHeight + buffer) / this.gridSize) *
        this.gridSize;

      for (let x = gridMinX; x <= gridMaxX; x += this.gridSize) {
        this.ctx.moveTo(x, gridMinY);
        this.ctx.lineTo(x, gridMaxY);
      }
      for (let y = gridMinY; y <= gridMaxY; y += this.gridSize) {
        this.ctx.moveTo(gridMinX, y);
        this.ctx.lineTo(gridMaxX, y);
      }
      this.ctx.stroke();
    };

    proto.drawMeasurement = function drawMeasurement(ctxOverride) {
      if (!this.measureToolActive || !this.measureStart) return;
      const ctx = ctxOverride || this.ctx;
      const start = this.measureStart;
      const end = this.measureEnd || this.measurePreview;
      if (!end) return;

      const sx = start.x * this.gridSize;
      const sy = start.y * this.gridSize;
      const ex = end.x * this.gridSize;
      const ey = end.y * this.gridSize;
      const dxCells = end.x - start.x;
      const dyCells = end.y - start.y;
      const meters = Math.hypot(dxCells, dyCells) * METERS_PER_UNIT;
      const midX = (sx + ex) / 2;
      const midY = (sy + ey) / 2;

      ctx.save();
      ctx.strokeStyle = "rgba(255, 221, 140, 0.95)";
      ctx.lineWidth = Math.max(2 / this.scale, 1.2);
      ctx.setLineDash([Math.max(10 / this.scale, 5), Math.max(6 / this.scale, 3)]);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.setLineDash([]);

      const pointRadius = Math.max(4 / this.scale, 2.4);
      ctx.fillStyle = "rgba(255, 221, 140, 0.95)";
      ctx.beginPath();
      ctx.arc(sx, sy, pointRadius, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(ex, ey, pointRadius, 0, Math.PI * 2);
      ctx.fill();

      const label = `${meters.toFixed(1)} m`;
      const fontSize = Math.max(12 / this.scale, 9);
      ctx.font = `700 ${fontSize}px Nunito Sans, sans-serif`;
      const textWidth = ctx.measureText(label).width;
      const padX = Math.max(7 / this.scale, 4);
      const padY = Math.max(4 / this.scale, 2.5);
      const boxW = textWidth + padX * 2;
      const boxH = fontSize + padY * 2;
      const boxX = midX - boxW / 2;
      const boxY = midY - boxH / 2;

      ctx.fillStyle = "rgba(14, 14, 14, 0.84)";
      ctx.strokeStyle = "rgba(255, 221, 140, 0.45)";
      ctx.lineWidth = Math.max(1 / this.scale, 0.7);
      ctx.beginPath();
      if (typeof ctx.roundRect === "function") {
        ctx.roundRect(boxX, boxY, boxW, boxH, Math.max(6 / this.scale, 3));
      } else {
        ctx.rect(boxX, boxY, boxW, boxH);
      }
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "rgba(255, 240, 196, 0.96)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, midX, midY);
      ctx.restore();
    };

    proto.drawDesignTokens = function drawDesignTokens(layerName = "underlay") {
      const tokensForLayer = this.designTokenLayers?.[layerName] || [];
      if (!Array.isArray(tokensForLayer) || tokensForLayer.length === 0) return;
      const perfMode = !!this.isPerformanceConstrained?.();
      const viewRect = this.getViewportWorldRect?.(this.gridSize * 3) || null;

      tokensForLayer.forEach((token) => {
        const rect = this.getDesignTokenRect(token);
        const x = rect.x;
        const y = rect.y;
        const width = rect.width;
        const height = rect.height;
        if (
          viewRect &&
          (x + width < viewRect.x ||
            y + height < viewRect.y ||
            x > viewRect.x + viewRect.width ||
            y > viewRect.y + viewRect.height)
        ) {
          return;
        }
        const cx = x + width / 2;
        const cy = y + height / 2;
        const rotation = this.getDesignTokenRotationRad(token);

        const hoverType = this.getHoverFocusType();
        const isFocused = this.isDesignTokenHoverFocused(token);
        const isDimmed = !!hoverType && !isFocused;

        this.ctx.save();
        if (!perfMode) {
          this.ctx.shadowColor = "rgba(0,0,0,0.45)";
          this.ctx.shadowBlur = 4;
          this.ctx.shadowOffsetX = 1;
          this.ctx.shadowOffsetY = 1;
        }

        const isNarratorHidden = token.visible === false;
        this.ctx.globalAlpha =
          Math.min(1, Math.max(0, parseFloat(token.opacity) || 1)) *
          (isDimmed ? 0.2 : isNarratorHidden ? 0.45 : 1);

        const hasImage =
          token.img && token.img.complete && token.img.naturalWidth > 0;
        this.ctx.translate(cx, cy);
        this.ctx.rotate(rotation);
        if (hasImage) {
          this.ctx.drawImage(token.img, -width / 2, -height / 2, width, height);
        } else {
          this.ctx.fillStyle = token.fill || "#666";
          this.ctx.fillRect(-width / 2, -height / 2, width, height);
        }

        if (this.selectedDesignTokenId === token.id) {
          this.ctx.strokeStyle = "#ff9800";
          this.ctx.lineWidth = Math.max(2 / this.scale, 1.5);
          this.ctx.strokeRect(-width / 2, -height / 2, width, height);
        }

        if (isNarratorHidden) {
          this.ctx.setLineDash([Math.max(6 / this.scale, 3), Math.max(4 / this.scale, 2)]);
          this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
          this.ctx.lineWidth = Math.max(2 / this.scale, 1.5);
          this.ctx.strokeRect(-width / 2, -height / 2, width, height);
          this.ctx.setLineDash([]);
        }

        this.ctx.restore();

        if (isFocused) {
          this.drawHoverRectHalo(x, y, width, height);
        }

        if (this.activeLayer === "decor" && this.selectedDesignTokenId === token.id) {
          this.drawDesignTokenControls(x, y, width, height);
          const rotateHandle = this.getDesignTokenRotateHandlePx(token);
          if (rotateHandle) {
            this.ctx.save();
            this.ctx.strokeStyle = "rgba(255, 206, 117, 0.95)";
            this.ctx.lineWidth = Math.max(1.2 / this.scale, 1);
            this.ctx.beginPath();
            this.ctx.moveTo(rotateHandle.anchorX, rotateHandle.anchorY);
            this.ctx.lineTo(rotateHandle.x, rotateHandle.y);
            this.ctx.stroke();
            this.ctx.beginPath();
            this.ctx.arc(
              rotateHandle.x,
              rotateHandle.y,
              Math.max(6 / this.scale, 4),
              0,
              Math.PI * 2,
            );
            this.ctx.closePath();
            this.ctx.fillStyle = "rgba(22, 22, 22, 0.95)";
            this.ctx.fill();
            this.ctx.strokeStyle = "rgba(98, 239, 148, 0.95)";
            this.ctx.lineWidth = Math.max(1.8 / this.scale, 1.2);
            this.ctx.stroke();
            this.ctx.restore();
          }
        }
      });
    };

    proto.getTokenRenderPosition = function getTokenRenderPosition(
      token,
      timestamp,
    ) {
      const now = typeof timestamp === "number" ? timestamp : performance.now();
      const st = this.tokenRenderState.get(token.id);
      if (!st) {
        return { x: token.x, y: token.y };
      }

      const isLocallyDraggingThis =
        this.isDraggingToken &&
        this.draggedToken &&
        this.draggedToken.id === token.id;

      if (isLocallyDraggingThis) {
        st.x = token.x;
        st.y = token.y;
        st.fromX = token.x;
        st.fromY = token.y;
        st.targetX = token.x;
        st.targetY = token.y;
        st.animating = false;
        return { x: token.x, y: token.y };
      }

      // Remote drag override — another client is dragging this token
      var rdp = this._remoteDragPositions && this._remoteDragPositions.get(token.id);
      if (rdp) {
        if (!rdp.active && rdp.expiresAt && rdp.expiresAt < Date.now()) {
          this._remoteDragPositions.delete(token.id);
        } else {
          st.x = rdp.x;
          st.y = rdp.y;
          st.fromX = rdp.x;
          st.fromY = rdp.y;
          st.animating = false;
          return { x: rdp.x, y: rdp.y };
        }
      }

      if (!st.animating) {
        st.x = st.targetX;
        st.y = st.targetY;
        return { x: st.x, y: st.y };
      }

      const elapsed = Math.max(0, now - st.startAt);
      const t = Math.min(1, elapsed / Math.max(1, st.duration));
      st.x = st.fromX + (st.targetX - st.fromX) * t;
      st.y = st.fromY + (st.targetY - st.fromY) * t;
      if (t >= 1) {
        st.animating = false;
        st.x = st.targetX;
        st.y = st.targetY;
      }
      return { x: st.x, y: st.y };
    };

    proto.drawTokens = function drawTokens(timestamp) {
      const now = typeof timestamp === "number" ? timestamp : performance.now();
      const perfMode = !!this.isPerformanceConstrained?.();
      const viewRect = this.getViewportWorldRect?.(this.gridSize * 3) || null;

      // In player/impersonate view with fog enabled, hide enemy tokens outside vision.
      // Viewer tokens (player's own) are ALWAYS visible — fog never hides them.
      var fog = this._fog;
      var fogHidesTokens = false;
      var fogPolygons = null;
      var viewerIdSet = null;
      if (fog && fog.config && fog.config.enabled) {
        var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
        if (isPlayerView && fog.polygons && fog.polygons.length > 0) {
          fogHidesTokens = true;
          fogPolygons = fog.polygons;
          // Use impersonateInstanceId when no explicit viewerInstanceIds
          if (fog.viewerInstanceIds) {
            viewerIdSet = new Set(fog.viewerInstanceIds);
          } else if (fog.impersonateInstanceId && fog.impersonateInstanceId !== 'all') {
            viewerIdSet = new Set([fog.impersonateInstanceId]);
          }
        }
      }

      // Cache fog-visibility per token — only recompute when fog changes,
      // not every frame. Saves O(tokens * polygon_vertices) per frame.
      if (!this._tokenFogTargetCache) this._tokenFogTargetCache = {};
      if (this._tokenFogCacheGeneration == null) this._tokenFogCacheGeneration = -1;
      var fogGen = fog ? (fog._cacheGen || 0) : 0;
      var fogCacheStale = fogGen !== this._tokenFogCacheGeneration;
      if (fogCacheStale) this._tokenFogCacheGeneration = fogGen;

      // Opacity tracking for smooth fade in/out
      if (!this._tokenFogOpacity) this._tokenFogOpacity = {};
      var FADE_SPEED = 0.18; // per frame (~11 frames = 180ms for full transition)

      // Darkness-based visibility
      var isNarratorView = fog && fog.isNarrator && !fog.impersonateInstanceId;
      var hasLighting = (this.lights && this.lights.length > 0) ||
        (this._ambientLight && this._ambientLight.intensity < 1);
      if (this._tokenLightingCacheGeneration == null) this._tokenLightingCacheGeneration = -1;
      var lightingGen = this._lighting ? (this._lighting.cacheGen || 0) : 0;
      var lightingCacheStale = lightingGen !== this._tokenLightingCacheGeneration;
      if (lightingCacheStale) this._tokenLightingCacheGeneration = lightingGen;

      // Viewer's own tokens are exempt from darkness hiding
      var darknessViewerSet = null;
      if (fog) {
        if (fog.impersonateInstanceId && fog.impersonateInstanceId !== 'all') {
          darknessViewerSet = new Set([fog.impersonateInstanceId]);
        } else if (fog.viewerInstanceIds) {
          darknessViewerSet = new Set(fog.viewerInstanceIds);
        }
      }

      // Pre-compute viewer token centers for proximity sensing.
      var viewerTokenCenters =
        typeof this.getViewerTokenCenters === "function" ? this.getViewerTokenCenters() : [];

      // Recompute token luminosity cache only when lighting changes.
      if (!this._tokenLuminosity) this._tokenLuminosity = new Map();
      if (hasLighting && lightingCacheStale && typeof this.computeLuminosityAt === 'function') {
        this._tokenLuminosity.clear();
        for (var ti = 0; ti < this.tokens.length; ti++) {
          var tk = this.tokens[ti];
          var tSz = tk.size || 1;
          var tkCX = (parseFloat(tk.x) || 0) + tSz * 0.5;
          var tkCY = (parseFloat(tk.y) || 0) + tSz * 0.5;
          this._tokenLuminosity.set(tk.id, { lum: this.computeLuminosityAt(tkCX, tkCY), cx: tkCX, cy: tkCY });
        }
      }

      this.tokens.forEach((token) => {
        // Effective position: use remote drag position if another client is dragging
        var effX = parseFloat(token.x) || 0;
        var effY = parseFloat(token.y) || 0;
        var rdp = this._remoteDragPositions && this._remoteDragPositions.get(token.id);
        if (rdp) { effX = rdp.x; effY = rdp.y; }

        var fogTarget = 1;
        if (fogHidesTokens && window.FogVisibility) {
          // Viewer tokens (player's own characters) are always visible
          var inst = this.getInstanceById?.(token.instanceId);
          var isViewerToken = viewerIdSet
            ? viewerIdSet.has(token.instanceId)
            : (inst && inst.isPC);
          if (!isViewerToken) {
            // Use cached result unless fog changed or token moved
            var cached = this._tokenFogTargetCache[token.id];
            if (!fogCacheStale && cached && cached.x === effX && cached.y === effY) {
              fogTarget = cached.target;
            } else {
              var tSize = token.size || 1;
              var tokenCX = effX + tSize * 0.5;
              var tokenCY = effY + tSize * 0.5;
              var inView = typeof this.isPointVisibleToFogViewer === "function"
                ? this.isPointVisibleToFogViewer(tokenCX, tokenCY)
                : false;
              fogTarget = inView ? 1 : 0;
              this._tokenFogTargetCache[token.id] = { target: fogTarget, x: effX, y: effY };
            }
          }
        }
        // Resolve darkness/observer-vision separately from fog.
        var darknessDim = 1;
        var lightVisible = true;
        if (hasLighting && this._tokenLuminosity) {
          var isMyToken = darknessViewerSet
            ? darknessViewerSet.has(token.instanceId)
            : false;
          if (!isMyToken) {
            var tSz2 = token.size || 1;
            var tCX2 = effX + tSz2 * 0.5;
            var tCY2 = effY + tSz2 * 0.5;
            var lumEntry = this._tokenLuminosity.get(token.id);
            var lum = (lumEntry && lumEntry.cx === tCX2 && lumEntry.cy === tCY2)
              ? lumEntry.lum
              : (typeof this.computeLuminosityAt === 'function' ? this.computeLuminosityAt(tCX2, tCY2) : 1);
            var canSeeByLight =
              typeof this.isPointVisibleByLight === "function"
                ? this.isPointVisibleByLight(tCX2, tCY2, {
                    rawLuminosity: lum,
                    allowProximity: true,
                    viewerTokenCenters: viewerTokenCenters,
                  })
                : lum >= 0.30;
            if (!canSeeByLight) {
              if (isNarratorView) {
                darknessDim = 0.35;
              } else {
                lightVisible = false;
              }
            }
          }
        }
        var visibilityTarget = fogTarget * (lightVisible ? 1 : 0);
        // Lerp opacity toward target
        var curOpacity = this._tokenFogOpacity[token.id] != null ? this._tokenFogOpacity[token.id] : visibilityTarget;
        if (curOpacity < visibilityTarget) curOpacity = Math.min(visibilityTarget, curOpacity + FADE_SPEED);
        else if (curOpacity > visibilityTarget) curOpacity = Math.max(visibilityTarget, curOpacity - FADE_SPEED);
        this._tokenFogOpacity[token.id] = curOpacity;
        if (Math.abs(curOpacity - visibilityTarget) > 0.01) this._drawDirty = true; // keep fading
        if (curOpacity < 0.01) return; // fully hidden
        const hoverType = this.getHoverFocusType();
        const isFocused = this.isTokenHoverFocused(token);
        const isDimmed = !!hoverType && !isFocused;
        const pos = this.getTokenRenderPosition(token, timestamp);
        const screenX = pos.x * this.gridSize;
        const screenY = pos.y * this.gridSize;
        const size = (token.size || 1) * this.gridSize;
        if (
          viewRect &&
          (screenX + size < viewRect.x ||
            screenY + size < viewRect.y ||
            screenX > viewRect.x + viewRect.width ||
            screenY > viewRect.y + viewRect.height)
        ) {
          return;
        }
        const radius = size * 0.4;
        const cx = screenX + size / 2;
        const cy = screenY + size / 2;
        const instance = this.getInstanceById?.(token.instanceId);
        const conditions =
          instance?.conditions && typeof instance.conditions === "object"
            ? instance.conditions
            : {};
        const isFlying = !!conditions.flying;
        if (isFlying && !perfMode) {
          this.scheduleCosmeticAnimationFrame?.(50, now);
        }
        const flightSeed = String(token.id || "")
          .split("")
          .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
        const flightPhase = ((flightSeed % 360) * Math.PI) / 180;
        const flightBob = isFlying
          ? (perfMode ? 0 : Math.sin(now / 420 + flightPhase)) *
            Math.max(1.4 / this.scale, radius * 0.09)
          : 0;
        const flightLift = isFlying
          ? Math.max(12 / this.scale, radius * 0.62) + flightBob
          : 0;
        const visualCx = cx;
        const visualCy = cy - flightLift;
        const isNarratorHidden = instance && instance.visible === false;
        const alpha = (isDimmed ? 0.2 : isNarratorHidden ? 0.45 : 1) * curOpacity * darknessDim;

        if (isFlying && !perfMode) {
          // Ground shadow stays on the real token position while the token body "floats".
          this.ctx.save();
          this.ctx.globalAlpha = alpha;
          this.ctx.fillStyle = "rgba(0,0,0,0.36)";
          this.ctx.beginPath();
          if (typeof this.ctx.ellipse === "function") {
            this.ctx.ellipse(
              cx,
              cy + radius * 0.58,
              radius * 0.82,
              radius * 0.34,
              0,
              0,
              Math.PI * 2,
            );
          } else {
            this.ctx.arc(cx, cy + radius * 0.58, radius * 0.62, 0, Math.PI * 2);
          }
          this.ctx.closePath();
          this.ctx.fill();
          this.ctx.restore();
        }

        // Outer save: holds the scale animation so ring, badges & satellites
        // all participate in the same transform.
        this.ctx.save();

        if (this.activeTokenAnim && this.activeTokenAnim.tokenId === token.id) {
          const elapsed = now - this.activeTokenAnim.startAt;
          if (elapsed < this.activeTokenAnim.duration) {
            const p = elapsed / this.activeTokenAnim.duration;

            let s = 1.0;
            if (p < 0.2) {
              const t = p / 0.2;
              s = 1.0 + (0.6 - 1.0) * t;
            } else if (p < 0.4) {
              const t = (p - 0.2) / 0.2;
              s = 0.6 + (1.0 - 0.6) * t;
            } else if (p < 0.6) {
              const t = (p - 0.4) / 0.2;
              s = 1.0 + (1.5 - 1.0) * t;
            } else if (p < 0.8) {
              const t = (p - 0.6) / 0.2;
              s = 1.5 + (0.8 - 1.5) * t;
            } else {
              const t = (p - 0.8) / 0.2;
              s = 0.8 + (1.0 - 0.8) * t;
            }

            this.ctx.translate(visualCx, visualCy);
            this.ctx.scale(s, s);
            this.ctx.translate(-visualCx, -visualCy);
          } else {
            this.activeTokenAnim = null;
          }
        }

        // Inner save: holds the clip region for the token face (fill + image).
        this.ctx.save();

        if (!perfMode) {
          this.ctx.shadowColor = isFlying ? "rgba(0,0,0,0.34)" : "rgba(0,0,0,0.5)";
          this.ctx.shadowBlur = isFlying ? 3 : 4;
          this.ctx.shadowOffsetX = isFlying ? 1 : 2;
          this.ctx.shadowOffsetY = isFlying ? 1 : 2;
        }

        this.ctx.globalAlpha = alpha;
        this.ctx.beginPath();
        this.ctx.arc(visualCx, visualCy, radius, 0, Math.PI * 2);
        this.ctx.closePath();
        const isPCFullyDamaged =
          instance &&
          instance.isPC &&
          Array.isArray(instance.pcHealth) &&
          instance.pcHealth.length > 0 &&
          instance.pcHealth.every((level) => (parseInt(level, 10) || 0) > 0);
        const isDead =
          instance &&
          (instance.status === "dead" ||
            instance.health <= 0 ||
            isPCFullyDamaged);
        const isObfuscated = !!(
          instance?.effects &&
          typeof instance.effects === "object" &&
          instance.effects.obfuscateActive
        );
        const isActiveTurn =
          !!instance &&
          !!this.activeInstanceId &&
          instance.id === this.activeInstanceId;
        const hasImage =
          token.img && token.img.complete && token.img.naturalWidth > 0;

        let tokenFillColor = "#444";
        if (isDead) tokenFillColor = "#555";
        else if (isActiveTurn) tokenFillColor = "#5f2626";
        else if (instance && instance.isPC) tokenFillColor = "#5f4d2d";

        this.ctx.fillStyle = tokenFillColor;
        this.ctx.fill();
        this.ctx.clip();

        if (hasImage) {
          this.ctx.save();
          if (isObfuscated && !perfMode) {
            this.ctx.globalAlpha *= 0.44;
            this.ctx.filter = "saturate(0.35) brightness(0.58)";
          }
          this.ctx.drawImage(
            token.img,
            visualCx - radius,
            visualCy - radius,
            radius * 2,
            radius * 2,
          );
          this.ctx.restore();
        }

        if (isObfuscated) {
          this.ctx.fillStyle = "rgba(28, 18, 40, 0.34)";
          this.ctx.beginPath();
          this.ctx.arc(visualCx, visualCy, radius * 0.96, 0, Math.PI * 2);
          this.ctx.fill();
        }

        if (isDead) {
          this.ctx.fillStyle = "rgba(120, 120, 120, 0.45)";
          this.ctx.fillRect(
            visualCx - radius,
            visualCy - radius,
            radius * 2,
            radius * 2,
          );
        }

        if (instance && instance.code && !hasImage) {
          this.ctx.fillStyle = isDead ? "#9a9a9a" : "#f2f2f2";
          this.ctx.font = `bold ${Math.max(10, size * 0.4)}px sans-serif`;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "middle";
          this.ctx.shadowColor = "rgba(0,0,0,0.55)";
          this.ctx.shadowBlur = 2;
          this.ctx.shadowOffsetX = 0;
          this.ctx.shadowOffsetY = 1;
          this.ctx.fillText(instance.code, visualCx, visualCy);
        }

        this.ctx.restore();

        this.ctx.beginPath();
        this.ctx.arc(visualCx, visualCy, radius, 0, Math.PI * 2);

        let strokeColor = "#999";
        if (isDead) {
          strokeColor = instance && instance.isPC ? "#8e7440" : "#444";
        } else if (instance && instance.isPC) {
          strokeColor = "#c5a059";
        }

        if (isActiveTurn) {
          strokeColor = "#ad3838";
        }

        this.ctx.strokeStyle = strokeColor;
        this.ctx.lineWidth = isActiveTurn ? 3 : isDead ? 1 : 2;
        this.ctx.stroke();

        if (this.selectedTokenId === token.id) {
          this.ctx.strokeStyle = "#ff9800";
          this.ctx.lineWidth = 3;
          this.ctx.stroke();
        }

        if (isNarratorHidden) {
          this.ctx.save();
          this.ctx.setLineDash([Math.max(6 / this.scale, 3), Math.max(4 / this.scale, 2)]);
          this.ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
          this.ctx.lineWidth = Math.max(2 / this.scale, 1.5);
          this.ctx.beginPath();
          this.ctx.arc(visualCx, visualCy, radius + Math.max(3 / this.scale, 2), 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.setLineDash([]);
          this.ctx.restore();
        }

        if (isObfuscated) {
          this.ctx.save();
          this.ctx.strokeStyle = "rgba(142, 104, 190, 0.72)";
          this.ctx.lineWidth = Math.max(1.5 / this.scale, 1);
          this.ctx.beginPath();
          this.ctx.arc(visualCx, visualCy, radius * 0.86, 0, Math.PI * 2);
          this.ctx.stroke();
          this.ctx.restore();
        }

        const badgeText = String(token.badgeText || "").trim();
        if (badgeText) {
          const badgeRadius = Math.max(8 / this.scale, radius * 0.28);
          const badgeX = visualCx + radius * 0.56;
          const badgeY = visualCy - radius * 0.56;
          this.ctx.save();
          this.ctx.beginPath();
          this.ctx.arc(badgeX, badgeY, badgeRadius, 0, Math.PI * 2);
          this.ctx.closePath();
          this.ctx.fillStyle = "rgba(255, 255, 255, 0.98)";
          this.ctx.fill();
          this.ctx.strokeStyle = "rgba(20, 24, 32, 0.9)";
          this.ctx.lineWidth = Math.max(1.1 / this.scale, 0.8);
          this.ctx.stroke();
          this.ctx.fillStyle = "#10141a";
          this.ctx.font = `700 ${Math.max(9 / this.scale, badgeRadius * 1.1)}px Nunito Sans, sans-serif`;
          this.ctx.textAlign = "center";
          this.ctx.textBaseline = "middle";
          this.ctx.fillText(badgeText, badgeX, badgeY);
          this.ctx.restore();
        }

        const satellites =
          !perfMode && typeof this.getTokenSatelliteKinds === "function"
            ? this.getTokenSatelliteKinds(token, instance)
            : [];
        if (satellites.length > 0) {
          const popOffset = this.getSatellitePopOffset(token.id, now, radius);
          satellites.forEach((kind, index) => {
            this.drawStatusBadge(
              visualCx,
              visualCy,
              radius,
              this.getStatusBadgeImage?.(kind),
              {
                extraOffset: popOffset,
                slotIndex: index,
                slotCount: satellites.length,
              },
            );
          });
        }

        if (isFocused && !perfMode) {
          this.drawHoverHalo(visualCx, visualCy, radius + 5);
        }

        // Close the outer save that holds the scale animation transform.
        this.ctx.restore();
      });
    };
  }

  global.__applyTacticalMapRender = applyRenderMethods;
  if (global.TacticalMap) {
    applyRenderMethods(global.TacticalMap);
  }
})(window);
