#!/usr/bin/env node
// scripts/save_barometer_history.mjs
// Generates a daily barometer snapshot for every theme in public/data/theme/
// and writes it to public/data/history/barometer_YYYYMMDD.json.
//
// The 0~1000 score formulas mirror src/lib/themeReturn.ts (BAROMETER v2) so the
// snapshot is always consistent with what the UI displays for the same period.
//
// Policy:
//   - Period: 7D (matches UI default used for ranking)
//   - Retention: keep only files from the last 90 days; older snapshots are removed
//   - An index.json is rebuilt on every run so the frontend can enumerate
//     available dates without issuing 404 probes.

import fs from "node:fs";
import path from "node:path";

const THEME_DIR = "public/data/theme";
const HISTORY_DIR = "public/data/history";
const PERIOD = "7D";
const KEEP_DAYS = 90;
const MIN_ASSETS = 5;

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0);

function normalizeToPct(v) {
  if (v === null || v === undefined) return null;
  let n;
  if (typeof v === "number") n = v;
  else if (typeof v === "string") {
    const c = v.trim().replace(/,/g, "");
    if (!c) return null;
    n = Number(c);
  } else {
    return null;
  }
  if (!Number.isFinite(n)) return null;
  if (Math.abs(n) > 0 && Math.abs(n) <= 1) n = n * 100;
  return n;
}

const RET_KEYS = {
  "3D": ["return_3d", "return_3D", "return3d", "ret_3d", "ret3d"],
  "7D": ["return_7d", "return_7D", "return7d", "ret_7d", "ret7d"],
  "1M": ["return_1m", "return_30d", "return_30D", "return1m", "return30d", "ret_1m", "ret_30d", "ret1m", "ret30d"],
  YTD: ["return_ytd", "return_YTD", "returnYtd", "ret_ytd", "retYtd"],
  "1Y": ["return_1y", "return_1Y", "return1y", "ret_1y", "ret1y"],
  "3Y": ["return_3y", "return_3Y", "return3y", "ret_3y", "ret3y"],
};

function extractReturn(metrics, period) {
  if (!metrics) return null;
  const keys = RET_KEYS[period] ?? [];
  for (const k of keys) {
    const v = normalizeToPct(metrics[k]);
    if (v !== null) return v;
  }
  return null;
}

// ✅ BAROMETER v3 (2026-07-17) — src/lib/themeReturn.ts 와 동일 로직 유지 (#1 기간별 앵커, #2 tail Risk 전용)
// retSat = 점수 포화 기준 수익률(%), tailThresh = 꼬리 사건 |ret|(%) 임계.
const PERIOD_ANCHORS = {
  "1D": { retSat: 4, tailThresh: 5 },
  "3D": { retSat: 6, tailThresh: 8 },
  "7D": { retSat: 9, tailThresh: 12 },
  "15D": { retSat: 13, tailThresh: 15 },
  "1M": { retSat: 16.7, tailThresh: 15 },
  YTD: { retSat: 30, tailThresh: 25 },
  "1Y": { retSat: 50, tailThresh: 40 },
  "2Y": { retSat: 75, tailThresh: 55 },
  "3Y": { retSat: 100, tailThresh: 70 },
};
const anchorForPeriod = (p) => PERIOD_ANCHORS[p] ?? PERIOD_ANCHORS["1M"];

const scoreReturnPct = (r, retSat) => clamp(500 + r * (500 / retSat), 0, 1000);
const scoreBreadthPct = (b) => clamp(b * 10, 0, 1000);
// #2: Diversification은 breadth 기반, tail 제거
const scoreDiversification = (b) => clamp(clamp(b, 0, 100) * 10, 0, 1000);
const scoreRiskFromTailPct = (t) => clamp(1000 - t * 10, 0, 1000);

function tempByScore(s) {
  const v = clamp(s, 0, 1000);
  if (v >= 900) return "BLAZING";
  if (v >= 800) return "HOT";
  if (v >= 700) return "WARM+";
  if (v >= 600) return "WARM";
  if (v >= 500) return "NEUTRAL+";
  if (v >= 400) return "NEUTRAL";
  if (v >= 300) return "COOL";
  if (v >= 200) return "COOL-";
  if (v >= 100) return "COLD";
  return "FROZEN";
}

