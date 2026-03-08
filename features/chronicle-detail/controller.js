(function initChronicleDetailController(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;
  const createSharedModal = global.ABNShared?.modal?.createController;

  function createModalController(options) {
    if (createSharedModal) {
      return createSharedModal(options);
    }

    const overlay =
      typeof options.overlay === "string"
        ? document.getElementById(options.overlay) ||
          document.querySelector(options.overlay)
        : options.overlay;
    if (!overlay) {
      return {
        open() {},
        close() {},
        destroy() {},
        isOpen() {
          return false;
        },
      };
    }

    const visibleClass = options.visibleClass || "visible";
    return {
      open() {
        overlay.classList.add(visibleClass);
      },
      close() {
        overlay.classList.remove(visibleClass);
      },
      destroy() {},
      isOpen() {
        return overlay.classList.contains(visibleClass);
      },
    };
  }

  function escapeHtml(str) {
    const d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function truncateText(text, maxLen = 120) {
    const clean = String(text || "").replace(/\n+/g, " ").trim();
    if (clean.length <= maxLen) return clean;
    return clean.slice(0, maxLen) + "…";
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return "";
    }
  }

  // ── Revelaciones helpers ──

  const revelacionState = {
    chronicleId: null,
    currentPlayerId: null,
    isNarrator: false,
    listenersBound: false,
  };

  async function loadRevelacionesList(chronicleId, currentPlayerId, isNarrator) {
    const listEl = document.getElementById("cd-revelaciones-list");
    if (!listEl) return;

    const handoutsApi = global.ABNShared?.handouts;
    if (!handoutsApi) {
      listEl.innerHTML = '<span class="cd-card-muted">Servicio no disponible</span>';
      return;
    }

    try {
      let items;
      if (isNarrator) {
        items = await handoutsApi.listHandoutsByChronicle(chronicleId);
        renderNarratorRevelaciones(listEl, items);
      } else {
        items = await handoutsApi.listPendingDeliveries({
          playerId: currentPlayerId,
          chronicleId,
        });
        renderPlayerRevelaciones(listEl, items);
      }
    } catch (err) {
      console.error("Error loading revelaciones:", err);
      listEl.innerHTML = '<span class="cd-card-muted">Error al cargar revelaciones</span>';
    }
  }

  function renderNarratorRevelaciones(listEl, revelations) {
    if (!revelations || !revelations.length) {
      listEl.innerHTML = '<span class="cd-card-muted">Sin revelaciones creadas</span>';
      return;
    }
    listEl.innerHTML = "";
    revelations.forEach((rev) => {
      const recipientCount = (rev.deliveries || []).length;
      const recipientNames = (rev.deliveries || [])
        .map((d) => d.recipient?.character_name || d.recipient?.name || "—")
        .join(", ");
      const meta = formatDate(rev.created_at);
      const preview = truncateText(rev.body_markdown);
      const tagsHtml = (rev.tags || []).length
        ? `<div class="ra-tags-row">${rev.tags.map(t => `<span class="ra-tag">${escapeHtml(t)}</span>`).join("")}</div>`
        : "";

      const card = document.createElement("div");
      card.className = "cd-recap-card";
      card.dataset.handoutId = rev.id;
      card.innerHTML = `
        <div class="cd-recap-info">
          <span class="cd-recap-title">${escapeHtml(rev.title)}</span>
          <span class="cd-recap-meta">${meta} · ${recipientCount} personaje${recipientCount !== 1 ? "s" : ""}${recipientNames ? ": " + escapeHtml(recipientNames) : ""}</span>
          ${tagsHtml}
          ${preview ? `<p class="cd-recap-body">${escapeHtml(preview)}</p>` : ""}
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  function renderPlayerRevelaciones(listEl, deliveries) {
    if (!deliveries || !deliveries.length) {
      listEl.innerHTML = '<span class="cd-card-muted">Sin revelaciones recibidas</span>';
      return;
    }
    listEl.innerHTML = "";
    deliveries.forEach((del) => {
      const handout = del.handout || {};
      const meta = formatDate(del.delivered_at);
      const preview = truncateText(handout.body_markdown);
      const tagsHtml = (handout.tags || []).length
        ? `<div class="ra-tags-row">${handout.tags.map(t => `<span class="ra-tag">${escapeHtml(t)}</span>`).join("")}</div>`
        : "";

      const card = document.createElement("div");
      card.className = "cd-recap-card";
      card.dataset.deliveryId = del.id;
      card.dataset.revelationId = handout.id || "";
      card.innerHTML = `
        <div class="cd-recap-info">
          <span class="cd-recap-title">${escapeHtml(handout.title || "Sin título")}</span>
          <span class="cd-recap-meta">${meta}</span>
          ${tagsHtml}
          ${preview ? `<p class="cd-recap-body">${escapeHtml(preview)}</p>` : ""}
        </div>
      `;
      listEl.appendChild(card);
    });
  }

  function revelationScreen() {
    return global.ABNShared?.revelationScreen || null;
  }

  function handleRevelacionesListClick(event) {
    const rs = revelationScreen();
    if (!rs) return;

    const onSaved = () => loadRevelacionesList(
      revelacionState.chronicleId,
      revelacionState.currentPlayerId,
      revelacionState.isNarrator,
    );

    const narratorCard = event.target.closest("[data-handout-id]");
    if (narratorCard?.dataset.handoutId) {
      rs.showForPlayer({ revelationId: narratorCard.dataset.handoutId, onSaved });
      return;
    }

    const playerCard = event.target.closest("[data-delivery-id]");
    if (playerCard?.dataset.revelationId) {
      rs.showForPlayer({ revelationId: playerCard.dataset.revelationId });
    }
  }

  function bindRevelacionListeners() {
    if (revelacionState.listenersBound) return;

    document.getElementById("cd-add-revelacion")?.addEventListener("click", () => {
      revelationScreen()?.openCreate({
        chronicleId: revelacionState.chronicleId,
        currentPlayerId: revelacionState.currentPlayerId,
        onSaved: () => loadRevelacionesList(
          revelacionState.chronicleId,
          revelacionState.currentPlayerId,
          revelacionState.isNarrator,
        ),
      });
    });

    document.getElementById("cd-revelaciones-list")?.addEventListener("click", handleRevelacionesListClick);

    revelacionState.listenersBound = true;
  }

  function initRevelaciones(chronicleId, currentPlayerId, isNarrator) {
    revelacionState.chronicleId = chronicleId;
    revelacionState.currentPlayerId = currentPlayerId;
    revelacionState.isNarrator = isNarrator;

    if (isNarrator) {
      document.getElementById("cd-add-revelacion")?.classList.remove("hidden");
    }

    bindRevelacionListeners();
    loadRevelacionesList(chronicleId, currentPlayerId, isNarrator);
  }

  function buildSkeletonRows(count = 3) {
    return Array.from({ length: count })
      .map(
        () => `
          <div class="cd-skeleton-card" aria-hidden="true">
            <span class="cd-skeleton-line cd-skeleton-line--title"></span>
            <span class="cd-skeleton-line"></span>
            <span class="cd-skeleton-line cd-skeleton-line--short"></span>
          </div>
        `,
      )
      .join("");
  }

  function renderLoadingState() {
    const ids = [
      "cd-last-session-card",
      "cd-character-card",
      "cd-players-grid",
      "cd-sesiones-list",
      "cd-notas-list",
      "cd-revelaciones-list",
      "cd-mesa-encounters-list",
    ];
    ids.forEach((id) => {
      const el = document.getElementById(id);
      if (!el) return;
      const count = id === "cd-players-grid" ? 2 : 3;
      el.innerHTML = buildSkeletonRows(count);
    });
  }

  function getChronicleContextFromHash() {
    const rawHash = (window.location.hash || "").replace(/^#/, "");
    const query = rawHash.includes("?") ? rawHash.split("?")[1] : "";
    const params = new URLSearchParams(query);
    const chronicleIdFromQuery = params.get("id");
    const recapIdFromQuery = params.get("recap");
    return {
      chronicleIdFromQuery: chronicleIdFromQuery || null,
      recapIdFromQuery: recapIdFromQuery || null,
    };
  }

  async function initPage() {
    renderLoadingState();

    const { chronicleIdFromQuery, recapIdFromQuery } = getChronicleContextFromHash();
    const chronicleId = chronicleIdFromQuery || localStorage.getItem("currentChronicleId");
    if (!chronicleId) {
        window.location.hash = "chronicles";
        return;
    }
    localStorage.setItem("currentChronicleId", chronicleId);

    const session = await service().getSession();
    if (!session) {
        window.location.hash = "welcome";
        return;
    }

    // Get current player
    const currentPlayer = await service().getCurrentPlayerByUserId(session.user.id);

    if (!currentPlayer) {
        window.location.hash = "chronicles";
        return;
    }

    // Fetch chronicle (include banner_config and next_session)
    const { data: chronicle, error: cErr } = await service().getChronicleById(chronicleId);

    if (cErr || !chronicle) {
        console.error("Error loading chronicle:", cErr);
        document.getElementById("chronicle-name").textContent = "Crónica no encontrada";
        return;
    }

    // Check participation
    const participation = await service().getParticipation(chronicleId, currentPlayer.id);

    const isNarrator = participation?.role === "narrator" || chronicle.creator_id === currentPlayer.id;

    const activeSessionBtn = document.getElementById("cd-open-active-session");
    if (activeSessionBtn) {
        if (isNarrator) activeSessionBtn.classList.remove("hidden");
        activeSessionBtn.addEventListener("click", () => {
            window.location.hash = `active-session?id=${encodeURIComponent(chronicleId)}`;
        });
    }

    await ns.header?.populate({ chronicleId, chronicle, isNarrator });
    ns.banner?.init({ chronicle, isNarrator });

    // ── Tab switching ──
    const tabButtons = document.querySelectorAll(".app-tab");
    const tabPanels = document.querySelectorAll(".cd-tab-panel");

    const scrollContainer = document.querySelector(".content");

    function switchTab(target) {
        const scrollPos = scrollContainer.scrollTop;
        tabButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.tab === target);
        });
        tabPanels.forEach(p => {
            p.classList.toggle("active", p.dataset.panel === target);
        });
        sessionStorage.setItem("chronicle-tab", target);
        scrollContainer.scrollTop = scrollPos;
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Restore last active tab
    const savedTab = sessionStorage.getItem("chronicle-tab");
    if (savedTab && document.querySelector(`.app-tab[data-tab="${savedTab}"]`)) {
        switchTab(savedTab);
    }

    const {
        participants,
        characters,
        encountersCount: _encountersCount,
        sessionsCount,
        game,
        latestRecap,
    } = await service().fetchDashboardData(chronicleId);

    // Game — store for later use
    if (game) {
        localStorage.setItem("currentGameId", game.id);
    }

    // Group characters by user_id
    const charsByUserId = ns.players?.groupCharsByUser(characters) || {};

    const existingSheetIds = characters.map(c => c.character_sheet_id);
    const charPickerModal = createModalController({
        overlay: "modal-char-picker",
        closeButtons: ["#char-picker-close"],
    });

    const participantsApi = (await ns.participants?.init({
        chronicleId,
        currentPlayerId: currentPlayer.id,
        currentUserId: session.user.id,
        existingSheetIds,
        charPickerModal,
        onReload: () => loadRoute(true),
    })) || {};

    // ── Render Jugadores tab (cd-players-grid) ──
    const playersGrid = document.getElementById("cd-players-grid");
    ns.players?.renderPlayers({
        playersGrid,
        participants,
        charsByUserId,
        sessionUserId: session.user.id,
        isNarrator,
        onOpenCharacter: (sheetId) => {
            window.location.hash = `active-character-sheet?id=${encodeURIComponent(sheetId)}`;
        },
        onAddCharacter: () => participantsApi.openCharPicker?.(),
        onRemovePlayer: (playerId) => participantsApi.removePlayerFromChronicle?.(playerId),
        onRemoveChar: (sheetId) => participantsApi.removeCharFromChronicle?.(sheetId),
    });

    const myChars = charsByUserId[session.user.id] || [];
    const summaryApi = (await ns.summary?.init({
        chronicleId,
        chronicle,
        isNarrator,
        latestRecap,
        myChars,
        participantsCount: participants.length,
        charactersCount: characters.length,
        sessionsCount: sessionsCount || 0,
        onRequestAddCharacter: () => {
            switchTab("jugadores");
            participantsApi.openCharPicker?.();
        },
    })) || {};

    // ── Diario sub-tabs ──
    const diarioTabs = document.querySelectorAll(".cd-diario-tab");
    const diarioCols = document.querySelectorAll(".cd-diario-col");
    diarioTabs.forEach((tab) => {
        tab.addEventListener("click", () => {
            const target = tab.dataset.dtab;
            diarioTabs.forEach((t) => {
                t.classList.toggle("active", t.dataset.dtab === target);
            });
            diarioCols.forEach((col) => {
                const active = col.dataset.dcol === target;
                col.classList.toggle("active-dcol", active);
                col.classList.toggle("hidden-dcol", !active);
            });
        });
    });

    await ns.recaps?.init({
        chronicleId,
        currentPlayerId: currentPlayer.id,
        isNarrator,
        initialRecapId: recapIdFromQuery,
        previewLines: summaryApi.previewLines || ns.summary?.previewLines,
        onLastSessionRefresh: summaryApi.refreshLastSessionCard,
    });

    await ns.notes?.init({
        chronicleId,
        currentPlayerId: currentPlayer.id,
    });

    // ── Revelaciones tab ──
    initRevelaciones(chronicleId, currentPlayer.id, isNarrator);

    await ns.mesa?.init({
        chronicleId,
        isNarrator,
        currentUserId: session.user.id,
    });

    // Refresh lucide icons
    if (window.lucide) lucide.createIcons();

    // Navigation helper
    window.navigateToSection = function(hash) {
        window.location.hash = hash;
    };
  }

  ns.controller = {
    initPage,
  };
})(window);
