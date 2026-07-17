// src/lib/themeReturn.ts
// DAY50-3 - Theme Return Definition (PATCH + BAROMETER v1)
// - Min ASSET count >= 5
// - if valid return count === 0 => ok:false (NO_RETURN_DATA)
// - Core = Median
// - Momentum = Top 30% mean (if 5~9 assets => top 2)
// - Breadth = % of assets with return > 0
// - Period same rule everywhere
// ✅ NEW (BAROMETER v1):
// - avgReturnPct, tailPct(±15%), gapPct, topMovers
// - healthScore/momentumScore/divScore (0~1000)
// - note: sentence 기반

export type PeriodKey = "1D" | "3D" | "7D" | "15D" | "1M" | "YTD" | "1Y" | "2Y" | "3Y";

export type TopMover = {
  id: string;
  name?: string;
  ret: number; // pct points (e.g., 3.21 means 3.21%)
};

export type ThemeReturnSummary =
  | {
      ok: true;
      assetCount: number;
      validReturnCount: number;

      // legacy core/momentum/breadth (kept)
      coreMedianPct: number; // Median (%)
      momentumTopPct: number; // Top bucket mean (%)
      breadthPct: number; // % assets with return > 0
      sentence: string; // fixed template summary

      // ✅ BAROMETER fields (Right Panel expects)
      note: string; // show in panel
      avgReturn: number; // mean return (%)
      healthScore: number; // 0~1000
      momentumScore: number; // 0~1000
      divScore: number; // 0~1000
      riskScore: number; // 0~1000 (tail 반영, 높을수록 안정)
      overallScore: number; // 0~1000 (Health/Momentum/Div/Risk 종합)
      tailPct: number; // 0~100 (% of assets with |ret| >= 15)
      gapPct: number; // (top bucket mean - bottom bucket mean)
      topMovers: TopMover[]; // top N assets by return
    }
  | {
      ok: false;
      assetCount: number;
      validReturnCount: number;
      reason: "MIN_ASSET_NOT_MET" | "NO_RETURN_DATA";
      sentence: string;

      // ✅ BAROMETER fields (optional; UI can show N/A)
      note?: string;
    };

type MetricsT = Record<string, any>;

