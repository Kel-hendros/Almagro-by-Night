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
    document.getElementById("ra-back-active-session")?.classList.toggle("hidden", !isNarrator);
    document.getElementById("ra-open-create")?.classList.toggle("hidden", !isNarrator);
  }

  function renderNarratorList(handouts) {
    const host = document.getElementById("ra-narrator-list");
    if (!host) return;

    const rows = (Array.isArray(handouts) ? handouts : [])
      .slice()
      .sort((a, b) => new Date(b?.created_at || 0) - new Date(a?.created_at || 0));
    if (!rows.length) {
      host.innerHTML = '<p class="muted">Aún no hay revelaciones en esta crónica.</p>';
      return;
    }

    host.innerHTML = rows
      .map((item) => {
        const deliveries = Array.isArray(item.deliveries) ? item.deliveries : [];
        const deliveriesHtml = deliveries.length
          ? deliveries
              .map((delivery) =>
                global.ABNCharacterChip
                  ? global.ABNCharacterChip.buildChipMarkup(delivery.recipient || delivery, {
                      removable: true,
                      selected: true,
                      removeDataAttr: { key: "data-delivery-id", value: delivery.id },
                    })
                  : `<span class="abn-chip abn-chip--associated">${escapeHtml(
                      delivery.recipient?.character_name || delivery.recipient?.name || "Personaje",
                    )}</span>`,
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
        const tagsHtml = (item.tags || []).length
          ? `<div class="ra-tags-row">${item.tags.map(t => `<span class="ra-tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : "";

        return `
          <article class="ra-card" data-handout-id="${escapeHtml(item.id)}">
            ${item.image_signed_url
              ? `<div class="ra-card-image-wrap">
                   <img class="ra-card-image" src="${escapeHtml(item.image_signed_url)}" alt="${escapeHtml(item.title || "Revelación")}">
                 </div>`
              : ""
            }
            <div class="ra-card-head">
              <h3>${escapeHtml(item.title || "Revelación")}</h3>
              <button type="button" class="btn-icon btn-icon--danger ra-delete-handout"
                data-handout-id="${escapeHtml(item.id)}" title="Eliminar revelación">
                <i data-lucide="trash-2"></i>
              </button>
            </div>
            <p class="ra-meta">${escapeHtml(created)}</p>
            ${tagsHtml}
            <p class="ra-preview">${escapeHtml(bodyPreview || "Sin descripción.")}</p>
            <div class="ra-card-footer">
              <span class="ra-recipient-badge">
                <i data-lucide="users"></i>
                <span>${deliveries.length}</span>
              </span>
              <div class="ra-delivery-list">${deliveriesHtml}</div>
            </div>
          </article>
        `;
      })
      .join("");

    if (global.lucide) lucide.createIcons({ nodes: [host] });
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
        const tagsHtml = (handout.tags || []).length
          ? `<div class="ra-tags-row">${handout.tags.map(t => `<span class="ra-tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : "";
        return `
          <article class="ra-card ra-card--clickable" data-delivery-id="${escapeHtml(row.id)}">
            <div class="ra-card-head"><h3>${title}</h3></div>
            <p class="ra-meta">Asociada: ${escapeHtml(deliveredAt)}</p>
            ${tagsHtml}
          </article>
        `;
      })
      .join("");
  }

  function getSearchQuery() {
    return document.getElementById("ra-search")?.value?.trim() || "";
  }

  ns.view = {
    setHeader,
    setAccessMode,
    renderNarratorList,
    renderPlayerList,
    getSearchQuery,
  };
})(window);
