// Procedural tile texture generation for the encounter grid.
// Each texture draws a 50x50 tile on an offscreen canvas and returns a CanvasPattern.
(function initTileTexturesModule(global) {
  const TILE_SIZE = 50;
  const patternCache = new Map();

  // Seeded pseudo-random for deterministic textures.
  function mulberry32(seed) {
    let s = seed | 0;
    return function () {
      s = (s + 0x6d2b79f5) | 0;
      let t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function createTileCanvas() {
    const c = document.createElement("canvas");
    c.width = TILE_SIZE;
    c.height = TILE_SIZE;
    return c;
  }

  function fillWholeCanvas(ctx, fillStyle) {
    ctx.fillStyle = fillStyle;
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
  }

  function scatterSpeckles(ctx, rand, count, minSize, maxSize, colorFactory) {
    for (let i = 0; i < count; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const size = minSize + rand() * (maxSize - minSize);
      ctx.fillStyle = colorFactory(rand, i);
      ctx.fillRect(x, y, size, size);
    }
  }

  function drawCracks(ctx, rand, count, colorFactory) {
    for (let i = 0; i < count; i++) {
      const startX = rand() * TILE_SIZE;
      const startY = rand() * TILE_SIZE;
      ctx.strokeStyle = colorFactory(rand, i);
      ctx.lineWidth = 0.4 + rand() * 0.6;
      ctx.beginPath();
      ctx.moveTo(startX, startY);
      let currentX = startX;
      let currentY = startY;
      const segments = 2 + Math.floor(rand() * 3);
      for (let s = 0; s < segments; s++) {
        currentX += (rand() - 0.5) * 14;
        currentY += (rand() - 0.5) * 14;
        ctx.lineTo(currentX, currentY);
      }
      ctx.stroke();
    }
  }

  function drawWrapped(ctx, x, y, padding, drawFn) {
    const offsetsX = [0];
    const offsetsY = [0];
    if (x < padding) offsetsX.push(TILE_SIZE);
    if (x > TILE_SIZE - padding) offsetsX.push(-TILE_SIZE);
    if (y < padding) offsetsY.push(TILE_SIZE);
    if (y > TILE_SIZE - padding) offsetsY.push(-TILE_SIZE);

    offsetsX.forEach(function (offsetX) {
      offsetsY.forEach(function (offsetY) {
        drawFn(ctx, x + offsetX, y + offsetY);
      });
    });
  }

  // ---- Texture drawing functions ----

  function drawGrass(ctx) {
    const rand = mulberry32(42);
    fillWholeCanvas(ctx, "#356a30");
    for (let i = 0; i < 12; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 7 + rand() * 8;
      const radiusY = 4 + rand() * 6;
      const rotation = rand() * Math.PI;
      const fillStyle = `rgba(${56 + Math.floor(rand() * 30)}, ${74 + Math.floor(rand() * 40)}, ${32 + Math.floor(rand() * 24)}, 0.16)`;
      drawWrapped(ctx, x, y, Math.max(radiusX, radiusY), function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = fillStyle;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rotation, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }
    for (let i = 0; i < 120; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const h = 4 + rand() * 8;
      const shade = 28 + Math.floor(rand() * 55);
      const sway = (rand() - 0.5) * 3;
      const strokeStyle = `rgba(${shade}, ${88 + Math.floor(rand() * 80)}, ${24 + Math.floor(rand() * 25)}, ${0.32 + rand() * 0.3})`;
      const lineWidth = 0.8 + rand() * 0.6;
      drawWrapped(ctx, x, y, h + 2, function (targetCtx, drawX, drawY) {
        targetCtx.strokeStyle = strokeStyle;
        targetCtx.lineWidth = lineWidth;
        targetCtx.beginPath();
        targetCtx.moveTo(drawX, drawY);
        targetCtx.lineTo(drawX + sway, drawY - h);
        targetCtx.stroke();
      });
    }
    scatterSpeckles(ctx, rand, 70, 0.6, 1.8, function () {
      return `rgba(${70 + Math.floor(rand() * 30)}, ${110 + Math.floor(rand() * 40)}, ${38 + Math.floor(rand() * 22)}, 0.12)`;
    });
  }

  function drawConcrete(ctx) {
    const rand = mulberry32(77);
    fillWholeCanvas(ctx, "#888782");
    scatterSpeckles(ctx, rand, 220, 0.6, 2.8, function () {
      const gray = 105 + Math.floor(rand() * 70);
      return `rgba(${gray}, ${gray}, ${gray}, ${0.14 + rand() * 0.18})`;
    });
    for (let i = 0; i < 18; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 2 + rand() * 4.5;
      const radiusY = 1.8 + rand() * 4;
      const rotation = rand() * Math.PI;
      const tone = rand() > 0.5 ? 154 + Math.floor(rand() * 24) : 76 + Math.floor(rand() * 24);
      const alpha = 0.035 + rand() * 0.055;
      drawWrapped(ctx, x, y, Math.max(radiusX, radiusY) + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rotation, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }
    drawCracks(ctx, rand, 5, function () {
      return `rgba(${58 + Math.floor(rand() * 18)}, ${58 + Math.floor(rand() * 18)}, ${58 + Math.floor(rand() * 18)}, 0.22)`;
    });
  }

  function drawTiles(ctx) {
    fillWholeCanvas(ctx, "#97866e");
    ctx.lineWidth = 1;
    const tileW = TILE_SIZE / 2;
    const tileH = TILE_SIZE / 2;
    const rand = mulberry32(55);
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        const x = c * tileW;
        const y = r * tileH;
        ctx.fillStyle = `rgb(${146 + Math.floor(rand() * 24)}, ${130 + Math.floor(rand() * 20)}, ${108 + Math.floor(rand() * 16)})`;
        ctx.fillRect(x, y, tileW, tileH);
        const tileGradient = ctx.createLinearGradient(x, y, x + tileW, y + tileH);
        tileGradient.addColorStop(0, "rgba(255,255,255,0.04)");
        tileGradient.addColorStop(1, "rgba(0,0,0,0.08)");
        ctx.fillStyle = tileGradient;
        ctx.fillRect(x, y, tileW, tileH);
        ctx.strokeStyle = "rgba(72, 60, 48, 0.5)";
        ctx.strokeRect(c * tileW + 0.5, r * tileH + 0.5, tileW - 1, tileH - 1);
      }
    }
    scatterSpeckles(ctx, rand, 70, 0.5, 1.5, function () {
      const v = 128 + Math.floor(rand() * 48);
      return `rgba(${v}, ${v - 10}, ${v - 18}, 0.16)`;
    });
  }

  function drawDirt(ctx) {
    const rand = mulberry32(33);
    fillWholeCanvas(ctx, "#5a3922");
    for (let i = 0; i < 180; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const r = 68 + Math.floor(rand() * 42);
      const g = 42 + Math.floor(rand() * 30);
      const b = 18 + Math.floor(rand() * 20);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, ${0.18 + rand() * 0.2})`;
      const size = 1 + rand() * 3;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
    for (let i = 0; i < 20; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 2 + rand() * 5.5;
      const radiusY = 1.5 + rand() * 4.5;
      const rotation = rand() * Math.PI;
      const r = rand() > 0.55 ? 96 + Math.floor(rand() * 22) : 46 + Math.floor(rand() * 18);
      const g = rand() > 0.55 ? 58 + Math.floor(rand() * 18) : 26 + Math.floor(rand() * 12);
      const b = rand() > 0.55 ? 24 + Math.floor(rand() * 12) : 10 + Math.floor(rand() * 8);
      const alpha = 0.04 + rand() * 0.06;
      drawWrapped(ctx, x, y, Math.max(radiusX, radiusY) + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${alpha})`;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rotation, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }
    drawCracks(ctx, rand, 6, function () {
      return `rgba(${42 + Math.floor(rand() * 16)}, ${24 + Math.floor(rand() * 10)}, ${12 + Math.floor(rand() * 8)}, 0.2)`;
    });
  }

  function drawWater(ctx) {
    const rand = mulberry32(99);
    fillWholeCanvas(ctx, "#275c86");
    for (let i = 0; i < 12; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 5 + rand() * 8;
      const radiusY = 2 + rand() * 4;
      const alpha = 0.035 + rand() * 0.05;
      drawWrapped(ctx, x, y, radiusX + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = `rgba(${58 + Math.floor(rand() * 24)}, ${112 + Math.floor(rand() * 24)}, ${154 + Math.floor(rand() * 34)}, ${alpha})`;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rand() * Math.PI, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }
    for (let i = 0; i < 6; i++) {
      const y = 5 + i * 8 + rand() * 4;
      ctx.strokeStyle = `rgba(100, 170, 220, ${0.2 + rand() * 0.15})`;
      ctx.lineWidth = 1 + rand();
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.quadraticCurveTo(TILE_SIZE * 0.25, y - 2 + rand() * 4, TILE_SIZE * 0.5, y);
      ctx.quadraticCurveTo(TILE_SIZE * 0.75, y + 2 - rand() * 4, TILE_SIZE, y);
      ctx.stroke();
    }
    for (let i = 0; i < 30; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      ctx.fillStyle = `rgba(180, 220, 255, ${0.08 + rand() * 0.08})`;
      ctx.fillRect(x, y, 1 + rand() * 2, 0.5 + rand());
    }
    for (let i = 0; i < 4; i++) {
      ctx.strokeStyle = `rgba(210, 240, 255, ${0.08 + rand() * 0.08})`;
      ctx.lineWidth = 0.9 + rand() * 0.6;
      ctx.beginPath();
      const y = 8 + i * 11 + rand() * 3;
      ctx.moveTo(-4, y);
      ctx.bezierCurveTo(10, y - 2, 28, y + 3, 54, y);
      ctx.stroke();
    }
  }

  function drawWood(ctx) {
    const rand = mulberry32(66);
    const plankH = TILE_SIZE / 3;
    for (let plank = 0; plank < 3; plank++) {
      const tone = 112 + Math.floor(rand() * 18) - plank * 4;
      ctx.fillStyle = `rgb(${tone}, ${86 + Math.floor(rand() * 12)}, ${54 + Math.floor(rand() * 10)})`;
      ctx.fillRect(0, plank * plankH, TILE_SIZE, plankH);
    }
    for (let i = 0; i < 18; i++) {
      const y = i * 3 + rand() * 2;
      ctx.strokeStyle = `rgba(${48 + Math.floor(rand() * 16)}, ${28 + Math.floor(rand() * 16)}, ${12 + Math.floor(rand() * 10)}, ${0.12 + rand() * 0.14})`;
      ctx.lineWidth = 0.4 + rand() * 1.1;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.bezierCurveTo(TILE_SIZE * 0.3, y + (rand() - 0.5) * 2, TILE_SIZE * 0.7, y + (rand() - 0.5) * 2, TILE_SIZE, y + (rand() - 0.5) * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 18; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 4 + rand() * 8;
      const radiusY = 0.6 + rand() * 1.3;
      const alpha = 0.04 + rand() * 0.05;
      drawWrapped(ctx, x, y, radiusX + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = `rgba(${86 + Math.floor(rand() * 18)}, ${60 + Math.floor(rand() * 16)}, ${32 + Math.floor(rand() * 14)}, ${alpha})`;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, (rand() - 0.5) * 0.2, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }
    ctx.strokeStyle = "rgba(40, 28, 15, 0.35)";
    ctx.lineWidth = 1;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * plankH);
      ctx.lineTo(TILE_SIZE, i * plankH);
      ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
      const startX = rand() * TILE_SIZE;
      const startY = rand() * TILE_SIZE;
      const segmentLength = 8 + rand() * 14;
      const offsetY = (rand() - 0.5) * 1.8;
      const strokeStyle = `rgba(${62 + Math.floor(rand() * 16)}, ${38 + Math.floor(rand() * 14)}, ${18 + Math.floor(rand() * 10)}, ${0.08 + rand() * 0.08})`;
      drawWrapped(ctx, startX, startY, segmentLength, function (targetCtx, drawX, drawY) {
        targetCtx.strokeStyle = strokeStyle;
        targetCtx.lineWidth = 0.5 + rand() * 0.5;
        targetCtx.beginPath();
        targetCtx.moveTo(drawX, drawY);
        targetCtx.bezierCurveTo(
          drawX + segmentLength * 0.3,
          drawY + offsetY,
          drawX + segmentLength * 0.7,
          drawY - offsetY,
          drawX + segmentLength,
          drawY + offsetY * 0.6
        );
        targetCtx.stroke();
      });
    }
  }

  function drawStone(ctx) {
    const rand = mulberry32(88);
    fillWholeCanvas(ctx, "#585858");
    const blocks = [
      [1, 1, 22, 14],
      [25, 1, 24, 14],
      [1, 17, 16, 15],
      [19, 17, 14, 15],
      [35, 17, 14, 15],
      [1, 34, 24, 15],
      [27, 34, 22, 15],
    ];
    blocks.forEach(([x, y, w, h]) => {
      const gray = 75 + Math.floor(rand() * 50);
      ctx.fillStyle = `rgb(${gray}, ${gray}, ${gray + Math.floor(rand() * 10)})`;
      ctx.fillRect(x, y, w, h);
      ctx.fillStyle = "rgba(255,255,255,0.05)";
      ctx.fillRect(x, y, w, Math.max(1, h * 0.18));
      ctx.strokeStyle = "rgba(30, 30, 30, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    });
    scatterSpeckles(ctx, rand, 45, 0.8, 1.6, function () {
      const gray = 110 + Math.floor(rand() * 50);
      return `rgba(${gray}, ${gray}, ${gray}, 0.08)`;
    });
  }

  function drawSand(ctx) {
    const rand = mulberry32(44);
    fillWholeCanvas(ctx, "#cbb67a");
    scatterSpeckles(ctx, rand, 260, 0.5, 1.6, function () {
      const v = 170 + Math.floor(rand() * 60);
      return `rgba(${v}, ${v - 15}, ${v - 50}, 0.18)`;
    });
    for (let i = 0; i < 5; i++) {
      ctx.strokeStyle = `rgba(180, 160, 92, ${0.12 + rand() * 0.08})`;
      ctx.lineWidth = 0.8 + rand() * 0.3;
      ctx.beginPath();
      const y = 6 + i * 8 + rand() * 3;
      ctx.moveTo(-3, y);
      ctx.bezierCurveTo(12, y - 2, 34, y + 2, 53, y - 1);
      ctx.stroke();
    }
  }

  // ---- Urban textures ----

  function drawCheckerBW(ctx) {
    const half = TILE_SIZE / 2;
    fillWholeCanvas(ctx, "#e8e4df");
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
    ctx.strokeStyle = "rgba(80, 75, 70, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(0.5, 0.5, half - 1, half - 1);
    ctx.strokeRect(half + 0.5, 0.5, half - 1, half - 1);
    ctx.strokeRect(0.5, half + 0.5, half - 1, half - 1);
    ctx.strokeRect(half + 0.5, half + 0.5, half - 1, half - 1);
    const rand = mulberry32(121);
    scatterSpeckles(ctx, rand, 70, 0.5, 1.4, function () {
      const gray = 165 + Math.floor(rand() * 45);
      return `rgba(${gray}, ${gray}, ${gray}, 0.07)`;
    });
  }

  function drawSidewalk(ctx) {
    const rand = mulberry32(71);
    fillWholeCanvas(ctx, "#b0a999");
    ctx.strokeStyle = "rgba(70, 65, 55, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    scatterSpeckles(ctx, rand, 120, 0.8, 2.2, function () {
      const v = 150 + Math.floor(rand() * 40);
      return `rgba(${v}, ${v - 5}, ${v - 12}, 0.18)`;
    });
    drawCracks(ctx, rand, 4, function () {
      return `rgba(84, 77, 64, ${0.18 + rand() * 0.12})`;
    });
  }

  function drawCobblestone(ctx) {
    const rand = mulberry32(123);
    ctx.fillStyle = "#706860";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Irregular cobbles in a ~5x5 pattern
    const cols = 5, rows = 5;
    const cw = TILE_SIZE / cols, ch = TILE_SIZE / rows;
    for (let r = 0; r < rows; r++) {
      const offset = (r % 2) * (cw * 0.4);
      for (let c = 0; c < cols + 1; c++) {
        const bx = c * cw + offset + (rand() - 0.5) * 2;
        const by = r * ch + (rand() - 0.5) * 2;
        const bw = cw - 2 + (rand() - 0.5) * 2;
        const bh = ch - 2 + (rand() - 0.5) * 2;
        const gray = 80 + Math.floor(rand() * 55);
        ctx.fillStyle = `rgb(${gray}, ${gray - 3}, ${gray - 6})`;
        if (typeof ctx.roundRect === "function") {
          ctx.beginPath();
          ctx.roundRect(bx, by, bw, bh, 2);
          ctx.fill();
        } else {
          ctx.fillRect(bx, by, bw, bh);
        }
        ctx.strokeStyle = "rgba(30, 28, 25, 0.5)";
        ctx.lineWidth = 0.7;
        ctx.strokeRect(bx, by, bw, bh);
      }
    }
  }

  function drawAsphaltBase(ctx, rand) {
    fillWholeCanvas(ctx, "#383838");

    scatterSpeckles(ctx, rand, 420, 0.35, 1.4, function () {
      const gray = 42 + Math.floor(rand() * 38);
      return `rgba(${gray}, ${gray}, ${gray}, ${0.16 + rand() * 0.16})`;
    });

    scatterSpeckles(ctx, rand, 180, 0.45, 1.8, function () {
      const gray = 92 + Math.floor(rand() * 44);
      return `rgba(${gray}, ${gray}, ${gray - 4}, ${0.06 + rand() * 0.08})`;
    });

    for (let i = 0; i < 28; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 1.8 + rand() * 3.8;
      const radiusY = 1.6 + rand() * 3.4;
      const rotation = rand() * Math.PI;
      const alpha = 0.04 + rand() * 0.05;
      const tone = rand() > 0.55 ? 86 + Math.floor(rand() * 26) : 24 + Math.floor(rand() * 18);
      drawWrapped(ctx, x, y, Math.max(radiusX, radiusY) + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = `rgba(${tone}, ${tone}, ${tone}, ${alpha})`;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rotation, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }

    for (let i = 0; i < 90; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const length = 1.8 + rand() * 4.4;
      const angle = rand() * Math.PI;
      const alpha = 0.05 + rand() * 0.08;
      const gray = 70 + Math.floor(rand() * 32);
      const strokeStyle = `rgba(${gray}, ${gray}, ${gray - 6}, ${alpha})`;
      const lineWidth = 0.45 + rand() * 0.35;
      drawWrapped(ctx, x, y, length + 1, function (targetCtx, drawX, drawY) {
        targetCtx.strokeStyle = strokeStyle;
        targetCtx.lineWidth = lineWidth;
        targetCtx.beginPath();
        targetCtx.moveTo(drawX - Math.cos(angle) * length * 0.5, drawY - Math.sin(angle) * length * 0.5);
        targetCtx.lineTo(drawX + Math.cos(angle) * length * 0.5, drawY + Math.sin(angle) * length * 0.5);
        targetCtx.stroke();
      });
    }
  }

  function drawAsphalt(ctx) {
    const rand = mulberry32(91);
    drawAsphaltBase(ctx, rand);
  }

  function drawAsphaltMarkedLine(ctx, orientation) {
    const rand = mulberry32(91);
    drawAsphaltBase(ctx, rand);

    const isHorizontal = orientation !== "vertical";
    const stripeCenter = TILE_SIZE * 0.5;
    const stripeThickness = 8;
    const stripeStart = stripeCenter - stripeThickness * 0.5;

    ctx.fillStyle = "rgba(224, 218, 205, 0.92)";
    if (isHorizontal) {
      ctx.fillRect(0, stripeStart, TILE_SIZE, stripeThickness);
    } else {
      ctx.fillRect(stripeStart, 0, stripeThickness, TILE_SIZE);
    }

    ctx.fillStyle = "rgba(246, 242, 232, 0.2)";
    if (isHorizontal) {
      ctx.fillRect(0, stripeStart + 1, TILE_SIZE, 1.2);
    } else {
      ctx.fillRect(stripeStart + 1, 0, 1.2, TILE_SIZE);
    }
    ctx.fillStyle = "rgba(120, 112, 98, 0.16)";
    if (isHorizontal) {
      ctx.fillRect(0, stripeStart + stripeThickness - 1.2, TILE_SIZE, 1.2);
    } else {
      ctx.fillRect(stripeStart + stripeThickness - 1.2, 0, 1.2, TILE_SIZE);
    }

    ctx.save();
    ctx.beginPath();
    if (isHorizontal) {
      ctx.rect(0, stripeStart, TILE_SIZE, stripeThickness);
    } else {
      ctx.rect(stripeStart, 0, stripeThickness, TILE_SIZE);
    }
    ctx.clip();
    scatterSpeckles(ctx, rand, 80, 0.35, 1.2, function () {
      const gray = 190 + Math.floor(rand() * 35);
      return `rgba(${gray}, ${gray}, ${gray - 8}, ${0.08 + rand() * 0.08})`;
    });
    ctx.restore();

    for (let i = 0; i < 24; i++) {
      const x = isHorizontal ? rand() * TILE_SIZE : stripeStart + 1 + rand() * (stripeThickness - 2);
      const y = isHorizontal ? stripeStart + 1 + rand() * (stripeThickness - 2) : rand() * TILE_SIZE;
      const radiusX = 1.2 + rand() * 3.4;
      const radiusY = 0.4 + rand() * 1.1;
      const rotation = (rand() - 0.5) * 0.5 + (isHorizontal ? 0 : Math.PI * 0.5);
      const fillStyle = `rgba(${74 + Math.floor(rand() * 20)}, ${74 + Math.floor(rand() * 20)}, ${76 + Math.floor(rand() * 18)}, ${0.1 + rand() * 0.08})`;
      drawWrapped(ctx, x, y, radiusX + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = fillStyle;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rotation, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }

    for (let i = 0; i < 18; i++) {
      const x = isHorizontal ? rand() * TILE_SIZE : stripeStart + 1.5 + rand() * (stripeThickness - 3);
      const y = isHorizontal ? stripeStart + 1.5 + rand() * (stripeThickness - 3) : rand() * TILE_SIZE;
      const length = 1.2 + rand() * 3.8;
      const strokeStyle = `rgba(${110 + Math.floor(rand() * 28)}, ${106 + Math.floor(rand() * 24)}, ${98 + Math.floor(rand() * 20)}, ${0.12 + rand() * 0.1})`;
      const lineWidth = 0.45 + rand() * 0.25;
      drawWrapped(ctx, x, y, length + 1, function (targetCtx, drawX, drawY) {
        targetCtx.strokeStyle = strokeStyle;
        targetCtx.lineWidth = lineWidth;
        targetCtx.beginPath();
        if (isHorizontal) {
          targetCtx.moveTo(drawX - length * 0.5, drawY);
          targetCtx.lineTo(drawX + length * 0.5, drawY);
        } else {
          targetCtx.moveTo(drawX, drawY - length * 0.5);
          targetCtx.lineTo(drawX, drawY + length * 0.5);
        }
        targetCtx.stroke();
      });
    }
  }

  function drawAsphaltLine(ctx) {
    drawAsphaltMarkedLine(ctx, "horizontal");
  }

  function drawAsphaltLineVertical(ctx) {
    drawAsphaltMarkedLine(ctx, "vertical");
  }

  function drawBrick(ctx) {
    const rand = mulberry32(58);
    fillWholeCanvas(ctx, "#7a3b2e");
    const brickH = TILE_SIZE / 4;
    const brickW = TILE_SIZE / 2;
    ctx.fillStyle = "rgba(196, 184, 168, 0.28)";
    for (let row = 0; row < 4; row++) {
      ctx.fillRect(0, row * brickH - 0.5, TILE_SIZE, 1.2);
    }
    ctx.strokeStyle = "rgba(45, 25, 18, 0.55)";
    ctx.lineWidth = 1;
    for (let row = 0; row < 4; row++) {
      const offset = (row % 2) * (brickW / 2);
      for (let col = -1; col < 3; col++) {
        const bx = col * brickW + offset;
        const by = row * brickH;
        const rShift = Math.floor(rand() * 25) - 12;
        ctx.fillStyle = `rgb(${122 + rShift}, ${59 + Math.floor(rShift * 0.5)}, ${46 + Math.floor(rShift * 0.3)})`;
        ctx.fillRect(bx + 0.5, by + 0.5, brickW - 1, brickH - 1);
        ctx.fillStyle = "rgba(255,255,255,0.05)";
        ctx.fillRect(bx + 1, by + 1, brickW - 3, Math.max(1, brickH * 0.18));
        ctx.strokeRect(bx + 0.5, by + 0.5, brickW - 1, brickH - 1);
      }
    }
  }

  function drawMarble(ctx) {
    const rand = mulberry32(37);
    fillWholeCanvas(ctx, "#d8d2c8");
    ctx.strokeStyle = "rgba(160, 150, 135, 0.3)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 7; i++) {
      const sx = rand() * TILE_SIZE;
      const sy = rand() * TILE_SIZE;
      const controlX = (rand() - 0.5) * 20;
      const controlY = (rand() - 0.5) * 20;
      const endX = (rand() - 0.5) * 26;
      const endY = (rand() - 0.5) * 26;
      drawWrapped(ctx, sx, sy, 14, function (targetCtx, drawX, drawY) {
        targetCtx.beginPath();
        targetCtx.moveTo(drawX, drawY);
        targetCtx.quadraticCurveTo(
          drawX + controlX,
          drawY + controlY,
          drawX + endX,
          drawY + endY,
        );
        targetCtx.stroke();
      });
    }
    scatterSpeckles(ctx, rand, 90, 0.8, 2.2, function () {
      const v = 195 + Math.floor(rand() * 35);
      return `rgba(${v}, ${v - 3}, ${v - 8}, 0.1)`;
    });
  }

  function drawMetal(ctx) {
    const rand = mulberry32(105);
    ctx.fillStyle = "#6a6e72";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Brushed horizontal lines
    for (let y = 0; y < TILE_SIZE; y += 1) {
      const v = 95 + Math.floor(rand() * 30);
      ctx.strokeStyle = `rgba(${v}, ${v + 2}, ${v + 5}, 0.15)`;
      ctx.lineWidth = 0.5 + rand() * 0.5;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(TILE_SIZE, y + 0.5);
      ctx.stroke();
    }
    // Diamond plate bumps
    const sp = 12;
    for (let row = 0; row < TILE_SIZE / sp; row++) {
      for (let col = 0; col < TILE_SIZE / sp; col++) {
        const cx = col * sp + (row % 2) * (sp / 2) + sp / 2;
        const cy = row * sp + sp / 2;
        if (cx > TILE_SIZE || cy > TILE_SIZE) continue;
        ctx.fillStyle = `rgba(140, 145, 150, ${0.2 + rand() * 0.15})`;
        ctx.beginPath();
        ctx.moveTo(cx, cy - 3);
        ctx.lineTo(cx + 2, cy);
        ctx.lineTo(cx, cy + 3);
        ctx.lineTo(cx - 2, cy);
        ctx.closePath();
        ctx.fill();
      }
    }
  }

  function drawSewer(ctx) {
    const rand = mulberry32(666);
    fillWholeCanvas(ctx, "#353a33");
    scatterSpeckles(ctx, rand, 170, 0.8, 2.2, function () {
      const v = 45 + Math.floor(rand() * 30);
      return `rgba(${v}, ${v + 5}, ${v - 2}, 0.22)`;
    });
    for (let i = 0; i < 8; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const radiusX = 4 + rand() * 8;
      const radiusY = 2 + rand() * 5;
      const rotation = rand() * Math.PI;
      drawWrapped(ctx, x, y, Math.max(radiusX, radiusY) + 1, function (targetCtx, drawX, drawY) {
        targetCtx.fillStyle = `rgba(${48 + Math.floor(rand() * 20)}, ${68 + Math.floor(rand() * 18)}, ${58 + Math.floor(rand() * 16)}, ${0.05 + rand() * 0.08})`;
        targetCtx.beginPath();
        targetCtx.ellipse(drawX, drawY, radiusX, radiusY, rotation, 0, Math.PI * 2);
        targetCtx.fill();
      });
    }
    drawCracks(ctx, rand, 5, function () {
      return `rgba(22, 26, 18, ${0.24 + rand() * 0.14})`;
    });
  }

  function drawCarpet(ctx) {
    const rand = mulberry32(52);
    fillWholeCanvas(ctx, "#6b2038");
    for (let y = 0; y < TILE_SIZE; y += 2) {
      ctx.strokeStyle = `rgba(90, 25, 45, ${0.3 + rand() * 0.15})`;
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, y + 0.5);
      ctx.lineTo(TILE_SIZE, y + 0.5);
      ctx.stroke();
    }
    for (let x = 0; x < TILE_SIZE; x += 2) {
      ctx.strokeStyle = `rgba(80, 20, 40, ${0.15 + rand() * 0.1})`;
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(x + 0.5, 0);
      ctx.lineTo(x + 0.5, TILE_SIZE);
      ctx.stroke();
    }
    scatterSpeckles(ctx, rand, 60, 0.4, 1.1, function () {
      return `rgba(${100 + Math.floor(rand() * 30)}, 20, 40, 0.12)`;
    });
  }

  const TEXTURE_RENDERERS = {
    grass: drawGrass,
    concrete: drawConcrete,
    tiles: drawTiles,
    dirt: drawDirt,
    water: drawWater,
    wood: drawWood,
    stone: drawStone,
    sand: drawSand,
    checkerBW: drawCheckerBW,
    sidewalk: drawSidewalk,
    cobblestone: drawCobblestone,
    asphalt: drawAsphalt,
    asphaltLine: drawAsphaltLine,
    asphaltLineVertical: drawAsphaltLineVertical,
    brick: drawBrick,
    marble: drawMarble,
    metal: drawMetal,
    sewer: drawSewer,
    carpet: drawCarpet,
  };

  // Compatibility aliases for image-based terrain ids that may already exist
  // in saved encounters from the short-lived image texture experiment.
  const LEGACY_TEXTURE_ALIASES = {
    photoCobblestoneA: "cobblestone",
    photoCobblestoneB: "cobblestone",
    photoBlueCarpet: "carpet",
    photoWornCarpet: "carpet",
    photoAsphalt: "asphalt",
    photoMud: "dirt",
    photoRuinedStreet: "asphalt",
    photoStonePath: "stone",
    photoConcrete: "concrete",
    photoBlackMarble: "marble",
    photoWoodBoards: "wood",
    photoGreenGrass: "grass",
    photoGrass: "grass",
    photoWoodFloor: "wood",
    photoRockyGrass: "grass",
    photoTatami: "wood",
    photoSidewalk: "sidewalk",
  };

  const TEXTURE_LABELS = {
    grass: "Pasto",
    concrete: "Cemento",
    tiles: "Baldosas",
    dirt: "Tierra",
    water: "Agua",
    wood: "Madera",
    stone: "Piedra",
    sand: "Arena",
    checkerBW: "Azulejo B/N",
    sidewalk: "Vereda",
    cobblestone: "Adoquín",
    asphalt: "Asfalto",
    asphaltLine: "Línea vial",
    asphaltLineVertical: "Línea vial vertical",
    brick: "Ladrillo",
    marble: "Mármol",
    metal: "Metal",
    sewer: "Cloaca",
    carpet: "Alfombra",
  };

  const TEXTURE_IDS = Object.keys(TEXTURE_RENDERERS);

  function resolveTextureId(textureId) {
    return LEGACY_TEXTURE_ALIASES[textureId] || textureId || null;
  }

  function getOrCreatePattern(renderCtx, textureId) {
    const resolvedTextureId = resolveTextureId(textureId);
    const key = resolvedTextureId;
    if (patternCache.has(key)) return patternCache.get(key);

    const renderer = TEXTURE_RENDERERS[resolvedTextureId];
    if (!renderer) return null;

    const tileCanvas = createTileCanvas();
    const tileCtx = tileCanvas.getContext("2d");
    renderer(tileCtx);

    const pattern = renderCtx.createPattern(tileCanvas, "repeat");
    patternCache.set(key, pattern);
    return pattern;
  }

  function getThumbnailDataUrl(textureId) {
    const resolvedTextureId = resolveTextureId(textureId);
    const renderer = TEXTURE_RENDERERS[resolvedTextureId];
    if (!renderer) return "";
    const c = createTileCanvas();
    const ctx = c.getContext("2d");
    renderer(ctx);
    return c.toDataURL();
  }

  global.TileTextures = {
    TILE_SIZE,
    TEXTURE_IDS,
    TEXTURE_LABELS,
    resolveTextureId,
    getOrCreatePattern,
    getThumbnailDataUrl,
  };
})(window);
