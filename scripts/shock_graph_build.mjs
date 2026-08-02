// 충격 전파 what-if: 전 테마 JSON을 병합해 전역 온톨로지 그래프(노드/엣지) 생성.
// MACRO(이름 병합)→THEME→ASSET(+2궤도), 공유 자산/매크로가 테마 간 브리지. 프론트가 클라이언트 BFS로 전파 계산.
// 산출: import_MT/data/shock/graph.json
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATA_ROOT = fs.existsSync(path.join(ROOT, "import_MT", "data", "theme"))
  ? path.join(ROOT, "import_MT", "data") : path.join(ROOT, "data");
const THEME_DIR = path.join(DATA_ROOT, "theme");
const OUT_DIR = path.join(DATA_ROOT, "shock");
fs.mkdirSync(OUT_DIR, { recursive: true });

// 엣지 타입별 전파 가중치(0~1)
const W = { IMPACTS: 0.9, THEMED_AS: 0.8, EXPOSED_TO: 0.7, SUPPLIES: 0.6, INVESTS: 0.6, PARTNERS: 0.55, OPERATES: 0.6, COMPETES: 0.4, IN_ETF: 0.5, SUB: 0.5 };
const PROP_TYPES = new Set(Object.keys(W));

const nodes = new Map(); // id -> {id,type,name,country?}
function addNode(id, type, name, country) {
  if (!nodes.has(id)) nodes.set(id, { id, type, name: name || id, ...(country ? { country } : {}) });
}
const edgeMap = new Map(); // key -> {from,to,type,w}

const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf8")); } catch { continue; }
  const nmap = {};
  for (const n of d.nodes || []) nmap[n.id] = n;
  // 전역 id 해석
  const gid = (localId) => {
    const n = nmap[localId]; if (!n) return null;
    const t = (n.type || "").toUpperCase();
    if (t === "ASSET") return n.id;                 // A_xxx (전역 유일)
    if (t === "THEME") return n.id;                 // T_xxx
    if (t === "MACRO") return "MAC:" + (n.name || n.id); // 이름 병합
    return null;                                    // CHARACTER/BUSINESS_FIELD 등 제외
  };
  const reg = (localId) => {
    const n = nmap[localId]; if (!n) return null;
    const t = (n.type || "").toUpperCase();
    const id = gid(localId); if (!id) return null;
    if (t === "ASSET") addNode(id, "asset", n.name, (n.exposure || {}).country);
    else if (t === "THEME") addNode(id, "theme", n.name || d.themeName);
    else if (t === "MACRO") addNode(id, "macro", n.name);
    return id;
  };
  for (const e of d.edges || []) {
    const type = (e.type || "").toUpperCase();
    if (!PROP_TYPES.has(type)) continue;
    const a = reg(e.from), b = reg(e.to);
    if (!a || !b || a === b) continue;
    const conf = typeof e.confidence === "number" ? Math.max(0.4, Math.min(1, e.confidence)) : 1;
    const w = +(W[type] * conf).toFixed(3);
    const key = a < b ? `${a}|${b}` : `${b}|${a}`; // 무방향 병합, 최대 가중치 유지
    const prev = edgeMap.get(key);
    if (!prev || w > prev.w) edgeMap.set(key, { from: a, to: b, type, w });
  }
}

const nodeArr = [...nodes.values()];
const edgeArr = [...edgeMap.values()];
const meta = { generated: new Date().toISOString(), nodeCount: nodeArr.length, edgeCount: edgeArr.length,
  counts: { macro: nodeArr.filter((n) => n.type === "macro").length, theme: nodeArr.filter((n) => n.type === "theme").length, asset: nodeArr.filter((n) => n.type === "asset").length },
  weights: W, note: "무방향 전파 그래프. 충격 전파는 클라이언트에서 Dijkstra(최대곱 경로)로 계산." };
fs.writeFileSync(path.join(OUT_DIR, "graph.json"), JSON.stringify({ meta, nodes: nodeArr, edges: edgeArr }, null, 0));

console.log(`노드 ${nodeArr.length} (macro ${meta.counts.macro}/theme ${meta.counts.theme}/asset ${meta.counts.asset}) | 엣지 ${edgeArr.length}`);
const sz = fs.statSync(path.join(OUT_DIR, "graph.json")).size;
console.log(`graph.json ${(sz / 1024).toFixed(0)} KB → ${path.relative(ROOT, OUT_DIR)}`);
