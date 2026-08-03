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
  const ret = (arr, H) => { if (!arr || arr.length < 2) return null; const last = arr[arr.length - 1], base = arr[Math.max(0, arr.length - 1 - H)]; return base && base[1] > 0 ? +((last[1] / base[1] - 1) * 100).toFixed(2) : null; };
  const retB = (arr, H) => { if (!arr) return null; const lastD = win[win.length - 1][0], baseD = win[Math.max(0, win.length - 1 - H)][0]; const a = asof(arr, lastD), b = asof(arr, baseD); return a && b ? +((a / b - 1) * 100).toFixed(2) : null; };
  const returns = {};
  for (const [lbl, H] of [["1M", 21], ["3M", 63], ["6M", 126], ["1Y", 252]]) {
    returns[lbl] = { stock: ret(win, H), spy: retB(SPY, H), qqq: retB(QQQ, H) };
  }
  const out = { assetId: aid, ticker: tk, start, end: win[win.length - 1][0], dates, stock, spy, qqq, returns };
  fs.writeFileSync(path.join(OUT_DIR, `${aid}.json`), JSON.stringify(out));
  wrote++;
}
console.log(`asset_perf 생성 ${wrote} | skip ${skip} | SPY ${SPY ? SPY.length : 0} QQQ ${QQQ ? QQQ.length : 0}`);
