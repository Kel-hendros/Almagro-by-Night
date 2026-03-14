/* ============================================================
   CCCustomBorder – custom border compositing engine + UI
   Alpha-mask compositing: fill (solid/gradient) + optional
   texture overlay (colorizable), masked by greenMarble PNG.
   ============================================================ */
(function initCCCustomBorder(global) {
  "use strict";

  var ASSET = "js/tools/card-creator/assets";
  var MASK_FILE = "greenMarble.png";
  var W = 663, H = 996;
  var STORAGE_KEY = "cc_custom_border_presets";
  var MAX_PRESETS = 20;

  /* ── State ───────────────────────────────────────────── */
  var _active = false;
  var _maskImg = null;
  var _fillType = "solid";
  var _solid = { color: "#8b0000" };
  var _gradient = { color1: "#8b0000", color2: "#1a1a2e", direction: "vertical" };
  var _overlay = {
    textureId: null, color: "#000000",
    opacity: 0.15, scale: 1, blendMode: "multiply",
  };
  var _offscreen = null;
  var _tmpCanvas = null; // for texture colorization
  var _onUpdate = null;
  var _containerEl = null;
  var _rafId = null;
  var _textureCanvases = {};

  /* ── Overlay texture definitions (PNG files) ────────── */
  var TEX_PATH = ASSET + "/texturas/";
  var TEXTURES = [
    { id: "fabric",      label: "Tela",      file: "45-degree-fabric-light.png" },
    { id: "asfalto",     label: "Asfalto",   file: "asfalt-dark.png" },
    { id: "fieltro",     label: "Fieltro",   file: "black-felt.png" },
    { id: "carbono",     label: "Carbono",   file: "carbon-fibre.png" },
    { id: "cuero",       label: "Cuero",     file: "dark-leather.png" },
    { id: "nieve",       label: "Nieve",     file: "fresh-snow.png" },
    { id: "escamas",     label: "Escamas",   file: "silver-scales.png" },
    { id: "rombos",      label: "Rombos",    file: "black-lozenge.png" },
  ];

  var BLEND_MODES = [
    { id: "source-over", label: "Normal" },
    { id: "multiply",    label: "Multiplicar" },
    { id: "overlay",     label: "Superponer" },
  ];

  /* ── Load PNG textures ───────────────────────────────── */
  var _texturesReady = false;

  function loadTextureImage(tex) {
    return new Promise(function (resolve) {
      var img = new Image();
      img.onload = function () {
        _textureCanvases[tex.id] = img;
        resolve();
      };
      img.onerror = function () { resolve(); }; // skip broken
      img.src = TEX_PATH + tex.file;
    });
  }

  function initTextures(callback) {
    var promises = TEXTURES.map(loadTextureImage);
    Promise.all(promises).then(function () {
      _texturesReady = true;
      if (callback) callback();
    });
  }

  /* Thumbnail: white bg + tiled pattern at full strength */
  function makeThumbPreview(texImg) {
    if (!texImg) return "";
    var T = 88;
    var c = document.createElement("canvas");
    c.width = T; c.height = T;
    var ctx = c.getContext("2d");
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, T, T);
    var pat = ctx.createPattern(texImg, "repeat");
    ctx.fillStyle = pat;
    ctx.fillRect(0, 0, T, T);
    return c.toDataURL();
  }

  /* ── Compositing pipeline ────────────────────────────── */
  function renderCustomBorder() {
    if (!_maskImg || !_offscreen) return;
    var ctx = _offscreen.getContext("2d");
    ctx.clearRect(0, 0, W, H);

    /* 1. Base fill */
    if (_fillType === "solid") {
      ctx.fillStyle = _solid.color;
      ctx.fillRect(0, 0, W, H);
    } else {
      var grad;
      switch (_gradient.direction) {
        case "horizontal":  grad = ctx.createLinearGradient(0, 0, W, 0); break;
        case "diagonal":    grad = ctx.createLinearGradient(0, 0, W, H); break;
        case "radial":      grad = ctx.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.6); break;
        default:            grad = ctx.createLinearGradient(0, 0, 0, H);
      }
      grad.addColorStop(0, _gradient.color1);
      grad.addColorStop(1, _gradient.color2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, W, H);
    }

    /* 2. Texture overlay (optional, colorized) */
    var texSrc = _overlay.textureId ? _textureCanvases[_overlay.textureId] : null;

    if (texSrc && _overlay.opacity > 0) {
      var tmp = _tmpCanvas.getContext("2d");
      tmp.clearRect(0, 0, W, H);

      // Tile the pattern (with scale)
      var pat = tmp.createPattern(texSrc, "repeat");
      tmp.fillStyle = pat;
      var s = _overlay.scale;
      if (s !== 1) {
        tmp.save(); tmp.scale(s, s);
        tmp.fillRect(0, 0, W / s, H / s);
        tmp.restore();
      } else {
        tmp.fillRect(0, 0, W, H);
      }

      // Colorize: replace RGB with user color, keep alpha
      tmp.globalCompositeOperation = "source-in";
      tmp.fillStyle = _overlay.color;
      tmp.fillRect(0, 0, W, H);
      tmp.globalCompositeOperation = "source-over";

      // Composite onto main canvas
      ctx.save();
      ctx.globalCompositeOperation = _overlay.blendMode;
      ctx.globalAlpha = _overlay.opacity;
      ctx.drawImage(_tmpCanvas, 0, 0);
      ctx.restore();
    }

    /* 3. Mask with border PNG alpha */
    ctx.globalCompositeOperation = "destination-in";
    ctx.drawImage(_maskImg, 0, 0, W, H);
    ctx.globalCompositeOperation = "source-over";

    /* 4. Emit */
    if (_onUpdate) _onUpdate(_offscreen.toDataURL("image/png"));
  }

  function debouncedRender() {
    if (_rafId) cancelAnimationFrame(_rafId);
    _rafId = requestAnimationFrame(function () {
      _rafId = null;
      renderCustomBorder();
    });
  }

  function loadMask() {
    var img = new Image();
    img.onload = function () { _maskImg = img; debouncedRender(); };
    img.src = ASSET + "/imagenes/bordes/" + MASK_FILE;
  }

  function populateTextureThumbs(texGrid) {
    TEXTURES.forEach(function (tex) {
      var div = document.createElement("div");
      div.className = "ccb-tex-thumb" + (_overlay.textureId === tex.id ? " active" : "");
      div.dataset.texId = tex.id;
      div.title = tex.label;
      var img = _textureCanvases[tex.id];
      if (img) {
        div.style.backgroundImage = "url(" + makeThumbPreview(img) + ")";
      }
      texGrid.appendChild(div);
    });
  }

  /* ── Build UI ────────────────────────────────────────── */
  function buildUI(container) {
    container.innerHTML =
      '<div class="ccb-panel">' +

        /* Fill */
        '<div class="ccb-section">' +
          '<p class="cc-section-title">Relleno</p>' +
          '<div class="ccb-fill-tabs">' +
            '<button class="ccb-tab active" data-fill="solid">Color</button>' +
            '<button class="ccb-tab" data-fill="gradient">Degradado</button>' +
          '</div>' +
          '<div class="ccb-fill-pane ccb-fill-solid">' +
            '<label class="ccb-color-row">' +
              '<span>Color</span>' +
              '<input type="color" class="ccb-solid-color" value="' + _solid.color + '">' +
            '</label>' +
          '</div>' +
          '<div class="ccb-fill-pane ccb-fill-gradient hidden">' +
            '<div class="ccb-gradient-colors">' +
              '<label class="ccb-color-row"><span>Color 1</span>' +
                '<input type="color" class="ccb-grad-color1" value="' + _gradient.color1 + '"></label>' +
              '<label class="ccb-color-row"><span>Color 2</span>' +
                '<input type="color" class="ccb-grad-color2" value="' + _gradient.color2 + '"></label>' +
            '</div>' +
            '<div class="ccb-direction-btns">' +
              '<button class="ccb-dir-btn active" data-dir="vertical" title="Vertical">&darr;</button>' +
              '<button class="ccb-dir-btn" data-dir="horizontal" title="Horizontal">&rarr;</button>' +
              '<button class="ccb-dir-btn" data-dir="diagonal" title="Diagonal">&searr;</button>' +
              '<button class="ccb-dir-btn" data-dir="radial" title="Radial">&#9678;</button>' +
            '</div>' +
          '</div>' +
        '</div>' +

        /* Texture overlay */
        '<div class="ccb-section">' +
          '<p class="cc-section-title">Textura <span class="ccb-tex-hint">(opcional)</span></p>' +
          '<div class="ccb-texture-grid"></div>' +
          '<label class="ccb-color-row"><span>Color</span>' +
            '<input type="color" class="ccb-tex-color" value="' + _overlay.color + '"></label>' +
          '<div class="ccb-overlay-sliders">' +
            '<div class="ccb-slider-row">' +
              '<label>Opacidad</label>' +
              '<input type="range" class="ccb-overlay-opacity" min="0" max="1" step="0.05" value="' + _overlay.opacity + '">' +
              '<span class="ccb-slider-value ccb-overlay-opacity-label">' + Math.round(_overlay.opacity * 100) + '%</span>' +
            '</div>' +
            '<div class="ccb-slider-row">' +
              '<label>Tama\u00f1o</label>' +
              '<input type="range" class="ccb-overlay-scale" min="0.25" max="5" step="0.25" value="' + _overlay.scale + '">' +
              '<span class="ccb-slider-value ccb-overlay-scale-label">' + fmtScale(_overlay.scale) + '</span>' +
            '</div>' +
          '</div>' +
          '<div class="ccb-blend-row">' +
            '<label>Mezcla</label>' +
            '<div class="ccb-blend-btns"></div>' +
          '</div>' +
        '</div>' +

        /* Presets */
        '<div class="ccb-section">' +
          '<p class="cc-section-title">Presets</p>' +
          '<div class="ccb-presets-list"></div>' +
          '<div class="ccb-preset-save-row">' +
            '<input type="text" class="ccb-preset-name" placeholder="Nombre del preset" maxlength="30">' +
            '<button class="ccb-save-preset-btn">Guardar</button>' +
          '</div>' +
        '</div>' +

      '</div>';

    /* Texture thumbnails (populated after images load) */
    var texGrid = container.querySelector(".ccb-texture-grid");
    var noneDiv = document.createElement("div");
    noneDiv.className = "ccb-tex-thumb ccb-tex-none" + (!_overlay.textureId ? " active" : "");
    noneDiv.dataset.texId = "";
    noneDiv.title = "Ninguna";
    noneDiv.textContent = "\u2014";
    texGrid.appendChild(noneDiv);

    populateTextureThumbs(texGrid);

    /* Blend mode buttons */
    var blendContainer = container.querySelector(".ccb-blend-btns");
    BLEND_MODES.forEach(function (bm) {
      var btn = document.createElement("button");
      btn.className = "ccb-blend-btn" + (bm.id === _overlay.blendMode ? " active" : "");
      btn.dataset.mode = bm.id;
      btn.textContent = bm.label;
      blendContainer.appendChild(btn);
    });

    renderPresetList();
  }

  function fmtScale(v) { return Math.round(v * 100) + "%"; }

  /* ── Wire up events ──────────────────────────────────── */
  function setupEvents() {
    var c = _containerEl;

    /* Fill tabs */
    c.addEventListener("click", function (e) {
      var tab = e.target.closest(".ccb-tab");
      if (!tab) return;
      c.querySelectorAll(".ccb-tab").forEach(function (t) { t.classList.remove("active"); });
      tab.classList.add("active");
      _fillType = tab.dataset.fill;
      c.querySelector(".ccb-fill-solid").classList.toggle("hidden", _fillType !== "solid");
      c.querySelector(".ccb-fill-gradient").classList.toggle("hidden", _fillType !== "gradient");
      debouncedRender();
    });

    c.querySelector(".ccb-solid-color").addEventListener("input", function (e) {
      _solid.color = e.target.value; debouncedRender();
    });
    c.querySelector(".ccb-grad-color1").addEventListener("input", function (e) {
      _gradient.color1 = e.target.value; debouncedRender();
    });
    c.querySelector(".ccb-grad-color2").addEventListener("input", function (e) {
      _gradient.color2 = e.target.value; debouncedRender();
    });

    c.addEventListener("click", function (e) {
      var btn = e.target.closest(".ccb-dir-btn");
      if (!btn) return;
      c.querySelectorAll(".ccb-dir-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      _gradient.direction = btn.dataset.dir;
      debouncedRender();
    });

    /* Texture selection */
    c.addEventListener("click", function (e) {
      var thumb = e.target.closest(".ccb-tex-thumb");
      if (!thumb) return;
      c.querySelectorAll(".ccb-tex-thumb").forEach(function (t) { t.classList.remove("active"); });
      thumb.classList.add("active");
      var tid = thumb.dataset.texId;
      _overlay.textureId = tid || null;
      debouncedRender();
    });


    /* Texture color */
    c.querySelector(".ccb-tex-color").addEventListener("input", function (e) {
      _overlay.color = e.target.value; debouncedRender();
    });

    /* Overlay opacity */
    c.querySelector(".ccb-overlay-opacity").addEventListener("input", function (e) {
      _overlay.opacity = parseFloat(e.target.value);
      c.querySelector(".ccb-overlay-opacity-label").textContent = Math.round(_overlay.opacity * 100) + "%";
      debouncedRender();
    });

    /* Overlay scale */
    c.querySelector(".ccb-overlay-scale").addEventListener("input", function (e) {
      _overlay.scale = parseFloat(e.target.value);
      c.querySelector(".ccb-overlay-scale-label").textContent = fmtScale(_overlay.scale);
      debouncedRender();
    });

    /* Blend mode */
    c.addEventListener("click", function (e) {
      var btn = e.target.closest(".ccb-blend-btn");
      if (!btn) return;
      c.querySelectorAll(".ccb-blend-btn").forEach(function (b) { b.classList.remove("active"); });
      btn.classList.add("active");
      _overlay.blendMode = btn.dataset.mode;
      debouncedRender();
    });

    c.querySelector(".ccb-save-preset-btn").addEventListener("click", savePreset);

    c.querySelector(".ccb-presets-list").addEventListener("click", function (e) {
      var del = e.target.closest(".ccb-preset-delete");
      if (del) { deletePreset(parseInt(del.dataset.idx, 10)); return; }
      var chip = e.target.closest(".ccb-preset-chip");
      if (chip) applyPreset(parseInt(chip.dataset.idx, 10));
    });
  }

  /* ── Preset CRUD ─────────────────────────────────────── */
  function getPresets() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY)) || []; }
    catch (e) { return []; }
  }
  function storePresets(p) { localStorage.setItem(STORAGE_KEY, JSON.stringify(p)); }

  function savePreset() {
    var input = _containerEl.querySelector(".ccb-preset-name");
    var name = input.value.trim() || ("Preset " + (getPresets().length + 1));
    var presets = getPresets();
    if (presets.length >= MAX_PRESETS) {
      alert("Máximo " + MAX_PRESETS + " presets. Eliminá uno primero.");
      return;
    }
    presets.push({
      name: name,
      fillType: _fillType,
      solid: { color: _solid.color },
      gradient: { color1: _gradient.color1, color2: _gradient.color2, direction: _gradient.direction },
      overlay: {
        textureId: _overlay.textureId, color: _overlay.color,
        opacity: _overlay.opacity, scale: _overlay.scale, blendMode: _overlay.blendMode,
      },
    });
    storePresets(presets);
    input.value = "";
    renderPresetList();
  }

  function deletePreset(idx) {
    var presets = getPresets();
    presets.splice(idx, 1);
    storePresets(presets);
    renderPresetList();
  }

  function applyPreset(idx) {
    var p = getPresets()[idx];
    if (!p) return;
    _fillType = p.fillType || "solid";
    _solid = { color: (p.solid && p.solid.color) || "#8b0000" };
    _gradient = {
      color1: (p.gradient && p.gradient.color1) || "#8b0000",
      color2: (p.gradient && p.gradient.color2) || "#1a1a2e",
      direction: (p.gradient && p.gradient.direction) || "vertical",
    };
    var ov = p.overlay || {};
    _overlay = {
      textureId: ov.textureId || null,
      color: ov.color || "#000000",
      opacity: ov.opacity != null ? ov.opacity : 0.15,
      scale: ov.scale != null ? ov.scale : 1,
      blendMode: ov.blendMode || "multiply",
    };
    syncUI();
    debouncedRender();
  }

  function syncUI() {
    var c = _containerEl;
    c.querySelectorAll(".ccb-tab").forEach(function (t) {
      t.classList.toggle("active", t.dataset.fill === _fillType);
    });
    c.querySelector(".ccb-fill-solid").classList.toggle("hidden", _fillType !== "solid");
    c.querySelector(".ccb-fill-gradient").classList.toggle("hidden", _fillType !== "gradient");
    c.querySelector(".ccb-solid-color").value = _solid.color;
    c.querySelector(".ccb-grad-color1").value = _gradient.color1;
    c.querySelector(".ccb-grad-color2").value = _gradient.color2;
    c.querySelectorAll(".ccb-dir-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.dir === _gradient.direction);
    });
    c.querySelector(".ccb-tex-color").value = _overlay.color;
    c.querySelector(".ccb-overlay-opacity").value = _overlay.opacity;
    c.querySelector(".ccb-overlay-opacity-label").textContent = Math.round(_overlay.opacity * 100) + "%";
    c.querySelector(".ccb-overlay-scale").value = _overlay.scale;
    c.querySelector(".ccb-overlay-scale-label").textContent = fmtScale(_overlay.scale);
    c.querySelectorAll(".ccb-blend-btn").forEach(function (b) {
      b.classList.toggle("active", b.dataset.mode === _overlay.blendMode);
    });
    c.querySelectorAll(".ccb-tex-thumb").forEach(function (t) {
      t.classList.toggle("active",
        (!_overlay.textureId && t.dataset.texId === "") ||
        (_overlay.textureId && t.dataset.texId === _overlay.textureId));
    });
  }

  function renderPresetList() {
    var list = _containerEl.querySelector(".ccb-presets-list");
    var presets = getPresets();
    if (!presets.length) {
      list.innerHTML = '<p class="ccb-no-presets">Sin presets guardados</p>';
      return;
    }
    list.innerHTML = presets.map(function (p, i) {
      return '<div class="ccb-preset-chip" data-idx="' + i + '">' +
        '<span class="ccb-preset-label">' + p.name + '</span>' +
        '<button class="ccb-preset-delete" data-idx="' + i + '" title="Eliminar">&times;</button>' +
      '</div>';
    }).join("");
  }

  /* ── Public API ──────────────────────────────────────── */
  global.CCCustomBorder = {
    init: function (containerEl, onUpdate) {
      _containerEl = containerEl;
      _onUpdate = onUpdate;
      _offscreen = document.createElement("canvas");
      _offscreen.width = W; _offscreen.height = H;
      _tmpCanvas = document.createElement("canvas");
      _tmpCanvas.width = W; _tmpCanvas.height = H;
      buildUI(containerEl);
      setupEvents();
      loadMask();
      initTextures(function () {
        // Refresh thumbnails now that images are loaded
        var texGrid = containerEl.querySelector(".ccb-texture-grid");
        if (texGrid) {
          texGrid.innerHTML = "";
          var noneDiv = document.createElement("div");
          noneDiv.className = "ccb-tex-thumb ccb-tex-none" + (!_overlay.textureId ? " active" : "");
          noneDiv.dataset.texId = "";
          noneDiv.title = "Ninguna";
          noneDiv.textContent = "\u2014";
          texGrid.appendChild(noneDiv);
          populateTextureThumbs(texGrid);
        }
      });
    },
    destroy: function () {
      if (_rafId) cancelAnimationFrame(_rafId);
      _rafId = null; _maskImg = null; _offscreen = null;
      _tmpCanvas = null; _onUpdate = null;
      if (_containerEl) _containerEl.innerHTML = "";
      _containerEl = null; _textureCanvases = {};
      _active = false;
    },
    isActive: function () { return _active; },
    activate: function () { _active = true; debouncedRender(); },
    deactivate: function () { _active = false; },
    getImageDataUrl: function () {
      return _offscreen ? _offscreen.toDataURL("image/png") : null;
    },
  };

})(window);
