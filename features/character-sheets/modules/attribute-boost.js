(function initABNSheetAttributeBoost(global) {
  const deps = {
    createModalController: null,
    onSave: null,
  };

  const state = {
    activeAttrKey: null,
    initialized: false,
  };

  const attrKeyToInputId = {
    fuerza: "tempFuerza",
    destreza: "tempDestreza",
    resistencia: "tempResistencia",
  };

  function configure(nextDeps = {}) {
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.onSave = typeof nextDeps.onSave === "function" ? nextDeps.onSave : null;
  }

  function syncBadges() {
    Object.entries(attrKeyToInputId).forEach(([key, inputId]) => {
      const hiddenInput = document.getElementById(inputId);
      const badge = document.querySelector(`[data-boost-for="${key}"]`);
      if (!hiddenInput || !badge) return;
      const value = parseInt(hiddenInput.value, 10) || 0;
      badge.textContent = value ? `+${value}` : "";
      badge.classList.toggle("visible", Boolean(value));
    });
  }

  function applyBoost(value) {
    if (!state.activeAttrKey) return;
    const hiddenId = attrKeyToInputId[state.activeAttrKey];
    const hiddenInput = hiddenId ? document.getElementById(hiddenId) : null;
    const badge = document.querySelector(`[data-boost-for="${state.activeAttrKey}"]`);

    if (badge) {
      badge.textContent = value ? `+${value}` : "";
      badge.classList.toggle("visible", Boolean(value));
    }
    if (hiddenInput) {
      hiddenInput.value = String(value);
    }
    deps.onSave?.();
  }

  function init() {
    if (state.initialized || !deps.createModalController) return;

    const modal = document.getElementById("attr-boost-modal");
    const closeBtn = document.getElementById("attr-boost-modal-close");
    const triggers = document.querySelectorAll(".attr-boost-trigger");
    const optionButtons = document.querySelectorAll(".attr-boost-option");
    const clearBtn = document.querySelector(".attr-boost-clear");

    if (!modal || !closeBtn || triggers.length === 0) return;

    const modalController = deps.createModalController({
      overlay: modal,
      closeButtons: [closeBtn],
      onClose: () => {
        state.activeAttrKey = null;
      },
    });

    function openModal(attrKey) {
      state.activeAttrKey = attrKey;
      const titleEl = document.getElementById("attr-boost-modal-title");
      const label = attrKey.charAt(0).toUpperCase() + attrKey.slice(1);
      if (titleEl) titleEl.textContent = `Boost temporal: ${label}`;
      modalController.open();
    }

    function closeModal() {
      modalController.close();
    }

    triggers.forEach((trigger) => {
      trigger.addEventListener("click", () => {
        const row = trigger.closest(".physical-attr");
        const attrKey = row?.getAttribute("data-attr-key");
        if (attrKey) openModal(attrKey);
      });
    });

    optionButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const value = Number(button.getAttribute("data-boost-value") || 0);
        applyBoost(value);
        closeModal();
      });
    });

    clearBtn?.addEventListener("click", () => {
      applyBoost(0);
      closeModal();
    });

    state.initialized = true;
  }

  global.ABNSheetAttributeBoost = {
    configure,
    init,
    syncBadges,
  };
})(window);
