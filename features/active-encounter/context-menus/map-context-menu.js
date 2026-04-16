(function initAEMapContextMenu(global) {
  function createController(ctx) {
    var state = ctx.state;
    var supabase = ctx.supabase;
    var saveRuntimeState = ctx.saveRuntimeState;
    var getMap = ctx.getMap;

    var mapContextMenuEl = null;
    var _pingCooldownUntil = 0;

    function setViewTarget(cellX, cellY) {
      if (!state.encounter || !state.encounter.data) return;
      var narratorName = (state.currentPlayer && state.currentPlayer.name) || "Narrador";
      state.encounter.data.viewTarget = {
        x: cellX, y: cellY, ts: Date.now(), narrator: narratorName,
      };
      saveRuntimeState();
      var map = getMap();
      if (map) {
        map.showViewPin(cellX, cellY, narratorName);
      }
    }

    function sendPing(cellX, cellY) {
      if (!state.encounter || !state.encounter.data || !state.encounterId) return;
      if (Date.now() < _pingCooldownUntil) return;
      _pingCooldownUntil = Date.now() + 3000;
      var playerName = (state.currentPlayer && state.currentPlayer.name) || "Jugador";
      var ts = Date.now();
      state.encounter.data.ping = {
        x: cellX, y: cellY, ts: ts, player: playerName,
      };
      state.lastPingTs = ts;
      var map = getMap();
      if (map) {
        map.showPing(cellX, cellY, playerName);
      }
      supabase.rpc("send_encounter_ping", {
        p_encounter_id: state.encounterId,
        p_x: cellX,
        p_y: cellY,
        p_player: playerName,
        p_ts: ts,
      }).then(function (res) {
        if (res.error) console.warn("Ping error:", res.error.message);
      });
    }

    function open(info) {
      close();

      var menu = document.createElement("div");
      menu.className = "ae-token-context-menu ae-map-context-menu is-open";

      menu.innerHTML =
        '<div class="ae-token-context-body">' +
        '<div class="ae-token-context-primary">' +
        '<button type="button" class="ae-token-context-action ae-token-context-action--viewhere" ' +
        'data-action="viewhere">Ver aquí</button>' +
        "</div></div>";

      menu.addEventListener("click", function (e) {
        e.stopPropagation();
        var actionEl = e.target.closest("[data-action]");
        var action = actionEl && actionEl.dataset.action;
        if (action === "viewhere") {
          close();
          setViewTarget(info.cellX, info.cellY);
        }
      });

      document.body.appendChild(menu);
      mapContextMenuEl = menu;

      var margin = 10;
      var menuWidth = menu.offsetWidth || 160;
      var menuHeight = menu.offsetHeight || 44;
      var left = Math.min(info.clientX, window.innerWidth - menuWidth - margin);
      var top = Math.min(info.clientY, window.innerHeight - menuHeight - margin);
      menu.style.left = Math.max(margin, left) + "px";
      menu.style.top = Math.max(margin, top) + "px";
    }

    function close() {
      if (mapContextMenuEl && mapContextMenuEl.parentNode) {
        mapContextMenuEl.parentNode.removeChild(mapContextMenuEl);
      }
      mapContextMenuEl = null;
    }

    function isOpen() {
      return !!mapContextMenuEl;
    }

    function contains(target) {
      return mapContextMenuEl && mapContextMenuEl.contains(target);
    }

    return {
      open: open,
      close: close,
      isOpen: isOpen,
      contains: contains,
      setViewTarget: setViewTarget,
      sendPing: sendPing,
      destroy: close,
    };
  }

  global.AEMapContextMenu = { createController: createController };
})(window);
