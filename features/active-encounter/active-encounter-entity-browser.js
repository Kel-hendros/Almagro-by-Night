(function initAEEncounterEntityBrowserModule(global) {
  function createController(ctx) {
    const {
      state,
      els,
      canEditEncounter,
      setActiveMapLayer,
      loadDesignAssets,
      addNPC,
      addPC,
      addDesignTokenFromAsset,
      getEncounterAssetPublicUrl,
    } = ctx;

    function openBrowser(mode) {
      if (!canEditEncounter()) return;
      state.browserMode = mode;
      state.browserActiveTags = [];
      els.browserSearch.value = "";
      const isNPC = mode === "npc";
      const isPC = mode === "pc";
      const isDecor = mode === "decor";
      const browserContent = els.browserModal?.querySelector(".ae-browser-content");

      if (isDecor) {
        setActiveMapLayer("decor", { openDrawer: false });
      } else if (isNPC || isPC) {
        setActiveMapLayer("entities", { openDrawer: false });
      }

      if (browserContent) {
        browserContent.classList.toggle("ae-browser-content--decor", isDecor);
      }
      if (els.browserGrid) {
        els.browserGrid.classList.toggle("ae-browser-grid--decor", isDecor);
      }

      if (isNPC) els.browserTitle.textContent = "Agregar PNJ";
      if (isPC) els.browserTitle.textContent = "Agregar PJ";
      if (isDecor) els.browserTitle.textContent = "Decoracion";
      els.browserSearch.placeholder = isDecor
        ? "Buscar por nombre o tag..."
        : "Buscar...";

      if (els.browserTokenOption) {
        els.browserTokenOption.style.display = isNPC ? "flex" : "none";
      }
      if (els.browserUploadAssetBtn) {
        els.browserUploadAssetBtn.style.display = isDecor ? "" : "none";
      }

      renderBrowserTags();
      renderBrowserItems();
      els.browserModal.style.display = "flex";

      const drawer = document.getElementById("ae-tools-drawer");
      if (drawer) drawer.classList.remove("open");

      setTimeout(() => els.browserSearch.focus(), 100);
    }

    function closeBrowser() {
      els.browserModal.style.display = "none";
      state.browserMode = null;
      state.browserActiveTags = [];
      const browserContent = els.browserModal?.querySelector(".ae-browser-content");
      if (browserContent) {
        browserContent.classList.remove("ae-browser-content--decor");
      }
      if (els.browserGrid) {
        els.browserGrid.classList.remove("ae-browser-grid--decor");
      }
      if (els.browserUploadAssetBtn) {
        els.browserUploadAssetBtn.style.display = "none";
      }
      if (els.browserTokenOption) {
        els.browserTokenOption.style.display = "flex";
      }
    }

    function collectAllTags() {
      if (state.browserMode === "decor") {
        const tags = new Set();
        state.designAssets.forEach((asset) => {
          const assetTags = Array.isArray(asset.tags) ? asset.tags : [];
          assetTags.forEach((tag) => {
            const normalized = String(tag || "").trim();
            if (normalized) tags.add(normalized);
          });
        });
        return [...tags].sort((a, b) => a.localeCompare(b));
      }

      const tags = new Set();
      state.templates.forEach((t) => {
        const tplTags = t.data?.tags || [];
        tplTags.forEach((tag) => tags.add(tag));
      });
      return [...tags].sort();
    }

    function renderBrowserTags() {
      if (state.browserMode !== "npc" && state.browserMode !== "decor") {
        els.browserTags.innerHTML = "";
        return;
      }

      const allTags = collectAllTags();
      if (allTags.length === 0) {
        els.browserTags.innerHTML = "";
        return;
      }

      els.browserTags.innerHTML = allTags
        .map((tag) => {
          const isActive = state.browserActiveTags.includes(tag);
          return `<span class="ae-browser-tag${isActive ? " active" : ""}" data-tag="${tag}">${tag}</span>`;
        })
        .join("");

      els.browserTags.querySelectorAll(".ae-browser-tag").forEach((el) => {
        el.addEventListener("click", () => {
          const tag = el.dataset.tag;
          const idx = state.browserActiveTags.indexOf(tag);
          if (idx === -1) state.browserActiveTags.push(tag);
          else state.browserActiveTags.splice(idx, 1);
          renderBrowserTags();
          renderBrowserItems();
        });
      });
    }

    function renderBrowserItems() {
      const mode = state.browserMode;
      const search = (els.browserSearch.value || "").toLowerCase().trim();
      const activeTags = state.browserActiveTags;

      if (mode === "npc") renderNPCBrowser(search, activeTags);
      else if (mode === "pc") renderPCBrowser(search);
      else if (mode === "decor") renderDecorBrowser(search, activeTags);
    }

    function renderDecorBrowser(search, activeTags) {
      let items = state.designAssets || [];

      if (search) {
        items = items.filter((asset) => {
          const byName = (asset.name || "").toLowerCase().includes(search);
          const byTag = (asset.tags || []).some((tag) =>
            String(tag || "").toLowerCase().includes(search),
          );
          return byName || byTag;
        });
      }

      if (activeTags.length > 0) {
        items = items.filter((asset) => {
          const tags = Array.isArray(asset.tags) ? asset.tags : [];
          return activeTags.every((tag) => tags.includes(tag));
        });
      }

      if (items.length === 0) {
        els.browserGrid.innerHTML =
          '<div class="ae-browser-empty">No se encontraron assets de decoracion</div>';
        return;
      }

      els.browserGrid.innerHTML = items
        .map((asset) => {
          const tags = (asset.tags || [])
            .map(
              (tag) =>
                `<span class="ae-browser-card-tag">${window.escapeHtml(tag)}</span>`,
            )
            .join("");
          const previewUrl = getEncounterAssetPublicUrl(asset.image_path);
          const title = window.escapeHtml(asset.name || "Sin nombre");

          return `
            <div class="ae-browser-card ae-browser-card--decor" data-asset-id="${asset.id}">
              <div class="ae-browser-card-media">
                ${
                  previewUrl
                    ? `<img src="${window.escapeHtml(previewUrl)}" alt="${title}" loading="lazy">`
                    : `<span class="ae-browser-card-media-fallback">${title.charAt(0).toUpperCase()}</span>`
                }
              </div>
              <div class="ae-browser-card-info ae-browser-card-info--decor">
                <div>
                  <div class="ae-browser-card-name">${title}</div>
                  <div class="ae-browser-card-meta">
                    <span>${asset.is_shared ? "Compartido" : "Privado"}</span>
                  </div>
                </div>
                ${tags ? `<div class="ae-browser-card-tags">${tags}</div>` : ""}
              </div>
              <div class="ae-browser-card-actions">
                <button class="ae-browser-add-btn" data-asset-id="${asset.id}">Agregar</button>
              </div>
            </div>
          `;
        })
        .join("");

      els.browserGrid.querySelectorAll(".ae-browser-add-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          addDesignTokenFromAsset(btn.dataset.assetId);
          closeBrowser();
        });
      });
    }

    function renderNPCBrowser(search, activeTags) {
      let items = state.templates;
      if (search) items = items.filter((t) => t.name.toLowerCase().includes(search));

      if (activeTags.length > 0) {
        items = items.filter((t) => {
          const tplTags = t.data?.tags || [];
          return activeTags.every((tag) => tplTags.includes(tag));
        });
      }

      if (items.length === 0) {
        els.browserGrid.innerHTML =
          '<div class="ae-browser-empty">No se encontraron plantillas</div>';
        return;
      }

      els.browserGrid.innerHTML = items
        .map((t) => {
          const hp = t.data?.maxHealth || 7;
          const stats = {};
          (t.data?.groups || []).forEach((g) => {
            g.fields.forEach((f) => {
              stats[f.name] = f.value;
            });
          });
          const fue = stats["Fuerza"] || 0;
          const des = stats["Destreza"] || 0;
          const pel = stats["Pelea"] || 0;

          const tags = (t.data?.tags || [])
            .map(
              (tag) =>
                `<span class="ae-browser-card-tag">${window.escapeHtml(tag)}</span>`,
            )
            .join("");

          const initial = t.name[0].toUpperCase();

          return `
            <div class="ae-browser-card" data-id="${t.id}">
              <div class="ae-browser-card-top">
                <div class="ae-browser-card-avatar">${initial}</div>
                <div class="ae-browser-card-info">
                  <div class="ae-browser-card-name">${window.escapeHtml(t.name)}</div>
                  <div class="ae-browser-card-meta">
                    <span>HP ${hp}</span>
                    <span>F${fue} D${des} P${pel}</span>
                  </div>
                </div>
              </div>
              ${tags ? `<div class="ae-browser-card-tags">${tags}</div>` : ""}
              <div class="ae-browser-card-actions">
                <input type="number" class="ae-browser-qty" value="1" min="1" max="20"
                  onclick="event.stopPropagation()">
                <button class="ae-browser-add-btn" data-tpl-id="${t.id}">Agregar</button>
                <button class="ae-browser-add-hidden-btn" data-tpl-id="${t.id}" title="Agregar oculto">Oculto</button>
              </div>
            </div>
          `;
        })
        .join("");

      els.browserGrid.querySelectorAll(".ae-browser-add-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const qtyInput = btn.closest(".ae-browser-card").querySelector(".ae-browser-qty");
          const count = parseInt(qtyInput?.value, 10) || 1;
          addNPC(btn.dataset.tplId, count);
          closeBrowser();
        });
      });

      els.browserGrid.querySelectorAll(".ae-browser-add-hidden-btn").forEach((btn) => {
        btn.addEventListener("click", (event) => {
          event.stopPropagation();
          const qtyInput = btn.closest(".ae-browser-card").querySelector(".ae-browser-qty");
          const count = parseInt(qtyInput?.value, 10) || 1;
          addNPC(btn.dataset.tplId, count, { hidden: true });
          closeBrowser();
        });
      });

      els.browserGrid.querySelectorAll(".ae-browser-qty").forEach((input) => {
        input.addEventListener("click", (event) => event.stopPropagation());
      });
    }

    function renderPCBrowser(search) {
      let items = state.characterSheets;

      if (search) {
        items = items.filter((s) => {
          const name = (s.name || "").toLowerCase();
          const clan = (s.data?.clan || "").toLowerCase();
          return name.includes(search) || clan.includes(search);
        });
      }

      const existingPCIds = (state.encounter?.data?.instances || [])
        .filter((i) => i.isPC)
        .map((i) => i.characterSheetId);

      if (items.length === 0) {
        els.browserGrid.innerHTML =
          '<div class="ae-browser-empty">No se encontraron personajes</div>';
        return;
      }

      els.browserGrid.innerHTML = items
        .map((s) => {
          const name = s.name || "Sin nombre";
          const clan = s.data?.clan || "";
          const isAdded = existingPCIds.includes(s.id);
          const initial = name[0].toUpperCase();
          const avatarHTML = s.avatar_url
            ? `<img src="${window.escapeHtml(s.avatar_url)}" alt="${window.escapeHtml(name)}">`
            : window.escapeHtml(initial);

          return `
            <div class="ae-browser-card${isAdded ? " disabled" : ""}" data-sheet-id="${s.id}">
              <div class="ae-browser-card-top">
                <div class="ae-browser-card-avatar">${avatarHTML}</div>
                <div class="ae-browser-card-info">
                  <div class="ae-browser-card-name">${window.escapeHtml(name)}</div>
                  <div class="ae-browser-card-meta">
                    ${clan ? `<span>${window.escapeHtml(clan)}</span>` : ""}
                  </div>
                </div>
              </div>
              ${isAdded ? '<span class="ae-browser-added-badge">Ya en encuentro</span>' : ""}
            </div>
          `;
        })
        .join("");

      els.browserGrid
        .querySelectorAll(".ae-browser-card:not(.disabled)")
        .forEach((card) => {
          card.addEventListener("click", () => {
            addPC(card.dataset.sheetId);
            closeBrowser();
          });
        });
    }

    async function refreshAndOpenDecor() {
      await loadDesignAssets();
      openBrowser("decor");
    }

    return {
      openBrowser,
      closeBrowser,
      renderBrowserTags,
      renderBrowserItems,
      refreshAndOpenDecor,
    };
  }

  global.AEEncounterEntityBrowser = { createController };
})(window);
