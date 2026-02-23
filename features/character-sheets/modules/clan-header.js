(function initABNSheetClanHeader(global) {
  const state = {
    clanSelected: "",
    currentLogoDisplay: "",
    initialized: false,
  };

  const deps = {
    createModalController: null,
    onSave: null,
    getCurrentAvatarUrl: null,
  };

  function configure(nextDeps = {}) {
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.onSave = typeof nextDeps.onSave === "function" ? nextDeps.onSave : null;
    deps.getCurrentAvatarUrl =
      typeof nextDeps.getCurrentAvatarUrl === "function"
        ? nextDeps.getCurrentAvatarUrl
        : null;
  }

  function getCurrentAvatarUrl() {
    return deps.getCurrentAvatarUrl ? deps.getCurrentAvatarUrl() : null;
  }

  function updateClanFieldSigil() {
    const sigil = document.getElementById("clan-field-sigil");
    const logoValue = document.getElementById("header-logo-value");
    if (!sigil || !logoValue) return;
    const value = logoValue.value;
    if (value && value !== "G") {
      sigil.textContent = value;
      sigil.classList.add("visible");
    } else {
      sigil.textContent = "";
      sigil.classList.remove("visible");
    }
  }

  function updateHeaderLogo() {
    const container = document.querySelector(".profile-back-link");
    const input = document.getElementById("header-logo-value");
    if (!container || !input) return;

    let display = document.getElementById("header-logo-display");
    if (!display) {
      display = container.querySelector("p");
    }
    const logoValue = input.value || "G";
    let avatarImg = container.querySelector(".avatar-img");
    const currentAvatarUrl = getCurrentAvatarUrl();

    if (currentAvatarUrl) {
      if (display) display.style.display = "none";
      if (!avatarImg) {
        avatarImg = document.createElement("img");
        avatarImg.className = "avatar-img";
        avatarImg.alt = "Personaje";
        avatarImg.style.cssText = "";
        container.appendChild(avatarImg);
      }
      avatarImg.src = currentAvatarUrl;
      avatarImg.style.display = "block";
      return;
    }

    if (avatarImg) avatarImg.style.display = "none";
    if (display) {
      display.style.display = "block";
      display.innerHTML = logoValue;
    }
  }

  function init() {
    if (state.initialized) return;

    const modal = document.getElementById("clan-modal");
    const inputField = document.getElementById("clan");
    const acceptBtn = document.getElementById("accept-btn");
    const closeBtn = document.getElementById("close-btn");
    const cancelBtn = document.getElementById("cancel-btn");
    const clanChips = document.querySelectorAll("#clan-modal .clan-chip");
    const headerLogoInput = document.getElementById("header-logo-value");

    if (
      !modal ||
      !inputField ||
      !acceptBtn ||
      !closeBtn ||
      !headerLogoInput ||
      !deps.createModalController
    ) {
      return;
    }

    const modalController = deps.createModalController({
      overlay: modal,
      closeButtons: [closeBtn, cancelBtn],
    });

    function openModal() {
      modalController.open();
    }

    function closeModal() {
      modalController.close();
    }

    inputField.addEventListener("focus", openModal);
    inputField.addEventListener("click", openModal);

    clanChips.forEach((chip) => {
      chip.addEventListener("click", () => {
        state.clanSelected = chip.textContent.trim();
        const sigil = chip.querySelector(".clan-sigil");
        if (sigil) {
          state.clanSelected = chip.textContent.replace(sigil.textContent, "").trim();
        }
        clanChips.forEach((item) => item.classList.remove("clan-chip-active"));
        chip.classList.add("clan-chip-active");
        state.currentLogoDisplay = chip.dataset.clan || "";
      });
    });

    acceptBtn.addEventListener("click", () => {
      closeModal();
      inputField.value = state.clanSelected;
      headerLogoInput.value = state.currentLogoDisplay || headerLogoInput.value;
      updateHeaderLogo();
      updateClanFieldSigil();
      deps.onSave?.();
    });

    closeBtn.addEventListener("click", closeModal);
    cancelBtn?.addEventListener("click", closeModal);

    state.initialized = true;
    state.openModal = openModal;
    state.closeModal = closeModal;
  }

  function openModal() {
    if (!state.initialized || typeof state.openModal !== "function") return;
    state.openModal();
  }

  function closeModal() {
    if (!state.initialized || typeof state.closeModal !== "function") return;
    state.closeModal();
  }

  global.ABNSheetClanHeader = {
    configure,
    init,
    openModal,
    closeModal,
    updateHeaderLogo,
    updateClanFieldSigil,
  };
})(window);
