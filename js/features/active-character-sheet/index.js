(function initActiveCharacterSheetFeature(global) {
  const ns = (global.ABNActiveCharacterSheet = global.ABNActiveCharacterSheet || {});

  function loadActiveCharacterSheet() {
    if (!ns.controller?.initPage) return;
    ns.controller.initPage();
  }

  global.loadActiveCharacterSheet = loadActiveCharacterSheet;
  loadActiveCharacterSheet();
})(window);
