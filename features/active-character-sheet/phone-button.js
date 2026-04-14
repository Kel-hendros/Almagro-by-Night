/**
 * Phone Button Bridge — Listens for postMessage from the character sheet
 * iframe to open the phone modal. Badge updates are also managed here.
 */
(function initActiveSheetPhoneButton(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  let smsReceivedHandler = null;
  let unreadChangedHandler = null;
  let toastClickHandler = null;
  let messageHandler = null;

  function getSheetId() {
    var hash = window.location.hash.replace(/^#/, "");
    var params = new URLSearchParams(hash.split("?")[1] || "");
    return params.get("id") || null;
  }

  function openPhone() {
    var sheetId = getSheetId();
    if (!sheetId) return;
    if (global.ABNPhone?.controller?.openInbox) {
      global.ABNPhone.controller.openInbox({
        characterSheetId: sheetId,
      });
    }
  }

  function onMessage(e) {
    if (e.data?.type === "abn-open-phone") {
      openPhone();
    }
  }

  async function refreshUnread() {
    var svc = global.ABNPhone?.service;
    if (!svc?.fetchUnreadCount) return;
    var sheetId = getSheetId();
    if (!sheetId) return;
    var count = await svc.fetchUnreadCount("pc", sheetId);
    // Send unread count to iframe for badge display
    var frame = document.getElementById("acs-frame");
    if (frame?.contentWindow) {
      frame.contentWindow.postMessage(
        { type: "abn-phone-unread", count: count },
        "*"
      );
    }
  }

  function init() {
    messageHandler = onMessage;
    window.addEventListener("message", messageHandler);

    smsReceivedHandler = function () {
      refreshUnread();
    };
    window.addEventListener("abn-sms-received", smsReceivedHandler);

    unreadChangedHandler = function (e) {
      var frame = document.getElementById("acs-frame");
      if (frame?.contentWindow) {
        frame.contentWindow.postMessage(
          { type: "abn-phone-unread", count: e.detail?.count || 0 },
          "*"
        );
      }
    };
    window.addEventListener("abn-phone-unread-changed", unreadChangedHandler);

    toastClickHandler = function (e) {
      var meta = e.detail || {};
      var sheetId = getSheetId();
      if (!sheetId) return;
      if (global.ABNPhone?.controller?.openToConversation) {
        global.ABNPhone.controller.openToConversation({
          characterSheetId: sheetId,
          counterpartyType: meta.senderType || null,
          counterpartyId: meta.senderId || null,
          counterpartyLabel: meta.senderLabel || "Contacto",
        });
      }
    };
    window.addEventListener("abn-sms-toast-click", toastClickHandler);

    refreshUnread();

    // Re-send unread count when iframe finishes loading
    var frame = document.getElementById("acs-frame");
    if (frame) {
      frame.addEventListener("load", function () { refreshUnread(); });
    }
  }

  function destroy() {
    if (messageHandler) {
      window.removeEventListener("message", messageHandler);
      messageHandler = null;
    }
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
  }

  ns.phoneButton = {
    init,
    destroy,
  };
})(window);
