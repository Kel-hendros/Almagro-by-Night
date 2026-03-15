// Wall drawing tool for the tactical map.
// Follows the same factory-function pattern as tile-painter.js.
(function initWallDrawerModule(global) {
  "use strict";

  var SNAP_RADIUS = 0.45; // in grid cells
  var SNAP_DISPLAY_RANGE = 3; // show snap dots within N cells of cursor
  var ERASE_DISTANCE_THRESHOLD = 0.35; // in grid cells

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
        var bx = Math.round(w.x1 + wdx * tMin);
        var by = Math.round(w.y1 + wdy * tMin);
        if (bx !== w.x1 || by !== w.y1) {
          toAdd.push({
            id: generateWallId(), x1: w.x1, y1: w.y1, x2: bx, y2: by,
            type: w.type, doorOpen: w.doorOpen || false,
          });
        }
      }
      // Portion AFTER the new segment: [tMax, 1]
      if (tMax < 0.99) {
        var ax = Math.round(w.x1 + wdx * tMax);
        var ay = Math.round(w.y1 + wdy * tMax);
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
    walls.push({
      id: generateWallId(),
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
    var chainStart = null; // { x, y } grid intersection
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

    function deactivate() {
      active = false;
      chainStart = null;
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
     * Find the nearest grid intersection to a world position (in grid cells).
     */
    function findSnapIntersection(cellX, cellY) {
      var ix = Math.round(cellX);
      var iy = Math.round(cellY);
      var dist = Math.sqrt((cellX - ix) * (cellX - ix) + (cellY - iy) * (cellY - iy));
      if (dist <= SNAP_RADIUS) {
        return { x: ix, y: iy };
      }
      return null;
    }

    /**
     * Get snap points to display near a world cell position.
     */
    function getSnapPoints(cellX, cellY) {
      var points = [];
      var cx = Math.round(cellX);
      var cy = Math.round(cellY);
      for (var dy = -SNAP_DISPLAY_RANGE; dy <= SNAP_DISPLAY_RANGE; dy++) {
        for (var dx = -SNAP_DISPLAY_RANGE; dx <= SNAP_DISPLAY_RANGE; dx++) {
          points.push({ x: cx + dx, y: cy + dy });
        }
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

    // ── Mouse Handlers ──

    function handleMouseDown(e, cellX, cellY) {
      if (!active || !canEdit()) return false;

      // Only handle left-click
      if (e.button === 2) {
        // Right-click: cancel chain or deactivate
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

      // Draw mode
      var snap = findSnapIntersection(cellX, cellY);
      if (!snap) return true; // Consume but don't act if no snap

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
      updatePreview(cellX, cellY);
      return false; // Don't consume mousemove (allow hover effects)
    }

    function handleMouseUp(e, cellX, cellY) {
      // Wall drawer doesn't need mouseup handling (click-based, not drag-based)
      return false;
    }

    function updatePreview(cellX, cellY) {
      var map = getMap?.();
      if (!map) return;
      var st = map._wallDrawerState;
      if (!st) return;

      if (mode === "draw") {
        st.snapTarget = findSnapIntersection(cellX, cellY);
        st.snapPoints = getSnapPoints(cellX, cellY);
        st.chainStart = chainStart;
        st.wallType = wallType;
        st.eraseHoverWallId = null;
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
      activate: activate,
      deactivate: deactivate,
      setType: setType,
      setMode: setMode,
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
    var half = size * 0.5;

    var mdx = newX - oldX, mdy = newY - oldY;
    if (mdx === 0 && mdy === 0) return { blocked: false };

    // Step 1: Check CENTER against blocking walls.
    // If center can pass → token passes (even through tight openings like 1-cell doors).
    var cx1 = oldX + half, cy1 = oldY + half;
    var cx2 = newX + half, cy2 = newY + half;
    var centerBlocked = false;
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!blocksMovement(w)) continue;
      if (segmentIntersect(cx1, cy1, cx2, cy2, w.x1, w.y1, w.x2, w.y2)) {
        centerBlocked = true;
        break;
      }
    }
    if (!centerBlocked) return { blocked: false };

    // Step 2: Center IS blocked by a solid wall. Use all 4 corners to find
    // the exact stop position so the FULL token stays on this side.
    var corners = [
      [oldX,        oldY,        newX,        newY],
      [oldX + size, oldY,        newX + size, newY],
      [oldX,        oldY + size, newX,        newY + size],
      [oldX + size, oldY + size, newX + size, newY + size],
    ];

    var closestT = Infinity;
    for (var c = 0; c < 4; c++) {
      var co = corners[c];
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        if (!blocksMovement(w)) continue;
        var hit = segmentIntersect(co[0], co[1], co[2], co[3], w.x1, w.y1, w.x2, w.y2);
        if (hit && hit.t < closestT) {
          closestT = hit.t;
        }
      }
    }

    if (closestT === Infinity) return { blocked: false };

    // Back off a fixed distance (0.06 cells ≈ 3px) before the wall,
    // regardless of movement speed, so the token never touches the wall.
    var moveDist = Math.sqrt(mdx * mdx + mdy * mdy);
    var backOffT = moveDist > 0 ? Math.min(0.06 / moveDist, closestT) : 0;
    var stopT = Math.max(0, closestT - backOffT);

    return {
      blocked: true,
      lastX: oldX + mdx * stopT,
      lastY: oldY + mdy * stopT,
    };
  }

  global.WallDrawer = {
    createWallDrawer: createWallDrawer,
    tryToggleDoor: tryToggleDoor,
    pointToSegmentDist: pointToSegmentDist,
    checkMovementCollision: checkMovementCollision,
  };
})(window);
