// Dashboard heartbeat — sends a ping every 60s while the tab is visible,
// buffers them, and flushes via the dash_log_pings RPC every ~5 pings or
// when the tab is hidden. Local/dev hostnames are skipped so they don't
// pollute production analytics.

(function () {
  var TICK_MS = 60 * 1000;
  var FLUSH_AT = 5;

  if (isLocalHost()) {
    return;
  }

  var buffer = [];
  var ticker = null;
  var started = false;

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden" && buffer.length > 0) {
      flush();
    }
  });

  // Wait for supabase + auth before starting.
  waitForAuth().then(function () {
    if (started) return;
    started = true;
    ticker = setInterval(tick, TICK_MS);
    tick();
  });

  function tick() {
    if (document.visibilityState !== "visible") return;
    if (!window.supabase) return;

    buffer.push({
      route: window.location.hash || "#",
      chronicle_id: localStorage.getItem("currentChronicleId") || "",
      pinged_at: new Date().toISOString(),
    });

    if (buffer.length >= FLUSH_AT) {
      flush();
    }
  }

  async function flush() {
    if (!window.supabase || buffer.length === 0) return;
    var payload = buffer.splice(0, buffer.length);
    try {
      await window.supabase.rpc("dash_log_pings", { p_pings: payload });
    } catch (err) {
      console.warn("dash-heartbeat: flush failed", err);
    }
  }

  function waitForAuth() {
    return new Promise(function (resolve) {
      var attempts = 0;
      function check() {
        attempts++;
        if (window.supabase && typeof window.supabase.auth?.getSession === "function") {
          window.supabase.auth.getSession().then(function (res) {
            if (res?.data?.session) {
              resolve();
            } else {
              window.supabase.auth.onAuthStateChange(function (_event, session) {
                if (session) resolve();
              });
            }
          });
        } else if (attempts < 50) {
          setTimeout(check, 200);
        }
      }
      check();
    });
  }

  function isLocalHost() {
    if (location.protocol === "file:") return true;
    var h = location.hostname || "";
    if (h === "localhost" || h === "127.0.0.1" || h === "0.0.0.0" || h === "::1") return true;
    if (h.endsWith(".local")) return true;
    if (/^192\.168\./.test(h)) return true;
    if (/^10\./.test(h)) return true;
    if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
    return false;
  }
})();
