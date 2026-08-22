// src/lib/getThemeJsonUrl.ts
// 클라이언트용 — import_MT 데이터는 /api/raw 프록시 경유(레포 private 대응).
export function getThemeJsonUrl(themeId: string): string {
  return `/api/raw/data/theme/${themeId}.json`;
}
