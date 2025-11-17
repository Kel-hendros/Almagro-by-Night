/**
 * detail.zone.js
 * ----------------
 * Renderizador **EXCLUSIVO** para el detalle de **Zonas**.
 * Este módulo no despacha por tipo ni registra renderers genéricos: sólo sabe
 * dibujar zonas. Usalo como base para crear `detail.location.js` (locaciones),
 * `detail.player.js` (jugadores), etc., cada uno con su propia función explícita.
 *
 * API pública expuesta en `window.DetailView`:
 *   - `DetailView.renderZone(id: string|number): Promise<void>`
 *       Dibuja el panel de detalles de la zona `id`.
 *   - `DetailView.showConfigurations(type: 'zone', id, el): Promise<void>`
 *       (Opcional, sólo para admins) Renderiza controles de configuración para la zona.
 *
 * Dependencias en tiempo de ejecución:
 *   - `supabase` (instancia global ya configurada)
 *   - `window.currentGameId`, `window.currentTerritoryId`, `window.gameFactions`
 *   - `drawProgressBar(...)` (util global para la barra de influencia)
 *   - (Opcional) `window.ActionsUI.renderActionsToolbar(type, id, el)`
 *
 * Orden de carga recomendado (en index.html):
 *   <script src="js/detail.zone.js" defer></script>
 *   <script src="js/game.js" defer></script>
 *
 * Nota: este archivo **no** define ni usa `DetailView.register(...)` ni un
 * dispatcher. Si más adelante querés un sistema por registro, creá un
 * `detail.core.js` con `DetailView.register/get` y migrá las funciones explícitas.
 */

// -----------------------------------------------------------------------------
// Utilidad: asegurar contenedor del panel de detalles
// -----------------------------------------------------------------------------
(function () {
  /**
   * Devuelve el contenedor del panel de detalles.
   * Si no existe, lo crea dentro de #content (o <body> fallback).
   *
   * @returns {HTMLElement}
   */
  function ensureDetailsContainer() {
    let el =
      document.querySelector(".details") || document.getElementById("details");
    if (el) return el;
    const host = document.getElementById("content") || document.body;
    el = document.createElement("div");
    el.className = "details";
    host.appendChild(el);
    return el;
  }
  // Exponemos helper global por si futuros módulos lo necesitan
  window.__ensureDetailsContainer = ensureDetailsContainer;
})();

// -----------------------------------------------------------------------------
// Namespace público para el sistema de detalles
// -----------------------------------------------------------------------------
window.DetailView = window.DetailView || {};
window.zoneStatusCache = window.zoneStatusCache || null;
function getCssVarValue(name) {
  return (
    getComputedStyle(document.documentElement).getPropertyValue(name).trim() ||
    ""
  );
}

