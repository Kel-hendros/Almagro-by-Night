import { createClient } from "npm:@supabase/supabase-js@2";

type RecapRow = {
  id: string;
  chronicle_id: string;
};

type ChronicleRow = {
  id: string;
  creator_id: string;
};

type ShareRow = {
  share_token: string;
  recap_id: string;
  chronicle_id: string;
  is_active: boolean;
};

const DEFAULT_APP_PUBLIC_URL = "https://kel-hendros.github.io/Almagro-by-Night/";
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

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildAppBaseUrl() {
  const configured = String(Deno.env.get("APP_PUBLIC_URL") || "").trim();
  return withTrailingSlash(configured || DEFAULT_APP_PUBLIC_URL);
}

function buildAppUrl(shareToken: string) {
  const baseUrl = buildAppBaseUrl().replace(/\/$/, "");
  return `${baseUrl}#public-recap?token=${encodeURIComponent(shareToken)}`;
}

function buildShareUrl(shareToken: string) {
  const baseUrl = String(Deno.env.get("SUPABASE_URL") || "").trim().replace(/\/$/, "");
  if (!baseUrl) return "";
  return `${baseUrl}/functions/v1/public-recap-share/${encodeURIComponent(shareToken)}`;
}

function decodeJwtPayload(token: string) {
  const parts = String(token || "").split(".");
  if (parts.length < 2) return null;
  try {
    const normalized = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const padded = normalized + "=".repeat((4 - (normalized.length % 4 || 4)) % 4);
    return JSON.parse(atob(padded));
  } catch {
    return null;
  }
}

function getBearerToken(req: Request) {
  const header = String(req.headers.get("authorization") || "");
  if (!header.toLowerCase().startsWith("bearer ")) return "";
  return header.slice(7).trim();
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
  const jwt = decodeJwtPayload(bearerToken);
  const userId = String(jwt?.sub || "").trim();
  if (!userId) {
    return jsonResponse({ error: "unauthorized" }, 401);
  }

  const body = await req.json().catch(() => null);
  const recapId = String(body?.recapId || "").trim();
  const mode = String(body?.mode || "ensure").trim().toLowerCase();
  if (!recapId) {
    return jsonResponse({ error: "recap_id_required" }, 400);
  }
  if (mode !== "ensure" && mode !== "refresh_if_exists") {
    return jsonResponse({ error: "invalid_mode" }, 400);
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: player, error: playerError } = await supabase
    .from("players")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (playerError || !player?.id) {
    return jsonResponse({ error: "player_not_found" }, 403);
  }

  const { data: recap, error: recapError } = await supabase
    .from("session_recaps")
    .select("id, chronicle_id")
    .eq("id", recapId)
    .maybeSingle<RecapRow>();
  if (recapError || !recap) {
    return jsonResponse({ error: "recap_not_found" }, 404);
  }

  const { data: chronicle, error: chronicleError } = await supabase
    .from("chronicles")
    .select("id, creator_id")
    .eq("id", recap.chronicle_id)
    .maybeSingle<ChronicleRow>();
  if (chronicleError || !chronicle) {
    return jsonResponse({ error: "chronicle_not_found" }, 404);
  }

  const { data: participation } = await supabase
    .from("chronicle_participants")
    .select("role")
    .eq("chronicle_id", chronicle.id)
    .eq("player_id", player.id)
    .maybeSingle();

  const isNarrator =
    participation?.role === "narrator" ||
    String(chronicle.creator_id || "") === String(player.id || "");

  if (!isNarrator) {
    return jsonResponse({ error: "not_authorized" }, 403);
  }

  let { data: share } = await supabase
    .from("recap_shares")
    .select("share_token, recap_id, chronicle_id, is_active")
    .eq("recap_id", recap.id)
    .maybeSingle<ShareRow>();

  if (!share && mode === "refresh_if_exists") {
    return jsonResponse({ published: false, shareToken: null, shareUrl: null, appUrl: null }, 200);
  }

  if (!share) {
    const insert = await supabase
      .from("recap_shares")
      .insert({
        recap_id: recap.id,
        chronicle_id: chronicle.id,
        created_by_player_id: player.id,
        is_active: true,
      })
      .select("share_token, recap_id, chronicle_id, is_active")
      .maybeSingle<ShareRow>();

    if (insert.error || !insert.data) {
      return jsonResponse({ error: insert.error?.message || "share_insert_failed" }, 500);
    }
    share = insert.data;
  } else if (!share.is_active) {
    const activate = await supabase
      .from("recap_shares")
      .update({ is_active: true })
      .eq("recap_id", recap.id)
      .select("share_token, recap_id, chronicle_id, is_active")
      .maybeSingle<ShareRow>();

    if (activate.error || !activate.data) {
      return jsonResponse({ error: activate.error?.message || "share_activate_failed" }, 500);
    }
    share = activate.data;
  }

  return jsonResponse({
    published: true,
    shareToken: share.share_token,
    shareUrl: buildShareUrl(share.share_token),
    appUrl: buildAppUrl(share.share_token),
  });
});
