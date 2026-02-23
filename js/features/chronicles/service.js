(function initChroniclesService(global) {
  const ns = (global.ABNChronicles = global.ABNChronicles || {});

  async function fetchCurrentPlayer() {
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) return null;

    const { data, error } = await supabase
      .from("players")
      .select("id, name, is_admin")
      .eq("user_id", session.user.id)
      .maybeSingle();

    if (error) {
      console.error("chronicles.service.fetchCurrentPlayer:", error);
      return null;
    }
    return data;
  }

  async function fetchChroniclesForPlayer(playerId) {
    const { data: participations, error: participationsError } = await supabase
      .from("chronicle_participants")
      .select(
        "role, chronicle:chronicles(id, name, description, status, creator_id, created_at, banner_url, creator:players!chronicles_creator_id_fkey(name))"
      )
      .eq("player_id", playerId);

    if (participationsError) throw participationsError;

    const { data: ownedChronicles, error: ownedError } = await supabase
      .from("chronicles")
      .select(
        "id, name, description, status, creator_id, created_at, banner_url, creator:players!chronicles_creator_id_fkey(name)"
      )
      .eq("creator_id", playerId);

    if (ownedError) throw ownedError;

    const chronicleMap = new Map();

    (participations || []).forEach((item) => {
      if (!item?.chronicle) return;
      chronicleMap.set(item.chronicle.id, {
        ...item.chronicle,
        role: item.role,
      });
    });

    (ownedChronicles || []).forEach((chronicle) => {
      if (!chronicleMap.has(chronicle.id)) {
        chronicleMap.set(chronicle.id, { ...chronicle, role: "narrator" });
      }
    });

    return Array.from(chronicleMap.values()).sort(
      (a, b) => new Date(b.created_at) - new Date(a.created_at)
    );
  }

  async function fetchParticipantsByChronicleIds(chronicleIds) {
    if (!chronicleIds?.length) return {};
    const { data, error } = await supabase
      .from("chronicle_participants")
      .select("chronicle_id, player_id, role, player:players(id, name)")
      .in("chronicle_id", chronicleIds);
    if (error) throw error;

    const map = {};
    (data || []).forEach((participant) => {
      if (!map[participant.chronicle_id]) map[participant.chronicle_id] = [];
      map[participant.chronicle_id].push(participant);
    });
    return map;
  }

  async function fetchCharactersByChronicleIds(chronicleIds) {
    if (!chronicleIds?.length) return {};
    const { data, error } = await supabase
      .from("chronicle_characters")
      .select(
        "chronicle_id, character:character_sheets(id, name, avatar_url, updated_at)"
      )
      .in("chronicle_id", chronicleIds);
    if (error) throw error;

    const map = {};
    (data || []).forEach((row) => {
      if (!row?.chronicle_id || !row?.character) return;
      if (!map[row.chronicle_id]) map[row.chronicle_id] = [];
      map[row.chronicle_id].push(row);
    });

    Object.keys(map).forEach((chronicleId) => {
      map[chronicleId].sort((a, b) => {
        const da = new Date(a.character.updated_at || 0).getTime();
        const db = new Date(b.character.updated_at || 0).getTime();
        return db - da;
      });
    });

    return map;
  }

  async function createChronicle({ name, playerId }) {
    const { data: code, error: codeError } = await supabase.rpc(
      "generate_invite_code"
    );
    if (codeError) throw codeError;

    const { data: chronicle, error: insertError } = await supabase
      .from("chronicles")
      .insert({
        name,
        creator_id: playerId,
        invite_code: code,
      })
      .select()
      .single();
    if (insertError) throw insertError;

    const { error: participantError } = await supabase
      .from("chronicle_participants")
      .insert({
        chronicle_id: chronicle.id,
        player_id: playerId,
        role: "narrator",
      });
    if (participantError) throw participantError;

    return chronicle;
  }

  async function joinChronicleByCode({ code }) {
    const { data, error } = await supabase.rpc("join_chronicle_by_code", {
      p_code: code,
    });
    if (error) throw error;
    return data;
  }

  ns.service = {
    fetchCurrentPlayer,
    fetchChroniclesForPlayer,
    fetchParticipantsByChronicleIds,
    fetchCharactersByChronicleIds,
    createChronicle,
    joinChronicleByCode,
  };
})(window);

