/**
 * Draws a flexible 3-segment progress bar (facción1 | neutral | facción2).
 * Opcionalmente muestra etiquetas laterales y una fila de puntos debajo.
 *
 * @param {Object} params
 * @param {string} params.name1
 * @param {string} params.color1
 * @param {number} params.pts1
 * @param {string} params.name2
 * @param {string} params.color2
 * @param {number} params.pts2
 * @param {number} params.neutralPts
 * @param {boolean} [params.drawNames=false]   Mostrar nombres izquierda/derecha.
 * @param {boolean} [params.showPointsRow=false] Mostrar fila de puntos debajo.
 * @returns {string} HTML
 */
function drawProgressBar({
  name1,
  color1,
  pts1,
  name2,
  color2,
  pts2,
  neutralPts,
  drawNames = false,
  showPointsRow = false,
}) {
  // Totales / % (evitamos div/0)
  const total = pts1 + pts2 + neutralPts || 1;
  const pct1 = Math.round((pts1 / total) * 100);
  const pct2 = Math.round((pts2 / total) * 100);
  const pctN = Math.round((neutralPts / total) * 100);

  let html = '<div class="full-progress-bar">';

  // --- fila principal: labels opcionales + barra ---
  html += '<div class="breakdown-container">';

  if (drawNames) {
    html += `<span class="breakdown-owner">${name1} (${pct1}%)</span>`;
  }

  html += '<div class="breakdown-bar">';
  html += `<div class="breakdown-segment" style="flex:${pts1}; background:${color1};"></div>`;
  html += `<div class="breakdown-segment" style="flex:${neutralPts}; background:${cssVar(
    "--zone-neutral"
  )};"></div>`;
  html += `<div class="breakdown-segment" style="flex:${pts2}; background:${color2};"></div>`;
  html += "</div>"; // .breakdown-bar

  if (drawNames) {
    html += `<span class="breakdown-rival">${name2} (${pct2}%)</span>`;
  }

  html += "</div>"; // .breakdown-container

  // --- fila secundaria: puntos (solo si se pide) ---
  if (showPointsRow) {
    html += '<div class="breakdown-points">';
    html += `<label class="pts-left">${pts1}</label>`;
    html += `<label class="pts-neutral">${neutralPts}</label>`;
    html += `<label class="pts-right">${pts2}</label>`;
    html += "</div>";
  }

  html += "</div>"; // .full-progress-bar

  return html;
}

/**
 * Fetches all participants of a game with their player names and faction colors.
 * Returns Array<{ player_id, name, faction_id, faction_color }>
 */
async function loadGameParticipants(gameId) {
  const { data, error } = await supabase
    .from("game_participants")
    .select(
      `
      player_id,
      players!game_participants_player_id_fkey (
        name
      ),
      faction_id,
      factions!game_participants_faction_id_fkey (
        faction_color
      )
    `
    )
    .eq("game_id", gameId);
  console.log("loadGameParticipants result:", { data, error });
  if (error) {
    console.error("Error loading game participants:", error);
    return [];
  }
  return data.map((row) => ({
    player_id: row.player_id,
    name: row.players.name,
    faction_id: row.faction_id,
    faction_color: row.factions.faction_color || "var(--color-cream)",
  }));
}

/**
 * Renders the footer with each player's remaining action points.
 * Each player has 2 points per night; when <=0, shows a check mark.
 */
