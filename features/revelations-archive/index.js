(function initRevelationsArchiveFeature(global) {
  const ns = (global.ABNRevelationsArchive = global.ABNRevelationsArchive || {});

  async function loadRevelationsArchive() {
    if (!ns.controller?.initPage) return;
    await ns.controller.initPage();
  }

  global.loadRevelationsArchive = loadRevelationsArchive;
  loadRevelationsArchive();
})(window);
