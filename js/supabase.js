// supabase.js
const SUPABASE_URL = "https://queitmvjucbjoeodsgqk.supabase.co";
const SUPABASE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InF1ZWl0bXZqdWNiam9lb2RzZ3FrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTE4Mzc2MjksImV4cCI6MjA2NzQxMzYyOX0.j_bBFPDCdyjEUNXRfFQPTbJoAPsrp9hOu5MW0PR3VRg";
window.supabase = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
  const text = raw || "";
  if (typeof marked !== "undefined" && typeof DOMPurify !== "undefined") {
    return DOMPurify.sanitize(marked.parse(text, { breaks: true, ...opts }));
  }
  if (typeof marked !== "undefined") {
    // marked available but no DOMPurify — escape the result as fallback
    return escapeHtml(marked.parse(text, { breaks: true, ...opts }));
  }
  return escapeHtml(text).replace(/\n/g, "<br>");
};
