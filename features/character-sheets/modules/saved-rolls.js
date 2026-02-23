(function initABNSheetSavedRolls(global) {
  const state = {
    rolls: [],
    nextId: 1,
    editingId: null,
    modalController: null,
  };

  const deps = {
    createModalController: null,
    save: null,
    getSpecialties: null,
    getPhysicalDisciplineBonus: null,
    getActivatedDisciplines: null,
    capitalizeFirstLetter: null,
    updateFinalPoolSize: null,
    rollTheDice: null,
    rollInitiative: null,
    actionWakeUp: null,
  };

  function configure(nextDeps = {}) {
    Object.keys(deps).forEach((key) => {
      deps[key] = typeof nextDeps[key] === "function" ? nextDeps[key] : null;
    });
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function getAttrOptions() {
    const opts = [{ value: "", label: "— Ninguno —" }];
    document.querySelectorAll(".attributes .form-group.attribute").forEach((row) => {
      const input = row.querySelector('input[type="hidden"][id$="-value"]');
      const label = row.querySelector("label");
      if (input && label) opts.push({ value: input.id, label: label.textContent.trim() });
    });
    return opts;
  }

  function getAbilityOptions() {
    const opts = [{ value: "", label: "— Ninguna —" }];
    document.querySelectorAll(".abilities .form-group.attribute").forEach((row) => {
      const input = row.querySelector('input[type="hidden"][id$="-value"]');
      const label = row.querySelector("label");
      if (!input || !label) return;

      opts.push({ value: input.id, label: label.textContent.trim() });
      const attrId = input.id.replace("-value", "");
      const specialties = deps.getSpecialties ? deps.getSpecialties(attrId) : [];
      specialties.forEach((specName) => {
        opts.push({
          value: `${input.id}|spec:${specName}`,
          label: `  Esp. ${label.textContent.trim()}: ${specName}`,
          isSpecialty: true,
        });
      });
    });
    return opts;
  }

  function populateSelects() {
    const pool1Select = document.getElementById("saved-roll-pool1");
    const pool2Select = document.getElementById("saved-roll-pool2");
    const modSelect = document.getElementById("saved-roll-mod");
    const diffSelect = document.getElementById("saved-roll-diff");

    if (pool1Select) {
      pool1Select.innerHTML = "";
      getAttrOptions().forEach((optData) => {
        const option = document.createElement("option");
        option.value = optData.value;
        option.textContent = optData.label;
        pool1Select.appendChild(option);
      });
    }

    if (pool2Select) {
      pool2Select.innerHTML = "";
      getAbilityOptions().forEach((optData) => {
        const option = document.createElement("option");
        option.value = optData.value;
        option.textContent = optData.label;
        if (optData.isSpecialty) option.className = "saved-roll-specialty-opt";
        pool2Select.appendChild(option);
      });
    }

    if (modSelect && modSelect.children.length === 0) {
      for (let i = -5; i <= 5; i += 1) {
        const option = document.createElement("option");
        option.value = String(i);
        option.textContent = i === 0 ? "0" : i > 0 ? `+${i}` : String(i);
        if (i === 0) option.selected = true;
        modSelect.appendChild(option);
      }
    }

    if (diffSelect && diffSelect.children.length === 0) {
      for (let d = 3; d <= 10; d += 1) {
        const option = document.createElement("option");
        option.value = String(d);
        option.textContent = String(d);
        if (d === 6) option.selected = true;
        diffSelect.appendChild(option);
      }
    }
  }

  function executeRoll(roll) {
    const pool1Val = roll.pool1Attr
      ? parseInt(document.getElementById(roll.pool1Attr)?.value, 10) || 0
      : 0;
    const pool2Val = roll.pool2Attr
      ? parseInt(document.getElementById(roll.pool2Attr)?.value, 10) || 0
      : 0;

    let boostVal = 0;
    let physBonusVal = 0;
    let physBonusLabel = "";

    if (roll.pool1Attr) {
      const attrName = roll.pool1Attr.replace("-value", "");
      const boostInput = document.getElementById(
        `temp${attrName.charAt(0).toUpperCase()}${attrName.slice(1)}`
      );
      if (boostInput) boostVal = parseInt(boostInput.value, 10) || 0;

      const physBonus = deps.getPhysicalDisciplineBonus
        ? deps.getPhysicalDisciplineBonus(attrName)
        : null;
      const activated = deps.getActivatedDisciplines
        ? deps.getActivatedDisciplines()
        : null;

      if (physBonus) {
        if (physBonus.id === 5) {
          if (physBonus.level > 0) {
            physBonusVal = physBonus.level;
            physBonusLabel = `+${physBonus.shortName}`;
          }
        } else if (!activated || !activated.has(physBonus.id)) {
          physBonusVal = physBonus.level;
          physBonusLabel = `+${physBonus.shortName}`;
        }
      }
    }

    const pool1Label = roll.pool1Attr
      ? document.getElementById(roll.pool1Attr)?.getAttribute("name") || ""
      : "";
    const pool2Label = roll.pool2Attr
      ? document.getElementById(roll.pool2Attr)?.getAttribute("name") || ""
      : "";
    const capitalize = deps.capitalizeFirstLetter || ((s) => s);

    document.querySelector("#dicePool1").value = String(pool1Val + boostVal + physBonusVal);
    document.querySelector("#dicePool1Label").innerHTML = pool1Label
      ? `${capitalize(pool1Label)}${physBonusLabel}`
      : "";
    document.querySelector("#dicePool2").value = String(pool2Val);
    document.querySelector("#dicePool2Label").innerHTML = pool2Label
      ? capitalize(pool2Label)
      : "";
    document.querySelector("#diceMod").value = String(roll.modifier);
    document.querySelector("#difficulty").value = String(roll.difficulty);

    const specialtyCheckbox = document.querySelector("#specialty");
    const specialtyLabel = document.querySelector('label[for="specialty"]');
    if (roll.specialty && roll.specialty.length > 0) {
      if (specialtyCheckbox) specialtyCheckbox.checked = true;
      if (specialtyLabel) {
        specialtyLabel.textContent = `Usar Especialidad (${roll.specialty})`;
      }
    } else {
      if (specialtyCheckbox) specialtyCheckbox.checked = false;
      if (specialtyLabel) specialtyLabel.textContent = "Usar Especialidad";
    }

    if (deps.updateFinalPoolSize) deps.updateFinalPoolSize();
    if (deps.rollTheDice) deps.rollTheDice();
  }

  function render() {
    const list = document.getElementById("saved-rolls-list");
    if (!list) return;
    list.innerHTML = "";

    const initChip = document.createElement("button");
    initChip.className = "roll-chip roll-chip-fixed";
    initChip.type = "button";
    initChip.textContent = "Iniciativa";
    initChip.addEventListener("click", () => {
      if (deps.rollInitiative) deps.rollInitiative();
    });
    list.appendChild(initChip);

    const wakeChip = document.createElement("button");
    wakeChip.className = "roll-chip roll-chip-fixed";
    wakeChip.type = "button";
    wakeChip.textContent = "Despertarse";
    wakeChip.addEventListener("click", () => {
      if (deps.actionWakeUp) deps.actionWakeUp();
    });
    list.appendChild(wakeChip);

    state.rolls.forEach((roll) => {
      const wrap = document.createElement("div");
      wrap.className = "roll-chip-wrap";

      const chip = document.createElement("button");
      chip.className = "roll-chip";
      chip.type = "button";
      chip.textContent = roll.name;
      chip.addEventListener("click", () => executeRoll(roll));

      const actions = document.createElement("div");
      actions.className = "roll-chip-actions";

      const editBtn = document.createElement("button");
      editBtn.className = "roll-chip-action";
      editBtn.type = "button";
      editBtn.textContent = "✎";
      editBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        openModal(roll);
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "roll-chip-action delete";
      deleteBtn.type = "button";
      deleteBtn.textContent = "✕";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        state.rolls.splice(
          state.rolls.findIndex((r) => r.id === roll.id),
          1
        );
        render();
        persist();
      });

      actions.appendChild(editBtn);
      actions.appendChild(deleteBtn);
      wrap.appendChild(chip);
      wrap.appendChild(actions);
      list.appendChild(wrap);
    });
  }

  function openModal(rollToEdit) {
    const title = document.getElementById("saved-roll-modal-title");
    const nameInput = document.getElementById("saved-roll-name");
    const pool1Select = document.getElementById("saved-roll-pool1");
    const pool2Select = document.getElementById("saved-roll-pool2");
    const modSelect = document.getElementById("saved-roll-mod");
    const diffSelect = document.getElementById("saved-roll-diff");
    if (!nameInput || !pool1Select || !pool2Select || !modSelect || !diffSelect) return;

    populateSelects();

    if (rollToEdit) {
      state.editingId = rollToEdit.id;
      if (title) title.textContent = "Editar Tirada";
      nameInput.value = rollToEdit.name;
      pool1Select.value = rollToEdit.pool1Attr;
      pool2Select.value = rollToEdit.specialty
        ? `${rollToEdit.pool2Attr}|spec:${rollToEdit.specialty}`
        : rollToEdit.pool2Attr;
      modSelect.value = String(rollToEdit.modifier);
      diffSelect.value = String(rollToEdit.difficulty);
    } else {
      state.editingId = null;
      if (title) title.textContent = "Nueva Tirada";
      nameInput.value = "";
      pool1Select.value = "";
      pool2Select.value = "";
      modSelect.value = "0";
      diffSelect.value = "6";
    }

    if (state.modalController?.open) state.modalController.open();
    nameInput.focus();
  }

  function closeModal() {
    if (state.modalController?.close) {
      state.modalController.close();
    } else {
      const modal = document.getElementById("saved-roll-modal");
      if (modal) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      }
    }
    state.editingId = null;
  }

  function init() {
    const addBtn = document.getElementById("saved-roll-add-btn");
    const form = document.getElementById("saved-roll-form");
    const closeBtn = document.getElementById("saved-roll-modal-close");
    const cancelBtn = document.getElementById("saved-roll-cancel");
    const modal = document.getElementById("saved-roll-modal");
    if (!addBtn || !form) return;

    state.modalController = deps.createModalController
      ? deps.createModalController({
          overlay: modal,
          closeButtons: [closeBtn, cancelBtn],
        })
      : null;

    addBtn.addEventListener("click", () => openModal(null));

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = document.getElementById("saved-roll-name")?.value?.trim();
      if (!name) return;

      const pool1Attr = document.getElementById("saved-roll-pool1")?.value || "";
      const pool2Raw = document.getElementById("saved-roll-pool2")?.value || "";
      const modifier = parseInt(document.getElementById("saved-roll-mod")?.value, 10) || 0;
      const difficulty = parseInt(document.getElementById("saved-roll-diff")?.value, 10) || 6;

      let pool2Attr = pool2Raw;
      let specialty = "";
      if (pool2Raw.includes("|spec:")) {
        const parts = pool2Raw.split("|spec:");
        pool2Attr = parts[0];
        specialty = parts[1];
      }

      if (state.editingId !== null) {
        const roll = state.rolls.find((r) => r.id === state.editingId);
        if (roll) {
          roll.name = name;
          roll.pool1Attr = pool1Attr;
          roll.pool2Attr = pool2Attr;
          roll.modifier = modifier;
          roll.difficulty = difficulty;
          roll.specialty = specialty;
        }
      } else {
        state.rolls.push({
          id: state.nextId++,
          name,
          pool1Attr,
          pool2Attr,
          modifier,
          difficulty,
          specialty,
        });
      }

      closeModal();
      render();
      persist();
    });
  }

  function serialize() {
    return state.rolls.map((r) => ({
      id: r.id,
      name: r.name,
      pool1Attr: r.pool1Attr,
      pool2Attr: r.pool2Attr,
      modifier: r.modifier,
      difficulty: r.difficulty,
      specialty: r.specialty || "",
    }));
  }

  function loadFromCharacterData(characterData) {
    state.rolls = [];
    state.nextId = 1;

    if (characterData?.savedRolls && Array.isArray(characterData.savedRolls)) {
      characterData.savedRolls.forEach((r) => {
        const roll = {
          id: r.id || state.nextId,
          name: r.name || "",
          pool1Attr: r.pool1Attr || "",
          pool2Attr: r.pool2Attr || "",
          modifier: r.modifier || 0,
          difficulty: r.difficulty || 6,
          specialty: r.specialty || "",
        };
        state.rolls.push(roll);
        if (roll.id >= state.nextId) state.nextId = roll.id + 1;
      });
    }
    render();
  }

  global.ABNSheetSavedRolls = {
    configure,
    init,
    render,
    executeRoll,
    openModal,
    closeModal,
    getAttrOptions,
    getAbilityOptions,
    populateSelects,
    serialize,
    loadFromCharacterData,
  };
})(window);
