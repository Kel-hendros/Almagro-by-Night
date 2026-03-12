(function initABNSheetObjetos(global) {
  const DISPLAY_LIMIT = 5;

  const state = {
    rows: [],
    activeTypeFilter: "all",
    context: {
      sheetId: null,
      chronicleId: null,
      userId: null,
      playerId: null,
    },
    listenersBound: false,
  };

  const deps = {
    supabaseClient: null,
  };

  function configure(nextDeps = {}) {
    deps.supabaseClient = nextDeps.supabaseClient || global.supabase || null;
  }

  function getAdapter() {
    return global.ABNShared?.documentTypes?.get?.("objeto") || null;
  }

  function objectScreen() {
    return global.ABNShared?.objectScreen || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  const OBJECT_TYPE_LABELS = {
    arma: "Arma",
    equipo: "Equipo",
    utilidad: "Utilidad",
    consumible: "Consumible",
  };

  function getObjectTypeLabel(type) {
    return OBJECT_TYPE_LABELS[type] || type || "";
  }

  function getLists() {
    return {
      list: document.getElementById("objeto-list"),
      newBtn: document.getElementById("objeto-new-btn"),
      archiveBtn: document.getElementById("objeto-archive-btn"),
    };
  }

  function renderContextMessage(message) {
    const { list, newBtn, archiveBtn } = getLists();
    if (!list) return;

    list.innerHTML = `<p class="discipline-detail-label">${escapeHtml(message)}</p>`;
    if (newBtn) newBtn.disabled = true;
    if (archiveBtn) archiveBtn.disabled = true;
  }

  function buildObjectCard(row) {
    const card = document.createElement("article");
    card.className = "objeto-sheet-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Abrir objeto ${row.name || "sin nombre"}`);

    const locationBadge = row.location
      ? `<span class="objeto-location-badge">${escapeHtml(row.location)}</span>`
      : "";
    const tags = Array.isArray(row.tags) ? row.tags : [];
    const tagsHtml = tags.length
      ? `<div class="note-tags">${tags
          .map((tag) => `<span class="note-tag">#${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";

    card.innerHTML = `
      <div class="note-header">
        <div class="objeto-card-title-row">
          <span class="objeto-type-badge objeto-type-badge--${escapeHtml(row.object_type)}">${escapeHtml(getObjectTypeLabel(row.object_type))}</span>
          <strong class="note-title">${escapeHtml(row.name)}</strong>
        </div>
        <span class="note-date">${escapeHtml(formatDate(row.updated_at || row.created_at))}</span>
      </div>
      ${locationBadge ? `<p class="objeto-location-row">${locationBadge}</p>` : ""}
      ${tagsHtml}
    `;

    const open = () => openObjectViewer(row.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    return card;
  }

  function getFilteredRows() {
    const active = state.rows.filter((row) => !row.is_archived);
    if (state.activeTypeFilter === "all") return active;
    return active.filter((row) => row.object_type === state.activeTypeFilter);
  }

  function renderObjects() {
    const { list, newBtn, archiveBtn } = getLists();
    if (!list) return;

    if (newBtn) newBtn.disabled = false;
    if (archiveBtn) archiveBtn.disabled = !state.context.chronicleId;

    const filtered = getFilteredRows();

    list.innerHTML = "";

    if (!filtered.length) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.textContent = state.activeTypeFilter === "all"
        ? "No hay objetos activos."
        : `No hay objetos de tipo ${getObjectTypeLabel(state.activeTypeFilter)}.`;
      list.appendChild(empty);
      return;
    }

    const visible = filtered.slice(0, DISPLAY_LIMIT);
    visible.forEach((row) => list.appendChild(buildObjectCard(row)));

    if (filtered.length > DISPLAY_LIMIT) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "objeto-view-archive-btn";
      moreBtn.textContent = `Ver archivo completo (${filtered.length} objetos)`;
      moreBtn.addEventListener("click", () => navigateToArchive());
      list.appendChild(moreBtn);
    }

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [list] });
    }
  }

  function setActiveTypeFilter(nextType) {
    state.activeTypeFilter = OBJECT_TYPE_LABELS[nextType] ? nextType : "all";
    const filters = document.querySelectorAll(".objeto-type-filter");
    filters.forEach((btn) => {
      const isActive = btn.getAttribute("data-type") === state.activeTypeFilter;
      btn.classList.toggle("active", isActive);
    });
    renderObjects();
  }

  function buildAdapterContext() {
    return {
      chronicleId: state.context.chronicleId,
      characterSheetId: state.context.sheetId,
      currentPlayerId: state.context.playerId,
      isNarrator: false,
    };
  }

  async function resolveContext() {
    const supabase = deps.supabaseClient;
    if (!supabase) return { error: new Error("Supabase no disponible") };

    if (!state.context.userId) {
      const { user } = await global.abnGetCurrentUser({ retries: 2, delayMs: 120 });
      state.context.userId = user?.id || null;
    }

    if (!state.context.userId) {
      return { error: new Error("Usuario no autenticado") };
    }

    if (!state.context.playerId) {
      const { data: player, error: playerErr } = await supabase
        .from("players")
        .select("id")
        .eq("user_id", state.context.userId)
        .maybeSingle();
      if (playerErr || !player?.id) {
        return { error: playerErr || new Error("No se encontró player para el usuario.") };
      }
      state.context.playerId = player.id;
    }

    if (!state.context.chronicleId) {
      state.context.chronicleId = localStorage.getItem("currentChronicleId") || null;
    }

    if (!state.context.chronicleId && state.context.sheetId) {
      const { data: row, error: chronicleErr } = await supabase
        .from("chronicle_characters")
        .select("chronicle_id")
        .eq("character_sheet_id", state.context.sheetId)
        .limit(1)
        .maybeSingle();
      if (chronicleErr) {
        return { error: chronicleErr };
      }
      state.context.chronicleId = row?.chronicle_id || null;
    }

    if (!state.context.chronicleId) {
      return {
        error: new Error("Esta hoja no está asociada a una crónica activa."),
      };
    }

    return { error: null };
  }

  async function refresh() {
    const { error: contextError } = await resolveContext();
    if (contextError) {
      renderContextMessage(contextError.message || "No se pudieron cargar los objetos.");
      return;
    }

    if (!state.context.sheetId) {
      renderContextMessage("No se pudo determinar el personaje.");
      return;
    }

    const adapter = getAdapter();
    if (!adapter?.fetchRows) {
      renderContextMessage("Tipo de documento no disponible.");
      return;
    }

    const rows = await adapter.fetchRows(buildAdapterContext());
    state.rows = Array.isArray(rows) ? rows : [];
    renderObjects();
  }

  function openObjectViewer(objectId) {
    const screen = objectScreen();
    if (!screen?.showForPlayer) return;

    screen.showForPlayer({
      objectId,
      characterSheetId: state.context.sheetId,
      onSaved: () => refresh(),
    });
  }

  async function openObjectForm(objectId) {
    const screen = objectScreen();
    if (!screen) return;

    const object = objectId != null
      ? state.rows.find((o) => String(o.id) === String(objectId)) || null
      : null;

    const supabase = deps.supabaseClient;
    const locationSuggestions = supabase && state.context.sheetId
      ? await (screen.fetchLocationSuggestions?.(supabase, state.context.sheetId) || [])
      : [];

    screen.openForm({
      object,
      title: object ? "Editar Objeto" : "Nuevo Objeto",
      locationSuggestions,
      persistence: {
        type: "character-object",
        supabase: deps.supabaseClient,
        chronicleId: state.context.chronicleId,
        characterSheetId: state.context.sheetId,
        playerId: state.context.playerId,
        errorMessagePrefix: "No se pudo guardar el objeto",
      },
      onSaved: async ({ objectId: targetId }) => {
        await refresh();
        if (targetId != null) {
          openObjectViewer(targetId);
        }
      },
      onCancel: (currentObject) => {
        if (currentObject?.id != null) {
          openObjectViewer(currentObject.id);
        }
      },
    });
  }

  function navigateToArchive() {
    if (!state.context.chronicleId || !state.context.sheetId) return;
    const hash = `document-archive?id=${encodeURIComponent(state.context.chronicleId)}&type=objeto&charId=${encodeURIComponent(state.context.sheetId)}`;
    window.parent?.location
      ? (window.parent.location.hash = hash)
      : (window.location.hash = hash);
  }

  function bindListeners() {
    if (state.listenersBound) return;

    const newBtn = document.getElementById("objeto-new-btn");
    const archiveBtn = document.getElementById("objeto-archive-btn");

    const typeFilters = document.querySelectorAll(".objeto-type-filter");
    typeFilters.forEach((btn) => {
      btn.addEventListener("click", () => {
        setActiveTypeFilter(btn.getAttribute("data-type") || "all");
      });
    });

    newBtn?.addEventListener("click", () => {
      void openObjectForm(null);
    });

    archiveBtn?.addEventListener("click", () => navigateToArchive());

    state.listenersBound = true;
  }

  async function init() {
    bindListeners();
    await refresh();
  }

  function setContext(context = {}) {
    if (typeof context.sheetId === "string") {
      state.context.sheetId = context.sheetId;
    }

    if (typeof context.chronicleId === "string") {
      state.context.chronicleId = context.chronicleId;
    }

    if (typeof context.userId === "string") {
      state.context.userId = context.userId;
      state.context.playerId = null;
    }
  }

  global.ABNSheetObjetos = {
    configure,
    init,
    setContext,
    refresh,
    renderObjects,
  };
})(window);
