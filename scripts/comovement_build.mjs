// 테마 코무브먼트 사전계산: px_hist(종목 일별종가) → 테마 일별수익률 → 롤링 상관 → 이웃/클러스터/네트워크.
// 산출: import_MT/data/comovement/{meta,graph,neighbors,clusters}.json
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATA_ROOT = fs.existsSync(path.join(ROOT, "import_MT", "data", "theme"))
  ? path.join(ROOT, "import_MT", "data") : path.join(ROOT, "data");
const THEME_DIR = path.join(DATA_ROOT, "theme");
const PX_DIR = path.join(DATA_ROOT, "cache", "px_hist");
const OUT_DIR = path.join(DATA_ROOT, "comovement");

const WINDOW = 120;      // 상관 산출 거래일(최근 ~6개월)
const MIN_OVERLAP = 60;  // 두 테마 공통 거래일 최소
const EDGE_THR = 0.55;   // 네트워크 엣지 최소 상관
const EDGE_TOPK = 6;     // 노드당 엣지 상한
const CLUSTER_THR = 0.72;// 클러스터(연결요소) 임계
const NB_TOPN = 20;      // 테마 상세/중복탐지 이웃 수

fs.mkdirSync(OUT_DIR, { recursive: true });

// px_hist 인덱스: 정확키({ticker}_{exch}_{country}) + ticker fallback
const pxFiles = fs.readdirSync(PX_DIR).filter((f) => f.endsWith(".json"));
const pxByKey = new Map();
const pxByTicker = new Map();
for (const f of pxFiles) {
  const base = f.replace(/\.json$/, "");
  pxByKey.set(base, f);
  const tk = base.split("_")[0];
  if (!pxByTicker.has(tk)) pxByTicker.set(tk, []);
  pxByTicker.get(tk).push(f);
}
const pxCache = new Map();
function loadReturns(file) {
  if (pxCache.has(file)) return pxCache.get(file);
  let ret = null;
  try {
    const arr = JSON.parse(fs.readFileSync(path.join(PX_DIR, file), "utf8")); // [[date,close],...]
    if (Array.isArray(arr) && arr.length > 2) {
      const s = arr.filter((x) => Array.isArray(x) && x.length >= 2 && x[1] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      const m = new Map();
      for (let i = 1; i < s.length; i++) {
        const prev = s[i - 1][1], cur = s[i][1];
        if (prev > 0) m.set(s[i][0], cur / prev - 1);
      }
      ret = m;
    }
  } catch {}
  pxCache.set(file, ret);
  return ret;
}
function pxFileFor(ex) {
  const tk = (ex.ticker || "").trim();
  if (!tk) return null;
  const exch = (ex.exchange || "").toUpperCase();
  const co = (ex.country || "").toUpperCase();
  const key = `${tk}_${exch}_${co}`;
  if (pxByKey.has(key)) return pxByKey.get(key);
  // fallback: ticker 단일 매칭
  const cand = pxByTicker.get(tk);
  if (cand && cand.length === 1) return cand[0];
  if (cand && cand.length > 1) {
    const byCo = cand.find((f) => f.endsWith(`_${co}.json`));
    if (byCo) return byCo;
    return cand[0];
  }
  return null;
}

// 공통 날짜축(최근 WINDOW) = 전 종목 등장 날짜 union의 마지막 WINDOW
const dateSet = new Set();
const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
const themes = [];
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf8")); } catch { continue; }
  const assets = (d.nodes || []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");
  const series = [];
  for (const a of assets) {
    const file = pxFileFor(a.exposure || {});
    if (!file) continue;
    const r = loadReturns(file);
    if (r) series.push(r);
  }
  if (series.length < 3) continue; // 최소 3종목 데이터
  themes.push({ id: d.themeId || f.replace(".json", ""), name: d.themeName || "", assetCount: assets.length, dataCount: series.length, series });
}
// 날짜축
for (const t of themes) for (const r of t.series) for (const dt of r.keys()) dateSet.add(dt);
const allDates = [...dateSet].sort();
const axis = allDates.slice(-WINDOW);
const axisIdx = new Map(axis.map((d, i) => [d, i]));

// 테마 일별수익률 벡터(등가중, 결측 NaN)
for (const t of themes) {
  const sum = new Array(axis.length).fill(0);
  const cnt = new Array(axis.length).fill(0);
  for (const r of t.series) {
    for (const [dt, v] of r) {
      const i = axisIdx.get(dt);
      if (i !== undefined && Number.isFinite(v)) { sum[i] += v; cnt[i] += 1; }
    }
  }
  t.vec = sum.map((s, i) => (cnt[i] > 0 ? s / cnt[i] : NaN));
  delete t.series;
}

// 시장요인 제거: 각 날짜의 전 테마 평균(시장요인)을 빼 잔차수익률로 → "시장 초과 코무브먼트"만 포착.
{
  const mkt = new Array(axis.length).fill(0);
  const mc = new Array(axis.length).fill(0);
  for (const t of themes) for (let i = 0; i < axis.length; i++) if (Number.isFinite(t.vec[i])) { mkt[i] += t.vec[i]; mc[i]++; }
  for (let i = 0; i < axis.length; i++) mkt[i] = mc[i] > 0 ? mkt[i] / mc[i] : 0;
  for (const t of themes) t.vec = t.vec.map((v, i) => (Number.isFinite(v) ? v - mkt[i] : NaN));
}

function corr(a, b) {
  let n = 0, sa = 0, sb = 0, saa = 0, sbb = 0, sab = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    n++; sa += x; sb += y; saa += x * x; sbb += y * y; sab += x * y;
  }
  if (n < MIN_OVERLAP) return null;
  const cov = sab - (sa * sb) / n;
  const va = saa - (sa * sa) / n, vb = sbb - (sb * sb) / n;
  if (va <= 0 || vb <= 0) return null;
  return cov / Math.sqrt(va * vb);
}

