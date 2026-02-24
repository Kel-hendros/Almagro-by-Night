(function initChronicleDetailHeader(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});
  const service = () => ns.service;

  async function populate({ chronicleId, chronicle, isNarrator }) {
    const nameEl = document.getElementById("chronicle-name");
    const descEl = document.getElementById("chronicle-description");
    if (!nameEl || !descEl) return;

    nameEl.textContent = chronicle.name;

    if (chronicle.description) {
      descEl.textContent = chronicle.description;
      descEl.classList.remove("empty");
    } else {
      descEl.textContent = "Sin descripción";
      descEl.classList.add("empty");
    }

    const statusBadge = document.getElementById("chronicle-status-badge");
    if (statusBadge && chronicle.status === "archived") {
      statusBadge.textContent = "Archivada";
      statusBadge.className = "cd-badge cd-badge--archived";
    }

    const narratorName = await service().getPlayerNameById(chronicle.creator_id);
    const narratorEl = document.getElementById("chronicle-narrator");
    if (narratorEl) narratorEl.textContent = `Narrador: ${narratorName || "—"}`;

    if (!isNarrator) return;

    nameEl.classList.add("cd-editable");
    nameEl.addEventListener("click", () => {
      const current = nameEl.textContent;
      const input = document.createElement("input");
      input.type = "text";
      input.value = current;
      input.className = "cd-edit-input cd-edit-input--title";
      nameEl.replaceWith(input);
      input.focus();
      input.select();

      const save = async () => {
        const val = input.value.trim();
        if (!val || val === current) {
          input.replaceWith(nameEl);
          return;
        }
        const { error } = await service().updateChronicle(chronicleId, { name: val });
        if (error) {
          alert("Error: " + error.message);
          input.replaceWith(nameEl);
        } else {
          nameEl.textContent = val;
          chronicle.name = val;
          input.replaceWith(nameEl);
        }
      };

      input.addEventListener("blur", save);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") input.blur();
        if (e.key === "Escape") {
          input.value = current;
          input.blur();
        }
      });
    });

    descEl.classList.add("cd-editable");
    descEl.addEventListener("click", () => {
      const current = chronicle.description || "";
      const textarea = document.createElement("textarea");
      textarea.value = current;
      textarea.className = "cd-edit-input cd-edit-input--desc";
      textarea.rows = 2;
      descEl.replaceWith(textarea);
      textarea.focus();

      const save = async () => {
        const val = textarea.value.trim();
        if (val === current) {
          textarea.replaceWith(descEl);
          return;
        }
        const { error } = await service().updateChronicle(chronicleId, {
          description: val || null,
        });
        if (error) {
          alert("Error: " + error.message);
          textarea.replaceWith(descEl);
        } else {
          chronicle.description = val || null;
          if (val) {
            descEl.textContent = val;
            descEl.classList.remove("empty");
          } else {
            descEl.textContent = "Sin descripción";
            descEl.classList.add("empty");
          }
          textarea.replaceWith(descEl);
        }
      };

      textarea.addEventListener("blur", save);
      textarea.addEventListener("keydown", (e) => {
        if (e.key === "Escape") {
          textarea.value = current;
          textarea.blur();
        }
      });
    });
  }

  ns.header = {
    populate,
  };
})(window);