function clamp(x: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, x));
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function median(arr: number[]) {
  if (!arr.length) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

// ── 가중 통계 헬퍼 (#12 궤도 가중) ──────────────────────────────
function wsum(ws: number[]) {
  return ws.reduce((a, b) => a + b, 0);
}
function wmean(vals: number[], ws: number[]) {
  const sw = wsum(ws);
  if (sw <= 0) return 0;
  let s = 0;
  for (let i = 0; i < vals.length; i++) s += vals[i] * ws[i];
  return s / sw;
}
// 가중 중앙값: 오름차순으로 누적 가중이 총합의 절반을 넘는 값.
function wmedian(vals: number[], ws: number[]) {
  if (!vals.length) return 0;
  const idx = vals.map((_, i) => i).sort((a, b) => vals[a] - vals[b]);
  const half = wsum(ws) / 2;
  let cum = 0;
  for (const i of idx) {
    cum += ws[i];
    if (cum >= half) return vals[i];
  }
  return vals[idx[idx.length - 1]];
}

/**
 * #12 궤도(orbit) 가중치: 테마 그래프에서 ASSET의 T 노드까지 거리로 차등.
 * - 1궤도(THEMED_AS로 T에 직접 연결) = 1.0
 * - 2궤도(그 외, SUPPLIES·PARTNERS·INVESTS·OPERATES-via-BF 등으로 간접 부착) = 0.5
 * edges 미제공 또는 THEMED_AS가 하나도 없으면 전부 1.0 (기존 EW와 동일, 하위호환).
 */
export function computeOrbitWeights(
  assetIds: string[],
  nodes: Array<{ id: string; type?: string }>,
  edges: Array<{ from?: string; to?: string; type?: string }> | undefined
): Map<string, number> {
  const w = new Map<string, number>();
  if (!edges || !edges.length) {
    for (const id of assetIds) w.set(id, 1);
    return w;
  }
  const themeId = (nodes.find((n) => (n.type ?? "").toUpperCase() === "THEME") || {}).id;
  const direct = new Set<string>();
  for (const e of edges) {
    if ((e.type ?? "").toUpperCase() === "THEMED_AS" && e.from && (!themeId || e.to === themeId)) {
      direct.add(e.from);
    }
  }
  // THEMED_AS가 전혀 없으면(구조가 다른 테마) EW로 폴백
  if (direct.size === 0) {
    for (const id of assetIds) w.set(id, 1);
    return w;
  }
  for (const id of assetIds) w.set(id, direct.has(id) ? 1 : 0.5);
  return w;
}

/**
 * ✅ Period 정규화:
 * UI에서 "7d", "7D ", "7일" 등으로 와도 여기서 PeriodKey로 통일한다.
 */
export function normalizePeriodKey(p: unknown): PeriodKey | null {
  if (p === null || p === undefined) return null;
  const raw = String(p).trim();

  // 한글 라벨/축약 대응
  if (raw === "1" || raw.toLowerCase() === "1d" || raw === "1일") return "1D";
  if (raw === "3" || raw.toLowerCase() === "3d" || raw === "3일") return "3D";
  if (raw === "7" || raw.toLowerCase() === "7d" || raw === "7일") return "7D";
  if (raw === "15" || raw.toLowerCase() === "15d" || raw === "15일") return "15D";
  if (raw.toLowerCase() === "1m" || raw === "1개월" || raw === "1달") return "1M";
  if (raw.toLowerCase() === "ytd" || raw === "연초" || raw === "올해") return "YTD";
  if (raw.toLowerCase() === "1y" || raw === "1년") return "1Y";
  if (raw.toLowerCase() === "2y" || raw === "2년") return "2Y";
  if (raw.toLowerCase() === "3y" || raw === "3년") return "3Y";

  // 대문자 표준값 직접 매칭
  const up = raw.toUpperCase();
  if (up === "1D" || up === "3D" || up === "7D" || up === "15D" || up === "1M" || up === "YTD" || up === "1Y" || up === "2Y" || up === "3Y") {
    return up as PeriodKey;
  }
  return null;
}

/**
 * ✅ return 값을 "퍼센트 포인트"로 정규화 — 원천 데이터를 % 단위로 신뢰.
 * - 숫자/문자열 모두 허용
 * - heuristic 제거 (2026-05-26): 이전엔 |v|≤1 이면 자동 ×100 했으나,
 *   정상 작은 변동(-0.5%·+0.6%)을 소수로 오인하여 -50%·+60% 같은 비정상 값으로 둔갑하던
 *   bug 의 원인. 모든 update_*.py 스크립트가 *100 적용해 % 단위로 저장하므로 안전.
 */
export function normalizeToPct(v: unknown): number | null {
  if (v === null || v === undefined) return null;

  let n: number;
  if (typeof v === "number") {
    n = v;
  } else if (typeof v === "string") {
    const cleaned = v.trim().replace(/,/g, "");
    if (!cleaned) return null;
    n = Number(cleaned);
  } else {
    return null;
  }

  if (!Number.isFinite(n)) return null;
  return n;
}

export function extractReturnByPeriod(metrics: MetricsT | undefined, periodRaw: unknown): number | null {
  if (!metrics) return null;

  // ✅ Live-fetched return (Yahoo Finance) takes absolute priority.
  // Already in percentage points, bypasses normalizeToPct heuristic.
  const live = (metrics as any)._liveReturn;
  if (typeof live === "number" && Number.isFinite(live)) return live;

  const period = normalizePeriodKey(periodRaw);
  if (!period) return null;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = normalizeToPct(metrics[k]);
      if (v !== null) return v;
    }
    return null;
  };

  // ✅ Priority: return_7d (new pipeline) BEFORE ret7d (stale old pipeline).
  // Some theme JSONs (e.g. T_006) carry both; the newer return_* field is authoritative.
  switch (period) {
    case "1D":
      return pick("return_1d", "return_1D", "return1d", "ret_1d", "ret1d");
    case "3D":
      return pick("return_3d", "return_3D", "return3d", "ret_3d", "ret3d");
    case "7D":
      return pick("return_7d", "return_7D", "return7d", "ret_7d", "ret7d");
    case "15D":
      return pick("return_15d", "return_15D", "return15d", "ret_15d", "ret15d");
    case "1M":
      return pick(
        "return_1m",
        "return_30d",
        "return_30D",
        "return1m",
        "return30d",
        "ret_1m",
        "ret_30d",
        "ret1m",
        "ret30d"
      );
    case "YTD":
      return pick("return_ytd", "return_YTD", "returnYtd", "ret_ytd", "retYtd");
    case "1Y":
      return pick("return_1y", "return_1Y", "return1y", "ret_1y", "ret1y");
    case "2Y":
      return pick("return_2y", "return_2Y", "return2y", "ret_2y", "ret2y");
    case "3Y":
      return pick("return_3y", "return_3Y", "return3y", "ret_3y", "ret3y");
    default:
      return null;
  }
}

