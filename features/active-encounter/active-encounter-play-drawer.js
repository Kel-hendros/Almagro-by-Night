(function initAEEncounterPlayDrawerModule(global) {
  function createController(ctx) {
    var state = ctx.state;
    var els = ctx.els;
    var canEditEncounter = ctx.canEditEncounter;
    var requireAdminAction = ctx.requireAdminAction;
    var getMap = ctx.getMap;
    var openModal = ctx.openModal;
    var saveRuntimeState = ctx.saveRuntimeState;

    function setDrawerTab(tab) {
      var tabs = ["entities", "terrain", "settings"];
      tabs.forEach(function (t) {
        var btn = els["drawerTab_" + t];
        var pane = els["drawerTabPane_" + t];
        if (btn) btn.classList.toggle("active", t === tab);
        if (pane) pane.classList.toggle("active", t === tab);
      });
    }

    function bindAddBtn(id, handler) {
      document.getElementById(id)?.addEventListener("click", function (event) {
        event.preventDefault();
        event.stopPropagation();
        handler();
      });
    }

    function bindEvents() {
      bindAddBtn("btn-ae-add-entity-npc", function () {});
      bindAddBtn("btn-ae-add-entity-pc", function () {});

      var drawer = document.getElementById("ae-tools-drawer");
      var toggleBtn = document.getElementById("btn-ae-toggle-tools");
      if (toggleBtn && drawer) {
        toggleBtn.addEventListener("click", function () {
          drawer.classList.toggle("open");
        });
      }

      els.drawerTab_entities?.addEventListener("click", function () { setDrawerTab("entities"); });
      els.drawerTab_terrain?.addEventListener("click", function () { setDrawerTab("terrain"); });
      els.drawerTab_settings?.addEventListener("click", function () { setDrawerTab("settings"); });

      bindAmbientEvents();
      bindFogEvents();

      setDrawerTab("entities");
      refreshAmbientUI();
      refreshFogUI();
    }

    function bindAmbientEvents() {
      var ambientColor = document.getElementById("ae-ambient-color");
      var ambientIntensity = document.getElementById("ae-ambient-intensity");
      var ambientVal = document.getElementById("ae-ambient-intensity-val");
      var ambientTint = document.getElementById("ae-ambient-tint");
      var ambientTintVal = document.getElementById("ae-ambient-tint-val");
      var saveTimer = null;

      function persistAmbient() {
        if (saveTimer) clearTimeout(saveTimer);
        saveTimer = setTimeout(function () {
          saveTimer = null;
          saveRuntimeState();
        }, 250);
      }

      ambientColor?.addEventListener("input", function () {
        if (!requireAdminAction()) return;
        var al = state.encounter?.data?.ambientLight;
        if (!al) return;
        al.color = ambientColor.value;
        var map = getMap?.();
        if (map) {
          map.invalidateLighting?.();
          map.draw?.();
        }
        persistAmbient();
      });

      ambientIntensity?.addEventListener("input", function () {
        if (!requireAdminAction()) return;
        var al = state.encounter?.data?.ambientLight;
        if (!al) return;
        al.intensity = parseFloat(ambientIntensity.value) || 0;
        if (ambientVal) ambientVal.textContent = Math.round(al.intensity * 100) + "%";
        var map = getMap?.();
        if (map) {
          map.invalidateLighting?.();
          map.draw?.();
        }
        persistAmbient();
      });

      ambientTint?.addEventListener("input", function () {
        if (!requireAdminAction()) return;
        var al = state.encounter?.data?.ambientLight;
        if (!al) return;
        al.tintStrength = Math.min(1, Math.max(0, parseFloat(ambientTint.value) || 0));
        if (ambientTintVal) ambientTintVal.textContent = Math.round(al.tintStrength * 100) + "%";
        var map = getMap?.();
        if (map) {
          map.invalidateLighting?.();
          map.draw?.();
        }
        persistAmbient();
      });
    }

    function bindFogEvents() {
      var fogCheck = document.getElementById("ae-fog-enabled-check");
      if (fogCheck) {
        fogCheck.addEventListener("change", function () {
          if (!requireAdminAction()) {
            fogCheck.checked = !fogCheck.checked;
            return;
          }
          var fog = state.encounter?.data?.fog;
          if (!fog) return;
          fog.enabled = fogCheck.checked;
          var map = getMap?.();
          if (map) {
            map.setFogConfig?.(fog);
            map.invalidateFog?.();
            map.invalidateLighting?.();
            map.draw?.();
          }
          saveRuntimeState();
        });
      }

      document.querySelectorAll("[data-fog-mode]").forEach(function (btn) {
        btn.addEventListener("click", function () {
          if (!requireAdminAction()) return;
          var fog = state.encounter?.data?.fog;
          if (!fog) return;
          fog.mode = btn.dataset.fogMode;
          var map = getMap?.();
          if (map) {
            map.setFogConfig?.(fog);
            map.invalidateFog?.();
            map.draw?.();
          }
          refreshFogUI();
          saveRuntimeState();
        });
      });

    }

    function refreshAmbientUI() {
      var al = state.encounter?.data?.ambientLight;
      if (!al) return;
      var ambientColor = document.getElementById("ae-ambient-color");
      var ambientIntensity = document.getElementById("ae-ambient-intensity");
      var ambientVal = document.getElementById("ae-ambient-intensity-val");
      var ambientTint = document.getElementById("ae-ambient-tint");
      var ambientTintVal = document.getElementById("ae-ambient-tint-val");
      var tintStrength = Math.min(1, Math.max(0, parseFloat(al.tintStrength != null ? al.tintStrength : 0.35) || 0.35));
      if (ambientColor) ambientColor.value = al.color || "#8090b0";
      if (ambientIntensity) ambientIntensity.value = al.intensity != null ? al.intensity : 0;
      if (ambientVal) ambientVal.textContent = Math.round((al.intensity != null ? al.intensity : 0) * 100) + "%";
      if (ambientTint) ambientTint.value = tintStrength;
      if (ambientTintVal) ambientTintVal.textContent = Math.round(tintStrength * 100) + "%";
    }

    function refreshFogUI() {
      var currentMode = state.encounter?.data?.fog?.mode || "auto";
      document.querySelectorAll("[data-fog-mode]").forEach(function (btn) {
        btn.classList.toggle("active", btn.dataset.fogMode === currentMode);
      });
      var fogCheck = document.getElementById("ae-fog-enabled-check");
      if (fogCheck) fogCheck.checked = !!state.encounter?.data?.fog?.enabled;
    }

    function renderLightList() {
      var listEl = document.getElementById("ae-list-lights");
      if (!listEl) return;
      var lights = state.encounter?.data?.lights || [];
      if (!lights.length) {
        listEl.innerHTML = '<button class="ae-drawer-item empty" disabled>Sin luces</button>';
        return;
      }
      listEl.innerHTML = lights.map(function (light) {
        var label = global.escapeHtml(light.name || "Luz");
        return '<button class="ae-drawer-item ae-drawer-item--light" data-role="light" data-id="' + light.id + '">' +
          '<span class="ae-light-swatch" style="background:' + (light.color || "#ffcc66") + '"></span>' +
          '<span>' + label + '</span></button>';
      }).join("");
    }

    function renderAssetLists() {
      var map = getMap?.();
      refreshAmbientUI();
      refreshFogUI();
      renderLightList();

      var allInstances = state.encounter?.data?.instances || [];
      var npcInstances = allInstances
        .filter(function (inst) { return !inst?.isPC; })
        .sort(function (a, b) { return String(a?.name || "").localeCompare(String(b?.name || "")); });
      var pcInstances = allInstances
        .filter(function (inst) { return !!inst?.isPC; })
        .sort(function (a, b) { return String(a?.name || "").localeCompare(String(b?.name || "")); });
      var props = (state.encounter?.data?.props || []).slice().sort(function (a, b) {
        return String(a?.name || a?.id || "").localeCompare(String(b?.name || b?.id || ""));
      });

      function bindEntityList(listEl, listItems, roleClass) {
        if (!listEl) return;
        if (!listItems.length) {
          listEl.innerHTML = '<button class="ae-drawer-item empty" disabled>Sin entidades</button>';
          listEl.onmouseleave = function () { map?.clearHoverFocus?.(); };
          return;
        }
        listEl.innerHTML = listItems.map(function (inst) {
          var name = global.escapeHtml(inst.name || "Entidad");
          var code = global.escapeHtml(inst.code || "-");
          return '<button class="ae-drawer-item' + (roleClass || "") + '" data-role="entity" data-id="' + inst.id + '">' + name + ' · ' + code + '</button>';
        }).join("");
        listEl.querySelectorAll('[data-role="entity"]').forEach(function (btn) {
          btn.addEventListener("click", function () {
            var id = btn.dataset.id;
            var token = (state.encounter?.data?.tokens || []).find(function (item) { return item.instanceId === id; });
            if (map && token) {
              map.selectedTokenId = token.id;
              map.draw?.();
            }
            var inst = (state.encounter?.data?.instances || []).find(function (item) { return item.id === id; });
            if (inst) openModal?.(inst);
          });
          btn.addEventListener("mouseenter", function () {
            var id = btn.dataset.id;
            var token = (state.encounter?.data?.tokens || []).find(function (item) { return item.instanceId === id; });
            map?.setHoverFocus?.({
              type: "entity",
              instanceId: id,
              tokenId: token?.id || null,
            });
          });
        });
        listEl.onmouseleave = function () { map?.clearHoverFocus?.(); };
      }

      bindEntityList(els.listEntitiesNpc, npcInstances);
      bindEntityList(els.listEntitiesPc, pcInstances, " ae-drawer-item--pc");

      var propsListEl = document.getElementById("ae-list-entities-props");
      if (propsListEl) {
        if (!props.length) {
          propsListEl.innerHTML = '<button class="ae-drawer-item empty" disabled>Sin objetos</button>';
          propsListEl.onmouseleave = function () { map?.clearHoverFocus?.(); };
        } else {
          propsListEl.innerHTML = props.map(function (prop) {
            var label = global.escapeHtml(prop.name || prop.id || "Objeto");
            var x = Math.round((parseFloat(prop.x) || 0) * 10) / 10;
            var y = Math.round((parseFloat(prop.y) || 0) * 10) / 10;
            return '<button class="ae-drawer-item" data-role="prop" data-id="' + prop.id + '">' + label + ' · (' + x + ', ' + y + ')</button>';
          }).join("");
          propsListEl.querySelectorAll('[data-role="prop"]').forEach(function (btn) {
            btn.addEventListener("click", function () {
              var id = btn.dataset.id;
              if (map) {
                map.selectedPropIds = new Set([id]);
                map.draw?.();
              }
            });
            btn.addEventListener("mouseenter", function () {
              map?.setHoverFocus?.({ type: "prop", propId: btn.dataset.id });
            });
          });
          propsListEl.onmouseleave = function () { map?.clearHoverFocus?.(); };
        }
      }
    }

    function setBusy(_isBusy) {}

    function applyPermissions() {
      var isNarrator = canEditEncounter();
      var toolsToggle = document.getElementById("btn-ae-toggle-tools");
      var drawer = document.getElementById("ae-tools-drawer");
      var modeTabScene = els.drawerTab_terrain;
      var modeTabSettings = els.drawerTab_settings;
      var scenePane = els.drawerTabPane_terrain;
      var settingsPane = els.drawerTabPane_settings;
      var propsSection = document.getElementById("ae-entity-subsection-props");

      [
        "btn-ae-add-bg",
        "btn-ae-add-decor",
        "btn-ae-add-entity-npc",
        "btn-ae-add-entity-pc",
        "btn-ae-map-remove-bg",
        "btn-ae-background-paint",
        "btn-ae-background-props",
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = "none";
      });

      [
        "ae-walls-section",
        "ae-background-section",
        "ae-decor-section",
      ].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.style.display = "none";
      });

      if (document.getElementById("ae-fog-section")) {
        document.getElementById("ae-fog-section").style.display = isNarrator ? "" : "none";
      }
      if (document.getElementById("ae-lights-section")) {
        document.getElementById("ae-lights-section").style.display = isNarrator ? "" : "none";
      }

      if (propsSection) propsSection.style.display = isNarrator ? "" : "none";
      if (modeTabScene) {
        modeTabScene.style.display = isNarrator ? "" : "none";
        modeTabScene.title = "Escena";
      }
      if (scenePane) scenePane.style.display = "";
      if (modeTabSettings) modeTabSettings.style.display = "none";
      if (settingsPane) settingsPane.style.display = "none";
      if (drawer) drawer.style.display = isNarrator ? "" : "none";
      if (toolsToggle) toolsToggle.style.display = isNarrator ? "flex" : "none";

      var titleMap = document.getElementById("btn-ae-tab-terrain");
      if (titleMap) titleMap.textContent = "☼";

      if (isNarrator && els.drawerTab_terrain?.classList.contains("active") !== true && !els.drawerTab_entities?.classList.contains("active")) {
        setDrawerTab("entities");
      }
    }

    return {
      bindEvents: bindEvents,
      renderAssetLists: renderAssetLists,
      setBusy: setBusy,
      applyPermissions: applyPermissions,
      deactivateTerrainPainter: function () {},
      refreshTerrainPaletteUI: function () {},
      refreshWallUI: function () {},
      refreshFogUI: refreshFogUI,
    };
  }

  global.AEEncounterDrawer = {
    createController: createController,
  };
})(window);
