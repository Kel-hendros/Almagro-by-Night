(function initEncounterTurnTracker(global) {
  let encounterRound = 0;
  let encounterId = null;
  let sheetId = null;
  let encounterConnected = false;
  let isMyTurn = false;
  let bloodSpentThisRound = 0;
  let celeridadBypass = false;
  let indicatorEl = null;
  let hasResetThisRound = false;

  function getBloodPerTurn() {
    return global.ABNSheetHealthBlood?.getBloodPerTurn?.() || 1;
  }

  // ---- Persistence via character sheet data ----

  function loadSaved() {
    var el = document.getElementById("turn-tracker-state");
    if (!el || !el.value) return null;
    try { return JSON.parse(el.value); } catch (_) { return null; }
  }

  function persistState() {
    var el = document.getElementById("turn-tracker-state");
    if (!el) return;

    var disciplines = global.ABNSheetDisciplines;
    var activatedDiscs = disciplines?.getActivatedDisciplines?.();
    var celeridadPoints = disciplines?.getCeleridadActivatedPoints?.() || 0;

    el.value = JSON.stringify({
      encounterId: encounterId,
      round: encounterRound,
      spent: bloodSpentThisRound,
      activatedDisciplines: activatedDiscs ? Array.from(activatedDiscs) : [],
      celeridadPoints: celeridadPoints,
    });

    if (typeof global.saveCharacterData === "function") {
      global.saveCharacterData();
    }
  }

  function restoreIfMatch() {
    var saved = loadSaved();
    if (!saved) return;
    if (saved.encounterId === encounterId && saved.round === encounterRound) {
      bloodSpentThisRound = saved.spent || 0;

      var disciplines = global.ABNSheetDisciplines;
      if (disciplines?.restoreTurnState) {
        disciplines.restoreTurnState({
          activatedDisciplines: saved.activatedDisciplines || [],
          celeridadPoints: saved.celeridadPoints || 0,
        });
      }
    }
  }

  function resetAllForNewRound() {
    bloodSpentThisRound = 0;

    var disciplines = global.ABNSheetDisciplines;
    if (disciplines?.restoreTurnState) {
      disciplines.restoreTurnState({
        activatedDisciplines: [],
        celeridadPoints: 0,
      });
    }

    updateIndicator();
    persistState();
  }

  function deactivatePotencia() {
    var disciplines = global.ABNSheetDisciplines;
    if (!disciplines) return;
    var activated = disciplines.getActivatedDisciplines?.();
    if (activated && activated.size > 0) {
      disciplines.restoreTurnState({
        activatedDisciplines: [],
        celeridadPoints: disciplines.getCeleridadActivatedPoints?.() || 0,
      });
      persistState();
    }
  }

  // ---- Consume hooks ----

  function beforeConsume(points) {
    if (!encounterConnected) return true;
    if (celeridadBypass) return true;
    var limit = getBloodPerTurn();
    if (bloodSpentThisRound + points > limit) {
      updateIndicator();
      showLimitWarning();
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
    persistState();
  }

  function showLimitWarning() {
    var el = ensureIndicator();
    if (!el) return;
    el.classList.remove("limit-reached");
    void el.offsetWidth;
    el.classList.add("limit-reached");
    setTimeout(function () { el.classList.remove("limit-reached"); }, 1500);
  }

  // ---- Indicator UI ----

  function ensureIndicator() {
    if (indicatorEl) return indicatorEl;
    var bloodCard = document.querySelector(".blood-card");
    if (!bloodCard) return null;

    indicatorEl = document.createElement("div");
    indicatorEl.className = "encounter-blood-tracker";
    indicatorEl.innerHTML =
      '<span class="ebt-label">Sangre este turno:</span> ' +
      '<span class="ebt-text"></span>';

    bloodCard.appendChild(indicatorEl);
    injectStyles();
    return indicatorEl;
  }

  function updateIndicator() {
    var el = ensureIndicator();
    if (!el) return;

    if (!encounterConnected) {
      el.style.display = "none";
      return;
    }

    el.style.display = "block";
    var limit = getBloodPerTurn();
    var atLimit = bloodSpentThisRound >= limit;
    var textEl = el.querySelector(".ebt-text");
    if (textEl) {
      textEl.textContent = atLimit
        ? "Máximo alcanzado"
        : bloodSpentThisRound + " / " + limit;
    }
    el.classList.toggle("near-limit", bloodSpentThisRound >= limit - 1 && !atLimit);
    el.classList.toggle("at-limit", atLimit);
  }

  // ---- Encounter state from parent ----

  function handleMessage(event) {
    var data = event.data;
    if (!data || data.type !== "abn-encounter-state") return;

    var prevRound = encounterRound;
    var prevEncounterId = encounterId;
    var prevIsMyTurn = isMyTurn;

    encounterConnected = !!data.connected;
    encounterRound = data.round || 0;
    encounterId = data.encounterId || null;
    sheetId = data.sheetId || null;
    isMyTurn = !!data.isMyTurn;

    if (!encounterConnected) {
      bloodSpentThisRound = 0;
      hasResetThisRound = false;
      var disciplines = global.ABNSheetDisciplines;
      if (disciplines?.restoreTurnState) {
        disciplines.restoreTurnState({
          activatedDisciplines: [],
          celeridadPoints: 0,
        });
      }
      updateIndicator();
      persistState();
      return;
    }

    var isNewEncounter = encounterId !== prevEncounterId;
    var isNewRound = encounterRound !== prevRound;
    var turnEnded = prevIsMyTurn && !isMyTurn;
    var turnStarted = !prevIsMyTurn && isMyTurn;

    if (isNewEncounter) {
      // Different encounter → full reset, then try to restore
      bloodSpentThisRound = 0;
      hasResetThisRound = false;
      restoreIfMatch();
    } else if (turnEnded) {
      // My turn just ended → deactivate Potencia, keep Celeridad and blood spent
      deactivatePotencia();
    } else if (isNewRound && isMyTurn && !hasResetThisRound) {
      // New round and it's my turn → reset everything
      hasResetThisRound = true;
      resetAllForNewRound();
    } else if (isNewRound) {
      // New round but not my turn yet → restore saved state
      hasResetThisRound = false;
      bloodSpentThisRound = 0;
      restoreIfMatch();
    } else if (turnStarted && !hasResetThisRound) {
      // Same round, just became my turn → reset everything
      hasResetThisRound = true;
      resetAllForNewRound();
    } else if (!prevEncounterId) {
      // First connection (e.g. page load) → restore
      restoreIfMatch();
    }

    updateIndicator();
  }

  // ---- Discipline state change listener ----

  function onTurnStateChanged() {
    if (encounterConnected) {
      persistState();
    }
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

  // ---- Styles ----

  function injectStyles() {
    if (document.getElementById("ebt-styles")) return;
    var style = document.createElement("style");
    style.id = "ebt-styles";
    style.textContent = [
      ".encounter-blood-tracker {",
      "  display: none;",
      "  padding: 4px 8px;",
      "  margin-top: 6px;",
      "  border-radius: 4px;",
      "  background: var(--ui-surface);",
      "  border: 1px solid var(--ui-border);",
      "  font-size: 0.75rem;",
      "  text-align: center;",
      "  transition: background 0.3s, border-color 0.3s;",
      "}",
      ".encounter-blood-tracker .ebt-label {",
      "  color: var(--muted);",
      "}",
      ".encounter-blood-tracker .ebt-text {",
      "  color: var(--text);",
      "  font-weight: 600;",
      "}",
      ".encounter-blood-tracker.near-limit {",
      "  border-color: var(--ui-border);",
      "}",
      ".encounter-blood-tracker.near-limit .ebt-text {",
      "  color: var(--text);",
      "}",
      ".encounter-blood-tracker.at-limit {",
      "  border-color: var(--danger);",
      "  background: color-mix(in srgb, var(--danger) 10%, transparent);",
      "}",
      ".encounter-blood-tracker.at-limit .ebt-text {",
      "  color: var(--danger);",
      "}",
      ".encounter-blood-tracker.limit-reached {",
      "  animation: ebt-shake 0.4s ease;",
      "  border-color: var(--danger);",
      "  background: color-mix(in srgb, var(--danger) 20%, transparent);",
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
    global.addEventListener("abn-turn-state-changed", onTurnStateChanged);

    var hb = global.ABNSheetHealthBlood;
    if (hb?.setConsumeHooks) {
      hb.setConsumeHooks({ beforeConsume, afterConsume });
    }
  }

  global.ABNEncounterBloodTracker = {
    init,
    getSpentThisRound: function () { return bloodSpentThisRound; },
    resetSpent: function () {
      bloodSpentThisRound = 0;
      updateIndicator();
      persistState();
    },
    setCeleridadBypass: function (val) { celeridadBypass = !!val; },
    notifyCeleridadActivation: notifyCeleridadActivation,
    isEncounterActive: function () { return encounterConnected; },
  };
})(window);
