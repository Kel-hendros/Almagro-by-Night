(function initChronicleDetailMesa(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;
  const LOCALE = document?.documentElement?.lang || "es-AR";
  const TEXT = {
    loading: "Cargando encuentros...",
    loadError: "No se pudieron cargar los encuentros.",
    emptyNarrator:
      "No hay encuentros todavía. Crea el primero para iniciar la mesa virtual.",
    emptyPlayer: "No hay encuentros disponibles en juego para tu rol.",
    defaultEncounterName: "Encuentro",
    openEncounter: "Abrir encuentro",
    createPrompt: "Nombre del nuevo encuentro:",
    creating: "Creando...",
    createError: "No se pudo crear el encuentro.",
    noDate: "Sin fecha",
  };

  function normalizeEncounterStatus(status) {
    if (status === "active") return "in_game";
    if (
      status === "wip" ||
      status === "ready" ||
      status === "in_game" ||
      status === "archived"
    ) {
      return status;
    }
    return "wip";
  }

  function encounterStatusLabel(status) {
    const normalized = normalizeEncounterStatus(status);
    const labels = {
      wip: "WIP",
      ready: "Listo",
      in_game: "En juego",
      archived: "Archivado",
    };
    return labels[normalized] || "WIP";
  }

  function formatEncounterDate(isoDate) {
    if (!isoDate) return TEXT.noDate;
    const d = new Date(isoDate);
    if (Number.isNaN(d.getTime())) return TEXT.noDate;
    return d.toLocaleDateString(LOCALE);
  }

  async function init(config) {
    const { chronicleId, isNarrator, currentUserId } = config;

    const listEl = document.getElementById("cd-mesa-encounters-list");
    const createBtn = document.getElementById("cd-mesa-create-encounter");
    if (!listEl || !createBtn) return;

    if (isNarrator) {
      createBtn.classList.remove("hidden");
    } else {
      createBtn.classList.add("hidden");
    }

    async function loadEncounters() {
      listEl.innerHTML = `<span class="cd-card-muted">${TEXT.loading}</span>`;
      const { data, error } = await service().fetchEncountersForChronicle({
        chronicleId,
        isNarrator,
      });

      if (error) {
        console.error("chronicle-detail.mesa.loadEncounters:", error);
        listEl.innerHTML = `<span class="cd-card-muted">${TEXT.loadError}</span>`;
        return;
      }

      const encounters = data || [];
      if (!encounters.length) {
        listEl.innerHTML = `<span class="cd-card-muted">${
          isNarrator ? TEXT.emptyNarrator : TEXT.emptyPlayer
        }</span>`;
        return;
      }

      listEl.innerHTML = "";
      encounters.forEach((encounter) => {
        const status = normalizeEncounterStatus(encounter.status);
        const card = document.createElement("article");
        card.className = "cd-mesa-card";
        card.innerHTML = `
          <div class="cd-mesa-card-head">
            <h4 class="cd-mesa-card-title">${escapeHtml(
              encounter.name || TEXT.defaultEncounterName
            )}</h4>
            <span class="cd-mesa-status ${status}">${encounterStatusLabel(status)}</span>
          </div>
          <p class="cd-mesa-card-meta">${formatEncounterDate(encounter.created_at)}</p>
          <div class="cd-mesa-card-actions">
            <button type="button" class="btn btn--primary cd-mesa-open-btn" data-encounter-id="${encounter.id}">
              ${TEXT.openEncounter}
            </button>
          </div>
        `;

        card
          .querySelector(".cd-mesa-open-btn")
          ?.addEventListener("click", () => {
            window.location.hash = `active-encounter?id=${encodeURIComponent(
              encounter.id
            )}`;
          });

        listEl.appendChild(card);
      });
    }

    async function createEncounter() {
      if (!isNarrator) return;
      const name = window.prompt(TEXT.createPrompt);
      const cleanName = (name || "").trim();
      if (!cleanName) return;

      createBtn.disabled = true;
      const previousLabel = createBtn.textContent;
      createBtn.textContent = TEXT.creating;
      try {
        const { data, error } = await service().createEncounter({
          chronicleId,
          userId: currentUserId,
          name: cleanName,
        });
        if (error || !data) {
          alert(TEXT.createError);
          return;
        }
        await loadEncounters();
      } finally {
        createBtn.disabled = false;
        createBtn.textContent = previousLabel;
      }
    }

    createBtn.addEventListener("click", () => {
      void createEncounter();
    });

    await loadEncounters();
    return {
      reload: loadEncounters,
    };
  }

  ns.mesa = {
    init,
  };
})(window);
