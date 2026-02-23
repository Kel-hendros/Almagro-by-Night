(function initCharactersAvatar(global) {
  const ns = (global.ABNCharacters = global.ABNCharacters || {});
  const service = () => ns.service;

  const state = {
    currentSheetId: null,
    reposImage: new Image(),
    reposState: { x: 50, y: 50, scale: 1, isDragging: false, lastX: 0, lastY: 0 },
    initialized: false,
    modalController: null,
  };

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
          avatarPosition: { x: 50, y: 50, scale: 1 },
        };

        await service().updateSheet(sheetId, {
          avatar_url: publicUrl,
          data: updatedData,
        });

        openReposModal(publicUrl, { x: 50, y: 50, scale: 1 });
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
        const updatedData = {
          ...(sheet?.data || {}),
          avatarPosition: {
            x: Math.round(state.reposState.x * 10) / 10,
            y: Math.round(state.reposState.y * 10) / 10,
            scale: state.reposState.scale,
          },
        };

        await service().updateSheet(sheetId, { data: updatedData });
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
      state.reposState.scale = parseFloat(event.target.value);
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

    state.reposState = {
      ...position,
      isDragging: false,
      lastX: 0,
      lastY: 0,
    };

    zoom.value = position.scale;
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
      if (!sheet?.avatar_url) return;
      const pos = sheet.data?.avatarPosition || { x: 50, y: 50, scale: 1 };
      openReposModal(sheet.avatar_url, pos);
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
