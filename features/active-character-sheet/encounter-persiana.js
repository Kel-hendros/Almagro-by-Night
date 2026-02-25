(function initEncounterPersiana(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let isOpen = false;
  let loadedEncounterId = null;
  let listening = false;
  let loadHandler = null;

  function getEmbedWrap() {
    return document.getElementById("acs-encounter-embed");
  }

  function getEmbedFrame() {
    return document.getElementById("acs-encounter-frame");
  }

  function setBarState(openState) {
    var bar = document.querySelector(".acs-encounter-bar");
    if (!bar) return;
    bar.classList.toggle("persiana-open", openState);
  }

  function open(encounterId) {
    if (!encounterId) return;
    if (isOpen) return;
    var frame = getEmbedFrame();
    var wrap = getEmbedWrap();
    if (!frame || !wrap) return;

    isOpen = true;
    setBarState(true);

    // Already loaded with same encounter — animate immediately
    if (loadedEncounterId === encounterId) {
      wrap.classList.add("open");
      return;
    }

    // Show loading state (hidden but positioned)
    wrap.classList.remove("open");
    wrap.classList.add("loading");

    // Clean up any previous load handler
    if (loadHandler) {
      frame.removeEventListener("load", loadHandler);
      loadHandler = null;
    }

    // Wait for iframe to fully load, then slide down
    loadHandler = function () {
      frame.removeEventListener("load", loadHandler);
      loadHandler = null;
      // Small delay to let the encounter render its first frame
      setTimeout(function () {
        wrap.classList.remove("loading");
        if (isOpen) wrap.classList.add("open");
      }, 150);
    };
    frame.addEventListener("load", loadHandler);

    frame.src =
      "index.html#active-encounter?id=" +
      encodeURIComponent(encounterId) +
      "&embed=true";
    loadedEncounterId = encounterId;
  }

  function close() {
    if (!isOpen) return;
    var wrap = getEmbedWrap();
    if (wrap) {
      wrap.classList.remove("open", "loading");
    }
    isOpen = false;
    setBarState(false);
  }

  function toggle(encounterId) {
    if (isOpen) close();
    else open(encounterId);
  }

  function destroy() {
    close();
    var frame = getEmbedFrame();
    if (frame) {
      if (loadHandler) {
        frame.removeEventListener("load", loadHandler);
        loadHandler = null;
      }
      frame.src = "about:blank";
    }
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
