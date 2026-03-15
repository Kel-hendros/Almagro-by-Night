// Light & Switch indicator rendering for TacticalMap.
// Draws light dots, switch icons, selection rings, and connection lines.
// The actual lighting/darkness overlay is handled by fog-renderer.js.
(function applyLightRenderer(global) {
  "use strict";

  var SWITCH_PROXIMITY = 3; // cells — max distance for player to see/interact with a switch

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
      this._lighting = { dirty: true };
    };

    proto.invalidateLighting = function () {
      if (this._lighting) this._lighting.dirty = true;
      if (this._fog) this._fog.dirty = true;
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

      // Player/impersonate: check fog visibility
      var scx = Math.floor(sw.x);
      var scy = Math.floor(sw.y);
      if (!fog.visibleCells || !fog.visibleCells.has(scx + "," + scy)) return false;

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

        var dx = token.x + 0.5 - sw.x;
        var dy = token.y + 0.5 - sw.y;
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
  }

  global.__applyTacticalMapLightRenderer = apply;
  if (global.TacticalMap) {
    apply(global.TacticalMap);
  }
})(window);
