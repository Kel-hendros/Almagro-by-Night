// Realtime token drag broadcast via Supabase Broadcast.
// Sends ephemeral drag positions over WebSocket (no DB writes) so all
// participants see token movement in real-time during drag, not just on drop.
(function initTokenDragBroadcast(global) {
  "use strict";

  var THROTTLE_MS = 60; // ~16 fps broadcast rate
  var ECHO_TTL_MS = 3000; // keep final position until DB update arrives

  /**
   * @param {string} encounterId
   * @param {{ supabase, getMap: () => TacticalMap, userId: string }} opts
   */
  function create(encounterId, opts) {
    var supabase = opts.supabase;
    var getMap = opts.getMap;
    var userId = opts.userId;
    var _lastBroadcastAt = 0;
    var _destroyed = false;
    var _isSubscribed = false;

    var channel = supabase
      .channel("encounter-" + encounterId + "-drag")
      .on("broadcast", { event: "token-drag" }, function (msg) {
        if (_destroyed) return;
        var data = msg.payload;
        if (!data || data.userId === userId) return; // ignore own broadcasts
        handleRemoteDrag(data);
      })
      .subscribe(function (status) {
        _isSubscribed = status === "SUBSCRIBED";
      });

    function handleRemoteDrag(data) {
      var map = getMap();
      if (!map) return;
      if (!map._remoteDragPositions) map._remoteDragPositions = new Map();

      if (data.dragging) {
        map._remoteDragPositions.set(data.tokenId, {
          x: data.x,
          y: data.y,
          active: true,
          expiresAt: 0,
        });
      } else {
        // Drag ended — keep position briefly so there's no snap-back
        // before the DB update arrives via realtime/polling.
        var entry = map._remoteDragPositions.get(data.tokenId);
        if (entry) {
          entry.active = false;
          entry.x = data.x;
          entry.y = data.y;
          entry.expiresAt = Date.now() + ECHO_TTL_MS;
        }
      }
      map._drawDirty = true;
    }

    function sendBroadcast(payload) {
      if (_destroyed) return;
      if (_isSubscribed || typeof channel.httpSend !== "function") {
        channel.send(payload);
        return;
      }
      channel.httpSend(payload);
    }

    /** Call from mousemove during token drag (throttled internally). */
    function broadcastDrag(tokenId, x, y) {
      if (_destroyed) return;
      var now = Date.now();
      if (now - _lastBroadcastAt < THROTTLE_MS) return;
      _lastBroadcastAt = now;
      sendBroadcast({
        type: "broadcast",
        event: "token-drag",
        payload: { tokenId: tokenId, x: x, y: y, dragging: true, userId: userId },
      });
    }

    /** Call from mouseup when token drag ends. */
    function broadcastDragEnd(tokenId, x, y) {
      if (_destroyed) return;
      sendBroadcast({
        type: "broadcast",
        event: "token-drag",
        payload: { tokenId: tokenId, x: x, y: y, dragging: false, userId: userId },
      });
    }

    function destroy() {
      _destroyed = true;
      try { channel.unsubscribe(); } catch (_e) {}
      try { supabase.removeChannel(channel); } catch (_e) {}
    }

    return {
      broadcastDrag: broadcastDrag,
      broadcastDragEnd: broadcastDragEnd,
      destroy: destroy,
    };
  }

  global.AETokenDragBroadcast = { create: create };
})(window);
