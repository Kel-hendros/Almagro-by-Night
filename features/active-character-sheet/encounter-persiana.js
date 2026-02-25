(function initEncounterPersiana(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let isOpen = false;
  let loadedEncounterId = null;
  let listening = false;

  function getContainer() {
    return document.querySelector(".active-character-sheet-container");
  }

  function getEmbedWrap() {
    return document.getElementById("acs-encounter-embed");
  }

  function getEmbedFrame() {
    return document.getElementById("acs-encounter-frame");
  }

  function open(encounterId) {
    if (!encounterId) return;
    const frame = getEmbedFrame();
    const wrap = getEmbedWrap();
    if (!frame || !wrap) return;

    // Load iframe only when encounter changes or first open
    if (loadedEncounterId !== encounterId) {
      frame.src =
        "index.html#active-encounter?id=" +
        encodeURIComponent(encounterId) +
        "&embed=true";
      loadedEncounterId = encounterId;
    }

    wrap.classList.add("open");
    getContainer()?.classList.add("persiana-open");
    isOpen = true;

    // Update bar chevron
    var bar = document.querySelector(".acs-encounter-bar");
    if (bar) bar.classList.add("persiana-open");
  }

  function close() {
    var wrap = getEmbedWrap();
    if (wrap) wrap.classList.remove("open");
    getContainer()?.classList.remove("persiana-open");
    isOpen = false;

    var bar = document.querySelector(".acs-encounter-bar");
    if (bar) bar.classList.remove("persiana-open");
  }

  function toggle(encounterId) {
    if (isOpen) close();
    else open(encounterId);
  }

  function destroy() {
    close();
    var frame = getEmbedFrame();
    if (frame) frame.src = "about:blank";
    loadedEncounterId = null;
  }

  function handleEmbedMessage(event) {
    var data = event.data;
    if (!data) return;
    if (data.type === "abn-encounter-embed-close") {
      close();
    }
  }

  function bind() {
    if (listening) return;
    global.addEventListener("message", handleEmbedMessage);
    listening = true;
  }

  function unbind() {
    if (!listening) return;
    global.removeEventListener("message", handleEmbedMessage);
    listening = false;
  }

  ns.encounterPersiana = {
    open,
    close,
    toggle,
    destroy,
    bind,
    unbind,
    get isOpen() {
      return isOpen;
    },
  };
})(window);
