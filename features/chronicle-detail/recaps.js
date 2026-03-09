(function initChronicleDetailRecaps(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  function monthNamesShort() {
    return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  }

  function formatRecapMeta(recap) {
    const mNames = monthNamesShort();
    let meta = `Sesión ${recap.session_number}`;
    if (recap.session_date) {
      const d = new Date(recap.session_date + "T00:00:00");
      meta += `  —  ${d.getDate()} ${mNames[d.getMonth()]} ${d.getFullYear()}`;
    }
    return meta;
  }

  function documentScreen() {
    return global.ABNShared?.documentScreen || null;
  }

  function documentList() {
    return global.ABNShared?.documentList || null;
  }

  function recapScreen() {
    return global.ABNShared?.recapScreen || null;
  }

  function recapAdapter() {
    return global.ABNShared?.documentTypes?.get?.("recap") || null;
  }

  async function init(config) {
    const {
      chronicleId,
      chronicleName,
      currentPlayerId,
      isNarrator,
      initialRecapId,
      listLimit,
      previewLines,
      onLastSessionRefresh,
    } = config;

    let allLoadedRecaps = [];
    let currentReaderRecapId = null;
    let editingRecapId = null;

    const sesionesList = document.getElementById("cd-sesiones-list");
    const sesionesMoreBtn = document.getElementById("cd-sesiones-more");
    const addRecapBtn = document.getElementById("cd-add-recap");
    const openArchiveBtn = document.getElementById("cd-open-recaps-archive");

    if (!sesionesList || !sesionesMoreBtn || !addRecapBtn) return;

    const existingSummaryOpenHandler = ns.__summaryOpenRecapHandler;
    if (existingSummaryOpenHandler) {
      window.removeEventListener("abn:chronicle-open-recap", existingSummaryOpenHandler);
    }

    if (isNarrator) {
      addRecapBtn.classList.remove("hidden");
    }

    function renderRecapCard(recap) {
      const listApi = documentList();
      const adapter = recapAdapter();
      const itemOptions = adapter?.buildDetailedListItemOptions?.(recap, {
        chronicleId,
        currentPlayerId,
        isNarrator,
      }) || {
        title: recap.title || "Recuento",
        meta: recapScreen()?.formatMeta?.(recap) || formatRecapMeta(recap),
        preview:
          typeof previewLines === "function"
            ? previewLines(recap.body, 5)
            : String(recap.body || "").trim(),
      };

      if (!listApi?.createItem) {
        const fallback = document.createElement("div");
        fallback.className = "cd-recap-card";
        fallback.dataset.recapId = recap.id;
        fallback.innerHTML = `
          <div class="cd-recap-info">
            <span class="cd-recap-title">${escapeHtml(itemOptions.title || recap.title)}</span>
            <span class="cd-recap-meta">${escapeHtml(itemOptions.meta || "")}</span>
            ${itemOptions.preview ? `<p class="cd-recap-body">${escapeHtml(itemOptions.preview)}</p>` : ""}
          </div>
        `;
        fallback.addEventListener("click", () => {
          void openRecapReader(recap.id);
        });
        return fallback;
      }

      return listApi.createItem({
        preset: "complete",
        variant: "detailed",
        title: itemOptions.title,
        meta: itemOptions.meta,
        preview: itemOptions.preview,
        tagsHtml: itemOptions.tagsHtml,
        image: itemOptions.image,
        dataAttrs: { "recap-id": recap.id },
        onActivate: () => {
          void openRecapReader(recap.id);
        },
      });
    }

    function getVisibleRecaps() {
      const listApi = documentList();
      if (!listApi?.getRecentRows) {
        return Array.isArray(allLoadedRecaps) ? allLoadedRecaps.slice(0, 5) : [];
      }
      return listApi.getRecentRows(allLoadedRecaps, {
        limit: listLimit,
        getCreatedAt: (recap) => recap?.created_at,
      });
    }

    function renderVisibleRecaps() {
      const visibleRecaps = getVisibleRecaps();
      sesionesList.removeAttribute("aria-busy");
      sesionesList.innerHTML = "";
      if (!visibleRecaps.length) {
        sesionesList.innerHTML =
          '<span class="cd-card-muted">No hay sesiones registradas.</span>';
        sesionesMoreBtn.classList.add("hidden");
        return;
      }

      documentList()?.applyPreset?.(sesionesList, "complete");
      visibleRecaps.forEach((recap) => {
        sesionesList.appendChild(renderRecapCard(recap));
      });
      sesionesMoreBtn.classList.add("hidden");
    }

    function renderLoadingState() {
      const listApi = documentList();
      if (!listApi?.renderSkeleton) {
        sesionesList.setAttribute("aria-busy", "true");
        sesionesList.innerHTML = '<span class="cd-card-muted">Cargando sesiones…</span>';
        return;
      }
      listApi.renderSkeleton(sesionesList, {
        preset: "complete",
        count: listLimit || 5,
      });
    }

    async function loadRecaps() {
      if (!allLoadedRecaps.length) {
        renderLoadingState();
      }

      const { data: recaps, error } = await supabase
        .from("session_recaps")
        .select("id, session_number, title, body, session_date, created_at")
        .eq("chronicle_id", chronicleId)
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error loading recaps:", error);
        sesionesList.removeAttribute("aria-busy");
        sesionesList.innerHTML =
          '<span class="cd-card-muted">Error al cargar sesiones.</span>';
        sesionesMoreBtn.classList.add("hidden");
        return;
      }

      allLoadedRecaps = Array.isArray(recaps) ? recaps : [];
      renderVisibleRecaps();
    }

    async function openRecapReader(recapId) {
      let recap = allLoadedRecaps.find((r) => r.id === recapId);
      if (!recap) {
        const { data, error } = await supabase
          .from("session_recaps")
          .select("id, session_number, title, body, session_date, created_at")
          .eq("chronicle_id", chronicleId)
          .eq("id", recapId)
          .maybeSingle();
        if (error || !data) return;
        recap = data;
        allLoadedRecaps = [recap, ...allLoadedRecaps.filter((row) => row.id !== recap.id)];
      }
      if (!recap) return;

      currentReaderRecapId = recapId;
      await recapScreen()?.showForChronicle?.({
        chronicleId,
        chronicleName,
        currentPlayerId,
        isNarrator,
        recapId: recap.id,
        recap,
        sequence: allLoadedRecaps,
        onNavigate: (nextId) => {
          void openRecapReader(nextId);
        },
        onSaved: async () => {
          await loadRecaps();
          await refreshLastSessionCard();
        },
        onClosed: () => {
          currentReaderRecapId = null;
        },
      });
    }

    function openRecapForm(recap) {
      editingRecapId = recap?.id || null;
      recapScreen()?.openForm?.({
        chronicleId,
        currentPlayerId,
        recap,
        existingRecaps: allLoadedRecaps,
        onSaved: async () => {
          editingRecapId = null;
          await loadRecaps();
          await refreshLastSessionCard();
        },
        onClosed: () => {
          editingRecapId = null;
        },
      });
    }

    async function refreshLastSessionCard() {
      if (typeof onLastSessionRefresh === "function") {
        await onLastSessionRefresh();
      }
    }

    sesionesMoreBtn?.classList.add("hidden");

    addRecapBtn?.addEventListener("click", () => {
      openRecapForm(null);
    });

    openArchiveBtn?.addEventListener("click", () => {
      window.location.hash = `document-archive?id=${encodeURIComponent(chronicleId)}&type=recap`;
    });

    const onSummaryOpenRecap = (event) => {
      const detail = event?.detail || {};
      if (String(detail.chronicleId) !== String(chronicleId)) return;
      if (!detail.recapId) return;
      void openRecapReader(detail.recapId);
    };

    ns.__summaryOpenRecapHandler = onSummaryOpenRecap;
    window.addEventListener("abn:chronicle-open-recap", onSummaryOpenRecap);

    await loadRecaps();
    if (initialRecapId) {
      await openRecapReader(initialRecapId);
    }

    return {
      refreshLastSessionCard,
      reloadRecaps: () => loadRecaps(),
    };
  }

  ns.recaps = {
    init,
  };
})(window);
