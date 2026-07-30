// scripts/barometer_backtest.mjs
// B. 백테스트: 과거 주간 리밸런스일마다 각 테마의 바로미터(그 시점)와 forward 30일 테마 EW 수익률을
//    재계산해, 바로미터 예측력(국면별 성과·보정곡선)을 산출한다.
// 데이터: 구성종목 과거 일별 종가를 EODHD(KR/비US)·FMP(US)로 수집 후 캐시.
// 주의(정직): 현재 로스터를 과거에 적용 → 구성종목/룩어헤드 편향. "현 구성 기준 참고치"로 라벨.
//   생존편향(상폐 종목 누락), 신규자산 이력부족은 null 처리. 거래비용·리밸런싱 미반영.
// 사용: node scripts/barometer_backtest.mjs
import fs from "fs";
import path from "path";
import https from "https";
import { computeThemeBarometer, PERIODS } from "./barometer_core.mjs";

const ROOT = process.cwd();
const THEME_DIR = path.join(ROOT, "import_MT", "data", "theme");
const CACHE_DIR = path.join(ROOT, "import_MT", "data", "cache", "px_adj"); // 조정종가 캐시
const OUT_DIR = path.join(ROOT, "import_MT", "data", "track_record");
fs.mkdirSync(CACHE_DIR, { recursive: true });
fs.mkdirSync(OUT_DIR, { recursive: true });

// ── env ──
const env = {};
try {
  for (const line of fs.readFileSync(path.join(ROOT, ".env.local"), "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    env[t.slice(0, i).trim()] = t.slice(i + 1).trim();
  }
} catch {}
const EODHD = env.EODHD_API_KEY;
const FMP = env.FMP_API_KEY;

const HORIZON = "7D"; // 바로미터 산출 기간(대부분 테마 default 3d/7d 대표로 7D 고정 — 크로스섹션 일관)
const FWD_DAYS = 30; // forward 수익률 창(거래일)
const WEEKS_BACK = 78; // ~1.5년 주간
const REBAL_STEP = 5; // 거래일 5일 = 1주

function getJSON(url) {
  return new Promise((resolve) => {
    const req = https.get(url, (res) => {
      let data = "";
      res.on("data", (c) => (data += c));
      res.on("end", () => {
        try { resolve(JSON.parse(data)); } catch { resolve(null); }
      });
    });
    req.on("error", () => resolve(null));
    req.setTimeout(12000, () => { req.destroy(); resolve(null); }); // 12s 타임아웃(hang 방지)
  });
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function gfMap(exch, co) {
  const e = (exch || "").toUpperCase();
  // FMP suffix for non-US
  const S = { TSE: ".T", TYO: ".T", XETRA: ".DE", FRA: ".DE", OMX: ".ST", STO: ".ST", LSE: ".L", LON: ".L",
    SIX: ".SW", SWX: ".SW", BME: ".MC", HKEX: ".HK", SZSE: ".SZ", SSE: ".SS", SHSE: ".SS", TWSE: ".TW",
    ASX: ".AX", TSX: ".TO", BATS: "", NASDAQ: "", NYSE: "", NYSEARCA: "", NYSEAMERICAN: "", AMS: ".AS", EPA: ".PA", BIT: ".MI" };
  return S[e] ?? "";
}

// 종가 히스토리 로드(캐시). KR→EODHD .KO/.KQ, 그 외 비US→EODHD 접미사 or FMP, US→FMP.
async function loadCloses(ticker, exch, co) {
  const key = `${ticker}_${exch}_${co}`.replace(/[^A-Za-z0-9_.-]/g, "");
  const cf = path.join(CACHE_DIR, `${key}.json`);
  if (fs.existsSync(cf)) {
    try { return JSON.parse(fs.readFileSync(cf, "utf8")); } catch {}
  }
  let series = null;
  const from = "2023-06-01";
  // 분할·배당 조정종가 우선(아티팩트 방지). EODHD adjusted_close / FMP adjClose.
  const eod = (r) => (Array.isArray(r) && r.length > 20 ? r.map((x) => [x.date, x.adjusted_close ?? x.close]) : null);
  const fmp = (r) => {
    const arr = Array.isArray(r) ? r : r?.historical;
    return Array.isArray(arr) && arr.length > 20 ? arr.map((x) => [x.date, x.adjClose ?? x.adjustedClose ?? x.close]).reverse() : null;
  };
  if (co === "KR") {
    for (const suf of [".KO", ".KQ"]) {
      const r = await getJSON(`https://eodhd.com/api/eod/${ticker}${suf}?api_token=${EODHD}&fmt=json&from=${from}&order=a`);
      series = eod(r); if (series) break;
    }
  } else if (co === "US") {
    series = fmp(await getJSON(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}&apikey=${FMP}&from=${from}&to=2026-08-01`));
  } else {
    const suf = gfMap(exch, co);
    const eodSuf = suf || ".US";
    series = eod(await getJSON(`https://eodhd.com/api/eod/${ticker}${eodSuf}?api_token=${EODHD}&fmt=json&from=${from}&order=a`));
    if (!series) series = fmp(await getJSON(`https://financialmodelingprep.com/stable/historical-price-eod/full?symbol=${ticker}${suf}&apikey=${FMP}&from=${from}&to=2026-08-01`));
  }
  const out = series || [];
  fs.writeFileSync(cf, JSON.stringify(out), "utf8");
  return out;
}

// ── 1) 유니크 티커 수집 + 테마-구성 매핑 ──
const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_\d+\.json$/.test(f));
const themes = [];
const uniq = new Map(); // key -> {ticker,exch,co}
for (const f of files) {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(THEME_DIR, f), "utf8")); } catch { continue; }
  const assets = (d.nodes || []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");
  if (assets.length < 5) continue;
  const members = [];
  for (const a of assets) {
    const ex = a.exposure || {};
    const tk = (ex.ticker || "").trim();
    if (!tk) continue;
    const key = `${tk}_${ex.exchange}_${ex.country}`;
    uniq.set(key, { ticker: tk, exch: ex.exchange, co: ex.country });
    members.push({ id: a.id, key });
  }
  themes.push({ themeId: d.themeId, themeName: d.themeName, nodes: d.nodes, edges: d.edges, members });
}
console.log(`themes(≥5): ${themes.length} | unique tickers: ${uniq.size}`);

