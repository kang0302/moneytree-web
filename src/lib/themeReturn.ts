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
// - healthScore/momentumScore/divScore (0~100)
// - note: sentence 기반

export type PeriodKey = "3D" | "7D" | "1M" | "YTD" | "1Y" | "3Y";

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
      healthScore: number; // 0~100
      momentumScore: number; // 0~100
      divScore: number; // 0~100
      riskScore: number; // 0~100 (tail 반영, 높을수록 안정)
      overallScore: number; // 0~100 (Health/Momentum/Div/Risk 종합)
      tailPct: number; // 0~100 (% of assets with |ret| >= 15)
      gapPct: number; // 0~100-ish (top bucket mean - bottom bucket mean)
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

// Convert return to pct points (already pct in data)
export function normalizeToPct(v: unknown): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

export function extractReturnByPeriod(metrics: MetricsT | undefined, period: PeriodKey): number | null {
  if (!metrics) return null;

  const pick = (...keys: string[]) => {
    for (const k of keys) {
      const v = normalizeToPct(metrics[k]);
      if (v !== null) return v;
    }
    return null;
  };

  switch (period) {
    case "3D":
      return pick("ret3d", "ret_3d", "return3d", "return_3d", "return_3D");
    case "7D":
      return pick("ret7d", "ret_7d", "return7d", "return_7d", "return_7D");
    case "1M":
      return pick(
        "ret1m",
        "ret_1m",
        "ret30d",
        "ret_30d",
        "return1m",
        "return_1m",
        "return30d",
        "return_30d",
        "return_30D"
      );
    case "YTD":
      return pick("retYtd", "ret_ytd", "returnYtd", "return_ytd", "return_YTD");
    case "1Y":
      return pick("ret1y", "ret_1y", "return1y", "return_1y", "return_1Y");
    case "3Y":
      return pick("ret3y", "ret_3y", "return3y", "return_3y", "return_3Y");
    default:
      return null;
  }
}

function scoreAvgReturn(avgReturn: number): number {
  // v1: 0% => 50, +10% => 80, +20% => 100, -10% => 20
  const s = 50 + avgReturn * 3;
  return clamp(s, 0, 100);
}

function scoreBreadthPct(breadthPct: number): number {
  // breadth 50% => 50, 80% => 80, 20% => 20
  return clamp(breadthPct, 0, 100);
}

function scoreMomentumPct(momentumTopPct: number): number {
  // v1: 0% => 50, +10% => 80, +20% => 100, -10% => 20
  const s = 50 + momentumTopPct * 3;
  return clamp(s, 0, 100);
}

function scoreDiversification(breadthPct: number, tailPct: number): number {
  // v1: breadth가 높고 tail이 낮으면 좋음
  // - breadth 60% 이상 가점
  // - tail 20% 이상 감점
  const b = clamp(breadthPct, 0, 100);
  const t = clamp(tailPct, 0, 100);
  const s = b * 0.7 + (100 - t) * 0.3;
  return clamp(s, 0, 100);
}

/**
 * Risk score (0~100): tailPct가 높을수록 변동성/꼬리위험이 크다고 보고 감점.
 * - v1 가정: riskScore = 100 - tailPct
 */
function scoreRiskFromTailPct(tailPct: number): number {
  return clamp(100 - tailPct, 0, 100);
}

/**
 * Overall Barometer Score (0~100)
 * - v1 가정(추정): Health 35% + Momentum 35% + Diversification 20% + Risk 10%
 * - FULL THEME MAP과 동일 로직이 있으면, 추후 이 함수를 SSOT로 삼아 양쪽에서 재사용.
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
    100
  );
  return { overallScore: Math.round(overallScore), riskScore: Math.round(riskScore) };
}

export type TempBadgeMeta = { name: "HOT" | "WARM" | "NEUTRAL" | "COOL" | "COLD"; color: string };

/**
 * Temperature badge by score (0~100)
 */
