// Fog of War visibility computation.
// Computes a visibility polygon per viewer using 2D raycasting against wall segments.
// Produces clean polygons with straight edges (no blocky cell artifacts).
(function initFogVisibilityModule(global) {
  "use strict";

  var DEFAULT_VISION_RADIUS = 30;
  var RAY_EPSILON = 0.00015;
  var WALL_OCCLUSION_THICKNESS = 0.22;

  /**
   * Does this wall block vision?
   */
  function blocksVision(wall) {
    if ((wall.type === "door" || wall.type === "window") && wall.doorOpen) return false;
    if (wall.type === "grate") return false;
    return true;
  }

  /**
   * Ray-segment intersection.
   * Ray from (ox, oy) in direction (dx, dy).
   * Segment from (ax, ay) to (bx, by).
   * Returns { t, u, x, y } or null. t = ray param, u = segment param [0..1].
   */
  function raySegmentIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
    var sx = bx - ax;
    var sy = by - ay;
    var denom = dx * sy - dy * sx;
    if (denom === 0) return null; // parallel

    var t = ((ax - ox) * sy - (ay - oy) * sx) / denom;
    var u = ((ax - ox) * dy - (ay - oy) * dx) / denom;

    if (t < 0 || u < 0 || u > 1) return null;
    return { t: t, x: ox + dx * t, y: oy + dy * t };
  }

  function appendWallOccluderSegments(list, wall) {
    if (!wall) return;
    var ax = parseFloat(wall.x1);
    var ay = parseFloat(wall.y1);
    var bx = parseFloat(wall.x2);
    var by = parseFloat(wall.y2);
    if (![ax, ay, bx, by].every(Number.isFinite)) return;

    var dx = bx - ax;
    var dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;

    var half = WALL_OCCLUSION_THICKNESS * 0.5;
    var nx = (-dy / len) * half;
    var ny = (dx / len) * half;

    var p1 = { x: ax + nx, y: ay + ny };
    var p2 = { x: bx + nx, y: by + ny };
    var p3 = { x: bx - nx, y: by - ny };
    var p4 = { x: ax - nx, y: ay - ny };

    list.push({ ax: p1.x, ay: p1.y, bx: p2.x, by: p2.y });
    list.push({ ax: p2.x, ay: p2.y, bx: p3.x, by: p3.y });
    list.push({ ax: p3.x, ay: p3.y, bx: p4.x, by: p4.y });
    list.push({ ax: p4.x, ay: p4.y, bx: p1.x, by: p1.y });
  }

  /**
   * Compute a visibility polygon from a single origin point.
   * @param {number} ox - viewer X (grid coordinates, e.g. cell center)
   * @param {number} oy - viewer Y
   * @param {Array} walls - wall segments with x1,y1,x2,y2,type,doorOpen
   * @param {number} radius - max vision distance in grid units
   * @returns {Array<{x: number, y: number}>} polygon points sorted by angle
   */
  /**
   * @param {Function} [blocksFilter] - optional filter(wall) → boolean.
   *   If provided, only walls where blocksFilter returns true become blocking segments.
   *   If omitted, uses default fog rules (walls + closed doors + closed windows block).
   */
  function computeVisibilityPolygon(ox, oy, walls, radius, blocksFilter) {
    var segments = [];
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (blocksFilter) {
        if (!blocksFilter(w)) continue;
      } else {
        if (!blocksVision(w)) continue;
      }
      appendWallOccluderSegments(segments, w);
    }

    // 2. Collect unique ray angles from the thick occluder outline so rays
    //    respect doorway jambs and wall thickness instead of infinitely thin
    //    center lines.
    var uniqueAngles = [];
    var seenAngles = {};
    for (var si = 0; si < segments.length; si++) {
      var seg = segments[si];
      var margin = radius + 2;
      if (Math.abs(seg.ax - ox) <= margin && Math.abs(seg.ay - oy) <= margin) {
        addAngles(ox, oy, seg.ax, seg.ay, uniqueAngles, seenAngles);
      }
      if (Math.abs(seg.bx - ox) <= margin && Math.abs(seg.by - oy) <= margin) {
        addAngles(ox, oy, seg.bx, seg.by, uniqueAngles, seenAngles);
      }
    }

    // 3. Add evenly-spaced angles around the full circle to fill gaps
    //    where no wall endpoints exist (produces smooth circular edge).
    var CIRCLE_STEPS = 72; // every 5 degrees
    for (var ci = 0; ci < CIRCLE_STEPS; ci++) {
      var cAngle = (ci / CIRCLE_STEPS) * Math.PI * 2 - Math.PI;
      var cKey = cAngle.toFixed(6);
      if (!seenAngles[cKey]) { seenAngles[cKey] = true; uniqueAngles.push(cAngle); }
    }

    // 4. Sort angles
    uniqueAngles.sort(function (a, b) { return a - b; });

    // 5. Cast rays — clamp to circular radius instead of bounding box
    var radiusSq = radius * radius;
    var polygon = [];
    for (var i = 0; i < uniqueAngles.length; i++) {
      var angle = uniqueAngles[i];
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);

      var closestT = radius; // max distance = circle radius
      var closestX = ox + dx * radius;
      var closestY = oy + dy * radius;

      for (var j = 0; j < segments.length; j++) {
        var seg = segments[j];
        var hit = raySegmentIntersect(ox, oy, dx, dy, seg.ax, seg.ay, seg.bx, seg.by);
        if (hit && hit.t < closestT && hit.t > 0) {
          closestT = hit.t;
          closestX = hit.x;
          closestY = hit.y;
        }
      }

      polygon.push({ x: closestX, y: closestY });
    }

    return polygon;
  }

  /**
   * Add 3 angles (to, slightly left, slightly right) for an endpoint.
   */
  function addAngles(ox, oy, px, py, angles, seen) {
    var angle = Math.atan2(py - oy, px - ox);
    var key1 = angle.toFixed(6);
    var key2 = (angle - RAY_EPSILON).toFixed(6);
    var key3 = (angle + RAY_EPSILON).toFixed(6);
    if (!seen[key1]) { seen[key1] = true; angles.push(angle); }
    if (!seen[key2]) { seen[key2] = true; angles.push(angle - RAY_EPSILON); }
    if (!seen[key3]) { seen[key3] = true; angles.push(angle + RAY_EPSILON); }
  }

  /**
   * Ray-casting point-in-polygon test.
   */
  function pointInPolygon(px, py, polygon) {
    var inside = false;
    var n = polygon.length;
    for (var i = 0, j = n - 1; i < n; j = i++) {
      var xi = polygon[i].x, yi = polygon[i].y;
      var xj = polygon[j].x, yj = polygon[j].y;
      if (((yi > py) !== (yj > py)) &&
          (px < (xj - xi) * (py - yi) / (yj - yi) + xi)) {
        inside = !inside;
      }
    }
    return inside;
  }

  // ── Public API ──

  /**
   * Compute visibility polygons from all PC tokens.
   * @param {Array} pcTokens - tokens with .x, .y (cell positions, top-left)
   * @param {Array} walls - wall segments
   * @param {number} [visionRadius]
   * @returns {{ polygons: Array<Array<{x,y}>>, perTokenPolygons: Array<Array<{x,y}>> }}
   */
  function computeVisibility(pcTokens, walls, visionRadius) {
    var radius = visionRadius || DEFAULT_VISION_RADIUS;
    var polygons = [];
    var perTokenPolygons = [];

    for (var i = 0; i < pcTokens.length; i++) {
      var token = pcTokens[i];
      var tSize = parseFloat(token.size) || 1;
      var cx = token.x + tSize * 0.5; // center of token
      var cy = token.y + tSize * 0.5;
      var poly = computeVisibilityPolygon(cx, cy, walls, radius);
      polygons.push(poly);
      perTokenPolygons.push(poly);
    }

    return { polygons: polygons, perTokenPolygons: perTokenPolygons };
  }

  global.FogVisibility = {
    computeVisibility: computeVisibility,
    computeVisibilityPolygon: computeVisibilityPolygon,
    blocksVision: blocksVision,
    pointInPolygon: pointInPolygon,
  };
})(window);
