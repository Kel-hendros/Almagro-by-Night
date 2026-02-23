(function initABNSheetBackgrounds(global) {
  const state = {
    items: [],
  };

  const deps = {
    save: null,
  };

  function configure(nextDeps = {}) {
    deps.save = typeof nextDeps.save === "function" ? nextDeps.save : null;
  }

  function persist() {
    if (deps.save) deps.save();
  }

  function refreshBackgroundDots(ratingEl, value) {
    ratingEl.querySelectorAll(".dot").forEach((dot) => {
      const dv = parseInt(dot.getAttribute("data-value"), 10);
      if (dv <= value) {
        dot.classList.add("filled");
      } else {
        dot.classList.remove("filled");
      }
    });
  }

  function renderBackgroundList() {
    const listEl = document.getElementById("background-list");
    if (!listEl) return;
    listEl.innerHTML = "";

    if (state.items.length === 0) {
      const empty = document.createElement("p");
      empty.className = "specialty-subtitle";
      empty.style.textAlign = "center";
      empty.style.margin = "16px 0";
      empty.textContent = "No hay trasfondos. Usa + para agregar.";
      listEl.appendChild(empty);
      return;
    }

    state.items.forEach((bg, idx) => {
      const item = document.createElement("div");
      item.className = "background-item";

      const row = document.createElement("div");
      row.className = "background-row";

      const titleBtn = document.createElement("button");
      titleBtn.className = "background-title-btn";
      titleBtn.type = "button";
      titleBtn.textContent = bg.name;
      titleBtn.addEventListener("click", () => {
        item.classList.toggle("open");
      });

      const ratingEl = document.createElement("div");
      ratingEl.className = "rating background-rating";
      for (let d = 1; d <= 5; d += 1) {
        const dot = document.createElement("span");
        dot.className = "dot";
        dot.setAttribute("data-value", String(d));
        if (d <= bg.rating) dot.classList.add("filled");
        dot.addEventListener("click", () => {
          if (bg.rating === d && d === 1) {
            bg.rating = 0;
          } else if (bg.rating === d) {
            bg.rating = d - 1;
          } else {
            bg.rating = d;
          }
          refreshBackgroundDots(ratingEl, bg.rating);
          persist();
        });
        ratingEl.appendChild(dot);
      }

      const editBtn = document.createElement("button");
      editBtn.className = "background-edit-btn";
      editBtn.type = "button";
      editBtn.innerHTML = "✎";
      editBtn.title = "Editar trasfondo";
      editBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        const isEditing = item.classList.contains("editing");
        if (isEditing) {
          item.classList.remove("editing", "open");
          return;
        }

        item.classList.add("editing", "open");
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

        editForm.addEventListener("submit", (eventSubmit) => {
          eventSubmit.preventDefault();
          const newName = nameInput.value.trim();
          if (!newName) return;
          bg.name = newName;
          bg.description = descInput.value.trim();
          persist();
          renderBackgroundList();
        });

        actions.append(saveBtn, cancelBtn);
        editForm.append(nameInput, descInput, actions);
        descEl.appendChild(editForm);
        nameInput.focus();
      });

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "background-delete-btn";
      deleteBtn.type = "button";
      deleteBtn.innerHTML = "✕";
      deleteBtn.title = "Eliminar trasfondo";
      deleteBtn.addEventListener("click", (event) => {
        event.stopPropagation();
        state.items.splice(idx, 1);
        renderBackgroundList();
        persist();
      });

      row.append(titleBtn, ratingEl, editBtn, deleteBtn);

      const descEl = document.createElement("div");
      descEl.className = "background-description";
      descEl.textContent = bg.description || "";

      item.append(row, descEl);
      listEl.appendChild(item);
    });
  }

  function init() {
    const toggleBtn = document.getElementById("background-add-toggle");
    const form = document.getElementById("background-add-form");
    const cancelBtn = document.getElementById("background-add-cancel");
    const nameInput = document.getElementById("background-name");
    const descInput = document.getElementById("background-description");

    if (!toggleBtn || !form) return;

    toggleBtn.addEventListener("click", () => {
      form.classList.toggle("hidden");
      if (!form.classList.contains("hidden") && nameInput) {
        nameInput.focus();
      }
    });

    if (cancelBtn) {
      cancelBtn.addEventListener("click", () => {
        if (nameInput) nameInput.value = "";
        if (descInput) descInput.value = "";
        form.classList.add("hidden");
      });
    }

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const name = nameInput ? nameInput.value.trim() : "";
      if (!name) return;
      const description = descInput ? descInput.value.trim() : "";
      state.items.push({ name, description, rating: 1 });
      if (nameInput) nameInput.value = "";
      if (descInput) descInput.value = "";
      form.classList.add("hidden");
      renderBackgroundList();
      persist();
    });
  }

  function serialize() {
    return state.items.map((bg) => ({
      name: bg.name,
      description: bg.description || "",
      rating: bg.rating,
    }));
  }

  function loadFromCharacterData(characterData) {
    state.items = [];

    if (characterData?.backgrounds && Array.isArray(characterData.backgrounds)) {
      characterData.backgrounds.forEach((bg) => {
        state.items.push({
          name: bg.name || "",
          description: bg.description || "",
          rating: bg.rating || 0,
        });
      });
    }

    renderBackgroundList();
  }

  global.ABNSheetBackgrounds = {
    configure,
    init,
    renderBackgroundList,
    refreshBackgroundDots,
    serialize,
    loadFromCharacterData,
  };
})(window);
