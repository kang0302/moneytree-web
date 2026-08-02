// 바로미터 국면전환: px_hist로 최근 L거래일간 각 테마의 바로미터(1M) 점수를 재계산 → 추세·상승/하락·전환 탐지.
// 산출: import_MT/data/barometer_trend/trend.json (+meta). 프론트가 import_MT raw에서 로드.
import fs from "fs";
import path from "path";
import { computeThemeBarometer } from "./barometer_core.mjs";

const ROOT = process.cwd();
const DATA_ROOT = fs.existsSync(path.join(ROOT, "import_MT", "data", "theme"))
  ? path.join(ROOT, "import_MT", "data") : path.join(ROOT, "data");
const THEME_DIR = path.join(DATA_ROOT, "theme");
const PX_DIR = path.join(DATA_ROOT, "cache", "px_hist");
const OUT_DIR = path.join(DATA_ROOT, "barometer_trend");

const PERIOD = "1M";     // 바로미터 산출 기간(국면 추세용)
const LOOKBACK_CAL = 30; // 1M ≈ 30 캘린더일
const L = 20;            // 점수 시계열 거래일 수
const DELTA_K = 10;      // Δ 기준 거래일(현재 vs K일 전)

fs.mkdirSync(OUT_DIR, { recursive: true });

// px 인덱스
const pxFiles = fs.readdirSync(PX_DIR).filter((f) => f.endsWith(".json"));
const pxByKey = new Map(), pxByTicker = new Map();
for (const f of pxFiles) {
  const base = f.replace(/\.json$/, ""); pxByKey.set(base, f);
  const tk = base.split("_")[0]; if (!pxByTicker.has(tk)) pxByTicker.set(tk, []); pxByTicker.get(tk).push(f);
}
const closeCache = new Map();
function loadCloses(file) {
  if (closeCache.has(file)) return closeCache.get(file);
  let arr = null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PX_DIR, file), "utf8"));
    if (Array.isArray(raw)) arr = raw.filter((x) => Array.isArray(x) && x.length >= 2 && x[1] > 0).map(([d, c]) => [d, c]).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  } catch {}
  closeCache.set(file, arr); return arr;
}
function pxFileFor(ex) {
  const tk = (ex.ticker || "").trim(); if (!tk) return null;
  const key = `${tk}_${(ex.exchange || "").toUpperCase()}_${(ex.country || "").toUpperCase()}`;
  if (pxByKey.has(key)) return pxByKey.get(key);
  const cand = pxByTicker.get(tk); if (!cand) return null;
  if (cand.length === 1) return cand[0];
  return cand.find((f) => f.endsWith(`_${(ex.country || "").toUpperCase()}.json`)) || cand[0];
}
// 특정 날짜 이하 마지막 종가 (이진탐색)
function closeAsof(closes, dateStr) {
  let lo = 0, hi = closes.length - 1, ans = -1;
  while (lo <= hi) { const mid = (lo + hi) >> 1; if (closes[mid][0] <= dateStr) { ans = mid; lo = mid + 1; } else hi = mid - 1; }
  return ans >= 0 ? closes[ans][1] : null;
}
const minusDays = (dateStr, days) => { const d = new Date(dateStr + "T00:00:00Z"); d.setUTCDate(d.getUTCDate() - days); return d.toISOString().slice(0, 10); };

// 테마 로드 + 자산 종가
const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
const themes = [];
const dateSet = new Set();
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf8")); } catch { continue; }
  const assets = (d.nodes || []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");
  const withPx = [];
  for (const a of assets) { const file = pxFileFor(a.exposure || {}); if (!file) continue; const cl = loadCloses(file); if (cl && cl.length > 25) { withPx.push({ id: a.id, closes: cl }); for (const [dt] of cl) dateSet.add(dt); } }
  if (assets.length < 5 || withPx.length < 3) continue;
  themes.push({ id: d.themeId || f.replace(".json", ""), name: d.themeName || "", nodes: d.nodes, edges: d.edges, assets, withPx });
}
const axis = [...dateSet].sort();
const asof = axis.slice(-L);
console.log(`테마 ${themes.length} | asof ${asof.length}일 (${asof[0]}~${asof[asof.length - 1]})`);

const out = [];
for (const t of themes) {
  const series = [];
  for (const d of asof) {
    const dPrev = minusDays(d, LOOKBACK_CAL);
    const mo = new Map();
    for (const a of t.withPx) {
      const c1 = closeAsof(a.closes, d), c0 = closeAsof(a.closes, dPrev);
      if (c1 && c0 && c0 > 0) mo.set(a.id, { return_1m: (c1 / c0 - 1) * 100 });
    }
    const r = computeThemeBarometer({ nodes: t.nodes, edges: t.edges, period: PERIOD, metricsOverride: mo });
    series.push(r.ok ? r.overallScore : null);
  }
  if (series.filter((x) => x != null).length < L * 0.8) continue; // 데이터 충분한 테마만
  // 결측 보간(직전값)
  for (let i = 0; i < series.length; i++) if (series[i] == null) series[i] = i > 0 ? series[i - 1] : 500;
  const now = series[series.length - 1];
  const prevK = series[Math.max(0, series.length - 1 - DELTA_K)];
  const delta = now - prevK;
  // 기울기(선형회귀 slope, 점수/일)
  const n = series.length; let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += i; sy += series[i]; sxx += i * i; sxy += i * series[i]; }
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  out.push({ id: t.id, name: t.name, now, prevK, delta: Math.round(delta), slope: +slope.toFixed(2), series });
}

// 전환 판정: 500(중립선) 교차
const crossedUp = (s) => { const a = s[Math.max(0, s.length - 1 - DELTA_K)], b = s[s.length - 1]; return a < 500 && b >= 500; };
const crossedDown = (s) => { const a = s[Math.max(0, s.length - 1 - DELTA_K)], b = s[s.length - 1]; return a >= 500 && b < 500; };
for (const o of out) { o.turnUp = crossedUp(o.series); o.turnDown = crossedDown(o.series); }

const meta = { generated: new Date().toISOString(), period: PERIOD, lookbackCal: LOOKBACK_CAL, days: asof.length,
  asofStart: asof[0], asofEnd: asof[asof.length - 1], deltaDays: DELTA_K, themeCount: out.length,
  method: `px_hist로 최근 ${asof.length}거래일 각 테마 바로미터(${PERIOD}) 점수 재계산. Δ=최근${DELTA_K}거래일 변화, 전환=500 중립선 교차.` };

fs.writeFileSync(path.join(OUT_DIR, "trend.json"), JSON.stringify({ meta, themes: out }, null, 0));
const risers = [...out].sort((a, b) => b.delta - a.delta).slice(0, 5);
const fallers = [...out].sort((a, b) => a.delta - b.delta).slice(0, 5);
console.log("상승중 top:", risers.map((r) => `${r.name}(+${r.delta})`).join(", "));
console.log("하락중 top:", fallers.map((r) => `${r.name}(${r.delta})`).join(", "));
console.log("상승전환:", out.filter((o) => o.turnUp).length, "| 하락전환:", out.filter((o) => o.turnDown).length);
console.log("→", path.relative(ROOT, OUT_DIR));
