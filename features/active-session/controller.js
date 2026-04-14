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
    sendSmsBtnHandler: null,
    exportSmsBtnHandler: null,
    encounterListChangeHandler: null,
    smsReceivedHandler: null,
    narratorReadHandler: null,
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

    const sendSmsBtn = document.getElementById("as-send-sms");
    if (sendSmsBtn) {
      state.sendSmsBtnHandler = () => {
        if (global.ABNPhone?.controller?.openCompose) {
          global.ABNPhone.controller.openCompose({
            chronicleId: state.chronicleId,
            currentPlayerId: state.currentPlayerId,
          });
        }
      };
      sendSmsBtn.addEventListener("click", state.sendSmsBtnHandler);
    }

    refreshPhoneBadge();
    state.smsReceivedHandler = () => refreshPhoneBadge();
    window.addEventListener("abn-sms-received", state.smsReceivedHandler);
    state.narratorReadHandler = () => refreshPhoneBadge();
    window.addEventListener("abn-narrator-sms-read", state.narratorReadHandler);

    const exportSmsBtn = document.getElementById("as-export-sms");
    if (exportSmsBtn) {
      state.exportSmsBtnHandler = async () => {
        if (!global.ABNPhone?.service?.exportAllMessages) return;
        exportSmsBtn.disabled = true;
        exportSmsBtn.querySelector("span").textContent = "Exportando...";
        try {
          const data = await global.ABNPhone.service.exportAllMessages(state.chronicleId);
          if (!data) return;
          const json = JSON.stringify(data, null, 2);
          const blob = new Blob([json], { type: "application/json" });
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url;
          a.download = "sms-export.json";
          a.click();
          URL.revokeObjectURL(url);
        } catch (e) {
          console.warn("ActiveSession: export SMS error", e);
        } finally {
          exportSmsBtn.disabled = false;
          exportSmsBtn.querySelector("span").textContent = "Exportar SMS";
        }
      };
      exportSmsBtn.addEventListener("click", state.exportSmsBtnHandler);
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

  async function refreshPhoneBadge() {
    var badge = document.getElementById("as-phone-badge");
    if (!badge || !state.chronicleId) return;
    var hasUnread = await global.ABNPhone?.service?.fetchNarratorHasUnread?.(state.chronicleId);
    badge.classList.toggle("hidden", !hasUnread);
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

    const sendSmsBtn = document.getElementById("as-send-sms");
    if (sendSmsBtn && state.sendSmsBtnHandler) {
      sendSmsBtn.removeEventListener("click", state.sendSmsBtnHandler);
    }
    state.sendSmsBtnHandler = null;

    const exportSmsBtn = document.getElementById("as-export-sms");
    if (exportSmsBtn && state.exportSmsBtnHandler) {
      exportSmsBtn.removeEventListener("click", state.exportSmsBtnHandler);
    }
    state.exportSmsBtnHandler = null;

    if (state.smsReceivedHandler) {
      window.removeEventListener("abn-sms-received", state.smsReceivedHandler);
    }
    state.smsReceivedHandler = null;

    if (state.narratorReadHandler) {
      window.removeEventListener("abn-narrator-sms-read", state.narratorReadHandler);
    }
    state.narratorReadHandler = null;

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
