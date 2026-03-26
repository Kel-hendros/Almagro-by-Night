/**
 * Phone Button — Floating phone icon on the character sheet wrapper.
 * Opens the in-game phone modal for the active character.
 */
(function initActiveSheetPhoneButton(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let btnEl = null;
  let badgeEl = null;
  let smsReceivedHandler = null;
  let unreadChangedHandler = null;
  let toastClickHandler = null;

  function getSheetId() {
    var hash = window.location.hash.replace(/^#/, "");
    var params = new URLSearchParams(hash.split("?")[1] || "");
    return params.get("id") || null;
  }

  function getChronicleId() {
    return localStorage.getItem("currentChronicleId") || null;
  }

  function ensureButton() {
    if (btnEl && document.body.contains(btnEl)) return btnEl;

    const container = document.querySelector(".active-character-sheet-container");
    if (!container) return null;

    btnEl = document.createElement("button");
    btnEl.type = "button";
    btnEl.className = "acs-phone-btn";
    btnEl.setAttribute("aria-label", "Telefono");
    btnEl.innerHTML =
      '<i data-lucide="smartphone"></i>' +
      '<span class="acs-phone-badge hidden">0</span>';

    badgeEl = btnEl.querySelector(".acs-phone-badge");

    btnEl.addEventListener("click", function () {
      var chronicleId = getChronicleId();
      var sheetId = getSheetId();
      if (!chronicleId || !sheetId) return;
      if (global.ABNPhone?.controller?.openInbox) {
        global.ABNPhone.controller.openInbox({
          chronicleId: chronicleId,
          characterSheetId: sheetId,
        });
      }
    });

    container.appendChild(btnEl);
    if (global.lucide) global.lucide.createIcons({ nodes: [btnEl] });
    return btnEl;
  }

  function updateBadge(count) {
    if (!badgeEl) return;
    var n = count || 0;
    badgeEl.textContent = n > 99 ? "99+" : String(n);
    badgeEl.classList.toggle("hidden", n === 0);
  }

  async function refreshUnread() {
    if (!global.ABNPhone?.controller?.getUnreadCount) return;
    var count = await global.ABNPhone.controller.getUnreadCount();
    updateBadge(count);
  }

  function init() {
    ensureButton();

    // Listen for new SMS notifications to bump badge
    smsReceivedHandler = function () {
      refreshUnread();
    };
    window.addEventListener("abn-sms-received", smsReceivedHandler);

    // Listen for unread count changes from phone controller
    unreadChangedHandler = function (e) {
      updateBadge(e.detail?.count || 0);
    };
    window.addEventListener("abn-phone-unread-changed", unreadChangedHandler);

    // Listen for SMS toast clicks to open phone to that conversation
    toastClickHandler = function (e) {
      var meta = e.detail || {};
      var chronicleId = getChronicleId();
      var sheetId = getSheetId();
      if (!chronicleId || !sheetId) return;
      if (global.ABNPhone?.controller?.openToConversation) {
        global.ABNPhone.controller.openToConversation({
          chronicleId: chronicleId,
          characterSheetId: sheetId,
          counterpartyType: meta.senderType || null,
          counterpartyId: meta.senderId || null,
          counterpartyLabel: meta.senderLabel || "Contacto",
        });
      }
    };
    window.addEventListener("abn-sms-toast-click", toastClickHandler);

    // Initial unread fetch
    refreshUnread();
  }

  function destroy() {
    if (smsReceivedHandler) {
      window.removeEventListener("abn-sms-received", smsReceivedHandler);
      smsReceivedHandler = null;
    }
    if (unreadChangedHandler) {
      window.removeEventListener("abn-phone-unread-changed", unreadChangedHandler);
      unreadChangedHandler = null;
    }
    if (toastClickHandler) {
      window.removeEventListener("abn-sms-toast-click", toastClickHandler);
      toastClickHandler = null;
    }
    if (btnEl) {
      btnEl.remove();
      btnEl = null;
    }
    badgeEl = null;
  }

  ns.phoneButton = {
    init,
    destroy,
  };
})(window);
