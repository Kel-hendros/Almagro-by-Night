// Light & Switch indicator rendering for TacticalMap.
// Draws light dots, switch icons, selection rings, and connection lines.
// The actual lighting/darkness overlay is handled by fog-renderer.js.
(function applyLightRenderer(global) {
  "use strict";

  var SWITCH_PROXIMITY_METERS = 4.5;
  var SWITCH_PROXIMITY = SWITCH_PROXIMITY_METERS / 1.5; // convert meters to coordinate units
  var TOKEN_PROXIMITY_REVEAL_DISTANCE = 1;

  // Interactive marker constants
  var INTERACTIVE_BORDER_COLOR = "rgba(100, 200, 255, 0.85)";
  var INTERACTIVE_BG_COLOR = "rgba(10, 10, 10, 0.9)";
  var INTERACTIVE_MARKER_RADIUS = 12;
  var MARKER_EMOJIS = { door: "\u{1F6AA}", window: "\u{1FA9F}", light: "\u{1F4A1}", switch: "\u{1F39A}\uFE0F" };
  var LUMINOSITY_THRESHOLD = 0.30;
  var LIGHT_MASK_BLUR_RADIUS = 6;
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
      };
    };

    proto.invalidateLighting = function () {
      if (!this._lighting) this.initLighting();
      this._lighting.dirty = true;
      this._lighting.cacheGen = (this._lighting.cacheGen || 0) + 1;
      this._drawDirty = true;
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
      if (lighting.dirty) {
        this._cachedLightPolygons = buildLightPolygonCache(this);
      }

      var bounds = typeof this.getOverlayBounds === "function" ? this.getOverlayBounds() : null;
      if (!bounds) return;
      var fogGen = this._fog ? (this._fog._cacheGen || 0) : 0;
      var boundsKey = [bounds.minX, bounds.minY, bounds.maxX, bounds.maxY].join(":");
      var profile = this.getActiveViewerVisionAggregateProfile();
      var profileKey = getProfileKey(profile);

      if (
        lighting.dirty ||
        lighting.overlayFogGen !== fogGen ||
        lighting.overlayBoundsKey !== boundsKey ||
        lighting.overlayProfileKey !== profileKey
      ) {
        renderLightingOverlay(this, lighting, bounds, profile);
        lighting.overlayFogGen = fogGen;
        lighting.overlayBoundsKey = boundsKey;
        lighting.overlayProfileKey = profileKey;
        lighting.dirty = false;
      }

      var canvas = lighting.overlayCanvas;
      if (!canvas) return;
      this.ctx.drawImage(canvas, bounds.minX * this.gridSize, bounds.minY * this.gridSize);
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

    /**
     * Draw light dots, switch icons, and connection lines.
     */
    proto.drawLightIndicators = function () {
      var ctx = this.ctx;
      var gs = this.gridSize;
      var sc = Math.max(this.scale, 0.5);
      var lights = this.lights || [];
      var switches = this.switches || [];
      var selectedLightId = this.selectedLightId || null;
      var selectedSwitchId = this.selectedSwitchId || null;
      var isBackgroundLayer = this.activeLayer === "background";
      var fog = this._fog;
      var isNarratorNormal = !fog || !fog.isNarrator || (!fog.impersonateInstanceId && fog.isNarrator);

      // Connection lines (narrator only, background layer)
      if (isNarratorNormal && isBackgroundLayer && switches.length > 0 && lights.length > 0) {
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

      // Light dots
      for (var i = 0; i < lights.length; i++) {
        var light = lights[i];
        var sx = light.x * gs;
        var sy = light.y * gs;
        var rgb = hexToRgb(light.color || "#ffcc66");
        var isSelected = selectedLightId === light.id;
        var isOff = light.on === false;

        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.7)";
          ctx.lineWidth = 2 / sc;
          ctx.setLineDash([4 / sc, 3 / sc]);
          ctx.beginPath();
          ctx.arc(sx, sy, 14 / sc, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        ctx.save();
        ctx.shadowColor = isOff ? "rgba(80,80,80,0.4)" : "rgba(" + rgb.r + "," + rgb.g + "," + rgb.b + ",0.8)";
        ctx.shadowBlur = (isSelected ? 12 : 8) / sc;
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
        var isOn = sw.on !== false;
        var isSelected = selectedSwitchId === sw.id;
        var halfSize = (isSelected ? 7 : 5) / sc;

        // Selection ring
        if (isSelected) {
          ctx.save();
          ctx.strokeStyle = "rgba(255,220,80,0.7)";
          ctx.lineWidth = 2 / sc;
          ctx.setLineDash([4 / sc, 3 / sc]);
          ctx.beginPath();
          ctx.arc(swx, swy, 14 / sc, 0, Math.PI * 2);
          ctx.stroke();
          ctx.setLineDash([]);
          ctx.restore();
        }

        // Switch body (rounded square)
        ctx.save();
        ctx.shadowColor = isOn ? "rgba(255,220,80,0.6)" : "rgba(60,60,60,0.4)";
        ctx.shadowBlur = 6 / sc;
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
    proto.drawInteractiveMarkers = function () {
      var ctx = this.ctx;
      var gs = this.gridSize;
      var sc = Math.max(this.scale, 0.5);
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
        if (!this.isMarkerVisibleToViewer(mx, my)) continue;
        var emoji = wall.type === "door" ? MARKER_EMOJIS.door : MARKER_EMOJIS.window;
        drawInteractiveMarker(ctx, mx * gs, my * gs, emoji, sc, false);
      }

      // Lights
      for (var li = 0; li < lights.length; li++) {
        var light = lights[li];
        if (!this.isMarkerVisibleToViewer(light.x, light.y)) continue;
        var isSelected = selectedLightId === light.id;
        drawInteractiveMarker(ctx, light.x * gs, light.y * gs, MARKER_EMOJIS.light, sc, isSelected);
      }

      // Switches
      for (var si = 0; si < switches.length; si++) {
        var sw = switches[si];
        if (!this.isMarkerVisibleToViewer(sw.x, sw.y)) continue;
        var isSelected = selectedSwitchId === sw.id;
        drawInteractiveMarker(ctx, sw.x * gs, sw.y * gs, MARKER_EMOJIS["switch"], sc, isSelected);
      }
    };
  }

  function buildLightPolygonCache(map) {
    var lights = map.lights || [];
    var walls = map.walls || [];
    var cache = [];
    if (!lights.length || !global.AELightVisibility) return cache;

    for (var li = 0; li < lights.length; li++) {
      var light = lights[li];
      if (!light || light.on === false) continue;
      var radius = parseFloat(light.radius) || 4;
      var intensity = clamp01(light.intensity != null ? light.intensity : 0.8);
      var poly = global.AELightVisibility.computeLightPolygon(light.x, light.y, walls, radius);
      if (!poly || poly.length < 3) continue;
      cache.push({
        light: light,
        poly: poly,
        radius: radius,
        intensity: intensity,
      });
    }
    return cache;
  }

  function renderLightingOverlay(map, lighting, bounds, viewerProfile) {
    var gs = map.gridSize;
    var offX = -bounds.minX * gs;
    var offY = -bounds.minY * gs;
    var pxW = Math.min((bounds.maxX - bounds.minX) * gs, 12000);
    var pxH = Math.min((bounds.maxY - bounds.minY) * gs, 12000);
    var ambient = map._ambientLight || { intensity: 1, color: "#8090b0" };
    var rooms = map._rooms || [];
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

      if (rooms.length > 0) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        for (var ri = 0; ri < rooms.length; ri++) {
          var room = rooms[ri];
          var poly = room && room.polygon;
          if (!poly || poly.length < 3) continue;
          var roomAmbient = clamp01(
            clamp01(room.ambientLight && room.ambientLight.intensity != null ? room.ambientLight.intensity : 0)
              * multiplier + offset
          );
          var darken = ambientI - roomAmbient;
          if (darken < 0.005) continue;
          ctx.fillStyle = "rgba(0,0,0," + darken + ")";
          ctx.beginPath();
          ctx.moveTo(poly[0].x * gs + offX, poly[0].y * gs + offY);
          for (var pk = 1; pk < poly.length; pk++) ctx.lineTo(poly[pk].x * gs + offX, poly[pk].y * gs + offY);
          ctx.closePath();
          ctx.fill();
        }
        ctx.restore();
      }

      var ambientRgb = hexToRgb(ambient.color || "#8090b0");
      var ambientTint = ambientI * 0.05;
      if (ambientTint > 0.005) {
        ctx.save();
        ctx.globalCompositeOperation = "source-over";
        ctx.fillStyle = "rgba(" + ambientRgb.r + "," + ambientRgb.g + "," + ambientRgb.b + "," + ambientTint + ")";
        ctx.fillRect(0, 0, pxW, pxH);
        ctx.restore();

        if (rooms.length > 0) {
          ctx.save();
          ctx.globalCompositeOperation = "destination-out";
          for (var rgi = 0; rgi < rooms.length; rgi++) {
            var roomPoly = rooms[rgi] && rooms[rgi].polygon;
            if (!roomPoly || roomPoly.length < 3) continue;
            ctx.fillStyle = "rgba(255,255,255," + ambientTint + ")";
            ctx.beginPath();
            ctx.moveTo(roomPoly[0].x * gs + offX, roomPoly[0].y * gs + offY);
            for (var rp = 1; rp < roomPoly.length; rp++) {
              ctx.lineTo(roomPoly[rp].x * gs + offX, roomPoly[rp].y * gs + offY);
            }
            ctx.closePath();
            ctx.fill();
          }
          ctx.restore();

          ctx.save();
          ctx.globalCompositeOperation = "source-over";
          for (var rti = 0; rti < rooms.length; rti++) {
            var roomEntry = rooms[rti];
            var roomShape = roomEntry && roomEntry.polygon;
            if (!roomShape || roomShape.length < 3) continue;
            var roomAmbientI = clamp01(
              clamp01(roomEntry.ambientLight && roomEntry.ambientLight.intensity != null ? roomEntry.ambientLight.intensity : 0)
                * multiplier + offset
            );
            if (roomAmbientI < 0.005) continue;
            var roomRgb = hexToRgb((roomEntry.ambientLight && roomEntry.ambientLight.color) || "#8090b0");
            var roomTint = roomAmbientI * 0.05;
            ctx.fillStyle = "rgba(" + roomRgb.r + "," + roomRgb.g + "," + roomRgb.b + "," + roomTint + ")";
            ctx.beginPath();
            ctx.moveTo(roomShape[0].x * gs + offX, roomShape[0].y * gs + offY);
            for (var rs = 1; rs < roomShape.length; rs++) {
              ctx.lineTo(roomShape[rs].x * gs + offX, roomShape[rs].y * gs + offY);
            }
            ctx.closePath();
            ctx.fill();
          }
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
      var tintAlpha = tintIntensity * 0.08;
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
