document.addEventListener("DOMContentLoaded", () => {
  const fab = document.getElementById("ghoul-fab");
  const widget = document.getElementById("ghoul-widget");
  const searchInput = document.getElementById("ghoul-search-input");
  const resultsList = document.getElementById("ghoul-results");
  const modalOverlay = document.getElementById("ghoul-modal-overlay");
  const modalContent = document.getElementById("ghoul-modal-content");
  const modalClose = document.getElementById("ghoul-modal-close");
  const modalTitle = document.getElementById("ghoul-modal-title");
  const modalBody = document.getElementById("ghoul-markdown-body");

  let knowledgeBaseIndex = [];

  // 6. Dynamic Base Path for multiple pages
  // 6. Dynamic Base Path for multiple pages
  function getBasePath() {
    // If we are in /characterSheets/, we need to go up one level
    if (window.location.pathname.toLowerCase().includes("/charactersheets/")) {
      return "../";
    }
    return "";
  }

  // 1. Fetch Index
  async function fetchIndex() {
    try {
      const basePath = getBasePath();
      const response = await fetch(`${basePath}knowledge_base/index.json`);
      if (!response.ok) throw new Error("Failed to load index");
      knowledgeBaseIndex = await response.json();
      console.log("Ghoul: Index loaded", knowledgeBaseIndex);
    } catch (error) {
      console.error("Ghoul: Error loading index", error);
      resultsList.innerHTML =
        '<li class="ghoul-result-item">Error cargando la base de conocimientos.</li>';
    }
  }

  // 2. Toggle Widget
  fab.addEventListener("click", () => {
    const isActive = widget.classList.contains("active");
    if (isActive) {
      widget.classList.remove("active");
    } else {
      widget.classList.add("active");
      searchInput.focus();
      if (knowledgeBaseIndex.length === 0) {
        fetchIndex();
      }
    }
  });

  // 3. Search Logic
  searchInput.addEventListener("input", (e) => {
    const query = e.target.value.toLowerCase();
    if (query.length < 2) {
      renderResults([]); // Clear or show minimal results
      return;
    }

    const filtered = knowledgeBaseIndex.filter((item) => {
      const inTitle = item.title.toLowerCase().includes(query);
      const inTags =
        item.tags && item.tags.some((tag) => tag.toLowerCase().includes(query));
      return inTitle || inTags;
    });

    renderResults(filtered);
  });

  function renderResults(items) {
    resultsList.innerHTML = "";
    if (items.length === 0) {
      const li = document.createElement("li");
      li.className = "ghoul-result-item";
      li.textContent = "Sin resultados...";
      resultsList.appendChild(li);
      return;
    }

    items.forEach((item) => {
      const li = document.createElement("li");
      li.className = "ghoul-result-item";

      const titleSpan = document.createElement("span");
      titleSpan.className = "ghoul-result-title";
      titleSpan.textContent = item.title;

      const metaSpan = document.createElement("span");
      metaSpan.className = "ghoul-result-meta";
      metaSpan.textContent = item.category || "General";

      li.appendChild(titleSpan);
      li.appendChild(metaSpan);

      li.addEventListener("click", () => {
        openArticle(item);
      });

      resultsList.appendChild(li);
    });
  }

  // 4. Open Article (Large Modal)
  async function openArticle(item) {
    // Close widget (optional, maybe keep it open?) - User said "opens a modal", usually obscures widget.
    // Let's close widget to be clean or just z-index over it.
    // widget.classList.remove('active');

    modalOverlay.classList.add("active");
    modalBody.innerHTML = "<p>Cargando...</p>";
    modalTitle.textContent = "Tu ghoul sabe esto:";

    try {
      const basePath = getBasePath();
      const response = await fetch(`${basePath}knowledge_base/${item.file}`);
      if (!response.ok)
        throw new Error(
          `File not found: ${response.status} ${response.statusText}`
        );
      const text = await response.text();

      let markdownContent = text;

      // Simple frontmatter extraction
      if (text.startsWith("---")) {
        const endFrontmatter = text.indexOf("---", 3);
        if (endFrontmatter !== -1) {
          markdownContent = text.substring(endFrontmatter + 3).trim();
        }
      }

      // Pre-process custom links: (Text[Path]) -> [Text](Path)
      markdownContent = markdownContent.replace(
        /\(([^)]+)\[([^\]]+)\]\)/g,
        "[$1]($2)"
      );

      modalBody.innerHTML = marked.parse(markdownContent);

      // Add click handlers for internal links
      const links = modalBody.querySelectorAll("a");
      links.forEach((link) => {
        const href = link.getAttribute("href");
        // Check if it's an internal link (starts with / or ends with .md)
        if (href && (href.startsWith("/") || href.endsWith(".md"))) {
          link.addEventListener("click", (e) => {
            e.preventDefault();
            // Normalize path: remove leading slash to make it relative to knowledge_base root
            let targetFile = href;
            if (targetFile.startsWith("/")) {
              targetFile = targetFile.substring(1);
            }
            // Navigate to the article
            openArticle({ file: targetFile, title: link.textContent });
          });
        }
      });
    } catch (error) {
      console.error("Error loading article:", error);
      const basePath = getBasePath();
      // Calculate attempts to explain to user
      const attemptedUrl = `${basePath}knowledge_base/${item.file}`;
      modalBody.innerHTML = `
        <div style="padding: 1rem; color: #ff6b6b;">
            <p><strong>Error al cargar el contenido.</strong></p>
            <p style="font-family: monospace; background: rgba(0,0,0,0.3); padding: 0.5rem;">Intento de URL: ${attemptedUrl}</p>
            <p>Detalle: ${error.message}</p>
        </div>
      `;
    }
  }

  // 5. Close Modal
  modalClose.addEventListener("click", () => {
    modalOverlay.classList.remove("active");
  });

  modalOverlay.addEventListener("click", (e) => {
    if (e.target === modalOverlay) {
      modalOverlay.classList.remove("active");
    }
  });

  // 6. Keyboard Accessibility (ESC & Enter)
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      // Priority 1: Close Modal if open
      if (modalOverlay.classList.contains("active")) {
        modalOverlay.classList.remove("active");
        return;
      }
      // Priority 2: Close Widget if open
      if (widget.classList.contains("active")) {
        widget.classList.remove("active");
      }
    }
  });

  searchInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") {
      e.preventDefault(); // Prevent default form submission if any
      const firstResult = resultsList.querySelector(".ghoul-result-item");

      // Ensure there is a result and it's not the "No results" message
      if (
        firstResult &&
        firstResult.textContent !== "Sin resultados..." &&
        firstResult.textContent !== "Error cargando la base de conocimientos."
      ) {
        firstResult.click();
      }
    }
  });
  // 7. Multiple Ghouls Logic
  const GHOULS = {
    igor: {
      name: "Igor",
      idle: "../images/igor-idle.png",
      hover: "../images/igor-hover.png",
    },
    loba: {
      name: "La Loba",
      idle: "../images/laloba-idle.png",
      hover: "../images/laloba-hover.png",
    },
    pierre: {
      name: "Pierre",
      idle: "../images/pierre-idle.png",
      hover: "../images/pierre-hover.png",
    },
    bruto: {
      name: "Bruto",
      idle: "../images/bruto-idle.png",
      hover: "../images/bruto-hover.png",
    },
    trauco: {
      name: "Trauco",
      idle: "../images/trauco-idle.png",
      hover: "../images/trauco-hover.png",
    },
  };

  const selectedGhoulInput = document.getElementById("selectedGhoul");
  const changeGhoulBtn = document.getElementById("ghoul-change-btn");
  const ghoulSelectionModal = document.getElementById(
    "ghoul-selection-modal-overlay"
  );
  const ghoulSelectionClose = document.getElementById("ghoul-selection-close");
  const ghoulSelectionList = document.getElementById("ghoul-selection-list");

  function setGhoul(key) {
    const ghoul = GHOULS[key];
    if (!ghoul) return;

    // Update CSS variables
    document.documentElement.style.setProperty(
      "--ghoul-idle",
      `url('${ghoul.idle}')`
    );
    document.documentElement.style.setProperty(
      "--ghoul-hover",
      `url('${ghoul.hover}')`
    );

    // Update FAB size hack: Loba is same size (61x100) as Igor, so styles valid.

    // Update Input
    selectedGhoulInput.value = key;

    // Trigger change event so characterSheets/script.js knows to autosave if it listens?
    // script.js listens to inputs change event.
    selectedGhoulInput.dispatchEvent(new Event("change"));
  }

  function openGhoulSelection() {
    ghoulSelectionList.innerHTML = "";
    Object.keys(GHOULS).forEach((key) => {
      const ghoul = GHOULS[key];
      const div = document.createElement("div");
      div.className = `ghoul-option ${
        selectedGhoulInput.value === key ? "selected" : ""
      }`;

      const img = document.createElement("img");
      img.src = ghoul.idle;

      const span = document.createElement("span");
      span.textContent = ghoul.name;

      div.appendChild(img);
      div.appendChild(span);

      div.addEventListener("click", () => {
        setGhoul(key);
        ghoulSelectionModal.classList.remove("active");
        // Re-open widget? User might want to chat immediately.
        // widget.classList.add("active");
      });

      ghoulSelectionList.appendChild(div);
    });
    ghoulSelectionModal.classList.add("active");
  }

  if (changeGhoulBtn) {
    changeGhoulBtn.addEventListener("click", () => {
      // Close widget temporarily or keep open?
      // Better to close widget to focus on modal?
      // widget.classList.remove("active");
      openGhoulSelection();
    });
  }

  if (ghoulSelectionClose) {
    ghoulSelectionClose.addEventListener("click", () => {
      ghoulSelectionModal.classList.remove("active");
    });
  }

  if (ghoulSelectionModal) {
    ghoulSelectionModal.addEventListener("click", (e) => {
      if (e.target === ghoulSelectionModal) {
        ghoulSelectionModal.classList.remove("active");
      }
    });
  }

  // Initialize on load
  // Watch for changes from script.js (when loading JSON)
  // We can use MutationObserver or just poll.
  // But script.js sets input.value which doesn't trigger 'change' event.
  // We can rely on a periodic check or specialized event.
  // Simplest for now: check on startup (defaults to Igor).
  // AND add a MutationObserver on value attribute? value property doesn't trigger attribute change.
  // We can patch the input value setter, but that's intrusive.
  // Valid strategy: characterSheets/script.js calls updateAll() after loading.
  // We can hook into that if we exported a function, but we are isolated modules (mostly).
  // Let's polling for the value change purely for initialization from DB load?
  // No, `script.js` runs `loadCharacterFromJSON` on `window.onload`.
  // This `DOMContentLoaded` runs earlier or parallel.
  // Let's add an interval check for the first few seconds?
  // Or better: Listen to a custom event 'characterLoaded'.
  // Since I can edit `script.js`, I'll dispatch 'characterLoaded' there. For now let's Initialize with current value.

  if (selectedGhoulInput && selectedGhoulInput.value) {
    setGhoul(selectedGhoulInput.value);
  }

  // Monitor for changes (if other scripts update it)
  // Since we are editing script.js, we will make sure it updates UI there or here.
  // Let's expose a global for simplicity? globalForGhoul
  window.updateGhoulVisuals = (key) => {
    setGhoul(key);
  };
});
