// Tunable map interaction settings.
// You can override these from the console with: window.TACTICAL_MAP_CONFIG = { ... }
const DEFAULT_TACTICAL_MAP_CONFIG = {
  // Define each zoom level explicitly (from farthest to closest).
  // Keep exactly 4 values to have 4 steps.
  zoomLevels: [0.5, 1, 1.5, 3.5],
  wheelStepThreshold: 80,
  wheelStepCooldownMs: 0,
};

window.TacticalMap = class TacticalMap {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.ctx = this.canvas.getContext("2d");

    // State
    this.tokens = [];
    this.instances = []; // Reference to logical instances for status syncing
    this.gridSize = 50;
    this.offsetX = 0;
    this.offsetY = 0;
    this.scale = 1.0;
    const cfg = {
      ...DEFAULT_TACTICAL_MAP_CONFIG,
      ...(window.TACTICAL_MAP_CONFIG || {}),
    };

    this.zoomLevels = Array.isArray(cfg.zoomLevels)
      ? [...cfg.zoomLevels].sort((a, b) => a - b)
      : [...DEFAULT_TACTICAL_MAP_CONFIG.zoomLevels];
    if (this.zoomLevels.length === 0) {
      this.zoomLevels = [...DEFAULT_TACTICAL_MAP_CONFIG.zoomLevels];
    }
    this.wheelDeltaAccumulator = 0;
    this.wheelStepThreshold = cfg.wheelStepThreshold;
    this.wheelStepCooldownMs = cfg.wheelStepCooldownMs;
    this.lastWheelStepAt = 0;

    this.isDragging = false;
    this.dragStart = { x: 0, y: 0 };
    this.lastRender = 0;
    this.activeTokenAnim = null; // { tokenId, startAt, duration }
    this.tokenRenderState = new Map();
    this.remoteMoveAnimMs = 280;

    // Event callbacks
    this.onTokenMove = null;
    this.onTokenSelect = null;
    this.onTokenContext = null;
    this.canDragToken = null;

    this.resize();
    window.addEventListener("resize", () => this.resize());

    this.setupInteractions();
    this.startLoop();
  }

  resize() {
    if (!this.container) return;
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    this.draw();
  }

  setData(tokens, instances) {
    this.tokens = tokens || [];
    this.instances = instances || [];

    // Preload images
    this.tokens.forEach((t) => {
      const hasValidImageObject =
        t.img &&
        typeof t.img === "object" &&
        typeof t.img.complete === "boolean" &&
        typeof t.img.src === "string";
      const needsReload =
        !hasValidImageObject || (t.imgUrl && t.img.src !== t.imgUrl);

      if (t.imgUrl && needsReload) {
        const img = new Image();
        img.crossOrigin = "Anonymous"; // Fix potential CORS issues
        img.src = t.imgUrl;
        img.onload = () => this.draw(); // Force redraw when loaded
        t.img = img;
      } else if (!t.imgUrl) {
        t.img = null;
      }
    });

    // Keep lightweight animation state per token so remote updates glide
    // instead of jumping directly between grid cells.
    const now = performance.now();
    const incomingIds = new Set();
    this.tokens.forEach((t) => {
      incomingIds.add(t.id);
      const st = this.tokenRenderState.get(t.id);
      if (!st) {
        this.tokenRenderState.set(t.id, {
          x: t.x,
          y: t.y,
          fromX: t.x,
          fromY: t.y,
          targetX: t.x,
          targetY: t.y,
          startAt: now,
          duration: this.remoteMoveAnimMs,
          animating: false,
        });
        return;
      }

      if (st.targetX === t.x && st.targetY === t.y) return;

      const isLocallyDraggingThis =
        this.isDraggingToken &&
        this.draggedToken &&
        this.draggedToken.id === t.id;

      if (isLocallyDraggingThis) {
        st.x = t.x;
        st.y = t.y;
        st.fromX = t.x;
        st.fromY = t.y;
        st.targetX = t.x;
        st.targetY = t.y;
        st.animating = false;
        return;
      }

      st.fromX = st.x ?? st.targetX ?? t.x;
      st.fromY = st.y ?? st.targetY ?? t.y;
      st.targetX = t.x;
      st.targetY = t.y;
      st.startAt = now;
      st.duration = this.remoteMoveAnimMs;
      st.animating = true;
    });

    // Drop animation state for removed tokens.
    Array.from(this.tokenRenderState.keys()).forEach((id) => {
      if (!incomingIds.has(id)) {
        this.tokenRenderState.delete(id);
      }
    });

    this.draw();
  }

  setActiveInstance(id) {
    if (this.activeInstanceId !== id) {
      this.activeInstanceId = id;

      // Find token and trigger animation
      const token = this.tokens.find((t) => t.instanceId === id);
      if (token) {
        this.activeTokenAnim = {
          tokenId: token.id,
          startAt: performance.now(),
          duration: 1000, // 1s full animation cycle
        };
      } else {
        this.activeTokenAnim = null;
      }
    }
    this.draw();
  }

  startLoop() {
    const loop = (timestamp) => {
      this.draw(timestamp);
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  }

  draw(timestamp) {
    // Clear
    this.ctx.fillStyle = "#1a1a1a"; // Dark gray bg
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();

    // Apply Transform
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);

    // Draw Layers
    this.drawGrid();
    this.drawTokens(timestamp);

    this.ctx.restore();
  }

  drawGrid() {
    const viewportWidth = this.canvas.width / this.scale;
    const viewportHeight = this.canvas.height / this.scale;
    const startX = -this.offsetX / this.scale;
    const startY = -this.offsetY / this.scale;

    this.ctx.strokeStyle = "#333";
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();

    // Draw grid lines covering the visible area + buffer
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
  }

  getTokenRenderPosition(token, timestamp) {
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
  }

  drawTokens(timestamp) {
    const now = typeof timestamp === "number" ? timestamp : performance.now();

    this.tokens.forEach((token) => {
      const pos = this.getTokenRenderPosition(token, timestamp);
      const screenX = pos.x * this.gridSize;
      const screenY = pos.y * this.gridSize;
      const size = (token.size || 1) * this.gridSize;
      const radius = size * 0.4;
      const cx = screenX + size / 2;
      const cy = screenY + size / 2;

      this.ctx.save();

      // Active Token Animation Logic
      if (this.activeTokenAnim && this.activeTokenAnim.tokenId === token.id) {
        const elapsed = now - this.activeTokenAnim.startAt;
        if (elapsed < this.activeTokenAnim.duration) {
          const p = elapsed / this.activeTokenAnim.duration;
          // 0.6 > 1 > 1.5 > 0.8 > 1
          // Distributed:
          // 0.0 - 0.2: 1 -> 0.6
          // 0.2 - 0.4: 0.6 -> 1.0
          // 0.4 - 0.6: 1.0 -> 1.5
          // 0.6 - 0.8: 1.5 -> 0.8
          // 0.8 - 1.0: 0.8 -> 1.0

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

          this.ctx.translate(cx, cy);
          this.ctx.scale(s, s);
          this.ctx.translate(-cx, -cy);
        } else {
          // Animation finished
          this.activeTokenAnim = null;
        }
      }

      // Shadow
      this.ctx.shadowColor = "rgba(0,0,0,0.5)";
      this.ctx.shadowBlur = 4;
      this.ctx.shadowOffsetX = 2;
      this.ctx.shadowOffsetY = 2;

      // Clip for Avatar
      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      this.ctx.closePath();

      // Instance state
      const instance = this.instances.find((i) => i.id === token.instanceId);
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
      const isActiveTurn =
        !!instance &&
        !!this.activeInstanceId &&
        instance.id === this.activeInstanceId;
      const hasImage =
        token.img && token.img.complete && token.img.naturalWidth > 0;

      // Single-color token background (used as fallback and for no-image tokens)
      let tokenFillColor = "#444";
      if (isDead) tokenFillColor = "#555";
      else if (isActiveTurn) tokenFillColor = "#5f2626";
      else if (instance && instance.isPC) tokenFillColor = "#5f4d2d";

      this.ctx.fillStyle = tokenFillColor;
      this.ctx.fill(); // Fallback background

      this.ctx.clip();

      if (hasImage) {
        this.ctx.drawImage(
          token.img,
          cx - radius,
          cy - radius,
          radius * 2,
          radius * 2,
        );
      }

      // Apply gray tint when the token is considered out of combat.
      if (isDead) {
        this.ctx.fillStyle = "rgba(120, 120, 120, 0.45)";
        this.ctx.fillRect(cx - radius, cy - radius, radius * 2, radius * 2);
      }

      // Draw Instance Code (ONLY if no valid image)
      if (instance && instance.code && !hasImage) {
        this.ctx.fillStyle = isDead ? "#9a9a9a" : "#f2f2f2";
        this.ctx.font = `bold ${Math.max(10, size * 0.4)}px sans-serif`;
        this.ctx.textAlign = "center";
        this.ctx.textBaseline = "middle";
        this.ctx.shadowColor = "rgba(0,0,0,0.55)";
        this.ctx.shadowBlur = 2;
        this.ctx.shadowOffsetX = 0;
        this.ctx.shadowOffsetY = 1;
        this.ctx.fillText(instance.code, cx, cy);
      }

      // Restore for Border
      this.ctx.restore();

      this.ctx.beginPath();
      this.ctx.arc(cx, cy, radius, 0, Math.PI * 2);

      let strokeColor = "#999"; // Default (NPC)
      if (isDead) {
        strokeColor = instance && instance.isPC ? "#8e7440" : "#444"; // Dark gold for downed PCs
      } else if (instance && instance.isPC) {
        strokeColor = "#c5a059"; // Gold for PCs
      }

      if (isActiveTurn) {
        strokeColor = "#ad3838"; // Match .ae-card.active
      }

      this.ctx.strokeStyle = strokeColor;
      this.ctx.lineWidth = isActiveTurn ? 3 : isDead ? 1 : 2;
      this.ctx.stroke();

      // Selection ring
      if (this.selectedTokenId === token.id) {
        this.ctx.strokeStyle = "#ff9800";
        this.ctx.lineWidth = 3;
        this.ctx.stroke();
      }
    });
  }

  setupInteractions() {
    // Pan and Zoom listeners
    this.canvas.addEventListener("wheel", (e) => this.handleWheel(e));
    this.canvas.addEventListener("mousedown", (e) => this.handleMouseDown(e));
    this.canvas.addEventListener("contextmenu", (e) => e.preventDefault()); // Stop right-click menu
    window.addEventListener("mousemove", (e) => this.handleMouseMove(e));
    window.addEventListener("mouseup", (e) => this.handleMouseUp(e));
  }

  handleWheel(e) {
    e.preventDefault();
    this.wheelDeltaAccumulator += e.deltaY;
    const now = performance.now();
    const absDelta = Math.abs(this.wheelDeltaAccumulator);

    if (absDelta < this.wheelStepThreshold) return;
    if (now - this.lastWheelStepAt < this.wheelStepCooldownMs) return;

    const direction = this.wheelDeltaAccumulator > 0 ? -1 : 1;

    // Zoom towards mouse
    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    this.stepZoom(direction, mouseX, mouseY);

    this.lastWheelStepAt = now;
    this.wheelDeltaAccumulator = 0;
  }

  getNearestZoomIndex() {
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
  }

  setZoomByIndex(index, focusX, focusY) {
    const safeIndex = Math.max(0, Math.min(this.zoomLevels.length - 1, index));
    const newScale = this.zoomLevels[safeIndex];
    const fx = focusX ?? this.canvas.width / 2;
    const fy = focusY ?? this.canvas.height / 2;

    const worldX = (fx - this.offsetX) / this.scale;
    const worldY = (fy - this.offsetY) / this.scale;

    this.scale = newScale;
    this.offsetX = fx - worldX * newScale;
    this.offsetY = fy - worldY * newScale;
  }

  stepZoom(direction, focusX, focusY) {
    const currentIndex = this.getNearestZoomIndex();
    const nextIndex = currentIndex + direction;
    this.setZoomByIndex(nextIndex, focusX, focusY);
  }

  zoomIn(focusX, focusY) {
    this.stepZoom(1, focusX, focusY);
  }

  zoomOut(focusX, focusY) {
    this.stepZoom(-1, focusX, focusY);
  }

  getTokenAt(worldX, worldY) {
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
  }

  handleMouseDown(e) {
    if (e.button === 1 || e.metaKey) {
      // Pan: Middle or Meta+Left
      e.preventDefault(); // Stop default browser behavior (scrolling etc)
      this.isPanning = true;
      this.dragStart = { x: e.clientX, y: e.clientY };
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    // World Coords
    const worldX = (mouseX - this.offsetX) / this.scale;
    const worldY = (mouseY - this.offsetY) / this.scale;
    const clickedToken = this.getTokenAt(worldX, worldY);

    if (e.button === 2) {
      // Right click: open token context menu when clicking a token.
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
          this.onTokenContext({
            tokenId: clickedToken.id,
            instanceId: clickedToken.instanceId || null,
            clientX: e.clientX,
            clientY: e.clientY,
          });
        }
      } else {
        // Right click on empty map keeps pan behavior.
        this.isPanning = true;
        this.dragStart = { x: e.clientX, y: e.clientY };
        if (this.onTokenContext) this.onTokenContext(null);
      }
      return;
    }

    if (e.button === 0) {
      // Left click: Select or Drag Token OR Pan if empty
      if (clickedToken) {
        const clickedInstance = this.instances.find(
          (i) => i.id === clickedToken.instanceId,
        );
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
        // Calculate offset within the token
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
        if (this.onTokenContext) this.onTokenContext(null);
      } else {
        // Updated: If no token clicked, start PAN
        this.selectedTokenId = null;
        this.isPanning = true;
        this.dragStart = { x: e.clientX, y: e.clientY };

        if (this.onTokenSelect) {
          this.onTokenSelect(null);
        }
        if (this.onTokenContext) this.onTokenContext(null);
      }
    }
  }

  handleMouseMove(e) {
    if (this.isPanning) {
      const dx = e.clientX - this.dragStart.x;
      const dy = e.clientY - this.dragStart.y;
      this.offsetX += dx;
      this.offsetY += dy;
      this.dragStart = { x: e.clientX, y: e.clientY };
    } else if (this.isDraggingToken && this.draggedToken) {
      const rect = this.canvas.getBoundingClientRect();
      const mouseX = e.clientX - rect.left;
      const mouseY = e.clientY - rect.top;
      const worldX = (mouseX - this.offsetX) / this.scale;
      const worldY = (mouseY - this.offsetY) / this.scale;

      // Snap logic eventually, for now smooth drag visual?
      // Actually let's just create a 'ghost' or move freely and snap on release.
      // For simplicity V1: immediate snap move
      const rawGridX = (worldX - this.dragTokenOffset.x) / this.gridSize;
      const rawGridY = (worldY - this.dragTokenOffset.y) / this.gridSize;

      this.draggedToken.x = Math.round(rawGridX);
      this.draggedToken.y = Math.round(rawGridY);
    }
  }

  handleMouseUp(e) {
    this.isPanning = false;
    if (this.isDraggingToken) {
      this.isDraggingToken = false;
      if (this.onTokenMove && this.draggedToken) {
        const oldX = this.dragStartTokenPos ? this.dragStartTokenPos.x : null;
        const oldY = this.dragStartTokenPos ? this.dragStartTokenPos.y : null;
        this.onTokenMove(
          this.draggedToken.id,
          this.draggedToken.x,
          this.draggedToken.y,
          oldX,
          oldY,
        );
      }
      this.draggedToken = null;
      this.dragStartTokenPos = null;
    }
  }
};
