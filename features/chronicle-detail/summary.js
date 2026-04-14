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

    let currentInviteCode = chronicle?.invite_code || "";

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

    updateNextSessionDisplay();
    updateInGameDateDisplay();
    renderLastSessionCard(latestRecap || null);
    renderCurrentCharacterCard();
    if (countPlayers) countPlayers.textContent = String(participantsCount || 0);
    if (countCharacters) countCharacters.textContent = String(charactersCount || 0);
    if (countSessions) countSessions.textContent = String(sessionsCount || 0);

    if (storageSection && isNarrator) {
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
      } else {
        const usageBytes = Number(storageData.usage_bytes || 0);
        const usageMegas = bytesToMegas(usageBytes);
        const hasLimit = storageData.limit_bytes !== null && storageData.limit_bytes !== undefined;

        if (!hasLimit) {
          if (storageMetric) storageMetric.textContent = `${usageMegas}megas usados`;
          if (storageProgressWrap) storageProgressWrap.classList.add("hidden");
          if (storageNote) storageNote.textContent = "Narrador admin: almacenamiento sin límite.";
        } else {
          const limitBytes = Number(storageData.limit_bytes || 0);
          const limitMegas = Math.max(bytesToMegas(limitBytes), 1);
          const percent = limitBytes > 0 ? Math.max(0, Math.min((usageBytes / limitBytes) * 100, 100)) : 0;

          if (storageMetric) storageMetric.textContent = `${usageMegas}/${limitMegas}megas`;
          if (storageProgressWrap) storageProgressWrap.classList.remove("hidden");
          if (storageProgressFill) storageProgressFill.style.width = `${percent}%`;
          if (storageNote) storageNote.textContent = "Límite para narrador normal.";
        }
      }
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
