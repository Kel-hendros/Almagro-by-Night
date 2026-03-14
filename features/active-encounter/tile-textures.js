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

  const TEXTURE_RENDERERS = {
    grass: drawGrass,
    concrete: drawConcrete,
    tiles: drawTiles,
    dirt: drawDirt,
    water: drawWater,
    wood: drawWood,
    stone: drawStone,
    sand: drawSand,
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
