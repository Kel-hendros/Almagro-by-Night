const ratings = document.querySelectorAll(".rating");
let editMode = true;
let currentSheetId = null;
let saveTimeout = null;

function debounce(func, wait) {
  return function (...args) {
    const context = this;
    clearTimeout(saveTimeout);
    saveTimeout = setTimeout(() => func.apply(context, args), wait);
  };
}

//Funcion que actualiza todos lo que hay que actualizar al visualizar/cargar la pagina
function updateAll() {
  //update the HTML title based on the character name
  updateHTMLTitle();

  // Loop through each rating element and update the dots
  // Exclude .discipline-rating and .background-rating (managed dynamically)
  const ratings = document.querySelectorAll(".rating:not(.discipline-rating):not(.background-rating)");
  ratings.forEach((rating) => {
    updateRatingDots(rating);
  });

  //update health squares based on health status
  updateHealthSquares();

  //update blood per turn based on generation
  updateBloodPerTurn();

  //update el UI para visualizar los tipos de sangre
  updateBloodUI();

  //update damagePenalty
  //en el tirador de dados basado en el daño actual
  updateDamagePenalty();

  //reset dice roller
  resetAllDice();

  //update image clan logo
  //basado en la letra del clan seleccionado
  updateHeaderLogo();
  updateClanFieldSigil();

  //update discpline buttons para mostrar
  //los botones en las disciplinas no-vacias
  updateDisciplineButtons();

  //update block temporal Willpower
  blockTemporalWillpower();

  //update Virtues based on Humanity
  blockVirtues();

  //sync virtue labels from hidden input values
  syncVirtueLabels();

  //update specialty containers visibility
  updateAllSpecialtyVisibility();

  //sync boost badges from hidden inputs after load
  syncBoostBadges();
}

//function to update the HTML title based on the character name
function updateHTMLTitle() {
  //only if the character name is not empty
  if (document.querySelector("#nombre").value !== "") {
    var charName = document.querySelector("#nombre").value;
    document.title = charName + " - Vampiro v20 - Hoja de personaje";
  } else {
    document.title = "Vampiro v20 - Hoja de personaje";
  }
}

// //////// Theme & Font System //////// //
function initThemeModal() {
  const openBtn = document.getElementById("modeToggle");
  const modal = document.getElementById("theme-modal");
  const closeBtn = document.getElementById("theme-modal-close");
  const swatches = document.querySelectorAll(".theme-swatch");
  const fontBtns = document.querySelectorAll(".theme-font-btn");
  const exportPdfBtn = document.getElementById("export-character-pdf-btn");
  const body = document.body;

  if (!openBtn || !modal || !closeBtn) return;

  // --- helpers ---
  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }
  function openModal() {
    syncActive();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }
  function syncActive() {
    const currentTheme = body.getAttribute("data-theme") || "dark";
    const currentFont = body.getAttribute("data-font") || "clasico";
    swatches.forEach(s => s.classList.toggle("active", s.dataset.theme === currentTheme));
    fontBtns.forEach(b => b.classList.toggle("active", b.dataset.font === currentFont));
  }

  // --- open / close ---
  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  // --- theme selection ---
  swatches.forEach(swatch => {
    swatch.addEventListener("click", () => {
      const theme = swatch.dataset.theme;
      body.setAttribute("data-theme", theme);
      localStorage.setItem("theme", theme);
      syncActive();
    });
  });

  // --- font selection ---
  fontBtns.forEach(btn => {
    btn.addEventListener("click", () => {
      const font = btn.dataset.font;
      document.documentElement.setAttribute("data-font", font);
      body.setAttribute("data-font", font);
      localStorage.setItem("font", font);
      syncActive();
    });
  });

  exportPdfBtn?.addEventListener("click", () => {
    downloadCharacterPdf();
  });

  // --- initialize on load ---
  const savedTheme = localStorage.getItem("theme");
  const systemPrefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  body.setAttribute("data-theme", savedTheme || (systemPrefersDark ? "dark" : "light"));

  const savedFont = localStorage.getItem("font") || "clasico";
  document.documentElement.setAttribute("data-font", savedFont);
  body.setAttribute("data-font", savedFont);

  syncActive();
}
initThemeModal();

// MODAL DISCORD WEBHOOK
let discordWebhookUrl = "";
let discordWebhookEnabled = true;

function initDiscordWebhookModal() {
  const openBtn = document.getElementById("discord-btn");
  const modal = document.getElementById("discord-webhook-modal");
  const closeBtn = document.getElementById("discord-webhook-close");
  const cancelBtn = document.getElementById("discord-webhook-cancel");
  const form = document.getElementById("discord-webhook-form");
  const urlInput = document.getElementById("discord-webhook-url");
  const enabledInput = document.getElementById("discord-webhook-enabled");

  if (!openBtn || !modal || !closeBtn || !cancelBtn || !form || !urlInput || !enabledInput) return;

  let snapshotUrl = "";
  let snapshotEnabled = true;

  function syncForm() {
    urlInput.value = discordWebhookUrl;
    enabledInput.checked = discordWebhookEnabled;
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function openModal() {
    snapshotUrl = discordWebhookUrl;
    snapshotEnabled = discordWebhookEnabled;
    syncForm();
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    urlInput.focus();
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", () => {
    discordWebhookUrl = snapshotUrl;
    discordWebhookEnabled = snapshotEnabled;
    closeModal();
  });
  cancelBtn.addEventListener("click", () => {
    discordWebhookUrl = snapshotUrl;
    discordWebhookEnabled = snapshotEnabled;
    closeModal();
  });

  modal.addEventListener("click", (e) => {
    if (e.target === modal) {
      discordWebhookUrl = snapshotUrl;
      discordWebhookEnabled = snapshotEnabled;
      closeModal();
    }
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) {
      discordWebhookUrl = snapshotUrl;
      discordWebhookEnabled = snapshotEnabled;
      closeModal();
    }
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const nextUrl = urlInput.value.trim();
    const nextEnabled = enabledInput.checked;

    if (nextUrl && !/^https:\/\/discord\.com\/api\/webhooks\/.+/i.test(nextUrl)) {
      urlInput.setCustomValidity("URL inválida de webhook de Discord.");
      urlInput.reportValidity();
      return;
    }
    urlInput.setCustomValidity("");

    discordWebhookUrl = nextUrl;
    discordWebhookEnabled = nextEnabled && Boolean(nextUrl);

    closeModal();
    saveCharacterData();
  });
}
initDiscordWebhookModal();

function loadDiscordWebhookFromJSON(characterData) {
  // New format
  if (characterData.discordWebhookUrl !== undefined) {
    discordWebhookUrl = characterData.discordWebhookUrl || "";
    discordWebhookEnabled = characterData.discordWebhookEnabled !== false;
  }
  // Backward compat: old format used DOM input IDs
  else if (characterData["discord-modal-webhook-input"]) {
    discordWebhookUrl = characterData["discord-modal-webhook-input"] || "";
    discordWebhookEnabled = characterData["discord-toggle-input"] !== "false";
  }
}

// MODAL SELECCION DE CLAN
const clanModal = document.getElementById("clan-modal");
const inputField = document.getElementById("clan");
const acceptBtn = document.getElementById("accept-btn");
const closeBtn = document.getElementById("close-btn");
const cancelBtn = document.getElementById("cancel-btn");
const clanChips = document.querySelectorAll("#clan-modal .clan-chip");
const headerLogoDisplay = document.querySelector("#header-logo-value");
let clanSelected = "";
let currentLogoDisplay;

function openClanModal() {
  clanModal.classList.remove("hidden");
  clanModal.setAttribute("aria-hidden", "false");
}

function closeClanModal() {
  clanModal.classList.add("hidden");
  clanModal.setAttribute("aria-hidden", "true");
}

inputField.addEventListener("focus", openClanModal);
inputField.addEventListener("click", openClanModal);

clanChips.forEach((chip) => {
  chip.addEventListener("click", () => {
    // Get clan name (textContent minus the sigil span)
    clanSelected = chip.textContent.trim();
    // Remove the sigil character from the start (it's the span content)
    const sigil = chip.querySelector(".clan-sigil");
    if (sigil) {
      clanSelected = chip.textContent.replace(sigil.textContent, "").trim();
    }

    // Remove active class from all chips
    clanChips.forEach((c) => c.classList.remove("clan-chip-active"));

    // Add active class to clicked chip
    chip.classList.add("clan-chip-active");

    // Store the sigil for header logo
    currentLogoDisplay = chip.dataset.clan;
  });
});

// Update the clan sigil icon next to the clan input field
function updateClanFieldSigil() {
  const sigil = document.getElementById("clan-field-sigil");
  const logoValue = document.querySelector("#header-logo-value");
  if (!sigil || !logoValue) return;
  const val = logoValue.value;
  if (val && val !== "G") {
    sigil.textContent = val;
    sigil.classList.add("visible");
  } else {
    sigil.textContent = "";
    sigil.classList.remove("visible");
  }
}

acceptBtn.addEventListener("click", () => {
  closeClanModal();
  inputField.value = clanSelected;
  headerLogoDisplay.value = currentLogoDisplay;
  updateHeaderLogo();
  updateClanFieldSigil();
  saveCharacterData();
});

closeBtn.addEventListener("click", closeClanModal);
if (cancelBtn) cancelBtn.addEventListener("click", closeClanModal);

clanModal.addEventListener("click", (event) => {
  if (event.target === clanModal) {
    closeClanModal();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !clanModal.classList.contains("hidden")) {
    closeClanModal();
  }
});

//Function to update the p #header-logo-display innerHTML with the value stored in
//#header-logo-value input value
let currentAvatarUrl = null;

//Function to update the p #header-logo-display innerHTML with the value stored in
//#header-logo-value input value
function updateHeaderLogo() {
  const container = document.querySelector(".profile-back-link");
  const input = document.querySelector("#header-logo-value");
  let displayP = document.querySelector("#header-logo-display");

  // Safety check: if P is missing (due to previous bug), try to restore it or find it
  if (!displayP) {
    // If we are recovering from the bad state where P has wrong ID or was deleted
    // The previous bad code created <p id="header-logo-value"> AND deleted the input.
    // We rely on the page reload to fix the HTML structure, as this script runs on load.
    // But if the user hasn't reloaded, this might be tricky.
    // Assuming user reloads or we navigate, the HTML is fresh.

    // However, let's be robust.
    displayP = container.querySelector("p");
  }

  const headerLogoValue = input ? input.value : "G";

  // Check for existing avatar IMG
  let avatarImg = container.querySelector(".avatar-img");

  // If we have an avatar URL
  if (currentAvatarUrl) {
    // Hide the text P
    if (displayP) displayP.style.display = "none";

    // Create IMG if not exists
    if (!avatarImg) {
      avatarImg = document.createElement("img");
      avatarImg.className = "avatar-img";
      avatarImg.alt = "Personaje";
      avatarImg.style.cssText = "";
      container.appendChild(avatarImg);
    }

    avatarImg.src = currentAvatarUrl;
    avatarImg.style.display = "block";
  } else {
    // No avatar: Show clan sigil
    if (avatarImg) avatarImg.style.display = "none";

    if (displayP) {
      displayP.style.display = "block";
      displayP.innerHTML = headerLogoValue;
    }
  }
}

//////////////////////////////////////////////
// // // Atributos Fisicos Temporales // // //
//////////////////////////////////////////////

// (Attribute boost mouse enter/leave removed — handled by CSS hover on .physical-attr)

/// FUNCIONALIDAD DE LOS PUNTITOS AL HACER CLICK ///
////////////////////////////////////////////////////
// Loop through each rating element
if (editMode === true) {
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
}

// // // // // Attribute Boost System (temporal physical attributes via modal)
function initAttributeBoost() {
  const modal = document.getElementById("attr-boost-modal");
  const closeBtn = document.getElementById("attr-boost-modal-close");
  const triggers = document.querySelectorAll(".attr-boost-trigger");
  const optionButtons = document.querySelectorAll(".attr-boost-option");
  const clearBtn = document.querySelector(".attr-boost-clear");
  if (!modal || !closeBtn || triggers.length === 0) return;

  // Map attr key → hidden input ID
  const attrKeyToInputId = { fuerza: "tempFuerza", destreza: "tempDestreza", resistencia: "tempResistencia" };
  let activeAttrKey = null;

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    activeAttrKey = null;
  }

  function openModal(attrKey) {
    activeAttrKey = attrKey;
    const titleEl = document.getElementById("attr-boost-modal-title");
    // Capitalize first letter for display
    const label = attrKey.charAt(0).toUpperCase() + attrKey.slice(1);
    if (titleEl) titleEl.textContent = `Boost temporal: ${label}`;
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
  }

  function applyBoost(value) {
    if (!activeAttrKey) return;
    const badge = document.querySelector(`[data-boost-for="${activeAttrKey}"]`);
    const hiddenId = attrKeyToInputId[activeAttrKey];
    const hiddenInput = hiddenId ? document.getElementById(hiddenId) : null;
    if (badge) {
      badge.textContent = value ? `+${value}` : "";
      badge.classList.toggle("visible", Boolean(value));
    }
    if (hiddenInput) {
      hiddenInput.value = String(value);
    }
    saveCharacterData();
  }

  triggers.forEach((trigger) => {
    trigger.addEventListener("click", () => {
      const row = trigger.closest(".physical-attr");
      const attrKey = row?.getAttribute("data-attr-key");
      if (attrKey) openModal(attrKey);
    });
  });

  optionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      const value = Number(button.getAttribute("data-boost-value") || 0);
      applyBoost(value);
      closeModal();
    });
  });

  clearBtn?.addEventListener("click", () => {
    applyBoost(0);
    closeModal();
  });

  closeBtn.addEventListener("click", closeModal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });
}

// Sync boost badges from hidden inputs (on load)
function syncBoostBadges() {
  const map = { fuerza: "tempFuerza", destreza: "tempDestreza", resistencia: "tempResistencia" };
  Object.entries(map).forEach(([key, inputId]) => {
    const hiddenInput = document.getElementById(inputId);
    const badge = document.querySelector(`[data-boost-for="${key}"]`);
    if (!hiddenInput || !badge) return;
    const val = parseInt(hiddenInput.value) || 0;
    badge.textContent = val ? `+${val}` : "";
    badge.classList.toggle("visible", Boolean(val));
  });
}

initAttributeBoost();
syncBoostBadges();

// // // // // Comportamiento de TABS
const tabs = document.querySelectorAll(".tab-button");
const contents = document.querySelectorAll(".tab-content");

tabs.forEach((tab) => {
  tab.addEventListener("click", () => {
    //remove active class from all tabs
    tabs.forEach((tab) => tab.classList.remove("active"));
    // Add active class to clicked tab
    tab.classList.add("active");

    //Hide All Contents
    contents.forEach((content) => content.classList.remove("active"));
    //Show content for clicked tab
    const tabContentId = tab.dataset.tab;
    document.getElementById(tabContentId).classList.add("active");
  });
});

// Define function to update dots (que es llamada al cargar el archivo)
function updateRatingDots(rating) {
  // Get the hidden input — normally the immediate next sibling,
  // but for physical attributes the rating is inside .attr-rating-wrap
  // and the hidden input is a sibling of the wrap, not the rating.
  let input = rating.nextElementSibling;
  if (!input || input.type !== "hidden") {
    // Try parent's next sibling (for .attr-rating-wrap > .rating)
    const wrap = rating.closest(".attr-rating-wrap");
    if (wrap) input = wrap.nextElementSibling;
  }
  if (!input) return; // safety bail

  const dots = rating.querySelectorAll(".dot");

  // Get the value from the hidden input
  const value = parseInt(input.value);

  // Loop through each dot and update the filled class
  dots.forEach((dot, index) => {
    if (index < value) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });
}

// GUARDAR EN SUPABASE
// Save character data to Supabase (Debounced)
const debouncedSave = debounce(async () => {
  if (!currentSheetId) return; // Don't auto-save if we haven't created the sheet yet (or ask to create)

  // UI Feedback (Simple)
  const saveIcon = document.querySelector('ion-icon[name="save-sharp"]');
  if (saveIcon) saveIcon.style.color = "yellow";

  const characterJSON = getCharacterData();
  const characterData = JSON.parse(characterJSON);
  const name = document.getElementById("nombre").value || "Sin Nombre";

  const { data, error } = await window.supabase
    .from("character_sheets")
    .update({
      name: name,
      data: characterData,
      updated_at: new Date(),
    })
    .eq("id", currentSheetId);

  if (error) {
    console.error("Error saving:", error);
    if (saveIcon) saveIcon.style.color = "red";
  } else {
    if (saveIcon) saveIcon.style.color = "lightgreen";
    setTimeout(() => {
      if (saveIcon) saveIcon.style.color = "";
    }, 1000);
  }
}, 1000);

