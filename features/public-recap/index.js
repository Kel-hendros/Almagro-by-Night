(function initPublicRecapFeature(global) {
  const ns = (global.ABNPublicRecap = global.ABNPublicRecap || {});

  global.loadPublicRecap = async function loadPublicRecap() {
    return ns.controller?.initPage?.();
  };
})(window);
