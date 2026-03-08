(function initSharedNoteScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function documentScreen() {
    return root.documentScreen || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseTags(raw, { lowercase = false } = {}) {
    return String(raw || "")
      .split(",")
      .map((tag) => (lowercase ? tag.trim().toLowerCase() : tag.trim()))
      .filter(Boolean);
  }

  function renderMarkdown(markdown) {
    const raw = String(markdown || "");
    if (typeof global.renderMarkdown === "function") {
      return global.renderMarkdown(raw);
    }
    if (global.marked?.parse) {
      const html = global.marked.parse(raw);
      if (global.DOMPurify?.sanitize) return global.DOMPurify.sanitize(html);
      return html;
    }
    return raw ? `<p>${escapeHtml(raw).replace(/\n/g, "<br>")}</p>` : "<p></p>";
  }

  function toPlainText(markdown) {
    const raw = String(markdown || "");
    if (!raw) return "";

    if (typeof document !== "undefined") {
      const container = document.createElement("div");
      container.innerHTML = renderMarkdown(raw);
      return (container.textContent || container.innerText || "")
        .replace(/\s+/g, " ")
        .trim();
    }

    return raw
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatNoteDate(isoStr) {
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

  function buildFormMarkup({ note }) {
    const title = note?.title || "";
    const tags = Array.isArray(note?.tags) ? note.tags.join(", ") : "";
    const body = note?.body || "";

    return `
      <div class="doc-form-wrap">
        <div class="doc-form-group">
          <label class="doc-form-label" for="shared-note-form-title">Título</label>
          <input type="text" id="shared-note-form-title" class="doc-form-input" maxlength="160" placeholder="Ej: Pistas sobre el Sabbat" value="${escapeHtml(title)}">
        </div>
        <div class="doc-form-group">
          <label class="doc-form-label" for="shared-note-form-tags">Etiquetas <span class="doc-form-hint">(separadas por coma)</span></label>
          <input type="text" id="shared-note-form-tags" class="doc-form-input" placeholder="Ej: pistas, sabbat, barrio norte" value="${escapeHtml(tags)}">
        </div>
        <div class="doc-form-group doc-form-group--grow">
          <label class="doc-form-label" for="shared-note-form-body">Contenido <span class="doc-form-hint">(soporta Markdown)</span></label>
          <textarea id="shared-note-form-body" class="doc-form-textarea" placeholder="Escribe tu nota...">${escapeHtml(body)}</textarea>
        </div>
      </div>
    `;
  }

  function buildNavigationFooterActions(sequence, note, onNavigate) {
    if (typeof onNavigate !== "function") return [];
    const rows = Array.isArray(sequence) ? sequence : [];
    if (!rows.length) return [];

    const idx = rows.findIndex((row) => String(row?.id) === String(note?.id));
    const canGoPrev = idx < rows.length - 1 && idx !== -1;
    const canGoNext = idx > 0;
    return [
      {
        id: "prev",
        kind: "button",
        variant: canGoPrev ? "primary" : "ghost",
        label: "Anterior",
        disabled: !canGoPrev,
        onClick: () => {
          if (canGoPrev) {
            onNavigate(rows[idx + 1]?.id, { direction: "prev", currentId: note?.id });
          }
        },
      },
      {
        id: "next",
        kind: "button",
        variant: canGoNext ? "primary" : "ghost",
        label: "Siguiente",
        disabled: !canGoNext,
        onClick: () => {
          if (canGoNext) {
            onNavigate(rows[idx - 1]?.id, { direction: "next", currentId: note?.id });
          }
        },
      },
    ];
  }

  async function persistChronicleNote(payload, persistence = {}) {
    const supabase = persistence.supabase || null;
    const chronicleId = persistence.chronicleId || null;
    const playerId = persistence.playerId || null;
    const errorMessagePrefix = String(persistence.errorMessagePrefix || "No se pudo guardar la nota");

    if (!supabase || !chronicleId || !playerId) {
      return { ok: false, message: "Falta configuración de persistencia para guardar la nota." };
    }

    let nextNoteId = payload.noteId || null;
    let error = null;

    if (payload.noteId) {
      ({ error } = await supabase
        .from("chronicle_notes")
        .update({
          title: payload.title,
          body_markdown: payload.body,
          tags: payload.tags,
          is_archived: payload.archived,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.noteId)
        .eq("chronicle_id", chronicleId)
        .eq("player_id", playerId));
    } else {
      const response = await supabase
        .from("chronicle_notes")
        .insert({
          chronicle_id: chronicleId,
          player_id: playerId,
          title: payload.title,
          body_markdown: payload.body,
          tags: payload.tags,
          is_archived: false,
        })
        .select("id")
        .maybeSingle();
      error = response.error;
      nextNoteId = response.data?.id || null;
    }

    if (error) {
      return { ok: false, message: `${errorMessagePrefix}: ${error.message}` };
    }

    return { ok: true, noteId: nextNoteId };
  }

  function openViewer(options = {}) {
    const ds = documentScreen();
    const note = options.note || null;
    if (!ds || !note) return null;

    const actions = [];
    const resolveSubtitle = (noteValue) =>
      typeof options.subtitle === "function" ? options.subtitle(noteValue) : String(options.subtitle || "");
    const archiveActionPatch = (archived) => ({
      variant: archived ? "primary" : "ghost",
      icon: archived ? "archive-restore" : "archive",
      title: archived ? "Desarchivar" : "Archivar",
      ariaLabel: archived ? "Desarchivar" : "Archivar",
    });

    if (typeof options.onToggleArchive === "function") {
      actions.push({
        id: "archive",
        kind: "icon",
        ...archiveActionPatch(Boolean(note.archived)),
        onClick: async (screenApi) => {
          const nextArchived = !Boolean(note.archived);
          const ok = await options.onToggleArchive(note, nextArchived);
          if (ok === false) return;

          note.archived = nextArchived;
          screenApi?.updateAction?.("archive", archiveActionPatch(note.archived));
          screenApi?.setSubtitle?.(resolveSubtitle(note));
        },
      });
    }

    if (typeof options.onEdit === "function") {
      actions.push({
        id: "edit",
        kind: "icon",
        icon: "pencil",
        title: "Editar",
        ariaLabel: "Editar",
        onClick: () => options.onEdit(note),
      });
    }

    if (typeof options.onDelete === "function") {
      actions.push({
        id: "delete",
        kind: "icon",
        icon: "trash-2",
        title: "Eliminar",
        ariaLabel: "Eliminar",
        danger: true,
        onClick: () => {
          void options.onDelete(note);
        },
      });
    }

    return ds.open({
      docType: "note",
      title: String(options.title || note.title || "Nota"),
      subtitle: resolveSubtitle(note),
      tags: Array.isArray(options.tags) ? options.tags : Array.isArray(note.tags) ? note.tags : [],
      actions,
      footerActions: buildNavigationFooterActions(options.sequence, note, options.onNavigate),
      bodyClass: "doc-view-body",
      renderBody: (body) => {
        const card = document.createElement("article");
        card.className = "doc-view-card";
        card.innerHTML = `<div class="doc-markdown">${renderMarkdown(note.body || "")}</div>`;
        body.appendChild(card);
      },
      onClosed: () => {
        if (typeof options.onClosed === "function") options.onClosed(note);
      },
    });
  }

  function openForm(options = {}) {
    const ds = documentScreen();
    if (!ds) return null;

    const note = options.note || null;
    const title = String(options.title || (note ? "Editar Nota" : "Nueva Nota"));
    const tagsLowercase = Boolean(options.tagsLowercase);

    let api = null;
    let saving = false;

    function syncSaveAction() {
      api?.updateFooterAction("save", {
        label: saving ? "Guardando..." : "Guardar",
        disabled: saving,
      });
      api?.updateFooterAction("cancel", {
        disabled: saving,
      });
    }

    async function persistForm() {
      if (saving) return;

      const nextTitle = document.getElementById("shared-note-form-title")?.value.trim() || "";
      const tagsRaw = document.getElementById("shared-note-form-tags")?.value || "";
      const body = document.getElementById("shared-note-form-body")?.value.trim() || "";
      const archived = Boolean(note?.archived);

      if (!nextTitle) {
        global.alert("El título es obligatorio.");
        return;
      }

      const payload = {
        noteId: note?.id || null,
        title: nextTitle,
        body,
        tags: parseTags(tagsRaw, { lowercase: tagsLowercase }),
        archived,
      };

      saving = true;
      syncSaveAction();

      let result;
      try {
        if (typeof options.onSave === "function") {
          result = await options.onSave(payload);
        } else if (options.persistence?.type === "chronicle-note") {
          result = await persistChronicleNote(payload, options.persistence);
        } else {
          result = { ok: false, message: "No hay manejador para guardar la nota." };
        }
      } catch (error) {
        result = {
          ok: false,
          message: error?.message || "No se pudo guardar la nota.",
        };
      }

      saving = false;
      syncSaveAction();

      if (!result?.ok) {
        global.alert(result?.message || "No se pudo guardar la nota.");
        return;
      }

      api?.close();
      if (typeof options.onSaved === "function") {
        options.onSaved({
          noteId: result?.noteId ?? payload.noteId,
          created: !payload.noteId,
          archived: payload.archived,
        });
      }
    }

    api = ds.open({
      docType: "note",
      title,
      footerActions: [
        {
          id: "cancel",
          kind: "button",
          variant: "ghost",
          label: "Cancelar",
          onClick: () => {
            if (saving) return;
            api?.close();
            if (typeof options.onCancel === "function") {
              options.onCancel(note);
            }
          },
        },
        {
          id: "save",
          kind: "button",
          variant: "primary",
          label: "Guardar",
          onClick: () => {
            void persistForm();
          },
        },
      ],
      bodyClass: "doc-form-body",
      renderBody: (bodyHost) => {
        bodyHost.innerHTML = buildFormMarkup({ note });
      },
    });

    document.getElementById("shared-note-form-title")?.focus();
    return api;
  }

  async function showForPlayer({ noteId, onSaved, onClosed } = {}) {
    if (!noteId) return;

    const supabase = global.supabase;
    if (!supabase) return;

    const { data, error } = await supabase.rpc("check_note_access", {
      p_note_id: noteId,
    });

    if (error) {
      console.error("check_note_access error:", error.message);
      await (global.ABNShared?.modal?.alert?.(
        "No se pudo verificar el acceso a la nota.",
        { title: "Error" },
      ) || Promise.resolve());
      return;
    }

    const access = data?.access;

    if (access === "denied") {
      const reason = data?.reason || "unknown";
      const messages = {
        not_authenticated: "Debes iniciar sesión para ver notas.",
        no_player_profile: "No tienes perfil de jugador.",
        not_found: "Esta nota no existe o fue eliminada.",
        not_owner: "No tienes acceso a esta nota.",
        not_participant: "No eres parte de esta crónica.",
      };
      await (global.ABNShared?.modal?.alert?.(
        messages[reason] || "No tienes acceso a esta nota.",
        { title: "Acceso denegado" },
      ) || Promise.resolve());
      return;
    }

    const noteData = data?.note;
    if (!noteData) return;

    const note = {
      id: noteData.id,
      title: noteData.title || "Sin título",
      body: noteData.body_markdown || "",
      tags: Array.isArray(noteData.tags) ? noteData.tags : [],
      archived: Boolean(noteData.is_archived),
      createdAt: noteData.created_at,
      updatedAt: noteData.updated_at,
    };

    if (access === "narrator") {
      const ownerName = data.owner_name || "Jugador";
      openViewer({
        note,
        title: note.title,
        subtitle: `Nota de ${ownerName}`,
        tags: note.tags,
        onClosed: () => {
          if (typeof onClosed === "function") onClosed(note);
        },
      });
      return;
    }

    if (access === "owner") {
      const chronicleId = data.chronicle_id;
      const playerId = data.player_id;

      openViewer({
        note,
        title: note.title,
        subtitle: () => formatNoteDate(note.updatedAt || note.createdAt),
        tags: note.tags,
        onEdit: () => {
          openForm({
            note,
            title: "Editar Nota",
            persistence: {
              type: "chronicle-note",
              supabase,
              chronicleId,
              playerId,
              errorMessagePrefix: "Error al guardar",
            },
            onSaved: async ({ noteId: savedId }) => {
              if (typeof onSaved === "function") onSaved();
              if (savedId) {
                showForPlayer({ noteId: savedId, onSaved, onClosed });
              }
            },
            onCancel: (currentNote) => {
              if (currentNote?.id) {
                showForPlayer({ noteId: currentNote.id, onSaved, onClosed });
              }
            },
          });
        },
        onToggleArchive: async (row, nextArchived) => {
          const { error: archErr } = await supabase
            .from("chronicle_notes")
            .update({
              is_archived: nextArchived,
              updated_at: new Date().toISOString(),
            })
            .eq("id", note.id);

          if (archErr) {
            global.alert("Error al archivar: " + archErr.message);
            return false;
          }
          note.archived = nextArchived;
          if (typeof onSaved === "function") onSaved();
          return true;
        },
        onDelete: async () => {
          const ok = await (global.ABNShared?.modal?.confirm?.(
            "¿Eliminar esta nota? Esta acción no se puede deshacer.",
          ) ?? global.confirm("¿Eliminar esta nota? Esta acción no se puede deshacer."));
          if (!ok) return;

          const { error: delErr } = await supabase
            .from("chronicle_notes")
            .delete()
            .eq("id", note.id);

          if (delErr) {
            global.alert("Error al eliminar: " + delErr.message);
            return;
          }
          documentScreen()?.close();
          if (typeof onSaved === "function") onSaved();
        },
        onClosed: () => {
          if (typeof onClosed === "function") onClosed(note);
        },
      });
    }
  }

  root.noteScreen = {
    openViewer,
    openForm,
    parseTags,
    toPlainText,
    showForPlayer,
  };
})(window);
