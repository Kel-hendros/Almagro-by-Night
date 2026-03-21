// Room CRUD manager for active encounters.
// Follows the same factory pattern as light-switch-manager.js.
(function initAERoomManager(global) {
  "use strict";

  function createManager(ctx) {
    var getEncounterData = ctx.getEncounterData;
    var getMap = ctx.getMap;
    var saveFn = ctx.saveEncounter;

    function generateRoomId() {
      return "room-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 6);
    }

    function addRoom(polygon, name) {
      var data = getEncounterData();
      if (!data) return null;
      if (!Array.isArray(data.rooms)) data.rooms = [];
      var room = {
        id: generateRoomId(),
        name: name || "",
        polygon: polygon,
        ambientLight: { intensity: 0, color: "#8090b0" },
      };
      data.rooms.push(room);
      var map = getMap();
      if (map) {
        map._rooms = data.rooms;
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveFn();
      return room;
    }

    function updateRoom(roomId, patch) {
      var data = getEncounterData();
      var rooms = (data && data.rooms) || [];
      var room = rooms.find(function (r) { return r.id === roomId; });
      if (!room) return;
      for (var key in patch) room[key] = patch[key];
      var map = getMap();
      if (map) {
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveFn();
    }

    function removeRoom(roomId) {
      var data = getEncounterData();
      if (!data) return;
      data.rooms = (data.rooms || []).filter(function (r) { return r.id !== roomId; });
      var map = getMap();
      if (map) {
        map._rooms = data.rooms;
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveFn();
    }

    function findRoomAt(gx, gy) {
      var data = getEncounterData();
      var rooms = (data && data.rooms) || [];
      if (!global.FogVisibility) return null;
      for (var i = 0; i < rooms.length; i++) {
        var r = rooms[i];
        if (!r.polygon || r.polygon.length < 3) continue;
        if (global.FogVisibility.pointInPolygon(gx, gy, r.polygon)) return r;
      }
      return null;
    }

    function getRooms() {
      var data = getEncounterData();
      return (data && data.rooms) || [];
    }

    // ── Auto-detect closed polygons from walls ──

    function vk(x, y) { return x + "," + y; }

    function computeSignedArea(poly) {
      var area = 0;
      for (var i = 0; i < poly.length; i++) {
        var j = (i + 1) % poly.length;
        area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
      }
      return area / 2;
    }

    function computeCentroid(poly) {
      var cx = 0, cy = 0;
      for (var i = 0; i < poly.length; i++) { cx += poly[i].x; cy += poly[i].y; }
      return { x: cx / poly.length, y: cy / poly.length };
    }

    /**
     * Find all minimal enclosed faces in the wall graph using face-tracing
     * on the planar subdivision. Returns arrays of {x,y} vertex lists.
     */
    function detectClosedPolygons(walls) {
      if (!walls || walls.length < 3) return [];

      // Build directed half-edges with twin references
      var vertices = {};
      var halfEdges = [];

      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var ka = vk(w.x1, w.y1), kb = vk(w.x2, w.y2);
        if (ka === kb) continue;
        if (!vertices[ka]) vertices[ka] = { x: w.x1, y: w.y1, out: [] };
        if (!vertices[kb]) vertices[kb] = { x: w.x2, y: w.y2, out: [] };

        var eAB = { from: ka, to: kb, used: false, twin: null };
        var eBA = { from: kb, to: ka, used: false, twin: null };
        eAB.twin = eBA;
        eBA.twin = eAB;
        vertices[ka].out.push(eAB);
        vertices[kb].out.push(eBA);
        halfEdges.push(eAB, eBA);
      }

      // Sort outgoing edges at each vertex by angle (CCW)
      for (var key in vertices) {
        var v = vertices[key];
        v.out.sort(function (a, b) {
          var va = vertices[a.to], vb = vertices[b.to];
          return Math.atan2(va.y - v.y, va.x - v.x) - Math.atan2(vb.y - v.y, vb.x - v.x);
        });
      }

      // Trace faces: for each unused half-edge, follow "next" edges
      var faces = [];
      for (var i = 0; i < halfEdges.length; i++) {
        var start = halfEdges[i];
        if (start.used) continue;

        var face = [];
        var edge = start;
        var steps = 0;
        var valid = true;

        do {
          if (edge.used || steps > 200) { valid = false; break; }
          edge.used = true;
          face.push({ x: vertices[edge.from].x, y: vertices[edge.from].y });

          // At edge.to, find the twin in the sorted list, then take NEXT (CW turn)
          var toV = vertices[edge.to];
          var twin = edge.twin;
          var idx = -1;
          for (var j = 0; j < toV.out.length; j++) {
            if (toV.out[j] === twin) { idx = j; break; }
          }
          if (idx === -1) { valid = false; break; }
          // Next CW = previous in CCW-sorted list
          edge = toV.out[(idx - 1 + toV.out.length) % toV.out.length];
          steps++;
        } while (edge !== start);

        if (valid && face.length >= 3) {
          var area = computeSignedArea(face);
          // Keep interior faces only (positive area in screen coords = CW)
          if (area > 0.5) {
            faces.push(face);
          }
        }
      }

      return faces;
    }

    /**
     * Check walls for new closed polygons and prompt to create rooms.
     * Called after wall changes.
     */
    function checkAutoCreateRooms() {
      var data = getEncounterData();
      if (!data) return;
      var walls = data.walls || [];
      var polygons = detectClosedPolygons(walls);
      if (!polygons.length) return;

      for (var i = 0; i < polygons.length; i++) {
        var poly = polygons[i];
        var c = computeCentroid(poly);
        // Skip if a room already covers this area
        if (findRoomAt(c.x, c.y)) continue;

        var count = (data.rooms || []).length + 1;
        var name = prompt("Se detect\u00f3 una habitaci\u00f3n cerrada. Nombre:", "Habitaci\u00f3n " + count);
        if (name === null) continue; // user cancelled
        addRoom(poly, name);
      }
    }

    return {
      addRoom: addRoom,
      updateRoom: updateRoom,
      removeRoom: removeRoom,
      findRoomAt: findRoomAt,
      getRooms: getRooms,
      checkAutoCreateRooms: checkAutoCreateRooms,
    };
  }

  global.AERoomManager = { createManager: createManager };
})(window);
