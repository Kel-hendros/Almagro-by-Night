(function initABNSheetRevelaciones(global) {
  const BUCKET_ID = "revelations-private";
  const PRIVATE_REF_PREFIX = "abn-private://";
  const SIGNED_URL_TTL = 60 * 60;
  const TOAST_AUTO_DISMISS_MS = 20000;

  const state = {
    chronicleId: null,
    playerId: null,
    deliveries: [],
    lastKnownIds: new Set(),
    realtimeChannel: null,
    toastTimer: null,
  };

  function getSupabase() {
    return global.supabase || null;
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

    const withSigned = await Promise.all(
      rows.map(async (row) => ({
        ...row,
        handout: {
          ...row.handout,
          image_signed_url: await resolveSignedUrl(row.handout.image_url),
        },
      }))
    );

    return withSigned;
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
        const date = escapeHtml(formatDate(row.associated_at || h.created_at));
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
        const row = state.deliveries.find((d) => d.id === id);
        if (row) openViewer(row);
      });
    });
  }

  function openViewer(row) {
    const h = row.handout || {};
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

  function showToast(row) {
    const toast = document.getElementById("revelacion-toast");
    const titleEl = document.getElementById("revelacion-toast-title");
    const viewBtn = document.getElementById("revelacion-toast-view");
    const dismissBtn = document.getElementById("revelacion-toast-dismiss");
    if (!toast) return;

    const h = row.handout || {};
    if (titleEl) titleEl.textContent = h.title || "Nueva revelación";

    toast.classList.remove("hidden");

    if (state.toastTimer) clearTimeout(state.toastTimer);

    const hideToast = () => {
      toast.classList.add("hidden");
      if (state.toastTimer) clearTimeout(state.toastTimer);
      state.toastTimer = null;
    };

    const onView = () => {
      openViewer(row);
      hideToast();
      viewBtn.removeEventListener("click", onView);
      dismissBtn.removeEventListener("click", onDismiss);
    };
    const onDismiss = () => {
      hideToast();
      viewBtn.removeEventListener("click", onView);
      dismissBtn.removeEventListener("click", onDismiss);
    };

    viewBtn.addEventListener("click", onView);
    dismissBtn.addEventListener("click", onDismiss);

    state.toastTimer = setTimeout(hideToast, TOAST_AUTO_DISMISS_MS);
  }

  function subscribe() {
    const supabase = getSupabase();
    if (!supabase || !state.playerId) return;

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
        async () => {
          const prev = state.lastKnownIds;
          state.deliveries = await fetchDeliveries();
          renderList();

          const newRows = state.deliveries.filter((d) => !prev.has(d.id));
          if (newRows.length > 0) {
            showToast(newRows[0]);
          }
          state.lastKnownIds = new Set(state.deliveries.map((d) => d.id));
        }
      )
      .subscribe();
  }

  async function init(chronicleId) {
    if (!chronicleId) return;
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

    state.deliveries = await fetchDeliveries();
    state.lastKnownIds = new Set(state.deliveries.map((d) => d.id));
    renderList();
    subscribe();
  }

  function destroy() {
    if (state.realtimeChannel) {
      const supabase = getSupabase();
      try {
        state.realtimeChannel.unsubscribe?.();
      } catch (_e) {}
      try {
        supabase?.removeChannel?.(state.realtimeChannel);
      } catch (_e) {}
      state.realtimeChannel = null;
    }
    if (state.toastTimer) {
      clearTimeout(state.toastTimer);
      state.toastTimer = null;
    }
    state.deliveries = [];
    state.lastKnownIds.clear();
    state.playerId = null;
    state.chronicleId = null;
  }

  global.ABNSheetRevelaciones = {
    init,
    destroy,
  };
})(window);