async function renderPlayersStatus(gameId, nightId = null) {
  console.log("renderPlayersStatus called with", { gameId, nightId });
  // 1) Load participants
  const participants = await loadGameParticipants(gameId);
  console.log("Loaded participants:", participants);
  // 2) Calculate used points per player
  const usedMap = {};
  if (nightId) {
    const { data: logs, error: logErr } = await supabase
      .from("actions_log")
      .select("player_id, cost_units")
      .eq("night_id", nightId);
    if (logErr) {
      console.error("Error loading action logs:", logErr);
    } else {
      logs.forEach(({ player_id, cost_units }) => {
        usedMap[player_id] = (usedMap[player_id] || 0) + cost_units;
      });
    }
  }
  console.log("Computed usedMap:", usedMap);
  // 3) Build HTML
  const container = document.querySelector(".players-list");
  if (!container) return;
  console.log("Rendering players-list with remainings for each participant");
  container.innerHTML = participants
    .map((p) => {
      const used = usedMap[p.player_id] || 0;
      const remaining = Math.max(2 - used, 0);
      // Si este es el jugador actual, actualizamos su estado global de AP
      if (p.player_id === window.currentPlayer?.id) {
        setCurrentPlayerAP(remaining);
      }
      const display = remaining > 0 ? remaining : "✓";
      return `
      <div class="player-item">
        <div class="player-circle" style="background-color: ${p.faction_color}">
          ${display}
        </div>
        <div class="player-name">${p.name}</div>
      </div>`;
    })
    .join("");
}
// Helper to read CSS custom properties

function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

// === Estado y Realtime helpers ===
window.GameState = window.GameState || {
  actionsLogChannel: null,
};

function safeUnsubscribe(ch) {
  try {
    ch?.unsubscribe?.();
  } catch (e) {
    /* noop */
  }
}

function subscribeActionsLog(gameId, nightId) {
  safeUnsubscribe(window.GameState.actionsLogChannel);
  if (!nightId) return;
  window.GameState.actionsLogChannel = supabase
    .channel(`actions-log-updates-${nightId}`)
    .on(
      "postgres_changes",
      {
        event: "*",
        schema: "public",
        table: "actions_log",
        filter: `night_id=eq.${nightId}`,
      },
      async () => {
        await renderPlayersStatus(gameId, nightId);
      }
    )
    .subscribe();
}

function bootstrapRealtime(gameId, nightId) {
  // Solo actualizamos el footer en vivo; sin detección de cambio de noche ni refresh automático
  subscribeActionsLog(gameId, nightId);
}

// === Memoria de selección y refresco con restauración ===
window.LastSelection = window.LastSelection || {
  current: null,
  set(sel) {
    this.current = sel;
  },
  get() {
    return this.current;
  },
  clear() {
    this.current = null;
  },
};

// Refresca todo (footer, progreso, mapa) y vuelve a abrir el detalle seleccionado
window.refreshAllAndRestore = async function () {
  try {
    await refreshUI();
  } catch (e) {
    console.warn("refreshUI() falló en refreshAllAndRestore:", e);
  }
  const sel = window.LastSelection.get();
  if (!sel) return;
  try {
    if (sel.type === "zone" && window.DetailView?.renderZone) {
      await window.DetailView.renderZone(sel.id);
      if (typeof highlightFeature === "function")
        highlightFeature("zone", sel.id);
    } else if (sel.type === "location" && window.DetailView?.renderLocation) {
      await window.DetailView.renderLocation(sel.id);
      if (typeof highlightFeature === "function")
        highlightFeature("location", sel.id);
    }
  } catch (e) {
    console.warn("No se pudo restaurar la selección después del refresh:", e);
  }
};

/**
 * Centralized function to fetch and log all initial data needed before rendering:
 * - Raw GeoJSON features for zones and locations
 * - Zone statuses (owner, status, breakdown, percentMap)
 * - Database locations and their states
 */
