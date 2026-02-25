// Tactical map core. Rendering and interactions are attached by
// tactical-map-render.js and tactical-map-interactions.js.
const DEFAULT_TACTICAL_MAP_CONFIG = {
  zoomLevels: [0.5, 1, 1.5, 3.5],
  wheelStepThreshold: 80,
  wheelStepCooldownMs: 0,
};
const MAP_LAYER_DEFAULTS = {
  backgroundPath: null,
  backgroundUrl: "",
  preserveAspect: true,
  x: 0,
  y: 0,
  widthCells: 20,
  heightCells: 20,
  opacity: 1,
  showGrid: true,
};
const DESIGN_TOKEN_DEFAULTS = {
  x: 0,
  y: 0,
  size: 1,
  widthCells: null,
  heightCells: null,
  rotationDeg: 0,
  fill: "#666",
  opacity: 1,
  layer: "underlay",
  zIndex: 0,
};
const DESIGN_TOKEN_LAYERS = new Set(["underlay", "overlay"]);
const METERS_PER_CELL = 1.5;
const STATUS_ICON_ASSET_VERSION = "20260225a";
const STATUS_ICON_FILES = {
  skull: "death-skull.svg",
  prone: "prone.svg",
  batwing: "batwing-emblem.svg",
  blinded: "blinded.svg",
};

