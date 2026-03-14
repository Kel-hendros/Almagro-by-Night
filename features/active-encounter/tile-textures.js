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

  // ---- Texture drawing functions ----

  function drawGrass(ctx) {
    const rand = mulberry32(42);
    ctx.fillStyle = "#3a6b35";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 120; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const h = 4 + rand() * 8;
      const shade = 40 + Math.floor(rand() * 50);
      ctx.strokeStyle = `rgba(${shade}, ${80 + Math.floor(rand() * 60)}, ${shade}, 0.6)`;
      ctx.lineWidth = 0.8 + rand() * 0.6;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (rand() - 0.5) * 3, y - h);
      ctx.stroke();
    }
  }

  function drawConcrete(ctx) {
    const rand = mulberry32(77);
    ctx.fillStyle = "#8a8a8a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 200; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const gray = 100 + Math.floor(rand() * 80);
      ctx.fillStyle = `rgba(${gray}, ${gray}, ${gray}, 0.3)`;
      ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
    }
  }

  function drawTiles(ctx) {
    ctx.fillStyle = "#9b8b75";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.strokeStyle = "rgba(60, 50, 40, 0.5)";
    ctx.lineWidth = 1;
    const tileW = TILE_SIZE / 2;
    const tileH = TILE_SIZE / 2;
    for (let r = 0; r < 2; r++) {
      for (let c = 0; c < 2; c++) {
        ctx.strokeRect(c * tileW + 0.5, r * tileH + 0.5, tileW - 1, tileH - 1);
      }
    }
    const rand = mulberry32(55);
    for (let i = 0; i < 60; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const v = 130 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgba(${v}, ${v - 10}, ${v - 20}, 0.15)`;
      ctx.fillRect(x, y, 1 + rand(), 1 + rand());
    }
  }

  function drawDirt(ctx) {
    const rand = mulberry32(33);
    ctx.fillStyle = "#6b4e31";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 180; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const r = 80 + Math.floor(rand() * 50);
      const g = 55 + Math.floor(rand() * 40);
      const b = 25 + Math.floor(rand() * 30);
      ctx.fillStyle = `rgba(${r}, ${g}, ${b}, 0.35)`;
      const size = 1 + rand() * 3;
      ctx.beginPath();
      ctx.arc(x, y, size, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawWater(ctx) {
    const rand = mulberry32(99);
    ctx.fillStyle = "#2a5a8a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
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
  }

  function drawWood(ctx) {
    ctx.fillStyle = "#7a5c3a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const rand = mulberry32(66);
    for (let i = 0; i < 12; i++) {
      const y = i * 4 + rand() * 2;
      ctx.strokeStyle = `rgba(50, 35, 20, ${0.12 + rand() * 0.1})`;
      ctx.lineWidth = 0.5 + rand() * 1.2;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(TILE_SIZE, y + (rand() - 0.5) * 2);
      ctx.stroke();
    }
    // Plank divisions
    ctx.strokeStyle = "rgba(40, 28, 15, 0.35)";
    ctx.lineWidth = 1;
    const plankH = TILE_SIZE / 3;
    for (let i = 1; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(0, i * plankH);
      ctx.lineTo(TILE_SIZE, i * plankH);
      ctx.stroke();
    }
  }

  function drawStone(ctx) {
    const rand = mulberry32(88);
    ctx.fillStyle = "#636363";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Irregular stone blocks
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
      ctx.strokeStyle = "rgba(30, 30, 30, 0.5)";
      ctx.lineWidth = 1;
      ctx.strokeRect(x, y, w, h);
    });
  }

  function drawSand(ctx) {
    const rand = mulberry32(44);
    ctx.fillStyle = "#c9b87a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 250; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const v = 170 + Math.floor(rand() * 60);
      ctx.fillStyle = `rgba(${v}, ${v - 15}, ${v - 50}, 0.2)`;
      ctx.fillRect(x, y, 0.5 + rand(), 0.5 + rand());
    }
  }

  // ---- Urban textures ----

  function drawCheckerBW(ctx) {
    const half = TILE_SIZE / 2;
    ctx.fillStyle = "#e8e4df";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = "#2a2a2a";
    ctx.fillRect(0, 0, half, half);
    ctx.fillRect(half, half, half, half);
    // Subtle grout lines
    ctx.strokeStyle = "rgba(80, 75, 70, 0.35)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(0.5, 0.5, half - 1, half - 1);
    ctx.strokeRect(half + 0.5, 0.5, half - 1, half - 1);
    ctx.strokeRect(0.5, half + 0.5, half - 1, half - 1);
    ctx.strokeRect(half + 0.5, half + 0.5, half - 1, half - 1);
  }

  function drawSidewalk(ctx) {
    const rand = mulberry32(71);
    ctx.fillStyle = "#b0a999";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Single slab = full tile, expansion joint lines at edges
    ctx.strokeStyle = "rgba(70, 65, 55, 0.45)";
    ctx.lineWidth = 1.2;
    ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);
    // Surface grain
    for (let i = 0; i < 100; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const v = 150 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgba(${v}, ${v - 5}, ${v - 12}, 0.18)`;
      ctx.fillRect(x, y, 1 + rand() * 1.5, 1 + rand() * 1.5);
    }
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

  function drawAsphalt(ctx) {
    const rand = mulberry32(91);
    ctx.fillStyle = "#3a3a3a";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 300; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const v = 40 + Math.floor(rand() * 40);
      ctx.fillStyle = `rgba(${v}, ${v}, ${v}, 0.3)`;
      ctx.fillRect(x, y, 0.5 + rand() * 1.5, 0.5 + rand() * 1.5);
    }
  }

  function drawBrick(ctx) {
    const rand = mulberry32(58);
    ctx.fillStyle = "#7a3b2e";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    const brickH = TILE_SIZE / 4;
    const brickW = TILE_SIZE / 2;
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
        ctx.strokeRect(bx + 0.5, by + 0.5, brickW - 1, brickH - 1);
      }
    }
  }

  function drawMarble(ctx) {
    const rand = mulberry32(37);
    ctx.fillStyle = "#d8d2c8";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Veins
    ctx.strokeStyle = "rgba(160, 150, 135, 0.3)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 5; i++) {
      ctx.beginPath();
      const sx = rand() * TILE_SIZE;
      const sy = rand() * TILE_SIZE;
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(
        rand() * TILE_SIZE, rand() * TILE_SIZE,
        rand() * TILE_SIZE, rand() * TILE_SIZE
      );
      ctx.stroke();
    }
    // Subtle grain
    for (let i = 0; i < 80; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const v = 195 + Math.floor(rand() * 35);
      ctx.fillStyle = `rgba(${v}, ${v - 3}, ${v - 8}, 0.12)`;
      ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
    }
    // Slab border
    ctx.strokeStyle = "rgba(130, 120, 105, 0.25)";
    ctx.lineWidth = 0.8;
    ctx.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);
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
    // Dark wet stone
    ctx.fillStyle = "#3a3d35";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    for (let i = 0; i < 150; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      const v = 45 + Math.floor(rand() * 30);
      ctx.fillStyle = `rgba(${v}, ${v + 5}, ${v - 2}, 0.25)`;
      ctx.fillRect(x, y, 1 + rand() * 2, 1 + rand() * 2);
    }
    // Puddle sheen
    ctx.fillStyle = "rgba(60, 80, 70, 0.2)";
    ctx.beginPath();
    ctx.ellipse(TILE_SIZE * 0.6, TILE_SIZE * 0.5, 12, 8, 0.3, 0, Math.PI * 2);
    ctx.fill();
    // Grime cracks
    ctx.strokeStyle = "rgba(25, 28, 22, 0.4)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(rand() * TILE_SIZE, rand() * TILE_SIZE);
      ctx.lineTo(rand() * TILE_SIZE, rand() * TILE_SIZE);
      ctx.stroke();
    }
  }

  function drawCarpet(ctx) {
    const rand = mulberry32(52);
    ctx.fillStyle = "#6b2038";
    ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);
    // Woven texture: fine horizontal + vertical lines
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
    // Subtle fiber noise
    for (let i = 0; i < 60; i++) {
      const x = rand() * TILE_SIZE;
      const y = rand() * TILE_SIZE;
      ctx.fillStyle = `rgba(${100 + Math.floor(rand() * 30)}, 20, 40, 0.12)`;
      ctx.fillRect(x, y, 0.5 + rand(), 0.5 + rand());
    }
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
    brick: drawBrick,
    marble: drawMarble,
    metal: drawMetal,
    sewer: drawSewer,
    carpet: drawCarpet,
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
    brick: "Ladrillo",
    marble: "Mármol",
    metal: "Metal",
    sewer: "Cloaca",
    carpet: "Alfombra",
  };

  const TEXTURE_IDS = Object.keys(TEXTURE_RENDERERS);

  function getOrCreatePattern(renderCtx, textureId) {
    const key = textureId;
    if (patternCache.has(key)) return patternCache.get(key);

    const renderer = TEXTURE_RENDERERS[textureId];
    if (!renderer) return null;

    const tileCanvas = createTileCanvas();
    const tileCtx = tileCanvas.getContext("2d");
    renderer(tileCtx);

    const pattern = renderCtx.createPattern(tileCanvas, "repeat");
    patternCache.set(key, pattern);
    return pattern;
  }

  function getThumbnailDataUrl(textureId) {
    const renderer = TEXTURE_RENDERERS[textureId];
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
    getOrCreatePattern,
    getThumbnailDataUrl,
  };
})(window);
