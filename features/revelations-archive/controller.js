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
    searchQuery: "",
    realtimeChannel: null,
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

  function findHandoutById(handoutId) {
    return state.narratorHandouts.find((item) => item.id === handoutId) || null;
  }

  function findDeliveryById(deliveryId) {
    return state.playerDeliveries.find((item) => item.id === deliveryId) || null;
  }

  function revelationScreen() {
    return global.ABNShared?.revelationScreen || null;
  }

  async function loadNarratorData() {
    if (!state.chronicleId) return;
    const api = global.ABNShared?.handouts;
    if (!api) return;

    const [recipientCharacters, handouts] = await Promise.all([
      api.getRecipientCharacters(state.chronicleId, state.currentPlayerId),
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

  function onSavedCallback() {
    loadNarratorData();
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

    const rs = revelationScreen();
    if (!rs) return;
    rs.openView({
      title: handout.title || "",
      bodyMarkdown: handout.body_markdown || "",
      imageUrl: handout.image_signed_url || "",
      tags: handout.tags || [],
      deliveries: handout.deliveries || [],
      onRevealAgain: async () => {
        const { count, error } = await service().rebroadcastHandout(handout.id);
        if (error) {
          alert(error.message || "No se pudo revelar nuevamente.");
          return;
        }
        if (!count) {
          await (global.ABNShared?.modal?.alert?.(
            "Ningún jugador puede ver esta revelación todavía.",
            { title: "Sin destinatarios" }
          ) || Promise.resolve());
          return;
        }
        await loadNarratorData();
        await (global.ABNShared?.modal?.alert?.(
          "La revelación fue enviada otra vez a sus jugadores asociados.",
          { title: "Revelación reenviada" }
        ) || Promise.resolve());
      },
      onEdit: () => {
        rs.close();
        rs.openEdit({
          chronicleId: state.chronicleId,
          currentPlayerId: state.currentPlayerId,
          handout,
          onSaved: onSavedCallback,
        });
      },
    });
  }

  async function handlePlayerListClick(event) {
    const card = event.target.closest("[data-delivery-id]");
    if (!card?.dataset.deliveryId) return;

    const row = findDeliveryById(card.dataset.deliveryId);
    if (!row?.handout) return;

    revelationScreen()?.openView({
      title: row.handout.title,
      bodyMarkdown: row.handout.body_markdown,
      imageUrl: row.handout.image_signed_url,
      tags: row.handout.tags,
    });
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
      revelationScreen()?.openCreate({
        chronicleId: state.chronicleId,
        currentPlayerId: state.currentPlayerId,
        onSaved: onSavedCallback,
      });
    });

    document.getElementById("ra-search")?.addEventListener("input", (e) => {
      state.searchQuery = (e.target.value || "").trim();
      if (state.isNarrator) {
        view().renderNarratorList(filterHandouts(state.narratorHandouts, state.searchQuery));
      } else {
        view().renderPlayerList(filterDeliveries(state.playerDeliveries, state.searchQuery));
      }
    });

    document
      .getElementById("ra-narrator-list")
      ?.addEventListener("click", handleNarratorListClick);
    document.getElementById("ra-player-list")?.addEventListener("click", handlePlayerListClick);

    state.listenersBound = true;
  }

  function unbindActions() {
    if (!state.listenersBound) return;
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
