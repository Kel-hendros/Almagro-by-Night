(function initChronicleDetailSummary(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

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
    } = config;

    const nextSessionText = document.getElementById("cd-next-session-text");
    const nextSessionCard = document.getElementById("cd-next-session-card");
    const nextSessionEditBtn = document.getElementById("cd-next-session-edit");
    const lastCard = document.getElementById("cd-last-session-card");
    const charCard = document.getElementById("cd-character-card");

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
        lastCard.innerHTML = '<span class="cd-card-muted">Sin sesiones registradas</span>';
        return;
      }
      const dateStr = formatSessionMeta(recap);
      const truncated = escapeHtml(previewLines(recap.body));
      lastCard.innerHTML = `
        <span class="cd-card-subtitle">${dateStr}</span>
        <p class="cd-card-body">${truncated}</p>
      `;
    }

    function renderCurrentCharacterCard() {
      if (!charCard || !myChars?.length) return;
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
      const avatarContent = myChar.avatar_url
        ? `<img src="${escapeHtml(myChar.avatar_url)}" alt="" class="cd-char-avatar-img">`
        : `<span class="cd-char-initials">${escapeHtml(initials)}</span>`;

      charCard.innerHTML = `
        <div class="cd-char-avatar">${avatarContent}</div>
        <div class="cd-char-info">
          <span class="cd-char-name">${escapeHtml(myChar.name)}</span>
          <span class="cd-char-clan">Clan: ${escapeHtml(myClan)}</span>
        </div>
      `;
      charCard.classList.add("cd-card-clickable");
      charCard.addEventListener("click", () => {
        window.location.hash = `active-character-sheet?id=${encodeURIComponent(myChar.id)}`;
      });
    }

    async function refreshLastSessionCard() {
      const { data: latest } = await supabase
        .from("session_recaps")
        .select("session_number, title, body, session_date")
        .eq("chronicle_id", chronicleId)
        .order("session_number", { ascending: false })
        .limit(1)
        .maybeSingle();
      renderLastSessionCard(latest || null);
    }

    updateNextSessionDisplay();
    renderLastSessionCard(latestRecap || null);
    renderCurrentCharacterCard();

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
