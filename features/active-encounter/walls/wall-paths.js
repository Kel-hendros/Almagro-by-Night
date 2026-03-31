(function initAEWallPathsModule(global) {
  "use strict";

  var SEGMENT_TYPES = new Set(["wall", "door", "window", "grate", "curtain"]);

  function cloneJson(value) {
    if (value == null) return value;
    return JSON.parse(JSON.stringify(value));
  }

  function generatePathId() {
    return "wp-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function generateSegmentId() {
    return "ws-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  function normalizePoint(point) {
    return {
      x: Number.isFinite(parseFloat(point && point.x)) ? parseFloat(point.x) : 0,
      y: Number.isFinite(parseFloat(point && point.y)) ? parseFloat(point.y) : 0,
    };
  }

  function normalizeSegment(segment) {
    var type = segment && typeof segment.type === "string" ? segment.type : "wall";
    if (!SEGMENT_TYPES.has(type)) type = "wall";
    var supportsOpenState = type === "door" || type === "window";
    return {
      id: segment && segment.id ? String(segment.id) : generateSegmentId(),
      type: type,
      doorOpen: supportsOpenState && !!(segment && segment.doorOpen),
      locked: supportsOpenState && !!(segment && segment.locked),
      name: segment && typeof segment.name === "string" ? segment.name : "",
    };
  }

  function normalizeWallPath(path) {
    var points = Array.isArray(path && path.points) ? path.points.map(normalizePoint) : [];
    var closed = !!(path && path.closed);
    var curveCount = closed ? points.length : Math.max(0, points.length - 1);
    var segments = Array.isArray(path && path.segments) ? path.segments.map(normalizeSegment) : [];

    while (segments.length < curveCount) {
      segments.push(normalizeSegment(null));
    }
    if (segments.length > curveCount) {
      segments.length = curveCount;
    }

    return {
      id: path && path.id ? String(path.id) : generatePathId(),
      closed: closed,
      points: points,
      segments: segments,
    };
  }

  function normalizeWallPaths(paths) {
    if (!Array.isArray(paths)) return [];
    var normalized = [];
    for (var i = 0; i < paths.length; i++) {
      var path = normalizeWallPath(paths[i]);
      if (path.points.length >= 2 && path.segments.length > 0) {
        normalized.push(path);
      }
    }
    return normalized;
  }

  function compileWalls(paths) {
    var wallPaths = normalizeWallPaths(paths);
    var walls = [];

    for (var i = 0; i < wallPaths.length; i++) {
      var path = wallPaths[i];
      var points = path.points;
      var segments = path.segments;
      var curveCount = path.closed ? points.length : Math.max(0, points.length - 1);

      for (var j = 0; j < curveCount; j++) {
        var point1 = points[j];
        var point2 = path.closed && j === points.length - 1 ? points[0] : points[j + 1];
        if (!point1 || !point2) continue;
        if (Math.abs(point1.x - point2.x) < 0.0001 && Math.abs(point1.y - point2.y) < 0.0001) {
          continue;
        }

        var meta = normalizeSegment(segments[j]);
        walls.push({
          id: meta.id,
          type: meta.type,
          x1: point1.x,
          y1: point1.y,
          x2: point2.x,
          y2: point2.y,
          doorOpen: !!meta.doorOpen,
          locked: !!meta.locked,
          name: meta.name || "",
          pathId: path.id,
          segmentIndex: j,
        });
      }
    }

    return walls;
  }

  function createWallPathsFromWalls(walls) {
    if (!Array.isArray(walls) || !walls.length) return [];
    var paths = [];

    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i] || {};
      paths.push(normalizeWallPath({
        id: wall.pathId || generatePathId(),
        closed: false,
        points: [
          { x: wall.x1, y: wall.y1 },
          { x: wall.x2, y: wall.y2 },
        ],
        segments: [{
          id: wall.id,
          type: wall.type,
          doorOpen: wall.doorOpen,
          locked: wall.locked,
          name: wall.name,
        }],
      }));
    }

    return paths;
  }

  function reconcileWallPathsFromWalls(paths, walls) {
    var wallPaths = normalizeWallPaths(paths);
    if (!Array.isArray(walls) || !walls.length) return wallPaths;

    var byId = new Map();
    for (var i = 0; i < walls.length; i++) {
      var wall = walls[i];
      if (wall && wall.id) byId.set(String(wall.id), wall);
    }

    return wallPaths.map(function (path) {
      return {
        id: path.id,
        closed: path.closed,
        points: path.points.map(normalizePoint),
        segments: path.segments.map(function (segment) {
          var wall = byId.get(segment.id);
          if (!wall) return normalizeSegment(segment);
          return normalizeSegment({
            id: segment.id,
            type: wall.type != null ? wall.type : segment.type,
            doorOpen: wall.doorOpen != null ? wall.doorOpen : segment.doorOpen,
            locked: wall.locked != null ? wall.locked : segment.locked,
            name: wall.name != null ? wall.name : segment.name,
          });
        }),
      };
    });
  }

  function updateWallSegment(paths, wallId, updater) {
    if (!wallId || typeof updater !== "function") {
      return {
        changed: false,
        wallPaths: normalizeWallPaths(paths),
        wall: null,
      };
    }

    var wallPaths = normalizeWallPaths(paths);
    for (var i = 0; i < wallPaths.length; i++) {
      var path = wallPaths[i];
      for (var j = 0; j < path.segments.length; j++) {
        if (path.segments[j].id !== wallId) continue;
        var draft = normalizeSegment(path.segments[j]);
        var next = updater(cloneJson(draft), {
          path: path,
          segmentIndex: j,
        });
        if (!next) {
          return { changed: false, wallPaths: wallPaths, wall: compileWalls([path])[j] || null };
        }
        path.segments[j] = normalizeSegment(next);
        return {
          changed: true,
          wallPaths: wallPaths,
          wall: compileWalls([path]).find(function (wall) { return wall.id === wallId; }) || null,
        };
      }
    }

    return { changed: false, wallPaths: wallPaths, wall: null };
  }

  global.AEWallPaths = {
    generatePathId: generatePathId,
    generateSegmentId: generateSegmentId,
    normalizeWallPath: normalizeWallPath,
    normalizeWallPaths: normalizeWallPaths,
    compileWalls: compileWalls,
    createWallPathsFromWalls: createWallPathsFromWalls,
    reconcileWallPathsFromWalls: reconcileWallPathsFromWalls,
    updateWallSegment: updateWallSegment,
  };
})(window);
