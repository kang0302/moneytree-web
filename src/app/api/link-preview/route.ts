import { NextResponse } from "next/server";

export const runtime = "nodejs"; // 안정적으로 fetch/파싱
export const dynamic = "force-dynamic";

function pickMeta(html: string, key: string) {
  // property="og:title" or name="description" 등
  const re = new RegExp(
    `<meta[^>]+(?:property|name)=["']${key}["'][^>]+content=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] ? decodeHtml(m[1]) : undefined;
}

function pickLink(html: string, rel: string) {
  const re = new RegExp(
    `<link[^>]+rel=["']${rel}["'][^>]+href=["']([^"']+)["'][^>]*>`,
    "i"
  );
  const m = html.match(re);
  return m?.[1] ? decodeHtml(m[1]) : undefined;
}

function decodeHtml(s: string) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function absUrl(base: string, maybe: string | undefined) {
  if (!maybe) return undefined;
  try {
    return new URL(maybe, base).toString();
  } catch {
    return maybe;
  }
}

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const url = searchParams.get("url");

  if (!url) {
    return NextResponse.json(
      { url: "", error: "missing url" },
      { status: 400 }
    );
  }

  try {
    const res = await fetch(url, {
      redirect: "follow",
      headers: {
        // 일부 사이트에서 UA 없으면 막는 경우가 있어 최소 UA 제공
        "User-Agent":
          "Mozilla/5.0 (compatible; MoneyTreeBot/1.0; +https://example.com)",
        Accept: "text/html,application/xhtml+xml",
      },
      cache: "no-store",
    });

    const finalUrl = res.url || url;
    const ct = res.headers.get("content-type") || "";
    if (!ct.includes("text/html")) {
      return NextResponse.json({
        url,
        finalUrl,
        title: finalUrl,
        description: "",
        image: "",
        siteName: new URL(finalUrl).hostname,
      });
    }

    const html = await res.text();

    const ogTitle = pickMeta(html, "og:title");
    const ogDesc = pickMeta(html, "og:description");
    const ogImage = pickMeta(html, "og:image");
    const ogSite = pickMeta(html, "og:site_name");

    const twTitle = pickMeta(html, "twitter:title");
    const twDesc = pickMeta(html, "twitter:description");
    const twImage = pickMeta(html, "twitter:image");

    const desc = pickMeta(html, "description");

    // <title> 태그
    const titleTag = html.match(/<title[^>]*>([^<]+)<\/title>/i)?.[1];
    const title = decodeHtml(titleTag ?? "");

    const favicon =
      pickLink(html, "icon") ||
      pickLink(html, "shortcut icon") ||
      "/favicon.ico";

    const out = {
      url,
      finalUrl,
      title: ogTitle || twTitle || title || finalUrl,
      description: ogDesc || twDesc || desc || "",
      image: absUrl(finalUrl, ogImage || twImage),
      siteName: ogSite || new URL(finalUrl).hostname,
      favicon: absUrl(finalUrl, favicon),
    };

    return NextResponse.json(out);
  } catch (e: any) {
    return NextResponse.json(
      { url, error: e?.message ?? "preview error" },
      { status: 200 }
    );
  }
}
