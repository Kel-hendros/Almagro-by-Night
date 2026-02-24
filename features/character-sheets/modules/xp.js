(function initABNSheetXp(global) {
  const state = {
    arcs: [],
    currentArcIndex: 0,
  };

  const deps = {
    save: null,
  };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function renderXpPool() {
    const xpPool = document.getElementById("xp-pool");
    const hiddenInput = document.getElementById("experiencia-value");
    if (!xpPool) return;

    const groups = 3;
    const rows = 3;
    const cols = 5;
    const totalCells = groups * rows * cols;
    const filled = Math.max(
      0,
      Math.min(totalCells, parseInt(hiddenInput?.value, 10) || 0)
    );

    const totalLabel = document.getElementById("xp-total");
    if (totalLabel) totalLabel.textContent = filled ? `(${filled})` : "";

    xpPool.innerHTML = "";

    for (let g = 0; g < groups; g += 1) {
      const group = document.createElement("div");
      group.className = "xp-group";

      for (let i = 0; i < rows * cols; i += 1) {
        const globalIndex = g * rows * cols + i;
        const cell = document.createElement("span");
        cell.className = "xp-cell";
        if (globalIndex < filled) cell.classList.add("filled");

        cell.addEventListener("click", () => {
          if (!hiddenInput) return;
          const newVal = globalIndex + 1;
          const currentVal = parseInt(hiddenInput.value, 10) || 0;
          hiddenInput.value =
            currentVal === newVal ? String(newVal - 1) : String(newVal);
          renderXpPool();
          persist();
        });

        group.appendChild(cell);
      }

      xpPool.appendChild(group);
    }
  }

  function renderXpArcs() {
    const arcList = document.getElementById("xp-arc-list");
    if (!arcList) return;
    arcList.innerHTML = "";

    if (state.arcs.length === 0) {
      const empty = document.createElement("p");
      empty.className = "specialty-subtitle";
      empty.style.textAlign = "center";
      empty.style.margin = "12px 0";
      empty.textContent = "Sin arcos de experiencia.";
      arcList.appendChild(empty);
      return;
    }

    const arcView = [...state.arcs]
      .map((arc, index) => ({ arc, index }))
      .reverse();

    arcView.forEach(({ arc, index: arcIndex }) => {
      const arcBlock = document.createElement("section");
      arcBlock.className = "xp-arc";

      const header = document.createElement("div");
      header.className = "xp-arc-header";
      header.style.display = "flex";
      header.style.justifyContent = "space-between";
      header.style.alignItems = "center";

      const title = document.createElement("h4");
      title.className = "xp-arc-title";
      title.textContent = arc.name;

      const deleteArcBtn = document.createElement("button");
      deleteArcBtn.className = "btn-icon btn-icon--danger xp-entry-delete mode-edit-only";
      deleteArcBtn.type = "button";
      deleteArcBtn.style.position = "static";
      deleteArcBtn.style.transform = "none";
      deleteArcBtn.style.opacity = "0";
      deleteArcBtn.style.pointerEvents = "none";
      deleteArcBtn.setAttribute("aria-label", "Eliminar arco");
      deleteArcBtn.innerHTML = '<i data-lucide="trash-2"></i>';
      deleteArcBtn.addEventListener("click", () => {
        state.arcs.splice(arcIndex, 1);
        if (state.currentArcIndex >= state.arcs.length) {
          state.currentArcIndex = Math.max(0, state.arcs.length - 1);
        }
        renderXpArcs();
        persist();
      });

      header.appendChild(title);
      header.appendChild(deleteArcBtn);

      arcBlock.addEventListener("mouseenter", () => {
        deleteArcBtn.style.opacity = "1";
        deleteArcBtn.style.pointerEvents = "auto";
      });
      arcBlock.addEventListener("mouseleave", () => {
        deleteArcBtn.style.opacity = "0";
        deleteArcBtn.style.pointerEvents = "none";
      });

      arcBlock.appendChild(header);

      const entries = document.createElement("div");
      entries.className = "xp-entry-list";

      if (arc.entries.length === 0) {
        const empty = document.createElement("p");
        empty.className = "discipline-detail-label";
        empty.textContent = "Sin gastos en este arco.";
        entries.appendChild(empty);
      } else {
        arc.entries.forEach((entry, entryIndex) => {
          const row = document.createElement("div");
          row.className = "xp-entry";

          const main = document.createElement("div");
          main.className = "xp-entry-main";

          const dateEl = document.createElement("span");
          dateEl.className = "xp-entry-date";
          if (entry.date) {
            const [, month, day] = entry.date.split("-");
            dateEl.textContent = `${day}/${month}`;
          }
          main.appendChild(dateEl);

          const name = document.createElement("span");
          name.className = "xp-entry-name";
          name.textContent = entry.name;

          const cost = document.createElement("span");
          cost.className = "xp-entry-cost";
          cost.textContent = String(entry.cost);

          main.appendChild(name);
          main.appendChild(cost);

          const deleteBtn = document.createElement("button");
          deleteBtn.className = "btn-icon btn-icon--danger xp-entry-delete mode-edit-only";
          deleteBtn.type = "button";
          deleteBtn.setAttribute("aria-label", "Eliminar gasto");
          deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
          deleteBtn.addEventListener("click", () => {
            state.arcs[arcIndex].entries.splice(entryIndex, 1);
            renderXpArcs();
            persist();
          });

          row.appendChild(main);
          row.appendChild(deleteBtn);
          entries.appendChild(row);
        });
      }

      arcBlock.appendChild(entries);
      arcList.appendChild(arcBlock);
    });

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [arcList] });
    }
  }

  function initExperience() {
    const form = document.getElementById("xp-spend-form");
    const nameInput = document.getElementById("xp-spend-name");
    const costInput = document.getElementById("xp-spend-cost");
    const cancelBtn = document.getElementById("xp-spend-cancel");
    const newSpendBtn = document.getElementById("xp-new-spend-btn");
    const newArcBtn = document.getElementById("xp-new-arc-btn");

    if (!form || !nameInput || !costInput || !newSpendBtn || !newArcBtn) return;

    function resetForm() {
      nameInput.value = "";
      costInput.value = "1";
    }

    function closeSpendForm() {
      resetForm();
      form.classList.add("hidden");
    }

    newSpendBtn.addEventListener("click", () => {
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden")) {
        nameInput.focus();
      } else {
        resetForm();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput.value.trim();
      const cost = Math.max(1, Number(costInput.value || 1));
      if (!name) return;

      if (state.arcs.length === 0) {
        state.arcs.push({ name: "Arco 1", entries: [] });
        state.currentArcIndex = 0;
      }

      const today = new Date().toISOString().slice(0, 10);
      state.arcs[state.currentArcIndex].entries.unshift({ name, cost, date: today });
      renderXpArcs();
      closeSpendForm();
      persist();
    });

    cancelBtn?.addEventListener("click", closeSpendForm);

    newArcBtn.addEventListener("click", () => {
      state.arcs.push({ name: `Arco ${state.arcs.length + 1}`, entries: [] });
      state.currentArcIndex = state.arcs.length - 1;
      renderXpArcs();
      persist();
    });
  }

  function serialize() {
    return state.arcs.map((arc) => ({
      name: arc.name,
      entries: arc.entries.map((e) => ({
        name: e.name,
        cost: e.cost,
        date: e.date || null,
      })),
    }));
  }

  function loadFromCharacterData(characterData) {
    state.arcs = [];
    state.currentArcIndex = 0;
    if (characterData?.xpArcs && Array.isArray(characterData.xpArcs)) {
      characterData.xpArcs.forEach((arc) => {
        state.arcs.push({
          name: arc.name || "Arco",
          entries: (arc.entries || []).map((e) => ({
            name: e.name || "",
            cost: e.cost || 1,
            date: e.date || null,
          })),
        });
      });
      state.currentArcIndex = Math.max(0, state.arcs.length - 1);
    }
    renderXpPool();
    renderXpArcs();
  }

  global.ABNSheetXp = {
    configure,
    renderXpPool,
    renderXpArcs,
    initExperience,
    serialize,
    loadFromCharacterData,
  };
})(window);
