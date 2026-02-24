// js/auth.js
function initAuthTabs() {
  const tabLogin = document.getElementById("tab-login");
  const tabRegister = document.getElementById("tab-register");
  const loginForm = document.getElementById("login-form");
  const signupForm = document.getElementById("signup-form");
  if (!tabLogin || !tabRegister || !loginForm || !signupForm) return;

  tabLogin.onclick = () => {
    tabLogin.classList.add("active");
    tabRegister.classList.remove("active");
    tabLogin.setAttribute("aria-selected", "true");
    tabRegister.setAttribute("aria-selected", "false");
    loginForm.classList.remove("hidden");
    signupForm.classList.add("hidden");
  };
  tabRegister.onclick = () => {
    tabRegister.classList.add("active");
    tabLogin.classList.remove("active");
    tabRegister.setAttribute("aria-selected", "true");
    tabLogin.setAttribute("aria-selected", "false");
    signupForm.classList.remove("hidden");
    loginForm.classList.add("hidden");
  };
}

async function initAuthForms() {
  const suForm = document.getElementById("signup-form");
  const liForm = document.getElementById("login-form");

  if (!suForm || !liForm) return;

  const {
    data: { session },
  } = await window.abnGetSession();

  const homeContainer = document.getElementById("home-container");
  const authContainer = document.getElementById("auth-container");
  const welcomeLayout = document.getElementById("welcome-layout");

  if (session) {
    if (homeContainer) {
      homeContainer.classList.remove("hidden");
      homeContainer.style.display = "";
    }
    if (authContainer) {
      authContainer.classList.add("hidden");
      authContainer.style.display = "";
    }
    if (welcomeLayout) {
      welcomeLayout.classList.add("auth-layout--home");
    }
  } else {
    if (homeContainer) {
      homeContainer.classList.add("hidden");
      homeContainer.style.display = "";
    }
    if (authContainer) {
      authContainer.classList.remove("hidden");
      authContainer.style.display = "";
    }
    if (welcomeLayout) {
      welcomeLayout.classList.remove("auth-layout--home");
    }
  }

  const showMsg = (id, text, type = "error") => {
    const msgElement = document.getElementById(id);
    if (msgElement) {
      msgElement.textContent = text;
      msgElement.className = `app-msg ${type}`;
    }
  };

  if (suForm && !suForm._init) {
    suForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const name = document.getElementById("su-name").value.trim();
      const email = document.getElementById("su-email").value;
      const password = document.getElementById("su-password").value;
      showMsg("su-msg", "", "");

      const pwCheck = window.validatePassword(password);
      if (!pwCheck.ok) {
        showMsg("su-msg", pwCheck.msg, "error");
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: name } },
      });
      if (error) {
        showMsg("su-msg", error.message, "error");
        return;
      }

      await ensurePlayer({ displayName: name });
      showMsg("su-msg", "Registro completado. Redirigiendo...", "success");
      window.location.hash = "chronicles";
    });
    suForm._init = true;
  }

  if (liForm && !liForm._init) {
    liForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("li-email").value;
      const password = document.getElementById("li-password").value;
      showMsg("li-msg", "", "");

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });
      if (error) {
        showMsg("li-msg", error.message, "error");
        return;
      }

      await ensurePlayer();
      showMsg("li-msg", "Ingreso exitoso. Redirigiendo...", "success");
      window.location.hash = "chronicles";
    });
    liForm._init = true;
  }
}

async function ensurePlayer(options = {}) {
  const {
    data: { session },
  } = await window.abnGetSession();
  if (!session) throw new Error("No hay sesión");
  const userId = session.user.id;
  const metadata = session.user.user_metadata || {};
  const desiredName =
    options.displayName || metadata.full_name || session.user.email;
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

document.addEventListener("DOMContentLoaded", async () => {
  await window.abnGetSession();
});
