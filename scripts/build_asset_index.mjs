// scripts/build_asset_index.mjs
// 모든 theme JSON 을 스캔하여 자산별 등장 테마 + 관계 타입 집계.
// 출력: public/data/asset/index.json — 자산 중심 그래프(/asset/[assetId]) 의 데이터 소스.
//
// 인덱스 형식:
// {
//   "A_088": {
//     "id": "A_088",
//     "name": "삼성전자",
//     "ticker": "005930", "exchange": "KOSPI", "country": "KR", "asset_type": "STOCK",
//     "themes": [
//       { "themeId": "T_257", "themeName": "글로벌HBM메모리밸류체인", "relation": "THEMED_AS" },
//       ...
//     ],
//     "relatedAssets": [
//       { "assetId": "A_217", "name": "SK하이닉스", "relation": "PARTNERS", "themeId": "T_xxx" },
//       ...
//     ]
//   }
// }
//
// PARTNERS·SUPPLIES·COMPETES·INVESTS·IN_ETF 등 자산간 관계는 relatedAssets 로 별도 집계.
// 자산-테마 관계 (THEMED_AS·EXPOSED_TO·OPERATES·HAS_TRAIT 등) 는 themes 로.

import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const LEGACY_DATA = path.join(ROOT, "import_MT", "data");

function pickExistingDir(...candidates) {
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return candidates[0];
}

const THEME_DIR = pickExistingDir(path.join(PUBLIC_DATA, "theme"), path.join(LEGACY_DATA, "theme"));
const SSOT_DIR = pickExistingDir(path.join(PUBLIC_DATA, "ssot"), path.join(LEGACY_DATA, "ssot"));
const OUT_FILE = path.join(PUBLIC_DATA, "asset", "index.json");

// 자산-테마 관계로 분류할 type (자산 → 테마 또는 테마 → 자산 어디든)
const ASSET_THEME_RELATIONS = new Set(["THEMED_AS", "EXPOSED_TO"]);
// 자산간 관계로 분류할 type
const ASSET_ASSET_RELATIONS = new Set(["PARTNERS", "SUPPLIES", "COMPETES", "INVESTS", "IN_ETF", "OWNS"]);

function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj = {};
    for (let j = 0; j < header.length; j++) obj[header[j]] = (cols[j] ?? "").trim();
    rows.push(obj);
  }
  return rows;
}

