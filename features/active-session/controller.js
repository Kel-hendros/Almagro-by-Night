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
    openArchiveBtnHandler: null,
    createRevelacionBtnHandler: null,
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
        window.location.hash = `revelations-archive?id=${encodeURIComponent(state.chronicleId)}`;
      };
      openArchiveBtn.addEventListener("click", state.openArchiveBtnHandler);
    }

    const createRevBtn = document.getElementById("as-create-revelacion");
    if (createRevBtn) {
      state.createRevelacionBtnHandler = () => {
        const rs = global.ABNShared?.revelationScreen;
        if (!rs) return;
        rs.openCreate({
          chronicleId: state.chronicleId,
          currentPlayerId: state.currentPlayerId,
        });
      };
      createRevBtn.addEventListener("click", state.createRevelacionBtnHandler);
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

    const createRevBtn = document.getElementById("as-create-revelacion");
    if (createRevBtn && state.createRevelacionBtnHandler) {
      createRevBtn.removeEventListener("click", state.createRevelacionBtnHandler);
    }
    state.createRevelacionBtnHandler = null;
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
