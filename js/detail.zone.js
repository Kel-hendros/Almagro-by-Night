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

function normalizeNightDate(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString().split("T")[0];
}

async function fetchLieutenantsForZone(zoneId, nightDate) {
  const playerId = await getCurrentPlayerId();
  const effectiveNight = normalizeNightDate(
    nightDate || window.currentNightDate
  );
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
    card.style.boxShadow = `0 0 10px ${accentColor}55`;
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
    
    <span>${lt.name || "Teniente"}</span>
    <span class="lieutenant-mini-faction" style="color:${
      lt.faction_color || "#FF0000"
    }">${lt.faction_name || "Facción"}</span>
    <span class="lieutenant-mini-stats">💪 ${lt.phys_power || 0} · 🗣️ ${
    lt.soc_power || 0
  } · 🧠 ${lt.ment_power || 0}</span>
    
  `;
  card.appendChild(row);
  card.appendChild(row);

  // Click handler for modal
  card.addEventListener("click", (e) => {
    // Prevent if clicking on a button inside the card
    if (e.target.tagName === "BUTTON") return;
    showLieutenantModal(lt, options);
  });

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
    btn.addEventListener("click", (e) => {
      e.stopPropagation(); // Prevent card click
      if (btn.disabled) return;
      if (typeof onDeploy === "function") {
        onDeploy(lt);
      }
    });
    row.appendChild(btn);
  }

  return card;
}

function showLieutenantModal(lt, options = {}) {
  const { showLocation = false, zoneLabel = null } = options;

  let dialog = document.getElementById("lieutenant-detail-modal");
  if (!dialog) {
    dialog = document.createElement("dialog");
    dialog.id = "lieutenant-detail-modal";
    dialog.className = "lieutenant-modal";
    document.body.appendChild(dialog);

    // Close on backdrop click
    dialog.addEventListener("click", (e) => {
      const rect = dialog.getBoundingClientRect();
      const isInDialog =
        rect.top <= e.clientY &&
        e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX &&
        e.clientX <= rect.left + rect.width;
      if (!isInDialog) {
        dialog.close();
      }
    });
  }

  const accentColor = lt.faction_color || getCssVarValue("--color-red-accent");

  dialog.innerHTML = `
<div class="modal-content" style="border-color:${accentColor}">
  <!-- Botón cerrar arriba a la derecha -->
  <button
    class="modal-close-btn"
    onclick="document.getElementById('lieutenant-detail-modal').close()"
  >
    ×
  </button>

  <!-- Contenedor principal en dos columnas -->
  <div class="modal-container">
    
    <!-- COLUMNA IZQUIERDA: texto -->
    <div class="modal-column modal-column-left">
      <div class="modal-header">
        <div class="modal-title-block">
          <h2>${lt.name || "Teniente"}</h2>
          <p class="modal-faction" style="color:${accentColor}">
            ${lt.faction_name || "Facción"}
          </p>
        </div>
      </div>

      <div class="modal-body">
        ${lt.description ? `<p class="modal-desc">${lt.description}</p>` : ""}

        <div class="modal-stats">
          <div class="stat-item">
            <span>💪</span>
            <strong>${lt.phys_power || 0}</strong>
            <small>Físico</small>
          </div>
          <div class="stat-item">
            <span>🗣️</span>
            <strong>${lt.soc_power || 0}</strong>
            <small>Social</small>
          </div>
          <div class="stat-item">
            <span>🧠</span>
            <strong>${lt.ment_power || 0}</strong>
            <small>Mental</small>
          </div>
        </div>

        <div class="modal-location">
          <strong>📍 Ubicación actual:</strong>
          <span>${
            showLocation
              ? lt.current_zone_name || "Sin zona asignada"
              : zoneLabel || "Zona actual"
          }</span>
        </div>
      </div>
    </div>

    <!-- COLUMNA DERECHA: imagen -->
    <div class="modal-column modal-column-right">
      ${
        lt.image_url
          ? `<div class="modal-img">
               <img src="${lt.image_url}" alt="${lt.name || "Teniente"}">
             </div>`
          : ""
      }
    </div>

  </div>
