(function initCharactersFeature(global) {
  const ns = (global.ABNCharacters = global.ABNCharacters || {});

  async function loadCharacterSheets() {
    if (!ns.controller?.initPage) return;
    await ns.controller.initPage();
  }

  global.loadCharacterSheets = loadCharacterSheets;
  loadCharacterSheets();
})(window);