function saveCharacterData() {
  // Also save to local storage as backup/latency compensation
  const characterJSON = getCharacterData();
  localStorage.setItem("characterData", characterJSON);

  // Trigger cloud save
  if (currentSheetId) {
    debouncedSave();
  }
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
  // Load disciplines from JSON (new or legacy format)
  loadDisciplinesFromJSON(characterData);

  // Load sendas from JSON
  loadSendasFromJSON(characterData);

  // Load powers, then migrate any custom/unknown disciplines into powers
  loadPowersFromJSON(characterData);
  migrateCustomDisciplinesToPowers();
  renderDisciplineList();
  renderPowersList();

  // Load backgrounds from JSON (new or legacy format)
  loadBackgroundsFromJSON(characterData);

  // Load merits & defects from JSON (new or legacy format)
  loadMeritsFromJSON(characterData);
  loadDefectsFromJSON(characterData);

  // Load XP arcs and re-render pool
  loadXpArcsFromJSON(characterData);

  // Load notes
  loadNotesFromJSON(characterData);

  // Load saved rolls
  loadSavedRollsFromJSON(characterData);

  // Load discord webhook config
  loadDiscordWebhookFromJSON(characterData);

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

// Call loadCharacterData when the page loads
window.onload = async function () {
  // Auth Check
  const {
    data: { user },
  } = await window.supabase.auth.getUser();
  if (!user) {
    window.location.href = "../index.html"; // Redirect to login
    return;
  }

  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  if (id) {
    currentSheetId = id;
    document.title = "Cargando...";
    const { data, error } = await window.supabase
      .from("character_sheets")
      .select("*")
      .eq("id", id)
      .single();

    if (data) {
      currentAvatarUrl = data.avatar_url; // Store globally
      loadCharacterFromJSON(data.data);
      updateAll();
    } else {
      alert("No se encontró la hoja de personaje.");
    }
  } else {
    // Redirect to dashboard if no ID provided
    window.location.href = "../index.html#character-sheets";
  }
};
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
    if (id && value && input.type !== "file") {
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

  // Add disciplines data (new format + legacy keys)
  characterData.disciplines = getDisciplinesData(characterData);

  // Add sendas data
  characterData.sendas = getSendasData();

  // Add powers data
  characterData.disciplinePowers = getPowersData();

  // Add backgrounds data (new format + legacy keys)
  characterData.backgrounds = getBackgroundsData(characterData);

  // Add merits & defects data (new format + legacy keys)
  characterData.merits = getMeritsData(characterData);
  characterData.defects = getDefectsData(characterData);

  // Add XP arcs data
  characterData.xpArcs = getXpArcsData();

  // Add notes data
  characterData.notes = getNotesData();

  // Add saved rolls data
  characterData.savedRolls = getSavedRollsData();

  // Add discord webhook data
  characterData.discordWebhookUrl = discordWebhookUrl;
  characterData.discordWebhookEnabled = discordWebhookEnabled;

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
const iconForUpload = document.getElementById("file-input-icon");

function clickOnFileInput() {
  fileInput.click();
}

fileInput.addEventListener("change", (e) => {
  const file = e.target.files[0];
  if (!file) {
    return;
  }

  const reader = new FileReader();

  reader.onload = (event) => {
    const json = event.target.result;
    const characterData = JSON.parse(json);

    // loop through keys in characterData object
    for (const key in characterData) {
      if (characterData.hasOwnProperty(key)) {
        // find the corresponding input element with the same name
        const inputElement = document.querySelector(`[id="${key}"]`);
        if (inputElement) {
          // set the value of the input element
          inputElement.value = characterData[key];
        }
      }
    }

    updateAll();
  };

  reader.readAsText(file);
});

/////////////////////////////
////// SISTEMA DE SALUD ////
////////////////////////////

// funcion para obtener un listado de todos los values de los hidden inputs
// asociados a los span class="square" y ordenarlos de mayor a menor
const healthSquares = document.querySelectorAll(".square");

function getHealthValues() {
  let healthValues = [];
  healthSquares.forEach((square) => {
    healthValues.push(square.nextElementSibling.value);
  });
  healthValues.sort((a, b) => b - a);
  return healthValues;
}

// funcion para actualizar el value del hidden input asociado al span class="square"
// una vez que se ordenaron con la funcion getHealthValues()
function updateHealthValues() {
  let healthValues = getHealthValues();
  healthSquares.forEach((square, index) => {
    square.nextElementSibling.value = healthValues[index];
  });
}

// funcion para actualizar cada span class="square" agregandole la clase segun el value que tenga el hidden input
// segun los siguientes valores:
// 0 = sin clase agregada
// 1 = "contundente"
// 2 = "letal"
// 3 = "agravado"

function updateHealthSquares() {
  healthSquares.forEach((square) => {
    square.classList.remove("contundente");
    square.classList.remove("letal");
    square.classList.remove("agravado");

    let squareValue = square.nextElementSibling.value;
    if (squareValue == 1) {
      square.classList.add("contundente");
    } else if (squareValue == 2) {
      square.classList.add("letal");
    } else if (squareValue == 3) {
      square.classList.add("agravado");
    }
    saveCharacterData();
  });
  updateHealthButtons();
}

// Update health button disabled states
function updateHealthButtons() {
  const healthValues = getHealthValues();
  const hasEmpty = healthValues.includes("0");
  const hasBashing = healthValues.includes("1");
  const hasLethal = healthValues.includes("2");
  const hasAggravated = healthValues.includes("3");

  document.getElementById("contundenteAdd").classList.toggle("disabled", !hasEmpty);
  document.getElementById("letalAdd").classList.toggle("disabled", !hasEmpty);
  document.getElementById("agravadoAdd").classList.toggle("disabled", !hasEmpty);
  document.getElementById("contundenteRemove").classList.toggle("disabled", !hasBashing);
  document.getElementById("letalRemove").classList.toggle("disabled", !hasLethal);
  document.getElementById("agravadoRemove").classList.toggle("disabled", !hasAggravated);
}

//AGREGAR DANIO

const addButtons = document.querySelectorAll('.health-btn[data-health-op="add"]');
const removeButtons = document.querySelectorAll('.health-btn[data-health-op="remove"]');

addButtons.forEach((button) => {
  button.addEventListener("click", () => {
    let healthValues = getHealthValues();

    //Buscar un "0" en el array "healthValues
    let searchValue = "0";
    let i;
    for (i = 0; i < healthValues.length; i++) {
      if (healthValues[i] === searchValue) {
        break;
      }
    }

    if (i < healthValues.length) {
      if (button.id == "contundenteAdd") {
        healthValues[i] = 1;
      }
      if (button.id == "letalAdd") {
        healthValues[i] = 2;
      }
      if (button.id == "agravadoAdd") {
        healthValues[i] = 3;
      }
    } else {
    }
    //Ordena los valores
    healthValues.sort((a, b) => b - a);

    //Pone los valores del array healthValues en los hidden inputs values.
    healthSquares.forEach((square, index) => {
      square.nextElementSibling.value = healthValues[index];
    });

    //Actualiza los span class="square" con las clases correspondientes
    updateHealthSquares();

    //Actualiza el Penalizador de Daño
    updateDamagePenalty();

    // Hit animation on avatar
    const avatar = document.querySelector(".profile-back-link");
    if (avatar) {
      avatar.classList.remove("hit");
      void avatar.offsetWidth; // force reflow to restart animation
      avatar.classList.add("hit");
      avatar.addEventListener("animationend", () => avatar.classList.remove("hit"), { once: true });
    }
  });
});

//RESTAR DANIO
removeButtons.forEach((button) => {
  button.addEventListener("click", () => {
    let healthValues = getHealthValues();

    //para buscar en el array el daño a remover
    let searchValue = "0";
    let i;
    if (button.id == "contundenteRemove") {
      searchValue = "1";
    }
    if (button.id == "letalRemove") {
      searchValue = "2";
    }
    if (button.id == "agravadoRemove") {
      searchValue = "3";
    }

    //Buscar en el array el tipo de daño a remover
    for (i = 0; i < healthValues.length; i++) {
      if (healthValues[i] === searchValue) {
        break;
      }
    }
    if (i < healthValues.length) {
      healthValues[i] = "0";
    } else {
    }
    //Ordena los valores
    healthValues.sort((a, b) => b - a);

    //Pone los valores del array healthValues en los hidden inputs values.
    healthSquares.forEach((square, index) => {
      square.nextElementSibling.value = healthValues[index];
    });
    //Actualiza los span class="square" removiendo las clases correspondientes
    updateHealthSquares();

    //Actualiza el Penalizador de Daño
    updateDamagePenalty();
  });
});

// // // // Penalizador por Daño // // // //
let damagePenalty = 0;

//Funcion para actualizar damagePenalty cada vez que se agrega o remueve daño
function updateDamagePenalty() {
  let healthValues = getHealthValues();

  //Based on the ammount of 0s in the array, calculate the damage penalty
  //>=0 = -10
  //1 = -5
  //2 = -2
  //3 = -2
  //4 = -1
  //5 = -1
  //>=6 = 0

  //contar los 0s en el array healthValues
  let count = 0;
  for (let i = 0; i < healthValues.length; i++) {
    if (healthValues[i] == 0) {
      count++;
    }
  }
  //update value in damagePenalty based on the count
  const healthEl = document.querySelector(".health-container");
  const avatarEl = document.querySelector(".profile-back-link");
  const bloodTargets = [healthEl, avatarEl].filter(Boolean);

  if (count >= 6) {
    damagePenalty = 0;
    bloodTargets.forEach(el => el.classList.remove("lesionado", "malherido", "tullido"));
  } else if (count == 5 || count == 4) {
    damagePenalty = -1;
    bloodTargets.forEach(el => {
      el.classList.remove("malherido", "tullido");
      el.classList.add("lesionado");
    });
  } else if (count == 3 || count == 2) {
    damagePenalty = -2;
    bloodTargets.forEach(el => {
      el.classList.remove("lesionado", "tullido");
      el.classList.add("malherido");
    });
  } else if (count == 1) {
    damagePenalty = -5;
    bloodTargets.forEach(el => {
      el.classList.remove("lesionado", "malherido");
      el.classList.add("tullido");
    });
  } else if (count == 0) {
    damagePenalty = -5;
  }
  //update the value in the input
  document.querySelector("#penalizadorSaludLabel").innerHTML = damagePenalty;
  updateFinalPoolSize();
  updateHealthImpediment();
}

// Mostrar/ocultar el texto de impedimento segun el nivel de daño mas grave
// Textos basados en la tabla de Niveles de Salud del manual V20
const healthLevelTexts = [
  "",                                                                        // Magullado — sin restricción
  "",                                                                        // Lastimado — sin restricción de movimiento
  "Movimiento a mitad de velocidad máxima.",                                 // Lesionado
  "No puede correr. Pierde dados si se mueve y ataca en el mismo turno.",    // Herido
  "Solo puede cojear (3 metros/turno).",                                     // Malherido
  "Solo puede arrastrarse (1 metro/turno).",                                 // Tullido
  "Inconsciente. Sin Sangre, entra en Letargo."                              // Incapacitado
];

function updateHealthImpediment() {
  const impedimentEl = document.getElementById("health-impediment");
  if (!impedimentEl) return;

  // Recorrer los 7 squares y encontrar el índice más alto con daño (valor > 0)
  let worstLevel = -1;
  healthSquares.forEach((square, index) => {
    const val = Number(square.nextElementSibling.value) || 0;
    if (val > 0) worstLevel = index;
  });

  // Magullado (índice 0) no muestra mensaje; -1 = sin daño
  const message = worstLevel > 0 ? healthLevelTexts[worstLevel] : "";

  if (message) {
    impedimentEl.textContent = message;
    impedimentEl.classList.remove("hidden");
  } else {
    impedimentEl.textContent = "";
    impedimentEl.classList.add("hidden");
  }
}

// PUNTOS DE SANGRE POR TURNO SEGUN GENERACION

//funcion para calcular el texto del label #bloodPerTurn
//segun el valor del input #generacion
function calculateBloodPerTurn() {
  const bloodPerTurn = document.querySelector("#bloodPerTurn");
  const generationValue = document.querySelector("#generacion").value;
  //generacion = o mayor que 10 = 1 punto de sangre por turno
  //generacion = 9 = 2 puntos de sangre por turno
  //generacion = 8 = 3 puntos de sangre por turno
  //generacion = 7 = 4 puntos de sangre por turno
  //generacion = 6 = 6 puntos de sangre por turno
  //generacion = 5 = 8 puntos de sangre por turno
  //generacion = 4 = 10 puntos de sangre por turno
  //generacion =< 3 = "???" puntos de sangre por turno
  if (generationValue >= 10) {
    bloodPerTurn.innerHTML = "1";
  }
  if (generationValue == 9) {
    bloodPerTurn.innerHTML = "2";
  }
  if (generationValue == 8) {
    bloodPerTurn.innerHTML = "3";
  }
  if (generationValue == 7) {
    bloodPerTurn.innerHTML = "4";
  }
  if (generationValue == 6) {
    bloodPerTurn.innerHTML = "6";
  }
  if (generationValue == 5) {
    bloodPerTurn.innerHTML = "8";
  }
  if (generationValue == 4) {
    bloodPerTurn.innerHTML = "10";
  }
  if (generationValue <= 3) {
    bloodPerTurn.innerHTML = "???";
  }
}

//funcion para actualizar el texto del label #bloodPerTurn usando la func calculateBloodPerTurn()
function updateBloodPerTurn() {
  calculateBloodPerTurn();
}

// llamar a la funcion updateBloodPerTurn() cuando se cambia el campo #generacion
document.querySelector("#generacion").addEventListener("change", function () {
  updateBloodPerTurn();
  blockBloodPool();
});

// Obtener el Maximo de sangre segun generacion
function getMaxBloodPool() {
  const generationValue = parseInt(document.querySelector("#generacion").value);
  let maxBloodPool;

  if (generationValue <= 6) {
    maxBloodPool = 30;
  } else if (generationValue <= 7) {
    maxBloodPool = 20;
  } else if (generationValue <= 8) {
    maxBloodPool = 15;
  } else if (generationValue <= 9) {
    maxBloodPool = 14;
  } else if (generationValue <= 10) {
    maxBloodPool = 13;
  } else if (generationValue <= 11) {
    maxBloodPool = 12;
  } else if (generationValue <= 12) {
    maxBloodPool = 11;
  } else {
    maxBloodPool = 10;
  }

  return maxBloodPool;
}

// Funcion: Bloquear blood pool
function blockBloodPool() {
  const cells = document.querySelectorAll("#blood-track .blood-cell");
  const maxBloodPool = getMaxBloodPool();

  cells.forEach((cell, index) => {
    if (index >= maxBloodPool) {
      cell.classList.add("disabled");
    } else {
      cell.classList.remove("disabled");
    }
  });

  // Update max label in the metadata line
  const maxLabel = document.getElementById("blood-max-label");
  if (maxLabel) maxLabel.textContent = String(maxBloodPool);
}

/// Manejo de Sangre por botones ///

document.querySelectorAll("[data-blood-op]").forEach(btn => {
  btn.addEventListener("click", () => {
    const op = btn.getAttribute("data-blood-op");
    const type = btn.getAttribute("data-blood-type") || "";
    modifyBlood(op, type);
  });
});

function modifyBlood(action, type) {
  let currentValue = document.querySelector("#blood-value").value;
  const maxBloodPool = getMaxBloodPool(); // Obtiene el máximo permitido de sangre basado en la generación.
  const bloodBefore = currentValue.replace(/0/g, "").length;

  if (action === "add") {
    // La lógica de añadir sangre se mantiene igual.
    if (currentValue.replace(/0/g, "").length < maxBloodPool) {
      const firstZeroIndex = currentValue.indexOf("0");
      if (firstZeroIndex !== -1) {
        currentValue =
          currentValue.substring(0, firstZeroIndex) +
          type +
          currentValue.substring(firstZeroIndex);
      } else if (currentValue.length < maxBloodPool) {
        currentValue += type; // Añade el nuevo tipo al final si aún hay espacio total.
      }
    }
  } else if (action === "consume") {
    // Para consumir, simplemente elimina el primer carácter y añade un '0' al final si hay espacio.
    if (currentValue.length > 0) {
      currentValue = currentValue.substring(1) + "0";
    }
  }

  // Asegura que el valor no exceda el tamaño del pool de sangre permitido.
  currentValue = currentValue
    .padEnd(maxBloodPool, "0")
    .substring(0, maxBloodPool);

  document.querySelector("#blood-value").value = currentValue;
  updateBloodUI();

  if (action === "consume") {
    const bloodAfter = currentValue.replace(/0/g, "").length;
    if (bloodAfter < bloodBefore) {
      flashBloodConsume();
    } else {
      flashBloodWarning();
    }
  }

  saveCharacterData();
}

function updateBloodUI() {
  const bloodValue = document.querySelector("#blood-value").value;

  const cells = document.querySelectorAll("#blood-track .blood-cell");
  cells.forEach((cell, index) => {
    // Reset: remove type classes but keep "blood-cell" base class
    cell.classList.remove("type-1", "type-2", "type-3");
    if (index < bloodValue.length) {
      const type = bloodValue.charAt(index);
      if (type !== "0") {
        cell.classList.add(`type-${type}`);
      }
    }
  });

  // Block the blood pool based on generation
  blockBloodPool();

  // Update blood title and frenzy state based on current blood level
  const bloodCount = bloodValue.replace(/0/g, "").length;
  const bloodTitle = document.querySelector(".blood-card .health-title");
  const bloodCard = document.querySelector(".blood-card");
  const attrTitle = document.getElementById("attributes-title");
  const abilTitle = document.getElementById("abilities-title");

  bloodCard.classList.remove("blood-urgent", "blood-frenzy");
  attrTitle.classList.remove("blood-frenzy-text");
  abilTitle.classList.remove("blood-frenzy-text");

  if (bloodCount <= 1) {
    bloodTitle.textContent = "SANGRE AHORA!";
    bloodCard.classList.add("blood-frenzy");
    attrTitle.textContent = "HAMBRE!";
    attrTitle.classList.add("blood-frenzy-text");
    abilTitle.textContent = "TENGO QUE BEBER";
    abilTitle.classList.add("blood-frenzy-text");
  } else if (bloodCount <= 4) {
    bloodTitle.textContent = "Sangre! Ya!";
    bloodCard.classList.add("blood-urgent");
    attrTitle.textContent = "Atributos";
    abilTitle.textContent = "Habilidades";
  } else {
    bloodTitle.textContent = "Sangre";
    attrTitle.textContent = "Atributos";
    abilTitle.textContent = "Habilidades";
  }
}

////////-------------------------------------------////////
////////-------------------------------------------////////
////////            DADOS VIRTUDES                 ////////
////////-------------------------------------------////////
////////-------------------------------------------////////

// Funcion: Bloquear virtudes basado en Senda/Humanidad
// Dots have 3 visual states:
//   - available: filled AND within humanity cap (orange gradient)
//   - blocked:   filled BUT exceeds humanity cap (grey hatched)
//   - (none):    empty dot
function blockVirtues() {
  const humanityValue = parseInt(
    document.querySelector("#humanidad-value").value, 10
  ) || 0;

  const virtueRatings = document.querySelectorAll(
    ".virtue-rating:not(.virtue-humanity-rating)"
  );

  virtueRatings.forEach((ratingEl) => {
    // Read the raw virtue value from the sibling hidden input
    const hiddenInput = ratingEl.nextElementSibling
      ? ratingEl.parentElement.querySelector("input[id$='-value']")
      : null;
    const rawValue = hiddenInput ? parseInt(hiddenInput.value, 10) || 0 : 0;

    const dots = ratingEl.querySelectorAll(".dot");
    dots.forEach((dot) => {
      const dotVal = parseInt(dot.getAttribute("data-value"), 10);
      dot.classList.remove("filled", "available", "blocked", "disabled");

      if (dotVal < rawValue && dotVal < humanityValue) {
        // Within both virtue level AND humanity cap → active
        dot.classList.add("available");
      } else if (dotVal < rawValue && dotVal >= humanityValue) {
        // Within virtue level BUT exceeds humanity → blocked
        dot.classList.add("blocked");
      }
      // else: empty dot, no class needed
    });
  });

  // Re-render sins table to reflect updated humanity value
  renderPathInfo();
}

// ====== ROAD / PATH REPOSITORY ====== //
// Data loaded from pathRepository.js (window.ROAD_REPO, window.VIRTUE_MAP)

// Apply a road's virtues to the sheet (labels + hidden inputs)
function applyRoadVirtues(road) {
  // Update path name
  document.getElementById("humanidad").value = road.name;
  document.getElementById("virtue-path-label").textContent = road.name;

  // Update virtue 1 (Conciencia / Convicción)
  const v1 = VIRTUE_MAP[road.virtues[0]];
  document.getElementById("virtue1").value = v1.value;
  document.getElementById("virtue1-label").textContent = v1.label;

  // Update virtue 2 (Autocontrol / Instinto)
  const v2 = VIRTUE_MAP[road.virtues[1]];
  document.getElementById("virtue2").value = v2.value;
  document.getElementById("virtue2-label").textContent = v2.label;

  saveCharacterData();
  renderPathInfo();
}

// Sync virtue labels from hidden input values (called on load)
function syncVirtueLabels() {
  let pathName = document.getElementById("humanidad").value;

  // Recover from corrupted data: if the value is numeric or empty, default to "Humanidad"
  if (!pathName || !isNaN(pathName)) {
    pathName = "Humanidad";
    document.getElementById("humanidad").value = pathName;
  }

  document.getElementById("virtue-path-label").textContent = pathName;

  const v1val = document.getElementById("virtue1").value;
  const v1entry = Object.values(VIRTUE_MAP).find(v => v.value === v1val);
  if (v1entry) {
    document.getElementById("virtue1-label").textContent = v1entry.label;
  }

  const v2val = document.getElementById("virtue2").value;
  const v2entry = Object.values(VIRTUE_MAP).find(v => v.value === v2val);
  if (v2entry) {
    document.getElementById("virtue2-label").textContent = v2entry.label;
  }

  renderPathInfo();
}

// Render path description + sins table (if enriched data exists)
function renderPathInfo() {
  const container = document.getElementById("path-info");
  if (!container) return;

  const pathName = document.getElementById("humanidad").value;
  const road = ROAD_REPO.find(r => r.name === pathName);

  // If no enriched data, clear and exit
  if (!road || (!road.description && !road.sins)) {
    container.innerHTML = "";
    return;
  }

  let html = "";

  // Description + wiki link
  if (road.description) {
    html += `<p class="path-description">${road.description}`;
    if (road.wikiUrl) {
      html += ` <a href="${road.wikiUrl}" target="_blank" rel="noopener noreferrer" class="path-wiki-link">ver más...</a>`;
    }
    html += `</p>`;
  }

  // Sins table
  if (road.sins && road.sins.length > 0) {
    const humanityValue = parseInt(document.getElementById("humanidad-value").value, 10) || 0;
    html += `<div class="sins-table-wrapper">`;
    html += `<table class="sins-table">`;
    html += `<thead><tr><th></th><th>Directriz moral</th><th>Razón fundamental</th></tr></thead>`;
    html += `<tbody>`;
    road.sins.forEach(s => {
      const beyond = s.rating > humanityValue ? " beyond" : "";
      html += `<tr class="${beyond}"><td class="sins-rating">${s.rating}</td><td>${s.sin}</td><td class="sins-reason">${s.reason}</td></tr>`;
    });
    html += `</tbody></table>`;
    html += `</div>`;
  }

  container.innerHTML = html;
}

// ====== PATH REPOSITORY MODAL ====== //

(function initPathRepo() {
  const modal     = document.getElementById("path-repo-modal");
  const openBtn   = document.getElementById("open-path-repo");
  const closeBtn  = document.getElementById("path-repo-close");
  const searchBox = document.getElementById("path-repo-search");
  const listEl    = document.getElementById("path-repo-list");
  const applyBtn  = document.getElementById("path-repo-apply");

  if (!modal || !openBtn) return;

  let selectedRoadId = null;

  function normalizeForSearch(str) {
    return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
  }

  function getVirtueLabels(road) {
    const v1 = VIRTUE_MAP[road.virtues[0]];
    const v2 = VIRTUE_MAP[road.virtues[1]];
    return (v1 ? v1.label : "?") + " · " + (v2 ? v2.label : "?") + " · Coraje";
  }

  function renderList(filter) {
    listEl.innerHTML = "";
    const currentPathName = document.getElementById("humanidad").value;
    const filterNorm = filter ? normalizeForSearch(filter) : "";

    ROAD_REPO.forEach(road => {
      if (filterNorm && !normalizeForSearch(road.name).includes(filterNorm)) return;

      const item = document.createElement("button");
      item.type = "button";
      item.className = "path-repo-item";

      const title = document.createElement("strong");
      title.className = "path-repo-item-title";
      title.textContent = road.name;
      item.appendChild(title);

      const virtues = document.createElement("span");
      virtues.className = "path-repo-item-virtues";
      virtues.textContent = getVirtueLabels(road);
      item.appendChild(virtues);

      if (road.description) {
        const desc = document.createElement("span");
        desc.className = "path-repo-item-desc";
        desc.textContent = road.description;
        item.appendChild(desc);
      }

      // Mark currently active road
      if (road.name === currentPathName || road.id === selectedRoadId) {
        item.classList.add("selected");
        selectedRoadId = road.id;
      }

      item.addEventListener("click", () => {
        listEl.querySelectorAll(".path-repo-item").forEach(el => el.classList.remove("selected"));
        item.classList.add("selected");
        selectedRoadId = road.id;
      });

      listEl.appendChild(item);
    });
  }

  function openModal() {
    // Pre-select current road
    const currentName = document.getElementById("humanidad").value;
    const currentRoad = ROAD_REPO.find(r => r.name === currentName);
    selectedRoadId = currentRoad ? currentRoad.id : null;

    searchBox.value = "";
    renderList("");
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    searchBox.focus();
  }

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
    selectedRoadId = null;
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);

  // Close on backdrop click
  modal.addEventListener("click", (e) => {
    if (e.target === modal) closeModal();
  });

  // Close on Escape
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });

  // Search filter
  searchBox.addEventListener("input", () => {
    renderList(searchBox.value);
  });

  // Apply selection
  applyBtn.addEventListener("click", () => {
    if (selectedRoadId === null) { closeModal(); return; }
    const road = ROAD_REPO.find(r => r.id === selectedRoadId);
    if (road) applyRoadVirtues(road);
    closeModal();
  });
})();