async function initializeGameData(gameId, territoryId, datasetUrl) {
  // 1. Fetch GeoJSON
  let rawGeoJson = null;
  try {
    rawGeoJson = await fetch(datasetUrl).then((res) => res.json());
    console.log("Initial raw GeoJSON:", rawGeoJson.features);
  } catch (err) {
    console.error("Error fetching initial GeoJSON:", err);
  }

  // 2. Zone statuses
  try {
    const zoneStatuses = await loadZoneStatuses(gameId, territoryId);
  } catch (err) {
    console.error("Error loading initial zone statuses:", err);
  }

  // 3. Locations in DB for those zones
  if (rawGeoJson) {
    const zoneIds = rawGeoJson.features
      .filter((f) => f.properties.type === "zone")
      .map((f) => f.properties.feature_id);
    try {
      const { data: dbLocations, error: locErr } = await supabase
        .from("locations")
        .select("*")
        .in("zone_id", zoneIds);
      if (locErr) throw locErr;
      console.log("Initial DB locations for zones:", dbLocations);
    } catch (err) {
      console.error("Error loading initial DB locations:", err);
    }

    // 4. Location states
    try {
      const { data: locStates, error: locStatesErr } = await supabase
        .from("location_states")
        .select("location_id, status, owner_faction_id")
        .eq("game_id", gameId);
      if (locStatesErr) throw locStatesErr;
      console.log("Initial location states:", locStates);
    } catch (err) {
      console.error("Error loading initial location states:", err);
    }
  }
}

/**
 * Load all factions participating in a given game, including their colors.
 * Returns an array: [{ id, name, color }, ...].
 */
async function loadGameFactions(gameId) {
  const { data, error } = await supabase
    .from("game_factions")
    .select(
      `
      faction_id,
      factions!game_factions_faction_id_fkey(name, faction_color)
    `
    )
    .eq("game_id", gameId);
  if (error) {
    console.error("Error loading game factions:", error);
    return [];
  }
  return data.map(({ faction_id, factions }) => ({
    id: faction_id,
    name: factions.name,
    color: factions.faction_color || "var(--color-cream)",
  }));
}

/**
 * Calculate and render overall game progress bar.
 */
async function loadGameProgress(gameId, territoryId) {
  // 1) Fetch all zones for this territory
  const { data: zones, error: zonesErr } = await supabase
    .from("zones")
    .select("id, influence_goal")
    .eq("territory_id", territoryId);
  if (zonesErr) {
    console.error("Error loading zones for progress:", zonesErr);
    return;
  }
  const totalGoal = zones.reduce((sum, z) => sum + z.influence_goal, 0);
  const zoneIds = zones.map((z) => z.id);

  // 2) Totales por facción desde la VIEW (filtrando por juego y territorio)
  let factionTotals = {};
  try {
    const { data: rows, error: viewErr } = await supabase
      .from("zone_influence_summary")
      .select("faction_id,total_influence")
      .eq("game_id", gameId)
      .eq("territory_id", territoryId);
    if (viewErr) throw viewErr;
    (rows || []).forEach((r) => {
      factionTotals[r.faction_id] =
        (factionTotals[r.faction_id] || 0) + (r.total_influence || 0);
    });
  } catch (e) {
    console.warn(
      "zone_influence_summary no disponible; fallback a cálculo local:",
      e
    );
    // Fallback local si la view no existe o no tiene columnas: sumar desde zone_influence
    factionTotals = {};
    const { data: infs } = await supabase
      .from("zone_influence")
      .select("zone_id,faction_id,influence")
      .eq("game_id", gameId)
      .in("zone_id", zoneIds);
    (infs || []).forEach(({ faction_id, influence }) => {
      factionTotals[faction_id] =
        (factionTotals[faction_id] || 0) + (influence || 0);
    });
  }

  // 3) Neutral = suma de goals de las zonas del territorio − suma de influencia total en esas zonas
  const totalInfluence = Object.values(factionTotals).reduce(
    (s, v) => s + v,
    0
  );
  const neutralPoints = Math.max(totalGoal - totalInfluence, 0);

  // 4) Identify the two factions (assumes exactly two)
  const [f1, f2] = window.gameFactions;

  const pts1 = factionTotals[f1.id] || 0;
  const pts2 = factionTotals[f2.id] || 0;
  const ptsN = neutralPoints;

  // 5) Render graphical progress bar inside #game-progress
  const container = document.getElementById("game-progress");
  if (!container) return;
  const html = drawProgressBar({
    name1: f1.name,
    color1: f1.color,
    pts1,
    name2: f2.name,
    color2: f2.color,
    pts2,
    neutralPts: ptsN,
    drawNames: true,
    showPointsRow: true,
  });
  container.innerHTML = html;
}

