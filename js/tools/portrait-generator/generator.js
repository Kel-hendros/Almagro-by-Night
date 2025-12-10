import { GoogleGenAI } from "https://esm.run/@google/genai";

// --- Configuration ---
const CONFIG_URL = "js/tools/portrait-generator/prompt-config/config.json";
let PRESETS = [];
let BACKGROUNDS = [];
let SHOT_TYPES = [];
let SYSTEM_INSTRUCTION = "";

// --- State ---
let state = {
  apiKey: null,
  selectedPreset: null,
  selectedBackground: null,
  selectedShot: null,
  images: [], // { id, url, prompt, fullPrompt, presetName, backgroundName, timestamp }
  isGenerating: false,
  viewingImage: null,
};

// --- DOM Elements Cache ---
let els = {};

export async function initPortraitGenerator() {
  console.log("Portrait Generator initialized");

  // Cache elements
  els = {
    authScreen: document.getElementById("auth-screen"),
    authError: document.getElementById("auth-error"),
    inputApiKey: document.getElementById("input-api-key"),
    btnConnect: document.getElementById("btn-connect"),
    btnSkipAuth: document.getElementById("btn-skip-auth"),
    btnChangeKey: document.getElementById("btn-change-key"),

    presetList: document.getElementById("preset-list"),
    backgroundList: document.getElementById("background-list"),
    shotList: document.getElementById("shot-list"),

    inputDesc: document.getElementById("input-description"),
    selectAspect: document.getElementById("select-aspect"),

    btnGenerate: document.getElementById("btn-generate"),
    genError: document.getElementById("generation-error"),

    btnCopyGenerated: document.getElementById("btn-preview-prompt"),

    gallery: document.getElementById("gallery-container"),
    emptyState: document.getElementById("empty-state"),

    lightbox: document.getElementById("lightbox"),
    lightboxImg: document.getElementById("lightbox-img"),
    lightboxTitle: document.getElementById("lightbox-title"),
    lightboxPrompt: document.getElementById("lightbox-prompt"),
    lightboxDownload: document.getElementById("lightbox-download"),
    btnCloseLightbox: document.getElementById("btn-close-lightbox"),
    btnCopyPrompt: document.getElementById("btn-copy-prompt"),

    inputCustomArchetype: document.getElementById("input-custom-archetype"),
    inputCustomBackground: document.getElementById("input-custom-background"),
  };

  try {
    await loadConfig();
  } catch (e) {
    console.error("Failed to load configuration", e);
    if (els.presetList)
      els.presetList.innerHTML =
        "<p style='color:red'>Error cargando configuración.</p>";
    return;
  }

  // Restore State
  loadState();

  // Defaults if not restored/valid
  if (!state.selectedPreset && PRESETS.length)
    state.selectedPreset = PRESETS[0];
  if (!state.selectedBackground && BACKGROUNDS.length)
    state.selectedBackground = BACKGROUNDS[0];
  if (!state.selectedShot && SHOT_TYPES.length) {
    // Default to 'bust' (Medio Pecho) per user request, otherwise first available
    state.selectedShot =
      SHOT_TYPES.find((s) => s.id === "bust") || SHOT_TYPES[0];
  }

  // Initial Render
  renderPresets();
  renderBackgrounds();
  renderShots();
  renderGallery();
  checkAuth();

  // Events
  els.btnConnect.addEventListener("click", handleConnect);
  if (els.btnSkipAuth)
    els.btnSkipAuth.addEventListener("click", handleSkipAuth);
  els.btnChangeKey.addEventListener("click", resetKey);
  els.btnGenerate.addEventListener("click", generateImage);
  if (els.btnCopyGenerated) {
    els.btnCopyGenerated.addEventListener("click", copyGeneratedPrompt);
  }

  els.btnCloseLightbox.addEventListener("click", closeLightbox);
  els.btnCopyPrompt.addEventListener("click", copyPromptToClipboard);

  // Close lightbox on ESC
  document.addEventListener("keydown", handleGlobalKeydown);

  // Load Cloud Gallery
  fetchCloudGallery();
}

