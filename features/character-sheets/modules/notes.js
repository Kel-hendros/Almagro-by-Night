(function initABNSheetNotes(global) {
  const state = {
    notes: [],
    nextId: 1,
    editingId: null,
  };

  const deps = {
    save: null,
  };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function noteFormatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  function noteParseTags(raw) {
    return raw
      .split(",")
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);
  }

  function noteResetForm() {
    const form = document.getElementById("note-form");
    const titleInput = document.getElementById("note-title");
    const bodyInput = document.getElementById("note-body");
    const tagsInput = document.getElementById("note-tags");
    const saveBtn = document.getElementById("note-save-btn");
    if (!form) return;

    state.editingId = null;
    form.classList.add("hidden");
    if (titleInput) titleInput.value = "";
    if (bodyInput) bodyInput.value = "";
    if (tagsInput) tagsInput.value = "";
    if (saveBtn) saveBtn.textContent = "Guardar nota";
  }

  function noteOpenEditForm(note) {
    const form = document.getElementById("note-form");
    const titleInput = document.getElementById("note-title");
    const bodyInput = document.getElementById("note-body");
    const tagsInput = document.getElementById("note-tags");
    const saveBtn = document.getElementById("note-save-btn");
    if (!form || !titleInput || !bodyInput || !tagsInput || !saveBtn) return;

    state.editingId = note.id;
    titleInput.value = note.title;
    bodyInput.value = note.body;
    tagsInput.value = note.tags.join(", ");
    saveBtn.textContent = "Guardar cambios";
    form.classList.remove("hidden");
    titleInput.focus();
  }

  function buildNoteCard(note) {
    const card = document.createElement("article");
    card.className = "note-card";

    const header = document.createElement("div");
    header.className = "note-header";

    const title = document.createElement("strong");
    title.className = "note-title";
    title.textContent = note.title;

    const date = document.createElement("span");
    date.className = "note-date";
    date.textContent = noteFormatDate(note.createdAt);

    header.appendChild(title);
    header.appendChild(date);

    const body = document.createElement("p");
    body.className = "note-body";
    body.textContent = note.body;

    const tags = document.createElement("div");
    tags.className = "note-tags";
    note.tags.forEach((tag) => {
      const chip = document.createElement("span");
      chip.className = "note-tag";
      chip.textContent = `#${tag}`;
      tags.appendChild(chip);
    });

    const actions = document.createElement("div");
    actions.className = "note-actions";

    const editBtn = document.createElement("button");
    editBtn.type = "button";
    editBtn.className = "btn-icon note-action-btn--icon";
    editBtn.title = "Editar nota";
    editBtn.setAttribute("aria-label", "Editar nota");
    editBtn.innerHTML = '<i data-lucide="pencil"></i>';
    editBtn.addEventListener("click", () => noteOpenEditForm(note));

    const archiveBtn = document.createElement("button");
    archiveBtn.type = "button";
    archiveBtn.className = "btn-icon note-action-btn--icon";
    archiveBtn.title = note.archived ? "Desarchivar nota" : "Archivar nota";
    archiveBtn.setAttribute(
      "aria-label",
      note.archived ? "Desarchivar nota" : "Archivar nota"
    );
    archiveBtn.innerHTML = note.archived
      ? '<i data-lucide="archive-restore"></i>'
      : '<i data-lucide="archive"></i>';
    archiveBtn.addEventListener("click", () => {
      note.archived = !note.archived;
      renderNotes();
      persist();
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.type = "button";
    deleteBtn.className = "btn-icon btn-icon--danger note-action-btn--icon";
    deleteBtn.title = "Eliminar nota";
    deleteBtn.setAttribute("aria-label", "Eliminar nota");
    deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
    deleteBtn.addEventListener("click", () => {
      const idx = state.notes.findIndex((n) => n.id === note.id);
      if (idx !== -1) state.notes.splice(idx, 1);
      if (state.editingId === note.id) noteResetForm();
      renderNotes();
      persist();
    });

    const editDeleteButtons = document.createElement("div");
    editDeleteButtons.className = "edit-delete-buttons";
    editDeleteButtons.append(editBtn, deleteBtn);

    actions.append(archiveBtn, editDeleteButtons);

    card.appendChild(header);
    card.appendChild(body);
    if (note.tags.length > 0) card.appendChild(tags);
    card.appendChild(actions);
    return card;
  }

  function renderNoteSection(parent, collection, emptyLabel) {
    parent.innerHTML = "";
    if (collection.length === 0) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.textContent = emptyLabel;
      parent.appendChild(empty);
      return;
    }
    collection.forEach((note) => parent.appendChild(buildNoteCard(note)));
  }

  function renderNotes() {
    const searchInput = document.getElementById("note-search");
    const list = document.getElementById("note-list");
    const archiveList = document.getElementById("note-archive-list");
    if (!list || !archiveList) return;

    const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
    const filtered = state.notes.filter((note) => {
      if (!term) return true;
      const haystack =
        `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase();
      return haystack.includes(term);
    });

    const active = filtered.filter((n) => !n.archived);
    const archived = filtered.filter((n) => n.archived);

    renderNoteSection(list, active, "No hay notas activas.");
    renderNoteSection(archiveList, archived, "No hay notas archivadas.");

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [list, archiveList] });
    }

    const activeTab = document.querySelector('[data-note-tab="active"]');
    const archivedTab = document.querySelector('[data-note-tab="archived"]');
    if (activeTab) {
      activeTab.textContent = `Activas${active.length ? ` (${active.length})` : ""}`;
    }
    if (archivedTab) {
      archivedTab.textContent = `Archivadas${archived.length ? ` (${archived.length})` : ""}`;
    }
  }

  function init() {
    const newBtn = document.getElementById("note-new-btn");
    const form = document.getElementById("note-form");
    const cancelBtn = document.getElementById("note-cancel-btn");
    const searchInput = document.getElementById("note-search");
    const titleInput = document.getElementById("note-title");
    const bodyInput = document.getElementById("note-body");
    const tagsInput = document.getElementById("note-tags");
    if (!newBtn || !form || !titleInput || !bodyInput || !tagsInput) return;

    const noteTabs = document.querySelectorAll(".note-tab");
    const noteList = document.getElementById("note-list");
    const noteArchiveList = document.getElementById("note-archive-list");
    noteTabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        noteTabs.forEach((t) => t.classList.remove("active"));
        tab.classList.add("active");
        const which = tab.getAttribute("data-note-tab");
        if (which === "active") {
          noteList.classList.remove("hidden");
          noteArchiveList.classList.add("hidden");
        } else {
          noteList.classList.add("hidden");
          noteArchiveList.classList.remove("hidden");
        }
      });
    });

    newBtn.addEventListener("click", () => {
      if (form.classList.contains("hidden")) {
        state.editingId = null;
        titleInput.value = "";
        bodyInput.value = "";
        tagsInput.value = "";
        const saveBtn = document.getElementById("note-save-btn");
        if (saveBtn) saveBtn.textContent = "Guardar nota";
        form.classList.remove("hidden");
        titleInput.focus();
      } else {
        noteResetForm();
      }
    });

    cancelBtn?.addEventListener("click", noteResetForm);
    searchInput?.addEventListener("input", renderNotes);

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const title = titleInput.value.trim();
      const body = bodyInput.value.trim();
      const tags = noteParseTags(tagsInput.value);
      if (!title || !body) return;

      if (state.editingId !== null) {
        const note = state.notes.find((n) => n.id === state.editingId);
        if (note) {
          note.title = title;
          note.body = body;
          note.tags = tags;
        }
      } else {
        state.notes.unshift({
          id: state.nextId++,
          title,
          body,
          tags,
          createdAt: new Date().toISOString(),
          archived: false,
        });
      }

      noteResetForm();
      renderNotes();
      persist();
    });
  }

  function serialize() {
    return state.notes.map((n) => ({
      id: n.id,
      title: n.title,
      body: n.body,
      tags: n.tags,
      createdAt: n.createdAt,
      archived: n.archived,
    }));
  }

  function loadFromCharacterData(characterData) {
    state.notes = [];
    state.nextId = 1;
    if (characterData?.notes && Array.isArray(characterData.notes)) {
      characterData.notes.forEach((n) => {
        const note = {
          id: n.id || state.nextId,
          title: n.title || "",
          body: n.body || "",
          tags: n.tags || [],
          createdAt: n.createdAt || new Date().toISOString(),
          archived: Boolean(n.archived),
        };
        state.notes.push(note);
        if (note.id >= state.nextId) state.nextId = note.id + 1;
      });
    }
    renderNotes();
  }

  global.ABNSheetNotes = {
    configure,
    noteFormatDate,
    noteParseTags,
    noteResetForm,
    noteOpenEditForm,
    renderNotes,
    init,
    serialize,
    loadFromCharacterData,
  };
})(window);
