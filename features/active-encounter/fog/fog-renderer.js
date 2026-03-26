// Combined Fog + Lighting overlay for TacticalMap.
// A SINGLE offscreen canvas handles both visibility (fog) and illumination (lights).
// This avoids the stacking problem of two separate overlays.
(function applyFogRenderer(global) {
  "use strict";

  var BLUR_RADIUS = 6;
  var BLUR_PAD = 2;
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
        offscreenCanvas: null,
        offscreenCtx: null,
        impersonateInstanceId: null,
        viewerInstanceIds: null,
        _bounds: null,
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

    /**
     * Main draw call — the COMBINED overlay for fog + lighting.
     * Always renders if there are lights OR fog is enabled.
     */
    proto.drawFogOfWar = function () {
      var fog = this._fog;
      var hasLights = this.lights && this.lights.length > 0;
      var ambient = this._ambientLight;
      var hasAmbient = ambient && ambient.intensity < 1; // less than 100% = some darkness
      var fogEnabled = fog && fog.config && fog.config.enabled;

      // Nothing to render if no fog and no lighting to apply
      if (!fogEnabled && !hasLights && !hasAmbient) return;
      if (!fog) { this.initFog(null, true); fog = this._fog; }

      if (fog.dirty) {
        if (fogEnabled) recomputeVisibility(this, fog);
        renderCombinedOverlay(this, fog);
        fog.dirty = false;
        fog._cacheGen = (fog._cacheGen || 0) + 1; // bump for token visibility cache
      }

      var oc = fog.offscreenCanvas;
      if (!oc || !fog._bounds) return;
      this.ctx.drawImage(oc, fog._bounds.minX * this.gridSize, fog._bounds.minY * this.gridSize);
    };
  }

  // ── Visibility computation (unchanged) ──

  function recomputeVisibility(map, fog) {
    var config = normalizeFogConfig(fog.config);
    fog.config = config;
    if (config.mode === "manual") {
      fog.polygons = [];
      return;
    }
    if (!global.FogVisibility) { fog.polygons = []; return; }

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

    var result = global.FogVisibility.computeVisibility(pcTokens, map.walls || []);
    fog.polygons = result.polygons;

    if (isPreviewDraggingPC(map)) {
      return;
    }

    for (var ti = 0; ti < pcTokens.length; ti++) {
      var instId = pcTokens[ti].instanceId;
      var poly = result.perTokenPolygons ? result.perTokenPolygons[ti] : null;
      if (!poly || poly.length < 3) continue;
      if (!Array.isArray(config.exploredBy[instId])) config.exploredBy[instId] = [];
      pushUniquePolygon(config.exploredAreas, poly);
      pushUniquePolygon(config.exploredBy[instId], poly);
    }
  }

  // ── Combined overlay rendering ──

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
    // When impersonating a specific PC, show only that PC's explored area
    var impersonate = fog.impersonateInstanceId;
    if (impersonate && impersonate !== "all") {
      return normalizeAreaList(exploredBy[impersonate]);
    }
    var viewerIds = fog.viewerInstanceIds;
    if (!viewerIds) return normalizeAreaList(config.exploredAreas);
    var merged = [];
    for (var i = 0; i < viewerIds.length; i++) {
      var instExplored = normalizeAreaList(exploredBy[viewerIds[i]]);
      if (!instExplored) continue;
      for (var j = 0; j < instExplored.length; j++) {
        merged.push(cloneArea(instExplored[j]));
      }
    }
    return merged;
  }

  function isPreviewDraggingPC(map) {
    if (!map || !map.isDraggingToken || !map.draggedToken) return false;
    var dragged = map.draggedToken;
    if (!dragged.instanceId) return false;
    var instances = map.instances || [];
    for (var i = 0; i < instances.length; i++) {
      if (instances[i].id === dragged.instanceId) {
        return !!instances[i].isPC;
      }
    }
    return false;
  }

  function renderCombinedOverlay(map, fog) {
    var config = fog.config || {};
    var gs = map.gridSize;
    var isNarrator = fog.isNarrator;
    var isPlayerView = !isNarrator || !!fog.impersonateInstanceId;
    var fogEnabled = !!(config.enabled);
    var ambient = map._ambientLight || { intensity: 0.5, color: "#8090b0" };
    var ambientI = Math.min(1, Math.max(0, ambient.intensity != null ? ambient.intensity : 0.5));
    var rooms = map._rooms || [];
    var lights = map.lights || [];
    var walls = map.walls || [];

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

    // ══════════════════════════════════════════════════
    // STEP 1: Fill with full darkness (opacity 1.0)
    // Everything starts pitch black.
    // ══════════════════════════════════════════════════
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fillRect(0, 0, pxW, pxH);

    // ══════════════════════════════════════════════════
    // STEP 2: Ambient light — polygon-based rooms
    // ══════════════════════════════════════════════════
    if (ambientI > 0.001) {
      // 2a: Apply ambient to the entire canvas (global outdoor light)
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255," + ambientI + ")";
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();

      // 2b: Re-darken room polygons (rooms override outdoor ambient with their own)
      if (rooms.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (var ri = 0; ri < rooms.length; ri++) {
          var room = rooms[ri], poly = room.polygon;
          if (!poly || poly.length < 3) continue;
          var roomAmbI = (room.ambientLight && room.ambientLight.intensity != null)
            ? Math.min(1, Math.max(0, room.ambientLight.intensity)) : 0;
          var darken = ambientI - roomAmbI;
          if (darken < 0.005) continue;
          ctx.fillStyle = "rgba(0,0,0," + darken + ")";
          ctx.beginPath();
          ctx.moveTo(poly[0].x * gs + offX, poly[0].y * gs + offY);
          for (var pk = 1; pk < poly.length; pk++)
            ctx.lineTo(poly[pk].x * gs + offX, poly[pk].y * gs + offY);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      // Ambient color tint (global)
      var aRgb = hexToRgb(ambient.color || "#8090b0");
      var tintAlpha = ambientI * 0.05;
      if (tintAlpha > 0.005) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(" + aRgb.r + "," + aRgb.g + "," + aRgb.b + "," + tintAlpha + ")";
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.restore();

        // Suppress global tint inside rooms, then apply room's own tint
        if (rooms.length > 0) {
          // Remove global tint inside rooms
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          for (var ri = 0; ri < rooms.length; ri++) {
            var room = rooms[ri], poly = room.polygon;
            if (!poly || poly.length < 3) continue;
            ctx.fillStyle = "rgba(255,255,255," + tintAlpha + ")";
            ctx.beginPath();
            ctx.moveTo(poly[0].x * gs + offX, poly[0].y * gs + offY);
            for (var pk = 1; pk < poly.length; pk++)
              ctx.lineTo(poly[pk].x * gs + offX, poly[pk].y * gs + offY);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();

          // Apply each room's own ambient tint
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          for (var ri = 0; ri < rooms.length; ri++) {
            var room = rooms[ri], poly = room.polygon;
            if (!poly || poly.length < 3) continue;
            var roomAmbI = (room.ambientLight && room.ambientLight.intensity != null)
              ? Math.min(1, Math.max(0, room.ambientLight.intensity)) : 0;
            if (roomAmbI < 0.005) continue;
            var roomColor = (room.ambientLight && room.ambientLight.color) || "#8090b0";
            var rRgb = hexToRgb(roomColor);
            var roomTint = roomAmbI * 0.05;
            ctx.fillStyle = "rgba(" + rRgb.r + "," + rRgb.g + "," + rRgb.b + "," + roomTint + ")";
            ctx.beginPath();
            ctx.moveTo(poly[0].x * gs + offX, poly[0].y * gs + offY);
            for (var pk = 1; pk < poly.length; pk++)
              ctx.lineTo(poly[pk].x * gs + offX, poly[pk].y * gs + offY);
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }
      }
    }

    // ══════════════════════════════════════════════════
    // STEP 3: Focal lights — reduce darkness within polygons
    // Compute each light polygon ONCE and reuse for both
    // the darkness removal pass and the color tint pass.
    // ══════════════════════════════════════════════════
    map._cachedLightPolygons = [];
    if (lights.length > 0 && global.AELightVisibility) {
      // Pre-compute light polygons and derived values
      var lightCache = [];
      for (var li = 0; li < lights.length; li++) {
        var light = lights[li];
        if (light.on === false) continue;
        var lr = light.radius || 4;
        var lI = Math.min(1, Math.max(0, light.intensity != null ? light.intensity : 0.8));
        var lpoly = global.AELightVisibility.computeLightPolygon(light.x, light.y, walls, lr);
        if (!lpoly || lpoly.length < 3) continue;
        lightCache.push({ light: light, poly: lpoly, radius: lr, intensity: lI });
      }

      // Expose cached light polygons for token luminosity computation
      map._cachedLightPolygons = lightCache;

      // Pass 1: darkness removal
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      for (var li = 0; li < lightCache.length; li++) {
        var lc = lightCache[li];
        var lcx = lc.light.x * gs + offX;
        var lcy = lc.light.y * gs + offY;
        var lrpx = lc.radius * gs;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lc.poly[0].x * gs + offX, lc.poly[0].y * gs + offY);
        for (var lk = 1; lk < lc.poly.length; lk++) {
          ctx.lineTo(lc.poly[lk].x * gs + offX, lc.poly[lk].y * gs + offY);
        }
        ctx.closePath();
        ctx.clip();

        var grad = ctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lrpx);
        grad.addColorStop(0, "rgba(255,255,255," + lc.intensity + ")");
        grad.addColorStop(0.5, "rgba(255,255,255," + (lc.intensity * 0.6) + ")");
        grad.addColorStop(0.85, "rgba(255,255,255," + (lc.intensity * 0.15) + ")");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(lcx - lrpx, lcy - lrpx, lrpx * 2, lrpx * 2);
        ctx.restore();
      }
      ctx.restore();

      // Pass 2: color tints (reuses cached polygons)
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      for (var li = 0; li < lightCache.length; li++) {
        var lc = lightCache[li];
        var lcx = lc.light.x * gs + offX;
        var lcy = lc.light.y * gs + offY;
        var lrpx = lc.radius * gs;
        var ltAlpha = lc.intensity * 0.08;
        var lRgb = hexToRgb(lc.light.color || "#ffcc66");

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lc.poly[0].x * gs + offX, lc.poly[0].y * gs + offY);
        for (var lk = 1; lk < lc.poly.length; lk++) {
          ctx.lineTo(lc.poly[lk].x * gs + offX, lc.poly[lk].y * gs + offY);
        }
        ctx.closePath();
        ctx.clip();

        var tGrad = ctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lrpx);
        tGrad.addColorStop(0, "rgba(" + lRgb.r + "," + lRgb.g + "," + lRgb.b + "," + ltAlpha + ")");
        tGrad.addColorStop(0.7, "rgba(" + lRgb.r + "," + lRgb.g + "," + lRgb.b + "," + (ltAlpha * 0.3) + ")");
        tGrad.addColorStop(1, "rgba(" + lRgb.r + "," + lRgb.g + "," + lRgb.b + ",0)");
        ctx.fillStyle = tGrad;
        ctx.fillRect(lcx - lrpx, lcy - lrpx, lrpx * 2, lrpx * 2);
        ctx.restore();
      }
      ctx.restore();
    }

    // ══════════════════════════════════════════════════
    // STEP 4: Narrator minimum — always sees at least 10%
    // ══════════════════════════════════════════════════
    if (isNarrator && !fog.impersonateInstanceId) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();
    }

    // ══════════════════════════════════════════════════
    // STEP 5: Fog masking — re-darken non-visible areas
    // Only if fog is enabled. This OVERWRITES the lighting
    // for areas the viewer can't see.
    // ══════════════════════════════════════════════════
    if (fogEnabled) {
      config = normalizeFogConfig(config);
      var previewDraggingPC = isPreviewDraggingPC(map);
      var exploredAreas = previewDraggingPC ? [] : getExploredForViewer(config, fog);
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
          fillAreas(fCtx, exploredAreas, gs, offX, offY, "rgba(255,255,255,0.55)");
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
      // Narrator normal view: no fog masking — only sees lighting (Steps 1-4)

      // Manual override indicators (narrator only)
      if (isNarrator && !fog.impersonateInstanceId) {
        drawManualOverrides(ctx, config, gs, offX, offY);
      }
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

  function pushUniquePolygon(list, polygon) {
    var normalized = normalizeArea(polygon);
    if (!normalized || !Array.isArray(normalized)) return;
    var normalizedArea = polygonArea(normalized);
    var normalizedCentroid = polygonCentroid(normalized);
    for (var i = 0; i < list.length; i++) {
      var existing = list[i];
      if (!Array.isArray(existing) || existing.length !== normalized.length) continue;
      var areaDelta = Math.abs(polygonArea(existing) - normalizedArea);
      var centroid = polygonCentroid(existing);
      var dx = centroid.x - normalizedCentroid.x;
      var dy = centroid.y - normalizedCentroid.y;
      if (areaDelta < 0.2 && dx * dx + dy * dy < 0.04) return;
    }
    list.push(normalized);
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
    ctx.fillStyle = fillStyle;
    for (var i = 0; i < list.length; i++) {
      var area = list[i];
      if (Array.isArray(area)) {
        ctx.beginPath();
        ctx.moveTo(area[0].x * gs + offX, area[0].y * gs + offY);
        for (var j = 1; j < area.length; j++) {
          ctx.lineTo(area[j].x * gs + offX, area[j].y * gs + offY);
        }
        ctx.closePath();
        ctx.fill();
      } else {
        ctx.fillRect(area.x * gs + offX, area.y * gs + offY, area.width * gs, area.height * gs);
      }
    }
  }

  function strokeAreas(ctx, areas, gs, offX, offY) {
    var list = normalizeAreaList(areas);
    for (var i = 0; i < list.length; i++) {
      var area = list[i];
      if (Array.isArray(area)) {
        ctx.beginPath();
        ctx.moveTo(area[0].x * gs + offX, area[0].y * gs + offY);
        for (var j = 1; j < area.length; j++) {
          ctx.lineTo(area[j].x * gs + offX, area[j].y * gs + offY);
        }
        ctx.closePath();
        ctx.stroke();
      } else {
        ctx.strokeRect(area.x * gs + offX + 1, area.y * gs + offY + 1, area.width * gs - 2, area.height * gs - 2);
      }
    }
  }

  global.__applyTacticalMapFogRenderer = apply;
  if (global.TacticalMap) { apply(global.TacticalMap); }
})(window);
