// js/combat-tracker.js

(function () {
  const state = {
    templates: [],
    encounters: [],
    user: null,
    isAdmin: false,
    templateEdit: { data: {}, type: "npc", tags: [] },
  };

  let containers = {};
  let lists = {};
  let modalTemplate = null;

  // --- Initialization ---
  async function init() {
    containers = {
      templates: document.getElementById("view-templates"),
      encounters: document.getElementById("view-encounters"),
    };

    lists = {
      templates: document.getElementById("templates-list"),
      encounters: document.getElementById("encounters-list"),
    };

    modalTemplate = document.getElementById("modal-template");

    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      document.querySelector(".main-container").innerHTML =
        "<p>Debes iniciar sesión.</p>";
      return;
    }
    state.user = session.user;
    state.isAdmin = await fetchIsAdmin(session.user.id);

    setupTabs();
    setupModalListeners();
    setupEncounterListeners();
    updateRoleUI();

    await loadTemplates();
    await loadEncounters();
  }

  async function fetchIsAdmin(userId) {
    if (!userId) return false;
    const { data, error } = await supabase
      .from("players")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("No se pudo resolver rol admin:", error.message);
      return false;
    }
    return !!data?.is_admin;
  }

  function updateRoleUI() {
    const createEncounterBtn = document.getElementById("btn-create-encounter");
    const createTemplateBtn = document.getElementById("btn-create-template");

    if (!state.isAdmin) {
      if (createEncounterBtn) createEncounterBtn.style.display = "none";
      if (createTemplateBtn) createTemplateBtn.style.display = "none";
    }
  }

  // --- Tab Switching ---
  function setupTabs() {
    document.querySelectorAll(".ct-tab-btn").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll(".ct-tab-btn").forEach((b) => {
      if (b.dataset.tab)
        b.classList.toggle("active", b.dataset.tab === tabName);
    });

    Object.values(containers).forEach((el) => (el.style.display = "none"));

    if (tabName === "templates") {
      containers.templates.style.display = "block";
    } else if (tabName === "encounters") {
      containers.encounters.style.display = "block";
    }
  }

  // --- DATA: TEMPLATES ---
  async function loadTemplates() {
    if (!state.isAdmin) {
      state.templates = [];
      lists.templates.innerHTML =
        "<p>Solo administradores pueden gestionar plantillas.</p>";
      return;
    }
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

      let summary = "";
      if (tpl.data && tpl.data.groups) {
        const flat = [];
        tpl.data.groups.forEach((g) => {
          g.fields.forEach((f) => {
            if (f.value > 0) flat.push(`${f.name}: ${f.value}`);
          });
        });
        summary = flat.slice(0, 4).join(", ");
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
        <div style="margin-top:8px; display:flex; gap:8px;">
          <button class="ct-btn btn-edit-template" data-id="${tpl.id}">Editar</button>
          <button class="ct-btn btn-delete-template" data-id="${tpl.id}" style="color:#c0392b;">Eliminar</button>
        </div>
      `;

      card.querySelector(".btn-edit-template").addEventListener("click", () => {
        openTemplateModal(tpl);
      });

      card
        .querySelector(".btn-delete-template")
        .addEventListener("click", async () => {
          if (
            confirm(
              `¿Eliminar plantilla "${tpl.name}"? Esta acción no se puede deshacer.`
            )
          ) {
            await deleteTemplate(tpl.id);
          }
        });

      lists.templates.appendChild(card);
    });
  }

  async function deleteTemplate(id) {
    const { error } = await supabase.from("templates").delete().eq("id", id);
    if (error) {
      alert("Error al eliminar: " + error.message);
    } else {
      await loadTemplates();
    }
  }

  // --- TEMPLATE MODAL ---
  let currentTemplateId = null;

  function openTemplateModal(tpl = null) {
    const containerId = "tpl-stats-container";
    const containerEl = document.getElementById(containerId);
    const modal = document.getElementById("modal-template");

    if (!containerEl) {
      console.error("Template container not found: " + containerId);
      return;
    }
    containerEl.innerHTML = "";

    currentTemplateId = tpl ? tpl.id : null;
    document.getElementById("tpl-id").value = currentTemplateId || "";
    document.getElementById("tpl-name").value = tpl ? tpl.name : "";
    document.getElementById("tpl-notes").value =
      tpl && tpl.data ? tpl.data.notes || "" : "";

    // Determine type
    state.templateEdit.type =
      tpl && tpl.type
        ? tpl.type
        : tpl && tpl.data && tpl.data.type
        ? tpl.data.type
        : "npc";

    // Initialize tags
    state.templateEdit.tags = (tpl && tpl.data && tpl.data.tags) ? [...tpl.data.tags] : [];
    renderTagsInput();

    // Initialize edit data from groups structure
    state.templateEdit.data = {};
    if (tpl && tpl.data && tpl.data.groups) {
      tpl.data.groups.forEach((g) => {
        g.fields.forEach((f) => {
          state.templateEdit.data[f.name] = f.value;
        });
      });
    }

    // Type Selector
    const typeWrap = document.getElementById("tpl-type-container");
    if (typeWrap) {
      typeWrap.innerHTML = "";

      const typeLabel = document.createElement("label");
      typeLabel.textContent = "Tipo de Plantilla";

      const typeSelect = document.createElement("select");
      typeSelect.className = "ct-select";

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

    renderTemplateForm(containerEl, state.templateEdit.type);
    modal.classList.remove("hidden");
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

  function renderTagsInput() {
    const container = document.getElementById("tpl-tags-container");
    if (!container) return;

    container.innerHTML = "";

    // Existing tags as pills
    const pillsWrap = document.createElement("div");
    pillsWrap.className = "ct-tags-pills";
    state.templateEdit.tags.forEach((tag, idx) => {
      const pill = document.createElement("span");
      pill.className = "ct-tag-pill";
      pill.innerHTML = `${tag} <button type="button" data-idx="${idx}">&times;</button>`;
      pill.querySelector("button").addEventListener("click", () => {
        state.templateEdit.tags.splice(idx, 1);
        renderTagsInput();
      });
      pillsWrap.appendChild(pill);
    });
    container.appendChild(pillsWrap);

    // Input for new tags
    const input = document.createElement("input");
    input.type = "text";
    input.placeholder = "Nuevo tag + Enter";
    input.className = "ct-tag-input";
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const val = input.value.trim().toLowerCase();
        if (val && !state.templateEdit.tags.includes(val)) {
          state.templateEdit.tags.push(val);
          renderTagsInput();
        }
      }
    });
    container.appendChild(input);
  }

  async function saveTemplate() {
    const id = document.getElementById("tpl-id").value;
    const name = document.getElementById("tpl-name").value;
    const notes = document.getElementById("tpl-notes").value;

    if (!name) {
      alert("El nombre es requerido");
      return;
    }

    const type = state.templateEdit.type || "npc";
    const defs =
      window.TEMPLATE_DEFINITIONS[type] || window.TEMPLATE_DEFINITIONS.npc;
    const groups = JSON.parse(JSON.stringify(defs.groups));

    groups.forEach((group) => {
      group.fields.forEach((field) => {
        let val = state.templateEdit.data[field.name];
        if (val === undefined) val = field.value || 0;
        field.value = val;
      });
    });

    const maxHealth =
      state.templateEdit.data["Salud máxima"] ||
      state.templateEdit.data["Salud"] ||
      7;

    const payload = {
      user_id: state.user.id,
      name: name,
      type: type,
      data: {
        maxHealth: maxHealth,
        groups: groups,
        notes: notes,
        tags: state.templateEdit.tags || [],
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

  // --- DATA: ENCOUNTERS ---
  async function loadEncounters() {
    lists.encounters.innerHTML = "<p>Cargando...</p>";
    let query = supabase
      .from("encounters")
      .select("*")
      .neq("status", "archived")
      .order("created_at", { ascending: false });

    if (!state.isAdmin) {
      query = query.in("status", ["in_game", "active"]);
    }

    const { data, error } = await query;

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
      lists.encounters.innerHTML = "<p>No hay encuentros visibles.</p>";
      return;
    }

    lists.encounters.innerHTML = "";
    state.encounters.forEach((enc) => {
      const card = document.createElement("div");
      card.className = "ct-card";
      const instanceCount = enc.data?.instances?.length || 0;
      const dateStr = new Date(enc.created_at).toLocaleDateString();
      const roundInfo =
        enc.data?.round > 1 ? ` | Ronda ${enc.data.round}` : "";
      const status = normalizeEncounterStatus(enc.status);
      const statusLabel = formatEncounterStatus(status);

      card.innerHTML = `
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
          <h3 style="margin:0;">${enc.name}</h3>
          <span class="ct-encounter-status ${status}">${statusLabel}</span>
        </div>
        <p>${dateStr} - ${instanceCount} participantes${roundInfo}</p>
        <div style="margin-top:10px;">
          <button class="ct-btn primary btn-open-encounter" data-id="${enc.id}">Abrir</button>
        </div>
      `;

      card
        .querySelector(".btn-open-encounter")
        .addEventListener("click", () => openEncounter(enc));

      lists.encounters.appendChild(card);
    });
  }

  function openEncounterModal() {
    document.getElementById("enc-name").value = "";
    document.getElementById("modal-encounter").classList.remove("hidden");
    document.getElementById("enc-name").focus();
  }

  async function createEncounter(name) {
    if (!state.isAdmin) {
      alert("Solo administradores pueden crear encuentros.");
      return;
    }
    const payload = {
      user_id: state.user.id,
      name: name,
      status: "wip",
      data: {
        instances: [],
        tokens: [],
        round: 1,
        activeInstanceId: null,
      },
    };

    const { error } = await supabase.from("encounters").insert(payload);
    if (error) alert(error.message);
    else {
      document.getElementById("modal-encounter").classList.add("hidden");
      await loadEncounters();
    }
  }

  function openEncounter(encounter) {
    if (!encounter || !encounter.id) return;
    window.location.hash = "active-encounter?id=" + encounter.id;
  }

  function normalizeEncounterStatus(status) {
    if (status === "active") return "in_game";
    return status || "wip";
  }

  function formatEncounterStatus(status) {
    const labels = {
      wip: "WIP",
      ready: "Listo",
      in_game: "En juego",
      archived: "Archivado",
    };
    return labels[status] || status;
  }

  // --- SETUP LISTENERS ---
  function setupModalListeners() {
    const btnCreate = document.getElementById("btn-create-template");
    const form = document.getElementById("form-template");

    if (btnCreate) {
      btnCreate.addEventListener("click", () => openTemplateModal(null));
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
      ?.addEventListener("click", openEncounterModal);

    // Encounter creation modal
    const formEnc = document.getElementById("form-encounter");
    if (formEnc) {
      formEnc.addEventListener("submit", (e) => {
        e.preventDefault();
        const name = document.getElementById("enc-name").value.trim();
        if (!name) return;
        createEncounter(name);
      });
    }

    const btnCancelEnc = document.getElementById("btn-cancel-encounter");
    if (btnCancelEnc) {
      btnCancelEnc.addEventListener("click", () => {
        document.getElementById("modal-encounter").classList.add("hidden");
      });
    }
  }

  window.initCombatTracker = init;
})();
