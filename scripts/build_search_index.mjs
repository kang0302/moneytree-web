// scripts/build_search_index.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

// ✅ 정식 소스: public/data/ (Next dev/SSR과 GitHub Pages가 실제로 서빙하는 경로).
// import_MT/data/는 과거 호환용. public이 없으면 fallback으로 import_MT를 본다.
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

// search index 출력: public/(서빙용) + import_MT/(레거시 미러) 양쪽
const OUT_FILE = path.join(PUBLIC_DATA, "search", "search_index.json");
const LEGACY_OUT_FILE = path.join(LEGACY_DATA, "search", "search_index.json");

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

function loadCsvIfExists(name) {
  const p = path.join(SSOT_DIR, name);
  if (!fs.existsSync(p)) {
    console.warn(`⚠️  SSOT not found: ${p}`);
    return [];
  }
  try {
    return parseCsv(fs.readFileSync(p, "utf-8"));
  } catch (e) {
    console.warn(`⚠️  failed to parse ${name}: ${e?.message}`);
    return [];
  }
}

function safeLower(s) {
  return (s ?? "").toString().trim().toLowerCase();
}

function tokenizeName(name) {
  const n = (name ?? "").toString().trim();
  if (!n) return [];
  const noSpace = n.replace(/\s+/g, "");
  const lower = safeLower(n);
  const lowerNoSpace = safeLower(noSpace);
  return [...new Set([n, noSpace, lower, lowerNoSpace].filter(Boolean))];
}

function assetTokens({ name, ticker }) {
  const tokens = new Set(tokenizeName(name));
  const t = safeLower(ticker);
  if (t) {
    tokens.add(t);
    const digits = t.replace(/[^0-9]/g, "");
    if (digits) tokens.add(digits);
  }
  return [...tokens];
}

function genericTokens({ name }) {
  return [...new Set(tokenizeName(name))];
}

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, "utf-8"));
}

