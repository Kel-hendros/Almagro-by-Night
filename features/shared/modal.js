(function initSharedModal(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function resolveElement(target) {
    if (!target) return null;
    if (typeof target === "string") {
      const idLookup = document.getElementById(target);
      if (idLookup) return idLookup;
      return document.querySelector(target);
    }
    return target;
  }

  function createController(options = {}) {
    const overlay = resolveElement(options.overlay);
    if (!overlay) {
      return {
        open() {},
        close() {},
        isOpen() {
          return false;
        },
        destroy() {},
        overlay: null,
      };
    }

    const visibleClass = options.visibleClass || "visible";
    const closeOnBackdrop = options.closeOnBackdrop !== false;
    const closeOnEscape = options.closeOnEscape !== false;
    const onOpen = typeof options.onOpen === "function" ? options.onOpen : null;
    const onClose =
      typeof options.onClose === "function" ? options.onClose : null;

    const closeButtons = (options.closeButtons || [])
      .map((item) => resolveElement(item))
      .filter(Boolean);

    function isOpen() {
      return overlay.classList.contains(visibleClass);
    }

    function open() {
      if (isOpen()) return;
      overlay.classList.add(visibleClass);
      if (onOpen) onOpen(overlay);
    }

    function close() {
      if (!isOpen()) return;
      overlay.classList.remove(visibleClass);
      if (onClose) onClose(overlay);
    }

    function onOverlayClick(event) {
      if (!closeOnBackdrop) return;
      if (event.target === overlay) close();
    }

    function onKeyDown(event) {
      if (!closeOnEscape) return;
      if (event.key !== "Escape") return;
      if (isOpen()) close();
    }

    overlay.addEventListener("click", onOverlayClick);
    document.addEventListener("keydown", onKeyDown);
    closeButtons.forEach((button) => button.addEventListener("click", close));

    function destroy() {
      overlay.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeyDown);
      closeButtons.forEach((button) =>
        button.removeEventListener("click", close)
      );
    }

    return { open, close, isOpen, destroy, overlay };
  }

  /* ── Confirm dialog ──────────────────────────────────────────────
     Returns a Promise<boolean>.  Replaces native confirm() with a
     themed modal that uses .app-modal-overlay / .app-modal classes.
     ─────────────────────────────────────────────────────────────── */

  let confirmOverlay = null;
  let alertOverlay = null;

  function ensureConfirmDOM() {
    if (confirmOverlay) return confirmOverlay;

    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay app-confirm-overlay";
    overlay.innerHTML = `
      <div class="app-modal app-confirm-card" role="alertdialog" aria-modal="true">
        <p class="app-confirm-message"></p>
        <div class="app-modal-actions">
          <button type="button" class="btn btn--ghost app-confirm-cancel">Cancelar</button>
          <button type="button" class="btn btn--danger app-confirm-ok">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    confirmOverlay = overlay;
    return overlay;
  }

  function confirm(message, options = {}) {
    const overlay = ensureConfirmDOM();
    const msgEl = overlay.querySelector(".app-confirm-message");
    const okBtn = overlay.querySelector(".app-confirm-ok");
    const cancelBtn = overlay.querySelector(".app-confirm-cancel");

    msgEl.textContent = message;
    okBtn.textContent = options.confirmLabel || "Confirmar";
    if (options.danger !== false) {
      okBtn.className = "btn btn--danger app-confirm-ok";
    } else {
      okBtn.className = "btn btn--primary app-confirm-ok";
    }

    overlay.classList.add("visible");
    okBtn.focus();

    return new Promise((resolve) => {
      function cleanup() {
        overlay.classList.remove("visible");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
      }
      function onOk() { cleanup(); resolve(true); }
      function onCancel() { cleanup(); resolve(false); }
      function onBackdrop(e) { if (e.target === overlay) onCancel(); }
      function onKey(e) { if (e.key === "Escape") onCancel(); }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
    });
  }

  function ensureAlertDOM() {
    if (alertOverlay) return alertOverlay;

    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay app-alert-overlay";
    overlay.innerHTML = `
      <div class="app-modal app-alert-card" role="alertdialog" aria-modal="true" aria-labelledby="app-alert-title">
        <h3 id="app-alert-title" class="app-modal-title app-alert-title"></h3>
        <p class="app-alert-message"></p>
        <div class="app-modal-actions app-alert-actions">
          <button type="button" class="btn btn--primary app-alert-ok">Entendido</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    alertOverlay = overlay;
    return overlay;
  }

  function showAlert(message, options = {}) {
    const overlay = ensureAlertDOM();
    const titleEl = overlay.querySelector(".app-alert-title");
    const msgEl = overlay.querySelector(".app-alert-message");
    const okBtn = overlay.querySelector(".app-alert-ok");

    const title = String(options.title || "Aviso").trim();
    titleEl.textContent = title;
    titleEl.classList.toggle("hidden", !title);
    msgEl.textContent = String(message || "");
    okBtn.textContent = options.buttonLabel || "Entendido";

    overlay.classList.add("visible");
    okBtn.focus();

    return new Promise((resolve) => {
      function cleanup() {
        overlay.classList.remove("visible");
        okBtn.removeEventListener("click", onOk);
        overlay.removeEventListener("click", onBackdrop);
        document.removeEventListener("keydown", onKey);
      }
      function onOk() {
        cleanup();
        resolve();
      }
      function onBackdrop(event) {
        if (event.target !== overlay) return;
        onOk();
      }
      function onKey(event) {
        if (event.key === "Escape") onOk();
      }

      okBtn.addEventListener("click", onOk);
      overlay.addEventListener("click", onBackdrop);
      document.addEventListener("keydown", onKey);
    });
  }

  function showChronicleStorageLimitReached() {
    return showAlert(
      "Has alcanzado tu límite de almacenamiento (20 MB).\nPuedes borrar elementos que ya no utilices para liberar espacio.",
      {
        title: "Almacenamiento",
        buttonLabel: "Entendido",
      },
    );
  }

  let promptOverlay = null;

  function ensurePromptDOM() {
    if (promptOverlay) return promptOverlay;

    const overlay = document.createElement("div");
    overlay.className = "app-modal-overlay app-prompt-overlay";
    overlay.innerHTML = `
      <div class="app-modal app-prompt-card" role="dialog" aria-modal="true">
        <p class="app-prompt-message"></p>
        <input type="text" class="app-prompt-input" autocomplete="off">
        <div class="app-modal-actions">
          <button type="button" class="btn btn--ghost app-prompt-cancel">Cancelar</button>
          <button type="button" class="btn btn--primary app-prompt-ok">Aceptar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    promptOverlay = overlay;
    return overlay;
  }

  function prompt(message, defaultValue) {
    const overlay = ensurePromptDOM();
    const msgEl = overlay.querySelector(".app-prompt-message");
    const input = overlay.querySelector(".app-prompt-input");
    const okBtn = overlay.querySelector(".app-prompt-ok");
    const cancelBtn = overlay.querySelector(".app-prompt-cancel");

    msgEl.textContent = message;
    input.value = defaultValue || "";

    overlay.classList.add("visible");
    setTimeout(function () { input.focus(); input.select(); }, 50);

    return new Promise(function (resolve) {
      function cleanup() {
        overlay.classList.remove("visible");
        okBtn.removeEventListener("click", onOk);
        cancelBtn.removeEventListener("click", onCancel);
        overlay.removeEventListener("click", onBackdrop);
        input.removeEventListener("keydown", onInputKey);
        document.removeEventListener("keydown", onKey);
      }
      function onOk() { cleanup(); resolve(input.value); }
      function onCancel() { cleanup(); resolve(null); }
      function onBackdrop(e) { if (e.target === overlay) onCancel(); }
      function onKey(e) { if (e.key === "Escape") onCancel(); }
      function onInputKey(e) { if (e.key === "Enter") { e.preventDefault(); onOk(); } }

      okBtn.addEventListener("click", onOk);
      cancelBtn.addEventListener("click", onCancel);
      overlay.addEventListener("click", onBackdrop);
      input.addEventListener("keydown", onInputKey);
      document.addEventListener("keydown", onKey);
    });
  }

  root.modal = {
    createController,
    confirm,
    prompt,
    alert: showAlert,
    showChronicleStorageLimitReached,
  };
})(window);
