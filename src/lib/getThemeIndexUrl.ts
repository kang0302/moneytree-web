// src/lib/getThemeIndexUrl.ts

const GITHUB_RAW_BASE =
  "/api/raw/data/theme";

/** theme index는 /data/theme/index.json (import_MT/data/theme/index.json) */
export function getThemeIndexUrl(): string {
  return `${GITHUB_RAW_BASE}/index.json`;
}