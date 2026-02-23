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

  async function init(config) {
    const {
      chronicleId,
      currentPlayerId,
      isNarrator,
      previewLines,
      recapReaderModal,
      recapFormModal,
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

    const readerOverlay = document.getElementById("modal-recap-reader");
    const readerTitle = document.getElementById("recap-reader-title");
    const readerMeta = document.getElementById("recap-reader-meta");
    const readerText = document.getElementById("recap-reader-text");
    const readerActions = document.getElementById("recap-reader-actions");
    const readerPrev = document.getElementById("recap-reader-prev");
    const readerNext = document.getElementById("recap-reader-next");

    const formOverlay = document.getElementById("modal-recap-form");
    const formHeading = document.getElementById("recap-form-heading");
    const formTitle = document.getElementById("recap-form-title");
    const formNumber = document.getElementById("recap-form-number");
    const formDate = document.getElementById("recap-form-date");
    const formBody = document.getElementById("recap-form-body");
    const formSave = document.getElementById("recap-form-save");

    if (!sesionesList || !sesionesMoreBtn || !addRecapBtn) return;

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
      card.addEventListener("click", () => openRecapReader(recap.id));
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

    function updateReaderNav() {
      const idx = allLoadedRecaps.findIndex((r) => r.id === currentReaderRecapId);
      if (readerPrev) readerPrev.disabled = idx >= allLoadedRecaps.length - 1;
      if (readerNext) readerNext.disabled = idx <= 0;
    }

    function openRecapReader(recapId) {
      const recap = allLoadedRecaps.find((r) => r.id === recapId);
      if (!recap) return;

      currentReaderRecapId = recapId;
      readerTitle.textContent = recap.title;
      readerMeta.textContent = formatRecapMeta(recap);
      readerText.innerHTML = renderMarkdown(recap.body || "");

      if (isNarrator) {
        readerActions.classList.remove("hidden");
      } else {
        readerActions.classList.add("hidden");
      }

      updateReaderNav();
      recapReaderModal.open();
      if (window.lucide) {
        lucide.createIcons({ nodes: [readerOverlay] });
      }
    }

    function closeRecapReader() {
      recapReaderModal.close();
      currentReaderRecapId = null;
    }

    function openRecapForm(recap) {
      if (recap) {
        editingRecapId = recap.id;
        formHeading.textContent = "Editar Recuento";
        formTitle.value = recap.title || "";
        formNumber.value = recap.session_number || "";
        formDate.value = recap.session_date || "";
        formBody.value = recap.body || "";
      } else {
        editingRecapId = null;
        formHeading.textContent = "Nuevo Recuento";
        const maxNum =
          allLoadedRecaps.length > 0
            ? Math.max(...allLoadedRecaps.map((r) => r.session_number))
            : 0;
        formTitle.value = "";
        formNumber.value = maxNum + 1;
        formDate.value = new Date().toISOString().split("T")[0];
        formBody.value = "";
      }

      recapFormModal.open();
      formTitle.focus();
      if (window.lucide) {
        lucide.createIcons({ nodes: [formOverlay] });
      }
    }

    function closeRecapForm() {
      recapFormModal.close();
      editingRecapId = null;
    }

    async function refreshLastSessionCard() {
      if (typeof onLastSessionRefresh === "function") {
        await onLastSessionRefresh();
      }
    }

    async function persistRecapForm() {
      const title = formTitle.value.trim();
      const sessionNum = parseInt(formNumber.value, 10);
      if (!title) {
        alert("El título es obligatorio.");
        return;
      }
      if (!sessionNum || sessionNum < 1) {
        alert("Número de sesión inválido.");
        return;
      }

      const payload = {
        chronicle_id: chronicleId,
        session_number: sessionNum,
        title,
        body: formBody.value.trim() || null,
        session_date: formDate.value || null,
        created_by: currentPlayerId,
      };

      formSave.disabled = true;
      formSave.textContent = "Guardando...";

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

      formSave.disabled = false;
      formSave.textContent = "Guardar";

      if (error) {
        alert("Error al guardar: " + error.message);
        return;
      }

      closeRecapForm();
      recapOffset = 0;
      await loadRecaps(false);
      await refreshLastSessionCard();
    }

    sesionesMoreBtn?.addEventListener("click", () => loadRecaps(true));
    addRecapBtn?.addEventListener("click", () => openRecapForm(null));

    readerPrev?.addEventListener("click", () => {
      const idx = allLoadedRecaps.findIndex((r) => r.id === currentReaderRecapId);
      if (idx < allLoadedRecaps.length - 1) {
        openRecapReader(allLoadedRecaps[idx + 1].id);
      }
    });

    readerNext?.addEventListener("click", () => {
      const idx = allLoadedRecaps.findIndex((r) => r.id === currentReaderRecapId);
      if (idx > 0) {
        openRecapReader(allLoadedRecaps[idx - 1].id);
      }
    });

    const editBtn = document.getElementById("recap-reader-edit");
    if (editBtn) {
      editBtn.addEventListener("click", () => {
        const recap = allLoadedRecaps.find((r) => r.id === currentReaderRecapId);
        if (!recap) return;
        closeRecapReader();
        openRecapForm(recap);
      });
    }

    const deleteBtn = document.getElementById("recap-reader-delete");
    if (deleteBtn) {
      deleteBtn.addEventListener("click", async () => {
        if (!confirm("¿Eliminar este recuento de sesión? Esta acción no se puede deshacer.")) {
          return;
        }
        const { error } = await supabase
          .from("session_recaps")
          .delete()
          .eq("id", currentReaderRecapId);
        if (error) {
          alert("Error al eliminar: " + error.message);
          return;
        }

        closeRecapReader();
        recapOffset = 0;
        await loadRecaps(false);
        await refreshLastSessionCard();
      });
    }

    formSave?.addEventListener("click", persistRecapForm);

    await loadRecaps(false);

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