const N = themes.length;
console.log(`테마 ${N}개 (px 데이터 3종+), 날짜축 ${axis.length}일 (${axis[0]}~${axis[axis.length-1]})`);

// 상관 분포 표본(임계 튜닝용)
{
  const samp = [];
  for (let i = 0; i < N; i += 3) for (let j = i + 1; j < N; j += 7) { const r = corr(themes[i].vec, themes[j].vec); if (r !== null) samp.push(r); }
  samp.sort((a, b) => a - b); const q = (p) => samp[Math.floor(p * samp.length)];
  console.log(`잔차상관 분포(n=${samp.length}): p50=${q(.5)?.toFixed(2)} p90=${q(.9)?.toFixed(2)} p95=${q(.95)?.toFixed(2)} p99=${q(.99)?.toFixed(2)} max=${samp[samp.length-1]?.toFixed(2)}`);
}

// 상관 계산 + 이웃 + 엣지
const neighbors = {};
const adj = Array.from({ length: N }, () => []);
for (let i = 0; i < N; i++) { neighbors[themes[i].id] = { pos: [], neg: [] }; }
let pairCnt = 0;
for (let i = 0; i < N; i++) {
  for (let j = i + 1; j < N; j++) {
    const r = corr(themes[i].vec, themes[j].vec);
    if (r === null) continue;
    pairCnt++;
    neighbors[themes[i].id].pos.push([themes[j].id, r]);
    neighbors[themes[j].id].pos.push([themes[i].id, r]);
    if (r >= EDGE_THR) { adj[i].push([j, r]); adj[j].push([i, r]); }
  }
}
// 이웃 정렬/절단
for (const id in neighbors) {
  const arr = neighbors[id].pos;
  arr.sort((a, b) => b[1] - a[1]);
  const pos = arr.slice(0, NB_TOPN).map(([tid, r]) => [tid, +r.toFixed(3)]);
  const neg = arr.slice(-NB_TOPN).reverse().map(([tid, r]) => [tid, +r.toFixed(3)]);
  neighbors[id] = { pos, neg };
}

