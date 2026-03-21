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

  async function regenerateInviteCode(chronicleId) {
    const { data: newCode, error: codeError } = await supabase.rpc(
      "generate_invite_code"
    );
    if (codeError) {
      return { inviteCode: null, error: codeError };
    }

    const { data: updated, error: updateError } = await supabase
      .from("chronicles")
      .update({ invite_code: newCode })
      .eq("id", chronicleId)
      .select("invite_code")
      .single();

    if (updateError) {
      return { inviteCode: null, error: updateError };
    }

    return { inviteCode: updated?.invite_code || newCode, error: null };
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
    const [
      participantsResult,
      charsResult,
      encountersResult,
      gameResult,
      recapResult,
      recapCountResult,
    ] =
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
        supabase
          .from("games")
          .select("id, name, territory_id, territory:territories(id, name, maptiler_dataset_url)")
          .eq("chronicle_id", chronicleId)
          .limit(1),
        supabase
          .from("session_recaps")
          .select("id, session_number, title, body, session_date, created_at")
          .eq("chronicle_id", chronicleId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        supabase
          .from("session_recaps")
          .select("id", { count: "exact", head: true })
          .eq("chronicle_id", chronicleId),
      ]);

    return {
      participants: participantsResult.data || [],
      characters: charsResult.data || [],
      encountersCount: encountersResult.count || 0,
      sessionsCount: recapCountResult.count || 0,
      game: gameResult.data?.[0] || null,
      latestRecap: recapResult.data || null,
    };
  }

  async function fetchChronicleTerritory(chronicleId) {
    const [configResult, poisResult] = await Promise.all([
      supabase
        .from("chronicle_territories")
        .select("chronicle_id, center_label, center_lat, center_lng, zoom, updated_at")
        .eq("chronicle_id", chronicleId)
        .maybeSingle(),
      supabase
        .from("chronicle_territory_pois")
        .select(
          "id, chronicle_id, created_by_player_id, title, description, kind, visibility, lat, lng, linked_document_type, linked_document_id, created_at, updated_at"
        )
        .eq("chronicle_id", chronicleId)
        .order("updated_at", { ascending: false }),
    ]);

    const pois = poisResult.data || [];
    const authorIds = [...new Set(pois.map((poi) => poi.created_by_player_id).filter(Boolean))];
    let authorMap = {};
    if (authorIds.length) {
      const { data: authors, error: authorsError } = await supabase
        .from("players")
        .select("id, name")
        .in("id", authorIds);
      if (authorsError) {
        console.error("chronicle-detail.service.fetchChronicleTerritory.authors:", authorsError);
      } else {
        authorMap = Object.fromEntries((authors || []).map((author) => [author.id, author.name || "—"]));
      }
    }

    return {
      config: configResult.data || null,
      pois: pois.map((poi) => ({
        ...poi,
        author_name: authorMap[poi.created_by_player_id] || "—",
      })),
      error: configResult.error || poisResult.error || null,
    };
  }

  async function upsertChronicleTerritoryConfig({
    chronicleId,
    playerId,
    centerLabel,
    centerLat,
    centerLng,
    zoom,
  }) {
    const payload = {
      chronicle_id: chronicleId,
      center_label: centerLabel,
      center_lat: centerLat,
      center_lng: centerLng,
      zoom,
      created_by: playerId,
      updated_by: playerId,
    };

    const { data, error } = await supabase
      .from("chronicle_territories")
      .upsert(payload, { onConflict: "chronicle_id" })
      .select("chronicle_id, center_label, center_lat, center_lng, zoom, updated_at")
      .maybeSingle();

    return {
      data: data || null,
      error: error || null,
    };
  }

  async function createChronicleTerritoryPoi({
    chronicleId,
    currentPlayerId,
    title,
    description,
    kind,
    visibility,
    lat,
    lng,
  }) {
    const { data, error } = await supabase
      .from("chronicle_territory_pois")
      .insert({
        chronicle_id: chronicleId,
        created_by_player_id: currentPlayerId,
        title,
        description,
        kind,
        visibility,
        lat,
        lng,
      })
      .select(
        "id, chronicle_id, created_by_player_id, title, description, kind, visibility, lat, lng, linked_document_type, linked_document_id, created_at, updated_at"
      )
      .maybeSingle();

    return {
      data: data || null,
      error: error || null,
    };
  }

  async function updateChronicleTerritoryPoi({
    poiId,
    chronicleId,
    title,
    description,
    kind,
    visibility,
    lat,
    lng,
  }) {
    const { data, error } = await supabase
      .from("chronicle_territory_pois")
      .update({
        title,
        description,
        kind,
        visibility,
        lat,
        lng,
      })
      .eq("id", poiId)
      .eq("chronicle_id", chronicleId)
      .select(
        "id, chronicle_id, created_by_player_id, title, description, kind, visibility, lat, lng, linked_document_type, linked_document_id, created_at, updated_at"
      )
      .maybeSingle();

    return {
      data: data || null,
      error: error || null,
    };
  }

  async function deleteChronicleTerritoryPoi({ poiId, chronicleId }) {
    const { error } = await supabase
      .from("chronicle_territory_pois")
      .delete()
      .eq("id", poiId)
      .eq("chronicle_id", chronicleId);

    return { error: error || null };
  }

  function subscribeChronicleTerritory({ chronicleId, onChange }) {
    if (!chronicleId || !global.supabase) return null;
    return global.supabase
      .channel(`chronicle-territory-${chronicleId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chronicle_territories",
          filter: `chronicle_id=eq.${chronicleId}`,
        },
        () => {
          if (typeof onChange === "function") onChange();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "chronicle_territory_pois",
          filter: `chronicle_id=eq.${chronicleId}`,
        },
        () => {
          if (typeof onChange === "function") onChange();
        }
      )
      .subscribe();
  }

  function unsubscribeChannel(channel) {
    if (!channel) return;
    try {
      channel.unsubscribe?.();
    } catch (_e) {}
    try {
      global.supabase?.removeChannel?.(channel);
    } catch (_e) {}
  }

  async function fetchEncountersForChronicle({ chronicleId, isNarrator }) {
    let query = supabase
      .from("encounters")
      .select("id, name, status, created_at, data")
      .eq("chronicle_id", chronicleId)
      .order("created_at", { ascending: false });

    if (!isNarrator) {
      query = query.in("status", ["in_game"]);
    }

    const { data, error } = await query;
    return {
      data: data || [],
      error: error || null,
    };
  }

  async function createEncounter({ chronicleId, userId, name }) {
    const payload = {
      chronicle_id: chronicleId,
      user_id: userId,
      name,
      status: "wip",
      data: {
        instances: [],
        tokens: [],
        round: 1,
        activeInstanceId: null,
      },
    };

    const { data, error } = await supabase
      .from("encounters")
      .insert(payload)
      .select("id, name, status, created_at, data")
      .maybeSingle();

    return {
      data: data || null,
      error: error || null,
    };
  }

  async function updateEncounterStatus({ encounterId, status }) {
    const { data, error } = await supabase
      .from("encounters")
      .update({ status })
      .eq("id", encounterId)
      .select("id, status")
      .maybeSingle();

    return {
      data: data || null,
      error: error || null,
    };
  }

  async function getChronicleStorageQuota(chronicleId) {
    const { data, error } = await supabase.rpc("check_chronicle_storage_quota", {
      p_chronicle_id: chronicleId,
      p_incoming_bytes: 0,
    });
    return {
      data: data || null,
      error: error || null,
    };
  }

  ns.service = {
    getSession,
    getCurrentPlayerByUserId,
    getChronicleById,
    getParticipation,
    getPlayerNameById,
    updateChronicle,
    regenerateInviteCode,
    removeBannerFileByUrl,
    uploadBannerFile,
    fetchDashboardData,
    fetchChronicleTerritory,
    upsertChronicleTerritoryConfig,
    createChronicleTerritoryPoi,
    updateChronicleTerritoryPoi,
    deleteChronicleTerritoryPoi,
    subscribeChronicleTerritory,
    unsubscribeChannel,
    fetchEncountersForChronicle,
    createEncounter,
    updateEncounterStatus,
    getChronicleStorageQuota,
  };
})(window);
