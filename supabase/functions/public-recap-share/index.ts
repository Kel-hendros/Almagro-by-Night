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

const DEFAULT_APP_PUBLIC_URL = "https://kel-hendros.github.io/Almagro-by-Night/";

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
  const normalized = preview.replace(/\s*\n+\s*/g, " ").trim();
  return normalized.length > 220 ? `${normalized.slice(0, 217).trimEnd()}...` : normalized;
}

function formatSessionMeta(share: PublicRecapShare) {
  const parts: string[] = [];
  if (share.session_number != null) {
    parts.push(`Sesion ${share.session_number}`);
  }
  if (share.session_date) {
    parts.push(share.session_date);
  }
  return parts.join(" · ");
}

function withTrailingSlash(url: string) {
  return url.endsWith("/") ? url : `${url}/`;
}

function buildAppBaseUrl() {
  const configured = String(Deno.env.get("APP_PUBLIC_URL") || "").trim();
  const baseUrl = configured || DEFAULT_APP_PUBLIC_URL;
  return withTrailingSlash(baseUrl);
}

function buildAppUrl(token: string) {
  const baseUrl = buildAppBaseUrl().replace(/\/$/, "");
  return `${baseUrl}#public-recap?token=${encodeURIComponent(token)}`;
}

function buildPublicShareUrl(token: string) {
  const configured = String(Deno.env.get("SUPABASE_URL") || "").trim();
  if (!configured) return "";
  const baseUrl = configured.replace(/\/$/, "");
  return `${baseUrl}/functions/v1/public-recap-share/${encodeURIComponent(token)}`;
}

function buildOgImageUrl() {
  const configured = String(Deno.env.get("PUBLIC_SHARE_OG_IMAGE_URL") || "").trim();
  if (configured) return configured;
  return `${buildAppBaseUrl()}images/icono-grande.png`;
}

function extractToken(reqUrl: URL) {
  const segments = String(reqUrl.pathname || "")
    .split("/")
    .filter(Boolean);
  const lastSegment = segments[segments.length - 1] || "";
  if (!lastSegment || lastSegment === "public-recap-share") return "";
  return decodeURIComponent(lastSegment).trim();
}

function isPreviewBot(userAgent: string) {
  const ua = String(userAgent || "").toLowerCase();
  return [
    "whatsapp",
    "facebookexternalhit",
    "facebookexternalua",
    "facebookcatalog",
    "facebot",
    "meta-externalagent",
    "meta-externalfetcher",
    "meta-inspector",
    "twitterbot",
    "slackbot",
    "discordbot",
    "telegrambot",
    "linkedinbot",
    "skypeuripreview",
    "googlebot",
    "bingbot",
  ].some((token) => ua.includes(token));
}

function isLikelyBrowser(userAgent: string) {
  const ua = String(userAgent || "").toLowerCase();
  return [
    "mozilla/",
    "applewebkit/",
    "chrome/",
    "safari/",
    "firefox/",
    "edg/",
  ].some((token) => ua.includes(token));
}

function buildHtml(share: PublicRecapShare, reqUrl: URL, options: { autoRedirect: boolean }) {
  const title = `${share.title || "Recuento"} · ${share.chronicle_name || "Crónica"}`;
  const description = buildDescription(share);
  const canonicalUrl = buildPublicShareUrl(share.share_token) || reqUrl.toString();
  const appUrl = buildAppUrl(share.share_token);
  const ogImageUrl = buildOgImageUrl();
  const sessionMeta = formatSessionMeta(share);
  const safeTitle = escapeHtml(title);
  const safeDescription = escapeHtml(description);
  const safeChronicle = escapeHtml(share.chronicle_name || "Crónica");
  const safeAppUrl = escapeHtml(appUrl);
  const safeOgImageUrl = escapeHtml(ogImageUrl);
  const safeSessionMeta = escapeHtml(sessionMeta);

  return `<!DOCTYPE html>
<html lang="es">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width,initial-scale=1">
    <title>${safeTitle}</title>
    <meta name="description" content="${safeDescription}">
    <meta property="og:site_name" content="Buenos Aires by Night">
    <meta property="og:type" content="article">
    <meta property="og:title" content="${safeTitle}">
    <meta property="og:description" content="${safeDescription}">
    <meta property="og:url" content="${escapeHtml(canonicalUrl)}">
    <meta property="og:image" content="${safeOgImageUrl}">
    <meta property="og:image:alt" content="Buenos Aires by Night">
    <meta property="og:image:width" content="1200">
    <meta property="og:image:height" content="630">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${safeTitle}">
    <meta name="twitter:description" content="${safeDescription}">
    <meta name="twitter:image" content="${safeOgImageUrl}">
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
      p {
        margin: 0;
        color: var(--muted);
        line-height: 1.55;
      }
      .preview {
        margin-top: 14px;
        padding-top: 14px;
        border-top: 1px solid var(--border);
        white-space: pre-wrap;
        display: -webkit-box;
        -webkit-line-clamp: 3;
        -webkit-box-orient: vertical;
        overflow: hidden;
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
        font-size: 0.88rem;
      }
    </style>
  </head>
  <body>
    <main>
      <p class="eyebrow">${safeChronicle}</p>
      <h1>${escapeHtml(share.title || "Recuento compartido")}</h1>
      ${sessionMeta ? `<p class="meta">${safeSessionMeta}</p>` : ""}
      <p class="preview">${safeDescription}</p>
      <div class="actions">
        <a class="primary" href="${safeAppUrl}">${options.autoRedirect ? "Abrir ahora" : "Abrir recuento"}</a>
        <a class="ghost" href="${escapeHtml(canonicalUrl)}">Recargar</a>
      </div>
      <p class="hint">${options.autoRedirect ? "Abriendo recuento..." : "Vista de previsualizacion del recuento compartido."}</p>
    </main>
    ${options.autoRedirect
      ? `<script>
           window.location.replace(${JSON.stringify(appUrl)});
         </script>`
      : ""}
  </body>
</html>`;
}

function htmlResponse(html: string, extraHeaders: Record<string, string> = {}) {
  return new Response(new TextEncoder().encode(html), {
    headers: {
      "content-type": "text/html; charset=utf-8",
      ...extraHeaders,
    },
  });
}

Deno.serve(async (req: Request) => {
  const reqUrl = new URL(req.url);
  const token = extractToken(reqUrl);
  const userAgent = String(req.headers.get("user-agent") || "");
  const varyHeader = "Accept, User-Agent";

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
        Vary: varyHeader,
      },
    });
  }

  if (isLikelyBrowser(userAgent) && !isPreviewBot(userAgent) && req.method !== "HEAD") {
    return new Response(null, {
      status: 302,
      headers: {
        Location: buildAppUrl(data.share_token),
        "Cache-Control": "no-store",
        Vary: varyHeader,
      },
    });
  }

  return htmlResponse(buildHtml(data, reqUrl, { autoRedirect: false }), {
    "Cache-Control": "no-store",
    Vary: varyHeader,
  });
});