// ====== VIRTUE + SENDA DICE ROLLING ====== //

// Click on virtue label → add to dice pool 1
document.querySelectorAll(".virtue-sheet-row span[id$='-label'], .virtue-sheet-row span:not([id])").forEach((label) => {
  label.style.cursor = "pointer";
  label.addEventListener("click", () => {
    resetDicePool1();
    const virtueName = label.textContent.trim();
    // Find the sibling hidden input with the value
    const row = label.closest(".virtue-sheet-row");
    const valueInput = row ? row.querySelector("input[id$='-value']") : null;
    let virtueDice = valueInput ? parseInt(valueInput.value) || 0 : 0;

    const humanityValue = parseInt(document.querySelector("#humanidad-value").value) || 0;

    // Limitar segun Humanidad/Senda (aplica a todas las virtudes)
    if (virtueDice > humanityValue) {
      virtueDice = humanityValue;
    }

    // Limitar Autocontrol/Instinto segun Reserva de Sangre (Regla V20)
    const isVirtue2 = valueInput && valueInput.id === "virtue2-value";
    if (isVirtue2) {
      const bloodValueString = document.querySelector("#blood-value").value;
      const bloodPoolValue = bloodValueString.replace(/0/g, "").length;
      if (virtueDice > bloodPoolValue) {
        virtueDice = bloodPoolValue;
        flashBloodWarning();
      }
    }

    addToPool1(virtueDice, virtueName);
  });
});

// Click on path label → add Senda/Humanidad to dice pool 1
document.getElementById("virtue-path-label").addEventListener("click", () => {
  resetDicePool1();
  const sendaName = document.getElementById("virtue-path-label").textContent.trim();
  const sendaDice = parseInt(document.getElementById("humanidad-value").value) || 0;
  addToPool1(sendaDice, sendaName);
});
document.getElementById("virtue-path-label").style.cursor = "pointer";

////////-------------------------------------------////////
////////-------------------------------------------////////
////////            FUERZA DE VOLUNTAD             ////////
////////-------------------------------------------////////
////////-------------------------------------------////////

// ====== FUERZA DE VOLUNTAD — Beta track system ====== //

// Render the willpower track from hidden input values
function renderWillpowerTrack() {
  const permValue = parseInt(document.querySelector("#voluntadPerm-value").value) || 0;
  const tempValue = parseInt(document.querySelector("#voluntadTemp-value").value) || 0;
  const permButtons = document.querySelectorAll("#willpower-track .willpower-perm");
  const tempButtons = document.querySelectorAll("#willpower-track .willpower-temp");

  permButtons.forEach((btn, i) => {
    btn.classList.remove("filled", "empty");
    btn.classList.add(i < permValue ? "filled" : "empty");
  });

  tempButtons.forEach((btn, i) => {
    btn.classList.remove("used", "available", "locked");
    if (i >= permValue) {
      btn.classList.add("locked");
    } else if (i < tempValue) {
      btn.classList.add("used");
    } else {
      btn.classList.add("available");
    }
  });

  // Update dice menu labels with current values
  const menuPermbtn = document.querySelector('[data-willpower-roll="perm"]');
  const menuTempbtn = document.querySelector('[data-willpower-roll="temp"]');
  if (menuPermbtn) menuPermbtn.textContent = `Tirar Permanente (${permValue})`;
  if (menuTempbtn) menuTempbtn.textContent = `Tirar Temporal (${tempValue})`;
}

// Bloquear FUERZA DE VOLUNTAD TEMPORAL (legacy compat — now just renders)
function blockTemporalWillpower() {
  renderWillpowerTrack();
}

// Click handlers for willpower perm/temp buttons
(function initWillpowerTrack() {
  const track = document.querySelector("#willpower-track");
  if (!track) return;

  track.addEventListener("click", function (e) {
    const btn = e.target.closest("button");
    if (!btn) return;

    const index = parseInt(btn.getAttribute("data-index"));

    if (btn.classList.contains("willpower-perm")) {
      const permInput = document.querySelector("#voluntadPerm-value");
      const currentPerm = parseInt(permInput.value) || 0;
      // Click on last active → toggle off
      if (index + 1 === currentPerm) {
        permInput.value = index;
      } else {
        permInput.value = index + 1;
      }
      // Temporal can't exceed permanent; clamp if needed
      const tempInput = document.querySelector("#voluntadTemp-value");
      const newPerm = parseInt(permInput.value) || 0;
      if (parseInt(tempInput.value) > newPerm) {
        tempInput.value = newPerm;
      }
      renderWillpowerTrack();
      blockVirtues();
      saveCharacterData();
    }

    if (btn.classList.contains("willpower-temp")) {
      const permValue = parseInt(document.querySelector("#voluntadPerm-value").value) || 0;
      // Can't click locked slots
      if (index >= permValue) return;

      const tempInput = document.querySelector("#voluntadTemp-value");
      const currentTemp = parseInt(tempInput.value) || 0;
      // Click on last active → toggle off
      if (index + 1 === currentTemp) {
        tempInput.value = index;
      } else {
        tempInput.value = index + 1;
      }
      renderWillpowerTrack();
      saveCharacterData();
    }
  });
})();

// Willpower dice roll menu
(function initWillpowerRollMenu() {
  const trigger = document.getElementById("willpower-roll-trigger");
  const container = document.querySelector(".willpower-roll");
  if (!trigger || !container) return;

  function closeMenu() {
    container.classList.remove("open");
    trigger.setAttribute("aria-expanded", "false");
  }

  trigger.addEventListener("click", function (e) {
    e.stopPropagation();
    const isOpen = container.classList.toggle("open");
    trigger.setAttribute("aria-expanded", isOpen ? "true" : "false");
  });

  // Menu buttons — feed dice roller
  container.addEventListener("click", function (e) {
    const menuBtn = e.target.closest("[data-willpower-roll]");
    if (!menuBtn) return;
    const type = menuBtn.getAttribute("data-willpower-roll");
    if (type === "perm") {
      rollVoluntad("voluntadPerm-value");
    } else if (type === "temp") {
      rollVoluntad("voluntadTemp-value");
    }
    closeMenu();
  });

  document.addEventListener("click", function (e) {
    if (!container.contains(e.target)) closeMenu();
  });

  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") closeMenu();
  });
})();

// Feed willpower value to dice roller Pool1
function rollVoluntad(inputId) {
  const inputElement = document.querySelector(`#${inputId}`);
  const inputValue = inputElement.value;
  const inputName = inputElement.getAttribute("name");
  resetDicePool1();
  addToPool1(inputValue, inputName);
}

////////-------------------------------------------////////
////////-------------------------------------------////////
////////                  DADOS                    ////////
////////-------------------------------------------////////
////////-------------------------------------------////////

//Add anything to Pool 1
//with a Dice number and a Name
function addToPool1(diceValue, labelName) {
  //Update value and label for Pool
  document.querySelector("#dicePool1").value = diceValue;
  document.querySelector("#dicePool1Label").innerHTML =
    capitalizeFirstLetter(labelName);
  updateFinalPoolSize();
}

//Add anything to Pool 2
//with a Dice number and a Name
function addToPool2(diceNumber, name) {
  //Update value and label for Pool2
  document.querySelector("#dicePool2").value = inputValue;
  document.querySelector("#dicePool2Label").innerHTML =
    capitalizeFirstLetter(inputName);
  updateFinalPoolSize();
}

//REFACTOR: CONSTANTS

//Registra el total de dados en el pool
let finalPoolSize = 0;

//Boton de tirar dados
const diceButton = document.querySelector("#diceButton");

//Listado de atributos
const attributesList = document.querySelectorAll(
  ".attributes .form-group.attribute"
);

//Listado de habilidades
const abilitiesList = document.querySelectorAll(
  ".abilities .form-group.attribute label"
);

//Todos los checkboxes
const checkboxes = document.querySelectorAll('input[type="checkbox"]');

//REFACTOR: Update finalPoolSize
function updateFinalPoolSize() {
  const FirstDicePool = parseInt(document.querySelector("#dicePool1").value);
  const SecondDicePool = parseInt(document.querySelector("#dicePool2").value);
  const diceMod = parseInt(document.querySelector("#diceMod").value);
  const penalizadorSalud = document.querySelector("#penalizadorSalud").checked;
  const penalizadorSaludValue = parseInt(
    document.querySelector("#penalizadorSaludLabel").innerHTML
  );
  //calculate finalPoolSize

  //check if penalizadorSalud is used
  if (penalizadorSalud == true) {
    finalPoolSize =
      FirstDicePool + SecondDicePool + diceMod + penalizadorSaludValue;
  } else {
    finalPoolSize = FirstDicePool + SecondDicePool + diceMod;
  }

  //show finalPoolSize in #diceButton
  if (finalPoolSize <= 0) {
    diceButton.innerHTML = "Sin dados";

    //agregar clase disabled al boton
    diceButton.classList.add("disabled");

    //disable the button
    diceButton.disabled = true;
  } else {
    diceButton.innerHTML = `Lanzar ${finalPoolSize}d10`;

    //remove clase disabled al boton
    diceButton.classList.remove("disabled");

    //enable the button
    diceButton.disabled = false;
  }
}

//REFACTOR: Tirar los Dados
function rollTheDice() {
  //stablish difficulty
  const difficulty = document.querySelector("#difficulty").value;
  //check if willpower is used
  const willpower = document.querySelector("#willpower").checked;
  //check if specialty is used
  const specialty = document.querySelector("#specialty").checked;
  //Obtain elements for the results
  const resultContainer = document.querySelector("#diceResults");
  const rollsList = document.querySelector("#diceRolls");
  const resultElement = document.querySelector("#diceResult");

  //obtener el atributo y habilidad seleccionado (si hay)
  const pool1 = document.querySelector("#dicePool1Label").innerHTML || "";
  const pool1Size = document.querySelector("#dicePool1").value;
  const pool2 = document.querySelector("#dicePool2Label").innerHTML || "";
  const pool2Size = document.querySelector("#dicePool2").value;
  const mods = document.querySelector("#diceMod").value;
  const damagePenaltyCheckbox =
    document.querySelector("#penalizadorSalud").checked;
  const damagePenalty = parseInt(
    document.querySelector("#penalizadorSaludLabel").innerHTML
  );

  //obtain character name
  const characterName = document.querySelector("#nombre").value;
  //obtain character clan
  const characterClan = document.querySelector("#clan").value || "";

  //Resetear mensaje de Voluntad usada
  let willpowerNotice = "";
  let willpowerTrueFalse = "No";
  let willpowerSuccess = 0;
  let specialtyTrueFalse = "No";
  let damagePenaltyTrueFalse = "No";

  if (specialty === true) {
    specialtyTrueFalse = "Si";
  }
  if (damagePenaltyCheckbox == true) {
    damagePenaltyTrueFalse = "Si";
  }

  // roll the dice and count successes and botches
  let successes = 0;
  let fails = 0;
  let botches = 0;
  let color = "";
  const rolls = [];
  for (let i = 0; i < finalPoolSize; i++) {
    const roll = Math.floor(Math.random() * 10) + 1;
    rolls.push(roll);
    if (specialty === true && roll === 10) {
      successes += 2;
    } else if (roll >= difficulty) {
      successes++;
    } else if (roll === 1) {
      botches++;
    } else {
      fails++;
    }
  }

  //willpower automatic success
  if (willpower === true) {
    willpowerSuccess++;
    willpowerNotice = " (1 exito por Voluntad)";
    willpowerTrueFalse = "Si";
  }

  // Potencia (activated) — these count as regular successes (cancellable by 1s)
  let potenciaSuccess = 0;
  let potenciaTrueFalse = "No";
  const pool1AttrName = pool1.split("+")[0].trim(); // "Fuerza+Pot" → "Fuerza", or just "Fuerza"
  const potenciaBonus = getPhysicalDisciplineBonus(pool1AttrName);
  if (potenciaBonus && activatedDisciplines.has(potenciaBonus.id)) {
    potenciaSuccess = potenciaBonus.level;
    potenciaTrueFalse = "Si";
    // Add to successes so botches can cancel them
    successes += potenciaSuccess;
  }

  // Willpower is the only true auto-success (immune to botches)
  const autoSuccesses = willpowerSuccess;

  // calculate the final result
  let resultText;
  if (autoSuccesses === 0 && successes === 0 && botches === 0) {
    color = "11247616";
    resultText = "Fallo";
  } else if (autoSuccesses === 0 && successes === 0 && botches > 0) {
    resultText = "Fracaso";
    color = "14225681";
  } else if (autoSuccesses === 0 && successes <= botches) {
    color = "11247616";
    resultText = "Fallo";
  } else if (autoSuccesses + successes - botches > 1) {
    color = "58911";
    if (successes - botches < 0) {
      successes = 0;
    } else {
      successes -= botches;
    }
    successes += autoSuccesses;
    resultText = `${successes} Éxitos`;
  } else {
    color = "58911";
    if (successes - botches < 0) {
      successes = 0;
    } else {
      successes -= botches;
    }
    successes += autoSuccesses;
    resultText = `${successes} Éxito`;
  }

  //add willpower notice to resultText
  resultText += willpowerNotice;

  //Show the results using beta dice-result styling
  rollsList.innerHTML = "";

  // Determine overall result state class
  let stateClass = "success";
  if (resultText.includes("Fracaso")) {
    stateClass = "botch";
  } else if (resultText.includes("Fallo")) {
    stateClass = "fail";
  }

  // Start in neutral "rolling" state — show "0 Éxitos" counter
  resultContainer.classList.remove("success", "fail", "botch", "hidden", "wakeup", "rolling");
  resultContainer.classList.add("rolling");
  resultElement.textContent = "0 Éxitos";
  resultElement.classList.remove("hidden-result");

  // Display results: Potencia chips first, then dice chips sorted descending
  rolls.sort((a, b) => b - a);

  // --- Determine which successes get cancelled by botches ---
  const successSlots = [];
  for (let i = rolls.length - 1; i >= 0; i--) {
    if (rolls[i] >= difficulty) {
      if (specialty && rolls[i] === 10) {
        successSlots.push({ source: "specialty-bonus", roll: 10, index: i });
      }
      successSlots.push({ source: "dice", roll: rolls[i], index: i });
    }
  }
  for (let i = potenciaSuccess - 1; i >= 0; i--) {
    successSlots.push({ source: "potencia", roll: 0, index: i });
  }

  let cancelsRemaining = botches;
  const cancelledDiceIndices = new Set();
  const cancelledSpecialtyIndices = new Set();
  let cancelledPotenciaCount = 0;
  for (const slot of successSlots) {
    if (cancelsRemaining <= 0) break;
    if (slot.source === "specialty-bonus") {
      cancelledSpecialtyIndices.add(slot.index);
    } else if (slot.source === "dice") {
      cancelledDiceIndices.add(slot.index);
    } else if (slot.source === "potencia") {
      cancelledPotenciaCount++;
    }
    cancelsRemaining--;
  }

  // --- Build all chips (unrevealed) and track them for animation ---
  // Each chip stores: revealClass (shown during reveal, NO cancelled yet) and finalClass (after cancel phase)
  const allChips = []; // { element, revealClass, finalClass, isBonus, willCancel }

  // Potencia chips
  if (potenciaSuccess > 0) {
    for (let i = 0; i < potenciaSuccess; i++) {
      const potChip = document.createElement("span");
      const isCancelled = i >= (potenciaSuccess - cancelledPotenciaCount);
      const revealClass = "dice-result-die success potencia-chip";
      const finalClass = `dice-result-die success potencia-chip${isCancelled ? " cancelled" : ""}`;
      potChip.className = "dice-result-die dice-unrevealed";
      potChip.innerHTML = `<iconify-icon icon="game-icons:fist" width="20" aria-hidden="true"></iconify-icon>`;
      potChip.title = `${potenciaBonus.fullName}`;
      rollsList.appendChild(potChip);
      allChips.push({ element: potChip, revealClass, finalClass, isBonus: false, willCancel: isCancelled });
    }
  }

  // Dice chips
  for (let i = 0; i < rolls.length; i++) {
    const roll = rolls[i];
    const chip = document.createElement("span");
    chip.textContent = roll;
    let revealClass = "";
    let finalClass = "";
    let willCancel = false;

    if (roll === 1) {
      revealClass = "dice-result-die botch";
      finalClass = revealClass;
    } else if (roll >= difficulty) {
      const isCancelled = cancelledDiceIndices.has(i);
      revealClass = "dice-result-die success";
      finalClass = `dice-result-die success${isCancelled ? " cancelled" : ""}`;
      willCancel = isCancelled;
    } else {
      revealClass = "dice-result-die fail";
      finalClass = revealClass;
    }

    chip.className = "dice-result-die dice-unrevealed";
    rollsList.appendChild(chip);
    allChips.push({ element: chip, revealClass, finalClass, isBonus: false, willCancel });

    // Specialty 10: add bonus chip right after
    if (specialty && roll === 10 && roll >= difficulty) {
      const bonusChip = document.createElement("span");
      const isBonusCancelled = cancelledSpecialtyIndices.has(i);
      const bonusRevealClass = "dice-result-die success specialty-bonus";
      const bonusFinalClass = `dice-result-die success specialty-bonus${isBonusCancelled ? " cancelled" : ""}`;
      bonusChip.className = "dice-result-die dice-unrevealed specialty-bonus";
      bonusChip.innerHTML = `<iconify-icon icon="mdi:star-four-points" width="18" aria-hidden="true"></iconify-icon>`;
      bonusChip.title = "Éxito extra por Especialidad";
      rollsList.appendChild(bonusChip);
      allChips.push({ element: bonusChip, revealClass: bonusRevealClass, finalClass: bonusFinalClass, isBonus: true, willCancel: isBonusCancelled });
    }
  }

  // --- Animation sequence ---
  const APPEAR_DELAY = 100;   // ms between each die flying up
  const APPEAR_ANIM = 550;    // ms for the fly-up animation itself
  const REVEAL_PAUSE = 250;   // ms pause before revealing colors
  const REVEAL_DELAY = 70;    // ms between each die revealing
  const CANCEL_PAUSE = 350;   // ms pause before cancellation hits
  const CANCEL_DELAY = 120;   // ms between each cancellation hit
  const RESULT_PAUSE = 300;   // ms pause before showing result

  // Phase 1: Staggered appearance (grey dice popping in)
  allChips.forEach((item, idx) => {
    const delay = item.isBonus ? (idx - 1) * APPEAR_DELAY : idx * APPEAR_DELAY;
    setTimeout(() => {
      item.element.classList.remove("dice-unrevealed");
      item.element.classList.add("dice-appearing");
    }, Math.max(0, delay));
  });

  // Phase 2: Reveal colors + live counter
  const lastAppearTime = (allChips.length - 1) * APPEAR_DELAY + APPEAR_ANIM + REVEAL_PAUSE;
  let runningCount = 0;

  // Helper to update the live counter display
  function updateLiveCounter(count) {
    const n = Math.max(0, count);
    resultElement.textContent = `${n} ${n === 1 ? "Éxito" : "Éxitos"}`;
  }

  setTimeout(() => {
    allChips.forEach((item, idx) => {
      const delay = item.isBonus ? (idx - 1) * REVEAL_DELAY : idx * REVEAL_DELAY;
      setTimeout(() => {
        item.element.className = item.revealClass;
        item.element.classList.add("dice-revealed");

        // Increment counter for each success revealed
        if (item.revealClass.includes("success")) {
          runningCount++;
          updateLiveCounter(runningCount);
        }
      }, Math.max(0, delay));
    });

    // Phase 3: Cancellation hits (botches knock out successes)
    const lastRevealTime = (allChips.length - 1) * REVEAL_DELAY + CANCEL_PAUSE;
    const chipsToCancel = allChips.filter(c => c.willCancel);
    const hasCancels = chipsToCancel.length > 0;

    if (hasCancels) {
      setTimeout(() => {
        chipsToCancel.forEach((item, idx) => {
          setTimeout(() => {
            item.element.className = item.finalClass.replace(" cancelled", "");
            item.element.classList.add("dice-cancel-hit");

            // Decrement counter for each cancelled success
            runningCount--;
            updateLiveCounter(runningCount);
          }, idx * CANCEL_DELAY);
        });

        // Phase 4: Apply final state after all cancellations
        const lastCancelTime = (chipsToCancel.length - 1) * CANCEL_DELAY + RESULT_PAUSE + 350;
        setTimeout(() => {
          resultContainer.classList.remove("rolling");
          resultContainer.classList.add(stateClass);
          // Replace with final text only if it's Fracaso/Fallo (otherwise counter already shows it)
          resultElement.textContent = resultText;
        }, lastCancelTime);
      }, lastRevealTime);
    } else {
      // No cancellations — apply final state after reveals
      setTimeout(() => {
        resultContainer.classList.remove("rolling");
        resultContainer.classList.add(stateClass);
        resultElement.textContent = resultText;
      }, lastRevealTime);
    }
  }, lastAppearTime);

  // Build rolls string for Discord: Ps first, then dice values
  const potenciaPs = potenciaSuccess > 0 ? Array(potenciaSuccess).fill("P") : [];
  const discordRolls = [...potenciaPs, ...rolls];

  // Post to Discord the result
  messageToDiscord = `**${resultText}**\n${discordRolls.join(", ")}`;
  sendToDiscordRoll(
    characterName,
    characterClan,
    pool1,
    pool1Size,
    pool2,
    pool2Size,
    mods,
    resultText,
    discordRolls,
    difficulty,
    color,
    damagePenalty,
    damagePenaltyTrueFalse,
    willpowerTrueFalse,
    specialtyTrueFalse,
    potenciaTrueFalse
  );

  // Determine status for history entry
  let historyStatus = "success";
  if (resultText.includes("Fracaso")) {
    historyStatus = "botch";
  } else if (resultText.includes("Fallo")) {
    historyStatus = "fail";
  }

  // Build pool label from selected attributes/abilities
  const poolParts = [pool1, pool2].filter(p => p && p.trim() !== "");
  const poolLabel = poolParts.length > 0 ? poolParts.join(" + ") : "Manual";

  // Push to dice history
  diceRollHistory.unshift({
    timestamp: new Date(),
    poolLabel,
    diceCount: finalPoolSize,
    summary: resultText,
    status: historyStatus
  });
  if (diceRollHistory.length > DICE_HISTORY_MAX) diceRollHistory.pop();

  uncheckWillpowerAndSpecialty();
}

