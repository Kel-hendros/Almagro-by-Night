(function initChronicleDetailNotes(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const NOTES_LIMIT = 5;

  function noteScreen() {
    return global.ABNShared?.noteScreen || null;
  }

  function noteAdapter() {
    return global.ABNShared?.documentTypes?.get?.("note") || null;
  }

  function documentList() {
    return global.ABNShared?.documentList || null;
  }

  function buildNoteContext(chronicleId, currentPlayerId) {
    return {
      chronicleId,
      currentPlayerId,
      isNarrator: false,
      excludeArchived: true,
    };
  }

  async function init(config) {
    const { chronicleId, currentPlayerId } = config;

    let allNotes = [];
    let filteredNotes = [];

    let currentReaderNoteId = null;

    const notasList = document.getElementById("cd-notas-list");
    const notasMoreBtn = document.getElementById("cd-notas-more");
    const addNoteBtn = document.getElementById("cd-add-note");
    const openArchiveBtn = document.getElementById("cd-open-notes-archive");

    if (!notasList || !notasMoreBtn || !addNoteBtn) return;

    function renderNotesList() {
      filteredNotes = allNotes;
      if (!filteredNotes.length) {
        notasList.innerHTML = '<span class="cd-card-muted">No hay notas todavía.</span>';
        notasMoreBtn.classList.add("hidden");
        return;
      }

      const adapter = noteAdapter();
      const listApi = documentList();
      const visibleNotes = filteredNotes.slice(0, NOTES_LIMIT);
      if (!adapter?.buildDetailedListItemOptions || !listApi?.createItem) {
        notasList.innerHTML = `<span class="cd-card-muted">No se pudo renderizar la lista de notas.</span>`;
        notasMoreBtn.classList.add("hidden");
        return;
      }

      listApi.applyPreset?.(notasList, "complete");
      notasList.innerHTML = "";
      visibleNotes.forEach((note) => {
        const itemOptions = adapter.buildDetailedListItemOptions(
          note,
          buildNoteContext(chronicleId, currentPlayerId),
        );
        notasList.appendChild(
          listApi.createItem({
            preset: "complete",
            variant: "detailed",
            title: itemOptions.title,
            meta: itemOptions.meta,
            tagsHtml: itemOptions.tagsHtml,
            preview: itemOptions.preview,
            previewMarkdown: itemOptions.previewMarkdown,
            previewHtml: itemOptions.previewHtml,
            image: itemOptions.image,
            dataAttrs: { "document-id": note.id },
          }),
        );
      });
      notasMoreBtn.classList.add("hidden");
    }

    async function refreshNotes() {
      const adapter = noteAdapter();
      if (!adapter?.fetchRows) {
        notasList.innerHTML = '<span class="cd-card-muted">No se pudo cargar notas</span>';
        notasMoreBtn.classList.add("hidden");
        return;
      }

      allNotes = await adapter.fetchRows(buildNoteContext(chronicleId, currentPlayerId));
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

    notasMoreBtn.classList.add("hidden");

    notasList.addEventListener("click", (event) => {
      const card = event.target.closest("[data-document-id]");
      if (!card?.dataset.documentId) return;
      void openNoteReader(card.dataset.documentId);
    });

    addNoteBtn.addEventListener("click", () => {
      openNoteForm(null);
    });

    openArchiveBtn?.addEventListener("click", () => {
      window.location.hash = `document-archive?id=${encodeURIComponent(chronicleId)}&type=note`;
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
