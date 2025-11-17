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
function initAuthForms() {
  console.log("initAuthForms called");
  const suForm = document.getElementById("signup-form");
  const liForm = document.getElementById("login-form");

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
  const {
    data: existing,
    error: selectError,
  } = await supabase
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
  if (session) {
    // Si estamos en welcome o sin hash, navegamos a games; si ya estamos en game, no tocamos
    const current = window.location.hash.slice(1) || "welcome";
    if (current === "welcome" || current === "" || current === "login") {
      window.location.hash = "games";
      return;
    }
  }

  // 2) Si estamos en login/register, inicializamos pestañas y forms
  if (
    window.location.hash === "#login" ||
    window.location.hash === "#register"
  ) {
    initAuthTabs();
    initAuthForms();
  }
});

// Cada vez que cambie el hash (carga de un nuevo fragmento) reiniciamos tabs y forms
window.addEventListener("hashchange", () => {
  console.log("hash changed to", window.location.hash);
  if (
    window.location.hash === "#login" ||
    window.location.hash === "#register"
  ) {
    initAuthTabs();
    initAuthForms();
  }
});
