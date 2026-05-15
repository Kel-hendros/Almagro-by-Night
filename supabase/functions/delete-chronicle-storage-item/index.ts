import { createClient } from "npm:@supabase/supabase-js@2";

type ChronicleRow = {
  id: string;
  creator_id: string | null;
  banner_url: string | null;
};

type PlayerRow = {
  id: string;
  user_id: string | null;
};

type EncounterRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  status: string | null;
  data: { map?: { backgroundPath?: unknown } } | null;
  chronicle_id: string | null;
};

type EncounterBackgroundRow = {
  image_path: string | null;
};

type AssetRow = {
  id: string;
  owner_user_id: string | null;
  image_path: string | null;
  name: string | null;
  chronicle_id: string | null;
};

type RevelationRow = {
  id: string;
  chronicle_id: string | null;
  title: string | null;
  image_url: string | null;
  created_by_player_id: string | null;
};

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  Vary: "Origin, Access-Control-Request-Headers",
};

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...CORS_HEADERS,
    },
  });
}

function getBearerToken(req: Request) {
  const header = String(req.headers.get("authorization") || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
}

function normalizePath(value: unknown) {
  return String(value || "").trim().replace(/^\/+/, "");
}

function uniquePaths(paths: unknown[]) {
  return [...new Set(paths.map(normalizePath).filter(Boolean))];
}

function parseBannerPath(publicUrl: unknown) {
  const raw = String(publicUrl || "").trim();
  const marker = "/chronicle-banners/";
  const index = raw.indexOf(marker);
  if (index < 0) return "";
  return normalizePath(raw.slice(index + marker.length));
}

function parsePrivateImageRef(imageRef: unknown) {
  const raw = String(imageRef || "").trim();
  const prefix = "abn-private://";
  if (!raw.startsWith(prefix)) return null;
  const suffix = raw.slice(prefix.length);
  const slash = suffix.indexOf("/");
  if (slash <= 0) return null;
  return {
    bucketId: suffix.slice(0, slash),
    objectPath: normalizePath(suffix.slice(slash + 1)),
  };
}

function isNarrationUser(userId: string | null | undefined, narratorUserIds: Set<string>) {
  return Boolean(userId && narratorUserIds.has(userId));
}

function isNarrationPlayer(playerId: string | null | undefined, narratorPlayerIds: Set<string>) {
  return Boolean(playerId && narratorPlayerIds.has(playerId));
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: CORS_HEADERS,
    });
  }

  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const bearerToken = getBearerToken(req);
  if (!bearerToken) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(bearerToken);
  if (userError || !user?.id) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const chronicleId = String(body?.chronicleId || "").trim();
  const itemType = String(body?.itemType || "").trim();
  const itemId = String(body?.itemId || "").trim();
  if (!chronicleId || !itemType || !itemId) {
    return jsonResponse({ error: "invalid_request" }, 400);
  }

  const [{ data: player }, { data: chronicle, error: chronicleError }, { data: narrators }] =
    await Promise.all([
      supabase
        .from("players")
        .select("id, user_id")
        .eq("user_id", user.id)
        .maybeSingle<PlayerRow>(),
      supabase
        .from("chronicles")
        .select("id, creator_id, banner_url")
        .eq("id", chronicleId)
        .maybeSingle<ChronicleRow>(),
      supabase
        .from("chronicle_participants")
        .select("player_id")
        .eq("chronicle_id", chronicleId)
        .eq("role", "narrator"),
    ]);

  if (chronicleError) {
    return jsonResponse({ error: chronicleError.message || "chronicle_lookup_failed" }, 500);
  }
  if (!chronicle) {
    return jsonResponse({ error: "chronicle_not_found" }, 404);
  }

  const narratorPlayerIds = new Set<string>();
  if (chronicle.creator_id) narratorPlayerIds.add(chronicle.creator_id);
  for (const row of narrators || []) {
    if (row?.player_id) narratorPlayerIds.add(String(row.player_id));
  }

  const { data: narratorPlayerRows, error: narratorPlayersError } = await supabase
    .from("players")
    .select("id, user_id")
    .in("id", [...narratorPlayerIds])
    .returns<PlayerRow[]>();
  if (narratorPlayersError) {
    return jsonResponse({ error: narratorPlayersError.message || "narrator_lookup_failed" }, 500);
  }

  const narratorUserIds = new Set<string>();
  for (const narratorPlayer of narratorPlayerRows || []) {
    if (narratorPlayer.user_id) narratorUserIds.add(narratorPlayer.user_id);
  }

  const callerCanManage = Boolean(player?.id && narratorPlayerIds.has(player.id));
  if (!callerCanManage) {
    return jsonResponse({ error: "not_authorized" }, 403);
  }

  if (itemType === "encounter") {
    const { data: encounter, error: encounterError } = await supabase
      .from("encounters")
      .select("id, user_id, name, status, data, chronicle_id")
      .eq("id", itemId)
      .eq("chronicle_id", chronicleId)
      .maybeSingle<EncounterRow>();
    if (encounterError) {
      return jsonResponse({ error: encounterError.message || "encounter_lookup_failed" }, 500);
    }
    if (!encounter) return jsonResponse({ error: "not_found" }, 404);
    if (encounter.status !== "archived") {
      return jsonResponse({ error: "not_archived" }, 400);
    }
    if (!isNarrationUser(encounter.user_id, narratorUserIds)) {
      return jsonResponse({ error: "not_narration_upload" }, 403);
    }

    const { data: backgroundRows, error: backgroundError } = await supabase
      .from("encounter_backgrounds")
      .select("image_path")
      .eq("encounter_id", encounter.id)
      .returns<EncounterBackgroundRow[]>();
    if (backgroundError) {
      return jsonResponse({ error: backgroundError.message || "background_lookup_failed" }, 500);
    }

    const paths = uniquePaths([
      encounter.data?.map?.backgroundPath,
      ...(backgroundRows || []).map((row) => row.image_path),
    ]);
    if (paths.length) {
      const { error: removeError } = await supabase.storage
        .from("encounter-backgrounds")
        .remove(paths);
      if (removeError) return jsonResponse({ error: removeError.message }, 500);
    }

    const { data: deletedEncounter, error: deleteError } = await supabase
      .from("encounters")
      .delete()
      .eq("id", encounter.id)
      .eq("status", "archived")
      .select("id")
      .maybeSingle();
    if (deleteError || !deletedEncounter) {
      return jsonResponse({ error: deleteError?.message || "encounter_delete_failed" }, 500);
    }
    return jsonResponse({ deleted: true, itemType, itemId, removedObjects: paths.length });
  }

  if (itemType === "asset") {
    const { data: asset, error: assetError } = await supabase
      .from("encounter_design_assets")
      .select("id, owner_user_id, image_path, name, chronicle_id")
      .eq("id", itemId)
      .eq("chronicle_id", chronicleId)
      .maybeSingle<AssetRow>();
    if (assetError) return jsonResponse({ error: assetError.message }, 500);
    if (!asset) return jsonResponse({ error: "not_found" }, 404);
    if (!isNarrationUser(asset.owner_user_id, narratorUserIds)) {
      return jsonResponse({ error: "not_narration_upload" }, 403);
    }

    const { data: encounters, error: encounterError } = await supabase
      .from("encounters")
      .select("id, data")
      .eq("chronicle_id", chronicleId);
    if (encounterError) return jsonResponse({ error: encounterError.message }, 500);
    const isUsed = (encounters || []).some((row) => {
      const data = row?.data || {};
      const designTokens = Array.isArray(data.designTokens) ? data.designTokens : [];
      const props = Array.isArray(data.props) ? data.props : [];
      return [...designTokens, ...props].some((item) => String(item?.assetId || "") === asset.id);
    });
    if (isUsed) {
      return jsonResponse({ error: "asset_in_use" }, 409);
    }

    const path = normalizePath(asset.image_path);
    if (path) {
      const { error: removeError } = await supabase.storage
        .from("encounter-assets")
        .remove([path]);
      if (removeError) return jsonResponse({ error: removeError.message }, 500);
    }

    const { data: deletedAsset, error: deleteError } = await supabase
      .from("encounter_design_assets")
      .delete()
      .eq("id", asset.id)
      .select("id")
      .maybeSingle();
    if (deleteError || !deletedAsset) {
      return jsonResponse({ error: deleteError?.message || "asset_delete_failed" }, 500);
    }
    return jsonResponse({ deleted: true, itemType, itemId, removedObjects: path ? 1 : 0 });
  }

  if (itemType === "banner") {
    const path = normalizePath(itemId);
    const currentBannerPath = parseBannerPath(chronicle.banner_url);
    if (!path || path !== currentBannerPath) {
      return jsonResponse({ error: "not_found" }, 404);
    }

    const { error: removeError } = await supabase.storage
      .from("chronicle-banners")
      .remove([path]);
    if (removeError) return jsonResponse({ error: removeError.message }, 500);

    const { data: updatedChronicle, error: updateError } = await supabase
      .from("chronicles")
      .update({ banner_url: null, banner_config: null })
      .eq("id", chronicleId)
      .select("id")
      .maybeSingle();
    if (updateError || !updatedChronicle) {
      return jsonResponse({ error: updateError?.message || "banner_update_failed" }, 500);
    }
    return jsonResponse({ deleted: true, itemType, itemId, removedObjects: 1 });
  }

  if (itemType === "revelation") {
    const { data: revelation, error: revelationError } = await supabase
      .from("revelations")
      .select("id, chronicle_id, title, image_url, created_by_player_id")
      .eq("id", itemId)
      .eq("chronicle_id", chronicleId)
      .maybeSingle<RevelationRow>();
    if (revelationError) return jsonResponse({ error: revelationError.message }, 500);
    if (!revelation) return jsonResponse({ error: "not_found" }, 404);
    if (!isNarrationPlayer(revelation.created_by_player_id, narratorPlayerIds)) {
      return jsonResponse({ error: "not_narration_upload" }, 403);
    }

    const parsed = parsePrivateImageRef(revelation.image_url);
    if (parsed?.bucketId && parsed.bucketId !== "revelations-private") {
      return jsonResponse({ error: "unsupported_storage_ref" }, 400);
    }
    if (parsed?.bucketId && parsed?.objectPath) {
      const { error: removeError } = await supabase.storage
        .from(parsed.bucketId)
        .remove([parsed.objectPath]);
      if (removeError) return jsonResponse({ error: removeError.message }, 500);
    }

    const { data: deletedRevelation, error: deleteError } = await supabase
      .from("revelations")
      .delete()
      .eq("id", revelation.id)
      .select("id")
      .maybeSingle();
    if (deleteError || !deletedRevelation) {
      return jsonResponse({ error: deleteError?.message || "revelation_delete_failed" }, 500);
    }
    return jsonResponse({
      deleted: true,
      itemType,
      itemId,
      removedObjects: parsed?.objectPath ? 1 : 0,
    });
  }

  return jsonResponse({ error: "unsupported_item_type" }, 400);
});