// 클러스터: 가중 라벨전파(커뮤니티 탐지) — 단일연결 체이닝 방지.
const idxById = new Map(themes.map((t, i) => [t.id, i]));
const LP_THR = 0.42, ITERS = 20, LP_K = 8;
const nbrW = themes.map((t) => neighbors[t.id].pos.filter(([, r]) => r >= LP_THR).slice(0, LP_K).map(([tid, r]) => [idxById.get(tid), r]));
let label = themes.map((_, i) => i);
for (let it = 0; it < ITERS; it++) {
  let changed = 0;
  for (let i = 0; i < N; i++) {
    if (!nbrW[i].length) continue;
    const tally = new Map();
    for (const [j, r] of nbrW[i]) tally.set(label[j], (tally.get(label[j]) || 0) + r);
    let best = label[i], bw = -1;
    for (const [lb, w] of tally) if (w > bw || (w === bw && lb < best)) { bw = w; best = lb; }
    if (best !== label[i]) { label[i] = best; changed++; }
  }
  if (!changed) break;
}
const groups = new Map();
for (let i = 0; i < N; i++) { if (!groups.has(label[i])) groups.set(label[i], []); groups.get(label[i]).push(i); }
let clusters = [...groups.values()].filter((g) => g.length >= 3).sort((a, b) => b.length - a.length);
// 클러스터 라벨 = 최대 자산 테마명(대표)
const clusterOf = new Array(N).fill(-1);
clusters.forEach((g, ci) => g.forEach((idx) => (clusterOf[idx] = ci)));
// 라벨 = 커뮤니티 중심(같은 클러스터 이웃과의 상관합 최대) 테마명
const clusterOut = clusters.map((g, ci) => {
  const inSet = new Set(g);
  let best = g[0], bw = -1;
  for (const idx of g) {
    let w = 0;
    for (const [tid, r] of neighbors[themes[idx].id].pos) { const j = idxById.get(tid); if (j !== undefined && inSet.has(j)) w += r; }
    if (w > bw) { bw = w; best = idx; }
  }
  const label = themes[best].name;
  return { id: ci, label, centroidId: themes[best].id, size: g.length, themeIds: g.map((idx) => themes[idx].id) };
});
// 최대 군이 과대(전체의 15%+)면 '기타·광역'으로 표기(이질적 잔여 커뮤니티)
if (clusterOut.length && clusterOut[0].size > N * 0.15) clusterOut[0].label = "기타·광역 (약한 커뮤니티)";

// 네트워크 그래프: 노드당 top-K 엣지(r>=EDGE_THR), dedup
const edgeSet = new Set(); const edges = [];
for (let i = 0; i < N; i++) {
  const top = adj[i].slice().sort((a, b) => b[1] - a[1]).slice(0, EDGE_TOPK);
  for (const [j, r] of top) {
    const key = i < j ? `${i}_${j}` : `${j}_${i}`;
    if (edgeSet.has(key)) continue; edgeSet.add(key);
    edges.push({ a: themes[i].id, b: themes[j].id, r: +r.toFixed(3) });
  }
}
const deg = {}; for (const e of edges) { deg[e.a] = (deg[e.a] || 0) + 1; deg[e.b] = (deg[e.b] || 0) + 1; }
const nodes = themes.map((t, i) => ({ id: t.id, name: t.name, assetCount: t.assetCount, cluster: clusterOf[i], deg: deg[t.id] || 0 }));

// 클러스터×클러스터 히트맵: 커뮤니티 센트로이드(멤버 평균 잔차수익률) 간 상관
const centroids = clusterOut.map((c) => {
  const idxs = c.themeIds.map((tid) => idxById.get(tid));
  const v = new Array(axis.length).fill(0), cc = new Array(axis.length).fill(0);
  for (const idx of idxs) for (let i = 0; i < axis.length; i++) { const x = themes[idx].vec[i]; if (Number.isFinite(x)) { v[i] += x; cc[i]++; } }
  return v.map((s, i) => (cc[i] > 0 ? s / cc[i] : NaN));
});
const cmat = centroids.map((a) => centroids.map((b) => { const r = corr(a, b); return r === null ? 0 : +r.toFixed(2); }));

const meta = { generated: new Date().toISOString(), window: WINDOW, axisStart: axis[0], axisEnd: axis[axis.length - 1],
  themeCount: N, pairCount: pairCnt, edgeThr: EDGE_THR, clusterThr: CLUSTER_THR,
  method: "테마 일별수익률(구성종목 등가중) 최근 " + WINDOW + "거래일 Pearson 상관. 공통거래일 " + MIN_OVERLAP + "+ 필요." };

fs.writeFileSync(path.join(OUT_DIR, "meta.json"), JSON.stringify(meta, null, 2));
fs.writeFileSync(path.join(OUT_DIR, "graph.json"), JSON.stringify({ nodes, edges }, null, 0));
fs.writeFileSync(path.join(OUT_DIR, "neighbors.json"), JSON.stringify(neighbors, null, 0));
fs.writeFileSync(path.join(OUT_DIR, "clusters.json"), JSON.stringify({ clusters: clusterOut, matrix: cmat }, null, 0));

console.log(`엣지 ${edges.length} | 클러스터 ${clusterOut.length} (최대 ${clusterOut[0]?.size||0}) | 상관쌍 ${pairCnt}`);
console.log("클러스터 크기분포:", clusterOut.slice(0, 12).map((c) => c.size).join(","));
console.log("→", path.relative(ROOT, OUT_DIR));
