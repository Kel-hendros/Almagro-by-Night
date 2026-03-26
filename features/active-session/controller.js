(function initActiveSessionController(global) {
  const ns = (global.ABNActiveSession = global.ABNActiveSession || {});
  const service = () => ns.service;
  const view = () => ns.view;

  const state = {
    chronicleId: null,
    currentPlayerId: null,
    encounterSnapshot: null,
    encountersChannel: null,
    encountersLoading: false,
    overlay: null,
    encounterBridge: null,
    backBtnHandler: null,
    openArchiveBtnHandler: null,
    createMuestraBtnHandler: null,
    encounterListChangeHandler: null,
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

    const openArchiveBtn = document.getElementById("as-open-revelations");
    if (openArchiveBtn) {
      state.openArchiveBtnHandler = () => {
        window.location.hash = `document-archive?id=${encodeURIComponent(state.chronicleId)}&type=revelation`;
      };
      openArchiveBtn.addEventListener("click", state.openArchiveBtnHandler);
    }

    const createMuestraBtn = document.getElementById("as-create-muestra");
    if (createMuestraBtn) {
      state.createMuestraBtnHandler = () => {
        if (global.ABNMuestra?.openCreate) {
          global.ABNMuestra.openCreate({
            chronicleId: state.chronicleId,
            currentPlayerId: state.currentPlayerId,
          });
        }
      };
      createMuestraBtn.addEventListener("click", state.createMuestraBtnHandler);
    }

    const encountersList = document.getElementById("as-encounters-list");
    if (encountersList) {
      state.encounterListChangeHandler = async (event) => {
        const select = event.target.closest(".as-encounter-status-select");
        if (!select || state.encountersLoading) return;

        const encounterId = select.dataset.encounterId || "";
        const nextStatus = service().normalizeEncounterStatus(select.value);
        const previousStatus = select.dataset.currentStatus || select.value || "";
        if (!encounterId || !nextStatus) return;
        if (nextStatus === previousStatus) return;

        state.encountersLoading = true;
        view().setEncounterListBusy(true);

        const { error } = await service().updateSessionEncounterStatus({
          encounterId,
          chronicleId: state.chronicleId,
          status: nextStatus,
        });

        if (error) {
          alert(error.message || "No se pudo actualizar el estado del encuentro.");
          select.value = previousStatus;
          state.encountersLoading = false;
          view().setEncounterListBusy(false);
          return;
        }

        await loadEncounters();
        await reconnectEncounterBridge();
        state.encountersLoading = false;
        view().setEncounterListBusy(false);
      };
      encountersList.addEventListener("change", state.encounterListChangeHandler);
    }
  }

  function unbindUIActions() {
    const backBtn = document.getElementById("as-back-chronicle");
    if (backBtn && state.backBtnHandler) {
      backBtn.removeEventListener("click", state.backBtnHandler);
    }
    state.backBtnHandler = null;

    const openArchiveBtn = document.getElementById("as-open-revelations");
    if (openArchiveBtn && state.openArchiveBtnHandler) {
      openArchiveBtn.removeEventListener("click", state.openArchiveBtnHandler);
    }
    state.openArchiveBtnHandler = null;

    const createMuestraBtn = document.getElementById("as-create-muestra");
    if (createMuestraBtn && state.createMuestraBtnHandler) {
      createMuestraBtn.removeEventListener("click", state.createMuestraBtnHandler);
    }
    state.createMuestraBtnHandler = null;

    const encountersList = document.getElementById("as-encounters-list");
    if (encountersList && state.encounterListChangeHandler) {
      encountersList.removeEventListener("change", state.encounterListChangeHandler);
    }
    state.encounterListChangeHandler = null;
  }

  async function loadEncounters() {
    const { data, error } = await service().fetchSessionEncounters(state.chronicleId);
    if (error) {
      console.warn("ActiveSession: no se pudieron cargar encuentros:", error.message);
      view().renderEncounterList([]);
      return;
    }
    view().renderEncounterList(data || []);
  }

  async function reconnectEncounterBridge() {
    state.encounterBridge?.destroy?.();
    state.encounterBridge = service().createEncounterBridge({
      chronicleId: state.chronicleId,
      onStateChange: handleEncounterState,
    });
    await state.encounterBridge.connect();
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
    await loadEncounters();

    mountEncounterOverlay();
    handleEncounterState(null);
    bindUIActions();

    // Roll notifications are now handled globally by ABNNotifications.
    // No need to mount per-view.

    await reconnectEncounterBridge();
    state.encountersChannel = service().subscribeSessionEncounters({
      chronicleId: state.chronicleId,
      onChange: () => {
        void loadEncounters();
      },
    });
  }

  function destroyPage() {
    state.encounterBridge?.destroy?.();
    state.encounterBridge = null;
    service().unsubscribeChannel(state.encountersChannel);
    state.encountersChannel = null;

    unbindUIActions();

    state.overlay?.destroy?.();
    state.overlay?.unbind?.();
    state.overlay = null;

    state.encounterSnapshot = null;
    state.encountersLoading = false;
    state.chronicleId = null;
    state.currentPlayerId = null;
  }

  ns.controller = {
    initPage,
    destroyPage,
  };
})(window);
