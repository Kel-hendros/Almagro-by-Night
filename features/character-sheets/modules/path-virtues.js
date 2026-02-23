(function initABNSheetPathVirtues(global) {
  const deps = {
    save: null,
    createModalController: null,
    resetDicePool1: null,
    addToPool1: null,
    flashBloodWarning: null,
  };

  const state = {
    initialized: false,
  };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.resetDicePool1 =
      typeof nextDeps.resetDicePool1 === "function" ? nextDeps.resetDicePool1 : null;
    deps.addToPool1 =
      typeof nextDeps.addToPool1 === "function" ? nextDeps.addToPool1 : null;
    deps.flashBloodWarning =
      typeof nextDeps.flashBloodWarning === "function"
        ? nextDeps.flashBloodWarning
        : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function resetDicePool1() {
    if (deps.resetDicePool1) deps.resetDicePool1();
  }

  function addToPool1(value, label) {
    if (deps.addToPool1) deps.addToPool1(value, label);
  }

  function flashBloodWarning() {
    if (deps.flashBloodWarning) deps.flashBloodWarning();
  }

  function createModalController(options) {
    if (deps.createModalController) return deps.createModalController(options);
    return { open() {}, close() {} };
  }

  function blockVirtues() {
    const humanityValue = parseInt(document.querySelector("#humanidad-value")?.value || "0", 10) || 0;

    const virtueRatings = document.querySelectorAll(
      ".virtue-rating:not(.virtue-humanity-rating)"
    );

    virtueRatings.forEach((ratingEl) => {
      const hiddenInput = ratingEl.parentElement?.querySelector("input[id$='-value']");
      const rawValue = hiddenInput ? parseInt(hiddenInput.value, 10) || 0 : 0;

      const dots = ratingEl.querySelectorAll(".dot");
      dots.forEach((dot) => {
        const dotVal = parseInt(dot.getAttribute("data-value"), 10);
        dot.classList.remove("filled", "available", "blocked", "disabled");

        if (dotVal < rawValue && dotVal < humanityValue) {
          dot.classList.add("available");
        } else if (dotVal < rawValue && dotVal >= humanityValue) {
          dot.classList.add("blocked");
        }
      });
    });

    renderPathInfo();
  }

  function applyRoadVirtues(road) {
    document.getElementById("humanidad").value = road.name;
    document.getElementById("virtue-path-label").textContent = road.name;

    const v1 = global.VIRTUE_MAP?.[road.virtues[0]];
    const v2 = global.VIRTUE_MAP?.[road.virtues[1]];

    if (v1) {
      document.getElementById("virtue1").value = v1.value;
      document.getElementById("virtue1-label").textContent = v1.label;
    }

    if (v2) {
      document.getElementById("virtue2").value = v2.value;
      document.getElementById("virtue2-label").textContent = v2.label;
    }

    persist();
    renderPathInfo();
  }

  function syncVirtueLabels() {
    let pathName = document.getElementById("humanidad")?.value;

    if (!pathName || !isNaN(pathName)) {
      pathName = "Humanidad";
      const pathInput = document.getElementById("humanidad");
      if (pathInput) pathInput.value = pathName;
    }

    const pathLabel = document.getElementById("virtue-path-label");
    if (pathLabel) pathLabel.textContent = pathName;

    const v1val = document.getElementById("virtue1")?.value;
    const v1entry = Object.values(global.VIRTUE_MAP || {}).find((v) => v.value === v1val);
    if (v1entry) {
      document.getElementById("virtue1-label").textContent = v1entry.label;
    }

    const v2val = document.getElementById("virtue2")?.value;
    const v2entry = Object.values(global.VIRTUE_MAP || {}).find((v) => v.value === v2val);
    if (v2entry) {
      document.getElementById("virtue2-label").textContent = v2entry.label;
    }

    renderPathInfo();
  }

  function renderPathInfo() {
    const container = document.getElementById("path-info");
    if (!container) return;

    const pathName = document.getElementById("humanidad")?.value;
    const road = (global.ROAD_REPO || []).find((r) => r.name === pathName);

    if (!road || (!road.description && !road.sins)) {
      container.innerHTML = "";
      return;
    }

    let html = "";
    if (road.description) {
      html += `<p class="path-description">${road.description}`;
      if (road.wikiUrl) {
        html += ` <a href="${road.wikiUrl}" target="_blank" rel="noopener noreferrer" class="path-wiki-link">ver más...</a>`;
      }
      html += "</p>";
    }

    if (road.sins && road.sins.length > 0) {
      const humanityValue = parseInt(document.getElementById("humanidad-value")?.value || "0", 10) || 0;
      html += '<div class="sins-table-wrapper">';
      html += '<table class="sins-table">';
      html += '<thead><tr><th></th><th>Directriz moral</th><th>Razón fundamental</th></tr></thead>';
      html += "<tbody>";
      road.sins.forEach((s) => {
        const beyond = s.rating > humanityValue ? " beyond" : "";
        html += `<tr class="${beyond}"><td class="sins-rating">${s.rating}</td><td>${s.sin}</td><td class="sins-reason">${s.reason}</td></tr>`;
      });
      html += "</tbody></table></div>";
    }

    container.innerHTML = html;
  }

  function initPathRepoModal() {
    const modal = document.getElementById("path-repo-modal");
    const openBtn = document.getElementById("open-path-repo");
    const closeBtn = document.getElementById("path-repo-close");
    const searchBox = document.getElementById("path-repo-search");
    const listEl = document.getElementById("path-repo-list");
    const applyBtn = document.getElementById("path-repo-apply");

    if (!modal || !openBtn || !listEl || !searchBox || !applyBtn) return;

    let selectedRoadId = null;
    const modalController = createModalController({
      overlay: modal,
      closeButtons: [closeBtn],
      onClose: () => {
        selectedRoadId = null;
      },
    });

    function normalizeForSearch(str) {
      return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    }

    function getVirtueLabels(road) {
      const v1 = global.VIRTUE_MAP?.[road.virtues[0]];
      const v2 = global.VIRTUE_MAP?.[road.virtues[1]];
      return (v1 ? v1.label : "?") + " · " + (v2 ? v2.label : "?") + " · Coraje";
    }

    function renderList(filter) {
      listEl.innerHTML = "";
      const currentPathName = document.getElementById("humanidad")?.value;
      const filterNorm = filter ? normalizeForSearch(filter) : "";

      (global.ROAD_REPO || []).forEach((road) => {
        if (filterNorm && !normalizeForSearch(road.name).includes(filterNorm)) return;

        const item = document.createElement("button");
        item.type = "button";
        item.className = "path-repo-item";

        const title = document.createElement("strong");
        title.className = "path-repo-item-title";
        title.textContent = road.name;

        const virtues = document.createElement("span");
        virtues.className = "path-repo-item-virtues";
        virtues.textContent = getVirtueLabels(road);

        item.appendChild(title);
        item.appendChild(virtues);

        if (road.description) {
          const desc = document.createElement("span");
          desc.className = "path-repo-item-desc";
          desc.textContent = road.description;
          item.appendChild(desc);
        }

        if (road.name === currentPathName || road.id === selectedRoadId) {
          item.classList.add("selected");
          selectedRoadId = road.id;
        }

        item.addEventListener("click", () => {
          listEl.querySelectorAll(".path-repo-item").forEach((el) => el.classList.remove("selected"));
          item.classList.add("selected");
          selectedRoadId = road.id;
        });

        listEl.appendChild(item);
      });
    }

    openBtn.addEventListener("click", () => {
      const currentName = document.getElementById("humanidad")?.value;
      const currentRoad = (global.ROAD_REPO || []).find((r) => r.name === currentName);
      selectedRoadId = currentRoad ? currentRoad.id : null;
      searchBox.value = "";
      renderList("");
      modalController.open();
      searchBox.focus();
    });

    searchBox.addEventListener("input", () => {
      renderList(searchBox.value);
    });

    applyBtn.addEventListener("click", () => {
      if (selectedRoadId === null) {
        modalController.close();
        return;
      }
      const road = (global.ROAD_REPO || []).find((r) => r.id === selectedRoadId);
      if (road) applyRoadVirtues(road);
      modalController.close();
    });
  }

  function bindVirtueDiceRolling() {
    document
      .querySelectorAll(".virtue-sheet-row span[id$='-label'], .virtue-sheet-row span:not([id])")
      .forEach((label) => {
        label.style.cursor = "pointer";
        label.addEventListener("click", () => {
          resetDicePool1();
          const virtueName = label.textContent.trim();
          const row = label.closest(".virtue-sheet-row");
          const valueInput = row ? row.querySelector("input[id$='-value']") : null;
          let virtueDice = valueInput ? parseInt(valueInput.value || "0", 10) : 0;

          const humanityValue = parseInt(document.querySelector("#humanidad-value")?.value || "0", 10) || 0;
          if (virtueDice > humanityValue) virtueDice = humanityValue;

          const isVirtue2 = valueInput && valueInput.id === "virtue2-value";
          if (isVirtue2) {
            const bloodValueString = document.querySelector("#blood-value")?.value || "";
            const bloodPoolValue = bloodValueString.replace(/0/g, "").length;
            if (virtueDice > bloodPoolValue) {
              virtueDice = bloodPoolValue;
              flashBloodWarning();
            }
          }

          addToPool1(virtueDice, virtueName);
        });
      });

    const pathLabel = document.getElementById("virtue-path-label");
    if (pathLabel) {
      pathLabel.addEventListener("click", () => {
        resetDicePool1();
        const sendaName = pathLabel.textContent.trim();
        const sendaDice = parseInt(document.getElementById("humanidad-value")?.value || "0", 10) || 0;
        addToPool1(sendaDice, sendaName);
      });
      pathLabel.style.cursor = "pointer";
    }
  }

  function init() {
    if (state.initialized) return;
    initPathRepoModal();
    bindVirtueDiceRolling();
    state.initialized = true;
  }

  global.ABNSheetPathVirtues = {
    configure,
    init,
    blockVirtues,
    applyRoadVirtues,
    syncVirtueLabels,
    renderPathInfo,
  };
})(window);
