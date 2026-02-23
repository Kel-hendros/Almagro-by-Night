// js/router.js

let sessionReady = false;
let currentSession = null;
let __pendingPasswordRecovery = false;
const SIDEBAR_MODE_KEY = "abn_sidebar_mode";
const APP_THEME_KEY = "abn_theme";
const APP_FONT_KEY = "abn_font";
const THEME_ORDER = [
  "dark",
  "light",
  "camarilla",
  "sabbat",
  "anarquista",
  "phantomas",
];
const FONT_ORDER = ["clasico", "noir", "terminal"];

// Route/render guards
let __currentRoute = null;
let __lastRenderedPath = null;
let __lastUserId = null;

function extractSupabaseHashPayload(rawHashValue) {
  const raw = String(rawHashValue || "");
  if (!raw) return null;

  const decoded = decodeURIComponent(raw);
  if (decoded.startsWith("access_token=") || decoded.startsWith("error=")) {
    return decoded;
  }

  const markerAccess = "#access_token=";
  const markerError = "#error=";
  const idxAccess = decoded.indexOf(markerAccess);
  const idxError = decoded.indexOf(markerError);
  const idx =
    idxAccess === -1
      ? idxError
      : idxError === -1
        ? idxAccess
        : Math.min(idxAccess, idxError);

  if (idx === -1) return null;
  return decoded.slice(idx + 1);
}

async function bootstrapRecoverySessionFromHash() {
  const rawHash = window.location.hash.slice(1);
  const payload = extractSupabaseHashPayload(rawHash);
  if (!payload) return false;

  // Keep URL hash canonical so Supabase/auth flows and router checks are stable.
  if (payload !== rawHash) {
    history.replaceState(
      null,
      "",
      `${window.location.pathname}${window.location.search}#${payload}`,
    );
  }

  const params = new URLSearchParams(payload);
  const type = params.get("type");
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (type !== "recovery" || !accessToken || !refreshToken) return false;

  try {
    const { error } = await supabase.auth.setSession({
      access_token: accessToken,
      refresh_token: refreshToken,
    });
    if (error) {
      console.warn("Router: recovery setSession failed:", error.message);
      return false;
    }
    __pendingPasswordRecovery = true;
    return true;
  } catch (err) {
    console.warn("Router: recovery bootstrap exception:", err);
    return false;
  }
}

function applyStoredTheme() {
  const raw = (localStorage.getItem(APP_THEME_KEY) || "dark").toLowerCase();
  const stored = THEME_ORDER.includes(raw) ? raw : "dark";
  document.documentElement.setAttribute("data-app-theme", stored);
  localStorage.setItem(APP_THEME_KEY, stored);
}

function applyStoredFont() {
  const raw = (localStorage.getItem("abn_font") || "clasico").toLowerCase();
  const stored = FONT_ORDER.includes(raw) ? raw : "clasico";
  document.documentElement.setAttribute("data-app-font", stored);
  localStorage.setItem("abn_font", stored);
}

function updateSidebarToggleIcon(sidebar) {
  const toggleBtn = document.getElementById("sidebar-toggle");
  if (!toggleBtn || !sidebar) return;
  const isSlim = sidebar.classList.contains("sidebar-slim-mode");
  const nextIcon = isSlim ? "panel-left-open" : "panel-left-close";
  toggleBtn.innerHTML = `<i data-lucide="${nextIcon}"></i>`;
  toggleBtn.setAttribute(
    "title",
    isSlim ? "Expandir barra lateral" : "Colapsar barra lateral",
  );
  toggleBtn.setAttribute(
    "aria-label",
    isSlim ? "Expandir barra lateral" : "Colapsar barra lateral",
  );
  if (window.lucide?.createIcons) lucide.createIcons();
}

function setActiveSidebarItem(baseHash) {
  const routeToMenu = {
    welcome: "menu-welcome",
    user: "menu-user",
    settings: "menu-settings",
    chronicles: "menu-chronicles",
    chronicle: "menu-chronicles",
    "character-sheets": "menu-chars",
    "active-character-sheet": "menu-chars",
    games: "menu-games",
    game: "menu-games",
    tools: "menu-tools",
    "portrait-generator": "menu-tools",
    "card-creator": "menu-tools",
    "combat-tracker": "menu-tools",
    "active-encounter": "menu-tools",
    "temporal-codex": "menu-tools",
  };

  document.querySelectorAll(".nav li.active").forEach((li) => {
    li.classList.remove("active");
  });

  const targetId = routeToMenu[baseHash];
  if (!targetId) return;
  document.getElementById(targetId)?.classList.add("active");
}

