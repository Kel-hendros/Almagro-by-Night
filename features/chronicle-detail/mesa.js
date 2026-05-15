(function initChronicleDetailMesa(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;
  const TEXT = {
    loading: "Cargando encuentros...",
    loadError: "No se pudieron cargar los encuentros.",
    emptyNarratorActive:
      "No hay encuentros activos todavía. Crea el primero para iniciar la mesa virtual.",
    emptyNarratorArchived: "No hay encuentros archivados.",
    emptyPlayer: "No hay encuentros disponibles en juego para tu rol.",
    defaultEncounterName: "Encuentro",
    createPrompt: "Nombre del nuevo encuentro:",
    creating: "Creando...",
    createError: "No se pudo crear el encuentro.",
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

  function statusOptionsMarkup(currentStatus) {
    const normalized = normalizeEncounterStatus(currentStatus);
    const statuses = ["wip", "ready", "in_game", "archived"];
    return statuses
      .map((status) => {
        const selected = status === normalized ? " selected" : "";
        return `<option value="${status}"${selected}>${encounterStatusLabel(
          status,
        )}</option>`;
      })
      .join("");
  }

  async function init(config) {
    const { chronicleId, isNarrator, currentUserId, isChronicleOwner } = config;

    const listEl = document.getElementById("cd-mesa-encounters-list");
    const createBtn = document.getElementById("cd-mesa-create-encounter");
    const filtersWrap = document.getElementById("cd-mesa-filters");
    const filterActiveBtn = document.getElementById("cd-mesa-filter-active");
    const filterArchivedBtn = document.getElementById("cd-mesa-filter-archived");
    if (!listEl || !createBtn || !filtersWrap || !filterActiveBtn || !filterArchivedBtn)
      return;

    let allEncounters = [];
    let currentFilter = "active";

    if (isNarrator) {
      createBtn.classList.remove("hidden");
      filtersWrap.classList.remove("hidden");
    } else {
      createBtn.classList.add("hidden");
      filtersWrap.classList.add("hidden");
    }

    function setFilter(nextFilter) {
      currentFilter = nextFilter === "archived" ? "archived" : "active";
      filterActiveBtn.classList.toggle("active", currentFilter === "active");
      filterArchivedBtn.classList.toggle("active", currentFilter === "archived");
      renderEncounters();
    }

    function openEncounter(encounterId) {
      window.location.hash = `active-encounter?id=${encodeURIComponent(encounterId)}`;
    }

    function renderEncounters() {
      let encounters = allEncounters;
      if (isNarrator) {
        encounters =
          currentFilter === "archived"
            ? allEncounters.filter(
                (encounter) =>
                  normalizeEncounterStatus(encounter.status) === "archived",
              )
            : allEncounters.filter(
                (encounter) =>
                  normalizeEncounterStatus(encounter.status) !== "archived",
              );
      }

      if (!encounters.length) {
        listEl.innerHTML = `<span class="cd-card-muted">${
          isNarrator
            ? currentFilter === "archived"
              ? TEXT.emptyNarratorArchived
              : TEXT.emptyNarratorActive
            : TEXT.emptyPlayer
        }</span>`;
        return;
      }

      listEl.innerHTML = "";
      encounters.forEach((encounter) => {
        const status = normalizeEncounterStatus(encounter.status);
        const canDeleteEncounter =
          isChronicleOwner || encounter.user_id === currentUserId;
        const card = document.createElement("article");
        card.className = "cd-mesa-card";
        card.tabIndex = 0;
        card.setAttribute("role", "button");
        card.setAttribute(
          "aria-label",
          `Abrir ${encounter.name || TEXT.defaultEncounterName}`,
        );
        const statusControl = isNarrator
          ? `<select class="cd-mesa-status-select ${status}" data-encounter-id="${
              encounter.id
            }">${statusOptionsMarkup(status)}</select>`
          : `<span class="cd-mesa-status ${status}">${encounterStatusLabel(
              status,
            )}</span>`;
        const deleteControl = isNarrator && canDeleteEncounter && status === "archived"
          ? `
            <button
              type="button"
              class="btn-icon btn-icon--danger cd-mesa-delete-encounter"
              data-encounter-id="${escapeHtml(encounter.id)}"
              title="Eliminar encuentro"
              aria-label="Eliminar ${escapeHtml(encounter.name || TEXT.defaultEncounterName)}"
            >
              <i data-lucide="trash-2"></i>
            </button>
          `
          : "";
        card.innerHTML = `
          <div class="cd-mesa-card-head">
            <h4 class="cd-mesa-card-title">${escapeHtml(
              encounter.name || TEXT.defaultEncounterName
            )}</h4>
            <div class="cd-mesa-card-actions">
              ${statusControl}
              ${deleteControl}
            </div>
          </div>
        `;

        card.addEventListener("click", () => {
          openEncounter(encounter.id);
        });

        card.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          openEncounter(encounter.id);
        });

        card
          .querySelector(".cd-mesa-status-select")
          ?.addEventListener("click", (event) => {
            event.stopPropagation();
          });

        card
          .querySelector(".cd-mesa-status-select")
          ?.addEventListener("keydown", (event) => {
            event.stopPropagation();
          });

        card
          .querySelector(".cd-mesa-status-select")
          ?.addEventListener("change", async (event) => {
            event.stopPropagation();
            const select = event.currentTarget;
            const nextStatus = normalizeEncounterStatus(select.value);
            const previousStatus = status;
            select.disabled = true;
            const { error } = await service().updateEncounterStatus({
              encounterId: encounter.id,
              status: nextStatus,
            });
            select.disabled = false;

            if (error) {
              alert("No se pudo actualizar el estado del encuentro.");
              select.value = previousStatus;
              return;
            }

            encounter.status = nextStatus;
            renderEncounters();
          });

        card
          .querySelector(".cd-mesa-delete-encounter")
          ?.addEventListener("click", async (event) => {
            event.stopPropagation();
            const button = event.currentTarget;
            const ok = await global.ABNShared.modal.confirm(
              `¿Eliminar "${encounter.name || TEXT.defaultEncounterName}"? Esta acción no se puede deshacer. Se borrará el encuentro y los datos asociados.`,
              { confirmLabel: "Eliminar", danger: true },
            );
            if (!ok) return;

            button.disabled = true;
            const { data, error } = await service().deleteArchivedEncounter({
              encounterId: encounter.id,
            });
            if (error || data?.error || data?.deleted === false) {
              const message =
                error?.message ||
                {
                  unauthenticated: "La sesión no está activa.",
                  not_found: "El encuentro ya no existe.",
                  not_archived: "El encuentro debe estar archivado antes de eliminarse.",
                  not_authorized: "No tienes permisos para eliminar este encuentro.",
                }[data?.error] ||
                "No se pudo eliminar el encuentro.";
              button.disabled = false;
              await global.ABNShared.modal.alert(message, { title: "No se pudo eliminar" });
              return;
            }

            allEncounters = allEncounters.filter((item) => item.id !== encounter.id);
            renderEncounters();
          });

        listEl.appendChild(card);
      });
      if (global.lucide?.createIcons) {
        global.lucide.createIcons({ nodes: [listEl] });
      }
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

      allEncounters = data || [];
      renderEncounters();
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
    filterActiveBtn.addEventListener("click", () => setFilter("active"));
    filterArchivedBtn.addEventListener("click", () => setFilter("archived"));

    await loadEncounters();
    return {
      reload: loadEncounters,
    };
  }

  ns.mesa = {
    init,
  };
})(window);
