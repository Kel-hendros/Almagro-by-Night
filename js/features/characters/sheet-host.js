(function initCharacterSheetHost(global) {
  const root = (global.ABNCharacterSheetsHost = global.ABNCharacterSheetsHost || {});

  // Single source of truth for the embedded character sheet URL.
  root.basePath = "features/character-sheets/index.html";

  root.buildUrl = function buildUrl(sheetId) {
    return `${root.basePath}?id=${encodeURIComponent(sheetId)}`;
  };
})(window);
