/**
 * Notification Service — Supabase queries + realtime subscription
 * Cross-chronicle: fetches/subscribes across ALL user's chronicles.
 * RLS handles visibility filtering server-side.
 */
(function initNotificationsService(global) {
  var ns = (global.ABNNotifications = global.ABNNotifications || {});

  var _channel = null;
  var PAGE_SIZE = 20;

  function sb() {
    return global.supabase || null;
  }

  /**
   * Fetch recent notifications across all user's chronicles (paginated).
   * RLS filters to only visible notifications.
   * @param {Object} opts
   * @param {number} [opts.limit]
   * @param {string} [opts.before] - ISO timestamp for keyset pagination
   * @param {string} [opts.type]   - filter by notification type
   */
  async function fetchRecent(opts) {
    opts = opts || {};
    var limit = opts.limit || PAGE_SIZE;
    var query = sb()
      .from("chronicle_notifications")
      .select("*, chronicles(name)")
      .order("created_at", { ascending: false })
      .limit(limit);

    // Exclude SMS — handled by phone feature
    query = query.neq("type", "sms");

    if (opts.before) {
      query = query.lt("created_at", opts.before);
    }
    if (opts.type) {
      query = query.eq("type", opts.type);
    }

    var res = await query;
    return { data: res.data || [], error: res.error };
  }

  /**
   * Get global unread count via RPC (across all chronicles).
   */
  async function fetchUnreadCount(playerId) {
    var res = await sb().rpc("get_unread_notification_count", {
      p_player_id: playerId,
    });
    return res.data || 0;
  }

  /**
   * Upsert global read cursor (mark all as seen).
   */
  async function markSeen(playerId) {
    return sb()
      .from("notification_read_cursors")
      .upsert(
        {
          player_id: playerId,
          last_seen_at: new Date().toISOString(),
        },
        { onConflict: "player_id" },
      );
  }

  /**
   * Insert a notification into a specific chronicle.
   * For dice_roll type, prune excess per chronicle.
   */
  async function insertNotification(chronicleId, notification) {
    var payload = {
      chronicle_id: chronicleId,
      type: notification.type,
      title: notification.title || "",
      body: notification.body || "",
      icon: notification.icon || null,
      metadata: notification.metadata || {},
      actor_player_id: notification.actorPlayerId || null,
      visibility: notification.visibility || "all",
      target_player_ids: notification.targetPlayerIds || [],
    };

    var res = await sb().from("chronicle_notifications").insert(payload);

    // Dice roll pruning (keep latest 10 per chronicle) is handled
    // by DB trigger trg_prune_dice_roll_notifications.

    return res;
  }

  /**
   * Subscribe to realtime INSERT events across all chronicles.
   * RLS filters server-side so client only receives visible rows.
   */
  function subscribeRealtime(callback) {
    unsubscribeRealtime();

    var s = sb();
    if (!s) return;

    _channel = s
      .channel("notif-global")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chronicle_notifications",
        },
        function (payload) {
          if (typeof callback === "function") {
            callback(payload.new);
          }
        },
      )
      .subscribe();
  }

  /**
   * Unsubscribe from realtime channel.
   */
  function unsubscribeRealtime() {
    if (_channel) {
      sb()?.removeChannel(_channel);
      _channel = null;
    }
  }

  /**
   * Fetch the current read cursor for a player.
   */
  async function fetchReadCursor(playerId) {
    var res = await sb()
      .from("notification_read_cursors")
      .select("last_seen_at")
      .eq("player_id", playerId)
      .maybeSingle();
    return res.data?.last_seen_at || null;
  }

  ns.service = {
    fetchRecent: fetchRecent,
    fetchUnreadCount: fetchUnreadCount,
    fetchReadCursor: fetchReadCursor,
    markSeen: markSeen,
    insertNotification: insertNotification,
    subscribeRealtime: subscribeRealtime,
    unsubscribeRealtime: unsubscribeRealtime,
    PAGE_SIZE: PAGE_SIZE,
  };
})(window);
