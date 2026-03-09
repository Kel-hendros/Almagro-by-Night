import { createClient } from "npm:@supabase/supabase-js@2";

type RecapRow = {
  id: string;
  chronicle_id: string;
  title: string;
  session_number: number | null;
  session_date: string | null;
  body: string | null;
  updated_at: string | null;
};

type ChronicleRow = {
  id: string;
  name: string;
  creator_id: string;
};

type ShareRow = {
  share_token: string;
  recap_id: string;
  chronicle_id: string;
  is_active: boolean;
};

const DEFAULT_APP_PUBLIC_URL = "https://kel-hendros.github.io/Almagro-by-Night/";
const DEFAULT_OG_IMAGE_URL = `${DEFAULT_APP_PUBLIC_URL}images/icono-grande.png`;
const PUBLIC_SHARE_BUCKET_ID = "public-recap-shares";

function jsonResponse(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
}

function escapeHtml(value: unknown) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripMarkdown(text: string) {
  return String(text || "")
    .replace(/\r\n?/g, "\n")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/\[\[([^|\]]+?)(?:\|([^\]]+?))?\]\]/g, (_m, target, alias) =>
      String(alias || target || "").trim(),
    )
    .replace(/`([^`]+)`/g, "$1")
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/_(.*?)_/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/[ \t]+/g, " ")
    .trim();
}

function buildDescription(recap: RecapRow) {
  const preview = stripMarkdown(recap.body || "");
  if (!preview) return "Recuento compartido";
  const normalized = preview.replace(/\s*\n+\s*/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}...` : normalized;
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

function buildOgImageUrl() {
  const configured = String(Deno.env.get("PUBLIC_SHARE_OG_IMAGE_URL") || "").trim();
  return configured || DEFAULT_OG_IMAGE_URL;
}

function formatSessionMeta(recap: RecapRow) {
  const parts: string[] = [];
  if (recap.session_number != null) parts.push(`Sesion ${recap.session_number}`);
  if (recap.session_date) parts.push(recap.session_date);
  return parts.join(" · ");
}

function buildObjectPath(shareToken: string) {
  return `shares/${encodeURIComponent(String(shareToken || "").trim())}.html`;
}

