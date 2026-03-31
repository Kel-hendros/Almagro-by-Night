(function initAELightSwitchManager(global) {
  function createManager(ctx) {
    var getEncounterData = ctx.getEncounterData;
    var getMap = ctx.getMap;
    var saveFn = ctx.saveEncounter;

    var _lightPopover = null;
    var _switchPopover = null;
    var _linkMode = null;

    function syncLinkModeToMap() {
      var map = getMap();
      if (!map) return;
      map._lightLinkMode = _linkMode
        ? {
            fromType: _linkMode.fromType,
            fromId: _linkMode.fromId,
          }
        : null;
      map._lightLinkPointer = _linkMode?.pointer
        ? { x: _linkMode.pointer.x, y: _linkMode.pointer.y }
        : null;

      if (_linkMode) {
        map.selectedSwitchId = _linkMode.fromType === "switch" ? _linkMode.fromId : null;
        map.selectedLightId = _linkMode.fromType === "light" ? _linkMode.fromId : null;
      }
      map.draw?.();
    }

    // ── Light management ──

    function generateLightId() {
      return "light-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 5);
    }

    function addLight(x, y) {
      var data = getEncounterData();
      if (!data) return;
      var lights = data.lights || [];
      var count = lights.length + 1;
      lights.push({ id: generateLightId(), name: "Luz " + count, x: x, y: y, radius: 4, color: "#ffcc66", intensity: 0.8, tintStrength: 0.35 });
      data.lights = lights;
      var map = getMap();
      if (map) { map.lights = lights; map.invalidateLighting?.(); map.draw(); }
      saveFn();
    }

    function updateLight(lightId, patch) {
      var data = getEncounterData();
      var lights = (data && data.lights) || [];
      var light = lights.find(function (l) { return l.id === lightId; });
      if (!light) return;
      for (var key in patch) light[key] = patch[key];
      var map = getMap();
      if (map) { map.invalidateLighting?.(); map.draw(); }
      saveFn();
    }

    function removeLight(lightId) {
      var data = getEncounterData();
      if (!data) return;
      data.lights = (data.lights || []).filter(function (l) { return l.id !== lightId; });
      var map = getMap();
      if (map) { map.lights = data.lights; map.invalidateLighting?.(); map.draw(); }
      closeLightPopover();
      saveFn();
    }

    function findLightAt(cellX, cellY) {
      var data = getEncounterData();
      var lights = (data && data.lights) || [];
      var best = null, bestDist = 0.6;
      for (var i = 0; i < lights.length; i++) {
        var l = lights[i];
        var dx = cellX - l.x, dy = cellY - l.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; best = l; }
      }
      return best;
    }

    function openLightPopover(light) {
      closeLightPopover();
      var map = getMap();
      if (!light || !map) return;
      var gs = map.gridSize;
      var scale = map.scale;
      var rect = map.canvas.getBoundingClientRect();
      var screenX = rect.left + map.offsetX + light.x * gs * scale;
      var screenY = rect.top + map.offsetY + light.y * gs * scale;
      var tintStrength = Math.max(0.1, Math.min(1, parseFloat(light.tintStrength != null ? light.tintStrength : 0.35) || 0.35));

      var pop = document.createElement("div");
      pop.className = "ae-light-popover";
      pop.innerHTML =
        '<div class="ae-light-popover-row"><label>Color</label><div style="display:flex;align-items:center;gap:8px;flex:1;"><input type="color" id="ae-lp-color" value="' + (light.color || "#ffcc66") + '"><label style="font-size:0.72rem;color:#bbb;">Tinte</label><input type="range" id="ae-lp-tint" min="0.1" max="1" step="0.05" value="' + tintStrength + '" style="flex:1;min-width:72px;"><span class="ae-light-range-val" id="ae-lp-tint-val">' + Math.round(tintStrength * 100) + '%</span></div></div>' +
        '<div class="ae-light-popover-row"><label>Radio</label><input type="range" id="ae-lp-radius" min="1" max="15" step="0.5" value="' + (light.radius || 4) + '"><span class="ae-light-range-val" id="ae-lp-radius-val">' + (light.radius || 4) + '</span></div>' +
        '<div class="ae-light-popover-row"><label>Fuerza</label><input type="range" id="ae-lp-intensity" min="0.1" max="1" step="0.05" value="' + (light.intensity != null ? light.intensity : 0.8) + '"><span class="ae-light-range-val" id="ae-lp-int-val">' + Math.round((light.intensity != null ? light.intensity : 0.8) * 100) + '%</span></div>' +
        '<button class="ae-btn ae-btn--secondary ae-btn--full" id="ae-lp-create-switch" type="button" style="margin-top:4px;">Crear interruptor</button>' +
        '<button class="ae-btn ae-btn--secondary ae-btn--full" id="ae-lp-link-switch" type="button">Vincular a interruptor</button>' +
        '<button class="ae-btn ae-btn--danger ae-btn--full" id="ae-lp-delete" type="button" style="margin-top:4px;">Eliminar luz</button>';

      pop.style.left = Math.round(Math.min(screenX + 20, window.innerWidth - 220)) + "px";
      pop.style.top = Math.round(Math.min(screenY - 60, window.innerHeight - 180)) + "px";
      document.body.appendChild(pop);
      _lightPopover = { el: pop, lightId: light.id };

      pop.querySelector("#ae-lp-color").addEventListener("input", function (e) {
        updateLight(light.id, { color: e.target.value });
      });
      pop.querySelector("#ae-lp-tint").addEventListener("input", function (e) {
        var v = parseFloat(e.target.value);
        pop.querySelector("#ae-lp-tint-val").textContent = Math.round(v * 100) + "%";
        updateLight(light.id, { tintStrength: v });
      });
      pop.querySelector("#ae-lp-radius").addEventListener("input", function (e) {
        var v = parseFloat(e.target.value); pop.querySelector("#ae-lp-radius-val").textContent = v;
        updateLight(light.id, { radius: v });
      });
      pop.querySelector("#ae-lp-intensity").addEventListener("input", function (e) {
        var v = parseFloat(e.target.value); pop.querySelector("#ae-lp-int-val").textContent = Math.round(v * 100) + "%";
        updateLight(light.id, { intensity: v });
      });
      pop.querySelector("#ae-lp-delete").addEventListener("click", function () { removeLight(light.id); });
      pop.querySelector("#ae-lp-create-switch").addEventListener("click", function () {
        closeLightPopover();
        addSwitch(light.x + 1, light.y, light.id);
      });
      pop.querySelector("#ae-lp-link-switch").addEventListener("click", function () {
        closeLightPopover();
        enterLinkMode("light", light.id);
      });

      setTimeout(function () {
        function onOutside(e) {
          if (pop.contains(e.target)) return;
          closeLightPopover();
          document.removeEventListener("mousedown", onOutside);
        }
        document.addEventListener("mousedown", onOutside);
      }, 50);
    }

    function closeLightPopover() {
      if (_lightPopover && _lightPopover.el) {
        _lightPopover.el.remove();
      }
      _lightPopover = null;
    }

    // ── Switch management ──

    function generateSwitchId() {
      return "sw-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 5);
    }

    function addSwitch(x, y, linkedLightId) {
      var data = getEncounterData();
      if (!data) return null;
      if (!data.switches) data.switches = [];
      var count = data.switches.length + 1;
      var sw = { id: generateSwitchId(), name: "Interruptor " + count, x: x, y: y, on: true, lightIds: linkedLightId ? [linkedLightId] : [] };
      data.switches.push(sw);
      var map = getMap();
      if (map) { map.switches = data.switches; map.invalidateLighting?.(); map.draw(); }
      saveFn();
      return sw;
    }

    function removeSwitch(switchId) {
      var data = getEncounterData();
      if (!data) return;
      data.switches = (data.switches || []).filter(function (s) { return s.id !== switchId; });
      var map = getMap();
      if (map) { map.switches = data.switches; map.selectedSwitchId = null; map.draw(); }
      closeSwitchPopover();
      saveFn();
    }

    function toggleSwitch(switchId) {
      var data = getEncounterData();
      var switches = (data && data.switches) || [];
      var lights = (data && data.lights) || [];
      var sw = switches.find(function (s) { return s.id === switchId; });
      if (!sw) return;
      sw.on = !sw.on;
      (sw.lightIds || []).forEach(function (lid) {
        var light = lights.find(function (l) { return l.id === lid; });
        if (light) light.on = sw.on;
      });
      var map = getMap();
      if (map) { map.invalidateLighting?.(); map.draw(); }
      saveFn();
    }

    function linkSwitchToLight(switchId, lightId) {
      var data = getEncounterData();
      var sw = (data && data.switches || []).find(function (s) { return s.id === switchId; });
      if (!sw) return;
      if (!sw.lightIds) sw.lightIds = [];
      if (sw.lightIds.indexOf(lightId) === -1) sw.lightIds.push(lightId);
      var map = getMap();
      if (map) { map.invalidateLighting?.(); map.draw(); }
      saveFn();
    }

    function unlinkSwitchFromLight(switchId, lightId) {
      var data = getEncounterData();
      var sw = (data && data.switches || []).find(function (s) { return s.id === switchId; });
      if (!sw) return;
      sw.lightIds = (sw.lightIds || []).filter(function (id) { return id !== lightId; });
      var map = getMap();
      if (map) map.draw();
      saveFn();
    }

    function findSwitchAt(cellX, cellY) {
      var data = getEncounterData();
      var switches = (data && data.switches) || [];
      var best = null, bestDist = 0.6;
      for (var i = 0; i < switches.length; i++) {
        var s = switches[i];
        var dx = cellX - s.x, dy = cellY - s.y;
        var d = Math.sqrt(dx * dx + dy * dy);
        if (d < bestDist) { bestDist = d; best = s; }
      }
      return best;
    }

    function openSwitchPopover(sw) {
      closeSwitchPopover();
      closeLightPopover();
      var map = getMap();
      if (!sw || !map) return;
      var gs = map.gridSize;
      var scale = map.scale;
      var rect = map.canvas.getBoundingClientRect();
      var screenX = rect.left + map.offsetX + sw.x * gs * scale;
      var screenY = rect.top + map.offsetY + sw.y * gs * scale;

      var data = getEncounterData();
      var lights = (data && data.lights) || [];
      var linkedLights = (sw.lightIds || []).map(function (lid) {
        return lights.find(function (l) { return l.id === lid; });
      }).filter(Boolean);

      var pop = document.createElement("div");
      pop.className = "ae-light-popover";

      var toggleLabel = sw.on !== false ? "Encendido" : "Apagado";
      var toggleClass = sw.on !== false ? "ae-btn--secondary" : "ae-btn--danger";
      var html = '<div class="ae-light-popover-row" style="justify-content:space-between;"><label>Interruptor</label>' +
        '<button id="ae-sp-toggle" class="ae-btn ' + toggleClass + '" type="button" style="padding:3px 10px;font-size:0.7rem;">' + toggleLabel + '</button></div>';

      if (linkedLights.length > 0) {
        html += '<div style="font-size:0.65rem;color:#888;text-transform:uppercase;letter-spacing:0.5px;margin-top:2px;">Luces conectadas</div>';
        for (var i = 0; i < linkedLights.length; i++) {
          var l = linkedLights[i];
          html += '<div class="ae-light-popover-row" style="justify-content:space-between;">' +
            '<span style="font-size:0.7rem;color:#ccc;">Luz (' + (l.radius || 4) + 'c)</span>' +
            '<button class="ae-sp-unlink" data-light-id="' + l.id + '" style="background:none;border:none;color:#cf5f5f;cursor:pointer;font-size:0.8rem;" title="Desvincular">✕</button></div>';
        }
      } else {
        html += '<div style="font-size:0.68rem;color:#666;padding:4px 0;">Sin luces conectadas</div>';
      }

      html += '<button id="ae-sp-link" class="ae-btn ae-btn--secondary ae-btn--full" type="button" style="margin-top:4px;">+ Vincular luz</button>';
      html += '<button id="ae-sp-delete" class="ae-btn ae-btn--danger ae-btn--full" type="button" style="margin-top:2px;">Eliminar</button>';

      pop.innerHTML = html;
      pop.style.left = Math.round(Math.min(screenX + 20, window.innerWidth - 230)) + "px";
      pop.style.top = Math.round(Math.min(screenY - 60, window.innerHeight - 200)) + "px";
      document.body.appendChild(pop);
      _switchPopover = { el: pop, switchId: sw.id };

      pop.querySelector("#ae-sp-toggle").addEventListener("click", function () {
        toggleSwitch(sw.id);
        openSwitchPopover(sw);
      });
      pop.querySelector("#ae-sp-link").addEventListener("click", function () {
        closeSwitchPopover();
        enterLinkMode("switch", sw.id);
      });
      pop.querySelector("#ae-sp-delete").addEventListener("click", function () { removeSwitch(sw.id); });
      pop.querySelectorAll(".ae-sp-unlink").forEach(function (btn) {
        btn.addEventListener("click", function () {
          unlinkSwitchFromLight(sw.id, btn.dataset.lightId);
          openSwitchPopover(sw);
        });
      });

      setTimeout(function () {
        function onOutside(e) {
          if (pop.contains(e.target)) return;
          closeSwitchPopover();
          document.removeEventListener("mousedown", onOutside);
        }
        document.addEventListener("mousedown", onOutside);
      }, 50);
    }

    function closeSwitchPopover() {
      if (_switchPopover && _switchPopover.el) _switchPopover.el.remove();
      _switchPopover = null;
    }

    // ── Link mode (connect lights ↔ switches) ──

    function enterLinkMode(fromType, fromId) {
      _linkMode = { fromType: fromType, fromId: fromId, pointer: null };
      var map = getMap();
      map?.canvas?.classList.add("light-placer-active");
      syncLinkModeToMap();
    }

    function exitLinkMode() {
      _linkMode = null;
      var map = getMap();
      map?.canvas?.classList.remove("light-placer-active");
      syncLinkModeToMap();
    }

    function updateLinkModePointer(cellX, cellY) {
      if (!_linkMode) return false;
      if (!Number.isFinite(cellX) || !Number.isFinite(cellY)) return false;
      _linkMode.pointer = { x: cellX, y: cellY };
      syncLinkModeToMap();
      return true;
    }

    function handleLinkModeClick(cellX, cellY, options) {
      if (!_linkMode) return false;
      if (options?.cancel === true || !Number.isFinite(cellX) || !Number.isFinite(cellY)) {
        exitLinkMode();
        return true;
      }
      var mode = _linkMode;
      _linkMode.pointer = { x: cellX, y: cellY };

      if (mode.fromType === "switch") {
        var light = findLightAt(cellX, cellY);
        if (light) {
          linkSwitchToLight(mode.fromId, light.id);
          syncLinkModeToMap();
        }
        return true;
      } else if (mode.fromType === "light") {
        var sw = findSwitchAt(cellX, cellY);
        if (sw) {
          linkSwitchToLight(sw.id, mode.fromId);
          syncLinkModeToMap();
        }
        return true;
      }
      syncLinkModeToMap();
      return true;
    }

    return {
      addLight: addLight,
      updateLight: updateLight,
      removeLight: removeLight,
      findLightAt: findLightAt,
      openLightPopover: openLightPopover,
      closeLightPopover: closeLightPopover,
      addSwitch: addSwitch,
      removeSwitch: removeSwitch,
      toggleSwitch: toggleSwitch,
      linkSwitchToLight: linkSwitchToLight,
      unlinkSwitchFromLight: unlinkSwitchFromLight,
      findSwitchAt: findSwitchAt,
      openSwitchPopover: openSwitchPopover,
      closeSwitchPopover: closeSwitchPopover,
      enterLinkMode: enterLinkMode,
      exitLinkMode: exitLinkMode,
      updateLinkModePointer: updateLinkModePointer,
      handleLinkModeClick: handleLinkModeClick,
      getLinkMode: function () {
        return _linkMode
          ? {
              fromType: _linkMode.fromType,
              fromId: _linkMode.fromId,
              pointer: _linkMode.pointer ? { x: _linkMode.pointer.x, y: _linkMode.pointer.y } : null,
            }
          : null;
      },
      isLinkMode: function () { return !!_linkMode; },
      destroy: function () { closeLightPopover(); closeSwitchPopover(); exitLinkMode(); },
    };
  }

  global.AELightSwitchManager = { createManager: createManager };
})(window);
