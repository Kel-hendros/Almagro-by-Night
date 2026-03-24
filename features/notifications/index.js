/**
 * Notification System — Bootstrap
 * Global feature, no route. Connected/disconnected from router.js.
 */
(function initNotificationsFeature(global) {
  var ns = (global.ABNNotifications = global.ABNNotifications || {});

  // Wire bell button click
  document.addEventListener("click", function (e) {
    var bell = e.target.closest("#notifications-bell");
    if (bell) {
      e.preventDefault();
      if (ns.controller) ns.controller.toggleDrawer();
    }
  });
})(window);
