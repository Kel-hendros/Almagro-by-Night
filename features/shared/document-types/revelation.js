(function initSharedRevelationDocumentType(global) {
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

  function renderSharedTagsMarkup(tags) {
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

  function formatDateTime(value) {
    if (!value) return "—";
    try {
      return new Date(value).toLocaleString("es-AR");
    } catch (_error) {
      return "—";
    }
  }

  function buildRecipientMarkup(delivery) {
    if (global.ABNCharacterChip?.buildChipMarkup) {
      return global.ABNCharacterChip.buildChipMarkup(delivery.recipient || delivery, {
        readonly: true,
        selected: true,
      });
    }

    return `<span class="abn-chip abn-chip--associated">${escapeHtml(
      delivery?.recipient?.character_name || delivery?.recipient?.name || "Personaje",
    )}</span>`;
  }

  function normalizeNarratorRow(item) {
    return {
      id: item.id,
      revelation_id: item.id,
      title: item.title || "Revelación",
      body_markdown: item.body_markdown || "",
      tags: Array.isArray(item.tags) ? item.tags : [],
      image_signed_url: item.image_signed_url || "",
      created_at: item.created_at || null,
      delivered_at: null,
      deliveries: Array.isArray(item.deliveries) ? item.deliveries : [],
    };
  }

  function normalizePlayerRow(row) {
    const handout = row?.handout || {};
    const revelationId = handout.id || row?.handout_id || row?.revelation_id || null;
    if (!revelationId) return null;

    return {
      id: revelationId,
      revelation_id: revelationId,
      title: handout.title || "Revelación",
      body_markdown: handout.body_markdown || "",
      tags: Array.isArray(handout.tags) ? handout.tags : [],
      image_signed_url: handout.image_signed_url || "",
      created_at: handout.created_at || null,
      delivered_at: row?.delivered_at || null,
      deliveries: [],
    };
  }

  function toPreviewText(markdown) {
    if (root.documentList?.buildPreviewText) {
      return root.documentList.buildPreviewText(markdown, { maxLines: 5 });
    }
    return String(markdown || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);
  }

  function buildDetailedListItemOptions(row, ctx) {
    const deliveries = Array.isArray(row?.deliveries) ? row.deliveries : [];
    const recipients = deliveries
      .map((delivery) => delivery?.recipient?.character_name || delivery?.recipient?.name || "")
      .map((value) => String(value || "").trim())
      .filter(Boolean);
    const metaParts = [];

    if (ctx?.isNarrator) {
      metaParts.push(formatDateTime(row?.created_at));
      if (recipients.length) metaParts.push(recipients.join(", "));
    } else {
      metaParts.push(`Asociada: ${formatDateTime(row?.delivered_at || row?.created_at)}`);
    }

    return {
      title: row?.title || "Revelación",
      meta: metaParts.filter(Boolean).join(" · "),
      tagsHtml: renderSharedTagsMarkup(row?.tags),
      preview: toPreviewText(row?.body_markdown || ""),
      image: row?.image_signed_url
        ? {
            src: row.image_signed_url,
            alt: row.title || "Revelación",
          }
        : null,
    };
  }

  function renderCard(row, ctx) {
    const deliveries = Array.isArray(row.deliveries) ? row.deliveries : [];
    const deliveriesHtml = deliveries.length
      ? deliveries.map((delivery) => buildRecipientMarkup(delivery)).join("")
      : '<span class="muted">Sin destinatarios.</span>';
    const bodyPreview = toPreviewText(row.body_markdown || "");
    const meta = ctx.isNarrator
      ? formatDateTime(row.created_at)
      : `Asociada: ${formatDateTime(row.delivered_at || row.created_at)}`;

    return `
      <article class="da-card da-card--clickable" data-document-id="${escapeHtml(row.id)}">
        ${row.image_signed_url
          ? `<div class="da-card-image-wrap">
               <img class="da-card-image" src="${escapeHtml(row.image_signed_url)}" alt="${escapeHtml(
                 row.title || "Revelación",
               )}">
             </div>`
          : ""}
        <div class="da-card-head">
          <h3>${escapeHtml(row.title || "Revelación")}</h3>
          ${ctx.isNarrator
            ? `<button
                 type="button"
                 class="btn-icon btn-icon--danger da-card-delete"
                 data-document-id="${escapeHtml(row.id)}"
                 title="Eliminar revelación"
                 aria-label="Eliminar revelación"
               >
                 <i data-lucide="trash-2"></i>
               </button>`
            : ""}
        </div>
        <p class="da-meta">${escapeHtml(meta)}</p>
        ${renderTagsMarkup(row.tags)}
        <p class="da-preview">${escapeHtml(bodyPreview || "Sin descripción.")}</p>
        ${ctx.isNarrator
          ? `<div class="da-card-footer">
               <div class="da-delivery-list">${deliveriesHtml}</div>
             </div>`
          : ""}
      </article>
    `;
  }

  async function fetchRows(ctx) {
    const handoutsApi = root.handouts;
    if (!handoutsApi || !ctx.chronicleId) return [];

    if (ctx.isNarrator) {
      const rows = await handoutsApi.listHandoutsByChronicle?.(ctx.chronicleId);
      return (Array.isArray(rows) ? rows : []).map(normalizeNarratorRow);
    }

    if (!ctx.currentPlayerId) return [];
    const deliveries = await handoutsApi.listPendingDeliveries?.({
        playerId: ctx.currentPlayerId,
        chronicleId: ctx.chronicleId,
      });
    return (Array.isArray(deliveries) ? deliveries : []).map(normalizePlayerRow).filter(Boolean);
  }

  function filterRows(rows, query, _ctx, filters = {}) {
    const source = Array.isArray(rows) ? rows : [];
    const normalizedQuery = String(query || "").trim().toLowerCase();
    const selectedTag = String(filters?.selectedTag || "").trim().toLowerCase();
    if (!normalizedQuery && !selectedTag) return source;

    return source.filter((row) => {
      const title = String(row?.title || "").toLowerCase();
      const tags = Array.isArray(row?.tags) ? row.tags : [];
      const matchesQuery =
        !normalizedQuery ||
        title.includes(normalizedQuery) ||
        tags.some((tag) => String(tag).toLowerCase().includes(normalizedQuery));
      const matchesTag =
        !selectedTag ||
        tags.some((tag) => {
          const normalizedTag = tagSystem()?.createTagKey
            ? tagSystem().createTagKey(tag)
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

  function findRow(rows, documentId) {
    return (Array.isArray(rows) ? rows : []).find((row) => String(row?.id) === String(documentId)) || null;
  }

  async function handleListClick(event, ctx, helpers) {
    const rows = Array.isArray(helpers?.rows) ? helpers.rows : [];
    const handoutsApi = root.handouts;
    const revelationScreen = root.revelationScreen;

    if (ctx.isNarrator) {
      const deleteBtn = event.target.closest(".da-card-delete");
      if (deleteBtn?.dataset.documentId) {
        const ok = await (root.modal?.confirm?.(
          "¿Eliminar esta revelación completa del archivo de crónica?",
        ) || Promise.resolve(false));
        if (!ok) return true;

        const { error } = await handoutsApi?.deleteHandout?.(deleteBtn.dataset.documentId);
        if (error) {
          global.alert(error.message || "No se pudo eliminar revelación.");
          return true;
        }
        await helpers?.refresh?.();
        return true;
      }

      const card = event.target.closest("[data-document-id]");
      if (!card?.dataset.documentId) return false;

      const row = findRow(rows, card.dataset.documentId);
      if (!row?.id || !revelationScreen?.showForPlayer) return true;
      revelationScreen.showForPlayer({
        revelationId: row.revelation_id || row.id,
        onSaved: () => helpers?.refresh?.(),
      });
      return true;
    }

    const card = event.target.closest("[data-document-id]");
    if (!card?.dataset.documentId) return false;
    const row = findRow(rows, card.dataset.documentId);
    const revelationId = row?.revelation_id || row?.id || null;
    if (!revelationId || !revelationScreen?.showForPlayer) return true;
    revelationScreen.showForPlayer({ revelationId });
    return true;
  }

  function subscribe(ctx, { onChange }) {
    if (ctx.isNarrator || !ctx.currentPlayerId) return null;
    return root.handouts?.subscribeDeliveriesForPlayer?.({
      playerId: ctx.currentPlayerId,
      onChange,
    }) || null;
  }

  function unsubscribe(subscription) {
    root.handouts?.unsubscribeChannel?.(subscription);
  }

  registry.register("revelation", {
    getArchiveTitle(ctx) {
      return `Archivo de Revelaciones · ${ctx.chronicle?.name || "Crónica"}`;
    },
    getArchiveSubtitle(ctx) {
      return ctx.isNarrator
        ? "Gestión completa para narrador"
        : "Tus revelaciones asociadas en esta crónica";
    },
    getSearchPlaceholder() {
      return "Buscar por nombre o tag...";
    },
    getCreateLabel() {
      return "Crear Revelación";
    },
    canCreate(ctx) {
      return Boolean(ctx.isNarrator);
    },
    getPageSize() {
      return 12;
    },
    getListLayout() {
      return "grid";
    },
    getEmptyMessage(ctx, { query }) {
      if (query) return "Sin resultados.";
      return ctx.isNarrator
        ? "Aún no hay revelaciones en esta crónica."
        : "No hay revelaciones asociadas.";
    },
    buildDetailedListItemOptions,
    fetchRows,
    filterRows,
    getTagFilterStats,
    renderCard,
    async openCreate(ctx, helpers) {
      if (!ctx.isNarrator || !ctx.chronicleId) return;
      root.revelationScreen?.openCreate?.({
        chronicleId: ctx.chronicleId,
        currentPlayerId: ctx.currentPlayerId,
        onSaved: () => helpers?.refresh?.(),
      });
    },
    handleListClick,
    subscribe,
    unsubscribe,
  });
})(window);