window.TacticalMap = class TacticalMap {
  constructor(canvasId, containerId) {
    this.canvas = document.getElementById(canvasId);
    this.container = document.getElementById(containerId);
    this.ctx = this.canvas.getContext("2d");

    this.tokens = [];
    this.designTokens = [];
    this.mapEffects = [];
    this.designTokenLayers = {
      underlay: [],
      overlay: [],
    };
    this.instances = [];
    this.mapLayer = { ...MAP_LAYER_DEFAULTS };
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
    this.isDraggingMapEffect = false;
    this.draggedMapEffect = null;
    this.dragStartMapEffectPos = null;
    this.dragMapEffectOffset = { x: 0, y: 0 };
    this.lastRender = 0;
    this.activeTokenAnim = null;
    this.tokenRenderState = new Map();
    this.localTokenMoveEcho = new Map();
    this.remoteMoveAnimMs = 280;

    this.onTokenMove = null;
    this.onTokenSelect = null;
    this.onTokenContext = null;
    this.canDragToken = null;
    this.onMapEffectChange = null;
    this.canDragMapEffect = null;
    this.onDesignTokenMove = null;
    this.onDesignTokenSelect = null;
    this.onDesignTokenContext = null;
    this.onDesignTokenChange = null;
    this.canDragDesignToken = null;
    this.onBackgroundChange = null;
    this.canEditBackground = null;
    this.activeLayer = "entities";
    this.selectedDesignTokenId = null;
    this.selectedMapEffectId = null;
    this.selectedBackground = false;
    this.hoverFocus = null;
    this.satellitePopAnim = null;
    this.statusBadgeImages = {};
    this._rafId = null;
    this._isDestroyed = false;
    this.preloadStatusBadgeImages();

    this.resize();
    this._onWindowResize = () => this.resize();
    window.addEventListener("resize", this._onWindowResize);

    if (typeof this.setupInteractions !== "function") {
      throw new Error(
        "TacticalMap interactions module not loaded (tactical-map-interactions.js).",
      );
    }
    this.setupInteractions();
    this.startLoop();
  }

  resize() {
    if (!this.container) return;
    this.canvas.width = this.container.clientWidth;
    this.canvas.height = this.container.clientHeight;
    this.draw();
  }

  preloadStatusBadgeImages() {
    Object.entries(STATUS_ICON_FILES).forEach(([key, filename]) => {
      try {
        const image = new Image();
        image.src = `images/svgs/${filename}?v=${STATUS_ICON_ASSET_VERSION}`;
        image.onload = () => this.draw();
        this.statusBadgeImages[key] = image;
      } catch (_error) {
        this.statusBadgeImages[key] = null;
      }
    });
  }

  getStatusBadgeImage(kind) {
    if (!kind) return null;
    return this.statusBadgeImages?.[kind] || null;
  }

  setData(tokens, instances, extras = {}) {
    this.tokens = tokens || [];
    this.designTokens = this.normalizeDesignTokens(extras?.designTokens || []);
    this.mapEffects = this.normalizeMapEffects(extras?.mapEffects || []);
    this.designTokenLayers = {
      underlay: this.designTokens.filter((token) => token.layer === "underlay"),
      overlay: this.designTokens.filter((token) => token.layer === "overlay"),
    };
    this.instances = instances || [];
    this.mapLayer = this.normalizeMapLayer(extras?.map || null);

    const preloadTokenImage = (token) => {
      const hasValidImageObject =
        token.img &&
        typeof token.img === "object" &&
        typeof token.img.complete === "boolean" &&
        typeof token.img.src === "string";
      const needsReload =
        !hasValidImageObject ||
        (token.imgUrl && token.img.src !== token.imgUrl);

      if (token.imgUrl && needsReload) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = token.imgUrl;
        img.onload = () => this.draw();
        token.img = img;
      } else if (!token.imgUrl) {
        token.img = null;
      }
    };

    this.tokens.forEach(preloadTokenImage);
    this.designTokens.forEach(preloadTokenImage);

    const designTokenIds = new Set(this.designTokens.map((t) => t.id));
    if (
      this.selectedDesignTokenId &&
      !designTokenIds.has(this.selectedDesignTokenId)
    ) {
      this.selectedDesignTokenId = null;
    }
    const effectIds = new Set((this.mapEffects || []).map((effect) => effect.id));
    if (this.selectedMapEffectId && !effectIds.has(this.selectedMapEffectId)) {
      this.selectedMapEffectId = null;
    }

    const bgUrl = this.mapLayer?.backgroundUrl || "";
    if (bgUrl) {
      if (!this.backgroundImage || this.backgroundImage.src !== bgUrl) {
        const img = new Image();
        img.crossOrigin = "Anonymous";
        img.src = bgUrl;
        img.onload = () => this.draw();
        this.backgroundImage = img;
      }
    } else {
      this.backgroundImage = null;
      this.selectedBackground = false;
    }

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

      const nowMs = Date.now();
      const localEcho = this.localTokenMoveEcho.get(t.id);
      if (localEcho && localEcho.expiresAt > nowMs) {
        const sameTarget =
          Math.abs((parseFloat(t.x) || 0) - (parseFloat(localEcho.x) || 0)) < 0.0001 &&
          Math.abs((parseFloat(t.y) || 0) - (parseFloat(localEcho.y) || 0)) < 0.0001;
        if (sameTarget) {
          st.x = t.x;
          st.y = t.y;
          st.fromX = t.x;
          st.fromY = t.y;
          st.targetX = t.x;
          st.targetY = t.y;
          st.animating = false;
          return;
        }
      }

      st.fromX = st.x ?? st.targetX ?? t.x;
      st.fromY = st.y ?? st.targetY ?? t.y;
      st.targetX = t.x;
      st.targetY = t.y;
      st.startAt = now;
      st.duration = this.remoteMoveAnimMs;
      st.animating = true;
    });

    Array.from(this.tokenRenderState.keys()).forEach((id) => {
      if (!incomingIds.has(id)) {
        this.tokenRenderState.delete(id);
      }
    });

    // Drop expired local echo marks.
    Array.from(this.localTokenMoveEcho.entries()).forEach(([id, info]) => {
      if (!info || info.expiresAt <= Date.now()) {
        this.localTokenMoveEcho.delete(id);
      }
    });

    this.draw();
  }

  markLocalTokenMove(tokenId, x, y, ttlMs = 2500) {
    if (!tokenId) return;
    this.localTokenMoveEcho.set(tokenId, {
      x: parseFloat(x) || 0,
      y: parseFloat(y) || 0,
      expiresAt: Date.now() + Math.max(300, ttlMs),
    });
  }

  triggerSatellitePop(tokenId, durationMs = 380) {
    if (!tokenId) return;
    this.satellitePopAnim = {
      tokenId,
      startAt: performance.now(),
      duration: Math.max(120, durationMs),
    };
    this.draw();
  }

  tokenHasSatellites(token, instance) {
    return this.getTokenSatelliteKinds(token, instance).length > 0;
  }

  isTokenInsideNightShroud(token, timestamp) {
    if (!token) return false;
    const effects = Array.isArray(this.mapEffects) ? this.mapEffects : [];
    if (!effects.length) return false;

    const tokenSize = Math.max(0.2, parseFloat(token.size) || 1);
    const tokenCenter = {
      x: (parseFloat(token.x) || 0) + tokenSize / 2,
      y: (parseFloat(token.y) || 0) + tokenSize / 2,
    };

    return effects.some((effect) => {
      if (!effect || effect.type !== "night_shroud") return false;
      if (
        effect.sourceInstanceId &&
        token.instanceId &&
        effect.sourceInstanceId === token.instanceId
      ) {
        return false; // Never blind the caster.
      }
      const radiusCells = Math.max(0, parseFloat(effect.radiusCells) || 0);
      if (radiusCells <= 0) return false;
      const center = this.getMapEffectCenter(effect, timestamp);
      if (!center) return false;
      const dx = tokenCenter.x - center.x;
      const dy = tokenCenter.y - center.y;
      return dx * dx + dy * dy <= radiusCells * radiusCells;
    });
  }

  getTokenSatelliteKinds(token, instance) {
    if (!token || !instance) return [];
    const isPCFullyDamaged =
      instance.isPC &&
      Array.isArray(instance.pcHealth) &&
      instance.pcHealth.length > 0 &&
      instance.pcHealth.every((level) => (parseInt(level, 10) || 0) > 0);
    const isOutOfCombat =
      instance.status === "dead" ||
      (parseInt(instance.health, 10) || 0) <= 0 ||
      isPCFullyDamaged;
    const conditions =
      instance.conditions && typeof instance.conditions === "object"
        ? instance.conditions
        : {};
    const kinds = [];
    if (isOutOfCombat) kinds.push("skull");
    if (conditions.flying) kinds.push("batwing");
    if (
      conditions.blinded ||
      this.isTokenInsideNightShroud(token, performance.now())
    ) {
      kinds.push("blinded");
    }
    if (conditions.prone) kinds.push("prone");
    return kinds;
  }

  normalizeMapLayer(raw) {
    if (!raw || typeof raw !== "object") {
      return { ...MAP_LAYER_DEFAULTS };
    }

    return {
      backgroundPath:
        typeof raw.backgroundPath === "string" && raw.backgroundPath
          ? raw.backgroundPath
          : null,
      backgroundUrl: typeof raw.backgroundUrl === "string" ? raw.backgroundUrl : "",
      preserveAspect: raw.preserveAspect !== false,
      x: parseFloat(raw.x) || 0,
      y: parseFloat(raw.y) || 0,
      widthCells: Math.max(1, parseFloat(raw.widthCells) || MAP_LAYER_DEFAULTS.widthCells),
      heightCells: Math.max(1, parseFloat(raw.heightCells) || MAP_LAYER_DEFAULTS.heightCells),
      opacity: Math.min(1, Math.max(0, parseFloat(raw.opacity) || 1)),
      showGrid: raw.showGrid !== false,
    };
  }

  normalizeDesignTokens(rawTokens) {
    if (!Array.isArray(rawTokens)) return [];

    const normalized = rawTokens
      .map((token, index) => {
        if (!token || typeof token !== "object") return null;

        const layer = DESIGN_TOKEN_LAYERS.has(token.layer)
          ? token.layer
          : DESIGN_TOKEN_DEFAULTS.layer;

        return {
          ...DESIGN_TOKEN_DEFAULTS,
          ...token,
          id: token.id || `design-token-${index}`,
          x: parseFloat(token.x) || 0,
          y: parseFloat(token.y) || 0,
          size: Math.max(0.2, parseFloat(token.size) || DESIGN_TOKEN_DEFAULTS.size),
          widthCells:
            token.widthCells == null ? null : Math.max(0.2, parseFloat(token.widthCells) || 0),
          heightCells:
            token.heightCells == null ? null : Math.max(0.2, parseFloat(token.heightCells) || 0),
          rotationDeg: parseFloat(token.rotationDeg) || 0,
          opacity: Math.min(1, Math.max(0, parseFloat(token.opacity) || 1)),
          zIndex: parseInt(token.zIndex, 10) || 0,
          layer,
        };
      })
      .filter(Boolean);

    normalized.sort((a, b) => {
      const layerOrderA = a.layer === "underlay" ? 0 : 1;
      const layerOrderB = b.layer === "underlay" ? 0 : 1;
      if (layerOrderA !== layerOrderB) return layerOrderA - layerOrderB;
      if (a.zIndex !== b.zIndex) return a.zIndex - b.zIndex;
      return String(a.id).localeCompare(String(b.id));
    });

    return normalized;
  }

  normalizeMapEffects(rawEffects) {
    if (!Array.isArray(rawEffects)) return [];
    return rawEffects
      .map((effect, index) => {
        if (!effect || typeof effect !== "object") return null;
        const type = String(effect.type || "").trim();
        if (!type) return null;
        const radiusMeters = Math.max(0, parseFloat(effect.radiusMeters) || 0);
        const radiusCells = Math.max(
          0,
          parseFloat(effect.radiusCells) ||
            (radiusMeters > 0 ? radiusMeters / METERS_PER_CELL : 0),
        );
        if (radiusCells <= 0) return null;
        return {
          ...effect,
          id: effect.id || `map-effect-${type}-${index}`,
          type,
          sourceTokenId: effect.sourceTokenId || null,
          sourceInstanceId: effect.sourceInstanceId || null,
          radiusMeters,
          radiusCells,
          x: Number.isFinite(Number(effect.x)) ? Number(effect.x) : null,
          y: Number.isFinite(Number(effect.y)) ? Number(effect.y) : null,
        };
      })
      .filter(Boolean);
  }

  getMapEffectCenter(effect, timestamp) {
    if (!effect) return null;
    const ex = parseFloat(effect.x);
    const ey = parseFloat(effect.y);
    if (
      effect.type === "night_shroud" &&
      Number.isFinite(ex) &&
      Number.isFinite(ey)
    ) {
      return { x: ex, y: ey };
    }
    const sourceToken =
      (this.tokens || []).find((token) => token.id === effect.sourceTokenId) ||
      (this.tokens || []).find((token) => token.instanceId === effect.sourceInstanceId);
    if (!sourceToken) return null;
    const now = typeof timestamp === "number" ? timestamp : performance.now();
    const pos =
      typeof this.getTokenRenderPosition === "function"
        ? this.getTokenRenderPosition(sourceToken, now)
        : sourceToken;
    const size = parseFloat(sourceToken.size) || 1;
    return {
      x: (parseFloat(pos.x) || 0) + size / 2,
      y: (parseFloat(pos.y) || 0) + size / 2,
    };
  }

  getDesignTokenRect(token) {
    if (!token || typeof token !== "object") {
      return { x: 0, y: 0, width: this.gridSize, height: this.gridSize };
    }
    const x = (parseFloat(token.x) || 0) * this.gridSize;
    const y = (parseFloat(token.y) || 0) * this.gridSize;
    const widthCells =
      token.widthCells == null ? null : Math.max(0.2, parseFloat(token.widthCells) || 0);
    const heightCells =
      token.heightCells == null ? null : Math.max(0.2, parseFloat(token.heightCells) || 0);

    if (widthCells && heightCells) {
      return {
        x,
        y,
        width: widthCells * this.gridSize,
        height: heightCells * this.gridSize,
      };
    }

    const size = (parseFloat(token.size) || 1) * this.gridSize;
    const hasImage =
      token.img && token.img.complete && token.img.naturalWidth > 0 && token.img.naturalHeight > 0;
    if (hasImage) {
      const aspect = token.img.naturalWidth / token.img.naturalHeight;
      if (Number.isFinite(aspect) && aspect > 0) {
        return { x, y, width: size, height: size / aspect };
      }
    }
    return { x, y, width: size, height: size };
  }

  getDesignTokenRotationRad(token) {
    return ((parseFloat(token?.rotationDeg) || 0) * Math.PI) / 180;
  }

  getDesignTokenCenterPx(token) {
    const rect = this.getDesignTokenRect(token);
    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
      rect,
    };
  }

  rotatePointAround(px, py, cx, cy, angleRad) {
    const dx = px - cx;
    const dy = py - cy;
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    return {
      x: cx + dx * cos - dy * sin,
      y: cy + dx * sin + dy * cos,
    };
  }

  getDesignTokenRotateHandlePx(token) {
    if (!token) return null;
    const { x: cx, y: cy, rect } = this.getDesignTokenCenterPx(token);
    const topRight = this.rotatePointAround(
      rect.x + rect.width,
      rect.y,
      cx,
      cy,
      this.getDesignTokenRotationRad(token),
    );
    const vx = topRight.x - cx;
    const vy = topRight.y - cy;
    const len = Math.hypot(vx, vy) || 1;
    const offset = Math.max(18 / this.scale, 12);
    return {
      x: topRight.x + (vx / len) * offset,
      y: topRight.y + (vy / len) * offset,
      anchorX: topRight.x,
      anchorY: topRight.y,
    };
  }

  getDesignTokenRectCells(token) {
    if (!token || typeof token !== "object") {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    const x = parseFloat(token.x) || 0;
    const y = parseFloat(token.y) || 0;
    const widthCells =
      token.widthCells == null ? null : Math.max(0.2, parseFloat(token.widthCells) || 0);
    const heightCells =
      token.heightCells == null ? null : Math.max(0.2, parseFloat(token.heightCells) || 0);

    if (widthCells && heightCells) {
      return { x, y, width: widthCells, height: heightCells };
    }

    const sizeCells = Math.max(0.2, parseFloat(token.size) || 1);
    const hasImage =
      token.img && token.img.complete && token.img.naturalWidth > 0 && token.img.naturalHeight > 0;
    if (hasImage) {
      const aspect = token.img.naturalWidth / token.img.naturalHeight;
      if (Number.isFinite(aspect) && aspect > 0) {
        return { x, y, width: sizeCells, height: sizeCells / aspect };
      }
    }
    return { x, y, width: sizeCells, height: sizeCells };
  }

  getSelectedDesignToken() {
    if (!this.selectedDesignTokenId) return null;
    return (this.designTokens || []).find((t) => t.id === this.selectedDesignTokenId) || null;
  }

  nudgeSelectedDesignTokenPixels(dxPixels, dyPixels) {
    const token = this.getSelectedDesignToken();
    if (!token) return false;
    token.x = (parseFloat(token.x) || 0) + dxPixels / this.gridSize;
    token.y = (parseFloat(token.y) || 0) + dyPixels / this.gridSize;
    this.draw();
    if (this.onDesignTokenChange) {
      this.onDesignTokenChange(token.id, { x: token.x, y: token.y });
    }
    return true;
  }

  scaleSelectedDesignTokenPixels(deltaPixels) {
    const token = this.getSelectedDesignToken();
    if (!token) return false;
    const minCells = 0.2;
    const rect = this.getDesignTokenRectCells(token);
    const aspect = rect.width / rect.height;
    const deltaCells = deltaPixels / this.gridSize;
    const nextWidth = Math.max(minCells, rect.width + deltaCells);
    const nextHeight = nextWidth / Math.max(0.01, aspect);
    const nextX = rect.x + (rect.width - nextWidth) / 2;
    const nextY = rect.y + (rect.height - nextHeight) / 2;

    token.x = nextX;
    token.y = nextY;
    token.widthCells = nextWidth;
    token.heightCells = nextHeight;
    this.draw();
    if (this.onDesignTokenChange) {
      this.onDesignTokenChange(token.id, {
        x: token.x,
        y: token.y,
        widthCells: token.widthCells,
        heightCells: token.heightCells,
      });
    }
    return true;
  }

  setActiveInstance(id) {
    if (this.activeInstanceId !== id) {
      this.activeInstanceId = id;
      const token = this.tokens.find((t) => t.instanceId === id);
      if (token) {
        this.activeTokenAnim = {
          tokenId: token.id,
          startAt: performance.now(),
          duration: 1000,
        };
      } else {
        this.activeTokenAnim = null;
      }
    }
    this.draw();
  }

  setInteractionLayer(layer) {
    const next = layer === "background" || layer === "decor" ? layer : "entities";
    this.activeLayer = next;
    if (next !== "entities") {
      this.selectedTokenId = null;
      if (this.onTokenSelect) this.onTokenSelect(null);
    }
    if (next !== "decor") {
      this.selectedDesignTokenId = null;
      if (this.onDesignTokenSelect) this.onDesignTokenSelect(null);
    }
    if (next !== "entities") {
      this.selectedMapEffectId = null;
    }
    if (next !== "background") {
      this.selectedBackground = false;
    }
    this.draw();
  }

  setHoverFocus(focus) {
    if (!focus || typeof focus !== "object") {
      this.hoverFocus = null;
      this.draw();
      return;
    }
    this.hoverFocus = { ...focus };
    this.draw();
  }

  clearHoverFocus() {
    if (!this.hoverFocus) return;
    this.hoverFocus = null;
    this.draw();
  }

  getBackgroundRect() {
    const bg = this.mapLayer || {};
    return {
      x: parseFloat(bg.x) || 0,
      y: parseFloat(bg.y) || 0,
      width: Math.max(1, parseFloat(bg.widthCells) || 20),
      height: Math.max(1, parseFloat(bg.heightCells) || 20),
    };
  }

  isPointInsideBackground(worldX, worldY) {
    const rect = this.getBackgroundRect();
    return (
      worldX >= rect.x * this.gridSize &&
      worldX <= (rect.x + rect.width) * this.gridSize &&
      worldY >= rect.y * this.gridSize &&
      worldY <= (rect.y + rect.height) * this.gridSize
    );
  }

  nudgeBackgroundPixels(dxPixels, dyPixels) {
    if (!this.mapLayer) return false;
    const x = parseFloat(this.mapLayer.x) || 0;
    const y = parseFloat(this.mapLayer.y) || 0;
    const next = {
      ...this.mapLayer,
      x: x + dxPixels / this.gridSize,
      y: y + dyPixels / this.gridSize,
    };
    this.mapLayer = next;
    this.draw();
    if (this.onBackgroundChange) this.onBackgroundChange({ ...next });
    return true;
  }

  scaleBackgroundPixels(deltaPixels) {
    if (!this.mapLayer) return false;
    const minCells = 0.2;
    const x = parseFloat(this.mapLayer.x) || 0;
    const y = parseFloat(this.mapLayer.y) || 0;
    const width = Math.max(minCells, parseFloat(this.mapLayer.widthCells) || 20);
    const height = Math.max(minCells, parseFloat(this.mapLayer.heightCells) || 20);
    const aspect = width / height;
    const deltaCells = deltaPixels / this.gridSize;
    const nextWidth = Math.max(minCells, width + deltaCells);
    const nextHeight = nextWidth / aspect;
    const nextX = x + (width - nextWidth) / 2;
    const nextY = y + (height - nextHeight) / 2;

    const next = {
      ...this.mapLayer,
      x: nextX,
      y: nextY,
      widthCells: nextWidth,
      heightCells: nextHeight,
      preserveAspect: true,
    };
    this.mapLayer = next;
    this.draw();
    if (this.onBackgroundChange) this.onBackgroundChange({ ...next });
    return true;
  }

  startLoop() {
    const loop = (timestamp) => {
      if (this._isDestroyed) return;
      this.draw(timestamp);
      this._rafId = requestAnimationFrame(loop);
    };
    this._rafId = requestAnimationFrame(loop);
  }

  destroy() {
    this._isDestroyed = true;
    if (this._rafId != null) {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }
    if (this._onWindowResize) {
      window.removeEventListener("resize", this._onWindowResize);
      this._onWindowResize = null;
    }
    if (typeof this.disposeInteractions === "function") {
      this.disposeInteractions();
    }
  }

  draw(timestamp) {
    if (typeof this.drawGrid !== "function" || typeof this.drawTokens !== "function") {
      throw new Error(
        "TacticalMap render module not loaded (tactical-map-render.js).",
      );
    }

    // Keep image downscaling smooth when zooming out (background/decor assets).
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = "high";

    this.ctx.fillStyle = "#1a1a1a";
    this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

    this.ctx.save();
    this.ctx.translate(this.offsetX, this.offsetY);
    this.ctx.scale(this.scale, this.scale);
    if (typeof this.drawBackground === "function") {
      this.drawBackground();
    }
    if (this.mapLayer.showGrid !== false) {
      this.drawGrid();
    }
    if (typeof this.drawMapEffects === "function") {
      this.drawMapEffects(timestamp);
    }
    if (typeof this.drawDesignTokens === "function") {
      this.drawDesignTokens("underlay");
    }
    this.drawTokens(timestamp);
    if (typeof this.drawDesignTokens === "function") {
      this.drawDesignTokens("overlay");
    }
    this.ctx.restore();
  }
};

if (typeof window.__applyTacticalMapRender === "function") {
  window.__applyTacticalMapRender(window.TacticalMap);
}
if (typeof window.__applyTacticalMapInteractions === "function") {
  window.__applyTacticalMapInteractions(window.TacticalMap);
}
