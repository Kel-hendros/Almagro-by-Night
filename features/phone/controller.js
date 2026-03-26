/**
 * Phone Controller — State management, screen navigation, realtime, lifecycle.
 */
(function initPhoneController(global) {
  var ns = (global.ABNPhone = global.ABNPhone || {});

  var state = {
    isOpen: false,
    screen: "inbox", // 'inbox' | 'conversation' | 'compose'
    chronicleId: null,
    playerId: null,
    entityType: null, // 'pc' for player
    entityId: null, // character_sheet_id
    entityLabel: null,
    isNarrator: false,
    conversations: [],
    autoContacts: [], // other chronicle PCs
    currentConversation: null,
    messages: [],
    phoneIdentities: [],
    chroniclePCs: [],
  };

  var _escHandler = null;
  var _hashHandler = null;
  var _smsHandler = null;

  // ================================================================
  // Public: open modal from different entry points
  // ================================================================

  /**
   * Open phone for a player character.
   */
  async function openInbox(opts) {
    if (!opts.characterSheetId) return;

    var svc = ns.service;
    if (!svc) return;

    state.entityType = "pc";
    state.entityId = opts.characterSheetId;
    state.isNarrator = false;

    ns.view.open();
    state.isOpen = true;
    bindGlobalHandlers();
    ns.view.showLoading();

    // Resolve player
    state.playerId = await global.ABNPlayer?.getId();

    // Resolve chronicle: the character must be in a chronicle via chronicle_characters
    var chronicleId = await svc.findChronicleForSheet(state.entityId);
    if (!chronicleId) {
      // Character not in any chronicle — empty phone
      state.chronicleId = null;
      state.chroniclePCs = [];
      state.autoContacts = [];
      ns.view.renderInbox({
        conversations: [],
        groupConversations: [],
        autoContacts: [],
        isNarrator: false,
      });
      return;
    }

    state.chronicleId = chronicleId;

    // Resolve entity label
    var pcs = await svc.fetchChroniclePCs(state.chronicleId);
    state.chroniclePCs = pcs;
    var myPC = pcs.find(function (p) { return p.sheetId === state.entityId; });
    state.entityLabel = myPC ? myPC.name : "Personaje";

    // Auto-contacts: other PCs in the chronicle
    state.autoContacts = pcs.filter(function (p) { return p.sheetId !== state.entityId; });

    // Subscribe realtime
    svc.subscribeMessages(state.chronicleId, onRealtimeMessage);

    // Apply phone color from character preferences
    svc.fetchPhoneColor(state.entityId).then(function (color) {
      ns.view.setPhoneColor(color);
    });

    await loadConversations();
  }

  /**
   * Open phone for narrator (from active session).
   */
  async function openCompose(opts) {
    if (!opts.chronicleId) return;

    var svc = ns.service;
    if (!svc) return;

    state.chronicleId = opts.chronicleId;
    state.entityType = null;
    state.entityId = null;
    state.isNarrator = true;

    ns.view.open();
    state.isOpen = true;
    bindGlobalHandlers();
    ns.view.showLoading();

    state.playerId = opts.currentPlayerId || (await global.ABNPlayer?.getId());

    // Load data for compose screen
    var pcs = await svc.fetchChroniclePCs(state.chronicleId);
    state.chroniclePCs = pcs;

    // Show inbox first (narrator sees all conversations)
    svc.subscribeMessages(state.chronicleId, onRealtimeMessage);
    await loadConversationsNarrator();
  }

  /**
   * Open directly to a conversation (from SMS notification click).
   */
  async function openToConversation(opts) {
    if (!opts.chronicleId || !opts.characterSheetId) return;

    await openInbox({
      chronicleId: opts.chronicleId,
      characterSheetId: opts.characterSheetId,
    });

    if (opts.counterpartyType && opts.counterpartyId) {
      await navigateToConversation({
        counterpartyType: opts.counterpartyType,
        counterpartyId: opts.counterpartyId,
        counterpartyLabel: opts.counterpartyLabel || "Contacto",
      });
    }
  }

  function closeModal() {
    if (!state.isOpen) return;
    state.isOpen = false;
    state.screen = "inbox";
    ns.view.close();
    unbindGlobalHandlers();

    if (ns.service) ns.service.unsubscribeMessages();

    // Reset state
    state.conversations = [];
    state.messages = [];
    state.currentConversation = null;
    state.phoneIdentities = [];
  }

  // ================================================================
  // Navigation
  // ================================================================

  async function navigateToConversation(counterparty) {
    state.screen = "conversation";
    state.currentConversation = {
      counterpartyType: counterparty.counterpartyType,
      counterpartyId: counterparty.counterpartyId,
      counterpartyLabel: counterparty.counterpartyLabel,
    };

    ns.view.showLoading();

    var svc = ns.service;
    var messages = await svc.fetchMessages({
      chronicleId: state.chronicleId,
      entityType: state.entityType,
      entityId: state.entityId,
      counterpartyType: counterparty.counterpartyType,
      counterpartyId: counterparty.counterpartyId,
    });

    state.messages = messages;

    ns.view.renderConversation({
      messages: messages,
      counterpartyLabel: counterparty.counterpartyLabel,
      myType: state.entityType,
      myId: state.entityId,
      canReply: state.entityType === "pc",
    });

    // Mark as read
    if (state.entityType === "pc") {
      await svc.markConversationRead({
        chronicleId: state.chronicleId,
        counterpartyType: counterparty.counterpartyType,
        counterpartyId: counterparty.counterpartyId,
        entityType: state.entityType,
        entityId: state.entityId,
      });
      emitUnreadChanged();
    }
  }

  async function navigateToConversationNarrator(pair) {
    state.screen = "conversation";

    // Determine NPC vs PC side so narrator can reply as the NPC
    var npcSide, pcSide;
    if (pair.senderType === "npc") {
      npcSide = { type: pair.senderType, id: pair.senderId, label: pair.senderLabel };
      pcSide = { type: pair.recipientType, id: pair.recipientId, label: pair.recipientLabel };
    } else if (pair.recipientType === "npc") {
      npcSide = { type: pair.recipientType, id: pair.recipientId, label: pair.recipientLabel };
      pcSide = { type: pair.senderType, id: pair.senderId, label: pair.senderLabel };
    } else {
      // PC ↔ PC conversation — narrator can observe but not reply
      npcSide = null;
      pcSide = null;
    }

    state.currentConversation = {
      senderType: pair.senderType,
      senderId: pair.senderId,
      senderLabel: pair.senderLabel,
      recipientType: pair.recipientType,
      recipientId: pair.recipientId,
      recipientLabel: pair.recipientLabel,
      narratorReplyAs: npcSide,
      narratorReplyTo: pcSide,
    };

    ns.view.showLoading();

    var svc = ns.service;
    var messages = await svc.fetchMessagesNarrator({
      chronicleId: state.chronicleId,
      senderType: pair.senderType,
      senderId: pair.senderId,
      recipientType: pair.recipientType,
      recipientId: pair.recipientId,
    });

    state.messages = messages;

    // For narrator view, show messages from NPC's perspective (NPC = "me")
    ns.view.renderConversation({
      messages: messages,
      counterpartyLabel: npcSide
        ? npcSide.label + " \u2192 " + pcSide.label
        : pair.senderLabel + " \u2194 " + pair.recipientLabel,
      myType: npcSide ? npcSide.type : null,
      myId: npcSide ? npcSide.id : null,
      canReply: !!npcSide,
    });
  }

  function navigateBackToInbox() {
    state.screen = "inbox";
    state.currentConversation = null;
    state.messages = [];

    if (state.isNarrator && !state.entityType) {
      loadConversationsNarrator();
    } else {
      loadConversations();
    }
  }

  function showCompose() {
    state.screen = "compose";
    loadComposeData();
  }

  function showCreateGroup() {
    state.screen = "create-group";
    loadCreateGroupData();
  }

  async function navigateToGroup(group) {
    state.screen = "group-conversation";
    state.currentConversation = {
      isGroup: true,
      groupId: group.groupId,
      groupName: group.groupName,
    };

    ns.view.showLoading();

    var svc = ns.service;
    var messages = await svc.fetchGroupMessages({ groupId: group.groupId });
    state.messages = messages;

    ns.view.renderConversation({
      messages: messages,
      counterpartyLabel: group.groupName,
      myType: state.entityType,
      myId: state.entityId,
      canReply: true,
    });

    // Mark as read
    if (state.entityType) {
      await svc.markGroupRead({
        groupId: group.groupId,
        entityType: state.entityType,
        entityId: state.entityId,
      });
      emitUnreadChanged();
    }
  }

  // ================================================================
  // Data loading
  // ================================================================

  async function loadConversations() {
    var svc = ns.service;
    var convos = await svc.fetchConversations({
      chronicleId: state.chronicleId,
      entityType: state.entityType,
      entityId: state.entityId,
    });

    // Also fetch group conversations
    var groupConvos = await svc.fetchGroupConversations({
      chronicleId: state.chronicleId,
      entityType: state.entityType,
      entityId: state.entityId,
    });

    // Filter out conversations with PCs no longer in the chronicle
    var activePCIds = new Set(state.chroniclePCs.map(function (p) { return p.sheetId; }));
    var filteredConvos = convos.filter(function (c) {
      if (c.counterpartyType === "npc") return true;
      return activePCIds.has(c.counterpartyId);
    });

    state.conversations = filteredConvos;
    state.groupConversations = groupConvos;

    ns.view.renderInbox({
      conversations: filteredConvos,
      groupConversations: groupConvos,
      autoContacts: state.autoContacts,
      isNarrator: state.isNarrator,
    });
  }

  async function loadConversationsNarrator() {
    var svc = ns.service;
    var convos = await svc.fetchConversationsNarrator(state.chronicleId);
    state.conversations = convos;
    ns.view.renderInboxNarrator({ conversations: convos });
  }

  async function loadCreateGroupData() {
    var svc = ns.service;
    if (state.chroniclePCs.length === 0) {
      state.chroniclePCs = await svc.fetchChroniclePCs(state.chronicleId);
    }
    ns.view.renderCreateGroup({
      pcs: state.chroniclePCs,
      mySheetId: state.entityId,
    });
  }

  async function loadComposeData() {
    var svc = ns.service;
    var identities = await svc.fetchPhoneIdentities(state.chronicleId);
    state.phoneIdentities = identities;

    if (state.chroniclePCs.length === 0) {
      state.chroniclePCs = await svc.fetchChroniclePCs(state.chronicleId);
    }

    ns.view.renderCompose({
      identities: identities,
      pcs: state.chroniclePCs,
    });
  }

  // ================================================================
  // Sending
  // ================================================================

  /**
   * Player sends a reply in current conversation.
   */
  async function handleCreateGroup() {
    var data = ns.view.getCreateGroupData();
    if (!data.name || data.members.length < 2) return;

    var svc = ns.service;
    ns.view.setCreateGroupBusy(true);

    try {
      var res = await svc.createGroup({
        chronicleId: state.chronicleId,
        name: data.name,
        members: data.members,
        createdByPlayerId: state.playerId,
      });

      if (res.error) {
        console.warn("Phone: error creating group", res.error);
        ns.view.setCreateGroupBusy(false);
        return;
      }

      // Navigate to the new group conversation
      await navigateToGroup({
        groupId: res.data.id,
        groupName: data.name,
      });
    } catch (err) {
      console.warn("Phone: create group error", err);
      ns.view.setCreateGroupBusy(false);
    }
  }

  async function handleSend(body) {
    if (!body || !state.currentConversation) return;

    var svc = ns.service;
    var cp = state.currentConversation;

    // Group message
    if (cp.isGroup) {
      await svc.sendGroupMessage({
        chronicleId: state.chronicleId,
        groupId: cp.groupId,
        groupName: cp.groupName,
        senderType: state.entityType,
        senderId: state.entityId,
        senderLabel: state.entityLabel,
        body: body,
        createdByPlayerId: state.playerId,
      });
      return;
    }

    var senderType, senderId, senderLabel;
    var recipientType, recipientId, recipientLabel;

    if (cp.narratorReplyAs) {
      // Narrator replying as NPC to PC
      senderType = cp.narratorReplyAs.type;
      senderId = cp.narratorReplyAs.id;
      senderLabel = cp.narratorReplyAs.label;
      recipientType = cp.narratorReplyTo.type;
      recipientId = cp.narratorReplyTo.id;
      recipientLabel = cp.narratorReplyTo.label;
    } else if (state.entityId) {
      // Player replying to counterparty
      senderType = state.entityType;
      senderId = state.entityId;
      senderLabel = state.entityLabel;
      recipientType = cp.counterpartyType;
      recipientId = cp.counterpartyId;
      recipientLabel = cp.counterpartyLabel;
    } else {
      return;
    }

    // Resolve recipient player_id for notification (only if recipient is PC)
    var recipientPlayerId = null;
    if (recipientType === "pc") {
      recipientPlayerId = await svc.getPlayerForSheet(recipientId);
    }

    var recipients = [
      {
        type: recipientType,
        id: recipientId,
        label: recipientLabel,
        playerId: recipientPlayerId,
      },
    ];

    await svc.sendMessage({
      chronicleId: state.chronicleId,
      senderType: senderType,
      senderId: senderId,
      senderLabel: senderLabel,
      recipients: recipients,
      body: body,
      createdByPlayerId: state.playerId,
    });
  }

  /**
   * Narrator sends from compose screen.
   */
  async function handleComposeSend() {
    var data = ns.view.getComposeData();
    if (!data.body) return;
    if (data.recipients.length === 0) return;

    var svc = ns.service;
    ns.view.setComposeBusy(true);

    try {
      var senderType, senderId, senderLabel;

      if (data.isNewSender) {
        if (!data.newSenderName) {
          ns.view.setComposeBusy(false);
          return;
        }
        // Create new phone identity
        var res = await svc.createPhoneIdentity({
          chronicleId: state.chronicleId,
          name: data.newSenderName,
          phoneNumber: data.newSenderPhone,
          createdByPlayerId: state.playerId,
        });
        if (res.error || !res.data) {
          console.warn("Phone: error creating identity", res.error);
          ns.view.setComposeBusy(false);
          return;
        }
        senderType = "npc";
        senderId = res.data.id;
        senderLabel = data.newSenderName;
      } else {
        senderType = "npc";
        senderId = data.senderIdentityId;
        var identity = state.phoneIdentities.find(function (i) { return i.id === senderId; });
        senderLabel = identity ? identity.name : "NPC";
      }

      // Build recipients with player_id resolution
      var recipients = [];
      for (var i = 0; i < data.recipients.length; i++) {
        var r = data.recipients[i];
        var playerId = await svc.getPlayerForSheet(r.sheetId);
        recipients.push({
          type: "pc",
          id: r.sheetId,
          label: r.name,
          playerId: playerId,
        });
      }

      await svc.sendMessage({
        chronicleId: state.chronicleId,
        senderType: senderType,
        senderId: senderId,
        senderLabel: senderLabel,
        recipients: recipients,
        body: data.body,
        createdByPlayerId: state.playerId,
      });

      // Go back to inbox
      navigateBackToInbox();
    } catch (err) {
      console.warn("Phone: compose send error", err);
    } finally {
      ns.view.setComposeBusy(false);
    }
  }

  // ================================================================
  // Realtime
  // ================================================================

  function onRealtimeMessage(row) {
    if (!row || !state.isOpen) return;

    // If we're in a conversation, check if this message belongs to it
    var isConvScreen = state.screen === "conversation" || state.screen === "group-conversation";
    if (isConvScreen && state.currentConversation) {
      var cp = state.currentConversation;
      var belongs = false;

      if (cp.isGroup) {
        // Group mode: check if message is for this group
        belongs = row.recipient_type === "group" && row.recipient_id === cp.groupId;
      } else if (state.entityType) {
        // Player mode: check if message is between me and counterparty
        var isSenderMe = row.sender_type === state.entityType && row.sender_id === state.entityId;
        var isRecipientMe = row.recipient_type === state.entityType && row.recipient_id === state.entityId;
        var isSenderCP = row.sender_type === cp.counterpartyType && row.sender_id === cp.counterpartyId;
        var isRecipientCP = row.recipient_type === cp.counterpartyType && row.recipient_id === cp.counterpartyId;
        belongs = (isSenderMe && isRecipientCP) || (isSenderCP && isRecipientMe);
      } else {
        // Narrator mode
        belongs =
          (row.sender_type === cp.senderType && row.sender_id === cp.senderId &&
           row.recipient_type === cp.recipientType && row.recipient_id === cp.recipientId) ||
          (row.sender_type === cp.recipientType && row.sender_id === cp.recipientId &&
           row.recipient_type === cp.senderType && row.recipient_id === cp.senderId);
      }

      if (belongs) {
        // Avoid duplicates
        var alreadyHave = state.messages.some(function (m) { return m.id === row.id; });
        if (!alreadyHave) {
          state.messages.push(row);
          ns.view.appendMessage(row, state.entityType, state.entityId);

          // Auto mark-as-read if I'm the recipient
          if (state.entityType && row.recipient_type === state.entityType && row.recipient_id === state.entityId) {
            ns.service.markConversationRead({
              chronicleId: state.chronicleId,
              counterpartyType: row.sender_type,
              counterpartyId: row.sender_id,
              entityType: state.entityType,
              entityId: state.entityId,
            });
          }
        }
        return;
      }
    }

    // If on inbox, refresh the conversations list
    if (state.screen === "inbox") {
      if (state.isNarrator && !state.entityType) {
        loadConversationsNarrator();
      } else {
        loadConversations();
      }
    }
  }

  // ================================================================
  // Unread count
  // ================================================================

  async function getUnreadCount() {
    if (!state.entityType || !state.entityId || !ns.service) return 0;
    return await ns.service.fetchUnreadCount(state.entityType, state.entityId);
  }

  function emitUnreadChanged() {
    getUnreadCount().then(function (count) {
      global.dispatchEvent(
        new CustomEvent("abn-phone-unread-changed", { detail: { count: count } }),
      );
    });
  }

  // ================================================================
  // Global handlers (Escape, hashchange)
  // ================================================================

  function bindGlobalHandlers() {
    _escHandler = function (e) {
      if (e.key === "Escape") closeModal();
    };
    _hashHandler = function () {
      closeModal();
    };
    document.addEventListener("keydown", _escHandler);
    window.addEventListener("hashchange", _hashHandler);

    // Listen for SMS notifications to refresh
    _smsHandler = function () {
      if (state.isOpen && state.screen === "inbox") {
        if (state.isNarrator && !state.entityType) {
          loadConversationsNarrator();
        } else {
          loadConversations();
        }
      }
      emitUnreadChanged();
    };
    window.addEventListener("abn-sms-received", _smsHandler);
  }

  function unbindGlobalHandlers() {
    if (_escHandler) {
      document.removeEventListener("keydown", _escHandler);
      _escHandler = null;
    }
    if (_hashHandler) {
      window.removeEventListener("hashchange", _hashHandler);
      _hashHandler = null;
    }
    if (_smsHandler) {
      window.removeEventListener("abn-sms-received", _smsHandler);
      _smsHandler = null;
    }
  }

  ns.controller = {
    openInbox: openInbox,
    openCompose: openCompose,
    openToConversation: openToConversation,
    closeModal: closeModal,
    navigateToConversation: navigateToConversation,
    navigateToConversationNarrator: navigateToConversationNarrator,
    navigateBackToInbox: navigateBackToInbox,
    showCompose: showCompose,
    showCreateGroup: showCreateGroup,
    navigateToGroup: navigateToGroup,
    handleSend: handleSend,
    handleComposeSend: handleComposeSend,
    handleCreateGroup: handleCreateGroup,
    getUnreadCount: getUnreadCount,
    emitUnreadChanged: emitUnreadChanged,
    isOpen: function () { return state.isOpen; },
  };
})(window);
