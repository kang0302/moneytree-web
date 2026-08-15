// 자산별 1년 주가 성과: rebased(=100) 주가 vs SPY vs QQQ 시계열 + 기간 수익률.
// 소스: import_MT/data/cache/px_hist. 출력: public/data/asset_perf/{assetId}.json
import fs from "fs";
import path from "path";

const ROOT = process.cwd();
const PX_DIR = path.join(ROOT, "import_MT", "data", "cache", "px_hist");
const SSOT = path.join(ROOT, "import_MT", "data", "ssot", "asset_ssot.csv");
const OUT_DIR = path.join(ROOT, "public", "data", "asset_perf");
const WIN = 252, STEP = 5, MINLEN = 60;
fs.mkdirSync(OUT_DIR, { recursive: true });

function closes(file) {
  try {
    const raw = JSON.parse(fs.readFileSync(path.join(PX_DIR, file), "utf8"));
    if (Array.isArray(raw)) return raw.filter((x) => Array.isArray(x) && x[1] > 0).sort((a, b) => (a[0] < b[0] ? -1 : 1));
  } catch {}
  return null;
}
const SPY = closes("SPY_NYSEARCA_US.json"), QQQ = closes("QQQ_NASDAQ_US.json");
function asof(arr, d) { let lo = 0, hi = arr.length - 1, a = -1; while (lo <= hi) { const m = (lo + hi) >> 1; if (arr[m][0] <= d) { a = m; lo = m + 1; } else hi = m - 1; } return a >= 0 ? arr[a][1] : null; }

// asset_ssot: key(ticker_exch_co) → assetId
const rows = fs.readFileSync(SSOT, "utf8").split(/\r?\n/).filter(Boolean);
const hdr = rows[0].split(",");
const ci = (n) => hdr.indexOf(n);
const IDX = { id: ci("asset_id"), tk: ci("ticker"), ex: ci("exchange"), co: ci("country") };
let wrote = 0, skip = 0;
for (let i = 1; i < rows.length; i++) {
  const c = rows[i].split(",");
  const aid = c[IDX.id], tk = (c[IDX.tk] || "").trim(), ex = (c[IDX.ex] || "").trim().toUpperCase(), co = (c[IDX.co] || "").trim().toUpperCase();
  if (!aid || !tk) { continue; }
  const file = `${tk}_${ex}_${co}.json`;
  if (!fs.existsSync(path.join(PX_DIR, file))) { skip++; continue; }
  const s = closes(file);
  if (!s || s.length < MINLEN) { skip++; continue; }
  const win = s.slice(-WIN);
  const start = win[0][0], s0 = win[0][1];
  const spy0 = SPY ? asof(SPY, start) : null, qqq0 = QQQ ? asof(QQQ, start) : null;
  const dates = [], stock = [], spy = [], qqq = [];
  for (let k = 0; k < win.length; k += STEP) {
    const [d, c1] = win[k];
    dates.push(d); stock.push(+(c1 / s0 * 100).toFixed(1));
    spy.push(spy0 ? +(asof(SPY, d) / spy0 * 100).toFixed(1) : null);
    qqq.push(qqq0 ? +(asof(QQQ, d) / qqq0 * 100).toFixed(1) : null);
  }
  // 마지막 포인트 보장
  if (dates[dates.length - 1] !== win[win.length - 1][0]) {
    const [d, c1] = win[win.length - 1];
    dates.push(d); stock.push(+(c1 / s0 * 100).toFixed(1));
    spy.push(spy0 ? +(asof(SPY, d) / spy0 * 100).toFixed(1) : null);
    qqq.push(qqq0 ? +(asof(QQQ, d) / qqq0 * 100).toFixed(1) : null);
  }
  // 구글식 캐논: 캘린더 기준 N개월 전 앵커 + 그 날짜 이전 최근 거래일(as-of), 조정가 기준.
  const lastD = win[win.length - 1][0];
  const subMonths = (iso, m) => {
    const [Y, M, D] = iso.split("-").map(Number);
    let y = Y, mo = M - m;
    while (mo <= 0) { mo += 12; y -= 1; }
    let day = D;
    while (day > 28) { const dt = new Date(Date.UTC(y, mo - 1, day)); if (dt.getUTCMonth() === mo - 1) break; day -= 1; }
    const p = (n) => String(n).padStart(2, "0");
    return `${y}-${p(mo)}-${p(day)}`;
  };
  const retCal = (arr, m) => { if (!arr) return null; const a = asof(arr, lastD), b = asof(arr, subMonths(lastD, m)); return a && b ? +((a / b - 1) * 100).toFixed(2) : null; };
  const returns = {};
  for (const [lbl, M] of [["1M", 1], ["3M", 3], ["6M", 6], ["1Y", 12]]) {
    // stock은 전체 시계열(s)로 앵커 조회(창이 짧아도 정확한 캘린더 앵커 확보)
    returns[lbl] = { stock: retCal(s, M), spy: retCal(SPY, M), qqq: retCal(QQQ, M) };
  }
  const out = { assetId: aid, ticker: tk, start, end: win[win.length - 1][0], dates, stock, spy, qqq, returns };
  fs.writeFileSync(path.join(OUT_DIR, `${aid}.json`), JSON.stringify(out));
  wrote++;
}
console.log(`asset_perf 생성 ${wrote} | skip ${skip} | SPY ${SPY ? SPY.length : 0} QQQ ${QQQ ? QQQ.length : 0}`);
