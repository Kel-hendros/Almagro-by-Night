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

  root.modal = {
    createController,
  };
})(window);
