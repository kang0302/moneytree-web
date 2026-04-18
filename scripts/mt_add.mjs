#!/usr/bin/env node
// scripts/mt_add.mjs — 테마 데이터 관리 대화형 CLI
import fs from "fs";
import path from "path";
import readline from "readline";
import { execSync } from "child_process";

// ───────────── 설정 ─────────────
const ROOT = process.cwd();
const PUBLIC_DATA = path.join(ROOT, "public", "data");
const THEME_DIR = path.join(PUBLIC_DATA, "theme");
const SSOT_DIR = path.join(PUBLIC_DATA, "ssot");
const SEARCH_INDEX = path.join(PUBLIC_DATA, "search", "search_index.json");

const GITHUB_RAW_BASE =
  "https://raw.githubusercontent.com/kang0302/import_MT/refs/heads/main/";

const SSOT_PATHS = {
  asset: "data/ssot/asset_ssot.csv",
  theme: "data/theme/index.json",
  macro: "data/ssot/macro_ssot.csv",
  bf: "data/ssot/business_field_ssot.csv",
  character: "data/ssot/character_ssot.csv",
};

// 유효한 관계 타입 (from_type → to_type → [relation_types])
const RELATION_RULES = {
  ASSET: {
    THEME: ["THEMED_AS"],
    BUSINESS_FIELD: ["OPERATES"],
    ASSET: ["COMPETES", "SUPPLIES", "INVESTS", "PARTNERS"],
    MACRO: ["EXPOSED_TO"],
    CHARACTER: ["HAS_TRAIT"],
    ETF: ["IN_ETF"],
  },
  MACRO: {
    THEME: ["IMPACTS"],
    ASSET: ["IMPACTS"],
  },
  BUSINESS_FIELD: {
    THEME: ["THEMED_AS"],
  },
  CHARACTER: {
    ASSET: ["HAS_TRAIT"],
  },
  THEME: {
    ASSET: ["THEMED_AS"],
    MACRO: ["IMPACTS"],
    BUSINESS_FIELD: ["THEMED_AS"],
  },
};

// ───────────── readline helpers ─────────────
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function ask(q) {
  return new Promise((resolve) => rl.question(q, (a) => resolve(a.trim())));
}

async function askDefault(q, def) {
  const ans = await ask(`${q} [${def}]: `);
  return ans || def;
}

async function confirm(msg) {
  const ans = await ask(`${msg} (y/n): `);
  return ans.toLowerCase() === "y";
}

async function selectFromList(items, labelFn, prompt = "번호 선택: ") {
  if (!items.length) return null;
  items.forEach((it, i) => console.log(`  ${i + 1}. ${labelFn(it)}`));
  const num = parseInt(await ask(prompt), 10);
  if (num >= 1 && num <= items.length) return items[num - 1];
  console.log("❌ 잘못된 번호입니다.");
  return null;
}

// ───────────── CSV parser ─────────────
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  const header = lines[0].split(",").map((s) => s.trim());
  return lines.slice(1).map((line) => {
    const cols = line.split(",");
    const obj = {};
    header.forEach((h, i) => (obj[h] = (cols[i] ?? "").trim()));
    return obj;
  });
}

function toCsv(rows, headers) {
  return [headers.join(","), ...rows.map((r) => headers.map((h) => r[h] ?? "").join(","))].join("\n") + "\n";
}

// ───────────── GitHub SSOT Fetch ─────────────
async function fetchGithub(relPath) {
  const url = GITHUB_RAW_BASE + relPath;
  console.log(`  📡 Fetching: ${url}`);
  const resp = await fetch(url);
  if (!resp.ok) throw new Error(`HTTP ${resp.status} for ${url}`);
  return resp.text();
}

async function fetchGithubJson(relPath) {
  return JSON.parse(await fetchGithub(relPath));
}

async function fetchAssetSsot() {
  const text = await fetchGithub(SSOT_PATHS.asset);
  const remote = parseCsv(text);
  // 로컬 asset_ssot.csv도 합쳐서 ID 충돌 방지 (remote에 아직 push되지 않은 신규 ID 포함)
  const local = readLocalAssetSsot();
  const byId = new Map();
  for (const r of remote) if (r.asset_id) byId.set(r.asset_id, r);
  let localOnly = 0;
  for (const r of local) {
    if (r.asset_id && !byId.has(r.asset_id)) {
      byId.set(r.asset_id, r);
      localOnly++;
    }
  }
  if (localOnly) console.log(`  ℹ️  local 전용 Asset ${localOnly}건 병합 (ID 충돌 방지)`);
  return [...byId.values()];
}

async function fetchThemeIndex() {
  const data = await fetchGithubJson(SSOT_PATHS.theme);
  return Array.isArray(data) ? data : data?.themes ?? [];
}

async function fetchMacroSsot() {
  return parseCsv(await fetchGithub(SSOT_PATHS.macro));
}

async function fetchBfSsot() {
  return parseCsv(await fetchGithub(SSOT_PATHS.bf));
}

async function fetchCharacterSsot() {
  return parseCsv(await fetchGithub(SSOT_PATHS.character));
}

async function fetchThemeJson(themeId) {
  try {
    return await fetchGithubJson(`data/theme/${themeId}.json`);
  } catch {
    return null;
  }
}

// ───────────── ID 채번 ─────────────
function nextId(prefix, existingIds) {
  const nums = existingIds
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.replace(prefix, ""), 10))
    .filter((n) => !isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `${prefix}${max + 1}`;
}

