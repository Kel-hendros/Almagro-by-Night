// Room drawing tool for the tactical map.
// Follows the same factory pattern as wall-drawer.js.
(function initRoomDrawerModule(global) {
  "use strict";

  var SNAP_RADIUS = 0.45;
  var SNAP_DISPLAY_RANGE = 3;
  var CLOSE_RADIUS = 0.45;

  function createRoomDrawer(opts) {
    var getMap = opts.getMap;
    var getRooms = opts.getRooms;
    var setRooms = opts.setRooms;
    var onChanged = opts.onChanged;
    var canEdit = opts.canEdit || function () { return true; };
    var roomManager = opts.roomManager;

    var active = false;
    var mode = "draw"; // "draw" | "select" | "erase"
    var vertices = [];
    var selectedRoomId = null;
    var _roomPopover = null;
    var saveTimer = null;
    var SAVE_DELAY = 600;

    function scheduleSave() {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(function () {
        if (typeof onChanged === "function") onChanged();
      }, SAVE_DELAY);
    }

    function isActive() { return active; }
    function getMode() { return mode; }

    function activate(newMode) {
      if (!canEdit()) return;
      active = true;
      mode = newMode || "draw";
      vertices = [];
      selectedRoomId = null;
      closeRoomPopover();
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.add("room-drawer-active");
        map._roomDrawerState = {
          active: true,
          mode: mode,
          vertices: [],
          snapTarget: null,
          snapPoints: [],
          selectedRoomId: null,
        };
        map.draw();
      }
    }

    function deactivate() {
      active = false;
      vertices = [];
      selectedRoomId = null;
      closeRoomPopover();
      var map = getMap?.();
      if (map) {
        map.canvas?.classList.remove("room-drawer-active");
        map._roomDrawerState = null;
        map.draw();
      }
    }

    function setMode(newMode) {
      mode = newMode;
      vertices = [];
      selectedRoomId = null;
      closeRoomPopover();
      var map = getMap?.();
      if (map && map._roomDrawerState) {
        map._roomDrawerState.mode = mode;
        map._roomDrawerState.vertices = [];
        map._roomDrawerState.selectedRoomId = null;
      }
      map?.draw();
    }

    function findSnapIntersection(cellX, cellY) {
      var ix = Math.round(cellX);
      var iy = Math.round(cellY);
      var dist = Math.sqrt((cellX - ix) * (cellX - ix) + (cellY - iy) * (cellY - iy));
      if (dist <= SNAP_RADIUS) return { x: ix, y: iy };
      return null;
    }

    function getSnapPoints(cellX, cellY) {
      var points = [];
      var cx = Math.round(cellX);
      var cy = Math.round(cellY);
      for (var dy = -SNAP_DISPLAY_RANGE; dy <= SNAP_DISPLAY_RANGE; dy++) {
        for (var dx = -SNAP_DISPLAY_RANGE; dx <= SNAP_DISPLAY_RANGE; dx++) {
          points.push({ x: cx + dx, y: cy + dy });
        }
      }
      return points;
    }

    function isCloseToFirst(snap) {
      if (!snap || vertices.length < 3) return false;
      var dx = snap.x - vertices[0].x;
      var dy = snap.y - vertices[0].y;
      return Math.sqrt(dx * dx + dy * dy) <= CLOSE_RADIUS;
    }

    function closePolygon() {
      if (vertices.length < 3) { vertices = []; return; }
      var name = prompt("Nombre de la habitación:", "");
      if (name === null) { vertices = []; syncState(); return; } // cancelled
      var polygon = vertices.slice();
      vertices = [];
      if (roomManager) {
        roomManager.addRoom(polygon, name);
      }
      syncState();
    }

    function handleMouseDown(e, cellX, cellY) {
      if (!active || !canEdit()) return false;

      if (e.button === 2) {
        // Right-click: cancel vertices in draw mode
        if (mode === "draw" && vertices.length > 0) {
          vertices = [];
          syncState();
          return true;
        }
        return false;
      }
      if (e.button !== 0) return false;

      if (mode === "draw") {
        var snap = findSnapIntersection(cellX, cellY);
        if (!snap) return true;

        // Check if closing the polygon
        if (isCloseToFirst(snap)) {
          closePolygon();
          return true;
        }

        // Check for duplicate vertex
        for (var i = 0; i < vertices.length; i++) {
          if (vertices[i].x === snap.x && vertices[i].y === snap.y) return true;
        }

        vertices.push(snap);
        syncState();
        return true;
      }

      if (mode === "select") {
        var room = roomManager?.findRoomAt(cellX, cellY);
        if (room) {
          selectedRoomId = room.id;
          syncState();
          openRoomPopover(room);
        } else {
          selectedRoomId = null;
          closeRoomPopover();
          syncState();
        }
        return true;
      }

      if (mode === "erase") {
        var room = roomManager?.findRoomAt(cellX, cellY);
        if (room) {
          if (confirm("¿Eliminar habitación" + (room.name ? ' "' + room.name + '"' : "") + "?")) {
            roomManager.removeRoom(room.id);
            syncState();
          }
        }
        return true;
      }

      return false;
    }

    function handleMouseMove(e, cellX, cellY) {
      if (!active) return false;
      var map = getMap?.();
      if (!map || !map._roomDrawerState) return false;
      var st = map._roomDrawerState;

      if (mode === "draw") {
        st.snapTarget = findSnapIntersection(cellX, cellY);
        st.snapPoints = getSnapPoints(cellX, cellY);
        st.vertices = vertices;
        map.draw();
      }
      return false;
    }

    function handleMouseUp() { return false; }

    function handleDblClick(e, cellX, cellY) {
      if (!active || mode !== "draw") return false;
      if (vertices.length >= 3) {
        closePolygon();
        return true;
      }
      return false;
    }

    function handleKeyDown(e) {
      if (!active) return false;
      if (e.key === "Escape") {
        if (mode === "draw" && vertices.length > 0) {
          vertices = [];
          syncState();
          return true;
        }
        return false;
      }
      return false;
    }

    function syncState() {
      var map = getMap?.();
      if (!map) return;
      var st = map._roomDrawerState;
      if (st) {
        st.vertices = vertices;
        st.selectedRoomId = selectedRoomId;
      }
      map.draw();
    }

    function openRoomPopover(room) {
      closeRoomPopover();
      var map = getMap?.();
      if (!room || !map) return;

      // Compute centroid for positioning
      var poly = room.polygon;
      var cx = 0, cy = 0;
      for (var i = 0; i < poly.length; i++) { cx += poly[i].x; cy += poly[i].y; }
      cx /= poly.length; cy /= poly.length;

      var gs = map.gridSize;
      var scale = map.scale;
      var rect = map.canvas.getBoundingClientRect();
      var screenX = rect.left + map.offsetX + cx * gs * scale;
      var screenY = rect.top + map.offsetY + cy * gs * scale;

      var ambI = (room.ambientLight && room.ambientLight.intensity != null) ? room.ambientLight.intensity : 0;
      var ambC = (room.ambientLight && room.ambientLight.color) || "#8090b0";

      var pop = document.createElement("div");
      pop.className = "ae-light-popover";
      pop.innerHTML =
        '<div class="ae-light-popover-row"><label>Nombre</label><input type="text" id="ae-rp-name" value="' + (room.name || "").replace(/"/g, "&quot;") + '" class="ae-browser-search" style="width:120px;padding:3px 6px;font-size:0.72rem;"></div>' +
        '<div class="ae-light-popover-row"><label>Luz ambiente</label><input type="range" id="ae-rp-intensity" min="0" max="1" step="0.05" value="' + ambI + '"><span class="ae-light-range-val" id="ae-rp-int-val">' + Math.round(ambI * 100) + '%</span></div>' +
        '<div class="ae-light-popover-row"><label>Color</label><input type="color" id="ae-rp-color" value="' + ambC + '"></div>' +
        '<button class="ae-btn ae-btn--danger ae-btn--full" id="ae-rp-delete" type="button" style="margin-top:4px;">Eliminar</button>';

      pop.style.left = Math.round(Math.min(screenX + 20, window.innerWidth - 230)) + "px";
      pop.style.top = Math.round(Math.min(screenY - 60, window.innerHeight - 200)) + "px";
      document.body.appendChild(pop);
      _roomPopover = { el: pop, roomId: room.id };

      pop.querySelector("#ae-rp-name").addEventListener("input", function (e) {
        roomManager?.updateRoom(room.id, { name: e.target.value });
      });
      pop.querySelector("#ae-rp-intensity").addEventListener("input", function (e) {
        var v = parseFloat(e.target.value);
        pop.querySelector("#ae-rp-int-val").textContent = Math.round(v * 100) + "%";
        var al = room.ambientLight || {};
        al.intensity = v;
        room.ambientLight = al;
        roomManager?.updateRoom(room.id, { ambientLight: al });
      });
      pop.querySelector("#ae-rp-color").addEventListener("input", function (e) {
        var al = room.ambientLight || {};
        al.color = e.target.value;
        room.ambientLight = al;
        roomManager?.updateRoom(room.id, { ambientLight: al });
      });
      pop.querySelector("#ae-rp-delete").addEventListener("click", function () {
        closeRoomPopover();
        roomManager?.removeRoom(room.id);
        selectedRoomId = null;
        syncState();
      });

      setTimeout(function () {
        function onOutside(ev) {
          if (pop.contains(ev.target)) return;
          closeRoomPopover();
          document.removeEventListener("mousedown", onOutside);
        }
        document.addEventListener("mousedown", onOutside);
      }, 50);
    }

    function closeRoomPopover() {
      if (_roomPopover && _roomPopover.el) _roomPopover.el.remove();
      _roomPopover = null;
    }

    return {
      isActive: isActive,
      getMode: getMode,
      activate: activate,
      deactivate: deactivate,
      setMode: setMode,
      handleMouseDown: handleMouseDown,
      handleMouseMove: handleMouseMove,
      handleMouseUp: handleMouseUp,
      handleDblClick: handleDblClick,
      handleKeyDown: handleKeyDown,
      closeRoomPopover: closeRoomPopover,
    };
  }

  global.RoomDrawer = { createRoomDrawer: createRoomDrawer };
})(window);
