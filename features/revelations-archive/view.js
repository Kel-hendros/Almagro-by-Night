(function initRevelationsArchiveView(global) {
  const ns = (global.ABNRevelationsArchive = global.ABNRevelationsArchive || {});

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function setHeader({ chronicleName, isNarrator }) {
    const title = document.getElementById("ra-title");
    const subtitle = document.getElementById("ra-subtitle");
    if (title) title.textContent = `Archivo de Revelaciones · ${chronicleName || "Crónica"}`;
    if (subtitle) {
      subtitle.textContent = isNarrator
        ? "Gestión completa para narrador"
        : "Tus revelaciones asociadas en esta crónica";
    }
  }

  function setAccessMode({ isNarrator }) {
    document.getElementById("ra-narrator-panel")?.classList.toggle("hidden", !isNarrator);
    document.getElementById("ra-player-panel")?.classList.toggle("hidden", !!isNarrator);
    document
      .getElementById("ra-back-active-session")
      ?.classList.toggle("hidden", !isNarrator);
  }

  function setMessage(message, tone = "neutral") {
    const el = document.getElementById("ra-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function clearForm() {
    const title = document.getElementById("ra-title-input");
    const image = document.getElementById("ra-image-input");
    const body = document.getElementById("ra-body-input");
    if (title) title.value = "";
    if (image) image.value = "";
    if (body) body.value = "";
    document.querySelectorAll(".ra-recipient-check").forEach((node) => {
      node.checked = false;
    });
  }

  function renderRecipients(participants) {
    const host = document.getElementById("ra-recipients");
    if (!host) return;
    const rows = Array.isArray(participants) ? participants : [];
    if (!rows.length) {
      host.innerHTML = '<p class="muted">No hay jugadores disponibles.</p>';
      return;
    }
    host.innerHTML = rows
      .map((row) => {
        const player = row.player || {};
        return `
          <label class="ra-recipient-item">
            <input type="checkbox" class="ra-recipient-check" value="${escapeHtml(player.id)}">
            <span>${escapeHtml(player.name || "Jugador")}</span>
          </label>
        `;
      })
      .join("");
  }

  function renderNarratorList(handouts) {
    const host = document.getElementById("ra-narrator-list");
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
              .map(
                (delivery) => `
                  <span class="ra-delivery-chip associated">
                    ${escapeHtml(delivery.recipient?.name || "Jugador")}
                    <button type="button" class="ra-delivery-remove" data-delivery-id="${escapeHtml(
                      delivery.id,
                    )}" title="Quitar asociación">×</button>
                  </span>
                `,
              )
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
          <article class="ra-card" data-handout-id="${escapeHtml(item.id)}">
            <div class="ra-card-head">
              <h3>${escapeHtml(item.title || "Revelación")}</h3>
              <div class="ra-card-head-actions">
                <button type="button" class="btn btn--ghost ra-open-reader" data-handout-id="${escapeHtml(
                  item.id,
                )}">Leer</button>
                <button type="button" class="btn btn--danger ra-delete-handout" data-handout-id="${escapeHtml(
                  item.id,
                )}">Eliminar</button>
              </div>
            </div>
            <p class="ra-meta">${escapeHtml(created)}</p>
            ${item.image_url ? `<a class="ra-image-link" href="${escapeHtml(item.image_url)}" target="_blank" rel="noopener">Ver imagen</a>` : ""}
            <p class="ra-preview">${escapeHtml(bodyPreview || "Sin descripción.")}</p>
            <div class="ra-delivery-list">${deliveriesHtml}</div>
          </article>
        `;
      })
      .join("");
  }

  function renderPlayerList(deliveries) {
    const host = document.getElementById("ra-player-list");
    const count = document.getElementById("ra-player-count");
    if (!host) return;

    const rows = Array.isArray(deliveries) ? deliveries : [];
    if (count) count.textContent = String(rows.length);

    if (!rows.length) {
      host.innerHTML = '<p class="muted">No hay revelaciones asociadas.</p>';
      return;
    }

    host.innerHTML = rows
      .map((row) => {
        const handout = row.handout || {};
        const title = escapeHtml(handout.title || "Revelación");
        const deliveredAt = row.delivered_at
          ? new Date(row.delivered_at).toLocaleString("es-AR")
          : "Ahora";
        return `
          <article class="ra-card ra-card--clickable" data-delivery-id="${escapeHtml(row.id)}">
            <h3>${title}</h3>
            <p class="ra-meta">Asociada: ${escapeHtml(deliveredAt)}</p>
          </article>
        `;
      })
      .join("");
  }

  function openReader({ title, bodyMarkdown, imageUrl }) {
    const titleEl = document.getElementById("ra-reader-title");
    const bodyEl = document.getElementById("ra-reader-content");
    const imageEl = document.getElementById("ra-reader-image");
    if (!titleEl || !bodyEl || !imageEl) return;

    titleEl.textContent = title || "Revelación";
    bodyEl.innerHTML = global.renderMarkdown(bodyMarkdown || "");

    const url = String(imageUrl || "").trim();
    if (url) {
      imageEl.src = url;
      imageEl.classList.remove("hidden");
    } else {
      imageEl.src = "";
      imageEl.classList.add("hidden");
    }
  }

  ns.view = {
    setHeader,
    setAccessMode,
    setMessage,
    clearForm,
    renderRecipients,
    renderNarratorList,
    renderPlayerList,
    openReader,
  };
})(window);
