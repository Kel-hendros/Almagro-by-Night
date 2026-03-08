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

  function recapScreen() {
    return global.ABNShared?.recapScreen || null;
  }

  async function init(config) {
    const {
      chronicleId,
      currentPlayerId,
      isNarrator,
      initialRecapId,
      previewLines,
      onLastSessionRefresh,
    } = config;

    const RECAP_PAGE = 5;
    let recapOffset = 0;
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
      const meta = formatRecapMeta(recap);
      const truncated = previewLines(recap.body);

      const card = document.createElement("div");
      card.className = "cd-recap-card";
      card.dataset.recapId = recap.id;
      card.innerHTML = `
        <div class="cd-recap-info">
          <span class="cd-recap-title">${escapeHtml(recap.title)}</span>
          <span class="cd-recap-meta">${meta}</span>
          ${truncated ? `<p class="cd-recap-body">${escapeHtml(truncated)}</p>` : ""}
        </div>
      `;
      card.addEventListener("click", () => {
        void openRecapReader(recap.id);
      });
      return card;
    }

    async function loadRecaps(append) {
      const { data: recaps, error } = await supabase
        .from("session_recaps")
        .select("id, session_number, title, body, session_date")
        .eq("chronicle_id", chronicleId)
        .order("session_number", { ascending: false })
        .range(recapOffset, recapOffset + RECAP_PAGE - 1);

      if (error) {
        console.error("Error loading recaps:", error);
        if (!append) {
          sesionesList.innerHTML =
            '<span class="cd-card-muted">Error al cargar sesiones.</span>';
        }
        return;
      }

      if (!append) {
        sesionesList.innerHTML = "";
        allLoadedRecaps = [];
      }

      if (!recaps.length && !append) {
        sesionesList.innerHTML =
          '<span class="cd-card-muted">No hay sesiones registradas.</span>';
        sesionesMoreBtn.classList.add("hidden");
        return;
      }

      recaps.forEach((recap) => {
        allLoadedRecaps.push(recap);
        sesionesList.appendChild(renderRecapCard(recap));
      });

      sesionesMoreBtn.classList.toggle("hidden", recaps.length < RECAP_PAGE);
      recapOffset += recaps.length;
    }

    async function openRecapReader(recapId) {
      let recap = allLoadedRecaps.find((r) => r.id === recapId);
      if (!recap) {
        const { data, error } = await supabase
          .from("session_recaps")
          .select("id, session_number, title, body, session_date")
          .eq("chronicle_id", chronicleId)
          .eq("id", recapId)
          .maybeSingle();
        if (error || !data) return;
        recap = data;
        allLoadedRecaps.unshift(recap);
      }
      if (!recap) return;

      currentReaderRecapId = recapId;
      await recapScreen()?.showForChronicle?.({
        chronicleId,
        currentPlayerId,
        isNarrator,
        recapId: recap.id,
        recap,
        sequence: allLoadedRecaps,
        onNavigate: (nextId) => {
          void openRecapReader(nextId);
        },
        onSaved: async () => {
          recapOffset = 0;
          await loadRecaps(false);
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
          recapOffset = 0;
          await loadRecaps(false);
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

    sesionesMoreBtn?.addEventListener("click", () => {
      void loadRecaps(true);
    });

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

    await loadRecaps(false);
    if (initialRecapId) {
      await openRecapReader(initialRecapId);
    }

    return {
      refreshLastSessionCard,
      reloadRecaps: () => {
        recapOffset = 0;
        return loadRecaps(false);
      },
    };
  }

  ns.recaps = {
    init,
  };
})(window);
