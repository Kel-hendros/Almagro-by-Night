// One-off cleanup of orphan blobs in revelations-private:
// removes storage objects under chronicle/<id>/... that are not referenced by
// any revelations row or any chronicle_notifications row.
import { createClient } from "npm:@supabase/supabase-js@2";

type ChronicleRow = {
  id: string;
  creator_id: string | null;
};

type PlayerRow = {
  id: string;
  user_id: string | null;
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
  const dryRun = body?.dryRun === true;

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
  if (!player?.id || !narratorPlayerIds.has(player.id)) {
    return jsonResponse({ error: "not_authorized" }, 403);
  }

  // List all objects under chronicle/<id>/revelations/
  const chroniclePrefix = `chronicle/${chronicleId}/revelations`;
  const { data: objects, error: listError } = await supabase.storage
    .from("revelations-private")
    .list(chroniclePrefix, { limit: 1000, sortBy: { column: "name", order: "asc" } });
  if (listError) {
    return jsonResponse({ error: listError.message || "list_failed" }, 500);
  }

  const allPaths = (objects || [])
    .filter((entry) => entry?.name && entry?.id) // skip folder placeholders
    .map((entry) => `${chroniclePrefix}/${entry.name}`);

  if (!allPaths.length) {
    return jsonResponse({ totalObjects: 0, orphans: [], removed: 0, dryRun });
  }

  // Find which paths are referenced anywhere
  const refValues = allPaths.map((p) => `abn-private://revelations-private/${p}`);

  const { data: revRows } = await supabase
    .from("revelations")
    .select("image_url")
    .eq("chronicle_id", chronicleId)
    .in("image_url", refValues);

  const { data: notifRows } = await supabase
    .from("chronicle_notifications")
    .select("metadata")
    .eq("chronicle_id", chronicleId)
    .eq("type", "muestra");

  const referenced = new Set<string>();
  for (const row of revRows || []) {
    if (row?.image_url) referenced.add(String(row.image_url));
  }
  for (const row of notifRows || []) {
    const meta = (row?.metadata || {}) as Record<string, unknown>;
    const ref = String(meta.imageRef || "").trim();
    if (ref) referenced.add(ref);
  }

  const orphanPaths = allPaths.filter(
    (path) => !referenced.has(`abn-private://revelations-private/${path}`),
  );

  if (dryRun || !orphanPaths.length) {
    return jsonResponse({
      totalObjects: allPaths.length,
      referencedCount: referenced.size,
      orphans: orphanPaths,
      removed: 0,
      dryRun,
    });
  }

  const { error: removeError } = await supabase.storage
    .from("revelations-private")
    .remove(orphanPaths);
  if (removeError) {
    return jsonResponse({ error: removeError.message }, 500);
  }

  return jsonResponse({
    totalObjects: allPaths.length,
    referencedCount: referenced.size,
    orphans: orphanPaths,
    removed: orphanPaths.length,
    dryRun: false,
  });
});
