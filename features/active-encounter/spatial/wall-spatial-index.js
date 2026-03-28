// Spatial hash index for efficient wall lookups during raycasting.
// This is an INTERNAL data structure - it does NOT render anything.
// Purpose: Instead of testing every ray against ALL walls (O(n)), this groups
// walls by spatial region so each ray only tests against nearby walls (O(1) average).
(function initWallSpatialIndex(global) {
  "use strict";

  // Cell size in coordinate units. Walls spanning multiple cells are added to each.
  // Larger cells = fewer cells but more walls per cell. 5 units (~7.5m) is a good balance.
  var DEFAULT_CELL_SIZE = 5;

  /**
   * Create a spatial hash index for walls.
   * @param {Array} walls - Array of wall objects with x1, y1, x2, y2
   * @param {number} [cellSize] - Size of each spatial cell in coordinate units
   */
  function WallSpatialIndex(walls, cellSize) {
    this.cellSize = cellSize || DEFAULT_CELL_SIZE;
    this.cells = new Map();
    this._wallsHash = null;
    this._wallCount = 0;
    if (walls && walls.length > 0) {
      this.rebuild(walls);
    }
  }

  /**
   * Generate a hash key for a cell position.
   */
  WallSpatialIndex.prototype._cellKey = function(cx, cy) {
    return cx + "," + cy;
  };

  /**
   * Convert world coordinate to cell index.
   */
  WallSpatialIndex.prototype._toCell = function(coord) {
    return Math.floor(coord / this.cellSize);
  };

  /**
   * Add a wall to the index. Walls spanning multiple cells are added to each cell.
   */
  WallSpatialIndex.prototype._addWall = function(wall) {
    if (!wall) return;
    var x1 = parseFloat(wall.x1);
    var y1 = parseFloat(wall.y1);
    var x2 = parseFloat(wall.x2);
    var y2 = parseFloat(wall.y2);
    if (!Number.isFinite(x1) || !Number.isFinite(y1) ||
        !Number.isFinite(x2) || !Number.isFinite(y2)) {
      return;
    }

    // Compute bounding box cells
    var minCX = this._toCell(Math.min(x1, x2));
    var maxCX = this._toCell(Math.max(x1, x2));
    var minCY = this._toCell(Math.min(y1, y2));
    var maxCY = this._toCell(Math.max(y1, y2));

    // Add wall reference to each cell it touches
    for (var cx = minCX; cx <= maxCX; cx++) {
      for (var cy = minCY; cy <= maxCY; cy++) {
        var key = this._cellKey(cx, cy);
        var cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(wall);
      }
    }
  };

  /**
   * Rebuild the entire index from a new set of walls.
   * Call this when walls are added, removed, or modified.
   */
  WallSpatialIndex.prototype.rebuild = function(walls) {
    this.cells.clear();
    this._wallCount = walls ? walls.length : 0;
    this._wallsHash = computeWallsHash(walls);

    if (!walls || walls.length === 0) return;

    for (var i = 0; i < walls.length; i++) {
      this._addWall(walls[i]);
    }
  };

  /**
   * Get the current walls hash (for cache invalidation checks).
   */
  WallSpatialIndex.prototype.getHash = function() {
    return this._wallsHash;
  };

  /**
   * Get the wall count.
   */
  WallSpatialIndex.prototype.getWallCount = function() {
    return this._wallCount;
  };

  /**
   * Query all walls that might intersect a circle.
   * Returns a deduplicated array of wall objects.
   * @param {number} cx - Circle center X
   * @param {number} cy - Circle center Y
   * @param {number} radius - Circle radius
   * @returns {Array} Walls that might intersect the circle
   */
  WallSpatialIndex.prototype.queryCircle = function(cx, cy, radius) {
    var minCX = this._toCell(cx - radius);
    var maxCX = this._toCell(cx + radius);
    var minCY = this._toCell(cy - radius);
    var maxCY = this._toCell(cy + radius);

    var seen = new Set();
    var result = [];

    for (var cellX = minCX; cellX <= maxCX; cellX++) {
      for (var cellY = minCY; cellY <= maxCY; cellY++) {
        var key = this._cellKey(cellX, cellY);
        var cell = this.cells.get(key);
        if (!cell) continue;
        for (var i = 0; i < cell.length; i++) {
          var wall = cell[i];
          // Use wall reference or id for deduplication
          var wallKey = wall.id || wall;
          if (!seen.has(wallKey)) {
            seen.add(wallKey);
            result.push(wall);
          }
        }
      }
    }

    return result;
  };

  /**
   * Query all walls that might intersect a rectangle.
   * @param {number} minX - Rectangle min X
   * @param {number} minY - Rectangle min Y
   * @param {number} maxX - Rectangle max X
   * @param {number} maxY - Rectangle max Y
   * @returns {Array} Walls that might intersect the rectangle
   */
  WallSpatialIndex.prototype.queryRect = function(minX, minY, maxX, maxY) {
    var minCX = this._toCell(minX);
    var maxCX = this._toCell(maxX);
    var minCY = this._toCell(minY);
    var maxCY = this._toCell(maxY);

    var seen = new Set();
    var result = [];

    for (var cellX = minCX; cellX <= maxCX; cellX++) {
      for (var cellY = minCY; cellY <= maxCY; cellY++) {
        var key = this._cellKey(cellX, cellY);
        var cell = this.cells.get(key);
        if (!cell) continue;
        for (var i = 0; i < cell.length; i++) {
          var wall = cell[i];
          var wallKey = wall.id || wall;
          if (!seen.has(wallKey)) {
            seen.add(wallKey);
            result.push(wall);
          }
        }
      }
    }

    return result;
  };

  /**
   * Check if the index needs rebuilding based on a new walls array.
   * @param {Array} walls - New walls array to compare
   * @returns {boolean} True if rebuild is needed
   */
  WallSpatialIndex.prototype.needsRebuild = function(walls) {
    var newCount = walls ? walls.length : 0;
    if (newCount !== this._wallCount) return true;
    var newHash = computeWallsHash(walls);
    return newHash !== this._wallsHash;
  };

  /**
   * Compute a simple hash of walls array for change detection.
   * Uses wall count + first/last wall positions as a fast fingerprint.
   */
  function computeWallsHash(walls) {
    if (!walls || walls.length === 0) return "0";
    var hash = walls.length + ":";

    // Sample first, middle, and last walls for fingerprint
    var indices = [0, Math.floor(walls.length / 2), walls.length - 1];
    for (var i = 0; i < indices.length; i++) {
      var w = walls[indices[i]];
      if (w) {
        hash += (w.x1 || 0).toFixed(2) + "," + (w.y1 || 0).toFixed(2) + "," +
                (w.x2 || 0).toFixed(2) + "," + (w.y2 || 0).toFixed(2) + "," +
                (w.doorOpen ? 1 : 0) + ";";
      }
    }
    return hash;
  }

  // Export
  global.WallSpatialIndex = WallSpatialIndex;

})(window);
