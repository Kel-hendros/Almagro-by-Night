(function initSharedEncounterOverlay(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function resolveElement(ref, context) {
    if (!ref) return null;
    if (typeof ref === "string") {
      return (context || document).querySelector(ref);
    }
    return ref;
  }

  function createController(options = {}) {
    const state = {
      host: null,
      bar: null,
      embedWrap: null,
      frame: null,
      isOpen: false,
      loadedEncounterId: null,
      currentEncounterId: null,
      bound: false,
      loadHandler: null,
      onMessage: null,
      closeMessageType: options.closeMessageType || "abn-encounter-embed-close",
    };

    const cls = {
      bar: options.barClass || "abn-encounter-bar",
      barVisible: options.barVisibleClass || "visible",
      barMyTurn: options.barMyTurnClass || "my-turn",
      barOpen: options.barOpenClass || "persiana-open",
      barInner: options.barInnerClass || "abn-encounter-bar-inner",
      status: options.statusClass || "abn-eb-status",
      round: options.roundClass || "abn-eb-round",
      turn: options.turnClass || "abn-eb-turn",
      toggle: options.toggleClass || "abn-eb-toggle",
      embed: options.embedClass || "abn-encounter-embed",
      embedOpen: options.embedOpenClass || "open",
      embedLoading: options.embedLoadingClass || "loading",
      frame: options.frameClass || "abn-encounter-frame",
    };

    function ensureHost() {
      if (state.host) return state.host;
      const host =
        resolveElement(options.host) ||
        resolveElement(options.container) ||
        document.body;
      state.host = host;
      return host;
    }

    function ensureEmbed() {
      if (state.embedWrap && state.frame) {
        return { wrap: state.embedWrap, frame: state.frame };
      }

      const host = ensureHost();
      if (!host) return { wrap: null, frame: null };

      let wrap = resolveElement(options.embedWrap, host);
      let frame = resolveElement(options.frame, host);

      if (!wrap) {
        wrap = document.createElement("div");
        wrap.className = cls.embed;
        host.prepend(wrap);
      } else if (!wrap.classList.contains(cls.embed)) {
        wrap.classList.add(cls.embed);
      }

      if (!frame) {
        frame = document.createElement("iframe");
        frame.className = cls.frame;
        frame.title = "Encuentro";
        wrap.appendChild(frame);
      } else if (!frame.classList.contains(cls.frame)) {
        frame.classList.add(cls.frame);
      }

      state.embedWrap = wrap;
      state.frame = frame;
      return { wrap, frame };
    }

    function ensureBar() {
      if (state.bar) return state.bar;
      const host = ensureHost();
      if (!host) return null;

      let bar = resolveElement(options.bar, host);
      if (!bar) {
        bar = document.createElement("div");
        bar.className = cls.bar;
        bar.setAttribute("aria-live", "polite");
        bar.innerHTML = [
          `<div class="${cls.barInner}">`,
          `  <span class="${cls.status}"></span>`,
          `  <span class="${cls.round}"></span>`,
          `  <span class="${cls.turn}"></span>`,
          `  <span class="${cls.toggle}">&#9660;</span>`,
          "</div>",
        ].join("");

        const insertBefore = resolveElement(options.insertBefore, host);
        if (insertBefore && insertBefore.parentNode === host) {
          host.insertBefore(bar, insertBefore);
        } else {
          host.prepend(bar);
        }
      } else if (!bar.classList.contains(cls.bar)) {
        bar.classList.add(cls.bar);
      }

      bar.addEventListener("click", function () {
        if (state.currentEncounterId) toggle(state.currentEncounterId);
      });

      state.bar = bar;
      return bar;
    }

    function getEncounterSrc(encounterId) {
      if (typeof options.buildSrc === "function") {
        return options.buildSrc(encounterId);
      }
      return (
        "index.html#active-encounter?id=" +
        encodeURIComponent(encounterId) +
        "&embed=true"
      );
    }

    function setBarOpenState(openState) {
      if (!state.bar) return;
      state.bar.classList.toggle(cls.barOpen, !!openState);
    }

    function close() {
      if (!state.isOpen) return;
      if (state.embedWrap) {
        state.embedWrap.classList.remove(cls.embedOpen, cls.embedLoading);
      }
      state.isOpen = false;
      setBarOpenState(false);
    }

    function open(encounterId) {
      if (!encounterId) return;
      if (state.isOpen) return;
      const { wrap, frame } = ensureEmbed();
      if (!wrap || !frame) return;

      state.isOpen = true;
      state.currentEncounterId = encounterId;
      setBarOpenState(true);

      if (state.loadedEncounterId === encounterId) {
        wrap.classList.add(cls.embedOpen);
        return;
      }

      wrap.classList.remove(cls.embedOpen);
      wrap.classList.add(cls.embedLoading);

      if (state.loadHandler) {
        frame.removeEventListener("load", state.loadHandler);
      }

      state.loadHandler = function () {
        frame.removeEventListener("load", state.loadHandler);
        state.loadHandler = null;
        setTimeout(function () {
          if (!state.embedWrap) return;
          state.embedWrap.classList.remove(cls.embedLoading);
          if (state.isOpen) state.embedWrap.classList.add(cls.embedOpen);
        }, 150);
      };
      frame.addEventListener("load", state.loadHandler);

      frame.src = getEncounterSrc(encounterId);
      state.loadedEncounterId = encounterId;
    }

    function toggle(encounterId) {
      if (state.isOpen) {
        close();
        return;
      }
      open(encounterId || state.currentEncounterId);
    }

    function findActiveName(snap) {
      if (!snap?.activeInstanceId || !Array.isArray(snap.instances)) return null;
      const inst = snap.instances.find((i) => i.id === snap.activeInstanceId);
      return inst?.name || null;
    }

    function setState(snap) {
      const bar = ensureBar();
      if (!bar) return;

      if (!snap || !snap.connected) {
        bar.classList.remove(cls.barVisible, cls.barMyTurn);
        state.currentEncounterId = null;
        close();
        return;
      }

      state.currentEncounterId = snap.encounterId || null;
      bar.classList.add(cls.barVisible);
      bar.classList.toggle(cls.barMyTurn, !!snap.isMyTurn);

      const statusEl = bar.querySelector("." + cls.status);
      const roundEl = bar.querySelector("." + cls.round);
      const turnEl = bar.querySelector("." + cls.turn);

      if (statusEl) {
        let label = "En encuentro";
        if (snap.encounterName) label += ": " + snap.encounterName;
        statusEl.textContent = label;
      }
      if (roundEl) roundEl.textContent = "Ronda " + (snap.round || 1);
      if (turnEl) {
        if (snap.isMyTurn) {
          turnEl.textContent = "Es tu turno";
        } else {
          const activeName = findActiveName(snap);
          turnEl.textContent = activeName
            ? "Turno de " + activeName
            : "Esperando turno...";
        }
      }
    }

    function bind() {
      if (state.bound) return;
      ensureHost();
      ensureEmbed();
      ensureBar();

      state.onMessage = function (event) {
        const data = event.data;
        if (!data) return;
        if (data.type === state.closeMessageType) close();
      };
      global.addEventListener("message", state.onMessage);
      state.bound = true;
    }

    function unbind() {
      if (!state.bound) return;
      if (state.onMessage) {
        global.removeEventListener("message", state.onMessage);
      }
      state.onMessage = null;
      state.bound = false;
    }

    function destroy() {
      unbind();
      close();
      if (state.frame) {
        if (state.loadHandler) {
          state.frame.removeEventListener("load", state.loadHandler);
          state.loadHandler = null;
        }
        state.frame.src = "about:blank";
      }
      state.loadedEncounterId = null;
      state.currentEncounterId = null;
    }

    return {
      bind,
      unbind,
      setState,
      open,
      close,
      toggle,
      destroy,
      get isOpen() {
        return state.isOpen;
      },
    };
  }

  root.encounterOverlay = {
    createController,
  };
})(window);
