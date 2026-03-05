(function initABNSheetRevelaciones(global) {
  const BUCKET_ID = "revelations-private";
  const PRIVATE_REF_PREFIX = "abn-private://";
  const SIGNED_URL_TTL = 60 * 60;
  const TOAST_AUTO_DISMISS_MS = 20000;
  const REFRESH_POLL_MS = 10000;

  const state = {
    chronicleId: null,
    playerId: null,
    deliveries: [],
    lastKnownDeliveries: new Map(),
    realtimeChannel: null,
    toastTimer: null,
    pollTimer: null,
    refreshInFlight: false,
    onVisibilityChange: null,
    onFocus: null,
  };

  function getSupabase() {
    return global.supabase || null;
  }

  function getHandoutsApi() {
    return global.ABNShared?.handouts || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function parsePrivateImageRef(imageRef) {
    const raw = String(imageRef || "").trim();
    if (!raw.startsWith(PRIVATE_REF_PREFIX)) return null;
    const suffix = raw.slice(PRIVATE_REF_PREFIX.length);
    const slash = suffix.indexOf("/");
    if (slash <= 0) return null;
    const bucketId = suffix.slice(0, slash);
    const objectPath = suffix.slice(slash + 1);
    if (!bucketId || !objectPath) return null;
    return { bucketId, objectPath };
  }

  async function resolveSignedUrl(imageRef) {
    const supabase = getSupabase();
    const parsed = parsePrivateImageRef(imageRef);
    if (!supabase || !parsed) return "";
    const { data, error } = await supabase.storage
      .from(parsed.bucketId)
      .createSignedUrl(parsed.objectPath, SIGNED_URL_TTL);
    if (error) return "";
    return String(data?.signedUrl || "");
  }

  async function fetchDeliveries() {
    const handoutsApi = getHandoutsApi();
    if (handoutsApi?.listPendingDeliveries && state.playerId) {
      return handoutsApi.listPendingDeliveries({
        playerId: state.playerId,
        chronicleId: state.chronicleId,
      });
    }

    const supabase = getSupabase();
    if (!supabase || !state.playerId) return [];

    const { data, error } = await supabase
      .from("revelation_players")
      .select(
        "id, revelation_id, player_id, associated_at, handout:revelations(id, chronicle_id, title, body_markdown, image_url, created_at, tags)"
      )
      .eq("player_id", state.playerId)
      .order("associated_at", { ascending: false });

    if (error) {
      console.warn("Revelaciones (sheet): error al cargar:", error.message);
      return [];
    }

    const rows = (data || []).filter(
      (row) => row.handout && row.handout.chronicle_id === state.chronicleId
    );

    return Promise.all(
      rows.map(async (row) => ({
        ...row,
        handout: {
          ...row.handout,
          image_signed_url: await resolveSignedUrl(row.handout.image_url),
        },
      }))
    );
  }

  function formatDate(dateStr) {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleDateString("es-AR", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    } catch (_e) {
      return "";
    }
  }

  function getDeliveryTimestamp(row) {
    const raw = row?.associated_at || row?.delivered_at || row?.handout?.created_at || "";
    const stamp = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  }

  function renderList() {
    const host = document.getElementById("revelaciones-list");
    if (!host) return;

    if (!state.deliveries.length) {
      host.innerHTML = '<p class="muted">Sin revelaciones.</p>';
      return;
    }

    host.innerHTML = state.deliveries
      .map((row) => {
        const h = row.handout || {};
        const title = escapeHtml(h.title || "Revelación");
        const date = escapeHtml(formatDate(row.associated_at || row.delivered_at || h.created_at));
        const tags = Array.isArray(h.tags) ? h.tags : [];
        const tagsHtml = tags.length
          ? `<div class="revelaciones-item-tags">${tags
              .map((t) => `<span class="revelaciones-tag">${escapeHtml(t)}</span>`)
              .join("")}</div>`
          : "";
        return `
          <article class="revelaciones-item" data-delivery-idx="${escapeHtml(row.id)}">
            <div class="revelaciones-item-content">
              <strong class="revelaciones-item-title">${title}</strong>
              <span class="revelaciones-item-date">${date}</span>
            </div>
            ${tagsHtml}
          </article>`;
      })
      .join("");

    host.querySelectorAll(".revelaciones-item").forEach((el) => {
      el.addEventListener("click", () => {
        const id = el.dataset.deliveryIdx;
        const row = state.deliveries.find((delivery) => delivery.id === id);
        if (row) openViewer(row);
      });
    });
  }

  function openViewer(row) {
    const h = row.handout || {};
    const parentInbox = global.parent?.ABNActiveCharacterSheet?.handoutsInbox;
    if (global.parent && global.parent !== global && parentInbox?.openRevelationView) {
      parentInbox.openRevelationView({
        title: h.title || "",
        bodyMarkdown: h.body_markdown || "",
        imageUrl: h.image_signed_url || "",
        tags: h.tags || [],
      });
      return;
    }
    parent.postMessage(
      {
        type: "abn-open-revelation-view",
        title: h.title || "",
        bodyMarkdown: h.body_markdown || "",
        imageUrl: h.image_signed_url || "",
        tags: h.tags || [],
      },
      "*"
    );
  }

  function showParentToast(row) {
    const h = row.handout || {};
    const parentInbox = global.parent?.ABNActiveCharacterSheet?.handoutsInbox;
    if (
      global.parent &&
      global.parent !== global &&
      typeof parentInbox?.showToast === "function"
    ) {
      parentInbox.showToast({
        title: h.title || "Nueva revelación",
        bodyMarkdown: h.body_markdown || "",
        imageUrl: h.image_signed_url || "",
        tags: h.tags || [],
      });
      return true;
    }
    return false;
  }

  function showLocalToast(row) {
    const toast = document.getElementById("revelacion-toast");
    const titleEl = document.getElementById("revelacion-toast-title");
    const viewBtn = document.getElementById("revelacion-toast-view");
    const dismissBtn = document.getElementById("revelacion-toast-dismiss");
    if (!toast || !viewBtn || !dismissBtn) return;

    const h = row.handout || {};
    if (titleEl) titleEl.textContent = h.title || "Nueva revelación";

    toast.classList.remove("hidden");

    if (state.toastTimer) clearTimeout(state.toastTimer);

    const hideToast = () => {
      toast.classList.add("hidden");
      if (state.toastTimer) clearTimeout(state.toastTimer);
      state.toastTimer = null;
      viewBtn.onclick = null;
      dismissBtn.onclick = null;
    };

    viewBtn.onclick = () => {
      openViewer(row);
      hideToast();
    };
    dismissBtn.onclick = () => {
      hideToast();
    };

    state.toastTimer = global.setTimeout(hideToast, TOAST_AUTO_DISMISS_MS);
  }

  async function showToast(row) {
    if (showParentToast(row)) return;
    showLocalToast(row);
  }

  function applyDeliveries(deliveries, { notify = false } = {}) {
    const previousDeliveries = state.lastKnownDeliveries;
    state.deliveries = Array.isArray(deliveries) ? deliveries : [];
    renderList();

    const newRows = notify
      ? state.deliveries.filter((delivery) => {
          const previousTimestamp = previousDeliveries.get(delivery.id);
          if (!previousDeliveries.has(delivery.id)) return true;
          return getDeliveryTimestamp(delivery) > previousTimestamp;
        })
      : [];
    if (newRows.length) {
      void showToast(newRows[0]);
    }

    state.lastKnownDeliveries = new Map(
      state.deliveries.map((delivery) => [delivery.id, getDeliveryTimestamp(delivery)])
    );
  }

  async function refreshDeliveries({ notify = false } = {}) {
    if (!state.playerId || !state.chronicleId || state.refreshInFlight) return;
    state.refreshInFlight = true;
    try {
      const deliveries = await fetchDeliveries();
      applyDeliveries(deliveries, { notify });
    } finally {
      state.refreshInFlight = false;
    }
  }

  function unsubscribeRealtime() {
    if (!state.realtimeChannel) return;

    const handoutsApi = getHandoutsApi();
    if (handoutsApi?.unsubscribeChannel) {
      handoutsApi.unsubscribeChannel(state.realtimeChannel);
      state.realtimeChannel = null;
      return;
    }

    const supabase = getSupabase();
    try {
      state.realtimeChannel.unsubscribe?.();
    } catch (_e) {}
    try {
      supabase?.removeChannel?.(state.realtimeChannel);
    } catch (_e) {}
    state.realtimeChannel = null;
  }

  function bindRefreshTriggers() {
    if (!state.onVisibilityChange) {
      state.onVisibilityChange = () => {
        if (document.visibilityState === "visible") {
          void refreshDeliveries({ notify: true });
        }
      };
      document.addEventListener("visibilitychange", state.onVisibilityChange);
    }

    if (!state.onFocus) {
      state.onFocus = () => {
        void refreshDeliveries({ notify: true });
      };
      global.addEventListener("focus", state.onFocus);
    }
  }

  function unbindRefreshTriggers() {
    if (state.onVisibilityChange) {
      document.removeEventListener("visibilitychange", state.onVisibilityChange);
      state.onVisibilityChange = null;
    }

    if (state.onFocus) {
      global.removeEventListener("focus", state.onFocus);
      state.onFocus = null;
    }
  }

  function startPolling() {
    if (state.pollTimer) clearInterval(state.pollTimer);
    state.pollTimer = global.setInterval(() => {
      void refreshDeliveries({ notify: true });
    }, REFRESH_POLL_MS);
  }

  function subscribe() {
    const supabase = getSupabase();
    if (!supabase || !state.playerId) return;

    unsubscribeRealtime();

    const handoutsApi = getHandoutsApi();
    if (handoutsApi?.subscribeDeliveriesForPlayer) {
      state.realtimeChannel = handoutsApi.subscribeDeliveriesForPlayer({
        playerId: state.playerId,
        onChange: () => {
          void refreshDeliveries({ notify: true });
        },
      });
      return;
    }

    state.realtimeChannel = supabase
      .channel(`sheet-revelaciones-${state.playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "revelation_players",
          filter: `player_id=eq.${state.playerId}`,
        },
        () => {
          void refreshDeliveries({ notify: true });
        }
      )
      .subscribe();
  }

  async function init(chronicleId) {
    if (!chronicleId) return;

    destroy();
    state.chronicleId = chronicleId;

    const supabase = getSupabase();
    if (!supabase) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", user.id)
      .maybeSingle();
    if (!player?.id) return;

    state.playerId = player.id;

    await refreshDeliveries();
    subscribe();
    startPolling();
    bindRefreshTriggers();
  }

  function destroy() {
    unsubscribeRealtime();

    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    if (state.pollTimer) {
      clearInterval(state.pollTimer);
      state.pollTimer = null;
    }

    unbindRefreshTriggers();

    state.deliveries = [];
    state.lastKnownDeliveries.clear();
    state.playerId = null;
    state.chronicleId = null;
    state.refreshInFlight = false;
  }

  global.ABNSheetRevelaciones = {
    init,
    destroy,
  };
})(window);
