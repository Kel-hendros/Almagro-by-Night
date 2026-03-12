(function initSharedDocumentScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  let overlay = null;
  let titleEl = null;
  let subtitleEl = null;
  let tagsEl = null;
  let actionsEl = null;
  let bodyEl = null;
  let footerEl = null;
  let closeBtn = null;
  let bound = false;
  let sessionSeq = 0;
  let currentSession = null;

  function ensureDOM() {
    if (overlay) return;

    overlay = document.createElement("div");
    overlay.className = "ds-overlay";
    overlay.innerHTML = `
      <div class="ds-shell">
        <header class="ds-header">
          <div class="ds-title-wrap">
            <h2 id="ds-title" class="ds-title"></h2>
            <p id="ds-subtitle" class="ds-subtitle hidden"></p>
            <div id="ds-tags" class="ds-tags hidden"></div>
          </div>
          <div id="ds-actions" class="ds-actions"></div>
          <button id="ds-close-btn" class="btn-modal-close ds-close-btn" type="button" aria-label="Cerrar">
            <i data-lucide="x"></i>
          </button>
        </header>
        <section id="ds-body" class="ds-body"></section>
        <footer id="ds-footer" class="ds-footer hidden"></footer>
      </div>
    `;

    (document.querySelector(".app") || document.body).appendChild(overlay);
    titleEl = overlay.querySelector("#ds-title");
    subtitleEl = overlay.querySelector("#ds-subtitle");
    tagsEl = overlay.querySelector("#ds-tags");
    actionsEl = overlay.querySelector("#ds-actions");
    bodyEl = overlay.querySelector("#ds-body");
    footerEl = overlay.querySelector("#ds-footer");
    closeBtn = overlay.querySelector("#ds-close-btn");

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [overlay] });
    }

    bindListeners();
  }

  function bindListeners() {
    if (bound) return;
    closeBtn?.addEventListener("click", () => close("close-button"));
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("hashchange", onHashChange);
    document.addEventListener("click", onNavigationClickCapture, true);
    bound = true;
  }

  function onKeyDown(event) {
    if (event.key === "Escape" && isOpen()) {
      close("escape");
    }
  }

  function onHashChange() {
    if (isOpen()) {
      close("route-change");
    }
  }

  function onNavigationClickCapture(event) {
    if (!isOpen()) return;
    const target = event.target;
    if (!target || typeof target.closest !== "function") return;

    const isSidebarNav = Boolean(target.closest(".sidebar .nav a[href^='#']"));
    const isDataNavHash = Boolean(target.closest("[data-nav-hash]"));
    if (isSidebarNav || isDataNavHash) {
      close("nav-click");
    }
  }

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function isOpen() {
    return Boolean(overlay?.classList.contains("active"));
  }

  function setTitle(session, value) {
    if (!session || !titleEl) return;
    titleEl.textContent = String(value || "").trim();
  }

  function setSubtitle(session, value) {
    if (!session || !subtitleEl) return;
    const text = String(value || "").trim();
    subtitleEl.textContent = text;
    subtitleEl.classList.toggle("hidden", !text);
  }

  function setTags(session, tags) {
    if (!session || !tagsEl) return;
    const sharedTags = root.tags || null;
    const list = Array.isArray(tags)
      ? (sharedTags?.dedupe ? sharedTags.dedupe(tags) : tags)
          .map((tag) => String(tag || "").trim())
          .filter(Boolean)
      : [];
    if (!list.length) {
      tagsEl.innerHTML = "";
      tagsEl.classList.add("hidden");
      return;
    }
    tagsEl.innerHTML = list
      .map((tag) => {
        const label = sharedTags?.formatLabel
          ? sharedTags.formatLabel(tag, { displayMode: "title" })
          : tag;
        const className = sharedTags ? "abn-tag" : "ds-tag";
        return `<span class="${className}">${escapeHtml(label)}</span>`;
      })
      .join("");
    tagsEl.classList.remove("hidden");
  }

  function buildActionButton(action) {
    const id = String(action.id || "").trim();
    if (!id) return null;

    const isIcon = action.kind === "icon";
    const button = document.createElement("button");
    button.type = "button";
    button.dataset.actionId = id;

    if (isIcon) {
      const iconVariant = action.variant === "primary" ? " btn-icon--primary" : "";
      button.className = `btn-icon${iconVariant}${action.danger ? " btn-icon--danger" : ""}`;
      if (action.icon) {
        button.innerHTML = `<i data-lucide="${escapeHtml(action.icon)}"></i>`;
      } else if (action.label) {
        button.textContent = action.label;
      }
      if (action.title) button.title = action.title;
      if (action.ariaLabel || action.label) {
        button.setAttribute("aria-label", action.ariaLabel || action.label);
      }
    } else {
      const variant = ["primary", "secondary", "ghost"].includes(action.variant)
        ? action.variant
        : "ghost";
      button.className = `btn btn--${variant}`;
      if (action.icon) {
        button.innerHTML = `<i data-lucide="${escapeHtml(action.icon)}"></i><span>${escapeHtml(
          action.label || "",
        )}</span>`;
      } else {
        button.textContent = action.label || "Acción";
      }
      if (action.danger) {
        button.classList.add("btn--danger");
      }
    }

    if (action.className) {
      action.className.split(" ").filter(Boolean).forEach((cls) => button.classList.add(cls));
    }
    if (action.disabled) button.disabled = true;
    return button;
  }

  function renderActionSet(container, session, actions, scope) {
    if (!container || !session) return;
    container.innerHTML = "";

    const normalized = (Array.isArray(actions) ? actions : [])
      .map((action, index) => {
        const id = String(action?.id || `${scope}-action-${index + 1}`);
        return {
          id,
          kind: action?.kind === "icon" ? "icon" : "button",
          variant: action?.variant,
          label: action?.label || "",
          icon: action?.icon || "",
          title: action?.title || "",
          ariaLabel: action?.ariaLabel || "",
          disabled: Boolean(action?.disabled),
          danger: Boolean(action?.danger),
          className: action?.className || "",
          onClick: typeof action?.onClick === "function" ? action.onClick : null,
        };
      })
      .filter((action) => !action.hidden);

    const mapName = scope === "footer" ? "footerActionsMap" : "actionsMap";
    session[mapName] = new Map();

    normalized.forEach((action) => {
      const button = buildActionButton(action);
      if (!button) return;
      container.appendChild(button);
      if (action.onClick) {
        session[mapName].set(action.id, action.onClick);
      }
      button.addEventListener("click", () => {
        const handler = session[mapName].get(action.id);
        if (typeof handler === "function") {
          handler(session.api);
        }
      });
    });

    if (scope === "footer") {
      footerEl.classList.toggle("hidden", normalized.length === 0);
    }
  }

  function setActions(session, actions) {
    if (!session || session !== currentSession) return;
    session.actions = Array.isArray(actions) ? actions : [];
    renderActionSet(actionsEl, session, session.actions, "header");
    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [actionsEl] });
    }
  }

  function setFooterActions(session, actions) {
    if (!session || session !== currentSession) return;
    session.footerActions = Array.isArray(actions) ? actions : [];
    renderActionSet(footerEl, session, session.footerActions, "footer");
    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [footerEl] });
    }
  }

  function updateAction(session, id, patch = {}) {
    if (!session || session !== currentSession || !id) return;
    session.actions = (session.actions || []).map((action) =>
      String(action.id) === String(id) ? { ...action, ...patch } : action,
    );
    setActions(session, session.actions);
  }

  function updateFooterAction(session, id, patch = {}) {
    if (!session || session !== currentSession || !id) return;
    session.footerActions = (session.footerActions || []).map((action) =>
      String(action.id) === String(id) ? { ...action, ...patch } : action,
    );
    setFooterActions(session, session.footerActions);
  }

  function resetBody() {
    if (!bodyEl) return;
    bodyEl.className = "ds-body";
    bodyEl.removeAttribute("data-doc-type");
    bodyEl.innerHTML = "";
  }

  function resetFooter() {
    if (!footerEl) return;
    footerEl.className = "ds-footer hidden";
    footerEl.innerHTML = "";
  }

  function close(reason = "close") {
    if (!overlay || !currentSession) {
      overlay?.classList.remove("active");
      return;
    }

    const closing = currentSession;
    currentSession = null;

    overlay.classList.remove("active");
    overlay.removeAttribute("data-doc-type");
    resetBody();
    resetFooter();
    actionsEl.innerHTML = "";
    setTitle(closing, "");
    setSubtitle(closing, "");
    setTags(closing, []);

    if (typeof closing.onClosed === "function") {
      closing.onClosed({ reason });
    }
  }

  function open(options = {}) {
    ensureDOM();

    if (currentSession) {
      close("replace");
    }

    const session = {
      id: ++sessionSeq,
      onClosed: typeof options.onClosed === "function" ? options.onClosed : null,
      actions: [],
      footerActions: [],
      actionsMap: new Map(),
      footerActionsMap: new Map(),
      api: null,
    };

    const api = {
      close: () => close("api"),
      setTitle: (value) => setTitle(session, value),
      setSubtitle: (value) => setSubtitle(session, value),
      setTags: (tags) => setTags(session, tags),
      setActions: (actions) => setActions(session, actions),
      setFooterActions: (actions) => setFooterActions(session, actions),
      updateAction: (id, patch) => updateAction(session, id, patch),
      updateFooterAction: (id, patch) => updateFooterAction(session, id, patch),
      getBody: () => bodyEl,
      getFooter: () => footerEl,
    };

    session.api = api;
    currentSession = session;

    resetBody();
    resetFooter();

    const docType = String(options.docType || "").trim().toLowerCase();
    if (docType) {
      overlay.setAttribute("data-doc-type", docType);
      bodyEl.setAttribute("data-doc-type", docType);
    } else {
      overlay.removeAttribute("data-doc-type");
      bodyEl.removeAttribute("data-doc-type");
    }

    if (options.bodyClass) {
      String(options.bodyClass)
        .split(/\s+/)
        .filter(Boolean)
        .forEach((cls) => bodyEl.classList.add(cls));
    }

    setTitle(session, options.title || "");
    setSubtitle(session, options.subtitle || "");
    setTags(session, options.tags || []);
    setActions(session, options.actions || []);
    setFooterActions(session, options.footerActions || []);

    if (typeof options.renderBody === "function") {
      options.renderBody(bodyEl, api);
    }

    overlay.classList.add("active");
    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [overlay] });
    }

    return api;
  }

  root.documentScreen = {
    open,
    close,
    isOpen,
  };
})(window);
