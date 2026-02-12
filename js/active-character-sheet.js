(function initActiveCharacterSheet() {
  const frame = document.getElementById("acs-frame");
  const subtitle = document.getElementById("acs-subtitle");
  const backBtn = document.getElementById("acs-back-btn");
  const openNewTabBtn = document.getElementById("acs-open-new-tab-btn");

  if (!frame || !subtitle || !backBtn || !openNewTabBtn) return;

  const rawHash = window.location.hash.slice(1);
  const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
  const params = new URLSearchParams(query);
  const sheetId = params.get("id");

  backBtn.addEventListener("click", () => {
    window.location.hash = "character-sheets";
  });

  if (!sheetId) {
    subtitle.textContent = "ID no encontrado";
    frame.style.display = "none";
    return;
  }

  const sheetUrl = `characterSheets/index.html?id=${encodeURIComponent(sheetId)}`;
  subtitle.textContent = `ID: ${sheetId}`;
  frame.src = sheetUrl;

  openNewTabBtn.addEventListener("click", () => {
    window.open(sheetUrl, "_blank", "noopener,noreferrer");
  });

  frame.addEventListener("load", () => {
    try {
      const innerDoc = frame.contentDocument || frame.contentWindow?.document;
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
})();
