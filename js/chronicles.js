// js/chronicles.js — Chronicles list + create + join

async function fetchCurrentPlayer() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from("players")
    .select("id, name, is_admin")
    .eq("user_id", session.user.id)
    .maybeSingle();
  if (error) {
    console.error("fetchCurrentPlayer:", error);
    return null;
  }
  return data;
}

async function loadChronicles() {
  const grid = document.getElementById("chronicles-grid");
  if (!grid) return;

  grid.innerHTML = '<p class="muted">Cargando crónicas...</p>';

  const player = await fetchCurrentPlayer();
  if (!player) {
    grid.innerHTML = '<p class="muted">Debes iniciar sesión.</p>';
    return;
  }

  // Get all chronicles the player participates in
  const { data: participations, error: pErr } = await supabase
    .from("chronicle_participants")
    .select(
      "role, chronicle:chronicles(id, name, status, creator_id, created_at, banner_url)"
    )
    .eq("player_id", player.id);

  if (pErr) {
    console.error("loadChronicles:", pErr);
    grid.innerHTML = '<p class="error">Error al cargar crónicas.</p>';
    return;
  }

  // Also find chronicles where the player is creator but might not be in participants yet
  const { data: ownedChronicles } = await supabase
    .from("chronicles")
    .select("id, name, status, creator_id, created_at, banner_url")
    .eq("creator_id", player.id);

  // Merge and deduplicate
  const chronicleMap = new Map();

  if (participations) {
    participations.forEach((p) => {
      if (p.chronicle) {
        chronicleMap.set(p.chronicle.id, {
          ...p.chronicle,
          role: p.role,
        });
      }
    });
  }

  if (ownedChronicles) {
    ownedChronicles.forEach((c) => {
      if (!chronicleMap.has(c.id)) {
        chronicleMap.set(c.id, { ...c, role: "narrator" });
      }
    });
  }

  const chronicles = Array.from(chronicleMap.values()).sort(
    (a, b) => new Date(b.created_at) - new Date(a.created_at)
  );

  grid.innerHTML = "";

  if (!chronicles.length) {
    grid.innerHTML =
      '<p class="muted">No participas en ninguna crónica. Crea una o unite con un código de invitación.</p>';
    return;
  }

  // Count participants per chronicle
  const chronicleIds = chronicles.map((c) => c.id);
  const { data: allParticipants } = await supabase
    .from("chronicle_participants")
    .select("chronicle_id, player_id")
    .in("chronicle_id", chronicleIds);

  const countMap = {};
  if (allParticipants) {
    allParticipants.forEach((p) => {
      countMap[p.chronicle_id] = (countMap[p.chronicle_id] || 0) + 1;
    });
  }

  chronicles.forEach((chronicle) => {
    const card = document.createElement("div");
    card.className = "chronicle-card";
    card.onclick = () => {
      localStorage.setItem("currentChronicleId", chronicle.id);
      window.location.hash = "chronicle";
    };

    const roleBadge =
      chronicle.role === "narrator"
        ? '<span class="chronicle-badge narrator">Narrador</span>'
        : '<span class="chronicle-badge player">Jugador</span>';

    const statusBadge =
      chronicle.status === "active"
        ? '<span class="chronicle-badge active">Activa</span>'
        : '<span class="chronicle-badge archived">Archivada</span>';

    const playerCount = countMap[chronicle.id] || 1;

    const bannerHtml = chronicle.banner_url
      ? `<div class="chronicle-card-banner"><img src="${escapeHtml(chronicle.banner_url)}" alt="" loading="lazy"></div>`
      : "";

    card.innerHTML = `
      ${bannerHtml}
      <h3>${escapeHtml(chronicle.name)}</h3>
      <div class="chronicle-card-meta">
        ${roleBadge}
        ${statusBadge}
      </div>
      <div class="chronicle-card-stats">
        <span>${playerCount} jugador${playerCount !== 1 ? "es" : ""}</span>
      </div>
    `;

    grid.appendChild(card);
  });
}

// --- Create Chronicle ---

