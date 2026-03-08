(function initSharedNoteDocumentType(global) {
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

  function noteScreen() {
    return root.noteScreen || null;
  }

  function tagSystem() {
    return root.tags || null;
  }

  function renderTagsMarkup(tags) {
    const list = Array.isArray(tags)
      ? tags.map((tag) => String(tag || "").trim()).filter(Boolean)
      : [];
    if (!list.length) return "";

    const sharedTags = tagSystem();
    const normalized = sharedTags?.dedupe ? sharedTags.dedupe(list) : list;

    return `<div class="da-tags-row">${normalized
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
    const sharedNoteScreen = noteScreen();
    if (typeof sharedNoteScreen?.toPlainText === "function") {
      return sharedNoteScreen.toPlainText(markdown);
    }
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
    if (diffDays === 0) return "Editada hoy";
    if (diffDays === 1) return "Editada ayer";
    if (diffDays < 30) return `Editada hace ${diffDays} días`;
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
  }

  function normalizeRow(row) {
    return {
      id: row.id,
      chronicle_id: row.chronicle_id,
      player_id: row.player_id,
      player_name: row.player_name || "",
      title: row.title || "Sin título",
      body_markdown: row.body_markdown || "",
      tags: Array.isArray(row.tags) ? row.tags : [],
      is_archived: Boolean(row.is_archived),
      created_at: row.created_at || new Date().toISOString(),
      updated_at: row.updated_at || row.created_at || new Date().toISOString(),
    };
  }

  async function fetchRows(ctx) {
    const supabase = global.supabase;
    if (!supabase || !ctx.chronicleId) return [];

    const { data, error } = await supabase.rpc("list_chronicle_notes_archive", {
      p_chronicle_id: ctx.chronicleId,
    });

    if (!error) {
      return (Array.isArray(data) ? data : []).map(normalizeRow);
    }

    console.warn("NoteDocumentType: RPC fallback", error.message);
    if (ctx.isNarrator || !ctx.currentPlayerId) {
      return [];
    }

    const response = await supabase
      .from("chronicle_notes")
      .select("id, chronicle_id, player_id, title, body_markdown, tags, is_archived, created_at, updated_at")
      .eq("chronicle_id", ctx.chronicleId)
      .eq("player_id", ctx.currentPlayerId)
      .order("updated_at", { ascending: false })
      .order("created_at", { ascending: false });

    if (response.error) {
      console.error("NoteDocumentType: no se pudieron cargar notas", response.error);
      return [];
    }

    return (response.data || []).map(normalizeRow);
  }

  function filterRows(rows, query) {
    const source = Array.isArray(rows) ? rows : [];
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return source;

    return source.filter((row) => {
      const haystack = `${row.title} ${row.body_markdown} ${(row.tags || []).join(" ")} ${row.player_name || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  function renderCard(row, ctx) {
    const plain = toPlainText(row.body_markdown || "");
    const preview = plain.length > 180 ? `${plain.slice(0, 180)}…` : plain;
    const archivedLabel = row.is_archived ? '<span class="da-inline-badge">Archivada</span>' : "";
    const ownerMeta = ctx.isNarrator && row.player_name
      ? ` · ${escapeHtml(row.player_name)}`
      : "";

    return `
      <article class="da-card da-card--clickable" data-document-id="${escapeHtml(row.id)}">
        <div class="da-card-head">
          <h3>${escapeHtml(row.title || "Sin título")}</h3>
          ${archivedLabel}
        </div>
        <p class="da-meta">${escapeHtml(formatRelativeDate(row.updated_at || row.created_at))}${ownerMeta}</p>
        ${renderTagsMarkup(row.tags)}
        ${preview ? `<p class="da-preview">${escapeHtml(preview)}</p>` : ""}
      </article>
    `;
  }

  async function openCreate(ctx, helpers) {
    if (ctx.isNarrator || !ctx.currentPlayerId || !ctx.chronicleId) return;
    noteScreen()?.openForm?.({
      title: "Nueva Nota",
      persistence: {
        type: "chronicle-note",
        supabase: global.supabase,
        chronicleId: ctx.chronicleId,
        playerId: ctx.currentPlayerId,
        errorMessagePrefix: "No se pudo guardar la nota",
      },
      onSaved: async ({ noteId }) => {
        await helpers?.refresh?.();
        if (noteId) {
          noteScreen()?.showForPlayer?.({ noteId, onSaved: () => helpers?.refresh?.() });
        }
      },
    });
  }

  async function handleListClick(event, _ctx, helpers) {
    const card = event.target.closest("[data-document-id]");
    if (!card?.dataset.documentId) return false;

    noteScreen()?.showForPlayer?.({
      noteId: card.dataset.documentId,
      onSaved: () => helpers?.refresh?.(),
    });
    return true;
  }

  registry.register("note", {
    getArchiveTitle(ctx) {
      return `Archivo de Notas · ${ctx.chronicle?.name || "Crónica"}`;
    },
    getArchiveSubtitle(ctx) {
      return ctx.isNarrator
        ? "Notas de los jugadores participantes en esta crónica"
        : "Tus notas creadas en esta crónica";
    },
    getSearchPlaceholder() {
      return "Buscar por título, cuerpo, tag o jugador...";
    },
    getCreateLabel() {
      return "Nueva Nota";
    },
    canCreate(ctx) {
      return !ctx.isNarrator;
    },
    getPageSize() {
      return 20;
    },
    getListLayout() {
      return "stack";
    },
    getEmptyMessage(ctx, { query }) {
      if (query) return "Sin resultados.";
      return ctx.isNarrator
        ? "No hay notas disponibles en esta crónica."
        : "No tienes notas en esta crónica.";
    },
    fetchRows,
    filterRows,
    renderCard,
    openCreate,
    handleListClick,
  });
})(window);
