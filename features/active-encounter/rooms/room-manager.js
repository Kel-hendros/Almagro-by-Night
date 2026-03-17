// Room CRUD manager for active encounters.
// Follows the same factory pattern as light-switch-manager.js.
(function initAERoomManager(global) {
  "use strict";

  function createManager(ctx) {
    var getEncounterData = ctx.getEncounterData;
    var getMap = ctx.getMap;
    var saveFn = ctx.saveEncounter;

    function generateRoomId() {
      return "room-" + Date.now().toString(36) + "-" + Math.random().toString(36).substr(2, 6);
    }

    function addRoom(polygon, name) {
      var data = getEncounterData();
      if (!data) return null;
      if (!Array.isArray(data.rooms)) data.rooms = [];
      var room = {
        id: generateRoomId(),
        name: name || "",
        polygon: polygon,
        ambientLight: { intensity: 0, color: "#8090b0" },
      };
      data.rooms.push(room);
      var map = getMap();
      if (map) {
        map._rooms = data.rooms;
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveFn();
      return room;
    }

    function updateRoom(roomId, patch) {
      var data = getEncounterData();
      var rooms = (data && data.rooms) || [];
      var room = rooms.find(function (r) { return r.id === roomId; });
      if (!room) return;
      for (var key in patch) room[key] = patch[key];
      var map = getMap();
      if (map) {
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveFn();
    }

    function removeRoom(roomId) {
      var data = getEncounterData();
      if (!data) return;
      data.rooms = (data.rooms || []).filter(function (r) { return r.id !== roomId; });
      var map = getMap();
      if (map) {
        map._rooms = data.rooms;
        map.invalidateFog?.();
        map.invalidateLighting?.();
        map.draw();
      }
      saveFn();
    }

    function findRoomAt(gx, gy) {
      var data = getEncounterData();
      var rooms = (data && data.rooms) || [];
      if (!global.FogVisibility) return null;
      for (var i = 0; i < rooms.length; i++) {
        var r = rooms[i];
        if (!r.polygon || r.polygon.length < 3) continue;
        if (global.FogVisibility.pointInPolygon(gx, gy, r.polygon)) return r;
      }
      return null;
    }

    function getRooms() {
      var data = getEncounterData();
      return (data && data.rooms) || [];
    }

    return {
      addRoom: addRoom,
      updateRoom: updateRoom,
      removeRoom: removeRoom,
      findRoomAt: findRoomAt,
      getRooms: getRooms,
    };
  }

  global.AERoomManager = { createManager: createManager };
})(window);
