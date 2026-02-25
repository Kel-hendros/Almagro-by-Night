(function initActiveCharacterSheetController(global) {
  const ns = (global.ABNActiveCharacterSheet = global.ABNActiveCharacterSheet || {});
  const service = () => ns.service;
  const view = () => ns.view;

  const state = {
    frame: null,
    bound: false,
  };

  function applyThemeFontToFrame() {
    try {
      const innerDoc = view().getInnerDocument(state.frame);
      if (!innerDoc) return;

      const theme = service().getCurrentTheme();
      const appFont = service().getCurrentFont();
      const sheetFont = service().mapAppFontToSheet(appFont);

      view().applyThemeAndFont(innerDoc, theme, appFont, sheetFont);
    } catch (error) {
      console.warn("No se pudo sincronizar tema/fuente en la hoja embebida:", error);
    }
  }

  function handleFrameLoad() {
    try {
      const innerDoc = view().getInnerDocument(state.frame);
      applyThemeFontToFrame();
      view().normalizeBackLink(innerDoc);
    } catch (error) {
      console.warn("No se pudo ajustar el contenido embebido de la hoja:", error);
    }
  }

  function bindEvents() {
    if (!state.frame || state.bound) return;

    state.frame.addEventListener("load", handleFrameLoad);
    window.addEventListener("abn-theme-font-changed", applyThemeFontToFrame);

    state.bound = true;
  }

  function initPage() {
    state.frame = view().getFrame();
    if (!state.frame) return;

    const sheetId = service().getSheetIdFromHash();
    if (!sheetId) {
      window.location.hash = "character-sheets";
      return;
    }

    const sheetUrl = service().buildSheetUrl(sheetId);
    view().setFrameSource(state.frame, sheetUrl);
    bindEvents();

    // Connect encounter bridge + UI bar + persiana (async, non-blocking)
    ns.encounterBar?.bind?.();
    ns.encounterPersiana?.bind?.();
    ns.encounterBridge?.connect?.();
  }

  function destroyPage() {
    ns.encounterPersiana?.destroy?.();
    ns.encounterPersiana?.unbind?.();
    ns.encounterBar?.destroy?.();
    ns.encounterBridge?.destroy?.();

    if (state.frame) {
      state.frame.removeEventListener("load", handleFrameLoad);
    }
    window.removeEventListener("abn-theme-font-changed", applyThemeFontToFrame);
    state.frame = null;
    state.bound = false;
  }

  ns.controller = {
    initPage,
    destroyPage,
  };
})(window);
