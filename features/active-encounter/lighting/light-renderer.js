// Light & Switch indicator rendering for TacticalMap.
// Draws light dots, switch icons, selection rings, and connection lines.
// The actual lighting/darkness overlay is handled by fog-renderer.js.
(function applyLightRenderer(global) {
  "use strict";

  var SWITCH_PROXIMITY_METERS = 4.5;
  var SWITCH_PROXIMITY = SWITCH_PROXIMITY_METERS / 1.5; // convert meters to coordinate units
  var TOKEN_PROXIMITY_REVEAL_DISTANCE = 1;
  var WALL_MARKER_VISIBILITY_OFFSET = 0.32;

  // Interactive marker constants
  var INTERACTIVE_BORDER_COLOR = "rgba(100, 200, 255, 0.85)";
  var INTERACTIVE_BG_COLOR = "rgba(10, 10, 10, 0.9)";
  var INTERACTIVE_MARKER_RADIUS = 12;
  var MARKER_EMOJIS = { door: "\u{1F6AA}", window: "\u{1FA9F}", light: "\u{1F4A1}", switch: "\u{1F39A}\uFE0F" };
  var DOOR_MARKER_IMAGES = {
    open: createMarkerImage("images/svgs/door-open.svg"),
    closed: createMarkerImage("images/svgs/door-closed.svg"),
  };
  var LUMINOSITY_THRESHOLD = 0.30;
  var LIGHT_MASK_BLUR_RADIUS = 3; // Reduced for performance
  var DEFAULT_VIEWER_VISION_PROFILE = {
    visibilityThreshold: LUMINOSITY_THRESHOLD,
    luminosityMultiplier: 1,
    luminosityOffset: 0,
    proximityRevealEnabled: true,
    proximityRevealDistance: TOKEN_PROXIMITY_REVEAL_DISTANCE,
  };

  function drawInteractiveMarker(ctx, x, y, emoji, scale, isSelected) {
    var r = INTERACTIVE_MARKER_RADIUS / scale;
    ctx.save();

    // Background circle
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = INTERACTIVE_BG_COLOR;
    ctx.fill();

    // Border
    ctx.strokeStyle = INTERACTIVE_BORDER_COLOR;
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();

    // Emoji centered
    ctx.font = Math.round(14 / scale) + "px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(emoji, x, y + 1 / scale);

    ctx.restore();

    // Selection ring (dashed cyan)
    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = INTERACTIVE_BORDER_COLOR;
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function createMarkerImage(src) {
    if (typeof Image === "undefined") return null;
    var img = new Image();
    img.src = src;
    return img;
  }

  function drawInteractiveImageMarker(ctx, x, y, img, scale, isSelected) {
    var r = INTERACTIVE_MARKER_RADIUS / scale;
    ctx.save();

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = INTERACTIVE_BG_COLOR;
    ctx.fill();

    ctx.strokeStyle = INTERACTIVE_BORDER_COLOR;
    ctx.lineWidth = 1.5 / scale;
    ctx.stroke();

    if (img && img.complete && img.naturalWidth > 0) {
      var size = r * 1.8;
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    }

    ctx.restore();

    if (isSelected) {
      ctx.save();
      ctx.strokeStyle = INTERACTIVE_BORDER_COLOR;
      ctx.lineWidth = 2 / scale;
      ctx.setLineDash([4 / scale, 3 / scale]);
      ctx.beginPath();
      ctx.arc(x, y, r + 4 / scale, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.restore();
    }
  }

  function hexToRgb(hex) {
    var result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
      r: parseInt(result[1], 16),
      g: parseInt(result[2], 16),
      b: parseInt(result[3], 16),
    } : { r: 255, g: 200, b: 100 };
  }

  function clamp01(value) {
    var n = parseFloat(value);
    if (!Number.isFinite(n)) return 0;
    return Math.min(1, Math.max(0, n));
  }

  function getLightTintStrength(light) {
    var tint = clamp01(light && light.tintStrength != null ? light.tintStrength : 0.35);
    return Math.max(0.1, tint);
  }

  function getAmbientTintStrength(ambient) {
    return clamp01(ambient && ambient.tintStrength != null ? ambient.tintStrength : 0.35);
  }

  function normalizeVisionProfile(source) {
    var profile = source && typeof source === "object" ? source : {};
    return {
      visibilityThreshold: clamp01(
        profile.visibilityThreshold != null
          ? profile.visibilityThreshold
          : DEFAULT_VIEWER_VISION_PROFILE.visibilityThreshold
      ),
      luminosityMultiplier: Math.max(
        0,
        Number.isFinite(parseFloat(profile.luminosityMultiplier))
          ? parseFloat(profile.luminosityMultiplier)
          : DEFAULT_VIEWER_VISION_PROFILE.luminosityMultiplier
      ),
      luminosityOffset: clamp01(
        profile.luminosityOffset != null
          ? profile.luminosityOffset
          : DEFAULT_VIEWER_VISION_PROFILE.luminosityOffset
      ),
      proximityRevealEnabled:
        profile.proximityRevealEnabled != null
          ? !!profile.proximityRevealEnabled
          : DEFAULT_VIEWER_VISION_PROFILE.proximityRevealEnabled,
      proximityRevealDistance: Math.max(
        0,
        Number.isFinite(parseFloat(profile.proximityRevealDistance))
          ? parseFloat(profile.proximityRevealDistance)
          : DEFAULT_VIEWER_VISION_PROFILE.proximityRevealDistance
      ),
    };
  }

  function applyVisionProfileToLuminosity(luminosity, profile) {
    var normalized = normalizeVisionProfile(profile);
    return clamp01(
      clamp01(luminosity) * normalized.luminosityMultiplier + normalized.luminosityOffset
    );
  }

  function appendAreasPath(ctx, areas, gs, offX, offY) {
    if (!Array.isArray(areas)) return;
    for (var i = 0; i < areas.length; i++) {
      var area = areas[i];
      if (Array.isArray(area) && area.length >= 3) {
        ctx.beginPath();
        ctx.moveTo(area[0].x * gs + offX, area[0].y * gs + offY);
        for (var j = 1; j < area.length; j++) {
          ctx.lineTo(area[j].x * gs + offX, area[j].y * gs + offY);
        }
        ctx.closePath();
        ctx.fill();
      } else if (area && area.type === "rect") {
        ctx.fillRect(area.x * gs + offX, area.y * gs + offY, area.width * gs, area.height * gs);
      }
    }
  }

  function getProfileKey(profile) {
    var normalized = normalizeVisionProfile(profile);
    return [
      normalized.visibilityThreshold,
      normalized.luminosityMultiplier,
      normalized.luminosityOffset,
      normalized.proximityRevealEnabled ? 1 : 0,
      normalized.proximityRevealDistance,
    ].join("|");
  }

  function getLightingViewKey(map) {
    var fog = map && map._fog;
    if (!fog) return "no-fog";
    var viewerIds = Array.isArray(fog.viewerInstanceIds)
      ? fog.viewerInstanceIds.slice().sort().join(",")
      : "";
    return [
      fog.isNarrator ? "narrator" : "player",
      fog.impersonateInstanceId || "",
      viewerIds,
    ].join("|");
  }

  function apply(TacticalMap) {
    var proto = TacticalMap.prototype;

    proto.initLighting = function () {
      this._lighting = {
        dirty: true,
        cacheGen: 0,
        overlayCanvas: null,
        overlayCtx: null,
        maskCanvas: null,
        maskCtx: null,
        overlayFogGen: -1,
        overlayBoundsKey: "",
        overlayProfileKey: "",
        overlayViewKey: "",
        // Per-light polygon cache: Map<lightId, {poly, x, y, radius, intensity, wallsHash}>
        perLightCache: new Map(),
        // Hash of walls for invalidation detection
        wallsHash: null,
      };
    };

    proto.invalidateLighting = function () {
      if (!this._lighting) this.initLighting();
      this._lighting.dirty = true;
      this._lighting.cacheGen = (this._lighting.cacheGen || 0) + 1;
      this._lighting._lastFullRender = 0;
      this._drawDirty = true;
    };

    /**
     * Invalidate cache for a specific light (e.g., when dragging).
     * More efficient than full invalidation when only one light moved.
     */
    proto.invalidateLightingForLight = function (lightId) {
      if (!this._lighting) this.initLighting();
      if (this._lighting.perLightCache && lightId) {
        this._lighting.perLightCache.delete(lightId);
      }
      this._lighting.dirty = true;
      this._lighting._lastFullRender = 0;
      this._drawDirty = true;
    };

    /**
     * Invalidate lighting due to wall changes (doors opening, walls added/removed).
     * Clears the walls hash to force recalculation of all light polygons.
     */
    proto.invalidateLightingWalls = function () {
      if (!this._lighting) this.initLighting();
      this._lighting.wallsHash = null;
      this._lighting.dirty = true;
      this._lighting._lastFullRender = 0;
      this._drawDirty = true;
      // Mark enclosed polygons for lazy recomputation (not sync to avoid loops)
      this._enclosedPolygonsStale = true;
    };

    /**
     * Find closed loops of walls and convert them to polygons.
     * Uses connected component caching - only recomputes components that changed.
     */
    proto._recomputeEnclosedPolygons = function () {
      // Prevent reentry
      if (this._isComputingPolygons) return;

      // Debounce: don't recompute more than once per 250ms
      var now = Date.now();
      if (this._lastEnclosedPolygonCompute && (now - this._lastEnclosedPolygonCompute) < 250) {
        return;
      }

      this._isComputingPolygons = true;
      this._lastEnclosedPolygonCompute = now;

      try {
        var walls = this.walls || [];
        if (walls.length < 3) {
          this._enclosedPolygons = null;
          this._enclosedPolygonCache = null;
          return;
        }

        var EPSILON = 0.15;

        // Initialize cache if needed
        if (!this._enclosedPolygonCache) {
          this._enclosedPolygonCache = new Map(); // componentHash -> polygons[]
        }

        // Step 1: Build adjacency and find connected components
        var endpoints = [];
        var wallToEndpoints = []; // wallIdx -> [ep1, ep2]

        function findOrCreateEndpoint(x, y) {
          for (var i = 0; i < endpoints.length; i++) {
            var ep = endpoints[i];
            if (Math.abs(ep.x - x) < EPSILON && Math.abs(ep.y - y) < EPSILON) {
              return ep;
            }
          }
          var newEp = { x: x, y: y, walls: [], componentId: -1 };
          endpoints.push(newEp);
          return newEp;
        }

        // Register all wall endpoints
        for (var wi = 0; wi < walls.length; wi++) {
          var wall = walls[wi];
          var x1 = parseFloat(wall.x1), y1 = parseFloat(wall.y1);
          var x2 = parseFloat(wall.x2), y2 = parseFloat(wall.y2);
          if (!Number.isFinite(x1) || !Number.isFinite(y1) || !Number.isFinite(x2) || !Number.isFinite(y2)) {
            wallToEndpoints.push(null);
            continue;
          }

          var ep1 = findOrCreateEndpoint(x1, y1);
          var ep2 = findOrCreateEndpoint(x2, y2);
          ep1.walls.push({ wallIdx: wi, otherEp: ep2 });
          ep2.walls.push({ wallIdx: wi, otherEp: ep1 });
          wallToEndpoints.push([ep1, ep2]);
        }

        // Step 2: Find connected components using flood fill
        var componentId = 0;
        var components = []; // Array of {endpoints: [], wallIndices: [], hash: ""}

        for (var epIdx = 0; epIdx < endpoints.length; epIdx++) {
          var ep = endpoints[epIdx];
          if (ep.componentId >= 0) continue; // Already assigned

          // BFS to find all connected endpoints
          var compEndpoints = [];
          var compWallIndices = new Set();
          var queue = [ep];
          ep.componentId = componentId;

          while (queue.length > 0) {
            var current = queue.shift();
            compEndpoints.push(current);

            for (var wi2 = 0; wi2 < current.walls.length; wi2++) {
              var edge = current.walls[wi2];
              compWallIndices.add(edge.wallIdx);
              if (edge.otherEp.componentId < 0) {
                edge.otherEp.componentId = componentId;
                queue.push(edge.otherEp);
              }
            }
          }

          // Compute hash for this component (based on wall coordinates)
          var wallIndicesArr = Array.from(compWallIndices).sort(function(a,b) { return a - b; });
          var hashParts = [];
          for (var hi = 0; hi < wallIndicesArr.length; hi++) {
            var w = walls[wallIndicesArr[hi]];
            hashParts.push(w.x1.toFixed(2) + "," + w.y1.toFixed(2) + "-" + w.x2.toFixed(2) + "," + w.y2.toFixed(2));
          }
          var compHash = hashParts.join("|");

          components.push({
            id: componentId,
            endpoints: compEndpoints,
            wallIndices: wallIndicesArr,
            hash: compHash
          });
          componentId++;
        }

        // Step 3: For each component, use cache or recompute
        var allPolygons = [];
        var newCache = new Map();

        for (var ci = 0; ci < components.length; ci++) {
          var comp = components[ci];

          // Check cache
          if (this._enclosedPolygonCache.has(comp.hash)) {
            var cachedPolys = this._enclosedPolygonCache.get(comp.hash);
            for (var cpi = 0; cpi < cachedPolys.length; cpi++) {
              allPolygons.push(cachedPolys[cpi]);
            }
            newCache.set(comp.hash, cachedPolys);
            continue;
          }

          // Recompute polygons for this component
          var compPolygons = this._findPolygonsInComponent(comp.endpoints, walls);
          for (var pi = 0; pi < compPolygons.length; pi++) {
            allPolygons.push(compPolygons[pi]);
          }
          newCache.set(comp.hash, compPolygons);
        }

        this._enclosedPolygonCache = newCache;
        // Store polygons with pre-computed bounding boxes for fast rejection
        if (allPolygons.length > 0) {
          this._enclosedPolygons = allPolygons.map(function(poly) {
            var minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
            for (var i = 0; i < poly.length; i++) {
              if (poly[i].x < minX) minX = poly[i].x;
              if (poly[i].y < minY) minY = poly[i].y;
              if (poly[i].x > maxX) maxX = poly[i].x;
              if (poly[i].y > maxY) maxY = poly[i].y;
            }
            return { points: poly, minX: minX, minY: minY, maxX: maxX, maxY: maxY };
          });
        } else {
          this._enclosedPolygons = null;
        }
      } finally {
        this._isComputingPolygons = false;
      }
    };

    /**
     * Find closed polygon loops within a connected component of endpoints.
     */
    proto._findPolygonsInComponent = function (endpoints, walls) {
      var usedWalls = new Set();
      var polygons = [];

      for (var startEpIdx = 0; startEpIdx < endpoints.length; startEpIdx++) {
        var startEp = endpoints[startEpIdx];

        for (var startEdgeIdx = 0; startEdgeIdx < startEp.walls.length; startEdgeIdx++) {
          var startEdge = startEp.walls[startEdgeIdx];
          var startKey = startEdge.wallIdx + "_" + startEpIdx;
          if (usedWalls.has(startKey)) continue;

          // Trace a closed loop using rightmost turn rule
          var poly = [{ x: startEp.x, y: startEp.y }];
          var currentEp = startEdge.otherEp;
          var prevEp = startEp;
          var pathWalls = [startKey];
          var maxSteps = walls.length + 1;
          var steps = 0;

          while (currentEp !== startEp && steps < maxSteps) {
            steps++;
            poly.push({ x: currentEp.x, y: currentEp.y });

            var incomingAngle = Math.atan2(currentEp.y - prevEp.y, currentEp.x - prevEp.x);
            var bestEdge = null;
            var bestAngle = Infinity;

            for (var ei = 0; ei < currentEp.walls.length; ei++) {
              var edge = currentEp.walls[ei];
              if (edge.otherEp === prevEp) continue;

              var outAngle = Math.atan2(edge.otherEp.y - currentEp.y, edge.otherEp.x - currentEp.x);
              var turnAngle = outAngle - incomingAngle;
              while (turnAngle > Math.PI) turnAngle -= 2 * Math.PI;
              while (turnAngle < -Math.PI) turnAngle += 2 * Math.PI;

              if (turnAngle < bestAngle) {
                bestAngle = turnAngle;
                bestEdge = edge;
              }
            }

            if (!bestEdge) break;

            var edgeKey = bestEdge.wallIdx + "_" + endpoints.indexOf(currentEp);
            pathWalls.push(edgeKey);
            prevEp = currentEp;
            currentEp = bestEdge.otherEp;
          }

          if (currentEp === startEp && poly.length >= 3) {
            for (var pk = 0; pk < pathWalls.length; pk++) {
              usedWalls.add(pathWalls[pk]);
            }
            polygons.push(poly);
          }
        }
      }

      return polygons;
    };

    proto.getViewerInstances = function () {
      var fog = this._fog;
      var instances = this.instances || [];
      if (!fog) {
        return instances.filter(function (inst) { return !!inst && !!inst.isPC; });
      }

      if (fog.impersonateInstanceId && fog.impersonateInstanceId !== "all") {
        return instances.filter(function (inst) { return inst && inst.id === fog.impersonateInstanceId; });
      }

      if (Array.isArray(fog.viewerInstanceIds) && fog.viewerInstanceIds.length > 0) {
        var viewerIdSet = new Set(fog.viewerInstanceIds);
        return instances.filter(function (inst) { return inst && viewerIdSet.has(inst.id); });
      }

      return instances.filter(function (inst) { return !!inst && !!inst.isPC; });
    };

    proto.getViewerVisionProfile = function (instanceId) {
      var instances = this.instances || [];
      var instance = null;
      for (var i = 0; i < instances.length; i++) {
        if (instances[i] && instances[i].id === instanceId) {
          instance = instances[i];
          break;
        }
      }
      var effectsProfile =
        instance &&
        instance.effects &&
        typeof instance.effects.viewerVisionProfile === "object"
          ? instance.effects.viewerVisionProfile
          : null;
      var directProfile =
        instance && instance.visionProfile && typeof instance.visionProfile === "object"
          ? instance.visionProfile
          : null;
      return normalizeVisionProfile(directProfile || effectsProfile || DEFAULT_VIEWER_VISION_PROFILE);
    };

    proto.getActiveViewerVisionProfiles = function () {
      var viewers = this.getViewerInstances();
      if (!viewers.length) return [normalizeVisionProfile(DEFAULT_VIEWER_VISION_PROFILE)];
      var profiles = [];
      for (var i = 0; i < viewers.length; i++) {
        profiles.push(this.getViewerVisionProfile(viewers[i].id));
      }
      return profiles;
    };

    proto.getActiveViewerVisionAggregateProfile = function () {
      var profiles = this.getActiveViewerVisionProfiles();
      var aggregate = normalizeVisionProfile(DEFAULT_VIEWER_VISION_PROFILE);
      for (var i = 0; i < profiles.length; i++) {
        var profile = profiles[i];
        aggregate.visibilityThreshold = Math.min(aggregate.visibilityThreshold, profile.visibilityThreshold);
        aggregate.luminosityMultiplier = Math.max(aggregate.luminosityMultiplier, profile.luminosityMultiplier);
        aggregate.luminosityOffset = Math.max(aggregate.luminosityOffset, profile.luminosityOffset);
        aggregate.proximityRevealEnabled =
          aggregate.proximityRevealEnabled || profile.proximityRevealEnabled;
        aggregate.proximityRevealDistance = Math.max(
          aggregate.proximityRevealDistance,
          profile.proximityRevealDistance
        );
      }
      return aggregate;
    };

    proto.getViewerTokenCenters = function () {
      var viewers = this.getViewerInstances();
      var tokens = this.tokens || [];
      var centers = [];
      for (var i = 0; i < viewers.length; i++) {
        var viewer = viewers[i];
        var profile = this.getViewerVisionProfile(viewer.id);
        for (var j = 0; j < tokens.length; j++) {
          var token = tokens[j];
          if (!token || token.instanceId !== viewer.id) continue;
          var size = parseFloat(token.size) || 1;
          centers.push({
            instanceId: viewer.id,
            cx: (parseFloat(token.x) || 0) + size * 0.5,
            cy: (parseFloat(token.y) || 0) + size * 0.5,
            profile: profile,
          });
        }
      }
      return centers;
    };

    proto.canRevealByProximity = function (x, y, viewerTokenCenters) {
      var centers = Array.isArray(viewerTokenCenters) ? viewerTokenCenters : this.getViewerTokenCenters();
      for (var i = 0; i < centers.length; i++) {
        var center = centers[i];
        if (!center.profile || !center.profile.proximityRevealEnabled) continue;
        var distance = center.profile.proximityRevealDistance || TOKEN_PROXIMITY_REVEAL_DISTANCE;
        var dx = x - center.cx;
        var dy = y - center.cy;
        if (dx * dx + dy * dy <= distance * distance) return true;
      }
      return false;
    };

    proto.getPerceivedLuminosityAt = function (x, y, instanceId, rawLuminosity) {
      var raw =
        rawLuminosity != null
          ? rawLuminosity
          : (typeof this.computeLuminosityAt === "function" ? this.computeLuminosityAt(x, y) : 1);
      if (instanceId) {
        return applyVisionProfileToLuminosity(raw, this.getViewerVisionProfile(instanceId));
      }
      var profiles = this.getActiveViewerVisionProfiles();
      var best = 0;
      for (var i = 0; i < profiles.length; i++) {
        best = Math.max(best, applyVisionProfileToLuminosity(raw, profiles[i]));
      }
      return best;
    };

    proto.isPointVisibleByLight = function (x, y, options) {
      var opts = options || {};
      var fog = this._fog;
      var isNarratorView = fog && fog.isNarrator && !fog.impersonateInstanceId;
      if (isNarratorView) return true;

      var hasLighting = (this.lights && this.lights.length > 0) ||
        (this._ambientLight && this._ambientLight.intensity < 1);
      if (!hasLighting) return true;

      var perceived = this.getPerceivedLuminosityAt(x, y, opts.viewerInstanceId, opts.rawLuminosity);
      var threshold = opts.visibilityThreshold;
      if (!Number.isFinite(threshold)) {
        threshold = this.getActiveViewerVisionAggregateProfile().visibilityThreshold;
      }
      if (perceived + 1e-6 >= threshold) return true;

      if (opts.allowProximity) {
        return this.canRevealByProximity(x, y, opts.viewerTokenCenters);
      }
      return false;
    };

    proto.drawLightingOverlay = function () {
      var ambient = this._ambientLight || { intensity: 1, color: "#8090b0" };
      var hasAmbient = ambient && ambient.intensity < 1;
      var hasLights = this.lights && this.lights.length > 0;
      if (!hasAmbient && !hasLights) {
        this._cachedLightPolygons = [];
        return;
      }
      if (!this._lighting) this.initLighting();

      var lighting = this._lighting;

      // Throttle full recalculation to max 10 times per second when dirty
      var now = Date.now();
      var LIGHTING_THROTTLE_MS = 100;
      if (lighting.dirty) {
        if (lighting._lastFullRender && (now - lighting._lastFullRender) < LIGHTING_THROTTLE_MS) {
          // Skip recalc but still draw cached overlay if available
          if (lighting.overlayCanvas) {
            var bounds = typeof this.getOverlayBounds === "function" ? this.getOverlayBounds() : null;
            if (bounds) {
              this.drawWorldCanvasVisible?.(
                lighting.overlayCanvas,
                bounds.minX * this.gridSize,
                bounds.minY * this.gridSize,
              );
            }
          }
          // Keep the map draw loop alive for one more frame so the throttled
          // lighting rebuild actually happens once the cooldown expires.
          this._drawDirty = true;
          return;
        }
        lighting._lastFullRender = now;
        this._cachedLightPolygons = buildLightPolygonCache(this);
      }

      var bounds = typeof this.getOverlayBounds === "function" ? this.getOverlayBounds() : null;
      if (!bounds) return;
      var fogGen = this._fog ? (this._fog._cacheGen || 0) : 0;
      var boundsKey = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(":");
      var profile = this.getActiveViewerVisionAggregateProfile();
      var profileKey = getProfileKey(profile);
      var viewKey = getLightingViewKey(this);

      if (
        lighting.dirty ||
        lighting.overlayFogGen !== fogGen ||
        lighting.overlayBoundsKey !== boundsKey ||
        lighting.overlayProfileKey !== profileKey ||
        lighting.overlayViewKey !== viewKey
      ) {
        renderLightingOverlay(this, lighting, bounds, profile);
        lighting.overlayFogGen = fogGen;
        lighting.overlayBoundsKey = boundsKey;
        lighting.overlayProfileKey = profileKey;
        lighting.overlayViewKey = viewKey;
        lighting.dirty = false;
      }

      var canvas = lighting.overlayCanvas;
      if (!canvas) return;
      this.drawWorldCanvasVisible?.(
        canvas,
        bounds.minX * this.gridSize,
        bounds.minY * this.gridSize,
      );
    };

    /**
     * Check if a switch is visible to the current player.
     * Narrator always sees all. Player needs fog visibility + proximity.
     */
    proto.isSwitchVisibleToViewer = function (sw) {
      var fog = this._fog;
      if (!fog || !fog.config || !fog.config.enabled) return true; // no fog = all visible
      var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
      if (!isPlayerView) return true; // narrator normal view

      // Player/impersonate: check fog visibility with manual overrides.
      if (typeof this.isPointVisibleToFogViewer === "function") {
        if (!this.isPointVisibleToFogViewer(sw.x, sw.y)) return false;
      } else if (!this.isPointInVisibilityPolygons(sw.x, sw.y)) {
        return false;
      }

      // Check proximity to any viewer's PC token
      var viewerIds = fog.viewerInstanceIds;
      var impersonate = fog.impersonateInstanceId;
      var tokens = this.tokens || [];
      var instances = this.instances || [];

      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        var inst = null;
        for (var j = 0; j < instances.length; j++) {
          if (instances[j].id === token.instanceId) { inst = instances[j]; break; }
        }
        if (!inst) continue;

        var isViewerToken = false;
        if (impersonate && impersonate !== "all") {
          isViewerToken = inst.id === impersonate;
        } else if (viewerIds) {
          isViewerToken = viewerIds.indexOf(inst.id) !== -1;
        } else if (inst.isPC) {
          isViewerToken = true;
        }
        if (!isViewerToken) continue;

        var tSz = parseFloat(token.size) || 1;
        var dx = token.x + tSz * 0.5 - sw.x;
        var dy = token.y + tSz * 0.5 - sw.y;
        if (Math.sqrt(dx * dx + dy * dy) <= SWITCH_PROXIMITY) return true;
      }
      return false;
    };

    proto.isLightVisibleToViewer = function (light) {
      if (!light) return false;
      var fog = this._fog;
      if (!fog) return true;
      var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
      return !isPlayerView;
    };

    /**
     * Draw light dots, switch icons, and connection lines.
     */
    proto.drawLightIndicators = function () {
      var ctx = this.ctx;
      var gs = this.gridSize;
      var sc = Math.max(this.scale, 0.5);
      var lights = this.lights || [];
      var switches = this.switches || [];
      var perfMode = !!this.isPerformanceConstrained?.();
      var viewRect = this.getViewportWorldRect?.(gs * 3) || null;
      var selectedLightId = this.selectedLightId || null;
      var selectedSwitchId = this.selectedSwitchId || null;
      var isBackgroundLayer = this.activeLayer === "background";
      var fog = this._fog;
      var isNarratorNormal = !fog || !fog.isNarrator || (!fog.impersonateInstanceId && fog.isNarrator);
      var hasSelectionConnections = !!selectedLightId || !!selectedSwitchId;

      var linkMode = this._lightLinkMode || null;
      var linkPointer = this._lightLinkPointer || null;
      var showConnectionLines =
        !perfMode &&
        isNarratorNormal &&
        (isBackgroundLayer || !!linkMode || hasSelectionConnections);

      // Connection lines
      if (showConnectionLines && switches.length > 0 && lights.length > 0) {
        ctx.save();
        for (var si = 0; si < switches.length; si++) {
          var sw = switches[si];
          var swx = sw.x * gs;
          var swy = sw.y * gs;
          var isSwSelected = selectedSwitchId === sw.id;

          for (var li = 0; li < (sw.lightIds || []).length; li++) {
            var light = null;
            for (var k = 0; k < lights.length; k++) {
              if (lights[k].id === sw.lightIds[li]) { light = lights[k]; break; }
            }
            if (!light) continue;

            var lx = light.x * gs;
            var ly = light.y * gs;
            var isConnSelected = isSwSelected || selectedLightId === light.id;
            if (!isBackgroundLayer && !linkMode && !isConnSelected) continue;

            ctx.strokeStyle = isConnSelected ? "rgba(255,220,80,0.7)" : "rgba(255,220,80,0.25)";
            ctx.lineWidth = (isConnSelected ? 2 : 1) / sc;
            ctx.setLineDash([(isConnSelected ? 6 : 4) / sc, 3 / sc]);
            ctx.beginPath();
            ctx.moveTo(swx, swy);
            ctx.lineTo(lx, ly);
            ctx.stroke();
          }
        }
        ctx.setLineDash([]);
        ctx.restore();
      }

      if (showConnectionLines && linkMode) {
        ctx.save();
        var previewSwitch = null;
        if (linkMode.fromType === "switch") {
          for (var swi = 0; swi < switches.length; swi++) {
            if (switches[swi].id === linkMode.fromId) {
              previewSwitch = switches[swi];
              break;
            }
          }
        } else if (linkMode.fromType === "light") {
          var previewLight = null;
          for (var lgi = 0; lgi < lights.length; lgi++) {
            if (lights[lgi].id === linkMode.fromId) {
              previewLight = lights[lgi];
              break;
            }
          }
          if (previewLight) {
            for (var swi2 = 0; swi2 < switches.length; swi2++) {
              if ((switches[swi2].lightIds || []).indexOf(previewLight.id) >= 0) {
                previewSwitch = switches[swi2];
                break;
              }
            }
          }
        }

        if (previewSwitch && linkPointer) {
          ctx.strokeStyle = "rgba(255,220,80,0.85)";
          ctx.lineWidth = 2 / sc;
          ctx.setLineDash([6 / sc, 3 / sc]);
          ctx.beginPath();
          ctx.moveTo(previewSwitch.x * gs, previewSwitch.y * gs);
          ctx.lineTo(linkPointer.x * gs, linkPointer.y * gs);
          ctx.stroke();
          ctx.setLineDash([]);
        }
        ctx.restore();
      }

      // Light dots
      for (var i = 0; i < lights.length; i++) {
        var light = lights[i];
        if (!this.isLightVisibleToViewer(light)) continue;
        var sx = light.x * gs;
        var sy = light.y * gs;
        if (
          viewRect &&
          (sx < viewRect.x ||
            sy < viewRect.y ||
            sx > viewRect.x + viewRect.width ||
            sy > viewRect.y + viewRect.height)
        ) {
          continue;
        }
        var rgb = hexToRgb(light.color || "#ffcc66");
        var isSelected = selectedLightId === light.id;
        var isOff = light.on === false;

        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.7)";
          ctx.lineWidth = 2 / sc;
          if (!perfMode) ctx.setLineDash([4 / sc, 3 / sc]);
          ctx.beginPath();
          ctx.arc(sx, sy, 14 / sc, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        ctx.save();
        if (!perfMode) {
          ctx.shadowColor = isOff ? "rgba(80,80,80,0.4)" : "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.8)";
          ctx.shadowBlur = (isSelected ? 12 : 8) / sc;
        }
        ctx.beginPath();
        ctx.arc(sx, sy, (isSelected ? 6 : 4) / sc, 0, Math.PI * 2);
        ctx.fillStyle = isOff ? "rgba(80,80,80,0.6)" : "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.9)";
        ctx.fill();
        ctx.restore();

        ctx.beginPath();
        ctx.arc(sx, sy, (isSelected ? 3 : 2) / sc, 0, Math.PI * 2);
        ctx.fillStyle = isOff ? "rgba(120,120,120,0.7)" : "rgba(255,255,255,0.9)";
        ctx.fill();
      }

      // Switch icons
      for (var si = 0; si < switches.length; si++) {
        var sw = switches[si];

        // Visibility check for player view
        if (!this.isSwitchVisibleToViewer(sw)) continue;

        var swx = sw.x * gs;
        var swy = sw.y * gs;
        if (
          viewRect &&
          (swx < viewRect.x ||
            swy < viewRect.y ||
            swx > viewRect.x + viewRect.width ||
            swy > viewRect.y + viewRect.height)
        ) {
          continue;
        }
        var isOn = sw.on !== false;
        var isSelected = selectedSwitchId === sw.id;
        var halfSize = (isSelected ? 7 : 5) / sc;

        // Selection ring
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,220,80,0.7)";
          ctx.lineWidth = 2 / sc;
          if (!perfMode) ctx.setLineDash([4 / sc, 3 / sc]);
          ctx.beginPath();
          ctx.arc(swx, swy, 14 / sc, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Switch body (rounded square)
        ctx.save();
        if (!perfMode) {
          ctx.shadowColor = isOn ? "rgba(255,220,80,0.6)" : "rgba(60,60,60,0.4)";
          ctx.shadowBlur = 6 / sc;
        }
        ctx.fillStyle = isOn ? "rgba(255,220,80,0.9)" : "rgba(100,100,100,0.8)";
        ctx.beginPath();
        var r = 2 / sc;
        ctx.moveTo(swx - halfSize + r, swy - halfSize);
        ctx.lineTo(swx + halfSize - r, swy - halfSize);
        ctx.quadraticCurveTo(swx + halfSize, swy - halfSize, swx + halfSize, swy - halfSize + r);
        ctx.lineTo(swx + halfSize, swy + halfSize - r);
        ctx.quadraticCurveTo(swx + halfSize, swy + halfSize, swx + halfSize - r, swy + halfSize);
        ctx.lineTo(swx - halfSize + r, swy + halfSize);
        ctx.quadraticCurveTo(swx - halfSize, swy + halfSize, swx - halfSize, swy + halfSize - r);
        ctx.lineTo(swx - halfSize, swy - halfSize + r);
        ctx.quadraticCurveTo(swx - halfSize, swy - halfSize, swx - halfSize + r, swy - halfSize);
        ctx.closePath();
        ctx.fill();
        ctx.restore();

        // Toggle indicator (small line: up=on, down=off)
        ctx.save();
        ctx.strokeStyle = isOn ? "#fff" : "#555";
        ctx.lineWidth = 1.5 / sc;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(swx, swy);
        ctx.lineTo(swx, isOn ? swy - halfSize * 0.6 : swy + halfSize * 0.6);
        ctx.stroke();
        ctx.restore();
      }
    };

    /**
     * Check if a marker at grid position (x, y) is visible to the current viewer.
     * Narrator always sees all. Player/impersonate needs fog visibility + luminosity.
     */
    proto.isMarkerVisibleToViewer = function (x, y) {
      var fog = this._fog;
      if (!fog) return true;
      var fogEnabled = !!(fog.config && fog.config.enabled);
      var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
      if (!isPlayerView) return true;

      if (fogEnabled) {
        if (typeof this.isPointVisibleToFogViewer === "function") {
          if (!this.isPointVisibleToFogViewer(x, y)) return false;
        } else if (!this.isPointInVisibilityPolygons(x, y)) {
          return false;
        }
      }

      return this.isPointVisibleByLight(x, y);
    };

    proto.isWallMarkerVisibleToViewer = function (wall) {
      if (!wall) return false;
      var fog = this._fog;
      if (!fog) return true;
      var fogEnabled = !!(fog.config && fog.config.enabled);
      var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
      if (!isPlayerView) return true;

      var mx = (wall.x1 + wall.x2) / 2;
      var my = (wall.y1 + wall.y2) / 2;
      var dx = (wall.x2 || 0) - (wall.x1 || 0);
      var dy = (wall.y2 || 0) - (wall.y1 || 0);
      var len = Math.sqrt(dx * dx + dy * dy);
      if (len < 1e-6) {
        if (!fogEnabled) return true;
        return typeof this.isPointVisibleToFogViewer === "function"
          ? this.isPointVisibleToFogViewer(mx, my)
          : this.isPointInVisibilityPolygons(mx, my);
      }

      var nx = (-dy / len) * WALL_MARKER_VISIBILITY_OFFSET;
      var ny = (dx / len) * WALL_MARKER_VISIBILITY_OFFSET;
      if (!fogEnabled) return true;
      var isVisible = typeof this.isPointVisibleToFogViewer === "function"
        ? this.isPointVisibleToFogViewer.bind(this)
        : this.isPointInVisibilityPolygons.bind(this);
      return (
        isVisible(mx, my) ||
        isVisible(mx + nx, my + ny) ||
        isVisible(mx - nx, my - ny)
      );
    };

    /**
     * Check if a point is inside any of the current visibility polygons.
     * Uses polygon containment instead of cell-key lookup.
     */
    proto.isPointInVisibilityPolygons = function (x, y) {
      var fog = this._fog;
      if (!fog || !fog.polygons || !fog.polygons.length) return false;
      if (!window.FogVisibility) return false;
      for (var i = 0; i < fog.polygons.length; i++) {
        if (window.FogVisibility.pointInPolygon(x, y, fog.polygons[i])) return true;
      }
      return false;
    };

    /**
     * Draw emoji markers for all interactive objects (doors, windows, lights, switches).
     * Called after drawLightIndicators so markers appear on top of dots/squares.
     */
    proto.drawInteractiveMarkers = function (ctxOverride) {
      var ctx = ctxOverride || this.ctx;
      var gs = this.gridSize;
      var sc = Math.max(this.scale, 0.5);
      var viewRect = this.getViewportWorldRect?.(gs * 3) || null;
      var walls = this.walls || [];
      var lights = this.lights || [];
      var switches = this.switches || [];
      var selectedLightId = this.selectedLightId || null;
      var selectedSwitchId = this.selectedSwitchId || null;

      // Doors and windows — marker at midpoint of wall segment
      for (var i = 0; i < walls.length; i++) {
        var wall = walls[i];
        if (wall.type !== "door" && wall.type !== "window") continue;
        var mx = (wall.x1 + wall.x2) / 2;
        var my = (wall.y1 + wall.y2) / 2;
        var markerX = mx * gs;
        var markerY = my * gs;
        if (
          viewRect &&
          (markerX < viewRect.x ||
            markerY < viewRect.y ||
            markerX > viewRect.x + viewRect.width ||
            markerY > viewRect.y + viewRect.height)
        ) {
          continue;
        }
        if (!this.isWallMarkerVisibleToViewer(wall)) continue;

        if (wall.type === "door") {
          var doorImage = wall.doorOpen ? DOOR_MARKER_IMAGES.open : DOOR_MARKER_IMAGES.closed;
          drawInteractiveImageMarker(ctx, markerX, markerY, doorImage, sc, false);
        } else {
          drawInteractiveMarker(ctx, markerX, markerY, MARKER_EMOJIS.window, sc, false);
        }
      }

      // Lights
      for (var li = 0; li < lights.length; li++) {
        var light = lights[li];
        if (!this.isLightVisibleToViewer(light)) continue;
        var lightX = light.x * gs;
        var lightY = light.y * gs;
        if (
          viewRect &&
          (lightX < viewRect.x ||
            lightY < viewRect.y ||
            lightX > viewRect.x + viewRect.width ||
            lightY > viewRect.y + viewRect.height)
        ) {
          continue;
        }
        var isSelected = selectedLightId === light.id;
        drawInteractiveMarker(ctx, lightX, lightY, MARKER_EMOJIS.light, sc, isSelected);
      }

      // Switches
      for (var si = 0; si < switches.length; si++) {
        var sw = switches[si];
        if (!this.isSwitchVisibleToViewer(sw)) continue;
        var switchX = sw.x * gs;
        var switchY = sw.y * gs;
        if (
          viewRect &&
          (switchX < viewRect.x ||
            switchY < viewRect.y ||
            switchX > viewRect.x + viewRect.width ||
            switchY > viewRect.y + viewRect.height)
        ) {
          continue;
        }
        var isSelected = selectedSwitchId === sw.id;
        drawInteractiveMarker(ctx, switchX, switchY, MARKER_EMOJIS["switch"], sc, isSelected);
      }
    };
  }

  /**
   * Compute a simple hash for walls to detect changes.
   */
  function computeWallsHash(walls) {
    if (!walls || walls.length === 0) return "0";
    var hash = walls.length + ":";
    for (var i = 0; i < walls.length; i++) {
      var w = walls[i];
      if (!w) continue;
      hash +=
        (w.id || i) + "," +
        (w.type || "wall") + "," +
        (w.x1 || 0).toFixed(2) + "," +
        (w.y1 || 0).toFixed(2) + "," +
        (w.x2 || 0).toFixed(2) + "," +
        (w.y2 || 0).toFixed(2) + "," +
        (w.doorOpen ? 1 : 0) + ";";
    }
    return hash;
  }

  function buildLightPolygonCache(map) {
    var lights = map.lights || [];
    var walls = map.walls || [];
    var cache = [];
    if (!lights.length || !global.AELightVisibility) return cache;

    var lighting = map._lighting || {};
    var perLightCache = lighting.perLightCache || new Map();
    var currentWallsHash = computeWallsHash(walls);
    var wallsChanged = currentWallsHash !== lighting.wallsHash;

    // Update walls hash for next check
    if (lighting.wallsHash !== currentWallsHash) {
      lighting.wallsHash = currentWallsHash;
    }

    // Track which lights are still active (for cleanup)
    var activeLightIds = new Set();

    // Get spatial index if available
    var spatialIndex = map._wallSpatialIndex || null;

    for (var li = 0; li < lights.length; li++) {
      var light = lights[li];
      if (!light || light.on === false) continue;

      var lightId = light.id || li;
      activeLightIds.add(lightId);

      var radius = parseFloat(light.radius) || 4;
      var intensity = clamp01(light.intensity != null ? light.intensity : 0.8);
      var lightX = parseFloat(light.x) || 0;
      var lightY = parseFloat(light.y) || 0;

      // Check if cached entry is still valid
      var cached = perLightCache.get(lightId);
      var needsRecalc = !cached ||
                        wallsChanged ||
                        cached.x !== lightX ||
                        cached.y !== lightY ||
                        cached.radius !== radius;

      var poly;
      if (needsRecalc) {
        // Use spatial index to get only relevant walls if available
        var relevantWalls = walls;
        if (spatialIndex) {
          relevantWalls = spatialIndex.queryCircle(lightX, lightY, radius + 1);
        }
        poly = global.AELightVisibility.computeLightPolygon(lightX, lightY, relevantWalls, radius);
        if (!poly || poly.length < 3) continue;

        // Update cache
        perLightCache.set(lightId, {
          poly: poly,
          x: lightX,
          y: lightY,
          radius: radius,
          wallsHash: currentWallsHash,
        });
      } else {
        poly = cached.poly;
      }

      cache.push({
        light: light,
        poly: poly,
        radius: radius,
        intensity: intensity,
      });
    }

    // Clean up stale cache entries for lights that no longer exist or are off
    perLightCache.forEach(function(_, key) {
      if (!activeLightIds.has(key)) {
        perLightCache.delete(key);
      }
    });

    return cache;
  }

  function renderLightingOverlay(map, lighting, bounds, viewerProfile) {
    var gs = map.gridSize;
    var offX = -bounds.minX * gs;
    var offY = -bounds.minY * gs;
    var pxW = Math.min((bounds.maxX - bounds.minX) * gs, 12000);
    var pxH = Math.min((bounds.maxY - bounds.minY) * gs, 12000);
    var ambient = map._ambientLight || { intensity: 1, color: "#8090b0" };
    var lightCache = map._cachedLightPolygons || [];
    var fog = map._fog;
    var isNarratorView = fog && fog.isNarrator && !fog.impersonateInstanceId;

    var overlay = lighting.overlayCanvas;
    if (!overlay) {
      overlay = document.createElement("canvas");
      lighting.overlayCanvas = overlay;
      lighting.overlayCtx = overlay.getContext("2d");
    }
    if (overlay.width !== pxW || overlay.height !== pxH) {
      overlay.width = pxW;
      overlay.height = pxH;
    }
    var ctx = lighting.overlayCtx;
    ctx.clearRect(0, 0, pxW, pxH);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fillRect(0, 0, pxW, pxH);

    var multiplier = Math.max(0, viewerProfile.luminosityMultiplier || 1);
    var offset = clamp01(viewerProfile.luminosityOffset || 0);
    var ambientI = clamp01(clamp01(ambient.intensity != null ? ambient.intensity : 1) * multiplier + offset);
    if (ambientI > 0.001) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255," + ambientI + ")";
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();

      // Darken enclosed areas using polygons detected from wall loops
      // Recompute only if stale (walls changed) - prevents loops
      var walls = map.walls || [];
      if (walls.length >= 3 && (map._enclosedPolygonsStale || map._enclosedPolygons === undefined)) {
        map._enclosedPolygonsStale = false;
        if (typeof map._recomputeEnclosedPolygons === "function") {
          map._recomputeEnclosedPolygons();
        }
      }
      var enclosedPolys = map._enclosedPolygons;
      if (enclosedPolys && enclosedPolys.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(0,0,0," + ambientI + ")";
        for (var pi = 0; pi < enclosedPolys.length; pi++) {
          var polyData = enclosedPolys[pi];
          var poly = polyData && polyData.points ? polyData.points : polyData;
          if (!poly || poly.length < 3) continue;
          ctx.beginPath();
          ctx.moveTo(poly[0].x * gs + offX, poly[0].y * gs + offY);
          for (var pvi = 1; pvi < poly.length; pvi++) {
            ctx.lineTo(poly[pvi].x * gs + offX, poly[pvi].y * gs + offY);
          }
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      var ambientRgb = hexToRgb(ambient.color || "#8090b0");
      var ambientTint = ambientI * 0.05 * getAmbientTintStrength(ambient);
      if (ambientTint > 0.005) {
        // If we have enclosed areas, use clipping to apply tint only outside them (single pass)
        if (enclosedPolys && enclosedPolys.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          // Create a clip path that excludes enclosed areas using even-odd rule
          ctx.beginPath();
          ctx.rect(0, 0, pxW, pxH); // Outer rect
          for (var pi2 = 0; pi2 < enclosedPolys.length; pi2++) {
            var polyData2 = enclosedPolys[pi2];
            var poly2 = polyData2 && polyData2.points ? polyData2.points : polyData2;
            if (!poly2 || poly2.length < 3) continue;
            ctx.moveTo(poly2[0].x * gs + offX, poly2[0].y * gs + offY);
            for (var pvi2 = 1; pvi2 < poly2.length; pvi2++) {
              ctx.lineTo(poly2[pvi2].x * gs + offX, poly2[pvi2].y * gs + offY);
            }
            ctx.closePath();
          }
          ctx.clip("evenodd");
          ctx.fillStyle = "rgba(" + ambientRgb.r + "," + ambientRgb.g + "," + ambientRgb.b + "," + ambientTint + ")";
          ctx.fillRect(0, 0, pxW, pxH);
          ctx.restore();
        } else {
          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          ctx.fillStyle = "rgba(" + ambientRgb.r + "," + ambientRgb.g + "," + ambientRgb.b + "," + ambientTint + ")";
          ctx.fillRect(0, 0, pxW, pxH);
          ctx.restore();
        }
      }
    }

    ctx.save();
    ctx.globalCompositeOperation = "destination-out";
    for (var li = 0; li < lightCache.length; li++) {
      var lightEntry = lightCache[li];
      var lightIntensity = clamp01(lightEntry.intensity * multiplier);
      if (lightIntensity < 0.001) continue;
      var lightCx = lightEntry.light.x * gs + offX;
      var lightCy = lightEntry.light.y * gs + offY;
      var lightRadiusPx = lightEntry.radius * gs;

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(lightEntry.poly[0].x * gs + offX, lightEntry.poly[0].y * gs + offY);
      for (var lp = 1; lp < lightEntry.poly.length; lp++) {
        ctx.lineTo(lightEntry.poly[lp].x * gs + offX, lightEntry.poly[lp].y * gs + offY);
      }
      ctx.closePath();
      ctx.clip();

      var gradient = ctx.createRadialGradient(lightCx, lightCy, 0, lightCx, lightCy, lightRadiusPx);
      gradient.addColorStop(0, "rgba(255,255,255," + lightIntensity + ")");
      gradient.addColorStop(0.5, "rgba(255,255,255," + (lightIntensity * 0.6) + ")");
      gradient.addColorStop(0.85, "rgba(255,255,255," + (lightIntensity * 0.15) + ")");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.fillRect(lightCx - lightRadiusPx, lightCy - lightRadiusPx, lightRadiusPx * 2, lightRadiusPx * 2);
      ctx.restore();
    }
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = "source-over";
    for (var ti = 0; ti < lightCache.length; ti++) {
      var tintEntry = lightCache[ti];
      var tintIntensity = clamp01(tintEntry.intensity * multiplier);
      if (tintIntensity < 0.001) continue;
      var tintCx = tintEntry.light.x * gs + offX;
      var tintCy = tintEntry.light.y * gs + offY;
      var tintRadiusPx = tintEntry.radius * gs;
      var tintStrength = getLightTintStrength(tintEntry.light);
      var tintAlpha = tintIntensity * 0.22 * tintStrength;
      var tintRgb = hexToRgb(tintEntry.light.color || "#ffcc66");

      ctx.save();
      ctx.beginPath();
      ctx.moveTo(tintEntry.poly[0].x * gs + offX, tintEntry.poly[0].y * gs + offY);
      for (var tk = 1; tk < tintEntry.poly.length; tk++) {
        ctx.lineTo(tintEntry.poly[tk].x * gs + offX, tintEntry.poly[tk].y * gs + offY);
      }
      ctx.closePath();
      ctx.clip();

      var tintGradient = ctx.createRadialGradient(tintCx, tintCy, 0, tintCx, tintCy, tintRadiusPx);
      tintGradient.addColorStop(0, "rgba(" + tintRgb.r + "," + tintRgb.g + "," + tintRgb.b + "," + tintAlpha + ")");
      tintGradient.addColorStop(0.7, "rgba(" + tintRgb.r + "," + tintRgb.g + "," + tintRgb.b + "," + (tintAlpha * 0.3) + ")");
      tintGradient.addColorStop(1, "rgba(" + tintRgb.r + "," + tintRgb.g + "," + tintRgb.b + ",0)");
      ctx.fillStyle = tintGradient;
      ctx.fillRect(tintCx - tintRadiusPx, tintCy - tintRadiusPx, tintRadiusPx * 2, tintRadiusPx * 2);
      ctx.restore();
    }
    ctx.restore();

    if (isNarratorView) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(255,255,255,0.1)";
      ctx.fillRect(0, 0, pxW, pxH);
      ctx.restore();
      return;
    }

    var visibleState =
      typeof map.getFogVisibleState === "function"
        ? map.getFogVisibleState()
        : {
            enabled: false,
            isPlayerView: false,
            currentAreas: [],
            revealedAreas: [],
            hiddenAreas: [],
          };
    if (!visibleState.enabled || !visibleState.isPlayerView) return;

    var maskCanvas = lighting.maskCanvas;
    if (!maskCanvas) {
      maskCanvas = document.createElement("canvas");
      lighting.maskCanvas = maskCanvas;
      lighting.maskCtx = maskCanvas.getContext("2d");
    }
    if (maskCanvas.width !== pxW || maskCanvas.height !== pxH) {
      maskCanvas.width = pxW;
      maskCanvas.height = pxH;
    }
    var maskCtx = lighting.maskCtx;
    maskCtx.clearRect(0, 0, pxW, pxH);
    maskCtx.fillStyle = "rgba(255,255,255,1)";
    if (visibleState.currentAreas && visibleState.currentAreas.length > 0) {
      maskCtx.save();
      try { maskCtx.filter = "blur(" + LIGHT_MASK_BLUR_RADIUS + "px)"; } catch (_e) {}
      appendAreasPath(maskCtx, visibleState.currentAreas, gs, offX, offY);
      maskCtx.restore();
      appendAreasPath(maskCtx, visibleState.currentAreas, gs, offX, offY);
    }
    appendAreasPath(maskCtx, visibleState.revealedAreas, gs, offX, offY);
    if (visibleState.hiddenAreas && visibleState.hiddenAreas.length > 0) {
      maskCtx.fillStyle = "rgba(0,0,0,1)";
      appendAreasPath(maskCtx, visibleState.hiddenAreas, gs, offX, offY);
    }

    ctx.save();
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(maskCanvas, 0, 0);
    ctx.restore();
  }

  global.__applyTacticalMapLightRenderer = apply;
  if (global.TacticalMap) {
    apply(global.TacticalMap);
  }
})(window);
