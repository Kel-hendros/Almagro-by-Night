(function initChroniclesController(global) {
  const ns = (global.ABNChronicles = global.ABNChronicles || {});
  const service = () => ns.service;
  const view = () => ns.view;

  const state = {
    player: null,
    boundScope: null,
    modals: {
      create: null,
      join: null,
    },
  };

  function getElements() {
    return {
      root: document.querySelector(".main-container.games"),
      grid: document.getElementById("chronicles-grid"),
      createModal: document.getElementById("modal-create-chronicle"),
      joinModal: document.getElementById("modal-join-chronicle"),
      createNameInput: document.getElementById("create-chronicle-name"),
      createMessage: document.getElementById("create-chronicle-msg"),
      joinCodeInput: document.getElementById("join-chronicle-code"),
      joinMessage: document.getElementById("join-chronicle-msg"),
    };
  }

  function openChronicle(chronicleId) {
    localStorage.setItem("currentChronicleId", chronicleId);
    window.location.hash = "chronicle";
  }

  function openCreateModal() {
    const { createModal, createNameInput, createMessage } = getElements();
    if (!createModal) return;
    if (state.modals.create) {
      state.modals.create.open();
    } else {
      createModal.classList.add("visible");
    }
    if (createNameInput) {
      createNameInput.value = "";
      createNameInput.focus();
    }
    view().setMessage(createMessage, "", "");
  }

  function closeCreateModal() {
    const { createModal } = getElements();
    if (!createModal) return;
    if (state.modals.create) {
      state.modals.create.close();
    } else {
      createModal.classList.remove("visible");
    }
  }

  function openJoinModal() {
    const { joinModal, joinCodeInput, joinMessage } = getElements();
    if (!joinModal) return;
    if (state.modals.join) {
      state.modals.join.open();
    } else {
      joinModal.classList.add("visible");
    }
    if (joinCodeInput) {
      joinCodeInput.value = "";
      joinCodeInput.focus();
    }
    view().setMessage(joinMessage, "", "");
  }

  function closeJoinModal() {
    const { joinModal } = getElements();
    if (!joinModal) return;
    if (state.modals.join) {
      state.modals.join.close();
    } else {
      joinModal.classList.remove("visible");
    }
  }

  function setupModals() {
    const modalFactory = global.ABNShared?.modal?.createController;
    if (!modalFactory) return;

    const { createModal, joinModal } = getElements();

    const createNeedsRefresh =
      state.modals.create?.overlay !== createModal && createModal;
    if (createNeedsRefresh) {
      state.modals.create?.destroy?.();
      state.modals.create = modalFactory({
        overlay: createModal,
        closeButtons: [],
      });
    }

    const joinNeedsRefresh = state.modals.join?.overlay !== joinModal && joinModal;
    if (joinNeedsRefresh) {
      state.modals.join?.destroy?.();
      state.modals.join = modalFactory({
        overlay: joinModal,
        closeButtons: [],
      });
    }
  }

  async function submitCreateChronicle() {
    const { createNameInput, createMessage } = getElements();
    const name = createNameInput?.value?.trim();
    if (!name) {
      view().setMessage(
        createMessage,
        "Ingresa un nombre para la crónica.",
        "error"
      );
      return;
    }

    if (!state.player) {
      view().setMessage(createMessage, "Error de sesión.", "error");
      return;
    }

    try {
      const chronicle = await service().createChronicle({
        name,
        playerId: state.player.id,
      });
      closeCreateModal();
      openChronicle(chronicle.id);
    } catch (error) {
      console.error("chronicles.controller.submitCreateChronicle:", error);
      view().setMessage(
        createMessage,
        `Error: ${error?.message || "No se pudo crear la crónica."}`,
        "error"
      );
    }
  }

  async function submitJoinChronicle() {
    const { joinCodeInput, joinMessage } = getElements();
    const submitBtn = document.querySelector(
      '[data-chronicles-action="submit-join"]'
    );
    const code = (joinCodeInput?.value || "")
      .trim()
      .replace(/\s+/g, "")
      .toUpperCase();
    if (!code) {
      view().setMessage(
        joinMessage,
        "Ingresa un código de invitación.",
        "error"
      );
      return;
    }

    if (joinCodeInput) joinCodeInput.value = code;
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = "Uniendo...";
    }
    view().setMessage(joinMessage, "Verificando código...", "");

    try {
      const data = await service().joinChronicleByCode({ code });

      if (data?.already_member) {
        view().setMessage(joinMessage, `Ya sos parte de "${data.name}".`, "success");
        setTimeout(() => {
          closeJoinModal();
          openChronicle(data.chronicle_id);
        }, 1000);
        return;
      }

      closeJoinModal();
      openChronicle(data.chronicle_id);
    } catch (error) {
      console.error("chronicles.controller.submitJoinChronicle:", error);
      let message = "Código inválido o crónica inactiva.";
      if (error?.message?.includes("Invalid invite code")) {
        message = "Código de invitación no encontrado.";
      } else if (error?.message?.includes("not active")) {
        message = "Esta crónica está archivada.";
      } else if (error?.message?.includes("Player record not found")) {
        message = "Tu usuario no tiene perfil de jugador activo.";
      } else if (error?.message?.includes("Not authenticated")) {
        message = "Sesión expirada. Volvé a iniciar sesión.";
      } else if (error?.message) {
        message = `Error: ${error.message}`;
      }
      view().setMessage(joinMessage, message, "error");
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = "Unirse";
      }
    }
  }

  async function loadChronicles() {
    const { grid } = getElements();
    if (!grid) return;
    view().renderLoading(grid);

    state.player = await window.ABNCache.get(
      "currentPlayer",
      () => service().fetchCurrentPlayer(),
      { ttl: "session" }
    );
    if (!state.player) {
      view().renderUnauthenticated(grid);
      return;
    }

    try {
      // Try single-RPC overview first (1 round trip instead of 3-4)
      const overview = await service().fetchChroniclesOverview(state.player.id);
      if (overview) {
        const { chronicles, participantsMap, charactersMap } = overview;
        if (!chronicles.length) {
          view().renderEmpty(grid);
          return;
        }
        view().renderChroniclesGrid(grid, chronicles, participantsMap, charactersMap);
        return;
      }

      // Fallback: multi-query path
      const chronicles = await service().fetchChroniclesForPlayer(state.player.id);
      if (!chronicles.length) {
        view().renderEmpty(grid);
        return;
      }

      const chronicleIds = chronicles.map((c) => c.id);
      const [participantMap, characterMap] = await Promise.all([
        service().fetchParticipantsByChronicleIds(chronicleIds),
        service().fetchCharactersByChronicleIds(chronicleIds),
      ]);

      view().renderChroniclesGrid(grid, chronicles, participantMap, characterMap);
    } catch (error) {
      console.error("chronicles.controller.loadChronicles:", error);
      view().renderError(grid, "Error al cargar crónicas.");
    }
  }

  function bindEvents() {
    const { root } = getElements();
    const scope = root?.parentElement || document;
    if (!root || state.boundScope === scope) return;

    scope.addEventListener("click", (event) => {
      const actionEl = event.target.closest("[data-chronicles-action]");
      if (actionEl) {
        const action = actionEl.getAttribute("data-chronicles-action");
        if (action === "open-create") openCreateModal();
        if (action === "close-create") closeCreateModal();
        if (action === "submit-create") submitCreateChronicle();
        if (action === "open-join") openJoinModal();
        if (action === "close-join") closeJoinModal();
        if (action === "submit-join") submitJoinChronicle();
        return;
      }

      const card = event.target.closest(".chronicle-card[data-chronicle-id]");
      if (card?.dataset?.chronicleId) {
        openChronicle(card.dataset.chronicleId);
        return;
      }

    });

    scope.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      const actionEl = event.target.closest("[data-chronicles-action]");
      if (!actionEl) return;
      event.preventDefault();
      actionEl.click();
    });

    state.boundScope = scope;
  }

  async function initPage() {
    setupModals();
    bindEvents();
    await loadChronicles();
  }

  ns.controller = {
    initPage,
    loadChronicles,
    openCreateModal,
    closeCreateModal,
    submitCreateChronicle,
    openJoinModal,
    closeJoinModal,
    submitJoinChronicle,
  };
})(window);