// ───────────── 검색 ─────────────
function searchAssets(assets, query) {
  const q = query.toLowerCase();
  return assets.filter(
    (a) =>
      (a.asset_name_ko || "").toLowerCase().includes(q) ||
      (a.asset_name_en || "").toLowerCase().includes(q) ||
      (a.ticker || "").toLowerCase().includes(q) ||
      (a.asset_id || "").toLowerCase().includes(q)
  );
}

function searchMacros(macros, query) {
  const q = query.toLowerCase();
  return macros.filter(
    (m) =>
      (m.macro_name_ko || "").toLowerCase().includes(q) ||
      (m.macro_name_en || "").toLowerCase().includes(q) ||
      (m.macro_id || "").toLowerCase().includes(q)
  );
}

function searchBfs(bfs, query) {
  const q = query.toLowerCase();
  return bfs.filter(
    (b) =>
      (b.business_field_ko || "").toLowerCase().includes(q) ||
      (b.business_field_en || "").toLowerCase().includes(q) ||
      (b.bf_id || "").toLowerCase().includes(q)
  );
}

function searchCharacters(chars, query) {
  const q = query.toLowerCase();
  return chars.filter(
    (c) =>
      (c.character_name_kr || "").toLowerCase().includes(q) ||
      (c.character_name_en || "").toLowerCase().includes(q) ||
      (c.character_id || "").toLowerCase().includes(q)
  );
}

// ───────────── 노드 검색/선택/생성 ─────────────
async function selectOrCreateAsset(assets) {
  const query = await ask("검색어 (이름/티커/ID): ");
  const results = searchAssets(assets, query);

  if (results.length) {
    console.log(`\n  🔍 검색 결과 (${results.length}건):`);
    const selected = await selectFromList(
      results.slice(0, 20),
      (a) => `${a.asset_id} | ${a.asset_name_ko} | ${a.asset_name_en} | ${a.ticker} | ${a.exchange}`,
      "번호 선택 (0=신규 생성): "
    );
    if (selected) return { asset: selected, isNew: false };
  } else {
    console.log("  검색 결과가 없습니다.");
  }

  const doCreate = await confirm("신규 Asset을 생성하시겠습니까?");
  if (!doCreate) return null;

  const nameKo = await ask("asset_name_ko (공백 없이): ");
  const nameEn = await ask("asset_name_en: ");
  const ticker = await ask("ticker: ");
  const exchange = await ask("exchange: ");
  const country = await ask("country: ");

  console.log("  asset_type 선택:");
  const typeChoice = await selectFromList(
    ["STOCK", "ETF", "PRIVATE"],
    (t) => t,
    "번호 선택: "
  );
  const assetType = typeChoice || "STOCK";

  const existingIds = assets.map((a) => a.asset_id);
  // 중복 체크
  const dupName = assets.find(
    (a) =>
      (a.asset_name_ko || "").toLowerCase() === nameKo.toLowerCase() ||
      (a.asset_name_en || "").toLowerCase() === nameEn.toLowerCase()
  );
  const dupTicker = ticker
    ? assets.find((a) => (a.ticker || "").toLowerCase() === ticker.toLowerCase())
    : null;

  if (dupName || dupTicker) {
    const dup = dupName || dupTicker;
    console.log(`  ⚠️  이미 존재합니다: ${dup.asset_id} (${dup.asset_name_ko} / ${dup.ticker})`);
    const useExisting = await confirm("기존 ID를 사용하시겠습니까?");
    if (useExisting) return { asset: dup, isNew: false };
  }

  const newId = nextId("A_", existingIds);
  const newAsset = {
    asset_id: newId,
    asset_name_en: nameEn,
    asset_name_ko: nameKo,
    ticker,
    exchange,
    country,
    asset_type: assetType,
  };
  console.log(`  ✅ 신규 Asset ID 발급: ${newId}`);
  return { asset: newAsset, isNew: true };
}

async function selectNode(type, ssotData) {
  const searchFn = {
    MACRO: searchMacros,
    BUSINESS_FIELD: searchBfs,
    CHARACTER: searchCharacters,
  }[type];
  const labelFn = {
    MACRO: (m) => `${m.macro_id} | ${m.macro_name_ko} | ${m.macro_name_en} | ${m.macro_type || ""}`,
    BUSINESS_FIELD: (b) => `${b.bf_id} | ${b.business_field_ko} | ${b.business_field_en}`,
    CHARACTER: (c) => `${c.character_id} | ${c.character_name_kr} | ${c.character_name_en}`,
  }[type];
  const idField = { MACRO: "macro_id", BUSINESS_FIELD: "bf_id", CHARACTER: "character_id" }[type];

  const query = await ask(`${type} 검색어: `);
  const results = searchFn(ssotData, query);

  if (!results.length) {
    console.log("  검색 결과가 없습니다.");
    return null;
  }

  console.log(`\n  🔍 검색 결과 (${results.length}건):`);
  return selectFromList(results.slice(0, 20), labelFn);
}

// ───────────── 관계 타입 결정 ─────────────
function getValidRelations(fromType, toType) {
  // 정방향 체크
  const forward = RELATION_RULES[fromType]?.[toType] ?? [];
  // 역방향 체크
  const reverse = RELATION_RULES[toType]?.[fromType] ?? [];
  return [...new Set([...forward, ...reverse])];
}

