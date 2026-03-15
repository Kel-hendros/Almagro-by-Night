(function initActiveEncounterFeatureBootstrap(global) {
  const FEATURE_BASE = "features/active-encounter/";
  const CHAIN = [
    // Terrain
    "terrain/tile-textures.js",
    "terrain/tile-painter.js",
    // Walls
    "walls/wall-renderer.js",
    "walls/wall-drawer.js",
    // Lighting
    "lighting/light-renderer.js",
    "lighting/light-switch-manager.js",
    "lighting/light-visibility.js",
    // Fog
    "fog/fog-visibility.js",
    "fog/fog-renderer.js",
    "fog/fog-brush.js",
    // Tactical Map
    "tactical-map/tactical-map-render.js",
    "tactical-map/tactical-map-interactions.js",
    "tactical-map/tactical-map.js",
    // Persistence
    "persistence/encounter-persistence.js",
    // Context menus
    "context-menus/design-token-menu.js",
    "context-menus/map-context-menu.js",
    // Modal
    "modal/instance-modal.js",
    // Instances
    "instances/instance-manager.js",
    // Realtime
    "realtime/encounter-sync.js",
    // Encounter subsystems
    "active-encounter-turns.js",
    "active-encounter-layers-toolbar.js",
    "active-encounter-assets-service.js",
    "active-encounter-entity-browser.js",
    "active-encounter-drawer.js",
    "encounter-powers.js",
    "token-actions.js",
    "token-context-menu.js",
    "roll-feed.js",
    // Orchestrator
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