/**
 * Apply zone styling based on influence data for a given game.
 */
async function styleZones(map, gameId) {
  // Load current influence for this game
  const { data: infs, error: infErr } = await supabase
    .from("zone_influence")
    .select("zone_id, faction_id, influence")
    .eq("game_id", gameId);
  if (infErr) {
    console.error("Error loading influences:", infErr);
    return;
  }
  // If no influence records, paint all zones neutral and exit
  if (!infs || infs.length === 0) {
    const neutral = cssVar("--zone-neutral");
    map.setPaintProperty("zones-fill", "fill-color", neutral);
    map.setPaintProperty("zones-fill", "fill-outline-color", neutral);
    return;
  }

  // Compute statuses with owner from DB
  const statuses = await loadZoneStatuses(gameId, window.currentTerritoryId);

  // Load faction colors from database
  const factionIds = [...new Set(infs.map((i) => i.faction_id))];
  const { data: factions, error: facErr } = await supabase
    .from("factions")
    .select("id, faction_color")
    .in("id", factionIds);
  if (facErr) {
    console.error("Error loading factions:", facErr);
    return;
  }
  const factionColorMap = {};
  factions.forEach((f) => {
    factionColorMap[f.id] = f.faction_color;
  });

  // Group influences by zone
  const byZone = {};
  infs.forEach(({ zone_id, faction_id, influence }) => {
    byZone[zone_id] = byZone[zone_id] || [];
    byZone[zone_id].push({ faction_id, influence });
  });

  // Build match expressions
  const fillExpr = ["match", ["get", "feature_id"]];
  const outlineExpr = ["match", ["get", "feature_id"]];

  Object.entries(byZone).forEach(([zoneId, infos]) => {
    const { owner: ownerId } = statuses[zoneId] || {};
    const hasOne = infos.length === 1;
    const hasTwo = infos.length === 2;

    if (infos.length === 0) {
      // fully neutral
      fillExpr.push(zoneId, cssVar("--zone-neutral"));
      outlineExpr.push(zoneId, cssVar("--zone-neutral"));
    } else if (hasOne && !ownerId) {
      // single faction present, not claimed
      fillExpr.push(zoneId, cssVar("--zone-neutral"));
      outlineExpr.push(
        zoneId,
        factionColorMap[infos[0].faction_id] || cssVar("--zone-neutral")
      );
    } else if (ownerId && infos.every((i) => i.faction_id === ownerId)) {
      // claimed by one faction without enemy
      const ownerColor = factionColorMap[ownerId] || cssVar("--zone-neutral");
      fillExpr.push(zoneId, ownerColor);
      outlineExpr.push(zoneId, ownerColor);
    } else if (!ownerId && hasTwo) {
      // neutral but disputed by two factions
      fillExpr.push(zoneId, cssVar("--zone-dispute"));
      outlineExpr.push(zoneId, cssVar("--zone-dispute"));
    } else if (ownerId && hasTwo) {
      // claimed but under attack by another faction
      const attacker = infos.find((i) => i.faction_id !== ownerId).faction_id;
      const ownerColor = factionColorMap[ownerId] || cssVar("--zone-neutral");
      const attackerColor =
        factionColorMap[attacker] || cssVar("--zone-neutral");
      fillExpr.push(zoneId, ownerColor);
      outlineExpr.push(zoneId, attackerColor);
    }
  });

  // Default colors
  fillExpr.push(cssVar("--zone-neutral"));
  outlineExpr.push(cssVar("--zone-neutral"));

  // Apply to map layer
  map.setPaintProperty("zones-fill", "fill-color", fillExpr);
  map.setPaintProperty("zones-fill", "fill-outline-color", outlineExpr);
}

/**
 * Refreshes the main UI: progress bar, map styling, and detail panel if open.
 * @param {string} type - "zone" or "location"
 * @param {string} id - feature_id of the element currently shown in details
 */
