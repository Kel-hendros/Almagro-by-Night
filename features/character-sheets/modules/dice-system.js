(function initABNSheetDiceSystem(global) {
  const deps = {
    createModalController: null,
    getFinalPoolSize: null,
    getPhysicalDisciplineBonus: null,
    getActivatedDisciplines: null,
    getCharacterIdentity: null,
    getDiscordConfig: null,
    flashBloodWarning: null,
    modifyBlood: null,
    renderWillpowerTrack: null,
    save: null,
    getDiceValues: null,
  };

  const state = {
    diceRollHistory: [],
    diceHistoryModalController: null,
    rollContextName: "",
    onRollComplete: null,
    lastRollWas3D: false,
  };

  const DICE_HISTORY_MAX = 20;

  function getSheetUrl() {
    if (!global.location) return "";
    return `${global.location.origin}${global.location.pathname}`;
  }

  function configure(nextDeps = {}) {
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.getFinalPoolSize =
      typeof nextDeps.getFinalPoolSize === "function" ? nextDeps.getFinalPoolSize : null;
    deps.getPhysicalDisciplineBonus =
      typeof nextDeps.getPhysicalDisciplineBonus === "function"
        ? nextDeps.getPhysicalDisciplineBonus
        : null;
    deps.getActivatedDisciplines =
      typeof nextDeps.getActivatedDisciplines === "function"
        ? nextDeps.getActivatedDisciplines
        : null;
    deps.getCharacterIdentity =
      typeof nextDeps.getCharacterIdentity === "function"
        ? nextDeps.getCharacterIdentity
        : null;
    deps.getDiscordConfig =
      typeof nextDeps.getDiscordConfig === "function" ? nextDeps.getDiscordConfig : null;
    deps.flashBloodWarning =
      typeof nextDeps.flashBloodWarning === "function" ? nextDeps.flashBloodWarning : null;
    deps.modifyBlood =
      typeof nextDeps.modifyBlood === "function" ? nextDeps.modifyBlood : null;
    deps.renderWillpowerTrack =
      typeof nextDeps.renderWillpowerTrack === "function"
        ? nextDeps.renderWillpowerTrack
        : null;
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
    deps.getDiceValues =
      typeof nextDeps.getDiceValues === "function" ? nextDeps.getDiceValues : null;
  }

  function getFinalPoolSize() {
    return deps.getFinalPoolSize ? deps.getFinalPoolSize() : 0;
  }

  function getPhysicalDisciplineBonus(attrName) {
    return deps.getPhysicalDisciplineBonus ? deps.getPhysicalDisciplineBonus(attrName) : null;
  }

  function getActivatedDisciplines() {
    return deps.getActivatedDisciplines ? deps.getActivatedDisciplines() : new Set();
  }

  function getCharacterIdentity() {
    if (deps.getCharacterIdentity) return deps.getCharacterIdentity();
    return {
      characterName: document.querySelector("#nombre")?.value || "",
      characterClan: document.querySelector("#clan")?.value || "",
      currentAvatarUrl: null,
    };
  }

  function getDiscordConfig() {
    if (deps.getDiscordConfig) return deps.getDiscordConfig();
    return { webhookUrl: "", enabled: false };
  }

  function flashBloodWarning() {
    if (deps.flashBloodWarning) deps.flashBloodWarning();
  }

  function modifyBlood(action, type) {
    if (deps.modifyBlood) deps.modifyBlood(action, type);
  }

  function renderWillpowerTrack() {
    if (deps.renderWillpowerTrack) deps.renderWillpowerTrack();
  }

  function persist() {
    if (deps.save) deps.save();
  }

  async function generateDiceValues(count) {
    if (deps.getDiceValues) {
      try {
        const values = await deps.getDiceValues(count);
        if (
          Array.isArray(values) &&
          values.length === count &&
          values.every((v) => typeof v === "number" && v >= 1 && v <= 10)
        ) {
          state.lastRollWas3D = true;
          return values;
        }
      } catch (_e) {}
    }
    state.lastRollWas3D = false;
    const values = [];
    for (let i = 0; i < count; i += 1) {
      values.push(Math.floor(Math.random() * 10) + 1);
    }
    return values;
  }

  function broadcastRollToParent(data) {
    try {
      global.parent.postMessage(
        Object.assign(
          {
            type: "abn-dice-roll-result",
            id: crypto.randomUUID(),
            timestamp: Date.now(),
          },
          data,
        ),
        "*",
      );
    } catch (_e) {}
  }

  function uncheckWillpowerAndSpecialty() {
    const willpower = document.querySelector("#willpower");
    const specialty = document.querySelector("#specialty");
    if (willpower) willpower.checked = false;
    if (specialty) specialty.checked = false;

    const specialtyLabel = document.querySelector('label[for="specialty"]');
    if (specialtyLabel) specialtyLabel.textContent = "Usar Especialidad";
  }

  function diceHistoryFormatTime(date) {
    return date.toLocaleTimeString("es-AR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
  }

  function renderDiceHistory() {
    const list = document.getElementById("dice-history-list");
    if (!list) return;
    list.innerHTML = "";

    if (state.diceRollHistory.length === 0) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.style.textAlign = "center";
      empty.style.padding = "24px 0";
      empty.textContent = "Sin tiradas en esta sesión.";
      list.appendChild(empty);
      return;
    }

    state.diceRollHistory.forEach((entry) => {
      const item = document.createElement("article");
      item.className = `dice-history-item ${entry.status}`;

      const time = document.createElement("span");
      time.className = "dice-history-time";
      time.textContent = diceHistoryFormatTime(entry.timestamp);

      const main = document.createElement("div");
      main.className = "dice-history-main";

      const summary = document.createElement("h3");
      summary.className = "dice-history-summary";
      summary.textContent = entry.summary;

      const pool = document.createElement("span");
      pool.className = "dice-history-pool";
      pool.textContent = `${entry.poolLabel} (${entry.diceCount}d10)`;

      main.appendChild(pool);
      main.appendChild(summary);
      item.appendChild(time);
      item.appendChild(main);
      list.appendChild(item);
    });
  }

  function openDiceHistoryModal() {
    renderDiceHistory();
    if (state.diceHistoryModalController) {
      state.diceHistoryModalController.open();
      return;
    }
    const modal = document.getElementById("dice-history-modal");
    modal?.classList.remove("hidden");
    modal?.setAttribute("aria-hidden", "false");
  }

  function closeDiceHistoryModal() {
    if (state.diceHistoryModalController) {
      state.diceHistoryModalController.close();
      return;
    }
    const modal = document.getElementById("dice-history-modal");
    modal?.classList.add("hidden");
    modal?.setAttribute("aria-hidden", "true");
  }

  function initDiceHistoryModal() {
    const historyBtn = document.getElementById("dice-history-btn");
    const closeBtn = document.getElementById("dice-history-close");
    const modal = document.getElementById("dice-history-modal");
    const controllerFactory = deps.createModalController;
    if (controllerFactory) {
      state.diceHistoryModalController = controllerFactory({
        overlay: modal,
        closeButtons: [closeBtn],
      });
    }

    if (historyBtn) historyBtn.addEventListener("click", openDiceHistoryModal);
  }

  function sendToDiscordRoll(
    characterName,
    clan,
    pool1,
    pool1Size,
    pool2,
    pool2Size,
    mods,
    result,
    rolls,
    difficulty,
    color,
    damagePenalty,
    damagePenaltyTrueFalse,
    willpowerTrueFalse,
    specialtyTrueFalse,
    potenciaTrueFalse
  ) {
    const { webhookUrl, enabled } = getDiscordConfig();
    const { currentAvatarUrl } = getCharacterIdentity();

    if (!webhookUrl || !enabled) return;

    const payload = {
      username: characterName || "Vampiro",
      ...(currentAvatarUrl ? { avatar_url: currentAvatarUrl } : {}),
      content: characterName + ": " + result,
      embeds: [
        {
          author: {
            name: characterName + (clan ? " de " + clan : ""),
            url: getSheetUrl(),
            ...(currentAvatarUrl ? { icon_url: currentAvatarUrl } : {}),
          },
          title: result,
          url: getSheetUrl(),
          description:
            "**" +
            pool1 +
            "** (" +
            pool1Size +
            ")  +  **" +
            pool2 +
            "** (" +
            pool2Size +
            ")  +   Mod: (" +
            mods +
            ") = " +
            getFinalPoolSize(),
          color,
          fields: [
            { name: "Tirada", value: "**" + rolls + "**", inline: true },
            { name: "Dificultad", value: difficulty, inline: true },
            {
              name: "Penalizador por Daño",
              value: damagePenaltyTrueFalse + " aplicado: " + damagePenalty,
            },
            { name: "Voluntad", value: willpowerTrueFalse, inline: true },
            { name: "Especialidad", value: specialtyTrueFalse, inline: true },
            ...(potenciaTrueFalse === "Si"
              ? [{ name: "Potencia", value: potenciaTrueFalse, inline: true }]
              : []),
          ],
          footer: { text: "Powered by Kelhendros" },
        },
      ],
    };

    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  function sendInitiativeToDiscord(total, d10, destreza, astucia, damagePenalty) {
    const { webhookUrl, enabled } = getDiscordConfig();
    if (!webhookUrl || !enabled) return;

    const { characterName, characterClan, currentAvatarUrl } = getCharacterIdentity();
    const safeName = characterName || "Vampiro";
    const clan = characterClan || "";

    let desc = `**1d10:** ${d10}  +  **Destreza:** ${destreza}  +  **Astucia:** ${astucia}`;
    if (damagePenalty < 0) desc += `  −  **Daño:** ${Math.abs(damagePenalty)}`;

    const payload = {
      username: safeName,
      ...(currentAvatarUrl ? { avatar_url: currentAvatarUrl } : {}),
      content: `${safeName}: Iniciativa **${total}**`,
      embeds: [
        {
          author: {
            name: safeName + (clan ? " de " + clan : ""),
            url: getSheetUrl(),
            ...(currentAvatarUrl ? { icon_url: currentAvatarUrl } : {}),
          },
          title: `Iniciativa: ${total}`,
          description: desc,
          color: 7506394,
          footer: { text: "Powered by Kelhendros" },
        },
      ],
    };

    fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  }

  async function rollTheDice() {
    const difficulty = Number(document.querySelector("#difficulty")?.value || 6);
    const willpower = !!document.querySelector("#willpower")?.checked;
    const specialty = !!document.querySelector("#specialty")?.checked;

    const resultContainer = document.querySelector("#diceResults");
    const rollsList = document.querySelector("#diceRolls");
    const resultElement = document.querySelector("#diceResult");

    const pool1 = document.querySelector("#dicePool1Label")?.innerHTML || "";
    const pool1Size = document.querySelector("#dicePool1")?.value || "0";
    const pool2 = document.querySelector("#dicePool2Label")?.innerHTML || "";
    const pool2Size = document.querySelector("#dicePool2")?.value || "0";
    const mods = document.querySelector("#diceMod")?.value || "0";
    const damagePenaltyCheckbox = !!document.querySelector("#penalizadorSalud")?.checked;
    const damagePenalty = parseInt(
      document.querySelector("#penalizadorSaludLabel")?.innerHTML || "0",
      10
    );

    const { characterName, characterClan } = getCharacterIdentity();

    let willpowerNotice = "";
    let willpowerTrueFalse = "No";
    let willpowerSuccess = 0;
    let specialtyTrueFalse = "No";
    let damagePenaltyTrueFalse = "No";

    if (specialty) specialtyTrueFalse = "Si";
    if (damagePenaltyCheckbox) damagePenaltyTrueFalse = "Si";

    let successes = 0;
    let botches = 0;
    let color = "";

    const finalPoolSize = getFinalPoolSize();
    const rolls = await generateDiceValues(finalPoolSize);

    for (let i = 0; i < rolls.length; i += 1) {
      const roll = rolls[i];
      if (specialty && roll === 10) {
        successes += 2;
      } else if (roll >= difficulty) {
        successes += 1;
      } else if (roll === 1) {
        botches += 1;
      }
    }

    if (willpower) {
      willpowerSuccess += 1;
      willpowerNotice = " (1 exito por Voluntad)";
      willpowerTrueFalse = "Si";
    }

    let potenciaSuccess = 0;
    let potenciaTrueFalse = "No";
    const pool1AttrName = pool1.split("+")[0].trim();
    const potenciaBonus = getPhysicalDisciplineBonus(pool1AttrName);

    if (potenciaBonus && getActivatedDisciplines().has(potenciaBonus.id)) {
      potenciaSuccess = potenciaBonus.level;
      potenciaTrueFalse = "Si";
      successes += potenciaSuccess;
    }

    const autoSuccesses = willpowerSuccess;

    let resultText;
    if (autoSuccesses === 0 && successes === 0 && botches === 0) {
      color = "11247616";
      resultText = "Fallo";
    } else if (autoSuccesses === 0 && successes === 0 && botches > 0) {
      resultText = "Fracaso";
      color = "14225681";
    } else if (autoSuccesses === 0 && successes <= botches) {
      color = "11247616";
      resultText = "Fallo";
    } else if (autoSuccesses + successes - botches > 1) {
      color = "58911";
      successes = Math.max(0, successes - botches);
      successes += autoSuccesses;
      resultText = `${successes} Éxitos`;
    } else {
      color = "58911";
      successes = Math.max(0, successes - botches);
      successes += autoSuccesses;
      resultText = `${successes} Éxito`;
    }

    resultText += willpowerNotice;
    rollsList.innerHTML = "";

    let stateClass = "success";
    if (resultText.includes("Fracaso")) stateClass = "botch";
    else if (resultText.includes("Fallo")) stateClass = "fail";

    resultContainer.classList.remove("success", "fail", "botch", "hidden", "wakeup", "rolling");
    resultContainer.classList.add("rolling");
    resultElement.textContent = "0 Éxitos";
    resultElement.classList.remove("hidden-result");

    rolls.sort((a, b) => b - a);

    const successSlots = [];
    for (let i = rolls.length - 1; i >= 0; i -= 1) {
      if (rolls[i] >= difficulty) {
        if (specialty && rolls[i] === 10) {
          successSlots.push({ source: "specialty-bonus", index: i });
        }
        successSlots.push({ source: "dice", index: i });
      }
    }
    for (let i = potenciaSuccess - 1; i >= 0; i -= 1) {
      successSlots.push({ source: "potencia", index: i });
    }

    let cancelsRemaining = botches;
    const cancelledDiceIndices = new Set();
    const cancelledSpecialtyIndices = new Set();
    let cancelledPotenciaCount = 0;

    for (const slot of successSlots) {
      if (cancelsRemaining <= 0) break;
      if (slot.source === "specialty-bonus") cancelledSpecialtyIndices.add(slot.index);
      else if (slot.source === "dice") cancelledDiceIndices.add(slot.index);
      else if (slot.source === "potencia") cancelledPotenciaCount += 1;
      cancelsRemaining -= 1;
    }

    const allChips = [];

    if (potenciaSuccess > 0) {
      for (let i = 0; i < potenciaSuccess; i += 1) {
        const potChip = document.createElement("span");
        const isCancelled = i >= potenciaSuccess - cancelledPotenciaCount;
        const revealClass = "dice-result-die success potencia-chip";
        const finalClass = `dice-result-die success potencia-chip${isCancelled ? " cancelled" : ""}`;
        potChip.className = "dice-result-die dice-unrevealed";
        potChip.innerHTML = '<iconify-icon icon="game-icons:fist" width="20" aria-hidden="true"></iconify-icon>';
        potChip.title = `${potenciaBonus.fullName}`;
        rollsList.appendChild(potChip);
        allChips.push({ element: potChip, revealClass, finalClass, isBonus: false, willCancel: isCancelled });
      }
    }

    for (let i = 0; i < rolls.length; i += 1) {
      const roll = rolls[i];
      const chip = document.createElement("span");
      chip.textContent = roll;
      let revealClass = "";
      let finalClass = "";
      let willCancel = false;

      if (roll === 1) {
        revealClass = "dice-result-die botch";
        finalClass = revealClass;
      } else if (roll >= difficulty) {
        const isCancelled = cancelledDiceIndices.has(i);
        revealClass = "dice-result-die success";
        finalClass = `dice-result-die success${isCancelled ? " cancelled" : ""}`;
        willCancel = isCancelled;
      } else {
        revealClass = "dice-result-die fail";
        finalClass = revealClass;
      }

      chip.className = "dice-result-die dice-unrevealed";
      rollsList.appendChild(chip);
      allChips.push({ element: chip, revealClass, finalClass, isBonus: false, willCancel });

      if (specialty && roll === 10 && roll >= difficulty) {
        const bonusChip = document.createElement("span");
        const isBonusCancelled = cancelledSpecialtyIndices.has(i);
        const bonusRevealClass = "dice-result-die success specialty-bonus";
        const bonusFinalClass =
          `dice-result-die success specialty-bonus${isBonusCancelled ? " cancelled" : ""}`;
        bonusChip.className = "dice-result-die dice-unrevealed specialty-bonus";
        bonusChip.innerHTML =
          '<iconify-icon icon="mdi:star-four-points" width="18" aria-hidden="true"></iconify-icon>';
        bonusChip.title = "Éxito extra por Especialidad";
        rollsList.appendChild(bonusChip);
        allChips.push({
          element: bonusChip,
          revealClass: bonusRevealClass,
          finalClass: bonusFinalClass,
          isBonus: true,
          willCancel: isBonusCancelled,
        });
      }
    }

    if (state.lastRollWas3D) {
      // 3D dice already showed the roll — reveal chips instantly as summary
      allChips.forEach((item) => {
        item.element.className = item.finalClass;
      });
      resultContainer.classList.remove("rolling");
      resultContainer.classList.add(stateClass);
      resultElement.textContent = resultText;
    } else {
      const APPEAR_DELAY = 100;
      const APPEAR_ANIM = 550;
      const REVEAL_PAUSE = 250;
      const REVEAL_DELAY = 70;
      const CANCEL_PAUSE = 350;
      const CANCEL_DELAY = 120;
      const RESULT_PAUSE = 300;

      allChips.forEach((item, idx) => {
        const delay = item.isBonus ? (idx - 1) * APPEAR_DELAY : idx * APPEAR_DELAY;
        setTimeout(() => {
          item.element.classList.remove("dice-unrevealed");
          item.element.classList.add("dice-appearing");
        }, Math.max(0, delay));
      });

      const lastAppearTime = (allChips.length - 1) * APPEAR_DELAY + APPEAR_ANIM + REVEAL_PAUSE;
      let runningCount = 0;
      function updateLiveCounter(count) {
        const n = Math.max(0, count);
        resultElement.textContent = `${n} ${n === 1 ? "Éxito" : "Éxitos"}`;
      }

      setTimeout(() => {
        allChips.forEach((item, idx) => {
          const delay = item.isBonus ? (idx - 1) * REVEAL_DELAY : idx * REVEAL_DELAY;
          setTimeout(() => {
            item.element.className = item.revealClass;
            item.element.classList.add("dice-revealed");
            if (item.revealClass.includes("success")) {
              runningCount += 1;
              updateLiveCounter(runningCount);
            }
          }, Math.max(0, delay));
        });

        const lastRevealTime = (allChips.length - 1) * REVEAL_DELAY + CANCEL_PAUSE;
        const chipsToCancel = allChips.filter((c) => c.willCancel);

        if (chipsToCancel.length > 0) {
          setTimeout(() => {
            chipsToCancel.forEach((item, idx) => {
              setTimeout(() => {
                item.element.className = item.finalClass.replace(" cancelled", "");
                item.element.classList.add("dice-cancel-hit");
                runningCount -= 1;
                updateLiveCounter(runningCount);
              }, idx * CANCEL_DELAY);
            });

            const lastCancelTime =
              (chipsToCancel.length - 1) * CANCEL_DELAY + RESULT_PAUSE + 350;
            setTimeout(() => {
              resultContainer.classList.remove("rolling");
              resultContainer.classList.add(stateClass);
              resultElement.textContent = resultText;
            }, lastCancelTime);
          }, lastRevealTime);
        } else {
          setTimeout(() => {
            resultContainer.classList.remove("rolling");
            resultContainer.classList.add(stateClass);
            resultElement.textContent = resultText;
          }, lastRevealTime);
        }
      }, lastAppearTime);
    }

    const potenciaPs = potenciaSuccess > 0 ? Array(potenciaSuccess).fill("P") : [];
    const discordRolls = [...potenciaPs, ...rolls];

    sendToDiscordRoll(
      characterName,
      characterClan,
      pool1,
      pool1Size,
      pool2,
      pool2Size,
      mods,
      resultText,
      discordRolls,
      difficulty,
      color,
      damagePenalty,
      damagePenaltyTrueFalse,
      willpowerTrueFalse,
      specialtyTrueFalse,
      potenciaTrueFalse
    );

    broadcastRollToParent({
      rollType: "dice",
      characterName: characterName,
      avatarUrl: getCharacterIdentity().currentAvatarUrl || null,
      rollName: state.rollContextName || "",
      pool1: pool1,
      pool1Size: parseInt(pool1Size, 10) || 0,
      pool2: pool2,
      pool2Size: parseInt(pool2Size, 10) || 0,
      modifier: parseInt(mods, 10) || 0,
      totalPool: finalPoolSize,
      difficulty: difficulty,
      rolls: rolls.slice(),
      result: resultText,
      status: stateClass,
      damagePenalty: damagePenalty,
      damagePenaltyApplied: damagePenaltyTrueFalse === "Si",
      willpower: willpowerTrueFalse === "Si",
      specialty: specialtyTrueFalse === "Si",
      potencia: potenciaTrueFalse === "Si",
      potenciaLevel: potenciaSuccess,
    });

    let historyStatus = "success";
    if (resultText.includes("Fracaso")) historyStatus = "botch";
    else if (resultText.includes("Fallo")) historyStatus = "fail";

    const poolParts = [pool1, pool2].filter((p) => p && p.trim() !== "");
    let poolLabel = poolParts.length > 0 ? poolParts.join(" + ") : "Manual";

    if (state.rollContextName) {
      poolLabel = state.rollContextName;
      state.rollContextName = "";
    }

    state.diceRollHistory.unshift({
      timestamp: new Date(),
      poolLabel,
      diceCount: finalPoolSize,
      summary: resultText,
      status: historyStatus,
    });
    if (state.diceRollHistory.length > DICE_HISTORY_MAX) state.diceRollHistory.pop();

    global.lastRollResult = { successes, resultText };
    if (state.onRollComplete) {
      const cb = state.onRollComplete;
      state.onRollComplete = null;
      if (state.lastRollWas3D) {
        cb(global.lastRollResult);
      } else {
        const chipCount = allChips.length;
        const cancelCount = Math.min(botches, successSlots.length);
        const totalAnimTime =
          chipCount * 100 +
          550 +
          250 +
          chipCount * 70 +
          350 +
          (cancelCount > 0 ? cancelCount * 120 + 700 : 0) +
          400;
        setTimeout(() => cb(global.lastRollResult), totalAnimTime);
      }
    }

    uncheckWillpowerAndSpecialty();
  }

  async function rollInitiative() {
    const destreza = parseInt(document.getElementById("destreza-value")?.value || "0", 10);
    const astucia = parseInt(document.getElementById("astucia-value")?.value || "0", 10);

    const boostInput = document.getElementById("tempDestreza");
    const boostVal = boostInput ? parseInt(boostInput.value || "0", 10) : 0;

    let celBonus = 0;
    const physBonus = getPhysicalDisciplineBonus("destreza");
    if (physBonus && physBonus.id === 5 && physBonus.level > 0) {
      celBonus = physBonus.level;
    }

    const damagePenalty = parseInt(
      document.querySelector("#penalizadorSaludLabel")?.innerHTML || "0",
      10
    );

    const d10Values = await generateDiceValues(1);
    const d10 = d10Values[0];
    const totalDestreza = destreza + boostVal + celBonus;
    const total = Math.max(0, d10 + totalDestreza + astucia + damagePenalty);

    const resultContainer = document.querySelector("#diceResults");
    const rollsList = document.querySelector("#diceRolls");
    const resultElement = document.querySelector("#diceResult");

    resultContainer.classList.remove("success", "fail", "botch", "hidden", "wakeup");
    resultContainer.classList.add("success");
    resultElement.textContent = "Iniciativa";

    rollsList.innerHTML = "";
    const chip = document.createElement("span");
    chip.className = "dice-result-die initiative";
    chip.textContent = total;
    rollsList.appendChild(chip);

    const parts = [`d10: ${d10}`, `Destreza: ${destreza}`];
    if (boostVal > 0) parts.push(`Des. Temporal: +${boostVal}`);
    if (celBonus > 0) parts.push(`Celeridad: +${celBonus}`);
    parts.push(`Astucia: ${astucia}`);
    if (damagePenalty < 0) parts.push(`Penalizador Salud: ${damagePenalty}`);

    const breakdown = document.createElement("div");
    breakdown.className = "dice-result-info initiative-breakdown";
    breakdown.textContent = parts.join("  +  ");
    rollsList.appendChild(breakdown);

    let summaryParts = `1d10: ${d10} + Des: ${destreza}`;
    if (boostVal > 0) summaryParts += ` + Temp: ${boostVal}`;
    if (celBonus > 0) summaryParts += ` + Cel: ${celBonus}`;
    summaryParts += ` + Ast: ${astucia}`;
    if (damagePenalty < 0) summaryParts += ` − Daño: ${Math.abs(damagePenalty)}`;

    state.diceRollHistory.unshift({
      timestamp: new Date(),
      poolLabel: "Iniciativa",
      diceCount: 1,
      summary: `Iniciativa: ${total} (${summaryParts})`,
      status: "success",
    });
    if (state.diceRollHistory.length > DICE_HISTORY_MAX) state.diceRollHistory.pop();

    sendInitiativeToDiscord(total, d10, totalDestreza, astucia, damagePenalty);

    broadcastRollToParent({
      rollType: "initiative",
      characterName: getCharacterIdentity().characterName || "Vampiro",
      avatarUrl: getCharacterIdentity().currentAvatarUrl || null,
      total: total,
      breakdown: parts.join("  +  "),
      status: "success",
    });
  }

  function actionWakeUp() {
    const bloodValueString = document.querySelector("#blood-value")?.value || "";
    const bloodPoolCurrent = bloodValueString.replace(/0/g, "").length;

    if (bloodPoolCurrent <= 0) {
      flashBloodWarning();
      return;
    }

    modifyBlood("consume", "");

    const permValue = parseInt(document.querySelector("#voluntadPerm-value")?.value || "0", 10);
    const tempInput = document.querySelector("#voluntadTemp-value");
    const currentTemp = parseInt(tempInput?.value || "0", 10);
    let willpowerRestored = false;

    if (tempInput && currentTemp < permValue) {
      tempInput.value = String(currentTemp + 1);
      renderWillpowerTrack();
      willpowerRestored = true;
    }

    const resultContainer = document.querySelector("#diceResults");
    const rollsList = document.querySelector("#diceRolls");
    const resultElement = document.querySelector("#diceResult");

    resultContainer.classList.remove("success", "fail", "botch", "hidden", "wakeup");
    resultContainer.classList.add("wakeup");
    resultElement.textContent = "Despertarse";

    rollsList.innerHTML = "";
    const flavorText = document.createElement("span");
    flavorText.className = "dice-result-info dice-result-info-flavor";
    flavorText.innerHTML = willpowerRestored
      ? "Consumís un poco de Vitae para reanimar tu cuerpo muerto en esta nueva noche.<br>Además, renovás tu ímpetu."
      : "Consumís un poco de Vitae para reanimar tu cuerpo muerto en esta nueva noche.<br>Tu ímpetu ya está al máximo.";
    rollsList.appendChild(flavorText);

    const summaryLine = document.createElement("span");
    summaryLine.className = "dice-result-info";
    summaryLine.textContent = willpowerRestored
      ? "− 1 Sangre · + 1 Voluntad"
      : "− 1 Sangre · Voluntad llena";
    rollsList.appendChild(summaryLine);

    persist();
  }

  function setRollContext(name) {
    state.rollContextName = typeof name === "string" ? name : "";
  }

  function setOnRollComplete(callback) {
    state.onRollComplete = typeof callback === "function" ? callback : null;
  }

  function init() {
    initDiceHistoryModal();
  }

  global.ABNSheetDiceSystem = {
    configure,
    init,
    rollTheDice,
    uncheckWillpowerAndSpecialty,
    diceHistoryFormatTime,
    renderDiceHistory,
    openDiceHistoryModal,
    closeDiceHistoryModal,
    sendToDiscordRoll,
    rollInitiative,
    sendInitiativeToDiscord,
    actionWakeUp,
    setRollContext,
    setOnRollComplete,
  };
})(window);
