(function initSharedRevelationScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const CHRONICLE_STORAGE_LIMIT_REACHED_CODE = "chronicle_storage_limit_reached";

  let currentScreen = null;
  let currentFormHost = null;
  let isSaving = false;

  let currentCallbacks = { onSaved: null, onEdit: null, onClosed: null };
  let formState = {
    chronicleId: null,
    currentPlayerId: null,
    editingHandoutId: null,
    existingImageRef: null,
  };

  function handouts() {
    return root.handouts || null;
  }

  function documentScreen() {
    return root.documentScreen || null;
  }

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function getFormEl(selector) {
    return currentFormHost?.querySelector(selector) || null;
  }

  function formMarkup() {
    return `
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
          <label class="rs-label">Imagen <span class="rs-hint">(opcional)</span></label>
          <div class="rs-upload-area" id="rs-upload-area">
            <input id="rs-image-file" class="rs-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
            <div class="rs-upload-placeholder" id="rs-upload-placeholder">
              <i data-lucide="image-plus"></i>
              <span>Seleccionar imagen</span>
            </div>
            <div class="rs-upload-preview hidden" id="rs-upload-preview">
              <img id="rs-preview-img" class="rs-preview-img" alt="Preview">
            </div>
          </div>
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
    `;
  }

  function viewMarkup({ bodyMarkdown, imageUrl }) {
    const url = String(imageUrl || "").trim();
    const hasImage = Boolean(url);

    const contentHtml = global.renderMarkdown
      ? global.renderMarkdown(bodyMarkdown || "")
      : escapeHtml(bodyMarkdown || "");

    return `
      ${
        hasImage
          ? `<details id="rs-detail-image" class="rs-detail-section" open>
               <summary class="rs-detail-summary">
                 <span>Imagen</span>
                 <i data-lucide="chevron-down" class="rs-detail-chevron"></i>
               </summary>
               <div class="rs-detail-content">
                 <img src="${escapeHtml(url)}" class="rs-view-image" alt="Imagen de revelación">
               </div>
             </details>`
          : ""
      }
      <div class="rs-desc-section">
        <div class="rs-desc-header">Descripcion</div>
        <div class="rs-desc-body">
          <div id="rs-view-content" class="doc-markdown">${contentHtml}</div>
        </div>
      </div>
    `;
  }

  function resetUploadPreview() {
    const placeholder = getFormEl("#rs-upload-placeholder");
    const preview = getFormEl("#rs-upload-preview");
    const previewImg = getFormEl("#rs-preview-img");
    if (placeholder) placeholder.classList.remove("hidden");
    if (preview) preview.classList.add("hidden");
    if (previewImg) previewImg.src = "";
  }

  function showUploadPreview(src) {
    const placeholder = getFormEl("#rs-upload-placeholder");
    const preview = getFormEl("#rs-upload-preview");
    const previewImg = getFormEl("#rs-preview-img");
    if (previewImg) previewImg.src = src;
    if (placeholder) placeholder.classList.add("hidden");
    if (preview) preview.classList.remove("hidden");
  }

  function setImageStatus(message, tone) {
    const el = getFormEl("#rs-image-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function setFormMsg(message, tone) {
    const el = getFormEl("#rs-form-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function clearForm() {
    const titleInput = getFormEl("#rs-title-input");
    const tagsInput = getFormEl("#rs-tags-input");
    const imageFile = getFormEl("#rs-image-file");
    const imageRef = getFormEl("#rs-image-ref");
    const body = getFormEl("#rs-body-input");
    if (titleInput) titleInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (imageFile) imageFile.value = "";
    if (imageRef) imageRef.value = "";
    if (body) body.value = "";
    resetUploadPreview();
    setImageStatus("Sin imagen seleccionada.");
    setFormMsg("");
    currentFormHost?.querySelectorAll(".rs-recipient-chip").forEach((node) => {
      node.classList.remove("is-selected");
      node.setAttribute("aria-pressed", "false");
    });
  }

  function renderRecipients(participants) {
    const host = getFormEl("#rs-recipients");
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

  async function populateForm({ title, imageRef, bodyMarkdown, recipientPlayerIds, tags }) {
    const titleInput = getFormEl("#rs-title-input");
    const tagsInput = getFormEl("#rs-tags-input");
    const imageFileInput = getFormEl("#rs-image-file");
    const imageRefInput = getFormEl("#rs-image-ref");
    const bodyInput = getFormEl("#rs-body-input");

    if (titleInput) titleInput.value = String(title || "");
    if (tagsInput) tagsInput.value = (Array.isArray(tags) ? tags : []).join(", ");
    if (imageFileInput) imageFileInput.value = "";
    if (imageRefInput) imageRefInput.value = String(imageRef || "").trim();
    if (bodyInput) bodyInput.value = String(bodyMarkdown || "");

    setImageStatus(
      imageRefInput?.value ? "Imagen actual guardada." : "Sin imagen seleccionada.",
      imageRefInput?.value ? "ok" : "neutral",
    );

    if (imageRefInput?.value) {
      const api = handouts();
      if (api?.resolveImageSignedUrl) {
        const signedUrl = await api.resolveImageSignedUrl(imageRefInput.value);
        if (signedUrl) showUploadPreview(signedUrl);
      }
    } else {
      resetUploadPreview();
    }

    const selected = new Set((recipientPlayerIds || []).map((id) => String(id)));
    currentFormHost?.querySelectorAll(".rs-recipient-chip").forEach((node) => {
      const isSel = selected.has(String(node.dataset.playerId || ""));
      node.classList.toggle("is-selected", isSel);
      node.setAttribute("aria-pressed", isSel ? "true" : "false");
    });
  }

  function getSelectedRecipientIds() {
    if (!currentFormHost) return [];
    return Array.from(
      new Set(
        Array.from(currentFormHost.querySelectorAll(".rs-recipient-chip.is-selected"))
          .map((node) => node.dataset.playerId || "")
          .filter(Boolean),
      ),
    );
  }

  function bindFormListeners() {
    const recipients = getFormEl("#rs-recipients");
    recipients?.addEventListener("click", (event) => {
      const chip = event.target.closest(".rs-recipient-chip");
      if (!chip) return;
      const next = !chip.classList.contains("is-selected");
      chip.classList.toggle("is-selected", next);
      chip.setAttribute("aria-pressed", next ? "true" : "false");
    });

    const imageFile = getFormEl("#rs-image-file");
    imageFile?.addEventListener("change", (event) => {
      const file = event.target?.files?.[0] || null;
      const placeholder = getFormEl("#rs-upload-placeholder");
      const preview = getFormEl("#rs-upload-preview");
      const previewImg = getFormEl("#rs-preview-img");

      if (file) {
        setImageStatus(`Archivo seleccionado: ${file.name}`);
        const reader = new FileReader();
        reader.onload = (ev) => {
          if (previewImg) previewImg.src = ev.target.result;
          if (placeholder) placeholder.classList.add("hidden");
          if (preview) preview.classList.remove("hidden");
        };
        reader.readAsDataURL(file);
        return;
      }

      const hasSaved = Boolean(String(getFormEl("#rs-image-ref")?.value || "").trim());
      if (placeholder) placeholder.classList.toggle("hidden", hasSaved);
      if (preview) preview.classList.toggle("hidden", !hasSaved);
      setImageStatus(
        hasSaved ? "Imagen actual guardada." : "Sin imagen seleccionada.",
        hasSaved ? "ok" : "neutral",
      );
    });

    getFormEl("#rs-image-clear")?.addEventListener("click", () => {
      const imageRef = getFormEl("#rs-image-ref");
      if (imageFile) imageFile.value = "";
      if (imageRef) imageRef.value = "";
      resetUploadPreview();
      setImageStatus("La imagen se eliminara al guardar.", "error");
    });
  }

  function saveActionConfig() {
    return {
      id: "save",
      kind: "button",
      variant: "primary",
      label: isSaving ? "Guardando..." : formState.editingHandoutId ? "Guardar Cambios" : "Guardar Revelacion",
      disabled: isSaving,
      onClick: () => handleSave(),
    };
  }

  function syncSaveAction() {
    currentScreen?.setActions([saveActionConfig()]);
  }

  async function handleSave() {
    if (isSaving) return;

    const api = handouts();
    if (!api || !currentScreen) return;

    isSaving = true;
    syncSaveAction();

    const title = getFormEl("#rs-title-input")?.value || "";
    const bodyMarkdown = getFormEl("#rs-body-input")?.value || "";
    const imageRefInput = getFormEl("#rs-image-ref");
    const imageFileInput = getFormEl("#rs-image-file");
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
        isSaving = false;
        syncSaveAction();
        return;
      }
      uploadedImageRef = uploadRes.imageRef;
      imageRef = uploadedImageRef;
      if (imageRefInput) imageRefInput.value = imageRef;
      if (imageFileInput) imageFileInput.value = "";
      setImageStatus("Imagen cargada y lista para guardar.", "ok");
    }

    const tagsRaw = getFormEl("#rs-tags-input")?.value || "";
    const tags = tagsRaw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

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
      isSaving = false;
      syncSaveAction();
      return;
    }

    const onSaved = currentCallbacks.onSaved;
    if (typeof onSaved === "function") {
      onSaved();
    }

    isSaving = false;
    close();
  }

  async function openCreate({ chronicleId, currentPlayerId, onSaved, onClosed } = {}) {
    const ds = documentScreen();
    if (!ds) return;

    formState = {
      chronicleId,
      currentPlayerId,
      editingHandoutId: null,
      existingImageRef: null,
    };
    currentCallbacks = { onSaved: onSaved || null, onEdit: null, onClosed: onClosed || null };

    isSaving = false;
    currentScreen = ds.open({
      docType: "revelation",
      title: "Crear Revelacion",
      actions: [saveActionConfig()],
      bodyClass: "rs-body",
      renderBody: (body) => {
        body.innerHTML = formMarkup();
        currentFormHost = body;
        bindFormListeners();
        clearForm();
      },
      onClosed: () => {
        currentFormHost = null;
        currentScreen = null;
        isSaving = false;
        const onClosedCb = currentCallbacks.onClosed;
        currentCallbacks = { onSaved: null, onEdit: null, onClosed: null };
        if (typeof onClosedCb === "function") onClosedCb();
      },
    });

    const api = handouts();
    if (api) {
      const recipients = await api.getRecipientCharacters(chronicleId, currentPlayerId);
      renderRecipients(recipients);
    }

    getFormEl("#rs-title-input")?.focus();
    if (global.lucide?.createIcons && currentFormHost) {
      global.lucide.createIcons({ nodes: [currentFormHost] });
    }
  }

  async function openEdit({ chronicleId, currentPlayerId, handout, onSaved, onClosed } = {}) {
    if (!handout) return;
    const ds = documentScreen();
    if (!ds) return;

    formState = {
      chronicleId,
      currentPlayerId,
      editingHandoutId: handout.id,
      existingImageRef: handout.image_url || null,
    };
    currentCallbacks = { onSaved: onSaved || null, onEdit: null, onClosed: onClosed || null };

    isSaving = false;
    currentScreen = ds.open({
      docType: "revelation",
      title: "Editar Revelacion",
      actions: [saveActionConfig()],
      bodyClass: "rs-body",
      renderBody: (body) => {
        body.innerHTML = formMarkup();
        currentFormHost = body;
        bindFormListeners();
        clearForm();
      },
      onClosed: () => {
        currentFormHost = null;
        currentScreen = null;
        isSaving = false;
        const onClosedCb = currentCallbacks.onClosed;
        currentCallbacks = { onSaved: null, onEdit: null, onClosed: null };
        if (typeof onClosedCb === "function") onClosedCb();
      },
    });

    const api = handouts();
    if (api) {
      const recipients = await api.getRecipientCharacters(chronicleId, currentPlayerId);
      renderRecipients(recipients);
    }

    await populateForm({
      title: handout.title || "",
      imageRef: handout.image_url || "",
      bodyMarkdown: handout.body_markdown || "",
      recipientPlayerIds: (handout.deliveries || []).map((delivery) => delivery.recipient_player_id),
      tags: handout.tags || [],
    });

    getFormEl("#rs-title-input")?.focus();
    if (global.lucide?.createIcons && currentFormHost) {
      global.lucide.createIcons({ nodes: [currentFormHost] });
    }
  }

  function openView({ title, bodyMarkdown, imageUrl, tags, onEdit, onClosed } = {}) {
    const ds = documentScreen();
    if (!ds) return;

    currentCallbacks = { onSaved: null, onEdit: onEdit || null, onClosed: onClosed || null };

    const actions = [];
    if (typeof onEdit === "function") {
      actions.push({
        id: "edit",
        kind: "icon",
        icon: "pencil",
        title: "Editar",
        ariaLabel: "Editar",
        onClick: () => onEdit(),
      });
    }

    currentScreen = ds.open({
      docType: "revelation",
      title: title || "Revelacion",
      tags: Array.isArray(tags) ? tags : [],
      actions,
      bodyClass: "doc-view-body rs-view-body",
      renderBody: (body) => {
        body.innerHTML = viewMarkup({ bodyMarkdown, imageUrl });
      },
      onClosed: () => {
        currentFormHost = null;
        currentScreen = null;
        isSaving = false;
        const onClosedCb = currentCallbacks.onClosed;
        currentCallbacks = { onSaved: null, onEdit: null, onClosed: null };
        if (typeof onClosedCb === "function") onClosedCb();
      },
    });

    if (global.lucide?.createIcons) {
      const body = currentScreen?.getBody?.();
      if (body) global.lucide.createIcons({ nodes: [body] });
    }
  }

  function close() {
    if (!currentScreen) return;
    documentScreen()?.close();
  }

  function isOpen() {
    return Boolean(currentScreen);
  }

  root.revelationScreen = {
    openCreate,
    openEdit,
    openView,
    close,
    isOpen,
  };
})(window);