function loadAssetSsot() {
  const p = path.join(SSOT_DIR, "asset_ssot.csv");
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  asset_ssot not found: ${p}`);
    return new Map();
  }
  const rows = parseCsv(fs.readFileSync(p, "utf-8"));
  const m = new Map();
  for (const r of rows) {
    const id = r["asset_id"];
    if (!id) continue;
    m.set(id, {
      id,
      name: r["asset_name_ko"] || r["asset_name_en"] || id,
      name_en: r["asset_name_en"] || "",
      ticker: r["ticker"] || "",
      exchange: r["exchange"] || "",
      country: r["country"] || "",
      asset_type: r["asset_type"] || "",
    });
  }
  return m;
}

function loadThemeFiles() {
  if (!fs.existsSync(THEME_DIR)) {
    throw new Error(`THEME_DIR not found: ${THEME_DIR}`);
  }
  const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
  const themes = [];
  for (const f of files) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf-8"));
      themes.push(j);
    } catch (e) {
      console.warn(`⚠️  failed to parse ${f}: ${e?.message}`);
    }
  }
  return themes;
}

function main() {
  const ssot = loadAssetSsot();
  const themes = loadThemeFiles();
  console.log(`Loaded: ${ssot.size} assets in SSOT, ${themes.length} theme files`);

  // 자산별 집계 결과
  const index = new Map(); // assetId → entry

  function ensureEntry(assetId) {
    if (index.has(assetId)) return index.get(assetId);
    const meta = ssot.get(assetId) || { id: assetId, name: assetId, ticker: "", exchange: "", country: "", asset_type: "" };
    const entry = { ...meta, themes: [], relatedAssets: [] };
    index.set(assetId, entry);
    return entry;
  }

  for (const t of themes) {
    const themeId = t?.themeId;
    const themeName = t?.themeName;
    if (!themeId) continue;

    // 노드 안의 ASSET 집합 — 빠른 lookup
    const assetIdsInTheme = new Set();
    for (const n of t?.nodes ?? []) {
      if (n?.type === "ASSET" && n?.id) assetIdsInTheme.add(n.id);
    }

    const edges = t?.edges ?? t?.links ?? [];
    for (const e of edges) {
      const from = e?.from;
      const to = e?.to;
      const type = e?.type;
      if (!from || !to || !type) continue;

      const fromIsAsset = assetIdsInTheme.has(from);
      const toIsAsset = assetIdsInTheme.has(to);
      const fromIsTheme = from === themeId;
      const toIsTheme = to === themeId;

      // 자산 ↔ 테마 (어느 방향이든)
      if (ASSET_THEME_RELATIONS.has(type)) {
        let assetId = null;
        if (fromIsAsset && toIsTheme) assetId = from;
        else if (toIsAsset && fromIsTheme) assetId = to;
        if (assetId) {
          const entry = ensureEntry(assetId);
          if (!entry.themes.some((x) => x.themeId === themeId && x.relation === type)) {
            entry.themes.push({ themeId, themeName, relation: type });
          }
        }
      }

      // 자산 ↔ 자산
      if (ASSET_ASSET_RELATIONS.has(type) && fromIsAsset && toIsAsset) {
        const fromMeta = ssot.get(from);
        const toMeta = ssot.get(to);
        const fromEntry = ensureEntry(from);
        const toEntry = ensureEntry(to);
        // from → to
        if (!fromEntry.relatedAssets.some((x) => x.assetId === to && x.relation === type && x.themeId === themeId)) {
          fromEntry.relatedAssets.push({
            assetId: to,
            name: toMeta?.name || to,
            relation: type,
            direction: "out",
            themeId,
            themeName,
          });
        }
        // to ← from (역방향 view 도 자산 페이지에 보이게)
        if (!toEntry.relatedAssets.some((x) => x.assetId === from && x.relation === type && x.themeId === themeId)) {
          toEntry.relatedAssets.push({
            assetId: from,
            name: fromMeta?.name || from,
            relation: type,
            direction: "in",
            themeId,
            themeName,
          });
        }
      }
    }
  }

  // dict 변환 + 어느 테마에도 안 등장하는 자산은 themes/relatedAssets 모두 빈 array 로 유지 (SSOT 전체 keep)
  const out = {};
  // SSOT 의 모든 자산을 base 로 깔되, index 에 모인 데이터로 채움
  for (const [aid, meta] of ssot.entries()) {
    const collected = index.get(aid);
    out[aid] = collected ?? { ...meta, themes: [], relatedAssets: [] };
  }
  // SSOT 에 없지만 theme JSON 에 등장한 자산도 누락 안 되게
  for (const [aid, entry] of index.entries()) {
    if (!out[aid]) out[aid] = entry;
  }

  // 통계
  const totalAssets = Object.keys(out).length;
  const assetsWithThemes = Object.values(out).filter((e) => e.themes.length > 0).length;
  const maxThemes = Math.max(...Object.values(out).map((e) => e.themes.length));
  const totalEdges = Object.values(out).reduce((s, e) => s + e.themes.length + e.relatedAssets.length, 0);
  console.log(`Asset index: ${totalAssets} assets, ${assetsWithThemes} with at least 1 theme, max themes per asset = ${maxThemes}, total edges = ${totalEdges}`);

  // top 10 다중 노출 자산 — 검증용
  const top = Object.values(out)
    .filter((e) => e.themes.length > 0)
    .sort((a, b) => b.themes.length - a.themes.length)
    .slice(0, 10);
  console.log(`Top 10 multi-theme assets:`);
  for (const e of top) {
    console.log(`  ${e.id} ${e.name}: ${e.themes.length} themes`);
  }

  // 출력
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2) + "\n", "utf-8");
  console.log(`Wrote: ${OUT_FILE}`);
}

main();
