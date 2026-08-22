import type { MetadataRoute } from "next";

const BASE = "https://getknowvest.com";

// 24h 마다 재생성 (테마 추가 반영)
export const revalidate = 86400;

// import_MT 인덱스 원격 URL/헤더 — GITHUB_TOKEN 있으면 인증 API(private), 없으면 raw.
function indexRemote(): { url: string; headers: Record<string, string> } {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return {
      url: "https://api.github.com/repos/kang0302/import_MT/contents/data/theme/index.json?ref=main",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "knowvest",
      },
    };
  }
  return {
    url: "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json",
    headers: {},
  };
}

const STATIC_PATHS = [
  "", "/themes", "/insights", "/baggers", "/ma-brief",
  "/high52w", "/low52w", "/compare", "/track-record",
  "/comovement", "/barometer-trend", "/cross-market", "/shock", "/daily-brief",
];

async function themeIds(): Promise<string[]> {
  try {
    const { url, headers } = indexRemote();
    const r = await fetch(url, { headers, next: { revalidate: 86400 } });
    if (!r.ok) return [];
    const j = await r.json();
    const list = Array.isArray(j) ? j : j?.themes ?? [];
    return list.map((t: { themeId?: string }) => String(t?.themeId ?? "")).filter(Boolean);
  } catch {
    return [];
  }
}

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const now = new Date();
  const staticEntries: MetadataRoute.Sitemap = STATIC_PATHS.map((p) => ({
    url: `${BASE}${p}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: p === "" ? 1 : 0.7,
  }));
  const themeEntries: MetadataRoute.Sitemap = (await themeIds()).map((id) => ({
    url: `${BASE}/graph/${id}`,
    lastModified: now,
    changeFrequency: "daily",
    priority: 0.6,
  }));
  return [...staticEntries, ...themeEntries];
}
