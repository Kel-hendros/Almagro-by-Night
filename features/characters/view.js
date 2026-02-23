(function initCharactersView(global) {
  const ns = (global.ABNCharacters = global.ABNCharacters || {});

  const clanMapping = {
    Brujah: "1",
    Gangrel: "2",
    Malkavian: "3",
    Nosferatu: "4",
    Toreador: "5",
    Tremere: "6",
    Ventrue: "7",
    Lasombra: "R",
    Tzimisce: "E",
    Assamita: "9",
    Giovanni: "e",
    Ravnos: "0",
    "Seguidores de Set": "=",
    Ahriman: "É",
    Baali: "ã",
    "Hijas de la Cacofonia": "q",
    Salubri: "-",
    Samedi: "t",
  };

  function getClanSigil(clanName) {
    return clanMapping[clanName] || "L";
  }

  function buildSkeletonCards(count = 4) {
    return Array.from({ length: count })
      .map(
        () => `
        <article class="cs-card cs-card--skeleton" aria-hidden="true">
          <div class="cs-card-banner">
            <div class="cs-skeleton cs-skeleton--banner"></div>
          </div>
          <div class="cs-card-body">
            <div class="cs-skeleton cs-skeleton--title"></div>
            <div class="cs-skeleton cs-skeleton--line"></div>
            <div class="cs-skeleton cs-skeleton--line cs-skeleton--line-short"></div>
          </div>
        </article>
      `
      )
      .join("");
  }

  function setLoading(grid) {
    if (!grid) return;
    grid.innerHTML = buildSkeletonCards(4);
  }

  function setEmpty(grid, text) {
    if (!grid) return;
    grid.innerHTML = `<p class="cs-empty">${escapeHtml(text)}</p>`;
  }

  function renderSheets(grid, context) {
    if (!grid) return;
    const { sheets, playerMap, chronicleMap, sessionUserId, isAdmin } = context;

    if (!sheets?.length) {
      setEmpty(grid, "No hay personajes para mostrar.");
      return;
    }

    grid.innerHTML = "";

    sheets.forEach((sheet) => {
      const isOwner = sheet.user_id === sessionUserId;
      const canEdit = isAdmin || isOwner;
      const canAccess = isAdmin || isOwner;

      const clan = sheet.data?.clan || "Desconocido";
      const sigil = getClanSigil(clan);
      const gen = sheet.data?.generacion || "?";
      const lastEdit = sheet.updated_at
        ? new Date(sheet.updated_at).toLocaleDateString()
        : "-";
      const avatarUrl = sheet.avatar_url;
      const avatarPos = sheet.data?.avatarPosition || { x: 50, y: 50, scale: 1 };

      const chronicleInfo = chronicleMap[sheet.id];
      const playerName = playerMap[sheet.user_id];

      const card = document.createElement("div");
      card.className = `cs-card${canAccess ? " cs-card--clickable" : ""}`;
      card.dataset.sheetId = sheet.id;

      const bannerVisualHTML = avatarUrl
        ? `
          <div class="cs-banner-visual">
            <img src="${escapeHtml(avatarUrl)}" class="cs-banner-avatar"
                 alt="${escapeHtml(sheet.name)}"
                 style="object-position: ${avatarPos.x}% ${avatarPos.y}%; transform: scale(${avatarPos.scale}); transform-origin: ${avatarPos.x}% ${avatarPos.y}%;">
          </div>`
        : `
          <div class="cs-banner-visual">
            <span class="cs-clan-sigil">${escapeHtml(sigil)}</span>
          </div>`;

      const bannerActionsHTML = canEdit
        ? `
          <div class="cs-banner-actions">
            <button class="btn-icon cs-banner-btn" type="button" data-character-action="avatar-upload" data-sheet-id="${sheet.id}" title="Cambiar avatar">
              <i data-lucide="image"></i>
            </button>
            ${
              avatarUrl
                ? `<button class="btn-icon cs-banner-btn" type="button" data-character-action="avatar-reposition" data-sheet-id="${sheet.id}" title="Ajustar posición">
                     <i data-lucide="scan"></i>
                   </button>`
                : ""
            }
          </div>`
        : "";

      const chronicleLinkHTML = chronicleInfo
        ? `<a href="#" class="cs-chronicle-link" data-character-action="open-chronicle" data-chronicle-id="${chronicleInfo.id}">Crónica: ${escapeHtml(chronicleInfo.name)}</a>`
        : "";

      const playerInfoHTML = playerName && isAdmin
        ? `<span class="cs-player-name">Jugador: ${escapeHtml(playerName)}</span>`
        : "";

      const deleteHTML = canEdit
        ? `<button class="btn-icon btn-icon--danger cs-delete-btn" type="button" data-character-action="delete" data-sheet-id="${sheet.id}" title="Eliminar personaje">
             <i data-lucide="trash-2"></i>
           </button>`
        : "";

      card.innerHTML = `
        <div class="cs-card-banner">
          ${bannerVisualHTML}
          ${bannerActionsHTML}
        </div>
        <div class="cs-card-body">
          <div class="cs-card-head-row">
            <h3 class="cs-card-name">${escapeHtml(sheet.name)}</h3>
            ${deleteHTML}
          </div>
          ${playerInfoHTML}
          ${chronicleLinkHTML}
          <span class="cs-card-meta">${escapeHtml(clan)} · Gen: ${escapeHtml(String(gen))}ª</span>
          <div class="cs-card-footer">
            <span class="cs-card-edited">Editado: ${escapeHtml(lastEdit)}</span>
          </div>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  ns.view = {
    setLoading,
    setEmpty,
    renderSheets,
  };
})(window);
