/* ============================================================
   Card Creator – local WoD card generator
   Canvas-based export with configurable output size
   ============================================================ */
(function initCardCreator(global) {
  "use strict";

  const ASSET = "js/tools/card-creator/assets";
  const BLANK_PX = "data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7";

  /* ── Reference card dimensions ─────────────────────── */
  const REF_W = 663, REF_H = 996;

  // Image viewport (CSS margin-top % resolves against card WIDTH)
  const VIEW_X = REF_W * 0.06;          // 39.78
  const VIEW_Y = REF_W * 0.05;          // 33.15 (margin 5% of width)
  const VIEW_W = REF_W * 0.88;          // 583.44
  const VIEW_H = REF_H * 0.75;          // 747

  // Text area top (after image + margin-top 3.5% of width)
  const TEXT_TOP = VIEW_Y + VIEW_H + REF_W * 0.035; // ≈ 803

  const SIZE_PRESETS = [
    { label: "Estándar (663×996)",   w: 663,  h: 996  },
    { label: "x1.5 (995×1494)",      w: 995,  h: 1494 },
    { label: "x2 Grande (1326×1992)", w: 1326, h: 1992 },
    { label: "x3 HD (1989×2988)",    w: 1989, h: 2988 },
    { label: "Personalizado",        w: 0,    h: 0    },
  ];

  /* ── Icon maps ─────────────────────────────────────── */
  const CREATURE_ICONS = {
    none:        `${ASSET}/imagenes/iconos/ninguno.png`,
    cainita:     `${ASSET}/imagenes/iconos/cainita.png`,
    hombreLobo:  `${ASSET}/imagenes/iconos/hombreLobo.png`,
    changeling:  `${ASSET}/imagenes/iconos/changeling.png`,
    mortal:      `${ASSET}/imagenes/iconos/mortal.png`,
    wraith:      `${ASSET}/imagenes/iconos/wraith.png`,
    mage:        `${ASSET}/imagenes/iconos/mage.png`,
  };

  const CLANS = [
    "Ahrimanes","Anda","Assamita","Baali","Brujah","Caitiff","Capadocio",
    "Gangrel","Gargolas","Giovanni","Heraldos-de-las-Calaveras",
    "Hermanos-de-Sangre","Hijas-de-la-Cacofonía","Hijos-de-Osiris",
    "Kiasyd","Lamias","Lasombra","Lhianan","Malkavian","Nagaraja","Noiad",
    "Nosferatu","Ravnos","Salubri","Samedi","Seguidores-de-Set","Toreador",
    "Tremere","Tzimisce","Ventrue","Verdaderos-Brujah",
  ];

  const BORDERS = [
    { file: "greenMarble.png",  label: "Mármol Verde" },
    { file: "redMarble.png",    label: "Mármol Rojo" },
    { file: "whiteMarble.png",  label: "Mármol Blanco" },
    { file: "blackMarble.png",  label: "Mármol Negro" },
    { file: "abyss.png",        label: "Abismo" },
    { file: "anarchy.png",      label: "Anarquistas" },
    { file: "splatter.png",     label: "Frenesí" },
    { file: "blackLeather.png", label: "Cuero Negro" },
    { file: "bouquet.png",      label: "Arikel" },
    { file: "capadocian.png",   label: "Capadocio" },
    { file: "tzimice.png",      label: "Tzimisce" },
    { file: "set.png",          label: "Set" },
    { file: "baali.png",        label: "Shaitan" },
    { file: "gray.png",         label: "Victoriano" },
    { file: "alchemy.png",      label: "Alquimia" },
    { file: "Gotico.png",       label: "Gótico" },
    { file: "oxido.png",        label: "Óxido" },
    { file: "circuit.png",      label: "Tecnocracia" },
    { file: "bluePaint.png",    label: "Pintura Azul" },
    { file: "goldPaint.png",    label: "Pintura Dorada" },
    { file: "lilaPaint.png",    label: "Pintura Rosa" },
    { file: "orangePaint.png",  label: "Pintura Naranja" },
    { file: "greenPaint.png",   label: "Pintura Verde" },
    { file: "jungleFrame.png",  label: "El Seto" },
    { file: "Plinket.png",      label: "Plinket" },
    { file: "stoneWall.png",    label: "Pared de Piedra" },
    { file: "woodenFrame.png",  label: "Vikingo" },
    { file: "Uktena.png",       label: "Uktena" },
    { file: "Theurge.png",      label: "Theurge" },
  ];

  /* ── State ─────────────────────────────────────────── */
  let currentType = "none";
  let currentPosition = "center";
  let currentBorder = "";
  let baseWidth = 0;
  let baseHeight = 0;
  let currentScale = 1;

  /* ── DOM refs (populated in init) ──────────────────── */
  let el = {};

  /* ── Helpers ───────────────────────────────────────── */
  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return (ctx || document).querySelectorAll(sel); }

  function getImageFilter() {
    const b = parseFloat(el.brightness?.value) || 1;
    const c = parseFloat(el.contrast?.value) || 1;
    const s = parseFloat(el.saturate?.value) || 1;
    return `brightness(${b}) contrast(${c}) saturate(${s})`;
  }

  function changeBorder(url) {
    const layer = $(".cc-border-layer");
    if (layer) layer.style.backgroundImage = `url('${url}')`;
  }

  function changeImage(url) {
    const img = $(".cc-user-image img");
    if (!img) return;
    img.src = url;
    img.onerror = () =>
      alert("No se puede usar esa imagen.\nBajala y subila con el botón 'Subir imagen'.");
  }

  /* ── Position / Zoom ───────────────────────────────── */
  function updateSliders() {
    const container = $(".cc-user-image");
    const img = $(".cc-user-image img");
    if (!container || !img) return;

    const CW = container.clientWidth;
    const CH = container.clientHeight;
    const IW = baseWidth * currentScale;
    const IH = baseHeight * currentScale;

    const xMin = 20 - IW, xMax = CW - 20;
    const yMin = 20 - IH, yMax = CH - 20;

    el.rangeX.min = xMin;  el.rangeX.max = xMax;
    el.rangeX.value = Math.max(xMin, Math.min(xMax, +el.rangeX.value));

    el.rangeY.min = yMin;  el.rangeY.max = yMax;
    el.rangeY.value = Math.max(yMin, Math.min(yMax, +el.rangeY.value));

    el.rangeZoom.min = -200; el.rangeZoom.max = 200;

    img.style.left = `${el.rangeX.value}px`;
    img.style.top  = `${el.rangeY.value}px`;
  }

  function initImageFit() {
    const container = $(".cc-user-image");
    const img = $(".cc-user-image img");
    if (!container || !img) return;

    baseWidth  = img.clientWidth;
    baseHeight = img.clientHeight;

    const scaleW = container.clientWidth / baseWidth;
    const scaleH = container.clientHeight / baseHeight;
    currentScale = Math.max(scaleW, scaleH);
    img.style.transform = `scale(${currentScale})`;

    const sliderVal = currentScale >= 1
      ? (currentScale - 1) * 100
      : -(1 - 1 / currentScale) * 100;
    el.rangeZoom.value = sliderVal;
    el.rangeX.value = 0;
    el.rangeY.value = 0;
    updateSliders();
  }

  /* ── Creature type logic ───────────────────────────── */
  function setCreatureType(type) {
    currentType = type;
    if (type === "none") {
      el.typeIcon.src = BLANK_PX;
      el.typeIcon.classList.add("hidden");
    } else {
      el.typeIcon.src = CREATURE_ICONS[type] || CREATURE_ICONS.none;
      el.typeIcon.classList.remove("hidden");
    }

    if (type === "cainita") {
      el.clanForm.classList.remove("hidden");
    } else {
      el.clanForm.classList.add("hidden");
      el.clanSelect.value = "ninguno";
      el.clanIcon.src = BLANK_PX;
      el.clanIcon.classList.add("hidden");
    }
    updatePositionButtons();
  }

  function updatePositionButtons() {
    const disabled = currentType === "none";
    el.positionBtns.classList.toggle("cc-disabled", disabled);
    $$(".cc-pos-btn").forEach(b => {
      b.disabled = disabled;
      b.classList.toggle("active", !disabled && b.dataset.pos === currentPosition);
    });
  }

  /* ── Build dynamic HTML ────────────────────────────── */
  function buildCreatureIcons(container) {
    Object.entries(CREATURE_ICONS).forEach(([key, src]) => {
      const wrap = document.createElement("div");
      wrap.className = "cc-icon-container";
      const label = key === "none" ? "Ninguno"
        : key === "hombreLobo" ? "Hombre Lobo"
        : key.charAt(0).toUpperCase() + key.slice(1);
      wrap.innerHTML = `
        <img class="cc-icon-thumb" data-type="${key}" src="${src}" alt="${label}">
        <p class="cc-icon-label">${label}</p>`;
      container.appendChild(wrap);
    });
  }

  function buildClanOptions(select) {
    select.innerHTML = '<option value="ninguno">Ninguno</option>';
    CLANS.forEach(c => {
      const opt = document.createElement("option");
      opt.value = c;
      opt.textContent = c.replace(/-/g, " ");
      select.appendChild(opt);
    });
  }

  function buildBorderThumbs(container) {
    BORDERS.forEach((b, i) => {
      const url = `${ASSET}/imagenes/bordes/${b.file}`;
      const img = document.createElement("img");
      img.className = "cc-border-thumb" + (i === 0 ? " active" : "");
      img.dataset.border = url;
      img.src = url;
      img.alt = b.label;
      img.width = 60;
      container.appendChild(img);
    });
  }

  /* ── Canvas export helpers ─────────────────────────── */
  function loadImg(src) {
    return new Promise(resolve => {
      if (!src || src === BLANK_PX) { resolve(null); return; }
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => resolve(null);
      img.src = src;
    });
  }

  function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    // Split by explicit line breaks first
    const paragraphs = text.split(/\r?\n/);
    let currY = y;

    for (const paragraph of paragraphs) {
      if (paragraph === "") {
        // Empty line = just add line height
        currY += lineHeight;
        continue;
      }

      const words = paragraph.split(" ");
      let line = "";

      for (const word of words) {
        const test = line + (line ? " " : "") + word;
        if (ctx.measureText(test).width > maxWidth && line) {
          ctx.fillText(line, x, currY);
          line = word;
          currY += lineHeight;
        } else {
          line = test;
        }
      }
      if (line) {
        ctx.fillText(line, x, currY);
        currY += lineHeight;
      }
    }
  }

  function getExportSize() {
    const idx = el.sizeSelect.selectedIndex;
    const preset = SIZE_PRESETS[idx];
    if (preset && preset.w > 0) return [preset.w, preset.h];
    // Custom: read width, calculate height keeping 663:996 ratio
    const w = Math.max(100, parseInt(el.customW.value, 10) || REF_W);
    const h = Math.round(w * (REF_H / REF_W));
    return [w, h];
  }

  /* ── Export to PNG via Canvas ───────────────────────── */
  async function exportCard() {
    const exportBtn = $("#cc-export-btn");
    exportBtn.disabled = true;
    exportBtn.textContent = "Exportando...";

    try {
      await document.fonts.ready;

      const [W, H] = getExportSize();
      const sx = W / REF_W;
      const sy = H / REF_H;

      // Padding around card for the border drop shadow
      // CSS shadow: drop-shadow(0 12px 5px ...) → max extent ≈ 17px ref
      const SHADOW_PAD = Math.ceil(25 * Math.max(sx, sy));

      const canvas = document.createElement("canvas");
      canvas.width  = W + SHADOW_PAD * 2;
      canvas.height = H + SHADOW_PAD * 2;
      const ctx = canvas.getContext("2d");

      // All card content offset by pad so shadow has room
      const ox = SHADOW_PAD, oy = SHADOW_PAD;

      // ── 1. User image (clipped to viewport) ──
      const vx = ox + VIEW_X * sx, vy = oy + VIEW_Y * sy;
      const vw = VIEW_W * sx, vh = VIEW_H * sy;

      const userImgEl = $(".cc-user-image img");
      const userImg = await loadImg(userImgEl?.src);
      if (userImg) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(vx, vy, vw, vh);
        ctx.clip();
        ctx.filter = getImageFilter();

        const drawW = baseWidth * currentScale * sx;
        const drawH = baseHeight * currentScale * sy;
        const drawX = vx + parseFloat(el.rangeX.value) * sx;
        const drawY = vy + parseFloat(el.rangeY.value) * sy;
        ctx.drawImage(userImg, drawX, drawY, drawW, drawH);
        ctx.restore();
      }

      // ── 2. Border frame (full card) + drop shadow ──
      let borderSrc;
      if (global.CCCustomBorder && global.CCCustomBorder.isActive()) {
        borderSrc = global.CCCustomBorder.getImageDataUrl();
      } else {
        const activeBorder = $(".cc-border-thumb.active");
        borderSrc = activeBorder?.dataset.border;
      }
      if (borderSrc) {
        const borderImg = await loadImg(borderSrc);
        if (borderImg) {
          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.56)";
          ctx.shadowOffsetX = 0;
          ctx.shadowOffsetY = 12 * sy;
          ctx.shadowBlur = 5 * Math.max(sx, sy);
          ctx.drawImage(borderImg, ox, oy, W, H);
          ctx.restore();
        }
      }

      // ── 3. Type icon ──
      if (currentType !== "none") {
        const typeImg = await loadImg(el.typeIcon.src);
        if (typeImg) {
          const isCenter = currentPosition === "center";
          const iconRef = isCenter ? 70 : 120;
          const iw = iconRef * sx, ih = iconRef * sy;
          let ix, iy;
          if (isCenter) {
            ix = ox + W / 2 - iw / 2;
            iy = oy + (-15 * sy);
          } else if (currentPosition === "left") {
            ix = ox + 7 * sx;
            iy = oy + 3 * sy;
          } else {
            ix = ox + W - 7 * sx - iw;
            iy = oy + 3 * sy;
          }

          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 5 * Math.min(sx, sy);
          ctx.shadowOffsetX = (currentPosition === "right" ? -3 : 3) * sx;
          ctx.shadowOffsetY = 3 * sy;
          ctx.drawImage(typeImg, ix, iy, iw, ih);
          ctx.restore();
        }
      }

      // ── 4. Clan icon ──
      if (!el.clanIcon.classList.contains("hidden") && el.clanIcon.src !== BLANK_PX) {
        const clanImg = await loadImg(el.clanIcon.src);
        if (clanImg) {
          const cw = 120 * sx;
          const ch = (clanImg.naturalHeight / clanImg.naturalWidth) * cw;
          const cx = ox + 0.10 * W - cw * 0.5;
          const cy = oy + H - 200 * sy - ch;

          ctx.save();
          ctx.shadowColor = "rgba(0,0,0,0.5)";
          ctx.shadowBlur = 10 * Math.min(sx, sy);
          ctx.shadowOffsetX = 5 * sx;
          ctx.shadowOffsetY = -2 * sy;
          ctx.drawImage(clanImg, cx, cy, cw, ch);
          ctx.restore();
        }
      }

      // ── 5. Text backdrop (custom border only) + Text ──
      const titleText = el.nameInput.value || "";
      const descText  = el.descInput.value || "";
      const isCustomBorder = global.CCCustomBorder && global.CCCustomBorder.isActive();

      if (isCustomBorder && (titleText || descText)) {
        const bdW = REF_W * 0.84 * sx;
        const bdH = REF_H * 0.14 * sy;
        const bdX = ox + (W - bdW) / 2;
        const bdY = oy + TEXT_TOP * sy;
        const bdR = 12 * Math.min(sx, sy);
        ctx.save();
        ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
        ctx.beginPath();
        ctx.roundRect(bdX, bdY, bdW, bdH, bdR);
        ctx.fill();
        ctx.restore();
      }

      if (titleText || descText) {
        const textCenterX = ox + W / 2;
        const textMaxW = REF_W * 0.84 * sx;
        const titleY = oy + TEXT_TOP * sy + 12 * sy;

        ctx.save();
        ctx.shadowColor = "#000";
        ctx.shadowOffsetX = 3 * sx;
        ctx.shadowOffsetY = 3 * sy;
        ctx.shadowBlur = 1 * Math.min(sx, sy);
        ctx.textAlign = "center";
        ctx.textBaseline = "top";

        // Title
        const titleScale = parseFloat(el.titleSizeRange.value) || 1;
        const titleFontPx = Math.round(32 * titleScale * sx);
        if (titleText) {
          ctx.fillStyle = "#fff";
          ctx.font = `bold ${titleFontPx}px Delavan, sans-serif`;
          ctx.fillText(titleText, textCenterX, titleY, textMaxW);
        }

        // Description
        const descScale = parseFloat(el.descSizeRange.value) || 1;
        const descFontPx = Math.round(24 * descScale * sx);
        if (descText) {
          ctx.fillStyle = "rgba(255,255,255,0.73)";
          ctx.font = `${descFontPx}px Goudos, serif`;
          const lineH = Math.round(29 * descScale * sy);
          const descY = titleY + (titleText ? Math.round(44 * titleScale * sy) : 0);
          wrapText(ctx, descText, textCenterX, descY, textMaxW, lineH);
        }

        ctx.restore();
      }

      // ── 6. Download ──
      canvas.toBlob(blob => {
        if (!blob) { alert("Error generando la imagen."); return; }
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        const name = el.nameInput.value.trim();
        link.download = (name ? name + " - Retrato" : "carta") + ".png";
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
      }, "image/png");

    } catch (err) {
      console.error("Error exportando carta:", err);
      alert("Error al exportar la carta. Revisá la consola para más detalles.");
    } finally {
      exportBtn.disabled = false;
      exportBtn.textContent = "Descargar PNG";
    }
  }

  /* ── Init ──────────────────────────────────────────── */
  global.initCardCreatorLocal = async function () {
    const root = $("#cc-root");
    if (!root) return;

    // Build dynamic sections
    buildCreatureIcons($("#cc-creature-icons"));
    buildClanOptions($("#cc-clan-select"));
    buildBorderThumbs($("#cc-border-options"));

    // Build size selector options
    const sizeSelect = $("#cc-size-select");
    const DEFAULT_SIZE_INDEX = 2; // x2 Grande (1326×1992)
    SIZE_PRESETS.forEach((p, i) => {
      const opt = document.createElement("option");
      opt.value = i;
      opt.textContent = p.label;
      sizeSelect.appendChild(opt);
    });
    sizeSelect.selectedIndex = DEFAULT_SIZE_INDEX;

    // Cache elements
    el = {
      typeIcon:     $(".cc-type-icon"),
      clanIcon:     $(".cc-clan-icon"),
      clanForm:     $("#cc-clan-form"),
      clanSelect:   $("#cc-clan-select"),
      positionBtns: $(".cc-position-buttons"),
      rangeX:       $("#cc-range-x"),
      rangeY:       $("#cc-range-y"),
      rangeZoom:    $("#cc-range-zoom"),
      nameInput:    $("#cc-card-name"),
      descInput:    $("#cc-card-desc"),
      cardText:     $(".cc-card-text"),
      cardTitle:    $(".cc-card-title"),
      cardDesc:     $(".cc-card-description"),
      selectedBorderSpan: $("#cc-selected-border"),
      selectedBorderRow: $("#cc-selected-border-row"),
      fileInput:    $("#cc-file-input"),
      urlInput:     $("#cc-url-input"),
      sizeSelect:   sizeSelect,
      customW:      $("#cc-custom-w"),
      customRow:    $("#cc-custom-size-row"),
      titleSizeRange: $("#cc-title-size"),
      descSizeRange:  $("#cc-desc-size"),
      brightness:     $("#cc-brightness"),
      contrast:       $("#cc-contrast"),
      saturate:       $("#cc-saturate"),
    };

    const img = $(".cc-user-image img");

    // ── Font size sliders ──
    function sizeLabel(val) {
      const diff = Math.round((val - 1) * 10);
      return diff === 0 ? "0" : (diff > 0 ? "+" + diff : String(diff));
    }

    el.titleSizeRange.addEventListener("input", () => {
      const v = parseFloat(el.titleSizeRange.value);
      el.cardTitle.style.fontSize = `${2 * v}rem`;
      $("#cc-title-size-label").textContent = sizeLabel(v);
    });
    el.descSizeRange.addEventListener("input", () => {
      const v = parseFloat(el.descSizeRange.value);
      el.cardDesc.style.fontSize = `${1.5 * v}rem`;
      $("#cc-desc-size-label").textContent = sizeLabel(v);
    });

    // ── Image filters ──
    function updateImageFilter() {
      const userImg = $(".cc-user-image img");
      if (userImg) userImg.style.filter = getImageFilter();
    }

    [el.brightness, el.contrast, el.saturate].forEach((slider, i) => {
      const labelId = ["#cc-brightness-label", "#cc-contrast-label", "#cc-saturate-label"][i];
      slider.addEventListener("input", () => {
        $(labelId).textContent = sizeLabel(parseFloat(slider.value));
        updateImageFilter();
      });
    });

    // ── Size selector ──
    sizeSelect.addEventListener("change", () => {
      const isCustom = SIZE_PRESETS[sizeSelect.selectedIndex]?.w === 0;
      el.customRow.classList.toggle("hidden", !isCustom);
    });

    // ── Creature type icons ──
    $$("#cc-creature-icons .cc-icon-thumb").forEach(thumb => {
      thumb.addEventListener("click", () => {
        $$(".cc-icon-thumb").forEach(t => t.classList.remove("active"));
        thumb.classList.add("active");
        setCreatureType(thumb.dataset.type);
      });
    });
    const noneThumb = $('[data-type="none"]');
    if (noneThumb) noneThumb.classList.add("active");

    // ── Clan selector ──
    el.clanSelect.addEventListener("change", () => {
      const val = el.clanSelect.value;
      if (val && val !== "ninguno") {
        el.clanIcon.src = `${ASSET}/imagenes/iconos/clanes/${val}.png`;
        el.clanIcon.classList.remove("hidden");
      } else {
        el.clanIcon.src = BLANK_PX;
        el.clanIcon.classList.add("hidden");
      }
    });

    // ── Border selection ──
    const borderThumbs = $$(".cc-border-thumb");
    borderThumbs.forEach(thumb => {
      thumb.addEventListener("click", () => {
        borderThumbs.forEach(t => t.classList.remove("active"));
        thumb.classList.add("active");
        changeBorder(thumb.dataset.border);
        el.selectedBorderSpan.textContent = thumb.alt || "";
        currentBorder = thumb.alt || "";
      });
    });
    const initialBorder = $(".cc-border-thumb.active");
    if (initialBorder) {
      changeBorder(initialBorder.dataset.border);
      el.selectedBorderSpan.textContent = initialBorder.alt || "";
      currentBorder = initialBorder.alt || "";
    }

    // ── Mode toggle (Gallery ↔ Custom) ──
    let _customInited = false;
    const modeBtns = $$(".cc-mode-btn");
    const galleryPanel = $("#cc-border-options");
    const customPanel = $("#cc-custom-border-panel");

    function setBorderMode(mode) {
      modeBtns.forEach(b => b.classList.toggle("active", b.dataset.mode === mode));
      galleryPanel.classList.toggle("hidden", mode !== "gallery");
      customPanel.classList.toggle("hidden", mode !== "custom");
      if (el.selectedBorderRow) {
        el.selectedBorderRow.classList.toggle("hidden", mode !== "gallery");
      }

      if (mode === "custom") {
        if (!_customInited && global.CCCustomBorder) {
          global.CCCustomBorder.init(customPanel, changeBorder);
          _customInited = true;
        }
        if (global.CCCustomBorder) global.CCCustomBorder.activate();
        el.cardText.classList.add("cc-text-backdrop");
      } else {
        if (global.CCCustomBorder) global.CCCustomBorder.deactivate();
        el.cardText.classList.remove("cc-text-backdrop");
        const active = $(".cc-border-thumb.active");
        if (active) {
          changeBorder(active.dataset.border);
          el.selectedBorderSpan.textContent = active.alt || "";
        }
      }
    }

    modeBtns.forEach(btn => {
      btn.addEventListener("click", () => setBorderMode(btn.dataset.mode));
    });

    // ── Text inputs → live preview ──
    el.nameInput.addEventListener("input", () => {
      el.cardTitle.textContent = el.nameInput.value || "Nombre del personaje";
    });
    el.descInput.addEventListener("input", () => {
      const text = el.descInput.value;
      if (text) {
        // Convert newlines to <br> for preview, escape HTML first
        const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
        el.cardDesc.innerHTML = escaped.replace(/\n/g, "<br>");
      } else {
        el.cardDesc.textContent = "Breve descripción del personaje";
      }
    });

    // ── Image upload (file) ──
    el.fileInput.addEventListener("change", () => {
      if (!el.fileInput.files.length) return;
      const reader = new FileReader();
      reader.onload = (e) => {
        changeImage(e.target.result);
        img.onload = () => {
          baseWidth = img.naturalWidth;
          baseHeight = img.naturalHeight;
          currentScale = 1;
          img.style.transform = "scale(1)";
          initImageFit();
        };
      };
      reader.readAsDataURL(el.fileInput.files[0]);
      el.urlInput.value = "";
    });

    // ── Image from URL ──
    el.urlInput.addEventListener("change", () => {
      const url = el.urlInput.value.trim();
      if (!url) return;
      el.fileInput.value = "";
      fetch(url)
        .then(r => { if (!r.ok) throw new Error(); return r.blob(); })
        .then(blob => {
          const objUrl = URL.createObjectURL(blob);
          changeImage(objUrl);
          img.onload = () => {
            baseWidth = img.naturalWidth;
            baseHeight = img.naturalHeight;
            currentScale = 1;
            img.style.transform = "scale(1)";
            initImageFit();
          };
        })
        .catch(() => {
          changeImage(url);
          img.onload = () => {
            baseWidth = img.naturalWidth;
            baseHeight = img.naturalHeight;
            currentScale = 1;
            img.style.transform = "scale(1)";
            initImageFit();
          };
        });
    });

    // ── Image from clipboard (Ctrl+V / Cmd+V) ──
    document.addEventListener("paste", (e) => {
      const items = e.clipboardData?.items;
      if (!items) return;
      for (const item of items) {
        if (!item.type.startsWith("image/")) continue;
        e.preventDefault();
        const blob = item.getAsFile();
        if (!blob) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
          changeImage(ev.target.result);
          img.onload = () => {
            baseWidth = img.naturalWidth;
            baseHeight = img.naturalHeight;
            currentScale = 1;
            img.style.transform = "scale(1)";
            initImageFit();
          };
        };
        reader.readAsDataURL(blob);
        el.fileInput.value = "";
        el.urlInput.value = "";
        return;
      }
    });

    // ── Sliders ──
    el.rangeX.addEventListener("input", () => { img.style.left = `${el.rangeX.value}px`; });
    el.rangeY.addEventListener("input", () => { img.style.top  = `${el.rangeY.value}px`; });
    el.rangeZoom.addEventListener("input", () => {
      const val = parseInt(el.rangeZoom.value, 10);
      currentScale = val >= 0 ? 1 + val / 100 : 1 / (1 - val / 100);
      img.style.transform = `scale(${currentScale})`;
      updateSliders();
    });

    // ── Drag to move on preview ──
    const userImageContainer = $(".cc-user-image");
    let isDragging = false;
    let dragStartX, dragStartY, dragStartLeft, dragStartTop;

    function getZoomFactor() {
      const rect = userImageContainer.getBoundingClientRect();
      return rect.width / userImageContainer.clientWidth;
    }

    function onDragStart(clientX, clientY) {
      isDragging = true;
      dragStartX = clientX;
      dragStartY = clientY;
      dragStartLeft = parseFloat(el.rangeX.value) || 0;
      dragStartTop = parseFloat(el.rangeY.value) || 0;
      userImageContainer.classList.add("cc-dragging");
    }

    function onDragMove(clientX, clientY) {
      if (!isDragging) return;
      const zoom = getZoomFactor();
      const dx = (clientX - dragStartX) / zoom;
      const dy = (clientY - dragStartY) / zoom;
      el.rangeX.value = dragStartLeft + dx;
      el.rangeY.value = dragStartTop + dy;
      img.style.left = `${el.rangeX.value}px`;
      img.style.top  = `${el.rangeY.value}px`;
    }

    function onDragEnd() {
      if (!isDragging) return;
      isDragging = false;
      userImageContainer.classList.remove("cc-dragging");
    }

    // Mouse
    userImageContainer.addEventListener("mousedown", (e) => {
      e.preventDefault();
      onDragStart(e.clientX, e.clientY);
    });
    document.addEventListener("mousemove", (e) => onDragMove(e.clientX, e.clientY));
    document.addEventListener("mouseup", onDragEnd);

    // Touch
    userImageContainer.addEventListener("touchstart", (e) => {
      if (e.touches.length !== 1) return;
      e.preventDefault();
      const t = e.touches[0];
      onDragStart(t.clientX, t.clientY);
    }, { passive: false });
    document.addEventListener("touchmove", (e) => {
      if (!isDragging || e.touches.length !== 1) return;
      const t = e.touches[0];
      onDragMove(t.clientX, t.clientY);
    });
    document.addEventListener("touchend", onDragEnd);

    // ── Scroll wheel zoom on preview ──
    userImageContainer.addEventListener("wheel", (e) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? -5 : 5;
      el.rangeZoom.value = Math.max(-200, Math.min(200, parseInt(el.rangeZoom.value, 10) + delta));
      const val = parseInt(el.rangeZoom.value, 10);
      currentScale = val >= 0 ? 1 + val / 100 : 1 / (1 - val / 100);
      img.style.transform = `scale(${currentScale})`;
      updateSliders();
    }, { passive: false });

    // ── Position buttons ──
    $$(".cc-pos-btn").forEach(btn => {
      btn.addEventListener("click", () => {
        currentPosition = btn.dataset.pos;
        el.typeIcon.className = `icon cc-type-icon ${currentPosition}`;
        updatePositionButtons();
      });
    });

    // ── Export ──
    $("#cc-export-btn").addEventListener("click", exportCard);

    // ── Init ──
    setCreatureType("none");
    if (img.complete) initImageFit();
    else img.addEventListener("load", initImageFit);
  };
})(window);
