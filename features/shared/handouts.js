(function initSharedRevelations(global) {
  const root = (global.ABNShared = global.ABNShared || {});
  const REVELATIONS_BUCKET_ID = "revelations-private";
  const PRIVATE_IMAGE_REF_PREFIX = "abn-private://";
  const SIGNED_URL_TTL_SECONDS = 60 * 60;
  const SIGNED_URL_CACHE_TTL = 45 * 60 * 1000;
  const SURL_PREFIX = "abn-surl:";
  const MAX_IMAGE_SIZE_BYTES = 10 * 1024 * 1024;
  const CHRONICLE_STORAGE_LIMIT_REACHED_CODE = "chronicle_storage_limit_reached";
  const CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE =
    "Has alcanzado el límite de almacenamiento de esta Crónica.\nPuedes borrar elementos que ya no utilices para liberar espacio o pasar a un plan superior para aumentar tu límite.";

  function getSupabase() {
    return global.supabase || null;
  }

  function buildObjectPath({ chronicleId, fileName }) {
    const safeChronicleId = String(chronicleId || "").trim().toLowerCase();
    const dot = fileName.lastIndexOf(".");
    const ext = dot > -1 ? fileName.slice(dot + 1).toLowerCase() : "bin";
    const safeExt = ext.replace(/[^a-z0-9]/g, "") || "bin";
    const randomPart = Math.random().toString(36).slice(2, 10);
    const timestamp = Date.now();
    return `chronicle/${safeChronicleId}/revelations/${timestamp}-${randomPart}.${safeExt}`;
  }

  function buildPrivateImageRef(bucketId, objectPath) {
    return `${PRIVATE_IMAGE_REF_PREFIX}${bucketId}/${objectPath}`;
  }

  function parsePrivateImageRef(imageRef) {
    const raw = String(imageRef || "").trim();
    if (!raw.startsWith(PRIVATE_IMAGE_REF_PREFIX)) return null;
    const suffix = raw.slice(PRIVATE_IMAGE_REF_PREFIX.length);
    const slash = suffix.indexOf("/");
    if (slash <= 0) return null;
    const bucketId = suffix.slice(0, slash);
    const objectPath = suffix.slice(slash + 1);
    if (!bucketId || !objectPath) return null;
    return { bucketId, objectPath };
  }

  function isSupportedImage(file) {
    if (!file) return false;
    const type = String(file.type || "").toLowerCase();
    return (
      type === "image/png" ||
      type === "image/jpeg" ||
      type === "image/webp" ||
      type === "image/gif" ||
      type === "image/avif"
    );
  }

  function isBucketNotFoundError(error) {
    const msg = String(error?.message || "").toLowerCase();
    return msg.includes("bucket not found") || msg.includes("not found");
  }

  async function ensureRevelationsBucket() {
    const supabase = getSupabase();
    if (!supabase) return { bucketId: REVELATIONS_BUCKET_ID, error: null };
    const { data, error } = await supabase.rpc("ensure_revelations_storage_bucket");
    if (error) return { bucketId: REVELATIONS_BUCKET_ID, error };
    return { bucketId: String(data || REVELATIONS_BUCKET_ID), error: null };
  }

  async function uploadHandoutImage({ chronicleId, file }) {
    const supabase = getSupabase();
    if (!supabase || !chronicleId) {
      return { imageRef: null, error: new Error("Contexto incompleto para subir imagen.") };
    }
    if (!file) {
      return { imageRef: null, error: new Error("Selecciona una imagen para subir.") };
    }
    if (!isSupportedImage(file)) {
      return {
        imageRef: null,
        error: new Error("Formato no soportado. Usa PNG, JPG, WEBP, GIF o AVIF."),
      };
    }
    if (Number(file.size || 0) > MAX_IMAGE_SIZE_BYTES) {
      return { imageRef: null, error: new Error("La imagen supera el límite de 10 MB.") };
    }

    const { data: quotaData, error: quotaError } = await supabase.rpc(
      "check_chronicle_storage_quota",
      {
        p_chronicle_id: chronicleId,
        p_incoming_bytes: Number(file.size || 0),
      },
    );
    if (quotaError) {
      return {
        imageRef: null,
        error: new Error(`No se pudo validar cuota de almacenamiento: ${quotaError.message}`),
      };
    }
    if (quotaData?.error) {
      if (quotaData.error === "not_authorized") {
        return {
          imageRef: null,
          error: new Error("No tenés permisos en esta crónica para subir imágenes."),
        };
      }
      return {
        imageRef: null,
        error: new Error(`No se pudo validar cuota (${quotaData.error}).`),
      };
    }
    if (quotaData && quotaData.allowed === false) {
      const quotaExceededError = new Error(CHRONICLE_STORAGE_LIMIT_REACHED_MESSAGE);
      quotaExceededError.code = CHRONICLE_STORAGE_LIMIT_REACHED_CODE;
      return {
        imageRef: null,
        error: quotaExceededError,
      };
    }

    const fileName = String(file.name || "revelation-image").trim() || "revelation-image";
    const objectPath = buildObjectPath({ chronicleId, fileName });
    const ensured = await ensureRevelationsBucket();

    let { error: uploadError } = await supabase.storage
      .from(ensured.bucketId)
      .upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });

    if (uploadError && isBucketNotFoundError(uploadError)) {
      await ensureRevelationsBucket();
      const retry = await supabase.storage.from(ensured.bucketId).upload(objectPath, file, {
        upsert: false,
        contentType: file.type || undefined,
      });
      uploadError = retry.error || null;
    }

    if (uploadError) return { imageRef: null, error: uploadError };

    return {
      imageRef: buildPrivateImageRef(ensured.bucketId, objectPath),
      error: null,
    };
  }

  async function deleteHandoutImage(imageRef) {
    const supabase = getSupabase();
    if (!supabase) return { error: null };
    const parsed = parsePrivateImageRef(imageRef);
    if (!parsed) return { error: null };

    const { error } = await supabase.storage.from(parsed.bucketId).remove([parsed.objectPath]);
    return { error: error || null };
  }

  function getPersistedUrl(ref) {
    try {
      const raw = sessionStorage.getItem(SURL_PREFIX + ref);
      if (!raw) return null;
      const entry = JSON.parse(raw);
      if (Date.now() >= entry.exp) {
        sessionStorage.removeItem(SURL_PREFIX + ref);
        return null;
      }
      return entry.url;
    } catch { return null; }
  }

  function persistUrl(ref, url) {
    try {
      sessionStorage.setItem(SURL_PREFIX + ref, JSON.stringify({
        url, exp: Date.now() + SIGNED_URL_CACHE_TTL,
      }));
    } catch { /* storage full */ }
  }

  async function resolveImageSignedUrl(imageRef) {
    const ref = String(imageRef || "").trim();
    if (!ref) return "";

    const persisted = getPersistedUrl(ref);
    if (persisted) return persisted;

    const cache = global.ABNCache;
    const fetcher = async () => {
      const url = await fetchSignedUrl(ref);
      if (url) persistUrl(ref, url);
      return url;
    };

    if (cache) {
      return cache.get(`signed-url:${ref}`, fetcher, { ttl: SIGNED_URL_CACHE_TTL });
    }
    return fetcher();
  }

  async function fetchSignedUrl(imageRef) {
    const supabase = getSupabase();
    const parsed = parsePrivateImageRef(imageRef);
    if (!supabase || !parsed) return "";

    const { data, error } = await supabase.storage
      .from(parsed.bucketId)
      .createSignedUrl(parsed.objectPath, SIGNED_URL_TTL_SECONDS);
    if (error) {
      console.warn("Revelaciones: no se pudo firmar URL de imagen:", error.message);
      return "";
    }
    return String(data?.signedUrl || "");
  }

  async function withSignedImageUrls(rows) {
    const list = Array.isArray(rows) ? rows : [];
    if (!list.length) return [];
    return Promise.all(
      list.map(async (row) => ({
        ...row,
        image_signed_url: await resolveImageSignedUrl(row?.image_url),
      })),
    );
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
    imageRef,
    recipientPlayerIds,
    tags,
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
    const cleanTags = (Array.isArray(tags) ? tags : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean);

    const { data: revelation, error: revelationError } = await supabase
      .from("revelations")
      .insert({
        chronicle_id: chronicleId,
        title: cleanTitle,
        body_markdown: cleanBody,
        image_url: String(imageRef || "").trim() || null,
        created_by_player_id: createdByPlayerId,
        tags: cleanTags,
      })
      .select("id, chronicle_id, title, body_markdown, image_url, created_at, created_by_player_id, tags")
      .maybeSingle();

    if (revelationError || !revelation) {
      return {
        handout: null,
        error: revelationError || new Error("No se pudo crear revelación."),
      };
    }

    if (recipients.length) {
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
    }

    // Notification is generated automatically by DB trigger on revelation_players insert.

    return { handout: revelation, error: null };
  }

  async function updateHandout({
    revelationId,
    title,
    bodyMarkdown,
    imageRef,
    recipientPlayerIds,
    tags,
  }) {
    const supabase = getSupabase();
    if (!supabase || !revelationId) {
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

    const { data: currentRevelation, error: currentError } = await supabase
      .from("revelations")
      .select("id, image_url")
      .eq("id", revelationId)
      .maybeSingle();
    if (currentError || !currentRevelation) {
      return {
        handout: null,
        error: currentError || new Error("No se pudo cargar revelación actual."),
      };
    }

    const nextImageRef = String(imageRef || "").trim() || null;
    const cleanTags = (Array.isArray(tags) ? tags : [])
      .map((t) => String(t || "").trim())
      .filter(Boolean);

    const { data: revelation, error: revelationError } = await supabase
      .from("revelations")
      .update({
        title: cleanTitle,
        body_markdown: cleanBody,
        image_url: nextImageRef,
        tags: cleanTags,
      })
      .eq("id", revelationId)
      .select("id, chronicle_id, title, body_markdown, image_url, created_at, created_by_player_id, tags")
      .maybeSingle();

    if (revelationError || !revelation) {
      return {
        handout: null,
        error: revelationError || new Error("No se pudo actualizar revelación."),
      };
    }

    const { data: existingAssoc, error: existingAssocError } = await supabase
      .from("revelation_players")
      .select("id, player_id")
      .eq("revelation_id", revelationId);
    if (existingAssocError) {
      return { handout: null, error: existingAssocError };
    }

    const existingRows = existingAssoc || [];
    const existingPlayerIds = new Set(
      existingRows.map((row) => String(row.player_id || "")).filter(Boolean),
    );
    const wantedPlayerIds = new Set(recipients);

    const toDeleteIds = existingRows
      .filter((row) => !wantedPlayerIds.has(String(row.player_id || "")))
      .map((row) => row.id)
      .filter(Boolean);
    if (toDeleteIds.length) {
      const { error: deleteError } = await supabase
        .from("revelation_players")
        .delete()
        .in("id", toDeleteIds);
      if (deleteError) {
        return { handout: null, error: deleteError };
      }
    }

    const toInsert = recipients
      .filter((playerId) => !existingPlayerIds.has(playerId))
      .map((playerId) => ({
        revelation_id: revelationId,
        player_id: playerId,
      }));
    if (toInsert.length) {
      const { error: insertError } = await supabase
        .from("revelation_players")
        .insert(toInsert);
      if (insertError) {
        return { handout: null, error: insertError };
      }
    }

    const previousImageRef = String(currentRevelation.image_url || "").trim();
    if (previousImageRef && previousImageRef !== nextImageRef) {
      await deleteHandoutImage(previousImageRef);
    }

    return { handout: revelation, error: null };
  }

  async function listHandoutsByChronicle(chronicleId) {
    const supabase = getSupabase();
    if (!supabase || !chronicleId) return [];

    const { data: revelations, error: revError } = await supabase
      .from("revelations")
      .select("id, chronicle_id, title, body_markdown, image_url, created_at, created_by_player_id, tags")
      .eq("chronicle_id", chronicleId)
      .order("created_at", { ascending: false });
    if (revError) {
      console.warn("Revelaciones: no se pudo cargar archivo:", revError.message);
      return [];
    }

    const rowsWithSigned = await withSignedImageUrls(revelations || []);
    const ids = rowsWithSigned.map((r) => r.id).filter(Boolean);
    if (!ids.length) return [];

    const recipientCharacters = await getCachedRecipientCharacters(chronicleId, null);
    const characterByPlayerId = new Map();
    (recipientCharacters || []).forEach((row) => {
      const playerId = String(row?.player_id || "").trim();
      if (!playerId || characterByPlayerId.has(playerId)) return;
      characterByPlayerId.set(playerId, row);
    });

    const { data: assoc, error: assocError } = await supabase
      .from("revelation_players")
      .select("id, revelation_id, player_id, associated_at, player:players(id, name)")
      .in("revelation_id", ids)
      .order("associated_at", { ascending: true });
    if (assocError) {
      console.warn("Revelaciones: no se pudieron cargar asociaciones:", assocError.message);
      return rowsWithSigned;
    }

    const byRevelation = new Map();
    (assoc || []).forEach((row) => {
      const player = Array.isArray(row.player) ? row.player[0] || null : row.player || null;
      const character = characterByPlayerId.get(String(row.player_id || "").trim()) || null;
      if (!byRevelation.has(row.revelation_id)) byRevelation.set(row.revelation_id, []);
      byRevelation.get(row.revelation_id).push({
        id: row.id,
        recipient_player_id: row.player_id,
        recipient: {
          id: player?.id || row.player_id,
          name: player?.name || "Jugador",
          character_name: character?.character_name || player?.name || "Personaje",
          character_sheet_id: character?.character_sheet_id || null,
          avatar_url: character?.avatar_url || "",
        },
        delivered_at: row.associated_at,
        status: "associated",
      });
    });

    return rowsWithSigned.map((rev) => ({
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

  async function rebroadcastHandout(revelationId) {
    const supabase = getSupabase();
    if (!supabase || !revelationId) return { count: 0, error: null };

    const { data: existingRows, error: existingError } = await supabase
      .from("revelation_players")
      .select("id, player_id")
      .eq("revelation_id", revelationId);
    if (existingError) {
      return { count: 0, error: existingError };
    }

    const rows = Array.isArray(existingRows) ? existingRows : [];
    if (!rows.length) {
      return { count: 0, error: null };
    }

    const idsToDelete = rows.map((row) => row.id).filter(Boolean);
    if (idsToDelete.length) {
      const { error: deleteError } = await supabase
        .from("revelation_players")
        .delete()
        .in("id", idsToDelete);
      if (deleteError) {
        return { count: 0, error: deleteError };
      }
    }

    const toInsert = rows
      .map((row) => String(row.player_id || "").trim())
      .filter(Boolean)
      .map((playerId) => ({
        revelation_id: revelationId,
        player_id: playerId,
      }));

    const { data, error } = await supabase
      .from("revelation_players")
      .insert(toInsert)
      .select("id");

    return {
      count: Array.isArray(data) ? data.length : 0,
      error: error || null,
    };
  }

  async function deleteHandout(revelationId) {
    const supabase = getSupabase();
    if (!supabase || !revelationId) return { error: null };

    const { data: existing } = await supabase
      .from("revelations")
      .select("id, image_url")
      .eq("id", revelationId)
      .maybeSingle();

    const { error } = await supabase
      .from("revelations")
      .delete()
      .eq("id", revelationId);
    if (!error && existing?.image_url) {
      await deleteHandoutImage(existing.image_url);
    }
    return { error: error || null };
  }

  async function listPendingDeliveries({ playerId, chronicleId }) {
    const supabase = getSupabase();
    if (!supabase || !playerId) return [];

    const { data, error } = await supabase
      .from("revelation_players")
      .select(
        "id, revelation_id, player_id, associated_at, handout:revelations(id, chronicle_id, title, body_markdown, image_url, created_at, tags)"
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
    const rowsWithSigned = await Promise.all(
      rows.map(async (row) => {
        const handout = row.handout || null;
        if (!handout) return row;
        return {
          ...row,
          handout: {
            ...handout,
            image_signed_url: await resolveImageSignedUrl(handout.image_url),
          },
        };
      }),
    );
    if (!chronicleId) return rowsWithSigned;
    return rowsWithSigned.filter((row) => row?.handout?.chronicle_id === chronicleId);
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

  async function getRecipientCharacters(chronicleId, excludePlayerId) {
    const supabase = getSupabase();
    if (!supabase || !chronicleId) return [];

    const { data: ccRows, error: ccError } = await supabase
      .from("chronicle_characters")
      .select("character_sheet:character_sheets(id, name, user_id, data, avatar_url)")
      .eq("chronicle_id", chronicleId);
    if (ccError) {
      console.warn("Revelaciones: personajes de crónica no disponibles:", ccError.message);
      return [];
    }

    const sheets = (ccRows || [])
      .map((row) => row.character_sheet)
      .filter((sheet) => sheet?.id && sheet?.user_id);
    if (!sheets.length) return [];

    const userIds = Array.from(new Set(sheets.map((sheet) => String(sheet.user_id))));
    if (!userIds.length) return [];

    const { data: players, error: playersError } = await supabase
      .from("players")
      .select("id, name, user_id")
      .in("user_id", userIds);
    if (playersError) {
      console.warn("Revelaciones: jugadores de personajes no disponibles:", playersError.message);
      return [];
    }

    const playerByUserId = new Map();
    (players || []).forEach((player) => {
      if (player?.user_id) playerByUserId.set(String(player.user_id), player);
    });

    return sheets
      .map((sheet) => {
        const player = playerByUserId.get(String(sheet.user_id));
        if (!player?.id) return null;
        const data = sheet.data || {};
        return {
          character_sheet_id: sheet.id,
          character_name: sheet.name || "Personaje",
          avatar_url: data.avatarThumbUrl || sheet.avatar_url || data.avatar_url || "",
          player_id: player.id,
          player_name: player.name || "Jugador",
          user_id: sheet.user_id,
        };
      })
      .filter(Boolean)
      .sort((a, b) => String(a.character_name).localeCompare(String(b.character_name), "es"));
  }

  async function getCachedRecipientCharacters(chronicleId, excludePlayerId) {
    const cache = global.ABNCache;
    if (!cache) return getRecipientCharacters(chronicleId, excludePlayerId);
    const key = `recipient-chars:${chronicleId}`;
    const all = await cache.get(key, () => getRecipientCharacters(chronicleId, null), {
      ttl: 2 * 60 * 1000,
    });
    if (!excludePlayerId) return all;
    return all.filter((row) => row.player_id !== excludePlayerId);
  }

  function invalidateRecipientCharactersCache(chronicleId) {
    global.ABNCache?.invalidate?.(`recipient-chars:${chronicleId}`);
  }

  // Kept as `handouts` namespace for compatibility with existing callers.
  root.handouts = {
    getRecipientCharacters,
    getCachedRecipientCharacters,
    invalidateRecipientCharactersCache,
    getCurrentPlayerByUserId,
    getChronicleParticipants,
    uploadHandoutImage,
    deleteHandoutImage,
    createHandout,
    updateHandout,
    listHandoutsByChronicle,
    revokeDelivery,
    rebroadcastHandout,
    deleteHandout,
    listPendingDeliveries,
    markDeliveryOpened,
    subscribeDeliveriesForPlayer,
    unsubscribeChannel,
    resolveImageSignedUrl,
  };
})(window);
