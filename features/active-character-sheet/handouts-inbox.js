(function initActiveSheetHandoutsInbox(global) {
  const ns = (global.ABNActiveCharacterSheet =
    global.ABNActiveCharacterSheet || {});

  const state = {
    chronicleId: null,
    playerId: null,
    deliveries: [],
    modal: null,
    realtimeChannel: null,
    bound: false,
  };

  function getChronicleId() {
    return localStorage.getItem("currentChronicleId") || null;
  }

  function setCount(count) {
    const btn = document.getElementById("acs-handouts-btn");
    const badge = document.getElementById("acs-handouts-badge");
    if (!btn || !badge) return;
    btn.classList.remove("hidden");
    const safe = Number.isFinite(count) ? count : 0;
    badge.textContent = String(safe);
    badge.classList.toggle("hidden", safe <= 0);
  }

  function renderList() {
    const host = document.getElementById("acs-handouts-list");
    if (!host) return;
    if (!state.deliveries.length) {
      host.innerHTML = '<p class="muted">Sin revelaciones asociadas.</p>';
      return;
    }
    host.innerHTML = state.deliveries
      .map((row) => {
        const handout = row.handout || {};
        const title = global.escapeHtml(handout.title || "Revelación");
        const deliveredAt = row.delivered_at
          ? new Date(row.delivered_at).toLocaleString("es-AR")
          : "Ahora";
        return `
          <article class="acs-handout-item" data-delivery-id="${global.escapeHtml(row.id)}">
            <h3>${title}</h3>
            <p>Asociada: ${global.escapeHtml(deliveredAt)}</p>
          </article>
        `;
      })
      .join("");
  }

  async function loadPending() {
    if (!state.playerId) return;
    const handoutsApi = global.ABNShared?.handouts;
    if (!handoutsApi) return;
    state.deliveries = await handoutsApi.listPendingDeliveries({
      playerId: state.playerId,
      chronicleId: state.chronicleId,
    });
    setCount(state.deliveries.length);
    renderList();
  }

  async function openDelivery(deliveryId) {
    const handoutsApi = global.ABNShared?.handouts;
    if (!handoutsApi || !deliveryId) return;
    const row = state.deliveries.find((item) => item.id === deliveryId);
    if (!row?.handout) return;

    const rs = global.ABNShared?.revelationScreen;
    if (rs) {
      rs.openView({
        title: row.handout.title,
        bodyMarkdown: row.handout.body_markdown,
        imageUrl: row.handout.image_signed_url,
        tags: row.handout.tags,
      });
    }

    await handoutsApi.markDeliveryOpened(deliveryId, state.playerId);
    await loadPending();
  }

  function bindEvents() {
    if (state.bound) return;
    const openBtn = document.getElementById("acs-handouts-btn");
    const list = document.getElementById("acs-handouts-list");
    if (openBtn) {
      openBtn.addEventListener("click", () => state.modal?.open?.());
    }
    if (list) {
      list.addEventListener("click", (event) => {
        const item = event.target.closest(".acs-handout-item");
        if (!item?.dataset.deliveryId) return;
        openDelivery(item.dataset.deliveryId);
      });
    }
    state.bound = true;
  }

  async function init() {
    const sessionRes = await global.abnGetSession();
    const session = sessionRes?.data?.session || null;
    if (!session) return;

    const handoutsApi = global.ABNShared?.handouts;
    if (!handoutsApi) return;

    state.chronicleId = getChronicleId();
    const player = await handoutsApi.getCurrentPlayerByUserId(session.user.id);
    state.playerId = player?.id || null;
    if (!state.playerId) return;

    state.modal = global.ABNShared?.modal?.createController({
      overlay: "acs-handouts-modal",
      closeButtons: ["#acs-handouts-close"],
    });

    bindEvents();
    await loadPending();

    state.realtimeChannel = handoutsApi.subscribeDeliveriesForPlayer({
      playerId: state.playerId,
      onChange: () => {
        loadPending();
      },
    });
  }

  function destroy() {
    global.ABNShared?.handouts?.unsubscribeChannel?.(state.realtimeChannel);
    state.realtimeChannel = null;
    state.deliveries = [];
    state.playerId = null;
    state.chronicleId = null;
    state.modal?.destroy?.();
    state.modal = null;
    state.bound = false;
  }

  ns.handoutsInbox = {
    init,
    destroy,
  };
})(window);
