(function initActiveSessionController(global) {
  const ns = (global.ABNActiveSession = global.ABNActiveSession || {});
  const service = () => ns.service;
  const view = () => ns.view;

  const state = {
    chronicleId: null,
    currentPlayerId: null,
    encounterSnapshot: null,
    overlay: null,
    encounterBridge: null,
    backBtnHandler: null,
    clearFormHandler: null,
    handoutSubmitHandler: null,
    handoutListClickHandler: null,
  };

  function mountEncounterOverlay() {
    if (state.overlay) return state.overlay;
    const factory = global.ABNShared?.encounterOverlay?.createController;
    if (!factory) return null;

    state.overlay = factory({
      host: ".active-session-container",
      insertBefore: ".as-header",
    });
    state.overlay.bind();
    state.overlay.setState(state.encounterSnapshot);
    return state.overlay;
  }

  function handleEncounterState(snapshot) {
    state.encounterSnapshot = snapshot || null;
    if (state.overlay) {
      state.overlay.setState(state.encounterSnapshot);
    }
  }

  function bindUIActions() {
    const backBtn = document.getElementById("as-back-chronicle");
    if (backBtn) {
      state.backBtnHandler = () => {
        window.location.hash = `chronicle?id=${encodeURIComponent(state.chronicleId)}`;
      };
      backBtn.addEventListener("click", state.backBtnHandler);
    }

    const clearBtn = document.getElementById("as-handout-clear");
    if (clearBtn) {
      state.clearFormHandler = () => {
        view().clearHandoutForm();
        view().setHandoutMessage("");
      };
      clearBtn.addEventListener("click", state.clearFormHandler);
    }

    const form = document.getElementById("as-handout-form");
    if (form) {
      state.handoutSubmitHandler = async (event) => {
        event.preventDefault();
        await submitHandoutForm();
      };
      form.addEventListener("submit", state.handoutSubmitHandler);
    }

    const list = document.getElementById("as-handout-list");
    if (list) {
      state.handoutListClickHandler = async (event) => {
        const revokeBtn = event.target.closest(".as-delivery-remove");
        if (revokeBtn?.dataset.deliveryId) {
          const ok = await global.ABNShared?.modal?.confirm?.(
            "¿Quitar esta revelación del archivo de este jugador?",
          );
          if (!ok) return;
          const { error } = await global.ABNShared.handouts.revokeDelivery(
            revokeBtn.dataset.deliveryId,
          );
          if (error) {
            view().setHandoutMessage(error.message || "No se pudo quitar la asociación.", "error");
            return;
          }
          view().setHandoutMessage("Asociación eliminada.", "ok");
          await loadHandouts();
          return;
        }

        const deleteBtn = event.target.closest(".as-handout-delete");
        if (deleteBtn?.dataset.handoutId) {
          const ok = await global.ABNShared?.modal?.confirm?.(
            "¿Eliminar esta revelación completa del archivo de crónica?",
          );
          if (!ok) return;
          const { error } = await global.ABNShared.handouts.deleteHandout(
            deleteBtn.dataset.handoutId,
          );
          if (error) {
            view().setHandoutMessage(error.message || "No se pudo eliminar revelación.", "error");
            return;
          }
          view().setHandoutMessage("Revelación eliminada.", "ok");
          await loadHandouts();
        }
      };
      list.addEventListener("click", state.handoutListClickHandler);
    }
  }

  function unbindUIActions() {
    const backBtn = document.getElementById("as-back-chronicle");
    if (backBtn && state.backBtnHandler) {
      backBtn.removeEventListener("click", state.backBtnHandler);
    }
    state.backBtnHandler = null;

    const clearBtn = document.getElementById("as-handout-clear");
    if (clearBtn && state.clearFormHandler) {
      clearBtn.removeEventListener("click", state.clearFormHandler);
    }
    state.clearFormHandler = null;

    const form = document.getElementById("as-handout-form");
    if (form && state.handoutSubmitHandler) {
      form.removeEventListener("submit", state.handoutSubmitHandler);
    }
    state.handoutSubmitHandler = null;

    const list = document.getElementById("as-handout-list");
    if (list && state.handoutListClickHandler) {
      list.removeEventListener("click", state.handoutListClickHandler);
    }
    state.handoutListClickHandler = null;
  }

  async function loadHandoutRecipients() {
    const participants = await global.ABNShared.handouts.getChronicleParticipants(
      state.chronicleId,
    );
    const filtered = participants.filter(
      (row) =>
        row?.player?.id &&
        row.player.id !== state.currentPlayerId &&
        String(row.role || "").toLowerCase() === "player",
    );
    view().renderHandoutRecipients(filtered);
  }

  async function loadHandouts() {
    const handouts = await global.ABNShared.handouts.listHandoutsByChronicle(
      state.chronicleId,
    );
    view().renderHandoutList(handouts);
  }

  function getSelectedRecipients() {
    return Array.from(document.querySelectorAll(".as-recipient-check:checked"))
      .map((node) => node.value)
      .filter(Boolean);
  }

  async function submitHandoutForm() {
    const title = document.getElementById("as-handout-title")?.value || "";
    const bodyMarkdown = document.getElementById("as-handout-body")?.value || "";
    const imageUrl = document.getElementById("as-handout-image")?.value || "";
    const recipientPlayerIds = getSelectedRecipients();

    const { error } = await global.ABNShared.handouts.createHandout({
      chronicleId: state.chronicleId,
      createdByPlayerId: state.currentPlayerId,
      title,
      bodyMarkdown,
      imageUrl,
      recipientPlayerIds,
    });

    if (error) {
      view().setHandoutMessage(error.message || "No se pudo guardar revelación.", "error");
      return;
    }

    view().setHandoutMessage("Revelación guardada y asociada.", "ok");
    view().clearHandoutForm();
    await loadHandouts();
  }

  async function initPage() {
    // Defensive cleanup in case this route is reloaded with force=true.
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
      console.warn("ActiveSession: cronica no encontrada", error?.message);
      alert("No se pudo abrir Sesión Activa para esta crónica.");
      window.location.hash = `chronicle?id=${encodeURIComponent(state.chronicleId)}`;
      return;
    }

    const participation =
      (currentPlayer?.id
        ? await service().getParticipation(state.chronicleId, currentPlayer.id)
        : null) ||
      (await service().getParticipationByUserId(state.chronicleId, session.user.id));
    const isNarrator =
      participation?.role === "narrator" ||
      (currentPlayer?.id ? chronicle.creator_id === currentPlayer.id : false);
    if (!isNarrator) {
      alert("Solo el narrador puede abrir Sesion Activa.");
      window.location.hash = `chronicle?id=${encodeURIComponent(state.chronicleId)}`;
      return;
    }

    view().setHeader({
      chronicleName: chronicle.name,
      systemId: chronicle.system_id || "v20",
    });

    const roster = await service().getRosterSummary(state.chronicleId);
    view().renderRoster(roster);

    mountEncounterOverlay();
    handleEncounterState(null);
    bindUIActions();

    await loadHandoutRecipients();
    await loadHandouts();

    state.encounterBridge = service().createEncounterBridge({
      chronicleId: state.chronicleId,
      onStateChange: handleEncounterState,
    });
    await state.encounterBridge.connect();
  }

  function destroyPage() {
    state.encounterBridge?.destroy?.();
    state.encounterBridge = null;

    unbindUIActions();

    state.overlay?.destroy?.();
    state.overlay?.unbind?.();
    state.overlay = null;

    state.encounterSnapshot = null;
    state.chronicleId = null;
    state.currentPlayerId = null;
  }

  ns.controller = {
    initPage,
    destroyPage,
  };
})(window);