function updateContentBackgroundMode(baseHash) {
  const contentShell = document.querySelector("main.content");
  if (!contentShell) return;
  const useFlatThemeBackground =
    baseHash === "settings" || baseHash === "chronicles" || baseHash === "chronicle" || baseHash === "character-sheets";
  contentShell.classList.toggle("content-theme-bg-only", useFlatThemeBackground);
}

function bindFragmentActions(contentEl) {
  if (!contentEl) return;

  contentEl.querySelectorAll("[data-nav-hash]").forEach((el) => {
    const targetHash = (el.getAttribute("data-nav-hash") || "").trim();
    if (!targetHash || el.dataset.navBound === "1") return;

    const navigate = () => {
      window.location.hash = targetHash;
    };

    el.addEventListener("click", navigate);
    el.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        navigate();
      }
    });
    el.dataset.navBound = "1";
  });

  contentEl.querySelectorAll("[data-history-back]").forEach((el) => {
    if (el.dataset.historyBackBound === "1") return;
    el.addEventListener("click", () => window.history.back());
    el.dataset.historyBackBound = "1";
  });
}

function initAppThemeModal() {
  const openBtn = document.getElementById("theme-toggle");
  const modal = document.getElementById("app-theme-modal");
  const closeBtn = document.getElementById("app-theme-modal-close");
  const swatches = document.querySelectorAll(".app-theme-swatch");
  const fontBtns = document.querySelectorAll(".app-font-btn");

  if (!openBtn || !modal || !closeBtn) return;
  if (modal._init) return;

  function emitThemeFontChange() {
    window.dispatchEvent(
      new CustomEvent("abn-theme-font-changed", {
        detail: {
          theme: (document.documentElement.getAttribute("data-app-theme") || "dark").toLowerCase(),
          font: (document.documentElement.getAttribute("data-app-font") || "clasico").toLowerCase(),
        },
      }),
    );
  }

  function syncActive() {
    const currentTheme =
      (document.documentElement.getAttribute("data-app-theme") || "dark").toLowerCase();
    const currentFont =
      (document.documentElement.getAttribute("data-app-font") || "clasico").toLowerCase();
    swatches.forEach((s) =>
      s.classList.toggle("active", s.dataset.theme === currentTheme),
    );
    fontBtns.forEach((b) =>
      b.classList.toggle("active", b.dataset.font === currentFont),
    );
  }

  function openModal() {
    syncActive();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  openBtn.addEventListener("click", (e) => {
    e.preventDefault();
    openModal();
  });
  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  swatches.forEach((swatch) => {
    swatch.addEventListener("click", () => {
      const theme = (swatch.dataset.theme || "").toLowerCase();
      if (!THEME_ORDER.includes(theme)) return;
      document.documentElement.setAttribute("data-app-theme", theme);
      localStorage.setItem(APP_THEME_KEY, theme);
      syncActive();
      emitThemeFontChange();
    });
  });

  fontBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      const font = (btn.dataset.font || "").toLowerCase();
      if (!FONT_ORDER.includes(font)) return;
      document.documentElement.setAttribute("data-app-font", font);
      localStorage.setItem(APP_FONT_KEY, font);
      syncActive();
      emitThemeFontChange();
    });
  });

  modal._init = true;
}

// Helper: Update Sidebar based on width OR route
function updateSidebarResponsiveState() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const isSmallScreen = window.matchMedia("(max-width: 1400px)").matches;
  // Use current hash or global __currentRoute
  const hash = window.location.hash.slice(1);
  const isForcedMode =
    hash.startsWith("active-encounter") ||
    hash.startsWith("active-character-sheet");
  const storedMode = localStorage.getItem(SIDEBAR_MODE_KEY);

  if (isForcedMode) {
    sidebar.classList.add("sidebar-slim-mode");
  } else {
    if (storedMode === "collapsed") {
      sidebar.classList.add("sidebar-slim-mode");
    } else if (storedMode === "expanded") {
      sidebar.classList.remove("sidebar-slim-mode");
    } else if (isSmallScreen) {
      sidebar.classList.add("sidebar-slim-mode");
    } else {
      sidebar.classList.remove("sidebar-slim-mode");
    }
  }
  updateSidebarToggleIcon(sidebar);
}

