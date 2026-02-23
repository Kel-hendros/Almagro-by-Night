(function initABNSheetDiceUI(global) {
  const state = {
    finalPoolSize: 0,
  };

  const deps = {
    onRollTheDice: null,
    onSave: null,
    onUncheckWillpowerAndSpecialty: null,
    getPhysicalDisciplineBonus: null,
    getActivatedDisciplines: null,
  };

  function configure(nextDeps = {}) {
    deps.onRollTheDice =
      typeof nextDeps.onRollTheDice === "function" ? nextDeps.onRollTheDice : null;
    deps.onSave = typeof nextDeps.onSave === "function" ? nextDeps.onSave : null;
    deps.onUncheckWillpowerAndSpecialty =
      typeof nextDeps.onUncheckWillpowerAndSpecialty === "function"
        ? nextDeps.onUncheckWillpowerAndSpecialty
        : null;
    deps.getPhysicalDisciplineBonus =
      typeof nextDeps.getPhysicalDisciplineBonus === "function"
        ? nextDeps.getPhysicalDisciplineBonus
        : null;
    deps.getActivatedDisciplines =
      typeof nextDeps.getActivatedDisciplines === "function"
        ? nextDeps.getActivatedDisciplines
        : null;
  }

  function save() {
    if (deps.onSave) deps.onSave();
  }

  function getActivatedDisciplines() {
    if (deps.getActivatedDisciplines) return deps.getActivatedDisciplines();
    return new Set();
  }

  function getPhysicalDisciplineBonus(attrName) {
    if (deps.getPhysicalDisciplineBonus) return deps.getPhysicalDisciplineBonus(attrName);
    return null;
  }

  function capitalizeFirstLetter(string) {
    return string.charAt(0).toUpperCase() + string.slice(1);
  }

  function addToPool1(diceValue, labelName) {
    const poolInput = document.querySelector("#dicePool1");
    const poolLabel = document.querySelector("#dicePool1Label");
    if (poolInput) poolInput.value = diceValue;
    if (poolLabel) poolLabel.innerHTML = capitalizeFirstLetter(labelName);
    updateFinalPoolSize();
  }

  function addToPool2(diceNumber, name) {
    const poolInput = document.querySelector("#dicePool2");
    const poolLabel = document.querySelector("#dicePool2Label");
    if (poolInput) poolInput.value = diceNumber;
    if (poolLabel) poolLabel.innerHTML = capitalizeFirstLetter(name);
    updateFinalPoolSize();
  }

  function updateFinalPoolSize() {
    const firstDicePool = parseInt(document.querySelector("#dicePool1")?.value || "0", 10);
    const secondDicePool = parseInt(document.querySelector("#dicePool2")?.value || "0", 10);
    const diceMod = parseInt(document.querySelector("#diceMod")?.value || "0", 10);
    const penalizadorSalud = !!document.querySelector("#penalizadorSalud")?.checked;
    const penalizadorSaludValue = parseInt(
      document.querySelector("#penalizadorSaludLabel")?.innerHTML || "0",
      10
    );

    if (penalizadorSalud) {
      state.finalPoolSize = firstDicePool + secondDicePool + diceMod + penalizadorSaludValue;
    } else {
      state.finalPoolSize = firstDicePool + secondDicePool + diceMod;
    }

    const diceButton = document.querySelector("#diceButton");
    if (!diceButton) return;

    if (state.finalPoolSize <= 0) {
      diceButton.innerHTML = "Sin dados";
      diceButton.classList.add("disabled");
      diceButton.disabled = true;
    } else {
      diceButton.innerHTML = `Lanzar ${state.finalPoolSize}d10`;
      diceButton.classList.remove("disabled");
      diceButton.disabled = false;
    }
  }

  function resetDicePool1() {
    const poolInput = document.querySelector("#dicePool1");
    const poolLabel = document.querySelector("#dicePool1Label");
    if (poolInput) poolInput.value = "0";
    if (poolLabel) poolLabel.innerHTML = "";
    updateFinalPoolSize();

    document.querySelectorAll(".atributo-seleccionado").forEach((attribute) => {
      attribute.classList.remove("atributo-seleccionado");
    });
  }

  function resetDicePool2() {
    const poolInput = document.querySelector("#dicePool2");
    const poolLabel = document.querySelector("#dicePool2Label");
    if (poolInput) poolInput.value = "0";
    if (poolLabel) poolLabel.innerHTML = "";
    updateFinalPoolSize();

    document.querySelectorAll(".habilidad-seleccionada").forEach((ability) => {
      ability.classList.remove("habilidad-seleccionada");
    });
  }

  function resetDiceMod() {
    const mod = document.querySelector("#diceMod");
    if (mod) mod.value = "0";
    updateFinalPoolSize();
  }

  function resetAllDice() {
    resetDicePool1();
    resetDicePool2();
    resetDiceMod();
    updateFinalPoolSize();
    if (deps.onUncheckWillpowerAndSpecialty) deps.onUncheckWillpowerAndSpecialty();

    const difficulty = document.querySelector("#difficulty");
    if (difficulty) difficulty.value = "6";

    const resultContainer = document.querySelector("#diceResults");
    if (resultContainer) {
      resultContainer.classList.add("hidden");
      resultContainer.classList.remove("success", "fail", "botch", "wakeup");
    }
  }

  function initDicePopovers() {
    const popovers = [{ inputId: "#difficulty", popoverId: "#diceDiffPopover" }];

    popovers.forEach(({ inputId, popoverId }) => {
      const input = document.querySelector(inputId);
      const popover = document.querySelector(popoverId);
      if (!input || !popover) return;

      input.addEventListener("click", (event) => {
        event.stopPropagation();
        document.querySelectorAll(".dice-popover:not(.hidden)").forEach((p) => {
          if (p !== popover) p.classList.add("hidden");
        });

        const isOpen = !popover.classList.contains("hidden");
        if (isOpen) {
          popover.classList.add("hidden");
        } else {
          popover.querySelectorAll("button").forEach((btn) => {
            btn.classList.toggle("pop-active", btn.getAttribute("data-val") === input.value);
          });
          popover.classList.remove("hidden");
        }
      });

      popover.addEventListener("click", (event) => {
        const btn = event.target.closest("button[data-val]");
        if (!btn) return;
        input.value = btn.getAttribute("data-val");
        popover.classList.add("hidden");
        updateFinalPoolSize();
        save();
      });
    });

    document.addEventListener("click", (event) => {
      if (!event.target.closest(".dice-popover-wrapper")) {
        document.querySelectorAll(".dice-popover:not(.hidden)").forEach((p) => p.classList.add("hidden"));
      }
    });

    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape") {
        document.querySelectorAll(".dice-popover:not(.hidden)").forEach((p) => p.classList.add("hidden"));
      }
    });
  }

  function bindDiceButton() {
    const diceButton = document.querySelector("#diceButton");
    if (!diceButton) return;
    diceButton.addEventListener("click", () => {
      if (deps.onRollTheDice) deps.onRollTheDice();
    });
  }

  function bindAttributes() {
    const attributesList = document.querySelectorAll(".attributes .form-group.attribute");
    attributesList.forEach((attribute) => {
      const label = attribute.querySelector("label");
      if (!label) return;

      label.addEventListener("click", (event) => {
        const row = event.currentTarget.closest(".form-group.attribute");
        const input = row?.querySelector('input[type="hidden"][id$="-value"]');
        if (!input) return;

        const boostInput = row.querySelector('input[type="hidden"][id^="temp"]');
        const temporalAtribute = boostInput ? parseInt(boostInput.value || "0", 10) : 0;
        const permanentAttribute = parseInt(input.getAttribute("value") || "0", 10);
        const finalAttribute = permanentAttribute + temporalAtribute;

        const attrName = input.getAttribute("name");
        let pool1Value = finalAttribute;
        let pool1Label = capitalizeFirstLetter(attrName);

        const physBonus = getPhysicalDisciplineBonus(attrName);
        if (physBonus) {
          if (physBonus.id === 5) {
            if (physBonus.level > 0) {
              pool1Value += physBonus.level;
              pool1Label += `+${physBonus.shortName}`;
            }
          } else if (!getActivatedDisciplines().has(physBonus.id)) {
            pool1Value += physBonus.level;
            pool1Label += `+${physBonus.shortName}`;
          }
        }

        const poolInput = document.querySelector("#dicePool1");
        const poolLabelEl = document.querySelector("#dicePool1Label");
        if (poolInput) poolInput.value = pool1Value;
        if (poolLabelEl) poolLabelEl.innerHTML = pool1Label;

        document.querySelectorAll(".atributo-seleccionado").forEach((selected) => {
          selected.classList.remove("atributo-seleccionado");
        });

        event.currentTarget.classList.add("atributo-seleccionado");
        updateFinalPoolSize();
      });
    });
  }

  function bindAbilities() {
    const abilitiesList = document.querySelectorAll(".abilities .form-group.attribute label");
    abilitiesList.forEach((ability) => {
      ability.addEventListener("click", (event) => {
        const input = event.currentTarget.parentElement.querySelector('input[type="hidden"]');
        if (!input) return;

        const pool2 = document.querySelector("#dicePool2");
        const pool2Label = document.querySelector("#dicePool2Label");

        if (pool2) pool2.value = input.getAttribute("value");
        if (pool2Label) {
          pool2Label.innerHTML = capitalizeFirstLetter(input.getAttribute("name"));
        }

        document.querySelectorAll(".habilidad-seleccionada").forEach((selected) => {
          selected.classList.remove("habilidad-seleccionada");
        });

        event.currentTarget.classList.add("habilidad-seleccionada");
        updateFinalPoolSize();
      });
    });
  }

  function bindManualInputs() {
    document.querySelector("#dicePool1")?.addEventListener("change", () => {
      updateFinalPoolSize();
    });

    document.querySelector("#dicePool2")?.addEventListener("change", () => {
      updateFinalPoolSize();
    });

    document.querySelector("#diceMod")?.addEventListener("change", function () {
      this.value = parseInt(this.value || "0", 10) || 0;
      updateFinalPoolSize();
      save();
    });

    document.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
      checkbox.addEventListener("change", () => {
        updateFinalPoolSize();
      });
    });
  }

  function bindInputClicks() {
    document.querySelector("#dicePool1")?.addEventListener("click", function () {
      resetDicePool1();
      this.select();
    });

    document.querySelector("#dicePool2")?.addEventListener("click", function () {
      resetDicePool2();
      this.select();
    });

    document.querySelector("#diceMod")?.addEventListener("click", function () {
      this.select();
    });
  }

  function bindResetButton() {
    document.querySelector("#diceResetBtn")?.addEventListener("click", () => {
      resetAllDice();
    });
  }

  function init() {
    bindDiceButton();
    bindAttributes();
    bindAbilities();
    bindManualInputs();
    bindInputClicks();
    bindResetButton();
    initDicePopovers();
  }

  function getFinalPoolSize() {
    return state.finalPoolSize;
  }

  global.ABNSheetDiceUI = {
    configure,
    init,
    getFinalPoolSize,
    capitalizeFirstLetter,
    addToPool1,
    addToPool2,
    updateFinalPoolSize,
    resetDicePool1,
    resetDicePool2,
    resetDiceMod,
    resetAllDice,
  };
})(window);
