// Light & Switch indicator rendering for TacticalMap.
// Draws light dots, switch icons, selection rings, and connection lines.
// The actual lighting/darkness overlay is handled by fog-renderer.js.
(function applyLightRenderer(global) {
  "use strict";

  var SWITCH_PROXIMITY_METERS = 4.5;
  var SWITCH_PROXIMITY = SWITCH_PROXIMITY_METERS / 1.5; // convert meters to coordinate units

  // Interactive marker constants
  var INTERACTIVE_BORDER_COLOR = "rgba(100, 200, 255, 0.85)";
  var INTERACTIVE_BG_COLOR = "rgba(10, 10, 10, 0.9)";
  var INTERACTIVE_MARKER_RADIUS = 12;
  var MARKER_EMOJIS = { door: "\u{1F6AA}", window: "\u{1FA9F}", light: "\u{1F4A1}", switch: "\u{1F39A}\uFE0F" };
  var LUMINOSITY_THRESHOLD = 0.25;

  function isLuminosityVisible(luminosity) {
    var lum = isFinite(luminosity) ? luminosity : 0;
    lum = Math.min(1, Math.max(0, lum));
    return lum + 1e-6 >= LUMINOSITY_THRESHOLD;
  }

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

  function apply(TacticalMap) {
    var proto = TacticalMap.prototype;

    proto.initLighting = function () {
      this._lighting = { dirty: true, cacheGen: 0 };
    };

    proto.invalidateLighting = function () {
      if (!this._lighting) this._lighting = { dirty: true, cacheGen: 0 };
      this._lighting.dirty = true;
      this._lighting.cacheGen = (this._lighting.cacheGen || 0) + 1;
      if (this._fog) this._fog.dirty = true;
      this._drawDirty = true;
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

      // Player/impersonate: check fog visibility using polygon containment
      if (!this.isPointInVisibilityPolygons(sw.x, sw.y)) return false;

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
      if (!fog || !fog.config || !fog.config.enabled) return true;
      var isPlayerView = !fog.isNarrator || !!fog.impersonateInstanceId;
      if (!isPlayerView) return true;

      if (typeof this.isPointVisibleToFogViewer === "function") {
        if (!this.isPointVisibleToFogViewer(x, y)) return false;
      } else if (!this.isPointInVisibilityPolygons(x, y)) {
        return false;
      }

      // Luminosity check at the actual point
      if (typeof this.computeLuminosityAt === "function") {
        if (!isLuminosityVisible(this.computeLuminosityAt(x, y))) return false;
      }
      return true;
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

  global.__applyTacticalMapLightRenderer = apply;
  if (global.TacticalMap) {
    apply(global.TacticalMap);
  }
})(window);
