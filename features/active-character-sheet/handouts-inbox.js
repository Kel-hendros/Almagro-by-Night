(function initActiveSheetHandoutsInbox(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  const TOAST_AUTO_DISMISS_MS = 20000;

  let messageHandler = null;
  let toastTimer = null;
  let toastHost = null;
  let viewBtn = null;
  let dismissBtn = null;
  let titleEl = null;

  function ensureToast() {
    if (toastHost && document.body.contains(toastHost)) return toastHost;

    const container = document.querySelector(".active-character-sheet-container");
    if (!container) return null;

    toastHost = document.createElement("div");
    toastHost.className = "acs-revelacion-toast hidden";
    toastHost.innerHTML = `
      <div class="acs-revelacion-toast-body">
        <span class="acs-revelacion-toast-icon">&#128220;</span>
        <div class="acs-revelacion-toast-text">
          <strong class="acs-revelacion-toast-title">Nueva revelación</strong>
        </div>
      </div>
      <div class="acs-revelacion-toast-actions">
        <button type="button" class="btn btn--sm acs-revelacion-toast-view">Ver</button>
        <button type="button" class="btn btn--ghost btn--sm acs-revelacion-toast-dismiss">Cerrar</button>
      </div>
    `;
    container.appendChild(toastHost);

    titleEl = toastHost.querySelector(".acs-revelacion-toast-title");
    viewBtn = toastHost.querySelector(".acs-revelacion-toast-view");
    dismissBtn = toastHost.querySelector(".acs-revelacion-toast-dismiss");
    return toastHost;
  }

  function hideToast() {
    if (toastHost) toastHost.classList.add("hidden");
    if (toastTimer) {
      clearTimeout(toastTimer);
      toastTimer = null;
    }
    if (viewBtn) viewBtn.onclick = null;
    if (dismissBtn) dismissBtn.onclick = null;
  }

  function openRevelationView(payload) {
    const rs = global.ABNShared?.revelationScreen;
    if (!rs) return;
    rs.openView({
      title: payload?.title,
      bodyMarkdown: payload?.bodyMarkdown,
      imageUrl: payload?.imageUrl,
      tags: payload?.tags,
    });
  }

  function showToast(payload) {
    const host = ensureToast();
    if (!host || !viewBtn || !dismissBtn) return;

    if (titleEl) {
      titleEl.textContent = payload?.title || "Nueva revelación";
    }

    host.classList.remove("hidden");

    if (toastTimer) clearTimeout(toastTimer);

    viewBtn.onclick = () => {
      openRevelationView(payload);
      hideToast();
    };
    dismissBtn.onclick = () => {
      hideToast();
    };

    toastTimer = global.setTimeout(hideToast, TOAST_AUTO_DISMISS_MS);
  }

  function onMessage(event) {
    if (event.data?.type === "abn-open-revelation-view") {
      openRevelationView(event.data);
      return;
    }
    if (event.data?.type === "abn-revelation-toast-show") {
      try {
        event.source?.postMessage?.(
          {
            type: "abn-revelation-toast-ack",
            requestId: event.data.requestId || "",
          },
          event.origin && event.origin !== "null" ? event.origin : "*"
        );
      } catch (_error) {}
      showToast(event.data);
    }
  }

  function init() {
    if (messageHandler) return;
    ensureToast();
    messageHandler = onMessage;
    window.addEventListener("message", messageHandler);
  }

  function destroy() {
    hideToast();
    if (messageHandler) {
      window.removeEventListener("message", messageHandler);
      messageHandler = null;
    }
    if (toastHost) {
      toastHost.remove();
      toastHost = null;
    }
    titleEl = null;
    viewBtn = null;
    dismissBtn = null;
  }

  ns.handoutsInbox = {
    init,
    destroy,
    showToast,
    openRevelationView,
  };
})(window);
