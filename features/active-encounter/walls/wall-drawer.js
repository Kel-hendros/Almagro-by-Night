// Wall drawing tool for the tactical map.
// Follows the same factory-function pattern as tile-painter.js.
(function initWallDrawerModule(global) {
  "use strict";

  var SNAP_RADIUS = 0.45; // units — max distance to snap to a wall endpoint
  var SNAP_DISPLAY_RANGE = 3; // units — show nearby wall endpoints within this range
  var ERASE_DISTANCE_THRESHOLD = 0.35; // units — max distance to select a wall for erasing
  // Movement collision should use a slightly smaller hull than the token art.
  // Otherwise a 1x1 token trying to pass through a 1-unit doorway has to be
  // almost mathematically centered, which feels sticky and imprecise.
  var TOKEN_COLLISION_INSET_RATIO = 0.10;
  var TOKEN_COLLISION_INSET_MIN = 0.03;
  var TOKEN_COLLISION_INSET_MAX = 0.10;

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
   * @param {Function} opts.onReturnToSelection - callback when right-click cancels drawing
   */
  function createWallDrawer(opts) {
    var getMap = opts.getMap;
    var getWalls = opts.getWalls;
    var setWalls = opts.setWalls;
    var onChanged = opts.onChanged;
    var canEdit = opts.canEdit || function () { return true; };
    var onReturnToSelection = opts.onReturnToSelection || null;

    var active = false;
    var wallType = "wall"; // "wall" | "door" | "window"
    var mode = "draw"; // "draw" | "edit" | "erase"
    var drawShape = "polygon"; // "polygon" | "rectangle" | "circle"
    var chainStart = null; // { x, y } grid intersection
    var doorStart = null; // { x, y, wall, t } first click for door/window
    var shapeOrigin = null; // { x, y } for rectangle/circle drag start
    var shapeDragEnd = null; // { x, y } current drag position
    var CIRCLE_SEGMENTS = 24; // number of wall segments for circle approximation

    // Edit mode state
    var vertexRegistry = null;
    var selection = null;
    var wallEditor = null;
    var wallSnapping = null;
    var editDragStart = null; // { x, y, vertexKeys, wallIds } for drag operations
    var hoverVertexKey = null;
    var addVertexPreview = null; // Preview for wall split point

    // Elements layer state - enables contextual editing
    var elementsLayerActive = false;

    var saveTimer = null;
    var SAVE_DELAY = 600;

    // Initialize edit mode modules lazily
    function ensureEditModules() {
      if (!vertexRegistry && global.WallVertexRegistry) {
        vertexRegistry = global.WallVertexRegistry.createVertexRegistry({ getWalls: getWalls });
      }
      if (!selection && global.WallSelection) {
        selection = global.WallSelection.createWallSelection({
          onSelectionChange: function () {
            updateEditState();
            var map = getMap?.();
            if (map) map.draw();
          },
        });
      }
      if (!wallEditor && global.WallEditor) {
        wallEditor = global.WallEditor.createWallEditor({
          getWalls: getWalls,
          setWalls: setWalls,
          getVertexRegistry: function () { return vertexRegistry; },
          getSelection: function () { return selection; },
          onChanged: function () {
            var map = getMap?.();
            if (map) map.walls = getWalls() || [];
            if (vertexRegistry) vertexRegistry.rebuild();
            updateEditState();
            scheduleSave();
          },
        });
      }
      if (!wallSnapping && global.WallSnapping) {
        wallSnapping = global.WallSnapping.createWallSnapping({
          getVertexRegistry: function () { return vertexRegistry; },
          getWalls: getWalls,
        });
      }
    }

    function getSelection() { return selection; }
    function getVertexRegistry() { return vertexRegistry; }
    function getWallEditor() { return wallEditor; }
    function getWallSnapping() { return wallSnapping; }

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
      editDragStart = null;
      hoverVertexKey = null;
      addVertexPreview = null;
      if (selection) selection.clearSelection();
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.remove("wall-drawer-active");
        map.canvas?.classList.remove("wall-eraser-active");
        map.canvas?.classList.remove("wall-edit-select", "wall-edit-move", "wall-edit-add-vertex", "wall-vertex-hover");
        map._wallDrawerState = null;
        // Keep edit state if elements layer is still active (for contextual editing)
        if (elementsLayerActive) {
          updateEditState();
        } else {
          map._wallEditState = null;
        }
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
      editDragStart = null;

      // Initialize edit modules when entering edit mode
      if (mode === "edit") {
        ensureEditModules();
        if (vertexRegistry) vertexRegistry.rebuild();
      }

      var map = getMap?.();
      if (map) {
        map.canvas?.classList.toggle("wall-drawer-active", mode === "draw");
        map.canvas?.classList.toggle("wall-eraser-active", mode === "erase");
        if (map._wallDrawerState) {
          map._wallDrawerState.mode = mode;
          map._wallDrawerState.chainStart = null;
          map._wallDrawerState.eraseHoverWallId = null;
        }
        // Initialize or clear edit state
        if (mode === "edit") {
          updateEditState();
        } else {
          map._wallEditState = null;
        }
        updateEditCursor();
        map.draw();
      }
    }

    function setElementsLayerActive(isActive) {
      elementsLayerActive = !!isActive;

      var map = getMap?.();

      if (elementsLayerActive) {
        ensureEditModules();
        if (vertexRegistry) vertexRegistry.rebuild();
      } else {
        // Clean up hover state and cursor classes when deactivating
        hoverVertexKey = null;
        addVertexPreview = null;
        if (map && map.canvas) {
          var c = map.canvas.classList;
          c.remove("wall-vertex-hover", "wall-edit-add-vertex");
        }
      }

      // Communicate state to map for rendering color changes
      if (map) {
        map._elementsLayerActive = elementsLayerActive;
      }

      updateEditState();
      if (map) map.draw();
    }

    function isElementsLayerActive() {
      return elementsLayerActive;
    }

    function updateEditCursor() {
      var map = getMap?.();
      if (!map || !map.canvas) return;
      var c = map.canvas.classList;
      c.remove("wall-edit-select", "wall-edit-move", "wall-vertex-hover");
      if (mode !== "edit") return;
      if (hoverVertexKey || editDragStart) {
        c.add("wall-vertex-hover");
      } else {
        c.add("wall-edit-select");
      }
    }

    function updateEditState() {
      var map = getMap?.();
      if (!map) return;

      // Show edit overlay when:
      // - In explicit edit mode, OR
      // - Elements layer is active (contextual editing), OR
      // - During active drag
      var showOverlay = mode === "edit" || elementsLayerActive || editDragStart;

      if (!showOverlay) {
        map._wallEditState = null;
        return;
      }

      var vertices = vertexRegistry ? vertexRegistry.getAllVertices() : [];

      // Build drag preview with wall segments
      var dragPreview = null;
      if (editDragStart && editDragStart.dragVertices) {
        var dv = editDragStart.dragVertices;
        // Calculate delta from current positions
        var deltaX = 0, deltaY = 0;
        if (dv.length > 0 && dv[0].currentX != null) {
          deltaX = dv[0].currentX - dv[0].x;
          deltaY = dv[0].currentY - dv[0].y;
        }

        // Collect walls that have at least one endpoint being dragged
        var walls = getWalls() || [];
        var draggedVertexKeys = {};
        for (var i = 0; i < dv.length; i++) {
          draggedVertexKeys[dv[i].key] = true;
        }

        var previewWalls = [];
        for (var wi = 0; wi < walls.length; wi++) {
          var w = walls[wi];
          var key1 = vertexRegistry ? vertexRegistry.makeKey(w.x1, w.y1) : "";
          var key2 = vertexRegistry ? vertexRegistry.makeKey(w.x2, w.y2) : "";
          var drag1 = draggedVertexKeys[key1];
          var drag2 = draggedVertexKeys[key2];

          if (drag1 || drag2) {
            previewWalls.push({
              x1: drag1 ? w.x1 + deltaX : w.x1,
              y1: drag1 ? w.y1 + deltaY : w.y1,
              x2: drag2 ? w.x2 + deltaX : w.x2,
              y2: drag2 ? w.y2 + deltaY : w.y2,
              type: w.type,
            });
          }
        }

        dragPreview = {
          vertices: dv,
          walls: previewWalls,
          deltaX: deltaX,
          deltaY: deltaY,
        };
      }

      // Get snap guides from drag state
      var guides = [];
      if (editDragStart && editDragStart.snapGuides) {
        guides = editDragStart.snapGuides;
      }

      // Get weld targets from drag state
      var weldTargets = [];
      if (editDragStart && editDragStart.weldTargets) {
        weldTargets = editDragStart.weldTargets;
      }

      map._wallEditState = {
        active: true,
        vertices: vertices,
        selectedWallIds: selection ? selection.getSelectedWallIds() : [],
        selectedVertexKeys: selection ? selection.getSelectedVertexKeys() : [],
        hoverVertexKey: hoverVertexKey,
        addVertexPreview: addVertexPreview,
        boxSelection: selection && selection.isBoxSelecting() ? selection.getBoxSelection() : null,
        dragPreview: dragPreview,
        guides: guides,
        weldTargets: weldTargets,
      };
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

    // Contextual editing handler for elements layer (when wall drawer not explicitly active)
    function handleContextualMouseDown(e, cellX, cellY) {
      // Right-click: let the context menu handle it (don't intercept)
      if (e.button === 2) {
        return false;
      }

      // Left-click only
      if (e.button !== 0) return false;

      // Click on vertex → select and allow dragging
      if (vertexRegistry) {
        var nearVertex = vertexRegistry.findVertex(cellX, cellY, 0.5);
        if (nearVertex) {
          if (selection) {
            selection.selectVertex(nearVertex.key, false);
          }
          startEditDrag(cellX, cellY);
          updateEditState();
          var map = getMap?.();
          if (map) map.draw();
          return true;
        }
      }

      // Click on wall → select the wall segment (for dragging later)
      var nearWall = findNearestWall(cellX, cellY);
      if (nearWall && selection) {
        selection.clearSelection();
        selection.selectWall(nearWall.id, false);
        startEditDrag(cellX, cellY);
        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      // Click on empty space → don't consume, let map handle panning
      return false;
    }

    function handleMouseDown(e, cellX, cellY) {
      // Allow contextual editing when elements layer is active, even without explicit activation
      var contextualMode = elementsLayerActive && !active;

      if (!active && !elementsLayerActive) return false;
      if (!canEdit()) return false;

      // Ensure edit modules are available when elements layer is active
      if (elementsLayerActive) {
        ensureEditModules();
        if (vertexRegistry) vertexRegistry.rebuild();
      }

      // In contextual mode, only handle vertex/wall interactions, not drawing
      if (contextualMode) {
        return handleContextualMouseDown(e, cellX, cellY);
      }

      // ── Right-click ──
      if (e.button === 2) {
        // In draw mode: cancel and return to Selection mode
        if (active && mode === "draw") {
          // Cancel any active drawing operation
          doorStart = null;
          chainStart = null;
          shapeOrigin = null;
          shapeDragEnd = null;

          var map = getMap?.();
          if (map && map._wallDrawerState) {
            map._wallDrawerState.chainStart = null;
            map._wallDrawerState.doorPreview = null;
            map._wallDrawerState.doorStartPoint = null;
            map._wallDrawerState.shapePreview = null;
          }

          // Deactivate and return to selection
          deactivate();
          if (typeof onReturnToSelection === "function") {
            onReturnToSelection();
          }
          map?.draw();
          return true;
        }

        // Clear selection if has any
        if (selection && selection.hasSelection()) {
          selection.clearSelection();
          updateEditState();
          var map = getMap?.();
          if (map) map.draw();
          return true;
        }

        // Let context menu handle right-clicks on walls/vertices
        return false;
      }

      if (e.button !== 0) return false;

      // ── Edit Mode ──
      if (mode === "edit") {
        return handleEditMouseDown(e, cellX, cellY);
      }

      // ── Erase Mode ──
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
            if (vertexRegistry) vertexRegistry.rebuild();
            scheduleSave();
            updatePreview(cellX, cellY);
          }
          return true;
        }
        return true; // Consume click anyway in erase mode
      }

      // NOTE: Contextual editing in Elements layer (vertex/wall interaction)
      // is now handled by handleContextualMouseDown() when in Selection mode.
      // When actively drawing (active = true), we skip this and go directly to
      // shape/chain drawing below.

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

    // ── Edit Mode Mouse Handlers ──

    function handleEditMouseDown(e, cellX, cellY) {
      if (!vertexRegistry || !selection) return false;
      var isShift = e.shiftKey;

      // Check if clicking on a vertex
      var nearVertex = vertexRegistry.findVertex(cellX, cellY, 0.5);

      // Check if clicking on a wall (not near vertex)
      var nearWall = null;
      if (!nearVertex) {
        nearWall = findNearestWall(cellX, cellY);
      }

      // Shift+click on wall: split wall (add vertex)
      if (isShift && nearWall && wallEditor) {
        var pointOnWall = wallEditor.findPointOnWall(cellX, cellY, 0.5);
        if (pointOnWall && pointOnWall.t > 0.05 && pointOnWall.t < 0.95) {
          var newKey = wallEditor.addVertexOnWall(pointOnWall.wallId, pointOnWall.t);
          if (newKey) {
            selection.selectVertex(newKey, false);
            vertexRegistry.rebuild();
            updateEditState();
            var map = getMap?.();
            if (map) map.draw();
          }
          return true;
        }
      }

      // Click on vertex: select and start drag
      if (nearVertex) {
        if (!selection.isVertexSelected(nearVertex.key)) {
          selection.selectVertex(nearVertex.key, isShift);
        }
        startEditDrag(cellX, cellY);
        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      // Click on wall: select and start drag
      if (nearWall) {
        if (!selection.isWallSelected(nearWall.id)) {
          selection.selectWall(nearWall.id, isShift);
        }
        startEditDrag(cellX, cellY);
        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      // Click on empty space: clear selection and start box selection
      if (!isShift) selection.clearSelection();
      selection.startBoxSelection(cellX, cellY);
      updateEditState();
      var map = getMap?.();
      if (map) map.draw();
      return true;
    }

    function startEditDrag(cellX, cellY) {
      var selectedVertexKeys = selection.getSelectedVertexKeys();
      var selectedWallIds = selection.getSelectedWallIds();

      // Collect all vertex positions that will be dragged
      var dragVertices = [];
      for (var i = 0; i < selectedVertexKeys.length; i++) {
        var vertex = vertexRegistry.getVertexByKey(selectedVertexKeys[i]);
        if (vertex) {
          dragVertices.push({ key: selectedVertexKeys[i], x: vertex.x, y: vertex.y });
        }
      }

      // For walls, collect their endpoints
      var walls = getWalls() || [];
      for (var j = 0; j < selectedWallIds.length; j++) {
        var wall = walls.find(function (w) { return w.id === selectedWallIds[j]; });
        if (wall) {
          var key1 = vertexRegistry.makeKey(wall.x1, wall.y1);
          var key2 = vertexRegistry.makeKey(wall.x2, wall.y2);
          if (!dragVertices.some(function (v) { return v.key === key1; })) {
            dragVertices.push({ key: key1, x: wall.x1, y: wall.y1 });
          }
          if (!dragVertices.some(function (v) { return v.key === key2; })) {
            dragVertices.push({ key: key2, x: wall.x2, y: wall.y2 });
          }
        }
      }

      editDragStart = {
        x: cellX,
        y: cellY,
        vertexKeys: selectedVertexKeys.slice(),
        wallIds: selectedWallIds.slice(),
        dragVertices: dragVertices,
      };
    }

    function handleEditMouseMove(e, cellX, cellY) {
      // Update hover state
      var prevHover = hoverVertexKey;
      hoverVertexKey = null;
      addVertexPreview = null;

      if (vertexRegistry) {
        var nearVertex = vertexRegistry.findVertex(cellX, cellY, 0.5);
        hoverVertexKey = nearVertex ? nearVertex.key : null;
      }

      // Handle box selection drag
      if (selection && selection.isBoxSelecting()) {
        selection.updateBoxSelection(cellX, cellY);
        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      // Handle drag operation
      if (editDragStart) {
        var deltaX = cellX - editDragStart.x;
        var deltaY = cellY - editDragStart.y;
        var snapGuides = [];

        // Apply snapping when ALT is held
        var isAlt = e && e.altKey;
        var isShift = e && e.shiftKey;

        if ((isAlt || isShift) && editDragStart.dragVertices && editDragStart.dragVertices.length > 0) {
          // Use the first dragged vertex as reference for snapping
          var refVertex = editDragStart.dragVertices[0];
          var targetX = refVertex.x + deltaX;
          var targetY = refVertex.y + deltaY;

          // Get keys of vertices being dragged (to exclude from snap targets)
          var excludeKeys = [];
          for (var ek = 0; ek < editDragStart.dragVertices.length; ek++) {
            excludeKeys.push(editDragStart.dragVertices[ek].key);
          }

          // For angle snapping, find a connected vertex as origin
          var angleOriginX = null;
          var angleOriginY = null;
          if (isShift && vertexRegistry) {
            var vertex = vertexRegistry.getVertexByKey(refVertex.key);
            if (vertex && vertex.endpoints && vertex.endpoints.length > 0) {
              // Find other endpoint of first connected wall
              var walls = getWalls() || [];
              var ep = vertex.endpoints[0];
              var connWall = walls.find(function (w) { return w.id === ep.wallId; });
              if (connWall) {
                if (ep.end === 1) {
                  angleOriginX = connWall.x2;
                  angleOriginY = connWall.y2;
                } else {
                  angleOriginX = connWall.x1;
                  angleOriginY = connWall.y1;
                }
              }
            }
          }

          if (wallSnapping) {
            var snapResult = wallSnapping.snap(targetX, targetY, {
              excludeKeys: excludeKeys,
              forceAlignment: isAlt,
              forceAngle: isShift,
              originX: angleOriginX,
              originY: angleOriginY,
            });

            if (snapResult.snapped) {
              // Adjust delta based on snap
              deltaX = snapResult.x - refVertex.x;
              deltaY = snapResult.y - refVertex.y;

              // Collect guides for rendering
              if (snapResult.guides) {
                snapGuides = snapResult.guides;
              }

              // Add angle guide line if angle snapped
              if (snapResult.type === "angle" && angleOriginX != null) {
                snapGuides.push({
                  x1: angleOriginX,
                  y1: angleOriginY,
                  x2: snapResult.x,
                  y2: snapResult.y,
                });
              }
            }
          }
        }

        // Store snap guides for rendering
        editDragStart.snapGuides = snapGuides;
        editDragStart.currentDeltaX = deltaX;
        editDragStart.currentDeltaY = deltaY;

        // Update drag preview positions
        if (editDragStart.dragVertices) {
          for (var i = 0; i < editDragStart.dragVertices.length; i++) {
            var dv = editDragStart.dragVertices[i];
            dv.currentX = dv.x + deltaX;
            dv.currentY = dv.y + deltaY;
          }
        }

        // Detect potential weld targets (vertices that could be merged on drop)
        var WELD_THRESHOLD = 0.2;
        var weldTargets = [];
        if (vertexRegistry && editDragStart.dragVertices) {
          var movedKeySet = {};
          for (var mk = 0; mk < editDragStart.dragVertices.length; mk++) {
            movedKeySet[editDragStart.dragVertices[mk].key] = true;
          }

          var allVertices = vertexRegistry.getAllVertices();
          for (var mv = 0; mv < editDragStart.dragVertices.length; mv++) {
            var movedV = editDragStart.dragVertices[mv];
            if (movedV.currentX == null) continue;

            for (var av = 0; av < allVertices.length; av++) {
              var otherV = allVertices[av];
              if (movedKeySet[otherV.key]) continue;

              var wdx = movedV.currentX - otherV.x;
              var wdy = movedV.currentY - otherV.y;
              var wdist = Math.sqrt(wdx * wdx + wdy * wdy);

              if (wdist < WELD_THRESHOLD) {
                weldTargets.push({
                  sourceKey: movedV.key,
                  targetKey: otherV.key,
                  targetX: otherV.x,
                  targetY: otherV.y,
                });
                break; // One weld target per moved vertex
              }
            }
          }
        }
        editDragStart.weldTargets = weldTargets;

        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      // Update cursor if hover changed
      if (hoverVertexKey !== prevHover) {
        updateEditCursor();
      }

      updateEditState();
      var map = getMap?.();
      if (map) map.draw();
      return false;
    }

    function handleEditMouseUp(cellX, cellY) {
      // Commit box selection
      if (selection && selection.isBoxSelecting()) {
        var vertices = vertexRegistry ? vertexRegistry.getAllVertices() : [];
        var walls = getWalls() || [];
        selection.commitBoxSelection(walls, vertices, false);
        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      // Commit drag operation
      if (editDragStart && wallEditor) {
        // Use snapped delta if available, otherwise calculate from mouse position
        var deltaX = editDragStart.currentDeltaX != null ? editDragStart.currentDeltaX : (cellX - editDragStart.x);
        var deltaY = editDragStart.currentDeltaY != null ? editDragStart.currentDeltaY : (cellY - editDragStart.y);

        // Only commit if moved significantly
        if (Math.abs(deltaX) > 0.01 || Math.abs(deltaY) > 0.01) {
          // Capture weld targets BEFORE moving (these were calculated during drag)
          var weldTargets = editDragStart.weldTargets || [];

          // Always use moveVertices with all dragged vertices.
          // This ensures adjacent walls that share vertices stay connected.
          // dragVertices contains both explicitly selected vertices AND
          // the endpoints of selected walls.
          if (editDragStart.dragVertices && editDragStart.dragVertices.length > 0) {
            var vertexKeysToMove = [];
            for (var i = 0; i < editDragStart.dragVertices.length; i++) {
              vertexKeysToMove.push(editDragStart.dragVertices[i].key);
            }
            wallEditor.moveVertices(vertexKeysToMove, deltaX, deltaY);
          }

          // Perform vertex welding using the targets we detected during drag
          // After moveVertices, the moved vertex is now at the target position
          // We need to find and weld vertices that ended up at the same spot
          if (vertexRegistry && weldTargets.length > 0) {
            vertexRegistry.rebuild();

            for (var wti = 0; wti < weldTargets.length; wti++) {
              var wt = weldTargets[wti];
              // The target vertex key should still be valid (it didn't move)
              var targetVertex = vertexRegistry.getVertexByKey(wt.targetKey);
              if (!targetVertex) continue;

              // Find the moved vertex by its NEW position (original + delta)
              // The dragVertices entry has x, y (original) so new pos = x+deltaX, y+deltaY
              var movedDv = null;
              for (var dvi = 0; dvi < editDragStart.dragVertices.length; dvi++) {
                if (editDragStart.dragVertices[dvi].key === wt.sourceKey) {
                  movedDv = editDragStart.dragVertices[dvi];
                  break;
                }
              }
              if (!movedDv) continue;

              var newX = movedDv.x + deltaX;
              var newY = movedDv.y + deltaY;
              var newKey = vertexRegistry.makeKey(newX, newY);

              var movedVertex = vertexRegistry.getVertexByKey(newKey);
              if (!movedVertex) continue;

              // Weld: merge moved vertex into the target vertex
              wallEditor.weldVertices(wt.targetKey, newKey);
              vertexRegistry.rebuild();
            }
          }
        }

        editDragStart = null;
        updateEditState();
        var map = getMap?.();
        if (map) map.draw();
        return true;
      }

      editDragStart = null;
      return false;
    }

    function handleMouseMove(e, cellX, cellY) {
      // Handle vertex drag in contextual mode (elements layer active)
      if (elementsLayerActive && editDragStart) {
        return handleEditMouseMove(e, cellX, cellY);
      }

      // Update hover state in Selection mode (contextual editing, no drag)
      // In Selection mode, we highlight vertices on hover but do NOT show
      // add-vertex preview since clicking just selects, not adds.
      if (elementsLayerActive && !active) {
        var prevHover = hoverVertexKey;
        hoverVertexKey = null;
        addVertexPreview = null; // Never show add preview in Selection mode

        if (vertexRegistry) {
          var nearVertex = vertexRegistry.findVertex(cellX, cellY, 0.5);
          hoverVertexKey = nearVertex ? nearVertex.key : null;
        }

        // Update cursor based on hover
        var map = getMap?.();
        if (map && map.canvas) {
          var c = map.canvas.classList;
          c.remove("wall-vertex-hover", "wall-edit-add-vertex");
          if (hoverVertexKey) {
            c.add("wall-vertex-hover");
          }
        }

        // Redraw if hover changed
        if (hoverVertexKey !== prevHover) {
          updateEditState();
          if (map) map.draw();
        }

        return false;
      }

      if (!active) return false;

      // Handle vertex drag regardless of mode
      if (editDragStart) {
        return handleEditMouseMove(e, cellX, cellY);
      }

      // Edit mode
      if (mode === "edit") {
        return handleEditMouseMove(e, cellX, cellY);
      }

      if (shapeOrigin) {
        shapeDragEnd = { x: cellX, y: cellY };
      }
      updatePreview(cellX, cellY);
      return false;
    }

    function handleMouseUp(e, cellX, cellY) {
      // Handle vertex drag in contextual mode (elements layer active)
      if (elementsLayerActive && editDragStart) {
        var result = handleEditMouseUp(cellX, cellY);
        // Clear selection after contextual drag
        if (selection) {
          selection.clearSelection();
          updateEditState();
        }
        return result;
      }

      // Handle vertex drag regardless of mode
      if (active && editDragStart) {
        var result = handleEditMouseUp(cellX, cellY);
        // Clear selection after contextual drag in draw mode
        if (mode !== "edit" && selection) {
          selection.clearSelection();
          updateEditState();
        }
        return result;
      }

      // Edit mode
      if (active && mode === "edit") {
        return handleEditMouseUp(cellX, cellY);
      }

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

      // Delete key in edit mode
      if ((e.key === "Delete" || e.key === "Backspace") && mode === "edit") {
        if (wallEditor && selection && selection.hasSelection()) {
          wallEditor.deleteSelected();
          updateEditState();
          var map = getMap?.();
          if (map) map.draw();
          return true;
        }
      }

      // Escape key
      if (e.key === "Escape") {
        // Clear selection in edit mode
        if (mode === "edit" && selection && selection.hasSelection()) {
          selection.clearSelection();
          updateEditState();
          var map = getMap?.();
          if (map) map.draw();
          return true;
        }
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
      // Notify Paper.js editor to refresh
      document.dispatchEvent(new CustomEvent("ae-walls-changed"));
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
      // Elements layer (contextual editing)
      setElementsLayerActive: setElementsLayerActive,
      isElementsLayerActive: isElementsLayerActive,
      // Event handlers
      handleMouseDown: handleMouseDown,
      handleMouseMove: handleMouseMove,
      handleMouseUp: handleMouseUp,
      handleKeyDown: handleKeyDown,
      clearAll: clearAll,
      getWallCount: getWallCount,
      // Edit mode access
      getSelection: getSelection,
      getVertexRegistry: getVertexRegistry,
      getWallEditor: getWallEditor,
      getWallSnapping: getWallSnapping,
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
    var epsilon = Math.min(
      TOKEN_COLLISION_INSET_MAX,
      Math.max(TOKEN_COLLISION_INSET_MIN, size * TOKEN_COLLISION_INSET_RATIO)
    );
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