// ✅ BAROMETER v3 — 0~1000 scale, 10-tier temperature grading
// #1 (2026-07-17): 기간별 정규화. v2까지는 avgReturn ±16.67%·tail 15% 컷이 전 기간 동일해
//   1D −15%(초극단)와 1Y −15%(평범)를 같은 점수로 처리하던 문제 → 기간별 hand-tuned 앵커 도입.
// #2 (2026-07-17): tail 이중가산 제거. v2에선 tail이 Diversification((100−tail)×3)과 Risk 양쪽에
//   반영됐음 → Diversification은 breadth 기반으로 단순화하고 tail은 Risk 컴포넌트에만 유지.

// 기간별 앵커: retSat = 점수 포화 기준 수익률(%)(±retSat → 중심 500에서 ±500),
//            tailThresh = 해당 기간에 '꼬리(급락/급등) 사건'으로 카운트할 |ret|(%) 임계.
type PeriodAnchor = { retSat: number; tailThresh: number };
const PERIOD_ANCHORS: Record<PeriodKey, PeriodAnchor> = {
  "1D": { retSat: 4, tailThresh: 5 },
  "3D": { retSat: 6, tailThresh: 8 },
  "7D": { retSat: 9, tailThresh: 12 },
  "15D": { retSat: 13, tailThresh: 15 },
  "1M": { retSat: 16.7, tailThresh: 15 }, // v2 호환: 500/16.7 ≈ 30 (기존 avg×30 유지)
  YTD: { retSat: 30, tailThresh: 25 },
  "1Y": { retSat: 50, tailThresh: 40 },
  "2Y": { retSat: 75, tailThresh: 55 },
  "3Y": { retSat: 100, tailThresh: 70 },
};
const DEFAULT_ANCHOR: PeriodAnchor = PERIOD_ANCHORS["1M"];
export function anchorForPeriod(period: unknown): PeriodAnchor {
  const k = normalizePeriodKey(period);
  return (k && PERIOD_ANCHORS[k]) || DEFAULT_ANCHOR;
}

// 수익률(avg/momentum) → 0~1000. 기간별 retSat로 포화점을 정규화.
function scoreReturnPct(retPct: number, retSat: number): number {
  const s = 500 + retPct * (500 / retSat);
  return clamp(s, 0, 1000);
}

function scoreBreadthPct(breadthPct: number): number {
  // 50% => 500, 80% => 800, 20% => 200
  return clamp(breadthPct * 10, 0, 1000);
}

// #2: Diversification은 breadth(참여폭) 기반. tail은 여기서 제거하고 Risk에만 반영.
// #5: gap(상위30%−하위30% 수익률 폭)을 기간별로 정규화해 '소수 주도(분산 큼)'면 감점.
//     gap이 retSat의 2배(완전 분산)면 최대 50% 감점.
function scoreDiversification(breadthPct: number, gapPct = 0, retSat = 16.7): number {
  const base = clamp(breadthPct, 0, 100) * 10;
  const dispersion = clamp(retSat > 0 ? gapPct / retSat : 0, 0, 2) / 2; // 0..1
  return clamp(base * (1 - 0.5 * dispersion), 0, 1000);
}

/**
 * Risk score (0~1000): tailPct가 높을수록 변동성/꼬리위험이 크다고 보고 감점.
 * tailPct 0 => 1000, tailPct 100 => 0
 */
function scoreRiskFromTailPct(tailPct: number): number {
  return clamp(1000 - tailPct * 10, 0, 1000);
}

/**
 * Overall Barometer Score (0~1000)
 * - Weighted: Health 35% + Momentum 35% + Diversification 20% + Risk 10%
 */