async function selectRelationType(fromType, toType) {
  const valid = getValidRelations(fromType, toType);
  if (!valid.length) {
    console.log(`  ⚠️  ${fromType} → ${toType} 관계를 찾을 수 없습니다.`);
    const custom = await ask("관계 타입 직접 입력: ");
    return custom || null;
  }
  if (valid.length === 1) {
    console.log(`  → 관계 타입 자동 결정: ${valid[0]}`);
    return valid[0];
  }
  console.log("\n  관계 타입 선택:");
  return selectFromList(valid, (t) => t);
}

// ───────────── 노드 → theme JSON format ─────────────
function assetToNode(a) {
  return {
    id: a.asset_id,
    type: "ASSET",
    name: a.asset_name_en || a.asset_name_ko,
    exposure: {
      ticker: a.ticker || "",
      exchange: a.exchange || "",
      country: a.country || "",
      assetType: a.asset_type || "STOCK",
    },
    display: { name_ko: a.asset_name_ko || "" },
    metrics: {},
  };
}

function macroToNode(m) {
  return {
    name: m.macro_name_ko || m.macro_name_en,
    type: "MACRO",
    id: m.macro_id,
  };
}

function bfToNode(b) {
  return {
    name: b.business_field_ko || b.business_field_en,
    type: "BUSINESS_FIELD",
    id: b.bf_id,
  };
}

function characterToNode(c) {
  return {
    name: c.character_name_kr || c.character_name_en,
    type: "CHARACTER",
    id: c.character_id,
  };
}

function anyToNode(type, data) {
  switch (type) {
    case "ASSET": return assetToNode(data);
    case "MACRO": return macroToNode(data);
    case "BUSINESS_FIELD": return bfToNode(data);
    case "CHARACTER": return characterToNode(data);
    default: return null;
  }
}

function getNodeId(type, data) {
  switch (type) {
    case "ASSET": return data.asset_id;
    case "MACRO": return data.macro_id;
    case "BUSINESS_FIELD": return data.bf_id;
    case "CHARACTER": return data.character_id;
    default: return null;
  }
}

// ───────────── 로컬 파일 읽기/쓰기 ─────────────
function readLocalThemeJson(themeId) {
  const p = path.join(THEME_DIR, `${themeId}.json`);
  if (!fs.existsSync(p)) return null;
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function writeThemeJson(themeId, data) {
  const p = path.join(THEME_DIR, `${themeId}.json`);
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(data, null, 2) + "\n", "utf-8");
  return p;
}

function readLocalIndex() {
  const p = path.join(THEME_DIR, "index.json");
  if (!fs.existsSync(p)) return [];
  const data = JSON.parse(fs.readFileSync(p, "utf-8"));
  return Array.isArray(data) ? data : data?.themes ?? [];
}

function writeIndex(index) {
  const p = path.join(THEME_DIR, "index.json");
  fs.writeFileSync(p, JSON.stringify(index, null, 2) + "\n", "utf-8");
  return p;
}

function readLocalAssetSsot() {
  const p = path.join(SSOT_DIR, "asset_ssot.csv");
  if (!fs.existsSync(p)) return [];
  return parseCsv(fs.readFileSync(p, "utf-8"));
}

function writeAssetSsot(rows) {
  const headers = ["asset_id", "asset_name_en", "asset_name_ko", "ticker", "exchange", "country", "asset_type"];
  const p = path.join(SSOT_DIR, "asset_ssot.csv");
  fs.writeFileSync(p, toCsv(rows, headers), "utf-8");
  return p;
}

function writeRelationshipCsv(relType, fromId, toId, confidence, description) {
  const dir = SSOT_DIR;
  const fname = `relationship_${relType}_${fromId}_${toId}.csv`;
  const p = path.join(dir, fname);
  const headers = ["from", "to", "type", "confidence", "description"];
  const row = { from: fromId, to: toId, type: relType, confidence, description };
  fs.writeFileSync(p, toCsv([row], headers), "utf-8");
  return p;
}

// ───────────── index.json nodeCount/edgeCount 업데이트 ─────────────
function updateIndexCounts(index) {
  for (const entry of index) {
    const themeJson = readLocalThemeJson(entry.themeId);
    if (themeJson) {
      entry.nodeCount = (themeJson.nodes || []).length;
      entry.edgeCount = (themeJson.edges || []).length;
    }
  }
  return index;
}

// ───────────── search index rebuild ─────────────
function rebuildSearch() {
  console.log("\n  🔄 search_index.json 재빌드...");
  try {
    execSync("node scripts/build_search_index.mjs", { cwd: ROOT, stdio: "inherit" });
  } catch {
    console.log("  ⚠️  search index 재빌드 실패. 수동으로 npm run build:search 실행하세요.");
  }
}

// ───────────── git push ─────────────
async function gitPush(changedFiles) {
  console.log("\n  📋 변경된 파일:");
  changedFiles.forEach((f) => console.log(`    - ${path.relative(ROOT, f)}`));

  if (!(await confirm("\nGitHub push하시겠습니까?"))) return;

  try {
    const relFiles = changedFiles.map((f) => path.relative(ROOT, f).replace(/\\/g, "/"));
    execSync(`git add ${relFiles.join(" ")}`, { cwd: ROOT, stdio: "inherit" });
    const ts = new Date().toISOString().slice(0, 19).replace("T", " ");
    execSync(`git commit -m "mt_add: data update (${ts})"`, { cwd: ROOT, stdio: "inherit" });
    execSync("git push origin main", { cwd: ROOT, stdio: "inherit" });
    console.log("  ✅ Push 완료!");
  } catch (e) {
    console.log(`  ❌ Git 오류: ${e.message}`);
  }
}

