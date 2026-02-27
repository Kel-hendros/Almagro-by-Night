(function initEncounterBar(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let bound = false;

  function updateBar(snap) {
    ns.encounterPersiana?.setState?.(snap || null);
  }

  function handleConnected(e) {
    updateBar(e.detail);
  }

  function handleUpdated(e) {
    updateBar(e.detail);
  }

  function handleDisconnected() {
    updateBar(null);
  }

  function bind() {
    if (bound) return;
    global.addEventListener("abn-encounter-connected", handleConnected);
    global.addEventListener("abn-encounter-updated", handleUpdated);
    global.addEventListener("abn-encounter-disconnected", handleDisconnected);
    bound = true;
  }

  function unbind() {
    if (!bound) return;
    global.removeEventListener("abn-encounter-connected", handleConnected);
    global.removeEventListener("abn-encounter-updated", handleUpdated);
    global.removeEventListener("abn-encounter-disconnected", handleDisconnected);
    bound = false;
  }

  function destroy() {
    unbind();
    updateBar(null);
  }

  ns.encounterBar = {
    bind,
    destroy,
  };
})(window);
