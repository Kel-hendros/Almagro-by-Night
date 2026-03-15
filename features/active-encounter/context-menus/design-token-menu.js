(function initAEDesignTokenMenu(global) {
  function createController(ctx) {
    var getEncounterData = ctx.getEncounterData;
    var canEditEncounter = ctx.canEditEncounter;
    var render = ctx.render;
    var saveEncounter = ctx.saveEncounter;

    var designTokenMenuEl = null;

    function toggleDesignTokenVisibility(tokenId) {
      if (!canEditEncounter()) return;
      var data = getEncounterData();
      var dt = (data && data.designTokens || []).find(function (t) { return t.id === tokenId; });
      if (!dt) return;
      dt.visible = dt.visible === false ? true : false;
      render();
      saveEncounter();
    }

    function removeDesignToken(tokenId) {
      if (!canEditEncounter()) return;
      var data = getEncounterData();
      var list = data && data.designTokens;
      if (!Array.isArray(list)) return;
      var idx = list.findIndex(function (t) { return t.id === tokenId; });
      if (idx === -1) return;
      list.splice(idx, 1);
      render();
      saveEncounter();
    }

    function open(tokenInfo) {
      close();
      var data = getEncounterData();
      var dt = (data && data.designTokens || []).find(function (t) { return t.id === tokenInfo.tokenId; });
      if (!dt) return;

      var menu = document.createElement("div");
      menu.className = "ae-token-context-menu ae-design-token-context-menu is-open";
      menu.dataset.tokenId = tokenInfo.tokenId;

      var isVisible = dt.visible !== false;
      menu.innerHTML =
        '<div class="ae-token-context-body">' +
        '<div class="ae-token-context-primary">' +
        '<button type="button" class="ae-token-context-action ae-token-context-action--visibility ' + (isVisible ? "" : "is-active") + '" ' +
        'data-action="visibility">' + (isVisible ? "Visible" : "Oculto") + '</button>' +
        '<button type="button" class="ae-token-context-action ae-token-context-action--danger" ' +
        'data-action="delete">Borrar decorado</button>' +
        '</div></div>';

      menu.addEventListener("click", function (e) {
        e.stopPropagation();
        var actionEl = e.target.closest("[data-action]");
        var action = actionEl && actionEl.dataset.action;
        if (!action) return;
        var id = menu.dataset.tokenId;
        if (action === "visibility") {
          toggleDesignTokenVisibility(id);
          var updated = (getEncounterData().designTokens || []).find(function (t) { return t.id === id; });
          var btn = menu.querySelector('[data-action="visibility"]');
          if (btn && updated) {
            var vis = updated.visible !== false;
            btn.textContent = vis ? "Visible" : "Oculto";
            btn.classList.toggle("is-active", !vis);
          }
        } else if (action === "delete") {
          close();
          removeDesignToken(id);
        }
      });

      document.body.appendChild(menu);
      designTokenMenuEl = menu;

      var margin = 10;
      var menuWidth = menu.offsetWidth || 180;
      var menuHeight = menu.offsetHeight || 80;
      var left = Math.min(tokenInfo.clientX, window.innerWidth - menuWidth - margin);
      var top = Math.min(tokenInfo.clientY, window.innerHeight - menuHeight - margin);
      menu.style.left = Math.max(margin, left) + "px";
      menu.style.top = Math.max(margin, top) + "px";
    }

    function close() {
      if (designTokenMenuEl && designTokenMenuEl.parentNode) {
        designTokenMenuEl.parentNode.removeChild(designTokenMenuEl);
      }
      designTokenMenuEl = null;
    }

    function isOpen() {
      return !!designTokenMenuEl;
    }

    function contains(target) {
      return designTokenMenuEl && designTokenMenuEl.contains(target);
    }

    return {
      open: open,
      close: close,
      isOpen: isOpen,
      contains: contains,
      toggleDesignTokenVisibility: toggleDesignTokenVisibility,
      removeDesignToken: removeDesignToken,
      destroy: close,
    };
  }

  global.AEDesignTokenMenu = { createController: createController };
})(window);
