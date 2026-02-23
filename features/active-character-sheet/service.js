(function initActiveCharacterSheetService(global) {
  const ns = (global.ABNActiveCharacterSheet = global.ABNActiveCharacterSheet || {});

  const APP_THEME_KEY = "abn_theme";
  const APP_FONT_KEY = "abn_font";

  function getSheetIdFromHash(hashValue) {
    const rawHash = (hashValue || window.location.hash).replace(/^#/, "");
    const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    return params.get("id");
  }

  function buildSheetUrl(sheetId) {
    if (!sheetId) return null;
    if (window.ABNCharacterSheetsHost?.buildUrl) {
      return window.ABNCharacterSheetsHost.buildUrl(sheetId);
    }
    return `features/character-sheets/index.html?id=${encodeURIComponent(sheetId)}`;
  }

  function getCurrentTheme() {
    return (
      document.documentElement.getAttribute("data-app-theme") ||
      localStorage.getItem(APP_THEME_KEY) ||
      "dark"
    ).toLowerCase();
  }

  function getCurrentFont() {
    return (
      document.documentElement.getAttribute("data-app-font") ||
      localStorage.getItem(APP_FONT_KEY) ||
      "clasico"
    ).toLowerCase();
  }

  function mapAppFontToSheet(font) {
    return font === "terminal" ? "phantomas" : font;
  }

  ns.service = {
    getSheetIdFromHash,
    buildSheetUrl,
    getCurrentTheme,
    getCurrentFont,
    mapAppFontToSheet,
  };
})(window);
