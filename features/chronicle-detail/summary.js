(function initChronicleDetailSummary(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;

  function stripMarkdown(text) {
    return (text || "")
      .replace(/\*\*(.*?)\*\*/g, "$1")
      .replace(/\*(.*?)\*/g, "$1")
      .replace(/#{1,6}\s/g, "")
      .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
      .replace(/`([^`]+)`/g, "$1");
  }

  function previewLines(text, maxLines = 3) {
    const plain = stripMarkdown(text || "");
    const lines = plain.split("\n").filter((line) => line.trim());
    const preview = lines.slice(0, maxLines).join(" ");
    return lines.length > maxLines ? preview + "…" : preview;
  }

  function formatSessionMeta(recap) {
    const months = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];
    let label = `Sesión ${recap.session_number}`;
    if (recap.session_date) {
      const d = new Date(recap.session_date + "T00:00:00");
      label += ` — ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
    }
    return label;
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

    function renderLastSessionCard(recap) {
      if (!lastCard) return;
      if (!recap) {
        lastCard.classList.remove("cd-card-clickable");
        lastCard.onclick = null;
        lastCard.innerHTML = '<span class="cd-card-muted">Sin sesiones registradas</span>';
        return;
      }
      const dateStr = formatSessionMeta(recap);
      const truncated = escapeHtml(previewLines(recap.body));
      lastCard.innerHTML = `
        <span class="cd-card-subtitle">${dateStr}</span>
        <p class="cd-card-body">${truncated}</p>
      `;
      lastCard.classList.add("cd-card-clickable");
      lastCard.onclick = () => {
        window.dispatchEvent(
          new CustomEvent("abn:chronicle-open-recap", {
            detail: {
              chronicleId,
              recapId: recap.id,
            },
          }),
        );
      };
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
        .select("id, session_number, title, body, session_date")
        .eq("chronicle_id", chronicleId)
        .order("session_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      renderLastSessionCard(latest || null);
    }

    updateNextSessionDisplay();
    renderLastSessionCard(latestRecap || null);
    renderCurrentCharacterCard();
    if (countPlayers) countPlayers.textContent = String(participantsCount || 0);
    if (countCharacters) countCharacters.textContent = String(charactersCount || 0);
    if (countSessions) countSessions.textContent = String(sessionsCount || 0);

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
