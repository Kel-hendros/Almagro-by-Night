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

    function getRecapShareUrl(recapId) {
      const hash = `chronicle?id=${encodeURIComponent(chronicleId)}&recap=${encodeURIComponent(recapId)}`;
      return `${window.location.origin}${window.location.pathname}#${hash}`;
    }

    async function shareRecap(recapId) {
      if (!recapId) return;
      const shareUrl = getRecapShareUrl(recapId);
      try {
        if (navigator.clipboard?.writeText) {
          await navigator.clipboard.writeText(shareUrl);
          alert("Link copiado al portapapeles.");
          return;
        }
      } catch (error) {
        console.warn("Recaps: clipboard write failed", error);
      }
      window.prompt("Copiá este link:", shareUrl);
    }

    async function openRecapReader(recapId) {
      const ds = documentScreen();
      if (!ds) return;

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

      const actions = [
        {
          id: "share",
          kind: "icon",
          icon: "share-2",
          title: "Compartir",
          ariaLabel: "Compartir",
          onClick: () => {
            void shareRecap(recap.id);
          },
        },
      ];

      if (isNarrator) {
        actions.push(
          {
            id: "edit",
            kind: "icon",
            icon: "pencil",
            title: "Editar",
            ariaLabel: "Editar",
            onClick: () => {
              openRecapForm(recap);
            },
          },
          {
            id: "delete",
            kind: "icon",
            icon: "trash-2",
            title: "Eliminar",
            ariaLabel: "Eliminar",
            danger: true,
            onClick: async () => {
              if (!confirm("¿Eliminar este recuento de sesión? Esta acción no se puede deshacer.")) {
                return;
              }
              const { error } = await supabase
                .from("session_recaps")
                .delete()
                .eq("id", recap.id);
              if (error) {
                alert("Error al eliminar: " + error.message);
                return;
              }
              ds.close();
              recapOffset = 0;
              await loadRecaps(false);
              await refreshLastSessionCard();
            },
          },
        );
      }

      const idx = allLoadedRecaps.findIndex((r) => r.id === recap.id);
      const canGoPrev = idx < allLoadedRecaps.length - 1 && idx !== -1;
      const canGoNext = idx > 0;
      const footerActions = [
        {
          id: "prev",
          kind: "button",
          variant: canGoPrev ? "primary" : "ghost",
          label: "Anterior",
          disabled: !canGoPrev,
          onClick: () => {
            if (canGoPrev) {
              void openRecapReader(allLoadedRecaps[idx + 1].id);
            }
          },
        },
        {
          id: "next",
          kind: "button",
          variant: canGoNext ? "primary" : "ghost",
          label: "Siguiente",
          disabled: !canGoNext,
          onClick: () => {
            if (canGoNext) {
              void openRecapReader(allLoadedRecaps[idx - 1].id);
            }
          },
        },
      ];

      ds.open({
        docType: "recap",
        title: recap.title,
        subtitle: formatRecapMeta(recap),
        actions,
        footerActions,
        bodyClass: "doc-view-body",
        renderBody: (body) => {
          const card = document.createElement("div");
          card.className = "doc-view-card";
          card.innerHTML = `<div class="doc-markdown">${renderMarkdown(recap.body || "")}</div>`;
          body.appendChild(card);
        },
        onClosed: () => {
          currentReaderRecapId = null;
        },
      });

      if (window.lucide) {
        window.lucide.createIcons();
      }
    }

    function recapFormMarkup(recap) {
      const maxNum =
        allLoadedRecaps.length > 0
          ? Math.max(...allLoadedRecaps.map((row) => row.session_number || 0))
          : 0;

      const title = recap?.title || "";
      const number = recap?.session_number || maxNum + 1;
      const date = recap?.session_date || new Date().toISOString().split("T")[0];
      const body = recap?.body || "";

      return `
        <div class="doc-form-wrap">
          <div class="doc-form-group">
            <label class="doc-form-label" for="cd-recap-form-title">Título</label>
            <input type="text" id="cd-recap-form-title" class="doc-form-input" placeholder="Ej: Encuentro en el Barolo" value="${escapeHtml(title)}">
          </div>
          <div class="doc-form-row">
            <div class="doc-form-col doc-form-group">
              <label class="doc-form-label" for="cd-recap-form-number">Sesión Nº</label>
              <input type="number" id="cd-recap-form-number" class="doc-form-input" min="1" value="${escapeHtml(number)}">
            </div>
            <div class="doc-form-col doc-form-group">
              <label class="doc-form-label" for="cd-recap-form-date">Fecha</label>
              <input type="date" id="cd-recap-form-date" class="doc-form-input" value="${escapeHtml(date)}">
            </div>
          </div>
          <div class="doc-form-group doc-form-group--grow">
            <label class="doc-form-label" for="cd-recap-form-body">Crónica <span class="doc-form-hint">(soporta Markdown)</span></label>
            <textarea id="cd-recap-form-body" class="doc-form-textarea" placeholder="Relato de la sesión...">${escapeHtml(body)}</textarea>
          </div>
        </div>
      `;
    }

    function readRecapFormValues() {
      const title = document.getElementById("cd-recap-form-title")?.value.trim() || "";
      const number = parseInt(document.getElementById("cd-recap-form-number")?.value || "", 10);
      const date = document.getElementById("cd-recap-form-date")?.value || "";
      const body = document.getElementById("cd-recap-form-body")?.value.trim() || "";
      return { title, number, date, body };
    }

    function openRecapForm(recap) {
      const ds = documentScreen();
      if (!ds) return;

      editingRecapId = recap?.id || null;
      const heading = editingRecapId ? "Editar Recuento" : "Nuevo Recuento";

      let formApi = null;
      let saving = false;

      function syncSaveAction() {
        formApi?.updateAction("save", {
          label: saving ? "Guardando..." : "Guardar",
          disabled: saving,
        });
      }

      async function persistRecapForm() {
        if (saving) return;

        const { title, number, date, body } = readRecapFormValues();
        if (!title) {
          alert("El título es obligatorio.");
          return;
        }
        if (!number || number < 1) {
          alert("Número de sesión inválido.");
          return;
        }

        const payload = {
          chronicle_id: chronicleId,
          session_number: number,
          title,
          body: body || null,
          session_date: date || null,
          created_by: currentPlayerId,
        };

        saving = true;
        syncSaveAction();

        let error;
        if (editingRecapId) {
          const { created_by, ...updatePayload } = payload;
          ({ error } = await supabase
            .from("session_recaps")
            .update(updatePayload)
            .eq("id", editingRecapId));
        } else {
          ({ error } = await supabase.from("session_recaps").insert(payload));
        }

        saving = false;
        syncSaveAction();

        if (error) {
          alert("Error al guardar: " + error.message);
          return;
        }

        formApi?.close();
        recapOffset = 0;
        await loadRecaps(false);
        await refreshLastSessionCard();
      }

      formApi = ds.open({
        docType: "recap",
        title: heading,
        actions: [
          {
            id: "save",
            kind: "button",
            variant: "primary",
            label: "Guardar",
            onClick: () => {
              void persistRecapForm();
            },
          },
        ],
        bodyClass: "doc-form-body",
        renderBody: (body) => {
          body.innerHTML = recapFormMarkup(recap || null);
        },
        onClosed: () => {
          editingRecapId = null;
        },
      });

      document.getElementById("cd-recap-form-title")?.focus();
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