function escapeAttr(val) {
  return String(val ?? "").replace(/"/g, "&quot;");
}

function getFactionMeta(keyword, fallbackName, fallbackColor) {
  const fallback = {
    name: fallbackName,
    color: fallbackColor || getCssVarValue("--zone-neutral"),
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

async function getCurrentPlayerId() {
  if (window.__detailPlayerId) return window.__detailPlayerId;
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  try {
    const { data, error } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (error) throw error;
    window.__detailPlayerId = data?.id || null;
  } catch (err) {
    console.error("No se pudo obtener el player_id:", err);
    window.__detailPlayerId = null;
  }
  return window.__detailPlayerId;
}

function formatShortDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

async function fetchLieutenantsForZone(zoneId, nightDate) {
  const playerId = await getCurrentPlayerId();
  let effectiveNight = nightDate || window.currentNightDate || null;
  if (effectiveNight) {
    const date = new Date(effectiveNight);
    if (!Number.isNaN(date.getTime())) {
      effectiveNight = date.toISOString().split("T")[0];
    }
  }
  if (!playerId || !zoneId || !effectiveNight)
    return { zone_lieutenants: [], other_my_lieutenants: [] };
  try {
    const { data, error } = await supabase.rpc("get_zone_lieutenants", {
      p_zone_id: zoneId,
      p_player_id: playerId,
      p_night_date: effectiveNight,
    });
    if (error) throw error;
    console.log("get_zone_lieutenants payload →", {
      zoneId,
      playerId,
      zone_lieutenants: (data?.zone_lieutenants || []).map((lt) => ({
        id: lt.id,
        name: lt.name,
        can_deploy: lt.can_deploy,
        reason: lt.reason,
      })),
      other_my_lieutenants: (data?.other_my_lieutenants || []).map((lt) => ({
        id: lt.id,
        name: lt.name,
        can_deploy: lt.can_deploy,
        reason: lt.reason,
        current_zone_name: lt.current_zone_name,
      })),
    });
    return data || { zone_lieutenants: [], other_my_lieutenants: [] };
  } catch (err) {
    console.error("No se pudieron obtener los tenientes:", err);
    return { zone_lieutenants: [], other_my_lieutenants: [] };
  }
}

function isLieutenantDeployable(lt) {
  const val = lt?.can_deploy;
  if (val === undefined || val === null) return true;
  if (typeof val === "boolean") return val;
  if (typeof val === "number") return val !== 0;
  if (typeof val === "string") {
    return val.toLowerCase() === "true" || val === "1";
  }
  return Boolean(val);
}

function buildLieutenantCard(lt, options = {}) {
  const {
    showLocation = false,
    showDeploy = false,
    onDeploy,
    zoneLabel = null,
    richLayout = false,
  } = options;
  const card = document.createElement("div");
  card.className = "lieutenant-card";
  const canDeploy = isLieutenantDeployable(lt);
  const accentColor =
    lt.faction_color ||
    (lt.is_ally ? getCssVarValue("--color-red-accent") : null);
  if (accentColor) {
    card.style.borderColor = accentColor;
    card.style.backgroundColor = `${accentColor}1A`;
    card.style.boxShadow = `0 0 8px ${accentColor}55`;
  }
  if (richLayout) {
    card.classList.add("lieutenant-card-rich");
    card.innerHTML = `
      <div class="lieutenant-rich-header">
        <div class="lieutenant-rich-info">
          <strong>${lt.name || "Teniente"}</strong>
          <span class="lieutenant-mini-stats">💪 ${lt.phys_power || 0} · 🗣️ ${
      lt.soc_power || 0
    } · 🧠 ${lt.ment_power || 0}</span>
        </div>
        ${
          showDeploy
            ? `<button type="button" class="btn-secondary deploy-btn" ${
                canDeploy ? "" : "disabled"
              } title="${
                !canDeploy && lt.reason === "already_deployed_this_night"
                  ? "Este teniente ya fue desplegado esta noche"
                  : ""
              }">${
                canDeploy ? "Desplegar aquí" : "Ya se movió esta noche"
              }</button>`
            : ""
        }
      </div>
      <div class="lieutenant-rich-body">
        ${
          lt.image_url
            ? `<div class="lieutenant-rich-img"><img src="${
                lt.image_url
              }" alt="${lt.name || "Teniente"}"></div>`
            : ""
        }
        <div class="lieutenant-rich-text">
          ${lt.description ? `<p>${lt.description}</p>` : ""}
         
          
        </div>
      </div>
    `;
    if (showDeploy) {
      const btn = card.querySelector(".deploy-btn");
      btn.addEventListener("click", () => {
        if (btn.disabled) return;
        if (typeof onDeploy === "function") {
          onDeploy(lt);
        }
      });
    }
    return card;
  }
  const row = document.createElement("div");
  row.className = "lieutenant-minimal-row";
  row.innerHTML = `
    <div class="lieutenant-minimal">
      <span>${lt.name || "Teniente"}</span>
      <span class="lieutenant-mini-stats">💪 ${lt.phys_power || 0} · 🗣️ ${
    lt.soc_power || 0
  } · 🧠 ${lt.ment_power || 0}</span>
    </div>
  `;
  card.appendChild(row);
  const tooltip = document.createElement("div");
  tooltip.className = "lieutenant-tooltip";
  tooltip.innerHTML = `
    ${
      lt.image_url
        ? `<div class="lieutenant-tooltip-img"><img src="${
            lt.image_url
          }" alt="${lt.name || "Teniente"}"></div>`
        : ""
    }
    <div class="lieutenant-tooltip-body">
      <h3>${lt.name || "Teniente"}</h3>
      ${
        lt.faction_name
          ? `<p class="lieutenant-faction">Facción: <span style="color:${
              lt.faction_color || getCssVarValue("--color-red-accent")
            }">${lt.faction_name}</span></p>`
          : ""
      }
      ${lt.description ? `<p>${lt.description}</p>` : ""}
      <div class="stats"><span>💪 ${lt.phys_power || 0}</span><span>🗣️ ${
    lt.soc_power || 0
  }</span><span>🧠 ${lt.ment_power || 0}</span></div>
      <p><strong>📍 Desplegado en: </strong><span class="tooltip-zone">${
        showLocation
          ? lt.current_zone_name || "Sin zona asignada"
          : zoneLabel || "Zona actual"
      }</span></p>
    </div>
  `;
  card.appendChild(tooltip);
  if (showDeploy) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-secondary deploy-btn";
    btn.textContent = canDeploy ? "Desplegar aquí" : "Ya se movió esta noche";
    if (!canDeploy) {
      btn.disabled = true;
      btn.title =
        lt.reason === "already_deployed_this_night"
          ? "Este teniente ya fue desplegado esta noche"
          : "No se puede desplegar";
    }
    btn.addEventListener("click", () => {
      if (btn.disabled) return;
      if (typeof onDeploy === "function") {
        onDeploy(lt);
      }
    });
    row.appendChild(btn);
  }

  return card;
}

async function handleDeployLieutenant(lt, zoneId, zoneName, dlg) {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    alert("Necesitás iniciar sesión para desplegar un teniente.");
    return;
  }
  if (!window.currentNightDate) {
    alert("Seleccioná una fecha antes de desplegar un teniente.");
    return;
  }
  try {
    const { data, error } = await supabase.rpc("deploy_lieutenant", {
      p_player_id: playerId,
      p_lieutenant_id: lt.id,
      p_zone_id: zoneId,
      p_night_date: window.currentNightDate,
    });
    if (error) throw error;
    const updated = await fetchLieutenantsForZone(
      zoneId,
      window.currentNightDate
    );
    renderLieutenantPanelContent(dlg, zoneId, zoneName, updated);
    if (
      window.LastSelection?.current?.type === "zone" &&
      window.LastSelection.current.id === zoneId &&
      window.DetailView?.renderZone
    ) {
      window.DetailView.renderZone(zoneId);
    }
    console.log("Teniente desplegado. action_log_id:", data);
  } catch (err) {
    console.error("Error al desplegar teniente:", err);
    alert(
      err?.message || err?.error?.message || "No se pudo desplegar el teniente."
    );
  }
}

function renderLieutenantPanelContent(dlg, zoneId, zoneName, payload) {
  dlg.innerHTML = "";
  const header = document.createElement("div");
  header.className = "panel-header";
  header.innerHTML = `<h2>Desplegar Teniente en ${zoneName}</h2>`;
  const close = document.createElement("button");
  close.className = "panel-close";
  close.textContent = "×";
  close.addEventListener("click", () => dlg.close());
  header.appendChild(close);
  dlg.appendChild(header);

  const body = document.createElement("div");
  body.className = "panel-body lieutenants-panel";

  const zoneSection = document.createElement("section");
  zoneSection.className = "lieutenant-section";
  zoneSection.innerHTML = `<h3>Tenientes en esta zona</h3>`;
  const zoneList = document.createElement("div");
  zoneList.className = "lieutenant-list";
  if (payload.zone_lieutenants?.length) {
    payload.zone_lieutenants.forEach((lt) =>
      zoneList.appendChild(
        buildLieutenantCard(lt, {
          zoneLabel: zoneName || lt.zone_name,
          richLayout: true,
        })
      )
    );
  } else {
    zoneList.innerHTML = `<p class="muted">No hay tenientes en esta zona.</p>`;
  }
  zoneSection.appendChild(zoneList);
  body.appendChild(zoneSection);

  const otherSection = document.createElement("section");
  otherSection.className = "lieutenant-section";
  otherSection.innerHTML = `<h3>Tenientes en otras zonas</h3>`;
  const otherList = document.createElement("div");
  otherList.className = "lieutenant-groups";
  if (payload.other_my_lieutenants?.length) {
    const grouped = payload.other_my_lieutenants.reduce((acc, lt) => {
      const key = lt.current_zone_name || "Sin zona asignada";
      if (!acc[key]) acc[key] = [];
      acc[key].push(lt);
      return acc;
    }, {});
    Object.entries(grouped).forEach(([groupName, lieutenants]) => {
      const groupEl = document.createElement("div");
      groupEl.className = "lieutenant-group";
      groupEl.innerHTML = `<h4>${groupName}</h4>`;
      const groupList = document.createElement("div");
      groupList.className = "lieutenant-list";
      lieutenants.forEach((lt) =>
        groupList.appendChild(
          buildLieutenantCard(lt, {
            showLocation: true,
            showDeploy: true,
            onDeploy: () => handleDeployLieutenant(lt, zoneId, zoneName, dlg),
            zoneLabel: groupName,
            richLayout: true,
          })
        )
      );
      groupEl.appendChild(groupList);
      otherList.appendChild(groupEl);
    });
  } else {
    otherList.innerHTML = `<p class="muted">No tenés otros tenientes disponibles.</p>`;
  }
  otherSection.appendChild(otherList);
  body.appendChild(otherSection);

  dlg.appendChild(body);
}

async function openLieutenantPanel(zoneId, zoneName) {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    alert("Necesitás iniciar sesión para desplegar tenientes.");
    return;
  }
  const payload = await fetchLieutenantsForZone(
    zoneId,
    window.currentNightDate
  );
  const dlg =
    document.getElementById("panel-lieutenants") ||
    (() => {
      const d = document.createElement("dialog");
      d.id = "panel-lieutenants";
      d.className = "panel-actuar";
      document.body.appendChild(d);
      return d;
    })();
  renderLieutenantPanelContent(dlg, zoneId, zoneName, payload);
  dlg.showModal();
}

// -----------------------------------------------------------------------------
// Zone Renderer – lógica para dibujar el detalle de una Zona
// -----------------------------------------------------------------------------
/**
 * Renderiza el detalle de una **Zona** dentro del contenedor `.details`.
 *
 * Flujo:
 *   1) Asegura el contenedor y muestra un estado "Cargando...".
 *   2) Consulta la zona (`zones`) trayendo `id, name, description, image_url`.
 *      - Si falla (compatibilidad), cae a un select básico de `id, name`.
 *   3) Pinta encabezado, descripción e imagen.
 *   4) Calcula y muestra el **Estado** de la zona + barra de influencia.
 *   5) Añade (si corresponde) controles de admin y la toolbar de acciones.
 *
 * @param {string|number} id - ID de la zona a renderizar.
 * @returns {Promise<void>}
 */
window.DetailView.renderZone = async function (id) {
  const el = window.__ensureDetailsContainer();
  el.innerHTML = '<p class="detail-loading">Cargando...</p>';

  // Datos de la zona
  let data;
  try {
    const { data: full, error } = await supabase
      .from("zones")
      .select("id, name, description, image_url")
      .eq("id", id)
      .single();
    if (error) throw error;
    data = full;
  } catch (err) {
    console.warn("DetailView.renderZone fallback:", err?.message || err);
    const { data: basic, error: basicErr } = await supabase
      .from("zones")
      .select("id, name")
      .eq("id", id)
      .single();
    if (basicErr) {
      el.innerHTML = '<p class="detail-error">Error al cargar detalles.</p>';
      return;
    }
    data = { ...basic, description: null, image_url: null };
  }

  const description = data.description || "Sin descripción";
  const imageUrl = data.image_url || "images/zone_image_default.png";
  let locations = [];
  let zoneStatus = null;
  let lieutenantData = { zone_lieutenants: [], other_my_lieutenants: [] };
  try {
    const { data: locs, error: locErr } = await supabase
      .from("locations")
      .select("id, name")
      .eq("zone_id", id);
    if (locErr) throw locErr;
    locations = locs || [];
  } catch (err) {
    console.warn(
      "No se pudieron cargar las locaciones de la zona:",
      err?.message || err
    );
  }
  const currentGameId = window.currentGameId;
  if (
    window.zoneStatusCache &&
    window.zoneStatusCache.gameId === currentGameId
  ) {
    zoneStatus =
      window.zoneStatusCache.data?.find((row) => row.zone_id === id) || null;
  }
  if (!zoneStatus && currentGameId) {
    try {
      const { data: statusRow, error: statusErr } = await supabase
        .from("zone_status_view")
        .select("*")
        .eq("game_id", currentGameId)
        .eq("zone_id", id)
        .maybeSingle();
      if (statusErr) throw statusErr;
      zoneStatus = statusRow || null;
    } catch (err) {
      console.warn("No se pudo obtener zone_status_view:", err?.message || err);
    }
  }
  try {
    lieutenantData = await fetchLieutenantsForZone(id, window.currentNightDate);
  } catch (err) {
    console.warn("No se pudieron cargar los tenientes:", err?.message || err);
  }

  const wrapper = document.createElement("div");
  wrapper.innerHTML = `
    <div class="detail-header">
      <h2 class="detail-title">${data.name}</h2>
      <div id="detail-actions-slot"></div>
    </div>
    <div class="detail-body">
      <div class="detail-info">
        <p class="detail-desc">${description}</p>
        <div class="detail-state" id="detail-state-block"></div>
      </div>
      <div class="detail-image-container portrait">
        <img class="detail-img" src="${imageUrl}" alt="${data.name}" />
      </div>
    </div>
  `;
  const infoContainer = wrapper.querySelector(".detail-info");
  const stateBlock = wrapper.querySelector("#detail-state-block");
  if (zoneStatus && stateBlock) {
    let statusText = "Neutral";
    if (zoneStatus.control_state === "CONTROLLED") {
      statusText = "Controlada";
    } else if (zoneStatus.control_state === "DISPUTED") {
      statusText = "En disputa";
    }
    let colorPill = getCssVarValue("--zone-neutral");
    if (
      zoneStatus.control_state === "CONTROLLED" &&
      zoneStatus.controlling_color
    ) {
      colorPill = zoneStatus.controlling_color;
    } else if (zoneStatus.control_state === "DISPUTED") {
      colorPill = getCssVarValue("--zone-dispute");
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
    const cuadrillaPts = Number(zoneStatus.influence_cuadrilla) || 0;
    const loquilloPts = Number(zoneStatus.influence_loquillo) || 0;
    const rawNeutral = Number(zoneStatus.neutral);
    let neutralPts = Number.isFinite(rawNeutral)
      ? rawNeutral
      : Math.max(
          (Number(zoneStatus.influence_goal) || 0) -
            (cuadrillaPts + loquilloPts),
          0
        );
    if (neutralPts < 0) neutralPts = 0;
    const goal =
      Number(zoneStatus.influence_goal) ||
      Math.max(cuadrillaPts + loquilloPts + neutralPts, 1);
    const segments = [
      {
        label: cuadrillaMeta.name,
        color: cuadrillaMeta.color,
        value: cuadrillaPts,
      },
      {
        label: "Neutral",
        color: getCssVarValue("--zone-neutral"),
        value: neutralPts,
      },
      {
        label: loquilloMeta.name,
        color: loquilloMeta.color,
        value: loquilloPts,
      },
    ];
    const tooltipText = [
      `Total: ${goal}`,
      `Neutral: ${neutralPts}`,
      `Influencia de la Cuadrilla: ${cuadrillaPts}`,
      `Influencia de la Banda de Loquillo: ${loquilloPts}`,
    ].join("\n");
    const barHtml = `
      <div class="progress-widget compact" data-tooltip="${escapeAttr(
        tooltipText
      )}">
        <div class="progress-track">
          ${segments
            .map((seg) => {
              const width = Math.max(
                Math.min((seg.value / goal) * 100, 100),
                0
              );
              return `<div class="progress-segment" style="width:${width}%; background:${seg.color};"></div>`;
            })
            .join("")}
        </div>
      </div>
    `;
    const threshold = Number(zoneStatus.capture_threshold);
    const thresholdLabel = Number.isFinite(threshold)
      ? `Controlada a los <span style="color:white">${threshold}</span> puntos de influencia`
      : "";
    stateBlock.innerHTML = `
      <div class="zone-control-card">
        <div class="zone-control-header">
          <div class="detail-status-pill" style="background:${colorPill}"></div>
          <p class="detail-status">${statusText}</p>
          ${
            thresholdLabel
              ? `<span class="zone-threshold">${thresholdLabel}</span>`
              : ""
          }
        </div>
        ${barHtml}
      </div>
    `;
  }
  if (locations.length && infoContainer) {
    const locSection = document.createElement("div");
    locSection.className = "detail-locations";
    locSection.innerHTML = `
      <h3>Lugares</h3>
      <ul>
        ${locations.map((loc) => `<li>${loc.name}</li>`).join("")}
      </ul>
    `;
    infoContainer.appendChild(locSection);
  }

  if (infoContainer) {
    const ltSection = document.createElement("div");
    ltSection.className = "lieutenants-section zone";
    ltSection.innerHTML = `<h3>Tenientes en la zona</h3>`;
    const ltList = document.createElement("div");
    ltList.className = "lieutenant-list";
    if (lieutenantData.zone_lieutenants?.length) {
      lieutenantData.zone_lieutenants.forEach((lt) => {
        ltList.appendChild(
          buildLieutenantCard(lt, { zoneLabel: data.name || lt.zone_name })
        );
      });
    } else {
      ltList.innerHTML = `<p class="muted">Aún no hay tenientes en esta zona.</p>`;
    }
    ltSection.appendChild(ltList);
    infoContainer.appendChild(ltSection);
  }
  el.innerHTML = wrapper.innerHTML;

  // Toolbar acciones
  if (
    window.ActionsUI &&
    typeof window.ActionsUI.renderActionsToolbar === "function"
  ) {
    try {
      const actionsSlot = el.querySelector("#detail-actions-slot") || el;
      await window.ActionsUI.renderActionsToolbar("zone", id, actionsSlot, {
        zoneName: data.name,
      });
      const deployBtn = document.createElement("button");
      deployBtn.type = "button";
      deployBtn.className = "btn-secondary";
      deployBtn.textContent = "Desplegar Teniente";
      deployBtn.addEventListener("click", () =>
        openLieutenantPanel(id, data.name)
      );
      actionsSlot.appendChild(deployBtn);
    } catch (e) {
      console.warn("ActionsUI.renderActionsToolbar failed:", e);
    }
  }
};
