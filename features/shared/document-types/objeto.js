(function initSharedObjectDocumentType(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const registry = root.documentTypes;

  if (!registry?.register) return;

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function objectScreen() {
    return root.objectScreen || null;
  }

  function tagSystem() {
    return root.tags || null;
  }

  function getObjectTypeLabel(type) {
    return objectScreen()?.getObjectTypeLabel?.(type) || type || "";
  }

  function renderTagsMarkup(tags) {
    const list = Array.isArray(tags)
      ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];
    if (!list.length) return "";

    const sharedTags = tagSystem();
    const normalized = sharedTags?.dedupe ? sharedTags.dedupe(list) : list;

    return `<div class="abn-tag-list">${normalized
      .map((tag) => {
        const label = sharedTags?.formatLabel
          ? sharedTags.formatLabel(tag, { displayMode: "title" })
          : tag;
        const className = sharedTags ? "abn-tag" : "da-tag";
        return `<span class="${className}">${escapeHtml(label)}</span>`;
      })
      .join("")}</div>`;
  }

  function toPlainText(markdown) {
    return String(markdown || "")
      .replace(/^#{1,6}\s+/gm, "")
      .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/[*_~`>#-]+/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function formatRelativeDate(isoStr) {
    if (!isoStr) return "";
    const date = new Date(isoStr);
    const now = new Date();
    const diffDays = Math.floor((now - date) / (1000 * 60 * 60 * 24));
    if (diffDays === 0) return "Hoy";
    if (diffDays === 1) return "Ayer";
    if (diffDays < 30) return `Hace ${diffDays} días`;
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function normalizeRow(row) {
    return {
      id: row.id,
      chronicle_id: row.chronicle_id,
      character_sheet_id: row.character_sheet_id,
      player_id: row.player_id,
      name: row.name || "Sin nombre",
      description: row.description || "",
      object_type: row.object_type || "equipo",
      location: row.location || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      is_archived: Boolean(row.is_archived),
      is_favorite: Boolean(row.is_favorite),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    };
  }

  async function fetchRows(ctx) {
    const supabase = global.supabase;
    if (!supabase || !ctx.characterSheetId) return [];

    const { data, error } = await supabase
      .from("character_objects")
      .select("*")
      .eq("character_sheet_id", ctx.characterSheetId)
      .order("is_favorite", { ascending: false })
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (error) {
      console.error("ObjectDocumentType: fetch error", error);
      return [];
    }

    return (data || []).map(normalizeRow);
  }

  function filterRows(rows, query, _ctx, filters = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const sharedTags = tagSystem();
    const selectedTag = String(filters?.selectedTag || "").trim().toLowerCase();
    if (!normalizedQuery && !selectedTag) return source;

    return source.filter((row) => {
      const haystack = `${row.name} ${row.description} ${(row.tags || []).join(" ")} ${row.object_type} ${row.location}`.toLowerCase();
      const tags = Array.isArray(row?.tags) ? row.tags : [];
      const matchesQuery = !normalizedQuery || haystack.includes(normalizedQuery);
      const matchesTag =
        !selectedTag ||
        tags.some((tag) => {
          const normalizedTag = sharedTags?.createTagKey
            ? sharedTags.createTagKey(tag)
            : String(tag || "").trim().toLowerCase();
          return normalizedTag === selectedTag;
        });
      return matchesQuery && matchesTag;
    });
  }

  function getTagFilterStats(rows, _ctx, filters = {}) {
    const sharedTags = tagSystem();
    if (!sharedTags?.collectStats) return [];

    return sharedTags.collectStats(rows, {
      getTags: (row) => row?.tags,
      selectedTag: filters?.selectedTag || null,
      selectedLabel: filters?.selectedTagLabel || "",
    });
  }

  function buildDetailedListItemOptions(row) {
    const plain = toPlainText(row?.description || "");
    const preview = root.documentList?.buildPreviewText
      ? root.documentList.buildPreviewText(plain, { maxLines: 3 })
      : plain;
    const metaParts = [
      getObjectTypeLabel(row?.object_type),
      row?.location || null,
      formatRelativeDate(row?.updated_at || row?.created_at),
    ].filter(Boolean);

    return {
      title: row?.name || "Sin nombre",
      meta: metaParts.join(" · "),
      tagsHtml: renderTagsMarkup(row?.tags),
      preview,
    };
  }

  function renderCard(row) {
    const plain = toPlainText(row.description || "");
    const preview = plain.length > 140 ? `${plain.slice(0, 140)}…` : plain;
    const archivedLabel = row.is_archived ? '<span class="da-inline-badge">Archivado</span>' : "";
    const locationBadge = row.location
      ? `<span class="objeto-location-badge">${escapeHtml(row.location)}</span>`
      : "";
    const favClass = row.is_favorite ? " objeto-fav--active" : "";

    return `
      <article class="abn-note-card abn-note-card--clickable objeto-card" data-document-id="${escapeHtml(row.id)}">
        <div class="abn-note-card-head">
          <div class="objeto-card-title-row">
            <span class="objeto-type-badge objeto-type-badge--${escapeHtml(row.object_type)}">${escapeHtml(getObjectTypeLabel(row.object_type))}</span>
            <h3 class="abn-note-card-title">${escapeHtml(row.name)}</h3>
          </div>
          <div class="objeto-card-actions">
            <button type="button" class="objeto-fav-btn${favClass}" data-fav-id="${escapeHtml(row.id)}" title="${row.is_favorite ? "Quitar de favoritos" : "Marcar como favorito"}" aria-label="${row.is_favorite ? "Quitar de favoritos" : "Marcar como favorito"}">
              <i data-lucide="${row.is_favorite ? "star" : "star"}" class="objeto-fav-icon"></i>
            </button>
            ${archivedLabel}
          </div>
        </div>
        <p class="abn-note-card-meta">
          ${locationBadge}
          ${escapeHtml(formatRelativeDate(row.updated_at || row.created_at))}
        </p>
        <div class="abn-note-card-tags">
          ${renderTagsMarkup(row.tags)}
        </div>
        ${preview ? `<p class="abn-note-card-preview">${escapeHtml(preview)}</p>` : ""}
      </article>
    `;
  }

  async function openCreate(ctx, helpers) {
    if (!ctx.currentPlayerId || !ctx.chronicleId || !ctx.characterSheetId) return;

    const supabase = global.supabase;
    const locationSuggestions = supabase
      ? await (objectScreen()?.fetchLocationSuggestions?.(supabase, ctx.characterSheetId) || [])
      : [];

    objectScreen()?.openForm?.({
      title: "Nuevo Objeto",
      locationSuggestions,
      persistence: {
        type: "character-object",
        supabase,
        chronicleId: ctx.chronicleId,
        characterSheetId: ctx.characterSheetId,
        playerId: ctx.currentPlayerId,
        errorMessagePrefix: "No se pudo guardar el objeto",
      },
      onSaved: async ({ objectId }) => {
        await helpers?.refresh?.();
        if (objectId) {
          objectScreen()?.showForPlayer?.({
            objectId,
            characterSheetId: ctx.characterSheetId,
            onSaved: () => helpers?.refresh?.(),
          });
        }
      },
    });
  }

  async function handleListClick(event, ctx, helpers) {
    const favBtn = event.target.closest("[data-fav-id]");
    if (favBtn?.dataset.favId) {
      event.preventDefault();
      event.stopPropagation();
      await toggleFavorite(favBtn.dataset.favId, helpers);
      return true;
    }

    const card = event.target.closest("[data-document-id]");
    if (!card?.dataset.documentId) return false;

    objectScreen()?.showForPlayer?.({
      objectId: card.dataset.documentId,
      characterSheetId: ctx.characterSheetId,
      onSaved: () => helpers?.refresh?.(),
    });
    return true;
  }

  async function toggleFavorite(objectId, helpers) {
    const supabase = global.supabase;
    if (!supabase || !objectId) return;

    const rows = Array.isArray(helpers?.allRows) ? helpers.allRows : [];
    const row = rows.find((r) => String(r.id) === String(objectId));
    const nextFavorite = !Boolean(row?.is_favorite);

    const { error } = await supabase
      .from("character_objects")
      .update({ is_favorite: nextFavorite })
      .eq("id", objectId);

    if (error) {
      console.error("ObjectDocumentType: toggle favorite error", error);
      return;
    }

    await helpers?.refresh?.();
  }

  registry.register("objeto", {
    getArchiveTitle(ctx) {
      return `Archivo de Objetos · ${ctx.chronicle?.name || "Crónica"}`;
    },
    getArchiveSubtitle() {
      return "Objetos de tu personaje";
    },
    getSearchPlaceholder() {
      return "Buscar por nombre, tipo, ubicación o tag...";
    },
    getCreateLabel() {
      return "Nuevo Objeto";
    },
    canCreate(ctx) {
      return Boolean(ctx.characterSheetId && ctx.currentPlayerId);
    },
    getPageSize() {
      return 12;
    },
    getListLayout() {
      return "stack";
    },
    getEmptyMessage(_ctx, { query }) {
      if (query) return "Sin resultados.";
      return "No hay objetos registrados.";
    },
    buildDetailedListItemOptions,
    fetchRows,
    filterRows,
    getTagFilterStats,
    renderCard,
    openCreate,
    handleListClick,
  });
})(window);
