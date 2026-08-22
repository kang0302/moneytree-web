// src/lib/getBriefingUrl.ts
// 테마 브리핑 markdown URL 빌더. 클라이언트용 — /api/raw 프록시 경유(import_MT private 대응).
// 경로: data/briefing/{themeId}.md
export function getBriefingUrl(themeId: string): string {
  return `/api/raw/data/briefing/${themeId}.md`;
}

/** 프록시 단일 경로라 별도 fallback 불필요. */
export function getBriefingFallbackUrl(_themeId: string): string | null {
  return null;
}
