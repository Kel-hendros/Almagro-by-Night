(function initSharedRecapDocumentType(global) {
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

  function previewLines(text, maxLines = 3) {
    const plain = String(text || "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
    const lines = plain.split("\n").filter((line) => line.trim());
    const preview = lines.slice(0, maxLines).join(" ");
    return lines.length > maxLines ? `${preview}…` : preview;
  }

  function recapScreen() {
    return root.recapScreen || null;
  }

  async function fetchRows(ctx) {
    if (!global.supabase || !ctx.chronicleId) return [];

    const { data, error } = await global.supabase
      .from("session_recaps")
      .select("id, session_number, title, body, session_date")
      .eq("chronicle_id", ctx.chronicleId)
      .order("session_number", { ascending: false });

    if (error) {
      console.error("RecapDocumentType: no se pudieron cargar recaps", error);
      return [];
    }

    return Array.isArray(data) ? data : [];
  }

  function filterRows(rows, query) {
    const source = Array.isArray(rows) ? rows : [];
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return source;

    return source.filter((row) => {
      const haystack = `${row.title || ""} ${row.body || ""} ${row.session_number || ""}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }

  function renderCard(row) {
    const meta = recapScreen()?.formatMeta?.(row) || `Sesión ${row.session_number || "—"}`;
    const preview = previewLines(row.body || "");

    return `
      <article class="da-card da-card--clickable" data-document-id="${escapeHtml(row.id)}">
        <div class="da-card-head">
          <h3>${escapeHtml(row.title || "Recuento")}</h3>
        </div>
        <p class="da-meta">${escapeHtml(meta)}</p>
        ${preview ? `<p class="da-preview">${escapeHtml(preview)}</p>` : ""}
      </article>
    `;
  }

  async function openCreate(ctx, helpers) {
    if (!ctx.isNarrator || !ctx.chronicleId || !ctx.currentPlayerId) return;
    recapScreen()?.openForm?.({
      chronicleId: ctx.chronicleId,
      currentPlayerId: ctx.currentPlayerId,
      existingRecaps: helpers?.rows || [],
      onSaved: async () => {
        await helpers?.refresh?.();
      },
    });
  }

  async function handleListClick(event, ctx, helpers) {
    const card = event.target.closest("[data-document-id]");
    if (!card?.dataset.documentId) return false;

    const sequence = Array.isArray(helpers?.rows) ? helpers.rows : [];
    const allRows = Array.isArray(helpers?.allRows) ? helpers.allRows : sequence;
    const recap = allRows.find((row) => String(row?.id) === String(card.dataset.documentId)) || null;

    await recapScreen()?.showForChronicle?.({
      chronicleId: ctx.chronicleId,
      currentPlayerId: ctx.currentPlayerId,
      isNarrator: ctx.isNarrator,
      recapId: card.dataset.documentId,
      recap,
      sequence,
      onNavigate: (nextId) => {
        void recapScreen()?.showForChronicle?.({
          chronicleId: ctx.chronicleId,
          currentPlayerId: ctx.currentPlayerId,
          isNarrator: ctx.isNarrator,
          recapId: nextId,
          recap: allRows.find((row) => String(row?.id) === String(nextId)) || null,
          sequence,
          onSaved: async () => {
            await helpers?.refresh?.();
          },
        });
      },
      onSaved: async () => {
        await helpers?.refresh?.();
      },
    });
    return true;
  }

  registry.register("recap", {
    getArchiveTitle(ctx) {
      return `Archivo de Recuentos · ${ctx.chronicle?.name || "Crónica"}`;
    },
    getArchiveSubtitle(ctx) {
      return ctx.isNarrator
        ? "Historial completo de sesiones con edición para narrador"
        : "Historial de sesiones de esta crónica";
    },
    getSearchPlaceholder() {
      return "Buscar por título, cuerpo o número de sesión...";
    },
    getCreateLabel() {
      return "Nuevo Recuento";
    },
    canCreate(ctx) {
      return Boolean(ctx.isNarrator);
    },
    getPageSize() {
      return 15;
    },
    getListLayout() {
      return "stack";
    },
    getEmptyMessage(_ctx, { query }) {
      return query ? "Sin resultados." : "No hay recuentos registrados.";
    },
    fetchRows,
    filterRows,
    renderCard,
    openCreate,
    handleListClick,
  });
})(window);
