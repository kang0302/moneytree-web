// 글로벌 크로스마켓 교차투자: 테마 자산을 국가 서브바스켓으로 분리 → 시장별 구성·수익률 +
// US→KR 오버나잇 리드(어젯밤 미국 → 오늘 한국) 시차 적중률. 산출: import_MT/data/cross_market/cm.json
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const DATA_ROOT = fs.existsSync(path.join(ROOT, "import_MT", "data", "theme"))
  ? path.join(ROOT, "import_MT", "data") : path.join(ROOT, "data");
const THEME_DIR = path.join(DATA_ROOT, "theme");
const PX_DIR = path.join(DATA_ROOT, "cache", "px_hist");
const OUT_DIR = path.join(DATA_ROOT, "cross_market");
const WINDOW = 120;      // 리드 통계 거래일
fs.mkdirSync(OUT_DIR, { recursive: true });

const CO_LABEL = { US: "미국", KR: "한국", CN: "중국", HK: "홍콩", JP: "일본", TW: "대만", GB: "영국", DE: "독일", FR: "프랑스", CA: "캐나다", AU: "호주", IN: "인도", NL: "네덜란드", CH: "스위스", SG: "싱가포르", IT: "이탈리아", SE: "스웨덴", ES: "스페인" };

const pxFiles = fs.readdirSync(PX_DIR).filter((f) => f.endsWith(".json"));
const pxByKey = new Map(), pxByTicker = new Map();
for (const f of pxFiles) { const b = f.replace(/\.json$/, ""); pxByKey.set(b, f); const tk = b.split("_")[0]; (pxByTicker.get(tk) || pxByTicker.set(tk, []).get(tk)).push(f); }
const retCache = new Map();
function loadRet(file) { // date -> daily return
  if (retCache.has(file)) return retCache.get(file);
  let m = null;
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PX_DIR, file), "utf8"));
    if (Array.isArray(raw)) {
      const s = raw.filter((x) => Array.isArray(x) && x[1] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
      m = new Map(); for (let i = 1; i < s.length; i++) if (s[i - 1][1] > 0) m.set(s[i][0], s[i][1] / s[i - 1][1] - 1);
    }
  } catch {}
  retCache.set(file, m); return m;
}
function pxFileFor(ex) {
  const tk = (ex.ticker || "").trim(); if (!tk) return null;
  const key = `${tk}_${(ex.exchange || "").toUpperCase()}_${(ex.country || "").toUpperCase()}`;
  if (pxByKey.has(key)) return pxByKey.get(key);
  const cand = pxByTicker.get(tk); if (!cand) return null;
  return cand.length === 1 ? cand[0] : (cand.find((f) => f.endsWith(`_${(ex.country || "").toUpperCase()}.json`)) || cand[0]);
}
// 서브바스켓 일별수익률: date -> 등가중 평균
function subBasket(rets) {
  const sum = new Map(), cnt = new Map();
  for (const r of rets) for (const [d, v] of r) { sum.set(d, (sum.get(d) || 0) + v); cnt.set(d, (cnt.get(d) || 0) + 1); }
  const m = new Map(); for (const [d, s] of sum) m.set(d, s / cnt.get(d));
  return m;
}
function compound(ret, dates) { let p = 1; for (const d of dates) p *= 1 + ret.get(d); return (p - 1) * 100; }
function lastNReturn(ret, n) { const ds = [...ret.keys()].sort(); const use = ds.slice(-n); return use.length ? compound(ret, use) : null; }

const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
const out = [];
for (const f of files) {
  let d; try { d = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf8")); } catch { continue; }
  const assets = (d.nodes || []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");
  const byCo = new Map();
  for (const a of assets) {
    const co = (a.exposure || {}).country; if (!co) continue;
    const file = pxFileFor(a.exposure || {}); if (!file) continue;
    const r = loadRet(file); if (!r) continue;
    if (!byCo.has(co)) byCo.set(co, []); byCo.get(co).push(r);
  }
  const markets = [...byCo.entries()].filter(([, arr]) => arr.length >= 1).map(([co, arr]) => ({ co, label: CO_LABEL[co] || co, n: arr.length, basket: subBasket(arr) }));
  if (markets.length < 2) continue; // 다국가만
  markets.sort((a, b) => b.n - a.n);
  const mkOut = markets.map((m) => ({ co: m.co, label: m.label, n: m.n, r7: round(lastNReturn(m.basket, 5)), r30: round(lastNReturn(m.basket, 21)) }));

  // US→KR 오버나잇 리드
  const US = markets.find((m) => m.co === "US"), KR = markets.find((m) => m.co === "KR");
  let lead = null;
  if (US && KR && US.n >= 2 && KR.n >= 2) {
    const usDates = [...US.basket.keys()].sort();
    const krDates = [...KR.basket.keys()].sort();
    const krSet = krDates;
    // 각 US date d → 그 이후 첫 KR date
    const pairs = [];
    let ki = 0;
    for (const ud of usDates) {
      while (ki < krSet.length && krSet[ki] <= ud) ki++;
      if (ki < krSet.length) pairs.push([US.basket.get(ud), KR.basket.get(krSet[ki]), ud, krSet[ki]]);
    }
    const use = pairs.slice(-WINDOW);
    if (use.length >= 40) {
      let hit = 0, n = 0, sx = 0, sy = 0, sxx = 0, syy = 0, sxy = 0;
      for (const [x, y] of use) { if (!isFinite(x) || !isFinite(y)) continue; n++; if (Math.sign(x) === Math.sign(y)) hit++; sx += x; sy += y; sxx += x * x; syy += y * y; sxy += x * y; }
      const cov = sxy - sx * sy / n, vx = sxx - sx * sx / n, vy = syy - sy * sy / n;
      const corr = vx > 0 && vy > 0 ? cov / Math.sqrt(vx * vy) : 0;
      const lastUs = usDates[usDates.length - 1], lastKr = krDates[krDates.length - 1];
      lead = { hitRate: Math.round(hit / n * 100), corr: round(corr), n, lastUsRet: round(US.basket.get(lastUs) * 100), lastUsDate: lastUs, pending: lastKr <= lastUs };
    }
  }
  out.push({ id: d.themeId || f.replace(".json", ""), name: d.themeName || "", markets: mkOut, marketCount: markets.length, lead });
}
function round(v) { return v == null || !isFinite(v) ? null : +v.toFixed(2); }

const meta = { generated: new Date().toISOString(), window: WINDOW, themeCount: out.length,
  method: `테마 자산을 국가별 서브바스켓(등가중)으로 분리. 시장별 최근 7/21거래일 수익률. US→KR 오버나잇 리드=미국 세션 다음 첫 한국 세션과 페어링해 방향 적중률·상관(최근 ${WINDOW}거래일).` };
fs.writeFileSync(path.join(OUT_DIR, "cm.json"), JSON.stringify({ meta, themes: out }, null, 0));

const leads = out.filter((o) => o.lead).sort((a, b) => b.lead.hitRate - a.lead.hitRate);
console.log(`다국가 테마 ${out.length} | US→KR 리드 산출 ${leads.length}`);
console.log("적중률 top:", leads.slice(0, 6).map((o) => `${o.name}(${o.lead.hitRate}%,n${o.lead.n})`).join(", "));
console.log("오늘 대기(pending) 신호:", out.filter((o) => o.lead?.pending).length);
console.log("→", path.relative(ROOT, OUT_DIR));
