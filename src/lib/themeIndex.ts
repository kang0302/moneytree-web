// src/lib/themeIndex.ts
export type ThemeIndexItem = {
  themeId: string;
  themeName: string;
};

const GITHUB_RAW_THEME_INDEX =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";

/** LOCK: index.json은 import_MT/data/theme/index.json 에서만 읽는다 */
export function getThemeIndexUrl(): string {
  return GITHUB_RAW_THEME_INDEX;
}

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function normalizeItem(x: any): ThemeIndexItem | null {
  const themeId = String(x?.themeId ?? x?.id ?? "").trim();
  const themeName = String(x?.themeName ?? x?.name ?? "").trim();
  if (!themeId || !themeName) return null;
  return { themeId, themeName };
}

/**
 * ✅ 중요:
 * - cache: "no-store"로 강제 (Next fetch 캐시/재검증 이슈 방지)
 * - 응답이 배열이든 {themes:[...]}든 둘 다 허용
 * - 실패하면 [] 반환하되, 콘솔에 원인을 남김
 */
export async function fetchThemeIndex(): Promise<ThemeIndexItem[]> {
  const url = getThemeIndexUrl();

  try {
    const res = await fetch(url, { cache: "no-store" });

    if (!res.ok) {
      // eslint-disable-next-line no-console
      console.warn("[fetchThemeIndex] fetch failed:", res.status, url);
      return [];
    }

    const json = await res.json();

    const arr =
      Array.isArray(json) ? json : Array.isArray((json as any)?.themes) ? (json as any).themes : [];

    const out: ThemeIndexItem[] = [];
    for (const it of arr) {
      const n = normalizeItem(it);
      if (n) out.push(n);
    }

    // eslint-disable-next-line no-console
    console.log("[fetchThemeIndex] ok:", out.length, "items from", url);

    return out;
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.warn("[fetchThemeIndex] error:", e?.message ?? e, url);
    return [];
  }
}
