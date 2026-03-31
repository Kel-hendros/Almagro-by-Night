// Wall rendering mixin for TacticalMap.
// Adds drawWalls() and drawWallDrawerPreview() to the prototype.
(function applyWallRenderer(global) {
  "use strict";

  var WALL_COLORS = {
    wall:   "#d4a574",
    door:   "#8b6914",
    window: "#7bb3d4",
    grate:  "#f08a24",
    curtain: "#9c5cff",
  };
  // Muted colors when not in elements layer (structural view)
  var WALL_COLORS_INACTIVE = {
    wall:   "#4a4a4a",
    door:   "#5a5a5a",
    window: "#7bb3d4",
    grate:  "rgba(0,0,0,0)",
    curtain: "#d2d2da",
  };
  var WALL_WIDTHS = {
    wall:   0.22,
    door:   0.16,
    window: 0.14,
    grate:  0.16,
    curtain: 0.18,
  };
  var WALL_VISIBILITY_SAMPLE_OFFSET = 0.18;
  var ERASE_HOVER_COLOR = "#e53935";

  function apply(TacticalMap) {
    var proto = TacticalMap.prototype;

    /**
     * Draw all wall segments on the canvas.
     * When Paper.js is active in Elements layer, Paper.js handles ALL rendering.
     * When Paper.js is active in other layers, we draw runtime-visible special walls.
     * When Paper.js is not active, we draw everything.
     */
    proto.drawWalls = function drawWalls() {
      if (this._paperWallEditorActive) {
        // In Elements layer: Paper.js handles everything, don't draw anything here
        if (this._elementsLayerActive) {
          return;
        }
        // In other layers: draw runtime-visible special walls for visual feedback
        drawRuntimeSpecialWalls(this, 1);
        return;
      }
      drawWallsInternal(this, 1);
    };

    proto.drawWallsForFogState = function drawWallsForFogState(visibleState) {
      if (this._paperWallEditorActive) return;
      var state = visibleState || null;
      if (!state || !state.isPlayerView) {
        drawWallsInternal(this, 1);
        return;
      }

      var buckets = getFogVisibleWallBuckets(this, state);
      if (
        buckets.explored.length ||
        buckets.exploredWallChains.length ||
        buckets.exploredCurtainChains.length
      ) {
        drawWallsSubset(
          this,
          buckets.explored,
          buckets.exploredWallChains,
          buckets.exploredCurtainChains,
          0.42,
        );
      }
      if (
        buckets.current.length ||
        buckets.currentWallChains.length ||
        buckets.currentCurtainChains.length
      ) {
        drawWallsSubset(
          this,
          buckets.current,
          buckets.currentWallChains,
          buckets.currentCurtainChains,
          0.95,
        );
      }
    };

    /**
     * Draw the wall drawer preview: snap points, chain preview line.
     * Skip if Paper.js is handling wall editing.
     */
    proto.drawWallDrawerPreview = function drawWallDrawerPreview() {
      if (this._paperWallEditorActive) return;
      var st = this._wallDrawerState;
      if (!st || !st.active) return;
      var ctx = this.ctx;
      var gs = this.gridSize;
      var scale = this.scale;

      // Draw snap indicator dots near cursor
      if (st.snapPoints && st.snapPoints.length) {
        for (var i = 0; i < st.snapPoints.length; i++) {
          var sp = st.snapPoints[i];
          var px = sp.x * gs;
          var py = sp.y * gs;
          var isCurrent = st.snapTarget && sp.x === st.snapTarget.x && sp.y === st.snapTarget.y;
          ctx.beginPath();
          ctx.arc(px, py, (isCurrent ? 5 : 3) / Math.max(scale, 0.5), 0, Math.PI * 2);
          ctx.fillStyle = isCurrent ? "rgba(255,255,255,0.8)" : "rgba(255,255,255,0.3)";
          ctx.fill();
        }
      }

      // Draw locked start point
      if (st.chainStart) {
        var sx = st.chainStart.x * gs;
        var sy = st.chainStart.y * gs;
        var typeColor = WALL_COLORS[st.wallType] || WALL_COLORS.wall;
        ctx.beginPath();
        ctx.arc(sx, sy, 5 / Math.max(scale, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = typeColor;
        ctx.fill();

        // Preview line to snap target
        if (st.snapTarget && (st.snapTarget.x !== st.chainStart.x || st.snapTarget.y !== st.chainStart.y)) {
          var tx = st.snapTarget.x * gs;
          var ty = st.snapTarget.y * gs;
          ctx.save();
          ctx.strokeStyle = typeColor;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 3 / Math.max(scale, 0.5);
          ctx.setLineDash([6 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(tx, ty);
          ctx.stroke();
          ctx.restore();
        }
      }

      // Rectangle / circle shape preview
      if (st.shapePreview) {
        var sp = st.shapePreview;
        ctx.save();
        ctx.strokeStyle = "rgba(212, 165, 116, 0.7)";
        ctx.lineWidth = 3 / Math.max(scale, 0.5);
        ctx.setLineDash([6 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
        ctx.fillStyle = "rgba(212, 165, 116, 0.06)";
        if (sp.type === "rectangle") {
          var rx = sp.x1 * gs, ry = sp.y1 * gs;
          var rw = (sp.x2 - sp.x1) * gs, rh = (sp.y2 - sp.y1) * gs;
          ctx.fillRect(rx, ry, rw, rh);
          ctx.strokeRect(rx, ry, rw, rh);
        } else if (sp.type === "circle") {
          var rpx = sp.radius * gs;
          ctx.beginPath();
          ctx.arc(sp.cx * gs, sp.cy * gs, rpx, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          // Radius line
          ctx.setLineDash([]);
          ctx.lineWidth = 1.5 / Math.max(scale, 0.5);
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.moveTo(sp.cx * gs, sp.cy * gs);
          ctx.lineTo(sp.cx * gs + rpx, sp.cy * gs);
          ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      // Door/window: cursor icon near mouse
      if ((st.wallType === "door" || st.wallType === "window") && st.doorCursorX != null) {
        var cursorEmoji = st.wallType === "door" ? "\u{1F6AA}" : "\u{1FA9F}";
        var mx = st.doorCursorX * gs;
        var my = st.doorCursorY * gs;
        var ir = 10 / scale;
        ctx.save();
        ctx.globalAlpha = st.doorCursorEnabled ? 0.9 : 0.3;
        ctx.beginPath();
        ctx.arc(mx - ir * 1.5, my - ir * 1.5, ir, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(10,10,10,0.85)";
        ctx.fill();
        ctx.strokeStyle = "rgba(100,200,255,0.7)";
        ctx.lineWidth = 1.2 / scale;
        ctx.stroke();
        ctx.font = Math.round(12 / scale) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(cursorEmoji, mx - ir * 1.5, my - ir * 1.5 + 0.5 / scale);
        ctx.restore();
      }

      // Door/window: snap point on wall (first click target)
      if (st.doorSnapPoint) {
        var sp = st.doorSnapPoint;
        ctx.save();
        ctx.beginPath();
        ctx.arc(sp.x * gs, sp.y * gs, 5 / Math.max(scale, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = "rgba(100,200,255,0.8)";
        ctx.fill();
        ctx.restore();
      }

      // Door/window: locked start point
      if (st.doorStartPoint) {
        var dsp = st.doorStartPoint;
        var typeColor = WALL_COLORS[st.wallType] || WALL_COLORS.door;
        ctx.save();
        ctx.beginPath();
        ctx.arc(dsp.x * gs, dsp.y * gs, 5 / Math.max(scale, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = typeColor;
        ctx.fill();
        ctx.restore();
      }

      // Door/window: segment preview (start to snapped end)
      if (st.doorPreview) {
        var dp = st.doorPreview;
        var typeColor = WALL_COLORS[st.wallType] || WALL_COLORS.door;
        ctx.save();
        ctx.strokeStyle = typeColor;
        ctx.globalAlpha = 0.7;
        ctx.lineWidth = 6 / Math.max(scale, 0.5);
        ctx.lineCap = "round";
        ctx.setLineDash([4 / Math.max(scale, 0.5), 3 / Math.max(scale, 0.5)]);
        ctx.beginPath();
        ctx.moveTo(dp.x1 * gs, dp.y1 * gs);
        ctx.lineTo(dp.x2 * gs, dp.y2 * gs);
        ctx.stroke();
        ctx.setLineDash([]);
        // Endpoint dots
        ctx.fillStyle = typeColor;
        ctx.beginPath();
        ctx.arc(dp.x1 * gs, dp.y1 * gs, 4 / Math.max(scale, 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(dp.x2 * gs, dp.y2 * gs, 4 / Math.max(scale, 0.5), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    };
  }

  // ── Helpers ──

  function drawWallSegment(ctx, wall, px1, py1, px2, py2, gs, scale, eraseHoverId, isElementsActive) {
    var midX = (px1 + px2) / 2;
    var midY = (py1 + py2) / 2;
    var isEraseHover = eraseHoverId === wall.id;
    var colors = isElementsActive ? WALL_COLORS : WALL_COLORS_INACTIVE;
    var baseColor = colors[wall.type] || colors.wall;
    var lineWidth = (WALL_WIDTHS[wall.type] || WALL_WIDTHS.wall) * gs;

    if (isEraseHover) {
      baseColor = ERASE_HOVER_COLOR;
      lineWidth += Math.max(1.5 / Math.max(scale, 0.5), gs * 0.03);
    }

    ctx.save();

    if (!isElementsActive && wall.type === "grate" && !isEraseHover) {
      ctx.restore();
      return;
    }

    var disableSegmentShadow = !isEraseHover && !isElementsActive && wall.type === "window";

    if (disableSegmentShadow) {
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    } else if (!isEraseHover) {
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 2 / Math.max(scale, 0.5);
      ctx.shadowOffsetY = 1 / Math.max(scale, 0.5);
    } else {
      ctx.shadowColor = "rgba(229,57,53,0.6)";
      ctx.shadowBlur = 8 / Math.max(scale, 0.5);
    }

    if (wall.type === "door" && wall.doorOpen) {
      if (isElementsActive) {
        // Elements layer: just colored line (no arc)
        ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : baseColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "butt";
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();
      } else {
        // Other layers: dashed line + arc
        var doorOpenColor = "rgba(90,90,90,0.5)";
        ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : doorOpenColor;
        ctx.lineWidth = (lineWidth * 0.6);
        ctx.lineCap = "butt";
        ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(px2, py2);
        ctx.stroke();
        ctx.setLineDash([]);
        drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, true, isEraseHover, isElementsActive);
      }
    } else if (wall.type === "door") {
      // Closed door: colored line in elements layer, light brown in other layers
      var doorClosedColor = isElementsActive ? baseColor : "#c9a86c";
      ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : doorClosedColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    } else if (wall.type === "window" && wall.doorOpen) {
      var windowOpenColor = isElementsActive ? "rgba(123,179,212,0.45)" : "rgba(123,179,212,0.4)";
      var windowTickColor = isElementsActive ? "rgba(123,179,212,0.4)" : "rgba(123,179,212,0.36)";
      ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : windowOpenColor;
      ctx.lineWidth = lineWidth * 0.6;
      ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : windowTickColor);
    } else if (wall.type === "window") {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : baseColor);
    } else if (wall.type === "grate") {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      drawGrateBars(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : baseColor);
    } else if (wall.type === "curtain") {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "butt";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    }

    ctx.restore();

    // Draw door/window icon in elements layer
    if (isElementsActive && (wall.type === "door" || wall.type === "window")) {
      var dx = px2 - px1;
      var dy = py2 - py1;
      var len = Math.sqrt(dx * dx + dy * dy);
      // Perpendicular offset for icon position (above the line)
      var perpX = len > 0 ? (-dy / len) * (12 / Math.max(scale, 0.5)) : 0;
      var perpY = len > 0 ? (dx / len) * (12 / Math.max(scale, 0.5)) : 0;
      var iconX = midX + perpX;
      var iconY = midY + perpY;

      ctx.save();
      ctx.font = Math.round(12 / Math.max(scale, 0.5)) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      var icon = wall.type === "door" ? "\uD83D\uDEAA" : "\uD83E\uDE9F";
      // Add slight shadow for readability
      ctx.shadowColor = "rgba(0,0,0,0.5)";
      ctx.shadowBlur = 2 / Math.max(scale, 0.5);
      ctx.fillText(icon, iconX, iconY);
      ctx.restore();
    }

    if (wall.locked && (wall.type === "door" || wall.type === "window")) {
      ctx.save();
      ctx.font = Math.round(10 / Math.max(scale, 0.5)) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\uD83D\uDD12", midX, midY);
      ctx.restore();
    }
  }

  function drawWallsInternal(map, alpha) {
    var walls = map.walls;
    if (!walls || !walls.length) return;
    var ctx = map.ctx;
    var gs = map.gridSize;
    var scale = map.scale;
    var eraseHoverId = map._wallDrawerState?.eraseHoverWallId || null;
    var isElementsActive = !!map._elementsLayerActive;
    var perfMode = !!map.isPerformanceConstrained?.();
    var renderCache = ensureWallRenderCache(map, eraseHoverId);

    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;

    // Draw continuous wall families as joined vector paths.
    if (renderCache.wallChains.length > 0) {
      drawWallsAsVectorPaths(
        ctx,
        renderCache.wallChains,
        gs,
        scale,
        isElementsActive,
        "wall",
        perfMode,
      );
    }
    if (renderCache.curtainChains.length > 0) {
      drawWallsAsVectorPaths(
        ctx,
        renderCache.curtainChains,
        gs,
        scale,
        isElementsActive,
        "curtain",
        perfMode,
      );
    }

    // Draw special walls individually so each type can keep its own render rules.
    for (var j = 0; j < renderCache.specialWalls.length; j++) {
      var sw = renderCache.specialWalls[j];
      drawWallSegment(ctx, sw, sw.x1 * gs, sw.y1 * gs, sw.x2 * gs, sw.y2 * gs, gs, scale, eraseHoverId, isElementsActive);
    }

    ctx.restore();
  }

  /**
   * Draw only runtime-visible special walls (for when Paper.js handles regular walls).
   */
  function drawRuntimeSpecialWalls(map, alpha) {
    var walls = map.walls;
    if (!walls || !walls.length) return;
    var ctx = map.ctx;
    var gs = map.gridSize;
    var scale = map.scale;
    var isElementsActive = !!map._elementsLayerActive;
    var perfMode = !!map.isPerformanceConstrained?.();
    var renderCache = ensureWallRenderCache(map, null);

    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;

    for (var i = 0; i < renderCache.runtimeSpecialWalls.length; i++) {
      var w = renderCache.runtimeSpecialWalls[i];
      drawWallSegment(ctx, w, w.x1 * gs, w.y1 * gs, w.x2 * gs, w.y2 * gs, gs, scale, null, isElementsActive);
    }
    if (renderCache.curtainChains.length > 0) {
      drawWallsAsVectorPaths(
        ctx,
        renderCache.curtainChains,
        gs,
        scale,
        isElementsActive,
        "curtain",
        perfMode,
      );
    }

    ctx.restore();
  }

  function drawWallsSubset(map, walls, wallChains, curtainChains, alpha) {
    if (
      (!walls || walls.length === 0) &&
      (!wallChains || wallChains.length === 0) &&
      (!curtainChains || curtainChains.length === 0)
    ) {
      return;
    }
    var ctx = map.ctx;
    var gs = map.gridSize;
    var scale = map.scale;
    var eraseHoverId = map._wallDrawerState?.eraseHoverWallId || null;
    var isElementsActive = !!map._elementsLayerActive;
    var perfMode = !!map.isPerformanceConstrained?.();

    ctx.save();
    ctx.globalAlpha = alpha == null ? 1 : alpha;
    if (wallChains && wallChains.length > 0) {
      drawWallsAsVectorPaths(
        ctx,
        wallChains,
        gs,
        scale,
        isElementsActive,
        "wall",
        perfMode,
      );
    }
    if (curtainChains && curtainChains.length > 0) {
      drawWallsAsVectorPaths(
        ctx,
        curtainChains,
        gs,
        scale,
        isElementsActive,
        "curtain",
        perfMode,
      );
    }
    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i];
      drawWallSegment(
        ctx,
        wall,
        wall.x1 * gs,
        wall.y1 * gs,
        wall.x2 * gs,
        wall.y2 * gs,
        gs,
        scale,
        eraseHoverId,
        isElementsActive,
      );
    }
    ctx.restore();
  }

  function getFogVisibleWallBuckets(map, state) {
    var walls = map.walls || [];
    var fog = map._fog || null;
    var currentAreas = [].concat(state.currentAreas || [], state.revealedAreas || []);
    var exploredAreas = state.exploredAreas || [];
    var hiddenAreas = state.hiddenAreas || [];
    var grouped = createWallRenderGroups(walls, null);
    var wallChains = buildConnectedWallChains(grouped.vectorWallGroups.wall);
    var curtainChains = buildConnectedWallChains(grouped.vectorWallGroups.curtain);
    var cacheKey = [
      fog ? fog._cacheGen || 0 : 0,
      walls.length,
      currentAreas.length,
      exploredAreas.length,
      hiddenAreas.length,
    ].join(":");
    var cache = map._wallFogVisibilityCache;
    if (cache && cache.key === cacheKey && cache.wallsRef === walls) {
      return cache.value;
    }

    var buckets = {
      current: [],
      explored: [],
      currentWallChains: [],
      exploredWallChains: [],
      currentCurtainChains: [],
      exploredCurtainChains: [],
    };
    for (var i = 0; i < grouped.specialWalls.length; i++) {
      var wall = grouped.specialWalls[i];
      var visibility = classifyWallVisibility(map, wall, currentAreas, exploredAreas, hiddenAreas);
      if (visibility === "current") buckets.current.push(wall);
      else if (visibility === "explored") buckets.explored.push(wall);
    }
    for (var wi = 0; wi < wallChains.length; wi++) {
      var wallChain = wallChains[wi];
      var wallChainVisibility = classifyChainVisibility(
        map,
        wallChain,
        currentAreas,
        exploredAreas,
        hiddenAreas,
      );
      if (wallChainVisibility === "current") buckets.currentWallChains.push(wallChain);
      else if (wallChainVisibility === "explored") buckets.exploredWallChains.push(wallChain);
    }
    for (var ci = 0; ci < curtainChains.length; ci++) {
      var curtainChain = curtainChains[ci];
      var curtainVisibility = classifyChainVisibility(
        map,
        curtainChain,
        currentAreas,
        exploredAreas,
        hiddenAreas,
      );
      if (curtainVisibility === "current") buckets.currentCurtainChains.push(curtainChain);
      else if (curtainVisibility === "explored") buckets.exploredCurtainChains.push(curtainChain);
    }

    map._wallFogVisibilityCache = {
      key: cacheKey,
      wallsRef: walls,
      value: buckets,
    };
    return buckets;
  }

  function classifyChainVisibility(map, chain, currentAreas, exploredAreas, hiddenAreas) {
    var walls = chain && Array.isArray(chain.walls) ? chain.walls : [];
    var hasExplored = false;
    for (var i = 0; i < walls.length; i++) {
      var visibility = classifyWallVisibility(
        map,
        walls[i],
        currentAreas,
        exploredAreas,
        hiddenAreas,
      );
      if (visibility === "current") return "current";
      if (visibility === "explored") hasExplored = true;
    }
    return hasExplored ? "explored" : null;
  }

  function classifyWallVisibility(map, wall, currentAreas, exploredAreas, hiddenAreas) {
    var samplePoints = getWallVisibilitySamplePoints(wall);
    var currentVisible = false;

    for (var i = 0; i < samplePoints.length; i++) {
      var sample = samplePoints[i];
      if (pointInAreaList(sample.x, sample.y, hiddenAreas)) continue;
      if (
        typeof map.isPointVisibleToFogViewer === "function" &&
        map.isPointVisibleToFogViewer(sample.x, sample.y)
      ) {
        currentVisible = true;
        break;
      }
      if (pointInAreaList(sample.x, sample.y, currentAreas)) {
        currentVisible = true;
        break;
      }
    }
    if (currentVisible) return "current";

    for (var j = 0; j < samplePoints.length; j++) {
      var sampleExplored = samplePoints[j];
      if (pointInAreaList(sampleExplored.x, sampleExplored.y, hiddenAreas)) continue;
      if (pointInAreaList(sampleExplored.x, sampleExplored.y, exploredAreas)) {
        return "explored";
      }
    }

    return null;
  }

  function getWallVisibilitySamplePoints(wall) {
    if (!wall) return [];
    var x1 = Number(wall.x1) || 0;
    var y1 = Number(wall.y1) || 0;
    var x2 = Number(wall.x2) || 0;
    var y2 = Number(wall.y2) || 0;
    var mx = (x1 + x2) * 0.5;
    var my = (y1 + y2) * 0.5;
    var dx = x2 - x1;
    var dy = y2 - y1;
    var len = Math.sqrt(dx * dx + dy * dy);
    var nx = 0;
    var ny = 0;
    if (len >= 1e-6) {
      nx = (-dy / len) * WALL_VISIBILITY_SAMPLE_OFFSET;
      ny = (dx / len) * WALL_VISIBILITY_SAMPLE_OFFSET;
    }
    return [
      { x: mx, y: my },
      { x: mx + nx, y: my + ny },
      { x: mx - nx, y: my - ny },
      { x: x1, y: y1 },
      { x: x2, y: y2 },
    ];
  }

  function pointInAreaList(x, y, areas) {
    if (!Array.isArray(areas) || areas.length === 0) return false;
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (Array.isArray(area)) {
        if (
          window.FogVisibility &&
          typeof window.FogVisibility.pointInPolygon === "function" &&
          area.length >= 3 &&
          window.FogVisibility.pointInPolygon(x, y, area)
        ) {
          return true;
        }
      } else if (
        area &&
        x >= area.x &&
        x <= area.x + area.width &&
        y >= area.y &&
        y <= area.y + area.height
      ) {
        return true;
      }
    }
    return false;
  }

  /**
   * Cache grouped walls and their precomputed connected chains.
   */
  function ensureWallRenderCache(map, eraseHoverId) {
    var walls = map.walls || [];
    var cache = map._wallRenderCache;
    if (cache && cache.ref === walls && cache.eraseHoverId === eraseHoverId) {
      return cache;
    }

    var grouped = createWallRenderGroups(walls, eraseHoverId);

    cache = {
      ref: walls,
      eraseHoverId: eraseHoverId,
      specialWalls: grouped.specialWalls,
      runtimeSpecialWalls: grouped.runtimeSpecialWalls,
      wallChains: buildConnectedWallChains(grouped.vectorWallGroups.wall),
      curtainChains: buildConnectedWallChains(grouped.vectorWallGroups.curtain),
    };
    map._wallRenderCache = cache;
    return cache;
  }

  function createWallRenderGroups(walls, eraseHoverId) {
    var vectorWallGroups = {
      wall: [],
      curtain: [],
    };
    var specialWalls = [];
    var runtimeSpecialWalls = [];

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!w) continue;
      if (w.type === "door" || w.type === "window") {
        runtimeSpecialWalls.push(w);
      }
      if (w.id !== eraseHoverId && (w.type === "wall" || w.type === "curtain")) {
        vectorWallGroups[w.type].push(w);
      } else {
        specialWalls.push(w);
      }
    }

    return {
      vectorWallGroups: vectorWallGroups,
      specialWalls: specialWalls,
      runtimeSpecialWalls: runtimeSpecialWalls,
    };
  }

  function buildConnectedWallChains(walls) {
    if (!walls || walls.length === 0) return [];

    var adjacency = {};

    function makeKey(x, y) {
      return x.toFixed(4) + "," + y.toFixed(4);
    }

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var key1 = makeKey(w.x1, w.y1);
      var key2 = makeKey(w.x2, w.y2);

      if (!adjacency[key1]) adjacency[key1] = [];
      if (!adjacency[key2]) adjacency[key2] = [];

      adjacency[key1].push({ wall: w, thisEnd: 1, otherKey: key2 });
      adjacency[key2].push({ wall: w, thisEnd: 2, otherKey: key1 });
    }

    var drawn = {};
    var chains = [];

    for (var wi = 0; wi < walls.length; wi++) {
      var wall = walls[wi];
      if (drawn[wall.id]) continue;
      var chain = buildChain(wall, adjacency, drawn, makeKey);
      if (chain.points.length > 0) {
        chains.push(chain);
      }
    }

    return chains;
  }

  /**
   * Draw connected chains as continuous vector paths.
   */
  function drawWallsAsVectorPaths(ctx, chains, gs, scale, isElementsActive, wallType, perfMode) {
    if (!chains || chains.length === 0) return;

    var type = wallType || "wall";
    var lineWidth = (WALL_WIDTHS[type] || WALL_WIDTHS.wall) * gs;
    var baseColor = isElementsActive
      ? (WALL_COLORS[type] || WALL_COLORS.wall)
      : (WALL_COLORS_INACTIVE[type] || WALL_COLORS_INACTIVE.wall);

    ctx.save();
    ctx.lineCap = type === "curtain" ? "round" : "butt";
    ctx.lineJoin = "round";

    if (!perfMode) {
      // Soft shadow bloom under the wall so it feels elevated instead of outlined.
      var shadowBlurPx = Math.max(lineWidth * 0.55, 2.5 / Math.max(scale, 0.5));
      ctx.strokeStyle = "rgba(0,0,0,0.16)";
      ctx.lineWidth = lineWidth * 1.9;
      ctx.filter = "blur(" + shadowBlurPx.toFixed(2) + "px)";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;

      for (var ci = 0; ci < chains.length; ci++) {
        var pts = chains[ci].points || chains[ci];
        if (pts.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(pts[0].x * gs, pts[0].y * gs);
        for (var pi = 1; pi < pts.length; pi++) {
          ctx.lineTo(pts[pi].x * gs, pts[pi].y * gs);
        }
        ctx.stroke();
      }

      // A tighter contact pass keeps some depth near the wall without a hard outline.
      ctx.filter = "none";
      ctx.strokeStyle = "rgba(0,0,0,0.10)";
      ctx.lineWidth = lineWidth * 1.22;

      for (var ciMid = 0; ciMid < chains.length; ciMid++) {
        var ptsMid = chains[ciMid].points || chains[ciMid];
        if (ptsMid.length < 2) continue;

        ctx.beginPath();
        ctx.moveTo(ptsMid[0].x * gs, ptsMid[0].y * gs);
        for (var piMid = 1; piMid < ptsMid.length; piMid++) {
          ctx.lineTo(ptsMid[piMid].x * gs, ptsMid[piMid].y * gs);
        }
        ctx.stroke();
      }
    }

    // Main wall stroke on top.
    ctx.strokeStyle = baseColor;
    ctx.lineWidth = lineWidth;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.filter = "none";

    for (var ci2 = 0; ci2 < chains.length; ci2++) {
      var pts2 = chains[ci2].points || chains[ci2];
      if (pts2.length < 2) continue;

      ctx.beginPath();
      ctx.moveTo(pts2[0].x * gs, pts2[0].y * gs);
      for (var pi2 = 1; pi2 < pts2.length; pi2++) {
        ctx.lineTo(pts2[pi2].x * gs, pts2[pi2].y * gs);
      }
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawGrateBars(ctx, px1, py1, px2, py2, gs, scale, color) {
    var dx = px2 - px1;
    var dy = py2 - py1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;
    var spacing = Math.max(10 / Math.max(scale, 0.5), gs * 0.18);
    var barHalf = Math.max(4 / Math.max(scale, 0.5), gs * 0.08);
    var nx = -dy / len;
    var ny = dx / len;
    var count = Math.max(1, Math.floor(len / spacing));

    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.2 / Math.max(scale, 0.5), gs * 0.035);
    ctx.lineCap = "round";

    for (var i = 1; i <= count; i++) {
      var t = i / (count + 1);
      var cx = px1 + dx * t;
      var cy = py1 + dy * t;
      ctx.beginPath();
      ctx.moveTo(cx - nx * barHalf, cy - ny * barHalf);
      ctx.lineTo(cx + nx * barHalf, cy + ny * barHalf);
      ctx.stroke();
    }

    ctx.restore();
  }

  /**
   * Build a chain of connected points starting from a wall.
   */
  function buildChain(startWall, adjacency, drawn, makeKey) {
    var points = [];
    var walls = [startWall];
    drawn[startWall.id] = true;

    // Start with the first wall's endpoints
    points.push({ x: startWall.x1, y: startWall.y1 });
    points.push({ x: startWall.x2, y: startWall.y2 });

    // Extend forward from the second point
    extendChain(points, walls, adjacency, drawn, makeKey, false);

    // Extend backward from the first point
    extendChain(points, walls, adjacency, drawn, makeKey, true);

    return { points: points, walls: walls };
  }

  /**
   * Extend a chain in one direction by following connected walls.
   */
  function extendChain(points, walls, adjacency, drawn, makeKey, prepend) {
    while (true) {
      var endPoint = prepend ? points[0] : points[points.length - 1];
      var endKey = makeKey(endPoint.x, endPoint.y);
      var neighbors = adjacency[endKey] || [];

      // Find an undrawn connected wall
      var nextWall = null;
      var nextPoint = null;

      for (var i = 0; i < neighbors.length; i++) {
        var n = neighbors[i];
        if (drawn[n.wall.id]) continue;

        // Get the other endpoint of this wall
        nextWall = n.wall;
        if (n.thisEnd === 1) {
          nextPoint = { x: nextWall.x2, y: nextWall.y2 };
        } else {
          nextPoint = { x: nextWall.x1, y: nextWall.y1 };
        }
        break;
      }

      if (!nextWall) break;

      drawn[nextWall.id] = true;
      walls.push(nextWall);
      if (prepend) {
        points.unshift(nextPoint);
      } else {
        points.push(nextPoint);
      }
    }
  }

  function drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, isOpen, isEraseHover, isElementsActive) {
    var dx = px2 - px1;
    var dy = py2 - py1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    var midX = (px1 + px2) / 2;
    var midY = (py1 + py2) / 2;
    // Perpendicular direction for the arc
    var perpX = -dy / len;
    var perpY = dx / len;
    var radius = len * 0.3;
    var openColor = isElementsActive ? "rgba(197,160,89,0.4)" : "rgba(90,90,90,0.4)";
    var closedColor = isElementsActive ? "#c5a059" : "#5a5a5a";
    var arcColor = isEraseHover ? ERASE_HOVER_COLOR : (isOpen ? openColor : closedColor);

    ctx.save();
    ctx.strokeStyle = arcColor;
    ctx.lineWidth = 1.5 / Math.max(scale, 0.5);
    ctx.setLineDash([]);
    ctx.beginPath();
    // Draw arc from midpoint in the perpendicular direction
    var startAngle = Math.atan2(perpY, perpX) - Math.PI * 0.4;
    var endAngle = Math.atan2(perpY, perpX) + Math.PI * 0.4;
    ctx.arc(midX, midY, radius, startAngle, endAngle);
    ctx.stroke();
    ctx.restore();
  }

  function drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, color) {
    var dx = px2 - px1;
    var dy = py2 - py1;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len === 0) return;
    // Perpendicular
    var perpX = (-dy / len) * (5 / Math.max(scale, 0.5));
    var perpY = (dx / len) * (5 / Math.max(scale, 0.5));
    // Draw ticks at 1/3 and 2/3 along the segment
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5 / Math.max(scale, 0.5);
    ctx.lineCap = "butt";
    for (var t = 1; t <= 2; t++) {
      var frac = t / 3;
      var cx = px1 + dx * frac;
      var cy = py1 + dy * frac;
      ctx.beginPath();
      ctx.moveTo(cx - perpX, cy - perpY);
      ctx.lineTo(cx + perpX, cy + perpY);
      ctx.stroke();
    }
    ctx.restore();
  }

  // ── Edit Mode Rendering ──

  var VERTEX_COLORS = {
    normal: "rgba(255, 255, 255, 0.4)",
    hover: "rgba(255, 255, 255, 0.85)",
    selected: "rgba(197, 160, 89, 0.95)",
    junction: "rgba(100, 200, 255, 0.6)",
  };

  var SELECTION_COLORS = {
    wall: "rgba(197, 160, 89, 0.4)",
    wallStroke: "rgba(197, 160, 89, 0.9)",
  };

  function drawEditModeOverlay(map) {
    var editState = map._wallEditState;
    if (!editState || !editState.active) return;

    var ctx = map.ctx;
    var gs = map.gridSize;
    var scale = map.scale;
    var walls = map.walls || [];

    // Draw wall selection highlights
    var selectedWallIds = editState.selectedWallIds || [];
    if (selectedWallIds.length > 0) {
      ctx.save();
      ctx.strokeStyle = SELECTION_COLORS.wallStroke;
      ctx.lineWidth = Math.max(4, 0.3 * gs) / Math.max(scale, 0.5);
      ctx.lineCap = "round";
      ctx.globalAlpha = 0.5;

      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        if (selectedWallIds.indexOf(w.id) === -1) continue;
        ctx.beginPath();
        ctx.moveTo(w.x1 * gs, w.y1 * gs);
        ctx.lineTo(w.x2 * gs, w.y2 * gs);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw box selection
    var boxSelection = editState.boxSelection;
    if (boxSelection) {
      ctx.save();
      ctx.strokeStyle = "rgba(197, 160, 89, 0.7)";
      ctx.fillStyle = "rgba(197, 160, 89, 0.08)";
      ctx.lineWidth = 1 / Math.max(scale, 0.5);
      ctx.setLineDash([4 / Math.max(scale, 0.5), 3 / Math.max(scale, 0.5)]);

      var bx = boxSelection.left * gs;
      var by = boxSelection.top * gs;
      var bw = boxSelection.width * gs;
      var bh = boxSelection.height * gs;

      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx, by, bw, bh);
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw vertices
    var vertices = editState.vertices || [];
    var selectedVertexKeys = editState.selectedVertexKeys || [];
    var hoverVertexKey = editState.hoverVertexKey || null;

    for (var v = 0; v < vertices.length; v++) {
      var vertex = vertices[v];
      var px = vertex.x * gs;
      var py = vertex.y * gs;
      var isSelected = selectedVertexKeys.indexOf(vertex.key) !== -1;
      var isHover = vertex.key === hoverVertexKey;
      var isJunction = vertex.connectionCount >= 3;

      var radius;
      var fillColor;

      if (isSelected) {
        radius = 7 / Math.max(scale, 0.5);
        fillColor = VERTEX_COLORS.selected;
      } else if (isHover) {
        radius = 6 / Math.max(scale, 0.5);
        fillColor = VERTEX_COLORS.hover;
      } else if (isJunction) {
        radius = 5 / Math.max(scale, 0.5);
        fillColor = VERTEX_COLORS.junction;
      } else {
        radius = 4 / Math.max(scale, 0.5);
        fillColor = VERTEX_COLORS.normal;
      }

      ctx.save();
      ctx.beginPath();
      ctx.arc(px, py, radius, 0, Math.PI * 2);
      ctx.fillStyle = fillColor;
      ctx.fill();

      // Draw outline for selected vertices
      if (isSelected) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.8)";
        ctx.lineWidth = 1.5 / Math.max(scale, 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Draw add-vertex preview point (when hovering over a wall)
    var addPreview = editState.addVertexPreview;
    if (addPreview) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(addPreview.x * gs, addPreview.y * gs, 5 / Math.max(scale, 0.5), 0, Math.PI * 2);
      ctx.fillStyle = "rgba(255, 255, 255, 0.6)";
      ctx.fill();
      ctx.strokeStyle = "rgba(197, 160, 89, 0.9)";
      ctx.lineWidth = 2 / Math.max(scale, 0.5);
      ctx.stroke();
      ctx.restore();
    }

    // Draw drag preview - show walls at their new positions
    if (editState.dragPreview && editState.dragPreview.walls) {
      var previewWalls = editState.dragPreview.walls;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.strokeStyle = "rgba(197, 160, 89, 0.9)";
      ctx.lineWidth = WALL_WIDTHS.wall * gs;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      // Draw preview walls as continuous path
      ctx.beginPath();
      for (var pwi = 0; pwi < previewWalls.length; pwi++) {
        var pw = previewWalls[pwi];
        ctx.moveTo(pw.x1 * gs, pw.y1 * gs);
        ctx.lineTo(pw.x2 * gs, pw.y2 * gs);
      }
      ctx.stroke();

      // Draw vertex dots at preview positions
      var dv = editState.dragPreview.vertices || [];
      ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
      for (var di = 0; di < dv.length; di++) {
        if (dv[di].currentX != null) {
          ctx.beginPath();
          ctx.arc(dv[di].currentX * gs, dv[di].currentY * gs, 4 / Math.max(scale, 0.5), 0, Math.PI * 2);
          ctx.fill();
        }
      }
      ctx.restore();
    }

    // Draw alignment guides
    if (editState.guides && editState.guides.length) {
      ctx.save();
      ctx.strokeStyle = "rgba(100, 200, 255, 0.5)";
      ctx.lineWidth = 1 / Math.max(scale, 0.5);
      ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);

      for (var gi = 0; gi < editState.guides.length; gi++) {
        var guide = editState.guides[gi];
        ctx.beginPath();
        ctx.moveTo(guide.x1 * gs, guide.y1 * gs);
        ctx.lineTo(guide.x2 * gs, guide.y2 * gs);
        ctx.stroke();
      }
      ctx.setLineDash([]);
      ctx.restore();
    }

    // Draw weld targets (vertices that will merge on drop)
    if (editState.weldTargets && editState.weldTargets.length) {
      ctx.save();
      var weldRadius = 8 / Math.max(scale, 0.5);

      for (var wi = 0; wi < editState.weldTargets.length; wi++) {
        var wt = editState.weldTargets[wi];
        var wtx = wt.targetX * gs;
        var wty = wt.targetY * gs;

        // Draw pulsing ring around weld target
        ctx.strokeStyle = "rgba(100, 255, 150, 0.9)";
        ctx.lineWidth = 2 / Math.max(scale, 0.5);
        ctx.beginPath();
        ctx.arc(wtx, wty, weldRadius, 0, Math.PI * 2);
        ctx.stroke();

        // Draw filled center
        ctx.fillStyle = "rgba(100, 255, 150, 0.4)";
        ctx.beginPath();
        ctx.arc(wtx, wty, weldRadius * 0.6, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }
  }

  function applyEditMode(TacticalMap) {
    var proto = TacticalMap.prototype;

    /**
     * Draw edit mode overlay (vertices, selection, guides).
     * Skip if Paper.js is handling wall editing.
     */
    proto.drawWallEditOverlay = function drawWallEditOverlay() {
      if (this._paperWallEditorActive) return;
      drawEditModeOverlay(this);
    };
  }

  // Export as deferred mixin or apply immediately
  global.__applyTacticalMapWallRenderer = function (TM) {
    apply(TM);
    applyEditMode(TM);
  };
  if (global.TacticalMap) {
    apply(global.TacticalMap);
    applyEditMode(global.TacticalMap);
  }
})(window);
