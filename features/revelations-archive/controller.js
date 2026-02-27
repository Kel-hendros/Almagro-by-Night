(function initRevelationsArchiveController(global) {
  const ns = (global.ABNRevelationsArchive = global.ABNRevelationsArchive || {});
  const service = () => ns.service;
  const view = () => ns.view;

  const state = {
    chronicleId: null,
    currentPlayerId: null,
    isNarrator: false,
    narratorHandouts: [],
    playerDeliveries: [],
    handoutModal: null,
    readerModal: null,
    realtimeChannel: null,
    editingHandoutId: null,
    listenersBound: false,
  };

  function selectedRecipients() {
    return Array.from(document.querySelectorAll(".ra-recipient-check:checked"))
      .map((node) => node.value)
      .filter(Boolean);
  }

  function findHandoutById(handoutId) {
    return state.narratorHandouts.find((item) => item.id === handoutId) || null;
  }

  function findDeliveryById(deliveryId) {
    return state.playerDeliveries.find((item) => item.id === deliveryId) || null;
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

  function openCreateModal() {
    state.editingHandoutId = null;
    view().setFormMode("create");
    view().clearForm();
    view().setMessage("");
    state.handoutModal?.open?.();
  }

  function openEditModal(handout) {
    if (!handout) return;
    state.editingHandoutId = handout.id;
    view().setFormMode("edit");
    view().setFormValues({
      title: handout.title || "",
      imageUrl: handout.image_url || "",
      bodyMarkdown: handout.body_markdown || "",
      recipientPlayerIds: (handout.deliveries || []).map((d) => d.recipient_player_id),
    });
    view().setMessage("");
    state.handoutModal?.open?.();
  }

  async function loadNarratorData() {
    if (!state.chronicleId) return;
    const [recipients, handouts] = await Promise.all([
      service().getRecipients(state.chronicleId, state.currentPlayerId),
      service().listHandoutsByChronicle(state.chronicleId),
    ]);
    state.narratorHandouts = handouts || [];
    view().renderRecipients(recipients);
    view().renderNarratorList(state.narratorHandouts);
  }

  async function loadPlayerData() {
    if (!state.currentPlayerId) return;
    state.playerDeliveries = await service().listPlayerDeliveries(
      state.currentPlayerId,
      state.chronicleId,
    );
    view().renderPlayerList(state.playerDeliveries);
  }

  async function submitNarratorForm(event) {
    event.preventDefault();
    const title = document.getElementById("ra-title-input")?.value || "";
    const bodyMarkdown = document.getElementById("ra-body-input")?.value || "";
    const imageUrl = document.getElementById("ra-image-input")?.value || "";

    const payload = {
      title,
      bodyMarkdown,
      imageUrl,
      recipientPlayerIds: selectedRecipients(),
    };

    const { error } = state.editingHandoutId
      ? await service().updateHandout({ revelationId: state.editingHandoutId, ...payload })
      : await service().createHandout({
          chronicleId: state.chronicleId,
          createdByPlayerId: state.currentPlayerId,
          ...payload,
        });

    if (error) {
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
    openEditModal(handout);
  }

  async function handlePlayerListClick(event) {
    const card = event.target.closest("[data-delivery-id]");
    if (!card?.dataset.deliveryId) return;

    const row = findDeliveryById(card.dataset.deliveryId);
    if (!row?.handout) return;

    view().openReader({
      title: row.handout.title,
      bodyMarkdown: row.handout.body_markdown,
      imageUrl: row.handout.image_url,
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

    document.getElementById("ra-open-create")?.addEventListener("click", () => {
      openCreateModal();
    });

    document.getElementById("ra-clear")?.addEventListener("click", () => {
      view().clearForm();
      view().setMessage("");
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
    state.chronicleId = null;
    state.currentPlayerId = null;
    state.isNarrator = false;
    state.narratorHandouts = [];
    state.playerDeliveries = [];
  }

  ns.controller = {
    initPage,
    destroyPage,
  };
})(window);
