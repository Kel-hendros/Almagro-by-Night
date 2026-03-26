/**
 * Muestra Screen — Ephemeral image sharing for the narrator.
 *
 * Provides two flows:
 * - openCreate({ chronicleId, currentPlayerId }) — form modal to upload image + optional description
 * - showMuestra({ imageRef, signedUrl, description }) — view modal for players (and drawer clicks)
 *
 * Images are uploaded via ABNShared.handouts to the existing private bucket.
 * On "Mostrar", a notification of type 'muestra' is pushed via ABNNotifications.
 */
(function initMuestraScreen(global) {
  const ns = (global.ABNMuestra = global.ABNMuestra || {});

  const CHRONICLE_STORAGE_LIMIT_REACHED_CODE = "chronicle_storage_limit_reached";
  const DEFAULT_IMAGE_IMPORT_ERROR =
    "No se pudo cargar la imagen. Verifica que la URL sea directa o que la imagen este disponible.";

  let currentScreen = null;
  let currentFormHost = null;
  let isSending = false;
  let formSessionSeq = 0;

  let formState = createEmptyFormState();

  function createEmptyFormState() {
    return {
      chronicleId: null,
      currentPlayerId: null,
      draftImageRef: null,
      imageBusy: false,
      sessionToken: 0,
      previewObjectUrl: null,
    };
  }

  function handouts() {
    return global.ABNShared?.handouts || null;
  }

  function documentScreen() {
    return global.ABNShared?.documentScreen || null;
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

  function getFormEl(selector) {
    return currentFormHost?.querySelector(selector) || null;
  }

  // ── Form markup ──

  function formMarkup() {
    return `
      <div class="mu-form-wrap">
        <div class="mu-form-group">
          <label class="mu-label">Imagen</label>
          <div class="rs-upload-area" id="mu-upload-area">
            <input id="mu-image-file" class="rs-upload-input" type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/avif">
            <div class="rs-upload-placeholder" id="mu-upload-placeholder">
              <i data-lucide="image-plus"></i>
              <span>Seleccionar imagen</span>
            </div>
            <div class="rs-upload-preview hidden" id="mu-upload-preview">
              <img id="mu-preview-img" class="rs-preview-img" alt="Preview">
            </div>
          </div>
          <div class="rs-image-tools">
            <div class="rs-image-url-row">
              <input id="mu-image-url" class="rs-input" type="url" placeholder="https://ejemplo.com/imagen.jpg">
              <button type="button" id="mu-image-url-import" class="btn btn--ghost">Cargar URL</button>
              <button type="button" id="mu-image-paste" class="btn btn--ghost">Pegar Imagen</button>
            </div>
          </div>
          <div class="rs-image-row">
            <button type="button" id="mu-image-clear" class="btn btn--ghost">Quitar Imagen</button>
            <span id="mu-image-status" class="rs-image-status">Sin imagen seleccionada.</span>
          </div>
        </div>
        <div class="mu-form-group">
          <label class="mu-label" for="mu-body-input">Descripcion <span class="mu-hint">(opcional)</span></label>
          <textarea id="mu-body-input" class="rs-textarea" rows="3" maxlength="500" placeholder="Breve descripcion de lo que ven..."></textarea>
        </div>
        <span id="mu-form-msg" class="rs-msg"></span>
      </div>
    `;
  }

  // ── Preview helpers ──

  function revokePreviewObjectUrl() {
    if (!formState.previewObjectUrl || !global.URL?.revokeObjectURL) return;
    try {
      global.URL.revokeObjectURL(formState.previewObjectUrl);
    } catch (_e) {}
    formState.previewObjectUrl = null;
  }

  function resetUploadPreview() {
    const placeholder = getFormEl("#mu-upload-placeholder");
    const preview = getFormEl("#mu-upload-preview");
    const previewImg = getFormEl("#mu-preview-img");
    revokePreviewObjectUrl();
    if (placeholder) placeholder.classList.remove("hidden");
    if (preview) preview.classList.add("hidden");
    if (previewImg) previewImg.src = "";
  }

  function showUploadPreview(src, { objectUrl = false } = {}) {
    const placeholder = getFormEl("#mu-upload-placeholder");
    const preview = getFormEl("#mu-upload-preview");
    const previewImg = getFormEl("#mu-preview-img");
    revokePreviewObjectUrl();
    if (objectUrl) formState.previewObjectUrl = src;
    if (previewImg) previewImg.src = src;
    if (placeholder) placeholder.classList.add("hidden");
    if (preview) preview.classList.remove("hidden");
  }

  function setImageStatus(message, tone) {
    const el = getFormEl("#mu-image-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function setFormMsg(message, tone) {
    const el = getFormEl("#mu-form-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function syncImageControls() {
    const busy = formState.imageBusy;
    const uploadArea = getFormEl("#mu-upload-area");
    ["#mu-image-file", "#mu-image-url", "#mu-image-url-import", "#mu-image-paste", "#mu-image-clear"]
      .forEach((sel) => {
        const node = getFormEl(sel);
        if (node) node.disabled = busy;
      });
    uploadArea?.classList.toggle("is-busy", busy);
  }

  function syncSendAction() {
    if (!currentScreen) return;
    const disabled = formState.imageBusy || isSending || !formState.draftImageRef;
    currentScreen.updateFooterAction("mu-send", { disabled });
  }

  // ── File helpers ──

  function getFileExtensionFromMimeType(mimeType) {
    const m = String(mimeType || "").toLowerCase();
    if (m === "image/jpeg") return "jpg";
    if (m === "image/png") return "png";
    if (m === "image/webp") return "webp";
    if (m === "image/gif") return "gif";
    if (m === "image/avif") return "avif";
    return "bin";
  }

  function inferMimeTypeFromUrl(url) {
    const l = String(url || "").trim().toLowerCase();
    if (l.endsWith(".png")) return "image/png";
    if (l.endsWith(".jpg") || l.endsWith(".jpeg")) return "image/jpeg";
    if (l.endsWith(".webp")) return "image/webp";
    if (l.endsWith(".gif")) return "image/gif";
    if (l.endsWith(".avif")) return "image/avif";
    return "";
  }

  function buildFileName(baseName, mimeType) {
    const safe = String(baseName || "muestra-image")
      .replace(/[^a-z0-9-_]+/gi, "-")
      .replace(/^-+|-+$/g, "") || "muestra-image";
    return `${safe}.${getFileExtensionFromMimeType(mimeType)}`;
  }

  function buildFileFromBlob(blob, { nameHint, mimeType } = {}) {
    const normalizedType = String(mimeType || blob?.type || "").toLowerCase();
    return new File([blob], buildFileName(nameHint, normalizedType), {
      type: normalizedType || "application/octet-stream",
    });
  }

  // ── Image upload ──

  async function deleteImageRefSafe(imageRef) {
    const api = handouts();
    const ref = String(imageRef || "").trim();
    if (!api?.deleteHandoutImage || !ref) return;
    try {
      await api.deleteHandoutImage(ref);
    } catch (e) {
      console.warn("Muestra: no se pudo limpiar imagen temporal:", e);
    }
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
    syncSendAction();
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
      if (uploadRes?.imageRef) await deleteImageRefSafe(uploadRes.imageRef);
      return;
    }

    formState.imageBusy = false;
    syncImageControls();
    syncSendAction();

    if (uploadRes.error || !uploadRes.imageRef) {
      if (uploadRes.error?.code === CHRONICLE_STORAGE_LIMIT_REACHED_CODE) {
        const showModal = global.ABNShared?.modal?.showChronicleStorageLimitReached;
        if (typeof showModal === "function") await showModal();
      }
      resetUploadPreview();
      setImageStatus("No se pudo subir la imagen.", "error");
      setFormMsg(uploadRes.error?.message || "No se pudo subir la imagen.", "error");
      return;
    }

    if (previousDraftRef && previousDraftRef !== uploadRes.imageRef) {
      await deleteImageRefSafe(previousDraftRef);
    }

    formState.draftImageRef = uploadRes.imageRef;
    const fileInput = getFormEl("#mu-image-file");
    const urlInput = getFormEl("#mu-image-url");
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";
    setImageStatus(successMessage || "Imagen cargada y lista.", "ok");
    syncSendAction();
  }

  async function fetchImageFileFromUrl(url) {
    const cleanUrl = String(url || "").trim();
    if (!cleanUrl) throw new Error("Pega una URL de imagen.");

    let response;
    try {
      response = await global.fetch(cleanUrl);
    } catch (_e) {
      throw new Error(DEFAULT_IMAGE_IMPORT_ERROR);
    }
    if (!response.ok) throw new Error(`No se pudo descargar la imagen (${response.status}).`);

    const blob = await response.blob();
    const mimeType = String(blob.type || inferMimeTypeFromUrl(cleanUrl) || "").toLowerCase();
    if (!mimeType.startsWith("image/")) throw new Error("La URL no devolvio una imagen valida.");

    let parsed;
    try { parsed = new global.URL(cleanUrl); } catch (_e) { parsed = null; }
    const rawName = parsed?.pathname?.split("/").pop() || "remote-image";
    const baseName = rawName.replace(/\.[a-z0-9]+$/i, "") || "remote-image";

    return {
      file: buildFileFromBlob(blob, { nameHint: baseName, mimeType }),
      previewBlob: blob,
    };
  }

  async function readClipboardImage() {
    if (!global.navigator?.clipboard?.read) {
      throw new Error("Tu navegador no permite leer imagenes del portapapeles desde este boton.");
    }
    const items = await global.navigator.clipboard.read();
    for (const item of items) {
      const imageType = item.types.find((t) => String(t || "").startsWith("image/"));
      if (!imageType) continue;
      const blob = await item.getType(imageType);
      return {
        file: buildFileFromBlob(blob, { nameHint: `clipboard-${Date.now()}`, mimeType: imageType }),
        previewBlob: blob,
      };
    }
    throw new Error("No encontre una imagen en el portapapeles.");
  }

  async function clearCurrentImage() {
    if (formState.imageBusy) {
      setFormMsg("Espera a que termine la carga de imagen actual.", "error");
      return;
    }
    const fileInput = getFormEl("#mu-image-file");
    const urlInput = getFormEl("#mu-image-url");
    if (fileInput) fileInput.value = "";
    if (urlInput) urlInput.value = "";

    if (formState.draftImageRef) {
      const draftRef = formState.draftImageRef;
      formState.draftImageRef = null;
      resetUploadPreview();
      setImageStatus("Sin imagen seleccionada.");
      syncSendAction();
      await deleteImageRefSafe(draftRef);
      return;
    }

    resetUploadPreview();
    setImageStatus("Sin imagen seleccionada.");
    syncSendAction();
  }

  // ── Form listeners ──

  function bindFormListeners() {
    const imageFile = getFormEl("#mu-image-file");
    imageFile?.addEventListener("change", async (event) => {
      const file = event.target?.files?.[0] || null;
      if (!file) {
        resetUploadPreview();
        setImageStatus("Sin imagen seleccionada.");
        return;
      }
      await importImageFile(file, {
        previewBlob: file,
        successMessage: `Imagen cargada desde archivo: ${file.name}`,
      });
    });

    getFormEl("#mu-image-url-import")?.addEventListener("click", async () => {
      if (formState.imageBusy) {
        setFormMsg("Espera a que termine la carga de imagen actual.", "error");
        return;
      }
      const url = getFormEl("#mu-image-url")?.value || "";
      try {
        const { file, previewBlob } = await fetchImageFileFromUrl(url);
        await importImageFile(file, { previewBlob, successMessage: "Imagen cargada desde URL." });
      } catch (error) {
        setFormMsg(error.message || DEFAULT_IMAGE_IMPORT_ERROR, "error");
      }
    });

    getFormEl("#mu-image-paste")?.addEventListener("click", async () => {
      if (formState.imageBusy) {
        setFormMsg("Espera a que termine la carga de imagen actual.", "error");
        return;
      }
      try {
        const { file, previewBlob } = await readClipboardImage();
        await importImageFile(file, { previewBlob, successMessage: "Imagen cargada desde el portapapeles." });
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

    getFormEl("#mu-image-clear")?.addEventListener("click", async () => {
      await clearCurrentImage();
    });
  }

  // ── Send ──

  async function handleSend() {
    if (isSending || formState.imageBusy) return;
    if (!formState.draftImageRef) {
      setFormMsg("Selecciona una imagen antes de mostrar.", "error");
      return;
    }

    isSending = true;
    syncSendAction();
    setFormMsg("");

    const description = getFormEl("#mu-body-input")?.value?.trim() || "";
    const imageRef = formState.draftImageRef;

    let signedUrl = "";
    try {
      const api = handouts();
      if (api?.resolveImageSignedUrl) {
        signedUrl = await api.resolveImageSignedUrl(imageRef);
      }
    } catch (_e) {}

    try {
      await global.ABNNotifications.controller.pushNotification({
        chronicleId: formState.chronicleId,
        type: "muestra",
        title: "Muestra del Narrador",
        body: description,
        icon: "eye",
        metadata: { imageRef, signedUrl },
        actorPlayerId: formState.currentPlayerId,
      });
    } catch (error) {
      isSending = false;
      syncSendAction();
      setFormMsg("No se pudo enviar la muestra.", "error");
      console.warn("Muestra: pushNotification error", error);
      return;
    }

    // Success — do NOT delete the draft image (it's now referenced by the notification)
    formState.draftImageRef = null;
    isSending = false;

    if (currentScreen) {
      currentScreen.close();
    }
  }

  // ── Cleanup on form close ──

  function handleFormClosed() {
    // If there's a draft image that was never sent, delete it
    if (formState.draftImageRef) {
      deleteImageRefSafe(formState.draftImageRef);
    }
    revokePreviewObjectUrl();
    formState = createEmptyFormState();
    currentScreen = null;
    currentFormHost = null;
    isSending = false;
    formSessionSeq++;
  }

  // ── Public: openCreate ──

  function openCreate({ chronicleId, currentPlayerId }) {
    const ds = documentScreen();
    if (!ds) {
      console.warn("Muestra: documentScreen no disponible");
      return;
    }

    formState = createEmptyFormState();
    formState.chronicleId = chronicleId;
    formState.currentPlayerId = currentPlayerId;
    formState.sessionToken = ++formSessionSeq;
    isSending = false;

    currentScreen = ds.open({
      docType: "muestra",
      title: "Mostrar",
      footerActions: [
        { id: "mu-send", label: "Mostrar", icon: "eye", variant: "primary", disabled: true, onClick: handleSend },
      ],
      bodyClass: "mu-body",
      renderBody: (body) => {
        currentFormHost = body;
        body.innerHTML = formMarkup();
        bindFormListeners();
        if (global.lucide) global.lucide.createIcons({ nodes: [body] });
      },
      onClosed: handleFormClosed,
    });
  }

  // ── Public: showMuestra ──

  function showMuestra({ imageRef, signedUrl, description }) {
    const ds = documentScreen();
    if (!ds) return;

    const resolveAndShow = async () => {
      let url = "";
      // Always resolve a fresh signed URL — the one in metadata may be expired
      if (imageRef) {
        const api = handouts();
        if (api?.resolveImageSignedUrl) {
          url = await api.resolveImageSignedUrl(imageRef);
        }
      }
      if (!url) url = signedUrl || "";

      ds.open({
        docType: "muestra",
        title: "Muestra del Narrador",
        renderBody: (body) => {
          body.innerHTML = `
            <div class="mu-view-wrap">
              ${url ? `<img src="${escapeHtml(url)}" class="mu-view-image" alt="Muestra">` : '<p class="muted">Imagen no disponible.</p>'}
              ${description ? `<p class="mu-view-desc">${escapeHtml(description)}</p>` : ""}
            </div>
          `;
        },
      });
    };

    resolveAndShow();
  }

  // ── Exports ──

  ns.openCreate = openCreate;
  ns.showMuestra = showMuestra;
})(window);
