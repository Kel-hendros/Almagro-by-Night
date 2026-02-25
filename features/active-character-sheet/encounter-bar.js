(function initEncounterBar(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let barEl = null;
  let bound = false;

  function getContainer() {
    return document.querySelector(".active-character-sheet-container");
  }

  function ensureBar() {
    if (barEl) return barEl;
    const container = getContainer();
    if (!container) return null;

    barEl = document.createElement("div");
    barEl.className = "acs-encounter-bar";
    barEl.setAttribute("aria-live", "polite");
    barEl.innerHTML = [
      '<div class="acs-encounter-bar-inner">',
      '  <span class="acs-eb-status"></span>',
      '  <span class="acs-eb-round"></span>',
      '  <span class="acs-eb-turn"></span>',
      "</div>",
    ].join("");

    // Insert before the frame wrapper
    const frameWrap = container.querySelector(".acs-frame-wrap");
    if (frameWrap) {
      container.insertBefore(barEl, frameWrap);
    } else {
      container.prepend(barEl);
    }

    return barEl;
  }

  function findActiveInstanceName(snap) {
    if (!snap.activeInstanceId || !Array.isArray(snap.instances)) return null;
    const inst = snap.instances.find((i) => i.id === snap.activeInstanceId);
    return inst?.name || null;
  }

  function updateBar(snap) {
    const bar = ensureBar();
    if (!bar) return;

    if (!snap || !snap.connected) {
      bar.classList.remove("visible", "my-turn");
      return;
    }

    bar.classList.add("visible");
    bar.classList.toggle("my-turn", !!snap.isMyTurn);

    const statusEl = bar.querySelector(".acs-eb-status");
    const roundEl = bar.querySelector(".acs-eb-round");
    const turnEl = bar.querySelector(".acs-eb-turn");

    if (statusEl) {
      statusEl.textContent = "En encuentro";
    }

    if (roundEl) {
      roundEl.textContent = "Ronda " + (snap.round || 1);
    }

    if (turnEl) {
      if (snap.isMyTurn) {
        turnEl.textContent = "Es tu turno";
      } else {
        const activeName = findActiveInstanceName(snap);
        turnEl.textContent = activeName
          ? "Turno de " + activeName
          : "Esperando turno...";
      }
    }
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
    if (barEl) {
      barEl.remove();
      barEl = null;
    }
  }

  ns.encounterBar = {
    bind,
    destroy,
  };
})(window);
