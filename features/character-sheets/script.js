const ratings = document.querySelectorAll(".rating");
let currentSheetId = null;
let currentAvatarUrl = null;
let currentAvatarPosition = { x: 50, y: 50, scale: 1 };
let currentAvatarOriginalUrl = null;
let currentAvatarThumbUrl = null;
const DEFAULT_AVATAR_POSITION = Object.freeze({ x: 50, y: 50, scale: 1 });
const AVATAR_SCALE_MIN = 1;
const AVATAR_SCALE_MAX = 3;
const ratingDotsModule = window.ABNSheetRatingDots;
const uiRefreshModule = window.ABNSheetUIRefresh;
const sheetModeModule = window.ABNSheetMode;
sheetModeModule?.init();

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function normalizeAvatarPosition(position) {
  const x = Number(position?.x);
  const y = Number(position?.y);
  const scale = Number(position?.scale);
  return {
    x: Number.isFinite(x) ? clamp(x, 0, 100) : DEFAULT_AVATAR_POSITION.x,
    y: Number.isFinite(y) ? clamp(y, 0, 100) : DEFAULT_AVATAR_POSITION.y,
    scale: Number.isFinite(scale) ? clamp(scale, AVATAR_SCALE_MIN, AVATAR_SCALE_MAX) : DEFAULT_AVATAR_POSITION.scale,
  };
}

function isEditMode() {
  return sheetModeModule?.isEditMode?.() ?? true;
}

//Funcion que actualiza todos lo que hay que actualizar al visualizar/cargar la pagina
function updateAll() {
  if (uiRefreshModule) {
    uiRefreshModule.updateAll();
    return;
  }
  updateHTMLTitle();
}

//function to update the HTML title based on the character name
function updateHTMLTitle() {
  if (uiRefreshModule) {
    uiRefreshModule.updateHTMLTitle();
    return;
  }
  const nameValue = document.querySelector("#nombre")?.value || "";
  document.title = nameValue
    ? `${nameValue} - Vampiro v20 - Hoja de personaje`
    : "Vampiro v20 - Hoja de personaje";
}

// //////// Theme & Font System //////// //
const APP_THEME_KEY = "abn_theme";
const APP_FONT_KEY = "abn_font";

function createSheetModalController({ overlay, closeButtons = [], onOpen, onClose } = {}) {
  const sharedFactory = window.ABNShared?.modal?.createController;
  if (typeof sharedFactory === "function") {
    return sharedFactory({
      overlay,
      closeButtons,
      visibleClass: "abn-modal-open",
      onOpen: (el) => {
        el.classList.remove("hidden");
        el.setAttribute("aria-hidden", "false");
        if (typeof onOpen === "function") onOpen(el);
      },
      onClose: (el) => {
        el.classList.add("hidden");
        el.setAttribute("aria-hidden", "true");
        if (typeof onClose === "function") onClose(el);
      },
    });
  }

  const modal = overlay;
  const validButtons = (closeButtons || []).filter(Boolean);
  if (!modal) {
    return {
      open() {},
      close() {},
      isOpen() {
        return false;
      },
      destroy() {},
      overlay: null,
    };
  }

  function isOpen() {
    return !modal.classList.contains("hidden");
  }

  function open() {
    if (isOpen()) return;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    if (typeof onOpen === "function") onOpen(modal);
  }

  function close() {
    if (!isOpen()) return;
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    if (typeof onClose === "function") onClose(modal);
  }

  const onOverlayClick = (event) => {
    if (event.target === modal) close();
  };
  const onKeyDown = (event) => {
    if (event.key === "Escape" && isOpen()) close();
  };

  modal.addEventListener("click", onOverlayClick);
  document.addEventListener("keydown", onKeyDown);
  validButtons.forEach((btn) => btn.addEventListener("click", close));

  return {
    open,
    close,
    isOpen,
    destroy() {
      modal.removeEventListener("click", onOverlayClick);
      document.removeEventListener("keydown", onKeyDown);
      validButtons.forEach((btn) => btn.removeEventListener("click", close));
    },
    overlay: modal,
  };
}

const themeDiscordModule = window.ABNSheetThemeDiscord;
if (themeDiscordModule) {
  themeDiscordModule.configure({
    createModalController: createSheetModalController,
    onExportPdf: downloadCharacterPdf,
    onSave: saveCharacterData,
    appThemeKey: APP_THEME_KEY,
    appFontKey: APP_FONT_KEY,
  });
  themeDiscordModule.init();
}

function loadDiscordWebhookFromJSON(characterData) {
  themeDiscordModule?.loadDiscordWebhookFromCharacterData(characterData);
}

function getDiscordConfig() {
  return themeDiscordModule
    ? themeDiscordModule.getDiscordConfig()
    : { webhookUrl: "", enabled: false };
}

const clanHeaderModule = window.ABNSheetClanHeader;
if (clanHeaderModule) {
  clanHeaderModule.configure({
    createModalController: createSheetModalController,
    onSave: saveCharacterData,
    getCurrentAvatarUrl: () => currentAvatarUrl,
    getCurrentAvatarPosition: () => currentAvatarPosition,
    hasAvatarThumb: () => !!currentAvatarThumbUrl,
  });
  clanHeaderModule.init();
}

function openClanModal() {
  clanHeaderModule?.openModal();
}

function closeClanModal() {
  clanHeaderModule?.closeModal();
}

function updateClanFieldSigil() {
  clanHeaderModule?.updateClanFieldSigil();
}

function updateHeaderLogo() {
  clanHeaderModule?.updateHeaderLogo();
}

//////////////////////////////////////////////
// // // Atributos Fisicos Temporales // // //
//////////////////////////////////////////////

// (Attribute boost mouse enter/leave removed — handled by CSS hover on .physical-attr)

/// FUNCIONALIDAD DE LOS PUNTITOS AL HACER CLICK ///
////////////////////////////////////////////////////
// Loop through each rating element
ratings.forEach((rating) => {
  // Get the hidden input — normally the immediate next sibling,
  // but for physical attributes wrapped in .attr-rating-wrap the input is outside the wrap.
  let input = rating.nextElementSibling;
  if (!input || input.type !== "hidden") {
    const wrap = rating.closest(".attr-rating-wrap");
    if (wrap) input = wrap.nextElementSibling;
  }
  if (!input) return; // safety bail
  const dots = rating.querySelectorAll(".dot");

  // Add click event listener to each dot
  dots.forEach((dot, index) => {
    if (!dot.closest("#blood-track")) {
      dot.addEventListener("click", () => {
        const isAttributesOrAbilitiesRating = Boolean(
          rating.closest(".attributes, .abilities")
        );
        const isVirtuesRating = Boolean(rating.closest(".virtue-pane"));
        if (isAttributesOrAbilitiesRating && !isEditMode()) return;
        if (isVirtuesRating && !isEditMode()) return;

        const currentValue = parseInt(input.value) || 0;

        // Click on the last active dot → toggle it off (decrease by 1)
        if (index + 1 === currentValue) {
          input.value = index;
          dots.forEach((innerDot, innerIndex) => {
            if (innerIndex < index) {
              innerDot.classList.add("filled");
            } else {
              innerDot.classList.remove("filled");
            }
          });
        } else {
          // Set to clicked dot level
          input.value = index + 1;
          dots.forEach((innerDot, innerIndex) => {
            if (innerIndex <= index) {
              innerDot.classList.add("filled");
            } else {
              innerDot.classList.remove("filled");
            }
          });
        }
        blockTemporalWillpower();
        blockVirtues();

        // Update specialty icon visibility after changing dots
        const attributeId = input.id.replace('-value', '');
        updateSpecialtyIconVisibility(attributeId);

        saveCharacterData();
      });
    }
  });
});

