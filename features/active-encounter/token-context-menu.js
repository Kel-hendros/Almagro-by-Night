(function initAEEncounterTokenContextMenuModule(global) {
  function createController(ctx) {
    const {
      state,
      canEditEncounter,
      onRemoveToken,
      onUnsummonToken,
      onOpenDetails,
      onApplyCondition,
      onGetAvailablePowers,
      onInvokePower,
      onIsPowerActive,
      getMap,
    } = ctx;
    let menuEl = null;
    let arrowEl = null;
    let secondaryPanelEl = null;
    let secondaryListEl = null;
    let detailsBtnEl = null;
    let unsummonBtnEl = null;
    let conditionsBtnEl = null;
    let powersBtnEl = null;
    let deleteBtnEl = null;
    let lastTokenInfo = null;
    let lastPlacement = null;
    let activePanel = null;
    const CONDITION_OPTIONS = [
      {
        key: "flying",
        label: "Volando",
        iconPath: "images/svgs/batwing-emblem.svg",
      },
      {
        key: "blinded",
        label: "Cegado",
        iconPath: "images/svgs/blinded.svg",
      },
      {
        key: "prone",
        label: "Derribado",
        iconPath: "images/svgs/prone.svg",
      },
    ];

    function ensureMenu() {
      if (menuEl) return menuEl;

      const menu = document.createElement("div");
      menu.id = "ae-token-context-menu";
      menu.className = "ae-token-context-menu";

      const arrow = document.createElement("div");
      arrow.id = "ae-token-context-menu-arrow";
      arrow.className = "ae-token-context-menu-arrow";

      const body = document.createElement("div");
      body.className = "ae-token-context-body";

      const primary = document.createElement("div");
      primary.className = "ae-token-context-primary";

      const detailsBtn = document.createElement("button");
      detailsBtn.type = "button";
      detailsBtn.textContent = "Ver detalles";
      detailsBtn.className = "ae-token-context-action";
      detailsBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const tokenId = menu.dataset.tokenId || null;
        hide();
        if (tokenId && typeof onOpenDetails === "function") {
          onOpenDetails(tokenId);
        }
      });
      detailsBtnEl = detailsBtn;

      const conditionBtn = document.createElement("button");
      conditionBtn.type = "button";
      conditionBtn.className = "ae-token-context-action ae-token-context-action--conditions";
      conditionBtn.innerHTML =
        '<span class="ae-token-context-action-label">Condiciones</span><span class="ae-token-context-chevron">›</span>';
      conditionBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePanel("conditions");
      });
      conditionsBtnEl = conditionBtn;

      const powersBtn = document.createElement("button");
      powersBtn.type = "button";
      powersBtn.className = "ae-token-context-action ae-token-context-action--powers";
      powersBtn.innerHTML =
        '<span class="ae-token-context-action-label">Poderes</span><span class="ae-token-context-chevron">›</span>';
      powersBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        togglePanel("powers");
      });
      powersBtnEl = powersBtn;

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "Borrar token";
      deleteBtn.className = "ae-token-context-action ae-token-context-action--danger";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const tokenId = menu.dataset.tokenId || null;
        hide();
        if (tokenId && typeof onRemoveToken === "function") {
          onRemoveToken(tokenId);
        }
      });
      deleteBtnEl = deleteBtn;

      const unsummonBtn = document.createElement("button");
      unsummonBtn.type = "button";
      unsummonBtn.textContent = "Eliminar";
      unsummonBtn.className = "ae-token-context-action ae-token-context-action--danger";
      unsummonBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const tokenId = menu.dataset.tokenId || null;
        hide();
        if (tokenId && typeof onUnsummonToken === "function") {
          onUnsummonToken(tokenId);
        }
      });
      unsummonBtnEl = unsummonBtn;

      const secondaryPanel = document.createElement("div");
      secondaryPanel.className = "ae-token-context-conditions";
      secondaryPanel.innerHTML = `
        <div class="ae-token-context-conditions-list"></div>
      `;
      secondaryPanelEl = secondaryPanel;
      secondaryListEl = secondaryPanel.querySelector(".ae-token-context-conditions-list");

      primary.appendChild(detailsBtn);
      primary.appendChild(conditionBtn);
      primary.appendChild(powersBtn);
      primary.appendChild(deleteBtn);
      primary.appendChild(unsummonBtn);
      body.appendChild(primary);
      body.appendChild(secondaryPanel);
      menu.appendChild(arrow);
      menu.appendChild(body);
      document.body.appendChild(menu);

      menuEl = menu;
      arrowEl = arrow;
      return menuEl;
    }

    function setExpanded(isExpanded) {
      if (!menuEl) return;
      menuEl.classList.toggle("is-expanded", !!isExpanded);
      requestAnimationFrame(() => {
        if (!lastTokenInfo) return;
        if (isExpanded) {
          adjustExpandedPosition(lastTokenInfo);
        } else {
          keepMenuInViewport();
        }
      });
    }

    function togglePanel(panelName) {
      if (!menuEl) return;
      const shouldCollapse = menuEl.classList.contains("is-expanded") && activePanel === panelName;
      if (shouldCollapse) {
        activePanel = null;
        updatePrimaryActionsUI();
        setExpanded(false);
        return;
      }
      activePanel = panelName;
      renderSecondaryPanel(menuEl.dataset.tokenId || null);
      updatePrimaryActionsUI();
      setExpanded(true);
    }

    function updatePrimaryActionsUI() {
      if (conditionsBtnEl) {
        conditionsBtnEl.classList.toggle("is-active", activePanel === "conditions");
      }
      if (powersBtnEl) {
        powersBtnEl.classList.toggle("is-active", activePanel === "powers");
      }
    }

    function getTokenById(tokenId) {
      return (state.encounter?.data?.tokens || []).find((token) => token.id === tokenId) || null;
    }

    function getInstanceByTokenId(tokenId) {
      const token = getTokenById(tokenId);
      if (!token?.instanceId) return null;
      return (
        (state.encounter?.data?.instances || []).find(
          (instance) => instance.id === token.instanceId,
        ) || null
      );
    }

    function isSummonToken(tokenId) {
      const instance = getInstanceByTokenId(tokenId);
      return !!instance?.isSummon;
    }

    function applyPrimaryActionsVisibility(tokenId) {
      if (!menuEl) return;
      const canManage = !!canEditEncounter?.();
      const summon = !!isSummonToken(tokenId);

      if (detailsBtnEl) detailsBtnEl.style.display = tokenId ? "" : "none";

      if (summon) {
        if (conditionsBtnEl) conditionsBtnEl.style.display = "none";
        if (powersBtnEl) powersBtnEl.style.display = "none";
        if (deleteBtnEl) deleteBtnEl.style.display = "none";
        if (unsummonBtnEl) unsummonBtnEl.style.display = "";
        activePanel = null;
        updatePrimaryActionsUI();
        menuEl.classList.remove("is-expanded");
        return;
      }

      if (conditionsBtnEl) conditionsBtnEl.style.display = canManage ? "" : "none";
      if (powersBtnEl) powersBtnEl.style.display = canManage ? "" : "none";
      if (deleteBtnEl) deleteBtnEl.style.display = canManage ? "" : "none";
      if (unsummonBtnEl) unsummonBtnEl.style.display = "none";

      if (!canManage) {
        activePanel = null;
        updatePrimaryActionsUI();
        menuEl.classList.remove("is-expanded");
      }
    }

    function refreshConditionState(tokenId) {
      if (!menuEl || !tokenId) return;
      const instance = getInstanceByTokenId(tokenId);
      const conditions =
        instance?.conditions && typeof instance.conditions === "object"
          ? instance.conditions
          : {};

      menuEl
        .querySelectorAll(".ae-token-condition-item")
        .forEach((btn) => {
          const key = btn.dataset.condition;
          btn.classList.toggle("is-active", !!conditions[key]);
        });
    }

    function renderConditionsPanel(tokenId) {
      if (!secondaryListEl) return;
      secondaryListEl.innerHTML = "";

      CONDITION_OPTIONS.forEach((option) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ae-token-condition-item";
        btn.dataset.condition = option.key;
        btn.innerHTML = `
          <span class="ae-token-condition-icon-wrap">
            <img src="${option.iconPath}" alt="${option.label}" class="ae-token-condition-icon" loading="lazy">
          </span>
          <span class="ae-token-condition-name">${option.label}</span>
        `;
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!tokenId || typeof onApplyCondition !== "function") return;
          onApplyCondition(tokenId, option.key);
          renderConditionsPanel(tokenId);
        });
        secondaryListEl.appendChild(btn);
      });

      refreshConditionState(tokenId);
    }

    function renderPowersPanel(tokenId) {
      if (!secondaryListEl) return;
      secondaryListEl.innerHTML = "";
      const powers =
        tokenId && typeof onGetAvailablePowers === "function"
          ? onGetAvailablePowers(tokenId) || []
          : [];

      if (!powers.length) {
        secondaryListEl.innerHTML =
          '<div class="ae-token-context-empty">Sin poderes de mapa disponibles</div>';
        return;
      }

      powers.forEach((power) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "ae-token-condition-item ae-token-power-item";
        btn.dataset.powerId = power.id;
        const minLevel = Number(power.minLevel) || 1;
        const isActive =
          tokenId && typeof onIsPowerActive === "function"
            ? !!onIsPowerActive(tokenId, power.id)
            : false;
        btn.innerHTML = `
          <span class="ae-token-condition-name">${power.label}</span>
          <span class="ae-token-power-meta">${power.disciplineName} • ${minLevel}</span>
        `;
        btn.classList.toggle("is-active", isActive);
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          if (!tokenId || typeof onInvokePower !== "function") return;
          onInvokePower(tokenId, power.id);
          renderPowersPanel(tokenId);
        });
        secondaryListEl.appendChild(btn);
      });
    }

    function renderSecondaryPanel(tokenId) {
      if (activePanel === "powers") {
        renderPowersPanel(tokenId);
        return;
      }
      renderConditionsPanel(tokenId);
    }

    function getTokenContextAnchor(tokenInfo) {
      if (
        Number.isFinite(tokenInfo?.anchorX) &&
        Number.isFinite(tokenInfo?.anchorY)
      ) {
        return { x: tokenInfo.anchorX, y: tokenInfo.anchorY };
      }

      const fallback = {
        x: tokenInfo?.clientX || 8,
        y: tokenInfo?.clientY || 8,
      };
      if (!tokenInfo?.tokenId) return fallback;
      const map = getMap?.();
      if (!map?.canvas) return fallback;

      const mapToken = (state.encounter?.data?.tokens || []).find(
        (token) => token.id === tokenInfo.tokenId,
      );
      if (!mapToken) return fallback;

      const canvasRect = map.canvas.getBoundingClientRect();
      const gridSize = parseFloat(map.gridSize) || 50;
      const scale = parseFloat(map.scale) || 1;
      const tokenSizeCells = parseFloat(mapToken.size) || 1;
      const tokenSizePx = tokenSizeCells * gridSize * scale;
      const tokenXWorld = (parseFloat(mapToken.x) || 0) * gridSize;
      const tokenYWorld = (parseFloat(mapToken.y) || 0) * gridSize;

      return {
        x: canvasRect.left + map.offsetX + tokenXWorld * scale + tokenSizePx / 2,
        y: canvasRect.top + map.offsetY + tokenYWorld * scale + tokenSizePx / 2,
      };
    }

    function clamp(value, min, max) {
      return Math.max(min, Math.min(value, max));
    }

    function distanceFromPointToRect(px, py, left, top, width, height) {
      const right = left + width;
      const bottom = top + height;
      const closestX = clamp(px, left, right);
      const closestY = clamp(py, top, bottom);
      const dx = px - closestX;
      const dy = py - closestY;
      return Math.hypot(dx, dy);
    }

    function getKeepOutRadius(tokenInfo) {
      const tokenRadius = Math.max(6, Number(tokenInfo?.anchorRadiusPx) || 20);
      return tokenRadius + 18;
    }

    function placeMenuAroundAnchor(anchor, menuWidth, menuHeight, tokenInfo, preferredPlacement = null) {
      const margin = 10;
      const tokenRadius = Math.max(6, Number(tokenInfo?.anchorRadiusPx) || 20);
      const gap = Math.max(24, tokenRadius * 0.65 + 16);
      const keepOutRadius = getKeepOutRadius(tokenInfo);
      const maxLeft = window.innerWidth - menuWidth - margin;
      const maxTop = window.innerHeight - menuHeight - margin;

      const candidates = [
        {
          placement: "above",
          left: anchor.x - menuWidth / 2,
          top: anchor.y - menuHeight - gap,
        },
        {
          placement: "below",
          left: anchor.x - menuWidth / 2,
          top: anchor.y + gap,
        },
        {
          placement: "right",
          left: anchor.x + gap,
          top: anchor.y - menuHeight / 2,
        },
        {
          placement: "left",
          left: anchor.x - menuWidth - gap,
          top: anchor.y - menuHeight / 2,
        },
      ];
      const rawCandidates = preferredPlacement
        ? [
            ...candidates.filter((candidate) => candidate.placement === preferredPlacement),
            ...candidates.filter((candidate) => candidate.placement !== preferredPlacement),
          ]
        : candidates;

      const evaluated = rawCandidates.map((candidate) => {
        const left = clamp(candidate.left, margin, maxLeft);
        const top = clamp(candidate.top, margin, maxTop);
        const distance = distanceFromPointToRect(
          anchor.x,
          anchor.y,
          left,
          top,
          menuWidth,
          menuHeight,
        );
        return {
          ...candidate,
          left,
          top,
          distance,
          safe: distance >= keepOutRadius,
        };
      });

      const firstSafe = evaluated.find((candidate) => candidate.safe);
      if (firstSafe) return firstSafe;

      return evaluated.sort((a, b) => b.distance - a.distance)[0];
    }

    function positionMenu(tokenInfo, options = {}) {
      if (!menuEl || !tokenInfo) return;
      const { keepPlacement = false } = options;
      const anchor = getTokenContextAnchor(tokenInfo);
      const menuWidth = menuEl.offsetWidth || 220;
      const menuHeight = menuEl.offsetHeight || 52;
      const placement = placeMenuAroundAnchor(
        anchor,
        menuWidth,
        menuHeight,
        tokenInfo,
        keepPlacement ? lastPlacement : null,
      );
      lastPlacement = placement.placement;
      const left = placement.left;
      const top = placement.top;

      menuEl.style.left = `${Math.round(left)}px`;
      menuEl.style.top = `${Math.round(top)}px`;

      if (arrowEl) {
        const arrowHalf = 6;
        const arrowX = clamp(anchor.x - left, 14, menuWidth - 14);
        const arrowY = clamp(anchor.y - top, 14, menuHeight - 14);
        arrowEl.style.left = "";
        arrowEl.style.top = "";
        arrowEl.classList.remove("is-top", "is-left", "is-right");

        if (placement.placement === "below") {
          arrowEl.classList.add("is-top");
          arrowEl.style.left = `${Math.round(arrowX - arrowHalf)}px`;
        } else if (placement.placement === "right") {
          arrowEl.classList.add("is-left");
          arrowEl.style.top = `${Math.round(arrowY - arrowHalf)}px`;
        } else if (placement.placement === "left") {
          arrowEl.classList.add("is-right");
          arrowEl.style.top = `${Math.round(arrowY - arrowHalf)}px`;
        } else {
          arrowEl.style.left = `${Math.round(arrowX - arrowHalf)}px`;
        }
      }
    }

    function keepMenuInViewport() {
      if (!menuEl) return;
      const margin = 10;
      const menuWidth = menuEl.offsetWidth || 220;
      const menuHeight = menuEl.offsetHeight || 52;
      let left = Number.parseFloat(menuEl.style.left);
      let top = Number.parseFloat(menuEl.style.top);
      if (!Number.isFinite(left) || !Number.isFinite(top)) {
        left = margin;
        top = margin;
      }

      const maxLeft = Math.max(margin, window.innerWidth - menuWidth - margin);
      const maxTop = Math.max(margin, window.innerHeight - menuHeight - margin);
      left = clamp(left, margin, maxLeft);
      top = clamp(top, margin, maxTop);

      menuEl.style.left = `${Math.round(left)}px`;
      menuEl.style.top = `${Math.round(top)}px`;
    }

    function adjustExpandedPosition(tokenInfo) {
      if (!menuEl || !tokenInfo) return;
      keepMenuInViewport();
    }

    function open(tokenInfo) {
      if (!tokenInfo?.tokenId) {
        hide();
        return;
      }
      const token = getTokenById(tokenInfo.tokenId);
      if (!token) {
        hide();
        return;
      }
      const menu = ensureMenu();
      menu.dataset.tokenId = tokenInfo.tokenId;
      lastTokenInfo = tokenInfo;
      activePanel = null;
      updatePrimaryActionsUI();
      menu.classList.remove("is-expanded");
      applyPrimaryActionsVisibility(tokenInfo.tokenId);

      menu.classList.add("is-open", "is-measuring");
      positionMenu(tokenInfo);
      menu.classList.remove("is-measuring");
    }

    function hide() {
      if (!menuEl) return;
      menuEl.classList.remove("is-open", "is-measuring");
      delete menuEl.dataset.tokenId;
      lastTokenInfo = null;
      activePanel = null;
      updatePrimaryActionsUI();
    }

    function isOpen() {
      return !!menuEl && menuEl.classList.contains("is-open");
    }

    function contains(target) {
      return !!menuEl && menuEl.contains(target);
    }

    function destroy() {
      hide();
      if (menuEl?.parentNode) {
        menuEl.parentNode.removeChild(menuEl);
      }
      menuEl = null;
      arrowEl = null;
    }

    return {
      open,
      hide,
      isOpen,
      contains,
      destroy,
    };
  }

  global.AEEncounterTokenContextMenu = {
    createController,
  };
})(window);
