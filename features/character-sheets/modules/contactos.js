(function initABNSheetContactos(global) {
  var DISPLAY_LIMIT = 5;

  var state = {
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

  var deps = {
    supabaseClient: null,
  };

  function configure(nextDeps) {
    deps.supabaseClient = (nextDeps || {}).supabaseClient || global.supabase || null;
  }

  function getAdapter() {
    return global.ABNShared?.documentTypes?.get?.("contacto") || null;
  }

  function contactScreen() {
    return global.ABNShared?.contactScreen || null;
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
    var date = new Date(dateStr);
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

  var CONTACT_TYPE_LABELS = {
    mortal: "Mortal",
    animal: "Animal",
    sobrenatural: "Sobrenatural",
    otro: "Otro",
  };

  function getContactTypeLabel(type) {
    return CONTACT_TYPE_LABELS[type] || type || "";
  }

  function getLists() {
    return {
      list: document.getElementById("contacto-list"),
      newBtn: document.getElementById("contacto-new-btn"),
      archiveBtn: document.getElementById("contacto-archive-btn"),
    };
  }

  function renderContextMessage(message) {
    var els = getLists();
    if (!els.list) return;

    els.list.innerHTML = '<p class="discipline-detail-label">' + escapeHtml(message) + '</p>';
    if (els.newBtn) els.newBtn.disabled = true;
    if (els.archiveBtn) els.archiveBtn.disabled = true;
  }

  function buildContactCard(row) {
    var card = document.createElement("article");
    card.className = "objeto-sheet-card";
    card.setAttribute("role", "button");
    card.setAttribute("tabindex", "0");
    card.setAttribute("aria-label", "Abrir contacto " + (row.name || "sin nombre"));

    var tags = Array.isArray(row.tags) ? row.tags : [];
    var tagsHtml = tags.length
      ? '<div class="note-tags">' + tags
          .map(function (tag) { return '<span class="note-tag">#' + escapeHtml(tag) + '</span>'; })
          .join("") + '</div>'
      : "";

    card.innerHTML = '' +
      '<div class="note-header">' +
        '<div class="objeto-card-title-row">' +
          '<strong class="note-title">' + escapeHtml(row.name) + '</strong>' +
        '</div>' +
        '<span class="note-date">' + escapeHtml(formatDate(row.updated_at || row.created_at)) + '</span>' +
      '</div>' +
      tagsHtml;

    var open = function () { openContactViewer(row.id); };
    card.addEventListener("click", open);
    card.addEventListener("keydown", function (event) {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    return card;
  }

  function getFilteredRows() {
    var active = state.rows.filter(function (row) { return !row.is_archived; });
    if (state.activeTypeFilter === "all") return active;
    return active.filter(function (row) { return row.contact_type === state.activeTypeFilter; });
  }

  function renderContacts() {
    var els = getLists();
    if (!els.list) return;

    if (els.newBtn) els.newBtn.disabled = false;
    if (els.archiveBtn) els.archiveBtn.disabled = !state.context.chronicleId;

    var filtered = getFilteredRows();

    els.list.innerHTML = "";

    if (!filtered.length) {
      var empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.textContent = state.activeTypeFilter === "all"
        ? "No hay contactos activos."
        : "No hay contactos de tipo " + getContactTypeLabel(state.activeTypeFilter) + ".";
      els.list.appendChild(empty);
      return;
    }

    var visible = filtered.slice(0, DISPLAY_LIMIT);
    visible.forEach(function (row) { els.list.appendChild(buildContactCard(row)); });

    if (filtered.length > DISPLAY_LIMIT) {
      var moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "objeto-view-archive-btn";
      moreBtn.textContent = "Ver archivo completo (" + filtered.length + " contactos)";
      moreBtn.addEventListener("click", function () { navigateToArchive(); });
      els.list.appendChild(moreBtn);
    }

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [els.list] });
    }
  }

  function setActiveTypeFilter(nextType) {
    var valid = CONTACT_TYPE_LABELS[nextType] ? nextType : "all";
    state.activeTypeFilter = (valid === state.activeTypeFilter) ? "all" : valid;
    var filters = document.querySelectorAll("#panel-contactos .objeto-type-filter");
    filters.forEach(function (btn) {
      var isActive = btn.getAttribute("data-type") === state.activeTypeFilter;
      btn.classList.toggle("active", isActive);
    });
    renderContacts();
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
    var supabase = deps.supabaseClient;
    if (!supabase) return { error: new Error("Supabase no disponible") };

    if (!state.context.userId) {
      var result = await global.abnGetCurrentUser({ retries: 2, delayMs: 120 });
      state.context.userId = result.user?.id || null;
    }

    if (!state.context.userId) {
      return { error: new Error("Usuario no autenticado") };
    }

    if (!state.context.playerId) {
      var playerResult = await supabase
        .from("players")
        .select("id")
        .eq("user_id", state.context.userId)
        .maybeSingle();
      if (playerResult.error || !playerResult.data?.id) {
        return { error: playerResult.error || new Error("No se encontró player para el usuario.") };
      }
      state.context.playerId = playerResult.data.id;
    }

    if (!state.context.chronicleId) {
      state.context.chronicleId = localStorage.getItem("currentChronicleId") || null;
    }

    if (!state.context.chronicleId && state.context.sheetId) {
      var chronicleResult = await supabase
        .from("chronicle_characters")
        .select("chronicle_id")
        .eq("character_sheet_id", state.context.sheetId)
        .limit(1)
        .maybeSingle();
      if (chronicleResult.error) {
        return { error: chronicleResult.error };
      }
      state.context.chronicleId = chronicleResult.data?.chronicle_id || null;
    }

    if (!state.context.chronicleId) {
      return {
        error: new Error("Esta hoja no está asociada a una crónica activa."),
      };
    }

    return { error: null };
  }

  async function refresh() {
    var contextResult = await resolveContext();
    if (contextResult.error) {
      renderContextMessage(contextResult.error.message || "No se pudieron cargar los contactos.");
      return;
    }

    if (!state.context.sheetId) {
      renderContextMessage("No se pudo determinar el personaje.");
      return;
    }

    var adapter = getAdapter();
    if (!adapter?.fetchRows) {
      renderContextMessage("Tipo de documento no disponible.");
      return;
    }

    var rows = await adapter.fetchRows(buildAdapterContext());
    state.rows = Array.isArray(rows) ? rows : [];
    renderContacts();
  }

  function openContactViewer(contactId) {
    var screen = contactScreen();
    if (!screen?.showForPlayer) return;

    screen.showForPlayer({
      contactId: contactId,
      characterSheetId: state.context.sheetId,
      onSaved: function () { refresh(); },
    });
  }

  async function openContactForm(contactId) {
    var screen = contactScreen();
    if (!screen) return;

    /* Ensure context is resolved before opening form */
    await resolveContext();

    var contact = contactId != null
      ? state.rows.find(function (c) { return String(c.id) === String(contactId); }) || null
      : null;

    var mappedContact = contact ? {
      id: contact.id,
      name: contact.name,
      avatarUrl: contact.avatar_url,
      description: contact.description,
      contactType: contact.contact_type,
      vinculoSangre: contact.vinculo_sangre,
      domitor: contact.domitor,
      stats: contact.stats,
      tags: contact.tags,
      archived: contact.is_archived,
      favorite: contact.is_favorite,
    } : null;

    screen.openForm({
      contact: mappedContact,
      title: mappedContact ? "Editar Contacto" : "Nuevo Contacto",
      persistence: {
        type: "character-contact",
        supabase: deps.supabaseClient,
        chronicleId: state.context.chronicleId,
        characterSheetId: state.context.sheetId,
        playerId: state.context.playerId,
        errorMessagePrefix: "No se pudo guardar el contacto",
      },
      onSaved: async function (result) {
        await refresh();
        if (result?.contactId != null) {
          openContactViewer(result.contactId);
        }
      },
      onCancel: function (currentContact) {
        if (currentContact?.id != null) {
          openContactViewer(currentContact.id);
        }
      },
    });
  }

  function navigateToArchive() {
    if (!state.context.chronicleId || !state.context.sheetId) return;
    var hash = "document-archive?id=" + encodeURIComponent(state.context.chronicleId) + "&type=contacto&charId=" + encodeURIComponent(state.context.sheetId);
    window.parent?.location
      ? (window.parent.location.hash = hash)
      : (window.location.hash = hash);
  }

  function bindListeners() {
    if (state.listenersBound) return;

    var newBtn = document.getElementById("contacto-new-btn");
    var archiveBtn = document.getElementById("contacto-archive-btn");

    var typeFilters = document.querySelectorAll("#panel-contactos .objeto-type-filter");
    typeFilters.forEach(function (btn) {
      btn.addEventListener("click", function () {
        setActiveTypeFilter(btn.getAttribute("data-type") || "all");
      });
    });

    if (newBtn) {
      newBtn.addEventListener("click", function () {
        void openContactForm(null);
      });
    }

    if (archiveBtn) {
      archiveBtn.addEventListener("click", function () { navigateToArchive(); });
    }

    state.listenersBound = true;
  }

  async function init() {
    bindListeners();
    await refresh();
  }

  function setContext(context) {
    context = context || {};
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

  global.ABNSheetContactos = {
    configure: configure,
    init: init,
    setContext: setContext,
    refresh: refresh,
    renderContacts: renderContacts,
  };
})(window);
