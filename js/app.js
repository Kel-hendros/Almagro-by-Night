// js/app.js

const SINGLE_GAME_SELECT = `
  id,
  name,
  created_at,
  start_date,
  creator_id,
  territory_id,
  territory:territories(name, maptiler_dataset_url),
  players:players!games_creator_id_fkey(name)
`;

async function querySingleGame() {
  const { data, error } = await supabase
    .from("games")
    .select(SINGLE_GAME_SELECT)
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) {
    console.error("Error loading single game:", error);
    return null;
  }
  const record = data?.[0] || null;
  if (!record) return null;
  try {
    const { data: nightsData } = await supabase
      .from("nights")
      .select("night_date")
      .eq("game_id", record.id);
    record.nights = nightsData || [];
  } catch (err) {
    record.nights = [];
  }
  return record;
}

window.SingleGameStore = {
  _record: null,
  async fetch() {
    if (this._record) return this._record;
    const record = await querySingleGame();
    if (record) this._record = record;
    return record;
  },
  invalidate() {
    this._record = null;
  },
  async getId() {
    const game = await this.fetch();
    return game?.id || null;
  },
};

async function fetchCurrentPlayerId(userId) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (error && error.code !== "PGRST116") {
    console.error("Error fetching player record:", error);
    return null;
  }
  return data?.id || null;
}

async function fetchParticipation(gameId, playerId) {
  if (!gameId || !playerId) return null;
  const { data, error } = await supabase
    .from("game_participants")
    .select("player_id, is_admin")
    .eq("game_id", gameId)
    .eq("player_id", playerId)
    .maybeSingle();
  if (error) {
    console.error("Error checking participation:", error);
    return null;
  }
  return data;
}

function formatGameMeta(game) {
  const nights = [...(game.nights || [])].sort(
    (a, b) => new Date(b.night_date) - new Date(a.night_date)
  );
  const latest = nights[0];
  if (latest) {
    return `Última noche: ${new Date(
      latest.night_date
    ).toLocaleDateString()}`;
  }
  return `Disponible desde ${new Date(game.start_date).toLocaleDateString()}`;
}

function updateStatus(message) {
  const statusEl = document.getElementById("single-game-status");
  if (statusEl) statusEl.textContent = message;
}

function configureCopyButton(gameId, visible) {
  const copyBtn = document.getElementById("copy-game-id-btn");
  if (!copyBtn) return;
  copyBtn.classList.toggle("hidden", !visible);
  if (!visible) {
    copyBtn.onclick = null;
    return;
  }
  if (copyBtn._init) return;
  copyBtn.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(gameId);
      alert("ID copiado al portapapeles.");
    } catch (err) {
      alert(`No se pudo copiar el ID.\n${err?.message || err}`);
    }
  });
  copyBtn._init = true;
}

function configureEnterButton(enabled, onClick, label) {
  const enterBtn = document.getElementById("enter-game-btn");
  if (!enterBtn) return;
  enterBtn.disabled = !enabled;
  enterBtn.textContent = label;
  enterBtn.onclick = onClick;
}

function formatDateLabel(value, includeTime = false) {
  if (!value) return "—";
  try {
    const date = new Date(value);
    return includeTime ? date.toLocaleString() : date.toLocaleDateString();
  } catch (err) {
    return "—";
  }
}

