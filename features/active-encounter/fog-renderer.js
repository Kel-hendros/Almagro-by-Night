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
      this._fog = {
        config: fogConfig || { enabled: false, mode: "auto", revealed: {}, hidden: {}, explored: {} },
        isNarrator: !!isNarrator,
        dirty: true,
        polygons: [],
        visibleCells: new Set(),
        offscreenCanvas: null,
        offscreenCtx: null,
        impersonateInstanceId: null,
        viewerInstanceIds: null,
        _bounds: null,
      };
    };

    proto.setFogConfig = function (fogConfig) {
      if (!this._fog) this.initFog(fogConfig, true);
      this._fog.config = fogConfig || this._fog.config;
      this._fog.dirty = true;
    };

    proto.invalidateFog = function () {
      if (this._fog) this._fog.dirty = true;
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
      }

      var oc = fog.offscreenCanvas;
      if (!oc || !fog._bounds) return;
      this.ctx.drawImage(oc, fog._bounds.minX * this.gridSize, fog._bounds.minY * this.gridSize);
    };
  }

  // ── Visibility computation (unchanged) ──

  function recomputeVisibility(map, fog) {
    var config = fog.config;
    if (config.mode === "manual") {
      fog.polygons = [];
      fog.visibleCells = new Set();
      var revealed = config.revealed || {};
      for (var key in revealed) { if (revealed[key]) fog.visibleCells.add(key); }
      return;
    }
    if (!global.FogVisibility) { fog.polygons = []; fog.visibleCells = new Set(); return; }

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

    var result = global.FogVisibility.computeVisibility(pcTokens, map.walls || [], 15);
    fog.polygons = result.polygons;
    fog.visibleCells = result.cells;

    if (!config.exploredBy) config.exploredBy = {};
    if (!config.explored) config.explored = {};
    var contributingIds = pcTokens.map(function (t) { return t.instanceId; });
    for (var ci = 0; ci < contributingIds.length; ci++) {
      if (!config.exploredBy[contributingIds[ci]]) config.exploredBy[contributingIds[ci]] = {};
    }
    result.cells.forEach(function (key) {
      config.explored[key] = true;
      for (var ci = 0; ci < contributingIds.length; ci++) {
        config.exploredBy[contributingIds[ci]][key] = true;
      }
    });

    var revealed = config.revealed || {};
    var hidden = config.hidden || {};
    for (var rKey in revealed) { if (revealed[rKey]) fog.visibleCells.add(rKey); }
    for (var hKey in hidden) { if (hidden[hKey]) fog.visibleCells.delete(hKey); }
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
    var viewerIds = fog.viewerInstanceIds;
    if (!viewerIds) return config.explored || {};
    var merged = {};
    for (var i = 0; i < viewerIds.length; i++) {
      var instExplored = exploredBy[viewerIds[i]];
      if (!instExplored) continue;
      for (var key in instExplored) { if (instExplored[key]) merged[key] = true; }
    }
    return merged;
  }

  function renderCombinedOverlay(map, fog) {
    var config = fog.config || {};
    var gs = map.gridSize;
    var isNarrator = fog.isNarrator;
    var isPlayerView = !isNarrator || !!fog.impersonateInstanceId;
    var fogEnabled = !!(config.enabled);
    var ambient = map._ambientLight || { intensity: 0.5, color: "#8090b0" };
    var ambientI = Math.min(1, Math.max(0, ambient.intensity != null ? ambient.intensity : 0.5));
    var indoorCells = map._indoorCells;
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
    // STEP 2: Ambient light — reduce darkness for OUTDOOR cells
    // ══════════════════════════════════════════════════
    if (ambientI > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255," + ambientI + ")";
      if (indoorCells && indoorCells.size > 0) {
        for (var cy = bounds.minY; cy < bounds.maxY; cy++) {
          for (var cx = bounds.minX; cx < bounds.maxX; cx++) {
            if (indoorCells.has(cx + "," + cy)) continue;
            ctx.fillRect(cx * gs + offX, cy * gs + offY, gs, gs);
          }
        }
      } else {
        ctx.fillRect(0, 0, pxW, pxH);
      }
      ctx.restore();

      // Ambient color tint on outdoor cells
      var aRgb = hexToRgb(ambient.color || "#8090b0");
      var tintAlpha = ambientI * 0.05;
      if (tintAlpha > 0.005) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(" + aRgb.r + "," + aRgb.g + "," + aRgb.b + "," + tintAlpha + ")";
        if (indoorCells && indoorCells.size > 0) {
          for (var cy = bounds.minY; cy < bounds.maxY; cy++) {
            for (var cx = bounds.minX; cx < bounds.maxX; cx++) {
              if (indoorCells.has(cx + "," + cy)) continue;
              ctx.fillRect(cx * gs + offX, cy * gs + offY, gs, gs);
            }
          }
        } else {
          ctx.fillRect(0, 0, pxW, pxH);
        }
        ctx.restore();
      }
    }

    // ══════════════════════════════════════════════════
    // STEP 3: Focal lights — reduce darkness within polygons
    // ══════════════════════════════════════════════════
    if (lights.length > 0 && global.FogVisibility) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      for (var li = 0; li < lights.length; li++) {
        var light = lights[li];
        if (light.on === false) continue; // switched off — no illumination
        var lr = light.radius || 4;
        var lI = Math.min(1, Math.max(0, light.intensity != null ? light.intensity : 0.8));
        var lpoly = global.FogVisibility.computeVisibilityPolygon(light.x, light.y, walls, lr);
        if (!lpoly || lpoly.length < 3) continue;

        var lcx = light.x * gs + offX;
        var lcy = light.y * gs + offY;
        var lrpx = lr * gs;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lpoly[0].x * gs + offX, lpoly[0].y * gs + offY);
        for (var lk = 1; lk < lpoly.length; lk++) {
          ctx.lineTo(lpoly[lk].x * gs + offX, lpoly[lk].y * gs + offY);
        }
        ctx.closePath();
        ctx.clip();

        var grad = ctx.createRadialGradient(lcx, lcy, 0, lcx, lcy, lrpx);
        grad.addColorStop(0, "rgba(255,255,255," + lI + ")");
        grad.addColorStop(0.5, "rgba(255,255,255," + (lI * 0.6) + ")");
        grad.addColorStop(0.85, "rgba(255,255,255," + (lI * 0.15) + ")");
        grad.addColorStop(1, "rgba(255,255,255,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(lcx - lrpx, lcy - lrpx, lrpx * 2, lrpx * 2);
        ctx.restore();
      }
      ctx.restore();

      // Light color tints
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      for (var li = 0; li < lights.length; li++) {
        var light = lights[li];
        if (light.on === false) continue;
        var lr = light.radius || 4;
        var lI = Math.min(1, Math.max(0, light.intensity != null ? light.intensity : 0.8));
        var lRgb = hexToRgb(light.color || "#ffcc66");
        var lpoly = global.FogVisibility.computeVisibilityPolygon(light.x, light.y, walls, lr);
        if (!lpoly || lpoly.length < 3) continue;

        var lcx = light.x * gs + offX;
        var lcy = light.y * gs + offY;
        var lrpx = lr * gs;
        var ltAlpha = lI * 0.08;

        ctx.save();
        ctx.beginPath();
        ctx.moveTo(lpoly[0].x * gs + offX, lpoly[0].y * gs + offY);
        for (var lk = 1; lk < lpoly.length; lk++) {
          ctx.lineTo(lpoly[lk].x * gs + offX, lpoly[lk].y * gs + offY);
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
      var exploredCells = getExploredForViewer(config, fog);

      if (isPlayerView) {
        // Player view — polygon-based fog with smooth edges:
        // 1. Darken everything (dims explored areas, preserves lighting pattern)
        // 2. Restore visible areas using polygons with blur (smooth edges)
        // 3. Force non-explored cells to full black (cell-based but invisible seams: black on black)

        // 1. Darken ALL non-visible: add 0.4 darkness everywhere
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(0,0,0,0.45)";
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.restore();

        // 2. Restore visible areas with blur (undo the 0.4 darkness in visible zones)
        if (fog.polygons && fog.polygons.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          try { ctx.filter = "blur(" + BLUR_RADIUS + "px)"; } catch (_e) {}
          ctx.fillStyle = "rgba(255,255,255,0.45)";
          for (var p = 0; p < fog.polygons.length; p++) {
            var poly = fog.polygons[p];
            if (poly.length < 3) continue;
            ctx.beginPath();
            ctx.moveTo(poly[0].x * gs + offX, poly[0].y * gs + offY);
            for (var k = 1; k < poly.length; k++) {
              ctx.lineTo(poly[k].x * gs + offX, poly[k].y * gs + offY);
            }
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();
        }

        // 3. Force non-explored cells to full black (black-on-dark = no visible seams)
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (var cy = bounds.minY; cy < bounds.maxY; cy++) {
          for (var cx = bounds.minX; cx < bounds.maxX; cx++) {
            var key = cx + "," + cy;
            if (fog.visibleCells.has(key)) continue;
            if (exploredCells[key]) continue; // explored — keep the darkened lighting
            ctx.clearRect(cx * gs + offX, cy * gs + offY, gs, gs);
            ctx.fillStyle = "rgba(0,0,0,1)";
            ctx.fillRect(cx * gs + offX, cy * gs + offY, gs, gs);
          }
        }
        ctx.restore();

      }
      // Narrator normal view: no fog masking — only sees lighting (Steps 1-4)

      // Manual override indicators (narrator only)
      if (isNarrator && !fog.impersonateInstanceId) {
        drawManualOverrides(ctx, config, gs, offX, offY);
      }
    }
  }

  function drawManualOverrides(ctx, config, gs, offX, offY) {
    var revealed = config.revealed || {};
    var hidden = config.hidden || {};
    ctx.save();
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(46, 166, 99, 0.6)";
    for (var rKey in revealed) {
      if (!revealed[rKey]) continue;
      var rp = rKey.split(",");
      ctx.strokeRect(parseInt(rp[0], 10) * gs + offX + 1, parseInt(rp[1], 10) * gs + offY + 1, gs - 2, gs - 2);
    }
    ctx.strokeStyle = "rgba(207, 95, 95, 0.6)";
    for (var hKey in hidden) {
      if (!hidden[hKey]) continue;
      var hp = hKey.split(",");
      ctx.strokeRect(parseInt(hp[0], 10) * gs + offX + 1, parseInt(hp[1], 10) * gs + offY + 1, gs - 2, gs - 2);
    }
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
      var half = Math.floor(size / 2);
      var x = (hover.cellX - half) * gs;
      var y = (hover.cellY - half) * gs;
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

  global.__applyTacticalMapFogRenderer = apply;
  if (global.TacticalMap) { apply(global.TacticalMap); }
})(window);
