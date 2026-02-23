(function initABNSheetThemeDiscord(global) {
  const state = {
    discordWebhookUrl: "",
    discordWebhookEnabled: true,
  };

  const deps = {
    createModalController: null,
    onExportPdf: null,
    onSave: null,
    appThemeKey: "abn_theme",
    appFontKey: "abn_font",
  };

  function configure(nextDeps = {}) {
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.onExportPdf =
      typeof nextDeps.onExportPdf === "function" ? nextDeps.onExportPdf : null;
    deps.onSave = typeof nextDeps.onSave === "function" ? nextDeps.onSave : null;
    if (typeof nextDeps.appThemeKey === "string" && nextDeps.appThemeKey.trim()) {
      deps.appThemeKey = nextDeps.appThemeKey.trim();
    }
    if (typeof nextDeps.appFontKey === "string" && nextDeps.appFontKey.trim()) {
      deps.appFontKey = nextDeps.appFontKey.trim();
    }
  }

  function createModalController(options) {
    if (deps.createModalController) return deps.createModalController(options);
    return {
      open() {},
      close() {},
      isOpen() {
        return false;
      },
      destroy() {},
    };
  }

  function mapAppFontToSheet(font) {
    return font === "terminal" ? "phantomas" : font;
  }

  function mapSheetFontToApp(font) {
    return font === "phantomas" ? "terminal" : font;
  }

  function initThemeModal() {
    const openBtn = document.getElementById("modeToggle");
    const modal = document.getElementById("theme-modal");
    const closeBtn = document.getElementById("theme-modal-close");
    const exportPdfBtn = document.getElementById("export-character-pdf-btn");
    const body = document.body;
    if (!openBtn || !modal || !closeBtn || !body) return;

    const modalController = createModalController({
      overlay: modal,
      closeButtons: [closeBtn],
    });

    openBtn.addEventListener("click", () => modalController.open());
    exportPdfBtn?.addEventListener("click", () => deps.onExportPdf?.());

    const savedTheme = localStorage.getItem(deps.appThemeKey);
    const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    const resolvedTheme = savedTheme || (systemPrefersDark ? "dark" : "light");
    body.setAttribute("data-theme", resolvedTheme);
    document.documentElement.setAttribute("data-app-theme", resolvedTheme);

    const savedAppFont = localStorage.getItem(deps.appFontKey) || "clasico";
    const savedSheetFont = mapAppFontToSheet(savedAppFont);
    document.documentElement.setAttribute("data-font", savedSheetFont);
    document.documentElement.setAttribute(
      "data-app-font",
      mapSheetFontToApp(savedSheetFont),
    );
    body.setAttribute("data-font", savedSheetFont);
    localStorage.setItem(deps.appFontKey, mapSheetFontToApp(savedSheetFont));
  }

  function initDiscordWebhookModal() {
    const openBtn = document.getElementById("discord-btn");
    const modal = document.getElementById("discord-webhook-modal");
    const closeBtn = document.getElementById("discord-webhook-close");
    const cancelBtn = document.getElementById("discord-webhook-cancel");
    const form = document.getElementById("discord-webhook-form");
    const urlInput = document.getElementById("discord-webhook-url");
    const enabledInput = document.getElementById("discord-webhook-enabled");

    if (!openBtn || !modal || !closeBtn || !cancelBtn || !form || !urlInput || !enabledInput) {
      return;
    }

    let snapshotUrl = "";
    let snapshotEnabled = true;
    let keepChangesOnClose = false;

    function syncForm() {
      urlInput.value = state.discordWebhookUrl;
      enabledInput.checked = state.discordWebhookEnabled;
    }

    const modalController = createModalController({
      overlay: modal,
      closeButtons: [closeBtn, cancelBtn],
      onOpen: () => {
        snapshotUrl = state.discordWebhookUrl;
        snapshotEnabled = state.discordWebhookEnabled;
        syncForm();
        keepChangesOnClose = false;
        urlInput.focus();
      },
      onClose: () => {
        if (keepChangesOnClose) return;
        state.discordWebhookUrl = snapshotUrl;
        state.discordWebhookEnabled = snapshotEnabled;
        syncForm();
      },
    });

    function openModal() {
      snapshotUrl = state.discordWebhookUrl;
      snapshotEnabled = state.discordWebhookEnabled;
      syncForm();
      keepChangesOnClose = false;
      urlInput.focus();
      modalController.open();
    }

    openBtn.addEventListener("click", openModal);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const nextUrl = urlInput.value.trim();
      const nextEnabled = enabledInput.checked;

      if (nextUrl && !/^https:\/\/discord\.com\/api\/webhooks\/.+/i.test(nextUrl)) {
        urlInput.setCustomValidity("URL inválida de webhook de Discord.");
        urlInput.reportValidity();
        return;
      }
      urlInput.setCustomValidity("");

      state.discordWebhookUrl = nextUrl;
      state.discordWebhookEnabled = nextEnabled && Boolean(nextUrl);
      keepChangesOnClose = true;
      modalController.close();
      deps.onSave?.();
    });
  }

  function loadDiscordWebhookFromCharacterData(characterData) {
    if (!characterData || typeof characterData !== "object") return;
    if (characterData.discordWebhookUrl !== undefined) {
      state.discordWebhookUrl = characterData.discordWebhookUrl || "";
      state.discordWebhookEnabled = characterData.discordWebhookEnabled !== false;
      return;
    }
    if (characterData["discord-modal-webhook-input"]) {
      state.discordWebhookUrl = characterData["discord-modal-webhook-input"] || "";
      state.discordWebhookEnabled = characterData["discord-toggle-input"] !== "false";
    }
  }

  function getDiscordConfig() {
    return {
      webhookUrl: state.discordWebhookUrl,
      enabled: state.discordWebhookEnabled,
    };
  }

  function init() {
    initThemeModal();
    initDiscordWebhookModal();
  }

  global.ABNSheetThemeDiscord = {
    configure,
    init,
    loadDiscordWebhookFromCharacterData,
    getDiscordConfig,
  };
})(window);
