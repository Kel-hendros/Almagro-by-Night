/**
 * Phone Button — Rendered next to the avatar inside the character sheet.
 * Sends a postMessage to the parent frame to open the phone.
 * Receives unread count from parent to display badge.
 */
(function initSheetPhoneButton(global) {
  var wrapperEl = null;
  var btnEl = null;
  var badgeEl = null;
  var messageHandler = null;

  function isEmbedded() {
    try { return global.self !== global.top; } catch (_) { return true; }
  }

  function onMessage(e) {
    if (e.data?.type === "abn-phone-unread") {
      updateBadge(e.data.count || 0);
    }
  }

  function updateBadge(count) {
    if (!badgeEl) return;
    badgeEl.textContent = count > 99 ? "99+" : String(count);
    badgeEl.classList.toggle("hidden", count === 0);
  }

  function create() {
    if (!isEmbedded()) return;

    var avatar = document.querySelector(".profile-back-link");
    if (!avatar || document.querySelector(".sheet-phone-wrap")) return;

    // Wrap the avatar so we can position the button relative to it
    wrapperEl = document.createElement("div");
    wrapperEl.className = "sheet-phone-wrap";
    avatar.parentNode.insertBefore(wrapperEl, avatar);
    wrapperEl.appendChild(avatar);

    btnEl = document.createElement("button");
    btnEl.type = "button";
    btnEl.className = "sheet-phone-btn";
    btnEl.setAttribute("aria-label", "Telefono");
    btnEl.innerHTML =
      '<i data-lucide="smartphone"></i>' +
      '<span class="sheet-phone-badge hidden">0</span>';

    badgeEl = btnEl.querySelector(".sheet-phone-badge");

    btnEl.addEventListener("click", function (e) {
      e.preventDefault();
      e.stopPropagation();
      global.parent.postMessage({ type: "abn-open-phone" }, "*");
    });

    wrapperEl.appendChild(btnEl);
    if (global.lucide) global.lucide.createIcons({ nodes: [btnEl] });

    messageHandler = onMessage;
    global.addEventListener("message", messageHandler);
  }

  function destroy() {
    if (messageHandler) {
      global.removeEventListener("message", messageHandler);
      messageHandler = null;
    }
    if (wrapperEl) {
      // Unwrap: move avatar back out
      var avatar = wrapperEl.querySelector(".profile-back-link");
      if (avatar && wrapperEl.parentNode) {
        wrapperEl.parentNode.insertBefore(avatar, wrapperEl);
      }
      wrapperEl.remove();
      wrapperEl = null;
    }
    if (btnEl) {
      btnEl.remove();
      btnEl = null;
    }
    badgeEl = null;
  }

  global.ABNSheetPhoneButton = { create: create, destroy: destroy };
})(window);
