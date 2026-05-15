(function initChronicleDetailSummary(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;
  const SUMMARY_RECAP_LIMIT = 1;

  function documentList() {
    return global.ABNShared?.documentList || null;
  }

  function recapAdapter() {
    return global.ABNShared?.documentTypes?.get?.("recap") || null;
  }

  function previewLines(text, maxLines = 5) {
    const sharedPreview = documentList()?.buildPreviewText?.(text, { maxLines });
    if (typeof sharedPreview === "string") return sharedPreview;
    return String(text || "").trim();
  }

  function bytesToMegas(bytes) {
    const numeric = Number(bytes || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return 0;
    return Math.floor(numeric / (1024 * 1024));
  }

  function formatBytes(bytes) {
    const numeric = Number(bytes || 0);
    if (!Number.isFinite(numeric) || numeric <= 0) return "0 KB";
    if (numeric >= 1024 * 1024) {
      return `${(numeric / (1024 * 1024)).toFixed(numeric >= 10 * 1024 * 1024 ? 0 : 1)} MB`;
    }
    return `${Math.max(1, Math.round(numeric / 1024))} KB`;
  }

  function escapeHtml(value) {
    const div = document.createElement("div");
    div.textContent = String(value || "");
    return div.innerHTML;
  }

  function storageItemTypeLabel(type, metadata = {}) {
    if (type === "encounter") return "Encuentro";
    if (type === "asset") return metadata.category === "prop" ? "Prop" : "Asset";
    if (type === "banner") return "Banner";
    if (type === "revelation") return "Revelación";
    if (type === "muestra") return "Muestra";
    return "Elemento";
  }

  function storageDeleteLabel(type) {
    if (type === "encounter") return "Eliminar encuentro";
    if (type === "asset") return "Eliminar asset";
    if (type === "banner") return "Quitar banner";
    if (type === "revelation") return "Eliminar revelación";
    if (type === "muestra") return "Eliminar muestra";
    return "Eliminar";
  }

  function storageDeleteMessage(item) {
    const label = item?.label || "este elemento";
    if (item?.item_type === "encounter") {
      return `¿Eliminar el encuentro "${label}"? Esta acción no se puede deshacer. Se borrarán sus archivos asociados.`;
    }
    if (item?.item_type === "banner") {
      return "¿Quitar el banner de la crónica? Esta acción no se puede deshacer.";
    }
    if (item?.item_type === "revelation") {
      return `¿Eliminar la revelación "${label}"? Esta acción no se puede deshacer.`;
    }
    if (item?.item_type === "muestra") {
      return `¿Eliminar la muestra "${label}"? La imagen se borrará y la notificación quedará marcada como "No encontrada".`;
    }
    return `¿Eliminar "${label}"? Esta acción no se puede deshacer.`;
  }

  function ensureStorageModalDOM() {
    let overlay = document.getElementById("cd-storage-manager-modal");
    if (overlay) return overlay;

    overlay = document.createElement("div");
    overlay.id = "cd-storage-manager-modal";
    overlay.className = "app-modal-overlay cd-storage-manager-overlay";
    overlay.innerHTML = `
      <div class="app-modal cd-storage-manager-modal" role="dialog" aria-modal="true" aria-labelledby="cd-storage-manager-title">
        <div class="app-modal-header">
          <div>
            <h3 id="cd-storage-manager-title" class="app-modal-title">Almacenamiento</h3>
            <p class="cd-storage-manager-subtitle">Elementos subidos por narración</p>
          </div>
          <button id="cd-storage-manager-close" class="btn-modal-close" type="button" aria-label="Cerrar">
            <i data-lucide="x"></i>
          </button>
        </div>
        <div id="cd-storage-manager-body" class="cd-storage-manager-body">
          <div id="cd-storage-manager-loading" class="cd-storage-manager-state">Cargando...</div>
          <div id="cd-storage-manager-empty" class="cd-storage-manager-state hidden">No hay elementos de narración ocupando almacenamiento.</div>
          <div id="cd-storage-manager-table-wrap" class="cd-storage-manager-table-wrap hidden">
            <table class="cd-storage-manager-table">
              <thead>
                <tr>
                  <th>Fecha</th>
                  <th>Tipo</th>
                  <th>Elemento</th>
                  <th>Peso</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="cd-storage-manager-list"></tbody>
            </table>
          </div>
        </div>
        <div class="app-modal-actions">
          <button id="cd-storage-manager-refresh" type="button" class="btn btn--ghost">Actualizar</button>
          <button id="cd-storage-manager-done" type="button" class="btn btn--primary">Cerrar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    return overlay;
  }

  async function init(config) {
    const {
      chronicleId,
      chronicle,
      isNarrator,
      latestRecap,
      myChars,
      participantsCount,
      charactersCount,
      sessionsCount,
      onRequestAddCharacter,
    } = config;

    const nextSessionText = document.getElementById("cd-next-session-text");
    const nextSessionCard = document.getElementById("cd-next-session-card");
    const nextSessionEditBtn = document.getElementById("cd-next-session-edit");
    const inGameDateText = document.getElementById("cd-in-game-date-text");
    const inGameDateCard = document.getElementById("cd-in-game-date-card");
    const inGameDateEditBtn = document.getElementById("cd-in-game-date-edit");
    const lastCard = document.getElementById("cd-last-session-card");
    const charCard = document.getElementById("cd-character-card");
    const countPlayers = document.getElementById("cd-count-players");
    const countCharacters = document.getElementById("cd-count-characters");
    const countSessions = document.getElementById("cd-count-sessions");
    const inviteSection = document.getElementById("cd-invite-summary-section");
    const inviteCopyBtn = document.getElementById("cd-summary-invite-copy");
    const inviteCodeValue = document.getElementById("cd-summary-invite-code-value");
    const inviteRegenBtn = document.getElementById("cd-summary-invite-regenerate");
    const inviteModal = document.getElementById("cd-invite-regenerate-modal");
    const inviteModalClose = document.getElementById("cd-invite-modal-close");
    const inviteModalCancel = document.getElementById("cd-invite-modal-cancel");
    const inviteModalConfirm = document.getElementById("cd-invite-modal-confirm");
    const storageSection = document.getElementById("cd-storage-summary-section");
    const storageMetric = document.getElementById("cd-storage-metric");
    const storageProgressWrap = document.getElementById("cd-storage-progress-wrap");
    const storageProgressFill = document.getElementById("cd-storage-progress-fill");
    const storageNote = document.getElementById("cd-storage-note");
    const storageCard = storageSection?.querySelector(".cd-storage-card");

    let currentInviteCode = chronicle?.invite_code || "";
    let storageModalController = null;
    let storageModalRefs = null;

    function formatNextSession(dateStr) {
      if (!dateStr) return null;
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return null;
      const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      const monthNames = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
      const dayName = dayNames[d.getDay()];
      const num = d.getDate();
      const month = monthNames[d.getMonth()];
      const hours = d.getHours().toString().padStart(2, "0");
      const mins = d.getMinutes().toString().padStart(2, "0");
      return `${dayName} ${num} ${month}, ${hours}:${mins}hs`;
    }

    function updateNextSessionDisplay() {
      if (!nextSessionText) return;
      const fmt = formatNextSession(chronicle.next_session);
      nextSessionText.textContent = fmt || "Sin fecha programada";
      nextSessionText.classList.toggle("cd-card-muted", !fmt);
    }

    function formatInGameDate(dateStr) {
      if (!dateStr) return null;
      var d = new Date(dateStr + "T00:00:00");
      if (isNaN(d.getTime())) return null;
      var dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
      var monthNames = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
        "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
      return dayNames[d.getDay()] + " " + d.getDate() + " de " + monthNames[d.getMonth()] + ", " + d.getFullYear();
    }

    function updateInGameDateDisplay() {
      if (!inGameDateText) return;
      var fmt = formatInGameDate(chronicle.in_game_date);
      inGameDateText.textContent = fmt || "Sin fecha";
      inGameDateText.classList.toggle("cd-card-muted", !fmt);
    }

    function renderLastSessionCard(recap) {
      if (!lastCard) return;
      if (!recap) {
        lastCard.className = "cd-card cd-card--col";
        lastCard.onclick = null;
        lastCard.innerHTML = '<span class="cd-card-muted">Sin sesiones registradas</span>';
        return;
      }
      const listApi = documentList();
      const visibleRecap = listApi?.getRecentRows?.([recap], {
        limit: SUMMARY_RECAP_LIMIT,
        getCreatedAt: (row) => row?.created_at,
      })?.[0] || recap;

      const openRecap = () => {
        window.dispatchEvent(
          new CustomEvent("abn:chronicle-open-recap", {
            detail: {
              chronicleId,
              recapId: visibleRecap.id,
            },
          }),
        );
      };

      if (!listApi?.createItem) {
        const preview = listApi?.buildPreviewText?.(visibleRecap.body, { maxLines: 5 }) || "";
        lastCard.className = "cd-card cd-card--col cd-card-clickable";
        lastCard.innerHTML = `
          <span class="cd-card-subtitle">${escapeHtml(visibleRecap.title || "Recuento")}</span>
          <p class="cd-card-body">${escapeHtml(preview)}</p>
        `;
        lastCard.onclick = openRecap;
        return;
      }

      const itemOptions = recapAdapter()?.buildDetailedListItemOptions?.(visibleRecap, {
        chronicleId,
      }) || {
        title: visibleRecap.title || "Recuento",
        meta: "",
        preview: listApi.buildPreviewText?.(visibleRecap.body, { maxLines: 5 }) || "",
      };

      lastCard.className = "dl-list dl-list--complete";
      lastCard.onclick = null;
      lastCard.innerHTML = "";
      lastCard.appendChild(
        listApi.createItem({
          preset: "complete",
          variant: "detailed",
          title: itemOptions.title,
          meta: itemOptions.meta,
          preview: itemOptions.preview,
          previewMarkdown: itemOptions.previewMarkdown,
          previewHtml: itemOptions.previewHtml,
          tagsHtml: itemOptions.tagsHtml,
          image: itemOptions.image,
          dataAttrs: { "recap-id": visibleRecap.id },
          onActivate: openRecap,
        }),
      );
    }

    function renderCurrentCharacterCard() {
      if (!charCard) return;
      if (!myChars?.length) {
        charCard.innerHTML = `
          <span class="cd-card-icon"><i data-lucide="user-plus"></i></span>
          <span class="cd-card-text">Agregar personaje a la Crónica</span>
        `;
        charCard.classList.add("cd-card-clickable");
        charCard.onclick = () => {
          if (typeof onRequestAddCharacter === "function") onRequestAddCharacter();
        };
        return;
      }
      const myChar = myChars[0];
      const myClan = myChar.data?.clan || "Desconocido";
      const initials = myChar.name
        ? myChar.name
            .split(" ")
            .map((w) => w[0])
            .join("")
            .substring(0, 2)
            .toUpperCase()
        : "??";
      const avatarUrl = myChar.data?.avatarThumbUrl || myChar.avatar_url;
      const avatarContent = avatarUrl
        ? `<img src="${escapeHtml(avatarUrl)}" alt="" class="cd-char-avatar-img">`
        : `<span class="cd-char-initials">${escapeHtml(initials)}</span>`;

      charCard.innerHTML = `
        <div class="cd-char-avatar">${avatarContent}</div>
        <div class="cd-char-info">
          <span class="cd-char-name">${escapeHtml(myChar.name)}</span>
          <span class="cd-char-clan">Clan: ${escapeHtml(myClan)}</span>
        </div>
      `;
      charCard.classList.add("cd-card-clickable");
      charCard.onclick = () => {
        window.location.hash = `active-character-sheet?id=${encodeURIComponent(myChar.id)}`;
      };
    }

    async function refreshLastSessionCard() {
      const { data: latest } = await supabase
        .from("session_recaps")
        .select("id, session_number, title, body, session_date, created_at")
        .eq("chronicle_id", chronicleId)
        .order("created_at", { ascending: false })
        .limit(SUMMARY_RECAP_LIMIT)
        .maybeSingle();
      renderLastSessionCard(latest || null);
    }

    async function refreshStorageSummary() {
      if (!storageSection || !isNarrator) return;
      storageSection.classList.remove("hidden");
      if (storageMetric) storageMetric.textContent = "Cargando...";
      if (storageProgressWrap) storageProgressWrap.classList.add("hidden");
      if (storageNote) storageNote.textContent = "";

      const { data: storageData, error: storageError } = await service().getChronicleStorageQuota(
        chronicleId,
      );

      if (storageError || !storageData || storageData.error) {
        if (storageMetric) storageMetric.textContent = "No disponible";
        if (storageNote) {
          storageNote.textContent =
            storageError?.message || "No se pudo obtener el uso de almacenamiento.";
        }
        return;
      }

      const usageBytes = Number(storageData.usage_bytes || 0);
      const usageMegas = bytesToMegas(usageBytes);
      const hasLimit = storageData.limit_bytes !== null && storageData.limit_bytes !== undefined;

      if (!hasLimit) {
        if (storageMetric) storageMetric.textContent = `${usageMegas}megas usados`;
        if (storageProgressWrap) storageProgressWrap.classList.add("hidden");
        if (storageNote) storageNote.textContent = "Narrador admin: almacenamiento sin límite.";
        return;
      }

      const limitBytes = Number(storageData.limit_bytes || 0);
      const limitMegas = Math.max(bytesToMegas(limitBytes), 1);
      const percent = limitBytes > 0 ? Math.max(0, Math.min((usageBytes / limitBytes) * 100, 100)) : 0;

      if (storageMetric) storageMetric.textContent = `${usageMegas}/${limitMegas}megas`;
      if (storageProgressWrap) storageProgressWrap.classList.remove("hidden");
      if (storageProgressFill) storageProgressFill.style.width = `${percent}%`;
      if (storageNote) storageNote.textContent = "Límite para narrador normal.";
    }

    function getStorageModalRefs() {
      if (storageModalRefs) return storageModalRefs;
      const overlay = ensureStorageModalDOM();
      storageModalRefs = {
        overlay,
        close: overlay.querySelector("#cd-storage-manager-close"),
        done: overlay.querySelector("#cd-storage-manager-done"),
        refresh: overlay.querySelector("#cd-storage-manager-refresh"),
        loading: overlay.querySelector("#cd-storage-manager-loading"),
        empty: overlay.querySelector("#cd-storage-manager-empty"),
        tableWrap: overlay.querySelector("#cd-storage-manager-table-wrap"),
        list: overlay.querySelector("#cd-storage-manager-list"),
      };
      return storageModalRefs;
    }

    function setStorageModalState(stateName) {
      const refs = getStorageModalRefs();
      refs.loading?.classList.toggle("hidden", stateName !== "loading");
      refs.empty?.classList.toggle("hidden", stateName !== "empty");
      refs.tableWrap?.classList.toggle("hidden", stateName !== "list");
    }

    function renderStorageItems(items) {
      const refs = getStorageModalRefs();
      const rows = (items || []).filter((item) => item?.item_type !== "error");
      if (!rows.length) {
        if (refs.list) refs.list.innerHTML = "";
        setStorageModalState("empty");
        return;
      }

      setStorageModalState("list");
      refs.list.innerHTML = rows
        .map((item) => {
          const metadata = item.metadata || {};
          const date = item.uploaded_at
            ? new Date(item.uploaded_at).toLocaleDateString("es-AR")
            : "Sin fecha";
          const typeLabel = storageItemTypeLabel(item.item_type, metadata);
          const action = item.can_delete
            ? `<button type="button" class="btn-icon btn-icon--danger cd-storage-item-delete" data-item-id="${escapeHtml(item.item_id)}" data-item-type="${escapeHtml(item.item_type)}" title="${escapeHtml(storageDeleteLabel(item.item_type))}" aria-label="${escapeHtml(storageDeleteLabel(item.item_type))}"><i data-lucide="trash-2"></i></button>`
            : `<span class="cd-storage-item-blocked">${escapeHtml(item.block_reason || "No disponible")}</span>`;
          return `
            <tr>
              <td>${escapeHtml(date)}</td>
              <td><span class="cd-storage-item-type">${escapeHtml(typeLabel)}</span></td>
              <td>
                <span class="cd-storage-item-label">${escapeHtml(item.label)}</span>
              </td>
              <td>${escapeHtml(formatBytes(item.size_bytes))}</td>
              <td>${action}</td>
            </tr>`;
        })
        .join("");
      if (global.lucide?.createIcons) global.lucide.createIcons({ nodes: [refs.list] });
    }

    async function loadStorageItems() {
      const refs = getStorageModalRefs();
      setStorageModalState("loading");
      if (refs.refresh) refs.refresh.disabled = true;
      const { data, error } = await service().listChronicleStorageItems(chronicleId);
      if (refs.refresh) refs.refresh.disabled = false;
      if (error || data?.[0]?.item_type === "error") {
        const message =
          error?.message ||
          {
            not_authorized: "No tienes permisos para ver este almacenamiento.",
            chronicle_id_required: "No se pudo resolver la crónica.",
          }[data?.[0]?.block_reason] ||
          "No se pudo cargar el almacenamiento.";
        setStorageModalState("empty");
        await global.ABNShared?.modal?.alert?.(message, { title: "Almacenamiento" });
        return;
      }
      renderStorageItems(data || []);
    }

    async function openStorageModal() {
      const refs = getStorageModalRefs();
      if (!storageModalController) {
        storageModalController = global.ABNShared?.modal?.createController?.({
          overlay: refs.overlay,
          closeButtons: [refs.close, refs.done],
        });
        refs.refresh?.addEventListener("click", () => {
          void loadStorageItems();
        });
        refs.list?.addEventListener("click", async (event) => {
          const button = event.target?.closest?.(".cd-storage-item-delete");
          if (!button) return;
          const itemType = button.dataset.itemType;
          const itemId = button.dataset.itemId;
          const { data: items } = await service().listChronicleStorageItems(chronicleId);
          const item = (items || []).find(
            (entry) => entry.item_type === itemType && entry.item_id === itemId,
          );
          if (!item?.can_delete) return;
          const ok = await global.ABNShared.modal.confirm(storageDeleteMessage(item), {
            confirmLabel: storageDeleteLabel(itemType),
            danger: true,
          });
          if (!ok) return;

          button.disabled = true;
          const { data, error } = await service().deleteChronicleStorageItem({
            chronicleId,
            itemType,
            itemId,
          });
          if (error || data?.error || data?.deleted === false) {
            const message =
              error?.message ||
              {
                asset_in_use: "El asset está en uso en uno o más encuentros.",
                not_archived: "El encuentro debe estar archivado antes de eliminarse.",
                not_authorized: "No tienes permisos para eliminar este elemento.",
                not_narration_upload: "Solo se pueden borrar elementos subidos por narración.",
                not_found: "El elemento ya no existe.",
              }[data?.error] ||
              "No se pudo borrar el elemento.";
            button.disabled = false;
            await global.ABNShared.modal.alert(message, { title: "No se pudo borrar" });
            return;
          }

          await refreshStorageSummary();
          await loadStorageItems();
        });
      }
      storageModalController?.open?.();
      await loadStorageItems();
    }

    updateNextSessionDisplay();
    updateInGameDateDisplay();
    renderLastSessionCard(latestRecap || null);
    renderCurrentCharacterCard();
    if (countPlayers) countPlayers.textContent = String(participantsCount || 0);
    if (countCharacters) countCharacters.textContent = String(charactersCount || 0);
    if (countSessions) countSessions.textContent = String(sessionsCount || 0);

    if (storageSection && isNarrator) {
      if (storageCard) {
        storageCard.classList.add("cd-storage-card--clickable");
        storageCard.setAttribute("role", "button");
        storageCard.setAttribute("tabindex", "0");
        storageCard.setAttribute("aria-label", "Abrir almacenamiento de la crónica");
        storageCard.addEventListener("click", () => {
          void openStorageModal();
        });
        storageCard.addEventListener("keydown", (event) => {
          if (event.key !== "Enter" && event.key !== " ") return;
          event.preventDefault();
          void openStorageModal();
        });
      }
      await refreshStorageSummary();
    }

    if (inviteSection && inviteCopyBtn && inviteCodeValue && isNarrator && currentInviteCode) {
      inviteSection.classList.remove("hidden");
      inviteCodeValue.textContent = currentInviteCode;
      inviteCopyBtn.addEventListener("click", async () => {
        try {
          await navigator.clipboard.writeText(currentInviteCode);
          const original = inviteCodeValue.textContent;
          inviteCodeValue.textContent = "¡Copiado!";
          setTimeout(() => {
            inviteCodeValue.textContent = original;
          }, 1200);
        } catch (err) {
          alert("No se pudo copiar: " + (err?.message || err));
        }
      });

      const closeInviteModal = () => {
        inviteModal?.classList.remove("visible");
      };
      const openInviteModal = () => {
        inviteModal?.classList.add("visible");
      };

      inviteRegenBtn?.addEventListener("click", (event) => {
        event.stopPropagation();
        openInviteModal();
      });
      inviteModal?.addEventListener("click", (event) => {
        if (event.target === inviteModal) closeInviteModal();
      });
      inviteModalClose?.addEventListener("click", closeInviteModal);
      inviteModalCancel?.addEventListener("click", closeInviteModal);
      inviteModalConfirm?.addEventListener("click", async () => {
        if (!inviteModalConfirm) return;
        inviteModalConfirm.disabled = true;
        const originalText = inviteModalConfirm.textContent;
        inviteModalConfirm.textContent = "Generando...";
        try {
          const { inviteCode, error } = await service().regenerateInviteCode(chronicleId);
          if (error || !inviteCode) {
            alert("No se pudo generar un nuevo código.");
            return;
          }
          currentInviteCode = inviteCode;
          chronicle.invite_code = inviteCode;
          inviteCodeValue.textContent = inviteCode;
          closeInviteModal();
        } finally {
          inviteModalConfirm.disabled = false;
          inviteModalConfirm.textContent = originalText;
        }
      });
    }

    if (isNarrator && nextSessionEditBtn && nextSessionCard) {
      nextSessionEditBtn.classList.remove("hidden");
      const dateInput = document.createElement("input");
      dateInput.type = "datetime-local";
      dateInput.style.cssText = "position:absolute;opacity:0;pointer-events:none;";
      nextSessionCard.appendChild(dateInput);

      nextSessionEditBtn.addEventListener("click", () => {
        if (chronicle.next_session) {
          const d = new Date(chronicle.next_session);
          if (!isNaN(d.getTime())) {
            const pad = (n) => n.toString().padStart(2, "0");
            dateInput.value = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(
              d.getHours()
            )}:${pad(d.getMinutes())}`;
          }
        }
        dateInput.showPicker?.();
      });

      dateInput.addEventListener("change", async () => {
        const val = dateInput.value;
        const newDate = val ? new Date(val).toISOString() : null;
        const { error } = await supabase
          .from("chronicles")
          .update({ next_session: newDate })
          .eq("id", chronicleId);
        if (error) {
          console.error("Error saving next_session:", error);
        }
        if (!error) {
          service()?.invalidateChronicleCaches?.(chronicleId);
        }
        chronicle.next_session = newDate;
        updateNextSessionDisplay();
      });
    }

    if (isNarrator && inGameDateEditBtn && inGameDateCard) {
      inGameDateEditBtn.classList.remove("hidden");
      var igDateInput = document.createElement("input");
      igDateInput.type = "date";
      igDateInput.style.cssText = "position:absolute;opacity:0;pointer-events:none;";
      inGameDateCard.appendChild(igDateInput);

      inGameDateEditBtn.addEventListener("click", function () {
        if (chronicle.in_game_date) {
          igDateInput.value = chronicle.in_game_date;
        }
        igDateInput.showPicker?.();
      });

      igDateInput.addEventListener("change", async function () {
        var val = igDateInput.value || null;
        var { error } = await supabase
          .from("chronicles")
          .update({ in_game_date: val })
          .eq("id", chronicleId);
        if (error) {
          console.error("Error saving in_game_date:", error);
        }
        if (!error) {
          service()?.invalidateChronicleCaches?.(chronicleId);
        }
        chronicle.in_game_date = val;
        updateInGameDateDisplay();
      });
    }

    return {
      refreshLastSessionCard,
      previewLines,
    };
  }

  ns.summary = {
    init,
    previewLines,
  };
})(window);