async function loadConfig() {
  const res = await fetch(CONFIG_URL);
  if (!res.ok) throw new Error("Could not fetch config.json");
  const config = await res.json();
  PRESETS = config.archetypes || [];
  BACKGROUNDS = config.backgrounds || [];
  SHOT_TYPES = config.shotTypes || [];
  SYSTEM_INSTRUCTION = config.systemInstruction || "";
}

function handleGlobalKeydown(e) {
  if (
    e.key === "Escape" &&
    els.lightbox &&
    !els.lightbox.classList.contains("hidden")
  ) {
    closeLightbox();
  }
}

// --- Persistence ---
function loadState() {
  const savedKey = localStorage.getItem("vtm_gen_api_key");
  if (savedKey) state.apiKey = savedKey;

  try {
    const savedImages = localStorage.getItem("vtm_gen_images");
    if (savedImages) {
      state.images = JSON.parse(savedImages);
    }
  } catch (e) {
    console.error("Error loading saved images", e);
  }
}

function saveImages() {
  localStorage.setItem("vtm_gen_images", JSON.stringify(state.images));
}

// --- Auth Logic ---
function checkAuth() {
  if (state.apiKey) {
    els.authScreen.classList.add("hidden");
    els.btnGenerate.classList.remove("key-missing");
    els.btnGenerate.title = "";
  } else {
    // If no key, we might be in "skipped" mode if the screen is hidden?
    // Actually simplicity: if no key and screen is hidden, user skipped.
    // If no key and screen is visible, user is deciding.
    if (els.authScreen.classList.contains("hidden")) {
      els.btnGenerate.classList.add("key-missing");
      els.btnGenerate.title = "Se requiere API Key para generar";
    }
  }
}

function handleSkipAuth() {
  els.authScreen.classList.add("hidden");
  els.btnGenerate.classList.add("key-missing");
  // Visual cue that generation is disabled/restricted
}

function handleConnect() {
  const key = els.inputApiKey.value.trim();
  if (!key) {
    els.authError.textContent = "Por favor ingresa una API Key.";
    els.authError.classList.add("visible");
    return;
  }
  state.apiKey = key;
  localStorage.setItem("vtm_gen_api_key", key);

  // Update UI properly using shared logic
  checkAuth();

  els.authError.classList.remove("visible");
}

function resetKey() {
  state.apiKey = null;
  localStorage.removeItem("vtm_gen_api_key");
  els.authScreen.classList.remove("hidden");
  els.inputApiKey.value = "";
}