async function openCreateModal() {
  const modal = document.getElementById("modal-create-chronicle");
  if (modal) {
    modal.classList.add("visible");
    const input = document.getElementById("create-chronicle-name");
    if (input) {
      input.value = "";
      input.focus();
    }
    const msg = document.getElementById("create-chronicle-msg");
    if (msg) msg.textContent = "";
  }
}

function closeCreateModal() {
  const modal = document.getElementById("modal-create-chronicle");
  if (modal) modal.classList.remove("visible");
}

async function submitCreateChronicle() {
  const nameInput = document.getElementById("create-chronicle-name");
  const msg = document.getElementById("create-chronicle-msg");
  const name = nameInput?.value?.trim();

  if (!name) {
    if (msg) {
      msg.textContent = "Ingresa un nombre para la crónica.";
      msg.className = "msg error";
    }
    return;
  }

  const player = await fetchCurrentPlayer();
  if (!player) {
    if (msg) {
      msg.textContent = "Error de sesión.";
      msg.className = "msg error";
    }
    return;
  }

  // Generate invite code via DB function
  const { data: codeData, error: codeErr } = await supabase.rpc(
    "generate_invite_code"
  );

  if (codeErr) {
    console.error("generate_invite_code error:", codeErr);
    if (msg) {
      msg.textContent = "Error al generar código.";
      msg.className = "msg error";
    }
    return;
  }

  const inviteCode = codeData;

  // Create chronicle
  const { data: chronicle, error: insertErr } = await supabase
    .from("chronicles")
    .insert({
      name,
      creator_id: player.id,
      invite_code: inviteCode,
    })
    .select()
    .single();

  if (insertErr) {
    console.error("create chronicle error:", insertErr);
    if (msg) {
      msg.textContent = "Error: " + insertErr.message;
      msg.className = "msg error";
    }
    return;
  }

  // Add creator as narrator
  await supabase.from("chronicle_participants").insert({
    chronicle_id: chronicle.id,
    player_id: player.id,
    role: "narrator",
  });

  closeCreateModal();
  localStorage.setItem("currentChronicleId", chronicle.id);
  window.location.hash = "chronicle";
}

// --- Join Chronicle ---

async function openJoinModal() {
  const modal = document.getElementById("modal-join-chronicle");
  if (modal) {
    modal.classList.add("visible");
    const input = document.getElementById("join-chronicle-code");
    if (input) {
      input.value = "";
      input.focus();
    }
    const msg = document.getElementById("join-chronicle-msg");
    if (msg) msg.textContent = "";
  }
}

function closeJoinModal() {
  const modal = document.getElementById("modal-join-chronicle");
  if (modal) modal.classList.remove("visible");
}

async function submitJoinChronicle() {
  const codeInput = document.getElementById("join-chronicle-code");
  const msg = document.getElementById("join-chronicle-msg");
  const code = codeInput?.value?.trim();

  if (!code) {
    if (msg) {
      msg.textContent = "Ingresa un código de invitación.";
      msg.className = "msg error";
    }
    return;
  }

  const { data, error } = await supabase.rpc("join_chronicle_by_code", {
    p_code: code,
  });

  if (error) {
    console.error("join_chronicle_by_code error:", error);
    let message = "Código inválido o crónica inactiva.";
    if (error.message?.includes("Invalid invite code")) {
      message = "Código de invitación no encontrado.";
    } else if (error.message?.includes("not active")) {
      message = "Esta crónica está archivada.";
    }
    if (msg) {
      msg.textContent = message;
      msg.className = "msg error";
    }
    return;
  }

  if (data?.already_member) {
    if (msg) {
      msg.textContent = `Ya sos parte de "${data.name}".`;
      msg.className = "msg success";
    }
    setTimeout(() => {
      closeJoinModal();
      localStorage.setItem("currentChronicleId", data.chronicle_id);
      window.location.hash = "chronicle";
    }, 1000);
    return;
  }

  closeJoinModal();
  localStorage.setItem("currentChronicleId", data.chronicle_id);
  window.location.hash = "chronicle";
}

window.loadChronicles = loadChronicles;
