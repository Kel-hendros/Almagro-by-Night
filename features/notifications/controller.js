/**
 * Notification Controller — State management + lifecycle
 * Cross-chronicle: connects once per user session, shows all chronicles.
 */
(function initNotificationsController(global) {
  var ns = (global.ABNNotifications = global.ABNNotifications || {});

  var state = {
    playerId: null,
    unreadCount: 0,
    notifications: [],
    isDrawerOpen: false,
    hasMore: true,
    loading: false,
    connected: false,
  };

  var _escHandler = null;
  var _hashHandler = null;

  /**
   * Connect: fetch unread count, subscribe to realtime.
   * Called once after login. No chronicle param — works across all.
   */
  async function connect() {
    if (state.connected) return;

    var playerId = await global.ABNPlayer?.getId();
    if (!playerId) return;

    state.playerId = playerId;
    state.connected = true;

    // Fetch unread count
    try {
      state.unreadCount = await ns.service.fetchUnreadCount(playerId);
    } catch (e) {
      console.warn("ABNNotifications: fetchUnreadCount error", e);
      state.unreadCount = 0;
    }
    ns.view.updateBadge(state.unreadCount);

    // Subscribe to realtime (all chronicles, RLS filters)
    ns.service.subscribeRealtime(onRealtimeInsert);
  }

  /**
   * Disconnect: unsubscribe, clear state.
   */
  function disconnect() {
    ns.service.unsubscribeRealtime();
    state.playerId = null;
    state.unreadCount = 0;
    state.notifications = [];
    state.hasMore = true;
    state.loading = false;
    state.connected = false;
    ns.view.updateBadge(0);

    if (state.isDrawerOpen) {
      closeDrawer();
    }
  }

  /**
   * Handle realtime INSERT of a new notification.
   */
  function onRealtimeInsert(row) {
    if (!row || !state.playerId) return;

    // Visibility check for targeted notifications
    if (row.visibility === "targeted") {
      var ids = row.target_player_ids || [];
      if (ids.indexOf(state.playerId) === -1) return;
    }

    // Increment badge
    state.unreadCount++;
    ns.view.updateBadge(state.unreadCount);

    // Show floating popup/toast — skip own actions (you already see the result)
    var isOwnAction = row.actor_player_id === state.playerId;

    if (row.type === "dice_roll" && row.metadata) {
      var rollData = row.metadata;
      if (typeof rollData === "string") {
        try { rollData = JSON.parse(rollData); } catch (_e) { rollData = null; }
      }
      if (rollData && typeof rollData === "object") {
        // Show toast only for OTHER players' rolls
        if (!isOwnAction && global.ABNRollNotifications) {
          global.ABNRollNotifications.notify(rollData);
        }
        // Always emit event (encounter initiative capture needs all rolls)
        global.dispatchEvent(
          new CustomEvent("abn-roll-notification", { detail: rollData }),
        );
      }
    } else if (row.type === "muestra" && !isOwnAction) {
      ns.view.showMuestraToast(row);
    } else if (row.type !== "dice_roll" && !isOwnAction) {
      ns.view.showToast(row);
    }

    // If drawer is open, prepend the card
    if (state.isDrawerOpen) {
      var filter = ns.view.getActiveFilter();
      if (!filter || filter === row.type) {
        state.notifications.unshift(row);
        ns.view.renderNotifications(state.notifications, false);
      }
    }
  }

  /**
   * Open the drawer: fetch first page, mark as seen.
   */
  async function openDrawer() {
    if (state.isDrawerOpen) return;
    if (!state.playerId) return;

    state.isDrawerOpen = true;
    ns.view.resetFilters();
    ns.view.open();

    // Bind Escape key
    _escHandler = function (e) {
      if (e.key === "Escape") closeDrawer();
    };
    document.addEventListener("keydown", _escHandler);

    // Close on route change
    _hashHandler = function () {
      closeDrawer();
    };
    window.addEventListener("hashchange", _hashHandler);

    // Fetch cursor for unread styling
    try {
      var lastSeen = await ns.service.fetchReadCursor(state.playerId);
      ns.view.setLastSeenAt(lastSeen);
    } catch (e) {
      ns.view.setLastSeenAt(null);
    }

    // Load first page
    await loadPage(false);

    // Mark as seen
    try {
      await ns.service.markSeen(state.playerId);
      state.unreadCount = 0;
      ns.view.updateBadge(0);
    } catch (e) {
      console.warn("ABNNotifications: markSeen error", e);
    }
  }

  /**
   * Close the drawer.
   */
  function closeDrawer() {
    if (!state.isDrawerOpen) return;
    state.isDrawerOpen = false;
    ns.view.close();

    if (_escHandler) {
      document.removeEventListener("keydown", _escHandler);
      _escHandler = null;
    }
    if (_hashHandler) {
      window.removeEventListener("hashchange", _hashHandler);
      _hashHandler = null;
    }
  }

  function toggleDrawer() {
    if (state.isDrawerOpen) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  /**
   * Load a page of notifications.
   */
  async function loadPage(append) {
    if (state.loading || (!state.hasMore && append)) return;

    state.loading = true;
    ns.view.showLoading(true);

    var opts = {};
    var filter = ns.view.getActiveFilter();
    if (filter) opts.type = filter;

    if (append && state.notifications.length > 0) {
      var last = state.notifications[state.notifications.length - 1];
      opts.before = last.created_at;
    }

    try {
      var res = await ns.service.fetchRecent(opts);
      var items = res.data || [];

      if (append) {
        state.notifications = state.notifications.concat(items);
      } else {
        state.notifications = items;
      }

      state.hasMore = items.length >= ns.service.PAGE_SIZE;
      ns.view.renderNotifications(state.notifications, false);
    } catch (e) {
      console.warn("ABNNotifications: loadPage error", e);
    } finally {
      state.loading = false;
      ns.view.showLoading(false);
    }
  }

  /**
   * Load more (infinite scroll).
   */
  function loadMore() {
    if (!state.isDrawerOpen || state.loading || !state.hasMore) return;
    loadPage(true);
  }

  /**
   * Reload with a different filter.
   */
  function reload(typeFilter) {
    state.notifications = [];
    state.hasMore = true;
    ns.view.renderNotifications([], false);
    loadPage(false);
  }

  /**
   * Public API for features to push a notification.
   * Inserts into DB; realtime will propagate to all clients.
   * @param {Object} notification
   * @param {string} notification.chronicleId - required, which chronicle
   * @param {string} notification.type
   * @param {string} notification.title
   * @param {string} [notification.body]
   * @param {string} [notification.icon]
   * @param {Object} [notification.metadata]
   * @param {string} [notification.visibility] - 'all' | 'targeted'
   * @param {string[]} [notification.targetPlayerIds]
   * @param {string} [notification.actorPlayerId]
   */
  async function pushNotification(notification) {
    var chronicleId = notification.chronicleId;
    if (!chronicleId) return;

    var playerId = notification.actorPlayerId || state.playerId;
    if (!playerId) {
      playerId = await global.ABNPlayer?.getId();
    }

    var payload = Object.assign({}, notification, {
      actorPlayerId: playerId,
    });

    try {
      await ns.service.insertNotification(chronicleId, payload);
    } catch (e) {
      console.warn("ABNNotifications: pushNotification error", e);
    }
  }

  ns.controller = {
    connect: connect,
    disconnect: disconnect,
    openDrawer: openDrawer,
    closeDrawer: closeDrawer,
    toggleDrawer: toggleDrawer,
    loadMore: loadMore,
    reload: reload,
    pushNotification: pushNotification,
  };
})(window);
