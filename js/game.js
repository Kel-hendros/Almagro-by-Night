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

  let html = '<div class="progress-widget">';
  if (drawNames) {
    html += `
      <div class="progress-header">
        <div class="progress-label">
          <strong>${name1}</strong>
          <span>${pct1}%</span>
        </div>
        <div class="progress-label neutral">
          <strong>Neutral</strong>
        </div>
        <div class="progress-label right">
          <strong>${name2}</strong>
          <span>${pct2}%</span>
        </div>
      </div>
    `;
  }
  html += `
    <div class="progress-track">
      <div class="progress-segment" style="flex:${pts1}; background:${color1};"></div>
      <div class="progress-segment" style="flex:${neutralPts}; background:${cssVar(
    "--zone-neutral"
  )};"></div>
      <div class="progress-segment" style="flex:${pts2}; background:${color2};"></div>
    </div>
  `;

  if (showPointsRow) {
    html += `
      <div class="progress-values">
        <div class="progress-value">
          <span class="value-number">${pts1}</span>
          <small>${name1}</small>
        </div>
        <div class="progress-value">
          <span class="value-number">${neutralPts}</span>
          <small>Neutral</small>
        </div>
        <div class="progress-value">
          <span class="value-number">${pts2}</span>
          <small>${name2}</small>
        </div>
      </div>
    `;
  }
  html += "</div>";
  return html;
}

// Helper to read CSS custom properties

function cssVar(name) {
  return getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
}

