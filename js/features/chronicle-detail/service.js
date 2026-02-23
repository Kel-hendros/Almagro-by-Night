(function initChronicleDetailService(global) {
  const ns = (global.ABNChronicleDetail = global.ABNChronicleDetail || {});

  async function getSession() {
    const {
      data: { session },
    } = await window.abnGetSession();
    return session || null;
  }

  async function getCurrentPlayerByUserId(userId) {
    const { data, error } = await supabase
      .from("players")
      .select("id, name, is_admin")
      .eq("user_id", userId)
      .maybeSingle();

    if (error) {
      console.error("chronicle-detail.service.getCurrentPlayerByUserId:", error);
      return null;
    }
    return data || null;
  }

  async function getChronicleById(chronicleId) {
    const { data, error } = await supabase
      .from("chronicles")
      .select(
        "id, name, description, status, invite_code, creator_id, created_at, banner_url, banner_config, next_session"
      )
      .eq("id", chronicleId)
      .maybeSingle();
    return { data: data || null, error: error || null };
  }

  async function getParticipation(chronicleId, playerId) {
    const { data, error } = await supabase
      .from("chronicle_participants")
      .select("role")
      .eq("chronicle_id", chronicleId)
      .eq("player_id", playerId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  async function getPlayerNameById(playerId) {
    const { data, error } = await supabase
      .from("players")
      .select("name")
      .eq("id", playerId)
      .maybeSingle();
    if (error) return null;
    return data?.name || null;
  }

  async function updateChronicle(chronicleId, patch) {
    const { error } = await supabase
      .from("chronicles")
      .update(patch)
      .eq("id", chronicleId);
    return { error: error || null };
  }

  async function removeBannerFileByUrl(publicUrl) {
    if (!publicUrl) return { error: null };
    const parts = publicUrl.split("/chronicle-banners/");
    if (parts.length <= 1) return { error: null };
    const { error } = await supabase.storage
      .from("chronicle-banners")
      .remove([parts[1]]);
    return { error: error || null };
  }

  async function uploadBannerFile(filePath, file) {
    const { error: uploadError } = await supabase.storage
      .from("chronicle-banners")
      .upload(filePath, file);
    if (uploadError) return { publicUrl: null, error: uploadError };

    const {
      data: { publicUrl },
    } = supabase.storage.from("chronicle-banners").getPublicUrl(filePath);
    return { publicUrl, error: null };
  }

  async function fetchDashboardData(chronicleId) {
    const [participantsResult, charsResult, encountersResult, gameResult, recapResult] =
      await Promise.all([
        supabase
          .from("chronicle_participants")
          .select("player_id, role, player:players(id, name, user_id)")
          .eq("chronicle_id", chronicleId),
        supabase
          .from("chronicle_characters")
          .select(
            "character_sheet_id, character_sheet:character_sheets(id, name, data, avatar_url, user_id)"
          )
          .eq("chronicle_id", chronicleId),
        supabase
          .from("encounters")
          .select("id", { count: "exact", head: true })
          .eq("chronicle_id", chronicleId),
        supabase.from("games").select("id, name").eq("chronicle_id", chronicleId).limit(1),
        supabase
          .from("session_recaps")
          .select("session_number, title, body, session_date")
          .eq("chronicle_id", chronicleId)
          .order("session_number", { ascending: false })
          .limit(1)
          .maybeSingle(),
      ]);

    return {
      participants: participantsResult.data || [],
      characters: charsResult.data || [],
      encountersCount: encountersResult.count || 0,
      game: gameResult.data?.[0] || null,
      latestRecap: recapResult.data || null,
    };
  }

  ns.service = {
    getSession,
    getCurrentPlayerByUserId,
    getChronicleById,
    getParticipation,
    getPlayerNameById,
    updateChronicle,
    removeBannerFileByUrl,
    uploadBannerFile,
    fetchDashboardData,
  };
})(window);