// --- Generation Logic ---
async function generateImage() {
  const desc = els.inputDesc.value.trim();
  if (!desc) {
    showGenError("Por favor describe a tu personaje.");
    return;
  }

  els.btnGenerate.disabled = true;
  els.btnGenerate.innerText = "INVOCANDO...";
  els.genError.classList.remove("visible");

  try {
    const aspectRatio = els.selectAspect.value;

    // Safety check if configs are loaded
    if (
      !state.selectedPreset ||
      !state.selectedBackground ||
      !state.selectedShot
    ) {
      throw new Error("Configuración no cargada correctamente.");
    }

    const fullPrompt = constructFullPrompt(desc);

    // Ensure we have API key

    // Ensure we have API key
    if (!state.apiKey) {
      // If missing, show auth screen again
      els.authScreen.classList.remove("hidden");
      // Reset button state
      els.btnGenerate.disabled = false;
      els.btnGenerate.innerText = "INVOCAR RETRATO";
      els.authError.textContent =
        "Se requiere una API Key para generar imágenes.";
      els.authError.classList.add("visible");
      return;
    }

    const ai = new GoogleGenAI({ apiKey: state.apiKey });
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-image-preview",
      contents: { parts: [{ text: fullPrompt }] },
      config: {
        systemInstruction: SYSTEM_INSTRUCTION.replace(/\n/g, " "), // Sanitize newlines just in case
        imageConfig: {
          aspectRatio: aspectRatio,
          imageSize: "1024x1024", // Defaulting as resolution select is not in my UI yet, or could use "1024x1024"
        },
      },
    });

    // In @google/genai, the response is returned directly
    const result = response;
    console.log("Gemini Response:", result);

    let imageUrl = "";

    if (result.candidates && result.candidates[0]?.content?.parts) {
      for (const part of result.candidates[0].content.parts) {
        if (part.inlineData) {
          imageUrl = `data:image/png;base64,${part.inlineData.data}`;
          break;
        }
      }
    }

    if (!imageUrl) {
      // Fallback check for text error
      const textPart = result.candidates?.[0]?.content?.parts?.find(
        (p) => p.text
      );
      if (textPart) {
        throw new Error(
          "El modelo devolvió texto: " + textPart.text.substring(0, 100)
        );
      }
      throw new Error(
        "No se recibieron datos de imagen. Respuesta cruda: " +
          JSON.stringify(result)
      );
    }

    // Add to state
    const newImage = {
      id: crypto.randomUUID(),
      url: imageUrl,
      prompt: desc,
      fullPrompt: fullPrompt,
      presetName: state.selectedPreset.name,
      backgroundName: state.selectedBackground.name,
      timestamp: Date.now(),
    };

    state.images.unshift(newImage);
    saveImages();
    renderGallery();
  } catch (err) {
    console.error(err);
    let msg = err.message || "Error desconocido";
    if (msg.includes("403") || msg.includes("PERMISSION_DENIED")) {
      msg =
        "Error 403: Verifica que la facturación esté habilitada o que la API Key sea correcta.";
    }
    showGenError(msg);
  } finally {
    els.btnGenerate.disabled = false;
    els.btnGenerate.innerText = "INVOCAR RETRATO";
  }
}

function showGenError(msg) {
  els.genError.textContent = msg;
  els.genError.classList.add("visible");
}

// --- Rendering ---
function renderPresets() {
  if (!els.presetList) return;
  els.presetList.innerHTML = PRESETS.map(
    (p) => `
    <div onclick="window.vtmSelectPreset('${p.id}')" 
         class="option-card ${
           state.selectedPreset?.id === p.id ? "selected" : ""
         }">
       <span class="option-icon">${p.icon}</span>
       <span class="option-name">${p.name}</span>
       <div class="option-desc">${p.description}</div>
    </div>
  `
  ).join("");
}

function renderBackgrounds() {
  if (!els.backgroundList) return;
  els.backgroundList.innerHTML = BACKGROUNDS.map(
    (b) => `
    <div onclick="window.vtmSelectBackground('${b.id}')" 
         class="option-card ${
           state.selectedBackground?.id === b.id ? "selected" : ""
         }">
       <span class="option-icon">${b.icon}</span>
       <span class="option-name">${b.name}</span>
       <div class="option-desc">${b.description}</div>
    </div>
  `
  ).join("");
}

function renderShots() {
  if (!els.shotList) return;
  els.shotList.innerHTML = SHOT_TYPES.map(
    (s) => `
     <button onclick="window.vtmSelectShot('${s.id}')"
        class="shot-btn ${state.selectedShot?.id === s.id ? "selected" : ""}">
        ${s.name}
     </button>
  `
  ).join("");
}

function renderGallery() {
  if (!els.gallery) return;
  if (state.images.length === 0) {
    els.gallery.innerHTML = "";
    els.emptyState.classList.remove("hidden");
    return;
  }

  els.emptyState.classList.add("hidden");

  els.gallery.innerHTML = state.images
    .map(
      (img) => `
    <div onclick="window.vtmOpenLightbox('${img.id}')" class="gallery-item">
       <img src="${img.url}" class="gallery-img" loading="lazy" />
       <div class="gallery-overlay">
         <span style="color:#dca; font-size:0.7rem; font-weight:bold; text-transform:uppercase;">${img.presetName}</span>
         <p class="gallery-prompt">"${img.prompt}"</p>
         <div class="gallery-actions">
           <button id="btn-save-${img.id}" onclick="event.stopPropagation(); window.vtmSaveToCloud('${img.id}')">☁️ Guardar</button>
           <button onclick="event.stopPropagation(); window.vtmDeleteImage('${img.id}')">Borrar</button>
         </div>
       </div>
    </div>
  `
    )
    .join("");
}

