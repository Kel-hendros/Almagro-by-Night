(function initABNSheetRollDifficultyPrompt(global) {
  const state = {
    overlay: null,
    input: null,
    title: null,
    message: null,
    confirmBtn: null,
    cancelBtn: null,
    resolver: null,
  };

  function ensureDOM() {
    if (state.overlay) return;

    const overlay = document.createElement("div");
    overlay.id = "roll-difficulty-modal";
    overlay.className = "specialty-modal hidden";
    overlay.setAttribute("aria-hidden", "true");

    overlay.innerHTML = `
      <div class="specialty-modal-card roll-difficulty-modal-card" role="dialog" aria-modal="true" aria-labelledby="roll-difficulty-title">
        <div class="specialty-modal-header">
          <h2 id="roll-difficulty-title">Dificultad variable</h2>
          <button id="roll-difficulty-close" class="btn-modal-close" type="button" aria-label="Cerrar">
            <i data-lucide="x"></i>
          </button>
        </div>
        <p id="roll-difficulty-message" class="specialty-subtitle">Ingresa la dificultad para esta tirada.</p>
        <div class="saved-roll-field">
          <label for="roll-difficulty-input">Dificultad</label>
          <input id="roll-difficulty-input" type="number" min="2" max="10" step="1" inputmode="numeric" />
        </div>
        <div class="form-actions">
          <button id="roll-difficulty-confirm" type="button" class="background-save-btn btn btn--secondary">Confirmar</button>
          <button id="roll-difficulty-cancel" type="button" class="form-cancel-btn btn btn--ghost">Cancelar</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);

    state.overlay = overlay;
    state.input = overlay.querySelector("#roll-difficulty-input");
    state.title = overlay.querySelector("#roll-difficulty-title");
    state.message = overlay.querySelector("#roll-difficulty-message");
    state.confirmBtn = overlay.querySelector("#roll-difficulty-confirm");
    state.cancelBtn = overlay.querySelector("#roll-difficulty-cancel");

    const closeBtn = overlay.querySelector("#roll-difficulty-close");
    closeBtn?.addEventListener("click", () => close(null));
    state.cancelBtn?.addEventListener("click", () => close(null));
    state.confirmBtn?.addEventListener("click", () => {
      const value = Number(state.input?.value || NaN);
      if (!Number.isFinite(value)) {
        state.input?.focus();
        return;
      }
      close(Math.max(2, Math.min(10, Math.round(value))));
    });

    overlay.addEventListener("click", (event) => {
      if (event.target === overlay) close(null);
    });

    overlay.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        event.preventDefault();
        close(null);
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        state.confirmBtn?.click();
      }
    });

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [overlay] });
    }
  }

  function open() {
    state.overlay?.classList.remove("hidden");
    state.overlay?.setAttribute("aria-hidden", "false");
  }

  function hide() {
    state.overlay?.classList.add("hidden");
    state.overlay?.setAttribute("aria-hidden", "true");
  }

  function close(result) {
    hide();
    const resolve = state.resolver;
    state.resolver = null;
    if (resolve) resolve(result);
  }

  function request(options = {}) {
    ensureDOM();

    const {
      title = "Dificultad variable",
      message = "Ingresa la dificultad para esta tirada.",
      defaultValue = 6,
      min = 2,
      max = 10,
      confirmLabel = "Confirmar",
    } = options;

    if (state.title) state.title.textContent = title;
    if (state.message) state.message.textContent = message;
    if (state.input) {
      state.input.min = String(min);
      state.input.max = String(max);
      state.input.value = String(defaultValue);
    }
    if (state.confirmBtn) state.confirmBtn.textContent = confirmLabel;

    open();
    setTimeout(() => {
      state.input?.focus();
      state.input?.select();
    }, 0);

    return new Promise((resolve) => {
      state.resolver = resolve;
    });
  }

  global.ABNSheetRollDifficultyPrompt = {
    request,
  };
})(window);