// function to unckeck the checkboxes for using Willpower and Specialty
function uncheckWillpowerAndSpecialty() {
  document.querySelector("#willpower").checked = false;
  document.querySelector("#specialty").checked = false;

  // Reset specialty label to default text
  const specialtyLabel = document.querySelector('label[for="specialty"]');
  if (specialtyLabel) {
    specialtyLabel.textContent = 'Usar Especialidad';
  }
}

// History Rolls — new beta-style structured array
const diceRollHistory = [];
const DICE_HISTORY_MAX = 20;

function diceHistoryFormatTime(date) {
  return date.toLocaleTimeString("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false });
}

function renderDiceHistory() {
  const list = document.getElementById("dice-history-list");
  if (!list) return;
  list.innerHTML = "";

  if (diceRollHistory.length === 0) {
    const empty = document.createElement("p");
    empty.className = "discipline-detail-label";
    empty.style.textAlign = "center";
    empty.style.padding = "24px 0";
    empty.textContent = "Sin tiradas en esta sesión.";
    list.appendChild(empty);
    return;
  }

  diceRollHistory.forEach(entry => {
    const item = document.createElement("article");
    item.className = `dice-history-item ${entry.status}`;

    const time = document.createElement("span");
    time.className = "dice-history-time";
    time.textContent = diceHistoryFormatTime(entry.timestamp);

    const main = document.createElement("div");
    main.className = "dice-history-main";

    const summary = document.createElement("h3");
    summary.className = "dice-history-summary";
    summary.textContent = entry.summary;

    const pool = document.createElement("span");
    pool.className = "dice-history-pool";
    pool.textContent = `${entry.poolLabel} (${entry.diceCount}d10)`;

    main.appendChild(pool);
    main.appendChild(summary);
    item.appendChild(time);
    item.appendChild(main);
    list.appendChild(item);
  });
}

function openDiceHistoryModal() {
  renderDiceHistory();
  const modal = document.getElementById("dice-history-modal");
  if (!modal) return;
  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
}

function closeDiceHistoryModal() {
  const modal = document.getElementById("dice-history-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
}

// Wire up dice history modal controls
(function initDiceHistoryModal() {
  const historyBtn = document.getElementById("dice-history-btn");
  const closeBtn = document.getElementById("dice-history-close");
  const modal = document.getElementById("dice-history-modal");
  if (historyBtn) historyBtn.addEventListener("click", openDiceHistoryModal);
  if (closeBtn) closeBtn.addEventListener("click", closeDiceHistoryModal);
  if (modal) modal.addEventListener("click", (e) => { if (e.target === modal) closeDiceHistoryModal(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && modal && !modal.classList.contains("hidden")) closeDiceHistoryModal();
  });
})();

// DISCORD WEBHOOK //
// Send data to Discord webhook
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
  const webhookURL = discordWebhookUrl;

  // Check if webhook is disabled or URL is empty
  if (!webhookURL || !discordWebhookEnabled) {
    return;
  }
  const payload = {
    username: characterName || "Vampiro",
    ...(currentAvatarUrl ? { avatar_url: currentAvatarUrl } : {}),
    content: characterName + ": " + result,
    embeds: [
      {
        author: {
          name: characterName + (clan ? " de " + clan : ""),
          url: "https://kel-hendros.github.io/v20-character-sheets/",
          ...(currentAvatarUrl ? { icon_url: currentAvatarUrl } : {}),
        },
        title: result,
        url: "https://kel-hendros.github.io/v20-character-sheets/",
        description:
          "**" +
          pool1 +
          "** (" +
          pool1Size +
          ")  +  **" +
          pool2 +
          "** (" +
          pool2Size +
          ")  +   Mod: (" +
          mods +
          ") = " +
          finalPoolSize,
        color: color,
        fields: [
          {
            name: "Tirada",
            value: "**" + rolls + "**",
            inline: true,
          },
          {
            name: "Dificultad",
            value: difficulty,
            inline: true,
          },
          {
            name: "Penalizador por Daño",
            value: damagePenaltyTrueFalse + " aplicado: " + damagePenalty,
          },
          {
            name: "Voluntad",
            value: willpowerTrueFalse,
            inline: true,
          },
          {
            name: "Especialidad",
            value: specialtyTrueFalse,
            inline: true,
          },
          ...(potenciaTrueFalse === "Si" ? [{
            name: "Potencia",
            value: potenciaTrueFalse,
            inline: true,
          }] : []),
        ],
        footer: {
          text: "Powered by Kelhendros",
        },
      },
    ],
  };

  fetch(webhookURL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
}

// INITIATIVE ROLL
function rollInitiative() {
  const destreza = parseInt(document.getElementById("destreza-value")?.value) || 0;
  const astucia = parseInt(document.getElementById("astucia-value")?.value) || 0;

  // Check for physical boost on destreza
  const boostInput = document.getElementById("tempDestreza");
  const boostVal = boostInput ? (parseInt(boostInput.value) || 0) : 0;

  // Celeridad passive bonus to Destreza
  let celBonus = 0;
  const physBonus = getPhysicalDisciplineBonus("destreza");
  if (physBonus && physBonus.id === 5 && physBonus.level > 0) {
    celBonus = physBonus.level;
  }

  // Damage penalty (already a negative number, e.g. -1, -2)
  const damagePenalty = parseInt(document.querySelector("#penalizadorSaludLabel").innerHTML) || 0;

  const d10 = Math.floor(Math.random() * 10) + 1;
  const totalDestreza = destreza + boostVal + celBonus;
  const total = Math.max(0, d10 + totalDestreza + astucia + damagePenalty);

  // Show in dice widget
  const resultContainer = document.querySelector("#diceResults");
  const rollsList = document.querySelector("#diceRolls");
  const resultElement = document.querySelector("#diceResult");

  resultContainer.classList.remove("success", "fail", "botch", "hidden", "wakeup");
  resultContainer.classList.add("success");
  resultElement.textContent = "Iniciativa";

  rollsList.innerHTML = "";
  const chip = document.createElement("span");
  chip.className = "dice-result-die initiative";
  chip.textContent = total;
  rollsList.appendChild(chip);

  // Build detailed breakdown below the chip
  const parts = [`d10: ${d10}`, `Destreza: ${destreza}`];
  if (boostVal > 0) parts.push(`Des. Temporal: +${boostVal}`);
  if (celBonus > 0) parts.push(`Celeridad: +${celBonus}`);
  parts.push(`Astucia: ${astucia}`);
  if (damagePenalty < 0) parts.push(`Penalizador Salud: ${damagePenalty}`);

  const breakdown = document.createElement("div");
  breakdown.className = "dice-result-info initiative-breakdown";
  breakdown.textContent = parts.join("  +  ");
  rollsList.appendChild(breakdown);

  // Build summary for history
  let summaryParts = `1d10: ${d10} + Des: ${destreza}`;
  if (boostVal > 0) summaryParts += ` + Temp: ${boostVal}`;
  if (celBonus > 0) summaryParts += ` + Cel: ${celBonus}`;
  summaryParts += ` + Ast: ${astucia}`;
  if (damagePenalty < 0) summaryParts += ` − Daño: ${Math.abs(damagePenalty)}`;

  // Push to dice history
  diceRollHistory.unshift({
    timestamp: new Date(),
    poolLabel: "Iniciativa",
    diceCount: 1,
    summary: `Iniciativa: ${total} (${summaryParts})`,
    status: "success"
  });
  if (diceRollHistory.length > DICE_HISTORY_MAX) diceRollHistory.pop();

  // Send to Discord
  sendInitiativeToDiscord(total, d10, totalDestreza, astucia, damagePenalty);
}

function sendInitiativeToDiscord(total, d10, destreza, astucia, damagePenalty) {
  const webhookURL = discordWebhookUrl;
  if (!webhookURL || !discordWebhookEnabled) return;

  const characterName = document.querySelector("#nombre").value || "Vampiro";
  const clan = document.querySelector("#clan").value || "";

  let desc = `**1d10:** ${d10}  +  **Destreza:** ${destreza}  +  **Astucia:** ${astucia}`;
  if (damagePenalty < 0) desc += `  −  **Daño:** ${Math.abs(damagePenalty)}`;

  const payload = {
    username: characterName,
    ...(currentAvatarUrl ? { avatar_url: currentAvatarUrl } : {}),
    content: `${characterName}: Iniciativa **${total}**`,
    embeds: [
      {
        author: {
          name: characterName + (clan ? " de " + clan : ""),
          url: "https://kel-hendros.github.io/v20-character-sheets/",
          ...(currentAvatarUrl ? { icon_url: currentAvatarUrl } : {}),
        },
        title: `Iniciativa: ${total}`,
        description: desc,
        color: 7506394,
        footer: {
          text: "Powered by Kelhendros",
        },
      },
    ],
  };

  fetch(webhookURL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

// WAKE UP ACTION
function actionWakeUp() {
  const bloodValueString = document.querySelector("#blood-value").value;
  const bloodPoolCurrent = bloodValueString.replace(/0/g, "").length;

  // Check there's blood to spend
  if (bloodPoolCurrent <= 0) {
    flashBloodWarning();
    return;
  }

  // 1. Consume one blood point
  modifyBlood("consume", "");

  // 2. Restore one temp willpower if possible
  const permValue = parseInt(document.querySelector("#voluntadPerm-value").value) || 0;
  const tempInput = document.querySelector("#voluntadTemp-value");
  const currentTemp = parseInt(tempInput.value) || 0;
  let willpowerRestored = false;

  if (currentTemp < permValue) {
    tempInput.value = currentTemp + 1;
    renderWillpowerTrack();
    willpowerRestored = true;
  }

  // Show feedback in dice widget
  const resultContainer = document.querySelector("#diceResults");
  const rollsList = document.querySelector("#diceRolls");
  const resultElement = document.querySelector("#diceResult");

  resultContainer.classList.remove("success", "fail", "botch", "hidden", "wakeup");
  resultContainer.classList.add("wakeup");
  resultElement.textContent = "Despertarse";

  rollsList.innerHTML = "";
  const flavorText = document.createElement("span");
  flavorText.className = "dice-result-info dice-result-info-flavor";
  flavorText.innerHTML = willpowerRestored
    ? "Consumís un poco de Vitae para reanimar tu cuerpo muerto en esta nueva noche.<br>Además, renovás tu ímpetu."
    : "Consumís un poco de Vitae para reanimar tu cuerpo muerto en esta nueva noche.<br>Tu ímpetu ya está al máximo.";
  rollsList.appendChild(flavorText);

  const summaryLine = document.createElement("span");
  summaryLine.className = "dice-result-info";
  summaryLine.textContent = willpowerRestored
    ? "− 1 Sangre · + 1 Voluntad"
    : "− 1 Sangre · Voluntad llena";
  rollsList.appendChild(summaryLine);

  saveCharacterData();
}

//REFACTOR: Presionar boton #diceButton
diceButton.addEventListener("click", () => {
  rollTheDice();
});

//REFACTOR: Add dice and name values to DicePool1 on click on attributes.
attributesList.forEach((attribute) => {
  label = attribute.querySelector("label");

  label.addEventListener("click", (event) => {
    // const input = event.currentTarget.nextElementSibling.nextElementSibling;
    // const input = event.currentTarget.querySelector('input[type="hidden"]');

    const row = event.currentTarget.closest(".form-group.attribute");
    const input = row.querySelector('input[type="hidden"][id$="-value"]');

    //checkear que haya un atributo temporal (boost) para el atributo
    const boostInput = row.querySelector('input[type="hidden"][id^="temp"]');
    const temporalAtribute = boostInput ? parseInt(boostInput.value) || 0 : 0;
    const permanentAttribute = parseInt(input.getAttribute("value"));
    const finalAttribute = permanentAttribute + temporalAtribute;

    //Update value and label for Pool1
    const attrName = input.getAttribute("name");
    let pool1Value = finalAttribute;
    let pool1Label = capitalizeFirstLetter(attrName);

    // Check for physical discipline bonus (e.g. Potencia → Fuerza, Celeridad → Destreza)
    const physBonus = getPhysicalDisciplineBonus(attrName);
    if (physBonus) {
      if (physBonus.id === 5) {
        // Celeridad: always add passive bonus (already reduced by activated points)
        if (physBonus.level > 0) {
          pool1Value += physBonus.level;
          pool1Label += `+${physBonus.shortName}`;
        }
      } else if (!activatedDisciplines.has(physBonus.id)) {
        // Potencia/Fortaleza: passive mode — add all discipline dots as extra dice
        pool1Value += physBonus.level;
        pool1Label += `+${physBonus.shortName}`;
      }
      // Potencia active mode: pool stays normal, auto-successes handled in rollTheDice()
    }

    document.querySelector("#dicePool1").value = pool1Value;
    document.querySelector("#dicePool1Label").innerHTML = pool1Label;

    //Remove class from the previously selected attribute
    const previouslySelectedAttributes = document.querySelectorAll(
      ".atributo-seleccionado"
    );
    previouslySelectedAttributes.forEach((attribute) => {
      attribute.classList.remove("atributo-seleccionado");
    });

    //add class to the selected attribute
    const selectedAttribute = event.currentTarget;
    selectedAttribute.classList.add("atributo-seleccionado");

    updateFinalPoolSize();
  });
});

//REFACTOR: Add dice and name values to DicePool2 on click on abilities.
abilitiesList.forEach((ability) => {
  ability.addEventListener("click", (event) => {
    // Fixed: Use parentElement.querySelector instead of nextElementSibling
    // to make it robust against DOM structure changes (e.g., specialty icons)
    const input = event.currentTarget.parentElement.querySelector('input[type="hidden"]');

    //Update value and label for Pool2
    document.querySelector("#dicePool2").value = input.getAttribute("value");
    document.querySelector("#dicePool2Label").innerHTML = capitalizeFirstLetter(
      input.getAttribute("name")
    );

    //remove class from the previously selected ability
    const previouslySelectedAbility = document.querySelectorAll(
      ".habilidad-seleccionada"
    );
    previouslySelectedAbility.forEach((ability) => {
      ability.classList.remove("habilidad-seleccionada");
    });

    //add class to the selected ability
    const selectedAbility = event.currentTarget;
    selectedAbility.classList.add("habilidad-seleccionada");

    updateFinalPoolSize();
  });
});

//REFACTOR: Update the finalPoolSize whenever dicePool1, dicePool2 or diceMod inputs change manually
//DicePool1 manually change
document.querySelector("#dicePool1").addEventListener("change", function () {
  updateFinalPoolSize();
});

//DicePool2 manually change
document.querySelector("#dicePool2").addEventListener("change", function () {
  updateFinalPoolSize();
});

//DiceMod manually change
document.querySelector("#diceMod").addEventListener("change", function () {
  this.value = parseInt(this.value) || 0;
  updateFinalPoolSize();
  saveCharacterData();
});

//REFACTOR: Update the finalPoolSize whenever a checkbox is checked or unchecked
checkboxes.forEach((checkbox) => {
  checkbox.addEventListener("change", function () {
    updateFinalPoolSize();
  });
});

//REFACTOR: Borrar los inputs de los pools de dados al hacer click

document.querySelector("#dicePool1").addEventListener("click", function () {
  resetDicePool1();
  this.select();
});
document.querySelector("#dicePool2").addEventListener("click", function () {
  resetDicePool2();
  this.select();
});
// Dice modifier: click to select all for easy typing
document.querySelector("#diceMod").addEventListener("click", function () {
  this.select();
});

// Generic dice field popovers (difficulty only)
(function initDicePopovers() {
  const popovers = [
    { inputId: "#difficulty", popoverId: "#diceDiffPopover" }
  ];

  popovers.forEach(({ inputId, popoverId }) => {
    const input = document.querySelector(inputId);
    const popover = document.querySelector(popoverId);
    if (!input || !popover) return;

    // Open popover when clicking the input
    input.addEventListener("click", function (e) {
      e.stopPropagation();
      // Close any other open popover first
      document.querySelectorAll(".dice-popover:not(.hidden)").forEach(p => {
        if (p !== popover) p.classList.add("hidden");
      });
      const isOpen = !popover.classList.contains("hidden");
      if (isOpen) {
        popover.classList.add("hidden");
      } else {
        popover.querySelectorAll("button").forEach(btn => {
          btn.classList.toggle("pop-active", btn.getAttribute("data-val") === input.value);
        });
        popover.classList.remove("hidden");
      }
    });

    // Select a value
    popover.addEventListener("click", function (e) {
      const btn = e.target.closest("button[data-val]");
      if (!btn) return;
      input.value = btn.getAttribute("data-val");
      popover.classList.add("hidden");
      updateFinalPoolSize();
      saveCharacterData();
    });
  });

  // Close all popovers on outside click
  document.addEventListener("click", function (e) {
    if (!e.target.closest(".dice-popover-wrapper")) {
      document.querySelectorAll(".dice-popover:not(.hidden)").forEach(p => p.classList.add("hidden"));
    }
  });

  // Close all popovers on Escape
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") {
      document.querySelectorAll(".dice-popover:not(.hidden)").forEach(p => p.classList.add("hidden"));
    }
  });
})();

//REFACTOR: Reset the dicePool1 when clicked and the finalPoolSize
function resetDicePool1() {
  document.querySelector("#dicePool1").value = "0";
  document.querySelector("#dicePool1Label").innerHTML = "";
  updateFinalPoolSize();

  //remove class from the previously selected attribute
  const previouslySelectedAttribute = document.querySelectorAll(
    ".atributo-seleccionado"
  );
  previouslySelectedAttribute.forEach((attribute) => {
    attribute.classList.remove("atributo-seleccionado");
  });
}

//REFACTOR: Reset the dicePool2 when clicked and the finalPoolSize
function resetDicePool2() {
  document.querySelector("#dicePool2").value = "0";
  document.querySelector("#dicePool2Label").innerHTML = "";
  updateFinalPoolSize();

  //remove class from the previously selected ability
  const previouslySelectedAbility = document.querySelectorAll(
    ".habilidad-seleccionada"
  );
  previouslySelectedAbility.forEach((ability) => {
    ability.classList.remove("habilidad-seleccionada");
  });
}

//REFACTOR: Reset the diceMod when clicked and the finalPoolSize
function resetDiceMod() {
  document.querySelector("#diceMod").value = "0";
  updateFinalPoolSize();
}

//REFACTOR: Reset all inputs when clicked on the trash icon
function resetAllDice() {
  resetDicePool1();
  resetDicePool2();
  resetDiceMod();
  updateFinalPoolSize();
  uncheckWillpowerAndSpecialty();
  document.querySelector("#difficulty").value = 6;
  // Hide dice result container
  const resultContainer = document.querySelector("#diceResults");
  if (resultContainer) {
    resultContainer.classList.add("hidden");
    resultContainer.classList.remove("success", "fail", "botch", "wakeup");
  }
}

document.querySelector("#diceResetBtn").addEventListener("click", function () {
  resetAllDice();
});

//REFACTOR: Poner en mayuscula la primera letra de un string
function capitalizeFirstLetter(string) {
  return string.charAt(0).toUpperCase() + string.slice(1);
}

/////////////////////////////////////
////     Sistema de Disciplinas  ////
/////////////////////////////////////

// State: array of { id: number, level: number }
// id refers to DISCIPLINE_REPO entries; id=0 means legacy/custom (name stored separately)
let selectedDisciplines = [];

const disciplineRepo = window.DISCIPLINE_REPO || [];

// Physical disciplines that passively add dice to attributes
// Key: discipline ID, Value: attribute name (lowercase)
const PHYSICAL_DISCIPLINE_MAP = {
  30: "fuerza",       // Potencia → Fuerza
  5:  "destreza",     // Celeridad → Destreza
  11: "resistencia",  // Fortaleza → Resistencia (always passive)
};

const PHYSICAL_DISCIPLINE_SHORT = { 30: "Pot", 5: "Cel", 11: "Fort" };
const PHYSICAL_DISCIPLINE_FULL = { 30: "Potencia", 5: "Celeridad", 11: "Fortaleza" };

// Disciplines with all-or-nothing activation (Potencia only)
let activatedDisciplines = new Set();

// Celeridad: per-point activation (each point costs 1 blood, gives extra action)
let celeridadActivatedPoints = 0;

/**
 * Given an attribute name, returns info about the physical discipline that boosts it.
 * For Celeridad, returns the PASSIVE level (total - activated points).
 * Returns { id, level, totalLevel, shortName, fullName } or null if none found.
 */
function getPhysicalDisciplineBonus(attrName) {
  const normalized = attrName.toLowerCase();
  for (const [discId, mappedAttr] of Object.entries(PHYSICAL_DISCIPLINE_MAP)) {
    if (mappedAttr === normalized) {
      const id = Number(discId);
      const disc = selectedDisciplines.find(d => d.id === id);
      if (disc && disc.level > 0) {
        // Celeridad: passive level = total - activated points
        const passiveLevel = (id === 5)
          ? Math.max(0, disc.level - celeridadActivatedPoints)
          : disc.level;
        return {
          id: id,
          level: passiveLevel,
          totalLevel: disc.level,
          shortName: PHYSICAL_DISCIPLINE_SHORT[id] || "",
          fullName: PHYSICAL_DISCIPLINE_FULL[id] || "",
        };
      }
    }
  }
  return null;
}

/**
 * Check if there is blood available to spend.
 */
function hasBloodAvailable() {
  const bloodValue = document.querySelector("#blood-value").value;
  return bloodValue.replace(/0/g, "").length > 0;
}

/**
 * Shake the blood card when blood is insufficient or a limitation applies.
 */
function flashBloodWarning() {
  const bloodCard = document.querySelector('.blood-card');
  if (bloodCard) {
    bloodCard.classList.remove('blood-shake');
    void bloodCard.offsetWidth; // force reflow to restart animation
    bloodCard.classList.add('blood-shake');
    bloodCard.addEventListener('animationend', () => bloodCard.classList.remove('blood-shake'), { once: true });
  }
}

/**
 * Red flash on the blood card when blood is consumed.
 */
function flashBloodConsume() {
  const bloodCard = document.querySelector('.blood-card');
  if (bloodCard) {
    bloodCard.classList.remove('blood-consume-flash');
    void bloodCard.offsetWidth;
    bloodCard.classList.add('blood-consume-flash');
    bloodCard.addEventListener('animationend', () => bloodCard.classList.remove('blood-consume-flash'), { once: true });
  }
}

/**
 * If Pool1 currently holds an attribute affected by a physical discipline,
 * recalculate its value and label to reflect the current activation state.
 */
function refreshPool1ForPhysicalDiscipline(discId) {
  const mappedAttr = PHYSICAL_DISCIPLINE_MAP[discId];
  if (!mappedAttr) return;

  // Check if Pool1 is currently set to this attribute
  const pool1Label = document.querySelector("#dicePool1Label").innerHTML;
  const baseAttrName = pool1Label.split("+")[0].trim(); // "Fuerza+Pot" → "Fuerza"
  if (baseAttrName.toLowerCase() !== capitalizeFirstLetter(mappedAttr).toLowerCase()) return;

  // Find the attribute input by name
  const attrInput = document.querySelector(`input[type="hidden"][name="${mappedAttr}"][id$="-value"]`);
  if (!attrInput) return;

  const row = attrInput.closest(".form-group.attribute");
  const boostInput = row ? row.querySelector('input[type="hidden"][id^="temp"]') : null;
  const temporalAtribute = boostInput ? parseInt(boostInput.value) || 0 : 0;
  const permanentAttribute = parseInt(attrInput.getAttribute("value"));
  const finalAttribute = permanentAttribute + temporalAtribute;

  let pool1Value = finalAttribute;
  let newLabel = capitalizeFirstLetter(mappedAttr);

  const physBonus = getPhysicalDisciplineBonus(mappedAttr);
  if (physBonus) {
    if (physBonus.id === 5) {
      // Celeridad: always add passive bonus (already reduced by activated points)
      if (physBonus.level > 0) {
        pool1Value += physBonus.level;
        newLabel += `+${physBonus.shortName}`;
      }
    } else if (!activatedDisciplines.has(physBonus.id)) {
      // Potencia/Fortaleza: passive mode
      pool1Value += physBonus.level;
      newLabel += `+${physBonus.shortName}`;
    }
  }

  document.querySelector("#dicePool1").value = pool1Value;
  document.querySelector("#dicePool1Label").innerHTML = newLabel;
  updateFinalPoolSize();
}

function getDisciplineName(id) {
  const entry = disciplineRepo.find(d => d.id === id);
  return entry ? entry.name_es : "Desconocida";
}

// Helper: reorder an array item from one index to another
function reorderArray(arr, fromIndex, toIndex) {
  const [item] = arr.splice(fromIndex, 1);
  arr.splice(toIndex, 0, item);
}

// Drag state for disciplines and sendas
let dragState = { type: null, index: null, disciplineId: null };

// Render discipline list in the panel
function renderDisciplineList() {
  const container = document.getElementById("discipline-list");
  if (!container) return;
  container.innerHTML = "";

  if (selectedDisciplines.length === 0) {
    const empty = document.createElement("p");
    empty.className = "discipline-detail-label";
    empty.textContent = "No hay disciplinas seleccionadas.";
    container.appendChild(empty);
    return;
  }

  selectedDisciplines.forEach((disc, index) => {
    const name = disc.customName || getDisciplineName(disc.id);
    const isPhysical = disc.id in PHYSICAL_DISCIPLINE_MAP;
    const isActivated = activatedDisciplines.has(disc.id);
    const row = document.createElement("div");
    row.className = "discipline-row";
    if (isActivated || (disc.id === 5 && celeridadActivatedPoints > 0)) row.classList.add("discipline-activated");

    // Build name area: name + optional icons (physical activation, sendas)
    const hasSendas = disciplineHasSendas(disc.id);
    let nameAreaHTML = '';
    if (isPhysical || hasSendas) {
      nameAreaHTML = `<span class="discipline-name-area">
           <span class="discipline-name" data-disc-index="${index}" title="Click para agregar al tirador">${name}</span>`;
      if (isPhysical && disc.id === 5) {
        // Celeridad: per-point activation icons
        nameAreaHTML += `<span class="celeridad-points">`;
        for (let p = 1; p <= disc.level; p++) {
          const isPointActive = p <= celeridadActivatedPoints;
          nameAreaHTML += `<button class="celeridad-point${isPointActive ? " active" : ""}" type="button"
                     data-point="${p}" title="${isPointActive ? "Desactivar" : "Activar"} punto ${p} de Celeridad${isPointActive ? "" : " (gasta 1 sangre)"}">
               <iconify-icon icon="bi:lightning-fill" width="12" aria-hidden="true"></iconify-icon>
             </button>`;
        }
        nameAreaHTML += `</span>`;
      } else if (isPhysical && disc.id === 30) {
        // Potencia: single toggle button (Fortaleza is always passive, no button)
        nameAreaHTML += `<button class="discipline-activate-btn${isActivated ? " active" : ""}" type="button"
                   data-disc-id="${disc.id}" title="${isActivated ? "Desactivar" : "Activar"} ${PHYSICAL_DISCIPLINE_FULL[disc.id] || name} (gasta 1 sangre)">
             <iconify-icon icon="game-icons:fist" width="14" aria-hidden="true"></iconify-icon>
           </button>`;
      }
      if (hasSendas) {
        nameAreaHTML += `<button class="discipline-senda-btn" type="button" data-disc-id="${disc.id}" title="Gestionar sendas de ${name}">
             <iconify-icon icon="gravity-ui:branches-down" width="14" aria-hidden="true"></iconify-icon>
           </button>`;
      }
      nameAreaHTML += `</span>`;
    } else {
      nameAreaHTML = `<span class="discipline-name" data-disc-index="${index}" title="Click para agregar al tirador">${name}</span>`;
    }

    row.draggable = true;
    row.dataset.discIndex = String(index);
    row.innerHTML = `
      <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
      ${nameAreaHTML}
      <div class="rating discipline-rating" data-rating="${disc.level}">
        <button class="dot" type="button" data-value="1"></button>
        <button class="dot" type="button" data-value="2"></button>
        <button class="dot" type="button" data-value="3"></button>
        <button class="dot" type="button" data-value="4"></button>
        <button class="dot" type="button" data-value="5"></button>
      </div>
    `;

    // Drag events for discipline reordering
    const handle = row.querySelector(".drag-handle");
    let canDrag = false;
    handle.addEventListener("mousedown", () => { canDrag = true; });
    document.addEventListener("mouseup", () => { canDrag = false; }, { once: false });
    row.addEventListener("dragstart", (e) => {
      if (!canDrag) { e.preventDefault(); return; }
      dragState = { type: "discipline", index: index, disciplineId: null };
      row.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
    });
    row.addEventListener("dragend", () => {
      row.classList.remove("dragging");
      container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el => {
        el.classList.remove("drag-over-top", "drag-over-bottom");
      });
      dragState = { type: null, index: null, disciplineId: null };
    });
    row.addEventListener("dragover", (e) => {
      if (dragState.type !== "discipline") return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el => {
        el.classList.remove("drag-over-top", "drag-over-bottom");
      });
      if (e.clientY < midY) {
        row.classList.add("drag-over-top");
      } else {
        row.classList.add("drag-over-bottom");
      }
    });
    row.addEventListener("dragleave", () => {
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });
    row.addEventListener("drop", (e) => {
      e.preventDefault();
      if (dragState.type !== "discipline") return;
      const fromIndex = dragState.index;
      const rect = row.getBoundingClientRect();
      const midY = rect.top + rect.height / 2;
      let toIndex = Number(row.dataset.discIndex);
      if (e.clientY >= midY && toIndex < fromIndex) toIndex++;
      if (e.clientY < midY && toIndex > fromIndex) toIndex--;
      if (fromIndex !== toIndex) {
        reorderArray(selectedDisciplines, fromIndex, toIndex);
        renderDisciplineList();
        saveCharacterData();
      }
      row.classList.remove("drag-over-top", "drag-over-bottom");
    });

    // Apply filled dots
    const ratingEl = row.querySelector(".rating");
    const dots = ratingEl.querySelectorAll(".dot");
    dots.forEach(dot => {
      const dv = Number(dot.dataset.value);
      dot.classList.toggle("filled", dv <= disc.level);
    });

    // Dot click → update level (click on last active dot toggles it off)
    dots.forEach(dot => {
      dot.addEventListener("click", () => {
        const clickedLevel = Number(dot.dataset.value);
        const newLevel = (clickedLevel === disc.level) ? clickedLevel - 1 : clickedLevel;
        disc.level = newLevel;
        // Celeridad: clamp activated points and re-render to update activation buttons
        if (disc.id === 5) {
          celeridadActivatedPoints = Math.min(celeridadActivatedPoints, newLevel);
          renderDisciplineList();
          refreshPool1ForPhysicalDiscipline(5);
        } else {
          ratingEl.dataset.rating = String(newLevel);
          dots.forEach(d => {
            d.classList.toggle("filled", Number(d.dataset.value) <= newLevel);
          });
        }
        saveCharacterData();
      });
    });

    // Name click → feed dice roller Pool2
    const nameSpan = row.querySelector(".discipline-name");
    nameSpan.addEventListener("click", () => {
      resetDicePool2();
      document.querySelector("#dicePool2").value = String(disc.level);
      document.querySelector("#dicePool2Label").innerHTML = capitalizeFirstLetter(name);
      updateFinalPoolSize();
    });

    // Activation button click → toggle physical discipline (spend/refund blood)
    const activateBtn = row.querySelector(".discipline-activate-btn");
    if (activateBtn) {
      activateBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const discId = Number(activateBtn.dataset.discId);

        if (activatedDisciplines.has(discId)) {
          // Deactivate
          activatedDisciplines.delete(discId);
          activateBtn.classList.remove("active");
          row.classList.remove("discipline-activated");
          activateBtn.title = `Activar ${PHYSICAL_DISCIPLINE_FULL[discId] || name} (gasta 1 sangre)`;
        } else {
          // Activate — check blood first
          if (!hasBloodAvailable()) {
            flashBloodWarning();
            return;
          }
          // Spend 1 blood
          modifyBlood("consume", "");
          activatedDisciplines.add(discId);
          activateBtn.classList.add("active");
          row.classList.add("discipline-activated");
          activateBtn.title = `Desactivar ${PHYSICAL_DISCIPLINE_FULL[discId] || name}`;
        }
        // Recalculate Pool1 if the affected attribute is currently selected
        refreshPool1ForPhysicalDiscipline(discId);
      });
    }

    // Celeridad per-point activation
    const celPoints = row.querySelectorAll(".celeridad-point");
    celPoints.forEach(pointBtn => {
      pointBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const pointNum = Number(pointBtn.dataset.point);

        if (pointBtn.classList.contains("active")) {
          // Deactivate this point and all higher points (free)
          celeridadActivatedPoints = pointNum - 1;
        } else {
          // Activate up to this point — spend blood for each new activation
          const pointsToActivate = pointNum - celeridadActivatedPoints;
          // Check enough blood
          const bloodValue = document.querySelector("#blood-value").value;
          const availableBlood = bloodValue.replace(/0/g, "").length;
          if (availableBlood < pointsToActivate) {
            flashBloodWarning();
            return;
          }
          // Spend blood for each new point
          for (let i = 0; i < pointsToActivate; i++) {
            modifyBlood("consume", "");
          }
          celeridadActivatedPoints = pointNum;
        }
        // Re-render to update UI and recalculate pool
        renderDisciplineList();
        refreshPool1ForPhysicalDiscipline(5);
      });
    });

    // Senda button click → open senda modal
    const sendaBtn = row.querySelector(".discipline-senda-btn");
    if (sendaBtn) {
      sendaBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const discId = Number(sendaBtn.dataset.discId);
        if (typeof window.openSendaModal === "function") {
          window.openSendaModal(discId);
        }
      });
    }

    container.appendChild(row);

    // Render senda sub-rows for this discipline
    if (hasSendas) {
      const discSendas = selectedSendas.filter(s => s.disciplineId === disc.id);
      discSendas.forEach(senda => {
        const sendaRow = document.createElement("div");
        sendaRow.className = "senda-row";

        const sendaName = getSendaName(senda.sendaId);
        // Find the global index of this senda in selectedSendas
        const sendaGlobalIndex = selectedSendas.findIndex(s => s.disciplineId === senda.disciplineId && s.sendaId === senda.sendaId);
        sendaRow.draggable = true;
        sendaRow.dataset.sendaGlobalIndex = String(sendaGlobalIndex);
        sendaRow.dataset.disciplineId = String(disc.id);
        sendaRow.innerHTML = `
          <span class="drag-handle" title="Arrastrar para reordenar">⠿</span>
          <span class="senda-name" title="Click para agregar al tirador">${sendaName}</span>
          <div class="rating senda-rating" data-rating="${senda.level}">
            <button class="dot" type="button" data-value="1"></button>
            <button class="dot" type="button" data-value="2"></button>
            <button class="dot" type="button" data-value="3"></button>
            <button class="dot" type="button" data-value="4"></button>
            <button class="dot" type="button" data-value="5"></button>
          </div>
        `;

        // Drag events for senda reordering
        const sendaHandle = sendaRow.querySelector(".drag-handle");
        let sendaCanDrag = false;
        sendaHandle.addEventListener("mousedown", () => { sendaCanDrag = true; });
        document.addEventListener("mouseup", () => { sendaCanDrag = false; }, { once: false });
        sendaRow.addEventListener("dragstart", (e) => {
          if (!sendaCanDrag) { e.preventDefault(); return; }
          e.stopPropagation();
          dragState = { type: "senda", index: sendaGlobalIndex, disciplineId: disc.id };
          sendaRow.classList.add("dragging");
          e.dataTransfer.effectAllowed = "move";
        });
        sendaRow.addEventListener("dragend", () => {
          sendaRow.classList.remove("dragging");
          container.querySelectorAll(".drag-over-top, .drag-over-bottom").forEach(el => {
            el.classList.remove("drag-over-top", "drag-over-bottom");
          });
          dragState = { type: null, index: null, disciplineId: null };
        });
        sendaRow.addEventListener("dragover", (e) => {
          if (dragState.type !== "senda" || dragState.disciplineId !== disc.id) return;
          e.preventDefault();
          e.stopPropagation();
          e.dataTransfer.dropEffect = "move";
          const rect = sendaRow.getBoundingClientRect();
          const midY = rect.top + rect.height / 2;
          container.querySelectorAll(".senda-row.drag-over-top, .senda-row.drag-over-bottom").forEach(el => {
            el.classList.remove("drag-over-top", "drag-over-bottom");
          });
          if (e.clientY < midY) {
            sendaRow.classList.add("drag-over-top");
          } else {
            sendaRow.classList.add("drag-over-bottom");
          }
        });
        sendaRow.addEventListener("dragleave", () => {
          sendaRow.classList.remove("drag-over-top", "drag-over-bottom");
        });
        sendaRow.addEventListener("drop", (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (dragState.type !== "senda" || dragState.disciplineId !== disc.id) return;
          const fromGlobal = dragState.index;
          const toGlobal = Number(sendaRow.dataset.sendaGlobalIndex);
          if (fromGlobal !== toGlobal) {
            reorderArray(selectedSendas, fromGlobal, toGlobal);
            renderDisciplineList();
            saveCharacterData();
          }
          sendaRow.classList.remove("drag-over-top", "drag-over-bottom");
        });

        // Apply filled dots
        const sendaRating = sendaRow.querySelector(".senda-rating");
        const sendaDots = sendaRating.querySelectorAll(".dot");
        sendaDots.forEach(dot => {
          const dv = Number(dot.dataset.value);
          dot.classList.toggle("filled", dv <= senda.level);
        });

        // Dot click → update senda level
        sendaDots.forEach(dot => {
          dot.addEventListener("click", () => {
            const clickedLevel = Number(dot.dataset.value);
            const newLevel = (clickedLevel === senda.level) ? clickedLevel - 1 : clickedLevel;
            senda.level = newLevel;
            sendaRating.dataset.rating = String(newLevel);
            sendaDots.forEach(d => {
              d.classList.toggle("filled", Number(d.dataset.value) <= newLevel);
            });
            saveCharacterData();
          });
        });

        // Name click → feed dice roller Pool2
        const sendaNameSpan = sendaRow.querySelector(".senda-name");
        sendaNameSpan.addEventListener("click", () => {
          resetDicePool2();
          document.querySelector("#dicePool2").value = String(senda.level);
          document.querySelector("#dicePool2Label").innerHTML = capitalizeFirstLetter(sendaName);
          updateFinalPoolSize();
        });

        container.appendChild(sendaRow);
      });
    }
  });
}