function createPlayerCard(player, { badge = null, actions = [] } = {}) {
  const card = document.createElement("div");
  card.className = "player-card";

  const header = document.createElement("div");
  header.className = "player-card-header";
  const title = document.createElement("h4");
  title.textContent = player.name || "Sin nombre";
  header.appendChild(title);
  if (badge) {
    const badgeEl = document.createElement("span");
    badgeEl.className = "player-badge";
    badgeEl.textContent = badge;
    header.appendChild(badgeEl);
  }
  card.appendChild(header);

  const meta = document.createElement("div");
  meta.className = "player-meta";
  const emailSpan = document.createElement("span");
  emailSpan.textContent = player.email || "Sin email";
  const characterSpan = document.createElement("span");
  const characterName = player.character_name || "—";
  characterSpan.textContent = `Personaje: ${characterName}`;
  const createdSpan = document.createElement("span");
  createdSpan.textContent = `Registración: ${formatDateLabel(
    player.joined_at
  )}`;
  const lastLoginSpan = document.createElement("span");
  lastLoginSpan.textContent = `Último login: ${formatDateLabel(
    player.last_login_at,
    true
  )}`;
  meta.appendChild(emailSpan);
  meta.appendChild(characterSpan);
  meta.appendChild(createdSpan);
  meta.appendChild(lastLoginSpan);
  card.appendChild(meta);

  if (actions.length) {
    const actionsEl = document.createElement("div");
    actionsEl.className = "player-actions";
    actions.forEach(({ label, className = "", handler }) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = label;
      if (className) btn.classList.add(className);
      btn.addEventListener("click", handler);
      actionsEl.appendChild(btn);
    });
    card.appendChild(actionsEl);
  }

  return card;
}

async function fetchAllPlayers() {
  const { data, error } = await supabase
    .from("players")
    .select(
      "id, name, email, character_name, joined_at, last_login_at, is_admin"
    )
    .order("joined_at", { ascending: true });
  if (error) {
    console.error("Error loading players:", error);
    return [];
  }
  return data || [];
}

async function fetchGameParticipants(gameId) {
  const { data, error } = await supabase
    .from("game_participants")
    .select("player_id, is_admin")
    .eq("game_id", gameId);
  if (error) {
    console.error("Error loading game participants:", error);
    return [];
  }
  return data || [];
}

function setPlayersListMessage(container, message) {
  if (!container) return;
  container.innerHTML = `<p class="muted">${message}</p>`;
}

async function renderPlayersManagement(gameId, userIsDirector, creatorPlayerId) {
  const manager = document.getElementById("players-management");
  if (!manager) return;
  if (!userIsDirector) {
    manager.classList.add("hidden");
    return;
  }

  const participantsContainer = document.getElementById("participants-list");
  const pendingContainer = document.getElementById("pending-list");
  manager.classList.remove("hidden");
  setPlayersListMessage(participantsContainer, "Cargando participantes...");
  setPlayersListMessage(pendingContainer, "Cargando jugadores...");

  try {
    const [players, participants] = await Promise.all([
      fetchAllPlayers(),
      fetchGameParticipants(gameId),
    ]);
    const participantMap = new Map(
      participants.map((p) => [p.player_id, p || {}])
    );

    participantsContainer.innerHTML = "";
    pendingContainer.innerHTML = "";
    const participantCards = [];
    const pendingCards = [];

    players.forEach((player) => {
      const stored = participantMap.get(player.id);
      const isCreator = player.id === creatorPlayerId;
      const isParticipant = Boolean(stored) || isCreator;
      if (isParticipant) {
        const badge = isCreator
          ? "Director"
          : stored?.is_admin
          ? "Admin"
          : null;
        const actions = [];
        if (!isCreator) {
          actions.push({
            label: "Remover",
            className: "danger",
            handler: () => removePlayerFromGame(gameId, player.id),
          });
        }
        participantCards.push(
          createPlayerCard(player, {
            badge,
            actions,
          })
        );
      } else {
        const actions = [
          {
            label: "Agregar a la partida",
            className: "primary",
            handler: () => addPlayerToGame(gameId, player.id),
          },
          {
            label: "Borrar usuario",
            className: "danger",
            handler: () => deletePlayerRecord(player.id),
          },
        ];
        pendingCards.push(createPlayerCard(player, { actions }));
      }
    });

    if (participantCards.length) {
      participantCards.forEach((card) => participantsContainer.appendChild(card));
    } else {
      setPlayersListMessage(
        participantsContainer,
        "Aún no hay jugadores en la partida."
      );
    }

    if (pendingCards.length) {
      pendingCards.forEach((card) => pendingContainer.appendChild(card));
    } else {
      setPlayersListMessage(
        pendingContainer,
        "No hay jugadores pendientes de invitar."
      );
    }
  } catch (err) {
    console.error("Error rendering players management:", err);
    setPlayersListMessage(
      participantsContainer,
      "No se pudieron cargar los participantes."
    );
    setPlayersListMessage(
      pendingContainer,
      "No se pudieron cargar los jugadores."
    );
  }
}

