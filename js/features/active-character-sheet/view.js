(function initActiveCharacterSheetView(global) {
  const ns = (global.ABNActiveCharacterSheet = global.ABNActiveCharacterSheet || {});

  function getFrame() {
    return document.getElementById("acs-frame");
  }

  function setFrameSource(frame, url) {
    if (!frame || !url) return;
    frame.src = url;
  }

  function getInnerDocument(frame) {
    if (!frame) return null;
    return frame.contentDocument || frame.contentWindow?.document || null;
  }

  function applyThemeAndFont(innerDoc, theme, appFont, sheetFont) {
    if (!innerDoc) return;

    innerDoc.documentElement?.setAttribute("data-app-theme", theme);
    innerDoc.documentElement?.setAttribute("data-theme", theme);
    innerDoc.body?.setAttribute("data-app-theme", theme);
    innerDoc.body?.setAttribute("data-theme", theme);

    innerDoc.documentElement?.setAttribute("data-app-font", appFont);
    innerDoc.documentElement?.setAttribute("data-font", sheetFont);
    innerDoc.body?.setAttribute("data-app-font", appFont);
    innerDoc.body?.setAttribute("data-font", sheetFont);
  }

  function normalizeBackLink(innerDoc) {
    const profileLink = innerDoc?.getElementById("profile-link");
    if (!profileLink) return;
    profileLink.setAttribute("target", "_top");
    profileLink.href = "#character-sheets";
  }

  ns.view = {
    getFrame,
    setFrameSource,
    getInnerDocument,
    applyThemeAndFont,
    normalizeBackLink,
  };
})(window);
