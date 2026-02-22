(function initActiveCharacterSheet() {
  const frame = document.getElementById("acs-frame");
  if (!frame) return;
  const APP_THEME_KEY = "abn_theme";
  const APP_FONT_KEY = "abn_font";

  const rawHash = window.location.hash.slice(1);
  const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const sheetId = params.get("id");

  if (!sheetId) {
    window.location.hash = "character-sheets";
    return;
  }

  const sheetUrl = `characterSheets/index.html?id=${encodeURIComponent(sheetId)}`;
  frame.src = sheetUrl;

  function mapAppFontToSheet(font) {
    return font === "terminal" ? "phantomas" : font;
  }

  function applyThemeAndFontToFrame() {
    try {
      const innerDoc = frame.contentDocument || frame.contentWindow?.document;
      if (!innerDoc) return;
      const theme =
        (document.documentElement.getAttribute("data-app-theme") ||
          localStorage.getItem(APP_THEME_KEY) ||
          "dark").toLowerCase();
      const appFont =
        (document.documentElement.getAttribute("data-app-font") ||
          localStorage.getItem(APP_FONT_KEY) ||
          "clasico").toLowerCase();
      const sheetFont = mapAppFontToSheet(appFont);

      innerDoc.documentElement?.setAttribute("data-app-theme", theme);
      innerDoc.documentElement?.setAttribute("data-theme", theme);
      innerDoc.body?.setAttribute("data-app-theme", theme);
      innerDoc.body?.setAttribute("data-theme", theme);

      innerDoc.documentElement?.setAttribute("data-app-font", appFont);
      innerDoc.documentElement?.setAttribute("data-font", sheetFont);
      innerDoc.body?.setAttribute("data-app-font", appFont);
      innerDoc.body?.setAttribute("data-font", sheetFont);
    } catch (error) {
      console.warn("No se pudo sincronizar tema/fuente en la hoja embebida:", error);
    }
  }

  frame.addEventListener("load", () => {
    try {
      const innerDoc = frame.contentDocument || frame.contentWindow?.document;
      applyThemeAndFontToFrame();
      const profileLink = innerDoc?.getElementById("profile-link");
      if (profileLink) {
        // Prevent nested app navigation inside the iframe.
        profileLink.setAttribute("target", "_top");
        profileLink.href = "../index.html#character-sheets";
      }
    } catch (error) {
      console.warn("No se pudo ajustar el enlace interno de la hoja:", error);
    }
  });

  window.addEventListener("abn-theme-font-changed", () => {
    applyThemeAndFontToFrame();
  });
})();
