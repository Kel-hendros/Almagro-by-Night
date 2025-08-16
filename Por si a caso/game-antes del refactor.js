// Helper to read CSS custom properties
function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

/**
 * Load all factions participating in a given game, including their colors.
 * Returns an array: [{ id, name, color }, ...].
 */
async function loadGameFactions(gameId) {
  const { data, error } = await supabase
    .from("game_participants")
    .select(
      "faction_id, factions!game_participants_faction_id_fkey(name, faction_color)"
    )
    .eq("game_id", gameId);
  if (error) {
    console.error("Error loading game factions:", error);
    return [];
  }
  return data.map(({ faction_id, factions }) => ({
    id: faction_id,
    name: factions.name,
    color: factions.faction_color,
  }));
}

/**
 * Calculate and render overall game progress bar.
 */
async function loadGameProgress(gameId, territoryId) {
  // 1) Fetch all zones for this territory
  const { data: zones, error: zonesErr } = await supabase
    .from("zones")
    .select("influence_goal")
    .eq("territory_id", territoryId);
  if (zonesErr) {
    console.error("Error loading zones for progress:", zonesErr);
    return;
  }
  const totalGoal = zones.reduce((sum, z) => sum + z.influence_goal, 0);

  // 2) Fetch total influence per faction in this game
  const { data: infs, error: infErr } = await supabase
    .from("zone_influence")
    .select("faction_id, influence")
    .eq("game_id", gameId);
  if (infErr) {
    console.error("Error loading influences for progress:", infErr);
    return;
  }
  // Sum per faction
  const factionTotals = {};
  infs.forEach(({ faction_id, influence }) => {
    factionTotals[faction_id] = (factionTotals[faction_id] || 0) + influence;
  });

  // 3) Compute percentages
  const entries = Object.entries(factionTotals).map(([fid, sum]) => ({
    id: fid,
    percent: Math.round((sum / totalGoal) * 100),
  }));
  // sort by percent desc
  entries.sort((a, b) => b.percent - a.percent);

  // 4) Render as simple textual bar inside #game-progress
  const container = document.getElementById("game-progress");
  if (!container) return;
  container.innerHTML = entries
    .map(
      (e) =>
        `<span class="prog-label">${e.id}</span> ` +
        `<span class="prog-bar">` +
        "▮".repeat(Math.floor(e.percent / 5)) +
        "▯".repeat(20 - Math.floor(e.percent / 5)) +
        `</span> ${e.percent}%`
    )
    .join(" ");
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

  // Load control_faction_id from zones table
  const zoneIds = [...new Set(infs.map((i) => i.zone_id).filter((id) => id))];
  if (zoneIds.length === 0) {
    console.warn("styleZones: no zone IDs to query, skipping styling.");
    return;
  }
  const { data: zonesList, error: zonesErr } = await supabase
    .from("zones")
    .select("id, control_faction_id")
    .in("id", zoneIds);
  if (zonesErr) {
    console.error("Error loading zones:", zonesErr);
    return;
  }

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
  const fillExpr = ["match", ["get", "zone_id"]];
  const outlineExpr = ["match", ["get", "zone_id"]];

  Object.entries(byZone).forEach(([zoneId, infos]) => {
    const zoneMeta = zonesList.find((z) => z.id === zoneId) || {};
    const ownerId = zoneMeta.control_faction_id;
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
 * Initialize the game view:
 * - Reads the selected game ID from localStorage
 * - Fetches the game details from Supabase
 * - Populates the header UI elements
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
      "id, name, start_date, status, territory_id, territory:territories(maptiler_dataset_url)"
    )
    .eq("id", gameId)
    .single();

  if (error || !game) {
    console.error("Error loading game:", error);
    alert("No se pudo cargar la partida seleccionada.");
    window.location.hash = "games";
    return;
  }

  // 3) Populate header UI
  const nameEl = document.getElementById("game-name");
  const turnInfoEl = document.getElementById("turn-info");
  if (nameEl) nameEl.textContent = game.name;

  // 4) Fetch and display the current turn/night
  const { data: nights, error: nightsErr } = await supabase
    .from("nights")
    .select("turn_number, night_date")
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
  } else {
    if (turnInfoEl) {
      turnInfoEl.textContent = `Fecha de inicio: ${new Date(
        game.start_date
      ).toLocaleDateString()}`;
    }
  }

  // 5) Load factions for this game and keep in memory
  window.gameFactions = await loadGameFactions(gameId);
  window.currentGameId = gameId;
  window.currentTerritoryId = game.territory_id;

  // 5.1) Load and render overall game progress
  await loadGameProgress(gameId, game.territory_id);

  // 5) Initialize MapLibre GL map
  const map = new maplibregl.Map({
    container: "map",
    style:
      "https://api.maptiler.com/maps/basic/style.json?key=3BYctVRw6IwXUy2XDK2b",
    center: [-58.42, -34.606], // Longitude, Latitude for Almagro
    zoom: 14,
  });

  map.on("load", async () => {
    // Read our theme colors from CSS variables
    const neutralColor = cssVar("--zone-neutral");
    const neutralOpacity = parseFloat(cssVar("--zone-neutral-opacity")) || 1;
    const neutralOutline = cssVar("--zone-outline");
    const locFill = cssVar("--location-fill");
    const locStroke = cssVar("--location-stroke");
    // 6) Load GeoJSON dataset of this territory
    const datasetUrl = game.territory?.maptiler_dataset_url;
    if (datasetUrl) {
      map.addSource("zones", {
        type: "geojson",
        data: datasetUrl,
      });
      // Log raw GeoJSON dataset for debugging
      try {
        const rawGeoJson = await fetch(datasetUrl).then((res) => res.json());
        console.log("Raw GeoJSON dataset:", rawGeoJson);
        // Log GeoJSON features array
        console.log("GeoJSON features:", rawGeoJson.features);

        // Log initial zone statuses from DB
        const initialZoneStatuses = await loadZoneStatuses(
          gameId,
          game.territory_id
        );
        console.log("Initial zone statuses on load:", initialZoneStatuses);

        // Log all locations for the zones in this territory
        const zoneIds = rawGeoJson.features
          .filter((f) => f.properties.type === "zone")
          .map((f) => f.properties.feature_id);
        try {
          const { data: dbLocations, error: locErr } = await supabase
            .from("locations")
            .select("*")
            .in("zone_id", zoneIds);
          if (locErr) throw locErr;
          console.log("DB locations for zones:", dbLocations);
          // Log all location states for this game
          try {
            const { data: locStates, error: locStatesErr } = await supabase
              .from("location_states")
              .select("location_id, status, owner_faction_id")
              .eq("game_id", gameId);
            if (locStatesErr) throw locStatesErr;
            console.log("Location states:", locStates);
          } catch (err) {
            console.error("Error loading location states:", err);
          }
        } catch (err) {
          console.error("Error loading locations for zones:", err);
        }
      } catch (err) {
        console.error("Error fetching raw GeoJSON for logging:", err);
      }

      // 7) Draw zone polygons
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

      // 8) Draw location points as circles
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

      // 9) Interactivity: click on a zone
      map.on("click", "zones-fill", async (e) => {
        const features = map.queryRenderedFeatures(e.point);
        if (features.some((f) => f.layer.id === "locations-circle")) return;
        const props = e.features[0].properties;
        await showDetails("zone", props.feature_id);
      });

      // 10) Change cursor on hover
      map.on("mouseenter", "zones-fill", () => {
        map.getCanvas().style.cursor = "pointer";
      });
      map.on("mouseleave", "zones-fill", () => {
        map.getCanvas().style.cursor = "";
      });

      // 11) Interactivity: click on a location
      map.on("click", "locations-circle", async (e) => {
        const props = e.features[0].properties;
        await showDetails("location", props.feature_id);
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
 * Load zone statuses for a given game and territory
 * Returns an object: { zoneId: { owner, attackers, status, breakdown } }
 */
async function loadZoneStatuses(gameId, territoryId) {
  // Load influence goal per zone
  const { data: zones, error: zonesErr } = await supabase
    .from("zones")
    .select("id, influence_goal, capture_threshold")
    .eq("territory_id", territoryId);
  if (zonesErr) {
    console.error("Error loading zones:", zonesErr);
    return {};
  }
  const influenceGoalMap = {};
  const captureThresholdMap = {};
  zones.forEach((z) => {
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

    result[zoneId] = { owner, status, breakdown, percentMap };
  });
  console.log("All zone statuses:", result);
  return result;
}

/**
 * Fetches and renders details for a zone or location into the .details pane.
 */
async function showDetails(type, id) {
  const el = document.querySelector(".details");
  el.innerHTML = '<p class="detail-loading">Cargando...</p>';
  let data;

  if (type === "zone") {
    // intento con description + image_url; si falla, caemos al fallback
    try {
      const { data: full, error } = await supabase
        .from("zones")
        .select("id, name, description, image_url")
        .eq("id", id)
        .single();
      if (error) throw error;
      data = full;
    } catch (err) {
      console.warn("showDetails: fallback zone select por:", err.message);
      const { data: basic, error: basicErr } = await supabase
        .from("zones")
        .select("id, name")
        .eq("id", id)
        .single();
      if (basicErr) {
        console.error("Error fetching zone basic info:", basicErr);
        el.innerHTML = '<p class="detail-error">Error al cargar detalles.</p>';
        return;
      }
      data = {
        ...basic,
        description: null,
        image_url: null,
      };
    }
  } else {
    const { data: loc, error } = await supabase
      .from("locations")
      .select("id, name, description, image_url")
      .eq("id", id)
      .single();
    if (error) {
      console.error("Error fetching location details:", error);
      el.innerHTML = '<p class="detail-error">Error al cargar detalles.</p>';
      return;
    }
    data = loc;
  }

  // defaults
  const description = data.description || "Sin descripción";
  const imageUrl = data.image_url || "images/zone_image_default.png";

  // render
  const icon = type === "zone" ? "🔲" : "📍";
  const iconTitle = type === "zone" ? "Zona" : "Locación";
  let html = `
    <div class="detail-header">  
      <h2 class="detail-title">${data.name}</h2> 
      <span class="detail-icon" title="${iconTitle}">${icon}</span>
    </div>
    <p class="detail-desc">${description}</p>
    <div class="detail-image-container">
      <img class="detail-img" src="${imageUrl}" alt="${data.name}" />
    </div>

    `;

  if (type === "zone") {
    const statuses = await loadZoneStatuses(
      window.currentGameId,
      window.currentTerritoryId
    );
    const status = statuses[id];
    if (status) {
      html += `<p class="detail-status"><strong>Status:</strong> ${status.status}</p>`;
      html += `<p class="detail-points"><strong>Puntos necesarios:</strong> ${
        status.breakdown.neutral +
        Object.values(status.breakdown).reduce((s, v) => s + v, 0)
      }</p>`;
      html += `<ul class="detail-list">`;
      Object.entries(status.breakdown).forEach(([fac, pts]) => {
        const pct = status.percentMap[fac] || 0;
        html += `<li class="detail-item">${fac}: ${pts} pts (${pct}%)</li>`;
      });
      html += `</ul>`;
    }
  }

  el.innerHTML = html;
}