function computeBarometer(themeJson, period) {
  const nodes = Array.isArray(themeJson?.nodes) ? themeJson.nodes : [];
  const assets = nodes.filter((n) => String(n?.type ?? "").toUpperCase() === "ASSET");
  if (assets.length < MIN_ASSETS) return null;

  const returns = assets
    .map((a) => extractReturn(a?.metrics, period))
    .filter((v) => typeof v === "number" && Number.isFinite(v));
  if (returns.length === 0) return null;

  const avgReturn = mean(returns);
  const sortedDesc = [...returns].sort((a, b) => b - a);
  const topN = returns.length >= 10 ? Math.ceil(returns.length * 0.3) : 2;
  const momentumTopPct = mean(sortedDesc.slice(0, clamp(topN, 1, returns.length)));
  const breadthPct = (returns.filter((x) => x > 0).length / returns.length) * 100;
  // #1: 기간별 tail 임계 정규화
  const anchor = anchorForPeriod(period);
  const tailPct = (returns.filter((x) => Math.abs(x) >= anchor.tailThresh).length / returns.length) * 100;

  const health = clamp(scoreReturnPct(avgReturn, anchor.retSat) * 0.6 + scoreBreadthPct(breadthPct) * 0.4, 0, 1000);
  const momentum = scoreReturnPct(momentumTopPct, anchor.retSat);
  const diversification = scoreDiversification(breadthPct);
  const risk = scoreRiskFromTailPct(tailPct);
  const overall = clamp(
    health * 0.35 + momentum * 0.35 + diversification * 0.2 + risk * 0.1,
    0,
    1000
  );

  return {
    score: Math.round(overall),
    health: Math.round(health),
    momentum: Math.round(momentum),
    diversification: Math.round(diversification),
    label: tempByScore(overall),
    tail: Math.round(tailPct),
  };
}

const pad2 = (n) => String(n).padStart(2, "0");

function todayKST() {
  const now = new Date();
  const kst = new Date(now.getTime() + now.getTimezoneOffset() * 60_000 + 9 * 60 * 60_000);
  const y = kst.getUTCFullYear();
  const m = pad2(kst.getUTCMonth() + 1);
  const d = pad2(kst.getUTCDate());
  return { date: `${y}-${m}-${d}`, stamp: `${y}${m}${d}` };
}

function loadThemes() {
  if (!fs.existsSync(THEME_DIR)) return [];
  const files = fs.readdirSync(THEME_DIR).filter((f) => /^T_.*\.json$/i.test(f));
  const out = [];
  for (const f of files) {
    const p = path.join(THEME_DIR, f);
    try {
      const json = JSON.parse(fs.readFileSync(p, "utf-8"));
      const themeId = json?.themeId ?? path.basename(f, ".json");
      const themeName = json?.themeName ?? themeId;
      const bar = computeBarometer(json, PERIOD);
      if (!bar) continue;
      out.push({ themeId, themeName, ...bar });
    } catch (e) {
      console.warn(`[skip] ${f}: ${e?.message ?? e}`);
    }
  }
  out.sort((a, b) => a.themeId.localeCompare(b.themeId));
  return out;
}

function pruneOldSnapshots() {
  if (!fs.existsSync(HISTORY_DIR)) return [];
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  const removed = [];
  for (const f of fs.readdirSync(HISTORY_DIR)) {
    const m = f.match(/^barometer_(\d{4})(\d{2})(\d{2})\.json$/);
    if (!m) continue;
    const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    if (t < cutoff) {
      fs.rmSync(path.join(HISTORY_DIR, f));
      removed.push(f);
    }
  }
  return removed;
}

function rebuildIndex() {
  if (!fs.existsSync(HISTORY_DIR)) return;
  const dates = fs
    .readdirSync(HISTORY_DIR)
    .filter((f) => /^barometer_\d{8}\.json$/.test(f))
    .sort()
    .reverse()
    .map((f) => {
      const s = f.match(/^barometer_(\d{8})\.json$/)[1];
      return `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`;
    });
  fs.writeFileSync(path.join(HISTORY_DIR, "index.json"), JSON.stringify(dates, null, 2) + "\n");
}

function main() {
  fs.mkdirSync(HISTORY_DIR, { recursive: true });

  const { date, stamp } = todayKST();
  const themes = loadThemes();

  const payload = {
    date,
    generatedAt: new Date().toISOString(),
    themes,
  };

  const outPath = path.join(HISTORY_DIR, `barometer_${stamp}.json`);
  fs.writeFileSync(outPath, JSON.stringify(payload, null, 2) + "\n");
  console.log(`[barometer] wrote ${outPath} — ${themes.length} themes`);

  const removed = pruneOldSnapshots();
  if (removed.length) {
    console.log(`[barometer] pruned ${removed.length} old snapshot(s): ${removed.join(", ")}`);
  }

  rebuildIndex();
  console.log(`[barometer] rebuilt ${HISTORY_DIR}/index.json`);
}

main();
