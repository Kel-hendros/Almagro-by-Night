/**
 * Phone View — Programmatic DOM for the in-game phone modal.
 * Three screens: inbox (contact list), conversation (chat), compose (narrator).
 */
(function initPhoneView(global) {
  var ns = (global.ABNPhone = global.ABNPhone || {});

  // Cached DOM references
  var backdropEl = null;
  var modalEl = null;
  var headerEl = null;
  var screenEl = null;
  var inputBarEl = null;
  var inputField = null;
  var sendBtn = null;

  function esc(str) {
    var d = document.createElement("div");
    d.textContent = str || "";
    return d.innerHTML;
  }

  var EMOJI_ONLY_RE = /^(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F)(?:\u200D(?:\p{Emoji_Presentation}|\p{Emoji}\uFE0F))*$/u;

  function isEmojiOnly(str) {
    var trimmed = (str || "").trim();
    return trimmed.length > 0 && trimmed.length <= 8 && EMOJI_ONLY_RE.test(trimmed);
  }

  function initial(name) {
    return (name || "?").charAt(0).toUpperCase();
  }

  // ================================================================
  // DOM scaffold (created once, appended to body)
  // ================================================================

  function ensureDOM() {
    if (backdropEl) return;

    backdropEl = document.createElement("div");
    backdropEl.className = "phone-backdrop";
    backdropEl.addEventListener("click", function (e) {
      if (e.target === backdropEl && ns.controller) {
        ns.controller.closeModal();
      }
    });

    modalEl = document.createElement("div");
    modalEl.className = "phone-modal";

    headerEl = document.createElement("header");
    headerEl.className = "phone-header";

    screenEl = document.createElement("div");
    screenEl.className = "phone-screen";

    inputBarEl = document.createElement("div");
    inputBarEl.className = "phone-input-bar hidden";

    inputField = document.createElement("input");
    inputField.type = "text";
    inputField.className = "phone-input-field";
    inputField.placeholder = "Escribir mensaje...";
    inputField.maxLength = 2000;
    inputField.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSendClick();
      }
    });

    sendBtn = document.createElement("button");
    sendBtn.type = "button";
    sendBtn.className = "phone-send-btn";
    sendBtn.innerHTML = '<i data-lucide="send"></i>';
    sendBtn.addEventListener("click", handleSendClick);

    inputBarEl.appendChild(inputField);
    inputBarEl.appendChild(sendBtn);

    modalEl.appendChild(headerEl);
    modalEl.appendChild(screenEl);
    modalEl.appendChild(inputBarEl);
    backdropEl.appendChild(modalEl);
    document.body.appendChild(backdropEl);
  }

  function handleSendClick() {
    var text = (inputField.value || "").trim();
    if (!text) return;
    if (ns.controller && ns.controller.handleSend) {
      ns.controller.handleSend(text);
    }
    inputField.value = "";
    inputField.focus();
  }

  // ================================================================
  // Open / Close
  // ================================================================

  function open() {
    ensureDOM();
    backdropEl.classList.add("open");
    document.body.classList.add("phone-modal-open");
  }

  function close() {
    if (!backdropEl) return;
    backdropEl.classList.remove("open");
    document.body.classList.remove("phone-modal-open");
    setHealthLevel(null);
    setPhoneColor(null);
  }

  function setHealthLevel(level) {
    if (!modalEl) return;
    modalEl.classList.remove("phone-health-lesionado", "phone-health-malherido", "phone-health-tullido");
    if (level) modalEl.classList.add("phone-health-" + level);
  }

  var PHONE_COLORS = ["black", "gray", "white", "red", "blue"];

  function setPhoneColor(color) {
    if (!modalEl) return;
    PHONE_COLORS.forEach(function (c) {
      modalEl.classList.remove("phone-color-" + c);
    });
    if (color && color !== "black") {
      modalEl.classList.add("phone-color-" + color);
    }
  }

  function isOpen() {
    return backdropEl ? backdropEl.classList.contains("open") : false;
  }

  // ================================================================
  // Screen: Inbox (contact / conversation list)
  // ================================================================

  function buildContactRowHtml(c) {
    var unread = c.unreadCount || 0;
    var preview = c.lastMessageBody
      ? esc(c.lastMessageBody.length > 50 ? c.lastMessageBody.slice(0, 50) + "..." : c.lastMessageBody)
      : '<span class="phone-no-messages">Sin mensajes</span>';

    var avatarHtml = c._avatarUrl
      ? '<div class="phone-contact-avatar phone-contact-avatar--img" style="background-image:url(' + esc(c._avatarUrl) + ')"></div>'
      : '<div class="phone-contact-avatar">' + esc(initial(c.counterpartyLabel)) + '</div>';

    return '<li class="phone-contact-row' + (unread > 0 ? " phone-contact-row--unread" : "") + '"' +
      ' data-cp-type="' + esc(c.counterpartyType) + '"' +
      ' data-cp-id="' + esc(c.counterpartyId) + '"' +
      ' data-cp-label="' + esc(c.counterpartyLabel) + '"' +
      ' data-search="' + esc((c.counterpartyLabel || "").toLowerCase()) + '">' +
        avatarHtml +
        '<div class="phone-contact-info">' +
          '<span class="phone-contact-name">' + esc(c.counterpartyLabel) + '</span>' +
          '<span class="phone-contact-preview">' + preview + '</span>' +
        '</div>' +
        (unread > 0
          ? '<span class="phone-unread-badge">' + unread + '</span>'
          : "") +
      '</li>';
  }

  function buildGroupRowHtml(g) {
    var unread = g.unreadCount || 0;
    var preview = g.lastMessageBody
      ? esc(g.lastMessageBody.length > 50 ? g.lastMessageBody.slice(0, 50) + "..." : g.lastMessageBody)
      : '<span class="phone-no-messages">Sin mensajes</span>';

    return '<li class="phone-contact-row phone-contact-row--group' + (unread > 0 ? " phone-contact-row--unread" : "") + '"' +
      ' data-group-id="' + esc(g.groupId) + '"' +
      ' data-group-name="' + esc(g.groupName) + '"' +
      ' data-search="' + esc((g.groupName || "").toLowerCase()) + '">' +
        '<div class="phone-contact-avatar phone-contact-avatar--group"><i data-lucide="users"></i></div>' +
        '<div class="phone-contact-info">' +
          '<span class="phone-contact-name">' + esc(g.groupName) + '</span>' +
          '<span class="phone-contact-preview">' + preview + '</span>' +
        '</div>' +
        (unread > 0
          ? '<span class="phone-unread-badge">' + unread + '</span>'
          : "") +
      '</li>';
  }

  function bindContactRowClicks(container) {
    container.querySelectorAll(".phone-contact-row").forEach(function (row) {
      row.addEventListener("click", function () {
        if (!ns.controller) return;
        if (row.dataset.groupId) {
          ns.controller.navigateToGroup({
            groupId: row.dataset.groupId,
            groupName: row.dataset.groupName,
          });
        } else {
          ns.controller.navigateToConversation({
            counterpartyType: row.dataset.cpType,
            counterpartyId: row.dataset.cpId,
            counterpartyLabel: row.dataset.cpLabel,
          });
        }
      });
    });
  }

  function bindSearchFilter(container) {
    var searchInput = container.querySelector(".phone-search-input");
    if (!searchInput) return;
    searchInput.addEventListener("input", function () {
      var q = (searchInput.value || "").toLowerCase().trim();
      var rows = container.querySelectorAll(".phone-contact-row");
      rows.forEach(function (row) {
        var name = row.dataset.search || "";
        row.style.display = (!q || name.indexOf(q) !== -1) ? "" : "none";
      });
    });
  }

  function renderInbox(opts) {
    ensureDOM();
    var conversations = opts.conversations || [];
    var groupConversations = opts.groupConversations || [];
    var autoContacts = opts.autoContacts || [];
    var isNarrator = opts.isNarrator || false;

    // Header
    headerEl.innerHTML =
      '<h3 class="phone-header-title">Mensajes</h3>' +
      '<button class="btn-modal-close phone-close-btn" type="button" aria-label="Cerrar">' +
        '<i data-lucide="x"></i></button>';

    headerEl.querySelector(".phone-close-btn").addEventListener("click", function () {
      if (ns.controller) ns.controller.closeModal();
    });

    // Build avatar lookup from auto-contacts
    var avatarMap = {};
    autoContacts.forEach(function (ac) {
      if (ac.avatarUrl) avatarMap["pc:" + ac.sheetId] = ac.avatarUrl;
    });

    // Build conversation map (by counterparty key)
    var convMap = {};
    conversations.forEach(function (c) {
      var key = c.counterpartyType + ":" + c.counterpartyId;
      convMap[key] = c;
      if (avatarMap[key]) c._avatarUrl = avatarMap[key];
    });

    // Merge auto-contacts that don't have conversations yet
    var merged = conversations.slice();
    autoContacts.forEach(function (ac) {
      var key = "pc:" + ac.sheetId;
      if (!convMap[key]) {
        merged.push({
          counterpartyType: "pc",
          counterpartyId: ac.sheetId,
          counterpartyLabel: ac.name,
          lastMessageBody: null,
          lastMessageAt: null,
          unreadCount: 0,
          _avatarUrl: ac.avatarUrl,
        });
      }
    });

    // Sort: conversations with messages first (by date), then auto-contacts alphabetically
    merged.sort(function (a, b) {
      if (a.lastMessageAt && !b.lastMessageAt) return -1;
      if (!a.lastMessageAt && b.lastMessageAt) return 1;
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
      }
      return (a.counterpartyLabel || "").localeCompare(b.counterpartyLabel || "");
    });

    // Sort groups by last message date
    groupConversations.sort(function (a, b) {
      if (a.lastMessageAt && !b.lastMessageAt) return -1;
      if (!a.lastMessageAt && b.lastMessageAt) return 1;
      if (a.lastMessageAt && b.lastMessageAt) {
        return new Date(b.lastMessageAt) - new Date(a.lastMessageAt);
      }
      return (a.groupName || "").localeCompare(b.groupName || "");
    });

    // Interleave groups and contacts by lastMessageAt
    var allItems = [];
    merged.forEach(function (c) {
      allItems.push({ type: "contact", data: c, lastAt: c.lastMessageAt });
    });
    groupConversations.forEach(function (g) {
      allItems.push({ type: "group", data: g, lastAt: g.lastMessageAt });
    });
    allItems.sort(function (a, b) {
      if (a.lastAt && !b.lastAt) return -1;
      if (!a.lastAt && b.lastAt) return 1;
      if (a.lastAt && b.lastAt) return new Date(b.lastAt) - new Date(a.lastAt);
      return 0;
    });

    // Render: search bar + list
    var html =
      '<div class="phone-search-bar">' +
        '<input type="text" class="phone-search-input" placeholder="Buscar...">' +
        '<button class="phone-header-btn phone-create-group-btn" type="button" aria-label="Crear grupo">' +
          '<i data-lucide="users"></i></button>' +
        (isNarrator
          ? '<button class="phone-header-btn phone-compose-btn" type="button" aria-label="Nuevo mensaje">' +
            '<i data-lucide="pencil"></i></button>'
          : "") +
      '</div>';

    if (allItems.length === 0) {
      html += '<div class="phone-empty">Sin conversaciones</div>';
    } else {
      html += '<ul class="phone-contact-list">';
      allItems.forEach(function (item) {
        if (item.type === "group") {
          html += buildGroupRowHtml(item.data);
        } else {
          html += buildContactRowHtml(item.data);
        }
      });
      html += "</ul>";
    }

    screenEl.innerHTML = html;
    inputBarEl.classList.add("hidden");

    // Bind compose (narrator)
    var composeBtn = screenEl.querySelector(".phone-compose-btn");
    if (composeBtn) {
      composeBtn.addEventListener("click", function () {
        if (ns.controller) ns.controller.showCompose();
      });
    }

    // Bind create group
    var createGroupBtn = screenEl.querySelector(".phone-create-group-btn");
    if (createGroupBtn) {
      createGroupBtn.addEventListener("click", function () {
        if (ns.controller) ns.controller.showCreateGroup();
      });
    }

    bindContactRowClicks(screenEl);
    bindSearchFilter(screenEl);
    refreshIcons();
  }

  // ================================================================
  // Screen: Inbox Narrator (shows sender→recipient pairs)
  // ================================================================

  function renderInboxNarrator(opts) {
    ensureDOM();
    var conversations = opts.conversations || [];
    var unreadPairs = opts.unreadPairs || [];

    // Build a set of "senderId:recipientId" keys for quick lookup
    var unreadKeys = new Set();
    unreadPairs.forEach(function (p) {
      unreadKeys.add(p.sender_id + ":" + p.recipient_id);
    });

    headerEl.innerHTML =
      '<h3 class="phone-header-title">Mensajes</h3>' +
      '<button class="btn-modal-close phone-close-btn" type="button" aria-label="Cerrar">' +
        '<i data-lucide="x"></i></button>';

    headerEl.querySelector(".phone-close-btn").addEventListener("click", function () {
      if (ns.controller) ns.controller.closeModal();
    });

    // Search bar + compose
    var html =
      '<div class="phone-search-bar">' +
        '<input type="text" class="phone-search-input" placeholder="Buscar contacto...">' +
        '<button class="phone-header-btn phone-compose-btn" type="button" aria-label="Nuevo mensaje">' +
          '<i data-lucide="pencil"></i></button>' +
      '</div>';

    if (conversations.length === 0) {
      html += '<div class="phone-empty">Sin conversaciones</div>';
    } else {
      html += '<ul class="phone-contact-list">';
      conversations.forEach(function (c) {
        var label = c.senderLabel + " \u2194 " + c.recipientLabel;
        var searchText = (c.senderLabel + " " + c.recipientLabel).toLowerCase();
        var preview = c.lastMessageBody
          ? esc(c.lastMessageBody.length > 50 ? c.lastMessageBody.slice(0, 50) + "..." : c.lastMessageBody)
          : "";

        // Check if this conversation has unread messages (PC→NPC direction)
        var hasUnread =
          unreadKeys.has(c.senderId + ":" + c.recipientId) ||
          unreadKeys.has(c.recipientId + ":" + c.senderId);
        var unreadDot = hasUnread ? '<span class="phone-unread-dot"></span>' : '';

        html +=
          '<li class="phone-contact-row' + (hasUnread ? ' phone-contact-unread' : '') + '"' +
          ' data-s-type="' + esc(c.senderType) + '"' +
          ' data-s-id="' + esc(c.senderId) + '"' +
          ' data-s-label="' + esc(c.senderLabel) + '"' +
          ' data-r-type="' + esc(c.recipientType) + '"' +
          ' data-r-id="' + esc(c.recipientId) + '"' +
          ' data-r-label="' + esc(c.recipientLabel) + '"' +
          ' data-search="' + esc(searchText) + '">' +
            '<div class="phone-contact-avatar">' + esc(initial(c.senderLabel)) + '</div>' +
            '<div class="phone-contact-info">' +
              '<span class="phone-contact-name">' + esc(label) + '</span>' +
              '<span class="phone-contact-preview">' + preview + '</span>' +
            '</div>' +
            unreadDot +
          '</li>';
      });
      html += "</ul>";
    }

    screenEl.innerHTML = html;
    inputBarEl.classList.add("hidden");

    // Bind compose
    var composeBtn = screenEl.querySelector(".phone-compose-btn");
    if (composeBtn) {
      composeBtn.addEventListener("click", function () {
        if (ns.controller) ns.controller.showCompose();
      });
    }

    // Bind row clicks
    screenEl.querySelectorAll(".phone-contact-row").forEach(function (row) {
      row.addEventListener("click", function () {
        if (ns.controller) {
          ns.controller.navigateToConversationNarrator({
            senderType: row.dataset.sType,
            senderId: row.dataset.sId,
            senderLabel: row.dataset.sLabel,
            recipientType: row.dataset.rType,
            recipientId: row.dataset.rId,
            recipientLabel: row.dataset.rLabel,
          });
        }
      });
    });

    bindSearchFilter(screenEl);
    refreshIcons();
  }

  // ================================================================
  // Screen: Conversation (chat bubbles)
  // ================================================================

  function renderConversation(opts) {
    ensureDOM();
    var messages = opts.messages || [];
    var counterpartyLabel = opts.counterpartyLabel || "Contacto";
    var myType = opts.myType;
    var myId = opts.myId;
    var canReply = opts.canReply !== false;

    // Header
    headerEl.innerHTML =
      '<button class="phone-header-btn phone-back-btn" type="button" aria-label="Volver">' +
        '<i data-lucide="arrow-left"></i></button>' +
      '<h3 class="phone-header-title">' + esc(counterpartyLabel) + '</h3>';

    headerEl.querySelector(".phone-back-btn").addEventListener("click", function () {
      if (ns.controller) ns.controller.navigateBackToInbox();
    });

    // Messages
    var html = '<div class="phone-messages">';
    if (messages.length === 0) {
      html += '<div class="phone-empty phone-empty--chat">Sin mensajes</div>';
    } else {
      messages.forEach(function (m) {
        var isMine = m.sender_type === myType && m.sender_id === myId;
        var emojiClass = isEmojiOnly(m.body) ? " phone-bubble--emoji" : "";
        var nameHtml = !isMine && m.sender_label
          ? '<span class="phone-bubble-sender">' + esc(m.sender_label) + '</span>'
          : "";
        html +=
          '<div class="phone-bubble ' + (isMine ? "phone-bubble--sent" : "phone-bubble--received") + emojiClass + '">' +
            nameHtml +
            '<p class="phone-bubble-text">' + esc(m.body) + '</p>' +
          '</div>';
      });
    }
    html += "</div>";

    screenEl.innerHTML = html;

    // Input bar
    if (canReply) {
      inputBarEl.classList.remove("hidden");
      inputField.value = "";
      inputField.focus();
    } else {
      inputBarEl.classList.add("hidden");
    }

    // Scroll to bottom
    var messagesDiv = screenEl.querySelector(".phone-messages");
    if (messagesDiv) {
      messagesDiv.scrollTop = messagesDiv.scrollHeight;
    }

    refreshIcons();
  }

  function appendMessage(msg, myType, myId) {
    var messagesDiv = screenEl ? screenEl.querySelector(".phone-messages") : null;
    if (!messagesDiv) return;

    // Remove empty state if present
    var emptyEl = messagesDiv.querySelector(".phone-empty--chat");
    if (emptyEl) emptyEl.remove();

    var isMine = msg.sender_type === myType && msg.sender_id === myId;
    var nameHtml = !isMine && msg.sender_label
      ? '<span class="phone-bubble-sender">' + esc(msg.sender_label) + '</span>'
      : "";
    var emojiClass = isEmojiOnly(msg.body) ? " phone-bubble--emoji" : "";
    var bubble = document.createElement("div");
    bubble.className = "phone-bubble " + (isMine ? "phone-bubble--sent" : "phone-bubble--received") + emojiClass;
    bubble.innerHTML = nameHtml + '<p class="phone-bubble-text">' + esc(msg.body) + '</p>';
    messagesDiv.appendChild(bubble);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
  }

  // ================================================================
  // Screen: Compose (narrator only)
  // ================================================================

  function renderCompose(opts) {
    ensureDOM();
    var identities = opts.identities || [];
    var pcs = opts.pcs || [];

    headerEl.innerHTML =
      '<button class="phone-header-btn phone-back-btn" type="button" aria-label="Volver">' +
        '<i data-lucide="arrow-left"></i></button>' +
      '<h3 class="phone-header-title">Nuevo Mensaje</h3>';

    headerEl.querySelector(".phone-back-btn").addEventListener("click", function () {
      if (ns.controller) ns.controller.navigateBackToInbox();
    });

    var identityOpts = identities.map(function (id) {
      var label = id.name + (id.phone_number ? " (" + id.phone_number + ")" : " (Desconocido)");
      return '<option value="' + esc(id.id) + '">' + esc(label) + '</option>';
    }).join("");

    var pcCheckboxes = pcs.map(function (pc) {
      return '<label class="phone-compose-pc">' +
        '<input type="checkbox" value="' + esc(pc.sheetId) + '" data-name="' + esc(pc.name) + '" data-user-id="' + esc(pc.userId) + '">' +
        '<span>' + esc(pc.name) + '</span>' +
      '</label>';
    }).join("");

    var html =
      '<div class="phone-compose">' +
        '<div class="phone-compose-field">' +
          '<label class="phone-compose-label">De</label>' +
          '<select id="phone-sender-select" class="phone-compose-select">' +
            '<option value="__new__">+ Crear nuevo...</option>' +
            identityOpts +
          '</select>' +
        '</div>' +

        '<div id="phone-new-sender" class="phone-compose-new-sender">' +
          '<div class="phone-compose-field">' +
            '<label class="phone-compose-label">Nombre</label>' +
            '<input type="text" id="phone-new-name" class="phone-compose-input" placeholder="Nombre del contacto" maxlength="120">' +
          '</div>' +
          '<div class="phone-compose-field">' +
            '<label class="phone-compose-label">Telefono</label>' +
            '<input type="text" id="phone-new-phone" class="phone-compose-input" placeholder="11-XXXX-XXXX" maxlength="20">' +
          '</div>' +
          '<label class="phone-compose-check">' +
            '<input type="checkbox" id="phone-unknown-toggle">' +
            '<span>Numero desconocido</span>' +
          '</label>' +
        '</div>' +

        '<div class="phone-compose-field">' +
          '<label class="phone-compose-label">Para</label>' +
          '<div class="phone-compose-recipients">' + pcCheckboxes + '</div>' +
        '</div>' +

        '<div class="phone-compose-field">' +
          '<label class="phone-compose-label">Mensaje</label>' +
          '<textarea id="phone-compose-body" class="phone-compose-textarea" placeholder="Escribir mensaje..." maxlength="2000" rows="4"></textarea>' +
        '</div>' +

        '<button type="button" id="phone-compose-send" class="btn phone-compose-send-btn">Enviar</button>' +
      '</div>';

    screenEl.innerHTML = html;
    inputBarEl.classList.add("hidden");

    // Wire up sender select toggle
    var senderSelect = document.getElementById("phone-sender-select");
    var newSenderBlock = document.getElementById("phone-new-sender");
    var newPhoneInput = document.getElementById("phone-new-phone");
    var unknownToggle = document.getElementById("phone-unknown-toggle");

    function toggleNewSender() {
      var isNew = senderSelect.value === "__new__";
      newSenderBlock.classList.toggle("hidden", !isNew);
    }
    senderSelect.addEventListener("change", toggleNewSender);
    toggleNewSender();

    // Generate phone number on first render
    if (newPhoneInput && ns.service) {
      newPhoneInput.value = ns.service.generatePhoneNumber();
    }

    // Unknown number toggle
    if (unknownToggle && newPhoneInput) {
      unknownToggle.addEventListener("change", function () {
        if (unknownToggle.checked) {
          newPhoneInput.value = "";
          newPhoneInput.disabled = true;
        } else {
          newPhoneInput.disabled = false;
          newPhoneInput.value = ns.service ? ns.service.generatePhoneNumber() : "";
        }
      });
    }

    // Send button
    var sendBtnCompose = document.getElementById("phone-compose-send");
    if (sendBtnCompose) {
      sendBtnCompose.addEventListener("click", function () {
        if (ns.controller) ns.controller.handleComposeSend();
      });
    }

    refreshIcons();
  }

  function getComposeData() {
    var senderSelect = document.getElementById("phone-sender-select");
    var isNew = senderSelect && senderSelect.value === "__new__";
    var senderIdentityId = isNew ? null : (senderSelect ? senderSelect.value : null);

    var newName = "";
    var newPhone = "";
    if (isNew) {
      var nameInput = document.getElementById("phone-new-name");
      var phoneInput = document.getElementById("phone-new-phone");
      newName = nameInput ? nameInput.value.trim() : "";
      newPhone = phoneInput ? (phoneInput.disabled ? "" : phoneInput.value.trim()) : "";
    }

    var recipients = [];
    var checkboxes = screenEl.querySelectorAll('.phone-compose-recipients input[type="checkbox"]:checked');
    checkboxes.forEach(function (cb) {
      recipients.push({
        sheetId: cb.value,
        name: cb.dataset.name || "",
        userId: cb.dataset.userId || "",
      });
    });

    var bodyEl = document.getElementById("phone-compose-body");
    var body = bodyEl ? bodyEl.value.trim() : "";

    return {
      isNewSender: isNew,
      senderIdentityId: senderIdentityId,
      newSenderName: newName,
      newSenderPhone: newPhone,
      recipients: recipients,
      body: body,
    };
  }

  function setComposeBusy(busy) {
    var btn = document.getElementById("phone-compose-send");
    if (btn) {
      btn.disabled = busy;
      btn.textContent = busy ? "Enviando..." : "Enviar";
    }
  }

  // ================================================================
  // Screen: Create Group
  // ================================================================

  function renderCreateGroup(opts) {
    ensureDOM();
    var pcs = opts.pcs || [];
    var mySheetId = opts.mySheetId || null;

    headerEl.innerHTML =
      '<button class="phone-header-btn phone-back-btn" type="button" aria-label="Volver">' +
        '<i data-lucide="arrow-left"></i></button>' +
      '<h3 class="phone-header-title">Nuevo Grupo</h3>';

    headerEl.querySelector(".phone-back-btn").addEventListener("click", function () {
      if (ns.controller) ns.controller.navigateBackToInbox();
    });

    var pcCheckboxes = pcs.map(function (pc) {
      var checked = pc.sheetId === mySheetId ? " checked disabled" : "";
      return '<label class="phone-compose-pc">' +
        '<input type="checkbox" value="' + esc(pc.sheetId) + '"' +
        ' data-name="' + esc(pc.name) + '"' +
        ' data-type="pc"' + checked + '>' +
        '<span>' + esc(pc.name) + '</span>' +
      '</label>';
    }).join("");

    var html =
      '<div class="phone-compose">' +
        '<div class="phone-compose-field">' +
          '<label class="phone-compose-label">Nombre del grupo</label>' +
          '<input type="text" id="phone-group-name" class="phone-compose-input" placeholder="Ej: Coterie Almagro" maxlength="120">' +
        '</div>' +
        '<div class="phone-compose-field">' +
          '<label class="phone-compose-label">Participantes</label>' +
          '<div class="phone-compose-recipients">' + pcCheckboxes + '</div>' +
        '</div>' +
        '<button type="button" id="phone-group-create" class="btn phone-compose-send-btn">Crear Grupo</button>' +
      '</div>';

    screenEl.innerHTML = html;
    inputBarEl.classList.add("hidden");

    var createBtn = document.getElementById("phone-group-create");
    if (createBtn) {
      createBtn.addEventListener("click", function () {
        if (ns.controller) ns.controller.handleCreateGroup();
      });
    }

    refreshIcons();
  }

  function getCreateGroupData() {
    var nameInput = document.getElementById("phone-group-name");
    var name = nameInput ? nameInput.value.trim() : "";

    var members = [];
    var checkboxes = screenEl.querySelectorAll('.phone-compose-recipients input[type="checkbox"]:checked');
    checkboxes.forEach(function (cb) {
      members.push({
        type: cb.dataset.type || "pc",
        id: cb.value,
        label: cb.dataset.name || "",
      });
    });

    return { name: name, members: members };
  }

  function setCreateGroupBusy(busy) {
    var btn = document.getElementById("phone-group-create");
    if (btn) {
      btn.disabled = busy;
      btn.textContent = busy ? "Creando..." : "Crear Grupo";
    }
  }

  // ================================================================
  // Helpers
  // ================================================================

  function refreshIcons() {
    if (global.lucide && modalEl) {
      global.lucide.createIcons({ nodes: [modalEl] });
    }
  }

  function showError(msg) {
    ensureDOM();
    screenEl.innerHTML = '<div class="phone-error">' + esc(msg) + '</div>';
  }

  function showLoading() {
    ensureDOM();
    screenEl.innerHTML = '<div class="phone-loading">Cargando...</div>';
  }

  ns.view = {
    ensureDOM: ensureDOM,
    open: open,
    close: close,
    isOpen: isOpen,
    renderInbox: renderInbox,
    renderInboxNarrator: renderInboxNarrator,
    renderConversation: renderConversation,
    appendMessage: appendMessage,
    renderCompose: renderCompose,
    getComposeData: getComposeData,
    setComposeBusy: setComposeBusy,
    renderCreateGroup: renderCreateGroup,
    getCreateGroupData: getCreateGroupData,
    setCreateGroupBusy: setCreateGroupBusy,
    setHealthLevel: setHealthLevel,
    setPhoneColor: setPhoneColor,
    showError: showError,
    showLoading: showLoading,
  };
})(window);