// ── 2) 가격 히스토리 수집(캐시) ──
const px = new Map(); // key -> Map(date->close) + sorted dates
let done = 0;
const entries = [...uniq.entries()];
const CONC = 12;
async function worker() {
  while (entries.length) {
    const [key, info] = entries.pop();
    const series = await loadCloses(info.ticker, info.exch, info.co);
    px.set(key, { m: new Map(series), dates: series.map((x) => x[0]) });
    if (++done % 200 === 0) console.log(`  prices ${done}/${uniq.size}`);
  }
}
await Promise.all(Array.from({ length: CONC }, () => worker()));
console.log("price load complete");

// ── 3) 공통 거래일 축(미국 기준 근사): 한 유동종목(SPY 대체 없음) → 모든 종목 날짜 합집합 상위 ──
const allDates = new Set();
for (const { dates } of px.values()) for (const dt of dates) allDates.add(dt);
const axis = [...allDates].sort();
// 리밸 날짜: 최근에서 REBAL_STEP 간격, WEEKS_BACK개, forward 30일 여유 확보
const rebalIdx = [];
for (let i = axis.length - 1 - FWD_DAYS; i >= 0 && rebalIdx.length < WEEKS_BACK; i -= REBAL_STEP) rebalIdx.push(i);
rebalIdx.reverse();

// helper: 종목의 asOf(축 인덱스) 기준 기간 수익률(%) — 축 날짜의 직전 유효 종가 사용
function closeAsOf(rec, dateStr) {
  // 해당 날짜 이하의 가장 최근 종가
  let c = rec.m.get(dateStr);
  if (c != null) return c;
  return null;
}
function retPct(rec, dIdx, back) {
  const d0 = axis[dIdx];
  const dB = axis[dIdx - back];
  if (!d0 || !dB) return null;
  // 직전 유효 종가 탐색
  const near = (idx) => { for (let k = idx; k >= 0 && k >= idx - 6; k--) { const v = rec.m.get(axis[k]); if (v != null) return v; } return null; };
  const c0 = near(dIdx), cB = near(dIdx - back);
  if (c0 == null || cB == null || cB === 0) return null;
  return (c0 / cB - 1) * 100;
}
const BACK = { "1D": 1, "3D": 3, "7D": 7, "15D": 15, "1M": 21, "1Y": 252, "2Y": 504, "3Y": 756 };

