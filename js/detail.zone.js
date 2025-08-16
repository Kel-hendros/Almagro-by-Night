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

  let html = `
    <div class="detail-header">
      <h2 class="detail-title">${data.name}</h2>
      <span class="detail-icon" title="Zona">🔲</span>
    </div>
    <p class="detail-desc">${description}</p>
    <div class="detail-image-container">
      <img class="detail-img" src="${imageUrl}" alt="${data.name}" />
    </div>
  `;

  // Estado + barra
  try {
    const statuses = await loadZoneStatuses(
      window.currentGameId,
      window.currentTerritoryId
    );
    const status = statuses[id];
    if (status) {
      const statusLabel =
        {
          neutral: "Neutral",
          controlled: "Controlada",
          under_attack: "En disputa",
          contested: "Contested",
        }[status.status] || status.status;
      html += `<p class="detail-status"><strong>Estado:</strong> ${statusLabel}</p>`;
      const [f1, f2] = window.gameFactions;
      const pts1 = status.breakdown[f1.id] || 0;
      const pts2 = status.breakdown[f2.id] || 0;
      const ptsN = status.breakdown.neutral || 0;
      const bar = drawProgressBar({
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
      html += `<div class="detail-progress-bar">${bar}</div>`;
    }
  } catch (e) {
    console.warn("loadZoneStatuses falló:", e);
  }

  el.innerHTML = html;

  // Toolbar acciones
  if (
    window.ActionsUI &&
    typeof window.ActionsUI.renderActionsToolbar === "function"
  ) {
    try {
      await window.ActionsUI.renderActionsToolbar("zone", id, el, {
        zoneName: data.name,
      });
    } catch (e) {
      console.warn("ActionsUI.renderActionsToolbar failed:", e);
    }
  }
};
