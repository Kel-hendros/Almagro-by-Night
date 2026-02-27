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
    const el = document.getElementById("ra-modal-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function clearForm() {
    const title = document.getElementById("ra-title-input");
    const tagsInput = document.getElementById("ra-tags-input");
    const imageFile = document.getElementById("ra-image-file-input");
    const imageRef = document.getElementById("ra-image-ref-input");
    const body = document.getElementById("ra-body-input");
    if (title) title.value = "";
    if (tagsInput) tagsInput.value = "";
    if (imageFile) imageFile.value = "";
    if (imageRef) imageRef.value = "";
    if (body) body.value = "";
    setImageStatus("Sin imagen seleccionada.");
    document.querySelectorAll(".ra-recipient-chip").forEach((node) => {
      node.classList.remove("is-selected");
      node.setAttribute("aria-pressed", "false");
    });
  }

  function setFormValues({ title, imageRef, bodyMarkdown, recipientPlayerIds, tags } = {}) {
    const titleInput = document.getElementById("ra-title-input");
    const tagsInput = document.getElementById("ra-tags-input");
    const imageFileInput = document.getElementById("ra-image-file-input");
    const imageRefInput = document.getElementById("ra-image-ref-input");
    const bodyInput = document.getElementById("ra-body-input");
    if (titleInput) titleInput.value = String(title || "");
    if (tagsInput) tagsInput.value = (Array.isArray(tags) ? tags : []).join(", ");
    if (imageFileInput) imageFileInput.value = "";
    if (imageRefInput) imageRefInput.value = String(imageRef || "").trim();
    if (bodyInput) bodyInput.value = String(bodyMarkdown || "");
    setImageStatus(
      imageRefInput?.value ? "Imagen actual guardada." : "Sin imagen seleccionada.",
      imageRefInput?.value ? "ok" : "neutral",
    );

    const selected = new Set((recipientPlayerIds || []).map((id) => String(id)));
    document.querySelectorAll(".ra-recipient-chip").forEach((node) => {
      const isSelected = selected.has(String(node.dataset.playerId || ""));
      node.classList.toggle("is-selected", isSelected);
      node.setAttribute("aria-pressed", isSelected ? "true" : "false");
    });
  }

  function setFormMode(mode) {
    const titleEl = document.getElementById("ra-handout-modal-title");
    const saveBtn = document.getElementById("ra-save");
    const isEdit = mode === "edit";
    if (titleEl) titleEl.textContent = isEdit ? "Editar Revelación" : "Crear Revelación";
    if (saveBtn) saveBtn.textContent = isEdit ? "Guardar Cambios" : "Guardar Revelación";
  }

  function setImageStatus(message, tone = "neutral") {
    const el = document.getElementById("ra-image-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function renderRecipients(participants) {
    const host = document.getElementById("ra-recipients");
    if (!host) return;
    const rows = Array.isArray(participants) ? participants : [];
    if (!rows.length) {
      host.innerHTML = '<p class="muted">No hay personajes disponibles en esta crónica.</p>';
      return;
    }
    host.innerHTML = rows
      .map((row) => {
        const avatarUrl = String(row.avatar_url || "").trim();
        const avatar = avatarUrl
          ? `<img class="ra-recipient-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(row.character_name || "Personaje")}">`
          : `<span class="ra-recipient-avatar-fallback">${escapeHtml((row.character_name || "?").charAt(0).toUpperCase())}</span>`;
        return `
          <button
            type="button"
            class="ra-recipient-chip"
            data-player-id="${escapeHtml(row.player_id)}"
            data-character-id="${escapeHtml(row.character_sheet_id)}"
            aria-pressed="false"
            title="${escapeHtml(row.character_name || "Personaje")}"
          >
            <span class="ra-recipient-avatar">${avatar}</span>
            <span class="ra-recipient-name">${escapeHtml(row.character_name || "Personaje")}</span>
          </button>
        `;
      })
      .join("");
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
        const associatedNames = deliveries
          .map((delivery) => delivery?.recipient?.name || "Jugador")
          .filter(Boolean);
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
        const tagsHtml = (item.tags || []).length
          ? `<div class="ra-tags-row">${item.tags.map(t => `<span class="ra-tag">${escapeHtml(t)}</span>`).join("")}</div>`
          : "";

        return `
          <article class="ra-card" data-handout-id="${escapeHtml(item.id)}">
            <div class="ra-card-image-wrap">
              ${
                item.image_signed_url
                  ? `<img class="ra-card-image" src="${escapeHtml(item.image_signed_url)}" alt="${escapeHtml(item.title || "Revelación")}">`
                  : `<div class="ra-card-image ra-card-image--empty">Sin imagen</div>`
              }
            </div>
            <div class="ra-card-head">
              <h3>${escapeHtml(item.title || "Revelación")}</h3>
            </div>
            <p class="ra-meta">${escapeHtml(created)}</p>
            ${tagsHtml}
            <p class="ra-associated-line"><strong>Jugadores:</strong> ${escapeHtml(associatedNames.join(", ") || "Sin destinatarios")}</p>
            <p class="ra-preview">${escapeHtml(bodyPreview || "Sin descripción.")}</p>
            <div class="ra-delivery-list">${deliveriesHtml}</div>
            <div class="ra-card-actions">
              <button type="button" class="btn btn--danger ra-delete-handout" data-handout-id="${escapeHtml(
                item.id,
              )}">Eliminar</button>
            </div>
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

  function getSearchQuery() {
    return document.getElementById("ra-search")?.value?.trim() || "";
  }

  ns.view = {
    setHeader,
    setAccessMode,
    setMessage,
    clearForm,
    setFormValues,
    setFormMode,
    setImageStatus,
    renderRecipients,
    renderNarratorList,
    renderPlayerList,
    openReader,
    getSearchQuery,
  };
})(window);
