/**
 * External image references.
 *
 * Helpers to accept URLs / HTML / BBCode pasted by the user, extract a direct
 * image URL, and detect whether an imageRef points to an external host
 * (https://...) vs. an internal storage path (abn-private://...).
 *
 * External refs are saved as-is and rendered directly without going through
 * Supabase signed URLs — they don't count against the chronicle's storage.
 */
(function (global) {
  "use strict";

  // Hosts whose top-level URL is a viewer page, not the image itself.
  const VIEWER_HOSTS = [
    {
      match: /^(https?:\/\/)?(www\.)?ibb\.co\//i,
      hint: "Pegá el link directo a la imagen (i.ibb.co/...), no el del visor.",
    },
    {
      match: /^(https?:\/\/)?(www\.)?imgur\.com\//i,
      hint: "Pegá el link directo a la imagen (i.imgur.com/...), no el del visor.",
    },
  ];

  const IMAGE_EXTENSIONS = /\.(png|jpe?g|gif|webp|avif|bmp|svg)$/i;

  function tryExtractFromBBCode(input) {
    const linkWrapped = /\[url=[^\]\n]+\]\s*\[img[^\]\n]*\]([\s\S]*?)\[\/img\]\s*\[\/url\]/i.exec(input);
    if (linkWrapped) return linkWrapped[1].trim();
    const plain = /\[img[^\]\n]*\]([\s\S]*?)\[\/img\]/i.exec(input);
    if (plain) return plain[1].trim();
    return null;
  }

  function tryExtractFromHtml(input) {
    const match = /<img\b[^>]*\bsrc=["']([^"']+)["']/i.exec(input);
    if (match) return match[1].trim();
    return null;
  }

  function isHttpUrl(value) {
    return /^https?:\/\//i.test(String(value || ""));
  }

  function hasImageExtension(url) {
    let pathname;
    try {
      pathname = new URL(url).pathname;
    } catch (_e) {
      pathname = String(url).split("?")[0];
    }
    return IMAGE_EXTENSIONS.test(pathname);
  }

  function detectViewerHint(url) {
    for (const v of VIEWER_HOSTS) {
      if (v.match.test(url)) return v;
    }
    return null;
  }

  function parseExternalImageUrl(input) {
    const raw = String(input || "").trim();
    if (!raw) return { error: "Pegá una URL o un BBCode con la imagen." };

    let candidate = tryExtractFromBBCode(raw) || tryExtractFromHtml(raw) || raw;
    candidate = candidate.trim().replace(/^["']+|["']+$/g, "");

    if (!isHttpUrl(candidate)) {
      return { error: "No se reconoce el link. Tiene que empezar con http:// o https://." };
    }

    const viewer = detectViewerHint(candidate);
    if (viewer) return { error: viewer.hint };

    if (!hasImageExtension(candidate)) {
      return {
        error: "La URL no parece apuntar a una imagen (PNG, JPG, GIF, WEBP, AVIF).",
      };
    }

    let host = "";
    try {
      host = new URL(candidate).host.toLowerCase();
    } catch (_e) {
      // ignore — host stays empty
    }

    return { url: candidate, host };
  }

  function preflightImageUrl(url, { timeoutMs = 12000 } = {}) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      let settled = false;
      const timeoutId = setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error("La imagen tardó demasiado en responder."));
      }, timeoutMs);
      img.addEventListener("load", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        resolve({ width: img.naturalWidth, height: img.naturalHeight });
      });
      img.addEventListener("error", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timeoutId);
        reject(new Error("La URL no devolvió una imagen accesible."));
      });
      img.src = url;
    });
  }

  function isExternalImageRef(ref) {
    return isHttpUrl(ref);
  }

  global.ABNExternalImageRef = {
    parse: parseExternalImageUrl,
    preflight: preflightImageUrl,
    isExternal: isExternalImageRef,
  };
})(window);
