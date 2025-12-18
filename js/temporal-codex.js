/**
 * Temporal Codex Logic (Vanilla JS)
 */

window.initTemporalCodex = function () {
  console.log("Initializing Temporal Codex...");

  // State
  const state = {
    fechaActual: 2020,
    fechaNacimiento: NaN,
    fechaAbrazo: NaN,
    edadHumana: NaN,
    edadVastago: NaN,
    edadTotal: NaN,
  };

  // DOM Elements
  const inputs = {
    fechaActual: document.getElementById("input-fecha-actual"),
    fechaNacimiento: document.getElementById("input-fecha-nacimiento"),
    fechaAbrazo: document.getElementById("input-fecha-abrazo"),
    edadHumana: document.getElementById("input-edad-humana"),
    edadVastago: document.getElementById("input-edad-vastago"),
    edadTotal: document.getElementById("input-edad-total"),
  };

  const errorBanner = document.getElementById("codex-error");
  const errorText = document.getElementById("codex-error-text");
  const resetBtn = document.getElementById("codex-reset");

  // Helper functions
  const n = (v) => (v === "" || v === null ? NaN : parseFloat(v));
  const s = (v) => (isNaN(v) ? "" : Math.round(v).toString());

  // Update UI from state
  function updateUI(triggerField) {
    // Update all inputs except the one currently being typed in (to avoid cursor weirdness)
    Object.keys(inputs).forEach((key) => {
      if (key !== triggerField) {
        inputs[key].value = s(state[key]);
      }
    });

    // Check errors
    const fn = state.fechaNacimiento;
    const fab = state.fechaAbrazo;
    const fa = state.fechaActual;

    let error = null;
    if (!isNaN(fn) && !isNaN(fab) && fab < fn) {
      error = "Paradoja: El Abrazo no puede ser previo al Nacimiento.";
    } else if (!isNaN(fab) && !isNaN(fa) && fab > fa) {
      error = "Paradoja: El Abrazo es posterior a la Fecha Actual.";
    }

    if (error) {
      errorBanner.classList.remove("hidden");
      errorText.textContent = error;
    } else {
      errorBanner.classList.add("hidden");
    }
  }

  // Calculation Logic
  function calculate(field, value) {
    // Update state with new value
    state[field] = n(value);

    let fa = state.fechaActual;
    let fn = state.fechaNacimiento;
    let fab = state.fechaAbrazo;
    let eh = state.edadHumana;
    let ev = state.edadVastago;
    let et = state.edadTotal;

    // Motor de resolución
    switch (field) {
      case "fechaActual":
        if (!isNaN(fn)) et = fa - fn;
        if (!isNaN(fab)) ev = fa - fab;
        break;
      case "fechaNacimiento":
        if (!isNaN(fa)) et = fa - fn;
        if (!isNaN(fab)) eh = fab - fn;
        break;
      case "fechaAbrazo":
        if (!isNaN(fa)) ev = fa - fab;
        if (!isNaN(fn)) eh = fab - fn;
        break;
      case "edadTotal":
        if (!isNaN(fa)) fn = fa - et;
        if (!isNaN(fn) && !isNaN(fab)) eh = fab - fn;
        break;
      case "edadHumana":
        if (!isNaN(fn)) fab = fn + eh;
        else if (!isNaN(fab)) fn = fab - eh;
        if (!isNaN(fa) && !isNaN(fab)) ev = fa - fab;
        if (!isNaN(fa) && !isNaN(fn)) et = fa - fn;
        break;
      case "edadVastago":
        if (!isNaN(fa)) fab = fa - ev;
        if (!isNaN(fab) && !isNaN(fn)) eh = fab - fn;
        if (!isNaN(eh) && !isNaN(ev)) et = eh + ev;
        break;
    }

    // Pasada de consistencia global
    for (let i = 0; i < 2; i++) {
      if (isNaN(et) && !isNaN(fa) && !isNaN(fn)) et = fa - fn;
      if (isNaN(fn) && !isNaN(fa) && !isNaN(et)) fn = fa - et;
      if (isNaN(ev) && !isNaN(fa) && !isNaN(fab)) ev = fa - fab;
      if (isNaN(fab) && !isNaN(fa) && !isNaN(ev)) fab = fa - ev;
      if (isNaN(eh) && !isNaN(fab) && !isNaN(fn)) eh = fab - fn;
      if (isNaN(fn) && !isNaN(fab) && !isNaN(eh)) fn = fab - eh;
      if (isNaN(fab) && !isNaN(fn) && !isNaN(eh)) fab = fn + eh;
      if (!isNaN(eh) && !isNaN(ev)) et = eh + ev;
      else if (!isNaN(et) && !isNaN(eh)) ev = et - eh;
      else if (!isNaN(et) && !isNaN(ev)) eh = et - ev;
    }

    // Update state with results
    state.fechaActual = fa;
    state.fechaNacimiento = fn;
    state.fechaAbrazo = fab;
    state.edadHumana = eh;
    state.edadVastago = ev;
    state.edadTotal = et;

    updateUI(field);
  }

  // Event Listeners
  Object.keys(inputs).forEach((key) => {
    inputs[key].addEventListener("input", (e) => {
      calculate(key, e.target.value);
    });

    // Prevent scroll from changing value
    inputs[key].addEventListener(
      "wheel",
      (e) => {
        e.preventDefault();
      },
      { passive: false }
    );
  });

  // Reset
  if (resetBtn) {
    resetBtn.addEventListener("click", () => {
      state.fechaActual = 2020;
      state.fechaNacimiento = NaN;
      state.fechaAbrazo = NaN;
      state.edadHumana = NaN;
      state.edadVastago = NaN;
      state.edadTotal = NaN;

      // Clear inputs
      Object.keys(inputs).forEach((key) => {
        inputs[key].value = key === "fechaActual" ? "2020" : "";
      });
      errorBanner.classList.add("hidden");
    });
  }

  // Initial UI Sync (set default 2020)
  inputs.fechaActual.value = "2020";
  if (window.lucide && window.lucide.createIcons) {
    window.lucide.createIcons();
  }
};

// Check if we need to auto-initialize (for when the script loads after HTML)
if (document.querySelector(".temporal-codex-container")) {
  window.initTemporalCodex();
}