// ----- Discipline Repository Modal -----
function initDisciplineRepoModal() {
  const openBtn = document.getElementById("open-discipline-repo");
  const modal = document.getElementById("discipline-repo-modal");
  const closeBtn = document.getElementById("discipline-repo-close");
  const searchInput = document.getElementById("discipline-repo-search");
  const list = document.getElementById("discipline-repo-list");
  const applyBtn = document.getElementById("discipline-repo-apply");

  if (!openBtn || !modal || !closeBtn || !searchInput || !list || !applyBtn) return;

  // Track which IDs are selected in the modal (temporary working set)
  let modalSelection = new Set();

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  function openModal() {
    // Sync working set with current state
    modalSelection = new Set(selectedDisciplines.map(d => d.id));
    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    searchInput.value = "";
    renderRepository("");
    searchInput.focus();
  }

  function renderRepository(term) {
    list.innerHTML = "";
    const filtered = disciplineRepo.filter(d =>
      d.name_es.toLowerCase().includes(term) || d.name_en.toLowerCase().includes(term)
    );
    filtered.forEach(d => {
      const button = document.createElement("button");
      button.className = "discipline-repo-item";
      if (modalSelection.has(d.id)) button.classList.add("selected");
      button.type = "button";
      button.textContent = d.name_es;
      button.addEventListener("click", () => {
        if (modalSelection.has(d.id)) {
          modalSelection.delete(d.id);
        } else {
          modalSelection.add(d.id);
        }
        renderRepository(searchInput.value.trim().toLowerCase());
      });
      list.appendChild(button);
    });
  }

  openBtn.addEventListener("click", openModal);
  closeBtn.addEventListener("click", closeModal);

  applyBtn.addEventListener("click", () => {
    // Build new selectedDisciplines preserving existing levels
    const existingMap = {};
    selectedDisciplines.forEach(d => { existingMap[d.id] = d.level; });

    selectedDisciplines = [];
    // Add in repo order (maintains consistent ordering)
    disciplineRepo.forEach(d => {
      if (modalSelection.has(d.id)) {
        selectedDisciplines.push({ id: d.id, level: existingMap[d.id] || 1 });
      }
    });

    renderDisciplineList();
    saveCharacterData();
    closeModal();
  });

  searchInput.addEventListener("input", () => {
    renderRepository(searchInput.value.trim().toLowerCase());
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
}

// ----- Save/Load Integration -----

// Returns the disciplines array for JSON and also writes legacy keys
function getDisciplinesData(characterData) {
  const disciplines = selectedDisciplines.map(d => ({
    id: d.id,
    level: d.level,
    name: d.customName || getDisciplineName(d.id),
    customName: d.customName || "",
  }));

  // Write legacy keys (disciplina1..12 + disciplina1-value..12) for backward compat
  for (let i = 1; i <= 12; i++) {
    if (i <= selectedDisciplines.length) {
      const disc = selectedDisciplines[i - 1];
      const name = disc.customName || getDisciplineName(disc.id);
      characterData["disciplina" + i] = name;
      characterData["disciplina" + i + "-value"] = String(disc.level);
    } else {
      characterData["disciplina" + i] = "";
      characterData["disciplina" + i + "-value"] = "0";
    }
  }

  return disciplines;
}

// Strip accents for flexible name matching (e.g. "Dominacion" → "dominacion")
function normalizeForMatch(str) {
  return str.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Load disciplines from JSON (handles both new and legacy formats)
function loadDisciplinesFromJSON(characterData) {
  selectedDisciplines = [];

  if (characterData.disciplines && Array.isArray(characterData.disciplines)) {
    // New format: [{ id, level }]
    characterData.disciplines.forEach(d => {
      const repoEntry = disciplineRepo.find(r => r.id === d.id);
      if (repoEntry) {
        selectedDisciplines.push({ id: d.id, level: d.level || 0 });
      } else if (d.id === 0 && (d.customName || d.name)) {
        selectedDisciplines.push({
          id: 0,
          customName: (d.customName || d.name || "").trim(),
          level: d.level || 0,
        });
      }
    });
  } else {
    // Legacy format: disciplina1="Presencia", disciplina1-value="3"
    for (let i = 1; i <= 12; i++) {
      const name = characterData["disciplina" + i];
      const level = parseInt(characterData["disciplina" + i + "-value"]) || 0;
      if (name && name.trim() !== "") {
        // Match by name with accent-insensitive comparison
        const nameNorm = normalizeForMatch(name.trim());
        const repoEntry = disciplineRepo.find(d =>
          normalizeForMatch(d.name_es) === nameNorm || normalizeForMatch(d.name_en) === nameNorm
        );
        if (repoEntry) {
          selectedDisciplines.push({ id: repoEntry.id, level: level });
        } else {
          // Custom/unknown discipline — keep with customName
          selectedDisciplines.push({ id: 0, customName: name.trim(), level: level });
        }
      }
    }
  }

  console.log("[Disciplines] Loaded:", selectedDisciplines.length, "disciplines", selectedDisciplines);
}

// Replaces old updateDisciplineButtons — called from updateAll()
function updateDisciplineButtons() {
  // No-op: disciplines are rendered by renderDisciplineList() after load
  // This stub exists so updateAll() doesn't break
}

// Initialize the modal
initDisciplineRepoModal();

/////////////////////////////////////
////     Sistema de Sendas       ////
/////////////////////////////////////

// State: array of { disciplineId, sendaId, level }
let selectedSendas = [];

const sendasRepo = window.SENDAS_REPO || [];

function getSendaName(sendaId) {
  const entry = sendasRepo.find(s => s.id === sendaId);
  return entry ? entry.name_es : "Desconocida";
}

function getSendasForDiscipline(discId) {
  return sendasRepo.filter(s => s.parentDisciplineId === discId);
}

function disciplineHasSendas(discId) {
  const entry = disciplineRepo.find(d => d.id === discId);
  return entry && entry.hasSendas;
}

// ----- Senda Repository Modal -----
function initSendaRepoModal() {
  const modal = document.getElementById("senda-repo-modal");
  const closeBtn = document.getElementById("senda-repo-close");
  const searchInput = document.getElementById("senda-repo-search");
  const list = document.getElementById("senda-repo-list");
  const applyBtn = document.getElementById("senda-repo-apply");
  const titleEl = document.getElementById("senda-repo-title");

  if (!modal || !closeBtn || !searchInput || !list || !applyBtn) return;

  let modalSelection = new Set();
  let currentDisciplineId = null;

  function closeModal() {
    modal.classList.add("hidden");
    modal.setAttribute("aria-hidden", "true");
  }

  window.openSendaModal = function(discId) {
    currentDisciplineId = discId;
    const discName = getDisciplineName(discId);
    titleEl.textContent = `Sendas de ${discName}`;

    // Sync working set with current sendas for this discipline
    modalSelection = new Set(
      selectedSendas.filter(s => s.disciplineId === discId).map(s => s.sendaId)
    );

    modal.classList.remove("hidden");
    modal.setAttribute("aria-hidden", "false");
    searchInput.value = "";
    renderSendaRepository("");
    searchInput.focus();
  };

  function renderSendaRepository(term) {
    list.innerHTML = "";
    const available = getSendasForDiscipline(currentDisciplineId);
    const filtered = available.filter(s =>
      s.name_es.toLowerCase().includes(term) || s.name_en.toLowerCase().includes(term)
    );
    filtered.forEach(s => {
      const button = document.createElement("button");
      button.className = "discipline-repo-item";
      if (modalSelection.has(s.id)) button.classList.add("selected");
      button.type = "button";
      button.textContent = s.name_es;
      button.addEventListener("click", () => {
        if (modalSelection.has(s.id)) {
          modalSelection.delete(s.id);
        } else {
          modalSelection.add(s.id);
        }
        renderSendaRepository(searchInput.value.trim().toLowerCase());
      });
      list.appendChild(button);
    });
  }

  closeBtn.addEventListener("click", closeModal);

  applyBtn.addEventListener("click", () => {
    // Build existing level map for this discipline
    const existingMap = {};
    selectedSendas
      .filter(s => s.disciplineId === currentDisciplineId)
      .forEach(s => { existingMap[s.sendaId] = s.level; });

    // Remove old sendas for this discipline
    selectedSendas = selectedSendas.filter(s => s.disciplineId !== currentDisciplineId);

    // Add selected sendas in repo order, preserving existing levels
    const available = getSendasForDiscipline(currentDisciplineId);
    available.forEach(s => {
      if (modalSelection.has(s.id)) {
        selectedSendas.push({
          disciplineId: currentDisciplineId,
          sendaId: s.id,
          level: existingMap[s.id] || 1,
        });
      }
    });

    renderDisciplineList();
    saveCharacterData();
    closeModal();
  });

  searchInput.addEventListener("input", () => {
    renderSendaRepository(searchInput.value.trim().toLowerCase());
  });

  modal.addEventListener("click", (event) => {
    if (event.target === modal) closeModal();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !modal.classList.contains("hidden")) closeModal();
  });
}

initSendaRepoModal();

// ----- Senda Save/Load -----

function getSendasData() {
  return selectedSendas.map(s => ({
    disciplineId: s.disciplineId,
    sendaId: s.sendaId,
    level: s.level,
    name: getSendaName(s.sendaId),
  }));
}

function loadSendasFromJSON(characterData) {
  selectedSendas = [];
  if (characterData.sendas && Array.isArray(characterData.sendas)) {
    characterData.sendas.forEach(s => {
      const repoEntry = sendasRepo.find(r => r.id === s.sendaId);
      if (repoEntry) {
        selectedSendas.push({
          disciplineId: s.disciplineId,
          sendaId: s.sendaId,
          level: s.level || 1,
        });
      }
    });
  }
  console.log("[Sendas] Loaded:", selectedSendas.length, "sendas", selectedSendas);
}

/////////////////////////////////////
////     Sistema de Poderes      ////
/////////////////////////////////////

// State: array of { name: string, description: string }
let disciplinePowers = [];

function renderPowersList() {
  const list = document.getElementById("discipline-powers-list");
  if (!list) return;
  list.innerHTML = "";

  disciplinePowers.forEach((power, index) => {
    const item = document.createElement("div");
    item.className = "discipline-power-item";
    item.innerHTML = `
      <div class="discipline-power-row">
        <button class="discipline-power-title-btn" type="button">${power.name}</button>
        <button class="discipline-power-edit-btn" type="button" aria-label="Editar poder" title="Editar poder">✎</button>
        <button class="discipline-power-delete-btn" type="button" aria-label="Eliminar poder">✕</button>
      </div>
      <div class="discipline-power-description">${power.description}</div>
    `;

    const titleBtn = item.querySelector(".discipline-power-title-btn");
    const editBtn = item.querySelector(".discipline-power-edit-btn");
    const deleteBtn = item.querySelector(".discipline-power-delete-btn");
    const descEl = item.querySelector(".discipline-power-description");

    titleBtn.addEventListener("click", () => {
      if (!item.classList.contains("editing")) {
        item.classList.toggle("open");
      }
    });

    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isEditing = item.classList.contains("editing");
      if (isEditing) {
        item.classList.remove("editing");
        item.classList.remove("open");
      } else {
        item.classList.add("editing", "open");
        descEl.innerHTML = "";
        const editForm = document.createElement("form");
        editForm.className = "discipline-power-edit-form";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = power.name;
        nameInput.placeholder = "Nombre del poder";
        nameInput.maxLength = 60;

        const descInput = document.createElement("textarea");
        descInput.rows = 3;
        descInput.value = power.description || "";
        descInput.placeholder = "Descripción del poder (opcional)";

        const actions = document.createElement("div");
        actions.className = "form-actions";

        const saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "discipline-power-save-btn";
        saveBtn.textContent = "Guardar";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "form-cancel-btn";
        cancelBtn.textContent = "Cancelar";
        cancelBtn.addEventListener("click", () => {
          item.classList.remove("editing", "open");
          descEl.textContent = power.description || "";
        });

        editForm.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const newName = nameInput.value.trim();
          if (!newName) return;
          power.name = newName;
          power.description = descInput.value.trim();
          saveCharacterData();
          renderPowersList();
        });

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        editForm.appendChild(nameInput);
        editForm.appendChild(descInput);
        editForm.appendChild(actions);
        descEl.appendChild(editForm);
      }
    });

    deleteBtn.addEventListener("click", () => {
      disciplinePowers.splice(index, 1);
      renderPowersList();
      saveCharacterData();
    });

    list.appendChild(item);
  });
}

