/**
 * Roll Notifications - Global dice roll feed component
 * Can subscribe to chronicle-level or encounter-level channels
 * Displays floating notifications for dice rolls in the top-right corner
 */
(function initRollNotifications(global) {
  var DISMISS_MS = 15000;
  var MAX_NOTIFICATIONS = 10;

  var feedEl = null;
  var channel = null;
  var notifications = [];
  var currentSubscription = null;
  var onInitiativeRoll = null;

  function getSupabase() {
    return global.supabase || null;
  }

  /**
   * Create and mount the roll feed
   * @param {Object} options
   * @param {string} options.chronicleId - Subscribe to chronicle-level rolls
   * @param {HTMLElement} [options.container] - Container to mount to (defaults to body with fixed positioning)
   * @param {Function} [options.onInitiativeRoll] - Callback for initiative rolls
   */
  function create(options) {
    options = options || {};
    var chronicleId = options.chronicleId;
    var container = options.container;

    if (!chronicleId) return;

    onInitiativeRoll =
      typeof options.onInitiativeRoll === "function"
        ? options.onInitiativeRoll
        : null;

    // Destroy previous instance if exists
    destroy();

    // Create feed element
    feedEl = document.createElement("div");
    feedEl.className = "abn-roll-feed";

    // Mount to container or body
    if (container && container instanceof HTMLElement) {
      feedEl.classList.add("abn-roll-feed--relative");
      container.appendChild(feedEl);
    } else {
      feedEl.classList.add("abn-roll-feed--fixed");
      document.body.appendChild(feedEl);
    }

    var sb = getSupabase();
    if (!sb) return;

    // Subscribe to chronicle-level roll channel
    currentSubscription = { type: "chronicle", id: chronicleId };
    channel = sb
      .channel("chronicle-rolls-" + chronicleId)
      .on("broadcast", { event: "dice-roll" }, function (msg) {
        if (msg.payload) addNotification(msg.payload);
      })
      .subscribe();
  }

  function addNotification(data) {
    if (!feedEl) return;

    // Handle initiative rolls
    if (data.rollType === "initiative" && onInitiativeRoll) {
      onInitiativeRoll({
        sheetId: data.sheetId || null,
        characterName: data.characterName || null,
        total: data.total,
      });
    }

    var id = data.id || crypto.randomUUID();
    var el = buildNotificationEl(id, data);

    feedEl.appendChild(el);

    requestAnimationFrame(function () {
      el.classList.add("abn-roll-notif-enter");
    });

    var timer = setTimeout(function () {
      dismiss(id);
    }, DISMISS_MS);
    notifications.push({ id: id, el: el, timer: timer });

    // Enforce max notifications
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
    notif.el.classList.add("abn-roll-notif-exit");
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
    el.className = "abn-roll-notif abn-roll-notif--" + (data.status || "success");
    el.dataset.rollId = id;

    if (data.rollType === "initiative") {
      el.innerHTML = buildInitiativeHTML(data);
    } else {
      el.innerHTML = buildDiceRollHTML(data);
    }

    var closeBtn = el.querySelector(".abn-roll-notif-close");
    if (closeBtn) {
      closeBtn.addEventListener("click", function (e) {
        e.stopPropagation();
        dismiss(id);
      });
    }

    var toggleBtn = el.querySelector(".abn-roll-notif-toggle");
    var detail = el.querySelector(".abn-roll-notif-detail");
    if (toggleBtn && detail) {
      toggleBtn.addEventListener("click", function () {
        var isExpanded = !detail.classList.contains("abn-hidden");
        detail.classList.toggle("abn-hidden");
        toggleBtn.textContent = isExpanded ? "Ver detalle \u25BE" : "Ocultar \u25B4";
      });
    }

    return el;
  }

  function buildDiceRollHTML(data) {
    var name = esc(data.characterName || "???");
    var hasAvatar = !!data.avatarUrl;
    var avatarSide = hasAvatar
      ? '<img class="abn-roll-notif-portrait" src="' +
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
        ? '<div class="abn-roll-notif-mods">' + esc(mods.join(" \u00B7 ")) + "</div>"
        : "";

    var difficulty = data.difficulty || 6;
    var rolls = data.rolls || [];
    var diceChips = rolls
      .map(function (r) {
        var cls = "abn-roll-die";
        if (r === 1) cls += " botch";
        else if (r >= difficulty) cls += " success";
        else cls += " fail";
        return '<span class="' + cls + '">' + r + "</span>";
      })
      .join("");

    if (data.potencia && data.potenciaLevel > 0) {
      for (var p = 0; p < data.potenciaLevel; p++) {
        diceChips =
          '<span class="abn-roll-die success abn-roll-die-potencia" title="Potencia">P</span>' +
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
      '<div class="abn-roll-notif-body">' +
      '<div class="abn-roll-notif-top">' +
      '<span class="abn-roll-notif-name">' +
      name +
      "</span>" +
      '<button class="abn-roll-notif-close" aria-label="Cerrar">&times;</button>' +
      "</div>" +
      '<div class="abn-roll-notif-pool">' +
      esc(poolLabel) +
      " (" +
      poolCount +
      ")</div>" +
      modsLine +
      '<div class="abn-roll-notif-result">' +
      esc(data.result || "?") +
      "</div>" +
      '<button class="abn-roll-notif-toggle">Ver detalle \u25BE</button>' +
      '<div class="abn-roll-notif-detail abn-hidden">';

    if (poolBreakdown) {
      body +=
        '<div class="abn-roll-detail-line">' +
        poolBreakdown +
        " = " +
        (data.totalPool || "?") +
        "d10</div>";
    }

    body +=
      '<div class="abn-roll-detail-line">Dificultad: ' +
      difficulty +
      "</div>" +
      '<div class="abn-roll-dice-row">' +
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
      ? '<img class="abn-roll-notif-portrait" src="' +
        esc(data.avatarUrl) +
        '" alt="">'
      : "";

    var body =
      '<div class="abn-roll-notif-body">' +
      '<div class="abn-roll-notif-top">' +
      '<span class="abn-roll-notif-name">' +
      name +
      "</span>" +
      '<button class="abn-roll-notif-close" aria-label="Cerrar">&times;</button>' +
      "</div>" +
      '<div class="abn-roll-notif-pool">Iniciativa</div>' +
      '<div class="abn-roll-notif-result">' +
      esc(String(data.total)) +
      "</div>" +
      '<button class="abn-roll-notif-toggle">Ver detalle \u25BE</button>' +
      '<div class="abn-roll-notif-detail abn-hidden">' +
      '<div class="abn-roll-detail-line">' +
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

    currentSubscription = null;
    onInitiativeRoll = null;
  }

  /**
   * Manually add a notification (for local rolls)
   */
  function notify(data) {
    addNotification(data);
  }

  /**
   * Check if currently subscribed
   */
  function isActive() {
    return feedEl !== null && channel !== null;
  }

  global.ABNRollNotifications = {
    create: create,
    destroy: destroy,
    notify: notify,
    isActive: isActive,
  };
})(window);
