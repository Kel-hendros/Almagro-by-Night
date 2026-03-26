// Dedicated light occlusion logic.
// Uses dense angular raycasting so light edges follow the circle/radius,
// independently from fog visibility polygons.
(function initAELightVisibilityModule(global) {
  "use strict";

  var FULL_TURN = Math.PI * 2;
  var DEFAULT_RAY_COUNT = 720;
  var WALL_OCCLUSION_THICKNESS = 0.22;

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

  function appendWallOccluderSegments(list, wall) {
    if (!wall) return;
    var ax = parseFloat(wall.x1);
    var ay = parseFloat(wall.y1);
    var bx = parseFloat(wall.x2);
    var by = parseFloat(wall.y2);
    if (![ax, ay, bx, by].every(Number.isFinite)) return;

    var dx = bx - ax;
    var dy = by - ay;
    var len = Math.sqrt(dx * dx + dy * dy);
    if (len < 1e-6) return;

    var half = WALL_OCCLUSION_THICKNESS * 0.5;
    var nx = (-dy / len) * half;
    var ny = (dx / len) * half;

    var p1 = { x: ax + nx, y: ay + ny };
    var p2 = { x: bx + nx, y: by + ny };
    var p3 = { x: bx - nx, y: by - ny };
    var p4 = { x: ax - nx, y: ay - ny };

    list.push({ ax: p1.x, ay: p1.y, bx: p2.x, by: p2.y });
    list.push({ ax: p2.x, ay: p2.y, bx: p3.x, by: p3.y });
    list.push({ ax: p3.x, ay: p3.y, bx: p4.x, by: p4.y });
    list.push({ ax: p4.x, ay: p4.y, bx: p1.x, by: p1.y });
  }

  function computeLightPolygon(ox, oy, walls, radius, rayCount) {
    var segments = [];
    var points = [];
    var rays = Math.max(64, rayCount || DEFAULT_RAY_COUNT);

    for (var i = 0; i < (walls || []).length; i++) {
      var wall = walls[i];
      if (!blocksLight(wall)) continue;
      appendWallOccluderSegments(segments, wall);
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
