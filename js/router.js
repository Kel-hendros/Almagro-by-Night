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

    // Check Admin for Tools Menu - NOW OPEN FOR ALL AUTHENTICATED USERS
    const liTools = document.getElementById("menu-tools");
    if (liTools) {
      liTools.classList.remove("hidden");
    }
    const liChars = document.getElementById("menu-chars");
    if (liChars) {
      liChars.classList.remove("hidden");
    }
  } else {
    liWelcome?.classList.remove("hidden");
    liUser?.classList.add("hidden");
    liGames?.classList.add("hidden");
    liLogout?.classList.add("hidden");
    document.getElementById("menu-tools")?.classList.add("hidden");
    document.getElementById("menu-chars")?.classList.add("hidden");
  }
}

// 2) Define routes mapping hashes to fragment URLs
const routes = {
  welcome: "fragments/login.html",
  games: "fragments/games.html",
  game: "fragments/game.html",
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
  if (!session && (baseHash === "games" || baseHash === "game")) {
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
        newScript.setAttribute(attr.name, attr.value)
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
  contentEl.querySelectorAll("script").forEach((s) => eval(s.textContent));

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

  // Update guards
  __currentRoute = targetHash;
  __lastRenderedPath = path;
}

// 4) Initialize app on DOMContentLoaded
document.addEventListener("DOMContentLoaded", async () => {
  console.log("Router: DOMContentLoaded");

  const {
    data: { session },
  } = await supabase.auth.getSession();
  console.log(
    "Router: Initial session check ->",
    session ? "LOGGED IN" : "NO SESSION"
  );

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
