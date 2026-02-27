(function initRevelationsArchiveController(global) {
  const ns = (global.ABNRevelationsArchive = global.ABNRevelationsArchive || {});
  const service = () => ns.service;
  const view = () => ns.view;
  const CHRONICLE_STORAGE_LIMIT_REACHED_CODE = "chronicle_storage_limit_reached";
  const CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE =
    "Has alcanzado el límite de almacenamiento de esta Crónica.\nPuedes borrar elementos que ya no utilices para liberar espacio o pasar a un plan superior para aumentar tu límite.";

  const state = {
    chronicleId: null,
    currentPlayerId: null,
    isNarrator: false,
    narratorHandouts: [],
    playerDeliveries: [],
    searchQuery: "",
    handoutModal: null,
    readerModal: null,
    realtimeChannel: null,
    editingHandoutId: null,
    availableRecipientCharacters: [],
    listenersBound: false,
  };

  function filterHandouts(handouts, query) {
    if (!query) return handouts;
    const q = query.toLowerCase();
    return handouts.filter((item) =>
      (item.title || "").toLowerCase().includes(q) ||
      (item.tags || []).some((t) => t.toLowerCase().includes(q))
    );
  }

  function filterDeliveries(deliveries, query) {
    if (!query) return deliveries;
    const q = query.toLowerCase();
    return deliveries.filter((row) => {
      const handout = row.handout || {};
      return (
        (handout.title || "").toLowerCase().includes(q) ||
        (handout.tags || []).some((t) => t.toLowerCase().includes(q))
      );
    });
  }

  function selectedRecipients() {
    return Array.from(
      new Set(
        Array.from(document.querySelectorAll(".ra-recipient-chip.is-selected"))
          .map((node) => node.dataset.playerId || "")
          .filter(Boolean),
      ),
    );
  }

  function findHandoutById(handoutId) {
    return state.narratorHandouts.find((item) => item.id === handoutId) || null;
  }

  function findDeliveryById(deliveryId) {
    return state.playerDeliveries.find((item) => item.id === deliveryId) || null;
  }

  async function showStorageLimitReachedModal() {
    const showModal = global.ABNShared?.modal?.showChronicleStorageLimitReached;
    if (typeof showModal === "function") {
      await showModal();
      return;
    }
    alert(CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE);
  }

  function bindModals() {
    state.handoutModal = global.ABNShared?.modal?.createController?.({
      overlay: "ra-handout-modal",
      closeButtons: ["#ra-handout-close"],
    });
    state.readerModal = global.ABNShared?.modal?.createController?.({
      overlay: "ra-reader-modal",
      closeButtons: ["#ra-reader-close"],
    });
  }

  async function openCreateModal() {
    state.availableRecipientCharacters = await service().getRecipientCharacters(
      state.chronicleId,
      state.currentPlayerId,
    );
    view().renderRecipients(state.availableRecipientCharacters);
    state.editingHandoutId = null;
    view().setFormMode("create");
    view().clearForm();
    view().setMessage("");
    state.handoutModal?.open?.();
  }

  async function openEditModal(handout) {
    if (!handout) return;
    state.availableRecipientCharacters = await service().getRecipientCharacters(
      state.chronicleId,
      state.currentPlayerId,
    );
    view().renderRecipients(state.availableRecipientCharacters);
    state.editingHandoutId = handout.id;
    view().setFormMode("edit");
    view().setFormValues({
      title: handout.title || "",
      imageRef: handout.image_url || "",
      bodyMarkdown: handout.body_markdown || "",
      recipientPlayerIds: (handout.deliveries || []).map((d) => d.recipient_player_id),
      tags: handout.tags || [],
    });
    view().setMessage("");
    state.handoutModal?.open?.();
  }

  async function loadNarratorData() {
    if (!state.chronicleId) return;
    const [recipientCharacters, handouts] = await Promise.all([
      service().getRecipientCharacters(state.chronicleId, state.currentPlayerId),
      service().listHandoutsByChronicle(state.chronicleId),
    ]);
    state.availableRecipientCharacters = recipientCharacters || [];

    const allowedPlayerIds = new Set(
      state.availableRecipientCharacters.map((row) => String(row.player_id || "")).filter(Boolean),
    );
    const staleDeliveryIds = [];
    (handouts || []).forEach((handout) => {
      (handout.deliveries || []).forEach((delivery) => {
        const pid = String(delivery?.recipient_player_id || "");
        if (pid && !allowedPlayerIds.has(pid)) staleDeliveryIds.push(delivery.id);
      });
    });

    if (staleDeliveryIds.length) {
      await Promise.all(staleDeliveryIds.map((deliveryId) => service().revokeDelivery(deliveryId)));
    }

    const effectiveHandouts = staleDeliveryIds.length
      ? await service().listHandoutsByChronicle(state.chronicleId)
      : handouts;

    state.narratorHandouts = effectiveHandouts || [];
    view().renderRecipients(state.availableRecipientCharacters);
    view().renderNarratorList(filterHandouts(state.narratorHandouts, state.searchQuery));
  }

  async function loadPlayerData() {
    if (!state.currentPlayerId) return;
    state.playerDeliveries = await service().listPlayerDeliveries(
      state.currentPlayerId,
      state.chronicleId,
    );
    view().renderPlayerList(filterDeliveries(state.playerDeliveries, state.searchQuery));
  }

  async function submitNarratorForm(event) {
    event.preventDefault();
    const title = document.getElementById("ra-title-input")?.value || "";
    const bodyMarkdown = document.getElementById("ra-body-input")?.value || "";
    const imageRefInput = document.getElementById("ra-image-ref-input");
    const imageFileInput = document.getElementById("ra-image-file-input");
    const selectedFile = imageFileInput?.files?.[0] || null;

    let imageRef = String(imageRefInput?.value || "").trim();
    let uploadedImageRef = null;

    if (selectedFile) {
      view().setImageStatus(`Subiendo ${selectedFile.name}...`);
      const uploadRes = await service().uploadHandoutImage({
        chronicleId: state.chronicleId,
        file: selectedFile,
      });
      if (uploadRes.error || !uploadRes.imageRef) {
        if (uploadRes.error?.code === CHRONICLE_STORAGE_LIMIT_REACHED_CODE) {
          await showStorageLimitReachedModal();
        }
        view().setImageStatus("No se pudo subir la imagen.", "error");
        view().setMessage(uploadRes.error?.message || "No se pudo subir la imagen.", "error");
        return;
      }
      uploadedImageRef = uploadRes.imageRef;
      imageRef = uploadedImageRef;
      if (imageRefInput) imageRefInput.value = imageRef;
      if (imageFileInput) imageFileInput.value = "";
      view().setImageStatus("Imagen cargada y lista para guardar.", "ok");
    }

    const tagsRaw = document.getElementById("ra-tags-input")?.value || "";
    const tags = tagsRaw.split(",").map((t) => t.trim()).filter(Boolean);

    const payload = {
      title,
      bodyMarkdown,
      imageRef,
      recipientPlayerIds: selectedRecipients(),
      tags,
    };

    const { error } = state.editingHandoutId
      ? await service().updateHandout({ revelationId: state.editingHandoutId, ...payload })
      : await service().createHandout({
          chronicleId: state.chronicleId,
          createdByPlayerId: state.currentPlayerId,
          ...payload,
        });

    if (error) {
      if (uploadedImageRef) {
        await service().deleteHandoutImage(uploadedImageRef);
      }
      view().setMessage(error.message || "No se pudo guardar revelación.", "error");
      return;
    }

    view().setMessage(
      state.editingHandoutId ? "Revelación actualizada." : "Revelación guardada y asociada.",
      "ok",
    );
    await loadNarratorData();
    state.handoutModal?.close?.();
  }

  async function handleNarratorListClick(event) {
    const revokeBtn = event.target.closest(".ra-delivery-remove");
    if (revokeBtn?.dataset.deliveryId) {
      const ok = await global.ABNShared?.modal?.confirm?.(
        "¿Quitar esta revelación del archivo de este jugador?",
      );
      if (!ok) return;
      const { error } = await service().revokeDelivery(revokeBtn.dataset.deliveryId);
      if (error) {
        alert(error.message || "No se pudo quitar la asociación.");
        return;
      }
      await loadNarratorData();
      return;
    }

    const deleteBtn = event.target.closest(".ra-delete-handout");
    if (deleteBtn?.dataset.handoutId) {
      const ok = await global.ABNShared?.modal?.confirm?.(
        "¿Eliminar esta revelación completa del archivo de crónica?",
      );
      if (!ok) return;
      const { error } = await service().deleteHandout(deleteBtn.dataset.handoutId);
      if (error) {
        alert(error.message || "No se pudo eliminar revelación.");
        return;
      }
      await loadNarratorData();
      return;
    }

    const card = event.target.closest("[data-handout-id]");
    if (!card?.dataset.handoutId) return;

    const handout = findHandoutById(card.dataset.handoutId);
    if (!handout) return;
    await openEditModal(handout);
  }

  async function handlePlayerListClick(event) {
    const card = event.target.closest("[data-delivery-id]");
    if (!card?.dataset.deliveryId) return;

    const row = findDeliveryById(card.dataset.deliveryId);
    if (!row?.handout) return;

    view().openReader({
      title: row.handout.title,
      bodyMarkdown: row.handout.body_markdown,
      imageUrl: row.handout.image_signed_url,
    });
    state.readerModal?.open?.();
  }

  function bindActions() {
    if (state.listenersBound) return;

    document.getElementById("ra-back-chronicle")?.addEventListener("click", () => {
      window.location.hash = `chronicle?id=${encodeURIComponent(state.chronicleId)}`;
    });

    document.getElementById("ra-back-active-session")?.addEventListener("click", () => {
      window.location.hash = `active-session?id=${encodeURIComponent(state.chronicleId)}`;
    });

    document.getElementById("ra-open-create")?.addEventListener("click", async () => {
      await openCreateModal();
    });

    document.getElementById("ra-recipients")?.addEventListener("click", (event) => {
      const chip = event.target.closest(".ra-recipient-chip");
      if (!chip) return;
      const next = !chip.classList.contains("is-selected");
      chip.classList.toggle("is-selected", next);
      chip.setAttribute("aria-pressed", next ? "true" : "false");
    });

    document.getElementById("ra-image-file-input")?.addEventListener("change", (event) => {
      const file = event.target?.files?.[0] || null;
      if (file) {
        view().setImageStatus(`Archivo seleccionado: ${file.name}`);
        return;
      }
      const hasSavedImage = Boolean(
        String(document.getElementById("ra-image-ref-input")?.value || "").trim(),
      );
      view().setImageStatus(
        hasSavedImage ? "Imagen actual guardada." : "Sin imagen seleccionada.",
        hasSavedImage ? "ok" : "neutral",
      );
    });

    document.getElementById("ra-image-clear")?.addEventListener("click", () => {
      const imageFileInput = document.getElementById("ra-image-file-input");
      const imageRefInput = document.getElementById("ra-image-ref-input");
      if (imageFileInput) imageFileInput.value = "";
      if (imageRefInput) imageRefInput.value = "";
      view().setImageStatus("La imagen se eliminará al guardar.", "error");
    });

    document.getElementById("ra-clear")?.addEventListener("click", () => {
      view().clearForm();
      view().setMessage("");
    });

    document.getElementById("ra-search")?.addEventListener("input", (e) => {
      state.searchQuery = (e.target.value || "").trim();
      if (state.isNarrator) {
        view().renderNarratorList(filterHandouts(state.narratorHandouts, state.searchQuery));
      } else {
        view().renderPlayerList(filterDeliveries(state.playerDeliveries, state.searchQuery));
      }
    });

    document.getElementById("ra-form")?.addEventListener("submit", submitNarratorForm);
    document
      .getElementById("ra-narrator-list")
      ?.addEventListener("click", handleNarratorListClick);
    document.getElementById("ra-player-list")?.addEventListener("click", handlePlayerListClick);

    state.listenersBound = true;
  }

  function unbindActions() {
    if (!state.listenersBound) return;
    document.getElementById("ra-form")?.removeEventListener("submit", submitNarratorForm);
    document
      .getElementById("ra-narrator-list")
      ?.removeEventListener("click", handleNarratorListClick);
    document
      .getElementById("ra-player-list")
      ?.removeEventListener("click", handlePlayerListClick);
    state.listenersBound = false;
  }

  async function initPage() {
    destroyPage();

    const ctx = service().getHashContext();
    if (!ctx.chronicleId) {
      window.location.hash = "chronicles";
      return;
    }
    state.chronicleId = ctx.chronicleId;
    localStorage.setItem("currentChronicleId", state.chronicleId);

    const session = await service().getSession();
    if (!session) {
      window.location.hash = "welcome";
      return;
    }

    const currentPlayer = await service().getCurrentPlayerByUserId(session.user.id);
    state.currentPlayerId = currentPlayer?.id || null;

    const { data: chronicle, error } = await service().getChronicle(state.chronicleId);
    if (error || !chronicle) {
      alert("No se pudo abrir el Archivo de Revelaciones.");
      window.location.hash = `chronicle?id=${encodeURIComponent(state.chronicleId)}`;
      return;
    }

    const participation =
      (state.currentPlayerId
        ? await service().getParticipation(state.chronicleId, state.currentPlayerId)
        : null) ||
      (await service().getParticipationByUserId(state.chronicleId, session.user.id));

    state.isNarrator =
      participation?.role === "narrator" ||
      (state.currentPlayerId ? chronicle.creator_id === state.currentPlayerId : false);

    view().setHeader({ chronicleName: chronicle.name, isNarrator: state.isNarrator });
    view().setAccessMode({ isNarrator: state.isNarrator });

    bindModals();
    bindActions();

    if (state.isNarrator) {
      await loadNarratorData();
    } else {
      await loadPlayerData();
      if (state.currentPlayerId) {
        state.realtimeChannel = service().subscribeDeliveriesForPlayer({
          playerId: state.currentPlayerId,
          onChange: () => {
            loadPlayerData();
          },
        });
      }
    }
  }

  function destroyPage() {
    unbindActions();
    service().unsubscribeChannel(state.realtimeChannel);
    state.realtimeChannel = null;
    state.handoutModal?.destroy?.();
    state.handoutModal = null;
    state.readerModal?.destroy?.();
    state.readerModal = null;
    state.editingHandoutId = null;
    state.availableRecipientCharacters = [];
    state.chronicleId = null;
    state.currentPlayerId = null;
    state.isNarrator = false;
    state.narratorHandouts = [];
    state.playerDeliveries = [];
    state.searchQuery = "";
  }

  ns.controller = {
    initPage,
    destroyPage,
  };
})(window);
