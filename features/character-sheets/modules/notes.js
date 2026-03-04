(function initABNSheetNotes(global) {
  const state = {
    notes: [],
    activeTab: "active",
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

  function noteScreen() {
    return global.ABNShared?.noteScreen || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function noteFormatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function buildNoteSubtitle(note) {
    const date = noteFormatDate(note.updatedAt || note.createdAt);
    return note.archived ? `Archivada · ${date}` : date;
  }

  function findNoteById(noteId) {
    return state.notes.find((note) => String(note.id) === String(noteId)) || null;
  }

  function buildPreview(body, maxLen = 140) {
    const clean = markdownToPlainText(body);
    if (clean.length <= maxLen) return clean;
    return `${clean.slice(0, maxLen)}…`;
  }

  function markdownToPlainText(markdown) {
    const shared = noteScreen();
    if (typeof shared?.toPlainText === "function") {
      return shared.toPlainText(markdown);
    }
    return String(markdown || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function normalizeNoteRow(row) {
    return {
      id: row.id,
      title: row.title || "Sin título",
      body: row.body_markdown || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      archived: Boolean(row.is_archived),
      createdAt: row.created_at || new Date().toISOString(),
      updatedAt: row.updated_at || row.created_at || new Date().toISOString(),
    };
  }

  function getLists() {
    return {
      list: document.getElementById("note-list"),
      archiveList: document.getElementById("note-archive-list"),
      newBtn: document.getElementById("note-new-btn"),
    };
  }

  function renderContextMessage(message) {
    const { list, archiveList, newBtn } = getLists();
    if (!list || !archiveList) return;

    list.innerHTML = `<p class="discipline-detail-label">${escapeHtml(message)}</p>`;
    archiveList.innerHTML = "";
    if (newBtn) newBtn.disabled = true;

    const activeTab = document.querySelector('[data-note-tab="active"]');
    const archivedTab = document.querySelector('[data-note-tab="archived"]');
    if (activeTab) activeTab.textContent = "Activas";
    if (archivedTab) archivedTab.textContent = "Archivadas";
  }

  function buildNoteCard(note) {
    const card = document.createElement("article");
    card.className = "note-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", `Abrir nota ${note.title || "sin título"}`);

    const preview = buildPreview(note.body);
    const tagsHtml = (Array.isArray(note.tags) ? note.tags : []).length
      ? `<div class="note-tags">${note.tags
          .map((tag) => `<span class="note-tag">#${escapeHtml(tag)}</span>`)
          .join("")}</div>`
      : "";

    card.innerHTML = `
      <div class="note-header">
        <strong class="note-title">${escapeHtml(note.title || "Sin título")}</strong>
        <span class="note-date">${escapeHtml(noteFormatDate(note.updatedAt || note.createdAt))}</span>
      </div>
      ${preview ? `<p class="note-body">${escapeHtml(preview)}</p>` : ""}
      ${tagsHtml}
    `;

    const open = () => openNoteViewer(note.id);
    card.addEventListener("click", open);
    card.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    return card;
  }

  function renderNoteSection(parent, collection, emptyLabel) {
    parent.innerHTML = "";
    if (!collection.length) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.textContent = emptyLabel;
      parent.appendChild(empty);
      return;
    }
    collection.forEach((note) => parent.appendChild(buildNoteCard(note)));
  }

  function renderNotes() {
    const { list, archiveList, newBtn } = getLists();
    if (!list || !archiveList) return;

    if (newBtn) newBtn.disabled = false;

    const { active, archived } = getFilteredNotesByTab();

    renderNoteSection(list, active, "No hay notas activas.");
    renderNoteSection(archiveList, archived, "No hay notas archivadas.");

    const activeTab = document.querySelector('[data-note-tab="active"]');
    const archivedTab = document.querySelector('[data-note-tab="archived"]');
    if (activeTab) {
      activeTab.textContent = `Activas${active.length ? ` (${active.length})` : ""}`;
    }
    if (archivedTab) {
      archivedTab.textContent = `Archivadas${archived.length ? ` (${archived.length})` : ""}`;
    }

    list.classList.toggle("hidden", state.activeTab !== "active");
    archiveList.classList.toggle("hidden", state.activeTab !== "archived");

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [list, archiveList] });
    }
  }

  function getFilteredNotesByTab() {
    const searchInput = document.getElementById("note-search");
    const term = searchInput ? searchInput.value.trim().toLowerCase() : "";

    const filtered = state.notes.filter((note) => {
      if (!term) return true;
      const haystack = `${note.title} ${note.body} ${(note.tags || []).join(" ")}`.toLowerCase();
      return haystack.includes(term);
    });

    return {
      active: filtered.filter((note) => !note.archived),
      archived: filtered.filter((note) => note.archived),
    };
  }

  function getCurrentViewerSequence() {
    const { active, archived } = getFilteredNotesByTab();
    return state.activeTab === "archived" ? archived : active;
  }

  function setActiveTab(nextTab) {
    state.activeTab = nextTab === "archived" ? "archived" : "active";
    const tabs = document.querySelectorAll(".note-tab");
    tabs.forEach((tab) => {
      const isActive = tab.getAttribute("data-note-tab") === state.activeTab;
      tab.classList.toggle("active", isActive);
    });
    renderNotes();
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
        error: new Error("Esta hoja no está asociada a una crónica activa para gestionar notas."),
      };
    }

    return { error: null };
  }

  async function refresh() {
    const { error: contextError } = await resolveContext();
    if (contextError) {
      renderContextMessage(contextError.message || "No se pudieron cargar las notas.");
      return;
    }

    const supabase = deps.supabaseClient;
    const { data, error } = await supabase
      .from("chronicle_notes")
      .select("id, title, body_markdown, tags, is_archived, created_at, updated_at")
      .eq("chronicle_id", state.context.chronicleId)
      .eq("player_id", state.context.playerId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("sheet.notes.refresh:", error);
      renderContextMessage("Error al cargar notas de la crónica.");
      return;
    }

    state.notes = (data || []).map(normalizeNoteRow);
    renderNotes();
  }

  async function archiveNote(note, archivedValue) {
    const supabase = deps.supabaseClient;
    const { error } = await supabase
      .from("chronicle_notes")
      .update({
        is_archived: archivedValue,
        updated_at: new Date().toISOString(),
      })
      .eq("id", note.id)
      .eq("chronicle_id", state.context.chronicleId)
      .eq("player_id", state.context.playerId);

    if (error) {
      global.alert("No se pudo actualizar la nota: " + error.message);
      return false;
    }
    return true;
  }

  async function deleteNote(note) {
    const supabase = deps.supabaseClient;
    const { error } = await supabase
      .from("chronicle_notes")
      .delete()
      .eq("id", note.id)
      .eq("chronicle_id", state.context.chronicleId)
      .eq("player_id", state.context.playerId);

    if (error) {
      global.alert("No se pudo eliminar la nota: " + error.message);
      return false;
    }
    return true;
  }

  function openNoteViewer(noteId) {
    const sharedNotes = noteScreen();
    const note = findNoteById(noteId);
    if (!sharedNotes || !note) return;

    sharedNotes.openViewer({
      note,
      title: note.title || "Nota",
      subtitle: (currentNote) => buildNoteSubtitle(currentNote),
      tags: Array.isArray(note.tags) ? note.tags : [],
      sequence: getCurrentViewerSequence(),
      onNavigate: (nextId) => {
        if (!nextId) return;
        openNoteViewer(nextId);
      },
      onEdit: () => openNoteForm(note.id),
      onToggleArchive: async (row, nextArchived) => {
        const ok = await archiveNote(row, nextArchived);
        if (!ok) return;
        await refresh();
        return true;
      },
      onDelete: async (row) => {
        const ok = global.confirm("¿Eliminar esta nota? Esta acción no se puede deshacer.");
        if (!ok) return;
        const removed = await deleteNote(row);
        if (!removed) return;
        await refresh();
        global.ABNShared?.documentScreen?.close?.();
      },
    });
  }

  function openNoteForm(noteId) {
    const sharedNotes = noteScreen();
    if (!sharedNotes) return;

    const note = noteId != null ? findNoteById(noteId) : null;

    sharedNotes.openForm({
      note,
      title: note ? "Editar Nota" : "Nueva Nota",
      tagsLowercase: true,
      persistence: {
        type: "chronicle-note",
        supabase: deps.supabaseClient,
        chronicleId: state.context.chronicleId,
        playerId: state.context.playerId,
        errorMessagePrefix: "No se pudo guardar la nota",
      },
      onSaved: async ({ noteId: targetId }) => {
        await refresh();
        if (targetId != null) {
          openNoteViewer(targetId);
        }
      },
      onCancel: (currentNote) => {
        if (currentNote?.id != null) {
          openNoteViewer(currentNote.id);
        }
      },
    });
  }

  function bindListeners() {
    if (state.listenersBound) return;

    const newBtn = document.getElementById("note-new-btn");
    const searchInput = document.getElementById("note-search");

    const noteTabs = document.querySelectorAll(".note-tab");
    noteTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        setActiveTab(tab.getAttribute("data-note-tab") || "active");
      });
    });

    newBtn?.addEventListener("click", () => {
      void openNoteForm(null);
    });

    searchInput?.addEventListener("input", renderNotes);

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

  global.ABNSheetNotes = {
    configure,
    init,
    setContext,
    refresh,
    renderNotes,
  };
})(window);