export function calcOverallBarometerScore(input: {
  healthScore: number;
  momentumScore: number;
  divScore: number;
  tailPct: number;
}): { overallScore: number; riskScore: number } {
  const riskScore = scoreRiskFromTailPct(input.tailPct);
  const overallScore = clamp(
    input.healthScore * 0.35 + input.momentumScore * 0.35 + input.divScore * 0.2 + riskScore * 0.1,
    0,
    1000
  );
  return { overallScore: Math.round(overallScore), riskScore: Math.round(riskScore) };
}

export type TempBadgeMeta = {
  name: "BLAZING" | "HOT" | "WARM+" | "WARM" | "NEUTRAL+" | "NEUTRAL" | "COOL" | "COOL-" | "COLD" | "FROZEN";
  color: string;
};

/**
 * Temperature badge by score (0~1000), 10 tiers at 100-point intervals.
 */
export function tempByScore(score: number): TempBadgeMeta {
  const s = clamp(score, 0, 1000);
  if (s >= 900) return { name: "BLAZING", color: "#7a0119" };
  if (s >= 800) return { name: "HOT", color: "#b11226" };
  if (s >= 700) return { name: "WARM+", color: "#d72638" };
  if (s >= 600) return { name: "WARM", color: "#ef476f" };
  if (s >= 500) return { name: "NEUTRAL+", color: "#ff9e5e" };
  if (s >= 400) return { name: "NEUTRAL", color: "#6b7280" };
  if (s >= 300) return { name: "COOL", color: "#4d96ff" };
  if (s >= 200) return { name: "COOL-", color: "#3a68c9" };
  if (s >= 100) return { name: "COLD", color: "#1f3c88" };
  return { name: "FROZEN", color: "#0a1f5c" };
}

// 가중 gap: 하위30%·상위30% (가중) 평균의 차 = 종목 간 분산/주도 폭.
function computeGapPctW(returns: number[], weights: number[]) {
  const n = returns.length;
  if (n < 2) return 0;
  const idx = returns.map((_, i) => i).sort((a, b) => returns[a] - returns[b]);
  const bucketW = wsum(weights) * 0.3;
  const pick = (order: number[]) => {
    const vs: number[] = [];
    const ws: number[] = [];
    let cw = 0;
    for (const i of order) {
      vs.push(returns[i]);
      ws.push(weights[i]);
      cw += weights[i];
      if (cw >= bucketW) break;
    }
    return wmean(vs, ws);
  };
  const bot = pick(idx);
  const top = pick([...idx].reverse());
  return top - bot;
}

