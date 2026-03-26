(function initSharedContactScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function documentScreen() {
    return root.documentScreen || null;
  }

  function tagSystem() {
    return root.tags || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function parseTags(raw, { lowercase = false } = {}) {
    const sharedTags = tagSystem();
    if (sharedTags?.parse) {
      if (Array.isArray(raw)) {
        return sharedTags.dedupe(
          raw.map((tag) => sharedTags.normalizeTag(tag, { lowercase })).filter(Boolean),
        );
      }
      return sharedTags.parse(raw, { lowercase });
    }

    if (Array.isArray(raw)) {
      return [...new Set(
        raw
          .map((tag) => (lowercase ? String(tag || "").trim().toLowerCase() : String(tag || "").trim()))
          .filter(Boolean),
      )];
    }

    return [...new Set(
      String(raw || "")
        .split(",")
        .map((tag) => (lowercase ? tag.trim().toLowerCase() : tag.trim()))
        .filter(Boolean),
    )];
  }

  function renderMarkdown(markdown) {
    const raw = String(markdown || "");
    if (typeof global.renderMarkdown === "function") {
      return global.renderMarkdown(raw);
    }
    if (global.marked?.parse) {
      const html = global.marked.parse(raw);
      if (global.DOMPurify?.sanitize) return global.DOMPurify.sanitize(html);
      return html;
    }
    return raw ? `<p>${escapeHtml(raw).replace(/\n/g, "<br>")}</p>` : "<p></p>";
  }

  /* ── Constants ── */

  const CONTACT_TYPE_LABELS = {
    mortal: "Mortal",
    animal: "Animal",
    sobrenatural: "Sobrenatural",
    otro: "Otro",
  };

  const VINCULO_LABELS = {
    0: "Ninguno",
    1: "Primer Trago",
    2: "Segundo Trago",
    3: "Vinculado",
  };

  function getContactTypeLabel(type) {
    return CONTACT_TYPE_LABELS[type] || type || "";
  }

  /* ── Avatar Circle Rendering ── */

  function getAvatarPosition(stats) {
    var pos = stats?.avatarPosition;
    return {
      x: Number.isFinite(pos?.x) ? pos.x : 50,
      y: Number.isFinite(pos?.y) ? pos.y : 50,
      scale: Number.isFinite(pos?.scale) ? pos.scale : 1,
    };
  }

  function avatarCircleStyle(url, pos) {
    return 'background-image:url(' + escapeHtml(url) + ');background-position:' + pos.x + '% ' + pos.y + '%;background-size:' + (pos.scale * 100) + '%;background-repeat:no-repeat';
  }

  /* ── Lightbox ── */

  function openLightbox(url, alt) {
    var overlay = document.createElement("div");
    overlay.className = "contacto-lightbox";
    overlay.innerHTML = '<img src="' + escapeHtml(url) + '" alt="' + escapeHtml(alt || "") + '">';
    overlay.addEventListener("click", function () { overlay.remove(); });
    document.addEventListener("keydown", function handler(e) {
      if (e.key === "Escape") { overlay.remove(); document.removeEventListener("keydown", handler); }
    });
    (document.querySelector(".app") || document.body).appendChild(overlay);
  }

  /* ── Default Stats ── */

  function getDefaultStats() {
    var defs = global.TEMPLATE_DEFINITIONS;
    if (defs?.npc?.groups) {
      return JSON.parse(JSON.stringify(defs.npc.groups));
    }
    return [
      {
        name: "Atributos",
        fields: [
          { name: "Fuerza", value: 1, type: "Físicos" },
          { name: "Destreza", value: 1, type: "Físicos" },
          { name: "Resistencia", value: 1, type: "Físicos" },
          { name: "Carisma", value: 1, type: "Sociales" },
          { name: "Manipulación", value: 1, type: "Sociales" },
          { name: "Apariencia", value: 1, type: "Sociales" },
          { name: "Percepción", value: 1, type: "Mentales" },
          { name: "Inteligencia", value: 1, type: "Mentales" },
          { name: "Astucia", value: 1, type: "Mentales" },
        ],
      },
      {
        name: "Habilidades",
        fields: [
          /* Talentos */
          { name: "Alerta", value: 0, type: "Talentos" },
          { name: "Atletismo", value: 0, type: "Talentos" },
          { name: "Callejeo", value: 0, type: "Talentos" },
          { name: "Consciencia", value: 0, type: "Talentos" },
          { name: "Empatía", value: 0, type: "Talentos" },
          { name: "Expresión", value: 0, type: "Talentos" },
          { name: "Intimidación", value: 0, type: "Talentos" },
          { name: "Liderazgo", value: 0, type: "Talentos" },
          { name: "Pelea", value: 0, type: "Talentos" },
          { name: "Subterfugio", value: 0, type: "Talentos" },
          /* Técnicas */
          { name: "Armas de Fuego", value: 0, type: "Técnicas" },
          { name: "Artesanía", value: 0, type: "Técnicas" },
          { name: "Conducir", value: 0, type: "Técnicas" },
          { name: "Etiqueta", value: 0, type: "Técnicas" },
          { name: "Interpretación", value: 0, type: "Técnicas" },
          { name: "Latrocinio", value: 0, type: "Técnicas" },
          { name: "Pelea con Armas", value: 0, type: "Técnicas" },
          { name: "Sigilo", value: 0, type: "Técnicas" },
          { name: "Supervivencia", value: 0, type: "Técnicas" },
          { name: "Trato con Animales", value: 0, type: "Técnicas" },
          /* Conocimientos */
          { name: "Academicismo", value: 0, type: "Conocimientos" },
          { name: "Ciencias", value: 0, type: "Conocimientos" },
          { name: "Finanzas", value: 0, type: "Conocimientos" },
          { name: "Informática", value: 0, type: "Conocimientos" },
          { name: "Investigación", value: 0, type: "Conocimientos" },
          { name: "Leyes", value: 0, type: "Conocimientos" },
          { name: "Medicina", value: 0, type: "Conocimientos" },
          { name: "Ocultismo", value: 0, type: "Conocimientos" },
          { name: "Política", value: 0, type: "Conocimientos" },
          { name: "Tecnología", value: 0, type: "Conocimientos" },
        ],
      },
      {
        name: "Otros",
        fields: [
          { name: "Salud máxima", value: 7, type: "Rasgos" },
          { name: "Fuerza de Voluntad", value: 5, type: "Rasgos" },
          { name: "Vitae", value: 0, type: "Rasgos", display: "blood-track" },
        ],
      },
    ];
  }

  /* ── Vínculo de Sangre Rendering ── */

  function renderVinculoDots(level, options) {
    var inline = Boolean(options?.inline);
    var dotClass = inline ? "contacto-vinculo-dot-inline" : "contacto-vinculo-rating-dot";
    var filledClass = inline ? "contacto-vinculo-dot-inline--filled" : "contacto-vinculo-rating-dot--filled";
    var wrapClass = inline ? "contacto-vinculo-inline" : "contacto-vinculo-rating";
    var dots = "";
    for (var i = 1; i <= 3; i++) {
      var filled = i <= level ? " " + filledClass : "";
      dots += '<span class="' + dotClass + filled + '"></span>';
    }
    return '<span class="' + wrapClass + '" title="Vínculo de Sangre: ' + escapeHtml(VINCULO_LABELS[level || 0] || "Ninguno") + '">' + dots + '</span>';
  }

  /* ── Stat Sheet Rendering ── */

  function renderStatRow(col, f, group, editable, isDynamic, renderOptions) {
    /* Blood track (Vitae) — renders as row of squares, always interactive */
    if (f.display === "blood-track") {
      renderBloodTrack(col, f, editable, renderOptions);
      return;
    }

    var row = document.createElement("div");
    row.className = "ct-stat-row";

    if (isDynamic && editable) {
      /* Editable name input for disciplines */
      var nameInput = document.createElement("input");
      nameInput.type = "text";
      nameInput.className = "ct-discipline-name";
      nameInput.value = f.name;
      nameInput.placeholder = "Disciplina";
      nameInput.addEventListener("change", function () {
        f.name = nameInput.value.trim();
      });
      row.appendChild(nameInput);
    } else {
      var labelSpan = document.createElement("span");
      labelSpan.className = "stat-label";
      labelSpan.textContent = f.name;
      row.appendChild(labelSpan);
    }

    var valSpan = document.createElement("span");
    valSpan.className = "stat-val" + (editable ? " stat-val--editable" : "");
    valSpan.textContent = f.value;

    if (editable) {
      valSpan.addEventListener("click", (function (field, span) {
        return function (e) {
          e.stopPropagation();
          var currentVal = parseInt(span.textContent, 10) || 0;
          if (global.AE_Picker) {
            global.AE_Picker.open(span, currentVal, function (newVal) {
              span.textContent = newVal;
              field.value = newVal;
            });
          }
        };
      })(f, valSpan));
    }

    row.appendChild(valSpan);
    col.appendChild(row);
  }

  function renderBloodTrack(col, field, editable, options) {
    var MAX_SQUARES = 10;
    var wrap = document.createElement("div");
    wrap.className = "ct-blood-track-wrap";

    var label = document.createElement("span");
    label.className = "stat-label";
    label.textContent = field.name;
    wrap.appendChild(label);

    var track = document.createElement("div");
    track.className = "ct-blood-track";

    function renderSquares() {
      track.innerHTML = "";
      for (var i = 1; i <= MAX_SQUARES; i++) {
        var sq = document.createElement("span");
        sq.className = "ct-blood-square" + (i <= field.value ? " ct-blood-square--filled" : "");
        sq.dataset.idx = i;
        sq.addEventListener("click", (function (idx) {
          return function () {
            field.value = (field.value === idx) ? idx - 1 : idx;
            renderSquares();
            /* Persist immediately from viewer */
            if (!editable && typeof options?.onVitaeChange === "function") {
              options.onVitaeChange(field.value);
            }
          };
        })(i));
        track.appendChild(sq);
      }
    }

    renderSquares();
    wrap.appendChild(track);
    col.appendChild(wrap);
  }

  function appendDisciplineEmptyRow(col, group) {
    var row = document.createElement("div");
    row.className = "ct-stat-row ct-discipline-new-row";

    var nameInput = document.createElement("input");
    nameInput.type = "text";
    nameInput.className = "ct-discipline-name";
    nameInput.placeholder = "Nueva disciplina...";

    var valSpan = document.createElement("span");
    valSpan.className = "stat-val stat-val--editable";
    valSpan.textContent = "0";

    nameInput.addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        commitNewDiscipline(nameInput, valSpan, col, group);
      }
    });
    nameInput.addEventListener("blur", function () {
      commitNewDiscipline(nameInput, valSpan, col, group);
    });

    row.appendChild(nameInput);
    row.appendChild(valSpan);
    col.appendChild(row);
  }

  function commitNewDiscipline(nameInput, valSpan, col, group) {
    var name = nameInput.value.trim();
    if (!name) return;

    var value = parseInt(valSpan.textContent, 10) || 0;
    var newField = { name: name, value: value, type: "Disciplinas" };
    group.fields.push(newField);

    /* Replace the empty row with a real editable row */
    var emptyRow = nameInput.closest(".ct-discipline-new-row");
    if (emptyRow) {
      emptyRow.remove();
    }
    renderStatRow(col, newField, group, true, true, null);

    /* Add a new empty row */
    appendDisciplineEmptyRow(col, group);
  }

  function renderStatGroups(groups, options) {
    var editable = Boolean(options?.editable);
    var renderOptions = { onVitaeChange: options?.onVitaeChange || null };
    var container = document.createElement("div");
    container.className = "ct-stats-section";

    var groupsList = Array.isArray(groups) && groups.length ? groups : getDefaultStats();

    /* Ensure special fields exist and have display hints */
    groupsList.forEach(function (g) {
      if (g.name === "Otros") {
        var hasVitae = g.fields.some(function (f) { return f.name === "Vitae"; });
        if (!hasVitae) {
          g.fields.push({ name: "Vitae", value: 0, type: "Rasgos", display: "blood-track" });
        }
      }
      g.fields.forEach(function (f) {
        if (f.name === "Vitae" && !f.display) f.display = "blood-track";
      });
    });

    groupsList.forEach(function (group) {
      var fieldset = document.createElement("fieldset");
      fieldset.className = "ct-stat-fieldset";

      var legend = document.createElement("legend");
      legend.textContent = group.name;
      fieldset.appendChild(legend);

      /* In viewer mode, only show fields with value > 0 (but always show blood-track) */
      var visibleFields = editable
        ? group.fields
        : group.fields.filter(function (f) { return f.value > 0 || f.display === "blood-track"; });

      if (!editable && !visibleFields.length) return;

      var byType = {};
      visibleFields.forEach(function (f) {
        if (!byType[f.type]) byType[f.type] = [];
        byType[f.type].push(f);
      });

      /* Ensure Disciplinas column exists in "Otros" group */
      if (editable && group.name === "Otros" && !byType["Disciplinas"]) {
        byType["Disciplinas"] = [];
      }

      var typeCount = Object.keys(byType).length;
      var grid = document.createElement("div");
      grid.className = typeCount <= 2 ? "ct-stat-grid-2col" : "ct-stat-grid-3col";

      Object.entries(byType).forEach(function (entry) {
        var typeName = entry[0];
        var fields = entry[1];
        var isDynamic = (typeName === "Disciplinas");
        var col = document.createElement("div");
        col.className = "ct-stat-col";

        var subTitle = document.createElement("h4");
        subTitle.textContent = typeName;
        col.appendChild(subTitle);

        fields.forEach(function (f) {
          renderStatRow(col, f, group, editable, isDynamic, renderOptions);
        });

        /* Add empty row for new discipline entry */
        if (isDynamic && editable) {
          appendDisciplineEmptyRow(col, group);
        }

        grid.appendChild(col);
      });

      fieldset.appendChild(grid);
      container.appendChild(fieldset);
    });

    return container;
  }

  /* ── Form Markup ── */

  function getOwnerCharacterName() {
    /* Inside the character sheet iframe, #nombre has the PC name */
    var el = document.getElementById("nombre");
    if (el?.value) return el.value.trim();
    return "";
  }

  function buildVinculoDotsMarkup(level) {
    var dots = "";
    for (var i = 1; i <= 3; i++) {
      var filled = i <= level ? " contacto-vinculo-rating-dot--filled" : "";
      dots += '<span class="contacto-vinculo-rating-dot' + filled + '" data-vinculo-value="' + i + '"></span>';
    }
    var label = VINCULO_LABELS[level] || "Ninguno";
    return '<div class="contacto-vinculo-row">' +
      '<div class="contacto-vinculo-rating" id="shared-contact-form-vinculo-dots">' + dots + '</div>' +
      '<span class="contacto-vinculo-level-label" id="shared-contact-form-vinculo-label">' + escapeHtml(label) + '</span>' +
    '</div>';
  }

  function bindVinculoDots(formState) {
    var container = document.getElementById("shared-contact-form-vinculo-dots");
    var labelEl = document.getElementById("shared-contact-form-vinculo-label");
    if (!container) return;

    var dots = container.querySelectorAll(".contacto-vinculo-rating-dot");
    dots.forEach(function (dot) {
      dot.addEventListener("click", function () {
        var clickedValue = parseInt(dot.dataset.vinculoValue, 10) || 0;
        /* Toggle off if clicking the current level */
        if (formState.vinculoSangre === clickedValue) {
          formState.vinculoSangre = 0;
        } else {
          formState.vinculoSangre = clickedValue;
        }
        /* Update dot visuals */
        dots.forEach(function (d) {
          var v = parseInt(d.dataset.vinculoValue, 10) || 0;
          d.classList.toggle("contacto-vinculo-rating-dot--filled", v <= formState.vinculoSangre && formState.vinculoSangre > 0);
        });
        /* Update label */
        if (labelEl) {
          labelEl.textContent = VINCULO_LABELS[formState.vinculoSangre] || "Ninguno";
        }
      });
    });
  }

  function buildFormMarkup(options) {
    var contact = options?.contact || {};
    var useSharedTagEditor = Boolean(options?.useSharedTagEditor);

    var name = contact.name || "";
    var avatarUrl = contact.avatarUrl || "";
    var contactType = contact.contactType || "mortal";
    var vinculoSangre = contact.vinculoSangre || 0;
    var domitor = contact.domitor != null ? contact.domitor : (options?.defaultDomitor || "");
    var tags = Array.isArray(contact.tags) ? contact.tags.join(", ") : "";
    var description = contact.description || "";

    var typeOptions = Object.entries(CONTACT_TYPE_LABELS)
      .map(function (entry) {
        var value = entry[0];
        var label = entry[1];
        var selected = value === contactType ? " selected" : "";
        return '<option value="' + value + '"' + selected + '>' + escapeHtml(label) + '</option>';
      })
      .join("");

    return '' +
      '<div class="doc-form-wrap">' +
        '<div class="doc-form-group">' +
          '<label class="doc-form-label" for="shared-contact-form-name">Nombre</label>' +
          '<input type="text" id="shared-contact-form-name" class="doc-form-input" maxlength="120" placeholder="Ej: Marco Salvatierra" value="' + escapeHtml(name) + '">' +
        '</div>' +
        '<div class="doc-form-group">' +
          '<label class="doc-form-label" for="shared-contact-form-avatar">Imagen <span class="doc-form-hint">(click derecho → Copiar dirección de imagen · <a href="https://imgur.com/upload" target="_blank" rel="noopener" class="doc-form-link">subir a imgur</a>)</span></label>' +
          '<div class="contacto-avatar-input-row">' +
            '<input type="url" id="shared-contact-form-avatar" class="doc-form-input" placeholder="https://i.imgur.com/..." value="' + escapeHtml(avatarUrl) + '">' +
            '<div class="contacto-avatar-cropper" id="shared-contact-form-avatar-cropper">' +
              '<div class="contacto-avatar-cropper-hint" id="shared-contact-form-avatar-hint">Arrastrá para posicionar, scroll para zoom</div>' +
            '</div>' +
          '</div>' +
        '</div>' +
        '<div class="doc-form-row doc-form-row--3col">' +
          '<div class="doc-form-group">' +
            '<label class="doc-form-label" for="shared-contact-form-type">Tipo</label>' +
            '<select id="shared-contact-form-type" class="doc-form-input">' + typeOptions + '</select>' +
          '</div>' +
          '<div class="doc-form-group">' +
            '<label class="doc-form-label">Vínculo</label>' +
            buildVinculoDotsMarkup(vinculoSangre) +
          '</div>' +
          '<div class="doc-form-group">' +
            '<label class="doc-form-label" for="shared-contact-form-domitor">Domitor</label>' +
            '<input type="text" id="shared-contact-form-domitor" class="doc-form-input" maxlength="120" placeholder="Domitor" value="' + escapeHtml(domitor) + '">' +
          '</div>' +
        '</div>' +
        '<div class="doc-form-group">' +
          '<label class="doc-form-label"' + (useSharedTagEditor ? '' : ' for="shared-contact-form-tags"') + '>Etiquetas' + (useSharedTagEditor ? '' : ' <span class="doc-form-hint">(separadas por coma)</span>') + '</label>' +
          (useSharedTagEditor
            ? '<div id="shared-contact-form-tags-container" class="doc-form-tag-editor"></div>'
            : '<input type="text" id="shared-contact-form-tags" class="doc-form-input" placeholder="Ej: aliado, elíseo" value="' + escapeHtml(tags) + '">') +
        '</div>' +
        '<div class="doc-form-group">' +
          '<label class="doc-form-label" for="shared-contact-form-description">Descripción <span class="doc-form-hint">(soporta Markdown)</span></label>' +
          '<textarea id="shared-contact-form-description" class="doc-form-textarea contacto-form-description" placeholder="Describe al contacto...">' + escapeHtml(description) + '</textarea>' +
        '</div>' +
        '<div id="shared-contact-form-stats"></div>' +
      '</div>';
  }

  /* ── Persistence ── */

  async function persistCharacterContact(payload, persistence) {
    var supabase = persistence?.supabase || null;
    var chronicleId = persistence?.chronicleId || null;
    var characterSheetId = persistence?.characterSheetId || null;
    var playerId = persistence?.playerId || null;
    var errorPrefix = String(persistence?.errorMessagePrefix || "No se pudo guardar el contacto");

    if (!supabase || !chronicleId || !characterSheetId || !playerId) {
      return { ok: false, message: "Falta configuración de persistencia para guardar el contacto." };
    }

    var nextContactId = payload.contactId || null;
    var error = null;

    if (payload.contactId) {
      ({ error } = await supabase
        .from("character_contacts")
        .update({
          name: payload.name,
          avatar_url: payload.avatarUrl || null,
          description: payload.description,
          contact_type: payload.contactType,
          vinculo_sangre: payload.vinculoSangre,
          domitor: payload.domitor,
          stats: payload.stats,
          tags: payload.tags,
          updated_at: new Date().toISOString(),
        })
        .eq("id", payload.contactId)
        .eq("character_sheet_id", characterSheetId)
        .eq("player_id", playerId));
    } else {
      /* Insert without .select() to avoid RLS SELECT check in same transaction */
      var insertResult = await supabase
        .from("character_contacts")
        .insert({
          chronicle_id: chronicleId,
          character_sheet_id: characterSheetId,
          player_id: playerId,
          name: payload.name,
          avatar_url: payload.avatarUrl || null,
          description: payload.description,
          contact_type: payload.contactType,
          vinculo_sangre: payload.vinculoSangre,
          domitor: payload.domitor,
          stats: payload.stats,
          tags: payload.tags,
          is_archived: false,
        });
      error = insertResult.error;
      if (!error) {
        /* Fetch the newly created contact id */
        var fetchResult = await supabase
          .from("character_contacts")
          .select("id")
          .eq("chronicle_id", chronicleId)
          .eq("character_sheet_id", characterSheetId)
          .eq("player_id", playerId)
          .eq("name", payload.name)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        nextContactId = fetchResult.data?.id || null;
      }
    }

    if (error) {
      return { ok: false, message: errorPrefix + ": " + error.message };
    }

    return { ok: true, contactId: nextContactId };
  }

  /* ── Viewer ── */

  function openViewer(options) {
    var ds = documentScreen();
    var contact = options?.contact || null;
    if (!ds || !contact) return null;

    var actions = [];

    /* Favorite action */
    var favActionPatch = function (fav) {
      return {
        variant: "ghost",
        icon: "star",
        title: fav ? "Quitar de favoritos" : "Marcar como favorito",
        ariaLabel: fav ? "Quitar de favoritos" : "Marcar como favorito",
        className: fav ? "objeto-fav-action--active" : "",
      };
    };

    if (typeof options.onToggleFavorite === "function") {
      actions.push({
        id: "favorite",
        kind: "icon",
        ...favActionPatch(Boolean(contact.favorite)),
        onClick: async function (screenApi) {
          var nextFav = !Boolean(contact.favorite);
          var ok = await options.onToggleFavorite(contact, nextFav);
          if (ok === false) return;
          contact.favorite = nextFav;
          screenApi?.updateAction?.("favorite", favActionPatch(contact.favorite));
        },
      });
    }

    /* Edit action */
    if (typeof options.onEdit === "function") {
      actions.push({
        id: "edit",
        kind: "icon",
        icon: "pencil",
        title: "Editar",
        ariaLabel: "Editar",
        onClick: function () { options.onEdit(contact); },
      });
    }

    /* Delete action */
    if (typeof options.onDelete === "function") {
      actions.push({
        id: "delete",
        kind: "icon",
        icon: "trash-2",
        title: "Eliminar",
        ariaLabel: "Eliminar",
        danger: true,
        onClick: function () { void options.onDelete(contact); },
      });
    }

    var screenApi = ds.open({
      docType: "contacto",
      title: String(options.title || contact.name || "Contacto"),
      subtitle: " ",
      tags: [],
      actions: actions,
      bodyClass: "doc-view-body",
      renderBody: function (body) {
        var card = document.createElement("article");
        card.className = "doc-view-card";

        /* Tags */
        var tags = Array.isArray(contact.tags) ? contact.tags : [];
        var tagsHtml = tags.length
          ? '<div class="ds-tags contacto-body-tags">' + tags.map(function (t) {
              return '<span class="ds-tag">' + escapeHtml(t) + '</span>';
            }).join("") + '</div>'
          : '';

        /* Description */
        var descriptionHtml = contact.description
          ? '<div class="doc-markdown">' + renderMarkdown(contact.description) + '</div>'
          : '<p class="muted">Sin descripción.</p>';

        card.innerHTML = tagsHtml + descriptionHtml;
        body.appendChild(card);

        /* Stats section — Vitae is always interactive */
        var groups = Array.isArray(contact.stats?.groups) ? contact.stats.groups : null;
        if (groups && groups.length) {
          body.appendChild(renderStatGroups(groups, {
            editable: false,
            onVitaeChange: function (newValue) {
              /* Persist vitae change directly to DB */
              var supabase = global.supabase;
              if (!supabase || !contact.id) return;
              /* Update the field in the local stats */
              var updatedStats = contact.stats;
              supabase
                .from("character_contacts")
                .update({ stats: updatedStats, updated_at: new Date().toISOString() })
                .eq("id", contact.id)
                .then(function (res) {
                  if (res.error) console.error("Vitae save error:", res.error);
                });
            },
          }));
        }
      },
      onClosed: function () {
        /* Remove injected avatar from header */
        var leftover = document.querySelector(".contacto-header-avatar");
        if (leftover) leftover.remove();
        if (typeof options.onClosed === "function") options.onClosed(contact);
      },
    });

    /* Inject avatar circle into header, left of title */
    var staleAvatar = document.querySelector(".contacto-header-avatar");
    if (staleAvatar) staleAvatar.remove();

    var hasAvatar = Boolean(contact.avatarUrl);
    var headerEl = document.querySelector(".ds-overlay[data-doc-type='contacto'] .ds-header");
    if (hasAvatar && headerEl) {
      var avatarPos = getAvatarPosition(contact.stats);
      var avatarEl = document.createElement("div");
      avatarEl.className = "contacto-header-avatar";
      avatarEl.style.cssText = avatarCircleStyle(contact.avatarUrl, avatarPos);
      avatarEl.setAttribute("role", "button");
      avatarEl.setAttribute("tabindex", "0");
      avatarEl.setAttribute("aria-label", "Ver imagen completa");
      avatarEl.addEventListener("click", function () {
        openLightbox(contact.avatarUrl, contact.name);
      });
      headerEl.insertBefore(avatarEl, headerEl.firstChild);
    }

    /* Build rich subtitle with inline vínculo dots via innerHTML */
    var subtitleEl = document.getElementById("ds-subtitle");
    if (subtitleEl) {
      var parts = [escapeHtml(getContactTypeLabel(contact.contactType))];
      parts.push("Vínculo de Sangre: " + renderVinculoDots(contact.vinculoSangre, { inline: true }));
      if (contact.domitor) {
        parts.push("Domitor: " + escapeHtml(contact.domitor));
      }
      subtitleEl.innerHTML = parts.filter(Boolean).join(" &nbsp;·&nbsp; ");
      subtitleEl.classList.remove("hidden");
    }

    return screenApi;
  }

  /* ── Form ── */

  function openForm(options) {
    var ds = documentScreen();
    if (!ds) return null;

    var contact = options?.contact || null;
    var title = String(options?.title || (contact ? "Editar Contacto" : "Nuevo Contacto"));
    var tagsLowercase = true;
    var hasSharedTagEditor = Boolean(tagSystem()?.renderEditor);
    var defaultDomitor = contact ? "" : getOwnerCharacterName();
    var formState = {
      tags: parseTags(Array.isArray(contact?.tags) ? contact.tags : [], { lowercase: tagsLowercase }),
      tagComposerOpen: false,
      vinculoSangre: contact?.vinculoSangre || 0,
      avatarPosition: contact?.stats?.avatarPosition || { x: 50, y: 50, scale: 1 },
      statsGroups: contact?.stats?.groups
        ? JSON.parse(JSON.stringify(contact.stats.groups))
        : getDefaultStats(),
    };

    var api = null;
    var saving = false;

    function syncSaveAction() {
      api?.updateFooterAction("save", {
        label: saving ? "Guardando..." : "Guardar",
        disabled: saving,
      });
      api?.updateFooterAction("cancel", {
        disabled: saving,
      });
    }

    function renderTagsEditor() {
      var sharedTags = tagSystem();
      var container = document.getElementById("shared-contact-form-tags-container");
      if (!sharedTags?.renderEditor || !container) return;

      sharedTags.renderEditor({
        container: container,
        tags: formState.tags,
        composerOpen: formState.tagComposerOpen,
        editable: true,
        displayMode: "title",
        placeholder: "Nuevo tag",
        onComposerToggle: function (isOpen) {
          formState.tagComposerOpen = isOpen;
          renderTagsEditor();
        },
        onChange: function (nextTags) {
          formState.tags = parseTags(nextTags, { lowercase: tagsLowercase });
          formState.tagComposerOpen = false;
          renderTagsEditor();
        },
      });
    }

    function collectStats() {
      return { groups: formState.statsGroups, avatarPosition: formState.avatarPosition };
    }

    async function persistForm() {
      if (saving) return;

      var nextName = (document.getElementById("shared-contact-form-name")?.value || "").trim();
      var avatarUrl = (document.getElementById("shared-contact-form-avatar")?.value || "").trim();
      var contactType = document.getElementById("shared-contact-form-type")?.value || "mortal";
      var domitor = (document.getElementById("shared-contact-form-domitor")?.value || "").trim();
      var tagsRaw = document.getElementById("shared-contact-form-tags")?.value || "";
      var description = (document.getElementById("shared-contact-form-description")?.value || "").trim();

      if (!nextName) {
        global.alert("El nombre es obligatorio.");
        return;
      }

      var payload = {
        contactId: contact?.id || null,
        name: nextName,
        avatarUrl: avatarUrl,
        description: description,
        contactType: contactType,
        vinculoSangre: formState.vinculoSangre,
        domitor: domitor,
        stats: collectStats(),
        tags: hasSharedTagEditor
          ? parseTags(formState.tags, { lowercase: tagsLowercase })
          : parseTags(tagsRaw, { lowercase: tagsLowercase }),
      };

      saving = true;
      syncSaveAction();

      var result;
      try {
        if (typeof options?.onSave === "function") {
          result = await options.onSave(payload);
        } else if (options?.persistence?.type === "character-contact") {
          result = await persistCharacterContact(payload, options.persistence);
        } else {
          result = { ok: false, message: "No hay manejador para guardar el contacto." };
        }
      } catch (error) {
        result = { ok: false, message: error?.message || "No se pudo guardar el contacto." };
      }

      saving = false;
      syncSaveAction();

      if (!result?.ok) {
        global.alert(result?.message || "No se pudo guardar el contacto.");
        return;
      }

      api?.close();
      if (typeof options?.onSaved === "function") {
        options.onSaved({
          contactId: result?.contactId ?? payload.contactId,
          created: !payload.contactId,
        });
      }
    }

    api = ds.open({
      docType: "contacto",
      title: title,
      footerActions: [
        {
          id: "cancel",
          kind: "button",
          variant: "ghost",
          label: "Cancelar",
          onClick: function () {
            if (saving) return;
            api?.close();
            if (typeof options?.onCancel === "function") {
              options.onCancel(contact);
            }
          },
        },
        {
          id: "save",
          kind: "button",
          variant: "primary",
          label: "Guardar",
          onClick: function () {
            void persistForm();
          },
        },
      ],
      bodyClass: "doc-form-body",
      renderBody: function (bodyHost) {
        bodyHost.innerHTML = buildFormMarkup({
          contact: contact,
          useSharedTagEditor: hasSharedTagEditor,
          defaultDomitor: defaultDomitor,
        });
        renderTagsEditor();

        /* Bind vínculo de sangre dots */
        bindVinculoDots(formState);

        /* Bind avatar cropper */
        var avatarInput = document.getElementById("shared-contact-form-avatar");
        var cropperEl = document.getElementById("shared-contact-form-avatar-cropper");
        var hintEl = document.getElementById("shared-contact-form-avatar-hint");
        if (avatarInput && cropperEl) {
          function loadCropper(url) {
            if (!url || !/^https?:\/\/.+/i.test(url)) {
              cropperEl.style.backgroundImage = "";
              cropperEl.classList.remove("contacto-avatar-cropper--active");
              if (hintEl) hintEl.style.display = "";
              return;
            }
            var img = new Image();
            img.onload = function () {
              cropperEl.style.backgroundImage = "url(" + url + ")";
              cropperEl.classList.add("contacto-avatar-cropper--active");
              if (hintEl) hintEl.style.display = "none";
              applyCropPosition();
            };
            img.onerror = function () {
              cropperEl.style.backgroundImage = "";
              cropperEl.classList.remove("contacto-avatar-cropper--active");
              if (hintEl) { hintEl.textContent = "No se pudo cargar la imagen"; hintEl.style.display = ""; }
            };
            img.src = url;
          }

          function applyCropPosition() {
            var pos = formState.avatarPosition;
            cropperEl.style.backgroundPosition = pos.x + "% " + pos.y + "%";
            cropperEl.style.backgroundSize = (pos.scale * 100) + "%";
          }

          /* Drag to position */
          var dragging = false;
          var dragStart = { x: 0, y: 0, posX: 0, posY: 0 };
          cropperEl.addEventListener("mousedown", function (e) {
            if (!cropperEl.classList.contains("contacto-avatar-cropper--active")) return;
            e.preventDefault();
            dragging = true;
            dragStart.x = e.clientX;
            dragStart.y = e.clientY;
            dragStart.posX = formState.avatarPosition.x;
            dragStart.posY = formState.avatarPosition.y;
          });
          document.addEventListener("mousemove", function (e) {
            if (!dragging) return;
            var dx = (e.clientX - dragStart.x) / cropperEl.offsetWidth * -100;
            var dy = (e.clientY - dragStart.y) / cropperEl.offsetHeight * -100;
            formState.avatarPosition.x = Math.max(0, Math.min(100, dragStart.posX + dx));
            formState.avatarPosition.y = Math.max(0, Math.min(100, dragStart.posY + dy));
            applyCropPosition();
          });
          document.addEventListener("mouseup", function () { dragging = false; });

          /* Scroll to zoom */
          cropperEl.addEventListener("wheel", function (e) {
            if (!cropperEl.classList.contains("contacto-avatar-cropper--active")) return;
            e.preventDefault();
            var delta = e.deltaY > 0 ? -0.1 : 0.1;
            formState.avatarPosition.scale = Math.max(1, Math.min(3, formState.avatarPosition.scale + delta));
            applyCropPosition();
          }, { passive: false });

          avatarInput.addEventListener("input", function () {
            loadCropper(avatarInput.value.trim());
          });

          /* Init if already has URL */
          if (avatarInput.value.trim()) loadCropper(avatarInput.value.trim());
        }

        /* Render stats editor */
        var statsHost = document.getElementById("shared-contact-form-stats");
        if (statsHost) {
          statsHost.appendChild(renderStatGroups(formState.statsGroups, { editable: true }));
        }
      },
    });

    document.getElementById("shared-contact-form-name")?.focus();
    return api;
  }

  /* ── Show For Player (fetch + open viewer) ── */

  async function showForPlayer(opts) {
    var contactId = opts?.contactId;
    var characterSheetId = opts?.characterSheetId;
    var onSaved = opts?.onSaved;
    var onClosed = opts?.onClosed;

    if (!contactId) return;

    var supabase = global.supabase;
    if (!supabase) return;

    var res = await supabase
      .from("character_contacts")
      .select("*")
      .eq("id", contactId)
      .maybeSingle();

    if (res.error || !res.data) {
      await (root.modal?.alert?.(
        "No se pudo cargar el contacto.",
        { title: "Error" },
      ) || Promise.resolve());
      return;
    }

    var row = res.data;
    var contact = {
      id: row.id,
      name: row.name || "Sin nombre",
      avatarUrl: row.avatar_url || "",
      description: row.description || "",
      contactType: row.contact_type || "mortal",
      vinculoSangre: row.vinculo_sangre || 0,
      domitor: row.domitor || "",
      stats: row.stats || {},
      tags: Array.isArray(row.tags) ? row.tags : [],
      favorite: Boolean(row.is_favorite),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };

    var sheetId = characterSheetId || row.character_sheet_id;
    var chronicleId = row.chronicle_id;
    var playerId = row.player_id;

    openViewer({
      contact: contact,
      title: contact.name,
      onToggleFavorite: async function (_row, nextFav) {
        var result = await supabase
          .from("character_contacts")
          .update({ is_favorite: nextFav })
          .eq("id", contact.id);

        if (result.error) {
          global.alert("Error al actualizar favorito: " + result.error.message);
          return false;
        }
        contact.favorite = nextFav;
        if (typeof onSaved === "function") onSaved();
        return true;
      },
      onEdit: function () {
        openForm({
          contact: contact,
          title: "Editar Contacto",
          persistence: {
            type: "character-contact",
            supabase: supabase,
            chronicleId: chronicleId,
            characterSheetId: sheetId,
            playerId: playerId,
            errorMessagePrefix: "Error al guardar",
          },
          onSaved: async function (result) {
            if (typeof onSaved === "function") onSaved();
            if (result?.contactId) {
              showForPlayer({ contactId: result.contactId, characterSheetId: sheetId, onSaved: onSaved, onClosed: onClosed });
            }
          },
          onCancel: function (currentContact) {
            if (currentContact?.id) {
              showForPlayer({ contactId: currentContact.id, characterSheetId: sheetId, onSaved: onSaved, onClosed: onClosed });
            }
          },
        });
      },
      onDelete: async function () {
        var ok = await (root.modal?.confirm?.(
          "¿Eliminar este contacto? Esta acción no se puede deshacer.",
        ) ?? global.confirm("¿Eliminar este contacto? Esta acción no se puede deshacer."));
        if (!ok) return;

        var result = await supabase
          .from("character_contacts")
          .delete()
          .eq("id", contact.id);

        if (result.error) {
          global.alert("Error al eliminar: " + result.error.message);
          return;
        }
        documentScreen()?.close();
        if (typeof onSaved === "function") onSaved();
      },
      onClosed: function () {
        if (typeof onClosed === "function") onClosed(contact);
      },
    });
  }

  /* ── Public API ── */

  root.contactScreen = {
    openViewer: openViewer,
    openForm: openForm,
    showForPlayer: showForPlayer,
    parseTags: parseTags,
    getContactTypeLabel: getContactTypeLabel,
    renderVinculoDots: renderVinculoDots,
    CONTACT_TYPE_LABELS: CONTACT_TYPE_LABELS,
    VINCULO_LABELS: VINCULO_LABELS,
  };
})(window);
