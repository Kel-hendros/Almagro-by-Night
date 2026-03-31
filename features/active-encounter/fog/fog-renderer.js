// Fog + exploration-memory overlay for TacticalMap.
// Lighting/darkness is handled separately in light-renderer.js.
(function applyFogRenderer(global) {
  "use strict";

  var BLUR_RADIUS = 6;
  var BLUR_PAD = 2;
  // Explored memory should read as darker and more washed out than live sight,
  // but without adding expensive post-processing passes.
  var EXPLORED_MEMORY_TINT_RGB = { r: 12, g: 13, b: 16 };
  var EXPLORED_MEMORY_FILL = "rgba(12,13,16,0.92)";

  function clamp01(value) {
    var n = parseFloat(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  /**
   * Compute the explored memory fill based on ambient light.
   * Keep memory visibly darker and slightly desaturated compared to live sight,
   * using a single solid fill so we don't pay extra render cost.
   * @param {Object} map - The TacticalMap instance
   * @returns {string} CSS rgba color string
   */
  function computeExploredMemoryFill(map) {
    var BASELINE_OPACITY = 0.92;
    var EXTRA_DIMMING = 0.08;

    var ambient = map._ambientLight;
    if (!ambient || ambient.intensity >= 1) {
      return EXPLORED_MEMORY_FILL;
    }

    var ambientIntensity = clamp01(ambient.intensity);
    var ambientDarkness = 1 - ambientIntensity;
    var exploredOpacity = Math.max(BASELINE_OPACITY, Math.min(1, ambientDarkness + EXTRA_DIMMING));

    return (
      "rgba(" +
      EXPLORED_MEMORY_TINT_RGB.r + "," +
      EXPLORED_MEMORY_TINT_RGB.g + "," +
      EXPLORED_MEMORY_TINT_RGB.b + "," +
      exploredOpacity.toFixed(2) +
      ")"
    );
  }
  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : { r: 128, g: 144, b: 176 };
  }

  function apply(TacticalMap) {
    var proto = TacticalMap.prototype;

    proto.initFog = function initFog(fogConfig, isNarrator) {
      var normalizedConfig = normalizeFogConfig(fogConfig);
      this._fog = {
        config: normalizedConfig,
        isNarrator: !!isNarrator,
        dirty: true,
        polygons: [],
        dragPreview: null,
        offscreenCanvas: null,
        offscreenCtx: null,
        impersonateInstanceId: null,
        viewerInstanceIds: null,
        _bounds: null,
        // Per-token polygon cache: Map<instanceId, {poly, x, y, wallsHash}>
        perTokenPolygonCache: new Map(),
        // Hash of walls for invalidation detection
        wallsHash: null,
        // Set of instance IDs that need recalculation
        dirtyTokens: new Set(),
      };
      // Invalidate token visibility caches so they recompute with fresh fog state
      this._tokenFogCacheGeneration = -1;
      this._tokenFogTargetCache = {};
    };

    proto.setFogConfig = function (fogConfig) {
      if (!this._fog) this.initFog(fogConfig, true);
      this._fog.config = normalizeFogConfig(fogConfig || this._fog.config);
      this._fog.dirty = true;
      this._drawDirty = true;
    };

    proto.invalidateFog = function () {
      if (this._fog) this._fog.dirty = true;
      this._drawDirty = true;
    };

    /**
     * Invalidate fog visibility for a specific token/instance.
     * More efficient than full invalidation when only one token moved.
     * @param {string} instanceId - The instance ID to invalidate
     */
    proto.invalidateFogForToken = function (instanceId) {
      if (!this._fog) return;
      if (instanceId && this._fog.perTokenPolygonCache) {
        this._fog.perTokenPolygonCache.delete(instanceId);
      }
      if (this._fog.dirtyTokens) {
        this._fog.dirtyTokens.add(instanceId);
      }
      this._fog.dirty = true;
      this._drawDirty = true;
    };

    /**
     * Invalidate fog due to wall changes (doors opening, walls added/removed).
     * Clears the walls hash to force recalculation of all visibility polygons.
     */
    proto.invalidateFogWalls = function () {
      if (!this._fog) return;
      this._fog.wallsHash = null;
      if (this._fog.perTokenPolygonCache) {
        this._fog.perTokenPolygonCache.clear();
      }
      this._fog.dirty = true;
      this._drawDirty = true;
    };

    proto.getOverlayBounds = function () {
      return computeBounds(this);
    };

    proto.setFogViewerInstances = function (instanceIds) {
      if (!this._fog) return;
      this._fog.viewerInstanceIds = instanceIds || null;
      this._fog.dirty = true;
    };

    proto.setFogImpersonate = function (instanceId) {
      if (!this._fog) return;
      this._fog.impersonateInstanceId = instanceId || null;
      this._fog.dirty = true;
    };

    proto.beginFogDragPreview = function (instanceId) {
      if (!this._fog || !instanceId) return;
      this._fog.config = normalizeFogConfig(this._fog.config);
      this._fog.dragPreview = {
        instanceId: instanceId,
        pendingExploredAreas: [],
        pendingExploredBy: [],
      };
    };

    proto.commitFogDragPreview = function () {
      var fog = this._fog;
      if (!fog || !fog.dragPreview) return;
      var preview = fog.dragPreview;
      var config = normalizeFogConfig(fog.config);
      for (var i = 0; i < preview.pendingExploredAreas.length; i++) {
        pushUniquePolygon(config.exploredAreas, preview.pendingExploredAreas[i]);
      }
      if (!Array.isArray(config.exploredBy[preview.instanceId])) {
        config.exploredBy[preview.instanceId] = [];
      }
      for (var j = 0; j < preview.pendingExploredBy.length; j++) {
        pushUniquePolygon(config.exploredBy[preview.instanceId], preview.pendingExploredBy[j]);
      }
      // Compact explored areas on drop to prevent unbounded growth
      compactPolygonList(config.exploredAreas);
      compactPolygonList(config.exploredBy[preview.instanceId]);
      fog.config = config;
      fog.dragPreview = null;
    };

    proto.clearFogDragPreview = function () {
      if (!this._fog) return;
      this._fog.dragPreview = null;
    };

    proto.isPointVisibleToFogViewer = function (x, y) {
      var fog = this._fog;
      if (!fog || !fog.config || !fog.config.enabled) return true;
      var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
      if (!isPlayerView) return true;

      var config = normalizeFogConfig(fog.config);
      if (pointInAnyArea(x, y, config.hiddenAreas)) return false;
      if (pointInAnyArea(x, y, config.revealedAreas)) return true;
      if (config.mode === "manual") return false;
      return pointInAnyPolygon(x, y, fog.polygons);
    };

    proto.getFogVisibleState = function () {
      var fog = this._fog;
      var config = normalizeFogConfig(fog && fog.config);
      var isPlayerView = !!(fog && (!fog.isNarrator || !!fog.impersonateInstanceId));
      return {
        enabled: !!config.enabled,
        isPlayerView: isPlayerView,
        currentAreas: normalizeAreaList(fog && fog.polygons),
        revealedAreas: normalizeAreaList(config.revealedAreas),
        hiddenAreas: normalizeAreaList(config.hiddenAreas),
        exploredAreas: fog ? getExploredForViewer(config, fog) : [],
      };
    };

    /**
     * Main draw call — fog/LoS + exploration memory only.
     */
    proto.drawFogOfWar = function () {
      var fog = this._fog;
      var fogEnabled = fog && fog.config && fog.config.enabled;

      if (!fogEnabled) return;
      if (!fog) { this.initFog(null, true); fog = this._fog; }

      if (fog.dirty) {
        // Throttle full recalculation to max 12 times per second
        var now = Date.now();
        var FOG_THROTTLE_MS = 83;
        if (fog._lastFullRender && (now - fog._lastFullRender) < FOG_THROTTLE_MS) {
          // Skip recalc but still draw cached overlay
          var oc = fog.offscreenCanvas;
          if (oc && fog._bounds) {
            this.ctx.drawImage(oc, fog._bounds.minX * this.gridSize, fog._bounds.minY * this.gridSize);
          }
          return;
        }
        fog._lastFullRender = now;
        recomputeVisibility(this, fog);
        renderFogOverlay(this, fog);
        fog.dirty = false;
        fog._cacheGen = (fog._cacheGen || 0) + 1; // bump for token visibility cache
      }

      var oc = fog.offscreenCanvas;
      if (!oc || !fog._bounds) return;
      this.ctx.drawImage(oc, fog._bounds.minX * this.gridSize, fog._bounds.minY * this.gridSize);
    };
  }

  // ── Visibility computation with per-token caching ──

  /**
   * Compute a simple hash for walls to detect changes.
   */
  function computeWallsHash(walls) {
    if (!walls || walls.length === 0) return "0";
    var hash = walls.length + ":";
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!w) continue;
      hash +=
        (w.id || i) + "," +
        (w.type || "wall") + "," +
        (w.x1 || 0).toFixed(2) + "," +
        (w.y1 || 0).toFixed(2) + "," +
        (w.x2 || 0).toFixed(2) + "," +
        (w.y2 || 0).toFixed(2) + "," +
        (w.doorOpen ? 1 : 0) + ";";
    }
    return hash;
  }

  function recomputeVisibility(map, fog) {
    var config = normalizeFogConfig(fog.config);
    fog.config = config;
    if (config.mode === "manual") {
      fog.polygons = [];
      return;
    }
    if (!global.FogVisibility) { fog.polygons = []; return; }

    var walls = map.walls || [];
    var currentWallsHash = computeWallsHash(walls);
    var wallsChanged = currentWallsHash !== fog.wallsHash;
    fog.wallsHash = currentWallsHash;

    var perTokenCache = fog.perTokenPolygonCache || new Map();
    var dirtyTokens = fog.dirtyTokens || new Set();

    var pcTokens = [];
    var impersonate = fog.impersonateInstanceId;
    var viewerIds = fog.viewerInstanceIds;
    var instances = map.instances || [];
    var tokens = map.tokens || [];
    var viewerIdSet = viewerIds ? new Set(viewerIds) : null;

    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      var inst = null;
      for (var j = 0; j < instances.length; j++) {
        if (instances[j].id === token.instanceId) { inst = instances[j]; break; }
      }
      if (!inst || inst.status === "dead") continue;
      if (impersonate && impersonate !== "all") {
        if (inst.id === impersonate) pcTokens.push(token);
      } else if (viewerIdSet) {
        if (viewerIdSet.has(inst.id)) pcTokens.push(token);
      } else if (inst.isPC) {
        pcTokens.push(token);
      }
    }

    // Track active instance IDs for cache cleanup
    var activeInstanceIds = new Set();
    var polygons = [];
    var cacheHits = 0;
    var cacheMisses = 0;
    var dragPreview = fog.dragPreview || null;

    // Get spatial index if available
    var spatialIndex = map._wallSpatialIndex || null;

    for (var ti = 0; ti < pcTokens.length; ti++) {
      var token = pcTokens[ti];
      var instId = token.instanceId;
      activeInstanceIds.add(instId);

      var tSize = parseFloat(token.size) || 1;
      var tokenX = token.x + tSize * 0.5;
      var tokenY = token.y + tSize * 0.5;

      // Check if cached entry is still valid
      var cached = perTokenCache.get(instId);
      var needsRecalc = !cached ||
                        wallsChanged ||
                        dirtyTokens.has(instId) ||
                        cached.x !== tokenX ||
                        cached.y !== tokenY;

      var poly;
      if (needsRecalc) {
        cacheMisses++;
        // Use spatial index to get only relevant walls if available
        var visionRadius = 30; // DEFAULT_VISION_RADIUS from fog-visibility.js
        var relevantWalls = walls;
        if (spatialIndex) {
          relevantWalls = spatialIndex.queryCircle(tokenX, tokenY, visionRadius + 2);
        }
        poly = global.FogVisibility.computeVisibilityPolygon(tokenX, tokenY, relevantWalls, visionRadius);

        // Update cache
        perTokenCache.set(instId, {
          poly: poly,
          x: tokenX,
          y: tokenY,
          wallsHash: currentWallsHash,
        });
      } else {
        cacheHits++;
        poly = cached.poly;
      }

      if (!poly || poly.length < 3) continue;
      polygons.push(poly);

      // Only update explored areas when token actually moved (cache miss)
      // This prevents unbounded growth from repeated renders at same position
      if (!needsRecalc) continue;

      // Update explored areas
      if (dragPreview && dragPreview.instanceId === instId) {
        pushUniquePolygon(dragPreview.pendingExploredAreas, poly);
        pushUniquePolygon(dragPreview.pendingExploredBy, poly);
        continue;
      }
      if (!Array.isArray(config.exploredBy[instId])) config.exploredBy[instId] = [];
      pushUniquePolygon(config.exploredAreas, poly);
      pushUniquePolygon(config.exploredBy[instId], poly);
    }

    fog.polygons = polygons;

    // Clean up stale cache entries
    perTokenCache.forEach(function(_, key) {
      if (!activeInstanceIds.has(key)) {
        perTokenCache.delete(key);
      }
    });

    // Clear dirty tokens set after processing
    dirtyTokens.clear();

    // Debug logging (can be removed in production)
    if (cacheMisses > 0 && typeof console !== "undefined" && console.log) {
      console.log("[FogCache] Cache hits:", cacheHits, "/ Recalculados:", cacheMisses);
    }
  }

  // ── Fog overlay rendering ──

  function computeBounds(map) {
    var minX = -10, minY = -10, maxX = 50, maxY = 50;
    if (map.mapLayer) {
      var ml = map.mapLayer;
      maxX = Math.max(maxX, Math.ceil((ml.x || 0) + (ml.widthCells || 20)) + 5);
      maxY = Math.max(maxY, Math.ceil((ml.y || 0) + (ml.heightCells || 20)) + 5);
      minX = Math.min(minX, Math.floor(ml.x || 0) - 5);
      minY = Math.min(minY, Math.floor(ml.y || 0) - 5);
    }
    var items = (map.tokens || []).concat(map.lights || []);
    for (var i = 0; i < items.length; i++) {
      var t = items[i];
      var pad = t.radius ? Math.ceil(t.radius) + 2 : 8;
      maxX = Math.max(maxX, Math.ceil(t.x) + pad);
      maxY = Math.max(maxY, Math.ceil(t.y) + pad);
      minX = Math.min(minX, Math.floor(t.x) - pad);
      minY = Math.min(minY, Math.floor(t.y) - pad);
    }
    minX -= BLUR_PAD; minY -= BLUR_PAD; maxX += BLUR_PAD; maxY += BLUR_PAD;
    return { minX: minX, minY: minY, maxX: maxX, maxY: maxY };
  }

  function getExploredForViewer(config, fog) {
    var exploredBy = config.exploredBy || {};
    var dragPreview = fog && fog.dragPreview ? fog.dragPreview : null;
    // When impersonating a specific PC, show only that PC's explored area
    var impersonate = fog.impersonateInstanceId;
    if (impersonate && impersonate !== "all") {
      var impersonatedAreas = normalizeAreaList(exploredBy[impersonate]);
      return mergePreviewAreas(impersonatedAreas, dragPreview, [impersonate]);
    }
    var viewerIds = fog.viewerInstanceIds;
    if (!viewerIds) {
      return mergePreviewAreas(normalizeAreaList(config.exploredAreas), dragPreview, null);
    }
    var merged = [];
    for (var i = 0; i < viewerIds.length; i++) {
      var instExplored = normalizeAreaList(exploredBy[viewerIds[i]]);
      if (!instExplored) continue;
      for (var j = 0; j < instExplored.length; j++) {
        merged.push(cloneArea(instExplored[j]));
      }
    }
    return mergePreviewAreas(merged, dragPreview, viewerIds);
  }

  function mergePreviewAreas(baseAreas, dragPreview, viewerIds) {
    var merged = normalizeAreaList(baseAreas);
    if (!dragPreview || !Array.isArray(dragPreview.pendingExploredAreas)) return merged;
    if (Array.isArray(viewerIds) && viewerIds.length > 0) {
      if (viewerIds.indexOf(dragPreview.instanceId) === -1) return merged;
    }
    for (var i = 0; i < dragPreview.pendingExploredAreas.length; i++) {
      pushArea(merged, dragPreview.pendingExploredAreas[i]);
    }
    return merged;
  }

  function renderFogOverlay(map, fog) {
    var config = fog.config || {};
    var gs = map.gridSize;
    var isNarrator = fog.isNarrator;
    var isPlayerView = !isNarrator || !!fog.impersonateInstanceId;
    var fogEnabled = !!(config.enabled);

    var bounds = computeBounds(map);
    fog._bounds = bounds;
    var pxW = Math.min((bounds.maxX - bounds.minX) * gs, 12000);
    var pxH = Math.min((bounds.maxY - bounds.minY) * gs, 12000);

    var oc = fog.offscreenCanvas;
    if (!oc) { oc = document.createElement("canvas"); fog.offscreenCanvas = oc; fog.offscreenCtx = oc.getContext("2d"); }
    if (oc.width !== pxW || oc.height !== pxH) { oc.width = pxW; oc.height = pxH; }

    var ctx = fog.offscreenCtx;
    var offX = -bounds.minX * gs;
    var offY = -bounds.minY * gs;
    ctx.clearRect(0, 0, pxW, pxH);

    config = normalizeFogConfig(config);
    var exploredAreas = getExploredForViewer(config, fog);
    var revealedAreas = normalizeAreaList(config.revealedAreas);
    var hiddenAreas = normalizeAreaList(config.hiddenAreas);

    if (isPlayerView) {
      var fogTmp = fog._fogTmpCanvas;
      var fCtx = fog._fogTmpCtx;
      if (!fogTmp) {
        fogTmp = document.createElement("canvas");
        fog._fogTmpCanvas = fogTmp;
        fCtx = fogTmp.getContext("2d");
        fog._fogTmpCtx = fCtx;
      }
      if (fogTmp.width !== pxW || fogTmp.height !== pxH) {
        fogTmp.width = pxW; fogTmp.height = pxH;
      }

      fCtx.clearRect(0, 0, pxW, pxH);
      fCtx.fillStyle = "rgba(0,0,0,1)";
      fCtx.fillRect(0, 0, pxW, pxH);

      if (exploredAreas.length > 0) {
        fCtx.save();
        fCtx.globalCompositeOperation = "destination-out";
        fillAreas(fCtx, exploredAreas, gs, offX, offY, "rgba(255,255,255,1)");
        fCtx.restore();

        // Explored memory stays visible as a dark, neutral-tinted layer so it
        // reads as recollection rather than live sight, and never looks more
        // illuminated than the currently visible cone.
        var exploredFill = computeExploredMemoryFill(map);
        fCtx.save();
        fCtx.globalCompositeOperation = "source-over";
        fillAreas(fCtx, exploredAreas, gs, offX, offY, exploredFill);
        fCtx.restore();
      }

      if (fog.polygons && fog.polygons.length > 0) {
        fCtx.save();
        fCtx.globalCompositeOperation = "destination-out";
        try { fCtx.filter = "blur(" + BLUR_RADIUS + "px)"; } catch (_e) {}
        fillAreas(fCtx, fog.polygons, gs, offX, offY, "rgba(255,255,255,1)");
        fCtx.restore();
      }

      if (revealedAreas.length > 0) {
        fCtx.save();
        fCtx.globalCompositeOperation = "destination-out";
        fillAreas(fCtx, revealedAreas, gs, offX, offY, "rgba(255,255,255,1)");
        fCtx.restore();
      }

      if (hiddenAreas.length > 0) {
        fCtx.save();
        fCtx.globalCompositeOperation = "source-over";
        fillAreas(fCtx, hiddenAreas, gs, offX, offY, "rgba(0,0,0,1)");
        fCtx.restore();
      }

      ctx.drawImage(fogTmp, 0, 0);
    }

    if (isNarrator && !fog.impersonateInstanceId) {
      drawManualOverrides(ctx, config, gs, offX, offY);
    }
  }

  function drawManualOverrides(ctx, config, gs, offX, offY) {
    config = normalizeFogConfig(config);
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(46, 166, 99, 0.6)";
    strokeAreas(ctx, config.revealedAreas, gs, offX, offY);
    ctx.strokeStyle = "rgba(207, 95, 95, 0.6)";
    strokeAreas(ctx, config.hiddenAreas, gs, offX, offY);
    ctx.restore();
  }

  // ── Fog brush hover ──
  function addFogBrushHover(TacticalMap) {
    TacticalMap.prototype.drawFogBrushHover = function () {
      var hover = this._fogBrushHover;
      if (!hover) return;
      var ctx = this.ctx;
      var gs = this.gridSize;
      var size = hover.size || 1;
      var half = size * 0.5;
      var x = (hover.x - half) * gs;
      var y = (hover.y - half) * gs;
      ctx.save();
      ctx.strokeStyle = hover.type === "reveal" ? "rgba(46, 166, 99, 0.7)" : "rgba(207, 95, 95, 0.7)";
      ctx.lineWidth = 2 / Math.max(this.scale, 0.5);
      ctx.setLineDash([4 / Math.max(this.scale, 0.5), 4 / Math.max(this.scale, 0.5)]);
      ctx.strokeRect(x, y, size * gs, size * gs);
      ctx.setLineDash([]);
      ctx.restore();
    };
  }

  var _origApply = apply;
  apply = function (TacticalMap) {
    _origApply(TacticalMap);
    addFogBrushHover(TacticalMap);
  };

  function normalizeFogConfig(config) {
    var normalized = config || {};
    if (normalized.enabled == null) normalized.enabled = false;
    if (!normalized.mode) normalized.mode = "auto";
    if (!Number.isFinite(parseInt(normalized.resetVersion, 10))) normalized.resetVersion = 0;

    normalized.revealedAreas = normalizeAreaList(normalized.revealedAreas);
    normalized.hiddenAreas = normalizeAreaList(normalized.hiddenAreas);
    normalized.exploredAreas = normalizeAreaList(normalized.exploredAreas);

    var rawExploredBy =
      normalized.exploredBy && typeof normalized.exploredBy === "object" && !Array.isArray(normalized.exploredBy)
        ? normalized.exploredBy
        : {};
    normalized.exploredBy = {};
    for (var instId in rawExploredBy) {
      var normalizedAreas = normalizeAreaList(rawExploredBy[instId]);
      migrateLegacyCellMap(rawExploredBy[instId], normalizedAreas);
      normalized.exploredBy[instId] = normalizedAreas;
    }

    migrateLegacyCellMap(normalized.revealed, normalized.revealedAreas);
    migrateLegacyCellMap(normalized.hidden, normalized.hiddenAreas);
    migrateLegacyCellMap(normalized.explored, normalized.exploredAreas);

    delete normalized.revealed;
    delete normalized.hidden;
    delete normalized.explored;
    return normalized;
  }

  function migrateLegacyCellMap(source, target) {
    if (!source || typeof source !== "object" || Array.isArray(source)) return;
    for (var key in source) {
      if (!source[key] || key.indexOf(",") === -1) continue;
      var parts = key.split(",");
      var x = parseFloat(parts[0]);
      var y = parseFloat(parts[1]);
      if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
      pushArea(target, { type: "rect", x: x, y: y, width: 1, height: 1 });
    }
  }

  function normalizeAreaList(list) {
    if (!Array.isArray(list)) return [];
    var normalized = [];
    for (var i = 0; i < list.length; i++) {
      var area = normalizeArea(list[i]);
      if (area) normalized.push(area);
    }
    return normalized;
  }

  function normalizeArea(area) {
    if (!area) return null;
    if (Array.isArray(area)) {
      var poly = [];
      for (var i = 0; i < area.length; i++) {
        var point = area[i];
        if (!point) continue;
        var x = parseFloat(point.x);
        var y = parseFloat(point.y);
        if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
        poly.push({ x: x, y: y });
      }
      return poly.length >= 3 ? poly : null;
    }
    if (area.type === "rect") {
      var rx = parseFloat(area.x);
      var ry = parseFloat(area.y);
      var rw = parseFloat(area.width);
      var rh = parseFloat(area.height);
      if (!Number.isFinite(rx) || !Number.isFinite(ry) || !Number.isFinite(rw) || !Number.isFinite(rh)) return null;
      if (rw <= 0 || rh <= 0) return null;
      return { type: "rect", x: rx, y: ry, width: rw, height: rh };
    }
    return null;
  }

  function cloneArea(area) {
    if (Array.isArray(area)) {
      return area.map(function (point) { return { x: point.x, y: point.y }; });
    }
    return {
      type: area.type,
      x: area.x,
      y: area.y,
      width: area.width,
      height: area.height,
    };
  }

  function pushArea(list, area) {
    var normalized = normalizeArea(area);
    if (!normalized) return;
    if (Array.isArray(normalized)) {
      pushUniquePolygon(list, normalized);
      return;
    }
    for (var i = 0; i < list.length; i++) {
      var existing = list[i];
      if (!existing || Array.isArray(existing)) continue;
      if (Math.abs(existing.x - normalized.x) < 0.001 &&
          Math.abs(existing.y - normalized.y) < 0.001 &&
          Math.abs(existing.width - normalized.width) < 0.001 &&
          Math.abs(existing.height - normalized.height) < 0.001) {
        return;
      }
    }
    list.push(normalized);
  }

  // Tolerance for considering two polygons as duplicates:
  // - CENTROID_DIST_SQ_THRESHOLD: squared distance between centroids (1.5^2 = 2.25 units = ~2.25m)
  // - AREA_DELTA_THRESHOLD: absolute difference in area
  var CENTROID_DIST_SQ_THRESHOLD = 2.25;
  var AREA_DELTA_THRESHOLD = 5.0;
  // Maximum polygons per list before triggering auto-compaction
  var MAX_POLYGONS_BEFORE_COMPACT = 150;

  function pushUniquePolygon(list, polygon) {
    var normalized = normalizeArea(polygon);
    if (!normalized || !Array.isArray(normalized)) return;
    var normalizedArea = polygonArea(normalized);
    var normalizedCentroid = polygonCentroid(normalized);
    for (var i = 0; i < list.length; i++) {
      var existing = list[i];
      if (!Array.isArray(existing)) continue;
      var areaDelta = Math.abs(polygonArea(existing) - normalizedArea);
      var centroid = polygonCentroid(existing);
      var dx = centroid.x - normalizedCentroid.x;
      var dy = centroid.y - normalizedCentroid.y;
      if (areaDelta < AREA_DELTA_THRESHOLD && dx * dx + dy * dy < CENTROID_DIST_SQ_THRESHOLD) return;
    }
    list.push(normalized);
    // Auto-compact if list grows too large
    if (list.length > MAX_POLYGONS_BEFORE_COMPACT) {
      compactPolygonList(list);
    }
  }

  // Compact a polygon list by merging nearby polygons
  function compactPolygonList(list) {
    if (!Array.isArray(list) || list.length < 20) return;

    // Build spatial buckets (grid of 3x3 units)
    var BUCKET_SIZE = 3;
    var buckets = {};

    for (var i = 0; i < list.length; i++) {
      var poly = list[i];
      if (!Array.isArray(poly)) continue;
      var c = polygonCentroid(poly);
      var bx = Math.floor(c.x / BUCKET_SIZE);
      var by = Math.floor(c.y / BUCKET_SIZE);
      var key = bx + "," + by;
      if (!buckets[key]) buckets[key] = [];
      buckets[key].push({ poly: poly, area: polygonArea(poly), centroid: c, index: i });
    }

    // For each bucket, keep only the largest polygon (covers most area)
    var keep = new Set();
    for (var key in buckets) {
      var bucket = buckets[key];
      if (bucket.length === 1) {
        keep.add(bucket[0].index);
        continue;
      }
      // Sort by area descending, keep largest
      bucket.sort(function(a, b) { return b.area - a.area; });
      keep.add(bucket[0].index);
      // Keep a few more if they're significantly different in position
      for (var j = 1; j < bucket.length && j < 3; j++) {
        var dx = bucket[j].centroid.x - bucket[0].centroid.x;
        var dy = bucket[j].centroid.y - bucket[0].centroid.y;
        if (dx * dx + dy * dy > 1.0) {
          keep.add(bucket[j].index);
        }
      }
    }

    // Rebuild list in place
    var newList = [];
    for (var i = 0; i < list.length; i++) {
      if (keep.has(i)) newList.push(list[i]);
    }
    list.length = 0;
    for (var i = 0; i < newList.length; i++) {
      list.push(newList[i]);
    }

    if (typeof console !== "undefined" && console.log) {
      console.log("[FogCompact] Compacted from", keep.size, "kept of original, now", list.length, "polygons");
    }
  }

  function polygonArea(poly) {
    var area = 0;
    for (var i = 0; i < poly.length; i++) {
      var next = poly[(i + 1) % poly.length];
      area += poly[i].x * next.y - next.x * poly[i].y;
    }
    return Math.abs(area * 0.5);
  }

  function polygonCentroid(poly) {
    var sumX = 0;
    var sumY = 0;
    for (var i = 0; i < poly.length; i++) {
      sumX += poly[i].x;
      sumY += poly[i].y;
    }
    return { x: sumX / poly.length, y: sumY / poly.length };
  }

  function pointInAnyPolygon(x, y, polygons) {
    if (!window.FogVisibility || typeof window.FogVisibility.pointInPolygon !== "function") return false;
    if (!Array.isArray(polygons)) return false;
    for (var i = 0; i < polygons.length; i++) {
      var poly = polygons[i];
      if (!Array.isArray(poly) || poly.length < 3) continue;
      if (window.FogVisibility.pointInPolygon(x, y, poly)) return true;
    }
    return false;
  }

  function pointInAnyArea(x, y, areas) {
    var list = normalizeAreaList(areas);
    for (var i = 0; i < list.length; i++) {
      var area = list[i];
      if (Array.isArray(area)) {
        if (pointInAnyPolygon(x, y, [area])) return true;
      } else if (x >= area.x && x <= area.x + area.width && y >= area.y && y <= area.y + area.height) {
        return true;
      }
    }
    return false;
  }

  function fillAreas(ctx, areas, gs, offX, offY, fillStyle) {
    var list = normalizeAreaList(areas);
    if (!list.length) return;
    ctx.fillStyle = fillStyle;
    ctx.beginPath();
    appendAreasPath(ctx, list, gs, offX, offY);
    ctx.fill();
  }

  function strokeAreas(ctx, areas, gs, offX, offY) {
    var list = normalizeAreaList(areas);
    if (!list.length) return;
    ctx.beginPath();
    appendAreasStrokePath(ctx, list, gs, offX, offY);
    ctx.stroke();
  }

  function appendAreasPath(ctx, areas, gs, offX, offY) {
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (Array.isArray(area)) {
        ctx.moveTo(area[0].x * gs + offX, area[0].y * gs + offY);
        for (var j = 1; j < area.length; j++) {
          ctx.lineTo(area[j].x * gs + offX, area[j].y * gs + offY);
        }
        ctx.closePath();
      } else {
        ctx.rect(area.x * gs + offX, area.y * gs + offY, area.width * gs, area.height * gs);
      }
    }
  }

  function appendAreasStrokePath(ctx, areas, gs, offX, offY) {
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (Array.isArray(area)) {
        ctx.moveTo(area[0].x * gs + offX, area[0].y * gs + offY);
        for (var j = 1; j < area.length; j++) {
          ctx.lineTo(area[j].x * gs + offX, area[j].y * gs + offY);
        }
        ctx.closePath();
      } else {
        ctx.rect(area.x * gs + offX + 1, area.y * gs + offY + 1, area.width * gs - 2, area.height * gs - 2);
      }
    }
  }

  global.__applyTacticalMapFogRenderer = apply;
  if (global.TacticalMap) { apply(global.TacticalMap); }
})(window);
