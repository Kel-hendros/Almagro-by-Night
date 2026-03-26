// Wall drawing tool for the tactical map.
// Follows the same factory-function pattern as tile-painter.js.
(function initWallDrawerModule(global) {
  "use strict";

  var SNAP_RADIUS = 0.45; // units — max distance to snap to a wall endpoint
  var SNAP_DISPLAY_RANGE = 3; // units — show nearby wall endpoints within this range
  var ERASE_DISTANCE_THRESHOLD = 0.35; // units — max distance to select a wall for erasing

  function generateWallId() {
    return "wall-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 6);
  }

  /**
   * Point-to-segment distance in grid units.
   */
  function pointToSegmentDist(px, py, x1, y1, x2, y2) {
    var dx = x2 - x1;
    var dy = y2 - y1;
    var lenSq = dx * dx + dy * dy;
    if (lenSq === 0) {
      var ddx = px - x1;
      var ddy = py - y1;
      return Math.sqrt(ddx * ddx + ddy * ddy);
    }
    var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
    var projX = x1 + t * dx;
    var projY = y1 + t * dy;
    var ex = px - projX;
    var ey = py - projY;
    return Math.sqrt(ex * ex + ey * ey);
  }

  /**
   * Process collinear overlaps: when a new segment overlaps existing walls
   * on the same line, split the existing walls and replace the overlapping
   * portion with the new segment's type.
   *
   * Returns the modified walls array with the new segment inserted.
   */
  function insertWallWithOverlaps(walls, nx1, ny1, nx2, ny2, newType) {
    var ndx = nx2 - nx1;
    var ndy = ny2 - ny1;
    var nlenSq = ndx * ndx + ndy * ndy;
    if (nlenSq === 0) return walls;

    var toRemove = [];
    var toAdd = [];

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      var wdx = w.x2 - w.x1;
      var wdy = w.y2 - w.y1;

      // Check if both endpoints of the new segment are collinear with this wall
      var cross1 = wdx * (ny1 - w.y1) - wdy * (nx1 - w.x1);
      var cross2 = wdx * (ny2 - w.y1) - wdy * (nx2 - w.x1);
      if (Math.abs(cross1) > 0.01 || Math.abs(cross2) > 0.01) continue;

      // Project new segment endpoints onto this wall's parameterization
      // t=0 at (w.x1,w.y1), t=1 at (w.x2,w.y2)
      var wlenSq = wdx * wdx + wdy * wdy;
      if (wlenSq === 0) continue;
      var t1 = (ndx !== 0 || ndy !== 0)
        ? (Math.abs(wdx) >= Math.abs(wdy)
          ? (nx1 - w.x1) / wdx
          : (ny1 - w.y1) / wdy)
        : 0;
      var t2 = (Math.abs(wdx) >= Math.abs(wdy))
        ? (nx2 - w.x1) / wdx
        : (ny2 - w.y1) / wdy;

      var tMin = Math.min(t1, t2);
      var tMax = Math.max(t1, t2);

      // Does [tMin, tMax] overlap with [0, 1]?
      var overlapStart = Math.max(0, tMin);
      var overlapEnd = Math.min(1, tMax);
      if (overlapEnd - overlapStart < 0.001) continue; // no significant overlap

      // Mark for removal
      toRemove.push(i);

      // Add back non-overlapping portions of the existing wall
      // Portion BEFORE the new segment: [0, tMin]
      if (tMin > 0.01) {
        var bx = w.x1 + wdx * tMin;
        var by = w.y1 + wdy * tMin;
        if (bx !== w.x1 || by !== w.y1) {
          toAdd.push({
            id: generateWallId(), x1: w.x1, y1: w.y1, x2: bx, y2: by,
            type: w.type, doorOpen: w.doorOpen || false,
          });
        }
      }
      // Portion AFTER the new segment: [tMax, 1]
      if (tMax < 0.99) {
        var ax = w.x1 + wdx * tMax;
        var ay = w.y1 + wdy * tMax;
        if (ax !== w.x2 || ay !== w.y2) {
          toAdd.push({
            id: generateWallId(), x1: ax, y1: ay, x2: w.x2, y2: w.y2,
            type: w.type, doorOpen: w.doorOpen || false,
          });
        }
      }
    }

    // Apply removals (reverse order to preserve indices)
    toRemove.sort(function (a, b) { return b - a; });
    for (var r = 0; r < toRemove.length; r++) {
      walls.splice(toRemove[r], 1);
    }

    // Add remainder segments from split walls
    for (var a = 0; a < toAdd.length; a++) {
      walls.push(toAdd[a]);
    }

    // Add the new segment itself
    var typeLabels = { wall: "Pared", door: "Puerta", window: "Ventana" };
    var typeCount = walls.filter(function (w) { return w.type === newType; }).length + 1;
    walls.push({
      id: generateWallId(),
      name: (typeLabels[newType] || newType) + " " + typeCount,
      x1: nx1, y1: ny1, x2: nx2, y2: ny2,
      type: newType, doorOpen: false,
    });

    return walls;
  }

  /**
   * Create a wall drawer tool instance.
   * @param {Object} opts
   * @param {Function} opts.getMap - returns TacticalMap instance
   * @param {Function} opts.getWalls - returns encounter.data.walls array
   * @param {Function} opts.setWalls - updates walls array
   * @param {Function} opts.onChanged - callback for save (debounced internally)
   * @param {Function} opts.canEdit - returns boolean (is narrator)
   */
  function createWallDrawer(opts) {
    var getMap = opts.getMap;
    var getWalls = opts.getWalls;
    var setWalls = opts.setWalls;
    var onChanged = opts.onChanged;
    var canEdit = opts.canEdit || function () { return true; };

    var active = false;
    var wallType = "wall"; // "wall" | "door" | "window"
    var mode = "draw"; // "draw" | "erase"
    var drawShape = "polygon"; // "polygon" | "rectangle" | "circle"
    var chainStart = null; // { x, y } grid intersection
    var doorStart = null; // { x, y, wall, t } first click for door/window
    var shapeOrigin = null; // { x, y } for rectangle/circle drag start
    var shapeDragEnd = null; // { x, y } current drag position
    var CIRCLE_SEGMENTS = 24; // number of wall segments for circle approximation

    var saveTimer = null;
    var SAVE_DELAY = 600;

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        if (typeof onChanged === "function") onChanged();
      }, SAVE_DELAY);
    }

    function isActive() {
      return active;
    }

    function getType() {
      return wallType;
    }

    function getMode() {
      return mode;
    }

    function activate(type) {
      if (!canEdit()) return;
      active = true;
      wallType = type || wallType;
      mode = "draw";
      chainStart = null;
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.add("wall-drawer-active");
        map.canvas?.classList.remove("wall-eraser-active");
        map._wallDrawerState = {
          active: true,
          wallType: wallType,
          mode: mode,
          chainStart: null,
          snapTarget: null,
          snapPoints: [],
          eraseHoverWallId: null,
        };
        map.draw();
      }
    }

    function getDrawShape() { return drawShape; }
    function setDrawShape(shape) {
      drawShape = shape || "polygon";
      chainStart = null;
      shapeOrigin = null;
      shapeDragEnd = null;
      var map = getMap?.();
      if (map && map._wallDrawerState) {
        map._wallDrawerState.shapePreview = null;
        map._wallDrawerState.chainStart = null;
      }
      map?.draw();
    }

    function deactivate() {
      active = false;
      chainStart = null;
      doorStart = null;
      shapeOrigin = null;
      shapeDragEnd = null;
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.remove("wall-drawer-active");
        map.canvas?.classList.remove("wall-eraser-active");
        map._wallDrawerState = null;
        map.draw();
      }
    }

    function setType(type) {
      wallType = type;
      if (active) {
        var map = getMap?.();
        if (map && map._wallDrawerState) {
          map._wallDrawerState.wallType = type;
        }
      }
    }

    function setMode(newMode) {
      mode = newMode;
      chainStart = null;
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.toggle("wall-drawer-active", mode === "draw");
        map.canvas?.classList.toggle("wall-eraser-active", mode === "erase");
        if (map._wallDrawerState) {
          map._wallDrawerState.mode = mode;
          map._wallDrawerState.chainStart = null;
          map._wallDrawerState.eraseHoverWallId = null;
        }
        map.draw();
      }
    }

    /**
     * Find the nearest existing wall endpoint to snap to.
     * Only snaps to other wall endpoints, NOT to grid intersections.
     */
    function findSnapIntersection(cellX, cellY) {
      var walls = getWalls() || [];
      var best = null, bestDist = SNAP_RADIUS;
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var d1 = Math.sqrt((cellX - w.x1) * (cellX - w.x1) + (cellY - w.y1) * (cellY - w.y1));
        if (d1 < bestDist) { bestDist = d1; best = { x: w.x1, y: w.y1 }; }
        var d2 = Math.sqrt((cellX - w.x2) * (cellX - w.x2) + (cellY - w.y2) * (cellY - w.y2));
        if (d2 < bestDist) { bestDist = d2; best = { x: w.x2, y: w.y2 }; }
      }
      return best;
    }

    /**
     * Get nearby wall endpoints for snap indicator display.
     */
    function getSnapPoints(cellX, cellY) {
      var walls = getWalls() || [];
      var points = [];
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var d1 = Math.abs(cellX - w.x1) + Math.abs(cellY - w.y1);
        if (d1 <= SNAP_DISPLAY_RANGE) points.push({ x: w.x1, y: w.y1 });
        var d2 = Math.abs(cellX - w.x2) + Math.abs(cellY - w.y2);
        if (d2 <= SNAP_DISPLAY_RANGE) points.push({ x: w.x2, y: w.y2 });
      }
      return points;
    }

    /**
     * Find the nearest wall to a cell position (for eraser).
     */
    function findNearestWall(cellX, cellY) {
      var walls = getWalls() || [];
      var best = null;
      var bestDist = Infinity;
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var d = pointToSegmentDist(cellX, cellY, w.x1, w.y1, w.x2, w.y2);
        if (d < bestDist) {
          bestDist = d;
          best = w;
        }
      }
      if (best && bestDist <= ERASE_DISTANCE_THRESHOLD) {
        return best;
      }
      return null;
    }

    /**
     * Find the nearest wall (type "wall" only) and project a point onto it.
     * Returns { wall, t, x, y, len } or null.
     */
    function projectOntoWall(cellX, cellY) {
      var walls = getWalls() || [];
      var bestWall = null, bestDist = ERASE_DISTANCE_THRESHOLD + 0.15;
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        if (w.type !== "wall") continue;
        var d = pointToSegmentDist(cellX, cellY, w.x1, w.y1, w.x2, w.y2);
        if (d < bestDist) { bestDist = d; bestWall = w; }
      }
      if (!bestWall) return null;

      var dx = bestWall.x2 - bestWall.x1;
      var dy = bestWall.y2 - bestWall.y1;
      var lenSq = dx * dx + dy * dy;
      var len = Math.sqrt(lenSq);
      if (len < 0.5) return null;

      var t = ((cellX - bestWall.x1) * dx + (cellY - bestWall.y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));

      return {
        wall: bestWall,
        t: t,
        x: bestWall.x1 + dx * t,
        y: bestWall.y1 + dy * t,
        len: len,
      };
    }

    // Minimum door/window width: 1.5 meters = 1 coordinate unit
    var MIN_DOOR_METERS = 1.5;
    var MIN_DOOR_UNITS = MIN_DOOR_METERS / 1.5; // 1.5m per coordinate unit

    /**
     * Given a start point on a wall, project the cursor onto the wall
     * to get the end point. Free-form length, minimum 1.5m enforced.
     */
    function projectDoorEnd(startT, wall, cellX, cellY) {
      var dx = wall.x2 - wall.x1;
      var dy = wall.y2 - wall.y1;
      var lenSq = dx * dx + dy * dy;
      var len = Math.sqrt(lenSq);
      if (len < MIN_DOOR_UNITS * 0.5) return null;

      var t = ((cellX - wall.x1) * dx + (cellY - wall.y1) * dy) / lenSq;
      t = Math.max(0, Math.min(1, t));

      // Enforce minimum door length
      var dist = Math.abs(t - startT) * len;
      if (dist < MIN_DOOR_UNITS) {
        var sign = t >= startT ? 1 : -1;
        t = startT + (sign * MIN_DOOR_UNITS) / len;
        t = Math.max(0, Math.min(1, t));
      }

      return {
        t: t,
        x: wall.x1 + dx * t,
        y: wall.y1 + dy * t,
      };
    }

    /**
     * Create the door/window segment on a wall, splitting it properly.
     */
    function commitDoorOnWall(wall, t1, t2, type) {
      if (t1 > t2) { var tmp = t1; t1 = t2; t2 = tmp; }
      if (t2 - t1 < 0.001) return false;

      var dx = wall.x2 - wall.x1;
      var dy = wall.y2 - wall.y1;
      var x1 = wall.x1 + dx * t1;
      var y1 = wall.y1 + dy * t1;
      var x2 = wall.x1 + dx * t2;
      var y2 = wall.y1 + dy * t2;

      var walls = getWalls() || [];
      var idx = walls.indexOf(wall);
      if (idx === -1) return false;

      walls.splice(idx, 1);

      // Before segment
      if (t1 > 0.01) {
        var preCount = walls.filter(function (ww) { return ww.type === "wall"; }).length + 1;
        walls.push({
          id: generateWallId(),
          name: wall.name || ("Pared " + preCount),
          x1: wall.x1, y1: wall.y1, x2: x1, y2: y1,
          type: "wall", doorOpen: false,
        });
      }

      // Door/window
      var typeLabels = { door: "Puerta", window: "Ventana" };
      var typeCount = walls.filter(function (ww) { return ww.type === type; }).length + 1;
      walls.push({
        id: generateWallId(),
        name: (typeLabels[type] || type) + " " + typeCount,
        x1: x1, y1: y1, x2: x2, y2: y2,
        type: type, doorOpen: false,
      });

      // After segment
      if (t2 < 0.99) {
        var postCount = walls.filter(function (ww) { return ww.type === "wall"; }).length + 1;
        walls.push({
          id: generateWallId(),
          name: wall.name || ("Pared " + postCount),
          x1: x2, y1: y2, x2: wall.x2, y2: wall.y2,
          type: "wall", doorOpen: false,
        });
      }

      setWalls(walls);
      var map = getMap?.();
      if (map) map.walls = walls;
      scheduleSave();
      return true;
    }

    /**
     * Create wall segments forming a rectangle and return the polygon vertices.
     */
    function createRectangleWalls(x1, y1, x2, y2) {
      var walls = getWalls() || [];
      var corners = [
        { x: Math.min(x1, x2), y: Math.min(y1, y2) },
        { x: Math.max(x1, x2), y: Math.min(y1, y2) },
        { x: Math.max(x1, x2), y: Math.max(y1, y2) },
        { x: Math.min(x1, x2), y: Math.max(y1, y2) },
      ];
      var polygon = [];
      for (var i = 0; i < 4; i++) {
        var j = (i + 1) % 4;
        var count = walls.filter(function (w) { return w.type === "wall"; }).length + 1;
        walls.push({
          id: generateWallId(),
          name: "Pared " + count,
          x1: corners[i].x, y1: corners[i].y,
          x2: corners[j].x, y2: corners[j].y,
          type: "wall", doorOpen: false,
        });
        polygon.push({ x: corners[i].x, y: corners[i].y });
      }
      setWalls(walls);
      var map = getMap?.();
      if (map) map.walls = walls;
      scheduleSave();
      return polygon;
    }

    /**
     * Create wall segments approximating a circle and return the polygon vertices.
     */
    function createCircleWalls(cx, cy, radius) {
      if (radius < 0.3) return null;
      var walls = getWalls() || [];
      var polygon = [];
      for (var i = 0; i < CIRCLE_SEGMENTS; i++) {
        var angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
        polygon.push({
          x: cx + Math.cos(angle) * radius,
          y: cy + Math.sin(angle) * radius,
        });
      }
      for (var i = 0; i < CIRCLE_SEGMENTS; i++) {
        var j = (i + 1) % CIRCLE_SEGMENTS;
        var count = walls.filter(function (w) { return w.type === "wall"; }).length + 1;
        walls.push({
          id: generateWallId(),
          name: "Pared " + count,
          x1: polygon[i].x, y1: polygon[i].y,
          x2: polygon[j].x, y2: polygon[j].y,
          type: "wall", doorOpen: false,
        });
      }
      setWalls(walls);
      var map = getMap?.();
      if (map) map.walls = walls;
      scheduleSave();
      return polygon;
    }

    // ── Mouse Handlers ──

    function handleMouseDown(e, cellX, cellY) {
      if (!active || !canEdit()) return false;

      // Only handle left-click
      if (e.button === 2) {
        // Right-click: cancel door placement or chain
        if (doorStart) {
          doorStart = null;
          updatePreview(cellX, cellY);
          return true;
        }
        if (chainStart) {
          chainStart = null;
          updatePreview(cellX, cellY);
          return true;
        }
        return false; // Let parent handle (deactivate from drawer)
      }

      if (e.button !== 0) return false;

      if (mode === "erase") {
        var wall = findNearestWall(cellX, cellY);
        if (wall) {
          var walls = getWalls() || [];
          var idx = walls.indexOf(wall);
          if (idx !== -1) {
            walls.splice(idx, 1);
            setWalls(walls);
            var map = getMap?.();
            if (map) map.walls = walls;
            scheduleSave();
            updatePreview(cellX, cellY);
          }
          return true;
        }
        return true; // Consume click anyway in erase mode
      }

      // Door/window: two-click placement on existing wall
      if (wallType === "door" || wallType === "window") {
        if (!doorStart) {
          // First click: set start point on a wall
          var proj = projectOntoWall(cellX, cellY);
          if (proj) {
            doorStart = { x: proj.x, y: proj.y, wall: proj.wall, t: proj.t };
          }
          updatePreview(cellX, cellY);
        } else {
          // Second click: commit the door
          var endSnap = projectDoorEnd(doorStart.t, doorStart.wall, cellX, cellY);
          if (endSnap) {
            commitDoorOnWall(doorStart.wall, doorStart.t, endSnap.t, wallType);
          }
          doorStart = null;
          updatePreview(cellX, cellY);
        }
        return true;
      }

      // Rectangle / Circle: drag-based shape creation
      if (drawShape === "rectangle" || drawShape === "circle") {
        shapeOrigin = { x: cellX, y: cellY };
        shapeDragEnd = { x: cellX, y: cellY };
        updatePreview(cellX, cellY);
        return true;
      }

      // Polygon wall draw mode (chain-based)
      // Snap to existing wall endpoints if nearby, otherwise use raw position
      var snap = findSnapIntersection(cellX, cellY) || { x: cellX, y: cellY };

      if (!chainStart) {
        // Start chain
        chainStart = snap;
        updatePreview(cellX, cellY);
        return true;
      }

      // Extend chain: create wall segment
      if (snap.x === chainStart.x && snap.y === chainStart.y) {
        return true; // Zero-length, ignore
      }

      var walls = getWalls() || [];
      walls = insertWallWithOverlaps(walls, chainStart.x, chainStart.y, snap.x, snap.y, wallType);
      setWalls(walls);
      var map = getMap?.();
      if (map) map.walls = walls;
      scheduleSave();

      // Continue chain from this point
      chainStart = snap;
      updatePreview(cellX, cellY);
      return true;
    }

    function handleMouseMove(e, cellX, cellY) {
      if (!active) return false;
      if (shapeOrigin) {
        shapeDragEnd = { x: cellX, y: cellY };
      }
      updatePreview(cellX, cellY);
      return false;
    }

    function handleMouseUp(e, cellX, cellY) {
      if (!active || !shapeOrigin) return false;
      var endPt = { x: cellX, y: cellY };
      var polygon = null;

      if (drawShape === "rectangle") {
        var dx = Math.abs(endPt.x - shapeOrigin.x);
        var dy = Math.abs(endPt.y - shapeOrigin.y);
        if (dx > 0.3 && dy > 0.3) {
          polygon = createRectangleWalls(shapeOrigin.x, shapeOrigin.y, endPt.x, endPt.y);
        }
      } else if (drawShape === "circle") {
        var rdx = endPt.x - shapeOrigin.x;
        var rdy = endPt.y - shapeOrigin.y;
        var radius = Math.sqrt(rdx * rdx + rdy * rdy);
        if (radius > 0.3) {
          polygon = createCircleWalls(shapeOrigin.x, shapeOrigin.y, radius);
        }
      }

      shapeOrigin = null;
      shapeDragEnd = null;
      var map = getMap?.();
      if (map && map._wallDrawerState) map._wallDrawerState.shapePreview = null;
      map?.draw();
      return !!polygon;
    }

    function updatePreview(cellX, cellY) {
      var map = getMap?.();
      if (!map) return;
      var st = map._wallDrawerState;
      if (!st) return;

      if (mode === "draw" && (wallType === "door" || wallType === "window")) {
        var proj = projectOntoWall(cellX, cellY);
        st.wallType = wallType;
        st.eraseHoverWallId = null;
        st.snapTarget = null;
        st.snapPoints = [];
        st.chainStart = null;
        st.doorCursorEnabled = !!proj;
        st.doorCursorX = cellX;
        st.doorCursorY = cellY;

        if (doorStart) {
          // Second phase: show segment from start to snapped end
          var endSnap = projectDoorEnd(doorStart.t, doorStart.wall, cellX, cellY);
          if (endSnap) {
            var sT = doorStart.t, eT = endSnap.t;
            if (sT > eT) { var tmp = sT; sT = eT; eT = tmp; }
            var w = doorStart.wall;
            var ddx = w.x2 - w.x1, ddy = w.y2 - w.y1;
            st.doorPreview = {
              x1: w.x1 + ddx * sT, y1: w.y1 + ddy * sT,
              x2: w.x1 + ddx * eT, y2: w.y1 + ddy * eT,
            };
          } else {
            st.doorPreview = null;
          }
          st.doorStartPoint = { x: doorStart.x, y: doorStart.y };
        } else {
          // First phase: show snap point on wall
          st.doorPreview = null;
          st.doorStartPoint = null;
          st.doorSnapPoint = proj ? { x: proj.x, y: proj.y } : null;
        }
      } else if (mode === "draw") {
        st.doorPreview = null;
        st.doorStartPoint = null;
        st.doorSnapPoint = null;
        st.doorCursorEnabled = false;
        st.wallType = wallType;
        st.eraseHoverWallId = null;

        // Shape preview for rectangle/circle drag
        if (shapeOrigin && shapeDragEnd) {
          if (drawShape === "rectangle") {
            st.shapePreview = {
              type: "rectangle",
              x1: Math.min(shapeOrigin.x, shapeDragEnd.x),
              y1: Math.min(shapeOrigin.y, shapeDragEnd.y),
              x2: Math.max(shapeOrigin.x, shapeDragEnd.x),
              y2: Math.max(shapeOrigin.y, shapeDragEnd.y),
            };
          } else if (drawShape === "circle") {
            var cdx = shapeDragEnd.x - shapeOrigin.x;
            var cdy = shapeDragEnd.y - shapeOrigin.y;
            st.shapePreview = {
              type: "circle",
              cx: shapeOrigin.x,
              cy: shapeOrigin.y,
              radius: Math.sqrt(cdx * cdx + cdy * cdy),
            };
          }
          st.snapTarget = null;
          st.snapPoints = [];
          st.chainStart = null;
        } else {
          st.shapePreview = null;
          st.snapTarget = findSnapIntersection(cellX, cellY);
          st.snapPoints = getSnapPoints(cellX, cellY);
          st.chainStart = chainStart;
        }
      } else {
        // Erase mode: highlight nearest wall
        var near = findNearestWall(cellX, cellY);
        st.eraseHoverWallId = near ? near.id : null;
        st.snapTarget = null;
        st.snapPoints = [];
        st.chainStart = null;
      }
      map.draw();
    }

    function handleKeyDown(e) {
      if (!active) return false;
      if (e.key === "Escape") {
        if (doorStart) {
          doorStart = null;
          var map = getMap?.();
          if (map) map.draw();
          return true;
        }
        if (chainStart) {
          chainStart = null;
          var map = getMap?.();
          if (map && map._wallDrawerState) {
            map._wallDrawerState.chainStart = null;
            map.draw();
          }
          return true;
        }
        // If no chain, let the drawer controller handle deactivation
        return false;
      }
      return false;
    }

    function clearAll() {
      if (!confirm("¿Limpiar todas las paredes?")) return;
      setWalls([]);
      var map = getMap?.();
      if (map) {
        map.walls = [];
        map.draw();
      }
      onChanged?.();
    }

    function getWallCount() {
      return (getWalls() || []).length;
    }

    return {
      isActive: isActive,
      getType: getType,
      getMode: getMode,
      getDrawShape: getDrawShape,
      activate: activate,
      deactivate: deactivate,
      setType: setType,
      setMode: setMode,
      setDrawShape: setDrawShape,
      handleMouseDown: handleMouseDown,
      handleMouseMove: handleMouseMove,
      handleMouseUp: handleMouseUp,
      handleKeyDown: handleKeyDown,
      clearAll: clearAll,
      getWallCount: getWallCount,
    };
  }

  /**
   * Toggle door or window open/closed (used outside wall drawer mode).
   * Doors and windows both support toggling:
   *   - door open: doesn't block movement or vision
   *   - door closed: blocks both
   *   - window open: doesn't block movement or vision (curtain open)
   *   - window closed: blocks movement and vision
   * Returns the toggled wall, or null.
   */
  function tryToggleDoor(cellX, cellY, walls) {
    if (!walls || !walls.length) return null;
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (w.type !== "door" && w.type !== "window") continue;
      var midX = (w.x1 + w.x2) / 2;
      var midY = (w.y1 + w.y2) / 2;
      var dx = cellX - midX;
      var dy = cellY - midY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= ERASE_DISTANCE_THRESHOLD) {
        w.doorOpen = !w.doorOpen;
        return w;
      }
    }
    return null;
  }

  /**
   * Does this wall block movement?
   * wall: always. door/window closed: yes. door/window open: no.
   */
  function blocksMovement(w) {
    if (w.type === "door" && w.doorOpen) return false;
    if (w.type === "window" && w.doorOpen) return false;
    return true;
  }

  /**
   * Segment-segment intersection test.
   * Segment A from (ax1,ay1)→(ax2,ay2), segment B from (bx1,by1)→(bx2,by2).
   * Returns { t, x, y } where t is the parameter along segment A [0..1], or null.
   */
  function segmentIntersect(ax1, ay1, ax2, ay2, bx1, by1, bx2, by2) {
    var dax = ax2 - ax1, day = ay2 - ay1;
    var dbx = bx2 - bx1, dby = by2 - by1;
    var denom = dax * dby - day * dbx;
    if (Math.abs(denom) < 1e-10) return null; // parallel

    var t = ((bx1 - ax1) * dby - (by1 - ay1) * dbx) / denom;
    var u = ((bx1 - ax1) * day - (by1 - ay1) * dax) / denom;

    // Strict interior: use small epsilon to avoid false positives at shared endpoints
    if (t < 0.001 || t > 0.999 || u < 0.001 || u > 0.999) return null;

    return { t: t, x: ax1 + dax * t, y: ay1 + day * t };
  }

  function segmentIntersectsRect(ax1, ay1, ax2, ay2, left, top, right, bottom) {
    var dx = ax2 - ax1;
    var dy = ay2 - ay1;
    var t0 = 0;
    var t1 = 1;

    function clip(p, q) {
      if (Math.abs(p) < 1e-10) return q >= 0;
      var r = q / p;
      if (p < 0) {
        if (r > t1) return false;
        if (r > t0) t0 = r;
      } else {
        if (r < t0) return false;
        if (r < t1) t1 = r;
      }
      return true;
    }

    if (!clip(-dx, ax1 - left)) return false;
    if (!clip(dx, right - ax1)) return false;
    if (!clip(-dy, ay1 - top)) return false;
    if (!clip(dy, bottom - ay1)) return false;

    return t0 <= t1;
  }

  function tokenOverlapsBlockingWall(x, y, walls, tokenSize) {
    if (!walls || !walls.length) return false;

    var size = tokenSize || 1;
    var epsilon = Math.min(1e-4, size * 0.25);
    var left = x + epsilon;
    var top = y + epsilon;
    var right = x + size - epsilon;
    var bottom = y + size - epsilon;

    if (left >= right || top >= bottom) return false;

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!blocksMovement(w)) continue;
      if (segmentIntersectsRect(w.x1, w.y1, w.x2, w.y2, left, top, right, bottom)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Check if a token movement from (oldX, oldY) to (newX, newY) crosses any
   * movement-blocking wall. Token coords are cell top-left.
   *
   * Tests ALL 4 corners of the token bounding box so no part of the token
   * can clip through a wall.
   *
   * Returns { blocked: true, lastX, lastY } with the last valid position
   * (just before the wall), or { blocked: false }.
   */
  function checkMovementCollision(oldX, oldY, newX, newY, walls, tokenSize) {
    if (!walls || !walls.length) return { blocked: false };
    var size = tokenSize || 1;
    var mdx = newX - oldX, mdy = newY - oldY;
    if (mdx === 0 && mdy === 0) return { blocked: false };

    if (!tokenOverlapsBlockingWall(newX, newY, walls, size)) {
      return { blocked: false };
    }

    if (tokenOverlapsBlockingWall(oldX, oldY, walls, size)) {
      return {
        blocked: true,
        lastX: oldX,
        lastY: oldY,
      };
    }

    var low = 0;
    var high = 1;
    for (var iter = 0; iter < 18; iter++) {
      var mid = (low + high) * 0.5;
      var testX = oldX + mdx * mid;
      var testY = oldY + mdy * mid;
      if (tokenOverlapsBlockingWall(testX, testY, walls, size)) {
        high = mid;
      } else {
        low = mid;
      }
    }

    return {
      blocked: true,
      lastX: oldX + mdx * low,
      lastY: oldY + mdy * low,
    };
  }

  global.WallDrawer = {
    createWallDrawer: createWallDrawer,
    tryToggleDoor: tryToggleDoor,
    pointToSegmentDist: pointToSegmentDist,
    checkMovementCollision: checkMovementCollision,
  };
})(window);
