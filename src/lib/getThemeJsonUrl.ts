// src/lib/getThemeJsonUrl.ts
const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme";

/**
 * MoneyTree FIXED RULE (LOCK)
 * - themeId 예: "T_006"
 * - JSON 위치: /data/theme/{themeId}.json
 * - 이 함수는 앞으로 수정하지 않는다
 */
export function getThemeJsonUrl(themeId: string): string {
  return `${GITHUB_RAW_BASE}/${themeId}.json`;
}
