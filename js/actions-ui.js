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
  function formatNightDate(dateStr) {
    if (!dateStr) return "—";
    const date = new Date(dateStr);
    if (Number.isNaN(date.getTime())) return dateStr;
    return date.toLocaleDateString("es-AR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  }

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
  async function fetchAvailableActions(playerId, nightDate, zoneId) {
    if (!playerId || !nightDate || !zoneId) return [];
    const { data, error } = await supabase.rpc("available_actions_full", {
      p_player_id: playerId,
      p_night_date: nightDate,
      p_zone_id: zoneId,
    });
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

  function getAttributeLabel(attrType) {
    switch (attrType) {
      case "FISICO":
        return "Acciones Físicas";
      case "SOCIAL":
        return "Acciones Sociales";
      case "MENTAL":
        return "Acciones Mentales";
      default:
        return "Otras acciones";
    }
  }

  function parseActionEffect(action) {
    const effect = action?.effect || {};
    const requires = Array.isArray(effect.requires) ? effect.requires : [];
    return {
      type: effect.type || null,
      requires,
      needsZone: requires.includes("zone"),
      needsLocation: requires.includes("location"),
      needsAmount: requires.includes("amount"),
    };
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

    const { playerId } = await getCurrentUserAndPlayer();
    if (!window.currentNightDate) {
      alert("Seleccioná una fecha en el calendario antes de actuar.");
      return;
    }

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
    h2.innerHTML = `Realiza una acción en <span class="actions-target-name">${name}</span> el ${formatNightDate(
      window.currentNightDate
    )}`;
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
    const actions = await fetchAvailableActions(
      playerId,
      window.currentNightDate,
      zoneId || locationId
    );
    if (!actions.length) {
      right.innerHTML = `<p class="muted">No hay acciones disponibles.</p>`;
    }

    const groupedByAttr = groupByAttribute(actions);
    const attrOrder = ["FISICO", "SOCIAL", "MENTAL"];
    attrOrder.forEach((attr) => {
      const listForAttr = groupedByAttr[attr] || [];
      if (!listForAttr.length) return;
      const section = document.createElement("section");
      section.className = "cost-group";
      const h = document.createElement("h3");
      h.textContent = getAttributeLabel(attr);
      section.appendChild(h);

      const list = document.createElement("div");
      list.className = "actions-list";

      listForAttr.sort(sortActions).forEach((action) => {
        const card = document.createElement("button");
        card.type = "button";
        card.className = "action-card";
        if (action.is_available === false) {
          card.classList.add("action-card-unavailable");
        }
        const apCost = Number(action.ap_cost) || 1;
        const durationLabel = apCost >= 2 ? "Toma 1 noche" : "Toma media noche";
        const durationDisplay = apCost >= 2 ? "1" : "1/2";
        card.innerHTML = `
          <div class="ac-head">
            <span class="action-info">
              ${getTypeIcon(action.attribute_type)} <strong>${esc(
          action.name
        )}</strong>
            </span>
            <span class="action-duration" title="${durationLabel}">⌛ ${durationDisplay}</span>
          </div>
          <div class="ac-sub">${esc(action.attribute_name || "")} + ${esc(
          action.skill_name || ""
        )} · Dif ${esc(action.base_difficulty ?? "?")}</div>
        `;
        card.addEventListener("click", () =>
          renderActionDetail(
            right,
            action,
            { type, id, zoneId, locationId },
            { playerId }
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
    const { playerId } = ctx;
    const requirements = parseActionEffect(action);
    const needsAmount = requirements.needsAmount;
    const needsZone = requirements.needsZone;
    const needsLocation = requirements.needsLocation;
    const targetZoneId =
      target.type === "zone" ? target.id : target.zoneId || null;
    const targetLocationId =
      target.type === "location" ? target.id : target.locationId || null;
    const hasZoneTarget = Boolean(targetZoneId);
    const hasLocationTarget = Boolean(targetLocationId);
    const targetError =
      hasZoneTarget && hasLocationTarget
        ? "Seleccioná sólo una zona o locación como objetivo."
        : !hasZoneTarget && !hasLocationTarget
        ? "Debés seleccionar una zona o locación válida."
        : "";
    const missingZone = needsZone && !hasZoneTarget;
    const missingLocation = needsLocation && !hasLocationTarget;

    container.innerHTML = `
      <div class="detail-wrap">
        <h1>${getTypeIcon(action.attribute_type)} ${esc(action.name)}</h1>
        <p class="primary"> ${esc(action.attribute_name || "")} + ${esc(
      action.skill_name || ""
    )} · Dif ${esc(action.base_difficulty ?? "?")}</p>
        <p>${esc(action.description || "")}</p>
        <p class="action-duration-detail">
          ⌛ ${
            Number(action.ap_cost) >= 2
              ? "Toma una noche completa realizar esta acción"
              : "Toma media noche realizar esta acción"
          }
        </p>
        ${
          action.is_available === false
            ? `<p class="action-warning">${
                action.reason === "COOLDOWN"
                  ? "Esta acción está bloqueada por cooldown."
                  : "Esta acción no se puede realizar esta noche."
              }</p>`
            : ""
        }
        ${
          action.image
            ? (() => {
                const url = action.image;
                if (url.toLowerCase().endsWith(".mp4")) {
                  return `
              <div class="img-wrap">
                <video autoplay loop muted playsinline>
                  <source src="${esc(url)}" type="video/mp4">
                </video>
              </div>
            `;
                } else {
                  return `
              <div class="img-wrap">
                <img alt="Imagen de la acción" src="${esc(url)}">
              </div>
            `;
                }
              })()
            : ""
        }
        ${
          missingZone || missingLocation || targetError
            ? `<p class="warning">${
                targetError ||
                `Esta acción requiere seleccionar ${
                  missingZone && missingLocation
                    ? "una zona y una locación"
                    : missingZone
                    ? "una zona válida"
                    : "una locación válida"
                }.`
              }</p>`
            : ""
        }
        <div class="action-controls">
          ${
            needsAmount
              ? `<div class="form-row inline">
                  <label>Influencia ganada:
                    <input type="number" class="influence-input" min="1" step="1" placeholder="1">
                  </label>
                </div>`
              : ""
          }
          <div class="actions">
            <button type="button" class="btn-apply" disabled>Aplicar</button>
          </div>
        </div>
      </div>
    `;

    const input = container.querySelector(".influence-input");
    const btn = container.querySelector(".btn-apply");

    function validate() {
      const infl = parseInt(input?.value || "", 10);
      const inflOk = needsAmount ? Number.isInteger(infl) && infl > 0 : true;
      const dateOk = !!window.currentNightDate;
      const targetOk =
        !targetError &&
        !missingZone &&
        !missingLocation &&
        (hasZoneTarget || hasLocationTarget);
      const availableOk = action.is_available !== false;
      btn.disabled = !(inflOk && playerId && dateOk && targetOk && availableOk);
      btn.title = "";
    }
    if (input) input.addEventListener("input", validate);
    validate();

    btn.addEventListener("click", async () => {
      if (btn.disabled) return;
      if (targetError) {
        alert(targetError);
        return;
      }
      const infl = parseInt(input?.value || "0", 10) || 0;
      const resolvedAmount = needsAmount ? infl : 0;
      const details = {
        zone_id: hasZoneTarget && !hasLocationTarget ? targetZoneId : null,
        location_id:
          hasLocationTarget && !hasZoneTarget ? targetLocationId : null,
        amount: resolvedAmount,
        skill_name: action.skill_name || "",
        action_name: action.name || "",
        attribute_name: action.attribute_name || "",
        attribute_type: action.attribute_type || "",
        base_difficulty:
          typeof action.base_difficulty === "number"
            ? action.base_difficulty
            : null,
      };
      console.log("RPC CALL → perform_action payload:", {
        p_player_id: playerId,
        p_action_id: action.id,
        p_night_date: window.currentNightDate,
        p_details: details,
      });
      const { error: rpcError } = await supabase.rpc("perform_action", {
        p_player_id: playerId,
        p_action_id: action.id,
        p_night_date: window.currentNightDate,
        p_details: details,
      });

      if (rpcError) {
        console.error("RPC perform_action error:", rpcError);
        alert(
          "No se pudo aplicar la acción (RPC).\n" +
            (rpcError.message || "Error desconocido")
        );
        return;
      }

      try {
        if (window.zoneStatusCache) {
          window.zoneStatusCache = null;
        }
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
      if (typeof window.refreshActionLogPanel === "function") {
        window.refreshActionLogPanel();
      }
    });
  }
  async function renderActionsToolbar(type, id, containerEl, opts = {}) {
    const wrapper = document.createElement("div");
    wrapper.className = "actions-toolbar";
    const btn = document.createElement("button");
    btn.className = "btn-primary";
    btn.textContent = type === "zone" ? "Actuar en la Zona" : "Ver acciones";
    btn.addEventListener("click", () =>
      openActionsPanel(type, id, opts.name || opts.zoneName || "")
    );
    wrapper.appendChild(btn);
    containerEl.appendChild(wrapper);
  }

  return {
    renderActionsToolbar,
    openActionsPanel,
  };
})();
