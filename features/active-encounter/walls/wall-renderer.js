// Wall rendering mixin for TacticalMap.
// Adds drawWalls() and drawWallDrawerPreview() to the prototype.
(function applyWallRenderer(global) {
  "use strict";

  var WALL_COLORS = {
    wall:   "#d4a574",
    door:   "#8b6914",
    window: "#7bb3d4",
  };
  var WALL_WIDTHS = {
    wall:   9,
    door:   10,
    window: 7,
  };
  var ERASE_HOVER_COLOR = "#e53935";

  function apply(TacticalMap) {
    var proto = TacticalMap.prototype;

    /**
     * Draw all wall segments on the canvas.
     */
    proto.drawWalls = function drawWalls() {
      var walls = this.walls;
      if (!walls || !walls.length) return;
      var ctx = this.ctx;
      var gs = this.gridSize;
      var scale = this.scale;
      var eraseHoverId = this._wallDrawerState?.eraseHoverWallId || null;

      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        drawWallSegment(ctx, w, w.x1 * gs, w.y1 * gs, w.x2 * gs, w.y2 * gs, gs, scale, eraseHoverId);
      }
    };

    /**
     * Draw the wall drawer preview: snap points, chain preview line.
     */
    proto.drawWallDrawerPreview = function drawWallDrawerPreview() {
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

  function drawWallSegment(ctx, wall, px1, py1, px2, py2, gs, scale, eraseHoverId) {
    var midX = (px1 + px2) / 2;
    var midY = (py1 + py2) / 2;
    var isEraseHover = eraseHoverId === wall.id;
    var baseColor = WALL_COLORS[wall.type] || WALL_COLORS.wall;
    var lineWidth = (WALL_WIDTHS[wall.type] || WALL_WIDTHS.wall) / Math.max(scale, 0.5);

    if (isEraseHover) {
      baseColor = ERASE_HOVER_COLOR;
      lineWidth += 1 / Math.max(scale, 0.5);
    }

    ctx.save();

    if (!isEraseHover) {
      ctx.shadowColor = "rgba(0,0,0,0.4)";
      ctx.shadowBlur = 2 / Math.max(scale, 0.5);
      ctx.shadowOffsetY = 1 / Math.max(scale, 0.5);
    } else {
      ctx.shadowColor = "rgba(229,57,53,0.6)";
      ctx.shadowBlur = 8 / Math.max(scale, 0.5);
    }

    if (wall.type === "door" && wall.doorOpen) {
      ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : "rgba(197,160,89,0.5)";
      ctx.lineWidth = (lineWidth * 0.6);
      ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, true, isEraseHover);
    } else if (wall.type === "door") {
      var dx = px2 - px1;
      var dy = py2 - py1;
      var len = Math.sqrt(dx * dx + dy * dy);
      var gapHalf = Math.min(len * 0.15, 6 / Math.max(scale, 0.5));
      if (len > 0) {
        var nx = dx / len;
        var ny = dy / len;
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = lineWidth;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(px1, py1);
        ctx.lineTo(midX - nx * gapHalf, midY - ny * gapHalf);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(midX + nx * gapHalf, midY + ny * gapHalf);
        ctx.lineTo(px2, py2);
        ctx.stroke();
      }
      drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, false, isEraseHover);
    } else if (wall.type === "window" && wall.doorOpen) {
      ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : "rgba(123,179,212,0.45)";
      ctx.lineWidth = lineWidth * 0.6;
      ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      ctx.setLineDash([]);
      drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : "rgba(123,179,212,0.4)");
    } else if (wall.type === "window") {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
      drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : baseColor);
    } else {
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(px1, py1);
      ctx.lineTo(px2, py2);
      ctx.stroke();
    }

    ctx.restore();

    if (wall.locked && (wall.type === "door" || wall.type === "window")) {
      ctx.save();
      ctx.font = Math.round(10 / Math.max(scale, 0.5)) + "px sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("\uD83D\uDD12", midX, midY);
      ctx.restore();
    }
  }

  function drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, isOpen, isEraseHover) {
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
    var arcColor = isEraseHover ? ERASE_HOVER_COLOR : (isOpen ? "rgba(197,160,89,0.4)" : "#c5a059");

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
    ctx.lineCap = "round";
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

  // Export as deferred mixin or apply immediately
  global.__applyTacticalMapWallRenderer = apply;
  if (global.TacticalMap) {
    apply(global.TacticalMap);
  }
})(window);