export function computeThemeReturnSummary(args: {
  nodes: Array<{ id: string; name?: string; type?: string; metrics?: MetricsT }>;
  period: any; // ✅ 여기 intentionally any: UI에서 뭐가 와도 normalizePeriodKey가 처리
  minAssets?: number; // default 5
  topMoversN?: number; // default 7 (panel uses 5)
  edges?: Array<{ from?: string; to?: string; type?: string }>; // #12 궤도 가중용 (미제공 시 EW)
}): ThemeReturnSummary {
  const { nodes, period, edges } = args;
  const minAssets = args.minAssets ?? 5;
  const topMoversN = args.topMoversN ?? 7;

  const assets = (Array.isArray(nodes) ? nodes : []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");
  const assetCount = assets.length;

  // ✅ returns with identity
  const withRet = assets
    .map((a) => {
      const ret = extractReturnByPeriod(a.metrics, period);
      return { id: a.id, name: a.name, ret };
    })
    .filter((x) => typeof x.ret === "number" && Number.isFinite(x.ret)) as Array<{ id: string; name?: string; ret: number }>;

  const returns = withRet.map((x) => x.ret);
  const validN = returns.length;

  // ✅ Hard Rule: ASSET >= 5
  if (assetCount < minAssets) {
    return {
      ok: false,
      assetCount,
      validReturnCount: validN,
      reason: "MIN_ASSET_NOT_MET",
      sentence: `이 테마는 아직 수익률을 대표하기에 충분한 종목 수(ASSET ${minAssets}개 이상)가 아닙니다.`,
      note: "표본 부족",
    };
  }

  // ✅ NEW: 수익률 데이터가 "0개"면 0%로 계산하지 말고 '데이터 없음' 처리
  if (validN === 0) {
    const p = normalizePeriodKey(period) ?? String(period ?? "").trim();
    return {
      ok: false,
      assetCount,
      validReturnCount: 0,
      reason: "NO_RETURN_DATA",
      sentence: `(${p} 기준) ASSET은 ${assetCount}개지만, 수익률(ret) 데이터가 없어 계산할 수 없습니다.`,
      note: "데이터 없음",
    };
  }

  // #12: 궤도 가중치 (1궤도 THEMED_AS=1.0, 2궤도=0.5; edges 없으면 전부 1.0=EW)
  const wmap = computeOrbitWeights(withRet.map((x) => x.id), nodes, edges);
  const weights = withRet.map((x) => wmap.get(x.id) ?? 1);
  const totalW = wsum(weights);

  // #3: median을 점수에 반영 (가중 중앙값). avg도 가중.
  const coreMedianPct = wmedian(returns, weights);
  const avgReturn = wmean(returns, weights);

  // Momentum: 상위 30%(개수 기준) 가중 평균, 단 5~9개면 상위 2개
  const orderDesc = returns.map((_, i) => i).sort((a, b) => returns[b] - returns[a]);
  const topN = validN >= 10 ? Math.ceil(validN * 0.3) : 2;
  const topIdx = orderDesc.slice(0, clamp(topN, 1, validN));
  const momentumTopPct = wmean(topIdx.map((i) => returns[i]), topIdx.map((i) => weights[i]));

  // Breadth: 가중 상승 비율
  const breadthPct = (returns.reduce((acc, r, i) => acc + (r > 0 ? weights[i] : 0), 0) / totalW) * 100;

  // #1: tail 임계를 기간별로 정규화 (1D ±5% ~ 3Y ±70%) + 가중
  const anchor = anchorForPeriod(period);
  const tailPct =
    (returns.reduce((acc, r, i) => acc + (Math.abs(r) >= anchor.tailThresh ? weights[i] : 0), 0) / totalW) * 100;

  // #5: gap(상·하위 분산)을 Diversification 감점에 활용 (가중)
  const gapPct = computeGapPctW(returns, weights);

  // ✅ 고정 문장 템플릿
  let tone = "중립";
  if (breadthPct >= 70 && coreMedianPct > 0) tone = "확산형 강세";
  else if (breadthPct < 45 && momentumTopPct > Math.max(5, coreMedianPct + 5)) tone = "소수 주도형";
  else if (coreMedianPct < 0 && breadthPct < 50) tone = "전반 약세";

  const p = normalizePeriodKey(period) ?? String(period ?? "").trim();
  const sentence = `(${p} 기준) 이 테마는 ${tone} 흐름입니다. 중간 수익률(Median) ${coreMedianPct.toFixed(
    2
  )}% / 상위 구간(Momentum) ${momentumTopPct.toFixed(2)}% / 상승 비율(Breadth) ${breadthPct.toFixed(0)}%.`;

  // ✅ BAROMETER scores (v3) — 기간별 앵커(anchor.retSat)로 정규화
  // #3: Health level = 평균·중앙값 블렌드(robust center)로 outlier 완화
  const robustCenter = 0.5 * avgReturn + 0.5 * coreMedianPct;
  const levelScore = scoreReturnPct(robustCenter, anchor.retSat);
  const breadthScore = scoreBreadthPct(breadthPct);

  // Health: robust level(60) + breadth(40)
  const healthScore = clamp(levelScore * 0.6 + breadthScore * 0.4, 0, 1000);

  // Momentum (기간별 정규화)
  const momentumScore = scoreReturnPct(momentumTopPct, anchor.retSat);

  // Diversification (#2: breadth 기반 + #5: gap 분산 감점)
  const divScore = scoreDiversification(breadthPct, gapPct, anchor.retSat);

  const { overallScore, riskScore } = calcOverallBarometerScore({
    healthScore,
    momentumScore,
    divScore,
    tailPct,
  });

  // Top movers
  const topMovers = [...withRet]
    .sort((a, b) => b.ret - a.ret)
    .slice(0, clamp(topMoversN, 1, withRet.length))
    .map((x) => ({ id: x.id, name: x.name, ret: x.ret }));

  return {
    ok: true,
    assetCount,
    validReturnCount: validN,
    coreMedianPct,
    momentumTopPct,
    breadthPct,
    sentence,

    // BAROMETER
    note: sentence,
    avgReturn,
    healthScore,
    momentumScore,
    divScore,
    riskScore,
    overallScore,
    tailPct,
    gapPct,
    topMovers,
  };
}