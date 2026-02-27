(function initActiveSessionFeature(global) {
  const ns = (global.ABNActiveSession = global.ABNActiveSession || {});

  async function loadActiveSession() {
    if (!ns.controller?.initPage) return;
    await ns.controller.initPage();
  }

  global.loadActiveSession = loadActiveSession;
  loadActiveSession();
})(window);