function initDisciplinePowers() {
  const toggleBtn = document.getElementById("discipline-add-power-toggle");
  const cancelBtn = document.getElementById("discipline-add-power-cancel");
  const form = document.getElementById("discipline-add-power-form");
  const nameInput = document.getElementById("discipline-power-name");
  const descriptionInput = document.getElementById("discipline-power-description");
  if (!toggleBtn || !form || !nameInput || !descriptionInput) return;

  toggleBtn.addEventListener("click", () => {
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) nameInput.focus();
  });

  cancelBtn?.addEventListener("click", () => {
    nameInput.value = "";
    descriptionInput.value = "";
    form.classList.add("hidden");
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    if (!name) return;
    disciplinePowers.push({ name, description: description || "" });
    renderPowersList();
    saveCharacterData();
    nameInput.value = "";
    descriptionInput.value = "";
    form.classList.add("hidden");
  });
}

// Save/Load integration for powers
function getPowersData() {
  return disciplinePowers.map(p => ({ name: p.name, description: p.description }));
}

function loadPowersFromJSON(characterData) {
  disciplinePowers = [];
  if (characterData.disciplinePowers && Array.isArray(characterData.disciplinePowers)) {
    characterData.disciplinePowers.forEach(p => {
      if (p.name && p.name.trim() !== "") {
        disciplinePowers.push({ name: p.name, description: p.description || "" });
      }
    });
  }
}

// Migrate custom/unknown disciplines (id=0) into powers
function migrateCustomDisciplinesToPowers() {
  const customs = selectedDisciplines.filter(d => d.id === 0 && d.customName);
  if (customs.length === 0) return;

  customs.forEach(d => {
    // Avoid duplicates
    const already = disciplinePowers.some(p =>
      normalizeForMatch(p.name) === normalizeForMatch(d.customName)
    );
    if (!already) {
      const levelDots = d.level > 0 ? " (" + "•".repeat(d.level) + ")" : "";
      disciplinePowers.push({
        name: d.customName + levelDots,
        description: "Migrado desde disciplina legacy."
      });
    }
  });

  // Remove custom entries from selectedDisciplines
  selectedDisciplines = selectedDisciplines.filter(d => d.id !== 0);
}

// Initialize powers
initDisciplinePowers();

// ============================================
// SPECIALTIES SYSTEM - ICON + FLOATING MODAL
// ============================================

let currentOpenSpecialtyModal = null;

// Initialize specialty icons for all attributes/abilities
function initializeSpecialtyContainers() {
  const allFormGroups = document.querySelectorAll('.form-group.attribute');

  allFormGroups.forEach(formGroup => {
    const hiddenInput = formGroup.querySelector('input[type="hidden"]');
    if (!hiddenInput) return;

    const attributeId = hiddenInput.id.replace('-value', '');
    const rating = formGroup.querySelector('.rating');
    if (!rating) return;

    // Create specialty icon (small circle)
    const specialtyIcon = document.createElement('span');
    specialtyIcon.className = 'specialty-icon';
    specialtyIcon.innerHTML = '●'; // Círculo pequeño
    specialtyIcon.title = 'Ver/editar especialidades';
    specialtyIcon.style.display = 'none';
    specialtyIcon.setAttribute('data-for', attributeId);

    // Insert icon before the rating
    rating.parentNode.insertBefore(specialtyIcon, rating);

    // Add click event to open modal
    specialtyIcon.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openSpecialtyModal(attributeId, specialtyIcon);
    });
  });
}

// Open specialty modal (centered overlay, beta-style card)
function openSpecialtyModal(attributeId, iconElement) {
  closeSpecialtyModal();

  const specialties = getSpecialties(attributeId);
  const currentValue = parseInt(document.getElementById(`${attributeId}-value`).value);
  const maxSpecialties = Math.max(0, currentValue - 3);

  // Get human-readable attribute name from label
  const formGroup = document.getElementById(`${attributeId}-value`).closest('.form-group');
  const label = formGroup ? formGroup.querySelector('label') : null;
  const attrName = label ? label.textContent.trim() : attributeId;

  // -- Overlay --
  const overlay = document.createElement('div');
  overlay.className = 'specialty-modal';
  overlay.setAttribute('data-for', attributeId);

  // -- Card --
  const card = document.createElement('div');
  card.className = 'specialty-modal-card';

  // Header
  const header = document.createElement('div');
  header.className = 'specialty-modal-header';

  const title = document.createElement('h2');
  title.textContent = attrName;

  const closeBtn = document.createElement('button');
  closeBtn.className = 'specialty-close';
  closeBtn.type = 'button';
  closeBtn.innerHTML = '×';
  closeBtn.onclick = () => closeSpecialtyModal();

  header.appendChild(title);
  header.appendChild(closeBtn);
  card.appendChild(header);

  // Subtitle
  const subtitle = document.createElement('p');
  subtitle.className = 'specialty-subtitle';
  subtitle.textContent = specialties.length > 0
    ? 'Click en una especialidad para tirar con bonificador.'
    : 'Todavía no tiene especialidades.';
  card.appendChild(subtitle);

  // Specialty list
  if (specialties.length > 0) {
    const list = document.createElement('div');
    list.className = 'specialty-list';

    specialties.forEach(specialtyName => {
      const item = document.createElement('div');
      item.className = 'specialty-item';

      const rollBtn = document.createElement('button');
      rollBtn.className = 'specialty-roll-action';
      rollBtn.type = 'button';
      rollBtn.textContent = specialtyName;
      rollBtn.onclick = () => {
        useSpecialtyInDiceRoller(attributeId, specialtyName);
        closeSpecialtyModal();
      };

      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'specialty-delete-action';
      deleteBtn.type = 'button';
      deleteBtn.innerHTML = '✕';
      deleteBtn.title = 'Eliminar';
      deleteBtn.onclick = (e) => {
        e.stopPropagation();
        removeSpecialty(attributeId, specialtyName);
        updateSpecialtyIconVisibility(attributeId);
        saveCharacterData();
        closeSpecialtyModal();
        openSpecialtyModal(attributeId, iconElement);
      };

      item.appendChild(rollBtn);
      item.appendChild(deleteBtn);
      list.appendChild(item);
    });

    card.appendChild(list);
  }

  // Add specialty button / input
  if (specialties.length < maxSpecialties) {
    const addBtn = document.createElement('button');
    addBtn.className = 'specialty-add-action';
    addBtn.type = 'button';
    addBtn.textContent = '+ Agregar especialidad';

    addBtn.onclick = () => {
      // Replace button with inline input
      const addRow = document.createElement('div');
      addRow.className = 'specialty-add-row';

      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'specialty-add-input';
      input.placeholder = 'Nueva especialidad...';
      input.maxLength = 40;

      const confirmBtn = document.createElement('button');
      confirmBtn.className = 'specialty-add-confirm';
      confirmBtn.type = 'button';
      confirmBtn.textContent = '+';

      function doAdd() {
        const name = input.value.trim();
        if (!name) return;
        addSpecialty(attributeId, name);
        updateSpecialtyIconVisibility(attributeId);
        saveCharacterData();
        closeSpecialtyModal();
        openSpecialtyModal(attributeId, iconElement);
      }

      confirmBtn.onclick = doAdd;
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); doAdd(); }
      });

      addRow.appendChild(input);
      addRow.appendChild(confirmBtn);
      addBtn.replaceWith(addRow);
      input.focus();
    };

    card.appendChild(addBtn);
  } else if (maxSpecialties > 0) {
    const maxMsg = document.createElement('p');
    maxMsg.className = 'specialty-subtitle';
    maxMsg.style.textAlign = 'center';
    maxMsg.style.marginTop = '6px';
    maxMsg.textContent = `Máximo alcanzado (${maxSpecialties})`;
    card.appendChild(maxMsg);
  }

  // Assemble
  overlay.appendChild(card);
  document.body.appendChild(overlay);
  currentOpenSpecialtyModal = overlay;

  // Close on backdrop click
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) closeSpecialtyModal();
  });

  // Close on Escape
  const escHandler = (e) => {
    if (e.key === 'Escape') { closeSpecialtyModal(); document.removeEventListener('keydown', escHandler); }
  };
  document.addEventListener('keydown', escHandler);
  overlay._escHandler = escHandler;
}

// Close specialty modal
function closeSpecialtyModal() {
  if (currentOpenSpecialtyModal) {
    if (currentOpenSpecialtyModal._escHandler) {
      document.removeEventListener('keydown', currentOpenSpecialtyModal._escHandler);
    }
    currentOpenSpecialtyModal.remove();
    currentOpenSpecialtyModal = null;
  }
}

// Legacy handler no longer needed
function handleOutsideClick() {}

// Get specialties for an attribute from data structure
function getSpecialties(attributeId) {
  const hiddenInput = document.getElementById(`${attributeId}-value`);
  const specialtiesData = hiddenInput.getAttribute('data-specialties');

  if (!specialtiesData || specialtiesData === '') {
    return [];
  }

  try {
    return JSON.parse(specialtiesData);
  } catch (e) {
    return [];
  }
}

// Set specialties for an attribute
function setSpecialties(attributeId, specialties) {
  const hiddenInput = document.getElementById(`${attributeId}-value`);
  hiddenInput.setAttribute('data-specialties', JSON.stringify(specialties));
}

// Add a specialty
function addSpecialty(attributeId, specialtyName) {
  const specialties = getSpecialties(attributeId);
  if (!specialties.includes(specialtyName)) {
    specialties.push(specialtyName);
    setSpecialties(attributeId, specialties);
  }
}

// Remove a specialty
function removeSpecialty(attributeId, specialtyName) {
  let specialties = getSpecialties(attributeId);
  specialties = specialties.filter(s => s !== specialtyName);
  setSpecialties(attributeId, specialties);
}

// (Removed - no longer needed with modal system)

// Use specialty in dice roller (click on specialty name in modal)
function useSpecialtyInDiceRoller(attributeId, specialtyName) {
  const formGroup = document.getElementById(`${attributeId}-value`).closest('.form-group');
  const label = formGroup.querySelector('label');

  if (label) {
    label.click();

    const specialtyCheckbox = document.querySelector('#specialty');
    if (specialtyCheckbox) {
      specialtyCheckbox.checked = true;

      const specialtyLabel = document.querySelector('label[for="specialty"]');
      if (specialtyLabel) {
        specialtyLabel.textContent = `Usar Especialidad (${specialtyName})`;
      }
    }
  }
}

// Update visibility of specialty icon based on attribute value
function updateSpecialtyIconVisibility(attributeId) {
  const hiddenInput = document.getElementById(`${attributeId}-value`);
  const value = parseInt(hiddenInput.value);
  const icon = document.querySelector(`.specialty-icon[data-for="${attributeId}"]`);

  if (!icon) return;

  if (value > 3) {
    icon.style.display = 'inline-block';
  } else {
    icon.style.display = 'none';
  }
}

// Update all specialty icons visibility
function updateAllSpecialtyVisibility() {
  const allFormGroups = document.querySelectorAll('.form-group.attribute');

  allFormGroups.forEach(formGroup => {
    const hiddenInput = formGroup.querySelector('input[type="hidden"]');
    if (hiddenInput) {
      const attributeId = hiddenInput.id.replace('-value', '');
      updateSpecialtyIconVisibility(attributeId);
    }
  });
}

// Call initialization after DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeSpecialtyContainers);
} else {
  initializeSpecialtyContainers();
}

// ====== BACKGROUNDS / TRASFONDOS SYSTEM ====== //

let characterBackgrounds = []; // [{name, description, rating}]

