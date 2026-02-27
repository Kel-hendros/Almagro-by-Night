(function initActiveSessionView(global) {
  const ns = (global.ABNActiveSession = global.ABNActiveSession || {});

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setHeader({ chronicleName, systemId }) {
    const title = document.getElementById("as-title");
    const subtitle = document.getElementById("as-subtitle");
    if (title) {
      title.textContent = chronicleName
        ? `Sesion Activa · ${chronicleName}`
        : "Sesion Activa";
    }
    if (subtitle) {
      subtitle.textContent = systemId
        ? `Hub operativo del narrador · Sistema: ${systemId}`
        : "Hub operativo del narrador";
    }
  }

  function parseBloodRatio(value) {
    const match = String(value || "").match(/^\s*(\d+)\s*\/\s*(\d+)\s*$/);
    if (!match) return null;
    const current = parseInt(match[1], 10);
    const max = parseInt(match[2], 10);
    if (!Number.isFinite(current) || !Number.isFinite(max) || max <= 0) return null;
    return { current, max, percent: Math.max(0, Math.min(100, (current / max) * 100)) };
  }

  function renderRoster(items) {
    const list = document.getElementById("as-roster-list");
    const count = document.getElementById("as-roster-count");
    if (!list) return;

    const rows = Array.isArray(items) ? items : [];
    if (count) count.textContent = String(rows.length);

    if (!rows.length) {
      list.innerHTML = '<p class="muted">No hay personajes vinculados en esta crónica.</p>';
      return;
    }

    list.innerHTML = rows
      .map((row) => {
        const playerName = row.playerName || "Jugador";
        const charName = row.name || "Sin hoja";
        const initial = (charName || "?").charAt(0).toUpperCase();
        const avatarUrl = row.avatarUrl || "";
        const clan = row.clan || "—";
        const humanity = row.humanity ?? "—";
        const blood = row.blood ?? "—";
        const willpower = row.willpower ?? "—";
        const healthTrack = Array.isArray(row.healthTrack) ? row.healthTrack : [];
        const bloodRatio = parseBloodRatio(blood);
        const bloodBar = bloodRatio
          ? `
            <div class="as-blood">
              <div class="as-blood-track">
                <div class="as-blood-fill" style="width:${bloodRatio.percent}%;"></div>
              </div>
              <span class="as-blood-text">${escapeHtml(
                `${bloodRatio.current}/${bloodRatio.max}`,
              )}</span>
            </div>
          `
          : `<span class="as-chip">Sangre: ${escapeHtml(blood)}</span>`;
        const avatarInner = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(charName)}">`
          : `<span class="as-avatar-initial">${escapeHtml(initial)}</span>`;
        const healthDots = (healthTrack.length ? healthTrack : [0, 0, 0, 0, 0, 0, 0])
          .map((val) => {
            const cls =
              val === 3
                ? "as-health-dot agravado"
                : val === 2
                  ? "as-health-dot letal"
                  : val === 1
                    ? "as-health-dot contundente"
                    : "as-health-dot";
            return `<span class="${cls}"></span>`;
          })
          .join("");

        return `
          <article class="as-card">
            <div class="as-avatar">${avatarInner}</div>
            <div class="as-card-body">
              <h3>${escapeHtml(charName)}</h3>
              <div class="as-meta-line as-meta-line--top">
                Clan: ${escapeHtml(clan)}
                <span class="as-meta-dot">&bull;</span>
                Jugador: ${escapeHtml(playerName)}
              </div>
              <div class="as-meta-line">Humanidad: ${escapeHtml(humanity)}</div>
            </div>
            <div class="as-resources">
              <div class="as-resource-line">
                <span class="as-resource-label">Sangre</span>
                ${bloodBar}
              </div>
              <div class="as-resource-line">
                <span class="as-resource-label">Salud</span>
                <div class="as-health-track">${healthDots}</div>
              </div>
              <div class="as-resource-line">
                <span class="as-resource-label">Voluntad</span>
                <span class="as-resource-value">${escapeHtml(willpower)}</span>
              </div>
            </div>
          </article>
        `;
      })
      .join("");
  }

  function renderHandoutRecipients(participants) {
    const host = document.getElementById("as-handout-recipients");
    if (!host) return;
    const rows = Array.isArray(participants) ? participants : [];
    if (!rows.length) {
      host.innerHTML = '<p class="muted">No hay jugadores disponibles.</p>';
      return;
    }
    host.innerHTML = rows
      .map((row) => {
        const player = row.player || {};
        const role = row.role || "player";
        const roleLabel = role === "narrator" ? "Narrador" : "Jugador";
        return `
          <label class="as-recipient-item">
            <input type="checkbox" class="as-recipient-check" value="${escapeHtml(player.id)}">
            <span>${escapeHtml(player.name || "Jugador")}</span>
            <span class="as-recipient-role">${escapeHtml(roleLabel)}</span>
          </label>
        `;
      })
      .join("");
  }

  function renderHandoutList(handouts) {
    const host = document.getElementById("as-handout-list");
    if (!host) return;
    const rows = Array.isArray(handouts) ? handouts : [];
    if (!rows.length) {
      host.innerHTML = '<p class="muted">Aún no hay revelaciones en esta crónica.</p>';
      return;
    }

    host.innerHTML = rows
      .map((item) => {
        const deliveries = Array.isArray(item.deliveries) ? item.deliveries : [];
        const deliveriesHtml = deliveries.length
          ? deliveries
              .map((delivery) => {
                const opened = delivery.status === "opened";
                return `
                  <span class="as-delivery-chip ${opened ? "opened" : "pending"}">
                    ${escapeHtml(delivery.recipient?.name || "Jugador")}
                    <small>${opened ? "abierto" : "pendiente"}</small>
                    <button type="button" class="as-delivery-remove" data-delivery-id="${escapeHtml(
                      delivery.id,
                    )}" title="Quitar asociación">×</button>
                  </span>
                `;
              })
              .join("")
          : '<span class="muted">Sin destinatarios.</span>';

        const created = item.created_at
          ? new Date(item.created_at).toLocaleString("es-AR")
          : "—";
        const bodyPreview = String(item.body_markdown || "")
          .replace(/\s+/g, " ")
          .trim()
          .slice(0, 180);

        return `
          <article class="as-handout-card">
            <div class="as-handout-head">
              <h3>${escapeHtml(item.title || "Revelación")}</h3>
              <button type="button" class="btn btn--danger as-handout-delete" data-handout-id="${escapeHtml(
                item.id,
              )}">Eliminar</button>
            </div>
            <p class="as-handout-meta">${escapeHtml(created)}</p>
            ${item.image_url ? `<a class="as-handout-image-link" href="${escapeHtml(item.image_url)}" target="_blank" rel="noopener">Ver imagen</a>` : ""}
            <p class="as-handout-preview">${escapeHtml(bodyPreview || "Sin descripción.")}</p>
            <div class="as-delivery-list">${deliveriesHtml}</div>
          </article>
        `;
      })
      .join("");
  }

  function setHandoutMessage(message, tone = "neutral") {
    const el = document.getElementById("as-handout-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function clearHandoutForm() {
    const title = document.getElementById("as-handout-title");
    const image = document.getElementById("as-handout-image");
    const body = document.getElementById("as-handout-body");
    if (title) title.value = "";
    if (image) image.value = "";
    if (body) body.value = "";
    document.querySelectorAll(".as-recipient-check").forEach((node) => {
      node.checked = false;
    });
  }

  ns.view = {
    setHeader,
    renderRoster,
    renderHandoutRecipients,
    renderHandoutList,
    setHandoutMessage,
    clearHandoutForm,
  };
})(window);
