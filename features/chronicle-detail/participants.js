(function initChronicleDetailParticipants(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  async function init(config) {
    const {
      chronicleId,
      currentPlayerId,
      currentUserId,
      existingSheetIds,
      charPickerModal,
      onReload,
    } = config;

    const reload = typeof onReload === "function" ? onReload : () => {};

    async function removeCharFromChronicle(sheetId) {
      if (!confirm("¿Quitar este personaje de la crónica?")) return;
      const { error } = await supabase
        .from("chronicle_characters")
        .delete()
        .eq("chronicle_id", chronicleId)
        .eq("character_sheet_id", sheetId);
      if (error) {
        alert("Error: " + error.message);
        return;
      }
      reload();
    }

    async function removePlayerFromChronicle(playerId) {
      const isSelf = playerId === currentPlayerId;
      const msg = isSelf
        ? "¿Abandonar esta crónica? Se quitarán todos tus personajes."
        : "¿Quitar este jugador y todos sus personajes de la crónica?";
      if (!confirm(msg)) return;

      const { data: pData } = await supabase
        .from("players")
        .select("user_id")
        .eq("id", playerId)
        .maybeSingle();

      if (pData) {
        const { data: theirSheets } = await supabase
          .from("character_sheets")
          .select("id")
          .eq("user_id", pData.user_id);

        const sheetIds = (theirSheets || []).map((sheet) => sheet.id);
        if (sheetIds.length) {
          await supabase
            .from("chronicle_characters")
            .delete()
            .eq("chronicle_id", chronicleId)
            .in("character_sheet_id", sheetIds);
        }
      }

      const { error } = await supabase
        .from("chronicle_participants")
        .delete()
        .eq("chronicle_id", chronicleId)
        .eq("player_id", playerId);

      if (error) {
        alert("Error: " + error.message);
        return;
      }

      if (isSelf) {
        localStorage.removeItem("currentChronicleId");
        window.location.hash = "chronicles";
        return;
      }

      reload();
    }

    async function openCharPicker() {
      const pickerList = document.getElementById("char-picker-list");
      if (!pickerList) return;

      pickerList.innerHTML = '<span class="cd-card-muted">Cargando...</span>';
      charPickerModal.open();

      const { data: mySheets, error } = await supabase
        .from("character_sheets")
        .select("id, name, data, avatar_url")
        .eq("user_id", currentUserId);

      if (error) {
        pickerList.innerHTML =
          '<span class="cd-card-muted">Error al cargar personajes.</span>';
        return;
      }

      const available = (mySheets || []).filter(
        (sheet) => !existingSheetIds.includes(sheet.id)
      );

      if (!available.length) {
        pickerList.innerHTML =
          '<span class="cd-card-muted">No tenés personajes disponibles para agregar.</span>';
        return;
      }

      pickerList.innerHTML = "";
      available.forEach((sheet) => {
        const clan = sheet.data?.clan || "Desconocido";
        const initials = (sheet.name || "?").charAt(0).toUpperCase();
        const avatarUrl = sheet.data?.avatarThumbUrl || sheet.avatar_url;
        const avatarInner = avatarUrl
          ? `<img src="${escapeHtml(avatarUrl)}" alt="">`
          : `<span class="cd-player-char-initials">${escapeHtml(initials)}</span>`;

        const item = document.createElement("div");
        item.className = "cd-modal-item";
        item.innerHTML = `
          <div class="cd-player-char-avatar">${avatarInner}</div>
          <span class="cd-player-char-name">${escapeHtml(sheet.name)}</span>
          <span class="cd-player-char-sep">|</span>
          <span class="cd-player-char-clan">${escapeHtml(clan)}</span>
        `;

        item.addEventListener("click", async () => {
          const { error: addErr } = await supabase
            .from("chronicle_characters")
            .insert({
              chronicle_id: chronicleId,
              character_sheet_id: sheet.id,
            });
          if (addErr) {
            alert("Error: " + addErr.message);
            return;
          }
          closeCharPicker();
          reload();
        });

        pickerList.appendChild(item);
      });

      if (window.lucide) {
        lucide.createIcons();
      }
    }

    function closeCharPicker() {
      charPickerModal.close();
    }

    global.openCharPicker = openCharPicker;
    global.closeCharPicker = closeCharPicker;
    global.removePlayerFromChronicle = removePlayerFromChronicle;
    global.removeCharFromChronicle = removeCharFromChronicle;

    return {
      openCharPicker,
      closeCharPicker,
      removePlayerFromChronicle,
      removeCharFromChronicle,
    };
  }

  ns.participants = {
    init,
  };
})(window);
