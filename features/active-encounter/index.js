(function initActiveEncounterFeatureBootstrap(global) {
  const FEATURE_BASE = "features/active-encounter/";
  const CHAIN = [
    "tactical-map-render.js",
    "tactical-map-interactions.js",
    "tactical-map.js",
    "active-encounter-turns.js",
    "active-encounter-layers-toolbar.js",
    "active-encounter-assets-service.js",
    "active-encounter-entity-browser.js",
    "active-encounter-drawer.js",
    "encounter-powers.js",
    "token-actions.js",
    "token-context-menu.js",
    "active-encounter.js",
  ];

  function loadScriptSequentially(src) {
    return new Promise((resolve, reject) => {
      const script = document.createElement("script");
      script.src = src;
      script.async = false;
      script.dataset.aeManaged = "1";
      script.onload = resolve;
      script.onerror = () => reject(new Error(`Failed to load ${src}`));
      document.body.appendChild(script);
    });
  }

  async function ensureScriptsLoaded() {
    if (global.__activeEncounterScriptsLoaded) return;
    for (const file of CHAIN) {
      await loadScriptSequentially(FEATURE_BASE + file);
    }
    global.__activeEncounterScriptsLoaded = true;
  }

  async function boot() {
    await ensureScriptsLoaded();
    if (global.__ActiveEncounterFeatureModule?.boot) {
      await global.__ActiveEncounterFeatureModule.boot();
    }
  }

  async function destroy() {
    if (global.__ActiveEncounterFeatureModule?.destroy) {
      await global.__ActiveEncounterFeatureModule.destroy();
    }
  }

  global.ActiveEncounterFeature = { boot, destroy };
})(window);
