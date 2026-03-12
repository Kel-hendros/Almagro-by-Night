(function initLegacyCharacterSheetBootstrap(global) {
  const CACHE_PREFIX = "abn-sheet:";

  function cacheKey(id) {
    return CACHE_PREFIX + id;
  }

  function readCache(id) {
    try {
      const raw = sessionStorage.getItem(cacheKey(id));
      if (!raw) return null;
      return JSON.parse(raw);
    } catch {
      return null;
    }
  }

  function writeCache(id, sheet) {
    try {
      sessionStorage.setItem(cacheKey(id), JSON.stringify(sheet));
    } catch {
      // sessionStorage full — ignore
    }
  }

  function clearCache(id) {
    try {
      sessionStorage.removeItem(cacheKey(id));
    } catch {
      // ignore
    }
  }

  async function run(options) {
    const {
      supabaseClient,
      onBeforeLoad,
      onUserMissing,
      onSheetIdMissing,
      onSheetLoaded,
      onSheetNotFound,
      onError,
    } = options || {};

    try {
      if (typeof onBeforeLoad === "function") {
        onBeforeLoad();
      }

      let user = null;
      if (typeof global.abnGetCurrentUser === "function") {
        const { user: resolvedUser } = await global.abnGetCurrentUser({
          retries: 2,
          delayMs: 120,
        });
        user = resolvedUser || null;
      } else {
        const {
          data: { user: directUser },
        } = await supabaseClient.auth.getUser();
        user = directUser || null;
      }

      if (!user) {
        if (typeof onUserMissing === "function") onUserMissing();
        return;
      }

      const urlParams = new URLSearchParams(window.location.search);
      const id = urlParams.get("id");

      if (!id) {
        if (typeof onSheetIdMissing === "function") onSheetIdMissing();
        return;
      }

      // Try cached snapshot first for instant load
      const cached = readCache(id);
      if (cached && typeof onSheetLoaded === "function") {
        onSheetLoaded({ id, sheet: cached, user, fromCache: true });
        return;
      }

      const { data, error } = await supabaseClient
        .from("character_sheets")
        .select("*")
        .eq("id", id)
        .single();

      if (error || !data) {
        if (typeof onSheetNotFound === "function") {
          onSheetNotFound({ id, error });
        }
        return;
      }

      if (typeof onSheetLoaded === "function") {
        onSheetLoaded({ id, sheet: data, user, fromCache: false });
      }
    } catch (error) {
      if (typeof onError === "function") {
        onError(error);
      } else {
        console.error("Legacy sheet bootstrap error:", error);
      }
    }
  }

  global.legacyCharacterSheetBootstrap = {
    run,
    writeCache,
    readCache,
    clearCache,
  };
})(window);
