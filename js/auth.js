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
      const email = document.getElementById("su-email").value;
      const password = document.getElementById("su-password").value;
      console.log("Signup submit →", { name, email });

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      console.log("signUp response →", { data, error });
      if (error) {
        suMsg.textContent = error.message;
        return;
      }

      // Ensure a player record exists (handles both signup and login paths)
      await ensurePlayer();
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
      await initializeCurrentPlayer(); // Carga datos del jugador en el estado global
      window.location.hash = "games";
    });
    liForm._init = true;
  }
}

async function ensurePlayer() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) throw new Error("No hay sesión");
  const userId = session.user.id;
  // Intento de select
  const { data: existing } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .single();
  if (!existing) {
    await supabase.from("players").insert([
      {
        name: session.user.user_metadata.full_name || session.user.email,
        email: session.user.email,
        user_id: userId,
      },
    ]);
  }
}

// El router se encarga de la inicialización,
// por lo que no se necesitan listeners de DOMContentLoaded o hashchange aquí.
