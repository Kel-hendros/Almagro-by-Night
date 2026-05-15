import { createClient } from "npm:@supabase/supabase-js@2";

type EncounterRow = {
  id: string;
  user_id: string | null;
  name: string | null;
  status: string | null;
  data: {
    map?: {
      backgroundPath?: unknown;
    };
  } | null;
  chronicle_id: string | null;
};

type ChronicleRow = {
  id: string;
  creator_id: string | null;
};

type PlayerRow = {
  id: string;
};

type EncounterBackgroundRow = {
  image_path: string | null;
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
  const encounterId = String(body?.encounterId || "").trim();
  if (!encounterId) {
    return jsonResponse({ error: "encounter_id_required" }, 400);
  }

  const { data: encounter, error: encounterError } = await supabase
    .from("encounters")
    .select("id, user_id, name, status, data, chronicle_id")
    .eq("id", encounterId)
    .maybeSingle<EncounterRow>();
  if (encounterError) {
    return jsonResponse({ error: encounterError.message || "encounter_lookup_failed" }, 500);
  }
  if (!encounter) {
    return jsonResponse({ error: "not_found" }, 404);
  }
  if (encounter.status !== "archived") {
    return jsonResponse({ error: "not_archived" }, 400);
  }

  let canDelete = encounter.user_id === user.id;
  if (!canDelete && encounter.chronicle_id) {
    const [{ data: player }, { data: chronicle, error: chronicleError }] =
      await Promise.all([
        supabase
          .from("players")
          .select("id")
          .eq("user_id", user.id)
          .maybeSingle<PlayerRow>(),
        supabase
          .from("chronicles")
          .select("id, creator_id")
          .eq("id", encounter.chronicle_id)
          .maybeSingle<ChronicleRow>(),
      ]);

    if (chronicleError) {
      return jsonResponse({ error: chronicleError.message || "chronicle_lookup_failed" }, 500);
    }
    canDelete = Boolean(player?.id && chronicle?.creator_id === player.id);
  }

  if (!canDelete) {
    return jsonResponse({ error: "not_authorized" }, 403);
  }

  const { data: backgroundRows, error: backgroundError } = await supabase
    .from("encounter_backgrounds")
    .select("image_path")
    .eq("encounter_id", encounter.id)
    .returns<EncounterBackgroundRow[]>();
  if (backgroundError) {
    return jsonResponse({ error: backgroundError.message || "background_lookup_failed" }, 500);
  }

  const backgroundPaths = uniquePaths([
    encounter.data?.map?.backgroundPath,
    ...(backgroundRows || []).map((row) => row.image_path),
  ]);

  let deletedBackgroundObjects = 0;
  if (backgroundPaths.length) {
    const { data: removedObjects, error: removeError } = await supabase.storage
      .from("encounter-backgrounds")
      .remove(backgroundPaths);

    if (removeError) {
      return jsonResponse({ error: removeError.message || "storage_delete_failed" }, 500);
    }
    deletedBackgroundObjects = removedObjects?.length || backgroundPaths.length;
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

  return jsonResponse({
    deleted: true,
    encounterId: encounter.id,
    deletedBackgroundObjects,
  });
});
