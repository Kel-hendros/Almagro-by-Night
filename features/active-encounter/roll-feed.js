(function initAERollFeed(global) {
  const DISMISS_MS = 15000;
  const MAX_NOTIFICATIONS = 10;

  let feedEl = null;
  let channel = null;
  let notifications = [];
  let currentEncounterId = null;

  function getSupabase() {
    return global.supabase || null;
  }

  function create(encounterId) {
    if (!encounterId) return;
    currentEncounterId = encounterId;

    feedEl = document.createElement("div");
    feedEl.className = "ae-roll-feed";
    var mapArea = document.getElementById("ae-map-container");
    if (mapArea) {
      mapArea.appendChild(feedEl);
    }

    var sb = getSupabase();
    if (!sb) return;

    channel = sb
      .channel("encounter-rolls-" + encounterId)
      .on("broadcast", { event: "dice-roll" }, function (msg) {
        if (msg.payload) addNotification(msg.payload);
      })
      .subscribe();
  }

  function addNotification(data) {
    if (!feedEl) return;
    var id = data.id || crypto.randomUUID();
    var el = buildNotificationEl(id, data);

    feedEl.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add("ae-roll-notif-enter");
    });

    var timer = setTimeout(function () {
      dismiss(id);
    }, DISMISS_MS);
    notifications.push({ id: id, el: el, timer: timer });

    while (notifications.length > MAX_NOTIFICATIONS) {
      var oldest = notifications.shift();
      clearTimeout(oldest.timer);
      oldest.el.remove();
    }

    feedEl.scrollTop = feedEl.scrollHeight;
  }

  function dismiss(id) {
    var idx = -1;
    for (var i = 0; i < notifications.length; i++) {
      if (notifications[i].id === id) {
        idx = i;
        break;
      }
    }
    if (idx === -1) return;
    var notif = notifications[idx];
    clearTimeout(notif.timer);
    notif.el.classList.add("ae-roll-notif-exit");
    notif.el.addEventListener(
      "animationend",
      function () {
        notif.el.remove();
      },
      { once: true },
    );
    notifications.splice(idx, 1);
  }

  function buildNotificationEl(id, data) {
    var el = document.createElement("div");
    el.className = "ae-roll-notif ae-roll-notif--" + (data.status || "success");
    el.dataset.rollId = id;

    if (data.rollType === "initiative") {
      el.innerHTML = buildInitiativeHTML(data);
    } else {
      el.innerHTML = buildDiceRollHTML(data);
    }

    var closeBtn = el.querySelector(".ae-roll-notif-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        dismiss(id);
      });
    }

    var toggleBtn = el.querySelector(".ae-roll-notif-toggle");
    var detail = el.querySelector(".ae-roll-notif-detail");
    if (toggleBtn && detail) {
      toggleBtn.addEventListener("click", function () {
        var isExpanded = !detail.classList.contains("ae-hidden");
        detail.classList.toggle("ae-hidden");
        toggleBtn.textContent = isExpanded ? "Ver detalle \u25BE" : "Ocultar \u25B4";
      });
    }

    return el;
  }

  function buildDiceRollHTML(data) {
    var name = esc(data.characterName || "???");
    var hasAvatar = !!data.avatarUrl;
    var avatarSide = hasAvatar
      ? '<img class="ae-roll-notif-portrait" src="' +
        esc(data.avatarUrl) +
        '" alt="">'
      : "";

    var poolLabel =
      data.rollName ||
      [data.pool1, data.pool2].filter(Boolean).join(" + ") ||
      "Tirada";
    var poolCount = (data.totalPool || "?") + "d10";

    var mods = [];
    if (data.willpower) mods.push("Voluntad");
    if (data.specialty) mods.push("Especialidad");
    if (data.damagePenaltyApplied)
      mods.push("Penalizador Salud " + data.damagePenalty);
    if (data.potencia) mods.push("Potencia");
    var modsLine =
      mods.length > 0
        ? '<div class="ae-roll-notif-mods">' + esc(mods.join(" · ")) + "</div>"
        : "";

    var difficulty = data.difficulty || 6;
    var rolls = data.rolls || [];
    var diceChips = rolls
      .map(function (r) {
        var cls = "ae-roll-die";
        if (r === 1) cls += " botch";
        else if (r >= difficulty) cls += " success";
        else cls += " fail";
        return '<span class="' + cls + '">' + r + "</span>";
      })
      .join("");

    if (data.potencia && data.potenciaLevel > 0) {
      for (var p = 0; p < data.potenciaLevel; p++) {
        diceChips =
          '<span class="ae-roll-die success ae-roll-die-potencia" title="Potencia">P</span>' +
          diceChips;
      }
    }

    var poolParts = [];
    if (data.pool1)
      poolParts.push(esc(data.pool1) + " (" + data.pool1Size + ")");
    if (data.pool2)
      poolParts.push(esc(data.pool2) + " (" + data.pool2Size + ")");
    if (data.modifier)
      poolParts.push(
        "Mod (" + (data.modifier > 0 ? "+" : "") + data.modifier + ")",
      );
    var poolBreakdown = poolParts.join(" + ");

    var body =
      '<div class="ae-roll-notif-body">' +
      '<div class="ae-roll-notif-top">' +
      '<span class="ae-roll-notif-name">' +
      name +
      "</span>" +
      '<button class="ae-roll-notif-close" aria-label="Cerrar">&times;</button>' +
      "</div>" +
      '<div class="ae-roll-notif-pool">' +
      esc(poolLabel) +
      " (" +
      poolCount +
      ")</div>" +
      modsLine +
      '<div class="ae-roll-notif-result">' +
      esc(data.result || "?") +
      "</div>" +
      '<button class="ae-roll-notif-toggle">Ver detalle \u25BE</button>' +
      '<div class="ae-roll-notif-detail ae-hidden">';

    if (poolBreakdown) {
      body +=
        '<div class="ae-roll-detail-line">' +
        poolBreakdown +
        " = " +
        (data.totalPool || "?") +
        "d10</div>";
    }

    body +=
      '<div class="ae-roll-detail-line">Dificultad: ' +
      difficulty +
      "</div>" +
      '<div class="ae-roll-dice-row">' +
      diceChips +
      "</div>" +
      "</div>" +
      "</div>";

    return avatarSide + body;
  }

  function buildInitiativeHTML(data) {
    var name = esc(data.characterName || "???");
    var hasAvatar = !!data.avatarUrl;
    var avatarSide = hasAvatar
      ? '<img class="ae-roll-notif-portrait" src="' +
        esc(data.avatarUrl) +
        '" alt="">'
      : "";

    var body =
      '<div class="ae-roll-notif-body">' +
      '<div class="ae-roll-notif-top">' +
      '<span class="ae-roll-notif-name">' +
      name +
      "</span>" +
      '<button class="ae-roll-notif-close" aria-label="Cerrar">&times;</button>' +
      "</div>" +
      '<div class="ae-roll-notif-pool">Iniciativa</div>' +
      '<div class="ae-roll-notif-result">' +
      esc(String(data.total)) +
      "</div>" +
      '<button class="ae-roll-notif-toggle">Ver detalle \u25BE</button>' +
      '<div class="ae-roll-notif-detail ae-hidden">' +
      '<div class="ae-roll-detail-line">' +
      esc(data.breakdown || "") +
      "</div>" +
      "</div>" +
      "</div>";

    return avatarSide + body;
  }

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str;
    return d.innerHTML;
  }

  function destroy() {
    for (var i = 0; i < notifications.length; i++) {
      clearTimeout(notifications[i].timer);
      notifications[i].el.remove();
    }
    notifications = [];

    if (channel) {
      var sb = getSupabase();
      try {
        channel.unsubscribe?.();
      } catch (_e) {}
      try {
        sb?.removeChannel?.(channel);
      } catch (_e) {}
      channel = null;
    }

    if (feedEl) {
      feedEl.remove();
      feedEl = null;
    }

    currentEncounterId = null;
  }

  global.AERollFeed = { create: create, destroy: destroy };
})(window);
