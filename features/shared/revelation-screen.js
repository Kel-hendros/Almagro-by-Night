(function initSharedRevelationScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const CHRONICLE_STORAGE_LIMIT_REACHED_CODE = "chronicle_storage_limit_reached";

  let overlay = null;
  let formScreen = null;
  let viewScreen = null;
  let bound = false;
  let currentCallbacks = { onSaved: null, onClosed: null };
  let formState = {
    chronicleId: null,
    currentPlayerId: null,
    editingHandoutId: null,
    existingImageRef: null,
  };

  function handouts() {
    return root.handouts || null;
  }

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ── DOM creation ──

  function ensureDOM() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "rs-overlay";
    overlay.innerHTML = `
      <div class="rs-screen rs-screen--form" id="rs-form-screen">
        <header class="rs-header">
          <button type="button" class="rs-back-btn" id="rs-form-back">
            <i data-lucide="arrow-left"></i>
            <span>Volver</span>
          </button>
          <h2 class="rs-title" id="rs-form-title">Crear Revelacion</h2>
        </header>
        <div class="rs-body">
          <div class="rs-form-wrap">
            <div class="rs-form-group">
              <label class="rs-label" for="rs-title-input">Titulo</label>
              <input id="rs-title-input" class="rs-input" type="text" maxlength="120" placeholder="Ej: Carta encontrada en el Elysium">
            </div>
            <div class="rs-form-group">
              <label class="rs-label" for="rs-tags-input">Tags <span class="rs-hint">(separados por coma)</span></label>
              <input id="rs-tags-input" class="rs-input" type="text" placeholder="Ej: elysium, carta, pista">
            </div>
            <div class="rs-form-group">
              <label class="rs-label" for="rs-image-file">Imagen <span class="rs-hint">(opcional)</span></label>
              <input id="rs-image-file" class="rs-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
              <input id="rs-image-ref" type="hidden">
              <div class="rs-image-row">
                <button type="button" id="rs-image-clear" class="btn btn--ghost">Quitar Imagen</button>
                <span id="rs-image-status" class="rs-image-status">Sin imagen seleccionada.</span>
              </div>
            </div>
            <div class="rs-form-group rs-form-group--grow">
              <label class="rs-label" for="rs-body-input">Descripcion <span class="rs-hint">(soporta Markdown)</span></label>
              <textarea id="rs-body-input" class="rs-textarea" rows="6" placeholder="Describe la revelacion..."></textarea>
            </div>
            <div class="rs-form-group">
              <label class="rs-label">Destinatarios</label>
              <div id="rs-recipients" class="rs-recipients">
                <p class="muted">Cargando jugadores...</p>
              </div>
            </div>
            <span id="rs-form-msg" class="rs-msg"></span>
          </div>
        </div>
        <footer class="rs-footer">
          <button type="button" id="rs-form-cancel" class="btn btn--ghost">Cancelar</button>
          <button type="button" id="rs-form-save" class="btn btn--primary">Guardar Revelacion</button>
        </footer>
      </div>

      <div class="rs-screen rs-screen--view" id="rs-view-screen">
        <header class="rs-header">
          <button type="button" class="rs-back-btn" id="rs-view-back">
            <i data-lucide="arrow-left"></i>
            <span>Volver</span>
          </button>
        </header>
        <div class="rs-body">
          <div class="rs-view-wrap">
            <h1 class="rs-view-title" id="rs-view-title"></h1>
            <div class="rs-view-tags" id="rs-view-tags"></div>
            <img id="rs-view-image" class="rs-view-image hidden" alt="">
            <div id="rs-view-content" class="rs-view-content"></div>
          </div>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    formScreen = overlay.querySelector("#rs-form-screen");
    viewScreen = overlay.querySelector("#rs-view-screen");

    if (global.lucide) {
      lucide.createIcons({ nodes: [overlay] });
    }

    bindListeners();
  }

  // ── Listeners ──

  function bindListeners() {
    if (bound) return;

    overlay.querySelector("#rs-form-back")?.addEventListener("click", close);
    overlay.querySelector("#rs-form-cancel")?.addEventListener("click", close);
    overlay.querySelector("#rs-view-back")?.addEventListener("click", close);
    overlay.querySelector("#rs-form-save")?.addEventListener("click", handleSave);

    overlay.querySelector("#rs-recipients")?.addEventListener("click", (e) => {
      const chip = e.target.closest(".rs-recipient-chip");
      if (!chip) return;
      const next = !chip.classList.contains("is-selected");
      chip.classList.toggle("is-selected", next);
      chip.setAttribute("aria-pressed", next ? "true" : "false");
    });

    overlay.querySelector("#rs-image-file")?.addEventListener("change", (e) => {
      const file = e.target?.files?.[0] || null;
      if (file) {
        setImageStatus(`Archivo seleccionado: ${file.name}`);
        return;
      }
      const hasSaved = Boolean(String(overlay.querySelector("#rs-image-ref")?.value || "").trim());
      setImageStatus(
        hasSaved ? "Imagen actual guardada." : "Sin imagen seleccionada.",
        hasSaved ? "ok" : "neutral",
      );
    });

    overlay.querySelector("#rs-image-clear")?.addEventListener("click", () => {
      const imageFile = overlay.querySelector("#rs-image-file");
      const imageRef = overlay.querySelector("#rs-image-ref");
      if (imageFile) imageFile.value = "";
      if (imageRef) imageRef.value = "";
      setImageStatus("La imagen se eliminara al guardar.", "error");
    });

    document.addEventListener("keydown", onKeyDown);
    bound = true;
  }

  function onKeyDown(e) {
    if (e.key === "Escape" && isOpen()) close();
  }

  // ── Form helpers ──

  function clearForm() {
    const titleInput = overlay.querySelector("#rs-title-input");
    const tagsInput = overlay.querySelector("#rs-tags-input");
    const imageFile = overlay.querySelector("#rs-image-file");
    const imageRef = overlay.querySelector("#rs-image-ref");
    const body = overlay.querySelector("#rs-body-input");
    if (titleInput) titleInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (imageFile) imageFile.value = "";
    if (imageRef) imageRef.value = "";
    if (body) body.value = "";
    setImageStatus("Sin imagen seleccionada.");
    setFormMsg("");
    overlay.querySelectorAll(".rs-recipient-chip").forEach((node) => {
      node.classList.remove("is-selected");
      node.setAttribute("aria-pressed", "false");
    });
  }

  function populateForm({ title, imageRef, bodyMarkdown, recipientPlayerIds, tags }) {
    const titleInput = overlay.querySelector("#rs-title-input");
    const tagsInput = overlay.querySelector("#rs-tags-input");
    const imageFileInput = overlay.querySelector("#rs-image-file");
    const imageRefInput = overlay.querySelector("#rs-image-ref");
    const bodyInput = overlay.querySelector("#rs-body-input");

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
    overlay.querySelectorAll(".rs-recipient-chip").forEach((node) => {
      const isSel = selected.has(String(node.dataset.playerId || ""));
      node.classList.toggle("is-selected", isSel);
      node.setAttribute("aria-pressed", isSel ? "true" : "false");
    });
  }

  function renderRecipients(participants) {
    const host = overlay.querySelector("#rs-recipients");
    if (!host) return;
    const rows = Array.isArray(participants) ? participants : [];
    if (!rows.length) {
      host.innerHTML = '<p class="muted">No hay personajes disponibles en esta cronica.</p>';
      return;
    }
    host.innerHTML = rows
      .map((row) => {
        const avatarUrl = String(row.avatar_url || "").trim();
        const avatar = avatarUrl
          ? `<img class="rs-recipient-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(row.character_name || "Personaje")}">`
          : `<span class="rs-recipient-avatar-fallback">${escapeHtml((row.character_name || "?").charAt(0).toUpperCase())}</span>`;
        return `
          <button
            type="button"
            class="rs-recipient-chip"
            data-player-id="${escapeHtml(row.player_id)}"
            data-character-id="${escapeHtml(row.character_sheet_id)}"
            aria-pressed="false"
            title="${escapeHtml(row.character_name || "Personaje")}"
          >
            <span class="rs-recipient-avatar">${avatar}</span>
            <span class="rs-recipient-name">${escapeHtml(row.character_name || "Personaje")}</span>
          </button>
        `;
      })
      .join("");
  }

  function setImageStatus(message, tone) {
    const el = overlay?.querySelector("#rs-image-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function setFormMsg(message, tone) {
    const el = overlay?.querySelector("#rs-form-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function getSelectedRecipientIds() {
    return Array.from(
      new Set(
        Array.from(overlay.querySelectorAll(".rs-recipient-chip.is-selected"))
          .map((node) => node.dataset.playerId || "")
          .filter(Boolean),
      ),
    );
  }

  // ── Save ──

  async function handleSave() {
    const api = handouts();
    if (!api) return;

    const title = overlay.querySelector("#rs-title-input")?.value || "";
    const bodyMarkdown = overlay.querySelector("#rs-body-input")?.value || "";
    const imageRefInput = overlay.querySelector("#rs-image-ref");
    const imageFileInput = overlay.querySelector("#rs-image-file");
    const selectedFile = imageFileInput?.files?.[0] || null;

    let imageRef = String(imageRefInput?.value || "").trim();
    let uploadedImageRef = null;

    if (selectedFile) {
      setImageStatus(`Subiendo ${selectedFile.name}...`);
      const uploadRes = await api.uploadHandoutImage({
        chronicleId: formState.chronicleId,
        file: selectedFile,
      });
      if (uploadRes.error || !uploadRes.imageRef) {
        if (uploadRes.error?.code === CHRONICLE_STORAGE_LIMIT_REACHED_CODE) {
          const showModal = root.modal?.showChronicleStorageLimitReached;
          if (typeof showModal === "function") await showModal();
        }
        setImageStatus("No se pudo subir la imagen.", "error");
        setFormMsg(uploadRes.error?.message || "No se pudo subir la imagen.", "error");
        return;
      }
      uploadedImageRef = uploadRes.imageRef;
      imageRef = uploadedImageRef;
      if (imageRefInput) imageRefInput.value = imageRef;
      if (imageFileInput) imageFileInput.value = "";
      setImageStatus("Imagen cargada y lista para guardar.", "ok");
    }

    const tagsRaw = overlay.querySelector("#rs-tags-input")?.value || "";
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const payload = {
      title,
      bodyMarkdown,
      imageRef,
      recipientPlayerIds: getSelectedRecipientIds(),
      tags,
    };

    const { error } = formState.editingHandoutId
      ? await api.updateHandout({ revelationId: formState.editingHandoutId, ...payload })
      : await api.createHandout({
          chronicleId: formState.chronicleId,
          createdByPlayerId: formState.currentPlayerId,
          ...payload,
        });

    if (error) {
      if (uploadedImageRef) {
        await api.deleteHandoutImage(uploadedImageRef);
      }
      setFormMsg(error.message || "No se pudo guardar revelacion.", "error");
      return;
    }

    if (typeof currentCallbacks.onSaved === "function") {
      currentCallbacks.onSaved();
    }
    close();
  }

  // ── Show / hide helpers ──

  function showOverlay() {
    ensureDOM();
    overlay.classList.add("active");
  }

  function showScreen(screen) {
    formScreen.classList.remove("active");
    viewScreen.classList.remove("active");
    screen.classList.add("active");
  }

  // ── Public API ──

  async function openCreate({ chronicleId, currentPlayerId, onSaved, onClosed } = {}) {
    showOverlay();
    showScreen(formScreen);

    formState.chronicleId = chronicleId;
    formState.currentPlayerId = currentPlayerId;
    formState.editingHandoutId = null;
    formState.existingImageRef = null;
    currentCallbacks = { onSaved: onSaved || null, onClosed: onClosed || null };

    const heading = overlay.querySelector("#rs-form-title");
    const saveBtn = overlay.querySelector("#rs-form-save");
    if (heading) heading.textContent = "Crear Revelacion";
    if (saveBtn) saveBtn.textContent = "Guardar Revelacion";

    clearForm();

    const api = handouts();
    if (api) {
      const recipients = await api.getRecipientCharacters(chronicleId, currentPlayerId);
      renderRecipients(recipients);
    }

    overlay.querySelector("#rs-title-input")?.focus();
  }

  async function openEdit({ chronicleId, currentPlayerId, handout, onSaved, onClosed } = {}) {
    if (!handout) return;
    showOverlay();
    showScreen(formScreen);

    formState.chronicleId = chronicleId;
    formState.currentPlayerId = currentPlayerId;
    formState.editingHandoutId = handout.id;
    formState.existingImageRef = handout.image_url || null;
    currentCallbacks = { onSaved: onSaved || null, onClosed: onClosed || null };

    const heading = overlay.querySelector("#rs-form-title");
    const saveBtn = overlay.querySelector("#rs-form-save");
    if (heading) heading.textContent = "Editar Revelacion";
    if (saveBtn) saveBtn.textContent = "Guardar Cambios";

    clearForm();

    const api = handouts();
    if (api) {
      const recipients = await api.getRecipientCharacters(chronicleId, currentPlayerId);
      renderRecipients(recipients);
    }

    populateForm({
      title: handout.title || "",
      imageRef: handout.image_url || "",
      bodyMarkdown: handout.body_markdown || "",
      recipientPlayerIds: (handout.deliveries || []).map((d) => d.recipient_player_id),
      tags: handout.tags || [],
    });

    overlay.querySelector("#rs-title-input")?.focus();
  }

  function openView({ title, bodyMarkdown, imageUrl, tags, onClosed } = {}) {
    showOverlay();
    showScreen(viewScreen);

    currentCallbacks = { onSaved: null, onClosed: onClosed || null };

    const titleEl = overlay.querySelector("#rs-view-title");
    const tagsEl = overlay.querySelector("#rs-view-tags");
    const imageEl = overlay.querySelector("#rs-view-image");
    const contentEl = overlay.querySelector("#rs-view-content");

    if (titleEl) titleEl.textContent = title || "Revelacion";

    if (tagsEl) {
      const tagList = Array.isArray(tags) ? tags : [];
      tagsEl.innerHTML = tagList.length
        ? tagList.map((t) => `<span class="rs-tag">${escapeHtml(t)}</span>`).join("")
        : "";
    }

    const url = String(imageUrl || "").trim();
    if (imageEl) {
      if (url) {
        imageEl.src = url;
        imageEl.classList.remove("hidden");
      } else {
        imageEl.src = "";
        imageEl.classList.add("hidden");
      }
    }

    if (contentEl) {
      contentEl.innerHTML = global.renderMarkdown
        ? global.renderMarkdown(bodyMarkdown || "")
        : escapeHtml(bodyMarkdown || "");
    }
  }

  function close() {
    if (!overlay) return;
    overlay.classList.remove("active");
    if (typeof currentCallbacks.onClosed === "function") {
      currentCallbacks.onClosed();
    }
    currentCallbacks = { onSaved: null, onClosed: null };
  }

  function isOpen() {
    return overlay ? overlay.classList.contains("active") : false;
  }

  root.revelationScreen = {
    openCreate,
    openEdit,
    openView,
    close,
    isOpen,
  };
})(window);
