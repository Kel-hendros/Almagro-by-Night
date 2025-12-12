(function () {
  console.log("Active Encounter: Initializing...");

  const state = {
    encounterId: null,
    encounter: null,
    templates: [],
    user: null,
    selectedInstanceId: null,
  };

  const els = {};

  async function init() {
    // Parse ID from URL hash query
    const rawHash = window.location.hash.split("?")[1];
    const params = new URLSearchParams(rawHash);
    state.encounterId = params.get("id");

    if (!state.encounterId) {
      alert("No se especificó un encuentro ID.");
      return;
    }

    // DOM Elements
    els.name = document.getElementById("ae-encounter-name");
    els.status = document.getElementById("ae-encounter-status");
    els.timeline = document.getElementById("ae-timeline-container");
    els.templateSelect = document.getElementById("ae-template-select");
    els.npcCount = document.getElementById("ae-npc-count");
    els.npcCount = document.getElementById("ae-npc-count");
    els.roundCounter = document.getElementById("ae-round-counter");

    // Modal Els
    els.modal = document.getElementById("ae-modal");
    els.modalCode = document.getElementById("ae-modal-code");
    els.modalStats = document.getElementById("ae-modal-stats");
    els.modalTitle = document.getElementById("ae-modal-title");
    els.modalHpFill = document.getElementById("ae-modal-hp-fill");
    els.modalHpText = document.getElementById("ae-modal-hp-text");
    els.modalNotes = document.getElementById("ae-modal-notes");

    setupListeners();

    // Load Data
    await loadTemplates();
    await loadEncounterData();
  }

  function setupListeners() {
    document.getElementById("btn-ae-back").addEventListener("click", () => {
      window.location.hash = "combat-tracker";
    });

    document
      .getElementById("btn-ae-save")
      .addEventListener("click", saveEncounter);
    document.getElementById("btn-ae-add-npc").addEventListener("click", addNPC);
    document
      .getElementById("btn-ae-next-turn")
      .addEventListener("click", nextTurn);

    document
      .getElementById("btn-ae-archive")
      .addEventListener("click", async () => {
        if (confirm("¿Archivar este encuentro?")) {
          const { error } = await supabase
            .from("encounters")
            .update({ status: "archived" })
            .eq("id", state.encounterId);
          if (!error) window.location.hash = "combat-tracker";
        }
      });

    // Modal Listeners
    document
      .getElementById("btn-ae-modal-close")
      .addEventListener("click", closeModal);
    document
      .getElementById("btn-modal-dmg")
      .addEventListener("click", () => handleModalAction("dmg"));
    document
      .getElementById("btn-modal-heal")
      .addEventListener("click", () => handleModalAction("heal"));
  }

  async function loadTemplates() {
    // We reuse the LoadTemplates logic essentially, but tailored for this view
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("type", "npc")
      .order("name");
    if (data) {
      state.templates = data;
      els.templateSelect.innerHTML = '<option value="">Seleccionar...</option>';
      data.forEach((t) => {
        const opt = document.createElement("option");
        opt.value = t.id;
        opt.textContent = t.name;
        els.templateSelect.appendChild(opt);
      });
    }
  }

  async function loadEncounterData() {
    const { data, error } = await supabase
      .from("encounters")
      .select("*")
      .eq("id", state.encounterId)
      .single();
    if (error || !data) {
      alert("Error cargando encuentro: " + (error?.message || "No encontrado"));
      return;
    }
    state.encounter = data;

    // Data Migration / structure verify
    if (Array.isArray(state.encounter.data)) {
      state.encounter.data = {
        instances: state.encounter.data,
        round: 1,
        activeInstanceId: null,
      };
    } else if (!state.encounter.data) {
      state.encounter.data = {
        instances: [],
        round: 1,
        activeInstanceId: null,
      };
    }

    // Auto-select active if needed
    ensureActiveInstance();

    render();
  }

  function ensureActiveInstance() {
    const d = state.encounter.data;
    if (!d.activeInstanceId && d.instances && d.instances.length > 0) {
      const sorted = [...d.instances].sort(
        (a, b) => (b.initiative || 0) - (a.initiative || 0)
      );
      d.activeInstanceId = sorted[0].id;
    }
  }

  function render() {
    if (!state.encounter) return;

    els.name.textContent = state.encounter.name;
    els.status.textContent = state.encounter.status;
    els.roundCounter.textContent = state.encounter.data.round || 1;

    const instances = state.encounter.data.instances || [];
    const activeId = state.encounter.data.activeInstanceId;

    els.timeline.innerHTML = "";

    // Sort by initiative
    const sorted = [...instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0)
    );

    if (sorted.length === 0) {
      els.timeline.innerHTML =
        "<p style='text-align:center; color:#666'>Sin participantes.</p>";
      return;
    }

    sorted.forEach((inst) => {
      const row = document.createElement("div");
      row.className = "ae-timeline-row";

      const isActive = activeId && inst.id === activeId;
      const isDead = inst.status === "dead" || inst.health <= 0;

      // Health Visuals
      const hpPct = (inst.health / inst.maxHealth) * 100;
      const hpClass = getHealthClass(inst.health, inst.maxHealth, inst.status);

      row.innerHTML = `
                <div class="ae-init-bubble">
                    <input type="number" class="init-input ae-bubble-input" value="${
                      inst.initiative || 0
                    }">
                </div>
                
                <div class="ae-card ${isActive ? "active" : ""} ${
        isDead ? "dead" : ""
      }" data-id="${inst.id}">
                    <div class="ae-card-header">
                       <div class="ae-card-title">
                           <span class="ae-card-name" title="${inst.name}">${
        inst.name
      }</span> 
                           <span class="ae-card-code">| ${inst.code}</span>
                       </div>
                    </div>
                    
                    <!-- Health Bar -->
                    <div class="ae-card-hp-bar">
                        <div class="ae-card-hp-fill ${hpClass}" style="width: ${hpPct}%"></div>
                    </div>

                    <div class="ae-status-row">
                        <span class="ae-status-indicator ${
                          inst.status === "active" ? "active" : ""
                        }"></span>
                    </div>
                </div>
      `;

      // Bindings
      const inputInit = row.querySelector(".init-input");
      inputInit.addEventListener("change", (e) =>
        updateInitiative(inst.id, e.target.value)
      );

      // Card Click -> Open Modal
      row
        .querySelector(".ae-card")
        .addEventListener("click", () => openModal(inst));

      els.timeline.appendChild(row);
    });
  }

  async function addNPC() {
    const tplId = els.templateSelect.value;
    const count = parseInt(els.npcCount.value) || 1;
    if (!tplId) return;

    const tpl = state.templates.find((t) => t.id === tplId);
    if (!tpl) return;

    const d = state.encounter.data;
    const instances = d.instances;

    // Generate Codes
    const baseLetter = tpl.name[0].toUpperCase();
    let maxNum = 0;
    const regex = new RegExp(`^${baseLetter}(\\d+)$`);
    instances.forEach((i) => {
      const m = i.code.match(regex);
      if (m) {
        const n = parseInt(m[1]);
        if (n > maxNum) maxNum = n;
      }
    });

    for (let i = 0; i < count; i++) {
      maxNum++;
      const initVal = calculateInitiative(tpl.data); // Helper below
      instances.push({
        id: crypto.randomUUID(),
        templateId: tpl.id,
        name: tpl.name,
        code: `${baseLetter}${maxNum}`,
        status: "active",
        initiative: initVal,
        ...tpl.data, // Clone all properties from template (including stats structure)
        health: tpl.data.maxHealth || 7, // Ensure current health is set
        maxHealth: tpl.data.maxHealth || 7,
      });
    }

    ensureActiveInstance();
    render();
    saveEncounter();
  }

  function calculateInitiative(data) {
    let dex = 0;
    let wits = 0;

    if (data.groups) {
      // Find in groups structure
      const findVal = (name) => {
        for (const g of data.groups) {
          const f = g.fields.find((field) => field.name === name);
          if (f) return f.value;
        }
        return 0;
      };
      dex = findVal("Destreza");
      wits = findVal("Astucia");
    } else if (data.stats) {
      // Legacy flat stats
      dex = parseInt(data.stats["Destreza"]) || 0;
      wits = parseInt(data.stats["Astucia"]) || 0;
    } else {
      return Math.ceil(Math.random() * 10);
    }

    return dex + wits + Math.ceil(Math.random() * 10);
  }

  function updateInitiative(id, val) {
    const inst = state.encounter.data.instances.find((i) => i.id === id);
    if (inst) {
      inst.initiative = parseInt(val) || 0;
      render();
      saveEncounter();
    }
  }

  function getHealthClass(current, max, status) {
    if (status === "dead" || current === 0) return "dead";
    const pct = (current / max) * 100;
    if (pct > 50) return "high";
    if (pct > 20) return "med";
    return "low";
  }

  // --- Modal Logic ---

  function handleModalAction(type) {
    if (!state.selectedInstanceId) return;
    handleAction(state.selectedInstanceId, type);
  }

  function handleAction(id, type) {
    const inst = state.encounter.data.instances.find((i) => i.id === id);
    if (!inst) return;

    if (type === "dmg") {
      inst.health = Math.max(0, inst.health - 1);
    } else if (type === "heal") {
      inst.health = Math.min(inst.maxHealth, inst.health + 1);
    }

    if (inst.health === 0) inst.status = "dead";
    else if (inst.health > 0 && inst.status === "dead") inst.status = "active";

    render();
    if (state.selectedInstanceId === id) updateModalUI(inst);
    saveEncounter();
  }

  function updateModalUI(inst) {
    els.modalHpText.textContent = inst.health;

    // Update Bar
    const pct = (inst.health / inst.maxHealth) * 100;
    els.modalHpFill.style.width = `${pct}%`;

    // Update Color Class
    els.modalHpFill.className = "ae-hp-fill large"; // Reset
    els.modalHpFill.classList.add(
      getHealthClass(inst.health, inst.maxHealth, inst.status)
    );
  }

  // --- Picker Logic ---
  let picker = null;
  let pickerOverlay = null;
  let currentCallback = null;

  function initPicker() {
    console.log("[AE] initPicker called");
    const existing = document.getElementById("ae-picker");
    const existingOverlay = document.querySelector(".ae-stat-picker-overlay");

    if (existing) {
      console.log("[AE] Removing existing stale picker");
      existing.remove();
    }
    if (existingOverlay) {
      existingOverlay.remove();
    }

    // Create Overlay
    pickerOverlay = document.createElement("div");
    pickerOverlay.className = "ae-stat-picker-overlay";
    pickerOverlay.style.zIndex = "20000";
    document.body.appendChild(pickerOverlay);

    // Create Picker
    picker = document.createElement("div");
    picker.id = "ae-picker";
    picker.className = "ae-stat-picker";
    picker.style.zIndex = "20001";
    document.body.appendChild(picker);

    // Populate 0-10
    for (let i = 0; i <= 10; i++) {
      const btn = document.createElement("button");
      btn.className = "ae-picker-btn";
      btn.textContent = i;
      btn.addEventListener("click", () => {
        console.log("[AE] Picker value selected:", i);
        if (currentCallback) currentCallback(i);
        closePicker();
      });
      picker.appendChild(btn);
    }

    // Close events
    pickerOverlay.addEventListener("click", () => {
      console.log("[AE] Overlay clicked, closing picker");
      closePicker();
    });
  }

  function openPicker(targetEl, currentVal, onConfirm) {
    console.log("[AE] openPicker called. Val:", currentVal);
    if (!picker) initPicker();

    currentCallback = onConfirm;

    // Position
    const rect = targetEl.getBoundingClientRect();
    console.log("[AE] Target rect:", rect);

    const pickerWidth = 140;
    const pickerHeight = 220;

    // Center horizontally relative to target
    let left = rect.left + window.scrollX - pickerWidth / 2 + rect.width / 2;
    // Position below target
    let top = rect.top + window.scrollY + rect.height + 5;

    // Boundary checks
    if (left + pickerWidth > window.innerWidth)
      left = window.innerWidth - pickerWidth - 10;
    if (left < 10) left = 10;
    if (top + pickerHeight > window.innerHeight)
      top = rect.top + window.scrollY - pickerHeight - 5;

    picker.style.left = `${left}px`;
    picker.style.top = `${top}px`;

    // Highlight current
    Array.from(picker.children).forEach((btn) => {
      btn.classList.toggle("active", parseInt(btn.textContent) === currentVal);
    });

    picker.style.display = "grid";
    pickerOverlay.style.display = "block";
  }

  function closePicker() {
    if (picker) picker.style.display = "none";
    if (pickerOverlay) pickerOverlay.style.display = "none";
    currentCallback = null;
  }

  // --- Modal Logic ---

  function openModal(inst) {
    if (!picker) initPicker(); // Ensure picker exists

    state.selectedInstanceId = inst.id;
    // Combine Name and Code in Title using classes
    els.modalTitle.innerHTML = `<span class="ae-title-name">${inst.name}</span> <span class="ae-title-code">| ${inst.code}</span>`;
    els.modalTitle.style.cursor = "pointer";

    // Hide the old Code field
    if (els.modalCode && els.modalCode.parentElement) {
      els.modalCode.parentElement.style.display = "none";
    }

    // Render Stats Grouped
    els.modalStats.innerHTML = "";
    els.modalStats.className = "";

    // Notes
    if (els.modalNotes)
      els.modalNotes.textContent =
        inst.notes || inst.data?.notes || "Sin notas.";

    // Use stored structure if available
    const groups = inst.groups
      ? inst.groups
      : window.TEMPLATE_DEFINITIONS.npc.groups;

    groups.forEach((group, gIdx) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "ae-group-fieldset";

      const legend = document.createElement("legend");
      legend.textContent = group.name;
      fieldset.appendChild(legend);

      const grid = document.createElement("div");
      grid.className = "ae-stat-grid-3col";

      // Bucket by type
      const byType = {};
      group.fields.forEach((f, fIdx) => {
        // Tag with original indices for update
        f._gIdx = gIdx;
        f._fIdx = fIdx; // This might be index within group?

        // Finding real index in the group.fields array is tricky if we bucket.
        // Actually, 'group' is the reference to the object inside 'groups'.
        // So modifying 'f.value' directly modifies the object in the array?
        // Yes, 'f' is a reference. But spread might have shallow copied?
        // 'const groups = inst.groups' -> reference to array of objects.
        // 'group' -> reference to object. 'group.fields' -> ref to array. 'f' -> ref to object.
        // So yes, modifying 'f' is safe IF 'inst.groups' is the source.
        // If we fell back to DEFINITIONS, we are modifying the definition?? NO!
        // We need to be careful.

        if (!byType[f.type]) byType[f.type] = [];
        byType[f.type].push(f);
      });

      Object.entries(byType).forEach(([typeName, fields]) => {
        const col = document.createElement("div");
        col.className = "ae-stat-col";

        const subTitle = document.createElement("h4");
        subTitle.textContent = typeName;
        col.appendChild(subTitle);

        fields.forEach((f) => {
          let val = f.value;
          // Hydrate if using definitions fallback
          if (!inst.groups && inst.stats && inst.stats[f.name] !== undefined) {
            val = inst.stats[f.name];
          }

          const row = document.createElement("div");
          row.className = "ae-stat-row";

          const labelSpan = document.createElement("span");
          labelSpan.className = "stat-label";
          labelSpan.textContent = f.name;

          const valSpan = document.createElement("span");
          valSpan.className = "stat-val editable-stat";
          valSpan.textContent = val;
          valSpan.dataset.statName = f.name;

          valSpan.addEventListener("click", (e) => {
            e.stopPropagation();
            console.log("[AE] Clicked stat:", f.name);

            const currentInt = parseInt(valSpan.textContent) || 0;
            openPicker(valSpan, currentInt, (newVal) => {
              // Update UI
              valSpan.textContent = newVal;

              // Update Data
              if (inst.groups) {
                const g = inst.groups.find((gr) => gr.name === group.name);
                if (g) {
                  const field = g.fields.find((fi) => fi.name === f.name);
                  if (field) field.value = newVal;
                }
              }

              // Update flat stats
              if (!inst.stats) inst.stats = {};
              inst.stats[f.name] = newVal;

              // SPECIAL HANDLING: Max Health
              if (f.name === "Salud máxima") {
                inst.maxHealth = newVal;
                // If current health is now > max, clamp it?
                if (inst.health > inst.maxHealth) inst.health = inst.maxHealth;

                updateModalUI(inst);
                render(); // To update card bar
              }

              saveEncounter();
            });
          });

          row.appendChild(labelSpan);
          row.appendChild(valSpan);
          col.appendChild(row);
        });
        grid.appendChild(col);
      });

      fieldset.appendChild(grid);
      els.modalStats.appendChild(fieldset);
    });

    updateModalUI(inst);
    els.modal.style.display = "flex";
  }

  function closeModal() {
    els.modal.style.display = "none";
    state.selectedInstanceId = null;
  }

  function updateModalUI(inst) {
    const hpPct = (inst.health / inst.maxHealth) * 100;
    let hpClass = "high";
    if (hpPct < 50) hpClass = "med";
    if (hpPct < 20) hpClass = "low";
    if (inst.health === 0) hpClass = "dead";

    els.modalHpFill.className = "ae-hp-fill " + hpClass;
    els.modalHpFill.style.width = hpPct + "%";
    els.modalHpText.textContent = `${inst.health} / ${inst.maxHealth}`;
  }

  function nextTurn() {
    const d = state.encounter.data;
    if (!d.instances || d.instances.length === 0) return;

    // Sort logic must match render
    const sorted = [...d.instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0)
    );

    const currId = d.activeInstanceId;
    let idx = -1;
    if (currId) idx = sorted.findIndex((i) => i.id === currId);

    idx++;
    if (idx >= sorted.length) {
      idx = 0; // Loop
      d.round = (d.round || 1) + 1;
    }

    d.activeInstanceId = sorted[idx].id;
    render();
    saveEncounter();
  }

  async function saveEncounter() {
    if (!state.encounter) return;
    const btn = document.getElementById("btn-ae-save");
    const prevText = btn.textContent;
    btn.textContent = "Guardando...";

    const { error } = await supabase
      .from("encounters")
      .update({
        data: state.encounter.data,
      })
      .eq("id", state.encounterId);

    if (error) alert("Error: " + error.message);

    btn.textContent = "Guardado";
    setTimeout(() => (btn.textContent = prevText), 1000);
  }

  // Call init
  init();
})();
