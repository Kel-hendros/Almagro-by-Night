// Wall Snapping System
// Unified snapping for wall drawing and editing.
(function initWallSnappingModule(global) {
  "use strict";

  var STORAGE_KEY = "abn-wall-snap-settings";
  var SNAP_RADIUS_ENDPOINT = 0.45;  // units
  var SNAP_RADIUS_ALIGNMENT = 0.3;  // units
  var SNAP_ANGLES = [0, 15, 30, 45, 60, 75, 90, 105, 120, 135, 150, 165, 180, 195, 210, 225, 240, 255, 270, 285, 300, 315, 330, 345];
  var SNAP_LENGTHS = [0.5, 1, 1.5, 2, 2.5, 3, 4, 5]; // in meters
  var METERS_PER_UNIT = 1.5;

  /**
   * Load snap settings from localStorage.
   */
  function loadSettings() {
    try {
      var stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      // Ignore parse errors
    }
    return {
      endpoint: true,
      angle: false,
      length: false,
      alignment: false,
    };
  }

  /**
   * Save snap settings to localStorage.
   */
  function saveSettings(settings) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
    } catch (e) {
      // Ignore storage errors
    }
  }

  /**
   * Create a wall snapping instance.
   * @param {Object} opts
   * @param {Function} opts.getVertexRegistry - returns vertex registry instance
   * @param {Function} opts.getWalls - returns walls array
   */
  function createWallSnapping(opts) {
    var getVertexRegistry = opts.getVertexRegistry;
    var getWalls = opts.getWalls;

    var settings = loadSettings();

    // ── Settings Management ──

    function getSettings() {
      return { ...settings };
    }

    function setSetting(key, value) {
      settings[key] = !!value;
      saveSettings(settings);
    }

    function isEnabled(key) {
      return !!settings[key];
    }

    // ── Endpoint Snap ──

    /**
     * Snap to existing wall endpoints.
     * Returns { x, y, snapped: true } or null.
     */
    function snapToEndpoint(cellX, cellY) {
      if (!settings.endpoint) return null;

      var registry = getVertexRegistry?.();
      if (!registry) return null;

      var vertex = registry.findVertex(cellX, cellY, SNAP_RADIUS_ENDPOINT);
      if (vertex) {
        return { x: vertex.x, y: vertex.y, snapped: true, type: "endpoint" };
      }
      return null;
    }

    // ── Angle Snap ──

    /**
     * Snap cursor to fixed angles relative to origin point.
     * Returns { x, y, angle, snapped: true } or null.
     */
    function snapToAngle(cellX, cellY, originX, originY, angleThreshold) {
      if (!settings.angle || originX == null || originY == null) return null;

      var dx = cellX - originX;
      var dy = cellY - originY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < 0.1) return null;

      var currentAngle = Math.atan2(dy, dx) * (180 / Math.PI);
      if (currentAngle < 0) currentAngle += 360;

      var threshold = angleThreshold || 8;
      var snapAngle = null;

      for (var i = 0; i < SNAP_ANGLES.length; i++) {
        var diff = Math.abs(currentAngle - SNAP_ANGLES[i]);
        if (diff > 180) diff = 360 - diff;
        if (diff <= threshold) {
          snapAngle = SNAP_ANGLES[i];
          break;
        }
      }

      if (snapAngle !== null) {
        var radians = snapAngle * (Math.PI / 180);
        return {
          x: originX + Math.cos(radians) * dist,
          y: originY + Math.sin(radians) * dist,
          angle: snapAngle,
          snapped: true,
          type: "angle",
        };
      }

      return null;
    }

    // ── Length Snap ──

    /**
     * Snap to fixed segment lengths.
     * Returns { x, y, length, snapped: true } or null.
     */
    function snapToLength(cellX, cellY, originX, originY, lengthThreshold) {
      if (!settings.length || originX == null || originY == null) return null;

      var dx = cellX - originX;
      var dy = cellY - originY;
      var dist = Math.sqrt(dx * dx + dy * dy);
      var distMeters = dist * METERS_PER_UNIT;

      var threshold = lengthThreshold || 0.15; // meters
      var snapLength = null;

      for (var i = 0; i < SNAP_LENGTHS.length; i++) {
        if (Math.abs(distMeters - SNAP_LENGTHS[i]) <= threshold) {
          snapLength = SNAP_LENGTHS[i];
          break;
        }
      }

      if (snapLength !== null) {
        var targetDist = snapLength / METERS_PER_UNIT;
        var angle = Math.atan2(dy, dx);
        return {
          x: originX + Math.cos(angle) * targetDist,
          y: originY + Math.sin(angle) * targetDist,
          length: snapLength,
          snapped: true,
          type: "length",
        };
      }

      return null;
    }

    // ── Alignment Snap ──

    /**
     * Snap to horizontal/vertical alignment with other vertices.
     * Returns { x, y, guides: [...], snapped: true } or null.
     */
    function snapToAlignment(cellX, cellY, excludeKeys) {
      if (!settings.alignment) return null;

      var registry = getVertexRegistry?.();
      if (!registry) return null;

      var vertices = registry.getAllVertices();
      var excludeSet = {};
      if (excludeKeys) {
        for (var e = 0; e < excludeKeys.length; e++) {
          excludeSet[excludeKeys[e]] = true;
        }
      }

      var snapX = null;
      var snapY = null;
      var guides = [];
      var bestDistX = SNAP_RADIUS_ALIGNMENT;
      var bestDistY = SNAP_RADIUS_ALIGNMENT;

      for (var i = 0; i < vertices.length; i++) {
        var v = vertices[i];
        if (excludeSet[v.key]) continue;

        // Horizontal alignment (same Y)
        var dy = Math.abs(cellY - v.y);
        if (dy < bestDistY) {
          bestDistY = dy;
          snapY = v.y;
          guides = guides.filter(function (g) { return g.axis !== "h"; });
          guides.push({ axis: "h", y: v.y, refX: v.x });
        }

        // Vertical alignment (same X)
        var dx = Math.abs(cellX - v.x);
        if (dx < bestDistX) {
          bestDistX = dx;
          snapX = v.x;
          guides = guides.filter(function (g) { return g.axis !== "v"; });
          guides.push({ axis: "v", x: v.x, refY: v.y });
        }
      }

      if (snapX !== null || snapY !== null) {
        return {
          x: snapX !== null ? snapX : cellX,
          y: snapY !== null ? snapY : cellY,
          guides: guides,
          snapped: true,
          type: "alignment",
        };
      }

      return null;
    }

    // ── Combined Snap ──

    /**
     * Apply all enabled snaps in priority order.
     * Returns { x, y, snapped, type, [extra info] } or { x: cellX, y: cellY, snapped: false }.
     */
    function snap(cellX, cellY, opts) {
      opts = opts || {};
      var originX = opts.originX;
      var originY = opts.originY;
      var excludeKeys = opts.excludeKeys;
      var forceAngle = opts.forceAngle; // Shift key
      var forceLength = opts.forceLength; // Ctrl key
      var forceAlignment = opts.forceAlignment; // Alt key

      // Build guides for rendering
      var guides = [];

      // Priority 1: Endpoint snap (always highest priority)
      var endpointSnap = snapToEndpoint(cellX, cellY);
      if (endpointSnap) {
        return endpointSnap;
      }

      // Priority 2: Angle snap (if enabled or forced)
      if ((settings.angle || forceAngle) && originX != null && originY != null) {
        var savedAngle = settings.angle;
        settings.angle = true;
        var angleSnap = snapToAngle(cellX, cellY, originX, originY);
        settings.angle = savedAngle;
        if (angleSnap) {
          cellX = angleSnap.x;
          cellY = angleSnap.y;
        }
      }

      // Priority 3: Length snap (if enabled or forced)
      if ((settings.length || forceLength) && originX != null && originY != null) {
        var savedLength = settings.length;
        settings.length = true;
        var lengthSnap = snapToLength(cellX, cellY, originX, originY);
        settings.length = savedLength;
        if (lengthSnap) {
          return lengthSnap;
        }
      }

      // Priority 4: Alignment snap (if enabled or forced)
      if (settings.alignment || forceAlignment) {
        var savedAlign = settings.alignment;
        settings.alignment = true;
        var alignSnap = snapToAlignment(cellX, cellY, excludeKeys);
        settings.alignment = savedAlign;
        if (alignSnap) {
          // Build guide lines for rendering
          for (var g = 0; g < alignSnap.guides.length; g++) {
            var guide = alignSnap.guides[g];
            if (guide.axis === "h") {
              guides.push({ x1: -1000, y1: guide.y, x2: 1000, y2: guide.y });
            } else if (guide.axis === "v") {
              guides.push({ x1: guide.x, y1: -1000, x2: guide.x, y2: 1000 });
            }
          }
          return {
            x: alignSnap.x,
            y: alignSnap.y,
            guides: guides,
            snapped: true,
            type: "alignment",
          };
        }
      }

      return { x: cellX, y: cellY, snapped: false };
    }

    /**
     * Get nearby snap points for visual indicators.
     */
    function getNearbySnapPoints(cellX, cellY, radius) {
      var registry = getVertexRegistry?.();
      if (!registry) return [];
      return registry.getVerticesNear(cellX, cellY, radius || 3);
    }

    return {
      // Settings
      getSettings: getSettings,
      setSetting: setSetting,
      isEnabled: isEnabled,
      loadSettings: function () { settings = loadSettings(); return settings; },

      // Individual snaps
      snapToEndpoint: snapToEndpoint,
      snapToAngle: snapToAngle,
      snapToLength: snapToLength,
      snapToAlignment: snapToAlignment,

      // Combined snap
      snap: snap,

      // Visual helpers
      getNearbySnapPoints: getNearbySnapPoints,

      // Constants
      SNAP_ANGLES: SNAP_ANGLES,
      SNAP_LENGTHS: SNAP_LENGTHS,
      METERS_PER_UNIT: METERS_PER_UNIT,
    };
  }

  global.WallSnapping = {
    createWallSnapping: createWallSnapping,
    loadSettings: loadSettings,
    saveSettings: saveSettings,
  };
})(window);
