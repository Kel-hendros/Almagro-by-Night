(function initEncounterBloodTracker(global) {
  let encounterRound = 0;
  let encounterId = null;
  let sheetId = null;
  let encounterConnected = false;
  let bloodSpentThisRound = 0;
  let celeridadBypass = false;
  let indicatorEl = null;

  function getBloodPerTurn() {
    return global.ABNSheetHealthBlood?.getBloodPerTurn?.() || 1;
  }

  function beforeConsume(points) {
    if (!encounterConnected) return true;
    if (celeridadBypass) return true;
    const limit = getBloodPerTurn();
    if (bloodSpentThisRound + points > limit) {
      showLimitWarning(limit);
      return false;
    }
    return true;
  }

  function afterConsume(points) {
    if (!encounterConnected) return;
    if (!celeridadBypass) {
      bloodSpentThisRound += points;
      updateIndicator();
    }
  }

  function showLimitWarning(limit) {
    const el = ensureIndicator();
    if (!el) return;
    el.classList.add("limit-reached");
    el.querySelector(".ebt-text").textContent =
      "Limite por turno alcanzado (" + limit + "/" + limit + ")";
    setTimeout(() => el.classList.remove("limit-reached"), 1500);
  }

  function ensureIndicator() {
    if (indicatorEl) return indicatorEl;
    const bloodCard = document.querySelector(".blood-card");
    if (!bloodCard) return null;

    indicatorEl = document.createElement("div");
    indicatorEl.className = "encounter-blood-tracker";
    indicatorEl.innerHTML = [
      '<span class="ebt-label">Sangre este turno:</span>',
      '<span class="ebt-text"></span>',
    ].join(" ");

    bloodCard.appendChild(indicatorEl);
    injectStyles();
    return indicatorEl;
  }

  function updateIndicator() {
    const el = ensureIndicator();
    if (!el) return;

    if (!encounterConnected) {
      el.style.display = "none";
      return;
    }

    el.style.display = "";
    const limit = getBloodPerTurn();
    const textEl = el.querySelector(".ebt-text");
    if (textEl) {
      textEl.textContent = bloodSpentThisRound + " / " + limit;
    }
    el.classList.toggle("near-limit", bloodSpentThisRound >= limit - 1 && bloodSpentThisRound < limit);
    el.classList.toggle("at-limit", bloodSpentThisRound >= limit);
  }

  function handleMessage(event) {
    const data = event.data;
    if (!data || data.type !== "abn-encounter-state") return;

    const prevRound = encounterRound;
    const wasConnected = encounterConnected;

    encounterConnected = !!data.connected;
    encounterRound = data.round || 0;
    encounterId = data.encounterId || null;
    sheetId = data.sheetId || null;

    if (!encounterConnected) {
      bloodSpentThisRound = 0;
      updateIndicator();
      return;
    }

    if (!wasConnected || encounterRound !== prevRound) {
      bloodSpentThisRound = 0;
    }

    updateIndicator();
  }

  function notifyCeleridadActivation(count) {
    if (!encounterConnected || !encounterId || !sheetId) return;
    try {
      global.parent.postMessage({
        type: "abn-celeridad-activate",
        encounterId: encounterId,
        sheetId: sheetId,
        count: count,
      }, "*");
    } catch (_e) {}
  }

  function injectStyles() {
    if (document.getElementById("ebt-styles")) return;
    const style = document.createElement("style");
    style.id = "ebt-styles";
    style.textContent = [
      ".encounter-blood-tracker {",
      "  display: none;",
      "  padding: 4px 8px;",
      "  margin-top: 6px;",
      "  border-radius: 4px;",
      "  background: rgba(255,255,255,0.05);",
      "  border: 1px solid rgba(255,255,255,0.1);",
      "  font-size: 0.75rem;",
      "  text-align: center;",
      "  transition: background 0.3s, border-color 0.3s;",
      "}",
      ".encounter-blood-tracker .ebt-label {",
      "  color: #999;",
      "}",
      ".encounter-blood-tracker .ebt-text {",
      "  color: #ccc;",
      "  font-weight: 600;",
      "}",
      ".encounter-blood-tracker.near-limit {",
      "  border-color: #d4a14a;",
      "}",
      ".encounter-blood-tracker.near-limit .ebt-text {",
      "  color: #d4a14a;",
      "}",
      ".encounter-blood-tracker.at-limit {",
      "  border-color: #c62828;",
      "  background: rgba(198, 40, 40, 0.1);",
      "}",
      ".encounter-blood-tracker.at-limit .ebt-text {",
      "  color: #c62828;",
      "}",
      ".encounter-blood-tracker.limit-reached {",
      "  animation: ebt-shake 0.4s ease;",
      "  border-color: #c62828;",
      "  background: rgba(198, 40, 40, 0.2);",
      "}",
      "@keyframes ebt-shake {",
      "  0%, 100% { transform: translateX(0); }",
      "  25% { transform: translateX(-4px); }",
      "  75% { transform: translateX(4px); }",
      "}",
    ].join("\n");
    document.head.appendChild(style);
  }

  function init() {
    global.addEventListener("message", handleMessage);

    // Wire hooks into health-blood module
    const hb = global.ABNSheetHealthBlood;
    if (hb?.setConsumeHooks) {
      hb.setConsumeHooks({ beforeConsume, afterConsume });
    }
  }

  global.ABNEncounterBloodTracker = {
    init,
    getSpentThisRound: () => bloodSpentThisRound,
    resetSpent: () => {
      bloodSpentThisRound = 0;
      updateIndicator();
    },
    setCeleridadBypass: (val) => { celeridadBypass = !!val; },
    notifyCeleridadActivation,
    isEncounterActive: () => encounterConnected,
  };
})(window);
