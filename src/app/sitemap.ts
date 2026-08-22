import type { MetadataRoute } from "next";

const BASE = "https://getknowvest.com";
const INDEX_REMOTE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";

// 24h 마다 재생성 (테마 추가 반영)
export const revalidate = 86400;

const STATIC_PATHS = [
  "", "/themes", "/insights", "/baggers", "/ma-brief",
  "/high52w", "/low52w", "/compare", "/track-record",
  "/comovement", "/barometer-trend", "/cross-market", "/shock", "/daily-brief",
];

async function themeIds(): Promise<string[]> {
  try {
    const r = await fetch(INDEX_REMOTE, { next: { revalidate: 86400 } });
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