</div>

  `;

  dialog.showModal();
}

async function handleDeployLieutenant(lt, zoneId, zoneName, dlg) {
  const playerId = await getCurrentPlayerId();
  if (!playerId) {
    alert("Necesitás iniciar sesión para desplegar un teniente.");
    return;
  }
  const effectiveNight = normalizeNightDate(window.currentNightDate);
  if (!effectiveNight) {
    alert("Seleccioná una fecha antes de desplegar un teniente.");
    return;
  }
  try {
    const { data, error } = await supabase.rpc("deploy_lieutenant", {
      p_player_id: playerId,
      p_lieutenant_id: lt.id,
      p_zone_id: zoneId,
      p_night_date: effectiveNight,
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
      .select("id, name, description, image_url, benefits")
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
  wrapper.className = "detail-wrapper";

  // Header
  const header = document.createElement("div");
  header.className = "detail-header";
  header.innerHTML = `
      <h2 class="detail-title">${data.name}</h2>
      <div id="detail-actions-slot"></div>
  `;
  wrapper.appendChild(header);

  // Tabs Container
  const tabsContainer = document.createElement("div");
  tabsContainer.className = "tab-buttons";

  const tabs = [
    { id: "info", label: "Información", icon: "ℹ️" },
    { id: "lieutenants", label: "Tenientes", icon: "♟️" },
    { id: "benefits", label: "Beneficios", icon: "🏆" },
  ];

  let activeTabId = "info";

  tabs.forEach((tab) => {
    const btn = document.createElement("button");
    btn.className = `tab-chip ${tab.id === activeTabId ? "active" : ""}`;
    btn.innerHTML = `${tab.label}`;
    btn.onclick = () => {
      // Switch tabs
      wrapper
        .querySelectorAll(".tab-chip")
        .forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      wrapper
        .querySelectorAll(".tab-content")
        .forEach((c) => c.classList.remove("active"));
      const target = wrapper.querySelector(`#tab-${tab.id}`);
      if (target) target.classList.add("active");
    };
    tabsContainer.appendChild(btn);
  });
  wrapper.appendChild(tabsContainer);

  // --- Tab 1: Información ---
  const tabInfo = document.createElement("div");
  tabInfo.id = "tab-info";
  tabInfo.className = "tab-content active";
  tabInfo.innerHTML = `
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
  wrapper.appendChild(tabInfo);

  // --- Tab 2: Tenientes ---
  const tabLieutenants = document.createElement("div");
  tabLieutenants.id = "tab-lieutenants";
  tabLieutenants.className = "tab-content";
  // Se llenará dinámicamente
  wrapper.appendChild(tabLieutenants);

  const buildDeployLieutenantCard = () => {
    const card = document.createElement("div");
    card.className = "lieutenant-card lieutenant-card-add";
    card.innerHTML = `
      <div class="lieutenant-add-icon">+</div>
      <div class="lieutenant-add-text">Desplegar Teniente</div>
    `;
    card.addEventListener("click", () =>
      openLieutenantPanel(id, data.name || "")
    );
    return card;
  };

  // --- Tab 3: Beneficios ---
  const tabBenefits = document.createElement("div");
  tabBenefits.id = "tab-benefits";
  tabBenefits.className = "tab-content";
  if (data.benefits) {
    const isControlled = zoneStatus?.control_state === "CONTROLLED";
    const controllingColor = isControlled
      ? zoneStatus.controlling_color || "#fff"
      : "transparent";
    const checkStyle = isControlled
      ? `background-color: ${controllingColor}; border-color: ${controllingColor};`
      : "";
    // Checkmark only if controlled
    const checkContent = isControlled ? "✓" : "";

    tabBenefits.innerHTML = `
      <div class="benefit-card">
        <div class="benefit-text">${data.benefits}</div>
        <div class="benefit-status">
          <div class="benefit-checkbox" style="${checkStyle}" title="${
      isControlled ? "Beneficio activo" : "Beneficio inactivo"
    }">
            ${checkContent}
          </div>
        </div>
      </div>
    `;
  } else {
    tabBenefits.innerHTML = `<p class="muted" style="padding: 20px; text-align: center;">No hay beneficios por capturar esta zona.</p>`;
  }
  wrapper.appendChild(tabBenefits);

  // Lógica para poblar el Tab de Información (Estado y Locaciones)
  const infoContainer = tabInfo.querySelector(".detail-info");
  const stateBlock = tabInfo.querySelector("#detail-state-block");

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
      ? `Objetivo: <span style="color:white">${threshold}</span> puntos de influencia`
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

  // Lógica para poblar el Tab de Tenientes
  const ltSection = document.createElement("div");
  ltSection.className = "lieutenants-section zone";
  if (!lieutenantData.zone_lieutenants?.length) {
    const empty = document.createElement("div");
    empty.className = "lieutenant-empty";
    empty.innerHTML = `<p class="muted">No hay tenientes en esta zona.</p>`;
    ltSection.appendChild(empty);
  }
  const ltList = document.createElement("div");
  ltList.className = "lieutenant-list";
  if (lieutenantData.zone_lieutenants?.length) {
    lieutenantData.zone_lieutenants.forEach((lt) => {
      ltList.appendChild(
        buildLieutenantCard(lt, { zoneLabel: data.name || lt.zone_name })
      );
    });
  }
  ltList.appendChild(buildDeployLieutenantCard());
  ltSection.appendChild(ltList);
  tabLieutenants.appendChild(ltSection);

  el.innerHTML = "";
  el.appendChild(wrapper);

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
    } catch (e) {
      console.warn("ActionsUI.renderActionsToolbar failed:", e);
    }
  }
};
