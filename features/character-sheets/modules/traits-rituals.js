(function initABNSheetTraitsRituals(global) {
  const state = {
    merits: [],
    defects: [],
    rituals: [],
  };

  const deps = {
    save: null,
    getDisciplineName: null,
    openDisciplineModal: null,
  };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
    deps.getDisciplineName =
      typeof nextDeps.getDisciplineName === "function"
        ? nextDeps.getDisciplineName
        : null;
    deps.openDisciplineModal =
      typeof nextDeps.openDisciplineModal === "function"
        ? nextDeps.openDisciplineModal
        : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function disciplineName(id) {
    if (deps.getDisciplineName) return deps.getDisciplineName(id);
    return "Disciplina";
  }

  function requestDiscipline(options) {
    if (deps.openDisciplineModal) {
      deps.openDisciplineModal(options);
    }
  }

  function renderMeritDefectList(items, listId, prefix) {
    const listEl = document.getElementById(listId);
    if (!listEl) return;
    listEl.innerHTML = "";

    const emptyText =
      prefix === "-"
        ? "No hay méritos. Usa + para agregar."
        : "No hay defectos. Usa + para agregar.";

    if (items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "specialty-subtitle";
      empty.style.textAlign = "center";
      empty.style.margin = "16px 0";
      empty.textContent = emptyText;
      listEl.appendChild(empty);
      return;
    }

    items.forEach((entry, idx) => {
      const item = document.createElement("div");
      item.className = "background-item";

      const row = document.createElement("div");
      row.className = "background-row";

      const titleBtn = document.createElement("button");
      titleBtn.className = "background-title-btn";
      titleBtn.type = "button";
      titleBtn.textContent = entry.name;
      titleBtn.addEventListener("click", () => {
        item.classList.toggle("open");
      });

      const valueBadge = document.createElement("span");
      valueBadge.className = "background-value";
      valueBadge.textContent = `${prefix}${Math.max(1, Number(entry.value || 1))}`;

      const editBtn = document.createElement("button");
      editBtn.className = "background-edit-btn";
      editBtn.type = "button";
      editBtn.innerHTML = "✎";
      editBtn.title = prefix === "-" ? "Editar mérito" : "Editar defecto";
      editBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isEditing = item.classList.contains("editing");
        if (isEditing) {
          item.classList.remove("editing", "open");
          return;
        }

        item.classList.add("editing", "open");
        descEl.innerHTML = "";
        const editForm = document.createElement("form");
        editForm.className = "background-edit-form";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = entry.name;
        nameInput.placeholder = "Nombre";
        nameInput.maxLength = 60;

        const valueInput = document.createElement("input");
        valueInput.type = "number";
        valueInput.min = "1";
        valueInput.step = "1";
        valueInput.value = entry.value || 1;
        valueInput.placeholder = "Valor";

        const descInput = document.createElement("textarea");
        descInput.rows = 3;
        descInput.value = entry.description || "";
        descInput.placeholder = "Descripción (opcional)";

        const actions = document.createElement("div");
        actions.className = "form-actions";

        const saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "background-save-btn";
        saveBtn.textContent = "Guardar";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "form-cancel-btn";
        cancelBtn.textContent = "Cancelar";
        cancelBtn.addEventListener("click", () => {
          item.classList.remove("editing", "open");
          descEl.textContent = entry.description || "";
        });

        editForm.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const newName = nameInput.value.trim();
          if (!newName) return;
          entry.name = newName;
          entry.value = Math.max(1, Number(valueInput.value) || 1);
          entry.description = descInput.value.trim();
          persist();
          renderMeritDefectList(items, listId, prefix);
        });

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        editForm.appendChild(nameInput);
        editForm.appendChild(valueInput);
        editForm.appendChild(descInput);
        editForm.appendChild(actions);
        descEl.appendChild(editForm);
        nameInput.focus();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "background-delete-btn";
      deleteBtn.type = "button";
      deleteBtn.innerHTML = "✕";
      deleteBtn.title = prefix === "-" ? "Eliminar mérito" : "Eliminar defecto";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        items.splice(idx, 1);
        renderMeritDefectList(items, listId, prefix);
        persist();
      });

      row.appendChild(titleBtn);
      row.appendChild(valueBadge);
      row.appendChild(editBtn);
      row.appendChild(deleteBtn);

      const descEl = document.createElement("div");
      descEl.className = "background-description";
      descEl.textContent = entry.description || "";

      item.appendChild(row);
      item.appendChild(descEl);
      listEl.appendChild(item);
    });
  }

  function renderRitualList() {
    const listEl = document.getElementById("ritual-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (state.rituals.length === 0) {
      const empty = document.createElement("p");
      empty.className = "specialty-subtitle";
      empty.style.textAlign = "center";
      empty.style.margin = "16px 0";
      empty.textContent = "No hay rituales. Usa + para agregar.";
      listEl.appendChild(empty);
      return;
    }

    const groups = {};
    state.rituals.forEach((r, idx) => {
      const key = r.disciplineId || 0;
      if (!groups[key]) groups[key] = [];
      groups[key].push({ ...r, _index: idx });
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => {
      const nameA = disciplineName(Number(a));
      const nameB = disciplineName(Number(b));
      return nameA.localeCompare(nameB);
    });

    sortedKeys.forEach((key) => {
      const discName = Number(key) ? disciplineName(Number(key)) : "Sin disciplina";
      const rituals = groups[key].sort((a, b) => a.level - b.level);

      const group = document.createElement("div");
      group.className = "ritual-group";

      const header = document.createElement("button");
      header.className = "ritual-group-header";
      header.type = "button";
      header.textContent = discName;
      header.addEventListener("click", () => group.classList.toggle("open"));

      const body = document.createElement("div");
      body.className = "ritual-group-body";

      rituals.forEach((r) => {
        const item = document.createElement("div");
        item.className = "background-item";

        const row = document.createElement("div");
        row.className = "background-row";

        const titleBtn = document.createElement("button");
        titleBtn.className = "background-title-btn";
        titleBtn.type = "button";
        titleBtn.textContent = r.name;
        titleBtn.addEventListener("click", () => item.classList.toggle("open"));

        const levelBadge = document.createElement("span");
        levelBadge.className = "ritual-level-badge";
        levelBadge.textContent = "Nv. " + r.level;

        const editBtn = document.createElement("button");
        editBtn.className = "background-edit-btn";
        editBtn.type = "button";
        editBtn.innerHTML = "✎";
        editBtn.title = "Editar ritual";
        editBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          const isEditing = item.classList.contains("editing");
          if (isEditing) {
            item.classList.remove("editing", "open");
            renderRitualList();
            return;
          }

          item.classList.add("editing", "open");
          descEl.innerHTML = "";
          const editForm = document.createElement("form");
          editForm.className = "background-edit-form";

          const nameInput = document.createElement("input");
          nameInput.type = "text";
          nameInput.value = r.name;
          nameInput.placeholder = "Nombre";
          nameInput.maxLength = 100;

          const levelInput = document.createElement("input");
          levelInput.type = "number";
          levelInput.min = "1";
          levelInput.step = "1";
          levelInput.value = r.level;
          levelInput.placeholder = "Nivel";

          const descInput = document.createElement("textarea");
          descInput.rows = 3;
          descInput.value = r.description || "";
          descInput.placeholder = "Descripción (opcional)";

          let editDisciplineId = r.disciplineId;
          const discBtn = document.createElement("button");
          discBtn.type = "button";
          discBtn.className =
            "ritual-discipline-select" + (editDisciplineId ? " has-value" : "");
          discBtn.textContent = editDisciplineId
            ? disciplineName(editDisciplineId)
            : "Seleccionar disciplina...";
          discBtn.addEventListener("click", () => {
            requestDiscipline({
              mode: "single",
              onSelect: (id) => {
                editDisciplineId = id;
                discBtn.textContent = disciplineName(id);
                discBtn.classList.add("has-value");
              },
            });
          });

          const actions = document.createElement("div");
          actions.className = "form-actions";
          const saveBtn = document.createElement("button");
          saveBtn.type = "submit";
          saveBtn.className = "background-save-btn";
          saveBtn.textContent = "Guardar";

          editForm.append(nameInput, levelInput, discBtn, descInput, actions);
          actions.appendChild(saveBtn);

          editForm.addEventListener("submit", (ev) => {
            ev.preventDefault();
            const newName = nameInput.value.trim();
            if (!newName) return;
            state.rituals[r._index].name = newName;
            state.rituals[r._index].level = Math.max(1, Number(levelInput.value) || 1);
            state.rituals[r._index].disciplineId = editDisciplineId;
            state.rituals[r._index].description = descInput.value.trim();
            renderRitualList();
            persist();
          });

          descEl.appendChild(editForm);
          nameInput.focus();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "background-delete-btn";
        deleteBtn.type = "button";
        deleteBtn.innerHTML = "✕";
        deleteBtn.title = "Eliminar ritual";
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          state.rituals.splice(r._index, 1);
          renderRitualList();
          persist();
        });

        const descEl = document.createElement("div");
        descEl.className = "background-description";
        descEl.textContent = r.description || "";

        row.append(titleBtn, levelBadge, editBtn, deleteBtn);
        item.append(row, descEl);
        body.appendChild(item);
      });

      group.append(header, body);
      listEl.appendChild(group);
    });
  }

  function init() {
    function wireSection(
      toggleId,
      formId,
      nameId,
      costId,
      descId,
      cancelId,
      items,
      listId,
      prefix
    ) {
      const toggleBtn = document.getElementById(toggleId);
      const form = document.getElementById(formId);
      const nameInput = document.getElementById(nameId);
      const costInput = document.getElementById(costId);
      const descInput = document.getElementById(descId);
      const cancelBtn = document.getElementById(cancelId);
      if (!toggleBtn || !form) return;

      toggleBtn.addEventListener("click", () => {
        form.classList.toggle("hidden");
        if (!form.classList.contains("hidden") && nameInput) nameInput.focus();
      });

      if (cancelBtn) {
        cancelBtn.addEventListener("click", () => {
          form.classList.add("hidden");
          if (nameInput) nameInput.value = "";
          if (costInput) costInput.value = "1";
          if (descInput) descInput.value = "";
        });
      }

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = nameInput ? nameInput.value.trim() : "";
        if (!name) return;
        const value = Math.max(1, Number(costInput ? costInput.value : 1) || 1);
        const description = descInput ? descInput.value.trim() : "";
        items.push({ name, description, value });
        renderMeritDefectList(items, listId, prefix);
        persist();
        if (nameInput) nameInput.value = "";
        if (costInput) costInput.value = "1";
        if (descInput) descInput.value = "";
        form.classList.add("hidden");
      });
    }

    wireSection(
      "merit-add-toggle",
      "merit-add-form",
      "merit-name",
      "merit-cost",
      "merit-description",
      "merit-add-cancel",
      state.merits,
      "merit-list",
      "-"
    );
    wireSection(
      "defect-add-toggle",
      "defect-add-form",
      "defect-name",
      "defect-cost",
      "defect-description",
      "defect-add-cancel",
      state.defects,
      "defect-list",
      "+"
    );

    const toggleBtn = document.getElementById("ritual-add-toggle");
    const form = document.getElementById("ritual-add-form");
    const nameInput = document.getElementById("ritual-name");
    const levelInput = document.getElementById("ritual-level");
    const discBtn = document.getElementById("ritual-discipline-btn");
    const discIdInput = document.getElementById("ritual-discipline-id");
    const descInput = document.getElementById("ritual-description");
    const cancelBtn = document.getElementById("ritual-add-cancel");
    if (!toggleBtn || !form) return;

    toggleBtn.addEventListener("click", () => {
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden") && nameInput) nameInput.focus();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        form.classList.add("hidden");
        if (nameInput) nameInput.value = "";
        if (levelInput) levelInput.value = "1";
        if (discIdInput) discIdInput.value = "";
        if (discBtn) {
          discBtn.textContent = "Seleccionar disciplina...";
          discBtn.classList.remove("has-value");
        }
        if (descInput) descInput.value = "";
      });
    }

    if (discBtn) {
      discBtn.addEventListener("click", () => {
        requestDiscipline({
          mode: "single",
          onSelect: (id) => {
            if (discIdInput) discIdInput.value = id;
            discBtn.textContent = disciplineName(id);
            discBtn.classList.add("has-value");
          },
        });
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;
      const level = Math.max(1, Number(levelInput ? levelInput.value : 1) || 1);
      const disciplineId = discIdInput ? Number(discIdInput.value) || null : null;
      const description = descInput ? descInput.value.trim() : "";

      state.rituals.push({ name, level, disciplineId, description });
      renderRitualList();
      persist();

      if (nameInput) nameInput.value = "";
      if (levelInput) levelInput.value = "1";
      if (discIdInput) discIdInput.value = "";
      if (discBtn) {
        discBtn.textContent = "Seleccionar disciplina...";
        discBtn.classList.remove("has-value");
      }
      if (descInput) descInput.value = "";
      form.classList.add("hidden");
    });
  }

  function getMeritsData() {
    return state.merits.map((m) => ({
      name: m.name,
      description: m.description || "",
      value: m.value,
    }));
  }

  function getDefectsData() {
    return state.defects.map((d) => ({
      name: d.name,
      description: d.description || "",
      value: d.value,
    }));
  }

  function loadMeritsFromCharacterData(characterData) {
    state.merits = [];
    if (characterData?.merits && Array.isArray(characterData.merits)) {
      characterData.merits.forEach((m) => {
        state.merits.push({
          name: m.name || "",
          description: m.description || "",
          value: m.value || 1,
        });
      });
    }
    renderMeritDefectList(state.merits, "merit-list", "-");
  }

  function loadDefectsFromCharacterData(characterData) {
    state.defects = [];
    if (characterData?.defects && Array.isArray(characterData.defects)) {
      characterData.defects.forEach((d) => {
        state.defects.push({
          name: d.name || "",
          description: d.description || "",
          value: d.value || 1,
        });
      });
    }
    renderMeritDefectList(state.defects, "defect-list", "+");
  }

  function getRitualsData() {
    return state.rituals.map((r) => ({
      name: r.name,
      level: r.level,
      disciplineId: r.disciplineId,
      description: r.description || "",
    }));
  }

  function loadRitualsFromCharacterData(characterData) {
    state.rituals = [];
    if (characterData?.rituals && Array.isArray(characterData.rituals)) {
      characterData.rituals.forEach((r) => {
        state.rituals.push({
          name: r.name || "",
          level: r.level || 1,
          disciplineId: r.disciplineId || null,
          description: r.description || "",
        });
      });
    }
    renderRitualList();
  }

  global.ABNSheetTraitsRituals = {
    configure,
    init,
    renderMeritDefectList,
    renderRitualList,
    getMeritsData,
    getDefectsData,
    getRitualsData,
    loadMeritsFromCharacterData,
    loadDefectsFromCharacterData,
    loadRitualsFromCharacterData,
  };
})(window);
