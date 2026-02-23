(function initABNSheetWillpower(global) {
  const deps = {
    save: null,
    blockVirtues: null,
    resetDicePool1: null,
    addToPool1: null,
  };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
    deps.blockVirtues =
      typeof nextDeps.blockVirtues === "function" ? nextDeps.blockVirtues : null;
    deps.resetDicePool1 =
      typeof nextDeps.resetDicePool1 === "function" ? nextDeps.resetDicePool1 : null;
    deps.addToPool1 =
      typeof nextDeps.addToPool1 === "function" ? nextDeps.addToPool1 : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function syncVirtues() {
    if (deps.blockVirtues) deps.blockVirtues();
  }

  function feedPool(inputId) {
    const inputElement = document.querySelector(`#${inputId}`);
    if (!inputElement) return;

    const inputValue = inputElement.value;
    const inputName = inputElement.getAttribute("name");
    if (deps.resetDicePool1) deps.resetDicePool1();
    if (deps.addToPool1) deps.addToPool1(inputValue, inputName);
  }

  function renderWillpowerTrack() {
    const permValue = parseInt(document.querySelector("#voluntadPerm-value")?.value, 10) || 0;
    const tempValue = parseInt(document.querySelector("#voluntadTemp-value")?.value, 10) || 0;
    const permButtons = document.querySelectorAll("#willpower-track .willpower-perm");
    const tempButtons = document.querySelectorAll("#willpower-track .willpower-temp");

    permButtons.forEach((btn, i) => {
      btn.classList.remove("filled", "empty");
      btn.classList.add(i < permValue ? "filled" : "empty");
    });

    tempButtons.forEach((btn, i) => {
      btn.classList.remove("used", "available", "locked");
      if (i >= permValue) {
        btn.classList.add("locked");
      } else if (i < tempValue) {
        btn.classList.add("used");
      } else {
        btn.classList.add("available");
      }
    });

    const menuPermbtn = document.querySelector('[data-willpower-roll="perm"]');
    const menuTempbtn = document.querySelector('[data-willpower-roll="temp"]');
    if (menuPermbtn) menuPermbtn.textContent = `Tirar Permanente (${permValue})`;
    if (menuTempbtn) menuTempbtn.textContent = `Tirar Temporal (${tempValue})`;
  }

  function blockTemporalWillpower() {
    renderWillpowerTrack();
  }

  function rollVoluntad(inputId) {
    feedPool(inputId);
  }

  function bindTrack() {
    const track = document.querySelector("#willpower-track");
    if (!track) return;

    track.addEventListener("click", (event) => {
      const btn = event.target.closest("button");
      if (!btn) return;

      const index = parseInt(btn.getAttribute("data-index"), 10);

      if (btn.classList.contains("willpower-perm")) {
        const permInput = document.querySelector("#voluntadPerm-value");
        if (!permInput) return;

        const currentPerm = parseInt(permInput.value, 10) || 0;
        permInput.value = index + 1 === currentPerm ? index : index + 1;

        const tempInput = document.querySelector("#voluntadTemp-value");
        const newPerm = parseInt(permInput.value, 10) || 0;
        if (tempInput && (parseInt(tempInput.value, 10) || 0) > newPerm) {
          tempInput.value = String(newPerm);
        }

        renderWillpowerTrack();
        syncVirtues();
        persist();
        return;
      }

      if (btn.classList.contains("willpower-temp")) {
        const permValue = parseInt(document.querySelector("#voluntadPerm-value")?.value, 10) || 0;
        if (index >= permValue) return;

        const tempInput = document.querySelector("#voluntadTemp-value");
        if (!tempInput) return;

        const currentTemp = parseInt(tempInput.value, 10) || 0;
        tempInput.value = index + 1 === currentTemp ? index : index + 1;

        renderWillpowerTrack();
        persist();
      }
    });
  }

  function bindRollMenu() {
    const trigger = document.getElementById("willpower-roll-trigger");
    const container = document.querySelector(".willpower-roll");
    if (!trigger || !container) return;

    function closeMenu() {
      container.classList.remove("open");
      trigger.setAttribute("aria-expanded", "false");
    }

    trigger.addEventListener("click", (event) => {
      event.stopPropagation();
      const isOpen = container.classList.toggle("open");
      trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
    });

    container.addEventListener("click", (event) => {
      const menuBtn = event.target.closest("[data-willpower-roll]");
      if (!menuBtn) return;
      const type = menuBtn.getAttribute("data-willpower-roll");
      if (type === "perm") {
        rollVoluntad("voluntadPerm-value");
      } else if (type === "temp") {
        rollVoluntad("voluntadTemp-value");
      }
      closeMenu();
    });

    document.addEventListener("click", (event) => {
      if (!container.contains(event.target)) closeMenu();
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closeMenu();
    });
  }

  function init() {
    bindTrack();
    bindRollMenu();
  }

  global.ABNSheetWillpower = {
    configure,
    init,
    renderWillpowerTrack,
    blockTemporalWillpower,
    rollVoluntad,
  };
})(window);