// --- Global Handlers (for onclick attributes) ---
window.vtmSelectPreset = (id) => {
  state.selectedPreset = PRESETS.find((p) => p.id === id);
  renderPresets();
};
window.vtmSelectBackground = (id) => {
  state.selectedBackground = BACKGROUNDS.find((b) => b.id === id);
  renderBackgrounds();
};
window.vtmSelectShot = (id) => {
  state.selectedShot = SHOT_TYPES.find((s) => s.id === id);
  renderShots();
};
window.vtmDeleteImage = (id) => {
  if (!confirm("¿Eliminar este retrato?")) return;
  state.images = state.images.filter((img) => img.id !== id);
  saveImages();
  renderGallery();
  if (state.viewingImage?.id === id) closeLightbox();
};
window.vtmOpenLightbox = (id) => {
  const img = state.images.find((i) => i.id === id);
  if (!img) return;
  state.viewingImage = img;

  els.lightboxImg.src = img.url;
  els.lightboxTitle.textContent = `${img.presetName} - ${img.backgroundName}`;
  els.lightboxPrompt.textContent = `"${img.prompt}"`;
  els.lightboxDownload.href = img.url;
  els.lightboxDownload.download = `vtm-portrait-${img.id}.png`;
  els.btnCopyPrompt.innerText = "COPIAR PROMPT";

  els.lightbox.classList.remove("hidden");
};

function closeLightbox() {
  els.lightbox.classList.add("hidden");
  state.viewingImage = null;
}

function copyPromptToClipboard() {
  if (!state.viewingImage) return;
  const txt = state.viewingImage.fullPrompt || state.viewingImage.prompt;
  navigator.clipboard.writeText(txt).then(() => {
    els.btnCopyPrompt.innerText = "¡COPIADO!";
  });
}

// --- Cloud Logic ---

async function saveImageToCloud(id) {
  const img = state.images.find((i) => i.id === id);
  if (!img) return;

  if (!confirm("¿Guardar esta imagen en la galería pública?")) return;

  const name = prompt("Dale un nombre a este Vástago (opcional):");
  if (name === null) return; // Cancelled

  const btn = document.getElementById(`btn-save-${id}`);
  if (btn) btn.innerText = "⏳";

  try {
    // 1. Convert Data URL to Blob
    const fetchRes = await fetch(img.url);
    const blob = await fetchRes.blob();

    // 2. Upload
    const fileName = `${Date.now()}-${crypto.randomUUID()}.png`;
    const { data: uploadData, error: uploadError } = await supabase.storage
      .from("generated-characters")
      .upload(fileName, blob);

    if (uploadError) throw uploadError;

    // 3. Get Public URL
    const {
      data: { publicUrl },
    } = supabase.storage.from("generated-characters").getPublicUrl(fileName);

    // 4. Insert DB Record
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) throw new Error("No hay sesión activa");

    const { error: dbError } = await supabase.from("generated_images").insert({
      user_id: session.user.id,
      image_url: publicUrl,
      prompt: img.prompt,
      name: name || null,
      metadata: {
        fullPrompt: img.fullPrompt,
        preset: img.presetName,
        background: img.backgroundName,
      },
    });

    if (dbError) throw dbError;

    alert("Imagen guardada en la nube con éxito.");
    fetchCloudGallery(); // Refresh cloud gallery
  } catch (e) {
    console.error("Error saving to cloud:", e);
    alert("Error al guardar: " + e.message);
  } finally {
    if (btn) btn.innerText = "☁️ Guardar";
  }
}

