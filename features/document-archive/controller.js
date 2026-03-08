(function initDocumentArchiveController(global) {
  const ns = (global.ABNDocumentArchive = global.ABNDocumentArchive || {});
  const service = () => ns.service;
  const view = () => ns.view;

  const state = {
    type: null,
    adapter: null,
    chronicleId: null,
    chronicle: null,
    currentPlayerId: null,
    isNarrator: false,
    rows: [],
    queryFilteredRows: [],
    filteredRows: [],
    page: 1,
    query: "",
    selectedTag: null,
    selectedTagLabel: "",
    subscription: null,
    listenersBound: false,
  };

  function documentTypeRegistry() {
    return global.ABNShared?.documentTypes || null;
  }

  function buildChronicleHash() {
    return `chronicle?id=${encodeURIComponent(state.chronicleId)}`;
  }

  function buildAdapterContext() {
    return {
      type: state.type,
      chronicleId: state.chronicleId,
      chronicle: state.chronicle,
      currentPlayerId: state.currentPlayerId,
      isNarrator: state.isNarrator,
    };
  }

  function clampPage(totalPages) {
    const normalizedTotalPages = Math.max(1, Number(totalPages || 1));
    state.page = Math.min(Math.max(1, state.page), normalizedTotalPages);
    return normalizedTotalPages;
  }

  function renderCurrentPage() {
    const adapter = state.adapter;
    const currentView = view();
    if (!adapter || !currentView) return;

    const ctx = buildAdapterContext();
    const pageSize = Math.max(1, Number(adapter.getPageSize?.(ctx) || 12));
    const totalRows = state.filteredRows.length;
    const totalPages = clampPage(Math.ceil(totalRows / pageSize) || 1);
    const offset = (state.page - 1) * pageSize;
    const visibleRows = state.filteredRows.slice(offset, offset + pageSize);
    const cardsHtml =
      adapter.renderList?.(visibleRows, ctx, {
        page: state.page,
        pageSize,
        totalRows,
        totalPages,
        query: state.query,
        filteredRows: state.filteredRows,
        allRows: state.rows,
      }) ||
      visibleRows.map((row) => adapter.renderCard?.(row, ctx) || "").join("");

    currentView.renderCards({
      cardsHtml,
      emptyMessage: adapter.getEmptyMessage?.(ctx, { query: state.query }) || "Sin documentos.",
      layout: adapter.getListLayout?.(ctx) || "stack",
    });

    const meta = totalRows
      ? `${totalRows} documento${totalRows === 1 ? "" : "s"}`
      : adapter.getEmptyMessage?.(ctx, { query: state.query }) || "Sin documentos.";
    currentView.setResultsMeta(meta);
    currentView.setPagination({ page: state.page, totalPages });
    renderTagFilters();
  }

  function applyFilters() {
    const adapter = state.adapter;
    if (!adapter) return;

    const ctx = buildAdapterContext();
    const source = Array.isArray(state.rows) ? state.rows : [];
    const queryFiltered = adapter.filterRows?.(source, state.query, ctx, {
      selectedTag: null,
      selectedTagLabel: "",
    });
    state.queryFilteredRows = Array.isArray(queryFiltered) ? queryFiltered : source;

    const filtered = adapter.filterRows?.(source, state.query, ctx, {
      selectedTag: state.selectedTag,
      selectedTagLabel: state.selectedTagLabel,
    });
    state.filteredRows = Array.isArray(filtered) ? filtered : source;
  }

  function renderTagFilters() {
    const adapter = state.adapter;
    const currentView = view();
    const tagSystem = global.ABNShared?.tags;
    if (!currentView?.renderTagFilters) return;

    if (!adapter?.getTagFilterStats || !tagSystem?.renderFilterBar) {
      currentView.renderTagFilters({ hidden: true });
      return;
    }

    const stats = adapter.getTagFilterStats(
      Array.isArray(state.queryFilteredRows) ? state.queryFilteredRows : [],
      buildAdapterContext(),
      {
        selectedTag: state.selectedTag,
        selectedTagLabel: state.selectedTagLabel,
      },
    );

    currentView.renderTagFilters({
      stats: Array.isArray(stats) ? stats : [],
      selectedTag: state.selectedTag,
      hidden: !Array.isArray(stats) || !stats.length,
      onToggle: (tagKey, tagLabel) => {
        if (!tagKey) return;
        if (state.selectedTag === tagKey) {
          state.selectedTag = null;
          state.selectedTagLabel = "";
        } else {
          state.selectedTag = tagKey;
          state.selectedTagLabel = tagLabel || tagKey;
        }
        state.page = 1;
        applyFilters();
        renderCurrentPage();
      },
    });
  }

  async function refresh() {
    const adapter = state.adapter;
    if (!adapter?.fetchRows) return;

    state.rows = await adapter.fetchRows(buildAdapterContext());
    applyFilters();
    renderCurrentPage();
  }

  function stopRealtime() {
    if (!state.subscription) return;
    try {
      state.adapter?.unsubscribe?.(state.subscription);
    } catch (error) {
      console.warn("DocumentArchive: realtime unsubscribe error", error);
    }
    state.subscription = null;
  }

  function startRealtime() {
    stopRealtime();
    if (!state.adapter?.subscribe) return;

    state.subscription = state.adapter.subscribe(buildAdapterContext(), {
      onChange: () => {
        void refresh();
      },
    });
  }

  async function handleListClick(event) {
    if (!state.adapter?.handleListClick) return;
    const handled = await state.adapter.handleListClick(event, buildAdapterContext(), {
      rows: state.filteredRows,
      allRows: state.rows,
      refresh,
    });
    if (handled) {
      event.preventDefault();
      event.stopPropagation();
    }
  }

  function bindActions() {
    if (state.listenersBound) return;

    document.getElementById("da-back-chronicle")?.addEventListener("click", () => {
      if (!state.chronicleId) return;
      window.location.hash = buildChronicleHash();
    });

    document.getElementById("da-back-secondary")?.addEventListener("click", (event) => {
      const hash = event.currentTarget?.dataset?.navHash || "";
      if (!hash) return;
      window.location.hash = hash;
    });

    document.getElementById("da-open-create")?.addEventListener("click", () => {
      state.adapter?.openCreate?.(buildAdapterContext(), {
        refresh,
        rows: state.rows,
        filteredRows: state.filteredRows,
      });
    });

    document.getElementById("da-search")?.addEventListener("input", () => {
      state.query = view().getSearchQuery();
      state.page = 1;
      applyFilters();
      renderCurrentPage();
    });

    document.getElementById("da-page-prev")?.addEventListener("click", () => {
      state.page = Math.max(1, state.page - 1);
      renderCurrentPage();
    });

    document.getElementById("da-page-next")?.addEventListener("click", () => {
      state.page += 1;
      renderCurrentPage();
    });

    document.getElementById("da-list")?.addEventListener("click", (event) => {
      void handleListClick(event);
    });

    state.listenersBound = true;
  }

  function unbindActions() {
    if (!state.listenersBound) return;

    const backChronicle = document.getElementById("da-back-chronicle");
    const backSecondary = document.getElementById("da-back-secondary");
    const openCreate = document.getElementById("da-open-create");
    const search = document.getElementById("da-search");
    const prevBtn = document.getElementById("da-page-prev");
    const nextBtn = document.getElementById("da-page-next");
    const list = document.getElementById("da-list");

    if (backChronicle) backChronicle.replaceWith(backChronicle.cloneNode(true));
    if (backSecondary) backSecondary.replaceWith(backSecondary.cloneNode(true));
    if (openCreate) openCreate.replaceWith(openCreate.cloneNode(true));
    if (search) search.replaceWith(search.cloneNode(true));
    if (prevBtn) prevBtn.replaceWith(prevBtn.cloneNode(true));
    if (nextBtn) nextBtn.replaceWith(nextBtn.cloneNode(true));
    if (list) list.replaceWith(list.cloneNode(false));

    state.listenersBound = false;
  }

  async function initPage() {
    destroyPage();

    const ctx = service().getHashContext();
    if (!ctx.chronicleId) {
      window.location.hash = "chronicles";
      return;
    }

    state.chronicleId = ctx.chronicleId;
    state.type = String(ctx.type || "").trim().toLowerCase();
    localStorage.setItem("currentChronicleId", state.chronicleId);

    const adapter = documentTypeRegistry()?.get?.(state.type) || null;
    if (!adapter) {
      global.alert("Este archivo todavía no está disponible.");
      window.location.hash = buildChronicleHash();
      return;
    }
    state.adapter = adapter;
    view().setArchiveType(state.type);

    const session = await service().getSession();
    if (!session) {
      window.location.hash = "welcome";
      return;
    }

    const currentPlayer = await service().getCurrentPlayerByUserId(session.user.id);
    state.currentPlayerId = currentPlayer?.id || null;

    const { data: chronicle, error } = await service().getChronicle(state.chronicleId);
    if (error || !chronicle) {
      global.alert("No se pudo abrir este archivo.");
      window.location.hash = buildChronicleHash();
      return;
    }

    state.chronicle = chronicle;

    const directParticipation = state.currentPlayerId
      ? await service().getParticipation(state.chronicleId, state.currentPlayerId)
      : null;
    const fallbackParticipation = await service().getParticipationByUserId(
      state.chronicleId,
      session.user.id,
    );
    const participation = directParticipation || fallbackParticipation;

    if (!directParticipation && fallbackParticipation?.player_id) {
      state.currentPlayerId = fallbackParticipation.player_id;
    }

    state.isNarrator =
      participation?.role === "narrator" ||
      (state.currentPlayerId ? chronicle.creator_id === state.currentPlayerId : false);

    if (!state.isNarrator && !participation) {
      global.alert("No tienes acceso a este archivo.");
      window.location.hash = buildChronicleHash();
      return;
    }

    view().setHeader({
      title: adapter.getArchiveTitle?.(buildAdapterContext()) || "Archivo",
      subtitle: adapter.getArchiveSubtitle?.(buildAdapterContext()) || "",
    });
    view().setSearchPlaceholder(adapter.getSearchPlaceholder?.(buildAdapterContext()) || "Buscar...");
    view().setCreateAction({
      visible: Boolean(adapter.canCreate?.(buildAdapterContext())),
      label: adapter.getCreateLabel?.(buildAdapterContext()) || "Crear",
    });
    view().setSecondaryBackAction(adapter.getSecondaryBackAction?.(buildAdapterContext()) || null);

    bindActions();
    state.query = view().getSearchQuery();
    await refresh();
    startRealtime();
  }

  function destroyPage() {
    stopRealtime();
    unbindActions();
    view()?.setArchiveType?.(null);
    view()?.renderTagFilters?.({ hidden: true });

    state.type = null;
    state.adapter = null;
    state.chronicleId = null;
    state.chronicle = null;
    state.currentPlayerId = null;
    state.isNarrator = false;
    state.rows = [];
    state.queryFilteredRows = [];
    state.filteredRows = [];
    state.page = 1;
    state.query = "";
    state.selectedTag = null;
    state.selectedTagLabel = "";
  }

  ns.controller = {
    initPage,
    destroyPage,
  };
})(window);
