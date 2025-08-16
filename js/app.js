// js/app.js

/**
 * Fetch and display the list of games in the #games-list element.
 */
async function loadGames() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const currentUserId = session?.user?.id;
  console.log("Usuario logueado:", currentUserId);

  const { data: playerData, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", currentUserId)
    .single();
  console.log("Player ID correspondiente:", playerData?.id);
  if (playerError || !playerData) {
    console.error("Error fetching player info:", playerError);
    return;
  }
  const currentPlayerId = playerData.id;

  const listEl = document.getElementById("games-list");
  const noGames = document.getElementById("no-games");
  if (!listEl || !noGames) return; // not on the games view

  // Obtener todos los IDs de partidas donde participa este jugador
  const { data: participations, error: partsErr } = await supabase
    .from("game_participants")
    .select("game_id")
    .eq("player_id", currentPlayerId);

  console.log("Participaciones encontradas:", participations);

  if (partsErr) {
    console.error("Error fetching game participations:", partsErr);
    return;
  }

  const joinedGameIds = participations.map((p) => p.game_id);

  const { data: games, error } = await supabase
    .from("games")
    .select(
      `
      id,
      name,
      created_at,
      creator_id,
      players!games_creator_id_fkey(name),
      nights(turn_number, night_date),
      game_participants(player_id)
    `
    )
    .in("id", joinedGameIds)
    .order("start_date", { ascending: false });

  console.log("Juegos encontrados:", games);

  if (error) {
    console.error("Error loading games:", error);
    return;
  }

  listEl.innerHTML = "";
  if (!games.length) {
    noGames.style.display = "";
    return;
  }
  noGames.style.display = "none";

  games.forEach((g) => {
    console.log("Procesando juego:", g.id, g.name);
    const nights = g.nights || [];
    const latest = nights.sort((a, b) => b.turn_number - a.turn_number)[0];
    const turnNum = latest ? latest.turn_number : "—";
    const turnDate = latest
      ? new Date(latest.night_date).toLocaleDateString()
      : "—";

    const isCreator = g.creator_id === currentPlayerId;
    const isParticipant = g.game_participants?.some(
      (p) => p.player_id === currentPlayerId
    );

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${g.name}</td>
      <td>${g.players?.name || "—"}</td>
      <td>${new Date(g.created_at).toLocaleDateString()}</td>
      <td>${turnNum}</td>
      <td>${turnDate}</td>
      ${
        isCreator
          ? `<td>
               <button class="invite-game-btn" data-id="${g.id}" title="Invitar">🔗</button>
               <button class="delete-game-btn" data-id="${g.id}" title="Eliminar">🗑️</button>
             </td>`
          : isParticipant
          ? `<td></td>`
          : null
      }
    `;
    tr.addEventListener("click", () => {
      localStorage.setItem("currentGameId", g.id);
      window.location.hash = "game";
    });
    // Delete button handler
    if (isCreator) {
      const btn = tr.querySelector(".delete-game-btn");
      btn.addEventListener("click", (e) => {
        e.stopPropagation(); // prevent row click navigation
        deleteGame(btn.dataset.id);
      });
    }
    // Invite button handler
    if (isCreator) {
      const inviteBtn = tr.querySelector(".invite-game-btn");
      inviteBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const gameId = inviteBtn.dataset.id;
        navigator.clipboard.writeText(gameId).then(() => {
          alert("ID de la partida copiado al portapapeles:\n" + gameId);
        });
      });
    }
    listEl.appendChild(tr);
  });
}

/**
 * Fetch and populate the territory dropdown when creating a new game.
 */
async function loadTerritories() {
  const selectEl = document.getElementById("territory-select");
  if (!selectEl) return; // modal not in DOM

  const { data: territories, error } = await supabase
    .from("territories")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    console.error("Error loading territories:", error);
    return;
  }

  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecciona un territorio";
  placeholder.disabled = true;
  placeholder.selected = true;
  selectEl.appendChild(placeholder);

  territories.forEach((t) => {
    const opt = document.createElement("option");
    opt.value = t.id;
    opt.textContent = t.name;
    selectEl.appendChild(opt);
  });
}

/**
 * Fetch and populate the faction dropdown when creating a new game.
 */
async function loadFactions() {
  const selectEl = document.getElementById("faction-select");
  if (!selectEl) return; // modal not in DOM

  const { data: factions, error } = await supabase
    .from("factions")
    .select("id, name")
    .order("name", { ascending: true });
  if (error) {
    console.error("Error loading factions:", error);
    return;
  }

  selectEl.innerHTML = "";
  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Selecciona una facción";
  placeholder.disabled = true;
  placeholder.selected = true;
  selectEl.appendChild(placeholder);

  factions.forEach((f) => {
    const opt = document.createElement("option");
    opt.value = f.id;
    opt.textContent = f.name;
    selectEl.appendChild(opt);
  });
}

/**
 * Load all dropdown options for creating a game.
 */
async function loadOptions() {
  await Promise.all([loadTerritories(), loadFactions()]);
}

/**
 * Read form inputs and insert a new game into Supabase.
 * Then reload the game list.
 */
async function createGame() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    alert("Debes estar logueado para crear la partida.");
    return;
  }

  const userId = session.user.id;
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (playerErr || !player) {
    alert("No se encontró tu registro de jugador.");
    return;
  }

  // Read form fields
  const name = document.getElementById("game-name")?.value.trim();
  const date = document.getElementById("game-date")?.value;
  const factionId = document.getElementById("faction-select")?.value;
  const territoryId = document.getElementById("territory-select")?.value;
  if (!name || !date || !territoryId || !factionId) {
    alert("Completa todos los campos antes de crear la partida.");
    return;
  }

  const { data: newGame, error: gameErr } = await supabase
    .from("games")
    .insert([
      {
        name,
        start_date: date,
        creator_id: player.id,
        territory_id: territoryId,
      },
    ])
    .select();
  if (gameErr) {
    alert("Error al crear partida: " + gameErr.message);
    return;
  }
  // Add the creator as a participant in this game
  const { error: partErr } = await supabase.from("game_participants").insert({
    game_id: newGame[0].id,
    player_id: player.id,
    faction_id: factionId,
    is_admin: true,
  });
  if (partErr) {
    console.error("Error adding creator to participants:", partErr);
  }
  // 3) Register all available factions for this game (behind the scenes)
  try {
    const { data: allFactions, error: allErr } = await supabase
      .from("factions")
      .select("id");
    if (allErr) throw allErr;
    const gameFactions = allFactions.map((f) => ({
      game_id: newGame[0].id,
      faction_id: f.id,
    }));
    const { error: gfErr } = await supabase
      .from("game_factions")
      .insert(gameFactions);
    if (gfErr) console.error("Error registering game_factions:", gfErr);
  } catch (err) {
    console.error("Error loading factions for game_factions:", err);
  }

  loadGames();
  alert("Partida creada: " + newGame[0].name);
}

/**
 * Delete a game and all its related data via the delete_game RPC.
 */
async function deleteGame(gameId) {
  if (!confirm("¿Eliminar esta partida y todos sus datos?")) return;
  const { error } = await supabase.rpc("delete_game", { p_game_id: gameId });
  if (error) {
    console.error("Error deleting game:", error);
    alert("No se pudo eliminar la partida: " + error.message);
  } else {
    loadGames();
  }
}

// Nueva función para manejar la lógica de "Unirse a una partida"
async function setupJoinGame() {
  console.log("Setting up join game...");
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    alert("Debes estar logueado para unirte a una partida.");
    return;
  }

  const gameId = prompt("Pega el ID de la partida:");
  if (!gameId) return;

  const userId = session.user.id;
  const { data: player, error: playerErr } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (playerErr || !player) {
    alert("No se encontró tu registro de jugador.");
    return;
  }

  const { data: game, error: gameErr } = await supabase
    .from("games")
    .select("id")
    .eq("id", gameId)
    .single();
  if (gameErr || !game) {
    alert("No se encontró la partida.");
    return;
  }

  const { data: factions, error: fErr } = await supabase
    .from("game_factions")
    .select("faction_id, factions(name)")
    .eq("game_id", gameId);
  if (fErr || !factions.length) {
    alert("No se encontraron facciones para esta partida.");
    return;
  }

  const { data: joinableFactions, error: joinErr } = await supabase
    .from("factions")
    .select("id, name")
    .in(
      "id",
      factions.map((f) => f.faction_id)
    )
    .eq("allow_non_admin_control", true);
  if (joinErr || !joinableFactions.length) {
    alert("No hay facciones disponibles para unirse.");
    return;
  }

  const names = joinableFactions.map((f) => f.name).join(", ");
  const factionName = prompt(
    `Facciones disponibles: ${names}\nEscribe el nombre exacta de la facción a la que te quieres unir:`
  );

  const selected = joinableFactions.find(
    (f) => f.name.toLowerCase() === factionName?.toLowerCase()
  );
  if (!selected) {
    alert("Facción inválida.");
    return;
  }

  // Validar si ya está unido antes de insertar
  const { data: existing, error: existErr } = await supabase
    .from("game_participants")
    .select("id")
    .eq("game_id", gameId)
    .eq("player_id", player.id)
    .single();

  if (existing) {
    alert("Ya estás unido a esta partida.");
    return;
  }

  const { error: insertErr } = await supabase.from("game_participants").insert({
    game_id: gameId,
    player_id: player.id,
    faction_id: selected.id,
    is_admin: false,
  });
  if (insertErr) {
    alert("Error al unirse a la partida: " + insertErr.message);
    return;
  }

  alert("¡Te has unido a la partida!");
  loadGames();
}

// Expose functions for router and inline handlers

window.loadGames = loadGames;
window.loadTerritories = loadTerritories;
window.createGame = createGame;
window.loadFactions = loadFactions;
window.loadOptions = loadOptions;
window.deleteGame = deleteGame;

// Setup button listeners when DOM is ready
document.addEventListener("DOMContentLoaded", () => {
  console.log("App DOMContentLoaded");

  // Setup create game button immediately if present
  const createBtn = document.getElementById("btn-create-game");
  if (createBtn) {
    createBtn.addEventListener("click", () => {
      loadTerritories();
      document.getElementById("createGameDialog").showModal();
    });
  }

  // Use a MutationObserver to detect when the join button appears
  const observer = new MutationObserver(() => {
    const joinBtn = document.getElementById("btn-join-game");
    if (joinBtn) {
      console.log("Setting up join button listener");
      joinBtn.addEventListener("click", setupJoinGame);
      observer.disconnect(); // Ya lo encontró, deja de observar
    }
  });

  observer.observe(document.body, { childList: true, subtree: true });
});