// ── 4) 백테스트 루프 ──
const pairs = []; // {themeId, date, score, temp, fwd}
for (const th of themes) {
  for (const di of rebalIdx) {
    // as-of 메트릭 override 구성
    const mo = new Map();
    let anyValid = false;
    for (const mem of th.members) {
      const rec = px.get(mem.key);
      if (!rec) continue;
      const met = {};
      for (const [pk, bk] of Object.entries(BACK)) { const v = retPct(rec, di, bk); if (v != null) met[`return_${pk.toLowerCase()}`] = v; }
      // ytd: 연초 대비 — 근사로 1Y 자리 대신 스킵(백테스트는 7D 기준이라 무관)
      if (Object.keys(met).length) { mo.set(mem.id, met); anyValid = true; }
    }
    if (!anyValid) continue;
    const r = computeThemeBarometer({ nodes: th.nodes, edges: th.edges, period: HORIZON, metricsOverride: mo });
    if (!r.ok) continue;
    // forward 30일 테마 EW 수익률: 각 구성 (fwd close / now close -1) 가중평균(EW 근사=단순평균)
    const fwds = [];
    for (const mem of th.members) {
      const rec = px.get(mem.key);
      if (!rec) continue;
      const nearNow = (() => { for (let k = di; k >= di - 6 && k >= 0; k--) { const v = rec.m.get(axis[k]); if (v != null) return v; } return null; })();
      const fi = di + FWD_DAYS;
      const nearFwd = (() => { for (let k = fi; k <= fi + 6 && k < axis.length; k++) { const v = rec.m.get(axis[k]); if (v != null) return v; } return null; })();
      if (nearNow != null && nearFwd != null && nearNow > 0 && nearFwd > 0) {
        const r = (nearFwd / nearNow - 1) * 100;
        if (Math.abs(r) <= 150) fwds.push(r); // 30일 ±150% 초과는 분할/오류로 보고 제외
      }
    }
    if (fwds.length < 3) continue; // 표본 부족 스킵
    // 강건: 구성종목 forward의 중앙값(이상치 내성)
    const sorted = [...fwds].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    const fwd = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    pairs.push({ themeId: th.themeId, date: axis[di], score: r.overallScore, temp: r.temp, fwd: Number(fwd.toFixed(3)) });
  }
}
console.log(`backtest pairs: ${pairs.length}`);

// ── 5) 벤치마크 = 동일 시점 전체 테마 forward 평균(EW). 시장 타이밍 제거 → 초과수익=테마 선택력.
const dateSum = new Map(), dateCnt = new Map();
for (const p of pairs) { dateSum.set(p.date, (dateSum.get(p.date) || 0) + p.fwd); dateCnt.set(p.date, (dateCnt.get(p.date) || 0) + 1); }
for (const p of pairs) { const m = dateSum.get(p.date) / dateCnt.get(p.date); p.exc = Number((p.fwd - m).toFixed(3)); }

// 집계: 절대(avgFwd/winRate) + 벤치마크 대비(avgExcess/winVsBench)
function agg(list) {
  const n = list.length;
  if (!n) return { n: 0, avgFwd: null, winRate: null, avgExcess: null, winVsBench: null };
  const avg = list.reduce((a, b) => a + b.fwd, 0) / n;
  const win = list.filter((x) => x.fwd > 0).length / n;
  const avgExc = list.reduce((a, b) => a + b.exc, 0) / n;
  const winB = list.filter((x) => x.exc > 0).length / n;
  return {
    n,
    avgFwd: Number(avg.toFixed(2)),
    winRate: Number((win * 100).toFixed(1)),
    avgExcess: Number(avgExc.toFixed(2)),
    winVsBench: Number((winB * 100).toFixed(1)),
  };
}
const buckets = [];
for (let lo = 0; lo < 1000; lo += 100) {
  const seg = pairs.filter((p) => p.score >= lo && p.score < lo + 100);
  buckets.push({ range: `${lo}-${lo + 100}`, ...agg(seg) });
}
const byTemp = {};
for (const t of ["FROZEN","COLD","COOL-","COOL","NEUTRAL","NEUTRAL+","WARM","WARM+","HOT","BLAZING"]) {
  byTemp[t] = agg(pairs.filter((p) => p.temp === t));
}
// 상위(≥800) vs 하위(<300) 스프레드
const hi = agg(pairs.filter((p) => p.score >= 800));
const lo = agg(pairs.filter((p) => p.score < 300));

const out = {
  generated: new Date().toISOString(),
  method: { horizon: HORIZON, fwdDays: FWD_DAYS, weeksBack: WEEKS_BACK, rebalStep: REBAL_STEP,
    benchmark: "동일 시점 전체 테마 forward 평균(EW). 시장 타이밍 제거 → 초과수익=테마 선택력.",
    note: "현재 로스터를 과거에 적용(구성종목/룩어헤드 편향). forward=구성종목 중앙값. 거래비용·리밸런싱 미반영. 참고치." },
  totalPairs: pairs.length,
  buckets,
  byTemp,
  spread: { high_ge800: hi, low_lt300: lo, spreadPct: hi.avgFwd != null && lo.avgFwd != null ? Number((hi.avgFwd - lo.avgFwd).toFixed(2)) : null },
};
fs.writeFileSync(path.join(OUT_DIR, "backtest.json"), JSON.stringify(out, null, 2), "utf8");
console.log("✅ wrote import_MT/data/track_record/backtest.json");
console.log("buckets:", JSON.stringify(buckets.filter(b=>b.n)));
console.log("spread ≥800 vs <300:", JSON.stringify(out.spread));