function buildSnapshotHtml(params: {
  chronicleName: string;
  recap: RecapRow;
  shareToken: string;
  publicUrl: string;
}) {
  const title = `${params.recap.title || "Recuento"} · ${params.chronicleName || "Crónica"}`;
  const description = buildDescription(params.recap);
  const appUrl = buildAppUrl(params.shareToken);
  const ogImageUrl = buildOgImageUrl();
  const sessionMeta = formatSessionMeta(params.recap);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${escapeHtml(title)}</title>
    <meta name="description" content="${escapeHtml(description)}">
    <meta property="og:site_name" content="Buenos Aires by Night">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${escapeHtml(title)}">
    <meta property="og:description" content="${escapeHtml(description)}">
    <meta property="og:url" content="${escapeHtml(params.publicUrl)}">
    <meta property="og:image" content="${escapeHtml(ogImageUrl)}">
    <meta property="og:image:secure_url" content="${escapeHtml(ogImageUrl)}">
    <meta property="og:image:alt" content="Buenos Aires by Night">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${escapeHtml(title)}">
    <meta name="twitter:description" content="${escapeHtml(description)}">
    <meta name="twitter:image" content="${escapeHtml(ogImageUrl)}">
    <link rel="canonical" href="${escapeHtml(params.publicUrl)}">
    <style>
      :root {
        color-scheme: dark;
        --bg: #0b0c10;
        --surface: rgba(20, 22, 29, 0.9);
        --text: #f3efe6;
        --muted: rgba(243, 239, 230, 0.72);
        --accent: #b63a32;
        --border: rgba(255,255,255,0.1);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(182,58,50,0.24), transparent 36%),
          radial-gradient(circle at bottom right, rgba(201,160,74,0.14), transparent 24%),
          linear-gradient(180deg, rgba(255,255,255,0.02), rgba(255,255,255,0)),
          var(--bg);
        color: var(--text);
        font-family: "Special Elite", Georgia, serif;
      }
      main {
        width: min(560px, 100%);
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: 20px;
        background:
          linear-gradient(180deg, rgba(255,255,255,0.05), rgba(255,255,255,0.02)),
          var(--surface);
        box-shadow: 0 20px 80px rgba(0,0,0,0.35);
        backdrop-filter: blur(10px);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 0.9rem;
        letter-spacing: 0.06em;
        text-transform: uppercase;
      }
      h1 {
        margin: 0 0 10px;
        font-size: clamp(1.5rem, 3.8vw, 2.1rem);
        line-height: 1.1;
      }
      .meta {
        margin: 0 0 14px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      .preview {
        margin: 14px 0 0;
        padding-top: 14px;
        color: var(--muted);
        line-height: 1.55;
        border-top: 1px solid var(--border);
      }
      .actions {
        margin-top: 20px;
        display: flex;
        flex-wrap: wrap;
        gap: 10px;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-height: 42px;
        padding: 0 16px;
        border-radius: 999px;
        text-decoration: none;
        font-weight: 600;
      }
      .primary {
        background: var(--accent);
        color: white;
      }
      .ghost {
        border: 1px solid var(--border);
        color: var(--text);
      }
      .hint {
        margin-top: 16px;
        color: var(--muted);
        font-size: 0.88rem;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${escapeHtml(params.chronicleName || "Crónica")}</p>
      <h1>${escapeHtml(params.recap.title || "Recuento compartido")}</h1>
      ${sessionMeta ? `<p class="meta">${escapeHtml(sessionMeta)}</p>` : ""}
      <p class="preview">${escapeHtml(description)}</p>
      <div class="actions">
        <a class="primary" href="${escapeHtml(appUrl)}">Abrir recuento</a>
        <a class="ghost" href="${escapeHtml(params.publicUrl)}">Recargar</a>
      </div>
      <p class="hint">Abriendo recuento...</p>
    </main>
    <script>
      window.setTimeout(function () {
        window.location.replace(${JSON.stringify(appUrl)});
      }, 40);
    </script>
  </body>
</html>`;
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

function isBucketExistsError(error: { message?: string } | null) {
  const msg = String(error?.message || "").toLowerCase();
  return msg.includes("already exists") || msg.includes("duplicate");
}

async function ensureBucket(serviceClient: ReturnType<typeof createClient>) {
  const { error } = await serviceClient.storage.createBucket(PUBLIC_SHARE_BUCKET_ID, {
    public: true,
    allowedMimeTypes: ["text/html"],
    fileSizeLimit: "1MB",
  });
  if (error && !isBucketExistsError(error)) {
    throw error;
  }
}

Deno.serve(async (req: Request) => {
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
    .select("id, chronicle_id, title, session_number, session_date, body, updated_at")
    .eq("id", recapId)
    .maybeSingle<RecapRow>();
  if (recapError || !recap) {
    return jsonResponse({ error: "recap_not_found" }, 404);
  }

  const { data: chronicle, error: chronicleError } = await supabase
    .from("chronicles")
    .select("id, name, creator_id")
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
    return jsonResponse({ published: false, publicUrl: null, shareToken: null }, 200);
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

  try {
    await ensureBucket(supabase);
  } catch (error) {
    return jsonResponse({ error: `bucket_error:${String((error as Error)?.message || error)}` }, 500);
  }

  const objectPath = buildObjectPath(share.share_token);
  const { data: publicUrlData } = supabase.storage
    .from(PUBLIC_SHARE_BUCKET_ID)
    .getPublicUrl(objectPath);
  const publicUrl = String(publicUrlData?.publicUrl || "").trim();
  if (!publicUrl) {
    return jsonResponse({ error: "public_url_unavailable" }, 500);
  }

  const html = buildSnapshotHtml({
    chronicleName: chronicle.name || "Crónica",
    recap,
    shareToken: share.share_token,
    publicUrl,
  });

  const upload = await supabase.storage
    .from(PUBLIC_SHARE_BUCKET_ID)
    .upload(
      objectPath,
      new Blob([html], { type: "text/html" }),
      {
        upsert: true,
        contentType: "text/html",
        cacheControl: "60",
      },
    );

  if (upload.error) {
    return jsonResponse({ error: `upload_failed:${upload.error.message}` }, 500);
  }

  return jsonResponse({
    published: true,
    shareToken: share.share_token,
    publicUrl,
    appUrl: buildAppUrl(share.share_token),
  });
});
