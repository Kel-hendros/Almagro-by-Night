(function initSharedDocumentList(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const DEFAULT_LIMIT = 5;

  function escapeHtml(value) {
    if (typeof global.escapeHtml === "function") return global.escapeHtml(value);
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function normalizePreset(preset) {
    return String(preset || "").trim().toLowerCase() === "minimal" ? "minimal" : "complete";
  }

  function normalizeLimit(limit) {
    if (limit == null || limit === "") return DEFAULT_LIMIT;
    const numeric = Number(limit);
    if (!Number.isFinite(numeric)) return DEFAULT_LIMIT;
    return Math.max(1, Math.floor(numeric));
  }

  function stripMarkdownPreservingBreaks(text) {
    return String(text || "")
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((line) =>
        String(line || "")
          .replace(/^#{1,6}\s+/g, "")
          .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .replace(/`([^`]+)`/g, "$1")
          .replace(/\*\*(.*?)\*\*/g, "$1")
          .replace(/\*(.*?)\*/g, "$1")
          .replace(/__(.*?)__/g, "$1")
          .replace(/_(.*?)_/g, "$1")
          .replace(/~~(.*?)~~/g, "$1")
          .replace(/^\s*>\s?/g, "")
          .replace(/^\s*[-*+]\s+/g, "")
          .replace(/^\s*\d+\.\s+/g, "")
          .replace(/[ \t]+/g, " ")
          .trimEnd(),
      )
      .join("\n");
  }

  function buildPreviewText(text, options = {}) {
    const maxLines = normalizeLimit(options.maxLines);
    const stripped = stripMarkdownPreservingBreaks(text);
    const lines = stripped.split("\n");

    while (lines.length && !String(lines[0] || "").trim()) lines.shift();
    while (lines.length && !String(lines[lines.length - 1] || "").trim()) lines.pop();

    if (!lines.length) return "";
    if (lines.length <= maxLines) return lines.join("\n");

    const visible = lines.slice(0, maxLines);
    let targetIndex = visible.length - 1;
    while (targetIndex > 0 && !String(visible[targetIndex] || "").trim()) targetIndex -= 1;
    visible[targetIndex] = `${String(visible[targetIndex] || "").trimEnd()}…`;
    return visible.join("\n");
  }

  function buildPreviewMarkdown(text, options = {}) {
    const maxLines = normalizeLimit(options.maxLines);
    const lines = String(text || "").replace(/\r\n?/g, "\n").split("\n");

    while (lines.length && !String(lines[0] || "").trim()) lines.shift();
    while (lines.length && !String(lines[lines.length - 1] || "").trim()) lines.pop();

    if (!lines.length) return "";
    if (lines.length <= maxLines) return lines.join("\n");

    const visible = lines.slice(0, maxLines);
    let targetIndex = visible.length - 1;
    while (targetIndex > 0 && !String(visible[targetIndex] || "").trim()) targetIndex -= 1;
    visible[targetIndex] = `${String(visible[targetIndex] || "").trimEnd()}…`;
    return visible.join("\n");
  }

  function renderMarkdownPreview(markdown) {
    const source = String(markdown || "").trim();
    if (!source) return "";
    if (typeof global.renderMarkdown === "function") {
      return global.renderMarkdown(source);
    }
    return escapeHtml(source).replace(/\n/g, "<br>");
  }

  function renderPlainPreview(preview) {
    const source = String(preview || "").trim();
    if (!source) return "";
    const wikilinkPattern = /\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/g;
    let output = "";
    let lastIndex = 0;
    source.replace(
      wikilinkPattern,
      (match, target, alias, offset) => {
        output += escapeHtml(source.slice(lastIndex, offset));
        const label = String(alias || target || "").trim();
        if (label) {
          output += `<strong class="doc-wikilink">${escapeHtml(label)}</strong>`;
        }
        lastIndex = offset + match.length;
        return match;
      },
    );
    output += escapeHtml(source.slice(lastIndex));
    return output.replace(/\n/g, "<br>");
  }

  function resolveCreatedAt(row, getCreatedAt) {
    if (typeof getCreatedAt === "function") {
      return getCreatedAt(row);
    }
    return row?.created_at ?? row?.createdAt ?? row?.updated_at ?? row?.updatedAt ?? null;
  }

  function toTimestamp(value) {
    if (!value) return 0;
    if (value instanceof Date) return value.getTime();
    const numeric = new Date(value).getTime();
    return Number.isFinite(numeric) ? numeric : 0;
  }

  function getRecentRows(rows, options = {}) {
    const source = Array.isArray(rows) ? rows.slice() : [];
    const limit = normalizeLimit(options.limit);
    const getCreatedAt = typeof options.getCreatedAt === "function" ? options.getCreatedAt : null;

    source.sort((a, b) => {
      const aTime = toTimestamp(resolveCreatedAt(a, getCreatedAt));
      const bTime = toTimestamp(resolveCreatedAt(b, getCreatedAt));
      return bTime - aTime;
    });

    return source.slice(0, limit);
  }

  function applyPreset(host, preset = "complete") {
    if (!host || !host.classList) return;
    const normalized = normalizePreset(preset);
    host.classList.add("dl-list");
    host.classList.remove("dl-list--minimal", "dl-list--complete");
    host.classList.add(`dl-list--${normalized}`);
  }

  function createItem(options = {}) {
    const normalizedPreset = normalizePreset(options.preset);
    const variant = String(options.variant || "").trim().toLowerCase() === "detailed"
      ? "detailed"
      : "basic";
    const title = String(options.title || "Sin título").trim() || "Sin título";
    const meta = String(options.meta || "").trim();
    const preview = String(options.preview || "").trim();
    const previewHtml = String(options.previewHtml || "").trim();
    const previewMarkdown = String(options.previewMarkdown || "").trim();
    const renderedPreviewHtml = previewHtml || (previewMarkdown ? renderMarkdownPreview(previewMarkdown) : "");
    const tagsHtml = String(options.tagsHtml || "").trim();
    const image = options.image && typeof options.image === "object" ? options.image : null;
    const imageSrc = String(image?.src || "").trim();
    const imageAlt = String(image?.alt || title || "").trim();
    const onActivate = typeof options.onActivate === "function" ? options.onActivate : null;
    const dataAttrs =
      options.dataAttrs && typeof options.dataAttrs === "object" ? options.dataAttrs : {};

    const item = document.createElement("article");
    item.className = `dl-item dl-item--${normalizedPreset} dl-item--${variant}`;

    Object.entries(dataAttrs).forEach(([name, value]) => {
      if (value == null) return;
      item.setAttribute(`data-${name}`, String(value));
    });

    if (onActivate) {
      item.classList.add("dl-item--clickable");
      item.tabIndex = 0;
      item.setAttribute("role", "button");
      item.addEventListener("click", () => {
        onActivate(item);
      });
      item.addEventListener("keydown", (event) => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        onActivate(item);
      });
    }

    item.innerHTML = `
      <div class="dl-item-main">
        <div class="dl-item-head">
          <h3 class="dl-item-title">${escapeHtml(title)}</h3>
        </div>
        ${meta ? `<p class="dl-item-meta">${escapeHtml(meta)}</p>` : ""}
        ${tagsHtml ? `<div class="dl-item-tags">${tagsHtml}</div>` : ""}
        ${renderedPreviewHtml
          ? `<div class="dl-item-preview dl-item-preview--markdown doc-markdown">${renderedPreviewHtml}</div>`
          : preview ? `<p class="dl-item-preview">${renderPlainPreview(preview)}</p>` : ""}
      </div>
      ${imageSrc
        ? `<div class="dl-item-media" aria-hidden="true">
             <img class="dl-item-media-image" src="${escapeHtml(imageSrc)}" alt="${escapeHtml(imageAlt)}">
           </div>`
        : ""}
    `;

    return item;
  }

  function createSkeletonItemMarkup(options = {}) {
    const normalizedPreset = normalizePreset(options.preset);
    return `
      <article class="dl-item dl-item--${normalizedPreset} dl-item--skeleton" aria-hidden="true">
        <div class="dl-item-head">
          <span class="dl-skeleton dl-skeleton--title"></span>
        </div>
        <span class="dl-skeleton dl-skeleton--meta"></span>
        <div class="dl-skeleton-stack">
          <span class="dl-skeleton dl-skeleton--line"></span>
          <span class="dl-skeleton dl-skeleton--line"></span>
          <span class="dl-skeleton dl-skeleton--line dl-skeleton--line-short"></span>
        </div>
      </article>
    `;
  }

  function getSkeletonMarkup(options = {}) {
    const normalizedPreset = normalizePreset(options.preset);
    const count = normalizeLimit(options.count);
    return `
      <div class="dl-list dl-list--${normalizedPreset}" aria-hidden="true">
        ${Array.from({ length: count }, () =>
          createSkeletonItemMarkup({ preset: normalizedPreset })).join("")}
      </div>
    `;
  }

  function renderSkeleton(host, options = {}) {
    if (!host) return;
    host.setAttribute("aria-busy", "true");
    host.innerHTML = getSkeletonMarkup(options);
  }

  root.documentList = {
    DEFAULT_LIMIT,
    applyPreset,
    buildPreviewMarkdown,
    buildPreviewText,
    createItem,
    createSkeletonItemMarkup,
    getRecentRows,
    getSkeletonMarkup,
    normalizeLimit,
    renderMarkdownPreview,
    renderSkeleton,
    stripMarkdownPreservingBreaks,
  };
})(window);
