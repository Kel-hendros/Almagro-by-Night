(function initEncounterPersiana(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let overlay = null;

  function ensureOverlay() {
    if (overlay) return overlay;
    const factory = global.ABNShared?.encounterOverlay?.createController;
    if (!factory) return null;
    overlay = factory({
      host: ".active-character-sheet-container",
      bar: ".acs-encounter-bar",
      embedWrap: "#acs-encounter-embed",
      frame: "#acs-encounter-frame",
      insertBefore: ".acs-encounter-embed",
      barClass: "acs-encounter-bar",
      barInnerClass: "acs-encounter-bar-inner",
      statusClass: "acs-eb-status",
      roundClass: "acs-eb-round",
      turnClass: "acs-eb-turn",
      toggleClass: "acs-eb-toggle",
      embedClass: "acs-encounter-embed",
      frameClass: "acs-encounter-frame",
      closeMessageType: "abn-encounter-embed-close",
    });
    return overlay;
  }

  function open(encounterId) {
    ensureOverlay()?.open(encounterId);
  }

  function close() {
    ensureOverlay()?.close();
  }

  function toggle(encounterId) {
    ensureOverlay()?.toggle(encounterId);
  }

  function destroy() {
    ensureOverlay()?.destroy();
  }

  function bind() {
    ensureOverlay()?.bind();
  }

  function unbind() {
    ensureOverlay()?.unbind();
  }

  function setState(snapshot) {
    ensureOverlay()?.setState(snapshot);
  }

  ns.encounterPersiana = {
    open,
    close,
    toggle,
    destroy,
    bind,
    unbind,
    setState,
    get isOpen() {
      return !!ensureOverlay()?.isOpen;
    },
  };
})(window);
