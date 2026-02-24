(function initABNSheetModeManager(global) {
  const MODE_KEY = "abn_sheet_mode";

  const state = {
    mode: "edit",
    initialized: false,
  };

  function isValidMode(mode) {
    return mode === "edit" || mode === "play";
  }

  function updateButtonUI() {
    const btn = document.getElementById("sheet-mode-toggle");
    if (!btn) return;
    const isEdit = state.mode === "edit";
    const icon = btn.querySelector("i");
    if (icon) {
      icon.className = `bi ${isEdit ? "bi-unlock-fill" : "bi-lock-fill"}`;
      icon.setAttribute("aria-hidden", "true");
    }
    btn.setAttribute("aria-pressed", String(isEdit));
    btn.setAttribute("aria-label", isEdit ? "Modo Edición activo" : "Modo Juego activo");
    btn.title = isEdit ? "Cambiar a modo Juego" : "Cambiar a modo Edición";
    btn.classList.toggle("is-edit", isEdit);
  }

  function applyMode(mode, emit = true) {
    state.mode = isValidMode(mode) ? mode : "edit";
    document.documentElement.setAttribute("data-sheet-mode", state.mode);
    localStorage.setItem(MODE_KEY, state.mode);
    updateButtonUI();
    if (emit) {
      window.dispatchEvent(
        new CustomEvent("abn-sheet-mode-change", {
          detail: { mode: state.mode },
        }),
      );
    }
  }

  function getMode() {
    return state.mode;
  }

  function isEditMode() {
    return state.mode === "edit";
  }

  function init() {
    if (state.initialized) return;
    const stored = (localStorage.getItem(MODE_KEY) || "edit").toLowerCase();
    applyMode(stored, false);
    const btn = document.getElementById("sheet-mode-toggle");
    btn?.addEventListener("click", () => {
      applyMode(state.mode === "edit" ? "play" : "edit");
    });
    state.initialized = true;
  }

  global.ABNSheetMode = {
    init,
    getMode,
    isEditMode,
    setMode: (mode) => applyMode(mode, true),
  };
})(window);
