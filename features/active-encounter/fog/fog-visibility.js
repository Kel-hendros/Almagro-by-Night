// Fog of War visibility computation.
// Computes a visibility polygon per viewer using 2D raycasting against wall segments.
// Produces clean polygons with straight edges (no blocky cell artifacts).
(function initFogVisibilityModule(global) {
  "use strict";

  var DEFAULT_VISION_RADIUS = 15;
  var RAY_EPSILON = 0.00015;

  /**
   * Does this wall block vision?
   */
  function blocksVision(wall) {
    if ((wall.type === "door" || wall.type === "window") && wall.doorOpen) return false;
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
        // Default fog rules
        if (w.type === "door" && w.doorOpen) continue;
        if (w.type === "window" && w.doorOpen) continue;
      }
      segments.push({ ax: w.x1, ay: w.y1, bx: w.x2, by: w.y2 });
    }

    // 2. Add bounding box as segments (clips vision to radius)
    var bMinX = ox - radius;
    var bMinY = oy - radius;
    var bMaxX = ox + radius;
    var bMaxY = oy + radius;
    segments.push({ ax: bMinX, ay: bMinY, bx: bMaxX, by: bMinY }); // top
    segments.push({ ax: bMaxX, ay: bMinY, bx: bMaxX, by: bMaxY }); // right
    segments.push({ ax: bMaxX, ay: bMaxY, bx: bMinX, by: bMaxY }); // bottom
    segments.push({ ax: bMinX, ay: bMaxY, bx: bMinX, by: bMinY }); // left

    // 3. Collect unique endpoints from ALL walls (including windows, open doors)
    //    so rays are cast in every relevant direction. Intersection is only
    //    tested against blocking segments above.
    var uniqueAngles = [];
    var seenAngles = {};
    // From ALL walls (not just blocking ones)
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      addAngles(ox, oy, w.x1, w.y1, uniqueAngles, seenAngles);
      addAngles(ox, oy, w.x2, w.y2, uniqueAngles, seenAngles);
    }
    // From boundary segments
    for (var i = 0; i < 4; i++) {
      var seg = segments[segments.length - 4 + i];
      addAngles(ox, oy, seg.ax, seg.ay, uniqueAngles, seenAngles);
      addAngles(ox, oy, seg.bx, seg.by, uniqueAngles, seenAngles);
    }

    // 4. Sort angles
    uniqueAngles.sort(function (a, b) { return a - b; });

    // 5. Cast rays and find closest intersection
    var polygon = [];
    for (var i = 0; i < uniqueAngles.length; i++) {
      var angle = uniqueAngles[i];
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);

      var closestT = Infinity;
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
   * Determine which cells are inside a polygon (for explored tracking).
   * Checks cell centers against the polygon using ray-casting point-in-polygon test.
   * @param {Array} polygon - array of {x, y} in grid coords
   * @param {number} ox - viewer X
   * @param {number} oy - viewer Y
   * @param {number} radius - max radius
   * @returns {Set<string>} cell keys "cx,cy"
   */
  function polygonToCells(polygon, ox, oy, radius) {
    var cells = new Set();
    if (!polygon || polygon.length < 3) return cells;

    var minCX = Math.floor(ox - radius);
    var maxCX = Math.ceil(ox + radius);
    var minCY = Math.floor(oy - radius);
    var maxCY = Math.ceil(oy + radius);

    for (var cy = minCY; cy <= maxCY; cy++) {
      for (var cx = minCX; cx <= maxCX; cx++) {
        // Test cell center
        var px = cx + 0.5;
        var py = cy + 0.5;
        if (pointInPolygon(px, py, polygon)) {
          cells.add(cx + "," + cy);
        }
      }
    }
    return cells;
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
   * @returns {{ polygons: Array<Array<{x,y}>>, cells: Set<string> }}
   */
  function computeVisibility(pcTokens, walls, visionRadius) {
    var radius = visionRadius || DEFAULT_VISION_RADIUS;
    var polygons = [];
    var allCells = new Set();

    for (var i = 0; i < pcTokens.length; i++) {
      var token = pcTokens[i];
      var cx = token.x + 0.5; // center of token cell
      var cy = token.y + 0.5;
      var poly = computeVisibilityPolygon(cx, cy, walls, radius);
      polygons.push(poly);

      // Derive cells for explored tracking
      var cells = polygonToCells(poly, cx, cy, radius);
      cells.forEach(function (key) { allCells.add(key); });
    }

    return { polygons: polygons, cells: allCells };
  }

  // ── Room Detection (flood fill) ──

  /**
   * Detect indoor cells by flood-filling from the map border.
   * ALL wall segments (wall, door, window — any state) form room boundaries.
   * Cells not reachable from the border are "indoor".
   *
   * @param {Array} walls - all wall segments
   * @param {{ minX, minY, maxX, maxY }} bounds - map bounds in cell coords
   * @returns {Set<string>} indoor cell keys "cx,cy"
   */
  function detectIndoorCells(walls, bounds) {
    // Build edge set from ALL walls, decomposed into unit-length cell edges.
    // A wall from (0,0) to (5,0) becomes 5 edges: (0,0)-(1,0), (1,0)-(2,0), etc.
    var edges = new Set();
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var dx = w.x2 - w.x1;
      var dy = w.y2 - w.y1;
      var steps = Math.max(Math.abs(dx), Math.abs(dy));
      if (steps === 0) continue;
      var sx = dx / steps;
      var sy = dy / steps;
      for (var s = 0; s < steps; s++) {
        var ax = Math.round(w.x1 + sx * s);
        var ay = Math.round(w.y1 + sy * s);
        var bx = Math.round(w.x1 + sx * (s + 1));
        var by = Math.round(w.y1 + sy * (s + 1));
        edges.add(ax + "," + ay + "-" + bx + "," + by);
        edges.add(bx + "," + by + "-" + ax + "," + ay);
      }
    }

    var minX = bounds.minX, minY = bounds.minY;
    var maxX = bounds.maxX, maxY = bounds.maxY;
    var outdoor = new Set();
    var queue = [];

    // Seed: all cells on the border of the map
    for (var cx = minX; cx < maxX; cx++) {
      queue.push(cx + "," + minY);
      queue.push(cx + "," + (maxY - 1));
      outdoor.add(cx + "," + minY);
      outdoor.add(cx + "," + (maxY - 1));
    }
    for (var cy = minY; cy < maxY; cy++) {
      queue.push(minX + "," + cy);
      queue.push((maxX - 1) + "," + cy);
      outdoor.add(minX + "," + cy);
      outdoor.add((maxX - 1) + "," + cy);
    }

    // BFS
    var directions = [
      { dx: 1, dy: 0 },  // right:  wall (cx+1,cy)→(cx+1,cy+1)
      { dx: -1, dy: 0 }, // left:   wall (cx,cy)→(cx,cy+1)
      { dx: 0, dy: 1 },  // down:   wall (cx,cy+1)→(cx+1,cy+1)
      { dx: 0, dy: -1 }, // up:     wall (cx,cy)→(cx+1,cy)
    ];

    while (queue.length > 0) {
      var key = queue.shift();
      var parts = key.split(",");
      var cx = parseInt(parts[0], 10);
      var cy = parseInt(parts[1], 10);

      for (var d = 0; d < 4; d++) {
        var dir = directions[d];
        var nx = cx + dir.dx;
        var ny = cy + dir.dy;
        if (nx < minX || nx >= maxX || ny < minY || ny >= maxY) continue;

        var nKey = nx + "," + ny;
        if (outdoor.has(nKey)) continue;

        // Check if there's a wall on the edge between (cx,cy) and (nx,ny)
        var edgeKey = getEdgeKey(cx, cy, dir.dx, dir.dy);
        if (edges.has(edgeKey)) continue; // wall blocks — can't cross

        outdoor.add(nKey);
        queue.push(nKey);
      }
    }

    // Indoor = all cells in bounds NOT in outdoor
    var indoor = new Set();
    for (var cy = minY; cy < maxY; cy++) {
      for (var cx = minX; cx < maxX; cx++) {
        var k = cx + "," + cy;
        if (!outdoor.has(k)) indoor.add(k);
      }
    }
    return indoor;
  }

  /**
   * Get the wall edge key for moving from (cx,cy) in direction (dx,dy).
   */
  function getEdgeKey(cx, cy, dx, dy) {
    if (dx === 1)  return (cx + 1) + "," + cy + "-" + (cx + 1) + "," + (cy + 1); // right
    if (dx === -1) return cx + "," + cy + "-" + cx + "," + (cy + 1);              // left
    if (dy === 1)  return cx + "," + (cy + 1) + "-" + (cx + 1) + "," + (cy + 1); // down
    if (dy === -1) return cx + "," + cy + "-" + (cx + 1) + "," + cy;              // up
    return "";
  }

  global.FogVisibility = {
    computeVisibility: computeVisibility,
    computeVisibilityPolygon: computeVisibilityPolygon,
    detectIndoorCells: detectIndoorCells,
    blocksVision: blocksVision,
    pointInPolygon: pointInPolygon,
  };
})(window);
