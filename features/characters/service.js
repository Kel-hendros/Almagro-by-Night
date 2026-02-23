(function initCharactersService(global) {
  const ns = (global.ABNCharacters = global.ABNCharacters || {});

  function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function getCurrentUser(options = {}) {
    const retries = Number.isFinite(options.retries) ? options.retries : 1;
    const retryDelayMs = Number.isFinite(options.retryDelayMs)
      ? options.retryDelayMs
      : 150;

    for (let attempt = 0; attempt <= retries; attempt += 1) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) return user;

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session?.user) return session.user;

      if (attempt < retries) {
        await sleep(retryDelayMs);
      }
    }

    return null;
  }

  async function isUserAdmin(userId) {
    const { data } = await supabase
      .from("players")
      .select("is_admin")
      .eq("user_id", userId)
      .maybeSingle();
    return !!data?.is_admin;
  }

  async function fetchPlayersMap() {
    const { data, error } = await supabase.from("players").select("user_id, name");
    if (error) throw error;

    const map = {};
    (data || []).forEach((player) => {
      map[player.user_id] = player.name;
    });
    return map;
  }

  async function fetchSheets({ userId, isAdmin }) {
    let query = supabase
      .from("character_sheets")
      .select("id, name, updated_at, data, user_id, avatar_url")
      .order("updated_at", { ascending: false });

    if (!isAdmin) {
      query = query.eq("user_id", userId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  }

  async function fetchChronicleMap(sheetIds) {
    if (!sheetIds?.length) return {};

    const { data, error } = await supabase
      .from("chronicle_characters")
      .select("character_sheet_id, chronicle:chronicles(id, name)")
      .in("character_sheet_id", sheetIds);

    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      if (row.chronicle && !map[row.character_sheet_id]) {
        map[row.character_sheet_id] = row.chronicle;
      }
    });

    return map;
  }

  async function createSheet({ userId, name }) {
    const payload = { user_id: userId, name, data: { nombre: name } };
    const { data, error } = await supabase
      .from("character_sheets")
      .insert([payload])
      .select("id")
      .single();

    if (error) throw error;
    return data;
  }

  async function deleteSheet(sheetId) {
    const { error } = await supabase
      .from("character_sheets")
      .delete()
      .eq("id", sheetId);

    if (error) throw error;
  }

  async function getSheetById(sheetId) {
    const { data, error } = await supabase
      .from("character_sheets")
      .select("id, avatar_url, data")
      .eq("id", sheetId)
      .maybeSingle();

    if (error) throw error;
    return data;
  }

  async function updateSheet(sheetId, payload) {
    const { error } = await supabase
      .from("character_sheets")
      .update(payload)
      .eq("id", sheetId);

    if (error) throw error;
  }

  async function uploadAvatar(filePath, file) {
    const { error } = await supabase.storage
      .from("character-avatars")
      .upload(filePath, file);

    if (error) throw error;

    const {
      data: { publicUrl },
    } = supabase.storage.from("character-avatars").getPublicUrl(filePath);

    return publicUrl;
  }

  ns.service = {
    getCurrentUser,
    isUserAdmin,
    fetchPlayersMap,
    fetchSheets,
    fetchChronicleMap,
    createSheet,
    deleteSheet,
    getSheetById,
    updateSheet,
    uploadAvatar,
  };
})(window);
