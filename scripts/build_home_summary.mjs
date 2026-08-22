// scripts/build_home_summary.mjs
// 홈 화면용 집계 파일 생성 — 735개 테마를 클라이언트에서 개별 fetch하던 것을 단일 파일로 대체.
// 출력: public/data/home_summary.json { counts:{themes,assets,macros,edges}, updates:[...] }
// 입력: public/data/theme/*.json (mt:update로 동기된 로컬 사본)
import fs from "fs";
import path from "path";

const THEME_DIR = path.join(process.cwd(), "public", "data", "theme");
const OUT = path.join(process.cwd(), "public", "data", "home_summary.json");

function main() {
  let files = [];
  try {
    files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
  } catch {
    console.error("[home_summary] theme dir 없음:", THEME_DIR);
    process.exit(0);
  }
  const assetIds = new Set();
  const macroIds = new Set();
  let totalEdges = 0;
  let themeCount = 0;
  const updates = [];

  for (const f of files) {
    let d;
    try {
      d = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf8"));
    } catch {
      continue;
    }
    themeCount++;
    const nodes = Array.isArray(d.nodes) ? d.nodes : [];
    for (const n of nodes) {
      if (!n?.id) continue;
      if (n.type === "ASSET") assetIds.add(n.id);
      else if (n.type === "MACRO") macroIds.add(n.id);
    }
    const edges = Array.isArray(d.edges) ? d.edges : Array.isArray(d.links) ? d.links : [];
    totalEdges += edges.length;

    const cl = d.meta?.changelog;
    if (Array.isArray(cl)) {
      for (const e of cl) {
        if (e && (e.title || e.detail)) {
          updates.push({ ...e, themeId: d.themeId, themeName: d.themeName });
        }
      }
    }
  }

  updates.sort((a, b) => (Date.parse(b.date || "") || 0) - (Date.parse(a.date || "") || 0));

  const out = {
    generated: new Date().toISOString(),
    counts: { themes: themeCount, assets: assetIds.size, macros: macroIds.size, edges: totalEdges },
    updates: updates.slice(0, 200),
  };
  fs.writeFileSync(OUT, JSON.stringify(out));
  console.log(
    `[home_summary] themes=${themeCount} assets=${assetIds.size} macros=${macroIds.size} edges=${totalEdges} updates=${out.updates.length} → ${OUT}`,
  );
}

main();
