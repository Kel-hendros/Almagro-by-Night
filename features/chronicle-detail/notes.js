(function initChronicleDetailNotes(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  function stripMarkdown(text) {
    const shared = noteScreen();
    if (typeof shared?.toPlainText === "function") {
      return shared.toPlainText(text);
    }
    return String(text || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatRelativeDate(isoStr) {
    if (!isoStr) return "";
    const d = new Date(isoStr);
    const now = new Date();
    const diffDays = Math.floor((now - d) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Editada hoy";
    if (diffDays === 1) return "Editada ayer";
    if (diffDays < 30) return `Editada hace ${diffDays} días`;
    const mn = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${d.getDate()} ${mn[d.getMonth()]} ${d.getFullYear()}`;
  }

  function noteScreen() {
    return global.ABNShared?.noteScreen || null;
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

  async function init(config) {
    const { chronicleId, currentPlayerId } = config;

    const NOTES_PAGE = 5;
    let notesShown = 0;
    let allNotes = [];
    let filteredNotes = [];
    let notesQuery = "";
    let showingArchived = false;

    let currentReaderNoteId = null;

    const notasList = document.getElementById("cd-notas-list");
    const notasMoreBtn = document.getElementById("cd-notas-more");
    const addNoteBtn = document.getElementById("cd-add-note");
    const notesSearchInput = document.getElementById("cd-notes-search");
    const notesArchiveToggle = document.getElementById("cd-notes-archive-toggle");

    if (!notasList || !notasMoreBtn || !addNoteBtn) return;

    function renderNoteCard(note) {
      const plain = stripMarkdown(note.body);
      const truncated = plain.length > 150 ? plain.substring(0, 150) + "…" : plain;
      const tagsHtml =
        note.tags && note.tags.length
          ? `<div class="cd-note-tags-row">${note.tags
              .map((tag) => `<span class="cd-note-tag">${escapeHtml(tag)}</span>`)
              .join("")}</div>`
          : "";

      const card = document.createElement("div");
      card.className = "cd-note-card";
      card.dataset.noteId = note.id;
      card.innerHTML = `
        <div class="cd-note-header">
          <span class="cd-note-title">${escapeHtml(note.title)}</span>
        </div>
        ${tagsHtml}
        ${truncated ? `<p class="cd-note-body">${escapeHtml(truncated)}</p>` : ""}
        <span class="cd-note-date">${formatRelativeDate(note.updatedAt || note.createdAt)}</span>
      `;
      card.addEventListener("click", () => {
        void openNoteReader(note.id);
      });
      return card;
    }

    function filterNotes() {
      const byArchive = allNotes.filter((note) =>
        showingArchived ? !!note.archived : !note.archived,
      );

      if (!notesQuery) {
        filteredNotes = byArchive;
        return;
      }

      const q = notesQuery.toLowerCase();
      filteredNotes = byArchive.filter(
        (note) =>
          (note.title && note.title.toLowerCase().includes(q)) ||
          (note.body && note.body.toLowerCase().includes(q)) ||
          (note.tags && note.tags.some((tag) => tag.toLowerCase().includes(q))),
      );
    }

    function showNotes() {
      const batch = filteredNotes.slice(notesShown, notesShown + NOTES_PAGE);
      if (!notesShown) notasList.innerHTML = "";
      batch.forEach((note) => notasList.appendChild(renderNoteCard(note)));
      notesShown += batch.length;
      notasMoreBtn.classList.toggle("hidden", notesShown >= filteredNotes.length);
    }

    function renderNotesList() {
      notesShown = 0;
      filterNotes();
      if (!filteredNotes.length) {
        const emptyMsg = notesQuery
          ? "Sin resultados."
          : showingArchived
            ? "No hay notas archivadas."
            : "No hay notas todavía.";
        notasList.innerHTML = `<span class="cd-card-muted">${emptyMsg}</span>`;
        notasMoreBtn.classList.add("hidden");
        return;
      }
      showNotes();
    }

    async function refreshNotes() {
      const { data, error } = await supabase
        .from("chronicle_notes")
        .select("id, title, body_markdown, tags, is_archived, created_at, updated_at")
        .eq("chronicle_id", chronicleId)
        .eq("player_id", currentPlayerId)
        .order("updated_at", { ascending: false })
        .order("created_at", { ascending: false });

      if (error) {
        console.error("chronicle-detail.notes.refreshNotes:", error);
        notasList.innerHTML = '<span class="cd-card-muted">Error al cargar notas</span>';
        notasMoreBtn.classList.add("hidden");
        return;
      }

      allNotes = (data || []).map(normalizeNoteRow);
      renderNotesList();
    }

    async function setNoteArchived(note, archivedValue) {
      const { error } = await supabase
        .from("chronicle_notes")
        .update({
          is_archived: archivedValue,
          updated_at: new Date().toISOString(),
        })
        .eq("id", note.id)
        .eq("chronicle_id", chronicleId)
        .eq("player_id", currentPlayerId);

      if (error) {
        alert("Error al guardar: " + error.message);
        return false;
      }
      return true;
    }

    async function deleteNote(note) {
      const { error } = await supabase
        .from("chronicle_notes")
        .delete()
        .eq("id", note.id)
        .eq("chronicle_id", chronicleId)
        .eq("player_id", currentPlayerId);

      if (error) {
        alert("Error al eliminar: " + error.message);
        return false;
      }
      return true;
    }

    async function openNoteReader(noteId) {
      const sharedNotes = noteScreen();
      if (!sharedNotes?.showForPlayer) return;

      currentReaderNoteId = noteId;
      sharedNotes.showForPlayer({
        noteId,
        onSaved: () => refreshNotes(),
        onClosed: () => {
          currentReaderNoteId = null;
        },
      });
    }

    function openNoteForm(note) {
      const sharedNotes = noteScreen();
      if (!sharedNotes) return;

      sharedNotes.openForm({
        note,
        title: note ? "Editar Nota" : "Nueva Nota",
        persistence: {
          type: "chronicle-note",
          supabase,
          chronicleId,
          playerId: currentPlayerId,
          errorMessagePrefix: "Error al guardar",
        },
        onSaved: async ({ noteId }) => {
          await refreshNotes();
          if (noteId) {
            void openNoteReader(noteId);
          }
        },
        onCancel: (currentNote) => {
          if (currentNote?.id) {
            void openNoteReader(currentNote.id);
          }
        },
      });
    }

    if (notesSearchInput) {
      notesSearchInput.addEventListener("input", () => {
        notesQuery = notesSearchInput.value.trim();
        renderNotesList();
      });
    }

    if (notesArchiveToggle) {
      notesArchiveToggle.addEventListener("click", () => {
        showingArchived = !showingArchived;
        notesArchiveToggle.classList.toggle("active", showingArchived);
        renderNotesList();
      });
    }

    if (notasMoreBtn) {
      notasMoreBtn.addEventListener("click", showNotes);
    }

    addNoteBtn.addEventListener("click", () => {
      openNoteForm(null);
    });

    await refreshNotes();

    return {
      refreshNotes,
    };
  }

  ns.notes = {
    init,
  };
})(window);