const attributeBoostModule = window.ABNSheetAttributeBoost;
if (attributeBoostModule) {
  attributeBoostModule.configure({
    createModalController: createSheetModalController,
    onSave: saveCharacterData,
  });
  attributeBoostModule.init();
}

function initAttributeBoost() {
  attributeBoostModule?.init();
}

function syncBoostBadges() {
  attributeBoostModule?.syncBadges();
}

initAttributeBoost();
syncBoostBadges();

if (uiRefreshModule) {
  uiRefreshModule.configure({
    updateRatingDots,
    updateHealthSquares,
    updateBloodPerTurn,
    updateBloodUI,
    updateDamagePenalty,
    resetAllDice,
    updateHeaderLogo,
    updateClanFieldSigil,
    updateDisciplineButtons,
    blockTemporalWillpower,
    blockVirtues,
    syncVirtueLabels,
    updateAllSpecialtyVisibility,
    syncBoostBadges,
    nameSelector: "#nombre",
  });
}

const tabsModule = window.ABNSheetTabs;
tabsModule?.init();

// Define function to update dots (que es llamada al cargar el archivo)
function updateRatingDots(rating) {
  ratingDotsModule?.updateDots(rating);
}

const persistenceModule = window.ABNSheetPersistence;

function saveCharacterData() {
  persistenceModule?.saveCharacterData();
}

function flushPendingSave() {
  persistenceModule?.flushPendingSave();
}

if (persistenceModule) {
  persistenceModule.configure({
    getCurrentSheetId: () => currentSheetId,
    getCharacterData,
    getCharacterName: () => document.getElementById("nombre")?.value || "",
    supabaseClient: window.supabase,
    getSaveIcon: () => document.querySelector('ion-icon[name="save-sharp"]'),
    localStorageKey: "characterData",
  });
  persistenceModule.initLifecycleHooks();
}

// Load character data from JSON object (DB)
function loadCharacterFromJSON(characterData) {
  // Loop through all input or select elements
  const inputs = document.querySelectorAll("input" + ", select");
  inputs.forEach((input) => {
    const id = input.id;
    const value = characterData[id];
    // Check if the input has an ID and a value
    if (id && value) {
      // Set the input value from the characterData object
      input.value = value;

      // Load specialties if they exist
      if (id.endsWith('-value')) {
        const specialtiesKey = id + '-specialties';
        if (characterData[specialtiesKey]) {
          input.setAttribute('data-specialties', characterData[specialtiesKey]);
        }
      }
    }
  });
  // Each loader is isolated so an error in one system never prevents
  // later systems (merits, defects, rolls, etc.) from loading.
  const safeLoad = (label, fn) => {
    try { fn(); } catch (e) { console.error(`[Load] Error in ${label}:`, e); }
  };

  safeLoad("Disciplines", () => {
    loadDisciplinesFromJSON(characterData);
    loadSendasFromJSON(characterData);
    loadPowersFromJSON(characterData);
    migrateCustomDisciplinesToPowers();
    renderDisciplineList();
    renderPowersList();
  });

  safeLoad("Backgrounds", () => loadBackgroundsFromJSON(characterData));

  safeLoad("Merits & Defects", () => {
    loadMeritsFromJSON(characterData);
    loadDefectsFromJSON(characterData);
  });

  safeLoad("Rituals", () => loadRitualsFromJSON(characterData));

  safeLoad("Attacks", () => loadAttacksFromJSON(characterData));

  safeLoad("XP Arcs", () => loadXpArcsFromJSON(characterData));

  safeLoad("Saved Rolls", () => loadSavedRollsFromJSON(characterData));

  safeLoad("Discord Webhook", () => loadDiscordWebhookFromJSON(characterData));

  safeLoad("3D Dice", () => {
    const diceBox3d = window.ABNSheetDiceBox3D;
    if (diceBox3d) diceBox3d.loadFromCharacterData(characterData);
  });

  // Update Ghoul Visuals if function exists
  if (window.updateGhoulVisuals && characterData.selectedGhoul) {
    window.updateGhoulVisuals(characterData.selectedGhoul);
  } else if (window.updateGhoulVisuals) {
    // Default to Igor if not saved
    window.updateGhoulVisuals("igor");
  }

  updateAll();
}

// Deprecated local storage loader needed for initial state if not using DB?
// We will replace usage in onload.
function loadCharacterData() {
  // Left empty or used as fallback
}

function revealSheet() {
  const skel = document.getElementById("sheet-skeleton");
  if (skel) skel.classList.add("hidden");
  document.querySelector(".beta-header")?.classList.remove("sheet-content-hidden");
  document.querySelector(".beta-grid")?.classList.remove("sheet-content-hidden");
}

const sheetLoaderModule = window.ABNSheetLoader;
if (sheetLoaderModule) {
  sheetLoaderModule.configure({
    supabaseClient: window.supabase,
    onBeforeLoad: () => {
      document.title = "Cargando...";
    },
    onUserMissing: () => {
      revealSheet();
      window.location.href = "../../index.html";
    },
    onSheetIdMissing: () => {
      revealSheet();
      window.location.href = "../../index.html#character-sheets";
    },
    onSheetLoaded: ({ id, sheet, user }) => {
      currentSheetId = id;
      currentAvatarOriginalUrl = sheet?.data?.avatarOriginalUrl || sheet?.avatar_url || null;
      currentAvatarThumbUrl = sheet?.data?.avatarThumbUrl || sheet?.avatar_url || null;
      currentAvatarUrl = currentAvatarThumbUrl || currentAvatarOriginalUrl;
      currentAvatarPosition = normalizeAvatarPosition(sheet?.data?.avatarPosition);
      loadCharacterFromJSON(sheet.data);
      updateAll();

      // Inicializar revelaciones con la chronicle del personaje
      // Usar el user_id del dueño de la hoja (no el usuario autenticado)
      const sheetOwnerUserId = sheet.user_id || user?.id || null;
      const revChronicleId = sheet.chronicle_id || localStorage.getItem("currentChronicleId");
      if (window.ABNSheetRevelaciones && revChronicleId) {
        window.ABNSheetRevelaciones.init(revChronicleId, sheetOwnerUserId);
      }

      const notesApi = window.ABNSheetNotes;
      if (notesApi) {
        notesApi.setContext({
          sheetId: id,
          chronicleId: revChronicleId || null,
          userId: sheetOwnerUserId,
        });
        void notesApi.refresh?.();
      }

      const objetosApi = window.ABNSheetObjetos;
      if (objetosApi) {
        objetosApi.setContext({
          sheetId: id,
          chronicleId: revChronicleId || null,
          userId: sheetOwnerUserId,
        });
        void objetosApi.refresh?.();
      }

      const contactosApi = window.ABNSheetContactos;
      if (contactosApi) {
        contactosApi.setContext({
          sheetId: id,
          chronicleId: revChronicleId || null,
          userId: sheetOwnerUserId,
        });
        void contactosApi.refresh?.();
      }

      persistenceModule?.setSheetMeta?.({
        userId: sheetOwnerUserId,
        chronicleId: revChronicleId || null,
      });
      revealSheet();
    },
    onSheetNotFound: () => {
      revealSheet();
      alert("No se encontró la hoja de personaje.");
    },
    onError: (error) => {
      revealSheet();
      console.error(error);
      alert("Error al cargar la hoja de personaje.");
    },
  });
  sheetLoaderModule.init();
}
// Call saveCharacterData when an input is changed
const inputs = document.querySelectorAll("input" + ", select");
inputs.forEach((input) => {
  input.addEventListener("change", () => {
    saveCharacterData();
  });
});

