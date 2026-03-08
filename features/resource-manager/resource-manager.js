// features/resource-manager/resource-manager.js — Gestión de Recursos (Templates + Decorados)

(function () {
  const state = {
    templates: [],
    decorAssets: [],
    user: null,
    currentPlayer: null,
    currentChronicleId: null,
    templateFilter: null,
    templateTagFilter: null,
    templateTagFilterLabel: "",
    templateEdit: {
      data: {},
      type: "npc",
      tags: [],
      groups: null,
      tagComposerOpen: false,
    },
    decorEditTags: [],
    decorEditTagComposerOpen: false,
  };
  const CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE =
    "Has alcanzado el límite de almacenamiento de esta Crónica.\nPuedes borrar elementos que ya no utilices para liberar espacio o pasar a un plan superior para aumentar tu límite.";

  let lists = {};
  let modalTemplate = null;
  let currentTemplateMeta = { readonly: false, canDelete: false, name: "" };

  function getTagSystem() {
    return window.ABNShared?.tags || null;
  }

  function formatTagLabel(rawTag) {
    const tagSystem = getTagSystem();
    if (tagSystem?.formatLabel) {
      return tagSystem.formatLabel(rawTag, { displayMode: "title" });
    }
    return String(rawTag || "").trim();
  }

  function renderTagMarkup(tags) {
    if (!Array.isArray(tags) || !tags.length) {
      return '<span class="ct-decor-no-tags">Sin tags</span>';
    }

    return tags
      .map((tag) => `<span class="abn-tag">${escapeHtml(formatTagLabel(tag))}</span>`)
      .join("");
  }

  // --- Initialization ---
  async function init() {
    lists = {
      templates: document.getElementById("templates-list"),
      decor: document.getElementById("decor-list"),
    };

    modalTemplate = document.getElementById("modal-template");

    const {
      data: { session },
    } = await window.abnGetSession();
    if (!session) {
      document.querySelector(".main-container").innerHTML =
        "<p>Debes iniciar sesión.</p>";
      return;
    }
    state.user = session.user;
    state.currentChronicleId =
      localStorage.getItem("currentChronicleId") || null;
    state.currentPlayer = await fetchCurrentPlayerByUserId(session.user.id);

    setupTabs();
    setupSearch();
    setupModalListeners();
    setupDecorListeners();

    await Promise.all([loadTemplates(), loadDecorAssets()]);
  }

  async function fetchCurrentPlayerByUserId(userId) {
    if (!userId) return null;
    const { data, error } = await supabase
      .from("players")
      .select("id, name, is_admin")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("No se pudo resolver jugador actual:", error.message);
      return null;
    }
    return data || null;
  }

  // --- Tab Switching ---
  function setupTabs() {
    document.querySelectorAll(".app-tab").forEach((tab) => {
      tab.addEventListener("click", () => switchTab(tab.dataset.tab));
    });
  }

  function switchTab(tabName) {
    document.querySelectorAll(".app-tab").forEach((b) => {
      if (b.dataset.tab)
        b.classList.toggle("active", b.dataset.tab === tabName);
    });

    document.querySelectorAll(".app-tab-panel").forEach((panel) => {
      panel.classList.toggle("active", panel.id === `view-${tabName}`);
    });
  }

  // --- Search / Filter ---
  function setupSearch() {
    const searchTemplates = document.getElementById("search-templates");
    const searchDecor = document.getElementById("search-decor");
    const filterSystem = document.getElementById("filter-templates-system");
    const filterUser = document.getElementById("filter-templates-user");

    if (searchTemplates) {
      searchTemplates.addEventListener("input", () => renderTemplates());
    }
    if (searchDecor) {
      searchDecor.addEventListener("input", () => renderDecorAssets());
    }
    if (filterSystem) {
      filterSystem.addEventListener("click", () => {
        toggleTemplateFilter("system");
      });
    }
    if (filterUser) {
      filterUser.addEventListener("click", () => {
        toggleTemplateFilter("user");
      });
    }
    syncTemplateFilterButtons();
  }

  function matchesSearch(query, name, tags) {
    if (!query) return true;
    const q = query.toLowerCase();
    if (name.toLowerCase().includes(q)) return true;
    if (Array.isArray(tags) && tags.some((t) => t.toLowerCase().includes(q))) return true;
    return false;
  }

  // =============================================
  // TEMPLATES
  // =============================================
  async function loadTemplates() {
    if (!state.currentPlayer?.id) {
      state.templates = [];
      lists.templates.innerHTML = "<p>No se pudo resolver tu usuario.</p>";
      return;
    }
    lists.templates.innerHTML = "<p>Cargando...</p>";
    const { data, error } = await supabase
      .from("templates")
      .select("*")
      .eq("type", "npc")
      .or(`user_id.eq.${state.user.id},is_system.eq.true`)
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
      renderTemplateTagFilters([]);
      lists.templates.innerHTML = "<p>No hay plantillas creadas.</p>";
      return;
    }

    const scopedTemplates = state.templates.filter((tpl) =>
      matchesTemplateFilter(tpl) && matchesTemplateSearch(tpl)
    );
    renderTemplateTagFilters(scopedTemplates);

    const filtered = scopedTemplates.filter((tpl) => matchesTemplateTagFilter(tpl));

    if (filtered.length === 0) {
      lists.templates.innerHTML = "<p>Sin resultados para esta búsqueda.</p>";
      return;
    }

    lists.templates.innerHTML = "";
    // Sort: system templates first, then user templates
    const sorted = [...filtered].sort((a, b) => {
      if (a.is_system && !b.is_system) return -1;
      if (!a.is_system && b.is_system) return 1;
      return (a.name || "").localeCompare(b.name || "");
    });

    sorted.forEach((tpl) => {
      const card = document.createElement("div");
      const isSystem = !!tpl.is_system;
      card.className =
        "ct-card ct-card--interactive" + (isSystem ? " ct-card--system" : "");
      card.tabIndex = 0;
      card.setAttribute("role", "button");
      card.setAttribute(
        "aria-label",
        `${isSystem ? "Ver" : "Editar"} plantilla ${tpl.name || ""}`.trim()
      );

      const tags = Array.isArray(tpl.data?.tags) ? tpl.data.tags : [];
      const tagsHtml = renderTagMarkup(tags);

      const typeBadge = isSystem
        ? '<span class="ct-template-type ct-template-type--system">Sistema</span>'
        : '<span class="ct-template-type">PNJ</span>';

      card.innerHTML = `
        <div class="ct-card-header">
          <h3>${escapeHtml(tpl.name)}</h3>
          ${typeBadge}
        </div>
        <div class="ct-decor-tags">${tagsHtml}</div>
      `;

      const openCard = () => openTemplateModal(tpl, { readonly: isSystem });
      card.addEventListener("click", openCard);
      card.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          openCard();
        }
      });

      lists.templates.appendChild(card);
    });
  }

  async function deleteTemplate(id) {
    const { error } = await supabase
      .from("templates")
      .delete()
      .eq("id", id)
      .eq("user_id", state.user.id);
    if (error) {
      alert("Error al eliminar: " + error.message);
    } else {
      await loadTemplates();
    }
  }

  function matchesTemplateFilter(tpl) {
    if (!state.templateFilter) return true;
    if (state.templateFilter === "system") return !!tpl?.is_system;
    if (state.templateFilter === "user") return !tpl?.is_system;
    return true;
  }

  function matchesTemplateSearch(tpl) {
    const query = (document.getElementById("search-templates")?.value || "").trim();
    return matchesSearch(query, tpl?.name || "", tpl?.data?.tags);
  }

  function matchesTemplateTagFilter(tpl) {
    if (!state.templateTagFilter) return true;
    const tags = getNormalizedTemplateTags(tpl);
    return tags.some((tag) => tag.key === state.templateTagFilter);
  }

  function toggleTemplateFilter(filterKey) {
    if (filterKey !== "system" && filterKey !== "user") {
      return;
    }
    state.templateFilter = state.templateFilter === filterKey ? null : filterKey;
    syncTemplateFilterButtons();
    renderTemplates();
  }

  function syncTemplateFilterButtons() {
    ["system", "user"].forEach((key) => {
      const button = document.querySelector(`.ct-filter-btn[data-filter="${key}"]`);
      if (!button) return;
      const enabled = state.templateFilter === key;
      button.classList.toggle("is-active", enabled);
      button.setAttribute("aria-pressed", enabled ? "true" : "false");
    });
  }

  function toggleTemplateTagFilter(tagKey, tagLabel) {
    if (!tagKey) return;
    if (state.templateTagFilter === tagKey) {
      state.templateTagFilter = null;
      state.templateTagFilterLabel = "";
    } else {
      state.templateTagFilter = tagKey;
      state.templateTagFilterLabel = tagLabel || tagKey;
    }
    renderTemplates();
  }

  function renderTemplateTagFilters(baseTemplates) {
    const container = document.getElementById("template-tags-filters");
    const tagSystem = getTagSystem();
    if (!container || !tagSystem) return;

    const tagStats = tagSystem.collectStats(baseTemplates, {
      getTags: (tpl) => tpl?.data?.tags,
      selectedTag: state.templateTagFilter,
      selectedLabel: state.templateTagFilterLabel,
    });

    tagSystem.renderFilterBar({
      container,
      stats: tagStats,
      selectedTag: state.templateTagFilter,
      onToggle: (key, label) => toggleTemplateTagFilter(key, label),
      displayMode: "title",
    });
  }

  function getNormalizedTemplateTags(tpl) {
    const tagSystem = getTagSystem();
    if (tagSystem?.getTagObjects) {
      return tagSystem.getTagObjects(tpl?.data?.tags);
    }

    const tags = Array.isArray(tpl?.data?.tags) ? tpl.data.tags : [];
    return tags
      .map((tag) => ({ key: String(tag || "").trim().toLowerCase(), label: String(tag || "").trim() }))
      .filter((tag) => tag.key);
  }

  // --- TEMPLATE MODAL ---
  let currentTemplateId = null;

  function openTemplateModal(tpl = null, opts = {}) {
    const readonly = !!opts.readonly;
    const containerId = "tpl-stats-container";
    const containerEl = document.getElementById(containerId);
    const modal = document.getElementById("modal-template");
    const modalInner = modal.querySelector(".ct-modal");

    if (!containerEl) {
      console.error("Template container not found: " + containerId);
      return;
    }
    containerEl.innerHTML = "";

    // Read-only class toggle
    modalInner.classList.toggle("ct-modal--readonly", readonly);
    currentTemplateMeta = {
      readonly,
      canDelete: !!(tpl && tpl.id && !readonly && !tpl.is_system),
      name: tpl?.name || "",
    };

    currentTemplateId = tpl ? tpl.id : null;
    document.getElementById("tpl-id").value = currentTemplateId || "";
    document.getElementById("tpl-name").value = tpl ? tpl.name : "";
    document.getElementById("tpl-notes").value =
      tpl && tpl.data ? tpl.data.notes || "" : "";

    // Modal title
    document.getElementById("modal-template-title").textContent =
      readonly ? (tpl ? tpl.name : "Plantilla") : (tpl ? "Editar Plantilla" : "Nueva Plantilla");

    // Hide/show save button
    const saveBtn = modal.querySelector('button[type="submit"]');
    if (saveBtn) saveBtn.classList.toggle("hidden", readonly);

    // Show duplicate button only when viewing an existing template
    const dupBtn = document.getElementById("btn-duplicate-template");
    if (dupBtn) dupBtn.classList.toggle("hidden", !tpl);

    const deleteBtn = document.getElementById("btn-delete-template");
    if (deleteBtn) {
      deleteBtn.classList.toggle("hidden", !currentTemplateMeta.canDelete);
      deleteBtn.textContent = "Eliminar";
    }

    // Change cancel button text
    const cancelBtn = document.getElementById("btn-cancel-template");
    if (cancelBtn) cancelBtn.textContent = readonly ? "Cerrar" : "Cancelar";

    // Determine type
    state.templateEdit.type =
      tpl && tpl.type
        ? tpl.type
        : tpl && tpl.data && tpl.data.type
        ? tpl.data.type
        : "npc";

    // Initialize tags
    state.templateEdit.tags = (tpl && tpl.data && tpl.data.tags) ? [...tpl.data.tags] : [];
    state.templateEdit.tagComposerOpen = false;
    renderTagsInput();

    // Initialize edit data and groups from template or definitions
    state.templateEdit.data = {};
    const defs = window.TEMPLATE_DEFINITIONS[state.templateEdit.type] || window.TEMPLATE_DEFINITIONS.npc;

    if (tpl && tpl.data && tpl.data.groups && tpl.data.groups.length) {
      // Use the template's own groups (supports custom abilities)
      state.templateEdit.groups = JSON.parse(JSON.stringify(tpl.data.groups));
    } else {
      // New template: use TEMPLATE_DEFINITIONS as skeleton
      state.templateEdit.groups = JSON.parse(JSON.stringify(defs.groups));
    }

    state.templateEdit.groups.forEach((g) => {
      g.fields.forEach((f) => {
        state.templateEdit.data[f.name] = f.value;
      });
    });

    // Type Selector
    const typeWrap = document.getElementById("tpl-type-container");
    if (typeWrap) {
      typeWrap.innerHTML = "";

      const typeSelect = document.createElement("select");
      typeSelect.id = "tpl-type-select";
      typeSelect.className = "ct-select";
      typeSelect.setAttribute("aria-label", "Tipo de plantilla");

      Object.keys(window.TEMPLATE_DEFINITIONS).forEach((key) => {
        const opt = document.createElement("option");
        opt.value = key;
        opt.textContent = key.toUpperCase();
        if (key === state.templateEdit.type) opt.selected = true;
        typeSelect.appendChild(opt);
      });

      typeSelect.addEventListener("change", (e) => {
        state.templateEdit.type = e.target.value;
        // Switching type resets to TEMPLATE_DEFINITIONS skeleton
        const newDefs = window.TEMPLATE_DEFINITIONS[e.target.value] || window.TEMPLATE_DEFINITIONS.npc;
        state.templateEdit.groups = JSON.parse(JSON.stringify(newDefs.groups));
        state.templateEdit.data = {};
        state.templateEdit.groups.forEach((g) => {
          g.fields.forEach((f) => {
            state.templateEdit.data[f.name] = f.value;
          });
        });
        renderTemplateForm(containerEl);
      });

      typeWrap.appendChild(typeSelect);
    }

    renderTemplateForm(containerEl);
    modal.classList.remove("hidden");
  }

  function renderTemplateForm(container) {
    let formDiv = container.querySelector(".ct-form-content");
    if (!formDiv) {
      formDiv = document.createElement("div");
      formDiv.className = "ct-form-content";
      container.appendChild(formDiv);
    }
    formDiv.innerHTML = "";

    const groups = state.templateEdit.groups || [];

    groups.forEach((group) => {
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
    const tagSystem = getTagSystem();
    if (!container || !tagSystem) return;

    tagSystem.renderEditor({
      container,
      tags: state.templateEdit.tags,
      composerOpen: state.templateEdit.tagComposerOpen,
      editable: true,
      displayMode: "title",
      placeholder: "Nuevo tag",
      onComposerToggle: (isOpen) => {
        state.templateEdit.tagComposerOpen = isOpen;
        renderTagsInput();
      },
      onChange: (nextTags) => {
        state.templateEdit.tags = nextTags;
        state.templateEdit.tagComposerOpen = false;
        renderTagsInput();
      },
    });
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
    const groups = JSON.parse(JSON.stringify(state.templateEdit.groups || []));

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
      const res = await supabase
        .from("templates")
        .update(payload)
        .eq("id", id)
        .eq("user_id", state.user.id);
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

  function duplicateCurrentTemplate() {
    const name = document.getElementById("tpl-name").value;
    const notes = document.getElementById("tpl-notes").value;

    // Clone current groups with their actual values
    const clonedGroups = JSON.parse(JSON.stringify(state.templateEdit.groups || []));
    clonedGroups.forEach((g) => {
      g.fields.forEach((f) => {
        const val = state.templateEdit.data[f.name];
        if (val !== undefined) f.value = val;
      });
    });

    // Build a fake template object from current modal state
    const fakeTpl = {
      id: null,
      type: state.templateEdit.type || "npc",
      name: name ? name + " (copia)" : "Copia",
      data: {
        notes: notes,
        tags: [...(state.templateEdit.tags || [])],
        groups: clonedGroups,
      },
    };

    // Open as a new editable template (no id = insert on save)
    openTemplateModal(fakeTpl);
  }

  async function handleDeleteCurrentTemplate() {
    if (!currentTemplateId || !currentTemplateMeta.canDelete) return;
    const confirmed = confirm(
      `¿Eliminar plantilla "${currentTemplateMeta.name}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    modalTemplate?.classList.add("hidden");
    await deleteTemplate(currentTemplateId);
  }

  // =============================================
  // DECORADOS (Design Assets)
  // =============================================

  function getAssetPublicUrl(imagePath) {
    if (!imagePath) return "";
    const { data } = supabase.storage
      .from("encounter-assets")
      .getPublicUrl(imagePath);
    return data?.publicUrl || "";
  }

  async function loadDecorAssets() {
    if (!state.user?.id) {
      state.decorAssets = [];
      if (lists.decor) lists.decor.innerHTML = "<p>No se pudo resolver tu usuario.</p>";
      return;
    }
    if (lists.decor) lists.decor.innerHTML = "<p>Cargando...</p>";

    let data = [];
    let error = null;
    if (state.currentChronicleId) {
      const scoped = await supabase
        .from("encounter_design_assets")
        .select("*")
        .eq("chronicle_id", state.currentChronicleId)
        .order("created_at", { ascending: false });
      if (scoped.error) {
        error = scoped.error;
      } else {
        data = scoped.data || [];
      }

      const legacy = await supabase
        .from("encounter_design_assets")
        .select("*")
        .is("chronicle_id", null)
        .eq("owner_user_id", state.user.id)
        .order("created_at", { ascending: false });
      if (!legacy.error && Array.isArray(legacy.data) && legacy.data.length) {
        data = [...data, ...legacy.data];
      }
    } else {
      const all = await supabase
        .from("encounter_design_assets")
        .select("*")
        .order("created_at", { ascending: false });
      data = all.data || [];
      error = all.error || null;
    }

    if (error) {
      console.error(error);
      if (lists.decor) lists.decor.innerHTML = '<p class="error">Error al cargar decorados</p>';
      return;
    }

    state.decorAssets = data || [];
    renderDecorAssets();
  }

  function renderDecorAssets() {
    if (!lists.decor) return;

    if (state.decorAssets.length === 0) {
      lists.decor.innerHTML = "<p>No hay decorados subidos.</p>";
      return;
    }

    const query = (document.getElementById("search-decor")?.value || "").trim();
    const filtered = state.decorAssets.filter((asset) =>
      matchesSearch(query, asset.name || "", asset.tags)
    );

    if (filtered.length === 0) {
      lists.decor.innerHTML = "<p>Sin resultados para esta búsqueda.</p>";
      return;
    }

    lists.decor.innerHTML = "";
    filtered.forEach((asset) => {
      const card = document.createElement("div");
      card.className = "ct-card ct-card--decor";

      const imgUrl = getAssetPublicUrl(asset.image_path);
      const tags = Array.isArray(asset.tags) ? asset.tags : [];
      const tagsHtml = renderTagMarkup(tags);
      const isOwner = asset.owner_user_id === state.user?.id;

      card.innerHTML = `
        <div class="ct-decor-thumb-wrap">
          <img class="ct-decor-thumb" src="${escapeHtml(imgUrl)}" alt="${escapeHtml(asset.name)}" loading="lazy">
        </div>
        <div class="ct-decor-info">
          <h3>${escapeHtml(asset.name)}</h3>
          <div class="ct-decor-tags">${tagsHtml}</div>
        </div>
        ${isOwner ? `<div class="ct-card-actions">
          <button class="btn btn--ghost btn-edit-decor" data-id="${asset.id}">Editar</button>
          <button class="btn btn--danger btn-delete-decor" data-id="${asset.id}">Eliminar</button>
        </div>` : ""}
      `;

      if (isOwner) {
        card.querySelector(".btn-edit-decor")?.addEventListener("click", () => {
          openDecorEditModal(asset);
        });
        card.querySelector(".btn-delete-decor")?.addEventListener("click", async () => {
          if (confirm(`¿Eliminar decorado "${asset.name}"? Se borrará la imagen del almacenamiento.`)) {
            await deleteDecorAsset(asset);
          }
        });
      }

      lists.decor.appendChild(card);
    });
  }

  // --- Decor Upload ---
  function setupDecorListeners() {
    const btnUpload = document.getElementById("btn-upload-decor");
    const fileInput = document.getElementById("decor-upload-input");

    if (btnUpload && fileInput) {
      btnUpload.addEventListener("click", () => fileInput.click());
      fileInput.addEventListener("change", async (e) => {
        const file = e.target?.files?.[0];
        if (!file) return;
        await uploadDecorAsset(file);
        e.target.value = "";
      });
    }

    // Edit modal
    const formDecor = document.getElementById("form-decor");
    if (formDecor) {
      formDecor.addEventListener("submit", (e) => {
        e.preventDefault();
        saveDecorEdit();
      });
    }
    document.getElementById("btn-cancel-decor")?.addEventListener("click", () => {
      document.getElementById("modal-decor")?.classList.add("hidden");
    });
  }

  function parseTagList(rawTags) {
    const tagSystem = getTagSystem();
    if (tagSystem?.parse) {
      return tagSystem.parse(rawTags);
    }

    if (Array.isArray(rawTags)) {
      return [...new Set(rawTags.map((t) => String(t || "").trim()).filter(Boolean))];
    }
    return [
      ...new Set(
        String(rawTags || "")
          .split(",")
          .map((tag) => tag.trim())
          .filter(Boolean)
      ),
    ];
  }

  async function showStorageLimitReachedModal() {
    const showModal = window.ABNShared?.modal?.showChronicleStorageLimitReached;
    if (typeof showModal === "function") {
      await showModal();
      return;
    }
    alert(CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE);
  }

  async function ensureChronicleQuota(chronicleId, incomingBytes) {
    if (!chronicleId) {
      return {
        ok: false,
        reason: "missing_chronicle",
        message: "Selecciona una crónica activa antes de subir assets.",
      };
    }
    const { data, error } = await supabase.rpc("check_chronicle_storage_quota", {
      p_chronicle_id: chronicleId,
      p_incoming_bytes: Number(incomingBytes || 0),
    });
    if (error) {
      return {
        ok: false,
        reason: "quota_check_failed",
        message: `No se pudo validar cuota: ${error.message}`,
      };
    }
    if (data?.error) {
      if (data.error === "not_authorized") {
        return {
          ok: false,
          reason: "not_authorized",
          message: "No tenés permisos en esta crónica para subir archivos.",
        };
      }
      return {
        ok: false,
        reason: "quota_check_failed",
        message: `No se pudo validar cuota (${data.error}).`,
      };
    }
    if (data && data.allowed === false) {
      return {
        ok: false,
        reason: "limit_reached",
        message: CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE,
      };
    }
    return { ok: true, reason: null, message: "" };
  }

  async function uploadDecorAsset(file) {
    if (!file || !state.user?.id) return;
    if (!state.currentChronicleId) {
      alert("Primero abre una crónica para asociar este decorado.");
      return;
    }

    const rawName = prompt("Nombre del decorado", file.name.replace(/\.[a-z0-9]+$/i, ""));
    if (rawName === null) return;
    const name = rawName.trim() || "Decorado";

    const rawTags = prompt("Tags (separados por coma)", "decoracion, mapa");
    if (rawTags === null) return;
    const tags = parseTagList(rawTags);

    const cleanName = String(file.name || "asset")
      .toLowerCase()
      .replace(/[^a-z0-9._-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "");
    const quota = await ensureChronicleQuota(state.currentChronicleId, file.size);
    if (!quota.ok) {
      if (quota.reason === "limit_reached") {
        await showStorageLimitReachedModal();
        return;
      }
      alert(quota.message);
      return;
    }
    const filePath = `chronicle/${state.currentChronicleId}/encounter-assets/${Date.now()}-${cleanName}`;

    const { error: uploadError } = await supabase.storage
      .from("encounter-assets")
      .upload(filePath, file, { upsert: false });

    if (uploadError) {
      alert("Error subiendo imagen: " + uploadError.message);
      return;
    }

    const { error: insertError } = await supabase
      .from("encounter_design_assets")
      .insert({
        owner_user_id: state.user.id,
        chronicle_id: state.currentChronicleId,
        name,
        image_path: filePath,
        tags,
        is_shared: false,
      });

    if (insertError) {
      alert("Error guardando decorado: " + insertError.message);
      return;
    }

    await loadDecorAssets();
  }

  // --- Decor Edit ---
  function openDecorEditModal(asset) {
    const modal = document.getElementById("modal-decor");
    if (!modal) return;
    document.getElementById("decor-edit-id").value = asset.id;
    document.getElementById("decor-edit-name").value = asset.name || "";
    state.decorEditTags = Array.isArray(asset.tags) ? [...asset.tags] : [];
    state.decorEditTagComposerOpen = false;
    renderDecorEditTags();
    modal.classList.remove("hidden");
  }

  function renderDecorEditTags() {
    const container = document.getElementById("decor-edit-tags-container");
    const tagSystem = getTagSystem();
    if (!container || !tagSystem) return;

    tagSystem.renderEditor({
      container,
      tags: state.decorEditTags,
      composerOpen: state.decorEditTagComposerOpen,
      editable: true,
      displayMode: "title",
      placeholder: "Nuevo tag",
      onComposerToggle: (isOpen) => {
        state.decorEditTagComposerOpen = isOpen;
        renderDecorEditTags();
      },
      onChange: (nextTags) => {
        state.decorEditTags = nextTags;
        state.decorEditTagComposerOpen = false;
        renderDecorEditTags();
      },
    });
  }

  async function saveDecorEdit() {
    const id = document.getElementById("decor-edit-id").value;
    const name = document.getElementById("decor-edit-name").value.trim();
    if (!id || !name) {
      alert("El nombre es requerido");
      return;
    }

    const { error } = await supabase
      .from("encounter_design_assets")
      .update({ name, tags: state.decorEditTags })
      .eq("id", id)
      .eq("owner_user_id", state.user.id);

    if (error) {
      alert("Error al guardar: " + error.message);
      return;
    }

    document.getElementById("modal-decor")?.classList.add("hidden");
    await loadDecorAssets();
  }

  async function deleteDecorAsset(asset) {
    // Delete from storage first
    if (asset.image_path) {
      await supabase.storage.from("encounter-assets").remove([asset.image_path]);
    }

    const { error } = await supabase
      .from("encounter_design_assets")
      .delete()
      .eq("id", asset.id)
      .eq("owner_user_id", state.user.id);

    if (error) {
      alert("Error al eliminar: " + error.message);
      return;
    }

    await loadDecorAssets();
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

    const btnDuplicate = document.getElementById("btn-duplicate-template");
    if (btnDuplicate) {
      btnDuplicate.addEventListener("click", () => {
        duplicateCurrentTemplate();
      });
    }

    const btnDelete = document.getElementById("btn-delete-template");
    if (btnDelete) {
      btnDelete.addEventListener("click", () => {
        handleDeleteCurrentTemplate();
      });
    }
  }

  window.initResourceManager = init;
})();