// 1) Update the sidebar based on session state
async function updateSidebar() {
  const liLogout = document.getElementById("menu-logout");
  const liWelcome = document.getElementById("menu-welcome");
  const liUser = document.getElementById("menu-user");
  const liGames = document.getElementById("menu-games");
  const liSettings = document.getElementById("menu-settings");
  const liQuickActions = document.getElementById("menu-quick-actions");
  const spanName = document.getElementById("user-name");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    liWelcome?.classList.add("hidden");
    liUser?.classList.remove("hidden");
    liGames?.classList.remove("hidden");
    liLogout?.classList.remove("hidden");
    liSettings?.classList.remove("hidden");
    liQuickActions?.classList.remove("hidden");
    const name = session.user.user_metadata?.full_name || session.user.email;
    if (spanName) spanName.textContent = name;

    // Check Admin for Tools Menu - NOW OPEN FOR ALL AUTHENTICATED USERS
    const liTools = document.getElementById("menu-tools");
    if (liTools) {
      liTools.classList.remove("hidden");
    }
    const liChars = document.getElementById("menu-chars");
    if (liChars) {
      liChars.classList.remove("hidden");
    }
    const liChronicles = document.getElementById("menu-chronicles");
    if (liChronicles) {
      liChronicles.classList.remove("hidden");
    }
  } else {
    liWelcome?.classList.remove("hidden");
    liUser?.classList.add("hidden");
    liGames?.classList.add("hidden");
    liLogout?.classList.add("hidden");
    liSettings?.classList.add("hidden");
    liQuickActions?.classList.add("hidden");
    document.getElementById("menu-tools")?.classList.add("hidden");
    document.getElementById("menu-chars")?.classList.add("hidden");
    document.getElementById("menu-chronicles")?.classList.add("hidden");
  }
}

// 2) Define routes mapping hashes to fragment URLs
const routes = {
  welcome: "fragments/login.html",
  chronicles: "fragments/chronicles.html",
  chronicle: "fragments/chronicle.html",
  games: "fragments/games.html",
  game: "fragments/game.html",
  settings: "fragments/settings.html",
  tools: "fragments/tools.html",
  "portrait-generator": "fragments/portrait-generator.html",
  "card-creator": "fragments/card-creator.html",
  "character-sheets": "fragments/character-sheets.html",
  "active-character-sheet": "fragments/active-character-sheet.html",
  "combat-tracker": "fragments/combat-tracker.html",
  "active-encounter": "fragments/active-encounter.html",
  "temporal-codex": "fragments/temporal-codex.html",
};