// ───────────── Case 1: 기존 테마에 노드 추가 ─────────────
async function addNodeToTheme() {
  console.log("\n=== 기존 테마에 노드 추가 ===");

  const themeId = await ask("테마 ID (예: T_009): ");
  if (!/^T_\d+$/.test(themeId)) {
    console.log("❌ 유효하지 않은 테마 ID 형식입니다.");
    return;
  }

  // GitHub에서 테마 존재 확인
  console.log(`  GitHub에서 ${themeId}.json 확인 중...`);
  const remoteTheme = await fetchThemeJson(themeId);
  if (!remoteTheme) {
    console.log(`  ❌ GitHub에 ${themeId}.json이 존재하지 않습니다.`);
    return;
  }
  console.log(`  ✅ 테마: ${remoteTheme.themeName} (노드 ${remoteTheme.nodes?.length || 0}개)`);

  // 로컬 테마 파일 사용 (더 최신일 수 있음)
  let themeData = readLocalThemeJson(themeId) || remoteTheme;

  // 노드 타입 선택
  console.log("\n  노드 타입 선택:");
  const nodeType = await selectFromList(
    ["ASSET", "MACRO", "BUSINESS_FIELD", "CHARACTER"],
    (t) => t,
    "번호 선택: "
  );
  if (!nodeType) return;

  let nodeData, nodeId, node, isNewAsset = false;

  if (nodeType === "ASSET") {
    console.log("\n  📡 GitHub asset_ssot.csv 로딩...");
    const assets = await fetchAssetSsot();
    const result = await selectOrCreateAsset(assets);
    if (!result) return;
    nodeData = result.asset;
    nodeId = nodeData.asset_id;
    node = assetToNode(nodeData);
    isNewAsset = result.isNew;
  } else {
    const fetchFn = { MACRO: fetchMacroSsot, BUSINESS_FIELD: fetchBfSsot, CHARACTER: fetchCharacterSsot }[nodeType];
    console.log(`\n  📡 GitHub ${nodeType} SSOT 로딩...`);
    const ssotData = await fetchFn();
    const selected = await selectNode(nodeType, ssotData);
    if (!selected) return;
    nodeData = selected;
    nodeId = getNodeId(nodeType, selected);
    node = anyToNode(nodeType, selected);
  }

  // 중복 노드 체크
  if (themeData.nodes.some((n) => n.id === nodeId)) {
    console.log(`  ⚠️  ${nodeId}는 이미 ${themeId}에 존재합니다.`);
    if (!(await confirm("관계만 추가하시겠습니까?"))) return;
  } else {
    themeData.nodes.push(node);
  }

  // 관계 설정
  const relType = await selectRelationType(nodeType, "THEME");
  if (!relType) return;

  const confidence = await askDefault("confidence", "0.90");
  const description = await askDefault("description", "");

  const edge = { from: nodeId, to: themeId, type: relType };
  if (confidence !== "0.90") edge.confidence = parseFloat(confidence);
  if (description) edge.description = description;

  // 중복 edge 체크
  const edgeExists = themeData.edges.some(
    (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
  );
  if (edgeExists) {
    console.log(`  ⚠️  동일한 관계가 이미 존재합니다.`);
    return;
  }

  themeData.edges.push(edge);
  // links 배열도 동기화
  themeData.links = [...themeData.edges];

  // 실행 확인
  const changedFiles = [];
  console.log("\n  📋 수정 예정 파일:");
  console.log(`    - public/data/theme/${themeId}.json`);
  if (isNewAsset) console.log("    - public/data/ssot/asset_ssot.csv");
  console.log(`    - public/data/ssot/relationship_${relType}_${nodeId}_${themeId}.csv`);
  console.log("    - public/data/theme/index.json");
  console.log("    - public/data/search/search_index.json");

  if (!(await confirm("\n진행하시겠습니까?"))) return;

  // 저장
  changedFiles.push(writeThemeJson(themeId, themeData));

  if (isNewAsset) {
    const localAssets = readLocalAssetSsot();
    localAssets.push(nodeData);
    changedFiles.push(writeAssetSsot(localAssets));
  }

  changedFiles.push(writeRelationshipCsv(relType, nodeId, themeId, confidence, description));

  const index = updateIndexCounts(readLocalIndex());
  changedFiles.push(writeIndex(index));

  rebuildSearch();
  changedFiles.push(SEARCH_INDEX);

  console.log("\n  ✅ 노드 추가 완료!");
  await gitPush(changedFiles);
}

// ───────────── Case 2: 기존 테마에 관계 추가 ─────────────
async function addEdgeToTheme() {
  console.log("\n=== 기존 테마에 관계 추가 ===");

  const themeId = await ask("테마 ID (예: T_009): ");
  if (!/^T_\d+$/.test(themeId)) {
    console.log("❌ 유효하지 않은 테마 ID 형식입니다.");
    return;
  }

  const remoteTheme = await fetchThemeJson(themeId);
  if (!remoteTheme) {
    console.log(`  ❌ GitHub에 ${themeId}.json이 존재하지 않습니다.`);
    return;
  }

  let themeData = readLocalThemeJson(themeId) || remoteTheme;
  console.log(`  ✅ 테마: ${themeData.themeName}`);
  console.log(`  현재 노드: ${themeData.nodes.map((n) => `${n.id}(${n.type})`).join(", ")}`);

  // from 노드 선택
  console.log("\n  === FROM 노드 ===");
  console.log("  from 노드 타입 선택:");
  const fromType = await selectFromList(
    ["ASSET", "MACRO", "BUSINESS_FIELD", "CHARACTER"],
    (t) => t
  );
  if (!fromType) return;

  const fromFetchFn = {
    ASSET: fetchAssetSsot,
    MACRO: fetchMacroSsot,
    BUSINESS_FIELD: fetchBfSsot,
    CHARACTER: fetchCharacterSsot,
  }[fromType];
  console.log(`  📡 GitHub ${fromType} SSOT 로딩...`);
  const fromSsot = await fromFetchFn();

  let fromData, fromId;
  if (fromType === "ASSET") {
    const query = await ask("from Asset 검색어: ");
    const results = searchAssets(fromSsot, query);
    if (!results.length) { console.log("  검색 결과 없음."); return; }
    console.log(`\n  🔍 검색 결과 (${results.length}건):`);
    fromData = await selectFromList(results.slice(0, 20),
      (a) => `${a.asset_id} | ${a.asset_name_ko} | ${a.ticker}`);
    if (!fromData) return;
    fromId = fromData.asset_id;
  } else {
    fromData = await selectNode(fromType, fromSsot);
    if (!fromData) return;
    fromId = getNodeId(fromType, fromData);
  }

  // to 노드 선택
  console.log("\n  === TO 노드 ===");
  console.log("  to 노드 타입 선택:");
  const toType = await selectFromList(
    ["ASSET", "MACRO", "BUSINESS_FIELD", "CHARACTER", "THEME"],
    (t) => t
  );
  if (!toType) return;

  let toData, toId;
  if (toType === "THEME") {
    toId = themeId;
    console.log(`  → to: ${themeId} (현재 테마)`);
  } else {
    const toFetchFn = {
      ASSET: fetchAssetSsot,
      MACRO: fetchMacroSsot,
      BUSINESS_FIELD: fetchBfSsot,
      CHARACTER: fetchCharacterSsot,
    }[toType];
    console.log(`  📡 GitHub ${toType} SSOT 로딩...`);
    const toSsot = await toFetchFn();

    if (toType === "ASSET") {
      const query = await ask("to Asset 검색어: ");
      const results = searchAssets(toSsot, query);
      if (!results.length) { console.log("  검색 결과 없음."); return; }
      console.log(`\n  🔍 검색 결과 (${results.length}건):`);
      toData = await selectFromList(results.slice(0, 20),
        (a) => `${a.asset_id} | ${a.asset_name_ko} | ${a.ticker}`);
      if (!toData) return;
      toId = toData.asset_id;
    } else {
      toData = await selectNode(toType, toSsot);
      if (!toData) return;
      toId = getNodeId(toType, toData);
    }
  }

  // 관계 타입 선택
  const relType = await selectRelationType(fromType, toType);
  if (!relType) return;

  const confidence = await askDefault("confidence", "0.90");
  const description = await askDefault("description", "");

  // 노드가 테마에 없으면 추가
  if (fromId && !themeData.nodes.some((n) => n.id === fromId)) {
    const node = anyToNode(fromType, fromData);
    if (node) themeData.nodes.push(node);
  }
  if (toId && toId !== themeId && !themeData.nodes.some((n) => n.id === toId)) {
    const node = anyToNode(toType, toData);
    if (node) themeData.nodes.push(node);
  }

  const edge = { from: fromId, to: toId, type: relType };
  if (confidence !== "0.90") edge.confidence = parseFloat(confidence);
  if (description) edge.description = description;

  const edgeExists = themeData.edges.some(
    (e) => e.from === edge.from && e.to === edge.to && e.type === edge.type
  );
  if (edgeExists) {
    console.log(`  ⚠️  동일한 관계가 이미 존재합니다.`);
    return;
  }

  themeData.edges.push(edge);
  themeData.links = [...themeData.edges];

  const changedFiles = [];
  console.log("\n  📋 수정 예정 파일:");
  console.log(`    - public/data/theme/${themeId}.json`);
  console.log(`    - public/data/ssot/relationship_${relType}_${fromId}_${toId}.csv`);
  console.log("    - public/data/theme/index.json");
  console.log("    - public/data/search/search_index.json");

  if (!(await confirm("\n진행하시겠습니까?"))) return;

  changedFiles.push(writeThemeJson(themeId, themeData));
  changedFiles.push(writeRelationshipCsv(relType, fromId, toId, confidence, description));

  const index = updateIndexCounts(readLocalIndex());
  changedFiles.push(writeIndex(index));

  rebuildSearch();
  changedFiles.push(SEARCH_INDEX);

  console.log("\n  ✅ 관계 추가 완료!");
  await gitPush(changedFiles);
}

// ───────────── Case 3: 신규 테마 생성 ─────────────
async function createNewTheme() {
  console.log("\n=== 신규 테마 생성 ===");

  console.log("  📡 GitHub index.json 로딩...");
  const remoteIndex = await fetchThemeIndex();
  const existingIds = remoteIndex.map((t) => t.themeId);
  const newThemeId = nextId("T_", existingIds);
  console.log(`  ✅ 신규 테마 ID: ${newThemeId}`);

  const themeNameKr = await ask("theme_name_kr (공백 없이): ");
  const themeNameEn = await ask("theme_name_en: ");

  if (!themeNameKr) {
    console.log("❌ 테마 이름은 필수입니다.");
    return;
  }

  const themeData = {
    themeId: newThemeId,
    themeName: themeNameKr,
    themeNameEn: themeNameEn || "",
    nodes: [
      { id: newThemeId, type: "THEME", name: themeNameKr },
    ],
    edges: [],
    meta: {
      metricsUpdatedAtUTC: "",
      metricsStatus: "",
      metricsLastError: "",
      dataAsOf: new Date().toISOString(),
    },
    links: [],
  };

  // 첫 번째 노드 추가
  if (await confirm("첫 번째 노드를 추가하시겠습니까?")) {
    console.log("\n  노드 타입 선택:");
    const nodeType = await selectFromList(
      ["ASSET", "MACRO", "BUSINESS_FIELD", "CHARACTER"],
      (t) => t
    );

    if (nodeType) {
      let nodeData, nodeId, node, isNewAsset = false;

      if (nodeType === "ASSET") {
        console.log("\n  📡 GitHub asset_ssot.csv 로딩...");
        const assets = await fetchAssetSsot();
        const result = await selectOrCreateAsset(assets);
        if (result) {
          nodeData = result.asset;
          nodeId = nodeData.asset_id;
          node = assetToNode(nodeData);
          isNewAsset = result.isNew;
        }
      } else {
        const fetchFn = { MACRO: fetchMacroSsot, BUSINESS_FIELD: fetchBfSsot, CHARACTER: fetchCharacterSsot }[nodeType];
        console.log(`\n  📡 GitHub ${nodeType} SSOT 로딩...`);
        const ssotData = await fetchFn();
        const selected = await selectNode(nodeType, ssotData);
        if (selected) {
          nodeData = selected;
          nodeId = getNodeId(nodeType, selected);
          node = anyToNode(nodeType, selected);
        }
      }

      if (node && nodeId) {
        themeData.nodes.push(node);
        const relType = await selectRelationType(nodeType, "THEME");
        if (relType) {
          const confidence = await askDefault("confidence", "0.90");
          const description = await askDefault("description", "");
          const edge = { from: nodeId, to: newThemeId, type: relType };
          if (confidence !== "0.90") edge.confidence = parseFloat(confidence);
          if (description) edge.description = description;
          themeData.edges.push(edge);
          themeData.links = [...themeData.edges];
        }

        // 추가 노드를 더 넣을지
        while (await confirm("노드를 더 추가하시겠습니까?")) {
          console.log("\n  노드 타입 선택:");
          const moreType = await selectFromList(
            ["ASSET", "MACRO", "BUSINESS_FIELD", "CHARACTER"],
            (t) => t
          );
          if (!moreType) break;

          let moreNode, moreId, moreIsNew = false;
          if (moreType === "ASSET") {
            const assets = await fetchAssetSsot();
            const moreResult = await selectOrCreateAsset(assets);
            if (!moreResult) continue;
            moreNode = assetToNode(moreResult.asset);
            moreId = moreResult.asset.asset_id;
            moreIsNew = moreResult.isNew;
            if (moreIsNew) {
              isNewAsset = true;
              nodeData = moreResult.asset; // 마지막 새 Asset 보관
            }
          } else {
            const fetchFn2 = { MACRO: fetchMacroSsot, BUSINESS_FIELD: fetchBfSsot, CHARACTER: fetchCharacterSsot }[moreType];
            const ssotData2 = await fetchFn2();
            const sel2 = await selectNode(moreType, ssotData2);
            if (!sel2) continue;
            moreNode = anyToNode(moreType, sel2);
            moreId = getNodeId(moreType, sel2);
          }

          if (moreNode && moreId) {
            if (!themeData.nodes.some((n) => n.id === moreId)) {
              themeData.nodes.push(moreNode);
            }
            const moreRel = await selectRelationType(moreType, "THEME");
            if (moreRel) {
              const moreConf = await askDefault("confidence", "0.90");
              const moreDesc = await askDefault("description", "");
              const moreEdge = { from: moreId, to: newThemeId, type: moreRel };
              if (moreConf !== "0.90") moreEdge.confidence = parseFloat(moreConf);
              if (moreDesc) moreEdge.description = moreDesc;
              themeData.edges.push(moreEdge);
              themeData.links = [...themeData.edges];
            }
          }
        }

        // 신규 Asset SSOT 처리
        if (isNewAsset && nodeData) {
          const localAssets = readLocalAssetSsot();
          if (!localAssets.some((a) => a.asset_id === nodeData.asset_id)) {
            localAssets.push(nodeData);
            writeAssetSsot(localAssets);
          }
        }
      }
    }
  }

  const changedFiles = [];
  console.log("\n  📋 수정 예정 파일:");
  console.log(`    - public/data/theme/${newThemeId}.json`);
  console.log("    - public/data/theme/index.json");
  console.log("    - public/data/search/search_index.json");

  if (!(await confirm("\n진행하시겠습니까?"))) return;

  changedFiles.push(writeThemeJson(newThemeId, themeData));

  const index = readLocalIndex();
  index.push({ themeId: newThemeId, themeName: themeNameKr });
  const updatedIndex = updateIndexCounts(index);
  changedFiles.push(writeIndex(updatedIndex));

  rebuildSearch();
  changedFiles.push(SEARCH_INDEX);

  console.log(`\n  ✅ 신규 테마 생성 완료: ${newThemeId} (${themeNameKr})`);
  await gitPush(changedFiles);
}

// ───────────── Case 4: 여러 테마에 동일 노드 추가 ─────────────
async function addNodeToMultipleThemes() {
  console.log("\n=== 여러 테마에 동일 노드 추가 ===");

  // 노드 타입 선택
  console.log("  노드 타입 선택:");
  const nodeType = await selectFromList(
    ["ASSET", "MACRO", "BUSINESS_FIELD", "CHARACTER"],
    (t) => t
  );
  if (!nodeType) return;

  let nodeData, nodeId, node, isNewAsset = false;

  if (nodeType === "ASSET") {
    console.log("\n  📡 GitHub asset_ssot.csv 로딩...");
    const assets = await fetchAssetSsot();
    const result = await selectOrCreateAsset(assets);
    if (!result) return;
    nodeData = result.asset;
    nodeId = nodeData.asset_id;
    node = assetToNode(nodeData);
    isNewAsset = result.isNew;
  } else {
    const fetchFn = { MACRO: fetchMacroSsot, BUSINESS_FIELD: fetchBfSsot, CHARACTER: fetchCharacterSsot }[nodeType];
    console.log(`\n  📡 GitHub ${nodeType} SSOT 로딩...`);
    const ssotData = await fetchFn();
    const selected = await selectNode(nodeType, ssotData);
    if (!selected) return;
    nodeData = selected;
    nodeId = getNodeId(nodeType, selected);
    node = anyToNode(nodeType, selected);
  }

  console.log(`\n  선택된 노드: ${nodeId}`);
  const themeIdsInput = await ask("추가할 테마 ID들 (쉼표 구분, 예: T_009,T_011,T_029): ");
  const themeIds = themeIdsInput
    .split(",")
    .map((s) => s.trim())
    .filter((s) => /^T_\d+$/.test(s));

  if (!themeIds.length) {
    console.log("❌ 유효한 테마 ID가 없습니다.");
    return;
  }

  const changedFiles = [];
  const edgesPerTheme = [];

  for (const themeId of themeIds) {
    console.log(`\n  --- ${themeId} ---`);
    let themeData = readLocalThemeJson(themeId);
    if (!themeData) {
      const remote = await fetchThemeJson(themeId);
      if (!remote) {
        console.log(`  ⚠️  ${themeId} 존재하지 않음. 건너뜁니다.`);
        continue;
      }
      themeData = remote;
    }
    console.log(`  테마: ${themeData.themeName}`);

    const relType = await selectRelationType(nodeType, "THEME");
    if (!relType) continue;

    const confidence = await askDefault("confidence", "0.90");
    const description = await askDefault("description", "");

    // 노드 추가
    if (!themeData.nodes.some((n) => n.id === nodeId)) {
      themeData.nodes.push(JSON.parse(JSON.stringify(node)));
    }

    const edge = { from: nodeId, to: themeId, type: relType };
    if (confidence !== "0.90") edge.confidence = parseFloat(confidence);
    if (description) edge.description = description;

    if (!themeData.edges.some((e) => e.from === edge.from && e.to === edge.to && e.type === edge.type)) {
      themeData.edges.push(edge);
      themeData.links = [...themeData.edges];
    }

    edgesPerTheme.push({ themeId, relType, confidence, description });
    changedFiles.push(writeThemeJson(themeId, themeData));
    changedFiles.push(writeRelationshipCsv(relType, nodeId, themeId, confidence, description));
  }

  if (!changedFiles.length) return;

  // Asset SSOT 업데이트
  if (isNewAsset) {
    const localAssets = readLocalAssetSsot();
    if (!localAssets.some((a) => a.asset_id === nodeData.asset_id)) {
      localAssets.push(nodeData);
      changedFiles.push(writeAssetSsot(localAssets));
    }
  }

  // index.json 업데이트
  const index = updateIndexCounts(readLocalIndex());
  changedFiles.push(writeIndex(index));

  rebuildSearch();
  changedFiles.push(SEARCH_INDEX);

  console.log("\n  ✅ 여러 테마에 노드 추가 완료!");
  await gitPush([...new Set(changedFiles)]);
}

// ───────────── Case 5: Macro/BF/Character 연결 ─────────────
async function linkMacroBfCharacter() {
  console.log("\n=== Macro/BF/Character 연결 ===");

  // 연결 대상 선택
  console.log("  연결 대상 선택:");
  const targetType = await selectFromList(["테마 (Theme)", "자산 (Asset)"], (t) => t);
  if (!targetType) return;

  let targetId, themeId, themeData;

  if (targetType.startsWith("테마")) {
    themeId = await ask("테마 ID (예: T_009): ");
    if (!/^T_\d+$/.test(themeId)) { console.log("❌ 유효하지 않은 테마 ID."); return; }
    themeData = readLocalThemeJson(themeId);
    if (!themeData) {
      themeData = await fetchThemeJson(themeId);
      if (!themeData) { console.log(`  ❌ ${themeId} 존재하지 않음.`); return; }
    }
    targetId = themeId;
    console.log(`  ✅ 테마: ${themeData.themeName}`);
  } else {
    // Asset 선택 → 해당 Asset이 속한 테마 선택
    console.log("  📡 GitHub asset_ssot.csv 로딩...");
    const assets = await fetchAssetSsot();
    const query = await ask("Asset 검색어: ");
    const results = searchAssets(assets, query);
    if (!results.length) { console.log("  검색 결과 없음."); return; }
    console.log(`\n  🔍 검색 결과 (${results.length}건):`);
    const selected = await selectFromList(results.slice(0, 20),
      (a) => `${a.asset_id} | ${a.asset_name_ko} | ${a.ticker}`);
    if (!selected) return;
    targetId = selected.asset_id;

    // Asset이 속한 테마 찾기
    themeId = await ask("이 Asset이 속한 테마 ID (예: T_009): ");
    if (!/^T_\d+$/.test(themeId)) { console.log("❌ 유효하지 않은 테마 ID."); return; }
    themeData = readLocalThemeJson(themeId);
    if (!themeData) {
      themeData = await fetchThemeJson(themeId);
      if (!themeData) { console.log(`  ❌ ${themeId} 존재하지 않음.`); return; }
    }
    console.log(`  ✅ 테마: ${themeData.themeName}`);
  }

  // Macro/BF/Character 선택
  console.log("\n  연결할 타입 선택:");
  const linkType = await selectFromList(
    ["MACRO", "BUSINESS_FIELD", "CHARACTER"],
    (t) => t
  );
  if (!linkType) return;

  const fetchFn = { MACRO: fetchMacroSsot, BUSINESS_FIELD: fetchBfSsot, CHARACTER: fetchCharacterSsot }[linkType];
  console.log(`  📡 GitHub ${linkType} SSOT 로딩...`);
  const ssotData = await fetchFn();
  const selected = await selectNode(linkType, ssotData);
  if (!selected) return;

  const linkId = getNodeId(linkType, selected);
  const linkNode = anyToNode(linkType, selected);

  // 관계 타입 자동 결정
  const targetNodeType = targetType.startsWith("테마") ? "THEME" : "ASSET";
  const relType = await selectRelationType(linkType, targetNodeType);
  if (!relType) return;

  const confidence = await askDefault("confidence", "0.90");
  const description = await askDefault("description", "");

  // 노드 추가
  if (!themeData.nodes.some((n) => n.id === linkId)) {
    themeData.nodes.push(linkNode);
  }

  // from/to 방향 결정
  let fromId, toId;
  if (linkType === "MACRO" && targetNodeType === "THEME") {
    fromId = linkId; toId = targetId; // M_xxx → T_xxx (IMPACTS)
  } else if (linkType === "CHARACTER" && targetNodeType === "ASSET") {
    fromId = targetId; toId = linkId; // A_xxx → C_xxx (HAS_TRAIT)
  } else if (linkType === "BUSINESS_FIELD" && targetNodeType === "ASSET") {
    fromId = targetId; toId = linkId; // A_xxx → BF_xxx (OPERATES)
  } else if (linkType === "MACRO" && targetNodeType === "ASSET") {
    fromId = linkId; toId = targetId; // M_xxx → A_xxx (IMPACTS)
  } else {
    fromId = linkId; toId = targetId;
  }

  const edge = { from: fromId, to: toId, type: relType };
  if (confidence !== "0.90") edge.confidence = parseFloat(confidence);
  if (description) edge.description = description;

  if (themeData.edges.some((e) => e.from === edge.from && e.to === edge.to && e.type === edge.type)) {
    console.log(`  ⚠️  동일한 관계가 이미 존재합니다.`);
    return;
  }

  themeData.edges.push(edge);
  themeData.links = [...themeData.edges];

  const changedFiles = [];
  console.log("\n  📋 수정 예정 파일:");
  console.log(`    - public/data/theme/${themeId}.json`);
  console.log(`    - public/data/ssot/relationship_${relType}_${fromId}_${toId}.csv`);
  console.log("    - public/data/theme/index.json");
  console.log("    - public/data/search/search_index.json");

  if (!(await confirm("\n진행하시겠습니까?"))) return;

  changedFiles.push(writeThemeJson(themeId, themeData));
  changedFiles.push(writeRelationshipCsv(relType, fromId, toId, confidence, description));

  const index = updateIndexCounts(readLocalIndex());
  changedFiles.push(writeIndex(index));

  rebuildSearch();
  changedFiles.push(SEARCH_INDEX);

  console.log("\n  ✅ 연결 완료!");
  await gitPush(changedFiles);
}

// ───────────── 메인 메뉴 ─────────────
async function main() {
  console.log("╔══════════════════════════════════════╗");
  console.log("║    MoneyTree 테마 데이터 관리 CLI     ║");
  console.log("╚══════════════════════════════════════╝");

  while (true) {
    console.log("\n=== 메인 메뉴 ===");
    console.log("  1. 기존 테마에 노드 추가");
    console.log("  2. 기존 테마에 관계 추가 (노드 간)");
    console.log("  3. 신규 테마 생성");
    console.log("  4. 여러 테마에 동일 노드 추가");
    console.log("  5. Macro/BF/Character 연결");
    console.log("  0. 종료");

    const choice = await ask("\n선택: ");

    try {
      switch (choice) {
        case "1":
          await addNodeToTheme();
          break;
        case "2":
          await addEdgeToTheme();
          break;
        case "3":
          await createNewTheme();
          break;
        case "4":
          await addNodeToMultipleThemes();
          break;
        case "5":
          await linkMacroBfCharacter();
          break;
        case "0":
          console.log("종료합니다.");
          rl.close();
          process.exit(0);
        default:
          console.log("❌ 잘못된 선택입니다.");
      }
    } catch (err) {
      console.error(`\n  ❌ 오류 발생: ${err.message}`);
      if (process.env.DEBUG) console.error(err.stack);
    }
  }
}

main();
