// Wall Selection Manager
// Tracks selected walls, vertices, and box selection state.
(function initWallSelectionModule(global) {
  "use strict";

  /**
   * Create a wall selection manager instance.
   * @param {Object} opts
   * @param {Function} opts.onSelectionChange - callback when selection changes
   */
  function createWallSelection(opts) {
    opts = opts || {};
    var onSelectionChange = opts.onSelectionChange || function () {};

    // Selection state
    var selectedWallIds = [];      // Array of wall IDs
    var selectedVertexKeys = [];   // Array of "x,y" keys
    var boxSelection = null;       // { x1, y1, x2, y2 } or null

    // ── Wall Selection ──

    function selectWall(wallId, additive) {
      if (!wallId) return;
      var idx = selectedWallIds.indexOf(wallId);
      if (additive) {
        // Toggle: add if not present, remove if present
        if (idx === -1) {
          selectedWallIds.push(wallId);
        } else {
          selectedWallIds.splice(idx, 1);
        }
      } else {
        // Replace selection
        selectedWallIds = [wallId];
        selectedVertexKeys = [];
      }
      onSelectionChange();
    }

    function deselectWall(wallId) {
      var idx = selectedWallIds.indexOf(wallId);
      if (idx !== -1) {
        selectedWallIds.splice(idx, 1);
        onSelectionChange();
      }
    }

    function isWallSelected(wallId) {
      return selectedWallIds.indexOf(wallId) !== -1;
    }

    function getSelectedWallIds() {
      return selectedWallIds.slice();
    }

    function getSelectedWallCount() {
      return selectedWallIds.length;
    }

    // ── Vertex Selection ──

    function selectVertex(vertexKey, additive) {
      if (!vertexKey) return;
      var idx = selectedVertexKeys.indexOf(vertexKey);
      if (additive) {
        // Toggle
        if (idx === -1) {
          selectedVertexKeys.push(vertexKey);
        } else {
          selectedVertexKeys.splice(idx, 1);
        }
      } else {
        // Replace selection
        selectedVertexKeys = [vertexKey];
        selectedWallIds = [];
      }
      onSelectionChange();
    }

    function deselectVertex(vertexKey) {
      var idx = selectedVertexKeys.indexOf(vertexKey);
      if (idx !== -1) {
        selectedVertexKeys.splice(idx, 1);
        onSelectionChange();
      }
    }

    function isVertexSelected(vertexKey) {
      return selectedVertexKeys.indexOf(vertexKey) !== -1;
    }

    function getSelectedVertexKeys() {
      return selectedVertexKeys.slice();
    }

    function getSelectedVertexCount() {
      return selectedVertexKeys.length;
    }

    // ── Box Selection ──

    function startBoxSelection(x, y) {
      boxSelection = { x1: x, y1: y, x2: x, y2: y };
      onSelectionChange();
    }

    function updateBoxSelection(x, y) {
      if (boxSelection) {
        boxSelection.x2 = x;
        boxSelection.y2 = y;
        onSelectionChange();
      }
    }

    function getBoxSelection() {
      if (!boxSelection) return null;
      return {
        left: Math.min(boxSelection.x1, boxSelection.x2),
        top: Math.min(boxSelection.y1, boxSelection.y2),
        right: Math.max(boxSelection.x1, boxSelection.x2),
        bottom: Math.max(boxSelection.y1, boxSelection.y2),
        width: Math.abs(boxSelection.x2 - boxSelection.x1),
        height: Math.abs(boxSelection.y2 - boxSelection.y1),
      };
    }

    function commitBoxSelection(walls, vertices, additive) {
      if (!boxSelection) return;
      var box = getBoxSelection();
      var wallIdsInBox = [];
      var vertexKeysInBox = [];

      // Find walls with both endpoints inside box
      if (walls) {
        for (var i = 0; i < walls.length; i++) {
          var w = walls[i];
          var p1In = w.x1 >= box.left && w.x1 <= box.right && w.y1 >= box.top && w.y1 <= box.bottom;
          var p2In = w.x2 >= box.left && w.x2 <= box.right && w.y2 >= box.top && w.y2 <= box.bottom;
          if (p1In && p2In) {
            wallIdsInBox.push(w.id);
          }
        }
      }

      // Find vertices inside box
      if (vertices) {
        for (var j = 0; j < vertices.length; j++) {
          var v = vertices[j];
          if (v.x >= box.left && v.x <= box.right && v.y >= box.top && v.y <= box.bottom) {
            vertexKeysInBox.push(v.key);
          }
        }
      }

      // Add to selection
      if (additive) {
        for (var k = 0; k < wallIdsInBox.length; k++) {
          if (selectedWallIds.indexOf(wallIdsInBox[k]) === -1) {
            selectedWallIds.push(wallIdsInBox[k]);
          }
        }
        for (var m = 0; m < vertexKeysInBox.length; m++) {
          if (selectedVertexKeys.indexOf(vertexKeysInBox[m]) === -1) {
            selectedVertexKeys.push(vertexKeysInBox[m]);
          }
        }
      } else {
        selectedWallIds = wallIdsInBox;
        selectedVertexKeys = vertexKeysInBox;
      }

      boxSelection = null;
      onSelectionChange();
    }

    function cancelBoxSelection() {
      boxSelection = null;
      onSelectionChange();
    }

    function isBoxSelecting() {
      return boxSelection !== null;
    }

    // ── General ──

    function clearSelection() {
      selectedWallIds = [];
      selectedVertexKeys = [];
      boxSelection = null;
      onSelectionChange();
    }

    function hasSelection() {
      return selectedWallIds.length > 0 || selectedVertexKeys.length > 0;
    }

    function getTotalSelectedCount() {
      return selectedWallIds.length + selectedVertexKeys.length;
    }

    function getSelectionSummary() {
      var parts = [];
      if (selectedWallIds.length > 0) {
        parts.push(selectedWallIds.length + " pared" + (selectedWallIds.length !== 1 ? "es" : ""));
      }
      if (selectedVertexKeys.length > 0) {
        parts.push(selectedVertexKeys.length + " v\u00e9rtice" + (selectedVertexKeys.length !== 1 ? "s" : ""));
      }
      return parts.join(", ") || "";
    }

    // ── Select by criteria ──

    function selectWallsById(wallIds, additive) {
      if (!additive) {
        selectedWallIds = [];
        selectedVertexKeys = [];
      }
      for (var i = 0; i < wallIds.length; i++) {
        if (selectedWallIds.indexOf(wallIds[i]) === -1) {
          selectedWallIds.push(wallIds[i]);
        }
      }
      onSelectionChange();
    }

    function selectVerticesByKey(keys, additive) {
      if (!additive) {
        selectedWallIds = [];
        selectedVertexKeys = [];
      }
      for (var i = 0; i < keys.length; i++) {
        if (selectedVertexKeys.indexOf(keys[i]) === -1) {
          selectedVertexKeys.push(keys[i]);
        }
      }
      onSelectionChange();
    }

    function selectAll(walls, vertices) {
      selectedWallIds = walls ? walls.map(function (w) { return w.id; }) : [];
      selectedVertexKeys = vertices ? vertices.map(function (v) { return v.key; }) : [];
      onSelectionChange();
    }

    return {
      // Wall selection
      selectWall: selectWall,
      deselectWall: deselectWall,
      isWallSelected: isWallSelected,
      getSelectedWallIds: getSelectedWallIds,
      getSelectedWallCount: getSelectedWallCount,

      // Vertex selection
      selectVertex: selectVertex,
      deselectVertex: deselectVertex,
      isVertexSelected: isVertexSelected,
      getSelectedVertexKeys: getSelectedVertexKeys,
      getSelectedVertexCount: getSelectedVertexCount,

      // Box selection
      startBoxSelection: startBoxSelection,
      updateBoxSelection: updateBoxSelection,
      getBoxSelection: getBoxSelection,
      commitBoxSelection: commitBoxSelection,
      cancelBoxSelection: cancelBoxSelection,
      isBoxSelecting: isBoxSelecting,

      // General
      clearSelection: clearSelection,
      hasSelection: hasSelection,
      getTotalSelectedCount: getTotalSelectedCount,
      getSelectionSummary: getSelectionSummary,

      // Bulk select
      selectWallsById: selectWallsById,
      selectVerticesByKey: selectVerticesByKey,
      selectAll: selectAll,
    };
  }

  global.WallSelection = {
    createWallSelection: createWallSelection,
  };
})(window);