// 3) Core routing function
async function loadRoute(force = false) {
  if (!sessionReady) return; // wait until session is initialized

  const rawHash = window.location.hash.slice(1) || "welcome";

  // Intercept Supabase error hashes (e.g. #error=access_denied&error_code=otp_expired&...)
  // These happen when a recovery/magic-link fails (expired, already used, etc.)
  if (rawHash.startsWith("error=")) {
    const params = new URLSearchParams(rawHash);
    const errorCode = params.get("error_code");
    const errorDesc = (params.get("error_description") || "").replace(/\+/g, " ");

    const friendlyMessages = {
      otp_expired: "El enlace ha expirado. Por favor, solicitá uno nuevo desde Configuración.",
      access_denied: "Acceso denegado. El enlace puede haber sido usado o es inválido.",
    };
    const message = friendlyMessages[errorCode] || errorDesc || "Error de autenticación.";
    console.warn("Router: Supabase auth error in hash →", errorCode, errorDesc);

    // Clean the hash and redirect to a sensible route
    const fallback = currentSession ? "welcome" : "welcome";
    window.location.hash = fallback;

    // Show error after a small delay so the page renders first
    setTimeout(() => alert(message), 300);
    return;
  }

  // Split query params if present
  const [baseHash, queryString] = rawHash.split("?");

  const session = currentSession;

  // Redirect resolution (compute target hash without causing loops)
  let targetHash = rawHash; // Keep full hash for redirect comparison

  // Previously redirected authenticated users from 'welcome' to 'games'.
  // Now we want them to see the home screen on 'welcome'.
  if (
    !session &&
    (baseHash === "games" ||
      baseHash === "game" ||
      baseHash === "chronicles" ||
      baseHash === "chronicle" ||
      baseHash === "settings" ||
      baseHash === "active-character-sheet")
  ) {
    targetHash = "welcome";
  }

  // If the hash should change due to redirect, change it (only if different) and bail; hashchange will re-enter
  if (targetHash !== rawHash) {
    if (window.location.hash !== `#${targetHash}`) {
      window.location.hash = targetHash;
    }
    return;
  }

  const path = routes[baseHash] || routes.welcome;
  updateContentBackgroundMode(baseHash);

  // Guard: avoid redundant rerenders of the exact same route/path when not forced
  if (!force && __currentRoute === targetHash && __lastRenderedPath === path) {
    return;
  }

  const contentEl = document.getElementById("content");
  try {
    const res = await fetch(path);
    const html = await res.text();
    contentEl.innerHTML = html;

    // Execute scripts found in the fragment
    const scripts = contentEl.querySelectorAll("script");
    scripts.forEach((oldScript) => {
      const newScript = document.createElement("script");
      Array.from(oldScript.attributes).forEach((attr) =>
        newScript.setAttribute(attr.name, attr.value),
      );
      newScript.appendChild(document.createTextNode(oldScript.innerHTML));
      oldScript.parentNode.replaceChild(newScript, oldScript);
    });

    if (window.lucide?.createIcons) lucide.createIcons();
    bindFragmentActions(contentEl);
  } catch (e) {
    console.error("Router Error:", e);
    contentEl.innerHTML = "<p>Error al cargar la sección.</p>";
  }

  // Execute any embedded <script> tags in the fragment
  // contentEl.querySelectorAll("script").forEach((s) => eval(s.textContent));

  // View-specific initialization
  if (
    targetHash === "welcome" ||
    targetHash === "login" ||
    targetHash === "register" ||
    targetHash === "user"
  ) {
    if (typeof initAuthTabs === "function") initAuthTabs();
    if (typeof initAuthForms === "function") {
      console.log("Router: Calling initAuthForms for hash", targetHash);
      initAuthForms();
    }
  }
  if (targetHash === "chronicles") {
    if (typeof window.loadChronicles === "function") window.loadChronicles();
  }
  if (targetHash === "games") {
    if (typeof window.loadGames === "function") window.loadGames();
  }
  if (targetHash === "game") {
    console.log("Router: game route detected, initializing game view");
    if (typeof window.initGame === "function") {
      window.initGame();
    } else {
      console.warn("Router: initGame() is not defined on window");
    }
  }

  if (targetHash === "combat-tracker") {
    if (typeof window.initCombatTracker === "function") {
      window.initCombatTracker();
    }
  }

  setActiveSidebarItem(baseHash);

  // Handle Sidebar Responsive State
  updateSidebarResponsiveState();

  // Update guards
  __currentRoute = targetHash;
  __lastRenderedPath = path;
}

// 4) Initialize app on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Router: DOMContentLoaded");
  await bootstrapRecoverySessionFromHash();
  applyStoredTheme();
  applyStoredFont();

  // Initial Sidebar Check
  updateSidebarResponsiveState();
  window.addEventListener("resize", updateSidebarResponsiveState);

  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log(
    "Router: Initial session check ->",
    session ? "LOGGED IN" : "NO SESSION",
  );

  sessionReady = true;
  currentSession = session;

  await updateSidebar();
  __lastUserId = currentSession?.user?.id || null;
  await loadRoute(true);

  // Sidebar collapse/expand control
  const sidebarToggle = document.getElementById("sidebar-toggle");
  if (sidebarToggle && !sidebarToggle._init) {
    sidebarToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const sidebar = document.querySelector(".sidebar");
      if (!sidebar) return;
      const hash = window.location.hash.slice(1);
      if (hash.startsWith("active-encounter")) return;
      const isCollapsed = sidebar.classList.toggle("sidebar-slim-mode");
      localStorage.setItem(
        SIDEBAR_MODE_KEY,
        isCollapsed ? "collapsed" : "expanded",
      );
      updateSidebarToggleIcon(sidebar);
    });
    sidebarToggle._init = true;
  }

  // Theme and font modal
  initAppThemeModal();

  // Password reset modal (for email recovery links)
  initPasswordResetModal();

  // If PASSWORD_RECOVERY fired before DOMContentLoaded finished, show the modal now
  if (__pendingPasswordRecovery) {
    __pendingPasswordRecovery = false;
    if (window.__showPasswordResetModal) window.__showPasswordResetModal();
  }

  // Logout link handler
  const logoutLink = document.getElementById("logout-link");
  if (logoutLink && !logoutLink._init) {
    logoutLink.addEventListener("click", async (e) => {
      e.preventDefault();
      if (confirm("¿Deseas cerrar sesión?")) {
        await supabase.auth.signOut();
        window.location.hash = "welcome";
      }
    });
    logoutLink._init = true;
  }

  // Easter Egg: Decorative Sigil Click
  const easterEggLi = document.querySelector(".nav li.grabado");
  if (easterEggLi) {
    const symbols = ["`", "w", "~"];
    easterEggLi.addEventListener("click", () => {
      // Pick a random symbol or cycle? User said "cycle", but random might be fun too.
      // User said "vaya ciclando... entre varios... 4, 5 etc". Let's do random from a set or cycle.
      // Let's do cycle to be safe based on "ciclando".
      const current = easterEggLi.textContent;
      let idx = symbols.indexOf(current);
      if (idx === -1) idx = 0;
      const next = symbols[(idx + 1) % symbols.length];
      easterEggLi.textContent = next;
    });
  }
});