export function tempByScore(score: number): TempBadgeMeta {
  const s = clamp(score, 0, 100);
  if (s >= 80) return { name: "HOT", color: "#b11226" };
  if (s >= 60) return { name: "WARM", color: "#ef476f" };
  if (s >= 40) return { name: "NEUTRAL", color: "#6b7280" };
  if (s >= 20) return { name: "COOL", color: "#4d96ff" };
  return { name: "COLD", color: "#1f3c88" };
}

function computeGapPct(returns: number[]) {
  const n = returns.length;
  if (n < 2) return 0;

  const sorted = [...returns].sort((a, b) => a - b);
  const bucket = Math.max(1, Math.floor(n * 0.3));

  const bot = mean(sorted.slice(0, bucket));
  const top = mean(sorted.slice(n - bucket));
  return top - bot;
}

export function computeThemeReturnSummary(args: {
  nodes: Array<{ id: string; name?: string; type?: string; metrics?: MetricsT }>;
  period: PeriodKey;
  minAssets?: number; // default 5
  topMoversN?: number; // default 7 (panel uses 5)
}): ThemeReturnSummary {
  const { nodes, period } = args;
  const minAssets = args.minAssets ?? 5;
  const topMoversN = args.topMoversN ?? 7;

  const assets = (Array.isArray(nodes) ? nodes : []).filter(
    (n) => (n.type ?? "").toUpperCase() === "ASSET"
  );

  const assetCount = assets.length;

  // ✅ returns with identity
  const withRet = assets
    .map((a) => {
      const ret = extractReturnByPeriod(a.metrics, period);
      return { id: a.id, name: a.name, ret };
    })
    .filter((x) => typeof x.ret === "number" && Number.isFinite(x.ret)) as Array<{
    id: string;
    name?: string;
    ret: number;
  }>;

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
    return {
      ok: false,
      assetCount,
      validReturnCount: 0,
      reason: "NO_RETURN_DATA",
      sentence: `(${period} 기준) ASSET은 ${assetCount}개지만, 수익률(ret) 데이터가 없어 계산할 수 없습니다.`,
      note: "데이터 없음",
    };
  }

  const coreMedianPct = median(returns);

  // Momentum: 상위 30% 평균, 단 5~9개면 상위 2개
  const sortedDesc = [...returns].sort((a, b) => b - a);
  const topN = validN >= 10 ? Math.ceil(validN * 0.3) : 2;
  const momentumTopPct = mean(sortedDesc.slice(0, clamp(topN, 1, validN)));

  const breadthPct = (returns.filter((x) => x > 0).length / validN) * 100;

  const avgReturn = mean(returns);

  // tail: |ret| >= 15%
  const tailPct = (returns.filter((x) => Math.abs(x) >= 15).length / validN) * 100;

  const gapPct = computeGapPct(returns);

  // ✅ 고정 문장 템플릿 (설명 가능)
  let tone = "중립";
  if (breadthPct >= 70 && coreMedianPct > 0) tone = "확산형 강세";
  else if (breadthPct < 45 && momentumTopPct > Math.max(5, coreMedianPct + 5)) tone = "소수 주도형";
  else if (coreMedianPct < 0 && breadthPct < 50) tone = "전반 약세";

  const sentence = `(${period} 기준) 이 테마는 ${tone} 흐름입니다. 중간 수익률(Median) ${coreMedianPct.toFixed(
    2
  )}% / 상위 구간(Momentum) ${momentumTopPct.toFixed(2)}% / 상승 비율(Breadth) ${breadthPct.toFixed(
    0
  )}%.`;

  // ✅ BAROMETER scores (v1)
  const avgScore = scoreAvgReturn(avgReturn);
  const breadthScore = scoreBreadthPct(breadthPct);

  // Health: 평균(60) + breadth(40)
  const healthScore = clamp(avgScore * 0.6 + breadthScore * 0.4, 0, 100);

  // Momentum (v1: 현재 period의 momentumTopPct 점수화)
  const momentumScore = scoreMomentumPct(momentumTopPct);

  // Diversification
  const divScore = scoreDiversification(breadthPct, tailPct);

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