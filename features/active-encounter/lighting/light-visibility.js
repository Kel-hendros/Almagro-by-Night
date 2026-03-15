// Dedicated light occlusion logic.
// Uses dense angular raycasting so light edges follow the circle/radius,
// independently from fog visibility polygons.
(function initAELightVisibilityModule(global) {
  "use strict";

  var FULL_TURN = Math.PI * 2;
  var DEFAULT_RAY_COUNT = 720;

  function blocksLight(wall) {
    if ((wall.type === "door" || wall.type === "window") && wall.doorOpen) return false;
    return true;
  }

  function raySegmentIntersect(ox, oy, dx, dy, ax, ay, bx, by) {
    var sx = bx - ax;
    var sy = by - ay;
    var denom = dx * sy - dy * sx;
    if (Math.abs(denom) < 1e-10) return null;

    var t = ((ax - ox) * sy - (ay - oy) * sx) / denom;
    var u = ((ax - ox) * dy - (ay - oy) * dx) / denom;
    if (t < 0 || u < 0 || u > 1) return null;

    return { t: t, x: ox + dx * t, y: oy + dy * t };
  }

  function computeLightPolygon(ox, oy, walls, radius, rayCount) {
    var segments = [];
    var points = [];
    var rays = Math.max(64, rayCount || DEFAULT_RAY_COUNT);

    for (var i = 0; i < (walls || []).length; i++) {
      var wall = walls[i];
      if (!blocksLight(wall)) continue;
      segments.push({ ax: wall.x1, ay: wall.y1, bx: wall.x2, by: wall.y2 });
    }

    for (var ri = 0; ri < rays; ri++) {
      var angle = (ri / rays) * FULL_TURN;
      var dx = Math.cos(angle);
      var dy = Math.sin(angle);
      var closestT = radius;
      var closestX = ox + dx * radius;
      var closestY = oy + dy * radius;

      for (var si = 0; si < segments.length; si++) {
        var hit = raySegmentIntersect(
          ox, oy, dx, dy,
          segments[si].ax, segments[si].ay, segments[si].bx, segments[si].by
        );
        if (hit && hit.t < closestT && hit.t > 0) {
          closestT = hit.t;
          closestX = hit.x;
          closestY = hit.y;
        }
      }

      points.push({ x: closestX, y: closestY });
    }

    return points;
  }

  global.AELightVisibility = {
    computeLightPolygon: computeLightPolygon,
    blocksLight: blocksLight,
  };
})(window);