//GUARDAR INFORMACION DEL PERSONAJE EN JSON
function getCharacterData() {
  let characterData = {};

  // Loop through all input or select elements
  const inputs = document.querySelectorAll("input" + ", select");
  inputs.forEach((input) => {
    const id = input.id;
    const value = input.value;

    // Check if the input has an ID and a value and is not a file input
    // Skip ritual form inputs to prevent stale data leaking into save
    if (id && value && input.type !== "file" && !id.startsWith("ritual-") && !id.startsWith("attack-") && !id.startsWith("damage-")) {
      // Add the input ID and value to the characterData object
      characterData[id] = value;

      // Also save specialties if they exist
      if (id.endsWith('-value')) {
        const specialtiesData = input.getAttribute('data-specialties');
        if (specialtiesData && specialtiesData !== '[]' && specialtiesData !== '') {
          characterData[id + '-specialties'] = specialtiesData;
        }
      }
    }
  });

  // Add disciplines data
  characterData.disciplines = getDisciplinesData();

  // Add sendas data
  characterData.sendas = getSendasData();

  // Add powers data
  characterData.disciplinePowers = getPowersData();

  // Add backgrounds data
  characterData.backgrounds = getBackgroundsData();

  // Add merits & defects data
  characterData.merits = getMeritsData();
  characterData.defects = getDefectsData();

  // Add rituals data
  characterData.rituals = getRitualsData();

  // Add attacks data
  characterData.attacks = getAttacksData();

  // Add XP arcs data
  characterData.xpArcs = getXpArcsData();

  // Add saved rolls data
  characterData.savedRolls = getSavedRollsData();

  // Keep avatar crop/position set in Characters view
  characterData.avatarPosition = normalizeAvatarPosition(currentAvatarPosition);
  if (currentAvatarOriginalUrl) characterData.avatarOriginalUrl = currentAvatarOriginalUrl;
  if (currentAvatarThumbUrl) characterData.avatarThumbUrl = currentAvatarThumbUrl;

  // Add discord webhook data
  const discordConfig = getDiscordConfig();
  characterData.discordWebhookUrl = discordConfig.webhookUrl;
  characterData.discordWebhookEnabled = discordConfig.enabled;

  // Add 3D dice preference
  const diceBox3d = window.ABNSheetDiceBox3D;
  if (diceBox3d) characterData.diceBox3dEnabled = diceBox3d.getSettingForSave();

  return JSON.stringify(characterData);
}

function downloadCharacterData() {
  //get the character data as a JSON string
  let characterJSON = getCharacterData();

  //Get character name
  let characterName = document.getElementById("nombre").value;
  //Check if character name is empty
  if (!characterName) {
    characterName = "Nuevo Personaje";
  }

  //create a Blob objetc from the JSON data
  let characterBlob = new Blob([characterJSON], { type: "application/json" });

  //create a URL for the Blob objet
  let characterURL = URL.createObjectURL(characterBlob);

  //create a download link
  let downloadLink = document.createElement("a");
  downloadLink.href = characterURL;
  downloadLink.download = characterName + ".json";
  downloadLink.textContent = "Download character data";

  //append the download link to the document body
  document.body.appendChild(downloadLink);

  //click the downliad link to trigger the download
  downloadLink.click();

  //remove the download link from the document body
  document.body.removeChild(downloadLink);
}

function formatPdfList(items, emptyLabel = "Sin datos") {
  if (!Array.isArray(items) || items.length === 0) return [{ label: emptyLabel, value: "" }];
  const repo = window.DISCIPLINE_REPO || [];
  const getRepoName = (id) => {
    const hit = repo.find((d) => d.id === Number(id));
    return hit ? hit.name_es : "";
  };
  return items.map((item) => {
    if (typeof item === "string") return { label: item, value: "" };
    if (!item || typeof item !== "object") return { label: String(item), value: "" };

    // Disciplines: prefer resolved name + level
    if (item.id !== undefined && item.level !== undefined) {
      const resolvedName = item.name || item.customName || getRepoName(item.id) || `Disciplina ${item.id}`;
      return {
        label: resolvedName,
        value: item.level,
        desc: item.description || "",
      };
    }

    // Backgrounds: use rating as value
    if (item.name && item.rating !== undefined) {
      return {
        label: item.name,
        value: item.rating,
        desc: item.description || "",
      };
    }

    return {
      label: item.name || item.title || item.id || "Elemento",
      value: item.value ?? item.cost ?? "",
      desc: item.description || "",
    };
  });
}

