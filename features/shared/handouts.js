(function initSharedRevelations(global) {
  const root = (global.ABNShared = global.ABNShared || {});

  function getSupabase() {
    return global.supabase || null;
  }

  async function getCurrentPlayerByUserId(userId) {
    const supabase = getSupabase();
    if (!supabase || !userId) return null;
    const { data, error } = await supabase
      .from("players")
      .select("id, name, user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (error) return null;
    return data || null;
  }

  async function getChronicleParticipants(chronicleId) {
    const supabase = getSupabase();
    if (!supabase || !chronicleId) return [];
    const { data, error } = await supabase
      .from("chronicle_participants")
      .select("player_id, role, player:players(id, name, user_id)")
      .eq("chronicle_id", chronicleId)
      .order("player_id", { ascending: true });
    if (error) {
      console.warn("Revelaciones: participantes no disponibles:", error.message);
      return [];
    }
    return data || [];
  }

  async function createHandout({
    chronicleId,
    createdByPlayerId,
    title,
    bodyMarkdown,
    imageUrl,
    recipientPlayerIds,
  }) {
    const supabase = getSupabase();
    if (!supabase || !chronicleId || !createdByPlayerId) {
      return { handout: null, error: new Error("Contexto incompleto.") };
    }

    const cleanTitle = String(title || "").trim();
    const cleanBody = String(bodyMarkdown || "").trim();
    if (!cleanTitle) {
      return { handout: null, error: new Error("El titulo es obligatorio.") };
    }
    if (!cleanBody) {
      return { handout: null, error: new Error("La descripcion es obligatoria.") };
    }
    const recipients = Array.from(
      new Set((recipientPlayerIds || []).map((id) => String(id || "").trim()).filter(Boolean)),
    );
    if (!recipients.length) {
      return { handout: null, error: new Error("Selecciona al menos un destinatario.") };
    }

    const { data: revelation, error: revelationError } = await supabase
      .from("revelations")
      .insert({
        chronicle_id: chronicleId,
        title: cleanTitle,
        body_markdown: cleanBody,
        image_url: String(imageUrl || "").trim() || null,
        created_by_player_id: createdByPlayerId,
      })
      .select("id, chronicle_id, title, body_markdown, image_url, created_at, created_by_player_id")
      .maybeSingle();

    if (revelationError || !revelation) {
      return {
        handout: null,
        error: revelationError || new Error("No se pudo crear revelación."),
      };
    }

    const assocPayload = recipients.map((playerId) => ({
      revelation_id: revelation.id,
      player_id: playerId,
    }));
    const { error: assocError } = await supabase
      .from("revelation_players")
      .insert(assocPayload);
    if (assocError) {
      return { handout: null, error: assocError };
    }

    return { handout: revelation, error: null };
  }

  async function listHandoutsByChronicle(chronicleId) {
    const supabase = getSupabase();
    if (!supabase || !chronicleId) return [];

    const { data: revelations, error: revError } = await supabase
      .from("revelations")
      .select("id, chronicle_id, title, body_markdown, image_url, created_at, created_by_player_id")
      .eq("chronicle_id", chronicleId)
      .order("created_at", { ascending: false });
    if (revError) {
      console.warn("Revelaciones: no se pudo cargar archivo:", revError.message);
      return [];
    }

    const ids = (revelations || []).map((r) => r.id).filter(Boolean);
    if (!ids.length) return [];

    const { data: assoc, error: assocError } = await supabase
      .from("revelation_players")
      .select("id, revelation_id, player_id, associated_at, player:players(name)")
      .in("revelation_id", ids)
      .order("associated_at", { ascending: true });
    if (assocError) {
      console.warn("Revelaciones: no se pudieron cargar asociaciones:", assocError.message);
      return revelations || [];
    }

    const byRevelation = new Map();
    (assoc || []).forEach((row) => {
      if (!byRevelation.has(row.revelation_id)) byRevelation.set(row.revelation_id, []);
      byRevelation.get(row.revelation_id).push({
        id: row.id,
        recipient_player_id: row.player_id,
        recipient: row.player,
        status: "associated",
      });
    });

    return (revelations || []).map((rev) => ({
      ...rev,
      deliveries: byRevelation.get(rev.id) || [],
    }));
  }

  async function revokeDelivery(associationId) {
    const supabase = getSupabase();
    if (!supabase || !associationId) return { error: null };
    const { error } = await supabase
      .from("revelation_players")
      .delete()
      .eq("id", associationId);
    return { error: error || null };
  }

  async function deleteHandout(revelationId) {
    const supabase = getSupabase();
    if (!supabase || !revelationId) return { error: null };
    const { error } = await supabase
      .from("revelations")
      .delete()
      .eq("id", revelationId);
    return { error: error || null };
  }

  async function listPendingDeliveries({ playerId, chronicleId }) {
    const supabase = getSupabase();
    if (!supabase || !playerId) return [];

    const { data, error } = await supabase
      .from("revelation_players")
      .select(
        "id, revelation_id, player_id, associated_at, handout:revelations(id, chronicle_id, title, body_markdown, image_url, created_at)"
      )
      .eq("player_id", playerId)
      .order("associated_at", { ascending: false });
    if (error) {
      console.warn("Revelaciones: no se pudo cargar archivo del jugador:", error.message);
      return [];
    }

    const rows = (data || []).map((row) => ({
      id: row.id,
      handout_id: row.revelation_id,
      recipient_player_id: row.player_id,
      delivered_at: row.associated_at,
      status: "associated",
      handout: row.handout || null,
    }));
    if (!chronicleId) return rows;
    return rows.filter((row) => row?.handout?.chronicle_id === chronicleId);
  }

  async function markDeliveryOpened(_deliveryId, _playerId) {
    // En Archivo de Revelaciones no hay estado opened/pending.
    return { error: null };
  }

  function subscribeDeliveriesForPlayer({ playerId, onChange }) {
    const supabase = getSupabase();
    if (!supabase || !playerId) return null;
    const channel = supabase
      .channel(`revelations-player-${playerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "revelation_players",
          filter: `player_id=eq.${playerId}`,
        },
        () => {
          if (typeof onChange === "function") onChange();
        },
      )
      .subscribe();
    return channel;
  }

  function unsubscribeChannel(channel) {
    if (!channel) return;
    const supabase = getSupabase();
    try {
      channel.unsubscribe?.();
    } catch (_e) {}
    try {
      supabase?.removeChannel?.(channel);
    } catch (_e) {}
  }

  // Kept as `handouts` namespace for compatibility with existing callers.
  root.handouts = {
    getCurrentPlayerByUserId,
    getChronicleParticipants,
    createHandout,
    listHandoutsByChronicle,
    revokeDelivery,
    deleteHandout,
    listPendingDeliveries,
    markDeliveryOpened,
    subscribeDeliveriesForPlayer,
    unsubscribeChannel,
  };
})(window);
