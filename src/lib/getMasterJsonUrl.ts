// src/lib/getMasterJsonUrl.ts
const GITHUB_RAW_MASTER =
  "/api/raw/data/master/master.json";

export function getMasterJsonUrl(): string {
  return GITHUB_RAW_MASTER;
}
