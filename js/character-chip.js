// js/character-chip.js — Unified character chip component
//
// Usage:
//   const html = ABNCharacterChip.buildChipMarkup(character, { readonly: true });
//   ABNCharacterChip.buildChipMarkup(delivery.recipient, { removable: true, removeDataAttr: { key: "data-delivery-id", value: id } });

(function initCharacterChip(global) {
  const CHIP_NAME_MAX_LENGTH = 15;

  function esc(value) {
    return typeof global.escapeHtml === "function"
      ? global.escapeHtml(value)
      : String(value ?? "")
          .replace(/&/g, "&amp;")
          .replace(/</g, "&lt;")
          .replace(/>/g, "&gt;")
          .replace(/"/g, "&quot;");
  }

  function resolveName(c) {
    return (
      String(
        c?.character_name ||
          c?.recipient?.character_name ||
          c?.player_name ||
          c?.recipient?.name ||
          c?.name ||
          "Personaje",
      ).trim() || "Personaje"
    );
  }

  function resolveAvatarUrl(c) {
    return String(
      c?.avatar_url ||
        c?.recipient?.avatar_url ||
        "",
    ).trim();
  }

  function truncateDisplayName(name) {
    const chars = Array.from(String(name || ""));
    if (chars.length <= CHIP_NAME_MAX_LENGTH) return String(name || "");
    return `${chars.slice(0, CHIP_NAME_MAX_LENGTH - 1).join("")}.`;
  }

  /**
   * Build HTML markup for a character chip.
   *
   * @param {Object} character - Character / recipient / delivery data
   * @param {Object} [options]
   * @param {boolean} [options.readonly=false]
   * @param {boolean} [options.selected=false]
   * @param {boolean} [options.removable=false]
   * @param {Object}  [options.removeDataAttr] - { key, value }
   * @param {string}  [options.status] - 'pending'|'associated'|'opened'
   * @param {string}  [options.statusLabel] - visible text for status
   * @param {Object}  [options.dataAttrs] - additional data-* attrs on root
   * @returns {string} HTML string
   */
  function buildChipMarkup(character, options = {}) {
    const {
      readonly = false,
      selected = false,
      removable = false,
      removeDataAttr = null,
      status = null,
      statusLabel = null,
      dataAttrs = {},
    } = options;

    const name = resolveName(character);
    const avatarUrl = resolveAvatarUrl(character);
    const displayName = truncateDisplayName(name);

    // Avatar
    const avatarInner = avatarUrl
      ? `<img class="abn-chip-avatar-img" src="${esc(avatarUrl)}" alt="${esc(name)}">`
      : `<span class="abn-chip-avatar-fallback">${esc(name.charAt(0).toUpperCase())}</span>`;
    const avatarHtml = `<span class="abn-chip-avatar">${avatarInner}</span>`;

    // Name
    const nameHtml = `<span class="abn-chip-name">${esc(displayName)}</span>`;

    // Status label
    const statusHtml = statusLabel
      ? `<small class="abn-chip-status">${esc(statusLabel)}</small>`
      : "";

    // Remove button
    const removeHtml = removable
      ? `<button type="button" class="abn-chip-remove"${
          removeDataAttr
            ? ` ${esc(removeDataAttr.key)}="${esc(removeDataAttr.value)}"`
            : ""
        } title="Quitar">\u00d7</button>`
      : "";

    // CSS classes
    const classes = ["abn-chip"];
    if (readonly) classes.push("abn-chip--readonly");
    if (selected) classes.push("is-selected");
    if (status) classes.push(`abn-chip--${status}`);

    // Data attributes
    const dataHtml = Object.entries(dataAttrs || {})
      .map(([k, v]) => `${esc(k)}="${esc(v)}"`)
      .join(" ");

    const tag = readonly ? "span" : "button";
    const btnAttrs = readonly ? "" : ' type="button"';
    const ariaPressed = !readonly && selected ? ' aria-pressed="true"' : "";

    return `<${tag}${btnAttrs} class="${classes.join(" ")}" title="${esc(name)}"${ariaPressed}${
      dataHtml ? " " + dataHtml : ""
    }>${avatarHtml}${nameHtml}${statusHtml}${removeHtml}</${tag}>`;
  }

  global.ABNCharacterChip = { buildChipMarkup };
})(window);
