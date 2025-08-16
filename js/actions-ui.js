// Expuesto como API global sin módulos
window.ActionsUI = (function () {
  function esc(s) {
    return String(s ?? "").replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#39;",
        }[c])
    );
  }
  // === Utils ===
  async function getCurrentUserAndPlayer() {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { user: null, playerId: null };
    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    return { user, playerId: player?.id || null };
  }

  // CSS helper: .influence-input for styling numeric input of influence

  // Trae acciones disponibles para una zona/locación (con exclusividad opcional)
  async function fetchAvailableActions(zoneId, locationId) {
    const ors = [
      "and(exclusive_zone_id.is.null,exclusive_location_id.is.null)",
      zoneId ? `exclusive_zone_id.eq.${zoneId}` : null,
      locationId ? `exclusive_location_id.eq.${locationId}` : null,
    ]
      .filter(Boolean)
      .join(",");
    const { data, error } = await supabase
      .from("actions")
      .select("*")
      .or(ors)
      .order("attribute_type", { ascending: true })
      .order("name", { ascending: true });
    if (error) {
      console.error("fetchAvailableActions error:", error);
      return [];
    }
    return data || [];
  }

  function groupByAttribute(actions) {
    const groups = { FISICO: [], SOCIAL: [], MENTAL: [] };
    actions.forEach((a) => {
      (groups[a.attribute_type] || (groups[a.attribute_type] = [])).push(a);
    });
    return groups;
  }

  function getTypeIcon(attrType) {
    switch (attrType) {
      case "FISICO":
        return "💪";
      case "SOCIAL":
        return "🗣️";
      case "MENTAL":
        return "🧠";
      default:
        return "•";
    }
  }

  function groupByCost(actions) {
    const g = {};
    actions.forEach((a) => {
      const cost =
        Number.isFinite(Number(a.ap_cost)) && Number(a.ap_cost) > 0
          ? Number(a.ap_cost)
          : 1;
      (g[cost] || (g[cost] = [])).push(a);
    });
    return g;
  }
  function sortActions(a, b) {
    const order = { FISICO: 0, SOCIAL: 1, MENTAL: 2 };
    const ao = order[a.attribute_type] ?? 3;
    const bo = order[b.attribute_type] ?? 3;
    if (ao !== bo) return ao - bo;
    return String(a.name).localeCompare(String(b.name));
  }

  async function openActionsPanel(type, id, name, opts = {}) {
    const zoneId = type === "zone" ? id : null;
    const locationId = type === "location" ? id : null;
    // Recordar selección actual (por si abrís el modal desde el detalle)
    if (
      window.LastSelection &&
      typeof window.LastSelection.set === "function"
    ) {
      window.LastSelection.set({ type, id });
    }

    const { id: playerId, remainingAP: remaining } = window.currentPlayer;

    // Ensure dialog
    const dlg =
      document.getElementById("panel-actuar") ||
      (() => {
        const d = document.createElement("dialog");
        d.id = "panel-actuar";
        d.className = "panel-actuar"; // para estilos grandes a pantalla
        document.body.appendChild(d);
        return d;
      })();
    dlg.innerHTML = "";

    // Header
    const header = document.createElement("div");
    header.className = "panel-header";
    const h2 = document.createElement("h2");
    h2.innerHTML = `Acciones en <span class="actions-target-name">${name}</span>`;
    const close = document.createElement("button");
    close.className = "panel-close";
    close.textContent = "×";
    close.addEventListener("click", () => dlg.close());
    header.appendChild(h2);
    header.appendChild(close);

    // Body split
    const body = document.createElement("div");
    body.className = "panel-body";
    const left = document.createElement("div");
    left.className = "actions-left";
    const right = document.createElement("div");
    right.className = "actions-right";
    right.innerHTML = `<p class="muted">Elegí una acción para ver el detalle.</p>`;

    body.appendChild(left);
    body.appendChild(right);
    dlg.appendChild(header);
    dlg.appendChild(body);

    // Load actions
    const actions = await fetchAvailableActions(zoneId, locationId);
    if (!actions.length) {
      right.innerHTML = `<p class="muted">No hay acciones disponibles.</p>`;
    }

    // Group by cost and render
    const grouped = groupByCost(actions);
    const costs = Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b);

    costs.forEach((cost) => {
      const section = document.createElement("section");
      section.className = "cost-group";
      const h = document.createElement("h3");
      h.textContent = `Coste ${cost}`;
      section.appendChild(h);

      const list = document.createElement("div");
      list.className = "actions-list";

      grouped[cost].sort(sortActions).forEach((action) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "action-card";
        card.innerHTML = `
          <div class="ac-head">${getTypeIcon(
            action.attribute_type
          )} <strong>${esc(action.name)}</strong></div>
          <div class="ac-sub">${esc(action.attribute_name || "")} + ${esc(
          action.skill_name || ""
        )} · Dif ${esc(action.base_difficulty ?? "?")}</div>
        `;
        card.addEventListener("click", () =>
          renderActionDetail(
            right,
            action,
            { type, id },
            { playerId, remaining }
          )
        );
        list.appendChild(card);
      });
      section.appendChild(list);
      left.appendChild(section);
    });

    dlg.showModal();
  }

  function renderActionDetail(container, action, target, ctx) {
    const { playerId, remaining } = ctx;
    const apCost =
      Number.isFinite(Number(action.ap_cost)) && Number(action.ap_cost) > 0
        ? Number(action.ap_cost)
        : 1;

    container.innerHTML = `
      <div class="detail-wrap">
        <h1>${getTypeIcon(action.attribute_type)} ${esc(action.name)}</h1>
        <p class="muted"> ${esc(action.attribute_name || "")} + ${esc(
      action.skill_name || ""
    )} · Dif ${esc(action.base_difficulty ?? "?")}</p>
        <p>${esc(action.description || "")}</p>
        <div class="img-placeholder" aria-hidden="true"></div>
        <div class="form-row">
          <label>Influencia obtenida
            <input type="number" class="influence-input" min="0" step="1" placeholder="0">
          </label>
        </div>
        <div class="form-row note">Coste de acción: ${apCost} PA · Disponibles: ${remaining}</div>
        <div class="actions">
          <button type="button" class="btn-apply" disabled>Aplicar</button>
        </div>
      </div>
    `;

    const input = container.querySelector(".influence-input");
    const btn = container.querySelector(".btn-apply");

    function validate() {
      const infl = parseInt(input.value || "", 10);
      const inflOk = Number.isInteger(infl) && infl >= 0;
      const apOk = remaining >= apCost;
      btn.disabled = !(inflOk && apOk && playerId && window.currentNightId);
      btn.title = !apOk
        ? `Te faltan PA: necesitas ${apCost} y tenés ${remaining}`
        : "";
    }
    input.addEventListener("input", validate);
    validate();

    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      const infl = parseInt(input.value || "0", 10) || 0;

      const details = {
        attribute_type: action.attribute_type,
        attribute_name: action.attribute_name,
        skill_name: action.skill_name,
        base_difficulty: action.base_difficulty,
        ap_cost: apCost,
        influence_gain: infl,
        action_name: action.name,
      };

      const { error: rpcError } = await supabase.rpc(
        "apply_action_and_influence",
        {
          p_game_id: window.currentGameId,
          p_night_id: window.currentNightId,
          p_player_id: playerId,
          p_zone_id: target.type === "zone" ? target.id : null,
          p_action_id: action.id,
          p_ap_cost: apCost,
          p_influence_gain: infl,
          p_details: JSON.stringify(details),
        }
      );

      if (rpcError) {
        console.error("RPC apply_action_and_influence error:", rpcError);
        alert(
          "No se pudo aplicar la acción (RPC).\n" +
            (rpcError.message || "Error desconocido")
        );
        return;
      }

      // Refrescar todo y restaurar la selección (detalle + highlight)
      try {
        if (typeof window.refreshAllAndRestore === "function") {
          await window.refreshAllAndRestore();
        } else if (typeof refreshUI === "function") {
          await refreshUI(target.type, target.id);
        }
      } catch (e) {
        /* noop */
      }

      const dlg = document.getElementById("panel-actuar");
      if (dlg?.open) dlg.close();
    });
  }

  async function renderActionsToolbar(type, id, containerEl, opts = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "actions-toolbar";
    const title = document.createElement("h3");
    title.textContent = "Acciones";
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = type === "zone" ? "Actuar en la Zona" : "Ver acciones";
    btn.addEventListener("click", () =>
      openActionsPanel(type, id, opts.name || opts.zoneName || "")
    );

    // Deshabilitar el botón si el jugador no tiene PA
    if (window.currentPlayer && window.currentPlayer.remainingAP <= 0) {
      btn.disabled = true;
      btn.title = "No te quedan Puntos de Acción.";
    }

    wrapper.appendChild(title);
    wrapper.appendChild(btn);
    containerEl.appendChild(wrapper);
  }

  // Modal para ejecutar la acción (elige PA y confirma)
  async function openActionModal(action, target) {
    const { id: playerId, remainingAP: remaining } = window.currentPlayer;

    const dlg =
      document.getElementById("panel-apply-influence") ||
      (() => {
        const d = document.createElement("dialog");
        d.id = "panel-apply-influence";
        document.body.appendChild(d);
        return d;
      })();
    dlg.innerHTML = "";

    const panel = document.createElement("div");
    panel.className = "apply-influence-container";

    const canOperate = !!playerId && !!window.currentNightId;
    const warn = !playerId
      ? "No se pudo identificar al jugador (playerId)."
      : !window.currentNightId
      ? "No hay una 'noche' activa (currentNightId)."
      : "";

    // Costo por acción (nuevo campo en acciones; default 1 si no existe)
    const apCost =
      Number.isFinite(Number(action.ap_cost)) && Number(action.ap_cost) > 0
        ? Number(action.ap_cost)
        : 1;

    panel.innerHTML = `
      <h1>${esc(action.name)}</h1>
      
      <p class="desc">${esc(action.description || "")}</p>

      
      ${
        warn
          ? `<p class="warning" style="color:#b00"><strong>Atención:</strong> ${esc(
              warn
            )}</p>`
          : ""
      }

      <label class="influence-label" style="display:block;margin-top:8px;">
        Influencia obtenida
        <input type="number" class="influence-input" min="0" step="1" placeholder="0" style="width:120px;margin-left:8px;">
      </label>

      <div class="panel-buttons">
        <button type="button" class="btn-cancel">Cancelar</button>
        <button type="button" class="btn-accept" disabled>Aceptar</button>
      </div>
    `;

    // Wire buttons
    const cancel = panel.querySelector(".btn-cancel");
    cancel.addEventListener("click", () => dlg.close());
    const accept = panel.querySelector(".btn-accept");
    const inflInput = panel.querySelector(".influence-input");

    // Helper: build payload & show preview
    function buildPayload() {
      const infl = parseInt(inflInput.value || "", 10);
      return {
        night_id: window.currentNightId || null,
        player_id: playerId || null,
        action_type: action.name || "zone_action",
        target_zone_id: target.type === "zone" ? target.id : null,
        target_location_id: target.type === "location" ? target.id : null,
        cost_units: apCost,
        action_id: action.id,
        result_status: null,
        result_details: JSON.stringify({
          attribute_type: action.attribute_type,
          attribute_name: action.attribute_name,
          skill_name: action.skill_name,
          base_difficulty: action.base_difficulty,
          ap_cost: apCost,
          influence_gain: Number.isFinite(infl) ? infl : null,
        }),
      };
    }

    function validateAndToggle() {
      const infl = parseInt(inflInput.value || "", 10);
      const inflOk = Number.isInteger(infl) && infl >= 0; // permitir 0 si querés anotar fallo
      const apOk = remaining >= apCost;
      accept.disabled = !(canOperate && inflOk && apOk);
      // Mensaje si no alcanza PA
      if (!apOk) {
        accept.title = `Te faltan PA: necesitas ${apCost} y tenés ${remaining}`;
      } else {
        accept.title = "";
      }
    }

    inflInput.addEventListener("input", validateAndToggle);

    // Hook accept
    accept.addEventListener("click", async () => {
      if (accept.disabled) return;
      const payload = buildPayload();
      const { error } = await supabase.from("actions_log").insert(payload);
      if (error) {
        console.error("Error inserting action log:", error);
        alert("No se pudo registrar la acción.");
        return;
      }
      dlg.close();
      try {
        await refreshUI(target.type, target.id);
      } catch (e) {
        console.warn("refreshUI no disponible:", e);
      }
    });

    dlg.appendChild(panel);
    validateAndToggle();
    dlg.showModal();
  }

  return {
    renderActionsToolbar,
    openActionsPanel,
  };
})();
