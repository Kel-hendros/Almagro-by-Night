// Room rendering mixin for TacticalMap.
// Adds drawRooms() and drawRoomDrawerPreview() to the prototype.
(function applyRoomRenderer(global) {
  "use strict";

  var ROOM_FILL = "rgba(80, 140, 200, 0.08)";
  var ROOM_STROKE = "rgba(80, 140, 200, 0.3)";
  var ROOM_SELECTED_STROKE = "rgba(100, 200, 255, 0.7)";
  var ROOM_LABEL_COLOR = "rgba(80, 140, 200, 0.6)";
  var PREVIEW_COLOR = "rgba(100, 200, 255, 0.8)";
  var CLOSE_HIGHLIGHT = "rgba(100, 255, 160, 0.9)";

  // Interactive marker style (matches light-renderer.js)
  var MARKER_BORDER = "rgba(100, 200, 255, 0.85)";
  var MARKER_BG = "rgba(10, 10, 10, 0.9)";
  var MARKER_RADIUS = 12;
  var ROOM_EMOJI = "\uD83C\uDFE0";

  function computeCentroid(polygon) {
    var cx = 0, cy = 0, n = polygon.length;
    for (var i = 0; i < n; i++) {
      cx += polygon[i].x;
      cy += polygon[i].y;
    }
    return { x: cx / n, y: cy / n };
  }

  function apply(TacticalMap) {
    var proto = TacticalMap.prototype;

    /**
     * Draw room polygons (narrator only, after walls).
     */
    proto.drawRooms = function drawRooms() {
      // Only render room outlines for narrator
      var fog = this._fog;
      if (fog && !fog.isNarrator) return;
      var rooms = this._rooms;
      if (!rooms || !rooms.length) return;
      var ctx = this.ctx;
      var gs = this.gridSize;
      var scale = this.scale;
      var selectedId = this._roomDrawerState?.selectedRoomId || null;

      for (var i = 0; i < rooms.length; i++) {
        var room = rooms[i];
        var poly = room.polygon;
        if (!poly || poly.length < 3) continue;

        var isSelected = selectedId === room.id;

        // Fill
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(poly[0].x * gs, poly[0].y * gs);
        for (var k = 1; k < poly.length; k++) {
          ctx.lineTo(poly[k].x * gs, poly[k].y * gs);
        }
        ctx.closePath();
        ctx.fillStyle = ROOM_FILL;
        ctx.fill();

        // Stroke
        ctx.strokeStyle = isSelected ? ROOM_SELECTED_STROKE : ROOM_STROKE;
        ctx.lineWidth = (isSelected ? 3 : 1.5) / Math.max(scale, 0.5);
        if (!isSelected) {
          ctx.setLineDash([6 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

      }
    };

    /**
     * Draw room icons above the fog overlay (narrator only, background layer).
     * Uses the same interactive marker style as lights/switches/doors.
     */
    proto.drawRoomIcons = function drawRoomIcons() {
      var fog = this._fog;
      if (fog && !fog.isNarrator) return;
      if (this.activeLayer !== "background") return;
      var rooms = this._rooms;
      if (!rooms || !rooms.length) return;
      var ctx = this.ctx;
      var gs = this.gridSize;
      var sc = Math.max(this.scale, 0.5);
      var selectedId = this._roomDrawerState?.selectedRoomId || null;

      for (var i = 0; i < rooms.length; i++) {
        var room = rooms[i];
        var poly = room.polygon;
        if (!poly || poly.length < 3) continue;

        var c = computeCentroid(poly);
        var px = c.x * gs;
        var py = c.y * gs;
        var isSelected = selectedId === room.id;
        var r = MARKER_RADIUS / sc;

        // Background circle
        ctx.save();
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.fillStyle = MARKER_BG;
        ctx.fill();
        ctx.strokeStyle = MARKER_BORDER;
        ctx.lineWidth = 1.5 / sc;
        ctx.stroke();

        // Emoji centered
        ctx.font = Math.round(14 / sc) + "px sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(ROOM_EMOJI, px, py + 1 / sc);
        ctx.restore();

        // Selection ring
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = MARKER_BORDER;
          ctx.lineWidth = 2 / sc;
          ctx.setLineDash([4 / sc, 3 / sc]);
          ctx.beginPath();
          ctx.arc(px, py, r + 4 / sc, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

      }
    };

    /**
     * Draw room drawer preview during active drawing.
     */
    proto.drawRoomDrawerPreview = function drawRoomDrawerPreview() {
      var st = this._roomDrawerState;
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
          ctx.fillStyle = isCurrent ? "rgba(100,200,255,0.8)" : "rgba(100,200,255,0.3)";
          ctx.fill();
        }
      }

      var verts = st.vertices;
      if (!verts || !verts.length) return;

      // Draw placed vertices as dots
      for (var i = 0; i < verts.length; i++) {
        ctx.beginPath();
        ctx.arc(verts[i].x * gs, verts[i].y * gs, 5 / Math.max(scale, 0.5), 0, Math.PI * 2);
        ctx.fillStyle = PREVIEW_COLOR;
        ctx.fill();
      }

      // Draw lines between vertices
      ctx.save();
      ctx.strokeStyle = PREVIEW_COLOR;
      ctx.lineWidth = 2 / Math.max(scale, 0.5);
      ctx.beginPath();
      ctx.moveTo(verts[0].x * gs, verts[0].y * gs);
      for (var i = 1; i < verts.length; i++) {
        ctx.lineTo(verts[i].x * gs, verts[i].y * gs);
      }
      // Preview line to snap target
      if (st.snapTarget) {
        ctx.lineTo(st.snapTarget.x * gs, st.snapTarget.y * gs);
      }
      ctx.stroke();
      ctx.restore();

      // Highlight first vertex when snap target is close (indicates closure)
      if (st.snapTarget && verts.length >= 3) {
        var dx = st.snapTarget.x - verts[0].x;
        var dy = st.snapTarget.y - verts[0].y;
        if (dx * dx + dy * dy < 0.01) {
          ctx.beginPath();
          ctx.arc(verts[0].x * gs, verts[0].y * gs, 8 / Math.max(scale, 0.5), 0, Math.PI * 2);
          ctx.strokeStyle = CLOSE_HIGHLIGHT;
          ctx.lineWidth = 2 / Math.max(scale, 0.5);
          ctx.stroke();
        }
      }
    };
  }

  global.__applyTacticalMapRoomRenderer = apply;
  if (global.TacticalMap) {
    apply(global.TacticalMap);
  }
})(window);
