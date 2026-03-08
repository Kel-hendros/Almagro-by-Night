(function initSharedDocumentTypeRegistry(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const registry = new Map();

  function normalizeType(type) {
    return String(type || "").trim().toLowerCase();
  }

  function register(type, definition) {
    const normalizedType = normalizeType(type);
    if (!normalizedType || !definition || typeof definition !== "object") {
      throw new Error("ABNShared.documentTypes.register requiere un tipo y una definición válidos.");
    }

    registry.set(normalizedType, Object.freeze({ ...definition, type: normalizedType }));
    return registry.get(normalizedType);
  }

  function get(type) {
    return registry.get(normalizeType(type)) || null;
  }

  function list() {
    return Array.from(registry.values());
  }

  root.documentTypes = {
    register,
    get,
    list,
  };
})(window);
