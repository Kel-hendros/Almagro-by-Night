(function initCharacterSheetHost(global) {
  const root = (global.ABNCharacterSheetsHost = global.ABNCharacterSheetsHost || {});

  // Single source of truth for the embedded character sheet URL.
  root.basePath = "features/character-sheets/index.html";

  root.buildUrl = function buildUrl(sheetId, options) {
    const params = new URLSearchParams();
    params.set("id", sheetId);

    Object.entries(options || {}).forEach(([key, value]) => {
      if (value == null || value === "") return;
      params.set(key, String(value));
    });

    return `${root.basePath}?${params.toString()}`;
  };
})(window);