async function fetchCloudGallery() {
  const cloudContainer = document.getElementById("cloud-gallery-container");
  const cloudEmpty = document.getElementById("cloud-empty-state");
  if (!cloudContainer) return;

  // reset
  cloudContainer.innerHTML = '<p style="color:#666">Cargando...</p>';

  // Check session first to ensure RLS doesn't block us
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    console.log("fetchCloudGallery: No active session, waiting...");
    // Simple retry since auth might be restoring
    setTimeout(fetchCloudGallery, 1000);
    return;
  }

  const { data, error } = await supabase
    .from("generated_images")
    .select("*")
    .eq("user_id", session.user.id)
    .order("created_at", { ascending: false })
    .limit(20);

  if (error) {
    console.error("Error fetching cloud gallery", error);
    cloudContainer.innerHTML =
      '<p style="color:red">Error cargando galería.</p>';
    return;
  }

  if (!data || data.length === 0) {
    cloudContainer.innerHTML = "";
    if (cloudEmpty) cloudEmpty.classList.remove("hidden");
    return;
  }

  if (cloudEmpty) cloudEmpty.classList.add("hidden");

  cloudContainer.innerHTML = data
    .map(
      (dbImg) => `
        <div class="gallery-item" onclick="window.vtmOpenCloudLightbox('${
          dbImg.id
        }')">
           <img src="${dbImg.image_url}" class="gallery-img" loading="lazy" />
           <div class="gallery-overlay">
             <span style="color:#dca; font-size:0.7rem; font-weight:bold; text-transform:uppercase;">${
               dbImg.name || dbImg.metadata?.preset || "Vástago"
             }</span>
             <p class="gallery-prompt">"${dbImg.prompt}"</p>
             <div class="gallery-actions" style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
                <button onclick="event.stopPropagation(); window.vtmCopyCloudUrl('${
                  dbImg.image_url
                }')" title="Copiar URL">🔗</button>
                <button onclick="event.stopPropagation(); window.vtmCopyCloudPrompt('${
                  dbImg.id
                }')" title="Copiar Prompt Completo">📝 Prompt</button>
                <button onclick="event.stopPropagation(); window.vtmDeleteCloudImage('${
                  dbImg.id
                }', '${
        dbImg.image_url
      }')" title="Borrar de la Nube" style="border-color:red; color:red;">🗑️</button>
             </div>
           </div>
        </div>
    `
    )
    .join("");

  // Cache data for prompt copying
  window.vtmCloudData = data;
}

window.vtmSaveToCloud = saveImageToCloud;

// Cloud Actions
window.vtmDeleteCloudImage = async (id, url) => {
  if (
    !confirm(
      "¿CONFIRMAR BORRADO DE LA NUBE?\nEsto eliminará la imagen de la base de datos y el storage."
    )
  )
    return;

  try {
    // 1. Delete from DB
    const { error: dbError } = await supabase
      .from("generated_images")
      .delete()
      .eq("id", id);
    if (dbError) throw dbError;

    // 2. Delete from Storage (Try to parse filename)
    // URL format: .../generated-characters/filename.png
    const parts = url.split("/generated-characters/");
    if (parts.length > 1) {
      const fileName = parts[1];
      const { error: storageError } = await supabase.storage
        .from("generated-characters")
        .remove([fileName]);
      if (storageError)
        console.warn("Storage delete error (might be ignored):", storageError);
    }

    fetchCloudGallery();
    showToast("Imagen eliminada de la nube");
  } catch (e) {
    console.error(e);
    alert("Error al borrar: " + e.message);
  }
};

window.vtmCopyCloudUrl = (url) => {
  navigator.clipboard
    .writeText(url)
    .then(() => showToast("URL copiada al portapapeles"));
};

window.vtmCopyCloudPrompt = (id) => {
  const item = window.vtmCloudData.find((i) => i.id === id);
  if (!item) return;

  // Use the full prompt stored in metadata, or fallback to the simple prompt
  const userPrompt = item.metadata?.fullPrompt || item.prompt || "";
  const finalCopyText = `--- SYSTEM INSTRUCTION ---\n${SYSTEM_INSTRUCTION}\n\n--- USER PROMPT ---\n${userPrompt}`;

  navigator.clipboard
    .writeText(finalCopyText)
    .then(() => showToast("Prompt completo (+System) copiado"));
};

