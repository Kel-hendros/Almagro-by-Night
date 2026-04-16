(function initActiveEncounterFeatureBootstrap(global) {
  const FEATURE_BASE = "features/active-encounter/";
  const CORE_CHAIN = [
    // Spatial indexing (used by lighting and fog for performance)
    "spatial/wall-spatial-index.js",
    // Terrain
    "terrain/tile-textures.js",
    // Walls
    "walls/wall-paths.js",
    "walls/wall-renderer.js",
    // Lighting
    "lighting/light-renderer.js",
    "lighting/light-switch-manager.js",
    "lighting/light-visibility.js",
    // Fog
    "fog/fog-visibility.js",
    "fog/fog-renderer.js",
    // Tactical Map
    "tactical-map/tactical-map-render.js",
    "tactical-map/tactical-map-interactions.js",
    "tactical-map/tactical-map.js",
    // Persistence
    "persistence/encounter-persistence.js",
    "context-menus/map-context-menu.js",
    // Modal
    "modal/instance-modal.js",
    // Instances
    "instances/instance-manager.js",
    // Realtime
    "realtime/token-drag-broadcast.js",
    "realtime/encounter-sync.js",
    // Encounter subsystems
    "active-encounter-turns.js",
    "active-encounter-play-drawer.js",
    "encounter-powers.js",
    "token-actions.js",
    "token-context-menu.js",
  ];
  const EDIT_CHAIN = [
    "terrain/tile-painter.js",
    "walls/wall-vertex-registry.js",
    "walls/wall-selection.js",
    "walls/wall-snapping.js",
    "walls/wall-guides.js",
    "walls/wall-editor.js",
    "walls/wall-drawer.js",
    "walls/paper-wall-editor.js",
    "fog/fog-brush.js",
    "context-menus/design-token-menu.js",
    "context-menus/prop-context-menu.js",
    "context-menus/marker-context-menu.js",
    "context-menus/wall-context-menu.js",
    "toolbars/elements-toolbar.js",
    "active-encounter-layers-toolbar.js",
    "active-encounter-assets-service.js",
    "active-encounter-entity-browser.js",
    "active-encounter-drawer.js",
  ];
  const ORCHESTRATOR_CHAIN = [
    "active-encounter.js",
  ];
  const ENCOUNTER_STATUS = {
    WIP: "wip",
    READY: "ready",
    IN_GAME: "in_game",
    ARCHIVED: "archived",
  };

  function normalizeEncounterStatus(status) {
    const value = String(status || "").trim().toLowerCase();
    return Object.values(ENCOUNTER_STATUS).includes(value)
      ? value
      : ENCOUNTER_STATUS.WIP;
  }

  function getDefaultEncounterUiMode(status) {
    const normalizedStatus = normalizeEncounterStatus(status);
    return normalizedStatus === ENCOUNTER_STATUS.READY ||
      normalizedStatus === ENCOUNTER_STATUS.IN_GAME
      ? "play"
      : "edit";
  }

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

  function unloadManagedScripts() {
    document
      .querySelectorAll('script[data-ae-managed="1"]')
      .forEach((script) => script.parentNode?.removeChild(script));
    global.__activeEncounterScriptsLoaded = false;
    global.__ActiveEncounterFeatureModule = null;
  }

  function parseEncounterRouteFromHash() {
    const rawHash = (global.location.hash || "").replace(/^#/, "");
    const parts = rawHash.split("?");
    if (parts[0] !== "active-encounter") {
      return { isActiveEncounter: false, encounterId: null, requestedMode: null };
    }
    const params = new URLSearchParams(parts[1] || "");
    const rawMode = params.get("mode");
    return {
      isActiveEncounter: true,
      encounterId: params.get("id") || null,
      requestedMode: rawMode === "edit" || rawMode === "play" ? rawMode : null,
    };
  }

  async function resolveBootstrapUiMode() {
    const route = parseEncounterRouteFromHash();
    if (!route.isActiveEncounter) return "play";
    if (!route.encounterId || !global.supabase) {
      return route.requestedMode || "play";
    }

    try {
      const { data: encounter, error: encounterError } = await global.supabase
        .from("encounters")
        .select("id, status, chronicle_id, user_id")
        .eq("id", route.encounterId)
        .maybeSingle();
      if (encounterError || !encounter) {
        return route.requestedMode || "play";
      }

      let canManage = false;
      if (!encounter.chronicle_id) {
        const userRes = await global.abnGetCurrentUser?.();
        canManage = encounter.user_id && encounter.user_id === userRes?.user?.id;
      } else {
        const playerId = await global.ABNPlayer?.getId?.();
        if (playerId) {
          const [chronicleRes, participationRes] = await Promise.all([
            global.supabase
              .from("chronicles")
              .select("creator_id")
              .eq("id", encounter.chronicle_id)
              .maybeSingle(),
            global.supabase
              .from("chronicle_participants")
              .select("role")
              .eq("chronicle_id", encounter.chronicle_id)
              .eq("player_id", playerId)
              .maybeSingle(),
          ]);
          const creatorId = chronicleRes?.data?.creator_id || null;
          const role = participationRes?.data?.role || null;
          canManage = role === "narrator" || creatorId === playerId;
        }
      }

      if (!canManage) return "play";
      if (route.requestedMode === "edit" || route.requestedMode === "play") {
        return route.requestedMode;
      }
      return getDefaultEncounterUiMode(encounter.status);
    } catch (_error) {
      return route.requestedMode || "play";
    }
  }

  async function ensureScriptsLoaded() {
    if (global.__activeEncounterScriptsLoaded) return;
    const bootstrapMode = await resolveBootstrapUiMode();
    const chain = bootstrapMode === "edit"
      ? CORE_CHAIN.concat(EDIT_CHAIN, ORCHESTRATOR_CHAIN)
      : CORE_CHAIN.concat(ORCHESTRATOR_CHAIN);
    for (const file of chain) {
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
    unloadManagedScripts();
  }

  global.ActiveEncounterFeature = { boot, destroy };
})(window);
