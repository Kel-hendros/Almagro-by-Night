(function initABNSheetSpecialties(global) {
  const state = {
    currentOverlay: null,
    currentModalController: null,
  };

  const deps = {
    createModalController: null,
    onSave: null,
    onUseSpecialtyInDiceRoller: null,
  };

  function configure(nextDeps = {}) {
    deps.createModalController =
      typeof nextDeps.createModalController === "function"
        ? nextDeps.createModalController
        : null;
    deps.onSave = typeof nextDeps.onSave === "function" ? nextDeps.onSave : null;
    deps.onUseSpecialtyInDiceRoller =
      typeof nextDeps.onUseSpecialtyInDiceRoller === "function"
        ? nextDeps.onUseSpecialtyInDiceRoller
        : null;
  }

  function save() {
    if (typeof deps.onSave === "function") deps.onSave();
  }

  function closeModal() {
    if (!state.currentOverlay) return;
    if (state.currentModalController?.destroy) {
      state.currentModalController.destroy();
    }
    state.currentModalController = null;
    state.currentOverlay.remove();
    state.currentOverlay = null;
  }

  function getSpecialties(attributeId) {
    const hiddenInput = document.getElementById(`${attributeId}-value`);
    if (!hiddenInput) return [];
    const raw = hiddenInput.getAttribute("data-specialties");
    if (!raw) return [];
    try {
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  function setSpecialties(attributeId, specialties) {
    const hiddenInput = document.getElementById(`${attributeId}-value`);
    if (!hiddenInput) return;
    hiddenInput.setAttribute("data-specialties", JSON.stringify(specialties));
  }

  function addSpecialty(attributeId, specialtyName) {
    const specialties = getSpecialties(attributeId);
    if (!specialties.includes(specialtyName)) {
      specialties.push(specialtyName);
      setSpecialties(attributeId, specialties);
    }
  }

  function removeSpecialty(attributeId, specialtyName) {
    const filtered = getSpecialties(attributeId).filter((s) => s !== specialtyName);
    setSpecialties(attributeId, filtered);
  }

  function defaultUseSpecialtyInDiceRoller(attributeId, specialtyName) {
    const formGroup = document
      .getElementById(`${attributeId}-value`)
      ?.closest(".form-group");
    const label = formGroup?.querySelector("label");
    if (!label) return;

    label.click();
    const specialtyCheckbox = document.querySelector("#specialty");
    if (specialtyCheckbox) specialtyCheckbox.checked = true;

    const specialtyLabel = document.querySelector('label[for="specialty"]');
    if (specialtyLabel) {
      specialtyLabel.textContent = `Usar Especialidad (${specialtyName})`;
    }
  }

  function useSpecialtyInDiceRoller(attributeId, specialtyName) {
    if (typeof deps.onUseSpecialtyInDiceRoller === "function") {
      deps.onUseSpecialtyInDiceRoller(attributeId, specialtyName);
      return;
    }
    defaultUseSpecialtyInDiceRoller(attributeId, specialtyName);
  }

  function updateIconVisibility(attributeId) {
    const hiddenInput = document.getElementById(`${attributeId}-value`);
    const icon = document.querySelector(`.specialty-icon[data-for="${attributeId}"]`);
    if (!hiddenInput || !icon) return;

    const value = parseInt(hiddenInput.value, 10) || 0;
    icon.style.display = value > 3 ? "inline-block" : "none";
  }

  function updateAllIconVisibility() {
    document.querySelectorAll(".form-group.attribute").forEach((formGroup) => {
      const hiddenInput = formGroup.querySelector('input[type="hidden"]');
      if (!hiddenInput) return;
      const attributeId = hiddenInput.id.replace("-value", "");
      updateIconVisibility(attributeId);
    });
  }

  function openModal(attributeId, iconElement) {
    closeModal();

    const hiddenInput = document.getElementById(`${attributeId}-value`);
    if (!hiddenInput) return;

    const specialties = getSpecialties(attributeId);
    const currentValue = parseInt(hiddenInput.value, 10) || 0;
    const maxSpecialties = Math.max(0, currentValue - 3);
    const formGroup = hiddenInput.closest(".form-group");
    const attrName = formGroup?.querySelector("label")?.textContent?.trim() || attributeId;

    const overlay = document.createElement("div");
    overlay.className = "specialty-modal";
    overlay.setAttribute("data-for", attributeId);

    const card = document.createElement("div");
    card.className = "specialty-modal-card";

    const header = document.createElement("div");
    header.className = "specialty-modal-header";

    const title = document.createElement("h2");
    title.textContent = attrName;

    const closeBtn = document.createElement("button");
    closeBtn.className = "btn-modal-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Cerrar");
    closeBtn.innerHTML = '<i data-lucide="x"></i>';
    closeBtn.addEventListener("click", closeModal);

    header.appendChild(title);
    header.appendChild(closeBtn);
    card.appendChild(header);

    const subtitle = document.createElement("p");
    subtitle.className = "specialty-subtitle";
    subtitle.textContent =
      specialties.length > 0
        ? "Click en una especialidad para tirar con bonificador."
        : "Todavía no tiene especialidades.";
    card.appendChild(subtitle);

    if (specialties.length > 0) {
      const list = document.createElement("div");
      list.className = "specialty-list";

      specialties.forEach((specialtyName) => {
        const item = document.createElement("div");
        item.className = "specialty-item";

        const rollBtn = document.createElement("button");
        rollBtn.className = "specialty-roll-action";
        rollBtn.type = "button";
        rollBtn.textContent = specialtyName;
        rollBtn.addEventListener("click", () => {
          useSpecialtyInDiceRoller(attributeId, specialtyName);
          closeModal();
        });

        const deleteBtn = document.createElement("button");
        deleteBtn.className = "btn-icon btn-icon--danger specialty-delete-action";
        deleteBtn.type = "button";
        deleteBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        deleteBtn.setAttribute("aria-label", "Eliminar especialidad");
        deleteBtn.title = "Eliminar";
        deleteBtn.addEventListener("click", (event) => {
          event.stopPropagation();
          removeSpecialty(attributeId, specialtyName);
          updateIconVisibility(attributeId);
          save();
          closeModal();
          openModal(attributeId, iconElement);
        });

        item.appendChild(rollBtn);
        item.appendChild(deleteBtn);
        list.appendChild(item);
      });

      card.appendChild(list);
    }

    if (specialties.length < maxSpecialties) {
      const addBtn = document.createElement("button");
      addBtn.className = "specialty-add-action";
      addBtn.type = "button";
      addBtn.textContent = "+ Agregar especialidad";

      addBtn.addEventListener("click", () => {
        const addRow = document.createElement("div");
        addRow.className = "specialty-add-row";

        const input = document.createElement("input");
        input.type = "text";
        input.className = "specialty-add-input";
        input.placeholder = "Nueva especialidad...";
        input.maxLength = 40;

        const confirmBtn = document.createElement("button");
        confirmBtn.className = "specialty-add-confirm";
        confirmBtn.type = "button";
        confirmBtn.textContent = "+";

        function doAdd() {
          const name = input.value.trim();
          if (!name) return;
          addSpecialty(attributeId, name);
          updateIconVisibility(attributeId);
          save();
          closeModal();
          openModal(attributeId, iconElement);
        }

        confirmBtn.addEventListener("click", doAdd);
        input.addEventListener("keydown", (event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            doAdd();
          }
        });

        addRow.appendChild(input);
        addRow.appendChild(confirmBtn);
        addBtn.replaceWith(addRow);
        input.focus();
      });

      card.appendChild(addBtn);
    } else if (maxSpecialties > 0) {
      const maxMsg = document.createElement("p");
      maxMsg.className = "specialty-subtitle";
      maxMsg.style.textAlign = "center";
      maxMsg.style.marginTop = "6px";
      maxMsg.textContent = `Máximo alcanzado (${maxSpecialties})`;
      card.appendChild(maxMsg);
    }

    overlay.appendChild(card);
    document.body.appendChild(overlay);
    if (global.lucide?.createIcons) global.lucide.createIcons();

    state.currentOverlay = overlay;
    state.currentModalController = deps.createModalController
      ? deps.createModalController({
          overlay,
          closeButtons: [closeBtn],
        })
      : null;

    if (state.currentModalController?.open) {
      state.currentModalController.open();
    }
  }

  function initializeContainers() {
    document.querySelectorAll(".form-group.attribute").forEach((formGroup) => {
      const hiddenInput = formGroup.querySelector('input[type="hidden"]');
      if (!hiddenInput) return;

      const attributeId = hiddenInput.id.replace("-value", "");
      const rating = formGroup.querySelector(".rating");
      if (!rating) return;
      if (formGroup.querySelector(`.specialty-icon[data-for="${attributeId}"]`)) return;

      const specialtyIcon = document.createElement("span");
      specialtyIcon.className = "specialty-icon";
      specialtyIcon.innerHTML = "●";
      specialtyIcon.title = "Ver/editar especialidades";
      specialtyIcon.style.display = "none";
      specialtyIcon.setAttribute("data-for", attributeId);

      rating.parentNode.insertBefore(specialtyIcon, rating);
      specialtyIcon.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        openModal(attributeId, specialtyIcon);
      });
    });
  }

  global.ABNSheetSpecialties = {
    configure,
    initializeContainers,
    openModal,
    closeModal,
    getSpecialties,
    setSpecialties,
    addSpecialty,
    removeSpecialty,
    useSpecialtyInDiceRoller,
    updateIconVisibility,
    updateAllIconVisibility,
  };
})(window);