const DEFAULT_FACTION_ID = "5f76c894-1d09-4669-992d-62d0233f6a77";

async function addPlayerToGame(gameId, playerId) {
  const factionId = DEFAULT_FACTION_ID;
  const { error } = await supabase.from("game_participants").insert({
    game_id: gameId,
    player_id: playerId,
    faction_id: factionId,
    is_admin: false,
  });
  if (error) {
    alert("No se pudo agregar al jugador: " + error.message);
    return;
  }
  await loadGames();
}

async function removePlayerFromGame(gameId, playerId) {
  if (
    !confirm(
      "¿Seguro que deseas remover a este jugador de la partida? Podrás volverlo a agregar luego."
    )
  )
    return;
  const { error } = await supabase
    .from("game_participants")
    .delete()
    .eq("game_id", gameId)
    .eq("player_id", playerId);
  if (error) {
    alert("No se pudo remover al jugador: " + error.message);
    return;
  }
  await loadGames();
}

async function deletePlayerRecord(playerId) {
  if (
    !confirm(
      "Esto eliminará al jugador y sus datos básicos. ¿Deseas continuar?"
    )
  )
    return;
  const { error } = await supabase.from("players").delete().eq("id", playerId);
  if (error) {
    alert("No se pudo borrar el usuario: " + error.message);
    return;
  }
  await loadGames();
}

async function loadGames() {
  const card = document.getElementById("single-game-card");
  if (!card) return;
  updateStatus("Cargando información...");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  const userId = session?.user?.id || null;
  const playerId = await fetchCurrentPlayerId(userId);

  const game = await window.SingleGameStore.fetch();
  if (!game) {
    updateStatus(
      "No encontramos la partida principal. Asegurate de que exista al menos una fila en `games`."
    );
    configureEnterButton(
      false,
      () => {},
      session ? "Sin acceso" : "Iniciá sesión"
    );
    return;
  }

  document.getElementById("single-game-name").textContent = game.name;
  document.getElementById("single-game-meta").textContent =
    formatGameMeta(game);
  document.getElementById("single-game-territory").textContent =
    game.territory?.name || "—";
  document.getElementById("single-game-director").textContent = `Director: ${
    game.players?.name || "—"
  }`;
  document.getElementById("single-game-id-value").textContent = game.id;

  localStorage.setItem("currentGameId", game.id);

  const participation = await fetchParticipation(game.id, playerId);
  const isCreator = game.creator_id === playerId;
  const userIsDirector = isCreator || Boolean(participation?.is_admin);
  const participates = Boolean(participation) || isCreator;
  const canEnter = userIsDirector || participates;
  configureCopyButton(game.id, userIsDirector);

  if (!session) {
    configureEnterButton(
      true,
      () => {
        window.location.hash = "login";
      },
      "Iniciá sesión"
    );
    updateStatus("Ingresá con tu cuenta para acceder a la crónica.");
    return;
  }

  await renderPlayersManagement(game.id, userIsDirector, game.creator_id);

  if (canEnter) {
    configureEnterButton(
      true,
      () => {
        localStorage.setItem("currentGameId", game.id);
        window.location.hash = "game";
      },
      "Entrar a la partida"
    );
    updateStatus("Listo para jugar.");
  } else {
    configureEnterButton(false, () => {}, "Sin acceso");
    updateStatus(
      "Tu usuario todavía no forma parte de esta crónica. Pedile acceso al Director."
    );
  }
}

window.loadGames = loadGames;
