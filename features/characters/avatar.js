(function initCharactersAvatar(global) {
  const ns = (global.ABNCharacters = global.ABNCharacters || {});
  const service = () => ns.service;
  const DEFAULT_AVATAR_POSITION = Object.freeze({ x: 50, y: 50, scale: 1 });
  const AVATAR_SCALE_MIN = 1;
  const AVATAR_SCALE_MAX = 3;

  const state = {
    currentSheetId: null,
    reposImage: new Image(),
    reposState: { ...DEFAULT_AVATAR_POSITION, isDragging: false, lastX: 0, lastY: 0 },
    initialized: false,
    modalController: null,
  };

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function normalizeAvatarPosition(position) {
    const x = Number(position?.x);
    const y = Number(position?.y);
    const scale = Number(position?.scale);
    return {
      x: Number.isFinite(x) ? clamp(x, 0, 100) : DEFAULT_AVATAR_POSITION.x,
      y: Number.isFinite(y) ? clamp(y, 0, 100) : DEFAULT_AVATAR_POSITION.y,
      scale: Number.isFinite(scale) ? clamp(scale, AVATAR_SCALE_MIN, AVATAR_SCALE_MAX) : DEFAULT_AVATAR_POSITION.scale,
    };
  }

  function getAvatarDisplayUrl(sheet) {
    return sheet?.data?.avatarThumbUrl || sheet?.avatar_url || "";
  }

  function elements() {
    const canvas = document.getElementById("repos-canvas");
    return {
      modal: document.getElementById("avatar-modal"),
      input: document.getElementById("avatar-input"),
      canvas,
      ctx: canvas ? canvas.getContext("2d") : null,
      zoom: document.getElementById("zoom-slider"),
      cancel: document.getElementById("cs-avatar-cancel"),
      save: document.getElementById("cs-avatar-save"),
    };
  }

  function bindIfNeeded(onUpdated) {
    if (state.initialized) return;

    const { modal, input, canvas, zoom, cancel, save } = elements();
    if (!modal || !input || !canvas || !zoom || !cancel || !save) return;

    const makeModal = global.ABNShared?.modal?.createController;
    if (makeModal) {
      state.modalController = makeModal({
        overlay: modal,
        closeButtons: [cancel],
      });
    }

    cancel.addEventListener("click", () => {
      closeModal();
    });

    modal.addEventListener("click", (event) => {
      if (event.target === modal && !state.modalController) {
        closeModal();
      }
    });

    input.addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      const sheetId = state.currentSheetId;
      if (!file || !sheetId) return;

      try {
        const user = await service().getCurrentUser();
        if (!user) return;

        const ext = file.name.split(".").pop() || "jpg";
        const filePath = `${user.id}/${sheetId}_${Date.now()}.${ext}`;

        const publicUrl = await service().uploadAvatar(filePath, file);
        const sheet = await service().getSheetById(sheetId);
        const updatedData = {
          ...(sheet?.data || {}),
          avatarPosition: DEFAULT_AVATAR_POSITION,
          avatarOriginalUrl: publicUrl,
          avatarThumbUrl: "",
        };

        await service().updateSheet(sheetId, {
          avatar_url: publicUrl,
          data: updatedData,
        });

        openReposModal(publicUrl, DEFAULT_AVATAR_POSITION);
        if (typeof onUpdated === "function") onUpdated();
      } catch (error) {
        console.error(error);
        alert("Error al subir imagen: " + error.message);
      } finally {
        event.target.value = "";
      }
    });

    save.addEventListener("click", async () => {
      const sheetId = state.currentSheetId;
      if (!sheetId) return;

      const originalText = save.textContent;
      save.textContent = "Guardando...";
      save.disabled = true;

      try {
        const sheet = await service().getSheetById(sheetId);
        const originalUrl = sheet?.data?.avatarOriginalUrl || sheet?.avatar_url || "";
        if (!originalUrl) throw new Error("No hay imagen de avatar para recortar.");

        const { canvas } = elements();
        if (!canvas) throw new Error("No se encontró el canvas de recorte.");
        const thumbBlob = await new Promise((resolve, reject) => {
          canvas.toBlob(
            (blob) => (blob ? resolve(blob) : reject(new Error("No se pudo generar el recorte."))),
            "image/jpeg",
            0.9
          );
        });
        const user = await service().getCurrentUser();
        if (!user) throw new Error("Usuario no autenticado.");
        const thumbPath = `${user.id}/${sheetId}_thumb_${Date.now()}.jpg`;
        const thumbUrl = await service().uploadAvatar(thumbPath, thumbBlob);

        const updatedData = {
          ...(sheet?.data || {}),
          avatarPosition: normalizeAvatarPosition({
            x: Math.round(state.reposState.x * 10) / 10,
            y: Math.round(state.reposState.y * 10) / 10,
            scale: state.reposState.scale,
          }),
          avatarOriginalUrl: originalUrl,
          avatarThumbUrl: thumbUrl,
        };

        await service().updateSheet(sheetId, { avatar_url: thumbUrl, data: updatedData });
        closeModal();
        if (typeof onUpdated === "function") onUpdated();
      } catch (error) {
        console.error(error);
        alert("Error al guardar posición: " + error.message);
      } finally {
        save.textContent = originalText;
        save.disabled = false;
      }
    });

    canvas.addEventListener("mousedown", (event) => {
      state.reposState.isDragging = true;
      state.reposState.lastX = event.clientX;
      state.reposState.lastY = event.clientY;
    });

    canvas.addEventListener(
      "touchstart",
      (event) => {
        state.reposState.isDragging = true;
        state.reposState.lastX = event.touches[0].clientX;
        state.reposState.lastY = event.touches[0].clientY;
      },
      { passive: true }
    );

    window.addEventListener("mouseup", () => {
      state.reposState.isDragging = false;
    });
    window.addEventListener("touchend", () => {
      state.reposState.isDragging = false;
    });

    function handleDrag(clientX, clientY) {
      if (!state.reposState.isDragging) return;

      const dx = clientX - state.reposState.lastX;
      const dy = clientY - state.reposState.lastY;
      const sensitivity = 0.3 / state.reposState.scale;

      state.reposState.x = Math.max(0, Math.min(100, state.reposState.x - dx * sensitivity));
      state.reposState.y = Math.max(0, Math.min(100, state.reposState.y - dy * sensitivity));
      state.reposState.lastX = clientX;
      state.reposState.lastY = clientY;
      drawPreview();
    }

    window.addEventListener("mousemove", (event) => {
      handleDrag(event.clientX, event.clientY);
    });
    window.addEventListener(
      "touchmove",
      (event) => {
        handleDrag(event.touches[0].clientX, event.touches[0].clientY);
      },
      { passive: true }
    );

    zoom.addEventListener("input", (event) => {
      state.reposState.scale = normalizeAvatarPosition({ scale: parseFloat(event.target.value) }).scale;
      drawPreview();
    });

    state.initialized = true;
  }

  function drawPreview() {
    const { canvas, ctx } = elements();
    if (!canvas || !ctx) return;

    const cw = canvas.width;
    const ch = canvas.height;
    ctx.clearRect(0, 0, cw, ch);

    const image = state.reposImage;
    if (!image.naturalWidth) return;

    const nw = image.naturalWidth;
    const nh = image.naturalHeight;

    const coverScale = Math.max(cw / nw, ch / nh);
    const iw = nw * coverScale;
    const ih = nh * coverScale;

    const ox = (iw - cw) * (state.reposState.x / 100);
    const oy = (ih - ch) * (state.reposState.y / 100);

    const originX = cw * (state.reposState.x / 100);
    const originY = ch * (state.reposState.y / 100);

    ctx.save();
    ctx.translate(originX, originY);
    ctx.scale(state.reposState.scale, state.reposState.scale);
    ctx.translate(-originX, -originY);
    ctx.drawImage(image, -ox, -oy, iw, ih);
    ctx.restore();
  }

  function openReposModal(imageUrl, position) {
    const { zoom, modal } = elements();
    if (!zoom || !modal) return;
    const normalizedPosition = normalizeAvatarPosition(position);

    state.reposState = {
      ...normalizedPosition,
      isDragging: false,
      lastX: 0,
      lastY: 0,
    };

    zoom.value = String(state.reposState.scale);
    state.reposImage.crossOrigin = "anonymous";
    state.reposImage.src = imageUrl;
    state.reposImage.onload = () => {
      if (state.modalController) {
        state.modalController.open();
      } else {
        modal.classList.add("visible");
      }
      drawPreview();
    };

    if (state.reposImage.complete && state.reposImage.naturalWidth) {
      if (state.modalController) {
        state.modalController.open();
      } else {
        modal.classList.add("visible");
      }
      drawPreview();
    }
  }

  function closeModal() {
    const { modal } = elements();
    if (state.modalController) {
      state.modalController.close();
    } else if (modal) {
      modal.classList.remove("visible");
    }
    state.currentSheetId = null;
  }

  function openUpload(sheetId) {
    const { input } = elements();
    if (!input) return;
    state.currentSheetId = sheetId;
    input.click();
  }

  async function openReposition(sheetId) {
    state.currentSheetId = sheetId;

    try {
      const sheet = await service().getSheetById(sheetId);
      const displayUrl = getAvatarDisplayUrl(sheet);
      if (!displayUrl) return;
      const pos = normalizeAvatarPosition(sheet.data?.avatarPosition);
      const sourceUrl = sheet?.data?.avatarOriginalUrl || displayUrl;
      openReposModal(sourceUrl, pos);
    } catch (error) {
      console.error(error);
      alert("Error al cargar avatar: " + error.message);
    }
  }

  ns.avatar = {
    bindIfNeeded,
    openUpload,
    openReposition,
    closeModal,
  };
})(window);
