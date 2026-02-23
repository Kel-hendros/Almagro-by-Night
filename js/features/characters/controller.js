(function initCharactersController(global) {
  const ns = (global.ABNCharacters = global.ABNCharacters || {});
  const service = () => ns.service;
  const view = () => ns.view;
  const avatar = () => ns.avatar;

  const state = {
    user: null,
    isAdmin: false,
    boundRoot: null,
  };

  function elements() {
    return {
      root: document.querySelector(".main-container.games.cs-page"),
      grid: document.getElementById("sheets-grid"),
    };
  }

  function openSheet(sheetId) {
    window.location.hash = `active-character-sheet?id=${encodeURIComponent(sheetId)}`;
  }

  function goToChronicle(chronicleId) {
    localStorage.setItem("currentChronicleId", chronicleId);
    window.location.hash = "chronicle";
  }

  async function createNewSheet() {
    const name = prompt("Nombre del Personaje:", "Nuevo Vampiro");
    if (!name?.trim()) return;
    if (!state.user) return;

    try {
      const created = await service().createSheet({
        userId: state.user.id,
        name: name.trim(),
      });
      if (created?.id) {
        openSheet(created.id);
      }
    } catch (error) {
      console.error("characters.controller.createNewSheet:", error);
      alert("Error al crear: " + error.message);
    }
  }

  async function deleteSheet(sheetId) {
    if (!confirm("¿Estás seguro de borrar este personaje permanentemente?")) return;

    try {
      await service().deleteSheet(sheetId);
      await loadCharacters();
    } catch (error) {
      console.error("characters.controller.deleteSheet:", error);
      alert("Error al borrar: " + error.message);
    }
  }

  async function loadCharacters() {
    const { grid } = elements();
    if (!grid) return;
    view().setLoading(grid);

    try {
      state.user = await service().getCurrentUser();
      if (!state.user) {
        view().setEmpty(grid, "Debes iniciar sesión.");
        return;
      }

      state.isAdmin = await service().isUserAdmin(state.user.id);
      const [playerMap, sheets] = await Promise.all([
        service().fetchPlayersMap(),
        service().fetchSheets({ userId: state.user.id, isAdmin: state.isAdmin }),
      ]);
      const chronicleMap = await service().fetchChronicleMap(
        (sheets || []).map((sheet) => sheet.id)
      );

      view().renderSheets(grid, {
        sheets,
        playerMap,
        chronicleMap,
        sessionUserId: state.user.id,
        isAdmin: state.isAdmin,
      });

      avatar().bindIfNeeded(() => loadCharacters());

      if (window.lucide) {
        lucide.createIcons();
      }
    } catch (error) {
      console.error("characters.controller.loadCharacters:", error);
      view().setEmpty(grid, "Error al cargar personajes.");
    }
  }

  function bindEvents() {
    const { root } = elements();
    if (!root || state.boundRoot === root) return;

    root.addEventListener("click", (event) => {
      const actionEl = event.target.closest("[data-character-action]");
      if (actionEl) {
        const action = actionEl.getAttribute("data-character-action");
        if (action === "create") {
          createNewSheet();
          return;
        }

        if (action === "delete") {
          const sheetId = actionEl.getAttribute("data-sheet-id");
          if (sheetId) deleteSheet(sheetId);
          return;
        }

        if (action === "avatar-upload") {
          const sheetId = actionEl.getAttribute("data-sheet-id");
          if (sheetId) avatar().openUpload(sheetId);
          return;
        }

        if (action === "avatar-reposition") {
          const sheetId = actionEl.getAttribute("data-sheet-id");
          if (sheetId) avatar().openReposition(sheetId);
          return;
        }

        if (action === "open-chronicle") {
          event.preventDefault();
          const chronicleId = actionEl.getAttribute("data-chronicle-id");
          if (chronicleId) goToChronicle(chronicleId);
          return;
        }
      }

      const card = event.target.closest(".cs-card--clickable[data-sheet-id]");
      if (!card) return;
      const sheetId = card.getAttribute("data-sheet-id");
      if (sheetId) {
        openSheet(sheetId);
      }
    });

    state.boundRoot = root;
  }

  async function initPage() {
    bindEvents();
    await loadCharacters();
  }

  ns.controller = {
    initPage,
    loadCharacters,
  };
})(window);
