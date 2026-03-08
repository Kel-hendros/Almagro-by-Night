(function initSharedTags(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function normalizeTag(rawTag, { lowercase = false } = {}) {
    const normalized = String(rawTag || "").trim().replace(/\s+/g, " ");
    return lowercase ? normalized.toLowerCase() : normalized;
  }

  function createTagKey(rawTag) {
    return normalizeTag(rawTag, { lowercase: true });
  }

  function formatLabel(rawTag, { displayMode = "title" } = {}) {
    const text = normalizeTag(rawTag);
    if (!text) return "";

    if (displayMode === "raw") return text;
    if (displayMode === "upper") return text.toUpperCase();
    if (displayMode === "lower") return text.toLowerCase();

    return text
      .split(/([:/._-]|\s+)/)
      .map((part) => {
        if (!part || /([:/._-]|\s+)/.test(part)) return part;
        return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
      })
      .join("");
  }

  function dedupe(tags, { lowercaseCompare = true } = {}) {
    if (!Array.isArray(tags)) return [];

    const seen = new Set();
    return tags.reduce((acc, tag) => {
      const label = normalizeTag(tag);
      if (!label) return acc;

      const key = lowercaseCompare ? label.toLowerCase() : label;
      if (seen.has(key)) return acc;

      seen.add(key);
      acc.push(label);
      return acc;
    }, []);
  }

  function parse(rawTags, { lowercase = false } = {}) {
    return dedupe(
      String(rawTags || "")
        .split(",")
        .map((tag) => normalizeTag(tag, { lowercase }))
        .filter(Boolean),
      { lowercaseCompare: true }
    );
  }

  function getTagObjects(tags) {
    const unique = new Map();
    dedupe(tags).forEach((tag) => {
      const key = createTagKey(tag);
      if (!key || unique.has(key)) return;
      unique.set(key, { key, label: tag });
    });
    return Array.from(unique.values());
  }

  function collectStats(items, options = {}) {
    const {
      getTags = (item) => item?.tags,
      selectedTag = null,
      selectedLabel = "",
      sortLocale = "es",
    } = options;

    const tagsMap = new Map();

    (Array.isArray(items) ? items : []).forEach((item) => {
      const uniqueTags = new Map(
        getTagObjects(getTags(item)).map((tag) => [tag.key, tag.label])
      );

      uniqueTags.forEach((label, key) => {
        if (!tagsMap.has(key)) {
          tagsMap.set(key, { key, label, count: 0 });
        }
      });

      if (!selectedTag || uniqueTags.has(selectedTag)) {
        uniqueTags.forEach((label, key) => {
          const current = tagsMap.get(key) || { key, label, count: 0 };
          current.count += 1;
          tagsMap.set(key, current);
        });
      }
    });

    if (selectedTag && !tagsMap.has(selectedTag)) {
      tagsMap.set(selectedTag, {
        key: selectedTag,
        label: selectedLabel || selectedTag,
        count: 0,
      });
    }

    return Array.from(tagsMap.values()).sort((a, b) => {
      if (a.key === selectedTag) return -1;
      if (b.key === selectedTag) return 1;
      return a.label.localeCompare(b.label, sortLocale);
    });
  }

  function renderFilterBar(options = {}) {
    const {
      container,
      stats = [],
      selectedTag = null,
      onToggle = null,
      displayMode = "title",
      hiddenClassName = "hidden",
      rowClassName = "abn-tag-filter-row",
      chipClassName = "abn-tag-filter-chip",
      activeClassName = "is-active",
    } = options;

    if (!container) return;

    container.innerHTML = "";
    container.classList.add(rowClassName);

    if (!stats.length) {
      container.classList.add(hiddenClassName);
      return;
    }

    container.classList.remove(hiddenClassName);

    stats.forEach(({ key, label, count }) => {
      const button = document.createElement("button");
      const isActive = selectedTag === key;

      button.type = "button";
      button.className = chipClassName + (isActive ? ` ${activeClassName}` : "");
      button.setAttribute("aria-pressed", isActive ? "true" : "false");
      button.textContent = `${formatLabel(label, { displayMode })} (${count})`;

      if (count === 0 && !isActive) {
        button.disabled = true;
      }

      button.addEventListener("click", () => {
        if (typeof onToggle === "function") onToggle(key, label);
      });

      container.appendChild(button);
    });
  }

  function renderEditor(options = {}) {
    const {
      container,
      tags = [],
      composerOpen = false,
      editable = true,
      onChange = null,
      onComposerToggle = null,
      displayMode = "title",
      placeholder = "Nuevo tag",
      addButtonLabel = "+",
    } = options;

    if (!container) return;

    const currentTags = dedupe(tags);
    container.innerHTML = "";

    const editor = document.createElement("div");
    editor.className = "abn-tag-editor";

    const list = document.createElement("div");
    list.className = "abn-tag-list";

    currentTags.forEach((tag, idx) => {
      const pill = document.createElement("span");
      pill.className = "abn-tag";
      pill.appendChild(
        document.createTextNode(formatLabel(tag, { displayMode }))
      );

      if (editable) {
        const removeBtn = document.createElement("button");
        removeBtn.type = "button";
        removeBtn.className = "btn-icon btn-icon--danger abn-tag-delete-btn";
        removeBtn.setAttribute("aria-label", "Eliminar tag");
        removeBtn.innerHTML = '<i data-lucide="trash-2"></i>';
        removeBtn.addEventListener("click", () => {
          if (typeof onChange === "function") {
            onChange(currentTags.filter((_, tagIdx) => tagIdx !== idx));
          }
        });
        pill.appendChild(removeBtn);
      }

      list.appendChild(pill);
    });

    if (editable) {
      const addBtn = document.createElement("button");
      addBtn.type = "button";
      addBtn.className = "abn-tag-add-btn";
      addBtn.setAttribute("aria-label", "Agregar tag");
      addBtn.textContent = addButtonLabel;
      addBtn.addEventListener("click", () => {
        if (typeof onComposerToggle === "function") onComposerToggle(true);
      });
      list.appendChild(addBtn);
    }

    editor.appendChild(list);

    if (editable && composerOpen) {
      const composer = document.createElement("div");
      composer.className = "abn-tag-composer";

      const input = document.createElement("input");
      input.type = "text";
      input.className = "abn-tag-input";
      input.placeholder = placeholder;

      const closeComposer = () => {
        if (typeof onComposerToggle === "function") onComposerToggle(false);
      };

      const commitComposer = () => {
        const label = normalizeTag(input.value);
        if (!label) {
          closeComposer();
          return;
        }

        const nextTags = dedupe([...currentTags, label]);
        if (typeof onChange === "function") onChange(nextTags);
      };

      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          commitComposer();
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeComposer();
        }
      });

      input.addEventListener("blur", () => {
        if (input.value.trim()) {
          commitComposer();
          return;
        }
        closeComposer();
      });

      composer.appendChild(input);
      editor.appendChild(composer);

      requestAnimationFrame(() => {
        input.focus();
      });
    }

    container.appendChild(editor);

    if (global.lucide?.createIcons) {
      global.lucide.createIcons({ nodes: [container] });
    }
  }

  root.tags = {
    normalizeTag,
    createTagKey,
    formatLabel,
    dedupe,
    parse,
    getTagObjects,
    collectStats,
    renderFilterBar,
    renderEditor,
  };
})(window);
