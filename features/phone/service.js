/**
 * Phone Service — Supabase queries, RPCs, realtime for in-game messaging.
 */
(function initPhoneService(global) {
  var ns = (global.ABNPhone = global.ABNPhone || {});

  var _channel = null;
  var PAGE_SIZE = 40;

  function sb() {
    return global.supabase || null;
  }

  // ---- Phone number generation ----

  function generatePhoneNumber() {
    var d = function () {
      return Math.floor(Math.random() * 10);
    };
    return "11-" + d() + d() + d() + d() + "-" + d() + d() + d() + d();
  }

  // ---- Chronicle membership check ----

  async function findChronicleForSheet(sheetId) {
    if (!sb() || !sheetId) return null;
    var res = await sb()
      .from("chronicle_characters")
      .select("chronicle_id")
      .eq("character_sheet_id", sheetId)
      .limit(1)
      .maybeSingle();
    return res.data?.chronicle_id || null;
  }

  // ---- Chronicle PCs (for recipient picker + auto-contacts) ----

  async function fetchChroniclePCs(chronicleId) {
    if (!chronicleId || !sb()) return [];
    var res = await sb()
      .from("chronicle_characters")
      .select(
        "character_sheet_id, character_sheet:character_sheets(id, data, avatar_url, user_id)",
      )
      .eq("chronicle_id", chronicleId);

    if (res.error || !res.data) return [];

    return res.data
      .map(function (row) {
        var sheet = row.character_sheet;
        if (!sheet) return null;
        var data = sheet.data || {};
        return {
          sheetId: sheet.id,
          userId: sheet.user_id,
          name: (data.nombre || "Personaje").trim(),
          avatarUrl: data.avatarThumbUrl || sheet.avatar_url || "",
        };
      })
      .filter(Boolean);
  }

  // ---- Phone identities (NPC senders) ----

  async function fetchPhoneIdentities(chronicleId) {
    if (!chronicleId || !sb()) return [];
    var res = await sb()
      .from("phone_identities")
      .select("*")
      .eq("chronicle_id", chronicleId)
      .order("created_at", { ascending: false });
    return res.data || [];
  }

  async function createPhoneIdentity(opts) {
    if (!sb()) return { data: null, error: "No supabase" };
    var res = await sb()
      .from("phone_identities")
      .insert({
        chronicle_id: opts.chronicleId,
        name: opts.name,
        phone_number: opts.phoneNumber || "",
        character_contact_id: opts.characterContactId || null,
        created_by_player_id: opts.createdByPlayerId,
      })
      .select()
      .single();
    return { data: res.data, error: res.error };
  }

  // ---- Conversations ----

  async function fetchConversations(opts) {
    if (!sb()) return [];
    var res = await sb().rpc("get_phone_conversations", {
      p_chronicle_id: opts.chronicleId,
      p_entity_type: opts.entityType,
      p_entity_id: opts.entityId,
    });
    return res.data || [];
  }

  async function fetchConversationsNarrator(chronicleId) {
    if (!sb()) return [];
    var res = await sb().rpc("get_phone_conversations_narrator", {
      p_chronicle_id: chronicleId,
    });
    return res.data || [];
  }

  // ---- Messages ----

  async function fetchMessages(opts) {
    if (!sb()) return [];
    var query = sb()
      .from("chronicle_messages")
      .select("*")
      .eq("chronicle_id", opts.chronicleId)
      .order("created_at", { ascending: true });

    // Filter to conversation between two entities
    // Messages where (sender=A and recipient=B) OR (sender=B and recipient=A)
    query = query.or(
      "and(sender_type.eq." + opts.entityType +
        ",sender_id.eq." + opts.entityId +
        ",recipient_type.eq." + opts.counterpartyType +
        ",recipient_id.eq." + opts.counterpartyId + ")," +
      "and(sender_type.eq." + opts.counterpartyType +
        ",sender_id.eq." + opts.counterpartyId +
        ",recipient_type.eq." + opts.entityType +
        ",recipient_id.eq." + opts.entityId + ")",
    );

    if (opts.limit) query = query.limit(opts.limit);

    var res = await query;
    return res.data || [];
  }

  async function fetchMessagesNarrator(opts) {
    if (!sb()) return [];
    var query = sb()
      .from("chronicle_messages")
      .select("*")
      .eq("chronicle_id", opts.chronicleId)
      .order("created_at", { ascending: true });

    query = query.or(
      "and(sender_type.eq." + opts.senderType +
        ",sender_id.eq." + opts.senderId +
        ",recipient_type.eq." + opts.recipientType +
        ",recipient_id.eq." + opts.recipientId + ")," +
      "and(sender_type.eq." + opts.recipientType +
        ",sender_id.eq." + opts.recipientId +
        ",recipient_type.eq." + opts.senderType +
        ",recipient_id.eq." + opts.senderId + ")",
    );

    if (opts.limit) query = query.limit(opts.limit);
    var res = await query;
    return res.data || [];
  }

  // ---- Send ----

  async function sendMessage(opts) {
    if (!sb()) return { error: "No supabase" };
    var res = await sb().rpc("send_chronicle_message", {
      p_chronicle_id: opts.chronicleId,
      p_sender_type: opts.senderType,
      p_sender_id: opts.senderId,
      p_sender_label: opts.senderLabel,
      p_recipients: opts.recipients,
      p_body: opts.body,
      p_created_by_player_id: opts.createdByPlayerId,
    });
    return { data: res.data, error: res.error };
  }

  // ---- Mark read ----

  async function markConversationRead(opts) {
    if (!sb()) return;
    await sb()
      .from("chronicle_messages")
      .update({ is_read: true })
      .eq("chronicle_id", opts.chronicleId)
      .eq("sender_type", opts.counterpartyType)
      .eq("sender_id", opts.counterpartyId)
      .eq("recipient_type", opts.entityType)
      .eq("recipient_id", opts.entityId)
      .eq("is_read", false);
  }

  // ---- Unread count ----

  async function fetchNarratorHasUnread(chronicleId) {
    if (!sb()) return false;
    var res = await sb()
      .from("chronicle_messages")
      .select("id", { count: "exact", head: true })
      .eq("chronicle_id", chronicleId)
      .eq("sender_type", "pc")
      .eq("recipient_type", "npc")
      .eq("is_read", false);
    return (res.count || 0) > 0;
  }

  async function fetchNarratorUnreadPairs(chronicleId) {
    if (!sb()) return [];
    var res = await sb()
      .from("chronicle_messages")
      .select("sender_id, recipient_id")
      .eq("chronicle_id", chronicleId)
      .eq("sender_type", "pc")
      .eq("recipient_type", "npc")
      .eq("is_read", false);
    return res.data || [];
  }

  async function fetchUnreadCount(entityType, entityId) {
    if (!sb()) return 0;
    var res = await sb().rpc("get_phone_unread_count", {
      p_entity_type: entityType,
      p_entity_id: entityId,
    });
    return res.data || 0;
  }

  // ---- Realtime ----

  function subscribeMessages(chronicleId, onInsert) {
    unsubscribeMessages();
    var s = sb();
    if (!s) return;

    _channel = s
      .channel("phone-messages-" + chronicleId)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chronicle_messages",
          filter: "chronicle_id=eq." + chronicleId,
        },
        function (payload) {
          if (typeof onInsert === "function") {
            onInsert(payload.new);
          }
        },
      )
      .subscribe();
  }

  function unsubscribeMessages() {
    if (_channel) {
      try { sb()?.removeChannel(_channel); } catch (_e) {}
      _channel = null;
    }
  }

  // ---- Groups ----

  async function fetchGroupConversations(opts) {
    if (!sb()) return [];
    var res = await sb().rpc("get_phone_group_conversations", {
      p_chronicle_id: opts.chronicleId,
      p_entity_type: opts.entityType,
      p_entity_id: opts.entityId,
    });
    return res.data || [];
  }

  async function createGroup(opts) {
    if (!sb()) return { data: null, error: "No supabase" };
    var res = await sb().rpc("create_phone_group", {
      p_chronicle_id: opts.chronicleId,
      p_name: opts.name,
      p_members: opts.members,
      p_created_by_player_id: opts.createdByPlayerId,
    });
    return { data: res.data, error: res.error };
  }

  async function sendGroupMessage(opts) {
    if (!sb()) return { error: "No supabase" };
    var res = await sb().rpc("send_group_message", {
      p_chronicle_id: opts.chronicleId,
      p_group_id: opts.groupId,
      p_group_name: opts.groupName,
      p_sender_type: opts.senderType,
      p_sender_id: opts.senderId,
      p_sender_label: opts.senderLabel,
      p_body: opts.body,
      p_created_by_player_id: opts.createdByPlayerId,
    });
    return { data: res.data, error: res.error };
  }

  async function fetchGroupMessages(opts) {
    if (!sb()) return [];
    var res = await sb()
      .from("chronicle_messages")
      .select("*")
      .eq("recipient_type", "group")
      .eq("recipient_id", opts.groupId)
      .order("created_at", { ascending: true });
    if (opts.limit) res = res.limit(opts.limit);
    return res.data || [];
  }

  async function markGroupRead(opts) {
    if (!sb()) return;
    await sb().rpc("mark_group_read", {
      p_group_id: opts.groupId,
      p_entity_type: opts.entityType,
      p_entity_id: opts.entityId,
    });
  }

  // ---- Resolve player for a character sheet ----

  async function getPlayerForSheet(sheetId) {
    if (!sb() || !sheetId) return null;
    var res = await sb()
      .from("character_sheets")
      .select("user_id")
      .eq("id", sheetId)
      .maybeSingle();
    if (!res.data?.user_id) return null;

    var pRes = await sb()
      .from("players")
      .select("id")
      .eq("user_id", res.data.user_id)
      .maybeSingle();
    return pRes.data?.id || null;
  }

  // ---- Participation check ----

  async function getParticipation(chronicleId, playerId) {
    if (!sb()) return null;
    var res = await sb()
      .from("chronicle_participants")
      .select("role")
      .eq("chronicle_id", chronicleId)
      .eq("player_id", playerId)
      .maybeSingle();
    return res.data || null;
  }

  // ---- Health level ----

  async function fetchSheetHealth(sheetId) {
    if (!sb() || !sheetId) return null;
    var res = await sb()
      .from("character_sheets")
      .select("data")
      .eq("id", sheetId)
      .maybeSingle();
    if (!res.data?.data) return null;
    var d = res.data.data;
    var keys = [
      "magullado-value", "lastimado-value", "lesionado-value",
      "herido-value", "malherido-value", "tullido-value", "incapacitado-value",
    ];
    var emptyCount = 0;
    keys.forEach(function (k) {
      if (!parseInt(d[k], 10)) emptyCount++;
    });
    // Same logic as character sheet: 6+ empty = none, 4-5 = lesionado, 2-3 = malherido, 1 = tullido, 0 = tullido
    if (emptyCount >= 6) return null;
    if (emptyCount >= 4) return "lesionado";
    if (emptyCount >= 2) return "malherido";
    return "tullido";
  }

  // ---- Phone color ----

  async function fetchPhoneColor(sheetId) {
    if (!sb() || !sheetId) return "black";
    var res = await sb()
      .from("character_sheets")
      .select("data")
      .eq("id", sheetId)
      .maybeSingle();
    return res.data?.data?.phoneColor || "black";
  }

  async function fetchInGameDate(chronicleId) {
    if (!sb() || !chronicleId) return null;
    var res = await sb()
      .from("chronicles")
      .select("in_game_date")
      .eq("id", chronicleId)
      .maybeSingle();
    return res.data?.in_game_date || null;
  }

  // ---- Export ----

  async function exportAllMessages(chronicleId) {
    if (!sb() || !chronicleId) return null;

    // Fetch all messages for the chronicle
    var res = await sb()
      .from("chronicle_messages")
      .select("*")
      .eq("chronicle_id", chronicleId)
      .order("created_at", { ascending: true });

    var messages = res.data || [];
    if (messages.length === 0) return { conversations: [], groups: [] };

    // Fetch groups
    var groupsRes = await sb()
      .from("phone_groups")
      .select("id, name")
      .eq("chronicle_id", chronicleId);
    var groupsMap = {};
    (groupsRes.data || []).forEach(function (g) { groupsMap[g.id] = g.name; });

    // Fetch group members
    var memberRes = await sb()
      .from("phone_group_members")
      .select("group_id, entity_type, entity_id, entity_label");
    var membersMap = {};
    (memberRes.data || []).forEach(function (m) {
      if (!membersMap[m.group_id]) membersMap[m.group_id] = [];
      membersMap[m.group_id].push({ type: m.entity_type, label: m.entity_label });
    });

    // Separate 1:1 and group messages
    var directMessages = [];
    var groupMessages = [];
    messages.forEach(function (m) {
      if (m.recipient_type === "group") {
        groupMessages.push(m);
      } else {
        directMessages.push(m);
      }
    });

    // Group 1:1 messages into conversations by pair
    var convMap = {};
    directMessages.forEach(function (m) {
      var keyA = m.sender_type + ":" + m.sender_id;
      var keyB = m.recipient_type + ":" + m.recipient_id;
      var pairKey = keyA < keyB ? keyA + "|" + keyB : keyB + "|" + keyA;
      if (!convMap[pairKey]) {
        convMap[pairKey] = {
          participants: [
            { type: m.sender_type, id: m.sender_id, label: m.sender_label },
            { type: m.recipient_type, id: m.recipient_id, label: m.recipient_label },
          ],
          messages: [],
        };
      }
      convMap[pairKey].messages.push({
        sender: m.sender_label,
        body: m.body,
        timestamp: m.created_at,
      });
    });

    // Group messages by group_id
    var grpMap = {};
    groupMessages.forEach(function (m) {
      var gid = m.recipient_id;
      if (!grpMap[gid]) {
        grpMap[gid] = {
          name: groupsMap[gid] || m.recipient_label || "Grupo",
          members: membersMap[gid] || [],
          messages: [],
        };
      }
      grpMap[gid].messages.push({
        sender: m.sender_label,
        body: m.body,
        timestamp: m.created_at,
      });
    });

    return {
      conversations: Object.values(convMap),
      groups: Object.values(grpMap),
    };
  }

  ns.service = {
    generatePhoneNumber: generatePhoneNumber,
    fetchChroniclePCs: fetchChroniclePCs,
    fetchPhoneIdentities: fetchPhoneIdentities,
    createPhoneIdentity: createPhoneIdentity,
    fetchConversations: fetchConversations,
    fetchConversationsNarrator: fetchConversationsNarrator,
    fetchMessages: fetchMessages,
    fetchMessagesNarrator: fetchMessagesNarrator,
    sendMessage: sendMessage,
    markConversationRead: markConversationRead,
    fetchGroupConversations: fetchGroupConversations,
    createGroup: createGroup,
    sendGroupMessage: sendGroupMessage,
    fetchGroupMessages: fetchGroupMessages,
    markGroupRead: markGroupRead,
    fetchNarratorHasUnread: fetchNarratorHasUnread,
    fetchNarratorUnreadPairs: fetchNarratorUnreadPairs,
    fetchUnreadCount: fetchUnreadCount,
    subscribeMessages: subscribeMessages,
    unsubscribeMessages: unsubscribeMessages,
    getPlayerForSheet: getPlayerForSheet,
    findChronicleForSheet: findChronicleForSheet,
    getParticipation: getParticipation,
    fetchSheetHealth: fetchSheetHealth,
    fetchPhoneColor: fetchPhoneColor,
    fetchInGameDate: fetchInGameDate,
    exportAllMessages: exportAllMessages,
    PAGE_SIZE: PAGE_SIZE,
  };
})(window);
