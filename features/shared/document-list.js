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
    const title = String(options.title || "Sin título").trim() || "Sin título";
    const meta = String(options.meta || "").trim();
    const preview = String(options.preview || "").trim();
    const onActivate = typeof options.onActivate === "function" ? options.onActivate : null;
    const dataAttrs =
      options.dataAttrs && typeof options.dataAttrs === "object" ? options.dataAttrs : {};

    const item = document.createElement("article");
    item.className = `dl-item dl-item--${normalizedPreset}`;

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
      <div class="dl-item-head">
        <h3 class="dl-item-title">${escapeHtml(title)}</h3>
      </div>
      ${meta ? `<p class="dl-item-meta">${escapeHtml(meta)}</p>` : ""}
      ${preview ? `<p class="dl-item-preview">${escapeHtml(preview)}</p>` : ""}
    `;

    return item;
  }

  root.documentList = {
    DEFAULT_LIMIT,
    applyPreset,
    buildPreviewText,
    createItem,
    getRecentRows,
    normalizeLimit,
    stripMarkdownPreservingBreaks,
  };
})(window);
