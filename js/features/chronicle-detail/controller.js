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

    await ns.header?.populate({ chronicleId, chronicle, isNarrator });
    ns.banner?.init({ chronicle, isNarrator });

    // ── Tab switching ──
    const tabButtons = document.querySelectorAll(".cd-tab");
    const tabPanels = document.querySelectorAll(".cd-tab-panel");

    const scrollContainer = document.querySelector(".content");

    function switchTab(target) {
        const scrollPos = scrollContainer.scrollTop;
        tabButtons.forEach(b => {
            b.classList.toggle("active", b.dataset.tab === target);
        });
        tabPanels.forEach(p => {
            p.classList.toggle("hidden", p.dataset.panel !== target);
        });
        sessionStorage.setItem("chronicle-tab", target);
        scrollContainer.scrollTop = scrollPos;
    }

    tabButtons.forEach(btn => {
        btn.addEventListener("click", () => switchTab(btn.dataset.tab));
    });

    // Restore last active tab
    const savedTab = sessionStorage.getItem("chronicle-tab");
    if (savedTab && document.querySelector(`.cd-tab[data-tab="${savedTab}"]`)) {
        switchTab(savedTab);
    }

    const {
        participants,
        characters,
        encountersCount: _encountersCount,
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
    const recapReaderModal = createModalController({
        overlay: "modal-recap-reader",
        closeButtons: ["#recap-reader-close"],
    });
    const recapFormModal = createModalController({
        overlay: "modal-recap-form",
        closeButtons: ["#recap-form-close", "#recap-form-cancel"],
    });
    const noteReaderModal = createModalController({
        overlay: "modal-note-reader",
        closeButtons: ["#note-reader-close"],
    });
    const noteFormModal = createModalController({
        overlay: "modal-note-form",
        closeButtons: ["#note-form-close", "#note-form-cancel"],
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
    })) || {};

    // ── Diario sub-tabs (mobile only, desktop shows both columns) ──
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
        recapReaderModal,
        recapFormModal,
        onLastSessionRefresh: summaryApi.refreshLastSessionCard,
    });

    await ns.notes?.init({
        chronicleId,
        sessionUserId: session.user.id,
        myChars,
        noteReaderModal,
        noteFormModal,
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
