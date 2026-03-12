(function initSharedObjectScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function documentScreen() {
    return root.documentScreen || null;
  }

  function tagSystem() {
    return root.tags || null;
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
    const sharedTags = tagSystem();
    if (sharedTags?.parse) {
      if (Array.isArray(raw)) {
        return sharedTags.dedupe(
          raw.map((tag) => sharedTags.normalizeTag(tag, { lowercase })).filter(Boolean),
        );
      }
      return sharedTags.parse(raw, { lowercase });
    }

    if (Array.isArray(raw)) {
      return [...new Set(
        raw
          .map((tag) => (lowercase ? String(tag || "").trim().toLowerCase() : String(tag || "").trim()))
          .filter(Boolean),
      )];
    }

    return [...new Set(
      String(raw || "")
        .split(",")
        .map((tag) => (lowercase ? tag.trim().toLowerCase() : tag.trim()))
        .filter(Boolean),
    )];
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

  const OBJECT_TYPE_LABELS = {
    arma: "Arma",
    equipo: "Equipo",
    utilidad: "Utilidad",
    consumible: "Consumible",
  };

  function getObjectTypeLabel(type) {
    return OBJECT_TYPE_LABELS[type] || type || "";
  }

  function buildFormMarkup({ object, useSharedTagEditor = false, locationSuggestions = [] }) {
    const name = object?.name || "";
    const objectType = object?.objectType || "equipo";
    const location = object?.location || "";
    const tags = Array.isArray(object?.tags) ? object.tags.join(", ") : "";
    const description = object?.description || "";

    const typeOptions = Object.entries(OBJECT_TYPE_LABELS)
      .map(
        ([value, label]) =>
          `<option value="${value}"${value === objectType ? " selected" : ""}>${escapeHtml(label)}</option>`,
      )
      .join("");

    const datalistOptions = locationSuggestions
      .map((s) => `<option value="${escapeHtml(s)}">`)
      .join("");

    return `
      <div class="doc-form-wrap">
        <div class="doc-form-group">
          <label class="doc-form-label" for="shared-object-form-name">Nombre</label>
          <input type="text" id="shared-object-form-name" class="doc-form-input" maxlength="120" placeholder="Ej: Glock 17" value="${escapeHtml(name)}">
        </div>
        <div class="doc-form-row">
          <div class="doc-form-group doc-form-group--half">
            <label class="doc-form-label" for="shared-object-form-type">Tipo</label>
            <select id="shared-object-form-type" class="doc-form-input">${typeOptions}</select>
          </div>
          <div class="doc-form-group doc-form-group--half">
            <label class="doc-form-label" for="shared-object-form-location">Ubicación</label>
            <input type="text" id="shared-object-form-location" class="doc-form-input" list="object-location-suggestions" placeholder="Ej: Equipado, Refugio..." value="${escapeHtml(location)}" autocomplete="off">
            <datalist id="object-location-suggestions">${datalistOptions}</datalist>
          </div>
        </div>
        <div class="doc-form-group">
          <label class="doc-form-label"${useSharedTagEditor ? "" : ' for="shared-object-form-tags"'}>Etiquetas${useSharedTagEditor ? "" : ' <span class="doc-form-hint">(separadas por coma)</span>'}</label>
          ${useSharedTagEditor
            ? '<div id="shared-object-form-tags-container" class="doc-form-tag-editor"></div>'
            : `<input type="text" id="shared-object-form-tags" class="doc-form-input" placeholder="Ej: combate, sigilo" value="${escapeHtml(tags)}">`}
        </div>
        <div class="doc-form-group doc-form-group--grow">
          <label class="doc-form-label" for="shared-object-form-description">Descripción <span class="doc-form-hint">(soporta Markdown)</span></label>
          <textarea id="shared-object-form-description" class="doc-form-textarea" placeholder="Describe el objeto...">${escapeHtml(description)}</textarea>
        </div>
      </div>
    `;
  }

  async function persistCharacterObject(payload, persistence = {}) {
    const supabase = persistence.supabase || null;
    const chronicleId = persistence.chronicleId || null;
    const characterSheetId = persistence.characterSheetId || null;
    const playerId = persistence.playerId || null;
    const errorMessagePrefix = String(persistence.errorMessagePrefix || "No se pudo guardar el objeto");

    if (!supabase || !chronicleId || !characterSheetId || !playerId) {
      return { ok: false, message: "Falta configuración de persistencia para guardar el objeto." };
    }

    let nextObjectId = payload.objectId || null;
    let error = null;

    if (payload.objectId) {
      ({ error } = await supabase
        .from("character_objects")
        .update({
          name: payload.name,
          description: payload.description,
          object_type: payload.objectType,
          location: payload.location,
          tags: payload.tags,
          is_archived: payload.archived,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.objectId)
        .eq("character_sheet_id", characterSheetId)
        .eq("player_id", playerId));
    } else {
      const response = await supabase
        .from("character_objects")
        .insert({
          chronicle_id: chronicleId,
          character_sheet_id: characterSheetId,
          player_id: playerId,
          name: payload.name,
          description: payload.description,
          object_type: payload.objectType,
          location: payload.location,
          tags: payload.tags,
          is_archived: false,
        })
        .select("id")
        .maybeSingle();
      error = response.error;
      nextObjectId = response.data?.id || null;
    }

    if (error) {
      return { ok: false, message: `${errorMessagePrefix}: ${error.message}` };
    }

    return { ok: true, objectId: nextObjectId };
  }

  function openViewer(options = {}) {
    const ds = documentScreen();
    const object = options.object || null;
    if (!ds || !object) return null;

    const actions = [];
    const favActionPatch = (fav) => ({
      variant: "ghost",
      icon: "star",
      title: fav ? "Quitar de favoritos" : "Marcar como favorito",
      ariaLabel: fav ? "Quitar de favoritos" : "Marcar como favorito",
      className: fav ? "objeto-fav-action--active" : "",
    });

    if (typeof options.onToggleFavorite === "function") {
      actions.push({
        id: "favorite",
        kind: "icon",
        ...favActionPatch(Boolean(object.favorite)),
        onClick: async (screenApi) => {
          const nextFav = !Boolean(object.favorite);
          const ok = await options.onToggleFavorite(object, nextFav);
          if (ok === false) return;

          object.favorite = nextFav;
          screenApi?.updateAction?.("favorite", favActionPatch(object.favorite));
        },
      });
    }

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
        ...archiveActionPatch(Boolean(object.archived)),
        onClick: async (screenApi) => {
          const nextArchived = !Boolean(object.archived);
          const ok = await options.onToggleArchive(object, nextArchived);
          if (ok === false) return;

          object.archived = nextArchived;
          screenApi?.updateAction?.("archive", archiveActionPatch(object.archived));
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
        onClick: () => options.onEdit(object),
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
          void options.onDelete(object);
        },
      });
    }

    const typeBadge = object.objectType
      ? `<span class="objeto-type-badge objeto-type-badge--${escapeHtml(object.objectType)}">${escapeHtml(getObjectTypeLabel(object.objectType))}</span>`
      : "";
    const locationBadge = object.location
      ? `<span class="objeto-location-badge">${escapeHtml(object.location)}</span>`
      : "";

    return ds.open({
      docType: "objeto",
      title: String(options.title || object.name || "Objeto"),
      subtitle: [getObjectTypeLabel(object.objectType), object.location].filter(Boolean).join(" · "),
      tags: Array.isArray(object.tags) ? object.tags : [],
      actions,
      bodyClass: "doc-view-body",
      renderBody: (body) => {
        const card = document.createElement("article");
        card.className = "doc-view-card";

        const badges = typeBadge || locationBadge
          ? `<div class="objeto-viewer-badges">${typeBadge}${locationBadge}</div>`
          : "";

        const descriptionHtml = object.description
          ? `<div class="doc-markdown">${renderMarkdown(object.description)}</div>`
          : '<p class="muted">Sin descripción.</p>';

        card.innerHTML = `${badges}${descriptionHtml}`;
        body.appendChild(card);
      },
      onClosed: () => {
        if (typeof options.onClosed === "function") options.onClosed(object);
      },
    });
  }

  function openForm(options = {}) {
    const ds = documentScreen();
    if (!ds) return null;

    const object = options.object || null;
    const title = String(options.title || (object ? "Editar Objeto" : "Nuevo Objeto"));
    const tagsLowercase = true;
    const hasSharedTagEditor = Boolean(tagSystem()?.renderEditor);
    const locationSuggestions = Array.isArray(options.locationSuggestions) ? options.locationSuggestions : [];
    const formState = {
      tags: parseTags(Array.isArray(object?.tags) ? object.tags : [], { lowercase: tagsLowercase }),
      tagComposerOpen: false,
    };

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

    function renderTagsEditor() {
      const sharedTags = tagSystem();
      const container = document.getElementById("shared-object-form-tags-container");
      if (!sharedTags?.renderEditor || !container) return;

      sharedTags.renderEditor({
        container,
        tags: formState.tags,
        composerOpen: formState.tagComposerOpen,
        editable: true,
        displayMode: "title",
        placeholder: "Nuevo tag",
        onComposerToggle: (isOpen) => {
          formState.tagComposerOpen = isOpen;
          renderTagsEditor();
        },
        onChange: (nextTags) => {
          formState.tags = parseTags(nextTags, { lowercase: tagsLowercase });
          formState.tagComposerOpen = false;
          renderTagsEditor();
        },
      });
    }

    async function persistForm() {
      if (saving) return;

      const nextName = document.getElementById("shared-object-form-name")?.value.trim() || "";
      const objectType = document.getElementById("shared-object-form-type")?.value || "equipo";
      const location = document.getElementById("shared-object-form-location")?.value.trim() || "";
      const tagsRaw = document.getElementById("shared-object-form-tags")?.value || "";
      const description = document.getElementById("shared-object-form-description")?.value.trim() || "";
      const archived = Boolean(object?.archived);

      if (!nextName) {
        global.alert("El nombre es obligatorio.");
        return;
      }

      const payload = {
        objectId: object?.id || null,
        name: nextName,
        description,
        objectType,
        location,
        tags: hasSharedTagEditor
          ? parseTags(formState.tags, { lowercase: tagsLowercase })
          : parseTags(tagsRaw, { lowercase: tagsLowercase }),
        archived,
      };

      saving = true;
      syncSaveAction();

      let result;
      try {
        if (typeof options.onSave === "function") {
          result = await options.onSave(payload);
        } else if (options.persistence?.type === "character-object") {
          result = await persistCharacterObject(payload, options.persistence);
        } else {
          result = { ok: false, message: "No hay manejador para guardar el objeto." };
        }
      } catch (error) {
        result = {
          ok: false,
          message: error?.message || "No se pudo guardar el objeto.",
        };
      }

      saving = false;
      syncSaveAction();

      if (!result?.ok) {
        global.alert(result?.message || "No se pudo guardar el objeto.");
        return;
      }

      api?.close();
      if (typeof options.onSaved === "function") {
        options.onSaved({
          objectId: result?.objectId ?? payload.objectId,
          created: !payload.objectId,
        });
      }
    }

    api = ds.open({
      docType: "objeto",
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
              options.onCancel(object);
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
        bodyHost.innerHTML = buildFormMarkup({
          object,
          useSharedTagEditor: hasSharedTagEditor,
          locationSuggestions,
        });
        renderTagsEditor();
      },
    });

    document.getElementById("shared-object-form-name")?.focus();
    return api;
  }

  async function showForPlayer({ objectId, characterSheetId, onSaved, onClosed } = {}) {
    if (!objectId) return;

    const supabase = global.supabase;
    if (!supabase) return;

    const { data: objData, error } = await supabase
      .from("character_objects")
      .select("*")
      .eq("id", objectId)
      .maybeSingle();

    if (error || !objData) {
      await (root.modal?.alert?.(
        "No se pudo cargar el objeto.",
        { title: "Error" },
      ) || Promise.resolve());
      return;
    }

    const object = {
      id: objData.id,
      name: objData.name || "Sin nombre",
      description: objData.description || "",
      objectType: objData.object_type || "equipo",
      location: objData.location || "",
      tags: Array.isArray(objData.tags) ? objData.tags : [],
      archived: Boolean(objData.is_archived),
      favorite: Boolean(objData.is_favorite),
      createdAt: objData.created_at,
      updatedAt: objData.updated_at,
    };

    const sheetId = characterSheetId || objData.character_sheet_id;
    const chronicleId = objData.chronicle_id;
    const playerId = objData.player_id;

    const locationSuggestions = await fetchLocationSuggestions(supabase, sheetId);

    openViewer({
      object,
      title: object.name,
      onToggleFavorite: async (_row, nextFav) => {
        const { error: favErr } = await supabase
          .from("character_objects")
          .update({ is_favorite: nextFav })
          .eq("id", object.id);

        if (favErr) {
          global.alert("Error al actualizar favorito: " + favErr.message);
          return false;
        }
        object.favorite = nextFav;
        if (typeof onSaved === "function") onSaved();
        return true;
      },
      onEdit: () => {
        openForm({
          object,
          title: "Editar Objeto",
          locationSuggestions,
          persistence: {
            type: "character-object",
            supabase,
            chronicleId,
            characterSheetId: sheetId,
            playerId,
            errorMessagePrefix: "Error al guardar",
          },
          onSaved: async ({ objectId: savedId }) => {
            if (typeof onSaved === "function") onSaved();
            if (savedId) {
              showForPlayer({ objectId: savedId, characterSheetId: sheetId, onSaved, onClosed });
            }
          },
          onCancel: (currentObject) => {
            if (currentObject?.id) {
              showForPlayer({ objectId: currentObject.id, characterSheetId: sheetId, onSaved, onClosed });
            }
          },
        });
      },
      onToggleArchive: async (row, nextArchived) => {
        const { error: archErr } = await supabase
          .from("character_objects")
          .update({
            is_archived: nextArchived,
            updated_at: new Date().toISOString(),
          })
          .eq("id", object.id);

        if (archErr) {
          global.alert("Error al archivar: " + archErr.message);
          return false;
        }
        object.archived = nextArchived;
        if (typeof onSaved === "function") onSaved();
        return true;
      },
      onDelete: async () => {
        const ok = await (root.modal?.confirm?.(
          "¿Eliminar este objeto? Esta acción no se puede deshacer.",
        ) ?? global.confirm("¿Eliminar este objeto? Esta acción no se puede deshacer."));
        if (!ok) return;

        const { error: delErr } = await supabase
          .from("character_objects")
          .delete()
          .eq("id", object.id);

        if (delErr) {
          global.alert("Error al eliminar: " + delErr.message);
          return;
        }
        documentScreen()?.close();
        if (typeof onSaved === "function") onSaved();
      },
      onClosed: () => {
        if (typeof onClosed === "function") onClosed(object);
      },
    });
  }

  async function fetchLocationSuggestions(supabase, characterSheetId) {
    if (!supabase || !characterSheetId) return [];
    try {
      const { data, error } = await supabase
        .from("character_objects")
        .select("location")
        .eq("character_sheet_id", characterSheetId)
        .neq("location", "")
        .order("updated_at", { ascending: false });
      if (error || !data) return [];
      const unique = [...new Set(data.map((r) => r.location).filter(Boolean))];
      return unique;
    } catch {
      return [];
    }
  }

  root.objectScreen = {
    openViewer,
    openForm,
    showForPlayer,
    parseTags,
    getObjectTypeLabel,
    fetchLocationSuggestions,
    OBJECT_TYPE_LABELS,
  };
})(window);
