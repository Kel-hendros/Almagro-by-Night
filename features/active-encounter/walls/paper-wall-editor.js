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

  function createPaperWallEditor(opts) {
    var container = opts.container;
    var getPaperJSON = opts.getPaperJSON;   // Load Paper.js project JSON
    var setPaperJSON = opts.setPaperJSON;   // Save Paper.js project JSON
    var setWalls = opts.setWalls;           // Derive walls for game engine
    var onChanged = opts.onChanged || function () {};
    var getTransform = opts.getTransform;
    var onStartPan = opts.onStartPan;       // Callback to start map panning
    var onWallContext = opts.onWallContext; // Callback for right-click context menu

    var canvas = null;
    var scope = null;
    var isActive = false;
    var drawMode = null; // null | "wall" | "door" | "window"
    var shapeMode = "polygon"; // "polygon" | "rectangle" | "circle"
    var currentPath = null;
    var snapIndicator = null;
    var angleGuides = null; // Group for angle guide lines
    var shapeStartPoint = null; // For rectangle/circle: the starting point
    var SNAP_THRESHOLD = 0.3; // Grid units
    var GUIDE_LENGTH = 15; // Length of guide lines in grid units
    var CIRCLE_SEGMENTS = 24; // Number of segments for circle approximation

    // ── Curve Types Helpers ──
    // Each curve (segment between vertices) can be: "wall", "door", or "window"
    // path.data.curveTypes = ["wall", "door", "wall", ...]
    // path.data.doorStates = { curveIndex: isOpen, ... }

    function ensureCurveTypes(path) {
      if (!path || !path.data) return;
      if (!path.data.curveTypes) {
        path.data.curveTypes = [];
      }
      syncCurveTypesLength(path);
    }

    function syncCurveTypesLength(path) {
      if (!path || !path.data || !path.data.curveTypes) return;
      var numCurves = path.closed ? path.segments.length : path.segments.length - 1;
      if (numCurves < 0) numCurves = 0;

      // Extend with "wall" if too short
      while (path.data.curveTypes.length < numCurves) {
        path.data.curveTypes.push("wall");
      }
      // Trim if too long
      if (path.data.curveTypes.length > numCurves) {
        path.data.curveTypes.length = numCurves;
      }
    }

    function getCurveType(path, curveIndex) {
      ensureCurveTypes(path);
      return (path.data.curveTypes && path.data.curveTypes[curveIndex]) || "wall";
    }

    function setCurveType(path, curveIndex, type) {
      ensureCurveTypes(path);
      if (curveIndex >= 0 && curveIndex < path.data.curveTypes.length) {
        path.data.curveTypes[curveIndex] = type;
      }
    }

    function isDoorOpen(path, curveIndex) {
      if (!path || !path.data || !path.data.doorStates) return false;
      return !!path.data.doorStates[curveIndex];
    }

    function setDoorOpen(path, curveIndex, isOpen) {
      if (!path || !path.data) return;
      if (!path.data.doorStates) path.data.doorStates = {};
      if (isOpen) {
        path.data.doorStates[curveIndex] = true;
      } else {
        delete path.data.doorStates[curveIndex];
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

      canvas = document.createElement("canvas");
      canvas.id = "paper-wall-canvas";
      container.appendChild(canvas);

      scope = new paper.PaperScope();
      scope.setup(canvas);

      resizeCanvas();
      loadProject();
      bindEvents();
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
      shapeStartPoint = null;
      drawMode = null;
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
      scope.view.draw();
    }

    // ── Load / Save Project ──

    function loadProject() {
      if (!scope) return;
      scope.project.activeLayer.removeChildren();

      var json = getPaperJSON ? getPaperJSON() : null;
      if (json) {
        try {
          scope.project.importJSON(json);
        } catch (e) {
          console.warn("Failed to load Paper.js project:", e);
        }
      }

      scope.view.draw();
    }

    function saveProject() {
      if (!scope) return;

      // Save Paper.js JSON
      if (setPaperJSON) {
        var json = scope.project.exportJSON();
        setPaperJSON(json);
      }

      // Derive walls for game engine
      deriveWalls();
    }

    function deriveWalls() {
      if (!scope || !setWalls) return;

      var walls = [];
      var items = scope.project.activeLayer.children;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        // Skip non-path items (like snap indicator)
        if (!item.segments || item.segments.length < 2) continue;
        // Skip items without wall data
        if (!item.data || !item.data.id) continue;
        // Skip overlay items
        if (item.data.isOverlay) continue;

        // Ensure curve types array is synced
        ensureCurveTypes(item);

        // Export each segment as a wall
        for (var j = 0; j < item.segments.length - 1; j++) {
          var p1 = item.segments[j].point;
          var p2 = item.segments[j + 1].point;
          if (p1.getDistance(p2) < 0.01) continue;

          var curveType = getCurveType(item, j);
          var wallData = {
            id: item.data.id + (j > 0 ? "-" + j : ""),
            type: curveType,
            x1: p1.x, y1: p1.y,
            x2: p2.x, y2: p2.y
          };

          // For doors, include open state
          if (curveType === "door") {
            wallData.isOpen = isDoorOpen(item, j);
          }

          walls.push(wallData);
        }

        // If closed path, add segment from last to first
        if (item.closed && item.segments.length >= 3) {
          var pLast = item.segments[item.segments.length - 1].point;
          var pFirst = item.segments[0].point;
          if (pLast.getDistance(pFirst) >= 0.01) {
            var closeIndex = item.segments.length - 1;
            var closeCurveType = getCurveType(item, closeIndex);
            var closeWallData = {
              id: item.data.id + "-close",
              type: closeCurveType,
              x1: pLast.x, y1: pLast.y,
              x2: pFirst.x, y2: pFirst.y
            };

            if (closeCurveType === "door") {
              closeWallData.isOpen = isDoorOpen(item, closeIndex);
            }

            walls.push(closeWallData);
          }
        }
      }

      setWalls(walls);
      onChanged();
    }

    // ── Snap to Vertex ──

    var WELD_THRESHOLD = 0.05; // Vertices within this distance are considered "welded"

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
          if (!pathA.data || !pathA.data.id) continue;
          if (pathA.closed) continue; // Only merge open paths

          var aFirst = pathA.firstSegment.point;
          var aLast = pathA.lastSegment.point;

          for (var j = i + 1; j < items.length; j++) {
            var pathB = items[j];
            if (!pathB || !pathB.segments || pathB.segments.length < 2) continue;
            if (pathB === snapIndicator || pathB === angleGuides) continue;
            if (!pathB.data || !pathB.data.id) continue;
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
              // Get curveTypes before merge
              ensureCurveTypes(pathA);
              ensureCurveTypes(pathB);
              var aCurveTypes = pathA.data.curveTypes.slice();
              var bCurveTypes = pathB.data.curveTypes.slice();
              var aDoorStates = pathA.data.doorStates ? Object.assign({}, pathA.data.doorStates) : {};
              var bDoorStates = pathB.data.doorStates ? Object.assign({}, pathB.data.doorStates) : {};

              // Merge pathB into pathA
              var bPoints = [];
              for (var k = 0; k < pathB.segments.length; k++) {
                bPoints.push(pathB.segments[k].point.clone());
              }

              var newCurveTypes = [];
              var newDoorStates = {};

              if (mergeType === "aLast-bFirst") {
                // Append B's points to A (skip first point, it's the shared vertex)
                for (var k = 1; k < bPoints.length; k++) {
                  pathA.add(bPoints[k]);
                }
                // Combine curveTypes: A + B (shared vertex creates connection)
                newCurveTypes = aCurveTypes.concat(bCurveTypes);
                // Copy A's doorStates
                for (var idx in aDoorStates) {
                  newDoorStates[idx] = aDoorStates[idx];
                }
                // Copy B's doorStates with offset
                for (var idx in bDoorStates) {
                  newDoorStates[parseInt(idx, 10) + aCurveTypes.length] = bDoorStates[idx];
                }

              } else if (mergeType === "aLast-bLast") {
                // Reverse B and append (skip last point which is now first after reverse)
                bPoints.reverse();
                bCurveTypes.reverse();
                for (var k = 1; k < bPoints.length; k++) {
                  pathA.add(bPoints[k]);
                }
                newCurveTypes = aCurveTypes.concat(bCurveTypes);
                for (var idx in aDoorStates) {
                  newDoorStates[idx] = aDoorStates[idx];
                }
                // Reverse B's doorStates indices
                var bLen = bCurveTypes.length;
                for (var idx in bDoorStates) {
                  var reversedIdx = bLen - 1 - parseInt(idx, 10);
                  newDoorStates[reversedIdx + aCurveTypes.length] = bDoorStates[idx];
                }

              } else if (mergeType === "aFirst-bFirst") {
                // Reverse A's current points, then append B (skip first)
                var aPoints = [];
                for (var k = 0; k < pathA.segments.length; k++) {
                  aPoints.push(pathA.segments[k].point.clone());
                }
                aPoints.reverse();
                aCurveTypes.reverse();
                pathA.removeSegments();
                for (var k = 0; k < aPoints.length; k++) {
                  pathA.add(aPoints[k]);
                }
                for (var k = 1; k < bPoints.length; k++) {
                  pathA.add(bPoints[k]);
                }
                newCurveTypes = aCurveTypes.concat(bCurveTypes);
                // Reverse A's doorStates
                var aLen = aCurveTypes.length;
                for (var idx in aDoorStates) {
                  var reversedIdx = aLen - 1 - parseInt(idx, 10);
                  newDoorStates[reversedIdx] = aDoorStates[idx];
                }
                for (var idx in bDoorStates) {
                  newDoorStates[parseInt(idx, 10) + aCurveTypes.length] = bDoorStates[idx];
                }

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
                newCurveTypes = bCurveTypes.concat(aCurveTypes);
                for (var idx in bDoorStates) {
                  newDoorStates[idx] = bDoorStates[idx];
                }
                for (var idx in aDoorStates) {
                  newDoorStates[parseInt(idx, 10) + bCurveTypes.length] = aDoorStates[idx];
                }
              }

              // Update pathA's curveTypes and doorStates
              pathA.data.curveTypes = newCurveTypes;
              pathA.data.doorStates = newDoorStates;

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

              syncCurveTypesLength(pathA);
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

    function findWeldedSegments(point, excludeSegment) {
      // Find all segments at the same position (welded together)
      var welded = [];
      var items = scope.project.activeLayer.children;

      for (var i = 0; i < items.length; i++) {
        var item = items[i];
        if (item === snapIndicator) continue;
        if (item === angleGuides) continue;
        if (!item.segments) continue;

        for (var j = 0; j < item.segments.length; j++) {
          var seg = item.segments[j];
          if (seg === excludeSegment) continue;
          if (point.getDistance(seg.point) < WELD_THRESHOLD) {
            welded.push(seg);
          }
        }
      }

      return welded;
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
      var point1 = curve.getPointAt(t1, true);
      var point2 = curve.getPointAt(t2, true);

      // We need to insert vertices at these points
      // First, ensure curveTypes exists
      ensureCurveTypes(path);

      var originalType = getCurveType(path, curveIndex);
      var originalDoorStates = path.data.doorStates ? Object.assign({}, path.data.doorStates) : {};

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

      // Rebuild curveTypes array
      var oldCurveTypes = path.data.curveTypes.slice();
      syncCurveTypesLength(path);

      // Now assign types based on what we split
      // Depends on whether t1 > 0 and t2 < 1
      if (t1 > 0 && t2 < 1) {
        // Three new segments: [start-t1]=originalType, [t1-t2]=new type, [t2-end]=originalType
        // curveIndex = start to t1 (originalType)
        // curveIndex+1 = t1 to t2 (new type)
        // curveIndex+2 = t2 to end (originalType)
        setCurveType(path, curveIndex, originalType);
        setCurveType(path, curveIndex + 1, type);
        setCurveType(path, curveIndex + 2, originalType);
        if (type === "door") {
          setDoorOpen(path, curveIndex + 1, false);
        }
      } else if (t1 > 0) {
        // Two segments: [start-t1]=originalType, [t1-end]=new type
        setCurveType(path, curveIndex, originalType);
        setCurveType(path, curveIndex + 1, type);
        if (type === "door") {
          setDoorOpen(path, curveIndex + 1, false);
        }
      } else if (t2 < 1) {
        // Two segments: [start-t2]=new type, [t2-end]=originalType
        setCurveType(path, curveIndex, type);
        setCurveType(path, curveIndex + 1, originalType);
        if (type === "door") {
          setDoorOpen(path, curveIndex, false);
        }
      } else {
        // Whole curve becomes the new type (t1=0, t2=1)
        setCurveType(path, curveIndex, type);
        if (type === "door") {
          setDoorOpen(path, curveIndex, false);
        }
      }

      // Update doorStates indices for curves after the split
      var newDoorStates = {};
      for (var oldIdx in originalDoorStates) {
        var idx = parseInt(oldIdx, 10);
        if (idx < curveIndex) {
          newDoorStates[idx] = originalDoorStates[oldIdx];
        } else if (idx > curveIndex) {
          // Shift indices by number of new segments added
          var shift = (t1 > 0 ? 1 : 0) + (t2 < 1 ? 1 : 0);
          newDoorStates[idx + shift] = originalDoorStates[oldIdx];
        }
        // Skip the original curveIndex since we're replacing it
      }
      path.data.doorStates = newDoorStates;

      saveProject();
      return true;
    }

    function handleDoorWindowClick(point) {
      // Handle click when in door or window mode
      // Find the curve nearest to the click point
      var hitResult = scope.project.hitTest(point, {
        stroke: true,
        tolerance: 0.3
      });

      if (!hitResult || !hitResult.item || !hitResult.item.data || !hitResult.item.data.id) {
        return false;
      }


      var path = hitResult.item;
      var location = hitResult.location;

      if (!location || !location.curve) {
        return false;
      }

      var curveIndex = location.curve.index;
      var t = location.time; // Parameter along curve (0-1)

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
      document.removeEventListener("ae-map-transform", updateViewTransform);
    }

    function onWheel(e) {
      e.preventDefault();
      var mapCanvas = container.querySelector("canvas:not(#paper-wall-canvas)");
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

    // ── Mouse Handlers ──

    var selectedItem = null;
    var selectedSegment = null;
    var dragging = false;

    function onMouseDown(event) {
      var button = event.event.button;

      // Middle click or Cmd+click: pan
      if (button === 1 || event.event.metaKey) {
        startPanning(event.event);
        return;
      }

      // Right-click: context menu or pan
      if (button === 2) {
        var hitResult = scope.project.hitTest(event.point, {
          segments: true,
          stroke: true,
          tolerance: 8 / (scope.view.zoom || 1)
        });

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
            var curveType = curveIndex >= 0 ? getCurveType(hitResult.item, curveIndex) : "wall";
            var isOpen = curveType === "door" ? isDoorOpen(hitResult.item, curveIndex) : false;

            onWallContext({
              type: "wall",
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
        scope.project.deselectAll();
        selectedItem = null;
        selectedSegment = null;

        // Door/Window mode: click on existing wall to place
        if (drawMode === "door" || drawMode === "window") {
          if (handleDoorWindowClick(event.point)) {
            return;
          }
          // If no wall was hit, do nothing
          return;
        }

        // Rectangle and Circle modes: start drag
        if (shapeMode === "rectangle" || shapeMode === "circle") {
          var startPoint = findNearestVertex(event.point, null) || event.point;
          shapeStartPoint = startPoint.clone();

          // Create preview shape
          if (shapeMode === "rectangle") {
            currentPath = new scope.Path({
              strokeColor: WALL_COLOR,
              strokeWidth: 0.08,
              strokeCap: "round",
              strokeJoin: "round",
              closed: true,
              data: { id: generateId(), type: drawMode }
            });
            // Add 4 corners (will be updated on drag)
            currentPath.add(startPoint);
            currentPath.add(startPoint);
            currentPath.add(startPoint);
            currentPath.add(startPoint);
          } else {
            // Circle: create polygon approximation
            currentPath = new scope.Path({
              strokeColor: WALL_COLOR,
              strokeWidth: 0.08,
              strokeCap: "round",
              strokeJoin: "round",
              closed: true,
              data: { id: generateId(), type: drawMode }
            });
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

        var clickPoint = findNearestVertex(targetPoint, currentPath) || targetPoint;

        if (!currentPath) {
          currentPath = new scope.Path({
            strokeColor: WALL_COLOR,
            strokeWidth: 0.08,
            strokeCap: "round",
            strokeJoin: "round",
            data: { id: generateId(), type: drawMode }
          });
          currentPath.add(clickPoint);
          currentPath.add(clickPoint); // Preview point
        } else {
          currentPath.add(clickPoint);
        }
        return;
      }

      // Left click - Selection mode
      var hitResult = scope.project.hitTest(event.point, {
        segments: true,
        stroke: true,
        fill: true,
        tolerance: 5 / (scope.view.zoom || 1)
      });

      if (hitResult && hitResult.item) {
        var clickedPath = hitResult.item;

        // Deselect all other items first
        scope.project.deselectAll();

        // Select the clicked path
        clickedPath.selected = true;
        selectedItem = clickedPath;

        // If clicked on a segment (vertex), prepare for vertex drag
        if (hitResult.type === "segment") {
          selectedSegment = hitResult.segment;
        } else {
          selectedSegment = null;
        }

        dragging = true;
      } else {
        // Clicked on empty space - deselect all
        scope.project.deselectAll();
        selectedItem = null;
        selectedSegment = null;
      }
    }

    var dragStartPoint = null;
    var dragStartPosition = null;
    var weldedSegments = []; // Segments welded to the selected segment

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
        var snapPoint = findNearestVertex(endPoint, currentPath);
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

      if (selectedSegment) {
        // On first drag, find all segments welded to this one
        if (weldedSegments.length === 0) {
          weldedSegments = findWeldedSegments(selectedSegment.point, selectedSegment);
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
        var snapPoint = findNearestVertexExcluding(targetPoint, selectedSegment, weldedSegments);
        updateSnapIndicator(snapPoint);
        var finalPoint = snapPoint || targetPoint;

        // Move selected segment and all welded segments together
        selectedSegment.point = finalPoint;
        for (var i = 0; i < weldedSegments.length; i++) {
          weldedSegments[i].point = finalPoint;
        }

      } else if (selectedItem) {
        // Track start position on first drag
        if (!dragStartPoint) {
          dragStartPoint = event.point.subtract(event.delta);
          dragStartPosition = selectedItem.position.clone();
        }

        if (shiftPressed) {
          // Constrain movement direction from start
          updateAngleGuides(dragStartPoint, true);
          var constrainedTarget = constrainAngle(dragStartPoint, event.point);
          var offset = constrainedTarget.subtract(dragStartPoint);
          selectedItem.position = dragStartPosition.add(offset);
        } else {
          updateAngleGuides(null, false);
          selectedItem.position = selectedItem.position.add(event.delta);
        }
      }
    }

    function onMouseUp(event) {
      if (dragging) {
        // Track if we were dragging a vertex (for merge check)
        var wasDraggingVertex = selectedSegment !== null || weldedSegments.length > 0;

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
        dragStartPoint = null;
        dragStartPosition = null;
        weldedSegments = [];
        updateSnapIndicator(null);
        updateAngleGuides(null, false);

        // After dragging a vertex, check if paths should be merged
        if (wasDraggingVertex) {
          tryMergePaths();
        }

        saveProject(); // Auto-save on edit
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
      var t = hitResult.location.time;
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
      var previewP1 = curve.getPointAt(doorT1, true);
      var previewP2 = curve.getPointAt(doorT2, true);

      hoverIndicator = new scope.Path.Line({
        from: previewP1,
        to: previewP2,
        strokeColor: color,
        strokeWidth: 0.15,
        strokeCap: "round",
        dashArray: [0.2, 0.1]
      });
    }

    function onMouseMove(event) {
      var shiftPressed = event.modifiers && event.modifiers.shift;

      // Door/window mode: show hover indicator on walls
      if (drawMode === "door" || drawMode === "window") {
        updateAngleGuides(null, false);
        updateSnapIndicator(null);

        var hitResult = scope.project.hitTest(event.point, {
          stroke: true,
          tolerance: 0.3
        });

        if (hitResult && hitResult.item && hitResult.item.data && hitResult.item.data.id) {
          var color = drawMode === "door" ? DOOR_COLOR : WINDOW_COLOR;
          updateHoverIndicator(hitResult, color);
          container.style.cursor = "pointer";
        } else {
          updateHoverIndicator(null, null);
          container.style.cursor = "crosshair";
        }
        return;
      }

      updateHoverIndicator(null, null);

      // Rectangle/circle: preview is handled in onMouseDrag, just show snap indicator here
      if (drawMode && (shapeMode === "rectangle" || shapeMode === "circle")) {
        if (!currentPath) {
          // Not yet drawing, show snap indicator for potential start point
          var snapPoint = findNearestVertex(event.point, null);
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
        var snapPoint = findNearestVertex(targetPoint, currentPath);
        updateSnapIndicator(snapPoint);
        currentPath.lastSegment.point = snapPoint || targetPoint;
      } else if (drawMode) {
        updateAngleGuides(null, false);
        var snapPoint = findNearestVertex(event.point, null);
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
        if (selectedSegment) {
          var path = selectedSegment.path;
          selectedSegment.remove();
          if (path.segments.length < 2) {
            path.remove();
          }
          selectedSegment = null;
          selectedItem = null;
          saveProject();
        } else if (selectedItem) {
          selectedItem.remove();
          selectedItem = null;
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

      // Update curveTypes: when removing a vertex, we need to merge the two adjacent curves
      ensureCurveTypes(path);
      if (path.data.curveTypes && path.data.curveTypes.length > 0) {
        // Determine which curve type to keep
        // If either adjacent curve is a door/window, prefer keeping wall
        var prevType = segIndex > 0 ? getCurveType(path, segIndex - 1) : "wall";
        var nextType = segIndex < path.data.curveTypes.length ? getCurveType(path, segIndex) : "wall";

        // Remove the curve type at segIndex (the curve after this vertex)
        if (segIndex < path.data.curveTypes.length) {
          path.data.curveTypes.splice(segIndex, 1);
        }

        // Update doorStates - remove any references to the deleted curve and shift indices
        if (path.data.doorStates) {
          var newDoorStates = {};
          for (var idx in path.data.doorStates) {
            var i = parseInt(idx, 10);
            if (i < segIndex) {
              newDoorStates[i] = path.data.doorStates[idx];
            } else if (i > segIndex) {
              newDoorStates[i - 1] = path.data.doorStates[idx];
            }
            // Skip i === segIndex (the deleted curve)
          }
          path.data.doorStates = newDoorStates;
        }
      }

      segment.remove();

      // If path has less than 2 segments, remove it entirely
      if (path.segments.length < 2) {
        path.remove();
      } else {
        syncCurveTypesLength(path);
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

        // Get the current type of this curve
        ensureCurveTypes(path);
        var currentType = getCurveType(path, curveIndex);
        var isDoor = currentType === "door";
        var wasOpen = isDoor ? isDoorOpen(path, curveIndex) : false;

        // Insert the new vertex
        path.insert(curveIndex + 1, location.point);

        // Insert a new curveType for the new curve created
        // Both halves inherit the original type
        if (path.data.curveTypes) {
          path.data.curveTypes.splice(curveIndex + 1, 0, currentType);
        }

        // Update doorStates - shift indices for curves after the split
        if (path.data.doorStates) {
          var newDoorStates = {};
          for (var idx in path.data.doorStates) {
            var i = parseInt(idx, 10);
            if (i < curveIndex) {
              newDoorStates[i] = path.data.doorStates[idx];
            } else if (i === curveIndex) {
              // Both new curves inherit the door state
              newDoorStates[i] = path.data.doorStates[idx];
              newDoorStates[i + 1] = path.data.doorStates[idx];
            } else {
              newDoorStates[i + 1] = path.data.doorStates[idx];
            }
          }
          path.data.doorStates = newDoorStates;
        }

        syncCurveTypesLength(path);
          saveProject();
      }
    }

    function deleteWallSegment(location) {
      // Delete just the wall segment (curve between two vertices), not the whole path
      if (!location || !location.curve || !location.path) return;

      var path = location.path;
      var curveIndex = location.curve.index;

      ensureCurveTypes(path);
      var oldCurveTypes = path.data.curveTypes ? path.data.curveTypes.slice() : [];
      var oldDoorStates = path.data.doorStates ? Object.assign({}, path.data.doorStates) : {};

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

        // Reorder curveTypes (removing the deleted curve)
        var newCurveTypes = [];
        var newDoorStates = {};
        for (var i = 0; i < oldCurveTypes.length; i++) {
          if (i === curveIndex) continue; // Skip deleted curve
          var oldIdx = (breakIndex + i) % oldCurveTypes.length;
          var newIdx = newCurveTypes.length;
          newCurveTypes.push(oldCurveTypes[oldIdx]);
          if (oldDoorStates[oldIdx]) {
            newDoorStates[newIdx] = oldDoorStates[oldIdx];
          }
        }

        // Rebuild the path as open
        path.removeSegments();
        for (var i = 0; i < points.length; i++) {
          path.add(points[i]);
        }
        path.closed = false;
        path.data.curveTypes = newCurveTypes;
        path.data.doorStates = newDoorStates;
        syncCurveTypesLength(path);

      } else {
        // For open paths: split into two separate paths at this curve
        var seg1End = curveIndex;
        var seg2Start = curveIndex + 1;

        if (seg2Start >= path.segments.length) {
          // Clicked on the last segment - just remove it
          if (path.data.curveTypes && path.data.curveTypes.length > 0) {
            path.data.curveTypes.pop();
          }
          if (path.data.doorStates) {
            delete path.data.doorStates[oldCurveTypes.length - 1];
          }
          path.lastSegment.remove();
          if (path.segments.length < 2) {
            path.remove();
          }
              saveProject();
          return;
        }

        if (seg1End < 0) {
          // Clicked on the first segment - just remove it
          if (path.data.curveTypes && path.data.curveTypes.length > 0) {
            path.data.curveTypes.shift();
          }
          // Shift doorStates indices
          var newDoorStates = {};
          for (var idx in oldDoorStates) {
            var i = parseInt(idx, 10);
            if (i > 0) {
              newDoorStates[i - 1] = oldDoorStates[idx];
            }
          }
          path.data.doorStates = newDoorStates;
          path.firstSegment.remove();
          if (path.segments.length < 2) {
            path.remove();
          }
              saveProject();
          return;
        }

        // Collect points and curveTypes for the second path
        var secondPathPoints = [];
        var secondCurveTypes = [];
        var secondDoorStates = {};
        for (var i = seg2Start; i < path.segments.length; i++) {
          secondPathPoints.push(path.segments[i].point.clone());
        }
        for (var i = seg2Start; i < oldCurveTypes.length; i++) {
          var newIdx = secondCurveTypes.length;
          secondCurveTypes.push(oldCurveTypes[i]);
          if (oldDoorStates[i]) {
            secondDoorStates[newIdx] = oldDoorStates[i];
          }
        }

        // Truncate curveTypes for first path
        if (path.data.curveTypes) {
          path.data.curveTypes = path.data.curveTypes.slice(0, curveIndex);
        }
        // Truncate doorStates for first path
        var firstDoorStates = {};
        for (var idx in oldDoorStates) {
          var i = parseInt(idx, 10);
          if (i < curveIndex) {
            firstDoorStates[i] = oldDoorStates[idx];
          }
        }
        path.data.doorStates = firstDoorStates;

        // Remove segments from original path (keep only up to seg1End)
        while (path.segments.length > seg1End + 1) {
          path.lastSegment.remove();
        }

        // Create second path if it has at least 2 points
        if (secondPathPoints.length >= 2) {
          var secondPath = new scope.Path({
            strokeColor: path.strokeColor,
            strokeWidth: path.strokeWidth,
            strokeCap: path.strokeCap,
            strokeJoin: path.strokeJoin,
            data: {
              id: generateId(),
              type: path.data?.type || "wall",
              curveTypes: secondCurveTypes,
              doorStates: secondDoorStates
            }
          });
          for (var i = 0; i < secondPathPoints.length; i++) {
            secondPath.add(secondPathPoints[i]);
          }
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
      if (!mode) {
        if (currentPath) {
          currentPath.remove();
          currentPath = null;
        }
        shapeStartPoint = null;
        updateSnapIndicator(null);
        updateHoverIndicator(null, null);
      }
      container.style.cursor = mode ? "crosshair" : "";
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
      clearAll: clearAll,
      save: saveProject,
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
      setCurveType: function(path, curveIndex, type) {
        setCurveType(path, curveIndex, type);
        saveProject();
      },
      isDoorOpen: isDoorOpen
    };
  }

  global.PaperWallEditor = { createEditor: createPaperWallEditor };
})(window);