function main() {
  if (!fs.existsSync(THEME_DIR)) {
    throw new Error(`theme dir not found: ${THEME_DIR}`);
  }

  // ✅ 테마 파일 후보: index.json에 등록된 themeId + 디렉터리의 T_*.json 파일 (합집합).
  // index.json이 깨졌거나 누락되어도 디스크 파일까지 모두 인덱싱 → 누락 zero.
  const fileSet = new Set();

  // 1) directory scan
  for (const f of fs.readdirSync(THEME_DIR)) {
    if (/^T_\d+\.json$/i.test(f)) fileSet.add(f);
  }

  // 2) index.json 등록 항목 보강 (다른 네이밍이라도 themeId.json으로 추가)
  const indexJsonPath = path.join(THEME_DIR, "index.json");
  let indexedCount = 0;
  if (fs.existsSync(indexJsonPath)) {
    try {
      const idxDoc = readJson(indexJsonPath);
      // index.json은 두 형식 모두 가능: 배열 또는 { themes: [...] }
      const list = Array.isArray(idxDoc)
        ? idxDoc
        : Array.isArray(idxDoc?.themes)
        ? idxDoc.themes
        : [];
      for (const it of list) {
        const tid = (typeof it === "string" ? it : it?.themeId ?? it?.themeID ?? it?.id ?? "").toString().trim();
        if (!tid) continue;
        const fname = `${tid}.json`;
        if (fs.existsSync(path.join(THEME_DIR, fname))) {
          fileSet.add(fname);
          indexedCount++;
        } else {
          console.warn(`⚠️  index.json refers to ${tid} but ${fname} not found`);
        }
      }
    } catch (e) {
      console.warn(`⚠️  failed to parse index.json: ${e?.message}`);
    }
  } else {
    console.warn(`⚠️  index.json not found at ${indexJsonPath} — using directory scan only`);
  }

  const files = [...fileSet].sort();
  console.log(`📂 indexing ${files.length} theme file(s) (index.json refs=${indexedCount})`);

  const assetMap = new Map(); // A_### -> entry
  const bfMap = new Map(); // BF_### -> entry
  const macroMap = new Map(); // M_### -> entry
  const themeMap = new Map(); // T_### -> entry
  const characterMap = new Map(); // C_### -> entry

  for (const file of files) {
    const full = path.join(THEME_DIR, file);
    let doc;
    try {
      doc = readJson(full);
    } catch {
      console.warn(`⚠️ skip invalid json: ${file}`);
      continue;
    }

    const themeId = doc?.themeId;
    const themeName = doc?.themeName;
    if (!themeId || !themeName) continue;

    if (!themeMap.has(themeId)) {
      themeMap.set(themeId, {
        id: themeId,
        name: themeName,
        assets: [],
        businessFields: [],
        macros: [],
        searchTokens: genericTokens({ name: themeName }).concat([safeLower(themeId)]),
      });
    }

    const nodes = Array.isArray(doc?.nodes) ? doc.nodes : [];
    const edges = Array.isArray(doc?.edges) ? doc.edges : [];

    for (const n of nodes) {
      if (!n?.id || !n?.type) continue;

      // ASSET
      if (n.type === "ASSET") {
        if (!assetMap.has(n.id)) {
          const exposure = n.exposure ?? {};
          assetMap.set(n.id, {
            id: n.id,
            name: n.name ?? n.id,
            ticker: exposure.ticker ?? "",
            exchange: exposure.exchange ?? "",
            country: exposure.country ?? "",
            themes: [],
            businessFields: [],
            macros: [],
            searchTokens: [],
          });
        }
        const a = assetMap.get(n.id);
        if (!a.themes.includes(themeId)) a.themes.push(themeId);
      }

      // BUSINESS_FIELD
      if (n.type === "BUSINESS_FIELD") {
        if (!bfMap.has(n.id)) {
          bfMap.set(n.id, {
            id: n.id,
            name: n.name ?? n.id,
            themes: [],
            assets: [],
            searchTokens: [],
          });
        }
        const bf = bfMap.get(n.id);
        if (!bf.themes.includes(themeId)) bf.themes.push(themeId);
      }

      // MACRO
      if (n.type === "MACRO") {
        if (!macroMap.has(n.id)) {
          macroMap.set(n.id, {
            id: n.id,
            name: n.name ?? n.id,
            macro_type: (n.macro_type ?? n.macroType ?? "").toString(),
            themes: [],
            assets: [],
            searchTokens: [],
          });
        }
        const m = macroMap.get(n.id);
        if (!m.themes.includes(themeId)) m.themes.push(themeId);
      }
    }

    // edges로 연결 보강
    for (const e of edges) {
      const from = e?.from;
      const to = e?.to;
      if (!from || !to) continue;

      // Theme <-> Asset
      if (from === themeId && to.startsWith("A_")) {
        const a = assetMap.get(to);
        if (a && !a.themes.includes(themeId)) a.themes.push(themeId);
      }
      if (to === themeId && from.startsWith("A_")) {
        const a = assetMap.get(from);
        if (a && !a.themes.includes(themeId)) a.themes.push(themeId);
      }

      // Asset <-> BF
      if (from.startsWith("A_") && to.startsWith("BF_")) {
        const a = assetMap.get(from);
        const bf = bfMap.get(to);
        if (a && !a.businessFields.includes(to)) a.businessFields.push(to);
        if (bf && !bf.assets.includes(from)) bf.assets.push(from);
      }
      if (to.startsWith("A_") && from.startsWith("BF_")) {
        const a = assetMap.get(to);
        const bf = bfMap.get(from);
        if (a && !a.businessFields.includes(from)) a.businessFields.push(from);
        if (bf && !bf.assets.includes(to)) bf.assets.push(to);
      }

      // Theme <-> Macro
      if (from === themeId && to.startsWith("M_")) {
        const m = macroMap.get(to);
        if (m && !m.themes.includes(themeId)) m.themes.push(themeId);
      }
      if (to === themeId && from.startsWith("M_")) {
        const m = macroMap.get(from);
        if (m && !m.themes.includes(themeId)) m.themes.push(themeId);
      }

      // Macro <-> Asset
      if (from.startsWith("M_") && to.startsWith("A_")) {
        const m = macroMap.get(from);
        const a = assetMap.get(to);
        if (m && !m.assets.includes(to)) m.assets.push(to);
        if (a && !a.macros.includes(from)) a.macros.push(from);
      }
      if (to.startsWith("M_") && from.startsWith("A_")) {
        const m = macroMap.get(to);
        const a = assetMap.get(from);
        if (m && !m.assets.includes(from)) m.assets.push(from);
        if (a && !a.macros.includes(to)) a.macros.push(to);
      }
    }
  }

  // themeMap 역방향 채우기
  for (const a of assetMap.values()) {
    for (const t of a.themes) {
      const te = themeMap.get(t);
      if (te && !te.assets.includes(a.id)) te.assets.push(a.id);
    }
  }
  for (const bf of bfMap.values()) {
    for (const t of bf.themes) {
      const te = themeMap.get(t);
      if (te && !te.businessFields.includes(bf.id)) te.businessFields.push(bf.id);
    }
  }
  for (const m of macroMap.values()) {
    for (const t of m.themes) {
      const te = themeMap.get(t);
      if (te && !te.macros.includes(m.id)) te.macros.push(m.id);
    }
  }

  // ✅ SSOT 보충: theme JSON에 등장하지 않는 항목까지 검색 가능하게 한다.
  // asset_ssot.csv → assetMap에 누락분 추가
  for (const r of loadCsvIfExists("asset_ssot.csv")) {
    const id = (r.asset_id || r.id || "").trim();
    if (!id) continue;
    if (assetMap.has(id)) {
      // 이름이 비어있으면 SSOT의 한국어/영문명으로 보강
      const cur = assetMap.get(id);
      if (!cur.name || cur.name === id) cur.name = r.asset_name_ko || r.asset_name_en || cur.name;
      if (!cur.ticker) cur.ticker = r.ticker || "";
      if (!cur.exchange) cur.exchange = r.exchange || "";
      if (!cur.country) cur.country = r.country || "";
      continue;
    }
    assetMap.set(id, {
      id,
      name: r.asset_name_ko || r.asset_name_en || id,
      ticker: r.ticker || "",
      exchange: r.exchange || "",
      country: r.country || "",
      themes: [],
      businessFields: [],
      macros: [],
      searchTokens: [],
    });
  }

  // business_field_ssot.csv → bfMap 보충
  for (const r of loadCsvIfExists("business_field_ssot.csv")) {
    const id = (r.bf_id || r.business_field_id || r.id || "").trim();
    if (!id) continue;
    if (bfMap.has(id)) {
      const cur = bfMap.get(id);
      if (!cur.name || cur.name === id) cur.name = r.business_field_ko || r.business_field_en || cur.name;
      continue;
    }
    bfMap.set(id, {
      id,
      name: r.business_field_ko || r.business_field_en || id,
      themes: [],
      assets: [],
      searchTokens: [],
    });
  }

  // macro_ssot.csv → macroMap 보충
  for (const r of loadCsvIfExists("macro_ssot.csv")) {
    const id = (r.macro_id || r.id || "").trim();
    if (!id) continue;
    const macroType = (r.macro_type || "").trim();
    if (macroMap.has(id)) {
      const cur = macroMap.get(id);
      if (!cur.name || cur.name === id) cur.name = r.macro_name_ko || r.macro_name_en || cur.name;
      if (!cur.macro_type) cur.macro_type = macroType;
      continue;
    }
    macroMap.set(id, {
      id,
      name: r.macro_name_ko || r.macro_name_en || id,
      macro_type: macroType,
      themes: [],
      assets: [],
      searchTokens: [],
    });
  }

  // character_ssot.csv → characterMap (theme JSON에는 보통 없음, SSOT가 유일 소스)
  for (const r of loadCsvIfExists("character_ssot.csv")) {
    const id = (r.character_id || r.id || "").trim();
    if (!id) continue;
    characterMap.set(id, {
      id,
      name: r.character_name_kr || r.character_name_ko || r.character_name_en || id,
      themes: [],
      assets: [],
      searchTokens: [],
    });
  }

  // searchTokens 확정
  for (const a of assetMap.values()) {
    a.searchTokens = assetTokens({ name: a.name, ticker: a.ticker })
      .concat([safeLower(a.id), safeLower(a.exchange), safeLower(a.country)])
      .filter(Boolean);
    a.searchTokens = [...new Set(a.searchTokens)];
  }

  for (const bf of bfMap.values()) {
    bf.searchTokens = [...new Set(genericTokens({ name: bf.name }).concat([safeLower(bf.id)]).filter(Boolean))];
  }

  for (const m of macroMap.values()) {
    m.searchTokens = [
      ...new Set(genericTokens({ name: m.name }).concat([safeLower(m.id), safeLower(m.macro_type)]).filter(Boolean)),
    ];
  }

  for (const t of themeMap.values()) {
    t.searchTokens = [...new Set((t.searchTokens ?? []).map(safeLower).filter(Boolean))];
  }

  for (const c of characterMap.values()) {
    c.searchTokens = [
      ...new Set(genericTokens({ name: c.name }).concat([safeLower(c.id)]).filter(Boolean)),
    ];
  }

  const out = {
    schemaVersion: "search_v3",
    generatedAt: new Date().toISOString(),
    totals: {
      assets: assetMap.size,
      themes: themeMap.size,
      businessFields: bfMap.size,
      macros: macroMap.size,
      characters: characterMap.size,
    },
    assets: [...assetMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    themes: [...themeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    businessFields: [...bfMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    macros: [...macroMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    characters: [...characterMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };

  const payload = JSON.stringify(out, null, 2);

  // 정식 출력: public/data/search/
  fs.mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  fs.writeFileSync(OUT_FILE, payload, "utf-8");
  console.log(`✅ Wrote: ${path.relative(ROOT, OUT_FILE)}`);

  // 레거시 미러: import_MT/data/search/ (있는 환경에서만)
  if (fs.existsSync(LEGACY_DATA)) {
    fs.mkdirSync(path.dirname(LEGACY_OUT_FILE), { recursive: true });
    fs.writeFileSync(LEGACY_OUT_FILE, payload, "utf-8");
    console.log(`✅ Wrote: ${path.relative(ROOT, LEGACY_OUT_FILE)}`);
  }

  console.log(`📂 source: theme=${path.relative(ROOT, THEME_DIR)} ssot=${path.relative(ROOT, SSOT_DIR)}`);
  console.log(
    `   assets=${out.totals.assets}, themes=${out.totals.themes}, bfs=${out.totals.businessFields}, macros=${out.totals.macros}, characters=${out.totals.characters}`
  );
}

main();
