// js/router.js

let sessionReady = false;
let currentSession = null;
const SIDEBAR_MODE_KEY = "abn_sidebar_mode";
const APP_THEME_KEY = "abn_theme";

// Route/render guards
let __currentRoute = null;
let __lastRenderedPath = null;
let __lastUserId = null;

function applyStoredTheme() {
  const stored = localStorage.getItem(APP_THEME_KEY) || "dark";
  document.documentElement.setAttribute("data-app-theme", stored);
}

function updateSidebarToggleIcon(sidebar) {
  const toggleIcon = document.querySelector("#sidebar-toggle i");
  if (!toggleIcon || !sidebar) return;
  const isSlim = sidebar.classList.contains("sidebar-slim-mode");
  toggleIcon.setAttribute(
    "data-lucide",
    isSlim ? "panel-left-open" : "panel-left-close",
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
  const useFlatThemeBackground = baseHash === "settings";
  contentShell.classList.toggle("content-theme-bg-only", useFlatThemeBackground);
}

// Helper: Update Sidebar based on width OR route
function updateSidebarResponsiveState() {
  const sidebar = document.querySelector(".sidebar");
  if (!sidebar) return;

  const isSmallScreen = window.matchMedia("(max-width: 1400px)").matches;
  // Use current hash or global __currentRoute
  const hash = window.location.hash.slice(1);
  const isForcedMode = hash.startsWith("active-encounter");
  const storedMode = localStorage.getItem(SIDEBAR_MODE_KEY);

  if (isSmallScreen || isForcedMode) {
    sidebar.classList.add("sidebar-slim-mode");
  } else {
    if (storedMode === "collapsed") {
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
  "combat-tracker": "fragments/combat-tracker.html",
  "active-encounter": "fragments/active-encounter.html",
  "temporal-codex": "fragments/temporal-codex.html",
};

// 3) Core routing function
async function loadRoute(force = false) {
  if (!sessionReady) return; // wait until session is initialized

  const rawHash = window.location.hash.slice(1) || "welcome";
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
      baseHash === "settings")
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
  applyStoredTheme();

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
      const isSmallScreen = window.matchMedia("(max-width: 1400px)").matches;
      if (isSmallScreen) return;
      const sidebar = document.querySelector(".sidebar");
      if (!sidebar) return;
      const isCollapsed = sidebar.classList.toggle("sidebar-slim-mode");
      localStorage.setItem(
        SIDEBAR_MODE_KEY,
        isCollapsed ? "collapsed" : "expanded",
      );
      updateSidebarToggleIcon(sidebar);
    });
    sidebarToggle._init = true;
  }

  // Theme control (Dark default)
  const themeToggle = document.getElementById("theme-toggle");
  if (themeToggle && !themeToggle._init) {
    themeToggle.addEventListener("click", (e) => {
      e.preventDefault();
      const currentTheme =
        document.documentElement.getAttribute("data-app-theme") || "dark";
      const nextTheme = currentTheme === "dark" ? "light" : "dark";
      document.documentElement.setAttribute("data-app-theme", nextTheme);
      localStorage.setItem(APP_THEME_KEY, nextTheme);
    });
    themeToggle._init = true;
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
