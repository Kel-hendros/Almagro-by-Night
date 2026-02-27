(function initChronicleDetailBanner(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;
  const STORAGE_LIMIT_MESSAGE =
    "Has alcanzado el límite de almacenamiento de esta Crónica.\nPuedes borrar elementos que ya no utilices para liberar espacio o pasar a un plan superior para aumentar tu límite.";

  async function showStorageLimitReachedModal() {
    const showModal = global.ABNShared?.modal?.showChronicleStorageLimitReached;
    if (typeof showModal === "function") {
      await showModal();
      return;
    }
    alert(STORAGE_LIMIT_MESSAGE);
  }

  function init({ chronicle, isNarrator }) {
    const bannerArea = document.getElementById("chronicle-banner-area");
    const bannerImg = document.getElementById("chronicle-banner-img");
    const bannerFileInput = document.getElementById("banner-file-input");
    if (!bannerArea || !bannerImg || !bannerFileInput) return;

    const bannerConfig = chronicle.banner_config || {
      mobile: { y: 50 },
      desktop: { y: 50 },
    };

    function applyBannerPosition() {
      const isMobile = window.innerWidth < 768;
      const yPos = isMobile ? bannerConfig.mobile.y : bannerConfig.desktop.y;
      bannerImg.style.objectPosition = `center ${yPos}%`;
    }

    function syncBannerVisual() {
      if (!chronicle.banner_url) return;
      bannerImg.src = chronicle.banner_url;
      bannerImg.classList.remove("hidden");
      bannerArea.classList.add("has-banner");
      applyBannerPosition();
    }

    if (chronicle.banner_url) {
      syncBannerVisual();
      window.addEventListener("resize", applyBannerPosition);
    }

    if (!isNarrator) return;

    const bannerActions = document.getElementById("chronicle-banner-actions");
    const uploadBtn = document.getElementById("btn-upload-banner");
    const repositionBtn = document.getElementById("btn-reposition-banner");
    if (!bannerActions || !uploadBtn || !repositionBtn) return;

    bannerActions.classList.remove("hidden");
    uploadBtn.addEventListener("click", () => bannerFileInput.click());

    bannerFileInput.addEventListener("change", async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      const MAX_SIZE = 5 * 1024 * 1024;
      const ALLOWED_TYPES = ["image/png", "image/jpeg", "image/webp"];

      if (!ALLOWED_TYPES.includes(file.type)) {
        alert("Formato no soportado. Usa PNG, JPG o WebP.");
        return;
      }
      if (file.size > MAX_SIZE) {
        alert("La imagen es demasiado grande. Máximo 5MB.");
        return;
      }

      try {
        const { data: quotaData, error: quotaError } = await supabase.rpc(
          "check_chronicle_storage_quota",
          {
            p_chronicle_id: chronicle.id,
            p_incoming_bytes: Number(file.size || 0),
          },
        );
        if (quotaError) {
          throw new Error(`No se pudo validar cuota: ${quotaError.message}`);
        }
        if (quotaData?.error) {
          if (quotaData.error === "not_authorized") {
            throw new Error("No tenés permisos en esta crónica para subir archivos.");
          }
          throw new Error(`No se pudo validar cuota (${quotaData.error}).`);
        }
        if (quotaData && quotaData.allowed === false) {
          await showStorageLimitReachedModal();
          return;
        }
      } catch (quotaErr) {
        alert(quotaErr.message || "No se pudo validar la cuota de almacenamiento.");
        return;
      }

      uploadBtn.disabled = true;

      try {
        await service().removeBannerFileByUrl(chronicle.banner_url);

        const ext = file.name.split(".").pop();
        const fileName = `chronicle/${chronicle.id}/banners/${Date.now()}.${ext}`;
        const { publicUrl, error: uploadError } = await service().uploadBannerFile(
          fileName,
          file
        );
        if (uploadError) throw uploadError;

        const freshConfig = { mobile: { y: 50 }, desktop: { y: 50 } };
        const { error: dbError } = await service().updateChronicle(chronicle.id, {
          banner_url: publicUrl,
          banner_config: freshConfig,
        });
        if (dbError) throw dbError;

        chronicle.banner_url = publicUrl;
        chronicle.banner_config = freshConfig;
        Object.assign(bannerConfig, freshConfig);
        syncBannerVisual();
      } catch (err) {
        console.error("Banner upload error:", err);
        alert("Error al subir banner: " + err.message);
      } finally {
        uploadBtn.disabled = false;
        bannerFileInput.value = "";
      }
    });

    let isDragMode = false;
    let isDragging = false;
    let dragStartClientY = 0;
    let dragStartPosY = 0;

    async function exitDragMode() {
      isDragMode = false;
      isDragging = false;
      bannerArea.classList.remove("repositioning");
      repositionBtn.classList.remove("active");
      await service().updateChronicle(chronicle.id, { banner_config: bannerConfig });
    }

    repositionBtn.addEventListener("click", () => {
      if (!chronicle.banner_url) return;
      if (isDragMode) {
        exitDragMode();
      } else {
        isDragMode = true;
        bannerArea.classList.add("repositioning");
        repositionBtn.classList.add("active");
      }
    });

    const onDragStart = (e) => {
      if (!isDragMode) return;
      e.preventDefault();
      isDragging = true;
      dragStartClientY = e.touches ? e.touches[0].clientY : e.clientY;
      const isMobile = window.innerWidth < 768;
      dragStartPosY = bannerConfig[isMobile ? "mobile" : "desktop"].y;
    };

    const onDragMove = (e) => {
      if (!isDragging) return;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;
      const deltaPixels = clientY - dragStartClientY;
      const bannerH = bannerArea.getBoundingClientRect().height;
      const deltaPct = (deltaPixels / bannerH) * -80;
      const newY = Math.max(0, Math.min(100, dragStartPosY + deltaPct));

      const isMobile = window.innerWidth < 768;
      const key = isMobile ? "mobile" : "desktop";
      bannerConfig[key].y = Math.round(newY);
      bannerImg.style.objectPosition = `center ${newY}%`;
    };

    const onDragEnd = () => {
      isDragging = false;
    };

    bannerImg.addEventListener("mousedown", onDragStart);
    bannerImg.addEventListener("touchstart", onDragStart, { passive: false });
    document.addEventListener("mousemove", onDragMove);
    document.addEventListener("touchmove", onDragMove, { passive: true });
    document.addEventListener("mouseup", onDragEnd);
    document.addEventListener("touchend", onDragEnd);

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && isDragMode) exitDragMode();
    });
  }

  ns.banner = {
    init,
  };
})(window);
