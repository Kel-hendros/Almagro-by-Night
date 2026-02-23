(function initChroniclesFeature(global) {
  const ns = (global.ABNChronicles = global.ABNChronicles || {});

  async function loadChronicles() {
    if (!ns.controller?.initPage) return;
    await ns.controller.initPage();
  }

  /* Router compatibility */
  global.loadChronicles = loadChronicles;
})(window);

