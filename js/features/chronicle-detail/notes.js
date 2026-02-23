(function initChronicleDetailNotes(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  function stripMarkdown(text) {
    return (text || "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
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

  async function init(config) {
    const {
      chronicleId,
      sessionUserId,
      myChars,
      noteReaderModal,
      noteFormModal,
    } = config;

    const NOTES_PAGE = 5;
    let notesShown = 0;
    let allNotes = [];
    let filteredNotes = [];
    let notesQuery = "";
    let showingArchived = false;

    let currentReaderNoteId = null;
    let editingNoteId = null;
    let editingNoteSheetId = null;
    let noteFormCharIdx = 0;

    const notasList = document.getElementById("cd-notas-list");
    const notasMoreBtn = document.getElementById("cd-notas-more");
    const addNoteBtn = document.getElementById("cd-add-note");
    const notesSearchInput = document.getElementById("cd-notes-search");
    const notesArchiveToggle = document.getElementById("cd-notes-archive-toggle");

    const noteReaderOverlay = document.getElementById("modal-note-reader");
    const noteReaderTitle = document.getElementById("note-reader-title");
    const noteReaderChar = document.getElementById("note-reader-char");
    const noteReaderTags = document.getElementById("note-reader-tags");
    const noteReaderText = document.getElementById("note-reader-text");
    const noteReaderPrev = document.getElementById("note-reader-prev");
    const noteReaderNext = document.getElementById("note-reader-next");
    const noteReaderArchived = document.getElementById("note-reader-archived");

    const noteFormOverlay = document.getElementById("modal-note-form");
    const noteFormHeading = document.getElementById("note-form-heading");
    const noteFormTitle = document.getElementById("note-form-title");
    const noteFormTags = document.getElementById("note-form-tags");
    const noteFormBody = document.getElementById("note-form-body");
    const noteFormSave = document.getElementById("note-form-save");
    const noteFormCharChip = document.getElementById("note-form-char-chip");
    const noteFormCharName = document.getElementById("note-form-char-name");
    const noteFormArchiveRow = document.getElementById("note-form-archive-row");
    const noteFormArchived = document.getElementById("note-form-archived");

    if (!notasList || !notasMoreBtn || !addNoteBtn) return;

    function collectNotes() {
      allNotes = [];
      myChars.forEach((sheet) => {
        const notes = (sheet.data?.notes || []).filter((n) =>
          showingArchived ? !!n.archived : !n.archived
        );
        notes.forEach((note) => {
          allNotes.push({
            ...note,
            characterName: sheet.name,
            sheetId: sheet.id,
          });
        });
      });
      allNotes.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    }

    function renderNoteCard(note) {
      const plain = stripMarkdown(note.body);
      const truncated =
        plain.length > 150 ? plain.substring(0, 150) + "…" : plain;
      const tagsHtml =
        note.tags && note.tags.length
          ? `<div class="cd-note-tags-row">${note.tags
              .map((t) => `<span class="cd-note-tag">${escapeHtml(t)}</span>`)
              .join("")}</div>`
          : "";

      const card = document.createElement("div");
      card.className = "cd-note-card";
      card.dataset.noteId = note.id;
      card.dataset.sheetId = note.sheetId;
      card.innerHTML = `
        <div class="cd-note-header">
          <span class="cd-note-title">${escapeHtml(note.title)}</span>
          <span class="cd-note-char-badge">${escapeHtml(note.characterName)}</span>
        </div>
        ${tagsHtml}
        ${truncated ? `<p class="cd-note-body">${escapeHtml(truncated)}</p>` : ""}
        <span class="cd-note-date">${formatRelativeDate(
          note.updatedAt || note.createdAt
        )}</span>
      `;
      card.addEventListener("click", () => openNoteReader(note.id));
      return card;
    }

    function filterNotes() {
      if (!notesQuery) {
        filteredNotes = allNotes;
        return;
      }
      const q = notesQuery.toLowerCase();
      filteredNotes = allNotes.filter(
        (n) =>
          (n.title && n.title.toLowerCase().includes(q)) ||
          (n.body && n.body.toLowerCase().includes(q)) ||
          (n.characterName && n.characterName.toLowerCase().includes(q)) ||
          (n.tags && n.tags.some((t) => t.toLowerCase().includes(q)))
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

    function updateNoteReaderNav() {
      const idx = allNotes.findIndex((n) => n.id === currentReaderNoteId);
      if (noteReaderPrev) noteReaderPrev.disabled = idx >= allNotes.length - 1;
      if (noteReaderNext) noteReaderNext.disabled = idx <= 0;
    }

    function openNoteReader(noteId) {
      const note = allNotes.find((n) => n.id === noteId);
      if (!note) return;
      currentReaderNoteId = noteId;

      noteReaderTitle.textContent = note.title;
      noteReaderChar.textContent = note.characterName;
      noteReaderArchived.checked = !!note.archived;

      noteReaderTags.innerHTML = "";
      if (note.tags && note.tags.length) {
        note.tags.forEach((tag) => {
          const pill = document.createElement("span");
          pill.className = "cd-note-tag";
          pill.textContent = tag;
          noteReaderTags.appendChild(pill);
        });
      }

      noteReaderText.innerHTML = renderMarkdown(note.body || "");
      updateNoteReaderNav();
      noteReaderModal.open();
      if (window.lucide) {
        lucide.createIcons({ nodes: [noteReaderOverlay] });
      }
    }

    function closeNoteReader() {
      noteReaderModal.close();
      currentReaderNoteId = null;
    }

    function updateCharChip() {
      if (!myChars.length) return;
      const sheet = myChars[noteFormCharIdx];
      noteFormCharName.textContent = sheet.name;
      editingNoteSheetId = sheet.id;

      if (myChars.length > 1) {
        noteFormCharChip.classList.add("clickable");
      } else {
        noteFormCharChip.classList.remove("clickable");
      }
    }

    function openNoteForm(note) {
      if (note) {
        editingNoteId = note.id;
        editingNoteSheetId = note.sheetId;
        noteFormHeading.textContent = "Editar Nota";
        noteFormTitle.value = note.title || "";
        noteFormTags.value = (note.tags || []).join(", ");
        noteFormBody.value = note.body || "";
        noteFormArchived.checked = !!note.archived;
        noteFormArchiveRow.classList.remove("hidden");

        const charIdx = myChars.findIndex((c) => c.id === note.sheetId);
        noteFormCharIdx = charIdx >= 0 ? charIdx : 0;
      } else {
        editingNoteId = null;
        noteFormHeading.textContent = "Nueva Nota";
        noteFormTitle.value = "";
        noteFormTags.value = "";
        noteFormBody.value = "";
        noteFormArchived.checked = false;
        noteFormArchiveRow.classList.add("hidden");
        noteFormCharIdx = 0;
      }

      updateCharChip();
      noteFormModal.open();
      noteFormTitle.focus();
      if (window.lucide) {
        lucide.createIcons({ nodes: [noteFormOverlay] });
      }
    }

    function closeNoteForm() {
      noteFormModal.close();
      editingNoteId = null;
      editingNoteSheetId = null;
    }

    async function refreshNotes() {
      const { data: freshChars } = await supabase
        .from("chronicle_characters")
        .select(
          "character_sheet_id, character_sheet:character_sheets(id, name, data, avatar_url, user_id)"
        )
        .eq("chronicle_id", chronicleId);

      myChars.length = 0;
      (freshChars || []).forEach((row) => {
        const sheet = row.character_sheet;
        if (sheet && sheet.user_id === sessionUserId) {
          myChars.push(sheet);
        }
      });

      collectNotes();
      renderNotesList();
    }

    async function persistNoteForm() {
      const title = noteFormTitle.value.trim();
      if (!title) {
        alert("El título es obligatorio.");
        return;
      }
      if (!editingNoteSheetId) {
        alert("No hay personaje seleccionado.");
        return;
      }

      const tagsRaw = noteFormTags.value.trim();
      const tags = tagsRaw
        ? tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean)
        : [];
      const body = noteFormBody.value.trim() || "";

      noteFormSave.disabled = true;
      noteFormSave.textContent = "Guardando...";

      const { data: sheet, error: readErr } = await supabase
        .from("character_sheets")
        .select("data")
        .eq("id", editingNoteSheetId)
        .maybeSingle();

      if (readErr || !sheet) {
        alert(
          "Error al leer el personaje: " + (readErr?.message || "no encontrado")
        );
        noteFormSave.disabled = false;
        noteFormSave.textContent = "Guardar";
        return;
      }

      const sheetData = sheet.data || {};
      const notes = sheetData.notes || [];

      if (editingNoteId) {
        const target = notes.find((n) => n.id === editingNoteId);
        if (target) {
          target.title = title;
          target.body = body;
          target.tags = tags;
          target.archived = noteFormArchived.checked;
          target.updatedAt = new Date().toISOString();
        }
      } else {
        notes.push({
          id: Date.now(),
          title,
          body,
          tags,
          createdAt: new Date().toISOString(),
          archived: false,
        });
      }

      const { error: writeErr } = await supabase
        .from("character_sheets")
        .update({ data: { ...sheetData, notes } })
        .eq("id", editingNoteSheetId);

      noteFormSave.disabled = false;
      noteFormSave.textContent = "Guardar";

      if (writeErr) {
        alert("Error al guardar: " + writeErr.message);
        return;
      }

      closeNoteForm();
      await refreshNotes();
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
        collectNotes();
        renderNotesList();
      });
    }

    if (notasMoreBtn) {
      notasMoreBtn.addEventListener("click", showNotes);
    }

    noteReaderPrev.addEventListener("click", () => {
      const idx = allNotes.findIndex((n) => n.id === currentReaderNoteId);
      if (idx < allNotes.length - 1) {
        openNoteReader(allNotes[idx + 1].id);
      }
    });

    noteReaderNext.addEventListener("click", () => {
      const idx = allNotes.findIndex((n) => n.id === currentReaderNoteId);
      if (idx > 0) {
        openNoteReader(allNotes[idx - 1].id);
      }
    });

    const noteEditBtn = document.getElementById("note-reader-edit");
    if (noteEditBtn) {
      noteEditBtn.addEventListener("click", () => {
        const note = allNotes.find((n) => n.id === currentReaderNoteId);
        if (!note) return;
        closeNoteReader();
        openNoteForm(note);
      });
    }

    noteReaderArchived?.addEventListener("change", async () => {
      const note = allNotes.find((n) => n.id === currentReaderNoteId);
      if (!note) return;

      const newVal = noteReaderArchived.checked;
      noteReaderArchived.disabled = true;

      const { data: sheet, error: readErr } = await supabase
        .from("character_sheets")
        .select("data")
        .eq("id", note.sheetId)
        .maybeSingle();

      if (readErr || !sheet) {
        noteReaderArchived.checked = !newVal;
        noteReaderArchived.disabled = false;
        return;
      }

      const sheetData = sheet.data || {};
      const notes = sheetData.notes || [];
      const target = notes.find((n) => n.id === note.id);
      if (target) {
        target.archived = newVal;
      }

      const { error: writeErr } = await supabase
        .from("character_sheets")
        .update({ data: { ...sheetData, notes } })
        .eq("id", note.sheetId);

      noteReaderArchived.disabled = false;

      if (writeErr) {
        noteReaderArchived.checked = !newVal;
        return;
      }

      closeNoteReader();
      await refreshNotes();
    });

    const noteDeleteBtn = document.getElementById("note-reader-delete");
    if (noteDeleteBtn) {
      noteDeleteBtn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar esta nota? Esta acción no se puede deshacer.")) {
          return;
        }

        const note = allNotes.find((n) => n.id === currentReaderNoteId);
        if (!note) return;

        const { data: sheet, error: readErr } = await supabase
          .from("character_sheets")
          .select("data")
          .eq("id", note.sheetId)
          .maybeSingle();

        if (readErr || !sheet) {
          alert(
            "Error al leer el personaje: " + (readErr?.message || "no encontrado")
          );
          return;
        }

        const sheetData = sheet.data || {};
        const notes = sheetData.notes || [];
        const target = notes.find((n) => n.id === note.id);
        if (target) {
          target.archived = true;
        }

        const { error: writeErr } = await supabase
          .from("character_sheets")
          .update({ data: { ...sheetData, notes } })
          .eq("id", note.sheetId);

        if (writeErr) {
          alert("Error al eliminar: " + writeErr.message);
          return;
        }

        closeNoteReader();
        await refreshNotes();
      });
    }

    noteFormCharChip?.addEventListener("click", () => {
      if (myChars.length <= 1) return;
      noteFormCharIdx = (noteFormCharIdx + 1) % myChars.length;
      updateCharChip();
    });

    noteFormSave?.addEventListener("click", persistNoteForm);

    addNoteBtn.addEventListener("click", () => {
      if (!myChars.length) {
        alert("Necesitás tener un personaje en esta crónica para crear notas.");
        return;
      }
      openNoteForm(null);
    });

    collectNotes();
    renderNotesList();

    return {
      refreshNotes,
    };
  }

  ns.notes = {
    init,
  };
})(window);