function escapeAttr(val) {
  return String(val ?? "").replace(/"/g, "&quot;");
}

function normalizeDateInput(value) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().split("T")[0];
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function safeParseJSON(value) {
  if (!value) return null;
  try {
    return JSON.parse(value);
  } catch (e) {
    return null;
  }
}

function buildZoneGeometryMap(dataset) {
  if (!dataset?.features) return {};
  const map = {};
  dataset.features.forEach((feat) => {
    if (feat.properties?.type !== "zone" || !feat.geometry) return;
    map[feat.properties.feature_id] = feat.geometry;
  });
  return map;
}

function buildLocationZoneMap(dataset) {
  if (!dataset?.features) return {};
  const map = {};
  dataset.features.forEach((feat) => {
    if (feat.properties?.type !== "location") return;
    const locId = feat.properties.feature_id;
    const zoneId = feat.properties.zone_id || feat.properties.zoneId;
    if (locId && zoneId) {
      map[locId] = zoneId;
    }
  });
  return map;
}

function polygonCentroid(coords) {
  if (!coords?.length) return null;
  const ring = coords[0];
  let area = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < ring.length - 1; i++) {
    const [x0, y0] = ring[i];
    const [x1, y1] = ring[i + 1];
    const f = x0 * y1 - x1 * y0;
    area += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  area *= 0.5;
  if (area === 0) {
    const [x, y] = ring[0] || [0, 0];
    return { lng: x, lat: y };
  }
  cx /= 6 * area;
  cy /= 6 * area;
  return { lng: cx, lat: cy };
}

function geometryCentroid(geometry) {
  if (!geometry) return null;
  if (geometry.type === "Polygon") {
    return polygonCentroid(geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    let best = null;
    let maxArea = -Infinity;
    (geometry.coordinates || []).forEach((poly) => {
      const ring = poly?.[0];
      if (!ring) return;
      let area = 0;
      for (let i = 0; i < ring.length - 1; i++) {
        const [x0, y0] = ring[i];
        const [x1, y1] = ring[i + 1];
        area += x0 * y1 - x1 * y0;
      }
      const centroid = polygonCentroid(poly);
      if (!centroid) return;
      const absArea = Math.abs(area);
      if (absArea > maxArea) {
        maxArea = absArea;
        best = centroid;
      }
    });
    return best;
  }
  if (geometry.type === "Point") {
    const [lng, lat] = geometry.coordinates;
    return { lng, lat };
  }
  return null;
}

function ensureLieutenantMarkerLayer() {
  const map = window.currentMap;
  if (!map) return null;
  if (!map.getSource("lieutenant-positions")) {
    map.addSource("lieutenant-positions", {
      type: "geojson",
      data: { type: "FeatureCollection", features: [] },
    });
    map.addLayer({
      id: "lieutenant-positions",
      type: "circle",
      source: "lieutenant-positions",
      paint: {
        "circle-radius": 6,
        "circle-color": ["get", "color"],
        "circle-stroke-color": "#000000",
        "circle-stroke-width": 1,
      },
    });
  }
  return map.getSource("lieutenant-positions");
}

async function refreshLieutenantMarkers() {
  const map = window.currentMap;
  if (!map || !window.zoneGeometryMap) return;
  const source = ensureLieutenantMarkerLayer();
  if (!source) return;
  try {
    const { data, error } = await supabase
      .from("lieutenants_positions")
      .select("*");
    if (error) throw error;
    const grouped = data.reduce((acc, lt) => {
      const zoneId = lt.current_zone_id;
      if (!zoneId) return acc;
      (acc[zoneId] || (acc[zoneId] = [])).push(lt);
      return acc;
    }, {});
    const features = [];
    Object.entries(grouped).forEach(([zoneId, list]) => {
      const geometry = window.zoneGeometryMap[zoneId];
      if (!geometry) return;
      const centroid = geometryCentroid(geometry);
      if (!centroid) return;
      const radius = 0.0002;
      list.forEach((lt, idx) => {
        const angle = list.length === 1 ? 0 : (idx / list.length) * Math.PI * 2;
        const lng = centroid.lng + Math.cos(angle) * radius;
        const lat = centroid.lat + Math.sin(angle) * radius;
        features.push({
          type: "Feature",
          geometry: {
            type: "Point",
            coordinates: [lng, lat],
          },
          properties: {
            name: lt.name || "Teniente",
            faction: lt.faction_name || "",
            stats: `💪 ${lt.phys_power || 0} · 🗣️ ${lt.soc_power || 0} · 🧠 ${
              lt.ment_power || 0
            }`,
            zone: lt.current_zone_name || "Zona desconocida",
            color: lt.faction_color || "#cccccc",
          },
        });
      });
    });
    source.setData({ type: "FeatureCollection", features });
  } catch (err) {
    console.error("No se pudieron cargar los tenientes del mapa:", err);
  }
}
window.refreshLieutenantMarkers = refreshLieutenantMarkers;

async function loadActionLogForDate(dateValue, gameId) {
  const statusEl = document.getElementById("actions-log-status");
  const listEl = document.getElementById("actions-log-list");
  if (!statusEl || !listEl) return;

  const normalized = normalizeDateInput(dateValue);
  if (window.NightCalendarState) {
    if (normalized) {
      window.NightCalendarState.selectedDate = normalized;
      const selectedDateObj = toDate(normalized);
      if (selectedDateObj) {
        const selectedMonth = new Date(
          selectedDateObj.getFullYear(),
          selectedDateObj.getMonth(),
          1
        );
        if (
          !window.NightCalendarState.monthDate ||
          window.NightCalendarState.monthDate.getTime() !==
            selectedMonth.getTime()
        ) {
          window.NightCalendarState.monthDate = selectedMonth;
        }
      }
    } else {
      window.NightCalendarState.selectedDate = null;
    }
    renderNightCalendar();
  }
  if (!normalized) {
    statusEl.textContent = "Seleccioná una fecha.";
    listEl.innerHTML = "";
    window.currentNightDate = null;
    return;
  }

  statusEl.textContent = "Cargando acciones...";
  listEl.innerHTML = "";
  window.currentNightDate = normalized;

  const { data: logs, error: logErr } = await supabase
    .from("night_actions_view")
    .select("*")
    .eq("night_date", normalized)
    .order("real_timestamp", { ascending: true });

  if (logErr) {
    console.error("Error loading action logs:", logErr);
    statusEl.textContent = "No se pudieron cargar las acciones.";
    return;
  }

  if (!logs || !logs.length) {
    statusEl.textContent = "No hay acciones registradas.";
    listEl.innerHTML = "";
    updateActivityState(normalized, false);
    return;
  }

  updateActivityState(normalized, true);
  listEl.innerHTML = logs
    .map((entry) => {
      const factionColor = entry.faction_color || cssVar("--zone-neutral");
      const time = entry.real_timestamp
        ? new Date(entry.real_timestamp).toLocaleTimeString([], {
            hour: "2-digit",
            minute: "2-digit",
          })
        : "--:--";
      const playerLabel =
        entry.character_name || entry.player_name || "Jugador desconocido";
      return `
        <div class="log-card" style="border-color:${factionColor}66; background-color:${factionColor}33;">
          <div class="log-card-header">
          <h3>${entry.action_name || "Acción"} en ${
        entry.zone_name || "Zona desconocida"
      }</h3>
          </div>
          <div class="log-player-container">
          <p class="log-player">${playerLabel}</p>
          <span class="log-time">${time}</span>
          </div>
          <p class="log-result">${entry.result_text || "Sin resultado"}</p>
          
        </div>
      `;
    })
    .join("");
  statusEl.textContent = `${logs.length} acciones registradas`;
}

function updateActivityState(dateIso, hasActivity) {
  const state = window.NightCalendarState;
  if (!state || !dateIso) return;
  if (!state.activityDates) state.activityDates = new Set();
  if (hasActivity) {
    state.activityDates.add(dateIso);
    const dateObj = toDate(dateIso);
    const marker = state.currentMarker ? toDate(state.currentMarker) : null;
    if (
      !marker ||
      (dateObj && marker && dateObj.getTime() > marker.getTime())
    ) {
      state.currentMarker = dateIso;
    }
  } else {
    state.activityDates.delete(dateIso);
    if (state.currentMarker === dateIso) {
      const latestDate = Array.from(state.activityDates)
        .map((d) => toDate(d))
        .filter(Boolean)
        .sort((a, b) => b.getTime() - a.getTime())[0];
      state.currentMarker = latestDate
        ? normalizeDateInput(latestDate)
        : state.selectedDate;
    }
  }
  renderNightCalendar();
}

async function setupTimelinePanel(game, initialDate) {
  const calendarEl = document.getElementById("night-calendar");
  if (!calendarEl) return;
  const startDate = toDate(game.start_date) || new Date();
  const baseSelectedDate = toDate(initialDate || game.start_date) || startDate;
  const activityInfo = await loadActivityDates();
  const initialSelectedDate =
    activityInfo.latestActivityDate || baseSelectedDate;
  const monthDate = new Date(
    initialSelectedDate.getFullYear(),
    initialSelectedDate.getMonth(),
    1
  );

  window.NightCalendarState = {
    container: calendarEl,
    minDate: startDate,
    minMonth: new Date(startDate.getFullYear(), startDate.getMonth(), 1),
    maxMonth: null,
    monthDate,
    selectedDate: normalizeDateInput(initialSelectedDate),
    gameId: game.id,
    activityDates: activityInfo.dates,
    currentMarker: normalizeDateInput(
      activityInfo.latestActivityDate || initialSelectedDate
    ),
  };

  renderNightCalendar();
  await loadActionLogForDate(initialSelectedDate, game.id);
}

async function loadActivityDates() {
  const { data, error } = await supabase
    .from("actions_log")
    .select("night_date");
  if (error) {
    console.error("Error loading activity dates:", error);
    return { dates: new Set(), latestActivityDate: null };
  }
  const dates = new Set();
  let latest = null;
  (data || []).forEach((entry) => {
    const date = normalizeDateInput(entry.night_date);
    if (!date) return;
    dates.add(date);
    const dateObj = toDate(date);
    if (dateObj && (!latest || dateObj.getTime() > latest.getTime())) {
      latest = dateObj;
    }
  });
  return { dates, latestActivityDate: latest };
}

function changeCalendarMonth(offset) {
  const state = window.NightCalendarState;
  if (!state) return;
  const newMonth = new Date(
    state.monthDate.getFullYear(),
    state.monthDate.getMonth() + offset,
    1
  );
  if (newMonth < state.minMonth) return;
  if (state.maxMonth && newMonth > state.maxMonth) return;
  state.monthDate = newMonth;
  renderNightCalendar();
}

function renderNightCalendar() {
  const state = window.NightCalendarState;
  if (!state || !state.container) return;
  const monthDate = state.monthDate || state.minMonth || new Date();
  const selected = state.selectedDate || "";
  const activityDates = state.activityDates || new Set();
  const currentMarker = state.currentMarker;
  const container = state.container;
  container.innerHTML = "";

  const header = document.createElement("div");
  header.className = "calendar-header";
  const monthLabel = document.createElement("h4");
  monthLabel.textContent = monthDate.toLocaleDateString("es-AR", {
    month: "long",
    year: "numeric",
  });
  const nav = document.createElement("div");
  nav.className = "calendar-nav";
  const prevBtn = document.createElement("button");
  prevBtn.type = "button";
  prevBtn.textContent = "‹";
  prevBtn.disabled = state.monthDate.getTime() <= state.minMonth.getTime();
  prevBtn.addEventListener("click", () => changeCalendarMonth(-1));
  const nextBtn = document.createElement("button");
  nextBtn.type = "button";
  nextBtn.textContent = "›";
  nextBtn.disabled =
    state.maxMonth && state.monthDate.getTime() >= state.maxMonth.getTime();
  nextBtn.addEventListener("click", () => changeCalendarMonth(1));
  nav.appendChild(prevBtn);
  nav.appendChild(nextBtn);
  header.appendChild(monthLabel);
  header.appendChild(nav);
  container.appendChild(header);

  const weekdaysRow = document.createElement("div");
  weekdaysRow.className = "calendar-grid calendar-weekdays";
  const weekdays = ["L", "M", "M", "J", "V", "S", "D"];
  weekdays.forEach((day) => {
    const el = document.createElement("div");
    el.className = "calendar-weekday";
    el.textContent = day;
    weekdaysRow.appendChild(el);
  });
  container.appendChild(weekdaysRow);

  const daysGrid = document.createElement("div");
  daysGrid.className = "calendar-grid calendar-days";

  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startWeekday = (firstDay.getDay() + 6) % 7; // lunes=0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const totalCells = Math.ceil((startWeekday + daysInMonth) / 7) * 7;
  const minTime = state.minDate ? state.minDate.getTime() : -Infinity;
  const maxTime = Infinity;

  for (let i = 0; i < totalCells; i++) {
    const dayDiv = new Date(year, month, i - startWeekday + 1);
    const wrapper = document.createElement("div");
    wrapper.className = "calendar-day";
    if (i < startWeekday || i - startWeekday + 1 > daysInMonth) {
      daysGrid.appendChild(wrapper);
      continue;
    }
    const btn = document.createElement("button");
    btn.type = "button";
    const dayNumber = i - startWeekday + 1;
    btn.textContent = dayNumber;
    const isDisabled = dayDiv.getTime() < minTime || dayDiv.getTime() > maxTime;
    const iso = normalizeDateInput(dayDiv);
    if (iso === selected) {
      btn.classList.add("selected");
    }
    if (currentMarker && iso === currentMarker) {
      btn.classList.add("today");
    }
    if (activityDates.has(iso) && iso !== currentMarker) {
      btn.classList.add("has-activity");
    }
    if (isDisabled) {
      btn.disabled = true;
    } else {
      btn.addEventListener("click", () => {
        window.NightCalendarState.selectedDate = iso;
        loadActionLogForDate(iso, state.gameId);
      });
    }
    wrapper.appendChild(btn);
    daysGrid.appendChild(wrapper);
  }

  container.appendChild(daysGrid);
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

window.zoneStatusCache = window.zoneStatusCache || null;
async function fetchZoneStatusRows(gameId, { force = false } = {}) {
  if (!gameId) return [];
  if (
    !force &&
    window.zoneStatusCache &&
    window.zoneStatusCache.gameId === gameId
  ) {
    return window.zoneStatusCache.data || [];
  }
  const { data, error } = await supabase
    .from("zone_status_view")
    .select("*")
    .eq("game_id", gameId);
  if (error) {
    console.error("Error fetching zone_status_view:", error);
    throw error;
  }
  window.zoneStatusCache = { gameId, data: data || [] };
  return window.zoneStatusCache.data;
}

async function loadActiveBenefitsByFaction(gameId) {
  const rows = await fetchZoneStatusRows(gameId, { force: true });
  const controlled = rows.filter((r) => r.control_state === "CONTROLLED");
  const zoneIds = controlled.map((r) => r.zone_id).filter(Boolean);

  let benefitsMap = new Map();
  if (zoneIds.length) {
    try {
      const { data, error } = await supabase
        .from("zones")
        .select("id, benefits")
        .in("id", zoneIds);
      if (error) throw error;
      benefitsMap = new Map((data || []).map((z) => [z.id, z.benefits]));
    } catch (err) {
      console.warn("No se pudieron obtener beneficios de zonas:", err);
    }
  }

  const groups = { cuadrilla: [], loquillo: [], other: [] };
  controlled.forEach((row) => {
    const benefitText = benefitsMap.get(row.zone_id);
    if (!benefitText) return;
    const key = resolveFactionKey(row);
    const target = groups[key] ? groups[key] : groups.other;
    target.push({
      zoneName: row.zone_name || "Zona",
      benefit: benefitText,
      color: row.controlling_color || cssVar("--color-cream"),
    });
  });
  return groups;
}

function buildBenefitsColumn(factionMeta, items) {
  const col = document.createElement("div");
  col.className = "benefit-column";
  const title = document.createElement("h3");
  title.textContent = factionMeta.name;
  title.style.color = factionMeta.color || cssVar("--color-cream");
  col.appendChild(title);

  const list = document.createElement("div");
  list.className = "benefit-list";
  if (!items?.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Sin beneficios activos.";
    list.appendChild(empty);
  } else {
    items.forEach((item) => {
      const card = document.createElement("div");
      card.className = "benefit-card";
      const text = document.createElement("div");
      text.className = "benefit-text";
      const strong = document.createElement("strong");
      strong.textContent = item.zoneName;
      text.appendChild(strong);
      const benefitCopy = document.createElement("div");
      benefitCopy.innerHTML = item.benefit;
      text.appendChild(benefitCopy);

      const status = document.createElement("div");
      status.className = "benefit-status";
      status.innerHTML = `<div class="benefit-checkbox" style="background:${item.color}; border-color:${item.color};">✓</div>`;
      card.appendChild(text);
      card.appendChild(status);
      list.appendChild(card);
    });
  }
  col.appendChild(list);
  return col;
}

function ensureBenefitsDialog() {
  let dlg = document.getElementById("panel-benefits");
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.id = "panel-benefits";
    dlg.className = "panel-actuar panel-benefits";
    dlg.addEventListener("click", (e) => {
      const rect = dlg.getBoundingClientRect();
      const inside =
        e.clientX >= rect.left &&
        e.clientX <= rect.right &&
        e.clientY >= rect.top &&
        e.clientY <= rect.bottom;
      if (!inside) dlg.close();
    });
    document.body.appendChild(dlg);
  }
  return dlg;
}

async function openBenefitsPanel() {
  const gameId = window.currentGameId;
  if (!gameId) {
    alert("No hay partida cargada para mostrar beneficios.");
    return;
  }
  const dlg = ensureBenefitsDialog();
  dlg.innerHTML = `
    <div class="panel-header">
      <h1>Beneficios activos</h1>
      <button class="panel-close" type="button" aria-label="Cerrar panel">×</button>
    </div>
    <div class="panel-body">
      <p class="muted">Cargando beneficios...</p>
    </div>
  `;
  dlg
    .querySelector(".panel-close")
    .addEventListener("click", () => dlg.close());
  dlg.showModal();

  const body = dlg.querySelector(".panel-body");
  try {
    const groups = await loadActiveBenefitsByFaction(gameId);
    const columns = document.createElement("div");
    columns.className = "benefits-columns";
    const cuadrillaMeta = getFactionMeta(
      "cuadrilla",
      "La Cuadrilla",
      "#008000"
    );
    const loquilloMeta = getFactionMeta(
      "loquillo",
      "La Banda de Loquillo",
      "#800000"
    );
    columns.appendChild(buildBenefitsColumn(cuadrillaMeta, groups.cuadrilla));
    columns.appendChild(buildBenefitsColumn(loquilloMeta, groups.loquillo));
    body.innerHTML = "";
    body.appendChild(columns);
  } catch (err) {
    console.error("No se pudieron cargar los beneficios:", err);
    body.innerHTML = `<p class="muted">No se pudieron cargar los beneficios activos.</p>`;
  }
}

function getFactionMeta(keyword, fallbackName, fallbackColor) {
  const fallback = {
    name: fallbackName,
    color: fallbackColor || cssVar("--zone-neutral"),
  };
  if (!keyword || !window.gameFactions?.length) return fallback;
  const match = window.gameFactions.find((f) =>
    (f.name || "").toLowerCase().includes(keyword.toLowerCase())
  );
  if (!match) return fallback;
  return {
    name: match.name || fallback.name,
    color: match.color || fallback.color,
  };
}

function resolveFactionKey(row) {
  const lower = (row?.controlling_faction || "").toLowerCase();
  const factionId = row?.controlling_faction_id;

  const cuadrillaId =
    window.gameFactions?.find((f) =>
      (f.name || "").toLowerCase().includes("cuadrilla")
    )?.id || null;
  const loquilloId =
    window.gameFactions?.find((f) =>
      (f.name || "").toLowerCase().includes("loquillo")
    )?.id || null;

  if (cuadrillaId && factionId === cuadrillaId) return "cuadrilla";
  if (loquilloId && factionId === loquilloId) return "loquillo";
  if (lower.includes("cuadrilla")) return "cuadrilla";
  if (lower.includes("loquillo")) return "loquillo";
  return "other";
}

/**
 * Calculate and render overall game progress bar.
 */
async function loadGameProgress(gameId, territoryId) {
  const container = document.getElementById("game-progress");
  if (!container) return;
  container.innerHTML = `<p class="muted">Calculando control...</p>`;
  if (!gameId || !territoryId) {
    container.innerHTML = `<p class="muted">Sin datos de territorio.</p>`;
    return;
  }

  try {
    const { data, error } = await supabase
      .from("territory_status_view")
      .select("*")
      .eq("game_id", gameId)
      .eq("territory_id", territoryId)
      .single();
    if (error) throw error;
    if (!data) {
      container.innerHTML = `<p class="muted">Sin datos de control para este territorio.</p>`;
      return;
    }

    const cuadrillaMeta = getFactionMeta(
      "cuadrilla",
      "La Cuadrilla",
      "#008000"
    );
    const loquilloMeta = getFactionMeta(
      "loquillo",
      "La Banda de Loquillo",
      "#800000"
    );
    const totalGoal =
      Number(data.total_influence_goal) ||
      Math.max(
        Number(data.total_cuadrilla_points || 0) +
          Number(data.total_loquillo_points || 0) +
          Number(data.neutral_points || 0),
        1
      );
    const segments = [
      {
        label: cuadrillaMeta.name,
        color: cuadrillaMeta.color,
        value: Number(data.total_cuadrilla_points) || 0,
      },
      {
        label: "Neutral",
        color: cssVar("--zone-neutral"),
        value: Number(data.neutral_points) || 0,
      },
      {
        label: loquilloMeta.name,
        color: loquilloMeta.color,
        value: Number(data.total_loquillo_points) || 0,
      },
    ];

    const trackHtml = segments
      .map(
        (seg) =>
          `<div class="progress-segment" style="flex:${Math.max(
            seg.value,
            0
          )}; background:${seg.color};"></div>`
      )
      .join("");

    const zoneSummary = `
      ${Number(data.cuadrilla_zones) || 0}/${
      Number(data.total_zones) || 0
    } zonas Cuadrilla ·
      ${Number(data.loquillo_zones) || 0}/${
      Number(data.total_zones) || 0
    } zonas Loquillo
    `;

    const tooltipText = [
      `Total: ${totalGoal}`,
      `Neutral: ${Number(data.neutral_points) || 0}`,
      `Influencia de la Cuadrilla: ${Number(data.total_cuadrilla_points) || 0}`,
      `Influencia de la Banda de Loquillo: ${
        Number(data.total_loquillo_points) || 0
      }`,
    ].join("\n");

    container.innerHTML = `
      <div class="progress-widget territory-widget" data-tooltip="${escapeAttr(
        tooltipText
      )}">
        <div class="territory-status-row">
          <span class="territory-zone-summary">${zoneSummary}</span>
        </div>
        <div class="progress-track">${trackHtml}</div>
      </div>
    `;
  } catch (err) {
    console.error("Error loading territory_status_view:", err);
    container.innerHTML = `<p class="muted">No se pudo cargar el estado del territorio.</p>`;
  }
}

/**
 * Apply zone styling based on influence data for a given game.
 */
async function styleZones(map, gameId) {
  if (!map || !gameId) return;
  let statuses = [];
  try {
    statuses = await fetchZoneStatusRows(gameId);
  } catch (err) {
    console.error("Error loading zone_status_view for styling:", err);
    return;
  }
  const neutralColor = cssVar("--zone-neutral");
  const disputedColor = cssVar("--zone-dispute") || neutralColor;
  if (!statuses || !statuses.length) {
    map.setPaintProperty("zones-fill", "fill-color", neutralColor);
    map.setPaintProperty("zones-fill", "fill-outline-color", neutralColor);
    return;
  }

  const fillExpr = ["match", ["get", "feature_id"]];
  statuses.forEach((row) => {
    let fillColor = neutralColor;
    if (row.control_state === "CONTROLLED" && row.controlling_color) {
      fillColor = row.controlling_color;
    } else if (row.control_state === "DISPUTED") {
      fillColor = disputedColor;
    }
    fillExpr.push(row.zone_id, fillColor);
  });
  fillExpr.push(neutralColor);

  map.setPaintProperty("zones-fill", "fill-color", fillExpr);
  map.setPaintProperty(
    "zones-fill",
    "fill-outline-color",
    cssVar("--zone-outline")
  );
}

/**
 * Refreshes the main UI: progress bar, map styling, and detail panel if open.
 * @param {string} type - "zone" or "location"
 * @param {string} id - feature_id of the element currently shown in details
 */
async function refreshUI(type, id) {
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
  if (window.currentNightDate) {
    await loadActionLogForDate(window.currentNightDate, window.currentGameId);
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

async function getStoredOrConfiguredGameId() {
  const stored = localStorage.getItem("currentGameId");
  if (stored) return stored;
  if (window.SingleGameStore?.getId) {
    const resolved = await window.SingleGameStore.getId();
    if (resolved) {
      localStorage.setItem("currentGameId", resolved);
      return resolved;
    }
  }
  return null;
}

/**
 * Initialize the game view, step by step:
 * 1. Resolver la partida fija (localStorage o SingleGameStore)
 * 2. Fetch game details from Supabase
 * 3. Populate header UI elements
 * ...
 */
async function initGame() {
  // 1) Get the current game ID
  const gameId = await getStoredOrConfiguredGameId();
  if (!gameId) {
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
  if (nameEl) nameEl.textContent = game.name;
  const benefitsBtn = document.getElementById("btn-benefits");
  if (benefitsBtn) {
    benefitsBtn.addEventListener("click", openBenefitsPanel);
  }

  let initialTimelineDate = game.start_date;

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
    center: [-58.42, -34.612], // Longitude, Latitude for Almagro
    zoom: 13.3,
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
      const bustUrl = datasetUrl.includes("?")
        ? `${datasetUrl}&_ts=${Date.now()}`
        : `${datasetUrl}?_ts=${Date.now()}`;
      const rawData = await fetch(bustUrl, { cache: "no-store" }).then((res) =>
        res.json()
      );
      console.log("Initial features loaded:", rawData.features);
      // 2) Add source using in-memory data
      map.addSource("zones", {
        type: "geojson",
        data: rawData,
      });
      // Save the raw data and URL for future refresh
      window.currentDatasetData = rawData;
      window.currentDatasetUrl = datasetUrl;
      window.zoneGeometryMap = buildZoneGeometryMap(rawData);
      window.locationZoneMap = buildLocationZoneMap(rawData);

      // Draw zone polygons
      map.addLayer({
        id: "zones-fill",
        type: "fill",
        source: "zones",
        filter: ["==", ["get", "type"], "zone"],
        paint: {
          "fill-color": neutralColor,
          "fill-opacity": neutralOpacity,
        },
      });

      // Outline for all zones
      map.addLayer({
        id: "zones-outline",
        type: "line",
        source: "zones",
        filter: ["==", ["get", "type"], "zone"],
        paint: {
          "line-color": neutralOutline,
          "line-width": 2,
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
          "line-color": "#FFFFFF",
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
      await refreshLieutenantMarkers();
    } else {
      console.warn("No dataset URL for territory:", game);
    }

    // Once the GeoJSON source is loaded, style zones based on DB state
    map.on("sourcedata", (e) => {
      if (e.sourceId === "zones" && e.isSourceLoaded) {
        styleZones(map, gameId);
      }
    });
    map.once("idle", () => {
      styleZones(map, gameId);
    });
  });

  await setupTimelinePanel(game, initialTimelineDate);
}

// Expose initGame to be called by router.js
window.initGame = initGame;
window.loadGameFactions = loadGameFactions;
window.refreshActionLogPanel = function () {
  if (window.currentNightDate && window.currentGameId) {
    loadActionLogForDate(window.currentNightDate, window.currentGameId);
  }
};

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
