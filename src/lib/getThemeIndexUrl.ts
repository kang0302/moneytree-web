// src/lib/getThemeIndexUrl.ts

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme";

/** theme index는 /data/theme/index.json (import_MT/data/theme/index.json) */
export function getThemeIndexUrl(): string {
  return `${GITHUB_RAW_BASE}/index.json`;
}