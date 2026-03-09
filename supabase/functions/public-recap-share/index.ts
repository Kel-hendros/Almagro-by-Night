import { createClient } from "npm:@supabase/supabase-js@2";

type PublicRecapShare = {
  share_token: string;
  recap_id: string;
  chronicle_id: string;
  chronicle_name: string;
  chronicle_creator_id: string;
  title: string;
  session_number: number | null;
  session_date: string | null;
  body: string | null;
  recap_updated_at: string | null;
  share_created_at: string | null;
};

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

function buildDescription(share: PublicRecapShare) {
  const preview = stripMarkdown(share.body || "");
  if (!preview) return "Recuento compartido";
  return preview.length > 220 ? `${preview.slice(0, 217).trimEnd()}...` : preview;
}

function buildAppUrl(reqUrl: URL, token: string) {
  const explicit = reqUrl.searchParams.get("app_url") || "";
  if (explicit) return explicit;

  const fallbackBase = Deno.env.get("APP_PUBLIC_URL") || "";
  if (!fallbackBase) return "";

  return `${fallbackBase.replace(/\/$/, "")}#public-recap?token=${encodeURIComponent(token)}`;
}

function buildHtml(share: PublicRecapShare, reqUrl: URL) {
  const title = `${share.title || "Recuento"} · ${share.chronicle_name || "Crónica"}`;
  const description = buildDescription(share);
  const canonicalUrl = reqUrl.toString();
  const appUrl = buildAppUrl(reqUrl, share.share_token);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeChronicle = escapeHtml(share.chronicle_name || "Crónica");
  const safeAppUrl = escapeHtml(appUrl);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta name="twitter:card" content="summary">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    ${appUrl ? `<script>window.location.replace(${JSON.stringify(appUrl)});</script>` : ""}
    <style>
      :root {
        color-scheme: dark;
        --bg: #0f0f12;
        --surface: #19191f;
        --text: #f2efe8;
        --muted: #b1aa9f;
        --accent: #b63a32;
        --border: rgba(255,255,255,0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        padding: 24px;
        background:
          radial-gradient(circle at top left, rgba(182,58,50,0.22), transparent 38%),
          radial-gradient(circle at bottom right, rgba(255,255,255,0.06), transparent 26%),
          var(--bg);
        color: var(--text);
        font-family: Georgia, serif;
      }
      main {
        width: min(720px, 100%);
        padding: 28px;
        border: 1px solid var(--border);
        border-radius: 18px;
        background: linear-gradient(180deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02));
        box-shadow: 0 20px 80px rgba(0,0,0,0.35);
      }
      .eyebrow {
        margin: 0 0 8px;
        color: var(--muted);
        font-size: 0.9rem;
      }
      h1 {
        margin: 0 0 10px;
        font-size: clamp(1.8rem, 4vw, 2.6rem);
        line-height: 1.05;
      }
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
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
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${safeChronicle}</p>
      <h1>${escapeHtml(share.title || "Recuento compartido")}</h1>
      <p>${safeDescription}</p>
      <div class="actions">
        ${appUrl ? `<a class="primary" href="${safeAppUrl}">Abrir recuento</a>` : ""}
        <a class="ghost" href="${escapeHtml(canonicalUrl)}">Recargar</a>
      </div>
    </main>
  </body>
</html>`;
}

Deno.serve(async (req: Request) => {
  const reqUrl = new URL(req.url);
  const token = (reqUrl.searchParams.get("token") || "").trim();

  if (!token) {
    return new Response("Token faltante.", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data, error } = await supabase
    .rpc("get_public_recap_share", { p_share_token: token })
    .maybeSingle<PublicRecapShare>();

  if (error || !data) {
    return new Response("Recuento no encontrado.", { status: 404 });
  }

  if (req.headers.get("accept")?.includes("application/json") || reqUrl.searchParams.get("format") === "json") {
    return new Response(JSON.stringify(data), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return new Response(buildHtml(data, reqUrl), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
    },
  });
});