async function refreshUI(type, id) {
  // 1a) Re-render players' remaining action points
  await renderPlayersStatus(window.currentGameId, window.currentNightId);
  // 1) Update overall progress bar
  await loadGameProgress(window.currentGameId, window.currentTerritoryId);
  // 2) Refresh GeoJSON source if available
  if (window.currentMap && window.currentDatasetData) {
    try {
      window.currentMap.getSource("zones").setData(window.currentDatasetData);
    } catch (e) {
      console.warn("refreshUI: failed to refresh source data:", e);
    }
  }
  // 3) Reapply zone styling on map
  if (window.currentMap) {
    await styleZones(window.currentMap, window.currentGameId);
  }
  // 4) Si hay un panel abierto, refrescarlo usando el renderer explícito
  if (type && id) {
    if (type === "zone" && window.DetailView?.renderZone) {
      await window.DetailView.renderZone(id);
    } else if (type === "location" && window.DetailView?.renderLocation) {
      await window.DetailView.renderLocation(id);
    }
  }
}

/**
 * Initialize the game view, step by step:
 * 1. Fetch the selected game ID from localStorage
 * 2. Fetch game details from Supabase
 * 3. Populate header UI elements
 * 4. Fetch and display current turn/night
 * 5. Load factions for this game
 * 6. Load and render overall game progress
 * 7. Load and log all initial game data (GeoJSON, statuses, locations, states)
 * 8. Initialize MapLibre GL map and add layers
 * 9. Set up interactivity and styling
 */
