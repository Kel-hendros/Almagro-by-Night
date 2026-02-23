(function initABNSheetLoader(global) {
  const deps = {
    supabaseClient: null,
    onBeforeLoad: null,
    onUserMissing: null,
    onSheetIdMissing: null,
    onSheetLoaded: null,
    onSheetNotFound: null,
    onError: null,
  };

  function configure(nextDeps = {}) {
    deps.supabaseClient = nextDeps.supabaseClient || null;
    deps.onBeforeLoad =
      typeof nextDeps.onBeforeLoad === "function" ? nextDeps.onBeforeLoad : null;
    deps.onUserMissing =
      typeof nextDeps.onUserMissing === "function" ? nextDeps.onUserMissing : null;
    deps.onSheetIdMissing =
      typeof nextDeps.onSheetIdMissing === "function" ? nextDeps.onSheetIdMissing : null;
    deps.onSheetLoaded =
      typeof nextDeps.onSheetLoaded === "function" ? nextDeps.onSheetLoaded : null;
    deps.onSheetNotFound =
      typeof nextDeps.onSheetNotFound === "function" ? nextDeps.onSheetNotFound : null;
    deps.onError = typeof nextDeps.onError === "function" ? nextDeps.onError : null;
  }

  function init() {
    if (!global.legacyCharacterSheetBootstrap?.run || !deps.supabaseClient) return;
    global.legacyCharacterSheetBootstrap.run({
      supabaseClient: deps.supabaseClient,
      onBeforeLoad: deps.onBeforeLoad,
      onUserMissing: deps.onUserMissing,
      onSheetIdMissing: deps.onSheetIdMissing,
      onSheetLoaded: deps.onSheetLoaded,
      onSheetNotFound: deps.onSheetNotFound,
      onError: deps.onError,
    });
  }

  global.ABNSheetLoader = {
    configure,
    init,
  };
})(window);
