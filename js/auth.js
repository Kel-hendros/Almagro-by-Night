// js/auth.js
console.log("auth.js loaded");

// Inicializa los listeners de las pestañas Ingresar / Registrarse
function initAuthTabs() {
  console.log("initAuthTabs called");
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  if (!tabLogin || !tabRegister) {
    console.log("initAuthTabs: no se encontraron pestañas");
    return;
  }

  tabLogin.onclick = () => {
    console.log("tabLogin clicked");
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
  };
  tabRegister.onclick = () => {
    console.log("tabRegister clicked");
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  };
}

// Inicializa los handlers de los formularios de auth
async function initAuthForms() {
  console.log("initAuthForms: Execution started");
  const suForm = document.getElementById("signup-form");
  const liForm = document.getElementById("login-form");

  if (!suForm || !liForm) {
    console.warn("initAuthForms: Forms not found. Cache issue?");
    return;
  }

  // View Toggling based on Session
  const {
    data: { session },
  } = await supabase.auth.getSession();

  console.log(
    "initAuthForms: Session check ->",
    session ? "Valid Session Found" : "No Session"
  );

  const homeContainer = document.getElementById("home-container");
  const authContainer = document.getElementById("auth-container");

  console.log("initAuthForms: Containers found?", {
    home: !!homeContainer,
    auth: !!authContainer,
    hiddenClass: homeContainer
      ? homeContainer.classList.contains("hidden")
      : "N/A",
  });

  if (session) {
    if (homeContainer) {
      homeContainer.classList.remove("hidden");
      homeContainer.style.display = "block";
    }
    if (authContainer) {
      authContainer.classList.add("hidden");
      authContainer.style.display = "none";
    }
  } else {
    if (homeContainer) {
      homeContainer.classList.add("hidden");
      homeContainer.style.display = "none";
    }
    if (authContainer) {
      authContainer.classList.remove("hidden");
      // Restore default display (usually block, but let CSS handle it if possible,
      // or force block if we want to be sure)
      authContainer.style.display = "block";
    }
  }

  // Common UI helpers
  const showMsg = (id, text, type = "error") => {
    const msgElement = document.getElementById(id);
    if (msgElement) {
      msgElement.textContent = text;
      msgElement.className = `message ${type}`; // Apply class for styling
    }
  };

  if (suForm && !suForm._init) {
    console.log("attach signup handler");
    const suMsg = document.getElementById("su-msg");
    suForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("su-name").value.trim();
      const characterName = document
        .getElementById("su-character")
        .value.trim();
      const email = document.getElementById("su-email").value;
      const password = document.getElementById("su-password").value;
      console.log("Signup submit →", { name, email, characterName });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name, character_name: characterName } },
      });
      console.log("signUp response →", { data, error });
      if (error) {
        suMsg.textContent = error.message;
        return;
      }

      // Ensure a player record exists (handles both signup and login paths)
      await ensurePlayer({ displayName: name, characterName });
      alert("¡Registrado!");
      window.location.hash = "games";
    });
    suForm._init = true;
  }

  if (liForm && !liForm._init) {
    console.log("attach login handler");
    const liMsg = document.getElementById("li-msg");
    liForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("li-email").value;
      const password = document.getElementById("li-password").value;
      console.log("Login submit →", { email });

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      console.log("signIn response →", { data, error });
      if (error) {
        liMsg.textContent = error.message;
        suMsg.textContent = error.message;
        return;
      }

      console.log("Login exitoso, cambiando hash a #games");
      await ensurePlayer(); // Asegura que el jugador exista
      window.location.hash = "games";
    });
    liForm._init = true;
  }
}

async function ensurePlayer(options = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión");
  const userId = session.user.id;
  const metadata = session.user.user_metadata || {};
  const desiredName =
    options.displayName || metadata.full_name || session.user.email;
  const desiredCharacter =
    options.characterName || metadata.character_name || null;
  const nowIso = new Date().toISOString();
  // Intento de select
  const { data: existing, error: selectError } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (selectError) {
    console.error("ensurePlayer select error:", selectError);
    throw selectError;
  }
  if (!existing) {
    const payload = {
      name: desiredName,
      email: session.user.email,
      user_id: userId,
      last_login_at: nowIso,
    };
    if (desiredCharacter) {
      payload.character_name = desiredCharacter;
    }
    const { error: insertError } = await supabase
      .from("players")
      .insert([payload]);
    if (insertError) {
      console.error("ensurePlayer insert error:", insertError);
      throw insertError;
    }
  } else {
    const { error: updateError } = await supabase
      .from("players")
      .update({ last_login_at: nowIso })
      .eq("id", existing.id);
    if (updateError) {
      console.error("ensurePlayer update error:", updateError);
      throw updateError;
    }
  }
}

// Al cargar la app por primera vez
document.addEventListener("DOMContentLoaded", async () => {
  console.log("DOMContentLoaded fired");

  // 1) Chequear si ya hay sesión activa
  const {
    data: { session },
    error: sessionErr,
  } = await supabase.auth.getSession();
  console.log("getSession →", { session, sessionErr });
  // Removed legacy redirect to #games. We now support a Home screen on #welcome.

  // 2) Si estamos en login/register, inicializamos pestañas y forms
  // DEPRECATED: Router handles this now to avoid race conditions.
});

// Cada vez que cambie el hash (carga de un nuevo fragmento) reiniciamos tabs y forms
// DEPRECATED: Router handles this now.
// window.addEventListener("hashchange", () => { ... });
