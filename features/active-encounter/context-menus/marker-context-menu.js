// Context menu for interactive markers (doors, windows, lights, switches, rooms).
// Reuses the same visual style as the token context menu.
(function initAEMarkerContextMenu(global) {
  "use strict";

  var MARKER_EMOJIS = {
    door: "\u{1F6AA}",
    window: "\u{1FA9F}",
    light: "\u{1F4A1}",
    switch: "\u{1F39A}\uFE0F",
    room: "\uD83C\uDFE0",
  };

  var MARKER_TYPE_LABELS = {
    door: "Puerta",
    window: "Ventana",
    light: "Luz",
    switch: "Interruptor",
    room: "Habitaci\u00f3n",
  };

  function createController(ctx) {
    var state = ctx.state;
    var canEditEncounter = ctx.canEditEncounter;
    var getMap = ctx.getMap;
    var getLightSwitchManager = ctx.getLightSwitchManager;
    var getRoomManager = ctx.getRoomManager;
    var saveEncounter = ctx.saveEncounter;

    var menuEl = null;
    var arrowEl = null;
    var primaryEl = null;
    var secondaryEl = null;
    var bodyEl = null; // alias for primaryEl (renderers write to this)
    var lastInfo = null;
    var lastPlacement = null;
    var activePanel = null;

    // ── DOM construction ──

    function ensureMenu() {
      if (menuEl) return menuEl;
      var menu = document.createElement("div");
      menu.className = "ae-token-context-menu ae-marker-context-menu";

      var arrow = document.createElement("div");
      arrow.className = "ae-token-context-menu-arrow";

      var wrapper = document.createElement("div");
      wrapper.className = "ae-token-context-body";

      var primary = document.createElement("div");
      primary.className = "ae-token-context-primary";

      var secondary = document.createElement("div");
      secondary.className = "ae-token-context-conditions";
      var secondaryList = document.createElement("div");
      secondaryList.className = "ae-token-context-conditions-list";
      secondary.appendChild(secondaryList);

      wrapper.appendChild(primary);
      wrapper.appendChild(secondary);

      menu.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      menu.appendChild(arrow);
      menu.appendChild(wrapper);
      document.body.appendChild(menu);

      menuEl = menu;
      arrowEl = arrow;
      primaryEl = primary;
      secondaryEl = secondaryList;
      bodyEl = primary;
      return menuEl;
    }

    function setExpanded(expanded) {
      if (!menuEl) return;
      menuEl.classList.toggle("is-expanded", !!expanded);
      requestAnimationFrame(function () { reposition(); });
    }

    function collapsePanel() {
      activePanel = null;
      setExpanded(false);
      if (secondaryEl) secondaryEl.innerHTML = "";
    }

    // ── Content renderers ──

    function renderHeader(emoji, label) {
      return '<div class="ae-marker-header">' +
        '<span class="ae-marker-header-icon">' + emoji + '</span>' +
        '<span class="ae-marker-header-label" data-role="name-display">' + escapeHtml(label) + '</span>' +
        '<button class="ae-marker-edit-name" data-role="edit-name" title="Renombrar">\u270F\uFE0F</button>' +
        '<input type="text" class="ae-marker-name-input" data-role="name-input" value="' + escapeHtml(label) + '" style="display:none;">' +
        '</div>';
    }

    function bindHeaderRename(onRename) {
      var display = bodyEl.querySelector('[data-role="name-display"]');
      var editBtn = bodyEl.querySelector('[data-role="edit-name"]');
      var input = bodyEl.querySelector('[data-role="name-input"]');
      if (!display || !editBtn || !input) return;

      function startEdit() {
        display.style.display = "none";
        editBtn.style.display = "none";
        input.style.display = "";
        input.focus();
        input.select();
      }
      function commitEdit() {
        var val = input.value.trim();
        if (val && typeof onRename === "function") onRename(val);
        display.textContent = val || display.textContent;
        display.style.display = "";
        editBtn.style.display = "";
        input.style.display = "none";
      }
      editBtn.addEventListener("click", function (e) { e.stopPropagation(); startEdit(); });
      input.addEventListener("keydown", function (e) {
        if (e.key === "Enter") { e.preventDefault(); commitEdit(); }
        if (e.key === "Escape") { e.preventDefault(); input.style.display = "none"; display.style.display = ""; editBtn.style.display = ""; }
      });
      input.addEventListener("blur", commitEdit);
    }

    function renderDoorWindow(wall) {
      var emoji = MARKER_EMOJIS[wall.type] || MARKER_EMOJIS.door;
      var label = wall.name || MARKER_TYPE_LABELS[wall.type] || wall.id;
      var isOpen = !!wall.doorOpen;
      var isLocked = !!wall.locked;
      var btnLabel = isOpen ? "Cerrar" : "Abrir";
      var lockLabel = isLocked ? "Bloqueada: S\u00ed" : "Bloqueada: No";

      bodyEl.innerHTML =
        renderHeader(emoji, label) +
        '<button class="ae-token-context-action" data-action="toggle-door">' + btnLabel + '</button>' +
        '<button class="ae-token-context-action' + (isLocked ? ' is-active' : '') + '" data-action="toggle-lock">\uD83D\uDD12 ' + lockLabel + '</button>' +
        '<button class="ae-token-context-action ae-token-context-action--danger" data-action="delete">Eliminar</button>';

      bodyEl.querySelector('[data-action="toggle-door"]').addEventListener("click", function (e) {
        e.stopPropagation();
        wall.doorOpen = !wall.doorOpen;
        var map = getMap?.();
        if (map) { map.invalidateFog?.(); map.invalidateLighting?.(); map.draw(); }
        saveEncounter?.();
        renderDoorWindow(wall);
        reposition();
      });
      bodyEl.querySelector('[data-action="toggle-lock"]').addEventListener("click", function (e) {
        e.stopPropagation();
        wall.locked = !wall.locked;
        var map = getMap?.();
        if (map) map.draw();
        saveEncounter?.();
        renderDoorWindow(wall);
        reposition();
      });
      bodyEl.querySelector('[data-action="delete"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        // Convert back to wall segment (don't leave a gap)
        wall.type = "wall";
        wall.doorOpen = false;
        wall.locked = false;
        wall.name = "Pared";
        var map = getMap?.();
        if (map) { map.invalidateFog?.(); map.invalidateLighting?.(); map.draw(); }
        saveEncounter?.();
      });
      bindHeaderRename(function (val) { wall.name = val; saveEncounter?.(); });
    }

    function renderLight(light) {
      var lsm = getLightSwitchManager?.();
      var data = state.encounter?.data;
      var switches = (data && data.switches) || [];
      var linkedSwitches = switches.filter(function (sw) {
        return (sw.lightIds || []).indexOf(light.id) !== -1;
      });
      var label = light.name || light.id;
      var isOn = light.on !== false;

      bodyEl.innerHTML =
        renderHeader(MARKER_EMOJIS.light, label) +
        '<button class="ae-token-context-action" data-action="toggle-light">' + (isOn ? "Apagar" : "Encender") + '</button>' +
        '<div class="ae-marker-props">' +
          '<div class="ae-marker-prop"><label>Color</label><input type="color" data-field="color" value="' + (light.color || "#ffcc66") + '"></div>' +
          '<div class="ae-marker-prop"><label>Fuerza</label><input type="range" data-field="intensity" min="0.1" max="1" step="0.05" value="' + (light.intensity != null ? light.intensity : 0.8) + '"><span class="ae-marker-prop-val" data-val="intensity">' + Math.round((light.intensity != null ? light.intensity : 0.8) * 100) + '%</span></div>' +
          '<div class="ae-marker-prop"><label>Radio</label><input type="range" data-field="radius" min="1" max="15" step="0.5" value="' + (light.radius || 4) + '"><span class="ae-marker-prop-val" data-val="radius">' + (light.radius || 4) + '</span></div>' +
        '</div>' +
        (linkedSwitches.length > 0
          ? '<div class="ae-marker-linked-title">Interruptores</div>' +
            linkedSwitches.map(function (sw) {
              return '<div class="ae-marker-linked-row">' +
                '<span>' + MARKER_EMOJIS["switch"] + ' ' + escapeHtml(sw.id) + '</span>' +
                '<button class="ae-marker-unlink" data-switch-id="' + sw.id + '" title="Desvincular">\u2715</button>' +
                '</div>';
            }).join("")
          : '<div class="ae-marker-empty">Sin interruptores</div>') +
        '<button class="ae-token-context-action" data-action="link-switch">Vincular interruptor</button>' +
        '<button class="ae-token-context-action" data-action="create-switch">Crear interruptor</button>' +
        '<button class="ae-token-context-action ae-token-context-action--danger" data-action="delete">Eliminar</button>';

      // Toggle on/off
      bodyEl.querySelector('[data-action="toggle-light"]').addEventListener("click", function (e) {
        e.stopPropagation();
        light.on = !(light.on !== false);
        lsm?.updateLight(light.id, { on: light.on });
        renderLight(light);
        reposition();
      });
      // Color
      bodyEl.querySelector('[data-field="color"]').addEventListener("input", function (e) {
        lsm?.updateLight(light.id, { color: e.target.value });
      });
      // Intensity
      bodyEl.querySelector('[data-field="intensity"]').addEventListener("input", function (e) {
        var v = parseFloat(e.target.value);
        bodyEl.querySelector('[data-val="intensity"]').textContent = Math.round(v * 100) + "%";
        lsm?.updateLight(light.id, { intensity: v });
      });
      // Radius
      bodyEl.querySelector('[data-field="radius"]').addEventListener("input", function (e) {
        var v = parseFloat(e.target.value);
        bodyEl.querySelector('[data-val="radius"]').textContent = v;
        lsm?.updateLight(light.id, { radius: v });
      });
      // Unlink
      bodyEl.querySelectorAll(".ae-marker-unlink").forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          lsm?.unlinkSwitchFromLight(btn.dataset.switchId, light.id);
          renderLight(light);
          reposition();
        });
      });
      // Link switch
      bodyEl.querySelector('[data-action="link-switch"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        lsm?.enterLinkMode("light", light.id);
      });
      // Create switch
      bodyEl.querySelector('[data-action="create-switch"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        lsm?.addSwitch(light.x + 1, light.y, light.id);
      });
      // Delete
      bodyEl.querySelector('[data-action="delete"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        lsm?.removeLight(light.id);
      });
      bindHeaderRename(function (val) { light.name = val; lsm?.updateLight(light.id, { name: val }); });
    }

    function renderSwitch(sw) {
      var lsm = getLightSwitchManager?.();
      var data = state.encounter?.data;
      var lights = (data && data.lights) || [];
      var linkedLights = (sw.lightIds || []).map(function (lid) {
        return lights.find(function (l) { return l.id === lid; });
      }).filter(Boolean);
      var label = sw.name || sw.id;
      var isOn = sw.on !== false;

      bodyEl.innerHTML =
        renderHeader(MARKER_EMOJIS["switch"], label) +
        '<button class="ae-token-context-action" data-action="toggle-switch">' + (isOn ? "Apagar" : "Encender") + '</button>' +
        (linkedLights.length > 0
          ? '<div class="ae-marker-linked-title">Luces conectadas</div>' +
            linkedLights.map(function (l) {
              return '<div class="ae-marker-linked-row">' +
                '<span>' + MARKER_EMOJIS.light + ' Radio ' + (l.radius || 4) + '</span>' +
                '<button class="ae-marker-unlink" data-light-id="' + l.id + '" title="Desvincular">\u2715</button>' +
                '</div>';
            }).join("")
          : '<div class="ae-marker-empty">Sin luces conectadas</div>') +
        '<button class="ae-token-context-action" data-action="link-light">Vincular luz</button>' +
        '<button class="ae-token-context-action ae-token-context-action--danger" data-action="delete">Eliminar</button>';

      bodyEl.querySelector('[data-action="toggle-switch"]').addEventListener("click", function (e) {
        e.stopPropagation();
        lsm?.toggleSwitch(sw.id);
        renderSwitch(sw);
        reposition();
      });
      bodyEl.querySelectorAll(".ae-marker-unlink").forEach(function (btn) {
        btn.addEventListener("click", function (ev) {
          ev.stopPropagation();
          lsm?.unlinkSwitchFromLight(sw.id, btn.dataset.lightId);
          renderSwitch(sw);
          reposition();
        });
      });
      bodyEl.querySelector('[data-action="link-light"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        lsm?.enterLinkMode("switch", sw.id);
      });
      bodyEl.querySelector('[data-action="delete"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        lsm?.removeSwitch(sw.id);
      });
      bindHeaderRename(function (val) { sw.name = val; saveEncounter?.(); });
    }

    // ── Room wall helpers ──

    function isPointOnSegment(px, py, ax, ay, bx, by) {
      var cross = (bx - ax) * (py - ay) - (by - ay) * (px - ax);
      if (Math.abs(cross) > 0.15) return false;
      var dx = bx - ax, dy = by - ay;
      var lenSq = dx * dx + dy * dy;
      if (lenSq === 0) return Math.abs(px - ax) < 0.15 && Math.abs(py - ay) < 0.15;
      var t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
      return t >= -0.01 && t <= 1.01;
    }

    function isWallOnRoomEdge(w, poly) {
      var n = poly.length;
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        if (isPointOnSegment(w.x1, w.y1, poly[i].x, poly[i].y, poly[j].x, poly[j].y) &&
            isPointOnSegment(w.x2, w.y2, poly[i].x, poly[i].y, poly[j].x, poly[j].y)) {
          return true;
        }
      }
      return false;
    }

    function countRoomWalls(room) {
      var walls = state.encounter?.data?.walls || [];
      var poly = room.polygon;
      if (!poly || poly.length < 3) return 0;
      var count = 0;
      for (var i = 0; i < walls.length; i++) {
        if (isWallOnRoomEdge(walls[i], poly)) count++;
      }
      return count;
    }

    function createRoomWalls(room) {
      var data = state.encounter?.data;
      if (!data) return;
      var walls = data.walls || [];
      var poly = room.polygon;
      if (!poly || poly.length < 3) return;
      var n = poly.length;
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n;
        var typeCount = walls.filter(function (w) { return w.type === "wall"; }).length + 1;
        walls.push({
          id: "wall-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 6),
          name: "Pared " + typeCount,
          x1: poly[i].x, y1: poly[i].y,
          x2: poly[j].x, y2: poly[j].y,
          type: "wall", doorOpen: false,
        });
      }
      data.walls = walls;
      var map = getMap?.();
      if (map) {
        map.walls = walls;
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveEncounter?.();
    }

    function removeRoomWalls(room) {
      var data = state.encounter?.data;
      if (!data) return;
      var walls = data.walls || [];
      var poly = room.polygon;
      if (!poly || poly.length < 3) return;
      data.walls = walls.filter(function (w) { return !isWallOnRoomEdge(w, poly); });
      var map = getMap?.();
      if (map) {
        map.walls = data.walls;
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveEncounter?.();
    }

    function renderWallsPanel(room) {
      if (!secondaryEl) return;
      activePanel = "walls";
      var wallCount = countRoomWalls(room);
      var hasWalls = wallCount > 0;

      secondaryEl.innerHTML = "";
      secondaryEl.classList.remove("is-grid");

      if (hasWalls) {
        var info = document.createElement("div");
        info.className = "ae-marker-panel-info";
        info.textContent = wallCount + " pared" + (wallCount !== 1 ? "es" : "") + " en esta habitaci\u00f3n";
        secondaryEl.appendChild(info);

        var removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "ae-token-condition-item";
        removeBtn.innerHTML = '<span class="ae-token-condition-name" style="color:#cf5f5f;">Eliminar paredes</span>';
        removeBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          removeRoomWalls(room);
          renderWallsPanel(room);
        });
        secondaryEl.appendChild(removeBtn);
      } else {
        var createBtn = document.createElement("button");
        createBtn.type = "button";
        createBtn.className = "ae-token-condition-item";
        createBtn.innerHTML = '<span class="ae-token-condition-name">Crear paredes</span>';
        createBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          createRoomWalls(room);
          renderWallsPanel(room);
        });
        secondaryEl.appendChild(createBtn);
      }

      setExpanded(true);
    }

    function renderRoom(room) {
      var rm = getRoomManager?.();
      var ambI = (room.ambientLight && room.ambientLight.intensity != null) ? room.ambientLight.intensity : 0;
      var ambC = (room.ambientLight && room.ambientLight.color) || "#8090b0";
      var label = room.name || room.id;

      bodyEl.innerHTML =
        renderHeader(MARKER_EMOJIS.room, label) +
        '<div class="ae-marker-props">' +
          '<div class="ae-marker-prop"><label>Ambiente</label><input type="range" data-field="ambient" min="0" max="1" step="0.05" value="' + ambI + '"><span class="ae-marker-prop-val" data-val="ambient">' + Math.round(ambI * 100) + '%</span></div>' +
          '<div class="ae-marker-prop"><label>Color</label><input type="color" data-field="ambientColor" value="' + ambC + '"></div>' +
        '</div>' +
        '<button class="ae-token-context-action" data-action="toggle-walls-panel">' +
          '<span class="ae-token-context-action-label">Paredes</span>' +
          '<span class="ae-token-context-chevron">\u203A</span>' +
        '</button>' +
        '<button class="ae-token-context-action ae-token-context-action--danger" data-action="delete">Eliminar</button>';

      bindHeaderRename(function (val) { room.name = val; rm?.updateRoom(room.id, { name: val }); });

      // Walls panel toggle (expands to the right like token conditions)
      bodyEl.querySelector('[data-action="toggle-walls-panel"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        if (activePanel === "walls") {
          collapsePanel();
          bodyEl.querySelector('[data-action="toggle-walls-panel"]')?.classList.remove("is-active");
        } else {
          renderWallsPanel(room);
          bodyEl.querySelector('[data-action="toggle-walls-panel"]')?.classList.add("is-active");
        }
      });

      bodyEl.querySelector('[data-field="ambient"]').addEventListener("input", function (e) {
        var v = parseFloat(e.target.value);
        bodyEl.querySelector('[data-val="ambient"]').textContent = Math.round(v * 100) + "%";
        var al = room.ambientLight || {};
        al.intensity = v;
        room.ambientLight = al;
        rm?.updateRoom(room.id, { ambientLight: al });
      });
      bodyEl.querySelector('[data-field="ambientColor"]').addEventListener("input", function (e) {
        var al = room.ambientLight || {};
        al.color = e.target.value;
        room.ambientLight = al;
        rm?.updateRoom(room.id, { ambientLight: al });
      });
      bodyEl.querySelector('[data-action="delete"]')?.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        rm?.removeRoom(room.id);
      });
    }

    // ── Positioning (same logic as token context menu) ──

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function placeMenu(anchor) {
      if (!menuEl) return;
      var mw = menuEl.offsetWidth || 210;
      var mh = menuEl.offsetHeight || 80;
      var margin = 10;
      var gap = 28;
      var maxL = window.innerWidth - mw - margin;
      var maxT = window.innerHeight - mh - margin;

      var candidates = [
        { p: "above", l: anchor.x - mw / 2, t: anchor.y - mh - gap },
        { p: "below", l: anchor.x - mw / 2, t: anchor.y + gap },
        { p: "right", l: anchor.x + gap, t: anchor.y - mh / 2 },
        { p: "left",  l: anchor.x - mw - gap, t: anchor.y - mh / 2 },
      ];
      if (lastPlacement) {
        candidates.sort(function (a, b) {
          return (a.p === lastPlacement ? -1 : 0) - (b.p === lastPlacement ? -1 : 0);
        });
      }

      var best = candidates[0];
      for (var i = 0; i < candidates.length; i++) {
        var c = candidates[i];
        c.l = clamp(c.l, margin, maxL);
        c.t = clamp(c.t, margin, maxT);
        if (c.l >= margin && c.l <= maxL && c.t >= margin && c.t <= maxT) {
          best = c;
          break;
        }
      }

      lastPlacement = best.p;
      menuEl.style.left = Math.round(best.l) + "px";
      menuEl.style.top = Math.round(best.t) + "px";

      if (arrowEl) {
        var ah = 6;
        arrowEl.style.left = "";
        arrowEl.style.top = "";
        arrowEl.classList.remove("is-top", "is-left", "is-right");
        var ax = clamp(anchor.x - best.l, 14, mw - 14);
        var ay = clamp(anchor.y - best.t, 14, mh - 14);
        if (best.p === "below") {
          arrowEl.classList.add("is-top");
          arrowEl.style.left = Math.round(ax - ah) + "px";
        } else if (best.p === "right") {
          arrowEl.classList.add("is-left");
          arrowEl.style.top = Math.round(ay - ah) + "px";
        } else if (best.p === "left") {
          arrowEl.classList.add("is-right");
          arrowEl.style.top = Math.round(ay - ah) + "px";
        } else {
          arrowEl.style.left = Math.round(ax - ah) + "px";
        }
      }
    }

    function reposition() {
      if (lastInfo) {
        menuEl.classList.add("is-measuring");
        placeMenu(lastInfo);
        menuEl.classList.remove("is-measuring");
      }
    }

    // ── Public API ──

    function open(info) {
      if (!info || !canEditEncounter?.()) { hide(); return; }
      ensureMenu();
      collapsePanel();
      lastInfo = { x: info.clientX, y: info.clientY };
      lastPlacement = null;

      if (info.type === "door" || info.type === "window") {
        renderDoorWindow(info.wall);
      } else if (info.type === "light") {
        renderLight(info.light);
      } else if (info.type === "switch") {
        renderSwitch(info.sw);
      } else if (info.type === "room") {
        renderRoom(info.room);
      } else {
        hide(); return;
      }

      menuEl.classList.add("is-open", "is-measuring");
      placeMenu(lastInfo);
      menuEl.classList.remove("is-measuring");

      // Close on outside click
      setTimeout(function () {
        function onOutside(e) {
          if (menuEl && menuEl.contains(e.target)) return;
          hide();
          document.removeEventListener("mousedown", onOutside);
        }
        document.addEventListener("mousedown", onOutside);
      }, 50);
    }

    function hide() {
      if (!menuEl) return;
      menuEl.classList.remove("is-open", "is-measuring");
      lastInfo = null;
    }

    function isOpen() {
      return !!menuEl && menuEl.classList.contains("is-open");
    }

    function contains(target) {
      return !!menuEl && menuEl.contains(target);
    }

    function destroy() {
      hide();
      if (menuEl?.parentNode) menuEl.parentNode.removeChild(menuEl);
      menuEl = null;
      arrowEl = null;
      bodyEl = null;
    }

    return { open: open, hide: hide, isOpen: isOpen, contains: contains, destroy: destroy };
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  global.AEMarkerContextMenu = { createController: createController };
})(window);
