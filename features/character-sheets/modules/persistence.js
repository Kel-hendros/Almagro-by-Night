(function initABNSheetPersistence(global) {
  const deps = {
    getCurrentSheetId: null,
    getCharacterData: null,
    getCharacterName: null,
    supabaseClient: null,
    getSaveIcon: null,
    localStorageKey: "characterData",
  };

  let saveTimeout = null;
  let lifecycleBound = false;

  function configure(nextDeps = {}) {
    deps.getCurrentSheetId =
      typeof nextDeps.getCurrentSheetId === "function" ? nextDeps.getCurrentSheetId : null;
    deps.getCharacterData =
      typeof nextDeps.getCharacterData === "function" ? nextDeps.getCharacterData : null;
    deps.getCharacterName =
      typeof nextDeps.getCharacterName === "function" ? nextDeps.getCharacterName : null;
    deps.supabaseClient = nextDeps.supabaseClient || null;
    deps.getSaveIcon =
      typeof nextDeps.getSaveIcon === "function" ? nextDeps.getSaveIcon : null;
    if (typeof nextDeps.localStorageKey === "string" && nextDeps.localStorageKey.trim()) {
      deps.localStorageKey = nextDeps.localStorageKey.trim();
    }
  }

  function debounce(func, wait) {
    return function debounced(...args) {
      const context = this;
      clearTimeout(saveTimeout);
      saveTimeout = setTimeout(() => func.apply(context, args), wait);
    };
  }

  async function persistNow() {
    const sheetId = deps.getCurrentSheetId ? deps.getCurrentSheetId() : null;
    if (!sheetId || !deps.getCharacterData || !deps.supabaseClient) return;

    const saveIcon = deps.getSaveIcon ? deps.getSaveIcon() : null;
    if (saveIcon) saveIcon.style.color = "yellow";

    const characterJSON = deps.getCharacterData();
    const characterData = JSON.parse(characterJSON);
    const characterName = deps.getCharacterName ? deps.getCharacterName() : "";
    const name = characterName || "Sin Nombre";

    const { error } = await deps.supabaseClient
      .from("character_sheets")
      .update({
        name,
        data: characterData,
        updated_at: new Date(),
      })
      .eq("id", sheetId);

    if (error) {
      console.error("Error saving:", error);
      if (saveIcon) saveIcon.style.color = "red";
      return;
    }

    if (saveIcon) {
      saveIcon.style.color = "lightgreen";
      setTimeout(() => {
        saveIcon.style.color = "";
      }, 1000);
    }
  }

  const debouncedPersist = debounce(persistNow, 1000);

  function saveCharacterData() {
    if (!deps.getCharacterData) return;
    const characterJSON = deps.getCharacterData();
    localStorage.setItem(deps.localStorageKey, characterJSON);

    const sheetId = deps.getCurrentSheetId ? deps.getCurrentSheetId() : null;
    if (sheetId) debouncedPersist();
  }

  function flushPendingSave() {
    clearTimeout(saveTimeout);

    const sheetId = deps.getCurrentSheetId ? deps.getCurrentSheetId() : null;
    if (!sheetId || !deps.getCharacterData || !deps.supabaseClient) return;

    const characterJSON = deps.getCharacterData();
    const characterData = JSON.parse(characterJSON);
    const characterName = deps.getCharacterName ? deps.getCharacterName() : "";
    const name = characterName || "Sin Nombre";

    deps.supabaseClient
      .from("character_sheets")
      .update({ name, data: characterData, updated_at: new Date() })
      .eq("id", sheetId);
  }

  function initLifecycleHooks() {
    if (lifecycleBound) return;
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") flushPendingSave();
    });
    window.addEventListener("beforeunload", flushPendingSave);
    lifecycleBound = true;
  }

  global.ABNSheetPersistence = {
    configure,
    saveCharacterData,
    flushPendingSave,
    initLifecycleHooks,
  };
})(window);
