// src/lib/getThemeIndexUrl.ts
const GITHUB_RAW_THEME_INDEX =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";

/**
 * Theme Index FIXED RULE (LOCK)
 * - index.json 위치: /data/theme/index.json
 * - theme JSON과 별개로 관리 (getThemeJsonUrl.ts는 건드리지 않음)
 */
export function getThemeIndexUrl(): string {
  return GITHUB_RAW_THEME_INDEX;
}
