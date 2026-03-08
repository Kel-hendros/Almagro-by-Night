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

  function renderNarratorCard(item) {
    const deliveries = Array.isArray(item.deliveries) ? item.deliveries : [];
    const deliveriesHtml = deliveries.length
      ? deliveries.map((delivery) => buildRecipientMarkup(delivery)).join("")
      : '<span class="muted">Sin destinatarios.</span>';
    const bodyPreview = String(item.body_markdown || "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 180);

    return `
      <article class="da-card da-card--clickable" data-document-id="${escapeHtml(item.id)}">
        ${item.image_signed_url
          ? `<div class="da-card-image-wrap">
               <img class="da-card-image" src="${escapeHtml(item.image_signed_url)}" alt="${escapeHtml(
                 item.title || "Revelación",
               )}">
             </div>`
          : ""}
        <div class="da-card-head">
          <h3>${escapeHtml(item.title || "Revelación")}</h3>
          <button
            type="button"
            class="btn-icon btn-icon--danger da-card-delete"
            data-document-id="${escapeHtml(item.id)}"
            title="Eliminar revelación"
            aria-label="Eliminar revelación"
          >
            <i data-lucide="trash-2"></i>
          </button>
        </div>
        <p class="da-meta">${escapeHtml(formatDateTime(item.created_at))}</p>
        ${renderTagsMarkup(item.tags)}
        <p class="da-preview">${escapeHtml(bodyPreview || "Sin descripción.")}</p>
        <div class="da-card-footer">
          <span class="da-recipient-badge">
            <i data-lucide="users"></i>
            <span>${deliveries.length}</span>
          </span>
          <div class="da-delivery-list">${deliveriesHtml}</div>
        </div>
      </article>
    `;
  }

  function renderPlayerCard(row) {
    const handout = row.handout || {};
    return `
      <article class="da-card da-card--clickable" data-document-id="${escapeHtml(row.id)}">
        <div class="da-card-head">
          <h3>${escapeHtml(handout.title || "Revelación")}</h3>
        </div>
        <p class="da-meta">Asociada: ${escapeHtml(formatDateTime(row.delivered_at))}</p>
        ${renderTagsMarkup(handout.tags)}
      </article>
    `;
  }

  async function fetchRows(ctx) {
    const handoutsApi = root.handouts;
    if (!handoutsApi || !ctx.chronicleId) return [];

    if (ctx.isNarrator) {
      return handoutsApi.listHandoutsByChronicle?.(ctx.chronicleId) || [];
    }

    if (!ctx.currentPlayerId) return [];
    return (
      (await handoutsApi.listPendingDeliveries?.({
        playerId: ctx.currentPlayerId,
        chronicleId: ctx.chronicleId,
      })) || []
    );
  }

  function filterRows(rows, query, ctx) {
    const source = Array.isArray(rows) ? rows : [];
    const normalizedQuery = String(query || "").trim().toLowerCase();
    if (!normalizedQuery) return source;

    if (ctx.isNarrator) {
      return source.filter((item) => {
        const title = String(item?.title || "").toLowerCase();
        const tags = Array.isArray(item?.tags) ? item.tags : [];
        return title.includes(normalizedQuery) || tags.some((tag) => String(tag).toLowerCase().includes(normalizedQuery));
      });
    }

    return source.filter((row) => {
      const handout = row?.handout || {};
      const title = String(handout.title || "").toLowerCase();
      const tags = Array.isArray(handout.tags) ? handout.tags : [];
      return title.includes(normalizedQuery) || tags.some((tag) => String(tag).toLowerCase().includes(normalizedQuery));
    });
  }

  function findNarratorRow(rows, documentId) {
    return (Array.isArray(rows) ? rows : []).find((row) => String(row?.id) === String(documentId)) || null;
  }

  function findPlayerRow(rows, documentId) {
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

      const row = findNarratorRow(rows, card.dataset.documentId);
      if (!row?.id || !revelationScreen?.showForPlayer) return true;
      revelationScreen.showForPlayer({
        revelationId: row.id,
        onSaved: () => helpers?.refresh?.(),
      });
      return true;
    }

    const card = event.target.closest("[data-document-id]");
    if (!card?.dataset.documentId) return false;
    const row = findPlayerRow(rows, card.dataset.documentId);
    const revelationId = row?.handout?.id || null;
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
    getSecondaryBackAction(ctx) {
      if (!ctx.isNarrator || !ctx.chronicleId) return null;
      return {
        label: "Volver a Sesión Activa",
        hash: `active-session?id=${encodeURIComponent(ctx.chronicleId)}`,
      };
    },
    canCreate(ctx) {
      return Boolean(ctx.isNarrator);
    },
    getPageSize(ctx) {
      return ctx.isNarrator ? 12 : 20;
    },
    getListLayout(ctx) {
      return ctx.isNarrator ? "grid" : "stack";
    },
    getEmptyMessage(ctx, { query }) {
      if (query) return "Sin resultados.";
      return ctx.isNarrator
        ? "Aún no hay revelaciones en esta crónica."
        : "No hay revelaciones asociadas.";
    },
    fetchRows,
    filterRows,
    renderCard(row, ctx) {
      return ctx.isNarrator ? renderNarratorCard(row) : renderPlayerCard(row);
    },
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
