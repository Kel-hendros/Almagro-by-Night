(function initDocumentArchiveView(global) {
  const ns = (global.ABNDocumentArchive = global.ABNDocumentArchive || {});

  function setHeader({ title, subtitle }) {
    const titleEl = document.getElementById("da-title");
    const subtitleEl = document.getElementById("da-subtitle");
    if (titleEl) titleEl.textContent = title || "Archivo";
    if (subtitleEl) subtitleEl.textContent = subtitle || "";
  }

  function setSearchPlaceholder(value) {
    const input = document.getElementById("da-search");
    if (input) input.placeholder = value || "Buscar...";
  }

  function setSecondaryBackAction(action) {
    const button = document.getElementById("da-back-secondary");
    if (!button) return;

    if (!action?.hash) {
      button.classList.add("hidden");
      button.dataset.navHash = "";
      button.textContent = "";
      return;
    }

    button.classList.remove("hidden");
    button.dataset.navHash = action.hash;
    button.textContent = action.label || "Volver";
  }

  function setCreateAction({ visible, label }) {
    const button = document.getElementById("da-open-create");
    if (!button) return;
    button.classList.toggle("hidden", !visible);
    button.textContent = label || "Crear";
  }

  function setListLayout(layout) {
    const host = document.getElementById("da-list");
    if (!host) return;
    host.classList.toggle("da-list--grid", layout === "grid");
    host.classList.toggle("da-list--stack", layout !== "grid");
  }

  function renderCards({ cardsHtml, emptyMessage, layout }) {
    const host = document.getElementById("da-list");
    if (!host) return;

    setListLayout(layout);

    if (!cardsHtml) {
      host.innerHTML = `<p class="muted">${emptyMessage || "Sin documentos."}</p>`;
    } else {
      host.innerHTML = cardsHtml;
    }

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [host] });
    }
  }

  function setResultsMeta(text) {
    const el = document.getElementById("da-results-meta");
    if (el) el.textContent = text || "";
  }

  function setPagination({ page, totalPages }) {
    const wrap = document.getElementById("da-pagination");
    const label = document.getElementById("da-pagination-label");
    const prevBtn = document.getElementById("da-page-prev");
    const nextBtn = document.getElementById("da-page-next");

    const normalizedTotalPages = Math.max(1, Number(totalPages || 1));
    const normalizedPage = Math.min(Math.max(1, Number(page || 1)), normalizedTotalPages);

    if (wrap) wrap.classList.toggle("hidden", normalizedTotalPages <= 1);
    if (label) label.textContent = `Página ${normalizedPage} de ${normalizedTotalPages}`;
    if (prevBtn) prevBtn.disabled = normalizedPage <= 1;
    if (nextBtn) nextBtn.disabled = normalizedPage >= normalizedTotalPages;
  }

  function getSearchQuery() {
    return document.getElementById("da-search")?.value?.trim() || "";
  }

  ns.view = {
    setHeader,
    setSearchPlaceholder,
    setSecondaryBackAction,
    setCreateAction,
    renderCards,
    setResultsMeta,
    setPagination,
    getSearchQuery,
  };
})(window);
