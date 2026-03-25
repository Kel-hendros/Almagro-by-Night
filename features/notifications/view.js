/**
 * Notification View — Drawer DOM construction and card rendering
 */
(function initNotificationsView(global) {
  var ns = (global.ABNNotifications = global.ABNNotifications || {});

  var backdropEl = null;
  var drawerEl = null;
  var listEl = null;
  var emptyEl = null;
  var loadingEl = null;
  var filtersEl = null;
  var badgeEl = null;
  var _lastSeenAt = null;
  var _activeFilter = null;

  var TYPE_META = {
    dice_roll: { label: "Tirada", icon: "dices", cssClass: "notif-card--roll" },
    revelation: {
      label: "Revelacion",
      icon: "scroll",
      cssClass: "notif-card--revelation",
    },
    session_start: {
      label: "Sesion",
      icon: "play-circle",
      cssClass: "notif-card--session",
    },
    session_end: {
      label: "Sesion",
      icon: "stop-circle",
      cssClass: "notif-card--session",
    },
    player_joined: {
      label: "Jugador",
      icon: "user-plus",
      cssClass: "notif-card--player",
    },
    system: { label: "Sistema", icon: "info", cssClass: "notif-card--system" },
  };

  var FILTER_CHIPS = [
    { key: null, label: "Todas" },
    { key: "dice_roll", label: "Tiradas" },
    { key: "revelation", label: "Revelaciones" },
  ];

  /**
   * Build the drawer DOM (once, appended to body).
   */
  function ensureDOM() {
    if (backdropEl) return;

    backdropEl = document.createElement("div");
    backdropEl.className = "notif-drawer-backdrop";
    backdropEl.addEventListener("click", function (e) {
      if (e.target === backdropEl) {
        ns.controller.closeDrawer();
      }
    });

    drawerEl = document.createElement("aside");
    drawerEl.className = "notif-drawer";

    // Header
    var header = document.createElement("header");
    header.className = "notif-drawer-header";
    header.innerHTML =
      '<h3 class="notif-drawer-title">Notificaciones</h3>' +
      '<button class="btn-modal-close notif-drawer-close" type="button" aria-label="Cerrar">' +
      '<i data-lucide="x"></i></button>';
    header.querySelector(".notif-drawer-close").addEventListener(
      "click",
      function () {
        ns.controller.closeDrawer();
      },
    );

    // Filters
    filtersEl = document.createElement("div");
    filtersEl.className = "notif-drawer-filters";
    FILTER_CHIPS.forEach(function (chip) {
      var btn = document.createElement("button");
      btn.className = "notif-filter-chip";
      if (chip.key === null) btn.classList.add("active");
      btn.textContent = chip.label;
      btn.dataset.type = chip.key || "";
      btn.addEventListener("click", function () {
        _activeFilter = chip.key;
        filtersEl
          .querySelectorAll(".notif-filter-chip")
          .forEach(function (b) {
            b.classList.toggle("active", b === btn);
          });
        if (ns.controller) ns.controller.reload(_activeFilter);
      });
      filtersEl.appendChild(btn);
    });

    // List
    listEl = document.createElement("div");
    listEl.className = "notif-drawer-list";
    listEl.addEventListener("scroll", function () {
      if (
        listEl.scrollTop + listEl.clientHeight >=
        listEl.scrollHeight - 60
      ) {
        if (ns.controller) ns.controller.loadMore();
      }
    });

    // Empty state
    emptyEl = document.createElement("div");
    emptyEl.className = "notif-drawer-empty hidden";
    emptyEl.innerHTML = "<p>No hay notificaciones recientes.</p>";

    // Loading indicator
    loadingEl = document.createElement("div");
    loadingEl.className = "notif-drawer-loading hidden";
    loadingEl.innerHTML =
      '<div class="notif-loading-spinner"></div>';

    drawerEl.appendChild(header);
    drawerEl.appendChild(filtersEl);
    drawerEl.appendChild(listEl);
    drawerEl.appendChild(emptyEl);
    drawerEl.appendChild(loadingEl);
    backdropEl.appendChild(drawerEl);
    document.body.appendChild(backdropEl);

    // Re-render lucide icons inside drawer
    if (global.lucide) global.lucide.createIcons({ nodes: [drawerEl] });
  }

  /**
   * Format relative time in Spanish.
   */
  function timeAgo(isoDate) {
    var diff = (Date.now() - new Date(isoDate).getTime()) / 1000;
    if (diff < 60) return "hace un momento";
    if (diff < 3600)
      return "hace " + Math.floor(diff / 60) + " min";
    if (diff < 86400)
      return "hace " + Math.floor(diff / 3600) + " h";
    return "hace " + Math.floor(diff / 86400) + " d";
  }

  /**
   * Build a notification card element.
   */
  function buildCard(notif) {
    if (notif.type === "dice_roll" && notif.metadata) {
      return buildRollCard(notif);
    }
    return buildGenericCard(notif);
  }

  /**
   * Generic card for revelations, encounters, system, etc.
   */
  function buildGenericCard(notif) {
    var meta = TYPE_META[notif.type] || TYPE_META.system;
    var isUnread =
      _lastSeenAt && new Date(notif.created_at) > new Date(_lastSeenAt);

    var card = document.createElement("div");
    card.className = "notif-card " + meta.cssClass;
    if (isUnread) card.classList.add("notif-card--unread");

    var iconName = notif.icon || meta.icon;

    card.innerHTML =
      '<div class="notif-card-icon"><i data-lucide="' + iconName + '"></i></div>' +
      '<div class="notif-card-body">' +
      '<span class="notif-card-title">' + escapeHtml(notif.title) + "</span>" +
      (notif.body
        ? '<span class="notif-card-text">' + escapeHtml(notif.body) + "</span>"
        : "") +
      "</div>" +
      '<span class="notif-card-time">' + timeAgo(notif.created_at) + "</span>";

    // Tap action for revelations
    if (notif.type === "revelation" && notif.metadata?.revelationId) {
      card.classList.add("notif-card--clickable");
      card.addEventListener("click", function () {
        if (global.ABNShared?.revelationScreen?.showForPlayer) {
          global.ABNShared.revelationScreen.showForPlayer({
            revelationId: notif.metadata.revelationId,
            chronicleId: notif.chronicle_id,
          });
        }
      });
    }

    return card;
  }

  /**
   * Rich roll card with avatar, dice chips, pool breakdown.
   */
  function buildRollCard(notif) {
    var data = notif.metadata || {};
    var isUnread =
      _lastSeenAt && new Date(notif.created_at) > new Date(_lastSeenAt);

    var card = document.createElement("div");
    card.className = "notif-card notif-card--roll notif-card--roll-rich";
    if (isUnread) card.classList.add("notif-card--unread");

    var status = data.status || "success";
    card.classList.add("notif-card--roll-" + status);

    // Avatar
    var avatarHtml = data.avatarUrl
      ? '<img class="notif-roll-avatar" src="' + escapeHtml(data.avatarUrl) + '" alt="">'
      : '<div class="notif-roll-avatar-placeholder"><i data-lucide="dices"></i></div>';

    // Pool label
    var poolLabel =
      data.rollName ||
      [data.pool1, data.pool2].filter(Boolean).join(" + ") ||
      "Tirada";
    var poolCount = (data.totalPool || "?") + "d10";

    // Result
    var resultText = data.result || "?";

    // Dice chips
    var difficulty = data.difficulty || 6;
    var rolls = data.rolls || [];
    var diceHtml = rolls
      .map(function (r) {
        var cls = "notif-roll-die";
        if (r === 1) cls += " botch";
        else if (r >= difficulty) cls += " success";
        else cls += " fail";
        return '<span class="' + cls + '">' + r + "</span>";
      })
      .join("");

    if (data.potencia && data.potenciaLevel > 0) {
      for (var p = 0; p < data.potenciaLevel; p++) {
        diceHtml =
          '<span class="notif-roll-die success potencia" title="Potencia">P</span>' +
          diceHtml;
      }
    }

    card.innerHTML =
      avatarHtml +
      '<div class="notif-roll-body">' +
      '<div class="notif-roll-top">' +
      '<span class="notif-roll-name">' + escapeHtml(data.characterName || "?") + "</span>" +
      '<span class="notif-card-time">' + timeAgo(notif.created_at) + "</span>" +
      "</div>" +
      '<div class="notif-roll-pool">' + escapeHtml(poolLabel) + " (" + poolCount + ")</div>" +
      '<div class="notif-roll-result notif-roll-result--' + status + '">' + escapeHtml(resultText) + "</div>" +
      '<div class="notif-roll-dice">' + diceHtml + "</div>" +
      "</div>";

    return card;
  }

  /**
   * Group consecutive notifications by chronicle_id.
   * Returns array of { chronicleId, chronicleName, items[] }
   */
  function groupByChronicle(notifications) {
    var groups = [];
    var current = null;

    notifications.forEach(function (n) {
      var cid = n.chronicle_id || "";
      var cname = n.chronicles?.name || "";
      if (!current || current.chronicleId !== cid) {
        current = { chronicleId: cid, chronicleName: cname, items: [] };
        groups.push(current);
      }
      current.items.push(n);
    });

    return groups;
  }

  function escapeHtml(str) {
    var div = document.createElement("div");
    div.textContent = str || "";
    return div.innerHTML;
  }

  // ---- Public API ----

  function open() {
    ensureDOM();
    backdropEl.classList.add("open");
    document.body.classList.add("notif-drawer-open");
  }

  function close() {
    if (!backdropEl) return;
    backdropEl.classList.remove("open");
    document.body.classList.remove("notif-drawer-open");
  }

  function isOpen() {
    return backdropEl ? backdropEl.classList.contains("open") : false;
  }

  function setLastSeenAt(ts) {
    _lastSeenAt = ts;
  }

  function renderNotifications(notifications, append) {
    ensureDOM();
    if (!append) {
      listEl.innerHTML = "";
    }

    var groups = groupByChronicle(notifications);

    groups.forEach(function (group) {
      // Chronicle header
      if (group.chronicleName) {
        var header = document.createElement("div");
        header.className = "notif-group-header";
        header.textContent = group.chronicleName;
        listEl.appendChild(header);
      }

      // Cards
      group.items.forEach(function (n) {
        listEl.appendChild(buildCard(n));
      });
    });

    // Render lucide icons in new cards
    if (global.lucide) global.lucide.createIcons({ nodes: [listEl] });

    var isEmpty = listEl.children.length === 0;
    emptyEl.classList.toggle("hidden", !isEmpty);
  }

  function showLoading(show) {
    ensureDOM();
    loadingEl.classList.toggle("hidden", !show);
  }

  function updateBadge(count) {
    var bellLink = document.getElementById("notifications-bell");
    if (!bellLink) return;
    bellLink.classList.toggle("has-unread", count > 0);
  }

  function getActiveFilter() {
    return _activeFilter;
  }

  function resetFilters() {
    _activeFilter = null;
    if (filtersEl) {
      filtersEl.querySelectorAll(".notif-filter-chip").forEach(function (b, i) {
        b.classList.toggle("active", i === 0);
      });
    }
  }

  // ---- Toast (floating, auto-dismiss) ----

  var TOAST_DISMISS_MS = 8000;
  var toastContainerEl = null;

  function ensureToastContainer() {
    if (toastContainerEl) return;
    toastContainerEl = document.createElement("div");
    toastContainerEl.className = "notif-toast-container";
    document.body.appendChild(toastContainerEl);
  }

  /**
   * Show a floating toast for a notification (revelations, encounters, etc.)
   */
  function showToast(notif) {
    ensureToastContainer();

    var meta = TYPE_META[notif.type] || TYPE_META.system;
    var iconName = notif.icon || meta.icon;
    var chronicleName = notif.chronicles?.name || "";

    var toast = document.createElement("div");
    toast.className = "notif-toast notif-toast--" + (notif.type || "system");

    toast.innerHTML =
      '<div class="notif-toast-icon"><i data-lucide="' + iconName + '"></i></div>' +
      '<div class="notif-toast-body">' +
      (chronicleName
        ? '<span class="notif-toast-chronicle">' + escapeHtml(chronicleName) + "</span>"
        : "") +
      '<span class="notif-toast-title">' + escapeHtml(notif.title || "") + "</span>" +
      (notif.body
        ? '<span class="notif-toast-text">' + escapeHtml(notif.body) + "</span>"
        : "") +
      "</div>" +
      '<button class="notif-toast-close" aria-label="Cerrar">&times;</button>';

    // Close button
    toast.querySelector(".notif-toast-close").addEventListener("click", function () {
      dismissToast(toast);
    });

    // Click action for revelations
    if (notif.type === "revelation" && notif.metadata?.revelationId) {
      toast.classList.add("notif-toast--clickable");
      toast.addEventListener("click", function (e) {
        if (e.target.closest(".notif-toast-close")) return;
        if (global.ABNShared?.revelationScreen?.showForPlayer) {
          global.ABNShared.revelationScreen.showForPlayer({
            revelationId: notif.metadata.revelationId,
            chronicleId: notif.chronicle_id,
          });
        }
        dismissToast(toast);
      });
    }

    toastContainerEl.appendChild(toast);
    if (global.lucide) global.lucide.createIcons({ nodes: [toast] });

    requestAnimationFrame(function () {
      toast.classList.add("notif-toast-enter");
    });

    setTimeout(function () {
      dismissToast(toast);
    }, TOAST_DISMISS_MS);
  }

  function dismissToast(toast) {
    if (!toast || !toast.parentNode) return;
    toast.classList.add("notif-toast-exit");
    toast.addEventListener("animationend", function () {
      toast.remove();
    }, { once: true });
  }

  function destroy() {
    if (backdropEl && backdropEl.parentNode) {
      backdropEl.parentNode.removeChild(backdropEl);
    }
    backdropEl = null;
    drawerEl = null;
    listEl = null;
    emptyEl = null;
    loadingEl = null;
    filtersEl = null;
    _activeFilter = null;
    _lastSeenAt = null;
    if (toastContainerEl && toastContainerEl.parentNode) {
      toastContainerEl.parentNode.removeChild(toastContainerEl);
    }
    toastContainerEl = null;
  }

  ns.view = {
    open: open,
    close: close,
    isOpen: isOpen,
    setLastSeenAt: setLastSeenAt,
    renderNotifications: renderNotifications,
    showLoading: showLoading,
    updateBadge: updateBadge,
    showToast: showToast,
    getActiveFilter: getActiveFilter,
    resetFilters: resetFilters,
    destroy: destroy,
  };
})(window);
