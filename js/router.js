// js/router.js

let sessionReady = false;
let currentSession = null;

// Route/render guards
let __currentRoute = null;
let __lastRenderedPath = null;
let __lastUserId = null;

// 1) Update the sidebar based on session state
async function updateSidebar() {
  const liLogout = document.getElementById("menu-logout");
  const liWelcome = document.getElementById("menu-welcome");
  const liUser = document.getElementById("menu-user");
  const liGames = document.getElementById("menu-games");
  const spanName = document.getElementById("user-name");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (session) {
    liWelcome?.classList.add("hidden");
    liUser?.classList.remove("hidden");
    liGames?.classList.remove("hidden");
    liLogout?.classList.remove("hidden");
    const name = session.user.user_metadata?.full_name || session.user.email;
    if (spanName) spanName.textContent = name;
  } else {
    liWelcome?.classList.remove("hidden");
    liUser?.classList.add("hidden");
    liGames?.classList.add("hidden");
    liLogout?.classList.add("hidden");
  }
}

// 2) Define routes mapping hashes to fragment URLs
const routes = {
  welcome: "fragments/login.html",
  games: "fragments/games.html",
  game: "fragments/game.html",
};

// 3) Core routing function
async function loadRoute(force = false) {
  if (!sessionReady) return; // wait until session is initialized

  const rawHash = window.location.hash.slice(1) || "welcome";
  const session = currentSession;

  // Redirect resolution (compute target hash without causing loops)
  let targetHash = rawHash;
  if (session && (rawHash === "welcome" || rawHash === "login")) {
    targetHash = "games";
  } else if (!session && (rawHash === "games" || rawHash === "game")) {
    targetHash = "welcome";
  }

  // If the hash should change due to redirect, change it (only if different) and bail; hashchange will re-enter
  if (targetHash !== rawHash) {
    if (window.location.hash !== `#${targetHash}`) {
      window.location.hash = targetHash;
    }
    return;
  }

  const path = routes[targetHash] || routes.welcome;

  // Guard: avoid redundant rerenders of the exact same route/path when not forced
  if (!force && __currentRoute === targetHash && __lastRenderedPath === path) {
    return;
  }

  const contentEl = document.getElementById("content");
  try {
    const res = await fetch(path);
    contentEl.innerHTML = await res.text();
    if (window.lucide?.createIcons) lucide.createIcons();
  } catch (e) {
    contentEl.innerHTML = "<p>Error al cargar la sección.</p>";
  }

  // Execute any embedded <script> tags in the fragment
  contentEl.querySelectorAll("script").forEach((s) => eval(s.textContent));

  // View-specific initialization
  if (targetHash === "welcome") {
    if (typeof initAuthTabs === "function") initAuthTabs();
    if (typeof initAuthForms === "function") initAuthForms();
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

  // Update guards
  __currentRoute = targetHash;
  __lastRenderedPath = path;
}

// 4) Initialize app on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  sessionReady = true;
  currentSession = session;

  await updateSidebar();
  __lastUserId = currentSession?.user?.id || null;
  await loadRoute(true);

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
});

// 5) React to hash changes
window.addEventListener("hashchange", async () => {
  await updateSidebar();
  await loadRoute(false);
});

// 6) React to auth state changes in other tabs
supabase.auth.onAuthStateChange((event, session) => {
  currentSession = session;
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
