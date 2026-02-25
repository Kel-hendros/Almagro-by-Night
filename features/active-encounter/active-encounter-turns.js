(function initActiveEncounterTurnsModule(global) {
  function calculateInitiative(data) {
    let dex = 0;
    let wits = 0;

    if (data && data.groups && data.groups.length > 0) {
      const findVal = (name) => {
        for (const g of data.groups) {
          const f = g.fields.find((field) => field.name === name);
          if (f) return f.value;
        }
        return 0;
      };
      dex = parseInt(findVal("Destreza"), 10) || 0;
      wits = parseInt(findVal("Astucia"), 10) || 0;
    } else if (data && data.stats) {
      dex = parseInt(data.stats["Destreza"], 10) || 0;
      wits = parseInt(data.stats["Astucia"], 10) || 0;
    }

    return dex + wits + Math.ceil(Math.random() * 10);
  }

  function isInstanceDown(inst) {
    if (!inst) return false;

    if (
      inst.status === "dead" ||
      inst.status === "incapacitated" ||
      (parseInt(inst.health, 10) || 0) <= 0
    ) {
      return true;
    }

    if (inst.isPC && Array.isArray(inst.pcHealth) && inst.pcHealth.length > 0) {
      return inst.pcHealth.every((val) => (parseInt(val, 10) || 0) > 0);
    }

    return false;
  }

  function ensureActiveInstance(encounterData) {
    const d = encounterData;
    if (!d || !Array.isArray(d.instances) || d.instances.length === 0) {
      if (d) d.activeInstanceId = null;
      return;
    }

    const current = d.instances.find((i) => i.id === d.activeInstanceId);
    if (current && !isInstanceDown(current)) return;

    const alive = d.instances.filter((i) => !isInstanceDown(i));
    if (alive.length > 0) {
      const sortedAlive = [...alive].sort(
        (a, b) => (b.initiative || 0) - (a.initiative || 0),
      );
      d.activeInstanceId = sortedAlive[0].id;
      return;
    }

    d.activeInstanceId = null;
  }

  function rerollAllInitiatives(encounterData) {
    const d = encounterData;
    if (!d || !Array.isArray(d.instances) || d.instances.length === 0) {
      return false;
    }

    d.instances.forEach((inst) => {
      inst.initiative = calculateInitiative({
        groups: inst.groups,
        stats: inst.stats,
      });
    });

    const sorted = [...d.instances].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0),
    );
    d.activeInstanceId = sorted[0].id;
    d.round = 1;
    return true;
  }

  function nextTurn(encounterData) {
    const d = encounterData;
    if (!d || !Array.isArray(d.instances) || d.instances.length === 0) {
      return false;
    }

    const alive = d.instances.filter((i) => !isInstanceDown(i));
    if (alive.length === 0) {
      d.activeInstanceId = null;
      return true;
    }

    const sorted = [...alive].sort(
      (a, b) => (b.initiative || 0) - (a.initiative || 0),
    );

    const currId = d.activeInstanceId;
    let idx = -1;
    if (currId) idx = sorted.findIndex((i) => i.id === currId);

    idx++;
    if (idx >= sorted.length) {
      idx = 0;
      d.round = (d.round || 1) + 1;
    }

    d.activeInstanceId = sorted[idx].id;
    return true;
  }

  global.AEEncounterTurns = {
    calculateInitiative,
    isInstanceDown,
    ensureActiveInstance,
    rerollAllInitiatives,
    nextTurn,
  };
})(window);
