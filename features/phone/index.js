/**
 * Phone Feature — In-game SMS messaging between characters.
 * Global feature (like notifications): always loaded, no dedicated route.
 */
(function initPhoneFeature(global) {
  var ns = (global.ABNPhone = global.ABNPhone || {});

  // The feature is ready once service + view + controller are loaded.
  // No auto-connect needed — opened on demand via controller methods.
})(window);
