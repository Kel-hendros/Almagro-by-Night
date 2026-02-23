(function initABNSheetAttacks(global) {
  const state = {
    attacks: [],
    editingIndex: null,
    modalController: null,
  };

  const deps = {
    createModalController: null,
    save: null,
    getSavedRollAttrOptions: null,
    getSavedRollAbilityOptions: null,
    getPhysicalDisciplineBonus: null,
    getActivatedDisciplines: null,
    capitalizeFirstLetter: null,
    updateFinalPoolSize: null,
    rollTheDice: null,
    setRollContext: null,
    setOnRollComplete: null,
  };

  function configure(nextDeps = {}) {
    Object.keys(deps).forEach((key) => {
      deps[key] = typeof nextDeps[key] === "function" ? nextDeps[key] : null;
    });
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function serialize() {
    return state.attacks.map((a) => ({
      name: a.name,
      attackPool1: a.attackPool1,
      attackPool2: a.attackPool2,
      attackDifficulty: a.attackDifficulty,
      damagePool1: a.damagePool1,
      damagePool2: a.damagePool2,
      damageType: a.damageType,
    }));
  }

  function loadFromCharacterData(characterData) {
    state.attacks = [];
    if (characterData?.attacks && Array.isArray(characterData.attacks)) {
      characterData.attacks.forEach((a) => {
        state.attacks.push({ ...a, pendingExtra: 0 });
      });
    }
    render();
  }

  function loadPoolIntoRoller(poolConfig, poolSelector, labelSelector) {
    const poolEl = document.querySelector(poolSelector);
    const labelEl = document.querySelector(labelSelector);
    if (!poolEl || !labelEl) return;

    if (!poolConfig) {
      poolEl.value = 0;
      labelEl.innerHTML = "";
      return;
    }

    if (poolConfig.type === "attr") {
      const attrId = poolConfig.attr;
      const val = parseInt(document.getElementById(attrId)?.value, 10) || 0;
      const attrName = attrId.replace("-value", "");
      const boostInput = document.getElementById(
        `temp${attrName.charAt(0).toUpperCase()}${attrName.slice(1)}`
      );
      const boostVal = boostInput ? parseInt(boostInput.value, 10) || 0 : 0;

      let physVal = 0;
      let physLabel = "";
      const physBonus = deps.getPhysicalDisciplineBonus
        ? deps.getPhysicalDisciplineBonus(attrName)
        : null;
      const activated = deps.getActivatedDisciplines
        ? deps.getActivatedDisciplines()
        : null;
      if (physBonus) {
        if (physBonus.id === 5) {
          if (physBonus.level > 0) {
            physVal = physBonus.level;
            physLabel = `+${physBonus.shortName}`;
          }
        } else if (!activated || !activated.has(physBonus.id)) {
          physVal = physBonus.level;
          physLabel = `+${physBonus.shortName}`;
        }
      }

      const capitalize = deps.capitalizeFirstLetter || ((s) => s);
      const attrLabel = document.getElementById(attrId)?.getAttribute("name") || attrName;
      poolEl.value = val + boostVal + physVal;
      labelEl.innerHTML = `${capitalize(attrLabel)}${physLabel}`;
      return;
    }

    poolEl.value = poolConfig.value;
    labelEl.innerHTML = String(poolConfig.value);
  }

  function loadAttackRoll(attack) {
    loadPoolIntoRoller(attack.attackPool1, "#dicePool1", "#dicePool1Label");
    loadPoolIntoRoller(attack.attackPool2, "#dicePool2", "#dicePool2Label");
    document.querySelector("#difficulty").value = attack.attackDifficulty;
    document.querySelector("#diceMod").value = 0;

    const specialtyName =
      attack.attackPool1?.specialty || attack.attackPool2?.specialty || null;
    const specialtyCheckbox = document.querySelector("#specialty");
    const specialtyLabel = document.querySelector('label[for="specialty"]');
    if (specialtyName) {
      if (specialtyCheckbox) specialtyCheckbox.checked = true;
      if (specialtyLabel) {
        specialtyLabel.textContent = `Usar Especialidad (${specialtyName})`;
      }
    } else {
      if (specialtyCheckbox) specialtyCheckbox.checked = false;
      if (specialtyLabel) specialtyLabel.textContent = "Usar Especialidad";
    }

    if (deps.updateFinalPoolSize) deps.updateFinalPoolSize();

    if (deps.setRollContext) deps.setRollContext(`Ataque: ${attack.name}`);
    if (deps.setOnRollComplete) {
      deps.setOnRollComplete((result) => {
        const extra = Math.max(0, result.successes - 1);
        attack.pendingExtra = extra;
        render();
      });
    }
  }

  function loadDamageRoll(attack) {
    loadPoolIntoRoller(attack.damagePool1, "#dicePool1", "#dicePool1Label");

    let baseBonus = 0;
    if (attack.damagePool2) {
      if (attack.damagePool2.type === "fixed") {
        baseBonus = attack.damagePool2.value;
      } else if (attack.damagePool2.type === "attr") {
        baseBonus = parseInt(
          document.getElementById(attack.damagePool2.attr)?.value,
          10
        ) || 0;
      }
    }

    const pool2Total = baseBonus + attack.pendingExtra;
    document.querySelector("#dicePool2").value = pool2Total;

    let pool2Label = "";
    if (attack.damagePool2 && attack.pendingExtra > 0) {
      pool2Label = `${baseBonus}+${attack.pendingExtra}`;
    } else if (attack.pendingExtra > 0) {
      pool2Label = `+${attack.pendingExtra}`;
    } else if (attack.damagePool2) {
      pool2Label = String(baseBonus);
    }
    document.querySelector("#dicePool2Label").innerHTML = pool2Label;
    document.querySelector("#difficulty").value = 6;
    document.querySelector("#diceMod").value = 0;

    const dmgSpecialty =
      attack.damagePool1?.specialty || attack.damagePool2?.specialty || null;
    const specialtyCheckbox = document.querySelector("#specialty");
    const specialtyLabel = document.querySelector('label[for="specialty"]');
    if (dmgSpecialty) {
      if (specialtyCheckbox) specialtyCheckbox.checked = true;
      if (specialtyLabel) {
        specialtyLabel.textContent = `Usar Especialidad (${dmgSpecialty})`;
      }
    } else {
      if (specialtyCheckbox) specialtyCheckbox.checked = false;
      if (specialtyLabel) specialtyLabel.textContent = "Usar Especialidad";
    }

    if (deps.updateFinalPoolSize) deps.updateFinalPoolSize();
    if (deps.setRollContext) deps.setRollContext(`Daño: ${attack.name} (${attack.damageType})`);
    attack.pendingExtra = 0;
    render();
  }

  function render() {
    const list = document.getElementById("attack-list");
    if (!list) return;
    list.innerHTML = "";

    if (state.attacks.length === 0) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.style.textAlign = "center";
      empty.style.padding = "16px 0";
      empty.textContent = "Sin ataques definidos";
      list.appendChild(empty);
      return;
    }

    state.attacks.forEach((attack, idx) => {
      const item = document.createElement("div");
      item.className = "attack-item";

      const header = document.createElement("div");
      header.className = "attack-item-header";

      const nameSpan = document.createElement("span");
      nameSpan.className = "attack-item-name";
      nameSpan.textContent = attack.name;
      nameSpan.title = attack.name;
      header.appendChild(nameSpan);

      const controls = document.createElement("div");
      controls.className = "attack-item-controls";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.textContent = "✎";
      editBtn.title = "Editar";
      editBtn.addEventListener("click", () => openModal(idx));
      controls.appendChild(editBtn);

      const deleteBtn = document.createElement("button");
      deleteBtn.type = "button";
      deleteBtn.textContent = "✕";
      deleteBtn.title = "Eliminar";
      deleteBtn.addEventListener("click", () => {
        state.attacks.splice(idx, 1);
        render();
        persist();
      });
      controls.appendChild(deleteBtn);

      header.appendChild(controls);
      item.appendChild(header);

      const actions = document.createElement("div");
      actions.className = "attack-actions";

      const atkBtn = document.createElement("button");
      atkBtn.type = "button";
      atkBtn.className = "attack-btn attack-btn-attack";
      atkBtn.innerHTML = "⚔ Atacar";
      atkBtn.addEventListener("click", () => loadAttackRoll(attack));
      actions.appendChild(atkBtn);

      const dmgBtn = document.createElement("button");
      dmgBtn.type = "button";
      dmgBtn.className = "attack-btn attack-btn-damage";
      if (attack.pendingExtra > 0) {
        dmgBtn.classList.add("has-pending");
        dmgBtn.innerHTML = `💀 Daño <span class="attack-pending-badge">+${attack.pendingExtra}</span>`;
      } else {
        dmgBtn.innerHTML = "💀 Daño";
      }
      dmgBtn.addEventListener("click", () => loadDamageRoll(attack));
      actions.appendChild(dmgBtn);

      if (attack.pendingExtra > 0) {
        const resetBtn = document.createElement("button");
        resetBtn.type = "button";
        resetBtn.className = "attack-btn-reset";
        resetBtn.textContent = "↺";
        resetBtn.title = "Resetear éxitos extra";
        resetBtn.addEventListener("click", () => {
          attack.pendingExtra = 0;
          render();
        });
        actions.appendChild(resetBtn);
      }

      item.appendChild(actions);
      list.appendChild(item);
    });
  }

  function populateAttackSelects() {
    const attrOpts = deps.getSavedRollAttrOptions
      ? deps.getSavedRollAttrOptions()
      : [];
    const abilOpts = deps.getSavedRollAbilityOptions
      ? deps.getSavedRollAbilityOptions()
      : [];
    const allOpts = [...attrOpts, ...abilOpts.filter((o) => o.value !== "")];

    const selects = {
      "attack-pool1-attr": attrOpts,
      "attack-pool2-attr": abilOpts,
      "damage-pool1-attr": attrOpts,
      "damage-pool2-attr": allOpts,
    };

    Object.entries(selects).forEach(([id, opts]) => {
      const sel = document.getElementById(id);
      if (!sel) return;
      sel.innerHTML = "";
      opts.forEach((o) => {
        const opt = document.createElement("option");
        opt.value = o.value;
        opt.textContent = o.label;
        sel.appendChild(opt);
      });
    });

    const diffSel = document.getElementById("attack-difficulty");
    if (diffSel) {
      diffSel.innerHTML = "";
      for (let d = 3; d <= 10; d += 1) {
        const opt = document.createElement("option");
        opt.value = d;
        opt.textContent = d;
        if (d === 6) opt.selected = true;
        diffSel.appendChild(opt);
      }
    }
  }

  function setupAttackPoolToggle(radioName, attrSelectId, fixedInputId) {
    const radios = document.querySelectorAll(`input[name="${radioName}"]`);
    const attrSel = document.getElementById(attrSelectId);
    const fixedIn = document.getElementById(fixedInputId);
    if (!attrSel || !fixedIn) return;

    radios.forEach((radio) => {
      radio.addEventListener("change", () => {
        if (radio.value === "attr") {
          attrSel.classList.remove("hidden");
          fixedIn.classList.add("hidden");
        } else {
          attrSel.classList.add("hidden");
          fixedIn.classList.remove("hidden");
        }
      });
    });
  }

  function readPoolFromForm(radioName, attrSelectId, fixedInputId) {
    const selectedType =
      document.querySelector(`input[name="${radioName}"]:checked`)?.value || "attr";
    if (selectedType === "attr") {
      const rawVal = document.getElementById(attrSelectId)?.value || "";
      if (!rawVal) return null;
      if (rawVal.includes("|spec:")) {
        const [attr, specPart] = rawVal.split("|spec:");
        return { type: "attr", attr, specialty: specPart };
      }
      return { type: "attr", attr: rawVal };
    }
    const val = parseInt(document.getElementById(fixedInputId)?.value, 10) || 0;
    return { type: "fixed", value: val };
  }

  function setPoolInForm(poolConfig, radioName, attrSelectId, fixedInputId) {
    const attrRadio = document.querySelector(
      `input[name="${radioName}"][value="attr"]`
    );
    const fixedRadio = document.querySelector(
      `input[name="${radioName}"][value="fixed"]`
    );
    const attrSel = document.getElementById(attrSelectId);
    const fixedIn = document.getElementById(fixedInputId);
    if (!attrSel || !fixedIn) return;

    if (poolConfig && poolConfig.type === "fixed") {
      if (fixedRadio) fixedRadio.checked = true;
      attrSel.classList.add("hidden");
      fixedIn.classList.remove("hidden");
      fixedIn.value = poolConfig.value;
      attrSel.value = "";
      return;
    }

    if (attrRadio) attrRadio.checked = true;
    attrSel.classList.remove("hidden");
    fixedIn.classList.add("hidden");
    fixedIn.value = 0;
    if (poolConfig && poolConfig.type === "attr") {
      attrSel.value = poolConfig.specialty
        ? `${poolConfig.attr}|spec:${poolConfig.specialty}`
        : poolConfig.attr;
    } else {
      attrSel.value = "";
    }
  }

  function openModal(editIndex) {
    const title = document.getElementById("attack-modal-title");
    const attackForm = document.getElementById("attack-form");

    populateAttackSelects();
    setupAttackPoolToggle("atkPool1Type", "attack-pool1-attr", "attack-pool1-fixed");
    setupAttackPoolToggle("atkPool2Type", "attack-pool2-attr", "attack-pool2-fixed");
    setupAttackPoolToggle("dmgPool1Type", "damage-pool1-attr", "damage-pool1-fixed");
    setupAttackPoolToggle("dmgPool2Type", "damage-pool2-attr", "damage-pool2-fixed");

    if (editIndex !== undefined && editIndex !== null) {
      state.editingIndex = editIndex;
      if (title) title.textContent = "Editar Ataque";
      const attack = state.attacks[editIndex];
      document.getElementById("attack-name").value = attack.name;
      setPoolInForm(attack.attackPool1, "atkPool1Type", "attack-pool1-attr", "attack-pool1-fixed");
      setPoolInForm(attack.attackPool2, "atkPool2Type", "attack-pool2-attr", "attack-pool2-fixed");
      document.getElementById("attack-difficulty").value = attack.attackDifficulty || 6;
      setPoolInForm(attack.damagePool1, "dmgPool1Type", "damage-pool1-attr", "damage-pool1-fixed");
      setPoolInForm(attack.damagePool2, "dmgPool2Type", "damage-pool2-attr", "damage-pool2-fixed");
      document.getElementById("attack-damage-type").value = attack.damageType || "L";
    } else {
      state.editingIndex = null;
      if (title) title.textContent = "Nuevo Ataque";
      attackForm?.reset();
      setPoolInForm(null, "atkPool1Type", "attack-pool1-attr", "attack-pool1-fixed");
      setPoolInForm(null, "atkPool2Type", "attack-pool2-attr", "attack-pool2-fixed");
      setPoolInForm(null, "dmgPool1Type", "damage-pool1-attr", "damage-pool1-fixed");
      setPoolInForm(
        { type: "fixed", value: 0 },
        "dmgPool2Type",
        "damage-pool2-attr",
        "damage-pool2-fixed"
      );
    }

    if (state.modalController?.open) state.modalController.open();
  }

  function closeModal() {
    if (state.modalController?.close) {
      state.modalController.close();
    } else {
      const modal = document.getElementById("attack-modal");
      if (modal) {
        modal.classList.add("hidden");
        modal.setAttribute("aria-hidden", "true");
      }
    }
    state.editingIndex = null;
  }

  function init() {
    const addBtn = document.getElementById("attack-add-btn");
    const closeBtn = document.getElementById("attack-modal-close");
    const cancelBtn = document.getElementById("attack-modal-cancel");
    const form = document.getElementById("attack-form");
    const modal = document.getElementById("attack-modal");

    state.modalController = deps.createModalController
      ? deps.createModalController({
          overlay: modal,
          closeButtons: [closeBtn, cancelBtn],
        })
      : null;

    if (addBtn) addBtn.addEventListener("click", () => openModal());

    if (form) {
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const name = document.getElementById("attack-name")?.value?.trim();
        if (!name) return;

        const attackData = {
          name,
          attackPool1: readPoolFromForm("atkPool1Type", "attack-pool1-attr", "attack-pool1-fixed"),
          attackPool2: readPoolFromForm("atkPool2Type", "attack-pool2-attr", "attack-pool2-fixed"),
          attackDifficulty:
            parseInt(document.getElementById("attack-difficulty")?.value, 10) || 6,
          damagePool1: readPoolFromForm("dmgPool1Type", "damage-pool1-attr", "damage-pool1-fixed"),
          damagePool2: readPoolFromForm("dmgPool2Type", "damage-pool2-attr", "damage-pool2-fixed"),
          damageType: document.getElementById("attack-damage-type")?.value || "L",
          pendingExtra: 0,
        };

        if (state.editingIndex !== null && state.editingIndex !== undefined) {
          attackData.pendingExtra = state.attacks[state.editingIndex].pendingExtra || 0;
          state.attacks[state.editingIndex] = attackData;
        } else {
          state.attacks.push(attackData);
        }

        render();
        persist();
        closeModal();
      });
    }
  }

  global.ABNSheetAttacks = {
    configure,
    init,
    serialize,
    loadFromCharacterData,
    render,
    openModal,
    closeModal,
    populateAttackSelects,
  };
})(window);
