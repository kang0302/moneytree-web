// scripts/build_search_index.mjs
import fs from "fs";
import path from "path";

const ROOT = process.cwd();

// ✅ 옵션 A: import_MT/data 를 "원본 데이터 루트"로 고정
const DATA_ROOT = path.join(ROOT, "import_MT", "data");

// theme freeze(json v5) 위치
const THEME_DIR = path.join(DATA_ROOT, "theme");

// search index 생성 위치
const OUT_DIR = path.join(DATA_ROOT, "search");
const OUT_FILE = path.join(OUT_DIR, "search_index.json");

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

  const files = fs
    .readdirSync(THEME_DIR)
    .filter((f) => /^T_\d+\.json$/i.test(f))
    .sort();

  const assetMap = new Map(); // A_### -> entry
  const bfMap = new Map(); // BF_### -> entry
  const macroMap = new Map(); // M_### -> entry
  const themeMap = new Map(); // T_### -> entry

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

  const out = {
    schemaVersion: "search_v3",
    generatedAt: new Date().toISOString(),
    totals: {
      assets: assetMap.size,
      themes: themeMap.size,
      businessFields: bfMap.size,
      macros: macroMap.size,
    },
    assets: [...assetMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    themes: [...themeMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    businessFields: [...bfMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
    macros: [...macroMap.values()].sort((a, b) => a.id.localeCompare(b.id)),
  };

  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2), "utf-8");

  console.log(`✅ Wrote: ${path.relative(ROOT, OUT_FILE)}`);
  console.log(
    `   assets=${out.totals.assets}, themes=${out.totals.themes}, bfs=${out.totals.businessFields}, macros=${out.totals.macros}`
  );
}

main();
