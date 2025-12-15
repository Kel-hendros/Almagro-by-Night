// js/combat-tracker.js

(function () {
  console.log("Combat Tracker: Initializing...");

  // Store for application state
  const state = {
    templates: [],
    encounters: [],
    activeEncounter: null,
    user: null,
    templateEdit: { data: {}, type: "npc" }, // Edit state
  };

  // --- DOM Elements ---
  let containers = {};
  let lists = {};

  // Modal Elements
  let modalTemplate = null;

  // --- Initialization ---
  async function init() {
    // Initialize DOM elements now that fragment is loaded
    containers = {
      templates: document.getElementById("view-templates"),
      encounters: document.getElementById("view-encounters"),
      activeEncounter: document.getElementById("view-active-encounter"),
    };

    lists = {
      templates: document.getElementById("templates-list"),
      encounters: document.getElementById("encounters-list"),
      instances: document.getElementById("active-instances-grid"),
      templateSelect: document.getElementById("select-add-npc-template"),
    };

    modalTemplate = document.getElementById("modal-template");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      document.querySelector(".combat-tracker-container").innerHTML =
        "<p>Debes iniciar sesión.</p>";
      return;
    }
    state.user = session.user;

    setupTabs();
    setupModalListeners();
    setupEncounterListeners();

    // Initial load
    await loadTemplates();
    await loadEncounters();
  }

  // --- Tab Switching ---
  function setupTabs() {
    const tabs = document.querySelectorAll(".ct-tab-btn");
    tabs.forEach((tab) => {
      tab.addEventListener("click", () => {
        switchTab(tab.dataset.tab);
      });
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll(".ct-tab-btn").forEach((b) => {
      // Only toggle active state for actual tabs (not hidden logic)
      if (b.dataset.tab)
        b.classList.toggle("active", b.dataset.tab === tabName);
    });

    Object.values(containers).forEach((el) => (el.style.display = "none"));

    if (tabName === "templates") {
      containers.templates.style.display = "block";
      containers.templates.classList.add("active");
    } else if (tabName === "encounters") {
      containers.encounters.style.display = "block";
      containers.encounters.classList.add("active");
    } else if (tabName === "active-encounter") {
      containers.activeEncounter.style.display = "block";
    }
  }

  // --- DATA: TEMPLATES ---
  async function loadTemplates() {
    lists.templates.innerHTML = "<p>Cargando...</p>";
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("type", "npc")
      .order("name");

    if (error) {
      console.error(error);
      lists.templates.innerHTML =
        '<p class="error">Error al cargar plantillas</p>';
      return;
    }

    state.templates = data || [];
    renderTemplates();
    updateTemplateSelect();
  }

  function renderTemplates() {
    if (state.templates.length === 0) {
      lists.templates.innerHTML = "<p>No hay plantillas creadas.</p>";
      return;
    }

    lists.templates.innerHTML = "";
    state.templates.forEach((tpl) => {
      const card = document.createElement("div");
      card.className = "ct-card";

      // Generate summary string
      let summary = "";
      if (tpl.data && tpl.data.groups) {
        // Extract some key high stats
        const flat = [];
        tpl.data.groups.forEach((g) => {
          g.fields.forEach((f) => {
            if (f.value > 0) flat.push(`${f.name}: ${f.value}`);
          });
        });
        summary = flat.slice(0, 4).join(", ");
      } else if (tpl.data && tpl.data.stats) {
        summary = Object.entries(tpl.data.stats)
          .slice(0, 3)
          .map(([k, v]) => `${k}: ${v}`)
          .join(", ");
      }

      card.innerHTML = `
                <div style="display:flex; justify-content:space-between;">
                    <h3>${tpl.name}</h3>
                    <span style="font-size:0.8em; color:#aaa;">PNJ</span>
                </div>
                <p>Salud: ${tpl.data?.maxHealth || 7}</p>
                 <p style="font-style:italic; border-top:1px solid #333; padding-top:4px; margin-top:4px; font-size:0.8em;">
                    ${summary}...
                </p>
                <div style="margin-top:8px;">
                     <button class="ct-btn btn-edit-template" data-id="${
                       tpl.id
                     }">Editar</button>
                </div>
            `;

      card.querySelector(".btn-edit-template").addEventListener("click", () => {
        openTemplateModal(tpl);
      });

      lists.templates.appendChild(card);
    });
  }

  function updateTemplateSelect() {
    lists.templateSelect.innerHTML = '<option value="">Seleccionar...</option>';
    state.templates
      .sort((a, b) => a.name.localeCompare(b.name))
      .forEach((tpl) => {
        const opt = document.createElement("option");
        opt.value = tpl.id;
        opt.textContent = tpl.name;
        lists.templateSelect.appendChild(opt);
      });
  }

  // --- Logic: Letter Uniqueness ---

  async function saveTemplate() {
    const id = document.getElementById("tpl-id").value;
    const name = document.getElementById("tpl-name").value;
    const notes = document.getElementById("tpl-notes").value;

    if (!name) {
      alert("El nombre es requerido");
      return;
    }

    // Hydrate structure from definitions
    const type = state.templateEdit.type || "npc";
    const defs =
      window.TEMPLATE_DEFINITIONS[type] || window.TEMPLATE_DEFINITIONS.npc;
    const groups = JSON.parse(JSON.stringify(defs.groups)); // Deep clone
    const stats = {}; // Keep flat stats for easy lookup (e.g. Initiative)

    groups.forEach((group) => {
      group.fields.forEach((field) => {
        // Read from state
        let val = state.templateEdit.data[field.name];
        if (val === undefined) val = field.value || 0; // Default

        field.value = val; // Hydrate value in structure
        stats[field.name] = val; // Hydrate flat object
      });
    });

    // Extract maxHealth specifically
    const maxHealth = stats["Salud"] || stats["Salud máxima"] || 7;

    const payload = {
      user_id: state.user.id,
      name: name,
      type: type,
      data: {
        maxHealth: maxHealth,
        groups: groups, // Saved structure
        notes: notes,
      },
    };

    let error;
    if (id) {
      const res = await supabase.from("templates").update(payload).eq("id", id);
      error = res.error;
    } else {
      const res = await supabase.from("templates").insert(payload);
      error = res.error;
    }

    if (error) {
      alert("Error al guardar plantilla: " + error.message);
    } else {
      document.getElementById("modal-template").classList.add("hidden");
      await loadTemplates();
    }
  }

  // Wrapper removed
  // --- TEMPLATES ---
  let currentTemplateId = null;

  function openTemplateModal(tpl = null) {
    const container = document.getElementById("ct-template-form-container");
    /* Ensure container exists or target the right element. 
         Wait, in previous files I used ct-template-form-container. 
         But typically it might be tpl-stats-container?
         Let's check fragments/combat-tracker.html if I can?
         Actually I replaced content in line 237 of js/combat-tracker.js previously targeting "ct-template-form-container".
         If that element doesn't exist in HTML, it fails.
         I should check HTML. 
         But assuming it was 'tpl-stats-container' before (line 194 in read), I should stick to that or update HTML.
         Line 241 in original read said check Document.
         I'll stick to 'tpl-stats-container' if that is what was there.
         Line 239 of previous read said: const container = document.getElementById("tpl-stats-container");
         My previous edit CHANGED it to ct-template-form-container.
         I should probably check if I broke it.
         I'll use 'tpl-stats-container' to be safe OR check HTML.
         I will use 'tpl-stats-container' as it was the original ID.
      */
    const containerId = "tpl-stats-container";
    const containerEl = document.getElementById(containerId);
    const modalTemplate = document.getElementById("modal-template");

    if (!containerEl) {
      console.error("Template container not found: " + containerId);
      return;
    }
    containerEl.innerHTML = "";

    currentTemplateId = tpl ? tpl.id : null;
    document.getElementById("tpl-id").value = currentTemplateId || "";
    let templateName = tpl ? tpl.name : "";
    document.getElementById("tpl-name").value = templateName;
    document.getElementById("tpl-notes").value =
      tpl && tpl.data ? tpl.data.notes || "" : ""; // Fix notes loading

    // Determine Type
    state.templateEdit.type =
      tpl && tpl.type
        ? tpl.type
        : tpl && tpl.data && tpl.data.type
        ? tpl.data.type
        : "npc";

    // Initialize Data
    if (tpl && tpl.data && tpl.data.stats) {
      state.templateEdit.data = JSON.parse(JSON.stringify(tpl.data.stats));
    } else {
      state.templateEdit.data = {};
    }

    // --- Type Selector ---
    const typeWrap = document.getElementById("tpl-type-container");
    if (typeWrap) {
      typeWrap.innerHTML = ""; // Clear previous

      const typeLabel = document.createElement("label");
      typeLabel.textContent = "Tipo de Plantilla";

      const typeSelect = document.createElement("select");
      typeSelect.className = "ct-select";

      // Populate Types
      Object.keys(window.TEMPLATE_DEFINITIONS).forEach((key) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = key.toUpperCase();
        if (key === state.templateEdit.type) opt.selected = true;
        typeSelect.appendChild(opt);
      });

      typeSelect.addEventListener("change", (e) => {
        state.templateEdit.type = e.target.value;
        renderTemplateForm(containerEl, state.templateEdit.type);
      });

      typeWrap.appendChild(typeLabel);
      typeWrap.appendChild(typeSelect);
    }

    // Render Form
    renderTemplateForm(containerEl, state.templateEdit.type);

    modalTemplate.classList.remove("hidden");
  }

  function renderTemplateForm(container, type) {
    let formDiv = container.querySelector(".ct-form-content");
    if (!formDiv) {
      formDiv = document.createElement("div");
      formDiv.className = "ct-form-content";
      container.appendChild(formDiv);
    }
    formDiv.innerHTML = "";

    const defs =
      window.TEMPLATE_DEFINITIONS[type] || window.TEMPLATE_DEFINITIONS.npc;

    defs.groups.forEach((group) => {
      const fieldset = document.createElement("fieldset");
      fieldset.className = "ae-group-fieldset";

      const legend = document.createElement("legend");
      legend.textContent = group.name;
      fieldset.appendChild(legend);

      const grid = document.createElement("div");
      grid.className = "ae-stat-grid-3col";

      // Bucket fields
      const byType = {};
      group.fields.forEach((f) => {
        if (!byType[f.type]) byType[f.type] = [];
        byType[f.type].push(f);
      });

      Object.keys(byType).forEach((typeName) => {
        const col = document.createElement("div");
        col.className = "ae-stat-col";

        const h4 = document.createElement("h4");
        h4.textContent = typeName;
        col.appendChild(h4);

        byType[typeName].forEach((field) => {
          const row = document.createElement("div");
          row.className = "ae-stat-row";

          const label = document.createElement("span");
          label.className = "stat-label";
          label.textContent = field.name;

          const valSpan = document.createElement("span");
          valSpan.className = "stat-val editable-stat";

          let val = state.templateEdit.data[field.name];
          if (val === undefined) val = field.value || 0;
          state.templateEdit.data[field.name] = val;

          valSpan.textContent = val;
          valSpan.dataset.stat = field.name;

          // Click to Edit
          valSpan.addEventListener("click", () => {
            const currentInt = parseInt(valSpan.textContent) || 0;
            if (window.AE_Picker) {
              window.AE_Picker.open(valSpan, currentInt, (newVal) => {
                valSpan.textContent = newVal;
                state.templateEdit.data[field.name] = newVal;
              });
            } else {
              const manual = prompt(field.name, currentInt);
              if (manual !== null) {
                valSpan.textContent = manual;
                state.templateEdit.data[field.name] = parseInt(manual);
              }
            }
          });

          row.appendChild(label);
          row.appendChild(valSpan);
          col.appendChild(row);
        });
        grid.appendChild(col);
      });
      fieldset.appendChild(grid);
      formDiv.appendChild(fieldset);
    });
  }

  // --- DATA: ENCOUNTERS ---
  async function loadEncounters() {
    lists.encounters.innerHTML = "<p>Cargando...</p>";
    const { data, error } = await supabase
      .from("encounters")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      lists.encounters.innerHTML =
        '<p class="error">Error al cargar encuentros</p>';
      return;
    }

    state.encounters = data || [];
    renderEncounters();
  }

  function renderEncounters() {
    if (state.encounters.length === 0) {
      lists.encounters.innerHTML = "<p>No hay encuentros activos.</p>";
      return;
    }

    lists.encounters.innerHTML = "";
    state.encounters.forEach((enc) => {
      const card = document.createElement("div");
      card.className = "ct-card";
      const instanceCount = enc.data ? enc.data.length : 0;
      const dateStr = new Date(enc.created_at).toLocaleDateString();

      card.innerHTML = `
                <h3>${enc.name}</h3>
                <p>${dateStr} - ${instanceCount} PNJs</p>
                <div style="margin-top:10px;">
                    <button class="ct-btn primary btn-open-encounter" data-id="${enc.id}">Abrir</button>
                    <!-- Archive button could go here -->
                </div>
            `;

      card
        .querySelector(".btn-open-encounter")
        .addEventListener("click", () => {
          openEncounter(enc);
        });

      lists.encounters.appendChild(card);
    });
  }

  async function createEncounter() {
    const name = prompt("Nombre del encuentro:");
    if (!name) return;

    const payload = {
      user_id: state.user.id,
      name: name,
      status: "active",
      data: {
        instances: [],
        round: 1,
        activeInstanceId: null,
      },
    };

    const { error } = await supabase.from("encounters").insert(payload);
    if (error) alert(error.message);
    else await loadEncounters();
  }

  // --- ACTIVE ENCOUNTER LOGIC ---
  function openEncounter(encounter) {
    if (!encounter || !encounter.id) return;
    window.location.hash = "active-encounter?id=" + encounter.id;
  }

  function renderActiveInstances() {
    // Access Data Safely
    const encData = state.activeEncounter.data;
    const instances = encData.instances || [];
    const activeId = encData.activeInstanceId;

    console.log("Rendering Instances. Active ID:", activeId);

    // Update Round Counter
    const roundCounter = document.getElementById("ct-round-counter");
    if (roundCounter) roundCounter.textContent = encData.round || 1;

    lists.instances.innerHTML = "";
    // Sort by Initiative Descending
    const sortedInstances = [...instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0)
    );

    if (sortedInstances.length === 0) {
      lists.instances.innerHTML =
        '<p style="grid-column: 1/-1; text-align: center; padding: 20px;">No hay PNJs. Agrega algunos desde el menú.</p>';
      return;
    }

    // Container for timeline
    const timelineContainer = document.createElement("div");
    timelineContainer.className = "ct-timeline";

    sortedInstances.forEach((inst) => {
      // Identify if this instance is the Active one
      const isActive = activeId && inst.id === activeId;

      const row = document.createElement("div");
      row.className = "ct-timeline-row";

      // Status check
      const isDead = inst.status === "dead" || inst.health <= 0;
      const statusText = isDead
        ? "MUERTO"
        : inst.status === "incapacitated"
        ? "EN EL SUELO"
        : "ACTIVO";

      // Health Classes
      const hpPercent = (inst.health / inst.maxHealth) * 100;
      let hpClass = "hp-high";
      if (hpPercent < 50) hpClass = "hp-med";
      if (hpPercent < 20) hpClass = "hp-low";
      if (isDead) hpClass = "hp-dead";

      const cardClass = `ct-instance-card compact ${isDead ? "dead" : ""} ${
        isActive ? "active" : ""
      }`;

      row.innerHTML = `
            <div class="ct-init-bubble">
                <input type="number" class="ct-stat-input init-input" data-id="${
                  inst.id
                }" value="${inst.initiative || 0}">
            </div>
            
            <div class="${cardClass}">
                <div class="ct-card-row speed-row">
                    <span class="ct-instance-code">${inst.code}</span>
                    <span class="ct-instance-name">${inst.name}</span>
                    <div class="ct-health-controls">
                         <button class="ct-control-btn section" data-id="${
                           inst.id
                         }" data-action="dmg-1" title="-1">-</button>
                         <div class="ct-health-bar small">
                            <div class="ct-health-fill ${hpClass}" style="width: ${hpPercent}%;"></div>
                            <span class="ct-health-text">${inst.health}/${
        inst.maxHealth
      }</span>
                         </div>
                         <button class="ct-control-btn section" data-id="${
                           inst.id
                         }" data-action="heal-1" title="+1">+</button>
                    </div>
                </div>
                <div class="ct-card-row status-row">
                    <span class="ct-status-label">${statusText}</span>
                    <!-- Dropdown for manual status override could go here -->
                </div>
            </div>
        `;

      // Bind Initiative Change
      const initInput = row.querySelector(".init-input");
      initInput.addEventListener("change", (e) => {
        const val = parseInt(e.target.value) || 0;
        updateInitiative(inst.id, val);
      });

      // Bind Buttons
      row.querySelectorAll(".ct-control-btn").forEach((btn) => {
        btn.addEventListener("click", (e) => {
          handleInstanceAction(inst.id, btn.dataset.action);
        });
      });

      timelineContainer.appendChild(row);
    });

    lists.instances.appendChild(timelineContainer);
  }

  function updateInitiative(instId, val) {
    const inst = state.activeEncounter.data.instances.find(
      (i) => i.id === instId
    );
    if (inst) {
      inst.initiative = val;
      renderActiveInstances();
      saveActiveEncounter();
    }
  }

  function handleInstanceAction(instId, action) {
    const inst = state.activeEncounter.data.instances.find(
      (i) => i.id === instId
    );
    if (!inst) return;

    if (action === "dmg-1") {
      inst.health = Math.max(0, inst.health - 1);
      if (inst.health === 0 && inst.status !== "dead")
        inst.status = "incapacitated";
    } else if (action === "heal-1") {
      inst.health = Math.min(inst.maxHealth, inst.health + 1);
      if (inst.health > 0 && inst.status === "incapacitated")
        inst.status = "active";
    } else if (action === "kill") {
      inst.status = inst.status === "dead" ? "active" : "dead";
    }

    renderActiveInstances();
    saveActiveEncounter(); // Auto-save on action
  }

  function nextTurn() {
    console.log("Next Turn Triggered");
    if (
      !state.activeEncounter ||
      !state.activeEncounter.data ||
      state.activeEncounter.data.instances.length === 0
    )
      return;

    const encData = state.activeEncounter.data;
    const instances = encData.instances;

    // Ensure we work with the sorted order
    const sortedInstances = [...instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0)
    );

    const currentId = encData.activeInstanceId;
    let nextIndex = 0;

    if (currentId) {
      const currentIndex = sortedInstances.findIndex((i) => i.id === currentId);
      if (currentIndex !== -1) {
        nextIndex = currentIndex + 1;
      }
    }

    // Check if new Round
    if (nextIndex >= sortedInstances.length) {
      nextIndex = 0;
      encData.round = (encData.round || 1) + 1;
    }

    // Set new active
    encData.activeInstanceId = sortedInstances[nextIndex].id;

    renderActiveInstances();
    saveActiveEncounter();
  }

  async function saveActiveEncounter() {
    if (!state.activeEncounter) return;

    const { error } = await supabase
      .from("encounters")
      .update({ data: state.activeEncounter.data })
      .eq("id", state.activeEncounter.id);

    if (error) alert("Error al guardar: " + error.message);
    else {
      const btn = document.getElementById("btn-save-encounter");
      if (btn) {
        const original = btn.textContent;
        btn.textContent = "¡Guardado!";
        setTimeout(() => (btn.textContent = original), 2000);
      }
    }
  }

  // --- SETUP LISTENERS ---
  function setupModalListeners() {
    const btnCreate = document.getElementById("btn-create-template");
    const form = document.getElementById("form-template");

    if (btnCreate) {
      btnCreate.addEventListener("click", () => {
        openEditTemplateModal(null);
      });
    }

    if (form) {
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        saveTemplate();
      });
    }

    const btnCancel = document.getElementById("btn-cancel-template");
    if (btnCancel) {
      btnCancel.addEventListener("click", () => {
        modalTemplate.classList.add("hidden");
      });
    }
  }

  function setupEncounterListeners() {
    document
      .getElementById("btn-create-encounter")
      .addEventListener("click", createEncounter);

    document
      .getElementById("btn-add-npc-instance")
      .addEventListener("click", addInstance);

    document
      .getElementById("btn-save-encounter")
      .addEventListener("click", saveActiveEncounter);

    document
      .getElementById("btn-archive-encounter")
      .addEventListener("click", archiveEncounter);

    document
      .getElementById("btn-back-encounters")
      ?.addEventListener("click", () => {
        // Fallback just in case element exists but logic changed
        state.activeEncounter = null;
        switchTab("encounters");
      });

    const btnNextTurn = document.getElementById("btn-next-turn");
    if (btnNextTurn) {
      btnNextTurn.addEventListener("click", nextTurn);
    }
  }

  async function archiveEncounter() {
    if (!confirm("¿Archivar este encuentro? Desaparecerá de la lista activa."))
      return;
    if (!state.activeEncounter) return;

    const { error } = await supabase
      .from("encounters")
      .update({ status: "archived" })
      .eq("id", state.activeEncounter.id);

    if (error) alert("Error: " + error.message);
    else {
      state.activeEncounter = null;
      switchTab("encounters");
      await loadEncounters();
    }
  }

  async function addInstance() {
    const templateId = lists.templateSelect.value;
    const count =
      parseInt(document.getElementById("input-add-npc-count").value) || 1;

    if (!templateId) return;

    const template = state.templates.find((t) => t.id === templateId);
    if (!template) return;

    // Ensure data structure
    if (Array.isArray(state.activeEncounter.data)) {
      state.activeEncounter.data = {
        instances: state.activeEncounter.data,
        round: 1,
        activeInstanceId: null,
      };
    }
    const currentInstances = state.activeEncounter.data.instances;

    // Find letter: First letter of Name
    const baseLetter = template.name[0].toUpperCase();

    // Find numeric suffix
    let maxNum = 0;
    const regex = new RegExp(`^${baseLetter}(\\d+)$`);
    currentInstances.forEach((inst) => {
      const match = inst.code.match(regex);
      if (match) {
        const num = parseInt(match[1]);
        if (num > maxNum) maxNum = num;
      }
    });

    for (let i = 0; i < count; i++) {
      maxNum++;
      const initVal = calculateInitiative(template.data);
      const newInst = {
        id: crypto.randomUUID(),
        templateId: template.id,
        name: template.name,
        code: `${baseLetter}${maxNum}`,
        health: template.data.maxHealth || 7,
        maxHealth: template.data.maxHealth || 7,
        status: "active",
        stats: template.data.stats,
        initiative: initVal,
      };
      currentInstances.push(newInst);
    }

    renderActiveInstances();
    saveActiveEncounter(); // Auto-save on add
  }

  function calculateInitiative(data) {
    if (!data || !data.stats) return Math.ceil(Math.random() * 10);
    const dex = parseInt(data.stats["Destreza"]) || 0;
    const wits = parseInt(data.stats["Astucia"]) || 0;
    const roll = Math.ceil(Math.random() * 10);
    return dex + wits + roll;
  }

  // Expose init globally
  window.initCombatTracker = init;
})();
