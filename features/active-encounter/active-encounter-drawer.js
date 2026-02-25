(function initAEEncounterDrawerModule(global) {
  function createController(ctx) {
    const {
      state,
      els,
      canEditEncounter,
      requireAdminAction,
      setActiveMapLayer,
      openBrowser,
      loadDesignAssets,
      openModal,
      requestBackgroundUpload,
      removeEncounterBackground,
      getMap,
    } = ctx;

    function bindAddBtn(id, handler) {
      document.getElementById(id)?.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        handler();
      });
    }

    function bindEvents() {
      bindAddBtn("btn-ae-add-bg", () => {
        if (!requireAdminAction()) return;
        setActiveMapLayer("background", { openDrawer: false });
        requestBackgroundUpload();
      });

      bindAddBtn("btn-ae-add-decor", async () => {
        if (!requireAdminAction()) return;
        await loadDesignAssets();
        openBrowser("decor");
      });

      bindAddBtn("btn-ae-add-entity", () => {
        if (!requireAdminAction()) return;
        openBrowser("npc");
      });

      const drawer = document.getElementById("ae-tools-drawer");
      const toggleBtn = document.getElementById("btn-ae-toggle-tools");
      if (toggleBtn && drawer) {
        toggleBtn.addEventListener("click", () => {
          drawer.classList.toggle("open");
        });
      }

      document
        .getElementById("btn-ae-map-remove-bg")
        ?.addEventListener("click", async () => {
          if (!requireAdminAction()) return;
          await removeEncounterBackground();
        });
    }

    function renderAssetLists() {
      if (!els.listBackground || !els.listDecor || !els.listEntities) return;
      const map = getMap();

      const mapData = state.encounter?.data?.map || {};
      const hasBg = !!mapData.backgroundUrl;
      const bgLabel = hasBg
        ? `Fondo cargado (${(mapData.widthCells || 0).toFixed(1)} x ${(mapData.heightCells || 0).toFixed(1)} celdas)`
        : "Sin fondo cargado";
      els.listBackground.innerHTML = `<button class="ae-drawer-item ${hasBg ? "" : "empty"}" data-role="background-main">${bgLabel}</button>`;

      const bgBtn = els.listBackground.querySelector('[data-role="background-main"]');
      bgBtn?.addEventListener("click", () => {
        if (!hasBg) return;
        setActiveMapLayer("background", { openDrawer: false });
        if (map) {
          map.selectedBackground = true;
          map.draw();
        }
      });
      bgBtn?.addEventListener("mouseenter", () => {
        if (!hasBg || !map?.setHoverFocus) return;
        map.setHoverFocus({ type: "background" });
      });
      els.listBackground.onmouseleave = () => map?.clearHoverFocus?.();

      const decor = state.encounter?.data?.designTokens || [];
      if (!decor.length) {
        els.listDecor.innerHTML =
          '<button class="ae-drawer-item empty" disabled>Sin decorados</button>';
        els.listDecor.onmouseleave = () => map?.clearHoverFocus?.();
      } else {
        els.listDecor.innerHTML = decor
          .map((token) => {
            const name = global.escapeHtml(token.name || "Decorado");
            const x = Math.round((parseFloat(token.x) || 0) * 10) / 10;
            const y = Math.round((parseFloat(token.y) || 0) * 10) / 10;
            return `<button class="ae-drawer-item" data-role="decor" data-id="${token.id}">${name} · (${x}, ${y})</button>`;
          })
          .join("");

        els.listDecor.querySelectorAll('[data-role="decor"]').forEach((btn) => {
          btn.addEventListener("click", () => {
            const id = btn.dataset.id;
            setActiveMapLayer("decor", { openDrawer: false });
            if (map) {
              map.selectedDesignTokenId = id;
              map.draw();
            }
          });
          btn.addEventListener("mouseenter", () => {
            const id = btn.dataset.id;
            map?.setHoverFocus?.({ type: "decor", tokenId: id });
          });
        });
        els.listDecor.onmouseleave = () => map?.clearHoverFocus?.();
      }

      const instances = state.encounter?.data?.instances || [];
      if (!instances.length) {
        els.listEntities.innerHTML =
          '<button class="ae-drawer-item empty" disabled>Sin entidades</button>';
        els.listEntities.onmouseleave = () => map?.clearHoverFocus?.();
      } else {
        const orderedInstances = [...instances].sort((a, b) => {
          const aPc = a?.isPC ? 1 : 0;
          const bPc = b?.isPC ? 1 : 0;
          if (aPc !== bPc) return aPc - bPc; // PNJ first, PJ last
          return String(a?.name || "").localeCompare(String(b?.name || ""));
        });

        els.listEntities.innerHTML = orderedInstances
          .map((inst) => {
            const name = global.escapeHtml(inst.name || "Entidad");
            const code = global.escapeHtml(inst.code || "-");
            const typeClass = inst.isPC ? " ae-drawer-item--pc" : "";
            return `<button class="ae-drawer-item${typeClass}" data-role="entity" data-id="${inst.id}">${name} · ${code}</button>`;
          })
          .join("");

        els.listEntities
          .querySelectorAll('[data-role="entity"]')
          .forEach((btn) => {
            btn.addEventListener("click", () => {
              const id = btn.dataset.id;
              setActiveMapLayer("entities", { openDrawer: false });
              const token = (state.encounter?.data?.tokens || []).find(
                (t) => t.instanceId === id,
              );
              if (map && token) {
                map.selectedTokenId = token.id;
                map.draw();
              }
              const inst = (state.encounter?.data?.instances || []).find(
                (item) => item.id === id,
              );
              if (inst) openModal(inst);
            });
            btn.addEventListener("mouseenter", () => {
              const id = btn.dataset.id;
              const token = (state.encounter?.data?.tokens || []).find(
                (t) => t.instanceId === id,
              );
              map?.setHoverFocus?.({
                type: "entity",
                instanceId: id,
                tokenId: token?.id || null,
              });
            });
          });
        els.listEntities.onmouseleave = () => map?.clearHoverFocus?.();
      }
    }

    function setBusy(isBusy) {
      const uploadButtons = [
        document.getElementById("btn-ae-add-bg"),
        document.getElementById("btn-ae-map-remove-bg"),
      ];
      uploadButtons.forEach((btn) => {
        if (!btn) return;
        btn.disabled = !!isBusy;
        btn.style.opacity = isBusy ? "0.65" : "";
        btn.style.pointerEvents = isBusy ? "none" : "";
      });
    }

    function applyPermissions() {
      const adminOnlyIds = [
        "btn-ae-add-bg",
        "btn-ae-add-decor",
        "btn-ae-add-entity",
        "btn-ae-map-remove-bg",
      ];

      adminOnlyIds.forEach((id) => {
        const el = document.getElementById(id);
        if (!el) return;
        el.style.display = canEditEncounter() ? "" : "none";
      });
    }

    return {
      bindEvents,
      renderAssetLists,
      setBusy,
      applyPermissions,
    };
  }

  global.AEEncounterDrawer = {
    createController,
  };
})(window);