function renderBackgroundList() {
  const listEl = document.getElementById("background-list");
  if (!listEl) return;
  listEl.innerHTML = "";

  if (characterBackgrounds.length === 0) {
    const empty = document.createElement("p");
    empty.className = "specialty-subtitle";
    empty.style.textAlign = "center";
    empty.style.margin = "16px 0";
    empty.textContent = "No hay trasfondos. Usa + para agregar.";
    listEl.appendChild(empty);
    return;
  }

  characterBackgrounds.forEach((bg, idx) => {
    const item = document.createElement("div");
    item.className = "background-item";

    // Row: title + rating + delete
    const row = document.createElement("div");
    row.className = "background-row";

    const titleBtn = document.createElement("button");
    titleBtn.className = "background-title-btn";
    titleBtn.type = "button";
    titleBtn.textContent = bg.name;
    titleBtn.addEventListener("click", () => {
      item.classList.toggle("open");
    });

    // Rating dots (5 dots, 1-based)
    const ratingEl = document.createElement("div");
    ratingEl.className = "rating background-rating";
    for (let d = 1; d <= 5; d++) {
      const dot = document.createElement("span");
      dot.className = "dot";
      dot.setAttribute("data-value", String(d));
      if (d <= bg.rating) dot.classList.add("filled");
      dot.addEventListener("click", () => {
        // Toggle: if clicking the current value, set to one less
        if (bg.rating === d && d === 1) {
          bg.rating = 0;
        } else if (bg.rating === d) {
          bg.rating = d - 1;
        } else {
          bg.rating = d;
        }
        refreshBackgroundDots(ratingEl, bg.rating);
        saveCharacterData();
      });
      ratingEl.appendChild(dot);
    }

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "background-edit-btn";
    editBtn.type = "button";
    editBtn.innerHTML = "✎";
    editBtn.title = "Editar trasfondo";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      // Toggle edit form inside description panel
      const isEditing = item.classList.contains("editing");
      if (isEditing) {
        item.classList.remove("editing");
        item.classList.remove("open");
      } else {
        item.classList.add("editing", "open");
        // Build edit form inside descEl
        descEl.innerHTML = "";
        const editForm = document.createElement("form");
        editForm.className = "background-edit-form";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = bg.name;
        nameInput.placeholder = "Nombre del trasfondo";
        nameInput.maxLength = 60;

        const descInput = document.createElement("textarea");
        descInput.rows = 3;
        descInput.value = bg.description || "";
        descInput.placeholder = "Descripción breve del trasfondo (opcional)";

        const actions = document.createElement("div");
        actions.className = "form-actions";

        const saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "background-save-btn";
        saveBtn.textContent = "Guardar";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "form-cancel-btn";
        cancelBtn.textContent = "Cancelar";
        cancelBtn.addEventListener("click", () => {
          item.classList.remove("editing", "open");
          descEl.textContent = bg.description || "";
        });

        editForm.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const newName = nameInput.value.trim();
          if (!newName) return;
          bg.name = newName;
          bg.description = descInput.value.trim();
          saveCharacterData();
          renderBackgroundList();
        });

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        editForm.appendChild(nameInput);
        editForm.appendChild(descInput);
        editForm.appendChild(actions);
        descEl.appendChild(editForm);
        nameInput.focus();
      }
    });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "background-delete-btn";
    deleteBtn.type = "button";
    deleteBtn.innerHTML = "✕";
    deleteBtn.title = "Eliminar trasfondo";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      characterBackgrounds.splice(idx, 1);
      renderBackgroundList();
      saveCharacterData();
    });

    row.appendChild(titleBtn);
    row.appendChild(ratingEl);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);

    // Description panel (expandible)
    const descEl = document.createElement("div");
    descEl.className = "background-description";
    descEl.textContent = bg.description || "";

    item.appendChild(row);
    item.appendChild(descEl);
    listEl.appendChild(item);
  });
}

function refreshBackgroundDots(ratingEl, value) {
  ratingEl.querySelectorAll(".dot").forEach(dot => {
    const dv = parseInt(dot.getAttribute("data-value"));
    if (dv <= value) {
      dot.classList.add("filled");
    } else {
      dot.classList.remove("filled");
    }
  });
}

function initBackgrounds() {
  const toggleBtn = document.getElementById("background-add-toggle");
  const form = document.getElementById("background-add-form");
  const cancelBtn = document.getElementById("background-add-cancel");
  const nameInput = document.getElementById("background-name");
  const descInput = document.getElementById("background-description");

  if (!toggleBtn || !form) return;

  toggleBtn.addEventListener("click", () => {
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) {
      nameInput.focus();
    }
  });

  cancelBtn.addEventListener("click", () => {
    nameInput.value = "";
    descInput.value = "";
    form.classList.add("hidden");
  });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = nameInput.value.trim();
    if (!name) return;
    const description = descInput.value.trim();
    characterBackgrounds.push({ name, description, rating: 1 });
    nameInput.value = "";
    descInput.value = "";
    form.classList.add("hidden");
    renderBackgroundList();
    saveCharacterData();
  });
}

// Save: returns array + writes legacy keys
function getBackgroundsData(characterData) {
  const backgrounds = characterBackgrounds.map(bg => ({
    name: bg.name,
    description: bg.description || "",
    rating: bg.rating
  }));

  // Write legacy keys for backward compat
  for (let i = 1; i <= 12; i++) {
    if (i <= characterBackgrounds.length) {
      const bg = characterBackgrounds[i - 1];
      characterData["trasfondo" + i] = bg.name;
      characterData["trasfondo" + i + "-value"] = String(bg.rating);
    } else {
      characterData["trasfondo" + i] = "";
      characterData["trasfondo" + i + "-value"] = "0";
    }
  }

  return backgrounds;
}

// Load: handles both new and legacy formats
function loadBackgroundsFromJSON(characterData) {
  characterBackgrounds = [];

  if (characterData.backgrounds && Array.isArray(characterData.backgrounds)) {
    // New format
    characterData.backgrounds.forEach(bg => {
      characterBackgrounds.push({
        name: bg.name || "",
        description: bg.description || "",
        rating: bg.rating || 0
      });
    });
  } else {
    // Legacy format: trasfondo1..12
    for (let i = 1; i <= 12; i++) {
      const name = characterData["trasfondo" + i];
      const rating = parseInt(characterData["trasfondo" + i + "-value"]) || 0;
      if (name && name.trim() !== "") {
        characterBackgrounds.push({ name: name.trim(), description: "", rating });
      }
    }
  }

  renderBackgroundList();
}

// Initialize on load
initBackgrounds();
renderBackgroundList();

// ====== EXPERIENCE / XP SYSTEM ====== //

let xpArcs = []; // [{name, entries: [{name, cost}]}]
let currentArcIndex = 0;

function renderXpPool() {
  const xpPool = document.getElementById("xp-pool");
  const hiddenInput = document.getElementById("experiencia-value");
  if (!xpPool) return;

  const groups = 3;
  const rows = 3;
  const cols = 5;
  const totalCells = groups * rows * cols; // 45
  const filled = Math.max(0, Math.min(totalCells, parseInt(hiddenInput?.value) || 0));

  // Update accumulated total next to the title
  const totalLabel = document.getElementById("xp-total");
  if (totalLabel) totalLabel.textContent = filled ? `(${filled})` : "";

  xpPool.innerHTML = "";

  for (let g = 0; g < groups; g++) {
    const group = document.createElement("div");
    group.className = "xp-group";

    for (let i = 0; i < rows * cols; i++) {
      const globalIndex = g * rows * cols + i;
      const cell = document.createElement("span");
      cell.className = "xp-cell";
      if (globalIndex < filled) cell.classList.add("filled");

      // Click to set XP value
      cell.addEventListener("click", () => {
        const newVal = globalIndex + 1;
        const currentVal = parseInt(hiddenInput.value) || 0;
        // Toggle: if clicking the last filled cell, decrease by 1
        if (currentVal === newVal) {
          hiddenInput.value = String(newVal - 1);
        } else {
          hiddenInput.value = String(newVal);
        }
        renderXpPool();
        saveCharacterData();
      });

      group.appendChild(cell);
    }

    xpPool.appendChild(group);
  }
}

function renderXpArcs() {
  const arcList = document.getElementById("xp-arc-list");
  if (!arcList) return;
  arcList.innerHTML = "";

  if (xpArcs.length === 0) {
    const empty = document.createElement("p");
    empty.className = "specialty-subtitle";
    empty.style.textAlign = "center";
    empty.style.margin = "12px 0";
    empty.textContent = "Sin arcos de experiencia.";
    arcList.appendChild(empty);
    return;
  }

  // Render newest first
  const arcView = [...xpArcs].map((arc, index) => ({ arc, index })).reverse();

  arcView.forEach(({ arc, index: arcIndex }) => {
    const arcBlock = document.createElement("section");
    arcBlock.className = "xp-arc";

    const header = document.createElement("div");
    header.className = "xp-arc-header";
    header.style.display = "flex";
    header.style.justifyContent = "space-between";
    header.style.alignItems = "center";

    const title = document.createElement("h4");
    title.className = "xp-arc-title";
    title.textContent = arc.name;

    const deleteArcBtn = document.createElement("button");
    deleteArcBtn.className = "xp-entry-delete";
    deleteArcBtn.type = "button";
    deleteArcBtn.style.position = "static";
    deleteArcBtn.style.transform = "none";
    deleteArcBtn.style.opacity = "0";
    deleteArcBtn.style.pointerEvents = "none";
    deleteArcBtn.setAttribute("aria-label", "Eliminar arco");
    deleteArcBtn.textContent = "✕";
    deleteArcBtn.addEventListener("click", () => {
      xpArcs.splice(arcIndex, 1);
      if (currentArcIndex >= xpArcs.length) currentArcIndex = Math.max(0, xpArcs.length - 1);
      renderXpArcs();
      saveCharacterData();
    });

    header.appendChild(title);
    header.appendChild(deleteArcBtn);

    // Show delete on arc hover
    arcBlock.addEventListener("mouseenter", () => { deleteArcBtn.style.opacity = "1"; deleteArcBtn.style.pointerEvents = "auto"; });
    arcBlock.addEventListener("mouseleave", () => { deleteArcBtn.style.opacity = "0"; deleteArcBtn.style.pointerEvents = "none"; });

    arcBlock.appendChild(header);

    const entries = document.createElement("div");
    entries.className = "xp-entry-list";

    if (arc.entries.length === 0) {
      const empty = document.createElement("p");
      empty.className = "discipline-detail-label";
      empty.textContent = "Sin gastos en este arco.";
      entries.appendChild(empty);
    } else {
      arc.entries.forEach((entry, entryIndex) => {
        const row = document.createElement("div");
        row.className = "xp-entry";

        const main = document.createElement("div");
        main.className = "xp-entry-main";

        const dateEl = document.createElement("span");
        dateEl.className = "xp-entry-date";
        if (entry.date) {
          const [, m, d] = entry.date.split("-");
          dateEl.textContent = `${d}/${m}`;
        }
        main.appendChild(dateEl);

        const name = document.createElement("span");
        name.className = "xp-entry-name";
        name.textContent = entry.name;

        const cost = document.createElement("span");
        cost.className = "xp-entry-cost";
        cost.textContent = String(entry.cost);

        main.appendChild(name);
        main.appendChild(cost);

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "xp-entry-delete";
        deleteBtn.type = "button";
        deleteBtn.setAttribute("aria-label", "Eliminar gasto");
        deleteBtn.textContent = "✕";
        deleteBtn.addEventListener("click", () => {
          xpArcs[arcIndex].entries.splice(entryIndex, 1);
          renderXpArcs();
          saveCharacterData();
        });

        row.appendChild(main);
        row.appendChild(deleteBtn);
        entries.appendChild(row);
      });
    }

    arcBlock.appendChild(entries);
    arcList.appendChild(arcBlock);
  });
}

function initExperience() {
  const form = document.getElementById("xp-spend-form");
  const nameInput = document.getElementById("xp-spend-name");
  const costInput = document.getElementById("xp-spend-cost");
  const cancelBtn = document.getElementById("xp-spend-cancel");
  const newSpendBtn = document.getElementById("xp-new-spend-btn");
  const newArcBtn = document.getElementById("xp-new-arc-btn");

  if (!form || !nameInput || !costInput || !newSpendBtn || !newArcBtn) return;

  function resetForm() {
    nameInput.value = "";
    costInput.value = "1";
  }

  function closeSpendForm() {
    resetForm();
    form.classList.add("hidden");
  }

  newSpendBtn.addEventListener("click", () => {
    form.classList.toggle("hidden");
    if (!form.classList.contains("hidden")) {
      nameInput.focus();
    } else {
      resetForm();
    }
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const name = nameInput.value.trim();
    const cost = Math.max(1, Number(costInput.value || 1));
    if (!name) return;

    // If no arcs exist, create a default one
    if (xpArcs.length === 0) {
      xpArcs.push({ name: "Arco 1", entries: [] });
      currentArcIndex = 0;
    }

    const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
    xpArcs[currentArcIndex].entries.unshift({ name, cost, date: today });
    renderXpArcs();
    closeSpendForm();
    saveCharacterData();
  });

  cancelBtn?.addEventListener("click", closeSpendForm);

  newArcBtn.addEventListener("click", () => {
    xpArcs.push({ name: `Arco ${xpArcs.length + 1}`, entries: [] });
    currentArcIndex = xpArcs.length - 1;
    renderXpArcs();
    saveCharacterData();
  });
}

// Save XP arcs data
function getXpArcsData() {
  return xpArcs.map(arc => ({
    name: arc.name,
    entries: arc.entries.map(e => ({ name: e.name, cost: e.cost, date: e.date || null }))
  }));
}

// Load XP arcs from JSON
function loadXpArcsFromJSON(characterData) {
  xpArcs = [];
  currentArcIndex = 0;
  if (characterData.xpArcs && Array.isArray(characterData.xpArcs)) {
    characterData.xpArcs.forEach(arc => {
      xpArcs.push({
        name: arc.name || "Arco",
        entries: (arc.entries || []).map(e => ({ name: e.name || "", cost: e.cost || 1, date: e.date || null }))
      });
    });
    currentArcIndex = Math.max(0, xpArcs.length - 1);
  }
  renderXpPool();
  renderXpArcs();
}

// Initialize on load
initExperience();
renderXpPool();
renderXpArcs();

// ====== MERITS & DEFECTS SYSTEM ====== //

let characterMerits = [];  // [{name, description, value}]
let characterDefects = []; // [{name, description, value}]

function renderMeritDefectList(items, listId, prefix) {
  const listEl = document.getElementById(listId);
  if (!listEl) return;
  listEl.innerHTML = "";

  const emptyText = prefix === "-" ? "No hay méritos. Usa + para agregar." : "No hay defectos. Usa + para agregar.";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "specialty-subtitle";
    empty.style.textAlign = "center";
    empty.style.margin = "16px 0";
    empty.textContent = emptyText;
    listEl.appendChild(empty);
    return;
  }

  items.forEach((entry, idx) => {
    const item = document.createElement("div");
    item.className = "background-item";

    // Row: title + value badge + edit + delete
    const row = document.createElement("div");
    row.className = "background-row";

    const titleBtn = document.createElement("button");
    titleBtn.className = "background-title-btn";
    titleBtn.type = "button";
    titleBtn.textContent = entry.name;
    titleBtn.addEventListener("click", () => {
      item.classList.toggle("open");
    });

    const valueBadge = document.createElement("span");
    valueBadge.className = "background-value";
    valueBadge.textContent = `${prefix}${Math.max(1, Number(entry.value || 1))}`;

    // Edit button
    const editBtn = document.createElement("button");
    editBtn.className = "background-edit-btn";
    editBtn.type = "button";
    editBtn.innerHTML = "✎";
    editBtn.title = prefix === "-" ? "Editar mérito" : "Editar defecto";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      const isEditing = item.classList.contains("editing");
      if (isEditing) {
        item.classList.remove("editing", "open");
      } else {
        item.classList.add("editing", "open");
        descEl.innerHTML = "";
        const editForm = document.createElement("form");
        editForm.className = "background-edit-form";

        const nameInput = document.createElement("input");
        nameInput.type = "text";
        nameInput.value = entry.name;
        nameInput.placeholder = "Nombre";
        nameInput.maxLength = 60;

        const valueInput = document.createElement("input");
        valueInput.type = "number";
        valueInput.min = "1";
        valueInput.step = "1";
        valueInput.value = entry.value || 1;
        valueInput.placeholder = "Valor";

        const descInput = document.createElement("textarea");
        descInput.rows = 3;
        descInput.value = entry.description || "";
        descInput.placeholder = "Descripción (opcional)";

        const actions = document.createElement("div");
        actions.className = "form-actions";

        const saveBtn = document.createElement("button");
        saveBtn.type = "submit";
        saveBtn.className = "background-save-btn";
        saveBtn.textContent = "Guardar";

        const cancelBtn = document.createElement("button");
        cancelBtn.type = "button";
        cancelBtn.className = "form-cancel-btn";
        cancelBtn.textContent = "Cancelar";
        cancelBtn.addEventListener("click", () => {
          item.classList.remove("editing", "open");
          descEl.textContent = entry.description || "";
        });

        editForm.addEventListener("submit", (ev) => {
          ev.preventDefault();
          const newName = nameInput.value.trim();
          if (!newName) return;
          entry.name = newName;
          entry.value = Math.max(1, Number(valueInput.value) || 1);
          entry.description = descInput.value.trim();
          saveCharacterData();
          renderMeritDefectList(items, listId, prefix);
        });

        actions.appendChild(saveBtn);
        actions.appendChild(cancelBtn);
        editForm.appendChild(nameInput);
        editForm.appendChild(valueInput);
        editForm.appendChild(descInput);
        editForm.appendChild(actions);
        descEl.appendChild(editForm);
        nameInput.focus();
      }
    });

    // Delete button
    const deleteBtn = document.createElement("button");
    deleteBtn.className = "background-delete-btn";
    deleteBtn.type = "button";
    deleteBtn.innerHTML = "✕";
    deleteBtn.title = prefix === "-" ? "Eliminar mérito" : "Eliminar defecto";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      items.splice(idx, 1);
      renderMeritDefectList(items, listId, prefix);
      saveCharacterData();
    });

    row.appendChild(titleBtn);
    row.appendChild(valueBadge);
    row.appendChild(editBtn);
    row.appendChild(deleteBtn);

    // Description panel
    const descEl = document.createElement("div");
    descEl.className = "background-description";
    descEl.textContent = entry.description || "";

    item.appendChild(row);
    item.appendChild(descEl);
    listEl.appendChild(item);
  });
}

function initMeritsDefects() {
  // Helper to wire up a section (merits or defects)
  function wireSection(toggleId, formId, nameId, costId, descId, cancelId, items, listId, prefix) {
    const toggleBtn = document.getElementById(toggleId);
    const form = document.getElementById(formId);
    const nameInput = document.getElementById(nameId);
    const costInput = document.getElementById(costId);
    const descInput = document.getElementById(descId);
    const cancelBtn = document.getElementById(cancelId);

    if (!toggleBtn || !form) return;

    toggleBtn.addEventListener("click", () => {
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden") && nameInput) nameInput.focus();
    });

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        form.classList.add("hidden");
        if (nameInput) nameInput.value = "";
        if (costInput) costInput.value = "1";
        if (descInput) descInput.value = "";
      });
    }

    form.addEventListener("submit", (e) => {
      e.preventDefault();
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;
      const value = Math.max(1, Number(costInput ? costInput.value : 1) || 1);
      const description = descInput ? descInput.value.trim() : "";
      items.push({ name, description, value });
      renderMeritDefectList(items, listId, prefix);
      saveCharacterData();
      if (nameInput) nameInput.value = "";
      if (costInput) costInput.value = "1";
      if (descInput) descInput.value = "";
      form.classList.add("hidden");
    });
  }

  wireSection("merit-add-toggle", "merit-add-form", "merit-name", "merit-cost", "merit-description", "merit-add-cancel", characterMerits, "merit-list", "-");
  wireSection("defect-add-toggle", "defect-add-form", "defect-name", "defect-cost", "defect-description", "defect-add-cancel", characterDefects, "defect-list", "+");
}

// Save: returns array + writes legacy keys
function getMeritsData(characterData) {
  const merits = characterMerits.map(m => ({ name: m.name, description: m.description || "", value: m.value }));
  for (let i = 1; i <= 5; i++) {
    if (i <= characterMerits.length) {
      characterData["merito" + i] = characterMerits[i - 1].name;
      characterData["merito" + i + "-value"] = String(characterMerits[i - 1].value);
    } else {
      characterData["merito" + i] = "";
      characterData["merito" + i + "-value"] = "0";
    }
  }
  return merits;
}

function getDefectsData(characterData) {
  const defects = characterDefects.map(d => ({ name: d.name, description: d.description || "", value: d.value }));
  for (let i = 1; i <= 5; i++) {
    if (i <= characterDefects.length) {
      characterData["defecto" + i] = characterDefects[i - 1].name;
      characterData["defecto" + i + "-value"] = String(characterDefects[i - 1].value);
    } else {
      characterData["defecto" + i] = "";
      characterData["defecto" + i + "-value"] = "0";
    }
  }
  return defects;
}

// Load: handles both new and legacy formats
function loadMeritsFromJSON(characterData) {
  characterMerits = [];
  if (characterData.merits && Array.isArray(characterData.merits)) {
    characterData.merits.forEach(m => {
      characterMerits.push({ name: m.name || "", description: m.description || "", value: m.value || 1 });
    });
  } else {
    for (let i = 1; i <= 5; i++) {
      const name = characterData["merito" + i];
      const value = parseInt(characterData["merito" + i + "-value"]) || 0;
      if (name && name.trim() !== "") {
        characterMerits.push({ name: name.trim(), description: "", value: value || 1 });
      }
    }
  }
  renderMeritDefectList(characterMerits, "merit-list", "-");
}

