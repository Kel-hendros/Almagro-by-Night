(function initDocumentArchiveFeature(global) {
  const ns = (global.ABNDocumentArchive = global.ABNDocumentArchive || {});

  async function loadDocumentArchive() {
    if (!ns.controller?.initPage) return;
    await ns.controller.initPage();
  }

  global.loadDocumentArchive = loadDocumentArchive;
  loadDocumentArchive();
})(window);
