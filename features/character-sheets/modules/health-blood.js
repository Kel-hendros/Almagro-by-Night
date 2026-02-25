(function initABNSheetHealthBlood(global) {
  const deps = {
    save: null,
    updateFinalPoolSize: null,
    flashBloodWarning: null,
    flashBloodConsume: null,
    beforeConsume: null,
    afterConsume: null,
  };

  const HEALTH_LEVEL_TEXTS = [
    "",
    "",
    "Movimiento a mitad de velocidad máxima.",
    "No puede correr. Pierde dados si se mueve y ataca en el mismo turno.",
    "Solo puede cojear (3 metros/turno).",
    "Solo puede arrastrarse (1 metro/turno).",
    "Inconsciente. Sin Sangre, entra en Letargo.",
  ];

  let healthSquares = [];
  let damagePenalty = 0;

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
    deps.updateFinalPoolSize =
      typeof nextDeps.updateFinalPoolSize === "function"
        ? nextDeps.updateFinalPoolSize
        : null;
    deps.flashBloodWarning =
      typeof nextDeps.flashBloodWarning === "function"
        ? nextDeps.flashBloodWarning
        : null;
    deps.flashBloodConsume =
      typeof nextDeps.flashBloodConsume === "function"
        ? nextDeps.flashBloodConsume
        : null;
    deps.beforeConsume =
      typeof nextDeps.beforeConsume === "function"
        ? nextDeps.beforeConsume
        : null;
    deps.afterConsume =
      typeof nextDeps.afterConsume === "function"
        ? nextDeps.afterConsume
        : null;
  }

  function setConsumeHooks(hooks = {}) {
    if (typeof hooks.beforeConsume === "function") {
      deps.beforeConsume = hooks.beforeConsume;
    }
    if (typeof hooks.afterConsume === "function") {
      deps.afterConsume = hooks.afterConsume;
    }
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function updatePoolSize() {
    if (deps.updateFinalPoolSize) deps.updateFinalPoolSize();
  }

  function flashBloodWarning() {
    if (deps.flashBloodWarning) deps.flashBloodWarning();
  }

  function flashBloodConsume() {
    if (deps.flashBloodConsume) deps.flashBloodConsume();
  }

  function getHealthValues() {
    const values = [];
    healthSquares.forEach((square) => {
      values.push(square.nextElementSibling.value);
    });
    values.sort((a, b) => b - a);
    return values;
  }

  function updateHealthValues() {
    const values = getHealthValues();
    healthSquares.forEach((square, index) => {
      square.nextElementSibling.value = values[index];
    });
  }

  function updateHealthSquares() {
    healthSquares.forEach((square) => {
      square.classList.remove("contundente", "letal", "agravado");
      const value = square.nextElementSibling.value;
      if (value === "1" || value === 1) square.classList.add("contundente");
      if (value === "2" || value === 2) square.classList.add("letal");
      if (value === "3" || value === 3) square.classList.add("agravado");
    });

    persist();
    updateHealthButtons();
  }

  function updateHealthButtons() {
    const values = getHealthValues();
    const hasEmpty = values.includes("0");
    const hasBashing = values.includes("1");
    const hasLethal = values.includes("2");
    const hasAggravated = values.includes("3");
    const bloodCount = (document.querySelector("#blood-value")?.value || "").replace(/0/g, "").length;

    document.getElementById("contundenteAdd")?.classList.toggle("disabled", !hasEmpty);
    document.getElementById("letalAdd")?.classList.toggle("disabled", !hasEmpty);
    document.getElementById("agravadoAdd")?.classList.toggle("disabled", !hasEmpty);
    document.getElementById("contundenteRemove")?.classList.toggle("disabled", !hasBashing);
    document.getElementById("letalRemove")?.classList.toggle("disabled", !hasLethal);
    document.getElementById("agravadoRemove")?.classList.toggle("disabled", !hasAggravated);
    document
      .getElementById("contundenteHealBlood")
      ?.classList.toggle("disabled", !hasBashing || bloodCount < 1);
    document
      .getElementById("letalHealBlood")
      ?.classList.toggle("disabled", !hasLethal || bloodCount < 1);
    document
      .getElementById("agravadoHealBlood")
      ?.classList.toggle("disabled", !hasAggravated || bloodCount < 5);
  }

  function updateHealthImpediment() {
    const impedimentEl = document.getElementById("health-impediment");
    if (!impedimentEl) return;

    let worstLevel = -1;
    healthSquares.forEach((square, index) => {
      const val = Number(square.nextElementSibling.value) || 0;
      if (val > 0) worstLevel = index;
    });

    const message = worstLevel > 0 ? HEALTH_LEVEL_TEXTS[worstLevel] : "";
    if (message) {
      impedimentEl.textContent = message;
      impedimentEl.classList.remove("hidden");
    } else {
      impedimentEl.textContent = "";
      impedimentEl.classList.add("hidden");
    }
  }

  function updateDamagePenalty() {
    const values = getHealthValues();

    let emptyCount = 0;
    for (let i = 0; i < values.length; i += 1) {
      if (values[i] == 0) emptyCount += 1;
    }

    const healthEl = document.querySelector(".health-container");
    const avatarEl = document.querySelector(".profile-back-link");
    const targets = [healthEl, avatarEl].filter(Boolean);

    if (emptyCount >= 6) {
      damagePenalty = 0;
      targets.forEach((el) => el.classList.remove("lesionado", "malherido", "tullido"));
    } else if (emptyCount === 5 || emptyCount === 4) {
      damagePenalty = -1;
      targets.forEach((el) => {
        el.classList.remove("malherido", "tullido");
        el.classList.add("lesionado");
      });
    } else if (emptyCount === 3 || emptyCount === 2) {
      damagePenalty = -2;
      targets.forEach((el) => {
        el.classList.remove("lesionado", "tullido");
        el.classList.add("malherido");
      });
    } else if (emptyCount === 1) {
      damagePenalty = -5;
      targets.forEach((el) => {
        el.classList.remove("lesionado", "malherido");
        el.classList.add("tullido");
      });
    } else if (emptyCount === 0) {
      damagePenalty = -5;
    }

    const penaltyEl = document.querySelector("#penalizadorSaludLabel");
    if (penaltyEl) penaltyEl.innerHTML = damagePenalty;
    updatePoolSize();
    updateHealthImpediment();
  }

  function getBloodPerTurn() {
    const gen = parseInt(document.querySelector("#generacion")?.value, 10);
    if (isNaN(gen) || gen >= 10) return 1;
    if (gen === 9) return 2;
    if (gen === 8) return 3;
    if (gen === 7) return 4;
    if (gen === 6) return 6;
    if (gen === 5) return 8;
    if (gen === 4) return 10;
    return 99;
  }

  function calculateBloodPerTurn() {
    const bloodPerTurn = document.querySelector("#bloodPerTurn");
    if (!bloodPerTurn) return;
    const val = getBloodPerTurn();
    bloodPerTurn.innerHTML = val > 10 ? "???" : String(val);
  }

  function updateBloodPerTurn() {
    calculateBloodPerTurn();
  }

  function getMaxBloodPool() {
    const generationValue = parseInt(document.querySelector("#generacion")?.value, 10);

    if (generationValue <= 6) return 30;
    if (generationValue <= 7) return 20;
    if (generationValue <= 8) return 15;
    if (generationValue <= 9) return 14;
    if (generationValue <= 10) return 13;
    if (generationValue <= 11) return 12;
    if (generationValue <= 12) return 11;
    return 10;
  }

  function blockBloodPool() {
    const cells = document.querySelectorAll("#blood-track .blood-cell");
    const maxBloodPool = getMaxBloodPool();

    cells.forEach((cell, index) => {
      if (index >= maxBloodPool) {
        cell.classList.add("disabled");
      } else {
        cell.classList.remove("disabled");
      }
    });

    const maxLabel = document.getElementById("blood-max-label");
    if (maxLabel) maxLabel.textContent = String(maxBloodPool);
  }

  function modifyBlood(action, type) {
    const bloodInput = document.querySelector("#blood-value");
    if (!bloodInput) return;

    if (action === "consume" && deps.beforeConsume) {
      if (!deps.beforeConsume(1)) return;
    }

    let currentValue = bloodInput.value;
    const maxBloodPool = getMaxBloodPool();
    const bloodBefore = currentValue.replace(/0/g, "").length;

    if (action === "add") {
      if (currentValue.replace(/0/g, "").length < maxBloodPool) {
        const firstZeroIndex = currentValue.indexOf("0");
        if (firstZeroIndex !== -1) {
          currentValue =
            currentValue.substring(0, firstZeroIndex) +
            type +
            currentValue.substring(firstZeroIndex);
        } else if (currentValue.length < maxBloodPool) {
          currentValue += type;
        }
      }
    } else if (action === "consume") {
      if (currentValue.length > 0) {
        currentValue = currentValue.substring(1) + "0";
      }
    }

    currentValue = currentValue.padEnd(maxBloodPool, "0").substring(0, maxBloodPool);
    bloodInput.value = currentValue;
    updateBloodUI();

    if (action === "consume") {
      const bloodAfter = currentValue.replace(/0/g, "").length;
      if (bloodAfter < bloodBefore) {
        flashBloodConsume();
        if (deps.afterConsume) deps.afterConsume(1);
      } else {
        flashBloodWarning();
      }
    }

    persist();
  }

  function consumeBloodPoints(points) {
    const bloodInput = document.querySelector("#blood-value");
    if (!bloodInput) return false;

    if (deps.beforeConsume && !deps.beforeConsume(points)) {
      return false;
    }

    const maxBloodPool = getMaxBloodPool();
    let currentValue = String(bloodInput.value || "").padEnd(maxBloodPool, "0").substring(0, maxBloodPool);
    const before = currentValue.replace(/0/g, "").length;
    if (before < points) {
      flashBloodWarning();
      return false;
    }

    for (let i = 0; i < points; i += 1) {
      currentValue = currentValue.substring(1) + "0";
    }

    bloodInput.value = currentValue;
    updateBloodUI();
    flashBloodConsume();
    persist();
    if (deps.afterConsume) deps.afterConsume(points);
    return true;
  }

  function updateBloodUI() {
    const bloodValue = document.querySelector("#blood-value")?.value || "";

    const cells = document.querySelectorAll("#blood-track .blood-cell");
    cells.forEach((cell, index) => {
      cell.classList.remove("type-1", "type-2", "type-3");
      if (index < bloodValue.length) {
        const type = bloodValue.charAt(index);
        if (type !== "0") {
          cell.classList.add(`type-${type}`);
        }
      }
    });

    blockBloodPool();

    const bloodCount = bloodValue.replace(/0/g, "").length;
    const bloodTitle = document.querySelector(".blood-card .health-title");
    const bloodCard = document.querySelector(".blood-card");
    const attrTitle = document.getElementById("attributes-title");
    const abilTitle = document.getElementById("abilities-title");

    if (!bloodTitle || !bloodCard || !attrTitle || !abilTitle) return;

    bloodCard.classList.remove("blood-urgent", "blood-frenzy");
    attrTitle.classList.remove("blood-frenzy-text");
    abilTitle.classList.remove("blood-frenzy-text");

    if (bloodCount <= 1) {
      bloodTitle.textContent = "SANGRE AHORA!";
      bloodCard.classList.add("blood-frenzy");
      attrTitle.textContent = "HAMBRE!";
      attrTitle.classList.add("blood-frenzy-text");
      abilTitle.textContent = "TENGO QUE BEBER";
      abilTitle.classList.add("blood-frenzy-text");
    } else if (bloodCount <= 4) {
      bloodTitle.textContent = "Sangre! Ya!";
      bloodCard.classList.add("blood-urgent");
      attrTitle.textContent = "Atributos";
      abilTitle.textContent = "Habilidades";
    } else {
      bloodTitle.textContent = "Sangre";
      attrTitle.textContent = "Atributos";
      abilTitle.textContent = "Habilidades";
    }

    updateHealthButtons();
  }

  function bindHealthButtons() {
    const addButtons = document.querySelectorAll('.health-btn[data-health-op="add"]');
    const removeButtons = document.querySelectorAll('.health-btn[data-health-op="remove"]');
    const bloodHealButtons = document.querySelectorAll('.health-btn[data-health-op="heal-blood"]');

    addButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const values = getHealthValues();

        let i = 0;
        for (; i < values.length; i += 1) {
          if (values[i] === "0") break;
        }

        if (i < values.length) {
          if (button.id === "contundenteAdd") values[i] = 1;
          if (button.id === "letalAdd") values[i] = 2;
          if (button.id === "agravadoAdd") values[i] = 3;
        }

        values.sort((a, b) => b - a);
        healthSquares.forEach((square, index) => {
          square.nextElementSibling.value = values[index];
        });

        updateHealthSquares();
        updateDamagePenalty();

        const avatar = document.querySelector(".profile-back-link");
        if (avatar) {
          avatar.classList.remove("hit");
          void avatar.offsetWidth;
          avatar.classList.add("hit");
          avatar.addEventListener("animationend", () => avatar.classList.remove("hit"), {
            once: true,
          });
        }
      });
    });

    removeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const values = getHealthValues();

        let searchValue = "0";
        if (button.id === "contundenteRemove") searchValue = "1";
        if (button.id === "letalRemove") searchValue = "2";
        if (button.id === "agravadoRemove") searchValue = "3";

        let i = 0;
        for (; i < values.length; i += 1) {
          if (values[i] === searchValue) break;
        }

        if (i < values.length) values[i] = "0";

        values.sort((a, b) => b - a);
        healthSquares.forEach((square, index) => {
          square.nextElementSibling.value = values[index];
        });

        updateHealthSquares();
        updateDamagePenalty();
      });
    });

    bloodHealButtons.forEach((button) => {
      button.addEventListener("click", () => {
        if (button.classList.contains("disabled")) return;

        const values = getHealthValues();
        const type = button.getAttribute("data-health-type");
        const searchValue = type === "1" ? "1" : type === "2" ? "2" : "3";
        const bloodCost = type === "3" ? 5 : 1;

        let i = 0;
        for (; i < values.length; i += 1) {
          if (values[i] === searchValue) break;
        }
        if (i >= values.length) return;
        if (!consumeBloodPoints(bloodCost)) return;

        values[i] = "0";
        values.sort((a, b) => b - a);
        healthSquares.forEach((square, index) => {
          square.nextElementSibling.value = values[index];
        });

        updateHealthSquares();
        updateDamagePenalty();
      });
    });
  }

  function bindGenerationChange() {
    const generationInput = document.querySelector("#generacion");
    if (!generationInput) return;

    generationInput.addEventListener("change", () => {
      updateBloodPerTurn();
      blockBloodPool();
    });
  }

  function bindBloodActions() {
    document.querySelectorAll("[data-blood-op]").forEach((btn) => {
      btn.addEventListener("click", () => {
        const op = btn.getAttribute("data-blood-op");
        const type = btn.getAttribute("data-blood-type") || "";
        modifyBlood(op, type);
      });
    });
  }

  function init() {
    healthSquares = Array.from(document.querySelectorAll(".square"));
    bindHealthButtons();
    bindGenerationChange();
    bindBloodActions();
  }

  global.ABNSheetHealthBlood = {
    configure,
    setConsumeHooks,
    init,
    getHealthValues,
    updateHealthValues,
    updateHealthSquares,
    updateHealthButtons,
    updateDamagePenalty,
    updateHealthImpediment,
    calculateBloodPerTurn,
    updateBloodPerTurn,
    getBloodPerTurn,
    getMaxBloodPool,
    blockBloodPool,
    modifyBlood,
    updateBloodUI,
    getDamagePenalty: () => damagePenalty,
  };
})(window);
