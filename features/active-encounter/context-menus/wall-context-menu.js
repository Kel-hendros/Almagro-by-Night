// Context menu for walls and vertices in the Elements layer.
// Right-click on vertex: option to delete (merge adjacent walls)
// Right-click on wall: options to delete or add vertex
(function initAEWallContextMenu(global) {
  "use strict";

  function createController(ctx) {
    var state = ctx.state;
    var canEditEncounter = ctx.canEditEncounter;
    var getMap = ctx.getMap;
    var getWallDrawer = ctx.getWallDrawer;
    var getPaperEditor = ctx.getPaperEditor;
    var saveEncounter = ctx.saveEncounter;

    var menuEl = null;
    var arrowEl = null;
    var bodyEl = null;
    var lastInfo = null;
    var lastPlacement = null;

    // ── DOM construction ──

    function ensureMenu() {
      if (menuEl) return menuEl;
      var menu = document.createElement("div");
      menu.className = "ae-token-context-menu ae-wall-context-menu";

      var arrow = document.createElement("div");
      arrow.className = "ae-token-context-menu-arrow";

      var wrapper = document.createElement("div");
      wrapper.className = "ae-token-context-body";

      var primary = document.createElement("div");
      primary.className = "ae-token-context-primary";

      wrapper.appendChild(primary);
      menu.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      menu.appendChild(arrow);
      menu.appendChild(wrapper);
      document.body.appendChild(menu);

      menuEl = menu;
      arrowEl = arrow;
      bodyEl = primary;
      return menuEl;
    }

    // ── Content renderers ──

    function renderVertexMenu(info) {
      bodyEl.innerHTML =
        '<div class="ae-wall-context-header">' +
          '<span class="ae-wall-context-icon">\u25C9</span>' +
          '<span>V\u00e9rtice</span>' +
        '</div>' +
        '<button class="ae-token-context-action ae-token-context-action--danger" data-action="delete-vertex">Borrar</button>';

      bodyEl.querySelector('[data-action="delete-vertex"]').addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        deleteVertex(info);
      });
    }

    function renderWallMenu(info) {
      var curveType = info.curveType || "wall";
      var isDoorOrWindow = curveType === "door" || curveType === "window";
      var isDoor = curveType === "door";
      var isOpen = info.isDoorOpen || false;

      var headerIcon = isDoor ? "\uD83D\uDEAA" : (curveType === "window" ? "\uD83E\uDE9F" : "\u2501");
      var headerText = isDoor ? "Puerta" : (curveType === "window" ? "Ventana" : "Pared");

      var html =
        '<div class="ae-wall-context-header">' +
          '<span class="ae-wall-context-icon">' + headerIcon + '</span>' +
          '<span>' + headerText + '</span>' +
        '</div>';

      // Door-specific: open/close toggle
      if (isDoor) {
        var toggleText = isOpen ? "Cerrar puerta" : "Abrir puerta";
        var toggleIcon = isOpen ? "\uD83D\uDD12" : "\uD83D\uDD13";
        html += '<button class="ae-token-context-action" data-action="toggle-door">' + toggleIcon + ' ' + toggleText + '</button>';
      }

      // Convert to wall (for doors/windows)
      if (isDoorOrWindow) {
        html += '<button class="ae-token-context-action" data-action="convert-to-wall">\u2501 Convertir a pared</button>';
      }

      // Standard wall actions
      html += '<button class="ae-token-context-action" data-action="add-vertex">Agregar v\u00e9rtice</button>';
      html += '<button class="ae-token-context-action ae-token-context-action--danger" data-action="delete-wall">Borrar</button>';

      bodyEl.innerHTML = html;

      // Bind event handlers
      var toggleBtn = bodyEl.querySelector('[data-action="toggle-door"]');
      var convertBtn = bodyEl.querySelector('[data-action="convert-to-wall"]');
      var addBtn = bodyEl.querySelector('[data-action="add-vertex"]');
      var deleteBtn = bodyEl.querySelector('[data-action="delete-wall"]');

      if (toggleBtn) {
        toggleBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          hide();
          toggleDoor(info);
        });
      }

      if (convertBtn) {
        convertBtn.addEventListener("click", function (e) {
          e.stopPropagation();
          hide();
          convertToWall(info);
        });
      }

      addBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        hide();
        addVertexToWall(info);
      });

      // Delete button hover: highlight wall in red
      deleteBtn.addEventListener("mouseenter", function () {
        setHighlightWall(info.wall?.id || null);
      });
      deleteBtn.addEventListener("mouseleave", function () {
        setHighlightWall(null);
      });
      deleteBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        setHighlightWall(null);
        hide();
        deleteWall(info);
      });
    }

    function toggleDoor(info) {
      var paperEditor = getPaperEditor?.();
      var paperPath = info.path || info._paperPath;
      if (paperEditor?.isActive() && paperPath && typeof info.curveIndex === "number") {
        paperEditor.toggleDoorState(paperPath, info.curveIndex);
      }
    }

    function convertToWall(info) {
      var paperEditor = getPaperEditor?.();
      var paperPath = info.path || info._paperPath;
      if (paperEditor?.isActive() && paperPath && typeof info.curveIndex === "number") {
        paperEditor.setCurveType(paperPath, info.curveIndex, "wall");
      }
    }

    // ── Actions ──

    function setHighlightWall(wallId) {
      var map = getMap?.();
      if (!map) return;
      if (!map._wallDrawerState) map._wallDrawerState = {};
      map._wallDrawerState.eraseHoverWallId = wallId || null;
      map.draw();
    }

    function deleteVertex(info) {
      // Use Paper.js editor if available
      var paperEditor = getPaperEditor?.();
      var paperSegment = info.segment || info._paperSegment;
      if (paperEditor?.isActive() && paperSegment) {
        paperEditor.deleteSegment(paperSegment);
        return;
      }

      // Fallback to old wall segment logic
      var wallDrawer = getWallDrawer?.();
      if (!wallDrawer) return;
      var walls = state.encounter?.data?.walls || [];
      var vx = info.vertex.x;
      var vy = info.vertex.y;

      // Find all walls connected to this vertex
      var connectedWalls = [];
      for (var i = 0; i < walls.length; i++) {
        var w = walls[i];
        var isStart = Math.abs(w.x1 - vx) < 0.001 && Math.abs(w.y1 - vy) < 0.001;
        var isEnd = Math.abs(w.x2 - vx) < 0.001 && Math.abs(w.y2 - vy) < 0.001;
        if (isStart || isEnd) {
          connectedWalls.push({ wall: w, isStart: isStart, isEnd: isEnd });
        }
      }

      if (connectedWalls.length === 0) return;

      if (connectedWalls.length === 2) {
        // Merge two walls into one
        var w1 = connectedWalls[0];
        var w2 = connectedWalls[1];

        // Get the endpoints that are NOT at the deleted vertex
        var otherEnd1 = w1.isStart ? { x: w1.wall.x2, y: w1.wall.y2 } : { x: w1.wall.x1, y: w1.wall.y1 };
        var otherEnd2 = w2.isStart ? { x: w2.wall.x2, y: w2.wall.y2 } : { x: w2.wall.x1, y: w2.wall.y1 };

        // Create merged wall
        var mergedWall = {
          id: w1.wall.id,
          type: w1.wall.type || "wall",
          x1: otherEnd1.x,
          y1: otherEnd1.y,
          x2: otherEnd2.x,
          y2: otherEnd2.y,
        };

        // Remove both original walls, add merged
        var newWalls = walls.filter(function (w) {
          return w.id !== w1.wall.id && w.id !== w2.wall.id;
        });
        newWalls.push(mergedWall);

        state.encounter.data.walls = newWalls;
        syncMapAndSave();
      } else if (connectedWalls.length === 1) {
        // Single wall: just delete it entirely
        var newWalls = walls.filter(function (w) {
          return w.id !== connectedWalls[0].wall.id;
        });
        state.encounter.data.walls = newWalls;
        syncMapAndSave();
      } else {
        // Junction with 3+ walls: delete all walls at this vertex
        var idsToRemove = new Set(connectedWalls.map(function (cw) { return cw.wall.id; }));
        var newWalls = walls.filter(function (w) { return !idsToRemove.has(w.id); });
        state.encounter.data.walls = newWalls;
        syncMapAndSave();
      }
    }

    function deleteWall(info) {
      // Use Paper.js editor if available
      var paperEditor = getPaperEditor?.();
      var paperLocation = info.location || info._paperLocation;
      if (paperEditor?.isActive() && paperLocation) {
        // Delete just the wall segment (curve), not the whole path
        paperEditor.deleteWallSegment(paperLocation);
        return;
      }

      // Fallback to old wall segment logic
      var walls = state.encounter?.data?.walls || [];
      var wallId = info.wall?.id;
      if (!wallId) return;

      var newWalls = walls.filter(function (w) { return w.id !== wallId; });
      state.encounter.data.walls = newWalls;
      syncMapAndSave();
    }

    function addVertexToWall(info) {
      // Use Paper.js editor if available
      var paperEditor = getPaperEditor?.();
      var paperLocation = info.location || info._paperLocation;
      if (paperEditor?.isActive() && paperLocation) {
        paperEditor.addVertexAtLocation(paperLocation);
        return;
      }

      // Fallback to old wall segment logic
      var walls = state.encounter?.data?.walls || [];
      var wall = info.wall;
      if (!wall) return;

      // Calculate the point on the wall nearest to the click
      var clickX = info.cellX;
      var clickY = info.cellY;
      var px = projectPointOnSegment(clickX, clickY, wall.x1, wall.y1, wall.x2, wall.y2);

      // Generate new wall ID
      var newId = "wall-" + Date.now() + "-" + Math.random().toString(36).substr(2, 6);

      // Create two new walls from the split
      var wall1 = {
        id: wall.id,
        type: wall.type || "wall",
        x1: wall.x1,
        y1: wall.y1,
        x2: px.x,
        y2: px.y,
      };

      var wall2 = {
        id: newId,
        type: wall.type || "wall",
        x1: px.x,
        y1: px.y,
        x2: wall.x2,
        y2: wall.y2,
      };

      // Replace original wall with two new segments
      var newWalls = walls.map(function (w) {
        if (w.id === wall.id) return wall1;
        return w;
      });
      newWalls.push(wall2);

      state.encounter.data.walls = newWalls;
      syncMapAndSave();
    }

    function projectPointOnSegment(px, py, x1, y1, x2, y2) {
      var dx = x2 - x1;
      var dy = y2 - y1;
      var lenSq = dx * dx + dy * dy;
      if (lenSq < 0.0001) return { x: x1, y: y1 };

      var t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lenSq));
      return { x: x1 + t * dx, y: y1 + t * dy };
    }

    function syncMapAndSave() {
      var map = getMap?.();
      if (map) {
        map.walls = state.encounter?.data?.walls || [];
        map.invalidateFog?.();
        map.invalidateLightingWalls?.();
        map.draw();
      }
      saveEncounter?.();
      // Notify Paper.js editor to refresh
      document.dispatchEvent(new CustomEvent("ae-walls-changed"));
    }

    // ── Positioning (same logic as other context menus) ──

    function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

    function placeMenu(anchor) {
      if (!menuEl) return;
      var mw = menuEl.offsetWidth || 150;
      var mh = menuEl.offsetHeight || 80;
      var margin = 10;
      var gap = 20;
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
      lastInfo = { x: info.clientX, y: info.clientY };
      lastPlacement = null;

      if (info.type === "vertex") {
        renderVertexMenu(info);
      } else if (info.type === "wall") {
        renderWallMenu(info);
      } else {
        hide();
        return;
      }

      menuEl.classList.add("is-open", "is-measuring");
      placeMenu(lastInfo);
      menuEl.classList.remove("is-measuring");

      // Close on outside click
      setTimeout(function () {
        function onOutside(e) {
          if (menuEl && menuEl.contains(e.target)) return;
          setHighlightWall(null);
          hide();
          document.removeEventListener("mousedown", onOutside);
        }
        document.addEventListener("mousedown", onOutside);
      }, 50);
    }

    function hide() {
      if (!menuEl) return;
      menuEl.classList.remove("is-open", "is-measuring");
      setHighlightWall(null);
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

  global.AEWallContextMenu = { createController: createController };
})(window);
