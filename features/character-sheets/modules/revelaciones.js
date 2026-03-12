(function initABNSheetRevelaciones(global) {
  const DISPLAY_LIMIT = 5;
  const TOAST_AUTO_DISMISS_MS = 20000;
  const REFRESH_POLL_MS = 10000;

  const state = {
    chronicleId: null,
    playerId: null,
    rows: [],
    lastKnownRows: new Map(),
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

  function getAdapter() {
    return global.ABNShared?.documentTypes?.get?.("revelation") || null;
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
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

  function getRowTimestamp(row) {
    const raw = row?.delivered_at || row?.created_at || "";
    const stamp = raw ? new Date(raw).getTime() : 0;
    return Number.isFinite(stamp) ? stamp : 0;
  }

  async function fetchRows() {
    const adapter = getAdapter();
    if (adapter?.fetchRows) {
      return adapter.fetchRows({
        chronicleId: state.chronicleId,
        currentPlayerId: state.playerId,
        isNarrator: false,
      });
    }

    // Fallback: use handouts API directly
    const handoutsApi = getHandoutsApi();
    if (handoutsApi?.listPendingDeliveries && state.playerId) {
      return handoutsApi.listPendingDeliveries({
        playerId: state.playerId,
        chronicleId: state.chronicleId,
      });
    }

    return [];
  }

  function renderList() {
    const host = document.getElementById("revelaciones-list");
    if (!host) return;

    if (!state.rows.length) {
      host.innerHTML = '<p class="muted">Sin revelaciones.</p>';
      return;
    }

    const visible = state.rows.slice(0, DISPLAY_LIMIT);

    host.innerHTML = visible
      .map((row) => {
        const title = escapeHtml(row.title || "Revelación");
        const date = escapeHtml(formatDate(row.delivered_at || row.created_at));
        const tags = Array.isArray(row.tags) ? row.tags : [];
        const tagsHtml = tags.length
          ? `<div class="revelaciones-item-tags">${tags
              .map((t) => `<span class="revelaciones-tag">${escapeHtml(t)}</span>`)
              .join("")}</div>`
          : "";
        return `
          <article class="revelaciones-item" data-revelation-id="${escapeHtml(row.revelation_id || row.id)}">
            <div class="revelaciones-item-content">
              <strong class="revelaciones-item-title">${title}</strong>
              <span class="revelaciones-item-date">${date}</span>
            </div>
            ${tagsHtml}
          </article>`;
      })
      .join("");

    if (state.rows.length > DISPLAY_LIMIT) {
      const moreBtn = document.createElement("button");
      moreBtn.type = "button";
      moreBtn.className = "objeto-view-archive-btn";
      moreBtn.textContent = `Ver archivo completo (${state.rows.length} revelaciones)`;
      moreBtn.addEventListener("click", () => navigateToArchive());
      host.appendChild(moreBtn);
    }

    host.querySelectorAll(".revelaciones-item").forEach((el) => {
      el.addEventListener("click", () => {
        const revelationId = el.dataset.revelationId;
        if (revelationId) openViewer(revelationId);
      });
    });
  }

  function openViewer(revelationId) {
    if (!revelationId) return;

    const parentInbox = global.parent?.ABNActiveCharacterSheet?.handoutsInbox;
    if (global.parent && global.parent !== global && parentInbox?.openRevelationView) {
      parentInbox.openRevelationView({ revelationId });
      return;
    }
    parent.postMessage({ type: "abn-open-revelation-view", revelationId }, "*");
  }

  function showParentToast(row) {
    const parentInbox = global.parent?.ABNActiveCharacterSheet?.handoutsInbox;
    if (
      global.parent &&
      global.parent !== global &&
      typeof parentInbox?.showToast === "function"
    ) {
      parentInbox.showToast({
        revelationId: row.revelation_id || row.id || "",
        title: row.title || "Nueva revelación",
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

    if (titleEl) titleEl.textContent = row.title || "Nueva revelación";

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
      openViewer(row.revelation_id || row.id);
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

  function applyRows(rows, { notify = false } = {}) {
    const previousRows = state.lastKnownRows;
    state.rows = Array.isArray(rows) ? rows : [];
    renderList();

    const newRows = notify
      ? state.rows.filter((row) => {
          const rowId = row.revelation_id || row.id;
          const previousTimestamp = previousRows.get(rowId);
          if (!previousRows.has(rowId)) return true;
          return getRowTimestamp(row) > previousTimestamp;
        })
      : [];
    if (newRows.length) {
      void showToast(newRows[0]);
    }

    state.lastKnownRows = new Map(
      state.rows.map((row) => [row.revelation_id || row.id, getRowTimestamp(row)])
    );
  }

  async function refreshDeliveries({ notify = false } = {}) {
    if (!state.playerId || !state.chronicleId || state.refreshInFlight) return;
    state.refreshInFlight = true;
    try {
      const rows = await fetchRows();
      applyRows(rows, { notify });
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

  function navigateToArchive() {
    if (!state.chronicleId) return;
    const hash = `document-archive?id=${encodeURIComponent(state.chronicleId)}&type=revelation`;
    window.parent?.location
      ? (window.parent.location.hash = hash)
      : (window.location.hash = hash);
  }

  function bindArchiveButton() {
    const btn = document.getElementById("revelacion-archive-btn");
    if (!btn || btn._abnBound) return;
    btn.addEventListener("click", () => navigateToArchive());
    btn._abnBound = true;
  }

  async function init(chronicleId, ownerUserId) {
    if (!chronicleId) return;

    destroy();
    state.chronicleId = chronicleId;

    const supabase = getSupabase();
    if (!supabase) return;

    let targetUserId = ownerUserId;
    if (!targetUserId) {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      targetUserId = user.id;
    }

    const { data: player } = await supabase
      .from("players")
      .select("id")
      .eq("user_id", targetUserId)
      .maybeSingle();
    if (!player?.id) return;

    state.playerId = player.id;

    await refreshDeliveries();
    subscribe();
    startPolling();
    bindRefreshTriggers();
    bindArchiveButton();
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

    state.rows = [];
    state.lastKnownRows.clear();
    state.playerId = null;
    state.chronicleId = null;
    state.refreshInFlight = false;
  }

  global.ABNSheetRevelaciones = {
    init,
    destroy,
  };
})(window);
