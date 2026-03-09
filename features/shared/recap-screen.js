(function initSharedRecapScreen(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const PUBLIC_SHARE_BUCKET_ID = "public-recap-shares";

  function documentScreen() {
    return root.documentScreen || null;
  }

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function monthNamesShort() {
    return ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
  }

  function formatMeta(recap) {
    if (!recap) return "";
    const months = monthNamesShort();
    let meta = `Sesión ${recap.session_number}`;
    if (recap.session_date) {
      const date = new Date(`${recap.session_date}T00:00:00`);
      meta += ` — ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
    }
    return meta;
  }

  function getShareUrl(chronicleId, recapId) {
    const hash = `chronicle?id=${encodeURIComponent(chronicleId)}&recap=${encodeURIComponent(recapId)}`;
    return `${window.location.origin}${window.location.pathname}#${hash}`;
  }

  function getPublicShareAppUrl(shareToken) {
    const hash = `public-recap?token=${encodeURIComponent(shareToken)}`;
    return `${window.location.origin}${window.location.pathname}#${hash}`;
  }

  function getPublicShareUrl(shareToken) {
    const baseUrl = String(global.ABN_SUPABASE_URL || global.supabase?.supabaseUrl || "").trim();
    if (!baseUrl) return getPublicShareAppUrl(shareToken);

    const token = encodeURIComponent(String(shareToken || "").trim());
    return new URL(
      `/storage/v1/object/public/${PUBLIC_SHARE_BUCKET_ID}/shares/${token}.html`,
      `${baseUrl}/`,
    ).toString();
  }

  async function publishPublicShare(recapId, mode = "ensure") {
    const baseUrl = String(global.ABN_SUPABASE_URL || global.supabase?.supabaseUrl || "").trim();
    if (!baseUrl || !recapId || typeof global.abnGetSession !== "function") return null;

    const {
      data: { session },
    } = await global.abnGetSession();
    if (!session?.access_token) return null;

    let response = null;
    try {
      response = await fetch(new URL("/functions/v1/publish-recap-share", `${baseUrl}/`).toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Content-Type": "application/json; charset=utf-8",
        },
        body: JSON.stringify({
          recapId,
          mode,
        }),
      });
    } catch (error) {
      console.error("RecapScreen: no se pudo invocar publish-recap-share", error);
      return null;
    }

    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      console.error("RecapScreen: publish-recap-share devolvió error", payload || response.status);
      return null;
    }

    return payload || null;
  }

  async function shareRecap(chronicleId, recapId, options = {}) {
    if (!chronicleId || !recapId) return;
    if (!options.isNarrator) return;
    const share = await publishPublicShare(recapId, "ensure");
    const shareUrl = String(share?.publicUrl || "").trim();
    if (!shareUrl) {
      global.alert("No se pudo generar el link público del recuento.");
      return;
    }
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        global.alert("Link público copiado al portapapeles.");
        return;
      }
    } catch (error) {
      console.warn("RecapScreen: clipboard write failed", error);
    }
    global.prompt("Copiá este link:", shareUrl);
  }

  async function fetchRecap(chronicleId, recapId) {
    if (!global.supabase || !chronicleId || !recapId) return null;

    const { data, error } = await global.supabase
      .from("session_recaps")
      .select("id, session_number, title, body, session_date")
      .eq("chronicle_id", chronicleId)
      .eq("id", recapId)
      .maybeSingle();

    if (error) {
      console.error("RecapScreen: no se pudo cargar recap", error);
      return null;
    }

    return data || null;
  }

  function recapFormMarkup(recap, existingRecaps) {
    const rows = Array.isArray(existingRecaps) ? existingRecaps : [];
    const maxNum = rows.length > 0
      ? Math.max(...rows.map((row) => row?.session_number || 0))
      : 0;

    const title = recap?.title || "";
    const number = recap?.session_number || maxNum + 1;
    const date = recap?.session_date || new Date().toISOString().split("T")[0];
    const body = recap?.body || "";

    return `
      <div class="doc-form-wrap">
        <div class="doc-form-group">
          <label class="doc-form-label" for="shared-recap-form-title">Título</label>
          <input type="text" id="shared-recap-form-title" class="doc-form-input" placeholder="Ej: Encuentro en el Barolo" value="${escapeHtml(title)}">
        </div>
        <div class="doc-form-row">
          <div class="doc-form-col doc-form-group">
            <label class="doc-form-label" for="shared-recap-form-number">Sesión Nº</label>
            <input type="number" id="shared-recap-form-number" class="doc-form-input" min="1" value="${escapeHtml(number)}">
          </div>
          <div class="doc-form-col doc-form-group">
            <label class="doc-form-label" for="shared-recap-form-date">Fecha</label>
            <input type="date" id="shared-recap-form-date" class="doc-form-input" value="${escapeHtml(date)}">
          </div>
        </div>
        <div class="doc-form-group doc-form-group--grow">
          <label class="doc-form-label" for="shared-recap-form-body">Crónica <span class="doc-form-hint">(soporta Markdown)</span></label>
          <textarea id="shared-recap-form-body" class="doc-form-textarea" placeholder="Relato de la sesión...">${escapeHtml(body)}</textarea>
        </div>
      </div>
    `;
  }

  function readRecapFormValues() {
    const title = document.getElementById("shared-recap-form-title")?.value.trim() || "";
    const number = parseInt(document.getElementById("shared-recap-form-number")?.value || "", 10);
    const date = document.getElementById("shared-recap-form-date")?.value || "";
    const body = document.getElementById("shared-recap-form-body")?.value.trim() || "";
    return { title, number, date, body };
  }

  function openForm(options = {}) {
    const ds = documentScreen();
    if (!ds) return null;

    const recap = options.recap || null;
    const chronicleId = options.chronicleId || null;
    const currentPlayerId = options.currentPlayerId || null;
    const existingRecaps = Array.isArray(options.existingRecaps) ? options.existingRecaps : [];
    const heading = recap?.id ? "Editar Recuento" : "Nuevo Recuento";
    let formApi = null;
    let saving = false;

    function syncSaveAction() {
      formApi?.updateAction("save", {
        label: saving ? "Guardando..." : "Guardar",
        disabled: saving,
      });
    }

    async function persistRecapForm() {
      if (saving || !chronicleId || !currentPlayerId || !global.supabase) return;

      const { title, number, date, body } = readRecapFormValues();
      if (!title) {
        global.alert("El título es obligatorio.");
        return;
      }
      if (!number || number < 1) {
        global.alert("Número de sesión inválido.");
        return;
      }

      const payload = {
        chronicle_id: chronicleId,
        session_number: number,
        title,
        body: body || null,
        session_date: date || null,
        created_by: currentPlayerId,
      };

      saving = true;
      syncSaveAction();

      let error = null;
      let savedId = recap?.id || null;

      if (recap?.id) {
        const { created_by, ...updatePayload } = payload;
        ({ error } = await global.supabase
          .from("session_recaps")
          .update(updatePayload)
          .eq("id", recap.id));
      } else {
        const response = await global.supabase
          .from("session_recaps")
          .insert(payload)
          .select("id")
          .maybeSingle();
        error = response.error || null;
        savedId = response.data?.id || null;
      }

      saving = false;
      syncSaveAction();

      if (error) {
        global.alert("Error al guardar: " + error.message);
        return;
      }

      void publishPublicShare(savedId || recap?.id || null, "refresh_if_exists");
      formApi?.close();
      if (typeof options.onSaved === "function") {
        options.onSaved({ recapId: savedId || recap?.id || null });
      }
    }

    formApi = ds.open({
      docType: "recap",
      title: heading,
      actions: [
        {
          id: "save",
          kind: "button",
          variant: "primary",
          label: "Guardar",
          onClick: () => {
            void persistRecapForm();
          },
        },
      ],
      bodyClass: "doc-form-body",
      renderBody: (bodyHost) => {
        bodyHost.innerHTML = recapFormMarkup(recap, existingRecaps);
      },
      onClosed: () => {
        if (typeof options.onClosed === "function") {
          options.onClosed(recap);
        }
      },
    });

    document.getElementById("shared-recap-form-title")?.focus();
    return formApi;
  }

  function openReadOnlyViewer(options = {}) {
    const ds = documentScreen();
    if (!ds) return null;

    const recap = options.recap || null;
    if (!recap) return null;

    const actions = Array.isArray(options.actions) ? options.actions : [];
    const footerActions = Array.isArray(options.footerActions) ? options.footerActions : [];

    const api = ds.open({
      docType: "recap",
      title: recap.title || "",
      subtitle: options.subtitle || formatMeta(recap),
      actions,
      footerActions,
      bodyClass: "doc-view-body",
      renderBody: (bodyHost) => {
        const card = document.createElement("div");
        card.className = "doc-view-card";
        card.innerHTML = `<div class="doc-markdown">${global.renderMarkdown
          ? global.renderMarkdown(recap.body || "")
          : escapeHtml(recap.body || "")}</div>`;
        bodyHost.innerHTML = "";
        bodyHost.appendChild(card);
      },
      onClosed: () => {
        if (typeof options.onClosed === "function") {
          options.onClosed(recap);
        }
      },
    });

    if (global.lucide?.createIcons) {
      global.lucide.createIcons();
    }

    return api;
  }

  async function showForChronicle(options = {}) {
    const ds = documentScreen();
    if (!ds) return null;

    const chronicleId = options.chronicleId || null;
    const currentPlayerId = options.currentPlayerId || null;
    const isNarrator = Boolean(options.isNarrator);
    const sequence = Array.isArray(options.sequence) ? options.sequence : [];
    const recapId = options.recapId || options.recap?.id || null;

    if (!chronicleId || !recapId) return null;

    const recap = options.recap || (await fetchRecap(chronicleId, recapId));
    if (!recap) return null;

    const actions = [];

    if (isNarrator) {
      actions.push({
        id: "share",
        kind: "icon",
        icon: "share-2",
        title: "Compartir",
        ariaLabel: "Compartir",
        onClick: () => {
          void shareRecap(chronicleId, recap.id, { isNarrator });
        },
      });
      actions.push(
        {
          id: "edit",
          kind: "icon",
          icon: "pencil",
          title: "Editar",
          ariaLabel: "Editar",
          onClick: () => {
            openForm({
              chronicleId,
              currentPlayerId,
              recap,
              existingRecaps: sequence,
              onSaved: async ({ recapId: savedId }) => {
                if (typeof options.onSaved === "function") {
                  await options.onSaved({ recapId: savedId || recap.id });
                }
                await showForChronicle({
                  ...options,
                  recapId: savedId || recap.id,
                  recap: null,
                });
              },
              onClosed: () => {
                void showForChronicle(options);
              },
            });
          },
        },
        {
          id: "delete",
          kind: "icon",
          icon: "trash-2",
          title: "Eliminar",
          ariaLabel: "Eliminar",
          danger: true,
          onClick: async () => {
            const ok = await (root.modal?.confirm?.(
              "¿Eliminar este recuento de sesión? Esta acción no se puede deshacer.",
            ) || Promise.resolve(false));
            if (!ok) return;

            const { error } = await global.supabase
              .from("session_recaps")
              .delete()
              .eq("id", recap.id);
            if (error) {
              global.alert("Error al eliminar: " + error.message);
              return;
            }

            ds.close();
            if (typeof options.onSaved === "function") {
              await options.onSaved({ recapId: recap.id, deleted: true });
            }
          },
        },
      );
    }

    const idx = sequence.findIndex((row) => String(row?.id) === String(recap.id));
    const canGoPrev = idx < sequence.length - 1 && idx !== -1;
    const canGoNext = idx > 0;
    const footerActions = idx === -1 ? [] : [
      {
        id: "prev",
        kind: "button",
        variant: canGoPrev ? "primary" : "ghost",
        label: "Anterior",
        disabled: !canGoPrev,
        onClick: () => {
          if (canGoPrev) {
            const target = sequence[idx + 1];
            if (typeof options.onNavigate === "function") {
              options.onNavigate(target?.id, { direction: "prev", currentId: recap.id });
            } else {
              void showForChronicle({ ...options, recapId: target?.id, recap: target || null });
            }
          }
        },
      },
      {
        id: "next",
        kind: "button",
        variant: canGoNext ? "primary" : "ghost",
        label: "Siguiente",
        disabled: !canGoNext,
        onClick: () => {
          if (canGoNext) {
            const target = sequence[idx - 1];
            if (typeof options.onNavigate === "function") {
              options.onNavigate(target?.id, { direction: "next", currentId: recap.id });
            } else {
              void showForChronicle({ ...options, recapId: target?.id, recap: target || null });
            }
          }
        },
      },
    ];

    openReadOnlyViewer({
      recap,
      subtitle: formatMeta(recap),
      actions,
      footerActions,
      onClosed: options.onClosed,
    });

    return recap;
  }

  async function showPublicShare(options = {}) {
    const share = options.share || null;
    if (!share) return null;

    const recap = {
      id: share.recap_id,
      title: share.title || "Recuento",
      body: share.body || "",
      session_number: share.session_number,
      session_date: share.session_date,
    };

    return openReadOnlyViewer({
      recap,
      subtitle: formatMeta(recap),
      onClosed: options.onClosed,
    });
  }

  root.recapScreen = {
    fetchRecap,
    formatMeta,
    getPublicShareUrl,
    getShareUrl,
    openForm,
    shareRecap,
    showPublicShare,
    showForChronicle,
  };
})(window);
