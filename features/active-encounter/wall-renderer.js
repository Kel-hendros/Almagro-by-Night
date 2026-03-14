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
    wall:   4,
    door:   6,
    window: 3,
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
        var px1 = w.x1 * gs;
        var py1 = w.y1 * gs;
        var px2 = w.x2 * gs;
        var py2 = w.y2 * gs;
        var midX = (px1 + px2) / 2;
        var midY = (py1 + py2) / 2;
        var isEraseHover = eraseHoverId === w.id;
        var baseColor = WALL_COLORS[w.type] || WALL_COLORS.wall;
        var lineWidth = (WALL_WIDTHS[w.type] || 4) / Math.max(scale, 0.5);

        if (isEraseHover) {
          baseColor = ERASE_HOVER_COLOR;
          lineWidth += 1 / Math.max(scale, 0.5);
        }

        ctx.save();

        // Shadow for depth
        if (!isEraseHover) {
          ctx.shadowColor = "rgba(0,0,0,0.4)";
          ctx.shadowBlur = 2 / Math.max(scale, 0.5);
          ctx.shadowOffsetY = 1 / Math.max(scale, 0.5);
        } else {
          ctx.shadowColor = "rgba(229,57,53,0.6)";
          ctx.shadowBlur = 8 / Math.max(scale, 0.5);
        }

        if (w.type === "door" && w.doorOpen) {
          // Open door: dashed line, semi-transparent
          ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : "rgba(197,160,89,0.5)";
          ctx.lineWidth = (lineWidth * 0.6);
          ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Draw open door arc indicator
          drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, true, isEraseHover);
        } else if (w.type === "door") {
          // Closed door: solid line with gap + arc
          var dx = px2 - px1;
          var dy = py2 - py1;
          var len = Math.sqrt(dx * dx + dy * dy);
          var gapHalf = Math.min(len * 0.15, 6 / Math.max(scale, 0.5));
          if (len > 0) {
            var nx = dx / len;
            var ny = dy / len;
            // First segment (before gap)
            ctx.strokeStyle = baseColor;
            ctx.lineWidth = lineWidth;
            ctx.lineCap = "round";
            ctx.beginPath();
            ctx.moveTo(px1, py1);
            ctx.lineTo(midX - nx * gapHalf, midY - ny * gapHalf);
            ctx.stroke();
            // Second segment (after gap)
            ctx.beginPath();
            ctx.moveTo(midX + nx * gapHalf, midY + ny * gapHalf);
            ctx.lineTo(px2, py2);
            ctx.stroke();
          }
          // Door arc indicator
          drawDoorArc(ctx, px1, py1, px2, py2, gs, scale, false, isEraseHover);
        } else if (w.type === "window" && w.doorOpen) {
          // Window open (curtain raised): dashed line, semi-transparent
          ctx.strokeStyle = isEraseHover ? ERASE_HOVER_COLOR : "rgba(123,179,212,0.45)";
          ctx.lineWidth = lineWidth * 0.6;
          ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
          ctx.setLineDash([]);
          // Tick marks (faded)
          drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : "rgba(123,179,212,0.4)");
        } else if (w.type === "window") {
          // Window closed: solid line with perpendicular tick marks
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
          // Tick marks
          drawWindowTicks(ctx, px1, py1, px2, py2, gs, scale, isEraseHover ? ERASE_HOVER_COLOR : baseColor);
        } else {
          // Wall: solid line
          ctx.strokeStyle = baseColor;
          ctx.lineWidth = lineWidth;
          ctx.lineCap = "round";
          ctx.beginPath();
          ctx.moveTo(px1, py1);
          ctx.lineTo(px2, py2);
          ctx.stroke();
        }

        ctx.restore();
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
    };
  }

  // ── Helpers ──

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
