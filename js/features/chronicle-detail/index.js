(function initChronicleDetailFeature(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  async function loadChronicleDetail() {
    if (!ns.controller?.initPage) return;
    await ns.controller.initPage();
  }

  // Router/fragment bootstrap compatibility
  global.loadChronicleDetail = loadChronicleDetail;

  // The chronicle detail fragment loads this script directly.
  loadChronicleDetail();
})(window);

