(function initAEPropMenu(global) {
  function createController(ctx) {
    var getEncounterData = ctx.getEncounterData;
    var canEditEncounter = ctx.canEditEncounter;
    var render = ctx.render;
    var saveDesignDraft = ctx.saveDesignDraft;
    var invalidatePropCache = ctx.invalidatePropCache;
    var getMap = ctx.getMap;

    var propMenuEl = null;

    function removeProp(propId) {
      if (!canEditEncounter()) return;
      var data = getEncounterData();
      var list = data && data.props;
      if (!Array.isArray(list)) return;
      var idx = list.findIndex(function (p) { return p.id === propId; });
      if (idx === -1) return;
      list.splice(idx, 1);
      if (typeof invalidatePropCache === "function") invalidatePropCache();
      render();
      saveDesignDraft();
    }

    function duplicateProp(propId) {
      if (!canEditEncounter()) return;
      var data = getEncounterData();
      var list = data && data.props;
      if (!Array.isArray(list)) return;
      var source = list.find(function (p) { return p.id === propId; });
      if (!source) return;

      var copy = {};
      for (var key in source) {
        if (key === "id" || key === "_img") continue;
        copy[key] = source[key];
      }
      copy.id = "prop_" + Date.now() + "_" + Math.random().toString(36).slice(2, 8);
      // Offset slightly so it doesn't stack exactly on top
      copy.x = (parseFloat(source.x) || 0) + (parseFloat(source.widthCells) || 1);
      copy.y = parseFloat(source.y) || 0;

      // Reuse shared image from source or cache
      if (copy.imgUrl) {
        var map = typeof getMap === "function" ? getMap() : null;
        var cached = map && map._propImageCache ? map._propImageCache.get(copy.imgUrl) : null;
        if (cached) {
          copy._img = cached;
        } else if (source._img) {
          copy._img = source._img;
        }
      }

      list.push(copy);
      if (typeof invalidatePropCache === "function") invalidatePropCache();
      render();
      saveDesignDraft();
    }

    function open(propInfo) {
      close();
      var data = getEncounterData();
      var prop = (data && data.props || []).find(function (p) { return p.id === propInfo.propId; });
      if (!prop) return;

      var menu = document.createElement("div");
      menu.className = "ae-token-context-menu ae-prop-context-menu is-open";
      menu.dataset.propId = propInfo.propId;

      menu.innerHTML =
        '<div class="ae-token-context-body">' +
        '<div class="ae-token-context-primary">' +
        '<button type="button" class="ae-token-context-action" ' +
        'data-action="duplicate">Duplicar prop</button>' +
        '<button type="button" class="ae-token-context-action ae-token-context-action--danger" ' +
        'data-action="delete">Borrar prop</button>' +
        '</div></div>';

      menu.addEventListener("click", function (e) {
        e.stopPropagation();
        var actionEl = e.target.closest("[data-action]");
        var action = actionEl && actionEl.dataset.action;
        if (!action) return;
        var id = menu.dataset.propId;
        if (action === "duplicate") {
          close();
          duplicateProp(id);
        } else if (action === "delete") {
          close();
          removeProp(id);
        }
      });

      document.body.appendChild(menu);
      propMenuEl = menu;

      var margin = 10;
      var menuWidth = menu.offsetWidth || 180;
      var menuHeight = menu.offsetHeight || 80;
      var left = Math.min(propInfo.clientX, window.innerWidth - menuWidth - margin);
      var top = Math.min(propInfo.clientY, window.innerHeight - menuHeight - margin);
      menu.style.left = Math.max(margin, left) + "px";
      menu.style.top = Math.max(margin, top) + "px";
    }

    function close() {
      if (propMenuEl && propMenuEl.parentNode) {
        propMenuEl.parentNode.removeChild(propMenuEl);
      }
      propMenuEl = null;
    }

    function isOpen() {
      return !!propMenuEl;
    }

    function contains(target) {
      return propMenuEl && propMenuEl.contains(target);
    }

    return {
      open: open,
      close: close,
      isOpen: isOpen,
      contains: contains,
      removeProp: removeProp,
      duplicateProp: duplicateProp,
      destroy: close,
    };
  }

  global.AEPropMenu = { createController: createController };
})(window);
