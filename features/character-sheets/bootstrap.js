(function initLegacyCharacterSheetBootstrap(global) {
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
        onSheetLoaded({ id, sheet: data, user });
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
  };
})(window);
