(function initChronicleDetailPlayers(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  function groupCharsByUser(characters) {
    const map = {};
    (characters || []).forEach((row) => {
      const sheet = row.character_sheet;
      if (!sheet) return;
      if (!map[sheet.user_id]) map[sheet.user_id] = [];
      map[sheet.user_id].push(sheet);
    });
    return map;
  }

  function renderPlayers({
    playersGrid,
    participants,
    charsByUserId,
    sessionUserId,
    isNarrator,
    onOpenCharacter,
    onAddCharacter,
    onRemovePlayer,
    onRemoveChar,
  }) {
    if (!playersGrid) return;

    if (!participants?.length) {
      playersGrid.innerHTML =
        '<span class="cd-card-muted">No hay jugadores en esta crónica.</span>';
      return;
    }

    playersGrid.innerHTML = "";
    participants.sort((a, b) => {
      const aIsSelf = a.player?.user_id === sessionUserId ? -1 : 0;
      const bIsSelf = b.player?.user_id === sessionUserId ? -1 : 0;
      return aIsSelf - bIsSelf;
    });

    participants.forEach((p) => {
      const player = p.player;
      if (!player) return;

      const isOwnPlayer = player.user_id === sessionUserId;
      const isPlayerNarrator = p.role === "narrator";
      const canRemovePlayer =
        (isNarrator && !isOwnPlayer) || (!isNarrator && isOwnPlayer);
      const playerChars = charsByUserId[player.user_id] || [];

      const card = document.createElement("div");
      card.className = "cd-player-card";

      const badgeClass = isPlayerNarrator
        ? "cd-role-badge--narrator"
        : "cd-role-badge--player";
      const badgeText = isPlayerNarrator ? "Narrador" : "Jugador";

      let deletePlayerHtml = "";
      if (canRemovePlayer) {
        deletePlayerHtml = `<button class="cd-delete-btn" data-action="remove-player" data-player-id="${player.id}" title="${
          isOwnPlayer ? "Abandonar crónica" : "Quitar jugador"
        }"><i data-lucide="trash-2"></i></button>`;
      }

      card.innerHTML = `
        <div class="cd-player-head">
          <div class="cd-player-head-left">
            <span class="cd-player-icon"><i data-lucide="user"></i></span>
            <span class="cd-player-name">${escapeHtml(player.name)}</span>
            <span class="cd-role-badge ${badgeClass}">${badgeText}</span>
          </div>
          ${deletePlayerHtml}
        </div>
        <div class="cd-player-divider"></div>
      `;

      playerChars.forEach((sheet) => {
        const clan = sheet.data?.clan || "Desconocido";
        const isOwn = sheet.user_id === sessionUserId;
        const canRemoveChar = isNarrator || isOwn;
        const canOpen = isNarrator || isOwn;
        const initials = (sheet.name || "?").charAt(0).toUpperCase();

        const avatarInner = sheet.avatar_url
          ? `<img src="${escapeHtml(sheet.avatar_url)}" alt="">`
          : `<span class="cd-player-char-initials">${escapeHtml(initials)}</span>`;

        let deleteCharHtml = "";
        if (canRemoveChar) {
          deleteCharHtml = `<button class="cd-delete-btn" data-action="remove-char" data-sheet-id="${sheet.id}" title="Quitar personaje"><i data-lucide="trash-2"></i></button>`;
        }

        const nameClass = canOpen
          ? "cd-player-char-name clickable"
          : "cd-player-char-name";

        const charRow = document.createElement("div");
        charRow.className = "cd-player-char";
        charRow.innerHTML = `
          <div class="cd-player-char-left">
            <div class="cd-player-char-avatar">${avatarInner}</div>
            <span class="${nameClass}" data-sheet-id="${sheet.id}">${escapeHtml(
          sheet.name
        )}</span>
            <span class="cd-player-char-sep">|</span>
            <span class="cd-player-char-clan">${escapeHtml(clan)}</span>
          </div>
          ${deleteCharHtml}
        `;

        if (canOpen) {
          charRow
            .querySelector(".cd-player-char-name")
            ?.addEventListener("click", () => onOpenCharacter?.(sheet.id));
        }

        card.appendChild(charRow);
      });

      if (isOwnPlayer) {
        const addRow = document.createElement("div");
        addRow.className = "cd-add-char";
        addRow.innerHTML = `<i data-lucide="plus"></i><span>Agregar Personaje</span>`;
        addRow.addEventListener("click", () => onAddCharacter?.());
        card.appendChild(addRow);
      }

      playersGrid.appendChild(card);
    });

    playersGrid.addEventListener("click", (e) => {
      const btn = e.target.closest(".cd-delete-btn");
      if (!btn) return;
      e.stopPropagation();
      const action = btn.dataset.action;
      if (action === "remove-player") onRemovePlayer?.(btn.dataset.playerId);
      if (action === "remove-char") onRemoveChar?.(btn.dataset.sheetId);
    });
  }

  ns.players = {
    groupCharsByUser,
    renderPlayers,
  };
})(window);

