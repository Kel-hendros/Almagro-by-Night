import { createClient } from "npm:@supabase/supabase-js@2";

type ChronicleRow = {
  id: string;
  creator_id: string | null;
};

type PlayerRow = {
  id: string;
  user_id: string | null;
};

type MuestraRow = {
  id: string;
  created_at: string;
  metadata: Record<string, unknown> | null;
};

const MUESTRA_CAP = 10;

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return jsonResponse({ error: "method_not_allowed" }, 405);
  }

  const bearerToken = getBearerToken(req);
  if (!bearerToken) return jsonResponse({ error: "unauthorized" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser(bearerToken);
  if (userError || !user?.id) return jsonResponse({ error: "unauthorized" }, 401);

  const body = await req.json().catch(() => null);
  const chronicleId = String(body?.chronicleId || "").trim();
  if (!chronicleId) return jsonResponse({ error: "chronicle_id_required" }, 400);

  const [{ data: player }, { data: chronicle, error: chronicleError }, { data: narrators }] =
    await Promise.all([
      supabase
        .from("players")
        .select("id, user_id")
        .eq("user_id", user.id)
        .maybeSingle<PlayerRow>(),
      supabase
        .from("chronicles")
        .select("id, creator_id")
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
  if (!chronicle) return jsonResponse({ error: "chronicle_not_found" }, 404);

  const narratorPlayerIds = new Set<string>();
  if (chronicle.creator_id) narratorPlayerIds.add(chronicle.creator_id);
  for (const row of narrators || []) {
    if (row?.player_id) narratorPlayerIds.add(String(row.player_id));
  }

  const callerCanManage = Boolean(player?.id && narratorPlayerIds.has(player.id));
  if (!callerCanManage) return jsonResponse({ error: "not_authorized" }, 403);

  const { data: muestras, error: listError } = await supabase
    .from("chronicle_notifications")
    .select("id, created_at, metadata")
    .eq("chronicle_id", chronicleId)
    .eq("type", "muestra")
    .order("created_at", { ascending: false })
    .returns<MuestraRow[]>();
  if (listError) {
    return jsonResponse({ error: listError.message || "list_failed" }, 500);
  }

  const active = (muestras || []).filter((row) => {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    return meta.deleted !== true;
  });

  if (active.length <= MUESTRA_CAP) {
    return jsonResponse({
      pruned: 0,
      activeCount: active.length,
      cap: MUESTRA_CAP,
    });
  }

  const toPrune = active.slice(MUESTRA_CAP);
  const prunedIds: string[] = [];
  let removedObjects = 0;

  for (const row of toPrune) {
    const meta = (row.metadata || {}) as Record<string, unknown>;
    const imageRef = String(meta.imageRef || "").trim();
    const parsed = parsePrivateImageRef(imageRef);

    if (parsed?.bucketId === "revelations-private" && parsed?.objectPath) {
      const { error: removeError } = await supabase.storage
        .from(parsed.bucketId)
        .remove([parsed.objectPath]);
      if (!removeError) removedObjects += 1;
    }

    const nextMetadata = { ...meta, deleted: true, signedUrl: null };
    const { error: updateError } = await supabase
      .from("chronicle_notifications")
      .update({ metadata: nextMetadata })
      .eq("id", row.id);
    if (!updateError) prunedIds.push(row.id);
  }

  return jsonResponse({
    pruned: prunedIds.length,
    prunedIds,
    removedObjects,
    activeCount: active.length - prunedIds.length,
    cap: MUESTRA_CAP,
  });
});
