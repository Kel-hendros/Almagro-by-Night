// Wall Editor
// Core editing operations for walls and vertices.
(function initWallEditorModule(global) {
  "use strict";

  var MIN_WALL_LENGTH = 0.15; // Minimum segment length in grid units

  function generateWallId() {
    return "wall-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 6);
  }

  /**
   * Create a wall editor instance.
   * @param {Object} opts
   * @param {Function} opts.getWalls - returns walls array
   * @param {Function} opts.setWalls - updates walls array
   * @param {Function} opts.getVertexRegistry - returns vertex registry instance
   * @param {Function} opts.getSelection - returns selection instance
   * @param {Function} opts.onChanged - callback after edits (for save)
   */
  function createWallEditor(opts) {
    var getWalls = opts.getWalls;
    var setWalls = opts.setWalls;
    var getVertexRegistry = opts.getVertexRegistry;
    var getSelection = opts.getSelection;
    var onChanged = opts.onChanged || function () {};

    var saveTimer = null;
    var SAVE_DELAY = 400;

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        onChanged();
      }, SAVE_DELAY);
    }

    function rebuildRegistry() {
      var registry = getVertexRegistry?.();
      if (registry && typeof registry.rebuild === "function") {
        registry.rebuild();
      }
    }

    // ── Vertex Operations ──

    /**
     * Move a vertex by its key to new coordinates.
     * Updates all walls connected to this vertex.
     */
    function moveVertex(vertexKey, newX, newY) {
      var registry = getVertexRegistry?.();
      if (!registry) return false;

      var vertex = registry.getVertexByKey(vertexKey);
      if (!vertex) return false;

      var walls = getWalls() || [];
      var modified = false;

      // Update all wall endpoints that reference this vertex
      for (var i = 0; i < vertex.endpoints.length; i++) {
        var ep = vertex.endpoints[i];
        var wall = walls.find(function (w) { return w.id === ep.wallId; });
        if (!wall) continue;

        if (ep.end === 1) {
          wall.x1 = newX;
          wall.y1 = newY;
          modified = true;
        } else if (ep.end === 2) {
          wall.x2 = newX;
          wall.y2 = newY;
          modified = true;
        }
      }

      if (modified) {
        setWalls(walls);
        rebuildRegistry();
        scheduleSave();
      }

      return modified;
    }

    /**
     * Move multiple vertices together (for selection drag).
     * @param {Array} vertexKeys - array of vertex key strings
     * @param {number} deltaX - change in X
     * @param {number} deltaY - change in Y
     */
    function moveVertices(vertexKeys, deltaX, deltaY) {
      if (!vertexKeys || !vertexKeys.length) return false;

      var registry = getVertexRegistry?.();
      if (!registry) return false;

      var walls = getWalls() || [];
      var modified = false;
      var processedEndpoints = {};

      for (var k = 0; k < vertexKeys.length; k++) {
        var vertex = registry.getVertexByKey(vertexKeys[k]);
        if (!vertex) continue;

        for (var i = 0; i < vertex.endpoints.length; i++) {
          var ep = vertex.endpoints[i];
          var endpointKey = ep.wallId + "-" + ep.end;
          if (processedEndpoints[endpointKey]) continue;
          processedEndpoints[endpointKey] = true;

          var wall = walls.find(function (w) { return w.id === ep.wallId; });
          if (!wall) continue;

          if (ep.end === 1) {
            wall.x1 += deltaX;
            wall.y1 += deltaY;
            modified = true;
          } else if (ep.end === 2) {
            wall.x2 += deltaX;
            wall.y2 += deltaY;
            modified = true;
          }
        }
      }

      if (modified) {
        setWalls(walls);
        rebuildRegistry();
        scheduleSave();
      }

      return modified;
    }

    /**
     * Delete a vertex (removes all connected walls).
     */
    function deleteVertex(vertexKey) {
      var registry = getVertexRegistry?.();
      if (!registry) return false;

      var vertex = registry.getVertexByKey(vertexKey);
      if (!vertex) return false;

      var walls = getWalls() || [];
      var wallIdsToRemove = vertex.wallIds.slice();

      walls = walls.filter(function (w) {
        return wallIdsToRemove.indexOf(w.id) === -1;
      });

      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      return true;
    }

    /**
     * Delete multiple vertices.
     */
    function deleteVertices(vertexKeys) {
      if (!vertexKeys || !vertexKeys.length) return false;

      var registry = getVertexRegistry?.();
      if (!registry) return false;

      var walls = getWalls() || [];
      var wallIdsToRemove = [];

      for (var k = 0; k < vertexKeys.length; k++) {
        var vertex = registry.getVertexByKey(vertexKeys[k]);
        if (vertex) {
          for (var i = 0; i < vertex.wallIds.length; i++) {
            if (wallIdsToRemove.indexOf(vertex.wallIds[i]) === -1) {
              wallIdsToRemove.push(vertex.wallIds[i]);
            }
          }
        }
      }

      if (!wallIdsToRemove.length) return false;

      walls = walls.filter(function (w) {
        return wallIdsToRemove.indexOf(w.id) === -1;
      });

      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      return true;
    }

    // ── Wall Operations ──

    /**
     * Move a wall by delta (both endpoints).
     */
    function moveWall(wallId, deltaX, deltaY) {
      var walls = getWalls() || [];
      var wall = walls.find(function (w) { return w.id === wallId; });
      if (!wall) return false;

      wall.x1 += deltaX;
      wall.y1 += deltaY;
      wall.x2 += deltaX;
      wall.y2 += deltaY;

      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      return true;
    }

    /**
     * Move multiple walls together.
     */
    function moveWalls(wallIds, deltaX, deltaY) {
      if (!wallIds || !wallIds.length) return false;

      var walls = getWalls() || [];
      var modified = false;

      for (var i = 0; i < wallIds.length; i++) {
        var wall = walls.find(function (w) { return w.id === wallIds[i]; });
        if (wall) {
          wall.x1 += deltaX;
          wall.y1 += deltaY;
          wall.x2 += deltaX;
          wall.y2 += deltaY;
          modified = true;
        }
      }

      if (modified) {
        setWalls(walls);
        rebuildRegistry();
        scheduleSave();
      }

      return modified;
    }

    /**
     * Delete a wall by ID.
     */
    function deleteWall(wallId) {
      var walls = getWalls() || [];
      var idx = walls.findIndex(function (w) { return w.id === wallId; });
      if (idx === -1) return false;

      walls.splice(idx, 1);
      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      return true;
    }

    /**
     * Delete multiple walls.
     */
    function deleteWalls(wallIds) {
      if (!wallIds || !wallIds.length) return false;

      var walls = getWalls() || [];
      var originalCount = walls.length;

      walls = walls.filter(function (w) {
        return wallIds.indexOf(w.id) === -1;
      });

      if (walls.length === originalCount) return false;

      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      return true;
    }

    /**
     * Delete selected items (walls and vertices).
     */
    function deleteSelected() {
      var selection = getSelection?.();
      if (!selection) return false;

      var wallIds = selection.getSelectedWallIds();
      var vertexKeys = selection.getSelectedVertexKeys();

      if (!wallIds.length && !vertexKeys.length) return false;

      // Collect all walls to delete
      var registry = getVertexRegistry?.();
      var allWallIds = wallIds.slice();

      if (registry) {
        for (var k = 0; k < vertexKeys.length; k++) {
          var vertex = registry.getVertexByKey(vertexKeys[k]);
          if (vertex) {
            for (var i = 0; i < vertex.wallIds.length; i++) {
              if (allWallIds.indexOf(vertex.wallIds[i]) === -1) {
                allWallIds.push(vertex.wallIds[i]);
              }
            }
          }
        }
      }

      if (!allWallIds.length) return false;

      var walls = getWalls() || [];
      walls = walls.filter(function (w) {
        return allWallIds.indexOf(w.id) === -1;
      });

      setWalls(walls);
      rebuildRegistry();
      selection.clearSelection();
      scheduleSave();

      return true;
    }

    // ── Add Vertex (Split Wall) ──

    /**
     * Add a vertex on a wall segment, splitting it into two walls.
     * @param {string} wallId - wall to split
     * @param {number} t - parameter along segment [0..1]
     * @returns {string|null} - key of new vertex or null
     */
    function addVertexOnWall(wallId, t) {
      if (t <= 0.05 || t >= 0.95) return null; // Too close to endpoints

      var walls = getWalls() || [];
      var wallIdx = walls.findIndex(function (w) { return w.id === wallId; });
      if (wallIdx === -1) return null;

      var wall = walls[wallIdx];
      var dx = wall.x2 - wall.x1;
      var dy = wall.y2 - wall.y1;
      var len = Math.sqrt(dx * dx + dy * dy);

      // Don't split if either segment would be too short
      if (t * len < MIN_WALL_LENGTH || (1 - t) * len < MIN_WALL_LENGTH) {
        return null;
      }

      // Calculate split point
      var splitX = wall.x1 + dx * t;
      var splitY = wall.y1 + dy * t;

      // Create two new walls
      var wall1 = {
        id: generateWallId(),
        name: wall.name || "Pared",
        x1: wall.x1,
        y1: wall.y1,
        x2: splitX,
        y2: splitY,
        type: wall.type,
        doorOpen: false,
      };

      var wall2 = {
        id: generateWallId(),
        name: wall.name || "Pared",
        x1: splitX,
        y1: splitY,
        x2: wall.x2,
        y2: wall.y2,
        type: wall.type,
        doorOpen: wall.doorOpen || false,
      };

      // Replace original wall with two new walls
      walls.splice(wallIdx, 1, wall1, wall2);

      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      // Return the key of the new vertex
      var registry = getVertexRegistry?.();
      if (registry) {
        return registry.makeKey(splitX, splitY);
      }
      return null;
    }

    /**
     * Find point on a wall nearest to cursor (for add-vertex preview).
     * Returns { wallId, t, x, y, distance } or null.
     */
    function findPointOnWall(cellX, cellY, maxDistance) {
      var walls = getWalls() || [];
      var best = null;
      var bestDist = maxDistance || 0.5;

      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var dx = w.x2 - w.x1;
        var dy = w.y2 - w.y1;
        var lenSq = dx * dx + dy * dy;
        if (lenSq < 0.01) continue;

        // Project point onto line
        var t = ((cellX - w.x1) * dx + (cellY - w.y1) * dy) / lenSq;
        t = Math.max(0, Math.min(1, t));

        var projX = w.x1 + dx * t;
        var projY = w.y1 + dy * t;
        var distX = cellX - projX;
        var distY = cellY - projY;
        var dist = Math.sqrt(distX * distX + distY * distY);

        if (dist < bestDist) {
          bestDist = dist;
          best = {
            wallId: w.id,
            t: t,
            x: projX,
            y: projY,
            distance: dist,
          };
        }
      }

      return best;
    }

    // ── Weld Vertices ──

    /**
     * Merge two vertices into one (weld).
     * All walls connected to vertex2 get moved to vertex1's position.
     */
    function weldVertices(vertexKey1, vertexKey2) {
      var registry = getVertexRegistry?.();
      if (!registry) return false;

      var v1 = registry.getVertexByKey(vertexKey1);
      var v2 = registry.getVertexByKey(vertexKey2);
      if (!v1 || !v2 || vertexKey1 === vertexKey2) return false;

      var walls = getWalls() || [];

      // Move all v2 endpoints to v1's position
      for (var i = 0; i < v2.endpoints.length; i++) {
        var ep = v2.endpoints[i];
        var wall = walls.find(function (w) { return w.id === ep.wallId; });
        if (!wall) continue;

        if (ep.end === 1) {
          wall.x1 = v1.x;
          wall.y1 = v1.y;
        } else if (ep.end === 2) {
          wall.x2 = v1.x;
          wall.y2 = v1.y;
        }
      }

      // Remove zero-length walls
      walls = walls.filter(function (w) {
        var wdx = w.x2 - w.x1;
        var wdy = w.y2 - w.y1;
        return Math.sqrt(wdx * wdx + wdy * wdy) >= MIN_WALL_LENGTH;
      });

      setWalls(walls);
      rebuildRegistry();
      scheduleSave();

      return true;
    }

    return {
      // Vertex operations
      moveVertex: moveVertex,
      moveVertices: moveVertices,
      deleteVertex: deleteVertex,
      deleteVertices: deleteVertices,

      // Wall operations
      moveWall: moveWall,
      moveWalls: moveWalls,
      deleteWall: deleteWall,
      deleteWalls: deleteWalls,

      // Selection operations
      deleteSelected: deleteSelected,

      // Split operations
      addVertexOnWall: addVertexOnWall,
      findPointOnWall: findPointOnWall,

      // Weld
      weldVertices: weldVertices,
    };
  }

  global.WallEditor = {
    createWallEditor: createWallEditor,
  };
})(window);
