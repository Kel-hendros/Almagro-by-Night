(function initChroniclesView(global) {
  const ns = (global.ABNChronicles = global.ABNChronicles || {});

  function initialsFromName(name) {
    const clean = (name || "").trim();
    if (!clean) return "?";
    const parts = clean.split(/\s+/).filter(Boolean);
    if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
    return (parts[0].charAt(0) + parts[1].charAt(0)).toUpperCase();
  }

  function buildAvatarsMarkup(participants) {
    const items = Array.isArray(participants) ? participants : [];
    const visibleLimit = 6;
    const plusThreshold = 7;
    const showPlus = items.length > plusThreshold;
    const visible = showPlus
      ? items.slice(0, visibleLimit)
      : items.slice(0, plusThreshold);
    const remaining = showPlus ? Math.max(0, items.length - visibleLimit) : 0;

    const avatarNodes = visible
      .map((participant) => {
        const avatarUrl = participant?.character?.avatar_url || "";
        if (avatarUrl) {
          return `<span class="chronicle-card-avatar"><img src="${escapeHtml(
            avatarUrl
          )}" alt="" loading="lazy"></span>`;
        }
        const fallbackName =
          participant?.character?.name || participant?.player?.name || "";
        const label = initialsFromName(fallbackName);
        return `<span class="chronicle-card-avatar">${escapeHtml(label)}</span>`;
      })
      .join("");

    const moreNode =
      remaining > 0
        ? `<span class="chronicle-card-avatar more">+${remaining}</span>`
        : "";

    return `<div class="chronicle-card-avatars">${avatarNodes}${moreNode}</div>`;
  }

  function statusLabel(status) {
    return status === "active" ? "Activa" : "Pausada";
  }

  function statusClass(status) {
    return status === "active" ? "active" : "archived";
  }

  function roleLabel(role) {
    return role === "narrator" ? "Narrador" : "Jugador";
  }

  function renderLoading(grid) {
    grid.innerHTML = '<p class="muted">Cargando crónicas...</p>';
  }

  function renderUnauthenticated(grid) {
    grid.innerHTML = '<p class="muted">Debes iniciar sesión.</p>';
  }

  function renderError(grid, message) {
    grid.innerHTML = `<p class="error">${escapeHtml(
      message || "Error al cargar crónicas."
    )}</p>`;
  }

  function renderEmpty(grid) {
    grid.innerHTML =
      '<p class="muted">No participas en ninguna crónica. Crea una o unite con un código de invitación.</p>';
  }

  function renderChroniclesGrid(grid, chronicles, participantMap, characterMap) {
    grid.innerHTML = "";

    chronicles.forEach((chronicle) => {
      const card = document.createElement("div");
      card.className = "chronicle-card";
      card.dataset.chronicleId = chronicle.id;

      const participants = participantMap[chronicle.id] || [];
      participants.sort((a, b) => {
        const rank = (role) => (role === "narrator" ? 0 : 1);
        return rank(a.role) - rank(b.role);
      });

      const characterAvatars = characterMap[chronicle.id] || [];
      const avatarsHtml = characterAvatars.length
        ? buildAvatarsMarkup(characterAvatars)
        : "";
      const safeDescription = chronicle.description
        ? escapeHtml(chronicle.description)
        : "Sin descripción aún.";
      const descClass = chronicle.description
        ? "chronicle-card-description"
        : "chronicle-card-description empty";
      const narratorName = chronicle.creator?.name || "—";

      card.innerHTML = `
        <div class="chronicle-card-banner">
          ${
            chronicle.banner_url
              ? `<img src="${escapeHtml(chronicle.banner_url)}" alt="" loading="lazy">`
              : ""
          }
          <div class="chronicle-card-banner-overlay">
            ${avatarsHtml}
          </div>
        </div>
        <div class="chronicle-card-content">
          <h3 class="chronicle-card-title">${escapeHtml(chronicle.name)}</h3>
          <div class="chronicle-card-meta">
            <span class="chronicle-card-narrator">Narrador: ${escapeHtml(
              narratorName
            )}</span>
            <div class="chronicle-card-badges">
              <span class="chronicle-badge ${
                chronicle.role === "narrator" ? "narrator" : "player"
              }">${roleLabel(chronicle.role)}</span>
              <span class="chronicle-badge ${statusClass(
                chronicle.status
              )}">${statusLabel(chronicle.status)}</span>
            </div>
          </div>
          <p class="${descClass}">${safeDescription}</p>
        </div>
      `;

      grid.appendChild(card);
    });
  }

  function setMessage(element, text, type) {
    if (!element) return;
    element.textContent = text || "";
    element.className = `msg ${type || ""}`.trim();
  }

  ns.view = {
    renderLoading,
    renderUnauthenticated,
    renderError,
    renderEmpty,
    renderChroniclesGrid,
    setMessage,
  };
})(window);