function downloadCharacterPdf() {
  if (!window.jspdf || !window.jspdf.jsPDF) {
    alert("No se pudo cargar el generador de PDF.");
    return;
  }

  const characterJSON = getCharacterData();
  const data = JSON.parse(characterJSON);
  const name = (data.nombre || "Nuevo Personaje").trim();
  const safeName = name.replace(/[\\/:*?"<>|]/g, "_");

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();
  const margin = 34;
  const contentW = pageW - margin * 2;
  const bottom = pageH - margin;
  let y = margin;

  const colors = {
    paper: [255, 255, 255],
    ink: [0, 0, 0],
    muted: [70, 70, 70],
    wine: [0, 0, 0],
    wineSoft: [0, 0, 0],
    line: [120, 120, 120],
    blood1: [0, 0, 0],
    blood2: [0, 0, 0],
    blood3: [0, 0, 0],
  };

  const num = (v) => Number.parseInt(v, 10) || 0;

  const paintPage = () => {
    doc.setFillColor(...colors.paper);
    doc.rect(0, 0, pageW, pageH, "F");
    doc.setDrawColor(...colors.line);
    doc.setLineWidth(0.8);
    doc.rect(16, 16, pageW - 32, pageH - 32);
  };

  const newPage = () => {
    doc.addPage();
    paintPage();
    y = margin;
  };

  const ensure = (h) => {
    if (y + h > bottom) newPage();
  };

  const drawHeader = () => {
    ensure(80);
    doc.setFillColor(...colors.wine);
    doc.roundedRect(margin, y, contentW, 64, 10, 10, "F");
    doc.setTextColor(245, 236, 224);
    doc.setFont("times", "bold");
    doc.setFontSize(22);
    doc.text("Vampiro: La Mascarada - Hoja de Personaje", margin + 16, y + 27);
    doc.setFont("times", "normal");
    doc.setFontSize(12);
    doc.text(name || "Sin nombre", margin + 16, y + 46);
    doc.setFontSize(9);
    doc.text(`Exportado: ${new Date().toLocaleString()}`, margin + contentW - 150, y + 46);
    y += 76;
    doc.setTextColor(...colors.ink);
  };

  const sectionTitle = (title) => {
    ensure(24);
    doc.setFillColor(...colors.wineSoft);
    doc.roundedRect(margin, y, contentW, 18, 4, 4, "F");
    doc.setTextColor(245, 236, 224);
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.text(title.toUpperCase(), margin + 10, y + 12.5);
    y += 24;
    doc.setTextColor(...colors.ink);
  };

  const field = (label, value) => {
    ensure(18);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${label}:`, margin + 8, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(...colors.muted);
    doc.text(String(value || "-"), margin + 96, y);
    doc.setTextColor(...colors.ink);
    y += 14;
  };

  const dotTrack = (label, value, max) => {
    ensure(18);
    const v = Math.max(0, Math.min(max, num(value)));
    const startX = margin + 145;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text(`${label}:`, margin + 8, y);
    for (let i = 0; i < max; i += 1) {
      const cx = startX + (i * 12);
      doc.setDrawColor(...colors.line);
      if (i < v) {
        doc.setFillColor(...colors.wineSoft);
        doc.circle(cx, y - 3, 3.6, "FD");
      } else {
        doc.circle(cx, y - 3, 3.6, "S");
      }
    }
    y += 14;
  };

  const bloodTrack = () => {
    ensure(30);
    const bloodRaw = String(data["blood-value"] || "");
    const bloodValues = bloodRaw.split("").map((c) => num(c)).filter((v) => v >= 0);
    const maxBlood = Math.max(num(data["blood-max-label"]) || 10, 10);
    const startX = margin + 145;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Sangre:", margin + 8, y);
    for (let i = 0; i < maxBlood; i += 1) {
      const x = startX + (i % 15) * 11;
      const row = Math.floor(i / 15);
      const yy = y - 8 + row * 11;
      doc.setDrawColor(...colors.line);
      const t = bloodValues[i] || 0;
      if (t === 1) doc.setFillColor(...colors.blood1);
      if (t === 2) doc.setFillColor(...colors.blood2);
      if (t === 3) doc.setFillColor(...colors.blood3);
      if (t > 0) {
        doc.rect(x, yy, 8, 8, "FD");
      } else {
        doc.rect(x, yy, 8, 8, "S");
      }
    }
    const rows = Math.ceil(maxBlood / 15);
    y += 10 + rows * 11;
  };

  const healthTrack = () => {
    ensure(26);
    const keys = [
      "magullado-value",
      "lastimado-value",
      "lesionado-value",
      "herido-value",
      "malherido-value",
      "tullido-value",
      "incapacitado-value",
    ];
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.text("Salud:", margin + 8, y);
    const startX = margin + 145;
    keys.forEach((key, idx) => {
      const v = num(data[key]);
      const x = startX + idx * 14;
      doc.setDrawColor(...colors.line);
      if (v === 1) doc.setFillColor(149, 149, 149);
      else if (v === 2) doc.setFillColor(211, 156, 94);
      else if (v === 3) doc.setFillColor(187, 21, 21);
      if (v > 0) doc.rect(x, y - 8, 10, 10, "FD");
      else doc.rect(x, y - 8, 10, 10, "S");
    });
    y += 16;
  };

  const listBlock = (title, items) => {
    sectionTitle(title);
    const parsed = formatPdfList(items);
    parsed.forEach((item) => {
      ensure(14);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(9);
      doc.text(`- ${item.label}`, margin + 8, y);
      if (item.value !== "") {
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.muted);
        doc.text(`[${item.value}]`, margin + contentW - 38, y, { align: "right" });
        doc.setTextColor(...colors.ink);
      }
      y += 12;
      if (item.desc) {
        const split = doc.splitTextToSize(item.desc, contentW - 40);
        doc.setFont("helvetica", "normal");
        doc.setTextColor(...colors.muted);
        split.slice(0, 2).forEach((line) => {
          ensure(12);
          doc.text(line, margin + 18, y);
          y += 11;
        });
        doc.setTextColor(...colors.ink);
      }
    });
    y += 3;
  };

  const trimLabel = (label, maxChars = 16) => {
    if (!label) return "";
    return label.length > maxChars ? `${label.slice(0, maxChars - 1)}…` : label;
  };

  const threeColumnDotsSection = (title, columns, max = 5) => {
    const colGap = 10;
    const colW = (contentW - (colGap * 2)) / 3;
    const maxRows = Math.max(...columns.map((c) => c.rows.length));
    const boxH = 12 + 16 + (maxRows * 12) + 8;
    ensure(24 + boxH + 8);

    sectionTitle(title);

    columns.forEach((col, colIdx) => {
      const x = margin + (colIdx * (colW + colGap));
      const dotsStartX = x + colW - (max * 9) - 10;

      doc.setDrawColor(...colors.line);
      doc.setLineWidth(0.6);
      doc.roundedRect(x, y, colW, boxH, 5, 5, "S");

      doc.setFont("times", "bold");
      doc.setFontSize(9);
      doc.setTextColor(...colors.wineSoft);
      doc.text(col.title.toUpperCase(), x + 7, y + 12);

      doc.setTextColor(...colors.ink);
      col.rows.forEach(([label, key], rowIdx) => {
        const rowY = y + 25 + (rowIdx * 12);
        const value = Math.max(0, Math.min(max, num(data[key])));
        doc.setFont("helvetica", "normal");
        doc.setFontSize(8);
        doc.text(trimLabel(label), x + 7, rowY);

        for (let i = 0; i < max; i += 1) {
          const cx = dotsStartX + (i * 9);
          doc.setDrawColor(...colors.line);
          if (i < value) {
            doc.setFillColor(...colors.wineSoft);
            doc.circle(cx, rowY - 3, 2.6, "FD");
          } else {
            doc.circle(cx, rowY - 3, 2.6, "S");
          }
        }
      });
    });

    y += boxH + 8;
  };

  const pageLeft = margin;
  const pageRight = margin + contentW;
  const colGap = 10;
  const colW = (contentW - (colGap * 2)) / 3;
  const c1 = pageLeft;
  const c2 = pageLeft + colW + colGap;
  const c3 = pageLeft + ((colW + colGap) * 2);

  const drawSectionBar = (title, topY) => {
    doc.setDrawColor(...colors.ink);
    doc.setLineWidth(0.8);
    doc.line(pageLeft, topY, pageRight, topY);
    doc.setFillColor(...colors.paper);
    const titleW = doc.getTextWidth(title) + 14;
    const titleX = (pageLeft + pageRight - titleW) / 2;
    doc.rect(titleX, topY - 7, titleW, 14, "F");
    doc.setFont("times", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...colors.ink);
    doc.text(title, titleX + 7, topY + 4);
  };

  const drawInfoCol = (x, y0, rows) => {
    doc.setFont("times", "bold");
    doc.setFontSize(9.5);
    rows.forEach((r, i) => {
      const yy = y0 + (i * 13);
      doc.text(`${r[0]}:`, x, yy);
      doc.setFont("times", "normal");
      doc.text(String(r[1] || "-"), x + 54, yy);
      doc.setFont("times", "bold");
    });
  };

  const drawTrackRow = (x, y0, label, value, maxDots = 5) => {
    const val = Math.max(0, Math.min(maxDots, num(value)));
    const dotStart = x + colW - (maxDots * 11) - 4;
    doc.setFont("times", "normal");
    doc.setFontSize(9);
    doc.text(trimLabel(label, 17), x, y0);
    doc.setDrawColor(...colors.ink);
    doc.line(x + 52, y0 + 1, dotStart - 7, y0 + 1);
    for (let i = 0; i < maxDots; i += 1) {
      const cx = dotStart + (i * 11);
      if (i < val) {
        doc.setFillColor(...colors.ink);
        doc.circle(cx, y0 - 2, 2.8, "F");
      } else {
        doc.circle(cx, y0 - 2, 2.8, "S");
      }
    }
  };

  const drawColumnGroup = (x, y0, title, rows) => {
    doc.setFont("times", "bold");
    doc.setFontSize(10.5);
    doc.text(title, x + (colW / 2), y0, { align: "center" });
    rows.forEach((row, idx) => {
      drawTrackRow(x, y0 + 14 + (idx * 13), row[0], row[1], 5);
    });
  };

  paintPage();

  // CABECERA
  drawInfoCol(c1, 44, [
    ["Nombre", data.nombre],
    ["Clan", data.clan || ""],
  ]);
  drawInfoCol(c2, 44, [
    ["Naturaleza", data.naturaleza],
    ["Conducta", data.conducta],
    ["Concepto", data.concepto],
  ]);
  drawInfoCol(c3, 44, [
    ["Generacion", data.generacion],
    ["Sire", data.sire],
    ["Debilidad", data.debilidad || ""],
  ]);

  // ATRIBUTOS
  drawSectionBar("Atributos", 88);
  drawColumnGroup(c1, 106, "Fisicos", [
    ["Fuerza", data["fuerza-value"]],
    ["Destreza", data["destreza-value"]],
    ["Resistencia", data["resistencia-value"]],
  ]);
  drawColumnGroup(c2, 106, "Sociales", [
    ["Carisma", data["carisma-value"]],
    ["Manipulacion", data["manipulacion-value"]],
    ["Apariencia", data["apariencia-value"]],
  ]);
  drawColumnGroup(c3, 106, "Mentales", [
    ["Percepcion", data["percepcion-value"]],
    ["Inteligencia", data["inteligencia-value"]],
    ["Astucia", data["astucia-value"]],
  ]);

  // HABILIDADES
  drawSectionBar("Habilidades", 161);
  drawColumnGroup(c1, 179, "Talentos", [
    ["Alerta", data["alerta-value"]],
    ["Atletismo", data["atletismo-value"]],
    ["Callejeo", data["callejeo-value"]],
    ["Consciencia", data["consciencia-value"]],
    ["Empatia", data["empatia-value"]],
    ["Expresion", data["expresion-value"]],
    ["Intimidacion", data["intimidacion-value"]],
    ["Liderazgo", data["liderazgo-value"]],
    ["Pelea", data["pelea-value"]],
    ["Subterfugio", data["subterfugio-value"]],
  ]);
  drawColumnGroup(c2, 179, "Tecnicas", [
    ["Armas de Fuego", data["armasDeFuego-value"]],
    ["Artesania", data["artesania-value"]],
    ["Conducir", data["conducir-value"]],
    ["Etiqueta", data["etiqueta-value"]],
    ["Interpretacion", data["interpretacion-value"]],
    ["Latrocinio", data["latrocinio-value"]],
    ["Pelea con Armas", data["peleaConArmas-value"]],
    ["Sigilo", data["sigilo-value"]],
    ["Supervivencia", data["supervivencia-value"]],
    ["T.c. Animales", data["tratoConAnimales-value"]],
  ]);
  drawColumnGroup(c3, 179, "Conocimientos", [
    ["Academicismo", data["academicismo-value"]],
    ["Ciencias", data["ciencias-value"]],
    ["Finanzas", data["finanzas-value"]],
    ["Informatica", data["informatica-value"]],
    ["Investigacion", data["investigacion-value"]],
    ["Leyes", data["leyes-value"]],
    ["Medicina", data["medicina-value"]],
    ["Ocultismo", data["ocultismo-value"]],
    ["Politica", data["politica-value"]],
    ["Tecnologia", data["tecnologia-value"]],
  ]);

  // VENTAJAS
  drawSectionBar("Ventajas", 332);
  const disciplinas = formatPdfList(data.disciplines).slice(0, 6);
  const trasfondos = formatPdfList(data.backgrounds).slice(0, 6);
  drawColumnGroup(c1, 350, "Disciplinas", disciplinas.map((d) => [d.label, d.value]));
  drawColumnGroup(c2, 350, "Trasfondos", trasfondos.map((d) => [d.label, d.value]));
  drawColumnGroup(c3, 350, "Virtudes", [
    [data["virtue1"] || "Conciencia/Conviccion", data["virtue1-value"]],
    [data["virtue2"] || "Autocontrol/Instinto", data["virtue2-value"]],
    ["Coraje", data["virtue3-value"]],
  ]);

  // BLOQUE INFERIOR
  drawSectionBar("", 446);
  // Izquierda: lineas libres
  doc.setDrawColor(...colors.line);
  for (let i = 0; i < 12; i += 1) {
    const yy = 466 + (i * 13);
    doc.line(c1, yy, c1 + colW - 6, yy);
  }

  // Centro: Humanidad / Voluntad / Sangre
  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text("Humanidad/Senda", c2 + (colW / 2), 463, { align: "center" });
  drawTrackRow(c2, 478, "", data["humanidad-value"], 10);
  doc.setFont("times", "normal");
  doc.setFontSize(8.8);
  doc.text(`Porte: ${(data.porte || "").toString()}`, c2, 492);

  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text("Fuerza de Voluntad", c2 + (colW / 2), 509, { align: "center" });
  drawTrackRow(c2, 524, "Perm.", data["voluntadPerm-value"], 10);
  const temp = Math.max(0, Math.min(10, num(data["voluntadTemp-value"])));
  const tempStart = c2 + colW - (10 * 11) - 4;
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.text("Temp.", c2, 537);
  for (let i = 0; i < 10; i += 1) {
    const x = tempStart + (i * 11) - 3;
    if (i < temp) doc.rect(x, 531, 7, 7, "F");
    else doc.rect(x, 531, 7, 7, "S");
  }

  doc.setFont("times", "bold");
  doc.setFontSize(10);
  doc.text("Reserva de Sangre", c2 + (colW / 2), 554, { align: "center" });
  const bloodRaw = String(data["blood-value"] || "");
  const bloodValues = bloodRaw.split("").map((c) => num(c)).filter((v) => v >= 0);
  const maxBlood = Math.max(num(data["blood-max-label"]) || 20, 20);
  const cols = 10;
  const rows = Math.ceil(maxBlood / cols);
  const bx = c2 + 6;
  const by = 566;
  for (let i = 0; i < maxBlood; i += 1) {
    const x = bx + ((i % cols) * 15);
    const yy = by + (Math.floor(i / cols) * 14);
    const t = bloodValues[i] || 0;
    doc.setDrawColor(...colors.ink);
    if (t > 0) doc.rect(x, yy, 10, 10, "F");
    else doc.rect(x, yy, 10, 10, "S");
  }
  doc.setFont("times", "normal");
  doc.setFontSize(9);
  doc.text(`Sangre por turno: ${data.bloodPerTurn || "-"}`, c2 + 10, by + (rows * 14) + 14);

  // Derecha: Salud + Debilidad + Experiencia
  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.text("Salud", c3 + (colW / 2), 463, { align: "center" });
  const healthRows = [
    ["Magullado", data["magullado-value"], ""],
    ["Lastimado", data["lastimado-value"], "-1"],
    ["Lesionado", data["lesionado-value"], "-1"],
    ["Herido", data["herido-value"], "-2"],
    ["Malherido", data["malherido-value"], "-2"],
    ["Tullido", data["tullido-value"], "-5"],
    ["Incapacitado", data["incapacitado-value"], ""],
  ];
  doc.setFont("times", "normal");
  doc.setFontSize(9.5);
  healthRows.forEach((r, i) => {
    const yy = 480 + (i * 14);
    doc.text(r[0], c3, yy);
    if (r[2]) doc.text(r[2], c3 + colW - 32, yy);
    if (num(r[1]) > 0) doc.rect(c3 + colW - 14, yy - 7, 9, 9, "F");
    else doc.rect(c3 + colW - 14, yy - 7, 9, 9, "S");
  });

  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.text("Debilidad", c3 + (colW / 2), 590, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(8.5);
  const debLines = doc.splitTextToSize(String(data.debilidad || "-"), colW - 8);
  debLines.slice(0, 3).forEach((line, i) => {
    doc.text(line, c3 + 2, 603 + (i * 10));
  });

  doc.setFont("times", "bold");
  doc.setFontSize(10.5);
  doc.text("Experiencia", c3 + (colW / 2), 640, { align: "center" });
  doc.setFont("times", "normal");
  doc.setFontSize(9.2);
  doc.text(`Disponible: ${data["experiencia-value"] || "0"}`, c3 + 4, 654);

  doc.save(`${safeName}.pdf`);
}

///////////////////////////
// Cargar el archivo ///
//////////////////////////
const fileInput = document.getElementById("file-input");
const uploadJsonBtn = document.getElementById("upload-json-btn");
const downloadJsonBtn = document.getElementById("download-json-btn");

function clickOnFileInput() {
  fileInput?.click();
}

downloadJsonBtn?.addEventListener("click", downloadCharacterData);
uploadJsonBtn?.addEventListener("click", clickOnFileInput);

fileInput?.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const json = event.target.result;
    const characterData = JSON.parse(json);

    // Use the full loader so modern data (merits, defects, disciplines,
    // backgrounds, XP arcs, saved rolls, etc.) is restored.
    loadCharacterFromJSON(characterData);

    // Persist imported data to Supabase immediately
    saveCharacterData();
  };

  reader.readAsText(file);
});

/////////////////////////////
////// SISTEMA DE SALUD ////
////////////////////////////

const healthBloodModule = window.ABNSheetHealthBlood;
if (healthBloodModule) {
  healthBloodModule.configure({
    save: saveCharacterData,
    updateFinalPoolSize,
    flashBloodWarning,
    flashBloodConsume,
  });
}

function getHealthValues() {
  return healthBloodModule ? healthBloodModule.getHealthValues() : [];
}

function updateHealthValues() {
  healthBloodModule?.updateHealthValues();
}

function updateHealthSquares() {
  healthBloodModule?.updateHealthSquares();
}

function updateHealthButtons() {
  healthBloodModule?.updateHealthButtons();
}

function updateDamagePenalty() {
  healthBloodModule?.updateDamagePenalty();
}

function updateHealthImpediment() {
  healthBloodModule?.updateHealthImpediment();
}

function calculateBloodPerTurn() {
  healthBloodModule?.calculateBloodPerTurn();
}

function updateBloodPerTurn() {
  healthBloodModule?.updateBloodPerTurn();
}

function getMaxBloodPool() {
  return healthBloodModule ? healthBloodModule.getMaxBloodPool() : 10;
}

function blockBloodPool() {
  healthBloodModule?.blockBloodPool();
}

function modifyBlood(action, type) {
  healthBloodModule?.modifyBlood(action, type);
}

function updateBloodUI() {
  healthBloodModule?.updateBloodUI();
}

healthBloodModule?.init();

// Encounter blood-per-turn tracker (hooks into health-blood via setConsumeHooks)
if (window.ABNEncounterBloodTracker?.init) {
  window.ABNEncounterBloodTracker.init();
}

////////-------------------------------------------////////
////////-------------------------------------------////////
////////-------------------------------------------////////
////////-------------------------------------------////////
////////            DADOS VIRTUDES                 ////////
////////-------------------------------------------////////
////////-------------------------------------------////////

const pathVirtuesModule = window.ABNSheetPathVirtues;
if (pathVirtuesModule) {
  pathVirtuesModule.configure({
    save: saveCharacterData,
    createModalController: createSheetModalController,
    resetDicePool1,
    addToPool1,
    flashBloodWarning,
  });
}

function blockVirtues() {
  pathVirtuesModule?.blockVirtues();
}

function applyRoadVirtues(road) {
  pathVirtuesModule?.applyRoadVirtues(road);
}

function syncVirtueLabels() {
  pathVirtuesModule?.syncVirtueLabels();
}

function renderPathInfo() {
  pathVirtuesModule?.renderPathInfo();
}

pathVirtuesModule?.init();

////////            FUERZA DE VOLUNTAD             ////////
////////-------------------------------------------////////
////////-------------------------------------------////////

// ====== FUERZA DE VOLUNTAD — Beta track system ====== //

const willpowerModule = window.ABNSheetWillpower;
if (willpowerModule) {
  willpowerModule.configure({
    save: saveCharacterData,
    blockVirtues,
    resetDicePool1,
    addToPool1,
  });
}

function renderWillpowerTrack() {
  willpowerModule?.renderWillpowerTrack();
}

function blockTemporalWillpower() {
  willpowerModule?.blockTemporalWillpower();
}

function rollVoluntad(inputId) {
  willpowerModule?.rollVoluntad(inputId);
}

willpowerModule?.init();

////////-------------------------------------------////////
////////-------------------------------------------////////
////////                  DADOS                    ////////
////////-------------------------------------------////////
////////-------------------------------------------////////

const diceSystemModule = window.ABNSheetDiceSystem;
if (diceSystemModule) {
  diceSystemModule.configure({
    createModalController: createSheetModalController,
    getFinalPoolSize,
    getPhysicalDisciplineBonus,
    getActivatedDisciplines,
    getCharacterIdentity: () => ({
      characterName: document.querySelector("#nombre")?.value || "",
      characterClan: document.querySelector("#clan")?.value || "",
      currentAvatarUrl,
    }),
    getDiscordConfig,
    flashBloodWarning,
    modifyBlood,
    renderWillpowerTrack,
    save: saveCharacterData,
    getDiceValues: (count) => {
      const diceBox3d = window.ABNSheetDiceBox3D;
      if (diceBox3d && diceBox3d.isEnabled()) return diceBox3d.rollD10s(count);
      return null;
    },
  });
}

const diceBox3dToggle = document.getElementById("dice-box-3d-toggle");
if (diceBox3dToggle) {
  diceBox3dToggle.addEventListener("change", () => {
    const diceBox3d = window.ABNSheetDiceBox3D;
    if (diceBox3d) {
      diceBox3d.setEnabled(diceBox3dToggle.checked);
      saveCharacterData();
    }
  });
}

function rollTheDice() {
  diceSystemModule?.rollTheDice();
}

function uncheckWillpowerAndSpecialty() {
  diceSystemModule?.uncheckWillpowerAndSpecialty();
}

function diceHistoryFormatTime(date) {
  return diceSystemModule ? diceSystemModule.diceHistoryFormatTime(date) : "";
}

function renderDiceHistory() {
  diceSystemModule?.renderDiceHistory();
}

function openDiceHistoryModal() {
  diceSystemModule?.openDiceHistoryModal();
}

function closeDiceHistoryModal() {
  diceSystemModule?.closeDiceHistoryModal();
}

function sendToDiscordRoll(
  characterName,
  clan,
  pool1,
  pool1Size,
  pool2,
  pool2Size,
  mods,
  result,
  rolls,
  difficulty,
  color,
  damagePenalty,
  damagePenaltyTrueFalse,
  willpowerTrueFalse,
  specialtyTrueFalse,
  potenciaTrueFalse
) {
  diceSystemModule?.sendToDiscordRoll(
    characterName,
    clan,
    pool1,
    pool1Size,
    pool2,
    pool2Size,
    mods,
    result,
    rolls,
    difficulty,
    color,
    damagePenalty,
    damagePenaltyTrueFalse,
    willpowerTrueFalse,
    specialtyTrueFalse,
    potenciaTrueFalse
  );
}

function rollInitiative() {
  diceSystemModule?.rollInitiative();
}

function sendInitiativeToDiscord(total, d10, destreza, astucia, damagePenalty) {
  diceSystemModule?.sendInitiativeToDiscord(total, d10, destreza, astucia, damagePenalty);
}

function actionWakeUp() {
  diceSystemModule?.actionWakeUp();
}

diceSystemModule?.init();

function addToPool1(diceValue, labelName) {
  diceUiModule?.addToPool1(diceValue, labelName);
}

function addToPool2(diceNumber, name) {
  diceUiModule?.addToPool2(diceNumber, name);
}

const diceUiModule = window.ABNSheetDiceUI;
if (diceUiModule) {
  diceUiModule.configure({
    onRollTheDice: rollTheDice,
    onSave: saveCharacterData,
    onUncheckWillpowerAndSpecialty: uncheckWillpowerAndSpecialty,
    getPhysicalDisciplineBonus,
    getActivatedDisciplines,
  });
}

function getFinalPoolSize() {
  return diceUiModule ? diceUiModule.getFinalPoolSize() : 0;
}

function updateFinalPoolSize() {
  diceUiModule?.updateFinalPoolSize();
}

function resetDicePool1() {
  diceUiModule?.resetDicePool1();
}

function resetDicePool2() {
  diceUiModule?.resetDicePool2();
}

function resetDiceMod() {
  diceUiModule?.resetDiceMod();
}

function resetAllDice() {
  diceUiModule?.resetAllDice();
}

function capitalizeFirstLetter(string) {
  return diceUiModule ? diceUiModule.capitalizeFirstLetter(string) : string;
}

diceUiModule?.init();

/////////////////////////////////////
////     Sistema de Disciplinas  ////
/////////////////////////////////////

function hasBloodAvailable() {
  const bloodValue = document.querySelector("#blood-value").value;
  return bloodValue.replace(/0/g, "").length > 0;
}

function flashBloodWarning() {
  const bloodCard = document.querySelector(".blood-card");
  if (bloodCard) {
    bloodCard.classList.remove("blood-shake");
    void bloodCard.offsetWidth;
    bloodCard.classList.add("blood-shake");
    bloodCard.addEventListener("animationend", () => bloodCard.classList.remove("blood-shake"), {
      once: true,
    });
  }
}

function flashBloodConsume() {
  const bloodCard = document.querySelector(".blood-card");
  if (bloodCard) {
    bloodCard.classList.remove("blood-consume-flash");
    void bloodCard.offsetWidth;
    bloodCard.classList.add("blood-consume-flash");
    bloodCard.addEventListener(
      "animationend",
      () => bloodCard.classList.remove("blood-consume-flash"),
      { once: true }
    );
  }
}

async function requestVariableDifficulty(options = {}) {
  const promptModule = window.ABNSheetRollDifficultyPrompt;
  if (!promptModule?.request) return null;
  return promptModule.request(options);
}

const disciplinesModule = window.ABNSheetDisciplines;
if (disciplinesModule) {
  disciplinesModule.configure({
    save: saveCharacterData,
    capitalizeFirstLetter,
    updateFinalPoolSize,
    resetDicePool2,
    createModalController: createSheetModalController,
    modifyBlood,
    hasBloodAvailable,
    flashBloodWarning,
    getSheetMode: () => sheetModeModule?.getMode?.() || "edit",
    requestDifficulty: requestVariableDifficulty,
  });
}

function getPhysicalDisciplineBonus(attrName) {
  return disciplinesModule ? disciplinesModule.getPhysicalDisciplineBonus(attrName) : null;
}

function refreshPool1ForPhysicalDiscipline(discId) {
  disciplinesModule?.refreshPool1ForPhysicalDiscipline(discId);
}

function getDisciplineName(id) {
  return disciplinesModule ? disciplinesModule.getDisciplineName(id) : "Desconocida";
}

function renderDisciplineList() {
  disciplinesModule?.renderDisciplineList();
}

function getDisciplinesData() {
  return disciplinesModule ? disciplinesModule.getDisciplinesData() : [];
}

function loadDisciplinesFromJSON(characterData) {
  disciplinesModule?.loadDisciplinesFromJSON(characterData);
}

function updateDisciplineButtons() {
  disciplinesModule?.updateDisciplineButtons();
}

function getSendaName(sendaId) {
  return disciplinesModule ? disciplinesModule.getSendaName(sendaId) : "Desconocida";
}

function getSendasForDiscipline(discId) {
  return disciplinesModule ? disciplinesModule.getSendasForDiscipline(discId) : [];
}

function disciplineHasSendas(discId) {
  return disciplinesModule ? disciplinesModule.disciplineHasSendas(discId) : false;
}

function getSendasData() {
  return disciplinesModule ? disciplinesModule.getSendasData() : [];
}

function loadSendasFromJSON(characterData) {
  disciplinesModule?.loadSendasFromJSON(characterData);
}

function renderPowersList() {
  disciplinesModule?.renderPowersList();
}

function initDisciplinePowers() {
  disciplinesModule?.initDisciplinePowers();
}

function getPowersData() {
  return disciplinesModule ? disciplinesModule.getPowersData() : [];
}

function loadPowersFromJSON(characterData) {
  disciplinesModule?.loadPowersFromJSON(characterData);
}

function migrateCustomDisciplinesToPowers() {
  disciplinesModule?.migrateCustomDisciplinesToPowers();
}

function getActivatedDisciplines() {
  return disciplinesModule ? disciplinesModule.getActivatedDisciplines() : new Set();
}

disciplinesModule?.init();
// SPECIALTIES SYSTEM (MODULE BRIDGE)
// ============================================

const specialtiesModule = window.ABNSheetSpecialties;
if (specialtiesModule) {
  specialtiesModule.configure({
    createModalController: createSheetModalController,
    onSave: saveCharacterData,
  });
}

function initializeSpecialtyContainers() {
  specialtiesModule?.initializeContainers();
}

function openSpecialtyModal(attributeId, iconElement) {
  specialtiesModule?.openModal(attributeId, iconElement);
}

function closeSpecialtyModal() {
  specialtiesModule?.closeModal();
}

function handleOutsideClick() {}

function getSpecialties(attributeId) {
  return specialtiesModule ? specialtiesModule.getSpecialties(attributeId) : [];
}

function setSpecialties(attributeId, specialties) {
  specialtiesModule?.setSpecialties(attributeId, specialties);
}

function addSpecialty(attributeId, specialtyName) {
  specialtiesModule?.addSpecialty(attributeId, specialtyName);
}

function removeSpecialty(attributeId, specialtyName) {
  specialtiesModule?.removeSpecialty(attributeId, specialtyName);
}

function useSpecialtyInDiceRoller(attributeId, specialtyName) {
  specialtiesModule?.useSpecialtyInDiceRoller(attributeId, specialtyName);
}

function updateSpecialtyIconVisibility(attributeId) {
  specialtiesModule?.updateIconVisibility(attributeId);
}

function updateAllSpecialtyVisibility() {
  specialtiesModule?.updateAllIconVisibility();
}

// Call initialization after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSpecialtyContainers);
} else {
  initializeSpecialtyContainers();
}

// ====== BACKGROUNDS / TRASFONDOS SYSTEM ====== //

const backgroundsModule = window.ABNSheetBackgrounds;
if (backgroundsModule) {
  backgroundsModule.configure({
    save: saveCharacterData,
    getSheetMode: () => sheetModeModule?.getMode?.() || "edit",
  });
}

function renderBackgroundList() {
  backgroundsModule?.renderBackgroundList();
}

function refreshBackgroundDots(ratingEl, value) {
  backgroundsModule?.refreshBackgroundDots(ratingEl, value);
}

function initBackgrounds() {
  backgroundsModule?.init();
}

function getBackgroundsData() {
  return backgroundsModule ? backgroundsModule.serialize() : [];
}

function loadBackgroundsFromJSON(characterData) {
  backgroundsModule?.loadFromCharacterData(characterData);
}

initBackgrounds();
renderBackgroundList();

// ====== EXPERIENCE / XP SYSTEM ====== //

const xpModule = window.ABNSheetXp;
if (xpModule) {
  xpModule.configure({
    save: saveCharacterData,
  });
}

function renderXpPool() {
  xpModule?.renderXpPool();
}

function renderXpArcs() {
  xpModule?.renderXpArcs();
}

function initExperience() {
  xpModule?.initExperience();
}

function getXpArcsData() {
  return xpModule ? xpModule.serialize() : [];
}

function loadXpArcsFromJSON(characterData) {
  xpModule?.loadFromCharacterData(characterData);
}

// Initialize on load
initExperience();
renderXpPool();
renderXpArcs();

// ====== MERITS & DEFECTS SYSTEM ====== //

const traitsRitualsModule = window.ABNSheetTraitsRituals;
if (traitsRitualsModule) {
  traitsRitualsModule.configure({
    save: saveCharacterData,
    getDisciplineName,
    openDisciplineModal: (options) => disciplinesModule?.openDisciplineModal?.(options),
  });
}

function renderMeritDefectList(items, listId, prefix) {
  traitsRitualsModule?.renderMeritDefectList(items, listId, prefix);
}

function initMeritsDefects() {
  traitsRitualsModule?.init();
}

function getMeritsData() {
  return traitsRitualsModule ? traitsRitualsModule.getMeritsData() : [];
}

function getDefectsData() {
  return traitsRitualsModule ? traitsRitualsModule.getDefectsData() : [];
}

function loadMeritsFromJSON(characterData) {
  traitsRitualsModule?.loadMeritsFromCharacterData(characterData);
}

function loadDefectsFromJSON(characterData) {
  traitsRitualsModule?.loadDefectsFromCharacterData(characterData);
}

function getRitualsData() {
  return traitsRitualsModule ? traitsRitualsModule.getRitualsData() : [];
}

function loadRitualsFromJSON(characterData) {
  traitsRitualsModule?.loadRitualsFromCharacterData(characterData);
}

function renderRitualList() {
  traitsRitualsModule?.renderRitualList();
}

initMeritsDefects();
loadMeritsFromJSON({});
loadDefectsFromJSON({});
loadRitualsFromJSON({});

// ====== NOTES SYSTEM ====== //

const notesModule = window.ABNSheetNotes;
if (notesModule) {
  notesModule.configure({
    supabaseClient: window.supabase,
  });
}

function initNotes() {
  void notesModule?.init();
}

// Initialize on load
initNotes();

// ====== OBJECTS SYSTEM ====== //

const objetosModule = window.ABNSheetObjetos;
if (objetosModule) {
  objetosModule.configure({
    supabaseClient: window.supabase,
  });
}

function initObjetos() {
  void objetosModule?.init();
}

// Initialize on load
initObjetos();

// ====== CONTACTS SYSTEM ====== //

const contactosModule = window.ABNSheetContactos;
if (contactosModule) {
  contactosModule.configure({
    supabaseClient: window.supabase,
  });
}

function initContactos() {
  void contactosModule?.init();
}

// Initialize on load
initContactos();

// ====== SAVED ROLLS (TIRADAS RÁPIDAS) ====== //

const savedRollsModule = window.ABNSheetSavedRolls;
if (savedRollsModule) {
  savedRollsModule.configure({
    createModalController: createSheetModalController,
    save: saveCharacterData,
    getSpecialties,
    getPhysicalDisciplineBonus,
    getActivatedDisciplines,
    capitalizeFirstLetter,
    updateFinalPoolSize,
    rollTheDice,
    rollInitiative,
    actionWakeUp,
    getSheetMode: () => sheetModeModule?.getMode?.() || "edit",
    requestDifficulty: requestVariableDifficulty,
  });
}

function getSavedRollAttrOptions() {
  return savedRollsModule ? savedRollsModule.getAttrOptions() : [];
}

function getSavedRollAbilityOptions() {
  return savedRollsModule ? savedRollsModule.getAbilityOptions() : [];
}

function populateSavedRollSelects() {
  savedRollsModule?.populateSelects();
}

function renderSavedRolls() {
  savedRollsModule?.render();
}

function executeSavedRoll(roll) {
  savedRollsModule?.executeRoll(roll);
}

function openSavedRollModal(rollToEdit) {
  savedRollsModule?.openModal(rollToEdit);
}

function closeSavedRollModal() {
  savedRollsModule?.closeModal();
}

function initSavedRolls() {
  savedRollsModule?.init();
}

function getSavedRollsData() {
  return savedRollsModule ? savedRollsModule.serialize() : [];
}

function loadSavedRollsFromJSON(characterData) {
  savedRollsModule?.loadFromCharacterData(characterData);
}

// Initialize on load
initSavedRolls();
renderSavedRolls();

const dockModule = window.ABNSheetDock;
dockModule?.init();

// ══════════════════════════════════════════════════════════════
// ATTACKS SYSTEM
// ══════════════════════════════════════════════════════════════

const attacksModule = window.ABNSheetAttacks;
if (attacksModule) {
  attacksModule.configure({
    createModalController: createSheetModalController,
    save: saveCharacterData,
    getSavedRollAttrOptions,
    getSavedRollAbilityOptions,
    getPhysicalDisciplineBonus,
    getActivatedDisciplines,
    capitalizeFirstLetter,
    updateFinalPoolSize,
    rollTheDice,
    setRollContext: (name) => diceSystemModule?.setRollContext?.(name),
    setOnRollComplete: (callback) => diceSystemModule?.setOnRollComplete?.(callback),
    getSheetMode: () => sheetModeModule?.getMode?.() || "edit",
  });
}

function getAttacksData() {
  return attacksModule ? attacksModule.serialize() : [];
}

function loadAttacksFromJSON(characterData) {
  attacksModule?.loadFromCharacterData(characterData);
}

function renderAttackList() {
  attacksModule?.render();
}

function populateAttackSelects() {
  attacksModule?.populateAttackSelects();
}

function openAttackModal(editIndex) {
  attacksModule?.openModal(editIndex);
}

function closeAttackModal() {
  attacksModule?.closeModal();
}

(function initAttackSystem() {
  attacksModule?.init();
})();
