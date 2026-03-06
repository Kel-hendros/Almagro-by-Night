(function initSharedRevelationScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const CHRONICLE_STORAGE_LIMIT_REACHED_CODE = "chronicle_storage_limit_reached";
  const DEFAULT_IMAGE_IMPORT_ERROR =
    "No se pudo cargar la imagen. Verifica que la URL sea directa o que la imagen esté disponible.";

  let currentScreen = null;
  let currentFormHost = null;
  let isSaving = false;
  let formSessionSeq = 0;
  let lightboxState = createLightboxState();

  let currentCallbacks = { onSaved: null, onEdit: null, onRevealAgain: null, onClosed: null };
  let formState = createEmptyFormState();
  let isRevealingAgain = false;

  function createEmptyFormState() {
    return {
      chronicleId: null,
      currentPlayerId: null,
      editingHandoutId: null,
      existingImageRef: null,
      draftImageRef: null,
      imageBusy: false,
      sessionToken: 0,
      previewObjectUrl: null,
    };
  }

  function createLightboxState() {
    return {
      overlay: null,
      stage: null,
      image: null,
      zoomInBtn: null,
      zoomOutBtn: null,
      zoomLabel: null,
      closeBtn: null,
      isOpen: false,
      scale: 1,
      minScale: 1,
      maxScale: 5,
      offsetX: 0,
      offsetY: 0,
      dragging: false,
      pointerId: null,
      dragStartX: 0,
      dragStartY: 0,
      dragOriginX: 0,
      dragOriginY: 0,
      keyHandler: null,
      resizeHandler: null,
    };
  }

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
          <div class="rs-image-tools">
            <div class="rs-image-url-row">
              <input id="rs-image-url" class="rs-input" type="url" placeholder="https://ejemplo.com/imagen.jpg">
              <button type="button" id="rs-image-url-import" class="btn btn--ghost">Cargar URL</button>
              <button type="button" id="rs-image-paste" class="btn btn--ghost">Pegar Imagen</button>
            </div>
            <span class="rs-upload-hint">También puedes pegar una imagen con Ctrl/Cmd+V dentro del editor.</span>
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

  function buildRecipientChipMarkup(row, { readonly = false, selected = false } = {}) {
    const characterName = String(
      row?.character_name || row?.recipient?.character_name || row?.player_name || row?.recipient?.name || "Personaje"
    ).trim() || "Personaje";
    const avatarUrl = String(row?.avatar_url || row?.recipient?.avatar_url || "").trim();
    const avatar = avatarUrl
      ? `<img class="rs-recipient-avatar-img" src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(characterName)}">`
      : `<span class="rs-recipient-avatar-fallback">${escapeHtml(characterName.charAt(0).toUpperCase())}</span>`;

    if (readonly) {
      return `
        <span
          class="rs-recipient-chip rs-recipient-chip--readonly"
          title="${escapeHtml(characterName)}"
        >
          <span class="rs-recipient-avatar">${avatar}</span>
          <span class="rs-recipient-name">${escapeHtml(characterName)}</span>
        </span>
      `;
    }

    return `
      <button
        type="button"
        class="rs-recipient-chip${selected ? " is-selected" : ""}"
        data-player-id="${escapeHtml(row.player_id)}"
        data-character-id="${escapeHtml(row.character_sheet_id)}"
        aria-pressed="${selected ? "true" : "false"}"
        title="${escapeHtml(characterName)}"
      >
        <span class="rs-recipient-avatar">${avatar}</span>
        <span class="rs-recipient-name">${escapeHtml(characterName)}</span>
      </button>
    `;
  }

  function viewDeliveriesMarkup(deliveries) {
    const rows = Array.isArray(deliveries) ? deliveries : [];
    const chipsHtml = rows.length
      ? rows.map((delivery) => buildRecipientChipMarkup(delivery, { readonly: true })).join("")
      : '<p class="rs-view-recipients-empty">Ningún personaje puede ver esta revelación.</p>';

    return `
      <div class="rs-form-group">
        <div class="rs-desc-header">Personajes revelados</div>
        <div class="rs-recipients rs-recipients--readonly">
          ${chipsHtml}
        </div>
      </div>
    `;
  }

  function buildViewSectionMarkup({ id, title, content, isOpen = false }) {
    return `
      <section class="rs-view-section${isOpen ? " is-open" : ""}" data-view-section="${escapeHtml(id)}">
        <button
          type="button"
          class="rs-view-section-toggle"
          data-view-toggle="${escapeHtml(id)}"
          aria-expanded="${isOpen ? "true" : "false"}"
        >
          <span class="rs-view-section-heading">
            <span class="rs-view-section-label">${escapeHtml(title)}</span>
            <span class="rs-view-section-hint">Sección desplegable</span>
          </span>
          <span class="rs-view-section-meta">
            <span class="rs-view-section-state">${isOpen ? "Abierto" : "Cerrado"}</span>
            <i data-lucide="chevron-down" class="rs-view-section-chevron"></i>
          </span>
        </button>
        <div class="rs-view-section-content">
          ${content}
        </div>
      </section>
    `;
  }

  function viewMarkup({ bodyMarkdown, imageUrl, deliveries, showDeliveries = false }) {
    const url = String(imageUrl || "").trim();
    const hasImage = Boolean(url);
    const openSection = hasImage ? "image" : "description";

    const contentHtml = global.renderMarkdown
      ? global.renderMarkdown(bodyMarkdown || "")
      : escapeHtml(bodyMarkdown || "");

    return `
      ${
        hasImage
          ? buildViewSectionMarkup({
              id: "image",
              title: "Imagen",
              isOpen: openSection === "image",
              content: `
                <div class="rs-view-image-wrap">
                  <img
                    src="${escapeHtml(url)}"
                    class="rs-view-image rs-view-image--interactive"
                    alt="Imagen de revelación"
                    title="Abrir imagen"
                    tabindex="0"
                    role="button"
                  >
                </div>
              `,
            })
          : ""
      }
      ${buildViewSectionMarkup({
        id: "description",
        title: "Descripción",
        isOpen: openSection === "description",
        content: `
          <div class="rs-desc-body">
            <div id="rs-view-content" class="doc-markdown">${contentHtml}</div>
          </div>
        `,
      })}
      ${showDeliveries ? viewDeliveriesMarkup(deliveries) : ""}
    `;
  }

  function getCurrentImageRef() {
    return String(getFormEl("#rs-image-ref")?.value || "").trim();
  }

  function setCurrentImageRef(value) {
    const input = getFormEl("#rs-image-ref");
    if (input) input.value = String(value || "").trim();
  }

  function revokePreviewObjectUrl() {
    if (!formState.previewObjectUrl || !global.URL?.revokeObjectURL) return;
    try {
      global.URL.revokeObjectURL(formState.previewObjectUrl);
    } catch (_error) {}
    formState.previewObjectUrl = null;
  }

  function resetUploadPreview() {
    const placeholder = getFormEl("#rs-upload-placeholder");
    const preview = getFormEl("#rs-upload-preview");
    const previewImg = getFormEl("#rs-preview-img");
    revokePreviewObjectUrl();
    if (placeholder) placeholder.classList.remove("hidden");
    if (preview) preview.classList.add("hidden");
    if (previewImg) previewImg.src = "";
  }

  function showUploadPreview(src, { objectUrl = false } = {}) {
    const placeholder = getFormEl("#rs-upload-placeholder");
    const preview = getFormEl("#rs-upload-preview");
    const previewImg = getFormEl("#rs-preview-img");

    revokePreviewObjectUrl();
    if (objectUrl) {
      formState.previewObjectUrl = src;
    }

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

  function syncImageControls() {
    const busy = formState.imageBusy;
    const uploadArea = getFormEl("#rs-upload-area");

    ["#rs-image-file", "#rs-image-url", "#rs-image-url-import", "#rs-image-paste", "#rs-image-clear"]
      .forEach((selector) => {
        const node = getFormEl(selector);
        if (node) node.disabled = busy;
      });

    uploadArea?.classList.toggle("is-busy", busy);
  }

  function clearForm() {
    const titleInput = getFormEl("#rs-title-input");
    const tagsInput = getFormEl("#rs-tags-input");
    const imageFile = getFormEl("#rs-image-file");
    const imageUrl = getFormEl("#rs-image-url");
    const body = getFormEl("#rs-body-input");

    if (titleInput) titleInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (imageFile) imageFile.value = "";
    if (imageUrl) imageUrl.value = "";
    setCurrentImageRef("");
    if (body) body.value = "";

    resetUploadPreview();
    setImageStatus("Sin imagen seleccionada.");
    setFormMsg("");
    syncImageControls();

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
    host.innerHTML = rows.map((row) => buildRecipientChipMarkup(row)).join("");
  }

  async function populateForm({ title, imageRef, bodyMarkdown, recipientPlayerIds, tags }) {
    const titleInput = getFormEl("#rs-title-input");
    const tagsInput = getFormEl("#rs-tags-input");
    const imageFileInput = getFormEl("#rs-image-file");
    const imageUrlInput = getFormEl("#rs-image-url");
    const bodyInput = getFormEl("#rs-body-input");

    if (titleInput) titleInput.value = String(title || "");
    if (tagsInput) tagsInput.value = (Array.isArray(tags) ? tags : []).join(", ");
    if (imageFileInput) imageFileInput.value = "";
    if (imageUrlInput) imageUrlInput.value = "";
    setCurrentImageRef(String(imageRef || "").trim());
    if (bodyInput) bodyInput.value = String(bodyMarkdown || "");

    setImageStatus(
      getCurrentImageRef() ? "Imagen actual guardada." : "Sin imagen seleccionada.",
      getCurrentImageRef() ? "ok" : "neutral"
    );

    if (getCurrentImageRef()) {
      const api = handouts();
      if (api?.resolveImageSignedUrl) {
        const signedUrl = await api.resolveImageSignedUrl(getCurrentImageRef());
        if (signedUrl) {
          showUploadPreview(signedUrl);
        } else {
          resetUploadPreview();
        }
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
          .filter(Boolean)
      )
    );
  }

  function getFileExtensionFromMimeType(mimeType) {
    const normalized = String(mimeType || "").toLowerCase();
    if (normalized === "image/jpeg") return "jpg";
    if (normalized === "image/png") return "png";
    if (normalized === "image/webp") return "webp";
    if (normalized === "image/gif") return "gif";
    if (normalized === "image/avif") return "avif";
    return "bin";
  }

  function inferMimeTypeFromUrl(url) {
    const lower = String(url || "").trim().toLowerCase();
    if (lower.endsWith(".png")) return "image/png";
    if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
    if (lower.endsWith(".webp")) return "image/webp";
    if (lower.endsWith(".gif")) return "image/gif";
    if (lower.endsWith(".avif")) return "image/avif";
    return "";
  }

  function buildFileName(baseName, mimeType) {
    const safeBase = String(baseName || "revelation-image")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "revelation-image";
    return `${safeBase}.${getFileExtensionFromMimeType(mimeType)}`;
  }

  function buildFileFromBlob(blob, { nameHint, mimeType } = {}) {
    const normalizedType = String(mimeType || blob?.type || "").toLowerCase();
    return new File([blob], buildFileName(nameHint, normalizedType), {
      type: normalizedType || "application/octet-stream",
    });
  }

  async function deleteImageRefSafe(imageRef) {
    const api = handouts();
    const ref = String(imageRef || "").trim();
    if (!api?.deleteHandoutImage || !ref) return;
    try {
      await api.deleteHandoutImage(ref);
    } catch (error) {
      console.warn("Revelaciones: no se pudo limpiar imagen temporal:", error);
    }
  }

  async function restorePreviewFromCurrentImageRef() {
    const currentRef = getCurrentImageRef();
    if (!currentRef) {
      resetUploadPreview();
      return;
    }

    const api = handouts();
    if (!api?.resolveImageSignedUrl) {
      resetUploadPreview();
      return;
    }

    const signedUrl = await api.resolveImageSignedUrl(currentRef);
    if (signedUrl) {
      showUploadPreview(signedUrl);
      return;
    }

    resetUploadPreview();
  }

  async function importImageFile(file, { previewBlob = null, successMessage = "" } = {}) {
    if (formState.imageBusy) {
      setFormMsg("Espera a que termine la carga de imagen actual.", "error");
      return;
    }

    const api = handouts();
    if (!api?.uploadHandoutImage) return;
    if (!file) {
      setFormMsg("Selecciona o pega una imagen primero.", "error");
      return;
    }

    const sessionToken = formState.sessionToken;
    const previousDraftRef = formState.draftImageRef;

    formState.imageBusy = true;
    syncImageControls();
    syncSaveAction();
    setFormMsg("");
    setImageStatus(`Subiendo ${file.name || "imagen"}...`);

    const previewSource = previewBlob || file;
    if (previewSource && typeof global.URL?.createObjectURL === "function") {
      showUploadPreview(global.URL.createObjectURL(previewSource), { objectUrl: true });
    }

    const uploadRes = await api.uploadHandoutImage({
      chronicleId: formState.chronicleId,
      file,
    });

    if (sessionToken !== formState.sessionToken) {
      if (uploadRes?.imageRef) {
        await deleteImageRefSafe(uploadRes.imageRef);
      }
      return;
    }

    formState.imageBusy = false;
    syncImageControls();
    syncSaveAction();

    if (uploadRes.error || !uploadRes.imageRef) {
      if (uploadRes.error?.code === CHRONICLE_STORAGE_LIMIT_REACHED_CODE) {
        const showModal = root.modal?.showChronicleStorageLimitReached;
        if (typeof showModal === "function") await showModal();
      }

      await restorePreviewFromCurrentImageRef();
      setImageStatus("No se pudo subir la imagen.", "error");
      setFormMsg(uploadRes.error?.message || "No se pudo subir la imagen.", "error");
      return;
    }

    if (previousDraftRef && previousDraftRef !== uploadRes.imageRef) {
      await deleteImageRefSafe(previousDraftRef);
    }

    formState.draftImageRef = uploadRes.imageRef;
    setCurrentImageRef(uploadRes.imageRef);
    const fileInput = getFormEl("#rs-image-file");
    const urlInput = getFormEl("#rs-image-url");
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
    setImageStatus(successMessage || "Imagen cargada y lista para guardar.", "ok");
  }

  async function fetchImageFileFromUrl(url) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) {
      throw new Error("Pega una URL de imagen.");
    }

    let response;
    try {
      response = await global.fetch(cleanUrl);
    } catch (_error) {
      throw new Error(DEFAULT_IMAGE_IMPORT_ERROR);
    }

    if (!response.ok) {
      throw new Error(`No se pudo descargar la imagen (${response.status}).`);
    }

    const blob = await response.blob();
    const mimeType = String(blob.type || inferMimeTypeFromUrl(cleanUrl) || "").toLowerCase();
    if (!mimeType.startsWith("image/")) {
      throw new Error("La URL no devolvió una imagen válida.");
    }

    const parsed = (() => {
      try {
        return new global.URL(cleanUrl);
      } catch (_error) {
        return null;
      }
    })();
    const rawName = parsed?.pathname?.split("/").pop() || "remote-image";
    const baseName = rawName.replace(/\.[a-z0-9]+$/i, "") || "remote-image";

    return {
      file: buildFileFromBlob(blob, { nameHint: baseName, mimeType }),
      previewBlob: blob,
    };
  }

  async function readClipboardImage() {
    if (!global.navigator?.clipboard?.read) {
      throw new Error("Tu navegador no permite leer imágenes del portapapeles desde este botón.");
    }

    const items = await global.navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((type) => String(type || "").startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      return {
        file: buildFileFromBlob(blob, { nameHint: `clipboard-${Date.now()}`, mimeType: imageType }),
        previewBlob: blob,
      };
    }

    throw new Error("No encontré una imagen en el portapapeles.");
  }

  async function clearCurrentImage() {
    if (formState.imageBusy) {
      setFormMsg("Espera a que termine la carga de imagen actual.", "error");
      return;
    }

    const currentRef = getCurrentImageRef();
    const isDraftImage = Boolean(formState.draftImageRef && currentRef === formState.draftImageRef);

    const fileInput = getFormEl("#rs-image-file");
    const urlInput = getFormEl("#rs-image-url");
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";

    if (isDraftImage) {
      const draftRef = formState.draftImageRef;
      formState.draftImageRef = null;
      setCurrentImageRef("");
      resetUploadPreview();
      setImageStatus(
        formState.existingImageRef ? "La imagen se eliminara al guardar." : "Sin imagen seleccionada.",
        formState.existingImageRef ? "error" : "neutral"
      );
      await deleteImageRefSafe(draftRef);
      return;
    }

    setCurrentImageRef("");
    resetUploadPreview();
    setImageStatus(
      formState.existingImageRef ? "La imagen se eliminara al guardar." : "Sin imagen seleccionada.",
      formState.existingImageRef ? "error" : "neutral"
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
    imageFile?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0] || null;
      if (!file) {
        await restorePreviewFromCurrentImageRef();
        setImageStatus(
          getCurrentImageRef() ? "Imagen actual guardada." : "Sin imagen seleccionada.",
          getCurrentImageRef() ? "ok" : "neutral"
        );
        return;
      }

      await importImageFile(file, {
        previewBlob: file,
        successMessage: `Imagen cargada desde archivo: ${file.name}`,
      });
    });

    getFormEl("#rs-image-url-import")?.addEventListener("click", async () => {
      if (formState.imageBusy) {
        setFormMsg("Espera a que termine la carga de imagen actual.", "error");
        return;
      }

      const url = getFormEl("#rs-image-url")?.value || "";
      try {
        const { file, previewBlob } = await fetchImageFileFromUrl(url);
        await importImageFile(file, {
          previewBlob,
          successMessage: "Imagen cargada desde URL.",
        });
      } catch (error) {
        setFormMsg(error.message || DEFAULT_IMAGE_IMPORT_ERROR, "error");
      }
    });

    getFormEl("#rs-image-paste")?.addEventListener("click", async () => {
      if (formState.imageBusy) {
        setFormMsg("Espera a que termine la carga de imagen actual.", "error");
        return;
      }

      try {
        const { file, previewBlob } = await readClipboardImage();
        await importImageFile(file, {
          previewBlob,
          successMessage: "Imagen cargada desde el portapapeles.",
        });
      } catch (error) {
        setFormMsg(error.message || "No se pudo leer la imagen del portapapeles.", "error");
      }
    });

    currentFormHost?.addEventListener("paste", async (event) => {
      if (formState.imageBusy) return;
      const items = Array.from(event.clipboardData?.items || []);
      const imageItem = items.find((item) => String(item.type || "").startsWith("image/"));
      if (!imageItem) return;

      const file = imageItem.getAsFile();
      if (!file) return;

      event.preventDefault();
      const clipboardFile = buildFileFromBlob(file, {
        nameHint: `clipboard-${Date.now()}`,
        mimeType: file.type,
      });

      await importImageFile(clipboardFile, {
        previewBlob: file,
        successMessage: "Imagen cargada desde el portapapeles.",
      });
    });

    getFormEl("#rs-image-clear")?.addEventListener("click", async () => {
      await clearCurrentImage();
    });
  }

  function ensureLightboxDom() {
    if (lightboxState.overlay) return;

    const overlay = document.createElement("div");
    overlay.className = "rs-lightbox-overlay hidden";
    overlay.innerHTML = `
      <div class="rs-lightbox-shell" role="dialog" aria-modal="true" aria-label="Imagen ampliada">
        <div class="rs-lightbox-toolbar">
          <div class="rs-lightbox-zoom-group">
            <button type="button" class="btn btn--ghost rs-lightbox-zoom-out" aria-label="Alejar">
              <i data-lucide="minus"></i>
            </button>
            <span class="rs-lightbox-zoom-label">100%</span>
            <button type="button" class="btn btn--ghost rs-lightbox-zoom-in" aria-label="Acercar">
              <i data-lucide="plus"></i>
            </button>
          </div>
          <button type="button" class="btn-modal-close rs-lightbox-close" aria-label="Cerrar imagen">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div class="rs-lightbox-stage">
          <img class="rs-lightbox-image" alt="Imagen ampliada">
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    lightboxState.overlay = overlay;
    lightboxState.stage = overlay.querySelector(".rs-lightbox-stage");
    lightboxState.image = overlay.querySelector(".rs-lightbox-image");
    lightboxState.zoomInBtn = overlay.querySelector(".rs-lightbox-zoom-in");
    lightboxState.zoomOutBtn = overlay.querySelector(".rs-lightbox-zoom-out");
    lightboxState.zoomLabel = overlay.querySelector(".rs-lightbox-zoom-label");
    lightboxState.closeBtn = overlay.querySelector(".rs-lightbox-close");

    lightboxState.zoomInBtn?.addEventListener("click", () => setLightboxScale(lightboxState.scale + 0.25));
    lightboxState.zoomOutBtn?.addEventListener("click", () => setLightboxScale(lightboxState.scale - 0.25));
    lightboxState.closeBtn?.addEventListener("click", () => closeImageLightbox());

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) {
        closeImageLightbox();
      }
    });

    lightboxState.stage?.addEventListener(
      "wheel",
      (event) => {
        if (!lightboxState.isOpen) return;
        event.preventDefault();
        const nextScale = lightboxState.scale + (event.deltaY < 0 ? 0.2 : -0.2);
        setLightboxScale(nextScale);
      },
      { passive: false }
    );

    lightboxState.stage?.addEventListener("pointerdown", onLightboxPointerDown);
    lightboxState.stage?.addEventListener("pointermove", onLightboxPointerMove);
    lightboxState.stage?.addEventListener("pointerup", onLightboxPointerUp);
    lightboxState.stage?.addEventListener("pointercancel", onLightboxPointerUp);

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [overlay] });
    }
  }

  function clampLightboxOffsets() {
    const stage = lightboxState.stage;
    const image = lightboxState.image;
    if (!stage || !image) return;

    const stageRect = stage.getBoundingClientRect();
    const baseWidth = image.offsetWidth || 0;
    const baseHeight = image.offsetHeight || 0;

    const maxOffsetX = Math.max(0, (baseWidth * lightboxState.scale - stageRect.width) / 2);
    const maxOffsetY = Math.max(0, (baseHeight * lightboxState.scale - stageRect.height) / 2);

    lightboxState.offsetX = Math.max(-maxOffsetX, Math.min(maxOffsetX, lightboxState.offsetX));
    lightboxState.offsetY = Math.max(-maxOffsetY, Math.min(maxOffsetY, lightboxState.offsetY));
  }

  function renderLightboxTransform() {
    const image = lightboxState.image;
    if (!image) return;

    clampLightboxOffsets();
    image.style.transform = `translate(${lightboxState.offsetX}px, ${lightboxState.offsetY}px) scale(${lightboxState.scale})`;
    image.classList.toggle("is-draggable", lightboxState.scale > 1.01);

    if (lightboxState.zoomLabel) {
      lightboxState.zoomLabel.textContent = `${Math.round(lightboxState.scale * 100)}%`;
    }
    if (lightboxState.zoomOutBtn) {
      lightboxState.zoomOutBtn.disabled = lightboxState.scale <= lightboxState.minScale;
    }
    if (lightboxState.zoomInBtn) {
      lightboxState.zoomInBtn.disabled = lightboxState.scale >= lightboxState.maxScale;
    }
  }

  function resetLightboxView() {
    lightboxState.scale = 1;
    lightboxState.offsetX = 0;
    lightboxState.offsetY = 0;
    renderLightboxTransform();
  }

  function setLightboxScale(nextScale) {
    lightboxState.scale = Math.max(lightboxState.minScale, Math.min(lightboxState.maxScale, nextScale));
    if (lightboxState.scale <= 1.01) {
      lightboxState.offsetX = 0;
      lightboxState.offsetY = 0;
    }
    renderLightboxTransform();
  }

  function onLightboxPointerDown(event) {
    if (!lightboxState.isOpen || lightboxState.scale <= 1.01) return;
    if (event.button !== 0) return;

    lightboxState.dragging = true;
    lightboxState.pointerId = event.pointerId;
    lightboxState.dragStartX = event.clientX;
    lightboxState.dragStartY = event.clientY;
    lightboxState.dragOriginX = lightboxState.offsetX;
    lightboxState.dragOriginY = lightboxState.offsetY;
    lightboxState.stage?.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function onLightboxPointerMove(event) {
    if (!lightboxState.dragging || event.pointerId !== lightboxState.pointerId) return;

    lightboxState.offsetX = lightboxState.dragOriginX + (event.clientX - lightboxState.dragStartX);
    lightboxState.offsetY = lightboxState.dragOriginY + (event.clientY - lightboxState.dragStartY);
    renderLightboxTransform();
  }

  function onLightboxPointerUp(event) {
    if (event.pointerId !== lightboxState.pointerId) return;

    lightboxState.dragging = false;
    lightboxState.pointerId = null;
    lightboxState.stage?.releasePointerCapture?.(event.pointerId);
  }

  function closeImageLightbox() {
    if (!lightboxState.isOpen) return;

    lightboxState.isOpen = false;
    lightboxState.dragging = false;
    lightboxState.pointerId = null;
    lightboxState.overlay?.classList.add("hidden");
    lightboxState.overlay?.classList.remove("active");
    if (lightboxState.image) {
      lightboxState.image.src = "";
      lightboxState.image.style.transform = "";
    }

    if (lightboxState.keyHandler) {
      document.removeEventListener("keydown", lightboxState.keyHandler, true);
      lightboxState.keyHandler = null;
    }
    if (lightboxState.resizeHandler) {
      global.removeEventListener("resize", lightboxState.resizeHandler);
      lightboxState.resizeHandler = null;
    }
  }

  function openImageLightbox(src) {
    const imageUrl = String(src || "").trim();
    if (!imageUrl) return;

    ensureLightboxDom();
    if (!lightboxState.overlay || !lightboxState.image) return;

    closeImageLightbox();

    lightboxState.isOpen = true;
    lightboxState.overlay.classList.remove("hidden");
    lightboxState.overlay.classList.add("active");
    lightboxState.image.src = imageUrl;
    lightboxState.image.onload = () => {
      resetLightboxView();
    };

    lightboxState.keyHandler = (event) => {
      if (!lightboxState.isOpen) return;
      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        closeImageLightbox();
      }
    };
    document.addEventListener("keydown", lightboxState.keyHandler, true);

    lightboxState.resizeHandler = () => {
      if (lightboxState.isOpen) {
        renderLightboxTransform();
      }
    };
    global.addEventListener("resize", lightboxState.resizeHandler);
  }

  function bindViewImageInteractions() {
    const image = currentScreen?.getBody?.()?.querySelector(".rs-view-image--interactive");
    if (!image) return;

    const open = () => openImageLightbox(image.getAttribute("src"));
    image.addEventListener("click", open);
    image.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });
  }

  function bindViewAccordions() {
    const body = currentScreen?.getBody?.();
    if (!body) return;

    const sections = Array.from(body.querySelectorAll("[data-view-section]"));
    if (!sections.length) return;

    function setOpenSection(sectionId) {
      sections.forEach((section) => {
        const isOpen = section.dataset.viewSection === sectionId;
        section.classList.toggle("is-open", isOpen);
        const toggle = section.querySelector("[data-view-toggle]");
        if (toggle) {
          toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
          const state = toggle.querySelector(".rs-view-section-state");
          if (state) state.textContent = isOpen ? "Abierto" : "Cerrado";
        }
      });
    }

    body.querySelectorAll("[data-view-toggle]").forEach((toggle) => {
      toggle.addEventListener("click", () => {
        const sectionId = String(toggle.dataset.viewToggle || "").trim();
        if (!sectionId) return;
        setOpenSection(sectionId);
      });
    });
  }

  function buildFooterActions() {
    return [
      {
        id: "cancel",
        kind: "button",
        variant: "ghost",
        label: "Cancelar",
        disabled: isSaving || formState.imageBusy,
        onClick: () => {
          if (isSaving || formState.imageBusy) return;
          close();
        },
      },
      {
        id: "save",
        kind: "button",
        variant: "primary",
        label: isSaving ? "Guardando..." : formState.editingHandoutId ? "Guardar Cambios" : "Guardar Revelacion",
        disabled: isSaving || formState.imageBusy,
        onClick: () => handleSave(),
      },
    ];
  }

  function syncSaveAction() {
    currentScreen?.setFooterActions(buildFooterActions());
  }

  async function handleRevealAgain() {
    if (isRevealingAgain || typeof currentCallbacks.onRevealAgain !== "function" || !currentScreen) {
      return;
    }

    isRevealingAgain = true;
    currentScreen.updateFooterAction("reveal-again", {
      disabled: true,
      label: "Revelando...",
    });

    try {
      await currentCallbacks.onRevealAgain();
    } finally {
      isRevealingAgain = false;
      currentScreen?.updateFooterAction("reveal-again", {
        disabled: false,
        label: "Revelar de nuevo",
      });
    }
  }

  async function cleanupDraftImageOnClose(closingState) {
    if (!closingState?.draftImageRef) return;
    await deleteImageRefSafe(closingState.draftImageRef);
  }

  function handleFormClosed(reason) {
    const closingState = {
      draftImageRef: formState.draftImageRef,
      previewObjectUrl: formState.previewObjectUrl,
    };
    revokePreviewObjectUrl();
    currentFormHost = null;
    currentScreen = null;
    isSaving = false;
    isRevealingAgain = false;
    closeImageLightbox();
    formState = createEmptyFormState();

    if (closingState.draftImageRef) {
      void cleanupDraftImageOnClose(closingState);
    }

    const onClosedCb = currentCallbacks.onClosed;
    currentCallbacks = { onSaved: null, onEdit: null, onRevealAgain: null, onClosed: null };
    if (typeof onClosedCb === "function") onClosedCb({ reason });
  }

  async function handleSave() {
    if (isSaving || formState.imageBusy) return;

    const api = handouts();
    if (!api || !currentScreen) return;

    isSaving = true;
    syncSaveAction();
    setFormMsg("");

    const title = getFormEl("#rs-title-input")?.value || "";
    const bodyMarkdown = getFormEl("#rs-body-input")?.value || "";
    const tagsRaw = getFormEl("#rs-tags-input")?.value || "";
    const imageRef = getCurrentImageRef();
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
      setFormMsg(error.message || "No se pudo guardar revelacion.", "error");
      isSaving = false;
      syncSaveAction();
      return;
    }

    formState.draftImageRef = null;
    formState.existingImageRef = imageRef || null;

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
      ...createEmptyFormState(),
      chronicleId,
      currentPlayerId,
      editingHandoutId: null,
      existingImageRef: null,
      sessionToken: ++formSessionSeq,
    };
    currentCallbacks = { onSaved: onSaved || null, onEdit: null, onRevealAgain: null, onClosed: onClosed || null };

    isSaving = false;
    currentScreen = ds.open({
      docType: "revelation",
      title: "Crear Revelacion",
      footerActions: buildFooterActions(),
      bodyClass: "rs-body",
      renderBody: (body) => {
        body.innerHTML = formMarkup();
        currentFormHost = body;
        bindFormListeners();
        clearForm();
      },
      onClosed: ({ reason }) => {
        handleFormClosed(reason);
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
      ...createEmptyFormState(),
      chronicleId,
      currentPlayerId,
      editingHandoutId: handout.id,
      existingImageRef: handout.image_url || null,
      sessionToken: ++formSessionSeq,
    };
    currentCallbacks = { onSaved: onSaved || null, onEdit: null, onRevealAgain: null, onClosed: onClosed || null };

    isSaving = false;
    currentScreen = ds.open({
      docType: "revelation",
      title: "Editar Revelacion",
      footerActions: buildFooterActions(),
      bodyClass: "rs-body",
      renderBody: (body) => {
        body.innerHTML = formMarkup();
        currentFormHost = body;
        bindFormListeners();
        clearForm();
      },
      onClosed: ({ reason }) => {
        handleFormClosed(reason);
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

  function openView({
    title,
    bodyMarkdown,
    imageUrl,
    tags,
    deliveries,
    showDeliveries,
    onEdit,
    onRevealAgain,
    onClosed,
  } = {}) {
    const ds = documentScreen();
    if (!ds) return;

    currentCallbacks = {
      onSaved: null,
      onEdit: onEdit || null,
      onRevealAgain: onRevealAgain || null,
      onClosed: onClosed || null,
    };
    isRevealingAgain = false;

    const actions = [];
    const footerActions = [];
    if (typeof onRevealAgain === "function") {
      footerActions.push({
        id: "reveal-again",
        kind: "button",
        variant: "ghost",
        label: "Revelar de nuevo",
        disabled: isRevealingAgain || !(Array.isArray(deliveries) && deliveries.length),
        onClick: () => {
          void handleRevealAgain();
        },
      });
    }
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
      footerActions,
      bodyClass: "doc-view-body rs-view-body",
      renderBody: (body) => {
        body.innerHTML = viewMarkup({
          bodyMarkdown,
          imageUrl,
          deliveries,
          showDeliveries: Boolean(showDeliveries),
        });
      },
      onClosed: ({ reason }) => {
        currentFormHost = null;
        currentScreen = null;
        isSaving = false;
        isRevealingAgain = false;
        closeImageLightbox();
        const onClosedCb = currentCallbacks.onClosed;
        currentCallbacks = { onSaved: null, onEdit: null, onRevealAgain: null, onClosed: null };
        if (typeof onClosedCb === "function") onClosedCb({ reason });
      },
    });

    if (global.lucide?.createIcons) {
      const body = currentScreen?.getBody?.();
      if (body) global.lucide.createIcons({ nodes: [body] });
    }
    bindViewAccordions();
    bindViewImageInteractions();
  }

  function close() {
    if (!currentScreen) return;
    closeImageLightbox();
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
