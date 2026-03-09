// supabase.js
const SUPABASE_URL = "https://queitmvjucbjoeodsgqk.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1ZWl0bXZqdWNiam9lb2RzZ3FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4Mzc2MjksImV4cCI6MjA2NzQxMzYyOX0.j_bBFPDCdyjEUNXRfFQPTbJoAPsrp9hOu5MW0PR3VRg";
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Session helper with short retry window to avoid auth hydration races on first route load.
 * Returns the same shape as `supabase.auth.getSession()`.
 */
window.abnGetSession = async function abnGetSession(options = {}) {
  const retries = Number.isFinite(options.retries) ? options.retries : 2;
  const delayMs = Number.isFinite(options.delayMs) ? options.delayMs : 120;

  let lastResponse = { data: { session: null }, error: null };
  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const response = await supabase.auth.getSession();
    lastResponse = response || lastResponse;
    if (response?.data?.session) return response;
    if (attempt < retries) await sleep(delayMs);
  }
  return lastResponse;
};

window.abnGetCurrentUser = async function abnGetCurrentUser(options = {}) {
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (user || error) return { user: user || null, error: error || null };

  const {
    data: { session },
  } = await window.abnGetSession(options);
  return { user: session?.user || null, error: null };
};

/**
 * Escape HTML special characters to prevent XSS when inserting into innerHTML.
 * @param {*} str — any value (coerced to string)
 * @returns {string} safe HTML string
 */
window.escapeHtml = function escapeHtml(str) {
  const s = String(str ?? "");
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
};

const ABN_PENDING_ROUTE_KEY = "abn_pending_route";

window.abnSetPendingRoute = function abnSetPendingRoute(hash) {
  const normalized = String(hash || "").replace(/^#/, "").trim();
  if (!normalized) return;
  sessionStorage.setItem(ABN_PENDING_ROUTE_KEY, normalized);
};

window.abnGetPendingRoute = function abnGetPendingRoute() {
  return sessionStorage.getItem(ABN_PENDING_ROUTE_KEY) || "";
};

window.abnConsumePendingRoute = function abnConsumePendingRoute() {
  const value = window.abnGetPendingRoute();
  if (value) {
    sessionStorage.removeItem(ABN_PENDING_ROUTE_KEY);
  }
  return value;
};

window.abnClearPendingRoute = function abnClearPendingRoute() {
  sessionStorage.removeItem(ABN_PENDING_ROUTE_KEY);
};

function renderWikilinks(rawText) {
  return String(rawText || "").replace(
    /\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/g,
    (_match, target, alias) => {
      const label = String(alias || target || "").trim();
      if (!label) return "";
      return `<strong class="doc-wikilink">${window.escapeHtml(label)}</strong>`;
    },
  );
}

/**
 * Render markdown to safe HTML using marked + DOMPurify.
 * Falls back to escaped HTML if libraries aren't loaded.
 * @param {string} raw — raw markdown string
 * @param {object} [opts] — options passed to marked.parse
 * @returns {string} sanitized HTML
 */
/**
 * Validate a password meets Supabase requirements: min 6 chars, letters + digits.
 * @param {string} pw — password to validate
 * @returns {{ ok: boolean, msg: string }}
 */
window.validatePassword = function validatePassword(pw) {
  if (!pw || pw.length < 6) {
    return { ok: false, msg: "La contraseña debe tener al menos 6 caracteres." };
  }
  if (!/[a-zA-Z]/.test(pw)) {
    return { ok: false, msg: "La contraseña debe incluir al menos una letra." };
  }
  if (!/\d/.test(pw)) {
    return { ok: false, msg: "La contraseña debe incluir al menos un número." };
  }
  return { ok: true, msg: "" };
};

window.renderMarkdown = function renderMarkdown(raw, opts) {
  const text = renderWikilinks(raw || "");
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(marked.parse(text, { breaks: true, ...opts }));
  }
  if (typeof marked !== "undefined") {
    // marked available but no DOMPurify — escape the result as fallback
    return escapeHtml(marked.parse(text, { breaks: true, ...opts }));
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
};