window.vtmOpenCloudLightbox = (id) => {
  const item = window.vtmCloudData?.find((i) => i.id === id);

  if (!item) {
    console.error("Image not found in local cloud cache", id);
    return;
  }

  // We set state.viewingImage so copyPromptToClipboard can work (if compatible)
  // or we just handle it manually. Let's see if we can shim it.
  state.viewingImage = {
    id: item.id,
    url: item.image_url,
    prompt: item.prompt,
    fullPrompt: item.metadata?.fullPrompt || item.prompt,
    presetName: item.metadata?.preset || "Vástago",
    backgroundName: item.metadata?.background || "Nube",
  };

  els.lightboxImg.src = item.image_url;
  els.lightboxTitle.textContent = `${item.name || "Vástago"} - ${
    item.metadata?.preset || "Generado"
  }`;
  els.lightboxPrompt.textContent = `"${item.prompt}"`;
  els.lightboxDownload.href = item.image_url;
  els.lightboxDownload.download = `vtm-cloud-${item.id}.png`;

  els.btnCopyPrompt.innerText = "COPIAR PROMPT";
  els.lightbox.classList.remove("hidden");
};

function constructFullPrompt(desc) {
  if (
    !state.selectedPreset ||
    !state.selectedBackground ||
    !state.selectedShot
  ) {
    return "";
  }

  // Overrides
  const overrideArchetype = els.inputCustomArchetype?.value?.trim();
  const overrideBackground = els.inputCustomBackground?.value?.trim();

  const archetypePrompt = overrideArchetype || state.selectedPreset.stylePrompt;
  const backgroundPrompt =
    overrideBackground || state.selectedBackground.stylePrompt;

  // Add notes to prompt if overrides are used, to clarify intent to the model?
  // Actually the template is generic enough.

  return `
    Create a photorealistic, cinematic image based on the following specifications:

    1. SUBJECT DESCRIPTION (Primary Focus):
    "${desc}"
    
    2. SUBJECT ARCHETYPE (Style & Vibe):
    ${archetypePrompt}
    
    3. CAMERA FRAMING (Strict):
    ${state.selectedShot.stylePrompt}
    
    4. BACKGROUND ENVIRONMENT (Strict):
    ${backgroundPrompt}
    
    5. GLOBAL STYLE:
    Vampire: The Masquerade, World of Darkness, 8k resolution, highly detailed, dramatic lighting, dark atmosphere.

    INSTRUCTIONS: 
    - Merge the SUBJECT DESCRIPTION with the SUBJECT ARCHETYPE. 
    - The background must strictly match the BACKGROUND ENVIRONMENT. 
    - If the background is "Solid black" or "Void", do NOT render any walls, windows, or structures.
    `;
}

function copyGeneratedPrompt() {
  const desc = els.inputDesc.value.trim();

  try {
    const userPrompt = constructFullPrompt(desc || "[Sin descripción]");
    if (!userPrompt)
      throw new Error("Faltan selecciones (Arquetipo, Fondo, etc)");

    const finalCopyText = `--- SYSTEM INSTRUCTION ---\n${SYSTEM_INSTRUCTION}\n\n--- USER PROMPT ---\n${userPrompt}`;

    navigator.clipboard.writeText(finalCopyText).then(() => {
      showToast("Prompt completo (+System) copiado");
    });
  } catch (e) {
    showGenError(e.message);
  }
}

// --- Toast Helper ---
function showToast(msg) {
  let toast = document.getElementById("vtm-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.id = "vtm-toast";
    toast.className = "vtm-toast";
    document.body.appendChild(toast);
  }

  toast.textContent = msg;
  toast.classList.add("visible");

  // Clear previous timeout if exists (optional refinement but simple timeout works for now)
  setTimeout(() => {
    toast.classList.remove("visible");
  }, 3000);
}

// ... existing code ...