// 5) Handle hash changes
window.addEventListener("hashchange", async () => {
  await updateSidebar();
  await loadRoute(false);
});

// 6) Password Reset Modal logic
function initPasswordResetModal() {
  const modal = document.getElementById("password-reset-modal");
  const inputPw = document.getElementById("pw-reset-input");
  const inputConfirm = document.getElementById("pw-reset-confirm");
  const msg = document.getElementById("pw-reset-msg");
  const saveBtn = document.getElementById("pw-reset-save");
  const cancelBtn = document.getElementById("pw-reset-cancel");

  if (!modal || !inputPw || !inputConfirm || !msg || !saveBtn || !cancelBtn) return;

  function showModal() {
    inputPw.value = "";
    inputConfirm.value = "";
    msg.textContent = "";
    msg.style.color = "var(--theme-accent, #C62828)";
    modal.style.display = "flex";
    inputPw.focus();
  }

  function hideModal() {
    modal.style.display = "none";
    inputPw.value = "";
    inputConfirm.value = "";
    msg.textContent = "";
  }

  cancelBtn.addEventListener("click", hideModal);

  modal.addEventListener("click", (e) => {
    if (e.target === modal) hideModal();
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal.style.display !== "none") hideModal();
  });

  saveBtn.addEventListener("click", async () => {
    const pw = inputPw.value;
    const confirm = inputConfirm.value;

    // Validate password strength
    const validation = window.validatePassword(pw);
    if (!validation.ok) {
      msg.style.color = "var(--theme-accent, #C62828)";
      msg.textContent = validation.msg;
      return;
    }

    // Check passwords match
    if (pw !== confirm) {
      msg.style.color = "var(--theme-accent, #C62828)";
      msg.textContent = "Las contraseñas no coinciden.";
      return;
    }

    saveBtn.disabled = true;
    cancelBtn.disabled = true;
    msg.style.color = "var(--theme-text-secondary, #6E6E70)";
    msg.textContent = "Guardando...";

    try {
      const { error } = await supabase.auth.updateUser({ password: pw });
      if (error) throw error;

      msg.style.color = "var(--theme-success, #6E9E6E)";
      msg.textContent = "¡Contraseña actualizada!";
      setTimeout(hideModal, 1500);
    } catch (err) {
      msg.style.color = "var(--theme-accent, #C62828)";
      msg.textContent = err.message || "Error al actualizar la contraseña.";
    } finally {
      saveBtn.disabled = false;
      cancelBtn.disabled = false;
    }
  });

  // Allow Enter key to submit
  inputConfirm.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); }
  });
  inputPw.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); inputConfirm.focus(); }
  });

  // Expose show function globally for the auth state change handler
  window.__showPasswordResetModal = showModal;
}

// 7) React to auth state changes in other tabs
supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;

  // Handle password recovery flow — must run even before sessionReady,
  // because Supabase fires PASSWORD_RECOVERY early when processing the URL token.
  if (event === "PASSWORD_RECOVERY") {
    console.log("Router: PASSWORD_RECOVERY detected, showing reset modal");
    if (window.__showPasswordResetModal) {
      window.__showPasswordResetModal();
    } else {
      // Modal not initialized yet (DOMContentLoaded hasn't finished), queue it
      console.log("Router: Modal not ready, queuing PASSWORD_RECOVERY");
      __pendingPasswordRecovery = true;
    }
    return; // Don't reroute during password recovery
  }

  if (!sessionReady) return;

  const newUid = session?.user?.id || null;
  // Only force reroute when the authenticated user changes (login/logout),
  // not on background token refreshes
  if (newUid !== __lastUserId) {
    __lastUserId = newUid;
    updateSidebar();
    loadRoute(true);
  } else {
    // Token refresh: update UI bits but avoid rerendering the whole view
    updateSidebar();
  }
});
