(function initAEInstanceManager(global) {
  function createController(ctx) {
    var state = ctx.state;
    var canEditEncounter = ctx.canEditEncounter;
    var removeInstanceLocal = ctx.removeInstanceLocal;
    var render = ctx.render;
    var saveDesignDraft = ctx.saveDesignDraft;
    var encounterTurns = ctx.encounterTurns;
    var extractPCHealth = ctx.extractPCHealth;

    var PC_ATTR_MAP = (global.AEInstanceModal && global.AEInstanceModal.PC_ATTR_MAP) || {};
    var PC_ABILITY_MAP = (global.AEInstanceModal && global.AEInstanceModal.PC_ABILITY_MAP) || {};

    function calculateInitiative(data) {
      return encounterTurns.calculateInitiative(data);
    }

    function findMaxCode(instances, baseLetter) {
      var maxNum = 0;
      var regex = new RegExp("^" + baseLetter + "(\\d+)$");
      instances.forEach(function (i) {
        var m = i.code.match(regex);
        if (m) {
          var n = parseInt(m[1]);
          if (n > maxNum) maxNum = n;
        }
      });
      return maxNum;
    }

    function buildPCGroups(charData) {
      var flatAttrMap = Object.assign({},
        PC_ATTR_MAP.physical, PC_ATTR_MAP.social, PC_ATTR_MAP.mental);
      var flatAbilityMap = Object.assign({},
        PC_ABILITY_MAP.talents, PC_ABILITY_MAP.skills, PC_ABILITY_MAP.knowledges);

      var attrFields = Object.entries(flatAttrMap).map(function (_ref) {
        var key = _ref[0], name = _ref[1];
        var def = window.TEMPLATE_DEFINITIONS.npc.groups[0].fields.find(function (f) { return f.name === name; });
        return { name: name, value: parseInt(charData[key]) || 1, type: def ? def.type : "Físicos" };
      });

      var skillFields = Object.entries(flatAbilityMap).map(function (_ref) {
        var key = _ref[0], name = _ref[1];
        var def = window.TEMPLATE_DEFINITIONS.npc.groups[1].fields.find(function (f) { return f.name === name; });
        return { name: name, value: parseInt(charData[key]) || 0, type: def ? def.type : "Talentos" };
      });

      var otherFields = [
        { name: "Salud máxima", value: 7, type: "Rasgos" },
        { name: "Fuerza de Voluntad", value: parseInt(charData["voluntadPerm-value"]) || 5, type: "Rasgos" },
      ];

      return [
        { name: "Atributos", fields: attrFields },
        { name: "Habilidades", fields: skillFields },
        { name: "Otros", fields: otherFields },
      ];
    }

    async function addNPC(tplId, count, options) {
      if (!canEditEncounter()) return;
      if (!tplId) return;
      count = count || 1;
      var opts = options || {};

      var tpl = state.templates.find(function (t) { return t.id === tplId; });
      if (!tpl) return;

      var d = state.encounter.data;
      var instances = d.instances;
      var tplData = tpl.data;

      var baseLetter = tpl.name[0].toUpperCase();
      var maxNum = findMaxCode(instances, baseLetter);

      for (var i = 0; i < count; i++) {
        maxNum++;
        var groups = JSON.parse(JSON.stringify(tplData.groups || []));
        var stats = {};
        groups.forEach(function (g) {
          g.fields.forEach(function (f) { stats[f.name] = f.value; });
        });

        var initVal = calculateInitiative({ groups: groups, stats: stats });
        var instanceId = crypto.randomUUID();

        var inst = {
          id: instanceId,
          templateId: tpl.id,
          name: tpl.name,
          code: baseLetter + maxNum,
          status: "active",
          initiative: initVal,
          groups: groups,
          stats: stats,
          notes: tplData.notes || "",
          health: tplData.maxHealth || 7,
          maxHealth: tplData.maxHealth || 7,
          isPC: false,
        };
        if (opts.hidden) inst.visible = false;
        instances.push(inst);

        var addTokenEl = document.getElementById("ae-add-token-check");
        var addToken = addTokenEl && addTokenEl.checked;

        if (addToken) {
          state.encounter.data.tokens.push({
            id: crypto.randomUUID(),
            instanceId: instanceId,
            x: Math.round(-state.map.offsetX / state.map.scale / 50) + 2,
            y: Math.round(-state.map.offsetY / state.map.scale / 50) + 2,
            size: 1,
            imgUrl: (tpl.driver && tpl.driver.avatarUrl) || (tpl.data && tpl.data.avatarUrl) || null,
          });
        }
      }

      render();
      saveDesignDraft();
    }

    async function addPC(sheetId) {
      if (!canEditEncounter()) return;
      if (!sheetId) return;

      var sheet = state.characterSheets.find(function (s) { return s.id === sheetId; });
      if (!sheet || !sheet.data) return;

      var d = state.encounter.data;
      var instances = d.instances;

      var alreadyAdded = instances.find(function (i) {
        return i.isPC && i.characterSheetId === sheetId;
      });
      if (alreadyAdded) {
        alert(sheet.name + " ya está en este encuentro.");
        return;
      }

      var charData = sheet.data;
      var pcName = charData.nombre || charData.name || sheet.name || "PJ Sin Nombre";

      var groups = buildPCGroups(charData);
      var stats = {};
      groups.forEach(function (g) {
        g.fields.forEach(function (f) { stats[f.name] = f.value; });
      });

      var baseLetter = pcName[0].toUpperCase();
      var maxNum = findMaxCode(instances, baseLetter) + 1;
      var initVal = calculateInitiative({ groups: groups, stats: stats });
      var maxHealth = 7;
      var instanceId = crypto.randomUUID();

      instances.push({
        id: instanceId,
        characterSheetId: sheetId,
        templateId: null,
        name: pcName,
        code: baseLetter + maxNum,
        status: "active",
        initiative: initVal,
        groups: groups,
        stats: stats,
        notes: charData.clan ? "Clan: " + charData.clan : "",
        health: maxHealth,
        maxHealth: maxHealth,
        pcHealth: extractPCHealth(charData),
        isPC: true,
        avatarUrl: sheet.avatar_url || null,
      });

      var addTokenEl = document.getElementById("ae-add-token-check");
      var addToken = addTokenEl && addTokenEl.checked;

      if (addToken) {
        state.encounter.data.tokens.push({
          id: crypto.randomUUID(),
          instanceId: instanceId,
          x: Math.round(-state.map.offsetX / state.map.scale / 50) + 3,
          y: Math.round(-state.map.offsetY / state.map.scale / 50) + 3,
          size: 1,
          imgUrl: sheet.avatar_url || null,
        });
      }

      render();
      saveDesignDraft();
    }

    function removeInstance(id) {
      if (!canEditEncounter()) return;
      var removed = removeInstanceLocal(id);
      if (!removed) return;
      render();
      saveDesignDraft();
    }

    return {
      addNPC: addNPC,
      addPC: addPC,
      removeInstance: removeInstance,
      buildPCGroups: buildPCGroups,
      findMaxCode: findMaxCode,
    };
  }

  global.AEInstanceManager = { createController: createController };
})(window);
