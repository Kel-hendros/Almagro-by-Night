(function initABNSheetDisciplines(global) {
  const state = {
    selectedDisciplines: [],
    selectedSendas: [],
    disciplinePowers: [],
    activatedDisciplines: new Set(),
    celeridadActivatedPoints: 0,
    dragState: { type: null, index: null, disciplineId: null },
    openDisciplineModal: null,
    openSendaModal: null,
  };

  const deps = {
    save: null,
    capitalizeFirstLetter: null,
    updateFinalPoolSize: null,
    resetDicePool2: null,
    createModalController: null,
    modifyBlood: null,
    hasBloodAvailable: null,
    flashBloodWarning: null,
  };

  const disciplineRepo = global.DISCIPLINE_REPO || [];
  const sendasRepo = global.SENDAS_REPO || [];

  const PHYSICAL_DISCIPLINE_MAP = {
    30: "fuerza",
    5: "destreza",
    11: "resistencia",
  };

  const PHYSICAL_DISCIPLINE_SHORT = { 30: "Pot", 5: "Cel", 11: "Fort" };
  const PHYSICAL_DISCIPLINE_FULL = { 30: "Potencia", 5: "Celeridad", 11: "Fortaleza" };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
    deps.capitalizeFirstLetter =
      typeof nextDeps.capitalizeFirstLetter === "function"
        ? nextDeps.capitalizeFirstLetter
        : null;
    deps.updateFinalPoolSize =
      typeof nextDeps.updateFinalPoolSize === "function"
        ? nextDeps.updateFinalPoolSize
        : null;
    deps.resetDicePool2 =
      typeof nextDeps.resetDicePool2 === "function" ? nextDeps.resetDicePool2 : null;
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.modifyBlood =
      typeof nextDeps.modifyBlood === "function" ? nextDeps.modifyBlood : null;
    deps.hasBloodAvailable =
      typeof nextDeps.hasBloodAvailable === "function"
        ? nextDeps.hasBloodAvailable
        : null;
    deps.flashBloodWarning =
      typeof nextDeps.flashBloodWarning === "function"
        ? nextDeps.flashBloodWarning
        : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function capitalizeFirstLetter(string) {
    if (deps.capitalizeFirstLetter) return deps.capitalizeFirstLetter(string);
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  function updateFinalPoolSize() {
    if (deps.updateFinalPoolSize) deps.updateFinalPoolSize();
  }

  function resetDicePool2() {
    if (deps.resetDicePool2) deps.resetDicePool2();
  }

  function createModalController(options) {
    if (deps.createModalController) return deps.createModalController(options);
    return {
      open() {},
      close() {},
    };
  }

  function modifyBlood(action, type) {
    if (deps.modifyBlood) deps.modifyBlood(action, type);
  }

  function hasBloodAvailable() {
    if (deps.hasBloodAvailable) return deps.hasBloodAvailable();
    return false;
  }

  function flashBloodWarning() {
    if (deps.flashBloodWarning) deps.flashBloodWarning();
  }

  function normalizeForMatch(str) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function reorderArray(arr, fromIndex, toIndex) {
    const [item] = arr.splice(fromIndex, 1);
    arr.splice(toIndex, 0, item);
  }

  function getDisciplineName(id) {
    const entry = disciplineRepo.find((d) => d.id === id);
    return entry ? entry.name_es : "Desconocida";
  }

  function getSendaName(sendaId) {
    const entry = sendasRepo.find((s) => s.id === sendaId);
    return entry ? entry.name_es : "Desconocida";
  }

  function getSendasForDiscipline(discId) {
    return sendasRepo.filter((s) => s.parentDisciplineId === discId);
  }

  function disciplineHasSendas(discId) {
    const entry = disciplineRepo.find((d) => d.id === discId);
    return entry && entry.hasSendas;
  }

  function getPhysicalDisciplineBonus(attrName) {
    const normalized = attrName.toLowerCase();
    for (const [discId, mappedAttr] of Object.entries(PHYSICAL_DISCIPLINE_MAP)) {
      if (mappedAttr === normalized) {
        const id = Number(discId);
        const disc = state.selectedDisciplines.find((d) => d.id === id);
        if (disc && disc.level > 0) {
          const passiveLevel =
            id === 5
              ? Math.max(0, disc.level - state.celeridadActivatedPoints)
              : disc.level;
          return {
            id,
            level: passiveLevel,
            totalLevel: disc.level,
            shortName: PHYSICAL_DISCIPLINE_SHORT[id] || "",
            fullName: PHYSICAL_DISCIPLINE_FULL[id] || "",
          };
        }
      }
    }
    return null;
  }

  function refreshPool1ForPhysicalDiscipline(discId) {
    const mappedAttr = PHYSICAL_DISCIPLINE_MAP[discId];
    if (!mappedAttr) return;

    const pool1Label = document.querySelector("#dicePool1Label")?.innerHTML || "";
    const baseAttrName = pool1Label.split("+")[0].trim();
    if (baseAttrName.toLowerCase() !== capitalizeFirstLetter(mappedAttr).toLowerCase()) return;

    const attrInput = document.querySelector(
      `input[type="hidden"][name="${mappedAttr}"][id$="-value"]`
    );
    if (!attrInput) return;

    const row = attrInput.closest(".form-group.attribute");
    const boostInput = row ? row.querySelector('input[type="hidden"][id^="temp"]') : null;
    const temporalAtribute = boostInput ? parseInt(boostInput.value, 10) || 0 : 0;
    const permanentAttribute = parseInt(attrInput.getAttribute("value"), 10) || 0;
    const finalAttribute = permanentAttribute + temporalAtribute;

    let pool1Value = finalAttribute;
    let newLabel = capitalizeFirstLetter(mappedAttr);

    const physBonus = getPhysicalDisciplineBonus(mappedAttr);
    if (physBonus) {
      if (physBonus.id === 5) {
        if (physBonus.level > 0) {
          pool1Value += physBonus.level;
          newLabel += `+${physBonus.shortName}`;
        }
      } else if (!state.activatedDisciplines.has(physBonus.id)) {
        pool1Value += physBonus.level;
        newLabel += `+${physBonus.shortName}`;
      }
    }

    document.querySelector("#dicePool1").value = pool1Value;
    document.querySelector("#dicePool1Label").innerHTML = newLabel;
    updateFinalPoolSize();
  }

  function setPool2FromValue(name, value) {
    resetDicePool2();
    document.querySelector("#dicePool2").value = String(value);
    document.querySelector("#dicePool2Label").innerHTML = capitalizeFirstLetter(name);
    updateFinalPoolSize();
  }

  function renderDisciplineList() {
    const container = document.getElementById("discipline-list");
    if (!container) return;
    container.innerHTML = "";

    if (state.selectedDisciplines.length === 0) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.textContent = "No hay disciplinas seleccionadas.";
      container.appendChild(empty);
      return;
    }

    state.selectedDisciplines.forEach((disc, index) => {
      const name = disc.customName || getDisciplineName(disc.id);
      const isPhysical = disc.id in PHYSICAL_DISCIPLINE_MAP;
      const isActivated = state.activatedDisciplines.has(disc.id);
      const row = document.createElement("div");
      row.className = "discipline-row";
      if (isActivated || (disc.id === 5 && state.celeridadActivatedPoints > 0)) {
        row.classList.add("discipline-activated");
      }

      const hasSendas = disciplineHasSendas(disc.id);
      let nameAreaHTML = "";
      if (isPhysical || hasSendas) {
        nameAreaHTML = `<span class="discipline-name-area">
           <span class="discipline-name" data-disc-index="${index}" title="Click para agregar al tirador">${name}</span>`;
        if (isPhysical && disc.id === 5) {
          nameAreaHTML += '<span class="celeridad-points">';
          for (let p = 1; p <= disc.level; p += 1) {
            const isPointActive = p <= state.celeridadActivatedPoints;
            nameAreaHTML += `<button class="celeridad-point${isPointActive ? " active" : ""}" type="button"
                     data-point="${p}" title="${
              isPointActive
                ? "Desactivar"
                : "Activar"
            } punto ${p} de Celeridad${isPointActive ? "" : " (gasta 1 sangre)"}">
               <iconify-icon icon="bi:lightning-fill" width="12" aria-hidden="true"></iconify-icon>
             </button>`;
          }
          nameAreaHTML += "</span>";
        } else if (isPhysical && disc.id === 30) {
          nameAreaHTML += `<button class="discipline-activate-btn${
            isActivated ? " active" : ""
          }" type="button"
                   data-disc-id="${disc.id}" title="${
            isActivated ? "Desactivar" : "Activar"
          } ${PHYSICAL_DISCIPLINE_FULL[disc.id] || name} (gasta 1 sangre)">
             <iconify-icon icon="game-icons:fist" width="14" aria-hidden="true"></iconify-icon>
           </button>`;
        }

        if (hasSendas) {
          nameAreaHTML += `<button class="discipline-senda-btn" type="button" data-disc-id="${disc.id}" title="Gestionar sendas de ${name}">
             <iconify-icon icon="gravity-ui:branches-down" width="14" aria-hidden="true"></iconify-icon>
           </button>`;
        }
        nameAreaHTML += "</span>";
      } else {
        nameAreaHTML = `<span class="discipline-name" data-disc-index="${index}" title="Click para agregar al tirador">${name}</span>`;
      }

      row.draggable = true;
      row.dataset.discIndex = String(index);
      row.innerHTML = `
      <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
      ${nameAreaHTML}
      <div class="rating discipline-rating" data-rating="${disc.level}">
        <button class="dot" type="button" data-value="1"></button>
        <button class="dot" type="button" data-value="2"></button>
        <button class="dot" type="button" data-value="3"></button>
        <button class="dot" type="button" data-value="4"></button>
        <button class="dot" type="button" data-value="5"></button>
      </div>
    `;

      const handle = row.querySelector(".drag-handle");
      let canDrag = false;
      handle.addEventListener("mousedown", () => {
        canDrag = true;
      });
      document.addEventListener(
        "mouseup",
        () => {
          canDrag = false;
        },
        { once: false }
      );
      row.addEventListener("dragstart", (event) => {
        if (!canDrag) {
          event.preventDefault();
          return;
        }
        state.dragState = { type: "discipline", index, disciplineId: null };
        row.classList.add("dragging");
        event.dataTransfer.effectAllowed = "move";
      });
      row.addEventListener("dragend", () => {
        row.classList.remove("dragging");
        container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) => {
          el.classList.remove("drag-over-top", "drag-over-bottom");
        });
        state.dragState = { type: null, index: null, disciplineId: null };
      });
      row.addEventListener("dragover", (event) => {
        if (state.dragState.type !== "discipline") return;
        event.preventDefault();
        event.dataTransfer.dropEffect = "move";
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) => {
          el.classList.remove("drag-over-top", "drag-over-bottom");
        });
        if (event.clientY < midY) {
          row.classList.add("drag-over-top");
        } else {
          row.classList.add("drag-over-bottom");
        }
      });
      row.addEventListener("dragleave", () => {
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });
      row.addEventListener("drop", (event) => {
        event.preventDefault();
        if (state.dragState.type !== "discipline") return;
        const fromIndex = state.dragState.index;
        const rect = row.getBoundingClientRect();
        const midY = rect.top + rect.height / 2;
        let toIndex = Number(row.dataset.discIndex);
        if (event.clientY >= midY && toIndex < fromIndex) toIndex += 1;
        if (event.clientY < midY && toIndex > fromIndex) toIndex -= 1;
        if (fromIndex !== toIndex) {
          reorderArray(state.selectedDisciplines, fromIndex, toIndex);
          renderDisciplineList();
          persist();
        }
        row.classList.remove("drag-over-top", "drag-over-bottom");
      });

      const ratingEl = row.querySelector(".rating");
      const dots = ratingEl.querySelectorAll(".dot");
      dots.forEach((dot) => {
        const dv = Number(dot.dataset.value);
        dot.classList.toggle("filled", dv <= disc.level);
      });

      dots.forEach((dot) => {
        dot.addEventListener("click", () => {
          const clickedLevel = Number(dot.dataset.value);
          const newLevel = clickedLevel === disc.level ? clickedLevel - 1 : clickedLevel;
          disc.level = newLevel;
          if (disc.id === 5) {
            state.celeridadActivatedPoints = Math.min(state.celeridadActivatedPoints, newLevel);
            renderDisciplineList();
            refreshPool1ForPhysicalDiscipline(5);
          } else {
            ratingEl.dataset.rating = String(newLevel);
            dots.forEach((d) => {
              d.classList.toggle("filled", Number(d.dataset.value) <= newLevel);
            });
          }
          persist();
        });
      });

      const nameSpan = row.querySelector(".discipline-name");
      nameSpan.addEventListener("click", () => {
        setPool2FromValue(name, disc.level);
      });

      const activateBtn = row.querySelector(".discipline-activate-btn");
      if (activateBtn) {
        activateBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const discId = Number(activateBtn.dataset.discId);

          if (state.activatedDisciplines.has(discId)) {
            state.activatedDisciplines.delete(discId);
            activateBtn.classList.remove("active");
            row.classList.remove("discipline-activated");
            activateBtn.title = `Activar ${
              PHYSICAL_DISCIPLINE_FULL[discId] || name
            } (gasta 1 sangre)`;
          } else {
            if (!hasBloodAvailable()) {
              flashBloodWarning();
              return;
            }
            modifyBlood("consume", "");
            state.activatedDisciplines.add(discId);
            activateBtn.classList.add("active");
            row.classList.add("discipline-activated");
            activateBtn.title = `Desactivar ${PHYSICAL_DISCIPLINE_FULL[discId] || name}`;
          }
          refreshPool1ForPhysicalDiscipline(discId);
        });
      }

      const celPoints = row.querySelectorAll(".celeridad-point");
      celPoints.forEach((pointBtn) => {
        pointBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const pointNum = Number(pointBtn.dataset.point);

          if (pointBtn.classList.contains("active")) {
            state.celeridadActivatedPoints = pointNum - 1;
          } else {
            const pointsToActivate = pointNum - state.celeridadActivatedPoints;
            const bloodValue = document.querySelector("#blood-value").value;
            const availableBlood = bloodValue.replace(/0/g, "").length;
            if (availableBlood < pointsToActivate) {
              flashBloodWarning();
              return;
            }
            for (let i = 0; i < pointsToActivate; i += 1) {
              modifyBlood("consume", "");
            }
            state.celeridadActivatedPoints = pointNum;
          }
          renderDisciplineList();
          refreshPool1ForPhysicalDiscipline(5);
        });
      });

      const sendaBtn = row.querySelector(".discipline-senda-btn");
      if (sendaBtn) {
        sendaBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const discId = Number(sendaBtn.dataset.discId);
          if (typeof state.openSendaModal === "function") state.openSendaModal(discId);
        });
      }

      container.appendChild(row);

      if (hasSendas) {
        const discSendas = state.selectedSendas.filter((s) => s.disciplineId === disc.id);
        discSendas.forEach((senda) => {
          const sendaRow = document.createElement("div");
          sendaRow.className = "senda-row";

          const sendaName = getSendaName(senda.sendaId);
          const sendaGlobalIndex = state.selectedSendas.findIndex(
            (s) => s.disciplineId === senda.disciplineId && s.sendaId === senda.sendaId
          );
          sendaRow.draggable = true;
          sendaRow.dataset.sendaGlobalIndex = String(sendaGlobalIndex);
          sendaRow.dataset.disciplineId = String(disc.id);
          sendaRow.innerHTML = `
          <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
          <span class="senda-name" title="Click para agregar al tirador">${sendaName}</span>
          <div class="rating senda-rating" data-rating="${senda.level}">
            <button class="dot" type="button" data-value="1"></button>
            <button class="dot" type="button" data-value="2"></button>
            <button class="dot" type="button" data-value="3"></button>
            <button class="dot" type="button" data-value="4"></button>
            <button class="dot" type="button" data-value="5"></button>
          </div>
        `;

          const sendaHandle = sendaRow.querySelector(".drag-handle");
          let sendaCanDrag = false;
          sendaHandle.addEventListener("mousedown", () => {
            sendaCanDrag = true;
          });
          document.addEventListener(
            "mouseup",
            () => {
              sendaCanDrag = false;
            },
            { once: false }
          );
          sendaRow.addEventListener("dragstart", (event) => {
            if (!sendaCanDrag) {
              event.preventDefault();
              return;
            }
            event.stopPropagation();
            state.dragState = {
              type: "senda",
              index: sendaGlobalIndex,
              disciplineId: disc.id,
            };
            sendaRow.classList.add("dragging");
            event.dataTransfer.effectAllowed = "move";
          });
          sendaRow.addEventListener("dragend", () => {
            sendaRow.classList.remove("dragging");
            container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach((el) => {
              el.classList.remove("drag-over-top", "drag-over-bottom");
            });
            state.dragState = { type: null, index: null, disciplineId: null };
          });
          sendaRow.addEventListener("dragover", (event) => {
            if (state.dragState.type !== "senda" || state.dragState.disciplineId !== disc.id) {
              return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            const rect = sendaRow.getBoundingClientRect();
            const midY = rect.top + rect.height / 2;
            container
              .querySelectorAll(".senda-row.drag-over-top, .senda-row.drag-over-bottom")
              .forEach((el) => {
                el.classList.remove("drag-over-top", "drag-over-bottom");
              });
            if (event.clientY < midY) {
              sendaRow.classList.add("drag-over-top");
            } else {
              sendaRow.classList.add("drag-over-bottom");
            }
          });
          sendaRow.addEventListener("dragleave", () => {
            sendaRow.classList.remove("drag-over-top", "drag-over-bottom");
          });
          sendaRow.addEventListener("drop", (event) => {
            event.preventDefault();
            event.stopPropagation();
            if (state.dragState.type !== "senda" || state.dragState.disciplineId !== disc.id) {
              return;
            }
            const fromGlobal = state.dragState.index;
            const toGlobal = Number(sendaRow.dataset.sendaGlobalIndex);
            if (fromGlobal !== toGlobal) {
              reorderArray(state.selectedSendas, fromGlobal, toGlobal);
              renderDisciplineList();
              persist();
            }
            sendaRow.classList.remove("drag-over-top", "drag-over-bottom");
          });

          const sendaRating = sendaRow.querySelector(".senda-rating");
          const sendaDots = sendaRating.querySelectorAll(".dot");
          sendaDots.forEach((dot) => {
            const dv = Number(dot.dataset.value);
            dot.classList.toggle("filled", dv <= senda.level);
          });

          sendaDots.forEach((dot) => {
            dot.addEventListener("click", () => {
              const clickedLevel = Number(dot.dataset.value);
              const newLevel = clickedLevel === senda.level ? clickedLevel - 1 : clickedLevel;
              senda.level = newLevel;
              sendaRating.dataset.rating = String(newLevel);
              sendaDots.forEach((d) => {
                d.classList.toggle("filled", Number(d.dataset.value) <= newLevel);
              });
              persist();
            });
          });

          const sendaNameSpan = sendaRow.querySelector(".senda-name");
          sendaNameSpan.addEventListener("click", () => {
            setPool2FromValue(sendaName, senda.level);
          });

          container.appendChild(sendaRow);
        });
      }
    });
  }

  function initDisciplineRepoModal() {
    const openBtn = document.getElementById("open-discipline-repo");
    const modal = document.getElementById("discipline-repo-modal");
    const closeBtn = document.getElementById("discipline-repo-close");
    const searchInput = document.getElementById("discipline-repo-search");
    const list = document.getElementById("discipline-repo-list");
    const applyBtn = document.getElementById("discipline-repo-apply");

    if (!openBtn || !modal || !closeBtn || !searchInput || !list || !applyBtn) return;

    let modalSelection = new Set();
    let modalMode = "multi";
    let modalOnSelect = null;
    const modalController = createModalController({
      overlay: modal,
      closeButtons: [closeBtn],
    });

    function closeModal() {
      modalController.close();
    }

    function openModal(options = {}) {
      modalMode = options.mode || "multi";
      modalOnSelect = options.onSelect || null;
      if (modalMode === "multi") {
        modalSelection = new Set(state.selectedDisciplines.map((d) => d.id));
      } else {
        modalSelection = new Set();
      }
      modalController.open();
      applyBtn.style.display = modalMode === "single" ? "none" : "";
      searchInput.value = "";
      renderRepository("");
      searchInput.focus();
    }

    function renderRepository(term) {
      list.innerHTML = "";
      const filtered = disciplineRepo.filter(
        (d) =>
          d.name_es.toLowerCase().includes(term) || d.name_en.toLowerCase().includes(term)
      );
      filtered.forEach((d) => {
        const button = document.createElement("button");
        button.className = "discipline-repo-item";
        if (modalSelection.has(d.id)) button.classList.add("selected");
        button.type = "button";
        button.textContent = d.name_es;
        button.addEventListener("click", () => {
          if (modalMode === "single") {
            if (modalOnSelect) modalOnSelect(d.id);
            closeModal();
            return;
          }
          if (modalSelection.has(d.id)) {
            modalSelection.delete(d.id);
          } else {
            modalSelection.add(d.id);
          }
          renderRepository(searchInput.value.trim().toLowerCase());
        });
        list.appendChild(button);
      });
    }

    openBtn.addEventListener("click", openModal);

    applyBtn.addEventListener("click", () => {
      const existingMap = {};
      state.selectedDisciplines.forEach((d) => {
        existingMap[d.id] = d.level;
      });

      state.selectedDisciplines = [];
      disciplineRepo.forEach((d) => {
        if (modalSelection.has(d.id)) {
          state.selectedDisciplines.push({ id: d.id, level: existingMap[d.id] || 1 });
        }
      });

      renderDisciplineList();
      persist();
      closeModal();
    });

    searchInput.addEventListener("input", () => {
      renderRepository(searchInput.value.trim().toLowerCase());
    });

    state.openDisciplineModal = openModal;
  }

  function initSendaRepoModal() {
    const modal = document.getElementById("senda-repo-modal");
    const closeBtn = document.getElementById("senda-repo-close");
    const searchInput = document.getElementById("senda-repo-search");
    const list = document.getElementById("senda-repo-list");
    const applyBtn = document.getElementById("senda-repo-apply");
    const titleEl = document.getElementById("senda-repo-title");

    if (!modal || !closeBtn || !searchInput || !list || !applyBtn) return;

    let modalSelection = new Set();
    let currentDisciplineId = null;
    const modalController = createModalController({
      overlay: modal,
      closeButtons: [closeBtn],
    });

    function closeModal() {
      modalController.close();
    }

    function openSendaModal(discId) {
      currentDisciplineId = discId;
      const discName = getDisciplineName(discId);
      titleEl.textContent = `Sendas de ${discName}`;

      modalSelection = new Set(
        state.selectedSendas
          .filter((s) => s.disciplineId === discId)
          .map((s) => s.sendaId)
      );

      modalController.open();
      searchInput.value = "";
      renderSendaRepository("");
      searchInput.focus();
    }

    state.openSendaModal = openSendaModal;

    function renderSendaRepository(term) {
      list.innerHTML = "";
      const available = getSendasForDiscipline(currentDisciplineId);
      const filtered = available.filter(
        (s) =>
          s.name_es.toLowerCase().includes(term) || s.name_en.toLowerCase().includes(term)
      );
      filtered.forEach((s) => {
        const button = document.createElement("button");
        button.className = "discipline-repo-item";
        if (modalSelection.has(s.id)) button.classList.add("selected");
        button.type = "button";
        button.textContent = s.name_es;
        button.addEventListener("click", () => {
          if (modalSelection.has(s.id)) {
            modalSelection.delete(s.id);
          } else {
            modalSelection.add(s.id);
          }
          renderSendaRepository(searchInput.value.trim().toLowerCase());
        });
        list.appendChild(button);
      });
    }

    applyBtn.addEventListener("click", () => {
      const existingMap = {};
      state.selectedSendas
        .filter((s) => s.disciplineId === currentDisciplineId)
        .forEach((s) => {
          existingMap[s.sendaId] = s.level;
        });

      state.selectedSendas = state.selectedSendas.filter(
        (s) => s.disciplineId !== currentDisciplineId
      );

      const available = getSendasForDiscipline(currentDisciplineId);
      available.forEach((s) => {
        if (modalSelection.has(s.id)) {
          state.selectedSendas.push({
            disciplineId: currentDisciplineId,
            sendaId: s.id,
            level: existingMap[s.id] || 1,
          });
        }
      });

      renderDisciplineList();
      persist();
      closeModal();
    });

    searchInput.addEventListener("input", () => {
      renderSendaRepository(searchInput.value.trim().toLowerCase());
    });
  }

  function renderPowersList() {
    const list = document.getElementById("discipline-powers-list");
    if (!list) return;
    list.innerHTML = "";

    state.disciplinePowers.forEach((power, index) => {
      const item = document.createElement("div");
      item.className = "discipline-power-item";
      item.innerHTML = `
      <div class="discipline-power-row">
        <button class="discipline-power-title-btn" type="button">${power.name}</button>
        <button class="discipline-power-edit-btn" type="button" aria-label="Editar poder" title="Editar poder">✎</button>
        <button class="discipline-power-delete-btn" type="button" aria-label="Eliminar poder">✕</button>
      </div>
      <div class="discipline-power-description">${power.description}</div>
    `;

      const titleBtn = item.querySelector(".discipline-power-title-btn");
      const editBtn = item.querySelector(".discipline-power-edit-btn");
      const deleteBtn = item.querySelector(".discipline-power-delete-btn");
      const descEl = item.querySelector(".discipline-power-description");

      titleBtn.addEventListener("click", () => {
        if (!item.classList.contains("editing")) {
          item.classList.toggle("open");
        }
      });

      editBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isEditing = item.classList.contains("editing");
        if (isEditing) {
          item.classList.remove("editing", "open");
        } else {
          item.classList.add("editing", "open");
          descEl.innerHTML = "";
          const editForm = document.createElement("form");
          editForm.className = "discipline-power-edit-form";

          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.value = power.name;
          nameInput.placeholder = "Nombre del poder";
          nameInput.maxLength = 60;

          const descInput = document.createElement("textarea");
          descInput.rows = 3;
          descInput.value = power.description || "";
          descInput.placeholder = "Descripción del poder (opcional)";

          const actions = document.createElement("div");
          actions.className = "form-actions";

          const saveBtn = document.createElement("button");
          saveBtn.type = "submit";
          saveBtn.className = "discipline-power-save-btn";
          saveBtn.textContent = "Guardar";

          const cancelBtn = document.createElement("button");
          cancelBtn.type = "button";
          cancelBtn.className = "form-cancel-btn";
          cancelBtn.textContent = "Cancelar";
          cancelBtn.addEventListener("click", () => {
            item.classList.remove("editing", "open");
            descEl.textContent = power.description || "";
          });

          editForm.addEventListener("submit", (eventSubmit) => {
            eventSubmit.preventDefault();
            const newName = nameInput.value.trim();
            if (!newName) return;
            power.name = newName;
            power.description = descInput.value.trim();
            persist();
            renderPowersList();
          });

          actions.append(saveBtn, cancelBtn);
          editForm.append(nameInput, descInput, actions);
          descEl.appendChild(editForm);
        }
      });

      deleteBtn.addEventListener("click", () => {
        state.disciplinePowers.splice(index, 1);
        renderPowersList();
        persist();
      });

      list.appendChild(item);
    });
  }

  function initDisciplinePowers() {
    const toggleBtn = document.getElementById("discipline-add-power-toggle");
    const cancelBtn = document.getElementById("discipline-add-power-cancel");
    const form = document.getElementById("discipline-add-power-form");
    const nameInput = document.getElementById("discipline-power-name");
    const descriptionInput = document.getElementById("discipline-power-description");
    if (!toggleBtn || !form || !nameInput || !descriptionInput) return;

    toggleBtn.addEventListener("click", () => {
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden")) nameInput.focus();
    });

    cancelBtn?.addEventListener("click", () => {
      nameInput.value = "";
      descriptionInput.value = "";
      form.classList.add("hidden");
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const description = descriptionInput.value.trim();
      if (!name) return;
      state.disciplinePowers.push({ name, description: description || "" });
      renderPowersList();
      persist();
      nameInput.value = "";
      descriptionInput.value = "";
      form.classList.add("hidden");
    });
  }

  function getDisciplinesData() {
    return state.selectedDisciplines.map((d) => ({
      id: d.id,
      level: d.level,
      name: d.customName || getDisciplineName(d.id),
      customName: d.customName || "",
    }));
  }

  function loadDisciplinesFromJSON(characterData) {
    state.selectedDisciplines = [];

    if (characterData.disciplines && Array.isArray(characterData.disciplines)) {
      characterData.disciplines.forEach((d) => {
        const repoEntry = disciplineRepo.find((r) => r.id === d.id);
        if (repoEntry) {
          state.selectedDisciplines.push({ id: d.id, level: d.level || 0 });
        } else if (d.id === 0 && (d.customName || d.name)) {
          state.selectedDisciplines.push({
            id: 0,
            customName: (d.customName || d.name || "").trim(),
            level: d.level || 0,
          });
        }
      });
    }

    console.log(
      "[Disciplines] Loaded:",
      state.selectedDisciplines.length,
      "disciplines",
      state.selectedDisciplines
    );
  }

  function updateDisciplineButtons() {
    // no-op
  }

  function getSendasData() {
    return state.selectedSendas.map((s) => ({
      disciplineId: s.disciplineId,
      sendaId: s.sendaId,
      level: s.level,
      name: getSendaName(s.sendaId),
    }));
  }

  function loadSendasFromJSON(characterData) {
    state.selectedSendas = [];
    if (characterData.sendas && Array.isArray(characterData.sendas)) {
      characterData.sendas.forEach((s) => {
        const repoEntry = sendasRepo.find((r) => r.id === s.sendaId);
        if (repoEntry) {
          state.selectedSendas.push({
            disciplineId: s.disciplineId,
            sendaId: s.sendaId,
            level: s.level || 1,
          });
        }
      });
    }
    console.log("[Sendas] Loaded:", state.selectedSendas.length, "sendas", state.selectedSendas);
  }

  function getPowersData() {
    return state.disciplinePowers.map((p) => ({ name: p.name, description: p.description }));
  }

  function loadPowersFromJSON(characterData) {
    state.disciplinePowers = [];
    if (characterData.disciplinePowers && Array.isArray(characterData.disciplinePowers)) {
      characterData.disciplinePowers.forEach((p) => {
        if (p.name && p.name.trim() !== "") {
          state.disciplinePowers.push({ name: p.name, description: p.description || "" });
        }
      });
    }
  }

  function migrateCustomDisciplinesToPowers() {
    const customs = state.selectedDisciplines.filter((d) => d.id === 0 && d.customName);
    if (customs.length === 0) return;

    customs.forEach((d) => {
      const already = state.disciplinePowers.some(
        (p) => normalizeForMatch(p.name) === normalizeForMatch(d.customName)
      );
      if (!already) {
        const levelDots = d.level > 0 ? " (" + "•".repeat(d.level) + ")" : "";
        state.disciplinePowers.push({
          name: d.customName + levelDots,
          description: "Migrado desde disciplina legacy.",
        });
      }
    });

    state.selectedDisciplines = state.selectedDisciplines.filter((d) => d.id !== 0);
  }

  function getActivatedDisciplines() {
    return state.activatedDisciplines;
  }

  function init() {
    initDisciplineRepoModal();
    initSendaRepoModal();
    initDisciplinePowers();
  }

  global.ABNSheetDisciplines = {
    configure,
    init,
    getPhysicalDisciplineBonus,
    refreshPool1ForPhysicalDiscipline,
    getDisciplineName,
    renderDisciplineList,
    getDisciplinesData,
    loadDisciplinesFromJSON,
    updateDisciplineButtons,
    getSendaName,
    getSendasForDiscipline,
    disciplineHasSendas,
    getSendasData,
    loadSendasFromJSON,
    renderPowersList,
    initDisciplinePowers,
    getPowersData,
    loadPowersFromJSON,
    migrateCustomDisciplinesToPowers,
    getActivatedDisciplines,
    openDisciplineModal: (options) => {
      if (typeof state.openDisciplineModal === "function") {
        state.openDisciplineModal(options);
      }
    },
    openSendaModal: (discId) => {
      if (typeof state.openSendaModal === "function") {
        state.openSendaModal(discId);
      }
    },
  };
})(window);
