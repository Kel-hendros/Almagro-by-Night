(function initABNSheetUIRefresh(global) {
  const deps = {
    updateRatingDots: null,
    updateHealthSquares: null,
    updateBloodPerTurn: null,
    updateBloodUI: null,
    updateDamagePenalty: null,
    resetAllDice: null,
    updateHeaderLogo: null,
    updateClanFieldSigil: null,
    updateDisciplineButtons: null,
    blockTemporalWillpower: null,
    blockVirtues: null,
    syncVirtueLabels: null,
    updateAllSpecialtyVisibility: null,
    syncBoostBadges: null,
    nameSelector: "#nombre",
  };

  function configure(nextDeps = {}) {
    Object.keys(deps).forEach((key) => {
      if (key === "nameSelector") return;
      deps[key] = typeof nextDeps[key] === "function" ? nextDeps[key] : null;
    });
    if (typeof nextDeps.nameSelector === "string" && nextDeps.nameSelector.trim()) {
      deps.nameSelector = nextDeps.nameSelector.trim();
    }
  }

  function updateHTMLTitle() {
    const nameInput = document.querySelector(deps.nameSelector);
    const charName = nameInput?.value || "";
    if (charName !== "") {
      document.title = `${charName} - Vampiro v20 - Hoja de personaje`;
    } else {
      document.title = "Vampiro v20 - Hoja de personaje";
    }
  }

  function updateAll() {
    updateHTMLTitle();

    const ratings = document.querySelectorAll(
      ".rating:not(.discipline-rating):not(.background-rating)",
    );
    ratings.forEach((rating) => deps.updateRatingDots?.(rating));

    deps.updateHealthSquares?.();
    deps.updateBloodPerTurn?.();
    deps.updateBloodUI?.();
    deps.updateDamagePenalty?.();
    deps.resetAllDice?.();
    deps.updateHeaderLogo?.();
    deps.updateClanFieldSigil?.();
    deps.updateDisciplineButtons?.();
    deps.blockTemporalWillpower?.();
    deps.blockVirtues?.();
    deps.syncVirtueLabels?.();
    deps.updateAllSpecialtyVisibility?.();
    deps.syncBoostBadges?.();
  }

  global.ABNSheetUIRefresh = {
    configure,
    updateAll,
    updateHTMLTitle,
  };
})(window);
