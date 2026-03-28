// Wall Vertex Registry
// Tracks connected vertices from walls for edit operations.
// Computes a registry mapping coordinate keys to vertex data.
(function initWallVertexRegistryModule(global) {
  "use strict";

  var COORD_PRECISION = 4; // decimal places for coordinate keys

  /**
   * Round coordinate to avoid floating point comparison issues.
   */
  function roundCoord(v) {
    var factor = Math.pow(10, COORD_PRECISION);
    return Math.round(v * factor) / factor;
  }

  /**
   * Generate a string key from coordinates.
   */
  function makeKey(x, y) {
    return roundCoord(x) + "," + roundCoord(y);
  }

  /**
   * Parse a key back to coordinates.
   */
  function parseKey(key) {
    var parts = key.split(",");
    return {
      x: parseFloat(parts[0]) || 0,
      y: parseFloat(parts[1]) || 0,
    };
  }

  /**
   * Build a vertex registry from walls array.
   * Returns an object: { "x,y": { x, y, wallIds: [...], endpoints: [...] } }
   *
   * Each vertex tracks:
   *   - x, y: coordinates
   *   - wallIds: array of wall IDs connected to this vertex
   *   - endpoints: array of { wallId, end: 1|2 } indicating which endpoint of each wall
   */
  function buildRegistry(walls) {
    var registry = {};

    if (!walls || !walls.length) return registry;

    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!w || !w.id) continue;

      // Register endpoint 1 (x1, y1)
      var key1 = makeKey(w.x1, w.y1);
      if (!registry[key1]) {
        registry[key1] = {
          x: roundCoord(w.x1),
          y: roundCoord(w.y1),
          wallIds: [],
          endpoints: [],
        };
      }
      if (registry[key1].wallIds.indexOf(w.id) === -1) {
        registry[key1].wallIds.push(w.id);
        registry[key1].endpoints.push({ wallId: w.id, end: 1 });
      }

      // Register endpoint 2 (x2, y2)
      var key2 = makeKey(w.x2, w.y2);
      if (!registry[key2]) {
        registry[key2] = {
          x: roundCoord(w.x2),
          y: roundCoord(w.y2),
          wallIds: [],
          endpoints: [],
        };
      }
      if (registry[key2].wallIds.indexOf(w.id) === -1) {
        registry[key2].wallIds.push(w.id);
        registry[key2].endpoints.push({ wallId: w.id, end: 2 });
      }
    }

    return registry;
  }

  /**
   * Get all unique vertex entries as an array.
   */
  function getVertices(registry) {
    var result = [];
    for (var key in registry) {
      if (registry.hasOwnProperty(key)) {
        result.push({
          key: key,
          x: registry[key].x,
          y: registry[key].y,
          wallIds: registry[key].wallIds,
          endpoints: registry[key].endpoints,
          connectionCount: registry[key].wallIds.length,
        });
      }
    }
    return result;
  }

  /**
   * Find a vertex near a given position.
   * Returns { key, x, y, wallIds, endpoints, distance } or null.
   */
  function findNearestVertex(registry, cellX, cellY, maxDistance) {
    var best = null;
    var bestDist = maxDistance || 0.5;

    for (var key in registry) {
      if (!registry.hasOwnProperty(key)) continue;
      var v = registry[key];
      var dx = cellX - v.x;
      var dy = cellY - v.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < bestDist) {
        bestDist = dist;
        best = {
          key: key,
          x: v.x,
          y: v.y,
          wallIds: v.wallIds,
          endpoints: v.endpoints,
          connectionCount: v.wallIds.length,
          distance: dist,
        };
      }
    }

    return best;
  }

  /**
   * Get vertices within a given distance of a point.
   * Returns array of { key, x, y, wallIds, distance }.
   */
  function getVerticesNear(registry, cellX, cellY, maxDistance) {
    var result = [];
    var maxDist = maxDistance || 3;

    for (var key in registry) {
      if (!registry.hasOwnProperty(key)) continue;
      var v = registry[key];
      var dx = cellX - v.x;
      var dy = cellY - v.y;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= maxDist) {
        result.push({
          key: key,
          x: v.x,
          y: v.y,
          wallIds: v.wallIds,
          endpoints: v.endpoints,
          connectionCount: v.wallIds.length,
          distance: dist,
        });
      }
    }

    return result;
  }

  /**
   * Check if a vertex is a "junction" (connected to 3+ walls).
   */
  function isJunction(vertex) {
    return vertex && vertex.wallIds && vertex.wallIds.length >= 3;
  }

  /**
   * Check if a vertex is a "corner" (connected to exactly 2 walls).
   */
  function isCorner(vertex) {
    return vertex && vertex.wallIds && vertex.wallIds.length === 2;
  }

  /**
   * Check if a vertex is an "endpoint" (connected to exactly 1 wall).
   */
  function isEndpoint(vertex) {
    return vertex && vertex.wallIds && vertex.wallIds.length === 1;
  }

  /**
   * Factory function to create a managed vertex registry instance.
   */
  function createVertexRegistry(opts) {
    var getWalls = opts.getWalls || function () { return []; };
    var registry = {};

    function rebuild() {
      registry = buildRegistry(getWalls());
      return registry;
    }

    function getRegistry() {
      return registry;
    }

    function findVertex(cellX, cellY, maxDistance) {
      return findNearestVertex(registry, cellX, cellY, maxDistance);
    }

    function getVerticesNearPoint(cellX, cellY, maxDistance) {
      return getVerticesNear(registry, cellX, cellY, maxDistance);
    }

    function getAllVertices() {
      return getVertices(registry);
    }

    function getVertexByKey(key) {
      return registry[key] || null;
    }

    // Initial build
    rebuild();

    return {
      rebuild: rebuild,
      getRegistry: getRegistry,
      findVertex: findVertex,
      getVerticesNear: getVerticesNearPoint,
      getAllVertices: getAllVertices,
      getVertexByKey: getVertexByKey,
      makeKey: makeKey,
      parseKey: parseKey,
    };
  }

  global.WallVertexRegistry = {
    buildRegistry: buildRegistry,
    getVertices: getVertices,
    findNearestVertex: findNearestVertex,
    getVerticesNear: getVerticesNear,
    isJunction: isJunction,
    isCorner: isCorner,
    isEndpoint: isEndpoint,
    makeKey: makeKey,
    parseKey: parseKey,
    createVertexRegistry: createVertexRegistry,
  };
})(window);
