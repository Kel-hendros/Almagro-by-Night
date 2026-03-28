// Wall Alignment Guides
// Renders visual alignment guides during wall drawing and editing.
(function initWallGuidesModule(global) {
  "use strict";

  var GUIDE_COLORS = {
    horizontal: "rgba(100, 200, 255, 0.5)",
    vertical: "rgba(100, 200, 255, 0.5)",
    angle: "rgba(197, 160, 89, 0.5)",
    length: "rgba(150, 230, 150, 0.5)",
  };

  /**
   * Create a wall guides renderer instance.
   */
  function createWallGuides() {
    var activeGuides = [];

    /**
     * Set guides to render.
     * @param {Array} guides - array of guide objects
     *   { type: "h"|"v"|"angle"|"length", x1, y1, x2, y2, [label] }
     */
    function setGuides(guides) {
      activeGuides = guides || [];
    }

    /**
     * Clear all guides.
     */
    function clearGuides() {
      activeGuides = [];
    }

    /**
     * Get current guides.
     */
    function getGuides() {
      return activeGuides.slice();
    }

    /**
     * Add a single guide.
     */
    function addGuide(guide) {
      activeGuides.push(guide);
    }

    /**
     * Generate guides from snap result.
     */
    function fromSnapResult(snapResult, cellX, cellY) {
      if (!snapResult || !snapResult.guides) return [];

      var guides = [];
      for (var i = 0; i < snapResult.guides.length; i++) {
        var g = snapResult.guides[i];
        guides.push({
          type: g.x1 === g.x2 ? "v" : "h",
          x1: g.x1,
          y1: g.y1,
          x2: g.x2,
          y2: g.y2,
        });
      }
      return guides;
    }

    /**
     * Render guides to canvas context.
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} gridSize - pixels per grid unit
     * @param {number} scale - current zoom scale
     * @param {Object} viewport - { left, top, right, bottom } in grid units
     */
    function render(ctx, gridSize, scale, viewport) {
      if (!activeGuides.length) return;

      ctx.save();
      ctx.setLineDash([4 / Math.max(scale, 0.5), 4 / Math.max(scale, 0.5)]);
      ctx.lineWidth = 1 / Math.max(scale, 0.5);

      for (var i = 0; i < activeGuides.length; i++) {
        var guide = activeGuides[i];
        var color;

        switch (guide.type) {
          case "h":
          case "horizontal":
            color = GUIDE_COLORS.horizontal;
            break;
          case "v":
          case "vertical":
            color = GUIDE_COLORS.vertical;
            break;
          case "angle":
            color = GUIDE_COLORS.angle;
            break;
          case "length":
            color = GUIDE_COLORS.length;
            break;
          default:
            color = GUIDE_COLORS.horizontal;
        }

        ctx.strokeStyle = color;

        // Clamp guide lines to viewport for performance
        var x1 = guide.x1;
        var y1 = guide.y1;
        var x2 = guide.x2;
        var y2 = guide.y2;

        if (viewport) {
          // Extend horizontal guides across viewport
          if (y1 === y2) {
            x1 = Math.min(viewport.left - 5, x1);
            x2 = Math.max(viewport.right + 5, x2);
          }
          // Extend vertical guides across viewport
          if (x1 === x2) {
            y1 = Math.min(viewport.top - 5, y1);
            y2 = Math.max(viewport.bottom + 5, y2);
          }
        }

        ctx.beginPath();
        ctx.moveTo(x1 * gridSize, y1 * gridSize);
        ctx.lineTo(x2 * gridSize, y2 * gridSize);
        ctx.stroke();

        // Draw label if present
        if (guide.label) {
          var midX = ((x1 + x2) / 2) * gridSize;
          var midY = ((y1 + y2) / 2) * gridSize;

          ctx.save();
          ctx.setLineDash([]);
          ctx.font = Math.round(10 / Math.max(scale, 0.5)) + "px sans-serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "bottom";
          ctx.fillStyle = color;
          ctx.fillText(guide.label, midX, midY - 4 / Math.max(scale, 0.5));
          ctx.restore();
        }
      }

      ctx.setLineDash([]);
      ctx.restore();
    }

    /**
     * Create angle guide from origin to point.
     */
    function createAngleGuide(originX, originY, targetX, targetY, angle) {
      var dx = targetX - originX;
      var dy = targetY - originY;
      var dist = Math.sqrt(dx * dx + dy * dy);

      // Extend guide line beyond target
      var extendDist = dist * 1.5;
      var radians = angle * (Math.PI / 180);

      return {
        type: "angle",
        x1: originX,
        y1: originY,
        x2: originX + Math.cos(radians) * extendDist,
        y2: originY + Math.sin(radians) * extendDist,
        label: angle + "\u00B0",
      };
    }

    /**
     * Create length guide from origin to point.
     */
    function createLengthGuide(originX, originY, targetX, targetY, lengthMeters) {
      return {
        type: "length",
        x1: originX,
        y1: originY,
        x2: targetX,
        y2: targetY,
        label: lengthMeters + "m",
      };
    }

    /**
     * Create horizontal alignment guide.
     */
    function createHorizontalGuide(y, refX, targetX) {
      return {
        type: "h",
        x1: Math.min(refX, targetX) - 100,
        y1: y,
        x2: Math.max(refX, targetX) + 100,
        y2: y,
      };
    }

    /**
     * Create vertical alignment guide.
     */
    function createVerticalGuide(x, refY, targetY) {
      return {
        type: "v",
        x1: x,
        y1: Math.min(refY, targetY) - 100,
        x2: x,
        y2: Math.max(refY, targetY) + 100,
      };
    }

    return {
      setGuides: setGuides,
      clearGuides: clearGuides,
      getGuides: getGuides,
      addGuide: addGuide,
      fromSnapResult: fromSnapResult,
      render: render,

      // Guide creators
      createAngleGuide: createAngleGuide,
      createLengthGuide: createLengthGuide,
      createHorizontalGuide: createHorizontalGuide,
      createVerticalGuide: createVerticalGuide,
    };
  }

  global.WallGuides = {
    createWallGuides: createWallGuides,
    GUIDE_COLORS: GUIDE_COLORS,
  };
})(window);