async function initGame() {
  // 1) Get the current game ID
  const gameId = localStorage.getItem("currentGameId");
  if (!gameId) {
    // No game selected; go back to games list
    window.location.hash = "games";
    return;
  }

  // 2) Fetch game details
  const { data: game, error } = await supabase
    .from("games")
    .select(
      "id, name, start_date, status, territory_id, creator_id, territory:territories(maptiler_dataset_url)"
    )
    .eq("id", gameId)
    .single();

  if (error || !game) {
    console.error("Error loading game:", error);
    alert("No se pudo cargar la partida seleccionada.");
    window.location.hash = "games";
    return;
  }
  // Expose creator for later checks
  window.currentGameCreator = game.creator_id;

  // 3) Populate header UI
  const nameEl = document.getElementById("game-name");
  const turnInfoEl = document.getElementById("turn-info");
  if (nameEl) nameEl.textContent = game.name;

  // 4) Fetch and display the current turn/night
  const { data: nights, error: nightsErr } = await supabase
    .from("nights")
    .select("id, turn_number, night_date")
    .eq("game_id", gameId)
    .order("turn_number", { ascending: false })
    .limit(1);

  if (!nightsErr && nights && nights.length > 0) {
    const latest = nights[0];
    if (turnInfoEl) {
      turnInfoEl.textContent = `Turno ${latest.turn_number} | Fecha: ${new Date(
        latest.night_date
      ).toLocaleDateString()}`;
    }
    window.currentNightId = latest.id;
    // Render footer player statuses
    await renderPlayersStatus(gameId, window.currentNightId);
    // Iniciar realtime limpio (actions_log + nights)
    bootstrapRealtime(gameId, window.currentNightId);
  } else {
    if (turnInfoEl) {
      turnInfoEl.textContent = `Fecha de inicio: ${new Date(
        game.start_date
      ).toLocaleDateString()}`;
    }
    // No nights yet, render full points for all players
    await renderPlayersStatus(gameId);
  }

  // 5) Load factions for this game and keep in memory
  window.gameFactions = await loadGameFactions(gameId);
  window.currentGameId = gameId;
  window.currentTerritoryId = game.territory_id;

  // 6) Load and render overall game progress
  await loadGameProgress(gameId, game.territory_id);

  // 7) Load and log all initial game data before map rendering
  await initializeGameData(
    gameId,
    game.territory_id,
    game.territory.maptiler_dataset_url
  );

  // 8) Initialize MapLibre GL map and add layers
  const map = new maplibregl.Map({
    container: "map",
    style:
      "https://api.maptiler.com/maps/basic/style.json?key=3BYctVRw6IwXUy2XDK2b",
    center: [-58.42, -34.606], // Longitude, Latitude for Almagro
    zoom: 14,
  });
  // Expose map globally for later styling after configuration
  window.currentMap = map;

  map.on("load", async () => {
    // Read our theme colors from CSS variables
    const neutralColor = cssVar("--zone-neutral");
    const neutralOpacity = parseFloat(cssVar("--zone-neutral-opacity")) || 1;
    const neutralOutline = cssVar("--zone-outline");
    const locFill = cssVar("--location-fill");
    const locStroke = cssVar("--location-stroke");
    // 9) Load GeoJSON dataset of this territory and add sources/layers
    const datasetUrl = game.territory?.maptiler_dataset_url;
    if (datasetUrl) {
      // 1) Fetch raw GeoJSON to avoid URL caching issues
      const rawData = await fetch(datasetUrl).then((res) => res.json());
      console.log("Initial features loaded:", rawData.features);
      // 2) Add source using in-memory data
      map.addSource("zones", {
        type: "geojson",
        data: rawData,
      });
      // Save the raw data and URL for future refresh
      window.currentDatasetData = rawData;
      window.currentDatasetUrl = datasetUrl;

      // Draw zone polygons
      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        filter: ["==", ["get", "type"], "zone"],
        paint: {
          "fill-color": neutralColor,
          "fill-opacity": neutralOpacity,
          "fill-outline-color": neutralOutline,
        },
      });

      // Draw location points as circles
      map.addLayer({
        id: "locations-circle",
        type: "circle",
        source: "zones",
        filter: ["==", ["get", "type"], "location"],
        paint: {
          "circle-radius": 6,
          "circle-color": locFill,
          "circle-stroke-color": locStroke,
          "circle-stroke-width": 2,
        },
      });

      // Highlight selected zone with a bold outline
      map.addLayer({
        id: "zones-highlight",
        type: "line",
        source: "zones",
        filter: ["==", ["get", "feature_id"], ""], // initially no feature
        paint: {
          "line-color": "#000000",
          "line-width": 4,
        },
      });

      // Highlight selected location with an outer circle
      map.addLayer({
        id: "locations-highlight",
        type: "circle",
        source: "zones",
        filter: ["==", ["get", "feature_id"], ""], // initially no feature
        paint: {
          "circle-radius": 10,
          "circle-color": "#000000",
          "circle-opacity": 1,
        },
      });

      // Interactivity: click on a zone
      map.on("click", "zones-fill", async (e) => {
        const features = map.queryRenderedFeatures(e.point);
        if (features.some((f) => f.layer.id === "locations-circle")) return;
        const props = e.features[0].properties;
        const zoneId = props.feature_id;
        window.LastSelection.set({ type: "zone", id: zoneId });
        await window.DetailView.renderZone(zoneId);
        highlightFeature("zone", zoneId);
      });

      // Change cursor on hover
      map.on("mouseenter", "zones-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "zones-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      // Interactivity: click on a location
      map.on("click", "locations-circle", async (e) => {
        const locId = e.features[0].properties.feature_id;
        window.LastSelection.set({ type: "location", id: locId });
        if (
          window.DetailView &&
          typeof window.DetailView.renderLocation === "function"
        ) {
          await window.DetailView.renderLocation(locId);
        } else {
          console.warn("Renderer for locations not available yet");
        }
        highlightFeature("location", locId);
      });
    } else {
      console.warn("No dataset URL for territory:", game);
    }

    // Once the GeoJSON source is loaded, style zones based on DB state
    map.on("sourcedata", (e) => {
      if (e.sourceId === "zones" && e.isSourceLoaded) {
        styleZones(map, gameId);
      }
    });
  });
}

