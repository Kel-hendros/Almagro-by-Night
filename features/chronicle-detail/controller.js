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
    editingHandoutId: null,
    formModal: null,
    listenersBound: false,
    uploading: false,
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
        .map((d) => d.recipient?.name || "—")
        .join(", ");
      const meta = formatDate(rev.created_at);
      const preview = truncateText(rev.body_markdown);
      const tagsHtml = (rev.tags || []).length
        ? `<div class="ra-tags-row">${rev.tags.map(t => `<span class="ra-tag">${escapeHtml(t)}</span>`).join("")}</div>`
        : "";

      const card = document.createElement("div");
      card.className = "cd-recap-card";
      card.innerHTML = `
        <div class="cd-recap-info">
          <span class="cd-recap-title">${escapeHtml(rev.title)}</span>
          <span class="cd-recap-meta">${meta} · ${recipientCount} destinatario${recipientCount !== 1 ? "s" : ""}${recipientNames ? ": " + escapeHtml(recipientNames) : ""}</span>
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

  function renderRevelacionRecipients(participants) {
    const host = document.getElementById("revelacion-form-recipients");
    if (!host) return;
    const rows = Array.isArray(participants) ? participants : [];
    if (!rows.length) {
      host.innerHTML = '<span class="cd-card-muted">No hay personajes disponibles en esta crónica.</span>';
      return;
    }
    host.innerHTML = rows
      .map((row) => {
        const avatarUrl = String(row.avatar_url || "").trim();
        const avatar = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" alt="${escapeHtml(row.character_name || "")}">`
          : `<span class="cd-revelacion-chip-fallback">${escapeHtml((row.character_name || "?").charAt(0).toUpperCase())}</span>`;
        return `
          <button
            type="button"
            class="cd-revelacion-chip"
            data-player-id="${escapeHtml(row.player_id)}"
            aria-pressed="false"
            title="${escapeHtml(row.character_name || "Personaje")}"
          >
            <span class="cd-revelacion-chip-avatar">${avatar}</span>
            <span>${escapeHtml(row.character_name || "Personaje")}</span>
          </button>
        `;
      })
      .join("");
  }

  function getSelectedRecipientIds() {
    return Array.from(
      new Set(
        Array.from(document.querySelectorAll(".cd-revelacion-chip.is-selected"))
          .map((node) => node.dataset.playerId || "")
          .filter(Boolean),
      ),
    );
  }

  function setRevelacionImageStatus(message, tone) {
    const el = document.getElementById("revelacion-form-image-status");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error", "uploading");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
    if (tone === "uploading") el.classList.add("uploading");
  }

  function setRevelacionMsg(message, tone) {
    const el = document.getElementById("revelacion-form-msg");
    if (!el) return;
    el.textContent = message || "";
    el.classList.remove("ok", "error");
    if (tone === "ok") el.classList.add("ok");
    if (tone === "error") el.classList.add("error");
  }

  function setRevelacionSaveBtnEnabled(enabled) {
    const btn = document.getElementById("revelacion-form-save");
    if (!btn) return;
    btn.disabled = !enabled;
  }

  function clearRevelacionForm() {
    const title = document.getElementById("revelacion-form-title");
    const imageFile = document.getElementById("revelacion-form-image");
    const imageRef = document.getElementById("revelacion-form-image-ref");
    const body = document.getElementById("revelacion-form-body");
    if (title) title.value = "";
    if (imageFile) imageFile.value = "";
    if (imageRef) imageRef.value = "";
    if (body) body.value = "";
    setRevelacionImageStatus("Sin imagen seleccionada.");
    setRevelacionMsg("");
    setRevelacionSaveBtnEnabled(true);
    revelacionState.uploading = false;
    document.querySelectorAll(".cd-revelacion-chip").forEach((node) => {
      node.classList.remove("is-selected");
      node.setAttribute("aria-pressed", "false");
    });
  }

  async function getRecipientCharacters(chronicleId, currentPlayerId) {
    const sb = global.supabase;
    if (!sb || !chronicleId) return [];

    const { data: ccRows, error: ccError } = await sb
      .from("chronicle_characters")
      .select("character_sheet:character_sheets(id, name, user_id, data, avatar_url)")
      .eq("chronicle_id", chronicleId);
    if (ccError) return [];

    const sheets = (ccRows || [])
      .map((row) => row.character_sheet)
      .filter((s) => s?.id && s?.user_id);
    if (!sheets.length) return [];

    const userIds = Array.from(new Set(sheets.map((s) => String(s.user_id))));
    const { data: players, error: pErr } = await sb
      .from("players")
      .select("id, name, user_id")
      .in("user_id", userIds);
    if (pErr) return [];

    const playerByUserId = new Map();
    (players || []).forEach((p) => {
      if (p?.user_id) playerByUserId.set(String(p.user_id), p);
    });

    return sheets
      .map((sheet) => {
        const player = playerByUserId.get(String(sheet.user_id));
        if (!player?.id || player.id === currentPlayerId) return null;
        const data = sheet.data || {};
        return {
          character_sheet_id: sheet.id,
          character_name: sheet.name || "Personaje",
          avatar_url: data.avatarThumbUrl || sheet.avatar_url || data.avatar_url || "",
          player_id: player.id,
          player_name: player.name || "Jugador",
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.character_name).localeCompare(String(b.character_name), "es"));
  }

  async function openRevelacionCreateModal() {
    const recipients = await getRecipientCharacters(
      revelacionState.chronicleId,
      revelacionState.currentPlayerId,
    );
    renderRevelacionRecipients(recipients);

    revelacionState.editingHandoutId = null;
    const heading = document.getElementById("revelacion-form-heading");
    const saveBtn = document.getElementById("revelacion-form-save");
    if (heading) heading.textContent = "Crear Revelación";
    if (saveBtn) saveBtn.textContent = "Guardar Revelación";
    clearRevelacionForm();

    revelacionState.formModal?.open?.();
    document.getElementById("revelacion-form-title")?.focus();
  }

  async function uploadRevelacionImage(file) {
    if (!file) return;
    const handoutsApi = global.ABNShared?.handouts;
    if (!handoutsApi) return;

    revelacionState.uploading = true;
    setRevelacionSaveBtnEnabled(false);
    setRevelacionImageStatus(`Subiendo ${file.name}...`, "uploading");

    const uploadRes = await handoutsApi.uploadHandoutImage({
      chronicleId: revelacionState.chronicleId,
      file,
    });

    revelacionState.uploading = false;

    if (uploadRes.error || !uploadRes.imageRef) {
      setRevelacionImageStatus("No se pudo subir la imagen.", "error");
      setRevelacionSaveBtnEnabled(true);
      return;
    }

    const imageRefInput = document.getElementById("revelacion-form-image-ref");
    if (imageRefInput) imageRefInput.value = uploadRes.imageRef;
    setRevelacionImageStatus("Imagen subida", "ok");
    setRevelacionSaveBtnEnabled(true);
  }

  async function submitRevelacionForm() {
    const handoutsApi = global.ABNShared?.handouts;
    if (!handoutsApi || revelacionState.uploading) return;

    const title = document.getElementById("revelacion-form-title")?.value || "";
    const bodyMarkdown = document.getElementById("revelacion-form-body")?.value || "";
    const imageRef = String(document.getElementById("revelacion-form-image-ref")?.value || "").trim();

    const { error } = await handoutsApi.createHandout({
      chronicleId: revelacionState.chronicleId,
      createdByPlayerId: revelacionState.currentPlayerId,
      title,
      bodyMarkdown,
      imageRef,
      recipientPlayerIds: getSelectedRecipientIds(),
    });

    if (error) {
      setRevelacionMsg(error.message || "No se pudo guardar revelación.", "error");
      return;
    }

    revelacionState.formModal?.close?.();
    await loadRevelacionesList(
      revelacionState.chronicleId,
      revelacionState.currentPlayerId,
      revelacionState.isNarrator,
    );
  }

  function bindRevelacionFormListeners() {
    if (revelacionState.listenersBound) return;

    document.getElementById("cd-add-revelacion")?.addEventListener("click", openRevelacionCreateModal);

    document.getElementById("revelacion-form-save")?.addEventListener("click", submitRevelacionForm);

    document.getElementById("revelacion-form-recipients")?.addEventListener("click", (event) => {
      const chip = event.target.closest(".cd-revelacion-chip");
      if (!chip) return;
      const next = !chip.classList.contains("is-selected");
      chip.classList.toggle("is-selected", next);
      chip.setAttribute("aria-pressed", next ? "true" : "false");
    });

    document.getElementById("revelacion-form-image")?.addEventListener("change", (event) => {
      const file = event.target?.files?.[0] || null;
      if (file) {
        uploadRevelacionImage(file);
        return;
      }
      const hasSaved = Boolean(
        String(document.getElementById("revelacion-form-image-ref")?.value || "").trim(),
      );
      setRevelacionImageStatus(
        hasSaved ? "Imagen subida" : "Sin imagen seleccionada.",
        hasSaved ? "ok" : undefined,
      );
    });

    document.getElementById("revelacion-form-image-clear")?.addEventListener("click", () => {
      const imageFileInput = document.getElementById("revelacion-form-image");
      const imageRefInput = document.getElementById("revelacion-form-image-ref");
      if (imageFileInput) imageFileInput.value = "";
      if (imageRefInput) imageRefInput.value = "";
      setRevelacionImageStatus("Sin imagen seleccionada.");
    });

    revelacionState.listenersBound = true;
  }

  function initRevelaciones(chronicleId, currentPlayerId, isNarrator, revelacionFormModal) {
    revelacionState.chronicleId = chronicleId;
    revelacionState.currentPlayerId = currentPlayerId;
    revelacionState.isNarrator = isNarrator;
    revelacionState.formModal = revelacionFormModal;

    if (isNarrator) {
      document.getElementById("cd-add-revelacion")?.classList.remove("hidden");
    }

    bindRevelacionFormListeners();
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
    const revelacionFormModal = createModalController({
        overlay: "modal-revelacion-form",
        closeButtons: ["#revelacion-form-close", "#revelacion-form-cancel"],
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

    // ── Revelaciones tab ──
    initRevelaciones(chronicleId, currentPlayer.id, isNarrator, revelacionFormModal);

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
