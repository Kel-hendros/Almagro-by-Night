(function initAEInstanceModal(global) {
  var PC_ATTR_MAP = {
    physical: {
      "fuerza-value": "Fuerza",
      "destreza-value": "Destreza",
      "resistencia-value": "Resistencia",
    },
    social: {
      "carisma-value": "Carisma",
      "manipulacion-value": "Manipulación",
      "apariencia-value": "Apariencia",
    },
    mental: {
      "percepcion-value": "Percepción",
      "inteligencia-value": "Inteligencia",
      "astucia-value": "Astucia",
    },
  };

  var PC_ABILITY_MAP = {
    talents: {
      "alerta-value": "Alerta",
      "atletismo-value": "Atletismo",
      "callejeo-value": "Callejeo",
      "consciencia-value": "Consciencia",
      "empatia-value": "Empatía",
      "expresion-value": "Expresión",
      "intimidacion-value": "Intimidación",
      "liderazgo-value": "Liderazgo",
      "pelea-value": "Pelea",
      "subterfugio-value": "Subterfugio",
    },
    skills: {
      "tratoConAnimales-value": "Trato Animales",
      "conducir-value": "Conducir",
      "etiqueta-value": "Etiqueta",
      "armasDeFuego-value": "A. Fuego",
      "peleaConArmas-value": "Armas C.C.",
      "interpretacion-value": "Interprete",
      "latrocinio-value": "Latrocinio",
      "sigilo-value": "Sigilo",
      "supervivencia-value": "Supervivencia",
      "pericia-value": "Pericia",
    },
    knowledges: {
      "academicismo-value": "Académico",
      "ciencias-value": "Ciencias",
      "finanzas-value": "Finanzas",
      "informatica-value": "Informática",
      "investigacion-value": "Investiga.",
      "leyes-value": "Leyes",
      "medicina-value": "Medicina",
      "ocultismo-value": "Ocultismo",
      "politica-value": "Política",
      "tecnologia-value": "Tecnología",
    },
  };

  function createController(ctx) {
    var state = ctx.state;
    var els = ctx.els;
    var canEditEncounter = ctx.canEditEncounter;
    var ensureActiveInstance = ctx.ensureActiveInstance;
    var render = ctx.render;
    var saveDesignDraft = ctx.saveDesignDraft;
    var saveRuntimeState = ctx.saveRuntimeState;
    var isEditMode = ctx.isEditMode || function () { return false; };

    function saveRuntimeOrDraft() {
      if (isEditMode()) {
        saveDesignDraft();
        return;
      }
      saveRuntimeState();
    }

    function openModal(inst) {
      if (window.AE_Picker) window.AE_Picker.init();

      var dmgBtn = document.getElementById("btn-modal-dmg");
      var healBtn = document.getElementById("btn-modal-heal");
      var dmgInput = document.getElementById("ae-damage-amount");
      var healInput = document.getElementById("ae-heal-amount");
      [dmgBtn, healBtn, dmgInput, healInput].forEach(function (el) {
        if (el) el.disabled = !canEditEncounter();
      });

      if (inst.isPC) {
        renderPCModal(inst);
      } else {
        renderNPCModal(inst);
      }

      updateModalUI(inst);
      els.modal.style.display = "flex";
    }

    function renderNPCModal(inst) {
      state.selectedInstanceId = inst.id;
      els.modalTitle.innerHTML = "";
      var nameSpan = document.createElement("span");
      nameSpan.className = "ae-title-name";
      nameSpan.textContent = inst.name;
      nameSpan.style.cursor = "pointer";
      nameSpan.title = "Click para editar nombre";

      var codeSpan = document.createElement("span");
      codeSpan.className = "ae-title-code";
      codeSpan.textContent = " | " + inst.code;

      els.modalTitle.appendChild(nameSpan);
      els.modalTitle.appendChild(codeSpan);

      nameSpan.addEventListener("click", function () {
        if (!canEditEncounter()) return;
        var input = document.createElement("input");
        input.type = "text";
        input.value = inst.name;
        input.className = "ae-input";
        input.style.fontSize = "1.5rem";
        input.style.width = "auto";
        input.style.minWidth = "200px";
        input.style.color = "var(--color-red-accent)";
        input.style.background = "#111";
        input.style.border = "1px solid #444";
        input.style.display = "inline-block";

        var saveName = function () {
          var newName = input.value.trim();
          if (newName && newName !== inst.name) {
            inst.name = newName;
            nameSpan.textContent = newName;
            render();
            saveDesignDraft();
          }
          if (els.modalTitle.contains(input)) {
            els.modalTitle.replaceChild(nameSpan, input);
          }
        };

        input.addEventListener("blur", saveName);
        input.addEventListener("keydown", function (e) {
          if (e.key === "Enter") {
            input.blur();
          } else if (e.key === "Escape") {
            if (els.modalTitle.contains(input)) {
              els.modalTitle.replaceChild(nameSpan, input);
            }
          }
        });

        els.modalTitle.replaceChild(input, nameSpan);
        input.focus();
      });

      var healthControls = els.modal.querySelector(".ae-health-section");
      if (healthControls)
        healthControls.style.display = canEditEncounter() ? "block" : "none";

      if (els.modalNotes) {
        els.modalNotes.style.display = "block";
        els.modalNotes.textContent =
          inst.notes || (inst.data && inst.data.notes) || "Sin notas.";
      }
      els.modalStats.innerHTML = "";
      els.modalStats.className = "";

      if (els.modalNotes)
        els.modalNotes.textContent =
          inst.notes || (inst.data && inst.data.notes) || "Sin notas.";

      var groups = inst.groups
        ? inst.groups
        : window.TEMPLATE_DEFINITIONS.npc.groups;

      els.modalStats.appendChild(renderTokenSection(inst, els.modalStats));

      groups.forEach(function (group) {
        var fieldset = document.createElement("fieldset");
        fieldset.className = "ae-group-fieldset";

        var legend = document.createElement("legend");
        legend.textContent = group.name;
        fieldset.appendChild(legend);

        var grid = document.createElement("div");
        grid.className = "ae-stat-grid-3col";

        var byType = {};
        group.fields.forEach(function (f) {
          if (!byType[f.type]) byType[f.type] = [];
          byType[f.type].push(f);
        });

        Object.entries(byType).forEach(function (_ref) {
          var typeName = _ref[0], fields = _ref[1];
          var col = document.createElement("div");
          col.className = "ae-stat-col";

          var subTitle = document.createElement("h4");
          subTitle.textContent = typeName;
          col.appendChild(subTitle);

          fields.forEach(function (f) {
            var val = f.value;
            if (!inst.groups && inst.stats && inst.stats[f.name] !== undefined) {
              val = inst.stats[f.name];
            }

            var row = document.createElement("div");
            row.className = "ae-stat-row";

            var labelSpan = document.createElement("span");
            labelSpan.className = "stat-label";
            labelSpan.textContent = f.name;

            var valSpan = document.createElement("span");
            valSpan.className = "stat-val editable-stat";
            valSpan.textContent = val;
            valSpan.dataset.statName = f.name;

            valSpan.addEventListener("click", function (e) {
              if (!canEditEncounter()) return;
              e.stopPropagation();
              var currentInt = parseInt(valSpan.textContent) || 0;
              if (window.AE_Picker) {
                window.AE_Picker.open(valSpan, currentInt, function (newVal) {
                  valSpan.textContent = newVal;

                  if (inst.groups) {
                    var g = inst.groups.find(function (gr) { return gr.name === group.name; });
                    if (g) {
                      var field = g.fields.find(function (fi) { return fi.name === f.name; });
                      if (field) field.value = newVal;
                    }
                  }

                  if (!inst.stats) inst.stats = {};
                  inst.stats[f.name] = newVal;

                  if (f.name === "Salud máxima") {
                    inst.maxHealth = newVal;
                    if (inst.health > inst.maxHealth)
                      inst.health = inst.maxHealth;
                    updateModalUI(inst);
                    render();
                  }

                  saveDesignDraft();
                });
              }
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
    }

    function renderPCModal(inst) {
      state.selectedInstanceId = inst.id;
      var sheet = state.characterSheets.find(function (s) { return s.id === inst.characterSheetId; });
      if (!sheet) {
        els.modalStats.innerHTML = "<p>No se encontró la hoja de personaje.</p>";
        return;
      }

      var charData = sheet.data || {};
      var escapeHtml = window.escapeHtml || function (s) { return s; };
      var clanName = charData.clan ? ", del Clan " + escapeHtml(charData.clan) : "";
      els.modalTitle.innerHTML = '<span class="ae-title-name">' + escapeHtml(inst.name) + clanName + '</span> <span class="ae-pc-badge">PJ</span>';

      var healthControls = els.modal.querySelector(".ae-health-section");
      if (healthControls) healthControls.style.display = "none";

      els.modalStats.innerHTML = "";
      els.modalStats.className = "ae-pc-readonly-view";

      els.modalStats.appendChild(renderTokenSection(inst, els.modalStats));

      // Attributes
      var attrFieldset = document.createElement("fieldset");
      attrFieldset.className = "ae-group-fieldset";
      attrFieldset.innerHTML = "<legend>Atributos</legend>";
      var attrGrid = document.createElement("div");
      attrGrid.className = "ae-stat-grid-3col";

      var categories = [
        { name: "Físicos", map: PC_ATTR_MAP.physical, temp: true },
        { name: "Sociales", map: PC_ATTR_MAP.social },
        { name: "Mentales", map: PC_ATTR_MAP.mental },
      ];

      categories.forEach(function (cat) {
        var col = document.createElement("div");
        col.className = "ae-stat-col";
        col.innerHTML = "<h4>" + cat.name + "</h4>";

        Object.entries(cat.map).forEach(function (_ref) {
          var id = _ref[0], name = _ref[1];
          var val = parseInt(charData[id]) || 0;
          var tempHtml = "";
          if (cat.temp) {
            var tempId = "temp" + id.split("-")[0].charAt(0).toUpperCase() + id.split("-")[0].slice(1);
            var tempVal = parseInt(charData[tempId]) || 0;
            if (tempVal > 0) {
              tempHtml = '<span class="ae-stat-temp">+' + tempVal + '</span>';
            }
          }
          col.innerHTML += '<div class="ae-stat-row"><span class="stat-label">' + name + '</span><span class="stat-val">' + val + tempHtml + '</span></div>';
        });
        attrGrid.appendChild(col);
      });
      attrFieldset.appendChild(attrGrid);
      els.modalStats.appendChild(attrFieldset);

      // Abilities
      var abilFieldset = document.createElement("fieldset");
      abilFieldset.className = "ae-group-fieldset";
      abilFieldset.innerHTML = "<legend>Habilidades</legend>";
      var abilGrid = document.createElement("div");
      abilGrid.className = "ae-stat-grid-3col";

      var abilCats = [
        { name: "Talentos", map: PC_ABILITY_MAP.talents },
        { name: "Técnicas", map: PC_ABILITY_MAP.skills },
        { name: "Conocimientos", map: PC_ABILITY_MAP.knowledges },
      ];

      abilCats.forEach(function (cat) {
        var col = document.createElement("div");
        col.className = "ae-stat-col";
        col.innerHTML = "<h4>" + cat.name + "</h4>";

        Object.entries(cat.map).forEach(function (_ref) {
          var id = _ref[0], name = _ref[1];
          var val = parseInt(charData[id]) || 0;
          col.innerHTML += '<div class="ae-stat-row"><span class="stat-label">' + name + '</span><span class="stat-val">' + val + '</span></div>';
        });
        abilGrid.appendChild(col);
      });
      abilFieldset.appendChild(abilGrid);
      els.modalStats.appendChild(abilFieldset);

      // Other Stats: Humanity, Willpower, Health & Blood
      var otherFieldset = document.createElement("fieldset");
      otherFieldset.className = "ae-group-fieldset";
      otherFieldset.innerHTML = "<legend>Otros</legend>";
      var otherGrid = document.createElement("div");
      otherGrid.className = "ae-stat-grid-4col";

      // Humanity
      var humCol = document.createElement("div");
      humCol.className = "ae-stat-col";
      var humanityName = charData["humanidad"] || "Humanidad/Senda";
      var humanityVal = parseInt(charData["humanidad-value"]) || 0;
      humCol.innerHTML = '<h4>Senda</h4><div class="ae-stat-row"><span class="stat-label">' + humanityName + '</span><span class="stat-val">' + humanityVal + '</span></div>';
      otherGrid.appendChild(humCol);

      // Willpower
      var willCol = document.createElement("div");
      willCol.className = "ae-stat-col";
      var willPerm = parseInt(charData["voluntadPerm-value"]) || 0;
      var willTemp = parseInt(charData["voluntadTemp-value"]) || 0;
      willCol.innerHTML = '<h4>Voluntad</h4><div class="ae-stat-row"><span class="stat-label">Permanente</span><span class="stat-val">' + willPerm + '</span></div><div class="ae-stat-row"><span class="stat-label">Temporal</span><span class="stat-val">' + willTemp + '</span></div>';
      otherGrid.appendChild(willCol);

      // Blood Pool
      var bloodCol = document.createElement("div");
      bloodCol.className = "ae-stat-col";

      var getBloodMax = function (gen) {
        if (gen <= 6) return 30;
        if (gen <= 7) return 20;
        if (gen <= 8) return 15;
        if (gen <= 9) return 14;
        if (gen <= 10) return 13;
        if (gen <= 11) return 12;
        if (gen <= 12) return 11;
        return 10;
      };

      var gen = parseInt(charData["generacion"]) || 13;
      var maxBlood = getBloodMax(gen);
      var currentBloodStr = charData["blood-value"] || "";
      var currentBlood = currentBloodStr.replace(/0/g, "").length;
      var isLowBlood = currentBlood < 5;
      var bloodStyle = isLowBlood ? 'style="color: var(--color-red-accent);"' : "";

      bloodCol.innerHTML = '<h4>Sangre</h4><div class="ae-stat-row"><span class="stat-label">Actual / Max</span><span class="stat-val" ' + bloodStyle + '>' + currentBlood + ' / ' + maxBlood + '</span></div>' +
        (isLowBlood ? '<div style="font-size: 0.7em; color: var(--color-red-accent); margin-top: 4px; font-weight: bold;">¡RESERVA BAJA!</div>' : "");
      otherGrid.appendChild(bloodCol);

      // Health Squares inside modal
      var healthCol = document.createElement("div");
      healthCol.className = "ae-stat-col";
      var types = ["", "contundente", "letal", "agravado"];
      var boxes = (inst.pcHealth || [0, 0, 0, 0, 0, 0, 0])
        .map(function (val) { return '<span class="ae-health-sq ' + (types[val] || "") + '"></span>'; })
        .join("");

      var healthLevelNames = [
        "Magullado", "Lastimado", "Lesionado", "Herido",
        "Malherido", "Tullido", "Incapacitado",
      ];
      var movementPenalties = [
        "Sin penalización.", "Sin penalización.",
        "Velocidad al correr se divide a la mitad.",
        "No puede correr. Solo puede moverse o atacar.",
        "Solo puede cojear (3 metros por turno).",
        "Solo puede arrastrarse (1 metro por turno).",
        "Incapaz de moverse.",
      ];
      var currentLevelIndex = -1;
      var pcH = inst.pcHealth || [];
      for (var i = 0; i < pcH.length; i++) {
        if (pcH[i] > 0) currentLevelIndex = i;
      }
      var tooltip = "Salud: Sin daño";
      if (currentLevelIndex !== -1) {
        tooltip = healthLevelNames[currentLevelIndex] + ": " + movementPenalties[currentLevelIndex];
      }

      healthCol.innerHTML = '<h4>Salud</h4><div class="ae-pc-health-row" style="justify-content: flex-start;" title="' + tooltip + '">' + boxes + '</div><div style="font-size: 0.8em; color: #888; margin-top: 5px;">' + tooltip + '</div>';
      otherGrid.appendChild(healthCol);

      otherFieldset.appendChild(otherGrid);
      els.modalStats.appendChild(otherFieldset);

      if (els.modalNotes) {
        els.modalNotes.style.display = "none";
      }
    }

    function renderTokenSection(inst, container) {
      var token = state.encounter.data.tokens.find(function (t) { return t.instanceId === inst.id; });
      var isOnMap = !!token;

      var section = document.createElement("div");
      section.className = "ae-token-section";
      section.style.textAlign = "center";
      section.style.marginBottom = "16px";
      section.style.borderBottom = "1px solid rgba(255,255,255,0.1)";
      section.style.paddingBottom = "16px";

      var title = document.createElement("h4");
      title.textContent = "Token";
      title.style.color = "#aaa";
      title.style.textTransform = "uppercase";
      title.style.fontSize = "0.7rem";
      title.style.letterSpacing = "1px";
      title.style.marginBottom = "8px";
      section.appendChild(title);

      var previewContainer = document.createElement("div");
      previewContainer.className = "ae-token-preview " + (isOnMap ? "active" : "");
      previewContainer.style.width = "60px";
      previewContainer.style.height = "60px";
      previewContainer.style.borderRadius = "50%";
      previewContainer.style.margin = "0 auto";
      previewContainer.style.cursor = "pointer";
      previewContainer.style.position = "relative";
      previewContainer.style.overflow = "hidden";

      var borderColor = "#444";
      if (isOnMap) {
        borderColor = inst.isPC
          ? "var(--color-gold, #c5a059)"
          : "var(--color-selected-token, #ff9800)";
      }

      previewContainer.style.border = "2px solid " + borderColor;
      previewContainer.style.transition = "all 0.2s ease";

      var imgUrl = inst.avatarUrl || (inst.data && inst.data.avatarUrl);
      if (imgUrl) {
        var img = document.createElement("img");
        img.src = imgUrl;
        img.style.width = "100%";
        img.style.height = "100%";
        img.style.objectFit = "cover";
        previewContainer.appendChild(img);
      } else {
        var initials = document.createElement("div");
        initials.textContent = inst.name[0];
        initials.style.width = "100%";
        initials.style.height = "100%";
        initials.style.display = "flex";
        initials.style.alignItems = "center";
        initials.style.justifyContent = "center";
        initials.style.backgroundColor = "#333";
        initials.style.color = "#ccc";
        initials.style.fontSize = "1.5rem";
        initials.style.fontWeight = "bold";
        previewContainer.appendChild(initials);
      }

      if (!imgUrl) {
        var codeOverlay = document.createElement("div");
        codeOverlay.textContent = inst.code;
        codeOverlay.style.position = "absolute";
        codeOverlay.style.top = "50%";
        codeOverlay.style.left = "50%";
        codeOverlay.style.transform = "translate(-50%, -50%)";
        codeOverlay.style.color = "#fff";
        codeOverlay.style.fontWeight = "bold";
        codeOverlay.style.fontSize = "0.9rem";
        codeOverlay.style.textShadow = "0 0 3px #000";
        codeOverlay.style.background = "rgba(0,0,0,0.5)";
        codeOverlay.style.borderRadius = "50%";
        codeOverlay.style.width = "36px";
        codeOverlay.style.height = "36px";
        codeOverlay.style.display = "flex";
        codeOverlay.style.alignItems = "center";
        codeOverlay.style.justifyContent = "center";
        previewContainer.appendChild(codeOverlay);
      }

      section.appendChild(previewContainer);

      var statusText = document.createElement("div");
      statusText.textContent = isOnMap
        ? "En Mapa (Click para quitar)"
        : "Oculto (Click para agregar)";
      statusText.style.fontSize = "0.7rem";
      statusText.style.marginTop = "6px";
      statusText.style.color = isOnMap ? "#2ecc71" : "#888";
      section.appendChild(statusText);

      previewContainer.addEventListener("click", function () {
        if (!canEditEncounter()) return;
        if (isOnMap) {
          state.encounter.data.tokens = state.encounter.data.tokens.filter(function (t) { return t.instanceId !== inst.id; });
        } else {
          var x = 0, y = 0;
          if (state.map) {
            var canvasW = state.map.canvas.width;
            var canvasH = state.map.canvas.height;
            x = Math.round((-state.map.offsetX + canvasW / 2) / state.map.scale / 50);
            y = Math.round((-state.map.offsetY + canvasH / 2) / state.map.scale / 50);
          }
          state.encounter.data.tokens.push({
            id: crypto.randomUUID(),
            instanceId: inst.id,
            x: x, y: y, size: 1,
            imgUrl: imgUrl || null,
          });
        }

        saveDesignDraft();
        render();

        if (container.contains(section)) {
          var newSection = renderTokenSection(inst, container);
          container.replaceChild(newSection, section);
        }
      });

      return section;
    }

    function closeModal() {
      els.modal.style.display = "none";
      state.selectedInstanceId = null;
    }

    function updateModalUI(inst) {
      var hpPct = (inst.health / inst.maxHealth) * 100;
      var hpClass = "high";
      if (hpPct < 50) hpClass = "med";
      if (hpPct < 20) hpClass = "low";
      if (inst.health === 0) hpClass = "dead";

      els.modalHpFill.className = "ae-hp-fill " + hpClass;
      els.modalHpFill.style.width = hpPct + "%";
      els.modalHpText.textContent = inst.health + " / " + inst.maxHealth;
    }

    function handleModalAction(type) {
      if (!state.selectedInstanceId) return;
      handleAction(state.selectedInstanceId, type);
    }

    function handleAction(id, type) {
      if (!canEditEncounter()) return;
      var inst = state.encounter.data.instances.find(function (i) { return i.id === id; });
      if (!inst) return;

      if (type === "dmg") {
        var dmgEl = document.getElementById("ae-damage-amount");
        var amount = parseInt(dmgEl && dmgEl.value) || 1;
        inst.health = Math.max(0, inst.health - amount);
      } else if (type === "heal") {
        var healEl = document.getElementById("ae-heal-amount");
        var healAmount = parseInt(healEl && healEl.value) || 1;
        inst.health = Math.min(inst.maxHealth, inst.health + healAmount);
      }

      if (inst.health === 0 && inst.status !== "dead")
        inst.status = "incapacitated";
      else if (inst.health > 0 && inst.status === "incapacitated")
        inst.status = "active";

      ensureActiveInstance();
      render();
      if (state.selectedInstanceId === id) updateModalUI(inst);
      saveRuntimeOrDraft();
    }

    return {
      openModal: openModal,
      closeModal: closeModal,
      updateModalUI: updateModalUI,
      handleModalAction: handleModalAction,
      handleAction: handleAction,
    };
  }

  global.AEInstanceModal = {
    createController: createController,
    PC_ATTR_MAP: PC_ATTR_MAP,
    PC_ABILITY_MAP: PC_ABILITY_MAP,
  };
})(window);