function loadDefectsFromJSON(characterData) {
  characterDefects = [];
  if (characterData.defects && Array.isArray(characterData.defects)) {
    characterData.defects.forEach(d => {
      characterDefects.push({ name: d.name || "", description: d.description || "", value: d.value || 1 });
    });
  } else {
    for (let i = 1; i <= 5; i++) {
      const name = characterData["defecto" + i];
      const value = parseInt(characterData["defecto" + i + "-value"]) || 0;
      if (name && name.trim() !== "") {
        characterDefects.push({ name: name.trim(), description: "", value: value || 1 });
      }
    }
  }
  renderMeritDefectList(characterDefects, "defect-list", "+");
}

// Initialize on load
initMeritsDefects();
renderMeritDefectList(characterMerits, "merit-list", "-");
renderMeritDefectList(characterDefects, "defect-list", "+");

// ====== NOTES SYSTEM ====== //

let characterNotes = [];  // [{id, title, body, tags:[], createdAt, archived}]
let noteNextId = 1;
let noteEditingId = null;

function noteFormatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString("es-AR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function noteParseTags(raw) {
  return raw.split(",").map(t => t.trim().toLowerCase()).filter(Boolean);
}

function noteResetForm() {
  const form = document.getElementById("note-form");
  const titleInput = document.getElementById("note-title");
  const bodyInput = document.getElementById("note-body");
  const tagsInput = document.getElementById("note-tags");
  const saveBtn = document.getElementById("note-save-btn");
  if (!form) return;
  noteEditingId = null;
  form.classList.add("hidden");
  if (titleInput) titleInput.value = "";
  if (bodyInput) bodyInput.value = "";
  if (tagsInput) tagsInput.value = "";
  if (saveBtn) saveBtn.textContent = "Guardar nota";
}

function noteOpenEditForm(note) {
  const form = document.getElementById("note-form");
  const titleInput = document.getElementById("note-title");
  const bodyInput = document.getElementById("note-body");
  const tagsInput = document.getElementById("note-tags");
  const saveBtn = document.getElementById("note-save-btn");
  if (!form) return;
  noteEditingId = note.id;
  titleInput.value = note.title;
  bodyInput.value = note.body;
  tagsInput.value = note.tags.join(", ");
  saveBtn.textContent = "Guardar cambios";
  form.classList.remove("hidden");
  titleInput.focus();
}

function buildNoteCard(note) {
  const card = document.createElement("article");
  card.className = "note-card";

  const header = document.createElement("div");
  header.className = "note-header";

  const title = document.createElement("strong");
  title.className = "note-title";
  title.textContent = note.title;

  const date = document.createElement("span");
  date.className = "note-date";
  date.textContent = noteFormatDate(note.createdAt);

  header.appendChild(title);
  header.appendChild(date);

  const body = document.createElement("p");
  body.className = "note-body";
  body.textContent = note.body;

  const tags = document.createElement("div");
  tags.className = "note-tags";
  note.tags.forEach(tag => {
    const chip = document.createElement("span");
    chip.className = "note-tag";
    chip.textContent = `#${tag}`;
    tags.appendChild(chip);
  });

  const actions = document.createElement("div");
  actions.className = "note-actions";

  const editBtn = document.createElement("button");
  editBtn.type = "button";
  editBtn.className = "note-action-btn";
  editBtn.textContent = "Editar";
  editBtn.addEventListener("click", () => noteOpenEditForm(note));

  const archiveBtn = document.createElement("button");
  archiveBtn.type = "button";
  archiveBtn.className = "note-action-btn";
  archiveBtn.textContent = note.archived ? "Desarchivar" : "Archivar";
  archiveBtn.addEventListener("click", () => {
    note.archived = !note.archived;
    renderNotes();
    saveCharacterData();
  });

  const deleteBtn = document.createElement("button");
  deleteBtn.type = "button";
  deleteBtn.className = "note-action-btn delete";
  deleteBtn.textContent = "Borrar";
  deleteBtn.addEventListener("click", () => {
    const idx = characterNotes.findIndex(n => n.id === note.id);
    if (idx !== -1) characterNotes.splice(idx, 1);
    if (noteEditingId === note.id) noteResetForm();
    renderNotes();
    saveCharacterData();
  });

  actions.appendChild(editBtn);
  actions.appendChild(archiveBtn);
  actions.appendChild(deleteBtn);

  card.appendChild(header);
  card.appendChild(body);
  if (note.tags.length > 0) card.appendChild(tags);
  card.appendChild(actions);

  return card;
}

function renderNoteSection(parent, collection, emptyLabel) {
  parent.innerHTML = "";

  if (collection.length === 0) {
    const empty = document.createElement("p");
    empty.className = "discipline-detail-label";
    empty.textContent = emptyLabel;
    parent.appendChild(empty);
    return;
  }

  collection.forEach(note => parent.appendChild(buildNoteCard(note)));
}

function renderNotes() {
  const searchInput = document.getElementById("note-search");
  const list = document.getElementById("note-list");
  const archiveList = document.getElementById("note-archive-list");
  if (!list || !archiveList) return;

  const term = searchInput ? searchInput.value.trim().toLowerCase() : "";
  const filtered = characterNotes.filter(note => {
    if (!term) return true;
    const haystack = `${note.title} ${note.body} ${note.tags.join(" ")}`.toLowerCase();
    return haystack.includes(term);
  });

  const active = filtered.filter(n => !n.archived);
  const archived = filtered.filter(n => n.archived);

  renderNoteSection(list, active, "No hay notas activas.");
  renderNoteSection(archiveList, archived, "No hay notas archivadas.");

  // Update tab counters
  const activeTab = document.querySelector('[data-note-tab="active"]');
  const archivedTab = document.querySelector('[data-note-tab="archived"]');
  if (activeTab) activeTab.textContent = `Activas${active.length ? ` (${active.length})` : ""}`;
  if (archivedTab) archivedTab.textContent = `Archivadas${archived.length ? ` (${archived.length})` : ""}`;
}

function initNotes() {
  const newBtn = document.getElementById("note-new-btn");
  const form = document.getElementById("note-form");
  const cancelBtn = document.getElementById("note-cancel-btn");
  const searchInput = document.getElementById("note-search");
  const titleInput = document.getElementById("note-title");
  const bodyInput = document.getElementById("note-body");
  const tagsInput = document.getElementById("note-tags");

  if (!newBtn || !form || !titleInput || !bodyInput || !tagsInput) return;

  // Note tabs (Activas / Archivadas)
  const noteTabs = document.querySelectorAll(".note-tab");
  const noteList = document.getElementById("note-list");
  const noteArchiveList = document.getElementById("note-archive-list");
  noteTabs.forEach(tab => {
    tab.addEventListener("click", () => {
      noteTabs.forEach(t => t.classList.remove("active"));
      tab.classList.add("active");
      const which = tab.getAttribute("data-note-tab");
      if (which === "active") {
        noteList.classList.remove("hidden");
        noteArchiveList.classList.add("hidden");
      } else {
        noteList.classList.add("hidden");
        noteArchiveList.classList.remove("hidden");
      }
    });
  });

  newBtn.addEventListener("click", () => {
    if (form.classList.contains("hidden")) {
      noteEditingId = null;
      titleInput.value = "";
      bodyInput.value = "";
      tagsInput.value = "";
      const saveBtn = document.getElementById("note-save-btn");
      if (saveBtn) saveBtn.textContent = "Guardar nota";
      form.classList.remove("hidden");
      titleInput.focus();
    } else {
      noteResetForm();
    }
  });

  cancelBtn?.addEventListener("click", noteResetForm);

  searchInput?.addEventListener("input", renderNotes);

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const title = titleInput.value.trim();
    const body = bodyInput.value.trim();
    const tags = noteParseTags(tagsInput.value);
    if (!title || !body) return;

    if (noteEditingId !== null) {
      const note = characterNotes.find(n => n.id === noteEditingId);
      if (note) {
        note.title = title;
        note.body = body;
        note.tags = tags;
      }
    } else {
      characterNotes.unshift({
        id: noteNextId++,
        title,
        body,
        tags,
        createdAt: new Date().toISOString(),
        archived: false
      });
    }

    noteResetForm();
    renderNotes();
    saveCharacterData();
  });
}

function getNotesData() {
  return characterNotes.map(n => ({
    id: n.id,
    title: n.title,
    body: n.body,
    tags: n.tags,
    createdAt: n.createdAt,
    archived: n.archived
  }));
}

function loadNotesFromJSON(characterData) {
  characterNotes = [];
  noteNextId = 1;
  if (characterData.notes && Array.isArray(characterData.notes)) {
    characterData.notes.forEach(n => {
      const note = {
        id: n.id || noteNextId,
        title: n.title || "",
        body: n.body || "",
        tags: n.tags || [],
        createdAt: n.createdAt || new Date().toISOString(),
        archived: Boolean(n.archived)
      };
      characterNotes.push(note);
      if (note.id >= noteNextId) noteNextId = note.id + 1;
    });
  }
  renderNotes();
}

// Initialize on load
initNotes();
renderNotes();

// ====== SAVED ROLLS (TIRADAS RÁPIDAS) ====== //

let savedRolls = []; // [{id, name, pool1Attr, pool2Attr, modifier, difficulty}]
let savedRollNextId = 1;
let savedRollEditingId = null;

function getSavedRollAttrOptions() {
  const opts = [{ value: "", label: "— Ninguno —" }];
  document.querySelectorAll(".attributes .form-group.attribute").forEach(row => {
    const input = row.querySelector('input[type="hidden"][id$="-value"]');
    const label = row.querySelector("label");
    if (input && label) opts.push({ value: input.id, label: label.textContent.trim() });
  });
  return opts;
}

function getSavedRollAbilityOptions() {
  const opts = [{ value: "", label: "— Ninguna —" }];
  document.querySelectorAll(".abilities .form-group.attribute").forEach(row => {
    const input = row.querySelector('input[type="hidden"][id$="-value"]');
    const label = row.querySelector("label");
    if (input && label) {
      opts.push({ value: input.id, label: label.textContent.trim() });
      // Add specialties as sub-options
      const attrId = input.id.replace("-value", "");
      const specialties = getSpecialties(attrId);
      specialties.forEach(specName => {
        opts.push({
          value: input.id + "|spec:" + specName,
          label: "  Esp. " + label.textContent.trim() + ": " + specName,
          isSpecialty: true
        });
      });
    }
  });
  return opts;
}

function populateSavedRollSelects() {
  const pool1Select = document.getElementById("saved-roll-pool1");
  const pool2Select = document.getElementById("saved-roll-pool2");
  const modSelect = document.getElementById("saved-roll-mod");
  const diffSelect = document.getElementById("saved-roll-diff");

  if (pool1Select) {
    pool1Select.innerHTML = "";
    getSavedRollAttrOptions().forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.value; opt.textContent = o.label;
      pool1Select.appendChild(opt);
    });
  }
  if (pool2Select) {
    pool2Select.innerHTML = "";
    getSavedRollAbilityOptions().forEach(o => {
      const opt = document.createElement("option");
      opt.value = o.value; opt.textContent = o.label;
      if (o.isSpecialty) opt.className = "saved-roll-specialty-opt";
      pool2Select.appendChild(opt);
    });
  }
  if (modSelect && modSelect.children.length === 0) {
    for (let i = -5; i <= 5; i++) {
      const opt = document.createElement("option");
      opt.value = String(i);
      opt.textContent = i === 0 ? "0" : (i > 0 ? `+${i}` : String(i));
      if (i === 0) opt.selected = true;
      modSelect.appendChild(opt);
    }
  }
  if (diffSelect && diffSelect.children.length === 0) {
    for (let d = 3; d <= 10; d++) {
      const opt = document.createElement("option");
      opt.value = String(d); opt.textContent = String(d);
      if (d === 6) opt.selected = true;
      diffSelect.appendChild(opt);
    }
  }
}

function renderSavedRolls() {
  const list = document.getElementById("saved-rolls-list");
  if (!list) return;
  list.innerHTML = "";

  // Fixed system actions (non-editable, non-deletable)
  const initChip = document.createElement("button");
  initChip.className = "roll-chip roll-chip-fixed";
  initChip.type = "button";
  initChip.textContent = "Iniciativa";
  initChip.addEventListener("click", () => rollInitiative());
  list.appendChild(initChip);

  const wakeChip = document.createElement("button");
  wakeChip.className = "roll-chip roll-chip-fixed";
  wakeChip.type = "button";
  wakeChip.textContent = "Despertarse";
  wakeChip.addEventListener("click", () => actionWakeUp());
  list.appendChild(wakeChip);

  savedRolls.forEach(roll => {
    const wrap = document.createElement("div");
    wrap.className = "roll-chip-wrap";

    const chip = document.createElement("button");
    chip.className = "roll-chip";
    chip.type = "button";
    chip.textContent = roll.name;
    chip.addEventListener("click", () => executeSavedRoll(roll));

    const actions = document.createElement("div");
    actions.className = "roll-chip-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "roll-chip-action";
    editBtn.type = "button";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => { e.stopPropagation(); openSavedRollModal(roll); });

    const deleteBtn = document.createElement("button");
    deleteBtn.className = "roll-chip-action delete";
    deleteBtn.type = "button";
    deleteBtn.textContent = "✕";
    deleteBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      savedRolls.splice(savedRolls.findIndex(r => r.id === roll.id), 1);
      renderSavedRolls();
      saveCharacterData();
    });

    actions.appendChild(editBtn);
    actions.appendChild(deleteBtn);
    wrap.appendChild(chip);
    wrap.appendChild(actions);
    list.appendChild(wrap);
  });
}

function executeSavedRoll(roll) {
  const pool1Val = roll.pool1Attr ? parseInt(document.getElementById(roll.pool1Attr)?.value) || 0 : 0;
  const pool2Val = roll.pool2Attr ? parseInt(document.getElementById(roll.pool2Attr)?.value) || 0 : 0;

  // Check for boost on physical attributes
  let boostVal = 0;
  let physBonusVal = 0;
  let physBonusLabel = "";
  if (roll.pool1Attr) {
    const attrName = roll.pool1Attr.replace("-value", "");
    const boostInput = document.getElementById("temp" + attrName.charAt(0).toUpperCase() + attrName.slice(1));
    if (boostInput) boostVal = parseInt(boostInput.value) || 0;

    // Physical discipline bonus (Potencia→Fuerza, Celeridad→Destreza, Fortaleza→Resistencia)
    const physBonus = getPhysicalDisciplineBonus(attrName);
    if (physBonus) {
      if (physBonus.id === 5) {
        // Celeridad: always add passive bonus
        if (physBonus.level > 0) {
          physBonusVal = physBonus.level;
          physBonusLabel = `+${physBonus.shortName}`;
        }
      } else if (!activatedDisciplines.has(physBonus.id)) {
        // Potencia/Fortaleza: passive mode
        physBonusVal = physBonus.level;
        physBonusLabel = `+${physBonus.shortName}`;
      }
    }
  }

  const pool1Label = roll.pool1Attr ? (document.getElementById(roll.pool1Attr)?.getAttribute("name") || "") : "";
  const pool2Label = roll.pool2Attr ? (document.getElementById(roll.pool2Attr)?.getAttribute("name") || "") : "";

  document.querySelector("#dicePool1").value = String(pool1Val + boostVal + physBonusVal);
  document.querySelector("#dicePool1Label").innerHTML = pool1Label ? capitalizeFirstLetter(pool1Label) + physBonusLabel : "";
  document.querySelector("#dicePool2").value = String(pool2Val);
  document.querySelector("#dicePool2Label").innerHTML = pool2Label ? capitalizeFirstLetter(pool2Label) : "";
  document.querySelector("#diceMod").value = String(roll.modifier);
  document.querySelector("#difficulty").value = String(roll.difficulty);

  // Handle specialty checkbox
  const specialtyCheckbox = document.querySelector("#specialty");
  const specialtyLabel = document.querySelector('label[for="specialty"]');
  if (roll.specialty && roll.specialty.length > 0) {
    if (specialtyCheckbox) specialtyCheckbox.checked = true;
    if (specialtyLabel) specialtyLabel.textContent = `Usar Especialidad (${roll.specialty})`;
  } else {
    if (specialtyCheckbox) specialtyCheckbox.checked = false;
    if (specialtyLabel) specialtyLabel.textContent = "Usar Especialidad";
  }

  updateFinalPoolSize();
  rollTheDice();
}

function openSavedRollModal(rollToEdit) {
  const modal = document.getElementById("saved-roll-modal");
  const title = document.getElementById("saved-roll-modal-title");
  const nameInput = document.getElementById("saved-roll-name");
  const pool1Select = document.getElementById("saved-roll-pool1");
  const pool2Select = document.getElementById("saved-roll-pool2");
  const modSelect = document.getElementById("saved-roll-mod");
  const diffSelect = document.getElementById("saved-roll-diff");
  if (!modal) return;

  populateSavedRollSelects();

  if (rollToEdit) {
    savedRollEditingId = rollToEdit.id;
    title.textContent = "Editar Tirada";
    nameInput.value = rollToEdit.name;
    pool1Select.value = rollToEdit.pool1Attr;
    // Restore pool2 with specialty suffix if applicable
    if (rollToEdit.specialty) {
      pool2Select.value = rollToEdit.pool2Attr + "|spec:" + rollToEdit.specialty;
    } else {
      pool2Select.value = rollToEdit.pool2Attr;
    }
    modSelect.value = String(rollToEdit.modifier);
    diffSelect.value = String(rollToEdit.difficulty);
  } else {
    savedRollEditingId = null;
    title.textContent = "Nueva Tirada";
    nameInput.value = "";
    pool1Select.value = "";
    pool2Select.value = "";
    modSelect.value = "0";
    diffSelect.value = "6";
  }

  modal.classList.remove("hidden");
  modal.setAttribute("aria-hidden", "false");
  nameInput.focus();
}

function closeSavedRollModal() {
  const modal = document.getElementById("saved-roll-modal");
  if (!modal) return;
  modal.classList.add("hidden");
  modal.setAttribute("aria-hidden", "true");
  savedRollEditingId = null;
}

function initSavedRolls() {
  const addBtn = document.getElementById("saved-roll-add-btn");
  const form = document.getElementById("saved-roll-form");
  const closeBtn = document.getElementById("saved-roll-modal-close");
  const cancelBtn = document.getElementById("saved-roll-cancel");
  const modal = document.getElementById("saved-roll-modal");
  if (!addBtn || !form) return;

  addBtn.addEventListener("click", () => openSavedRollModal(null));
  closeBtn?.addEventListener("click", closeSavedRollModal);
  cancelBtn?.addEventListener("click", closeSavedRollModal);
  modal?.addEventListener("click", (e) => { if (e.target === modal) closeSavedRollModal(); });

  form.addEventListener("submit", (e) => {
    e.preventDefault();
    const name = document.getElementById("saved-roll-name").value.trim();
    if (!name) return;
    const pool1Attr = document.getElementById("saved-roll-pool1").value;
    const pool2Raw = document.getElementById("saved-roll-pool2").value;
    const modifier = parseInt(document.getElementById("saved-roll-mod").value) || 0;
    const difficulty = parseInt(document.getElementById("saved-roll-diff").value) || 6;

    // Parse specialty from pool2 value (format: "id-value|spec:SpecName")
    let pool2Attr = pool2Raw;
    let specialty = "";
    if (pool2Raw.includes("|spec:")) {
      const parts = pool2Raw.split("|spec:");
      pool2Attr = parts[0];
      specialty = parts[1];
    }

    if (savedRollEditingId !== null) {
      const roll = savedRolls.find(r => r.id === savedRollEditingId);
      if (roll) { roll.name = name; roll.pool1Attr = pool1Attr; roll.pool2Attr = pool2Attr; roll.modifier = modifier; roll.difficulty = difficulty; roll.specialty = specialty; }
    } else {
      savedRolls.push({ id: savedRollNextId++, name, pool1Attr, pool2Attr, modifier, difficulty, specialty });
    }

    closeSavedRollModal();
    renderSavedRolls();
    saveCharacterData();
  });
}

function getSavedRollsData() {
  return savedRolls.map(r => ({ id: r.id, name: r.name, pool1Attr: r.pool1Attr, pool2Attr: r.pool2Attr, modifier: r.modifier, difficulty: r.difficulty, specialty: r.specialty || "" }));
}

function loadSavedRollsFromJSON(characterData) {
  savedRolls = [];
  savedRollNextId = 1;
  if (characterData.savedRolls && Array.isArray(characterData.savedRolls)) {
    characterData.savedRolls.forEach(r => {
      const roll = { id: r.id || savedRollNextId, name: r.name || "", pool1Attr: r.pool1Attr || "", pool2Attr: r.pool2Attr || "", modifier: r.modifier || 0, difficulty: r.difficulty || 6, specialty: r.specialty || "" };
      savedRolls.push(roll);
      if (roll.id >= savedRollNextId) savedRollNextId = roll.id + 1;
    });
  }
  renderSavedRolls();
}

// Initialize on load
initSavedRolls();
renderSavedRolls();

// //////// Dock Tab Switching //////// //
const dockTabs = document.querySelectorAll('.dock-tab');
dockTabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const panelId = tab.getAttribute('data-panel');
    // Deactivate all tabs and panels
    dockTabs.forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.dock-panel').forEach(p => p.classList.remove('active'));
    // Activate clicked tab and its panel
    tab.classList.add('active');
    const panel = document.getElementById(panelId);
    if (panel) panel.classList.add('active');
  });
});