// Expose initGame to be called by router.js
window.initGame = initGame;
window.loadGameFactions = loadGameFactions;

/**
 * Updates the highlight layer filter to the selected feature.
 * @param {string} type - "zone" or "location"
 * @param {string} id - feature_id to highlight
 */
function highlightFeature(type, id) {
  if (!window.currentMap) return;
  if (type === "zone") {
    window.currentMap.setFilter("zones-highlight", [
      "==",
      ["get", "feature_id"],
      id,
    ]);
    window.currentMap.setFilter("locations-highlight", [
      "==",
      ["get", "feature_id"],
      "",
    ]);
  } else {
    window.currentMap.setFilter("locations-highlight", [
      "==",
      ["get", "feature_id"],
      id,
    ]);
    window.currentMap.setFilter("zones-highlight", [
      "==",
      ["get", "feature_id"],
      "",
    ]);
  }
}

/**
 * Load zone statuses for a given game and territory
 * Returns an object: { zoneId: { owner, attackers, status, breakdown } }
 */
async function loadZoneStatuses(gameId, territoryId) {
  // Load influence goal per zone
  const { data: zones, error: zonesErr } = await supabase
    .from("zones")
    .select("id, name, description, influence_goal, capture_threshold")
    .eq("territory_id", territoryId);
  if (zonesErr) {
    console.error("Error loading zones:", zonesErr);
    return {};
  }
  // build metadata map for name and description
  const zoneMetaMap = {};
  const influenceGoalMap = {};
  const captureThresholdMap = {};
  zones.forEach((z) => {
    zoneMetaMap[z.id] = {
      name: z.name,
      description: z.description,
    };
    influenceGoalMap[z.id] = z.influence_goal;
    captureThresholdMap[z.id] = z.capture_threshold;
  });

  // Load influence data for this game
  const { data: infs, error: infErr } = await supabase
    .from("zone_influence")
    .select("zone_id, faction_id, influence")
    .eq("game_id", gameId);
  if (infErr) {
    console.error("Error loading zone influence:", infErr);
    return {};
  }

  // Group influences by zone
  const byZone = {};
  infs.forEach(({ zone_id, faction_id, influence }) => {
    byZone[zone_id] = byZone[zone_id] || [];
    byZone[zone_id].push({ faction_id, influence });
  });

  const result = {};
  // For each zone, even with zero influence, compute status
  zones.forEach((z) => {
    const zoneId = z.id;
    const infos = byZone[zoneId] || [];
    const goal = influenceGoalMap[zoneId] || 0;

    // Determine owner
    const ownerRec = infos.find((i) => i.influence >= goal);
    const owner = ownerRec ? ownerRec.faction_id : null;

    // Determine attackers
    const attackers = infos
      .filter((i) => i.faction_id !== owner)
      .map((i) => i.faction_id);

    // Determine status
    let status = "neutral";
    if (owner && attackers.length === 0) status = "controlled";
    else if (owner && attackers.length > 0) status = "under_attack";
    else if (!owner && infos.length > 0) status = "contested";

    // Compute breakdown
    const totalInf = infos.reduce((sum, i) => sum + i.influence, 0);
    const neutralPts = Math.max(goal - totalInf, 0);
    const breakdown = { neutral: neutralPts };
    infos.forEach((i) => {
      breakdown[i.faction_id] = i.influence;
    });

    // Compute percentMap
    const percentMap = {};
    const baseTotal = Object.values(breakdown).reduce((s, v) => s + v, 0) || 1;
    Object.entries(breakdown).forEach(([key, pts]) => {
      percentMap[key] = Math.round((pts / baseTotal) * 100);
    });

    result[zoneId] = {
      id: zoneId,
      name: zoneMetaMap[zoneId].name,
      description: zoneMetaMap[zoneId].description,
      influence_goal: influenceGoalMap[zoneId], // added field
      owner,
      status,
      breakdown,
      percentMap,
    };
  });
  console.log("All zone statuses:", result);
  return result;
}
