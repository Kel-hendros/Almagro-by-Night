// Paper.js Wall Editor
// Paper.js is the source of truth for editing. Walls are derived on save.
(function initPaperWallEditor(global) {
  "use strict";

  // ── Constants ──
  var MIN_DOOR_WIDTH = 1.0;  // 1.5 meters ÷ 1.5 m/unit = 1 unit
  // Curve type colors for Elements layer
  var WALL_COLOR = "#5588cc";   // Blue for walls
  var DOOR_COLOR = "#8b6914";   // Brown for doors
  var WINDOW_COLOR = "#7bb3d4"; // Light blue for windows
  var GRATE_COLOR = "#f08a24";  // Orange for grates
  var CURTAIN_COLOR = "#9c5cff"; // Violet for curtains
  var DEFAULT_GRID_SPACING = 1.0;
  var GRID_NUDGE_STEP = 0.1;
  var SEGMENT_TYPES = new Set(["wall", "door", "window", "grate", "curtain"]);

  function createPaperWallEditor(opts) {
    var container = opts.container;
    var getWallPaths = opts.getWallPaths;
    var setWallPaths = opts.setWallPaths;
    var setWalls = opts.setWalls;
    var onChanged = opts.onChanged || function () {};
    var getTransform = opts.getTransform;
    var getGridState = opts.getGridState;
    var onGridStateChange = opts.onGridStateChange || function () {};
    var getInteractiveMarkerAt = opts.getInteractiveMarkerAt;
    var clearInteractiveMarkerSelection = opts.clearInteractiveMarkerSelection || function () {};
    var onStartPan = opts.onStartPan;       // Callback to start map panning
    var onWallContext = opts.onWallContext; // Callback for right-click context menu

    var canvas = null;
    var scope = null;
    var isActive = false;
    var drawMode = null; // null | "wall" | "door" | "window" | "grate" | "curtain"
    var shapeMode = "polygon"; // "polygon" | "rectangle" | "circle"
    var currentPath = null;
    var snapIndicator = null;
    var angleGuides = null; // Group for angle guide lines
    var gridVisuals = null; // Group for edit grid dots
    var segmentVisuals = null; // Group for per-segment color overlays
    var selectionVisuals = null; // Group for selected vertex markers
    var shapeStartPoint = null; // For rectangle/circle: the starting point
    var SNAP_THRESHOLD = 0.3; // Grid units
    var GUIDE_LENGTH = 15; // Length of guide lines in grid units
    var CIRCLE_SEGMENTS = 24; // Number of segments for circle approximation
    var VERTEX_SELECT_RADIUS = 0.17;
    var DRAG_START_THRESHOLD_PX = 6;
    var inputEnabled = true;
    var editorGridState = normalizeEditorGridState(getGridState ? getGridState() : null);

    function normalizeEditorGridState(raw) {
      var spacing = Number.isFinite(raw?.spacing) && raw.spacing > 0
        ? raw.spacing
        : DEFAULT_GRID_SPACING;

      function normalizeOffset(value) {
        if (!Number.isFinite(value)) return 0;
        var normalized = value % spacing;
        if (normalized < 0) normalized += spacing;
        if (Math.abs(normalized) < 0.0001 || Math.abs(normalized - spacing) < 0.0001) {
          normalized = 0;
        }
        return Math.round(normalized * 1000) / 1000;
      }

      return {
        enabled: raw?.enabled === true,
        spacing: spacing,
        offsetX: normalizeOffset(raw?.offsetX),
        offsetY: normalizeOffset(raw?.offsetY),
      };
    }

    function getEditorGridState() {
      return {
        enabled: !!editorGridState.enabled,
        spacing: editorGridState.spacing,
        offsetX: editorGridState.offsetX,
        offsetY: editorGridState.offsetY,
      };
    }

    function emitGridStateChange() {
      onGridStateChange(getEditorGridState());
    }

    // ── Segment Metadata Helpers ──

    function createDefaultSegmentData(type) {
      var normalizedType = SEGMENT_TYPES.has(type) ? type : "wall";
      return {
        id: global.AEWallPaths?.generateSegmentId?.() ||
          ("ws-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8)),
        type: normalizedType,
        doorOpen: false,
        locked: false,
        name: "",
      };
    }

    function getDefaultSegmentType(path) {
      if (!path || !path.data) return "wall";
      if (SEGMENT_TYPES.has(path.data.defaultSegmentType)) return path.data.defaultSegmentType;
      if (Array.isArray(path.data.segmentData) && path.data.segmentData.length) {
        var firstType = path.data.segmentData[0] && path.data.segmentData[0].type;
        if (SEGMENT_TYPES.has(firstType)) return firstType;
      }
      return "wall";
    }

    function normalizeSegmentData(segment) {
      var base = createDefaultSegmentData();
      if (!segment || typeof segment !== "object") return base;
      if (segment.id) base.id = String(segment.id);
      if (SEGMENT_TYPES.has(segment.type)) {
        base.type = segment.type;
      }
      if (base.type === "door" || base.type === "window") {
        base.doorOpen = !!segment.doorOpen;
        base.locked = !!segment.locked;
      }
      base.name = typeof segment.name === "string" ? segment.name : "";
      return base;
    }

    function ensureSegmentData(path) {
      if (!path || !path.data) return;
      if (!Array.isArray(path.data.segmentData)) {
        path.data.segmentData = [];
      }
      syncSegmentDataLength(path);
    }

    function syncSegmentDataLength(path) {
      if (!path || !path.data || !Array.isArray(path.data.segmentData)) return;
      var numCurves = path.closed ? path.segments.length : path.segments.length - 1;
      if (numCurves < 0) numCurves = 0;

      while (path.data.segmentData.length < numCurves) {
        path.data.segmentData.push(createDefaultSegmentData(getDefaultSegmentType(path)));
      }
      if (path.data.segmentData.length > numCurves) {
        path.data.segmentData.length = numCurves;
      }
    }

    function getSegmentData(path, curveIndex) {
      ensureSegmentData(path);
      if (curveIndex < 0 || curveIndex >= path.data.segmentData.length) return createDefaultSegmentData();
      path.data.segmentData[curveIndex] = normalizeSegmentData(path.data.segmentData[curveIndex]);
      return path.data.segmentData[curveIndex];
    }

    function getCurveType(path, curveIndex) {
      return getSegmentData(path, curveIndex).type || "wall";
    }

    function setCurveType(path, curveIndex, type) {
      ensureSegmentData(path);
      if (curveIndex >= 0 && curveIndex < path.data.segmentData.length) {
        var segment = getSegmentData(path, curveIndex);
        segment.type = SEGMENT_TYPES.has(type) ? type : "wall";
        if (segment.type !== "door" && segment.type !== "window") {
          segment.doorOpen = false;
          segment.locked = false;
        }
      }
    }

    function isDoorOpen(path, curveIndex) {
      return !!getSegmentData(path, curveIndex).doorOpen;
    }

    function setDoorOpen(path, curveIndex, isOpen) {
      if (!path || !path.data) return;
      getSegmentData(path, curveIndex).doorOpen = !!isOpen;
    }

    function createPathStyle(type) {
      return {
        strokeColor: getStrokeColorForType(type),
        strokeWidth: 0.08,
        strokeCap: "butt",
        strokeJoin: "round",
      };
    }

    function getStrokeColorForType(type) {
      if (type === "door") return DOOR_COLOR;
      if (type === "window") return WINDOW_COLOR;
      if (type === "grate") return GRATE_COLOR;
      if (type === "curtain") return CURTAIN_COLOR;
      return WALL_COLOR;
    }

    function getPixelsPerUnit() {
      var t = getTransform ? getTransform() : null;
      return Math.max(1, (t?.gridSize || 40) * (t?.scale || 1));
    }

    function getVertexHitTolerance() {
      return Math.max(0.22, 14 / getPixelsPerUnit());
    }

    function getDragThresholdUnits() {
      return Math.max(0.04, DRAG_START_THRESHOLD_PX / getPixelsPerUnit());
    }

    function getGridSnapPoint(point) {
      if (!scope || !editorGridState.enabled || !point) return null;
      var spacing = editorGridState.spacing || DEFAULT_GRID_SPACING;
      var snappedX =
        Math.round((point.x - editorGridState.offsetX) / spacing) * spacing +
        editorGridState.offsetX;
      var snappedY =
        Math.round((point.y - editorGridState.offsetY) / spacing) * spacing +
        editorGridState.offsetY;

      return new scope.Point(
        Math.round(snappedX * 1000) / 1000,
        Math.round(snappedY * 1000) / 1000,
      );
    }

    function resolveSnapPoint(point, options) {
      var opts = options || {};
      var vertexPoint = opts.excludeSegments
        ? findNearestVertexExcluding(point, opts.excludeSegment, opts.excludeSegments)
        : findNearestVertex(point, opts.excludePath || null);
      if (vertexPoint) return vertexPoint;
      return getGridSnapPoint(point);
    }

    function refreshGridVisuals() {
      if (gridVisuals) {
        gridVisuals.remove();
        gridVisuals = null;
      }
      if (!scope || !scope.project || !scope.project.activeLayer || !editorGridState.enabled) return;

      var t = getTransform ? getTransform() : { scale: 1, offsetX: 0, offsetY: 0, gridSize: 40 };
      var pixelsPerUnit = Math.max(1, (t.gridSize || 40) * (t.scale || 1));
      var viewWidth = canvas ? canvas.width : scope.view.viewSize.width;
      var viewHeight = canvas ? canvas.height : scope.view.viewSize.height;
      var worldLeft = (-t.offsetX) / pixelsPerUnit;
      var worldTop = (-t.offsetY) / pixelsPerUnit;
      var worldRight = (viewWidth - t.offsetX) / pixelsPerUnit;
      var worldBottom = (viewHeight - t.offsetY) / pixelsPerUnit;
      var spacing = editorGridState.spacing || DEFAULT_GRID_SPACING;
      var startX =
        Math.floor((worldLeft - editorGridState.offsetX) / spacing) * spacing +
        editorGridState.offsetX;
      var startY =
        Math.floor((worldTop - editorGridState.offsetY) / spacing) * spacing +
        editorGridState.offsetY;
      var dotRadius = Math.max(0.018, 1.6 / pixelsPerUnit);

      gridVisuals = new scope.Group({ data: { isOverlay: true, isGridOverlay: true } });

      for (var x = startX; x <= worldRight + spacing; x += spacing) {
        var roundedX = Math.round(x * 1000) / 1000;
        for (var y = startY; y <= worldBottom + spacing; y += spacing) {
          gridVisuals.addChild(new scope.Path.Circle({
            center: new scope.Point(roundedX, Math.round(y * 1000) / 1000),
            radius: dotRadius,
            fillColor: "rgba(255, 255, 255, 0.28)",
            data: { isOverlay: true, isGridOverlay: true },
          }));
        }
      }

      scope.project.activeLayer.insertChild(0, gridVisuals);
    }

    function setGridState(nextState, options) {
      editorGridState = normalizeEditorGridState(Object.assign({}, editorGridState, nextState || {}));
      if (isActive) {
        refreshGridVisuals();
        scope.view.draw();
      }
      if (!options || options.silent !== true) {
        emitGridStateChange();
      }
    }

    function setGridEnabled(enabled) {
      setGridState({ enabled: enabled === true });
    }

    function nudgeGrid(offsetX, offsetY) {
      setGridState({
        offsetX: editorGridState.offsetX + offsetX,
        offsetY: editorGridState.offsetY + offsetY,
      });
    }

    function createPaperPath(pathLike) {
      if (!scope) return null;
      var pathData = global.AEWallPaths?.normalizeWallPath?.(pathLike) || pathLike;
      if (!pathData || !Array.isArray(pathData.points) || pathData.points.length < 2) return null;

      var path = new scope.Path(createPathStyle(
        Array.isArray(pathData.segments) && pathData.segments[0] ? pathData.segments[0].type : "wall"
      ));
      path.closed = !!pathData.closed;
      path.data = {
        id: pathData.id || (global.AEWallPaths?.generatePathId?.() || generateId()),
        defaultSegmentType: Array.isArray(pathData.segments) && pathData.segments[0]
          ? pathData.segments[0].type
          : "wall",
        segmentData: Array.isArray(pathData.segments) ? pathData.segments.map(normalizeSegmentData) : [],
      };

      for (var i = 0; i < pathData.points.length; i++) {
        path.add(pathData.points[i]);
      }

      syncSegmentDataLength(path);
      return path;
    }

    function exportWallPaths() {
      if (!scope) return [];
      var wallPaths = [];
      var items = scope.project.activeLayer.children;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item.segments || item.segments.length < 2) continue;
        if (!item.data || !item.data.id || item.data.isOverlay) continue;

        ensureSegmentData(item);
        wallPaths.push({
          id: item.data.id,
          closed: !!item.closed,
          points: item.segments.map(function (segment) {
            return { x: segment.point.x, y: segment.point.y };
          }),
          segments: item.data.segmentData.map(function (segment) {
            return normalizeSegmentData(segment);
          }),
        });
      }

      return global.AEWallPaths?.normalizeWallPaths?.(wallPaths) || wallPaths;
    }

    function refreshSegmentVisuals() {
      if (!scope || !scope.project || !scope.project.activeLayer) return;

      if (segmentVisuals) {
        segmentVisuals.remove();
        segmentVisuals = null;
      }

      segmentVisuals = new scope.Group({ data: { isOverlay: true } });
      var items = scope.project.activeLayer.children.slice();

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || item === segmentVisuals) continue;
        if (!item.segments || item.segments.length < 2) continue;
        if (!item.data || !item.data.id || item.data.isOverlay) continue;

        ensureSegmentData(item);
        var curveCount = item.closed ? item.segments.length : item.segments.length - 1;

        for (var j = 0; j < curveCount; j++) {
          var point1 = item.segments[j].point;
          var point2 = item.closed && j === item.segments.length - 1
            ? item.segments[0].point
            : item.segments[j + 1].point;
          if (!point1 || !point2 || point1.getDistance(point2) < 0.0001) continue;
          var segmentType = getCurveType(item, j);

          segmentVisuals.addChild(new scope.Path.Line({
            from: point1,
            to: point2,
            strokeColor: getStrokeColorForType(segmentType),
            strokeWidth: 0.08,
            strokeCap: "butt",
            strokeJoin: "round",
            data: { isOverlay: true },
          }));

        }
      }
    }

    function refreshSelectionVisuals() {
      if (!scope || !scope.project || !scope.project.activeLayer) return;

      if (selectionVisuals) {
        selectionVisuals.remove();
        selectionVisuals = null;
      }

      selectionVisuals = new scope.Group({ data: { isOverlay: true, isSelectionOverlay: true } });

      var vertexPaths = [];
      var seenPaths = new Set();

      for (var p = 0; p < selectedItems.length; p++) {
        var selectedPath = selectedItems[p];
        if (!selectedPath || !selectedPath.segments || seenPaths.has(selectedPath)) continue;
        seenPaths.add(selectedPath);
        vertexPaths.push(selectedPath);
      }

      for (var sp = 0; sp < selectedSegments.length; sp++) {
        var segmentPath = selectedSegments[sp] && selectedSegments[sp].path;
        if (!segmentPath || !segmentPath.segments || seenPaths.has(segmentPath)) continue;
        seenPaths.add(segmentPath);
        vertexPaths.push(segmentPath);
      }

      if (hoveredPath && hoveredPath.segments && !seenPaths.has(hoveredPath)) {
        seenPaths.add(hoveredPath);
        vertexPaths.push(hoveredPath);
      }

      for (var vp = 0; vp < vertexPaths.length; vp++) {
        var path = vertexPaths[vp];
        for (var vs = 0; vs < path.segments.length; vs++) {
          var vertex = path.segments[vs];
          if (!vertex || !vertex.point) continue;
          selectionVisuals.addChild(new scope.Path.Circle({
            center: vertex.point,
            radius: VERTEX_SELECT_RADIUS * 0.42,
            fillColor: "#ffffff",
            data: { isOverlay: true, isSelectionOverlay: true },
          }));
        }
      }

      for (var i = 0; i < selectedSegments.length; i++) {
        var segment = selectedSegments[i];
        if (!segment || !segment.path || !segment.point) continue;

        selectionVisuals.addChild(new scope.Path.Circle({
          center: segment.point,
          radius: VERTEX_SELECT_RADIUS,
          fillColor: "rgba(100, 200, 255, 0.28)",
          strokeColor: "#9ad6ff",
          strokeWidth: 0.06,
          data: { isOverlay: true, isSelectionOverlay: true },
        }));

        selectionVisuals.addChild(new scope.Path.Circle({
          center: segment.point,
          radius: VERTEX_SELECT_RADIUS * 0.42,
          fillColor: "#ffffff",
          data: { isOverlay: true, isSelectionOverlay: true },
        }));
      }
    }

    function toggleDoorState(path, curveIndex) {
      var isOpen = isDoorOpen(path, curveIndex);
      setDoorOpen(path, curveIndex, !isOpen);
      saveProject();
      return !isOpen;
    }

    // ── Activate / Deactivate ──

    function activate() {
      if (isActive) return;
      isActive = true;
      editorGridState = normalizeEditorGridState(getGridState ? getGridState() : editorGridState);

      canvas = document.createElement("canvas");
      canvas.id = "paper-wall-canvas";
      container.appendChild(canvas);

      scope = new paper.PaperScope();
      scope.setup(canvas);

      resizeCanvas();
      loadProject();
      bindEvents();
      setInputEnabled(inputEnabled);
      refreshSegmentVisuals();
      scope.view.draw();
    }

    function deactivate() {
      if (!isActive) return;
      saveProject();
      unbindEvents();

      if (scope) {
        scope.project.clear();
        scope.remove();
        scope = null;
      }
      if (canvas && canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
        canvas = null;
      }

      container.style.cursor = "";
      currentPath = null;
      snapIndicator = null;
      angleGuides = null;
      gridVisuals = null;
      segmentVisuals = null;
      selectionVisuals = null;
      shapeStartPoint = null;
      drawMode = null;
      hoveredPath = null;
      isActive = false;
    }

    function resizeCanvas() {
      if (!canvas || !container) return;
      var rect = container.getBoundingClientRect();
      canvas.width = rect.width;
      canvas.height = rect.height;
      if (scope && scope.view) {
        scope.view.viewSize = new scope.Size(rect.width, rect.height);
        updateViewTransform();
      }
    }

    function updateViewTransform() {
      if (!scope || !scope.view) return;
      var t = getTransform ? getTransform() : { scale: 1, offsetX: 0, offsetY: 0, gridSize: 40 };
      var matrix = new scope.Matrix();
      matrix.translate(t.offsetX, t.offsetY);
      matrix.scale(t.gridSize * t.scale);
      scope.view.matrix = matrix;
      refreshGridVisuals();
      scope.view.draw();
    }

    // ── Load / Save Project ──

    function loadProject() {
      if (!scope) return;
      scope.project.activeLayer.removeChildren();
      selectedItem = null;
      selectedItems = [];
      selectedSegment = null;
      selectedSegments = [];
      hoveredPath = null;

      var wallPaths = getWallPaths ? getWallPaths() : null;
      if (Array.isArray(wallPaths) && wallPaths.length) {
        for (var i = 0; i < wallPaths.length; i++) {
          try {
            createPaperPath(wallPaths[i]);
          } catch (e) {
            console.warn("Failed to load wall path into Paper editor:", e);
          }
        }
      }

      refreshGridVisuals();
      refreshSegmentVisuals();
      refreshSelectionVisuals();
      scope.view.draw();
    }

    function saveProject() {
      if (!scope) return;
      var wallPaths = exportWallPaths();
      if (setWallPaths) {
        setWallPaths(wallPaths);
      }
      refreshSegmentVisuals();
      refreshSelectionVisuals();
      deriveWalls(wallPaths);
    }

    function deriveWalls(wallPaths) {
      if (!scope || !setWalls) return;
      var sourcePaths = Array.isArray(wallPaths) ? wallPaths : exportWallPaths();
      var walls = global.AEWallPaths?.compileWalls?.(sourcePaths) || [];
      setWalls(walls);
      onChanged();
    }

    // ── Snap to Vertex ──

    var WELD_THRESHOLD = 0.08; // Endpoints within this distance are merge candidates

    /**
     * Try to merge paths that share endpoints after welding.
     * When two open paths have endpoints at the same position, merge them into one.
     */
    function tryMergePaths() {
      if (!scope) return;

      var items = scope.project.activeLayer.children.slice(); // Copy to avoid mutation issues
      var merged = true;

      // Keep trying until no more merges happen
      while (merged) {
        merged = false;

        for (var i = 0; i < items.length; i++) {
          var pathA = items[i];
          if (!pathA || !pathA.segments || pathA.segments.length < 2) continue;
          if (pathA === snapIndicator || pathA === angleGuides) continue;
          if (!pathA.data || !pathA.data.id || pathA.data.isOverlay) continue;
          if (pathA.closed) continue; // Only merge open paths

          var aFirst = pathA.firstSegment.point;
          var aLast = pathA.lastSegment.point;

          for (var j = i + 1; j < items.length; j++) {
            var pathB = items[j];
            if (!pathB || !pathB.segments || pathB.segments.length < 2) continue;
            if (pathB === snapIndicator || pathB === angleGuides) continue;
            if (!pathB.data || !pathB.data.id || pathB.data.isOverlay) continue;
            if (pathB.closed) continue;

            var bFirst = pathB.firstSegment.point;
            var bLast = pathB.lastSegment.point;

            // Check all 4 endpoint combinations
            var mergeType = null;
            if (aLast.getDistance(bFirst) < WELD_THRESHOLD) {
              mergeType = "aLast-bFirst"; // A's end connects to B's start
            } else if (aLast.getDistance(bLast) < WELD_THRESHOLD) {
              mergeType = "aLast-bLast"; // A's end connects to B's end (reverse B)
            } else if (aFirst.getDistance(bFirst) < WELD_THRESHOLD) {
              mergeType = "aFirst-bFirst"; // A's start connects to B's start (reverse A)
            } else if (aFirst.getDistance(bLast) < WELD_THRESHOLD) {
              mergeType = "aFirst-bLast"; // A's start connects to B's end
            }

            if (mergeType) {
              var sharedPoint = null;
              if (mergeType === "aLast-bFirst") {
                sharedPoint = bFirst.clone();
                pathA.lastSegment.point = sharedPoint.clone();
                pathB.firstSegment.point = sharedPoint.clone();
              } else if (mergeType === "aLast-bLast") {
                sharedPoint = bLast.clone();
                pathA.lastSegment.point = sharedPoint.clone();
                pathB.lastSegment.point = sharedPoint.clone();
              } else if (mergeType === "aFirst-bFirst") {
                sharedPoint = bFirst.clone();
                pathA.firstSegment.point = sharedPoint.clone();
                pathB.firstSegment.point = sharedPoint.clone();
              } else if (mergeType === "aFirst-bLast") {
                sharedPoint = bLast.clone();
                pathA.firstSegment.point = sharedPoint.clone();
                pathB.lastSegment.point = sharedPoint.clone();
              }

              ensureSegmentData(pathA);
              ensureSegmentData(pathB);
              var aSegments = pathA.data.segmentData.map(function (segment) {
                return normalizeSegmentData(segment);
              });
              var bSegments = pathB.data.segmentData.map(function (segment) {
                return normalizeSegmentData(segment);
              });

              // Merge pathB into pathA
              var bPoints = [];
              for (var k = 0; k < pathB.segments.length; k++) {
                bPoints.push(pathB.segments[k].point.clone());
              }

              var newSegmentData = [];

              if (mergeType === "aLast-bFirst") {
                // Append B's points to A (skip first point, it's the shared vertex)
                for (var k = 1; k < bPoints.length; k++) {
                  pathA.add(bPoints[k]);
                }
                newSegmentData = aSegments.concat(bSegments);

              } else if (mergeType === "aLast-bLast") {
                // Reverse B and append (skip last point which is now first after reverse)
                bPoints.reverse();
                bSegments.reverse();
                for (var k = 1; k < bPoints.length; k++) {
                  pathA.add(bPoints[k]);
                }
                newSegmentData = aSegments.concat(bSegments);

              } else if (mergeType === "aFirst-bFirst") {
                // Reverse A's current points, then append B (skip first)
                var aPoints = [];
                for (var k = 0; k < pathA.segments.length; k++) {
                  aPoints.push(pathA.segments[k].point.clone());
                }
                aPoints.reverse();
                aSegments.reverse();
                pathA.removeSegments();
                for (var k = 0; k < aPoints.length; k++) {
                  pathA.add(aPoints[k]);
                }
                for (var k = 1; k < bPoints.length; k++) {
                  pathA.add(bPoints[k]);
                }
                newSegmentData = aSegments.concat(bSegments);

              } else if (mergeType === "aFirst-bLast") {
                // Prepend B's points to A (skip B's last point, it's the shared vertex)
                var aPoints = [];
                for (var k = 0; k < pathA.segments.length; k++) {
                  aPoints.push(pathA.segments[k].point.clone());
                }
                pathA.removeSegments();
                for (var k = 0; k < bPoints.length - 1; k++) {
                  pathA.add(bPoints[k]);
                }
                for (var k = 0; k < aPoints.length; k++) {
                  pathA.add(aPoints[k]);
                }
                newSegmentData = bSegments.concat(aSegments);
              }

              pathA.data.segmentData = newSegmentData;

              // Remove pathB
              pathB.remove();
              items.splice(j, 1);

              // Check if the merged path should be closed (first == last)
              if (pathA.segments.length >= 3) {
                var newFirst = pathA.firstSegment.point;
                var newLast = pathA.lastSegment.point;
                if (newFirst.getDistance(newLast) < WELD_THRESHOLD) {
                  pathA.lastSegment.remove(); // Remove duplicate point
                  pathA.closed = true;
                }
              }

              syncSegmentDataLength(pathA);
              merged = true;
              break;
            }
          }

          if (merged) break;
        }

        // Refresh items list after merge
        if (merged) {
          items = scope.project.activeLayer.children.slice();
        }
      }

    }

    function findNearestVertex(point, excludePath) {
      var nearest = null;
      var nearestDist = SNAP_THRESHOLD;
      var items = scope.project.activeLayer.children;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item === excludePath) continue;
        if (item === snapIndicator) continue;
        if (item === angleGuides) continue;
        if (item.data && item.data.isOverlay) continue;
        if (!item.segments) continue;

        for (var j = 0; j < item.segments.length; j++) {
          var seg = item.segments[j];
          var dist = point.getDistance(seg.point);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = seg.point.clone();
          }
        }
      }

      return nearest;
    }

    function findNearestVertexExcluding(point, excludeSegment, excludeSegments) {
      // Find nearest vertex, excluding specific segments (for welded drag)
      var nearest = null;
      var nearestDist = SNAP_THRESHOLD;
      var items = scope.project.activeLayer.children;

      // Build set of excluded segments for fast lookup
      var excluded = new Set(excludeSegments || []);
      if (excludeSegment) excluded.add(excludeSegment);

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item === snapIndicator) continue;
        if (item === angleGuides) continue;
        if (item.data && item.data.isOverlay) continue;
        if (!item.segments) continue;

        for (var j = 0; j < item.segments.length; j++) {
          var seg = item.segments[j];
          if (excluded.has(seg)) continue;
          var dist = point.getDistance(seg.point);
          if (dist < nearestDist) {
            nearestDist = dist;
            nearest = seg.point.clone();
          }
        }
      }

      return nearest;
    }

    function findNearestSegmentHit(point) {
      if (!scope) return null;

      var items = scope.project.activeLayer.children;
      var bestSegment = null;
      var bestDistance = getVertexHitTolerance();

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.segments) continue;
        if (!item.data || !item.data.id || item.data.isOverlay) continue;

        for (var j = 0; j < item.segments.length; j++) {
          var segment = item.segments[j];
          if (!segment || !segment.point) continue;
          var distance = point.getDistance(segment.point);
          if (distance > bestDistance) continue;
          bestDistance = distance;
          bestSegment = segment;
        }
      }

      if (!bestSegment) return null;
      return {
        type: "segment",
        item: bestSegment.path,
        segment: bestSegment,
        point: bestSegment.point,
      };
    }

    function findSelectedSegmentHit(point) {
      if (!point || !selectedSegments || !selectedSegments.length) return null;

      var bestSegment = null;
      var bestDistance = Math.max(getVertexHitTolerance(), VERTEX_SELECT_RADIUS * 1.35);

      for (var i = 0; i < selectedSegments.length; i++) {
        var segment = selectedSegments[i];
        if (!segment || !segment.point || !segment.path) continue;
        var distance = point.getDistance(segment.point);
        if (distance > bestDistance) continue;
        bestDistance = distance;
        bestSegment = segment;
      }

      if (!bestSegment) return null;
      return {
        type: "segment",
        item: bestSegment.path,
        segment: bestSegment,
        point: bestSegment.point,
      };
    }

    function getCurveHitTolerance() {
      return Math.max(0.2, 14 / getPixelsPerUnit());
    }

    function findNearestCurveHit(point) {
      if (!scope) return null;

      var items = scope.project.activeLayer.children;
      var bestHit = null;
      var bestDistance = getCurveHitTolerance();

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || !item.segments || item.segments.length < 2) continue;
        if (!item.data || !item.data.id || item.data.isOverlay) continue;

        var location = typeof item.getNearestLocation === "function"
          ? item.getNearestLocation(point)
          : null;
        if (!location || !location.curve || !location.point) continue;

        var distance = location.point.getDistance(point);
        if (distance > bestDistance) continue;

        bestDistance = distance;
        bestHit = {
          item: item,
          location: location,
          distance: distance,
        };
      }

      return bestHit;
    }

    function clamp01(value) {
      return Math.max(0, Math.min(1, value));
    }

    function getLinearCurveTime(curve, point) {
      if (!curve || !curve.point1 || !curve.point2 || !point) return 0;
      var dx = curve.point2.x - curve.point1.x;
      var dy = curve.point2.y - curve.point1.y;
      var lenSq = dx * dx + dy * dy;
      if (lenSq < 0.000001) return 0;
      var px = point.x - curve.point1.x;
      var py = point.y - curve.point1.y;
      return clamp01((px * dx + py * dy) / lenSq);
    }

    function getCurvePointAtNormalizedTime(curve, t) {
      if (!curve) return null;
      var safeT = clamp01(t);
      if (curve.point1 && curve.point2) {
        return new scope.Point(
          curve.point1.x + (curve.point2.x - curve.point1.x) * safeT,
          curve.point1.y + (curve.point2.y - curve.point1.y) * safeT
        );
      }
      if (typeof curve.getPointAtTime === "function") return curve.getPointAtTime(safeT);
      if (typeof curve.getPointAt === "function") return curve.getPointAt(curve.length * safeT);
      return null;
    }

    // ── Door/Window Placement ──

    function placeDoorOnCurve(path, curveIndex, t, elementType) {
      // Place a door or window on the specified curve at parameter t (0-1)
      if (!path || !path.curves || curveIndex < 0 || curveIndex >= path.curves.length) return false;

      var curve = path.curves[curveIndex];
      var curveLength = curve.length;

      // If curve is small (< MIN_DOOR_WIDTH), convert entire curve to door/window
      if (curveLength < MIN_DOOR_WIDTH) {
        setCurveType(path, curveIndex, elementType);
        if (elementType === "door") {
          setDoorOpen(path, curveIndex, false);
        }
          saveProject();
        return true;
      }

      // For larger curves, split to create a door segment of MIN_DOOR_WIDTH
      var doorLengthRatio = MIN_DOOR_WIDTH / curveLength;
      var halfDoor = doorLengthRatio / 2;

      // Calculate t1 and t2 for door segment
      var t1 = Math.max(0, t - halfDoor);
      var t2 = Math.min(1, t + halfDoor);

      // Adjust if at edges
      if (t1 === 0) {
        t2 = Math.min(1, doorLengthRatio);
      } else if (t2 === 1) {
        t1 = Math.max(0, 1 - doorLengthRatio);
      }

      return splitCurveAndAssignType(path, curveIndex, t1, t2, elementType);
    }

    function splitCurveAndAssignType(path, curveIndex, t1, t2, type) {
      // Split a curve at t1 and t2, assigning the middle segment as type
      if (!path || !path.curves || curveIndex < 0) return false;

      var curve = path.curves[curveIndex];
      if (!curve) return false;

      // Get points at t1 and t2
      var point1 = getCurvePointAtNormalizedTime(curve, t1);
      var point2 = getCurvePointAtNormalizedTime(curve, t2);
      if (!point1 || !point2) return false;

      ensureSegmentData(path);

      var originalSegment = normalizeSegmentData(path.data.segmentData[curveIndex]);
      var originalType = originalSegment.type;

      // Insert the two points (in reverse order since indices shift)
      // After inserting at t2, curveIndex+1 becomes the segment from t2 to end
      // After inserting at t1, curveIndex becomes start to t1, curveIndex+1 is t1 to t2

      if (t2 < 1) {
        var insertIdx2 = curveIndex + 1;
        path.insert(insertIdx2, point2);
      }
      if (t1 > 0) {
        var insertIdx1 = curveIndex + 1;
        path.insert(insertIdx1, point1);
      }

      var before = path.data.segmentData
        .slice(0, curveIndex)
        .map(function (segment) { return normalizeSegmentData(segment); });
      var after = path.data.segmentData
        .slice(curveIndex + 1)
        .map(function (segment) { return normalizeSegmentData(segment); });
      var nextSegments = before.slice();

      function cloneSegment(segment, overrides) {
        return normalizeSegmentData(Object.assign({}, segment, overrides || {}));
      }

      function createTypedSegment(typeName, id) {
        return normalizeSegmentData({
          id: id || originalSegment.id,
          type: typeName,
          doorOpen: false,
          locked: false,
          name: "",
        });
      }

      // Now assign types based on what we split
      // Depends on whether t1 > 0 and t2 < 1
      if (t1 > 0 && t2 < 1) {
        nextSegments.push(cloneSegment(originalSegment, { id: createDefaultSegmentData().id, type: originalType }));
        nextSegments.push(createTypedSegment(type, originalSegment.id));
        nextSegments.push(cloneSegment(originalSegment, { id: createDefaultSegmentData().id, type: originalType }));
      } else if (t1 > 0) {
        nextSegments.push(cloneSegment(originalSegment, { id: createDefaultSegmentData().id, type: originalType }));
        nextSegments.push(createTypedSegment(type, originalSegment.id));
      } else if (t2 < 1) {
        nextSegments.push(createTypedSegment(type, originalSegment.id));
        nextSegments.push(cloneSegment(originalSegment, { id: createDefaultSegmentData().id, type: originalType }));
      } else {
        nextSegments.push(createTypedSegment(type, originalSegment.id));
      }
      path.data.segmentData = nextSegments.concat(after);
      syncSegmentDataLength(path);

      saveProject();
      return true;
    }

    function handleDoorWindowClick(point) {
      var hitResult = findNearestCurveHit(point);
      if (!hitResult || !hitResult.item || !hitResult.location) {
        return false;
      }

      var path = hitResult.item;
      var location = hitResult.location;

      if (!location || !location.curve) {
        return false;
      }

      var curveIndex = location.curve.index;
      var t = getLinearCurveTime(location.curve, location.point || point);

      return placeDoorOnCurve(path, curveIndex, t, drawMode);
    }


    function updateSnapIndicator(snapPoint) {
      if (snapIndicator) {
        snapIndicator.remove();
        snapIndicator = null;
      }

      if (snapPoint && scope) {
        snapIndicator = new scope.Path.Circle({
          center: snapPoint,
          radius: 0.15,
          strokeColor: "#4CAF50",
          strokeWidth: 0.05,
          fillColor: "rgba(76, 175, 80, 0.3)"
        });
      }
    }

    function updateAngleGuides(fromPoint, show) {
      // Remove existing guides
      if (angleGuides) {
        angleGuides.remove();
        angleGuides = null;
      }

      if (!show || !fromPoint || !scope) return;

      angleGuides = new scope.Group();

      // Draw guide lines at every 15 degrees (0, 15, 30, 45, ...)
      for (var deg = 0; deg < 360; deg += 15) {
        var rad = deg * Math.PI / 180;
        var endX = fromPoint.x + Math.cos(rad) * GUIDE_LENGTH;
        var endY = fromPoint.y + Math.sin(rad) * GUIDE_LENGTH;

        var isMainAxis = (deg % 90 === 0); // 0, 90, 180, 270
        var is45 = (deg % 45 === 0 && !isMainAxis); // 45, 135, 225, 315

        var guide = new scope.Path.Line({
          from: fromPoint,
          to: [endX, endY],
          strokeColor: isMainAxis ? "rgba(100, 200, 255, 0.25)" :
                       is45 ? "rgba(100, 200, 255, 0.15)" :
                       "rgba(100, 200, 255, 0.08)",
          strokeWidth: isMainAxis ? 0.03 : 0.02,
          dashArray: isMainAxis ? null : [0.15, 0.1]
        });
        angleGuides.addChild(guide);
      }
    }

    // ── Events ──

    var tool = null;
    var lastClickTime = 0;
    var lastClickPoint = null;

    function onContextMenu(e) {
      e.preventDefault();
    }

    function bindEvents() {
      if (!scope) return;

      tool = new scope.Tool();
      tool.onMouseDown = onMouseDown;
      tool.onMouseDrag = onMouseDrag;
      tool.onMouseUp = onMouseUp;
      tool.onMouseMove = onMouseMove;
      tool.onKeyDown = onKeyDown;

      canvas.addEventListener("wheel", onWheel, { passive: false });
      canvas.addEventListener("contextmenu", onContextMenu);
      window.addEventListener("resize", resizeCanvas);
      window.addEventListener("keydown", onWindowKeyDown, true);
      document.addEventListener("ae-map-transform", updateViewTransform);
    }

    function unbindEvents() {
      if (tool) {
        tool.remove();
        tool = null;
      }
      if (canvas) {
        canvas.removeEventListener("wheel", onWheel);
        canvas.removeEventListener("contextmenu", onContextMenu);
      }
      window.removeEventListener("resize", resizeCanvas);
      window.removeEventListener("keydown", onWindowKeyDown, true);
      document.removeEventListener("ae-map-transform", updateViewTransform);
    }

    function onWheel(e) {
      e.preventDefault();
      var mapCanvas = container.querySelector("#ae-map-canvas");
      if (mapCanvas) {
        mapCanvas.dispatchEvent(new WheelEvent("wheel", {
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          deltaMode: e.deltaMode,
          clientX: e.clientX,
          clientY: e.clientY,
          bubbles: true
        }));
      }
    }

    function startPanning(nativeEvent) {
      if (!onStartPan) return;

      // Disable Paper.js canvas so map receives mouse events
      if (canvas) canvas.style.pointerEvents = "none";

      // Tell map to start panning
      onStartPan(nativeEvent.clientX, nativeEvent.clientY);

      // Re-enable on mouseup
      window.addEventListener("mouseup", function reEnable() {
        if (canvas) canvas.style.pointerEvents = "auto";
      }, { once: true });
    }

    function passEventThroughToMap(nativeEvent) {
      if (!canvas || !container) return false;
      var mapCanvas = container.querySelector("#ae-map-canvas");
      if (!mapCanvas) return false;

      canvas.style.pointerEvents = "none";
      mapCanvas.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        clientX: nativeEvent.clientX,
        clientY: nativeEvent.clientY,
        button: nativeEvent.button,
        buttons: nativeEvent.buttons,
        ctrlKey: nativeEvent.ctrlKey,
        shiftKey: nativeEvent.shiftKey,
        altKey: nativeEvent.altKey,
        metaKey: nativeEvent.metaKey,
      }));
      window.addEventListener("mouseup", function reEnable() {
        if (canvas) canvas.style.pointerEvents = inputEnabled ? "auto" : "none";
      }, { once: true });
      return true;
    }

    function onWindowKeyDown(e) {
      if (!isActive || !editorGridState.enabled || !inputEnabled) return;
      var target = e.target;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }

      var step = e.shiftKey ? 0.5 : GRID_NUDGE_STEP;
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        nudgeGrid(-step, 0);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        nudgeGrid(step, 0);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        nudgeGrid(0, -step);
      } else if (e.key === "ArrowDown") {
        e.preventDefault();
        nudgeGrid(0, step);
      }
    }

    // ── Mouse Handlers ──

    var selectedItem = null;
    var selectedItems = [];
    var selectedSegment = null;
    var selectedSegments = [];
    var hoveredPath = null;
    var dragging = false;
    var dragHasExceededThreshold = false;
    var pointerDownPoint = null;
    var pendingEmptyInteraction = false;
    var emptyInteractionDidPan = false;

    function syncSelectionStyles() {
      if (!scope || !scope.project || !scope.project.activeLayer) return;
      var highlightedPaths = new Set();
      for (var si = 0; si < selectedItems.length; si++) {
        if (selectedItems[si]) highlightedPaths.add(selectedItems[si]);
      }
      for (var ss = 0; ss < selectedSegments.length; ss++) {
        if (selectedSegments[ss]?.path) highlightedPaths.add(selectedSegments[ss].path);
      }
      if (hoveredPath) highlightedPaths.add(hoveredPath);

      var items = scope.project.activeLayer.children;
      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (!item || (item.data && item.data.isOverlay)) continue;
        item.selected = highlightedPaths.has(item);
      }
      refreshSelectionVisuals();
    }

    function clearSelection() {
      selectedItem = null;
      selectedItems = [];
      selectedSegment = null;
      selectedSegments = [];
      hoveredPath = null;
      clearInteractiveMarkerSelection();
      syncSelectionStyles();
    }

    function setSelectedItem(item) {
      selectedItem = item || null;
      selectedItems = item ? [item] : [];
      selectedSegment = null;
      selectedSegments = [];
      clearInteractiveMarkerSelection();
      syncSelectionStyles();
    }

    function setSelectedSegments(segments, activeSegment) {
      selectedSegments = [];
      var seen = new Set();
      for (var i = 0; i < (segments || []).length; i++) {
        var segment = segments[i];
        if (!segment || !segment.path) continue;
        if (seen.has(segment)) continue;
        seen.add(segment);
        selectedSegments.push(segment);
      }
      selectedSegment =
        (activeSegment && selectedSegments.indexOf(activeSegment) >= 0 ? activeSegment : null) ||
        selectedSegments[0] ||
        null;
      selectedItem = null;
      selectedItems = [];
      clearInteractiveMarkerSelection();
      syncSelectionStyles();
    }

    function toggleSelectedSegment(segment) {
      if (!segment || !segment.path) return;
      var nextSegments = selectedSegments.slice();
      var idx = nextSegments.indexOf(segment);
      var nextActiveSegment = segment;
      if (idx >= 0) {
        nextSegments.splice(idx, 1);
        if (selectedSegment === segment) {
          nextActiveSegment = nextSegments[nextSegments.length - 1] || nextSegments[0] || null;
        }
      } else {
        nextSegments.push(segment);
      }
      setSelectedSegments(nextSegments, nextActiveSegment);
    }

    function onMouseDown(event) {
      var button = event.event.button;
      pointerDownPoint = event.point.clone();
      dragHasExceededThreshold = false;
      pendingEmptyInteraction = false;
      emptyInteractionDidPan = false;
      var markerHit = typeof getInteractiveMarkerAt === "function"
        ? getInteractiveMarkerAt(event.point.x, event.point.y)
        : null;

      // Middle click or Cmd+click: pan
      if (button === 1 || event.event.metaKey) {
        startPanning(event.event);
        return;
      }

      // Right-click: context menu or pan
      if (button === 2) {
        var hitResult = findNearestSegmentHit(event.point) || scope.project.hitTest(event.point, {
          segments: true,
          stroke: true,
          tolerance: 8 / (scope.view.zoom || 1),
          match: function(hit) {
            return !(hit.item && hit.item.data && hit.item.data.isOverlay);
          }
        });

        if (markerHit && (!hitResult || hitResult.type !== "segment")) {
          event.event.preventDefault();
          event.event.stopPropagation();
          passEventThroughToMap(event.event);
          return;
        }

        if (hitResult && onWallContext) {
          event.event.preventDefault();
          event.event.stopPropagation();

          if (hitResult.type === "segment") {
            onWallContext({
              type: "vertex",
              segment: hitResult.segment,
              path: hitResult.item,
              point: hitResult.segment.point,
              clientX: event.event.clientX,
              clientY: event.event.clientY
            });
          } else if (hitResult.type === "stroke") {
            var curveIndex = hitResult.location ? hitResult.location.curve.index : -1;
            var wallData = curveIndex >= 0 ? normalizeSegmentData(getSegmentData(hitResult.item, curveIndex)) : null;
            var curveType = wallData ? wallData.type : "wall";
            var isOpen = wallData ? !!wallData.doorOpen : false;

            onWallContext({
              type: "wall",
              wall: wallData,
              path: hitResult.item,
              location: hitResult.location,
              curveIndex: curveIndex,
              curveType: curveType,
              isDoorOpen: isOpen,
              clientX: event.event.clientX,
              clientY: event.event.clientY
            });
          }
          return;
        }

        // No hit: pan
        startPanning(event.event);
        return;
      }

      // Left click - Drawing mode
      if (drawMode) {
        // Clear any previous selection when starting to draw
        clearSelection();

        // Door/Window mode: click on existing wall to place
        if (drawMode === "door" || drawMode === "window") {
          if (handleDoorWindowClick(event.point)) {
            return;
          }
          // Empty space in these modes should pan the map, same as other layers.
          startPanning(event.event);
          return;
        }

        // Rectangle and Circle modes: start drag
        if (shapeMode === "rectangle" || shapeMode === "circle") {
          var startPoint = resolveSnapPoint(event.point, { excludePath: null }) || event.point;
          shapeStartPoint = startPoint.clone();

          // Create preview shape
          if (shapeMode === "rectangle") {
            currentPath = new scope.Path(Object.assign(createPathStyle(drawMode), {
              closed: true,
              data: { id: generateId(), defaultSegmentType: drawMode, segmentData: [] }
            }));
            // Add 4 corners (will be updated on drag)
            currentPath.add(startPoint);
            currentPath.add(startPoint);
            currentPath.add(startPoint);
            currentPath.add(startPoint);
          } else {
            // Circle: create polygon approximation
            currentPath = new scope.Path(Object.assign(createPathStyle(drawMode), {
              closed: true,
              data: { id: generateId(), defaultSegmentType: drawMode, segmentData: [] }
            }));
            // Add segments for circle (will be updated on drag)
            for (var i = 0; i < CIRCLE_SEGMENTS; i++) {
              currentPath.add(startPoint);
            }
          }
          dragging = true;
          return;
        }

        // Polygon mode: click to add points
        var now = Date.now();
        var isDoubleClick = (now - lastClickTime < 400) &&
                            lastClickPoint &&
                            event.point.getDistance(lastClickPoint) < 10 / (scope.view.zoom || 1);
        lastClickTime = now;
        lastClickPoint = event.point.clone();

        if (isDoubleClick && currentPath) {
          finishCurrentPath();
          return;
        }

        var targetPoint = event.point;

        // Shift key: constrain angle from last fixed point
        if (event.modifiers.shift && currentPath && currentPath.segments.length >= 2) {
          var lastFixed = currentPath.segments[currentPath.segments.length - 2].point;
          targetPoint = constrainAngle(lastFixed, event.point);
        }

        var clickPoint = resolveSnapPoint(targetPoint, { excludePath: currentPath }) || targetPoint;

        if (!currentPath) {
          currentPath = new scope.Path(Object.assign(createPathStyle(drawMode), {
            data: { id: generateId(), defaultSegmentType: drawMode, segmentData: [] }
          }));
          currentPath.add(clickPoint);
          currentPath.add(clickPoint); // Preview point
        } else {
          currentPath.add(clickPoint);
        }
        return;
      }

      // Left click - Selection mode
      var vertexHit = findSelectedSegmentHit(event.point) || findNearestSegmentHit(event.point);
      var hitResult = vertexHit || scope.project.hitTest(event.point, {
        segments: true,
        stroke: true,
        fill: true,
        tolerance: 5 / (scope.view.zoom || 1),
        match: function(hit) {
          return !(hit.item && hit.item.data && hit.item.data.isOverlay);
        }
      });

      if (markerHit && (!hitResult || hitResult.type !== "segment")) {
        clearSelection();
        event.event.preventDefault();
        event.event.stopPropagation();
        passEventThroughToMap(event.event);
        dragging = false;
        return;
      }

      if (hitResult && hitResult.item) {
        var clickedPath = hitResult.item;
        var isShiftSelection = !!(event.modifiers && event.modifiers.shift);

        if (hitResult.type === "segment") {
          if (isShiftSelection) {
            toggleSelectedSegment(hitResult.segment);
          } else {
            if (selectedSegments.indexOf(hitResult.segment) >= 0) {
              selectedSegment = hitResult.segment;
              selectedItem = null;
              selectedItems = [];
              syncSelectionStyles();
            } else {
              setSelectedSegments([hitResult.segment], hitResult.segment);
            }
          }
        } else {
          if (!isShiftSelection) {
            setSelectedItem(clickedPath);
          }
        }

        dragging = true;
      } else {
        if (markerHit) {
          clearSelection();
          event.event.preventDefault();
          event.event.stopPropagation();
          passEventThroughToMap(event.event);
          dragging = false;
          return;
        }

        // Clicked on empty space. Defer deselect/pan until we know whether this
        // becomes a click or an actual drag, so we don't drop selection on a tiny miss.
        if (event.modifiers && event.modifiers.shift) {
          dragging = false;
          return;
        }
        dragging = true;
        pendingEmptyInteraction = true;
      }
    }

    var dragStartPoint = null;
    var dragStartPosition = null;
    var dragStartReferencePoint = null;
    var draggedSegments = [];
    var draggedSegmentOrigins = [];

    function onMouseDrag(event) {
      if (!dragging) return;
      var shiftPressed = event.modifiers && event.modifiers.shift;

      // Handle rectangle/circle shape drawing
      if (drawMode && currentPath && shapeStartPoint) {
        var endPoint = event.point;

        // Shift key: constrain to square/circle from center
        if (shiftPressed && shapeMode === "rectangle") {
          // Make it a square
          var dx = endPoint.x - shapeStartPoint.x;
          var dy = endPoint.y - shapeStartPoint.y;
          var size = Math.max(Math.abs(dx), Math.abs(dy));
          endPoint = new scope.Point(
            shapeStartPoint.x + (dx >= 0 ? size : -size),
            shapeStartPoint.y + (dy >= 0 ? size : -size)
          );
        }

        // Snap end point
        var snapPoint = resolveSnapPoint(endPoint, { excludePath: currentPath });
        updateSnapIndicator(snapPoint);
        endPoint = snapPoint || endPoint;

        if (shapeMode === "rectangle") {
          // Update rectangle corners
          currentPath.segments[0].point = shapeStartPoint;
          currentPath.segments[1].point = new scope.Point(endPoint.x, shapeStartPoint.y);
          currentPath.segments[2].point = endPoint;
          currentPath.segments[3].point = new scope.Point(shapeStartPoint.x, endPoint.y);
        } else if (shapeMode === "circle") {
          // Update circle segments
          var radius = shapeStartPoint.getDistance(endPoint);
          for (var i = 0; i < CIRCLE_SEGMENTS; i++) {
            var angle = (i / CIRCLE_SEGMENTS) * Math.PI * 2;
            currentPath.segments[i].point = new scope.Point(
              shapeStartPoint.x + Math.cos(angle) * radius,
              shapeStartPoint.y + Math.sin(angle) * radius
            );
          }
        }
        return;
      }

      var dragDistance = pointerDownPoint ? event.point.getDistance(pointerDownPoint) : 0;

      if (pendingEmptyInteraction) {
        var emptyPanThreshold = Math.max(0.012, 2 / getPixelsPerUnit());
        if (dragDistance >= emptyPanThreshold) {
          pendingEmptyInteraction = false;
          emptyInteractionDidPan = true;
          dragging = false;
          startPanning(event.event);
          return;
        }
      }

      if (!dragHasExceededThreshold) {
        if (dragDistance < getDragThresholdUnits()) {
          return;
        }
        dragHasExceededThreshold = true;
      }

      if (selectedSegment) {
        // On first actual drag, capture the full set of segments to move.
        if (draggedSegments.length === 0) {
          var baseSegments = selectedSegments.length ? selectedSegments.slice() : [selectedSegment];
          if (selectedSegment) {
            baseSegments = [selectedSegment].concat(baseSegments.filter(function (segment) {
              return segment !== selectedSegment;
            }));
          }
          var allSegments = [];
          var seenSegments = new Set();

          function addMovableSegment(segment) {
            if (!segment || seenSegments.has(segment)) return;
            seenSegments.add(segment);
            allSegments.push(segment);
          }

          for (var bs = 0; bs < baseSegments.length; bs++) {
            addMovableSegment(baseSegments[bs]);
          }

          draggedSegments = allSegments;
          draggedSegmentOrigins = allSegments.map(function (segment) {
            return segment.point.clone();
          });
        }

        var targetPoint = event.point;

        // Find reference point for angle constraint (adjacent vertex)
        if (shiftPressed) {
          var seg = selectedSegment;
          var refPoint = null;

          // Use previous segment's point if available, otherwise next
          if (seg.previous) {
            refPoint = seg.previous.point;
          } else if (seg.next) {
            refPoint = seg.next.point;
          }

          if (refPoint) {
            updateAngleGuides(refPoint, true);
            targetPoint = constrainAngle(refPoint, event.point);
          }
        } else {
          updateAngleGuides(null, false);
        }

        // Snap while dragging (exclude all segments being moved)
        var snapPoint = resolveSnapPoint(targetPoint, {
          excludeSegment: selectedSegment,
          excludeSegments: draggedSegments,
        });
        updateSnapIndicator(snapPoint);
        var finalPoint = snapPoint || targetPoint;

        var anchorIndex = draggedSegments.indexOf(selectedSegment);
        var anchorOrigin = draggedSegmentOrigins[anchorIndex >= 0 ? anchorIndex : 0] || selectedSegment.point.clone();
        var delta = finalPoint.subtract(anchorOrigin);

        for (var i = 0; i < draggedSegments.length; i++) {
          draggedSegments[i].point = draggedSegmentOrigins[i].add(delta);
        }
        refreshSegmentVisuals();
        refreshSelectionVisuals();

      } else if (selectedItem) {
        // Track start position on first drag
        if (!dragStartPoint) {
          dragStartPoint = event.point.subtract(event.delta);
          dragStartPosition = selectedItem.position.clone();
          dragStartReferencePoint = selectedItem.firstSegment?.point?.clone() || null;
        }

        var offset;
        if (shiftPressed) {
          // Constrain movement direction from start
          updateAngleGuides(dragStartPoint, true);
          var constrainedTarget = constrainAngle(dragStartPoint, event.point);
          offset = constrainedTarget.subtract(dragStartPoint);
        } else {
          updateAngleGuides(null, false);
          offset = event.point.subtract(dragStartPoint);
        }

        if (dragStartReferencePoint) {
          var snappedReference = resolveSnapPoint(dragStartReferencePoint.add(offset), {
            excludePath: selectedItem,
          });
          if (snappedReference) {
            offset = snappedReference.subtract(dragStartReferencePoint);
          }
        }

        selectedItem.position = dragStartPosition.add(offset);
        refreshSegmentVisuals();
        refreshSelectionVisuals();
      }
    }

    function onMouseUp(event) {
      if (emptyInteractionDidPan) {
        emptyInteractionDidPan = false;
        pendingEmptyInteraction = false;
        dragging = false;
        dragHasExceededThreshold = false;
        pointerDownPoint = null;
        dragStartPoint = null;
        dragStartPosition = null;
        dragStartReferencePoint = null;
        draggedSegments = [];
        draggedSegmentOrigins = [];
        updateSnapIndicator(null);
        updateAngleGuides(null, false);
        return;
      }

      if (dragging) {
        if (pendingEmptyInteraction) {
          pendingEmptyInteraction = false;
          dragging = false;
          dragHasExceededThreshold = false;
          pointerDownPoint = null;
          dragStartPoint = null;
          dragStartPosition = null;
          dragStartReferencePoint = null;
          draggedSegments = [];
          draggedSegmentOrigins = [];
          clearSelection();
          updateSnapIndicator(null);
          updateAngleGuides(null, false);
          return;
        }

        var didMoveSelection = !!dragHasExceededThreshold;
        // Track if we were dragging a vertex (for merge check)
        var wasDraggingVertex = didMoveSelection && selectedSegment !== null;

        // Finalize rectangle/circle shape
        if (drawMode && currentPath && shapeStartPoint) {
          // Check if shape is too small (user just clicked without dragging)
          var minSize = 0.1;
          var isValid = false;

          if (shapeMode === "rectangle") {
            var dx = Math.abs(currentPath.segments[2].point.x - currentPath.segments[0].point.x);
            var dy = Math.abs(currentPath.segments[2].point.y - currentPath.segments[0].point.y);
            isValid = dx > minSize && dy > minSize;
          } else if (shapeMode === "circle") {
            var radius = currentPath.segments[0].point.getDistance(shapeStartPoint);
            isValid = radius > minSize;
          }

          if (!isValid) {
            currentPath.remove();
          }

          currentPath = null;
          shapeStartPoint = null;
          updateSnapIndicator(null);
          saveProject();
        }

        dragging = false;
        dragHasExceededThreshold = false;
        pointerDownPoint = null;
        pendingEmptyInteraction = false;
        dragStartPoint = null;
        dragStartPosition = null;
        dragStartReferencePoint = null;
        draggedSegments = [];
        draggedSegmentOrigins = [];
        updateSnapIndicator(null);
        updateAngleGuides(null, false);

        // After dragging a vertex, check if paths should be merged
        if (wasDraggingVertex) {
          tryMergePaths();
        }

        if (didMoveSelection || drawMode) {
          saveProject(); // Auto-save on edit
        } else {
          refreshSelectionVisuals();
        }
      }
    }

    function constrainAngle(fromPoint, toPoint) {
      // Constrain to nearest 15-degree increment
      var dx = toPoint.x - fromPoint.x;
      var dy = toPoint.y - fromPoint.y;
      var distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 0.001) return toPoint;

      var angle = Math.atan2(dy, dx);
      var snapAngle = Math.round(angle / (Math.PI / 12)) * (Math.PI / 12); // 15 degrees = PI/12

      return new scope.Point(
        fromPoint.x + Math.cos(snapAngle) * distance,
        fromPoint.y + Math.sin(snapAngle) * distance
      );
    }

    var hoverIndicator = null;

    function updateHoverIndicator(hitResult, color) {
      if (hoverIndicator) {
        hoverIndicator.remove();
        hoverIndicator = null;
      }

      if (!hitResult || !hitResult.location || !scope || !color) return;

      var curve = hitResult.location.curve;
      if (!curve) return;

      var p1 = curve.point1;
      var p2 = curve.point2;
      var curveLength = curve.length;

      // Calculate the segment that would become a door
      var t = getLinearCurveTime(curve, hitResult.location.point || hitResult.location._point || hitResult.location);
      var doorT1, doorT2;

      if (curveLength < MIN_DOOR_WIDTH) {
        // Whole curve becomes door
        doorT1 = 0;
        doorT2 = 1;
      } else {
        var doorLengthRatio = MIN_DOOR_WIDTH / curveLength;
        var halfDoor = doorLengthRatio / 2;
        doorT1 = Math.max(0, t - halfDoor);
        doorT2 = Math.min(1, t + halfDoor);
        if (doorT1 === 0) doorT2 = Math.min(1, doorLengthRatio);
        if (doorT2 === 1) doorT1 = Math.max(0, 1 - doorLengthRatio);
      }

      // Get points for the preview segment
      var previewP1 = getCurvePointAtNormalizedTime(curve, doorT1);
      var previewP2 = getCurvePointAtNormalizedTime(curve, doorT2);
      if (!previewP1 || !previewP2) return;

      hoverIndicator = new scope.Path.Line({
        from: previewP1,
        to: previewP2,
        strokeColor: color,
        strokeWidth: 0.08,
        strokeCap: "butt",
        strokeJoin: "round"
      });
    }

    function onMouseMove(event) {
      var shiftPressed = event.modifiers && event.modifiers.shift;

      // Door/window mode: show hover indicator on walls
      if (drawMode === "door" || drawMode === "window") {
        updateAngleGuides(null, false);
        updateSnapIndicator(null);

        var hitResult = findNearestCurveHit(event.point);

        if (hitResult && hitResult.item) {
          hoveredPath = hitResult.item;
          syncSelectionStyles();
          var color = drawMode === "door" ? DOOR_COLOR : WINDOW_COLOR;
          updateHoverIndicator(hitResult, color);
        } else {
          if (hoveredPath) {
            hoveredPath = null;
            syncSelectionStyles();
          }
          updateHoverIndicator(null, null);
        }
        container.style.cursor = "crosshair";
        return;
      }

      if (hoveredPath) {
        hoveredPath = null;
        syncSelectionStyles();
      }
      updateHoverIndicator(null, null);

      // Rectangle/circle: preview is handled in onMouseDrag, just show snap indicator here
      if (drawMode && (shapeMode === "rectangle" || shapeMode === "circle")) {
        if (!currentPath) {
          // Not yet drawing, show snap indicator for potential start point
          var snapPoint = resolveSnapPoint(event.point, { excludePath: null });
          updateSnapIndicator(snapPoint);
        }
        updateAngleGuides(null, false);
        return;
      }

      // Polygon mode: update preview segment
      if (drawMode && currentPath && currentPath.segments.length >= 2 && shapeMode === "polygon") {
        var lastFixed = currentPath.segments[currentPath.segments.length - 2].point;
        var targetPoint = event.point;

        // Show/hide angle guides based on shift
        updateAngleGuides(lastFixed, shiftPressed);

        // Shift key: constrain to 15-degree angles
        if (shiftPressed) {
          targetPoint = constrainAngle(lastFixed, event.point);
        }

        // Check for snap (snap takes priority over angle constraint)
        var snapPoint = resolveSnapPoint(targetPoint, { excludePath: currentPath });
        updateSnapIndicator(snapPoint);
        currentPath.lastSegment.point = snapPoint || targetPoint;
      } else if (drawMode) {
        updateAngleGuides(null, false);
        var snapPoint = resolveSnapPoint(event.point, { excludePath: null });
        updateSnapIndicator(snapPoint);
      } else {
        updateAngleGuides(null, false);
        updateSnapIndicator(null);
      }
    }

    function onKeyDown(event) {
      if (event.key === "escape") {
        if (currentPath) {
          currentPath.remove();
          currentPath = null;
          shapeStartPoint = null;
          dragging = false;
          updateSnapIndicator(null);
          updateAngleGuides(null, false);
        }
        return;
      }

      if (event.key === "enter") {
        // Enter only finishes polygon mode
        if (currentPath && shapeMode === "polygon") {
          finishCurrentPath();
        }
        return;
      }

      if (event.key === "delete" || event.key === "backspace") {
        if (selectedSegments.length) {
          var segmentsToDelete = selectedSegments.slice();
          clearSelection();
          for (var i = 0; i < segmentsToDelete.length; i++) {
            if (segmentsToDelete[i] && segmentsToDelete[i].path) {
              deleteSegment(segmentsToDelete[i]);
            }
          }
        } else if (selectedItem) {
          selectedItem.remove();
          clearSelection();
          saveProject();
        }
      }
    }

    function finishCurrentPath() {
      if (!currentPath) return;

      // Remove preview segment
      if (currentPath.segments.length > 1) {
        currentPath.lastSegment.remove();
      }

      // Check if should close (first and last vertex close together)
      if (currentPath.segments.length >= 3) {
        var first = currentPath.firstSegment.point;
        var last = currentPath.lastSegment.point;
        if (first.getDistance(last) < SNAP_THRESHOLD) {
          currentPath.closePath();
        }
      }

      // Need at least 2 points
      if (currentPath.segments.length < 2) {
        currentPath.remove();
      }

      currentPath = null;
      updateSnapIndicator(null);
      updateAngleGuides(null, false);

      // Check if the new path should merge with existing paths
      tryMergePaths();

      saveProject();
    }

    function generateId() {
      return "w-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 4);
    }

    // ── Vertex/Path manipulation ──

    function deleteSegment(segment) {
      if (!segment) return;
      var path = segment.path;
      var segIndex = segment.index;

      ensureSegmentData(path);
      var removeIndex = segIndex < path.data.segmentData.length ? segIndex : segIndex - 1;
      if (removeIndex >= 0 && removeIndex < path.data.segmentData.length) {
        path.data.segmentData.splice(removeIndex, 1);
      }

      segment.remove();

      // If path has less than 2 segments, remove it entirely
      if (path.segments.length < 2) {
        path.remove();
      } else {
        syncSegmentDataLength(path);
      }
      saveProject();
    }

    function deletePath(path) {
      if (!path) return;
      path.remove();
      saveProject();
    }

    function addVertexAtLocation(location) {
      if (!location || !location.path) return;
      // Insert a new segment at the curve location
      var path = location.path;
      var curve = location.curve;
      if (curve) {
        var curveIndex = curve.index;

        ensureSegmentData(path);
        var currentSegment = normalizeSegmentData(path.data.segmentData[curveIndex]);

        // Insert the new vertex
        path.insert(curveIndex + 1, location.point);
        path.data.segmentData.splice(
          curveIndex + 1,
          0,
          normalizeSegmentData(Object.assign({}, currentSegment, {
            id: createDefaultSegmentData().id,
          })),
        );
        syncSegmentDataLength(path);
        saveProject();
      }
    }

    function deleteWallSegment(location) {
      // Delete just the wall segment (curve between two vertices), not the whole path
      if (!location || !location.curve || !location.path) return;

      var path = location.path;
      var curveIndex = location.curve.index;

      ensureSegmentData(path);
      var oldSegmentData = path.data.segmentData
        ? path.data.segmentData.map(function (segment) { return normalizeSegmentData(segment); })
        : [];

      if (path.closed) {
        // For closed paths: open the path by "breaking" it at this curve
        // Reorder segments so the break point becomes the start/end
        var breakIndex = (curveIndex + 1) % path.segments.length;

        // Collect points in new order (starting from breakIndex)
        var points = [];
        for (var i = 0; i < path.segments.length; i++) {
          var idx = (breakIndex + i) % path.segments.length;
          points.push(path.segments[idx].point.clone());
        }

        // Reorder segment metadata (removing the deleted curve)
        var newSegmentData = [];
        for (var i = 0; i < oldSegmentData.length; i++) {
          if (i === curveIndex) continue; // Skip deleted curve
          var oldIdx = (breakIndex + i) % oldSegmentData.length;
          newSegmentData.push(normalizeSegmentData(oldSegmentData[oldIdx]));
        }

        // Rebuild the path as open
        path.removeSegments();
        for (var i = 0; i < points.length; i++) {
          path.add(points[i]);
        }
        path.closed = false;
        path.data.segmentData = newSegmentData;
        syncSegmentDataLength(path);

      } else {
        if (curveIndex === oldSegmentData.length - 1) {
          // Clicked on the last segment - remove trailing point and segment.
          path.data.segmentData.pop();
          path.lastSegment.remove();
          if (path.segments.length < 2) {
            path.remove();
          }
          saveProject();
          return;
        }

        if (curveIndex === 0) {
          path.data.segmentData.shift();
          path.firstSegment.remove();
          if (path.segments.length < 2) {
            path.remove();
          }
          syncSegmentDataLength(path);
          saveProject();
          return;
        }

        // For open paths: split into two separate paths at this curve
        var seg1End = curveIndex;
        var seg2Start = curveIndex + 1;
        var secondPathPoints = [];
        for (var i = seg2Start; i < path.segments.length; i++) {
          secondPathPoints.push(path.segments[i].point.clone());
        }
        var secondPathSegments = oldSegmentData
          .slice(seg2Start)
          .map(function (segment) { return normalizeSegmentData(segment); });
        path.data.segmentData = oldSegmentData
          .slice(0, curveIndex)
          .map(function (segment) { return normalizeSegmentData(segment); });

        // Remove segments from original path (keep only up to seg1End)
        while (path.segments.length > seg1End + 1) {
          path.lastSegment.remove();
        }
        syncSegmentDataLength(path);

        // Create second path if it has at least 2 points
        if (secondPathPoints.length >= 2) {
          createPaperPath({
            id: global.AEWallPaths?.generatePathId?.() || generateId(),
            closed: false,
            points: secondPathPoints.map(function (point) {
              return { x: point.x, y: point.y };
            }),
            segments: secondPathSegments,
          });
        }

        // Remove original path if too short
        if (path.segments.length < 2) {
          path.remove();
        }
      }

      saveProject();
    }

    // ── Public API ──

    function setDrawMode(mode) {
      drawMode = mode;
      hoveredPath = null;
      if (!mode) {
        if (currentPath) {
          currentPath.remove();
          currentPath = null;
        }
        shapeStartPoint = null;
        updateSnapIndicator(null);
        updateHoverIndicator(null, null);
      }
      clearSelection();
      syncSelectionStyles();
      container.style.cursor = mode ? "crosshair" : "";
    }

    function setInputEnabled(enabled) {
      inputEnabled = enabled !== false;
      if (canvas) {
        canvas.style.pointerEvents = inputEnabled ? "auto" : "none";
      }
      if (!inputEnabled) {
        updateSnapIndicator(null);
        updateHoverIndicator(null, null);
        updateAngleGuides(null, false);
      }
    }

    function setShapeMode(mode) {
      shapeMode = mode || "polygon";
      // Cancel any current shape in progress
      if (currentPath) {
        currentPath.remove();
        currentPath = null;
      }
      shapeStartPoint = null;
      updateSnapIndicator(null);
    }

    function clearAll() {
      if (!scope) return;
      scope.project.activeLayer.removeChildren();
      clearSelection();
      refreshGridVisuals();
      scope.view.draw();
      saveProject();
    }

    return {
      activate: activate,
      deactivate: deactivate,
      isActive: function() { return isActive; },
      setDrawMode: setDrawMode,
      getDrawMode: function() { return drawMode; },
      setShapeMode: setShapeMode,
      getShapeMode: function() { return shapeMode; },
      getGridState: getEditorGridState,
      setGridState: setGridState,
      setGridEnabled: setGridEnabled,
      clearAll: clearAll,
      save: saveProject,
      reload: function() {
        if (isActive && scope) {
          loadProject();
        }
      },
      refresh: function() {
        if (isActive && scope) {
          scope.view.draw();
        }
      },
      // Manipulation methods for context menu
      deleteSegment: deleteSegment,
      deletePath: deletePath,
      deleteWallSegment: deleteWallSegment,
      addVertexAtLocation: addVertexAtLocation,
      // Door/window methods
      toggleDoorState: toggleDoorState,
      getCurveType: getCurveType,
      getSegmentData: function(path, curveIndex) {
        return normalizeSegmentData(getSegmentData(path, curveIndex));
      },
      setCurveType: function(path, curveIndex, type) {
        setCurveType(path, curveIndex, type);
        saveProject();
      },
      isDoorOpen: isDoorOpen,
      setInputEnabled: setInputEnabled
    };
  }

  global.PaperWallEditor = { createEditor: createPaperWallEditor };
})(window);
