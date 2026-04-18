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

/**
 * ✅ Period 정규화:
 * UI에서 "7d", "7D ", "7일" 등으로 와도 여기서 PeriodKey로 통일한다.
 */
export function normalizePeriodKey(p: unknown): PeriodKey | null {
  if (p === null || p === undefined) return null;
  const raw = String(p).trim();

  // 한글 라벨/축약 대응
  if (raw === "3" || raw.toLowerCase() === "3d" || raw === "3일") return "3D";
  if (raw === "7" || raw.toLowerCase() === "7d" || raw === "7일") return "7D";
  if (raw.toLowerCase() === "1m" || raw === "1개월" || raw === "1달") return "1M";
  if (raw.toLowerCase() === "ytd" || raw === "연초" || raw === "올해") return "YTD";
  if (raw.toLowerCase() === "1y" || raw === "1년") return "1Y";
  if (raw.toLowerCase() === "3y" || raw === "3년") return "3Y";

  // 대문자 표준값 직접 매칭
  const up = raw.toUpperCase();
  if (up === "3D" || up === "7D" || up === "1M" || up === "YTD" || up === "1Y" || up === "3Y") {
    return up as PeriodKey;
  }
  return null;
}

/**
 * ✅ return 값을 "퍼센트 포인트"로 정규화
 * - 숫자/문자열 모두 허용
 * - 0.0321 같은 소수 수익률이면 3.21로 자동 변환(가정: |v|<=1이면 소수일 가능성 높음)
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

  // 소수 수익률 자동 변환(선택적이지만 실전에서 매우 자주 필요)
  // 예: 0.0321 => 3.21(%)
  if (Math.abs(n) > 0 && Math.abs(n) <= 1) {
    n = n * 100;
  }
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
    case "3D":
      return pick("return_3d", "return_3D", "return3d", "ret_3d", "ret3d");
    case "7D":
      return pick("return_7d", "return_7D", "return7d", "ret_7d", "ret7d");
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
    case "3Y":
      return pick("return_3y", "return_3Y", "return3y", "ret_3y", "ret3y");
    default:
      return null;
  }
}

// ✅ BAROMETER v2 — 0~1000 scale, 10-tier temperature grading
// Saturation points preserved from v1: avgReturn ±16.67%, breadth 0~100%, tail 0~100.

function scoreAvgReturn(avgReturn: number): number {
  // 0% => 500, +10% => 800, +16.67% => 1000, -10% => 200
  const s = 500 + avgReturn * 30;
  return clamp(s, 0, 1000);
}

function scoreBreadthPct(breadthPct: number): number {
  // 50% => 500, 80% => 800, 20% => 200
  return clamp(breadthPct * 10, 0, 1000);
}

function scoreMomentumPct(momentumTopPct: number): number {
  // 0% => 500, +10% => 800, +16.67% => 1000, -10% => 200
  const s = 500 + momentumTopPct * 30;
  return clamp(s, 0, 1000);
}

function scoreDiversification(breadthPct: number, tailPct: number): number {
  // breadth 높고 tail 낮으면 좋음. max: 100*7 + 100*3 = 1000
  const b = clamp(breadthPct, 0, 100);
  const t = clamp(tailPct, 0, 100);
  const s = b * 7 + (100 - t) * 3;
  return clamp(s, 0, 1000);
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
  period: any; // ✅ 여기 intentionally any: UI에서 뭐가 와도 normalizePeriodKey가 처리
  minAssets?: number; // default 5
  topMoversN?: number; // default 7 (panel uses 5)
}): ThemeReturnSummary {
  const { nodes, period } = args;
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

  // ✅ 고정 문장 템플릿
  let tone = "중립";
  if (breadthPct >= 70 && coreMedianPct > 0) tone = "확산형 강세";
  else if (breadthPct < 45 && momentumTopPct > Math.max(5, coreMedianPct + 5)) tone = "소수 주도형";
  else if (coreMedianPct < 0 && breadthPct < 50) tone = "전반 약세";

  const p = normalizePeriodKey(period) ?? String(period ?? "").trim();
  const sentence = `(${p} 기준) 이 테마는 ${tone} 흐름입니다. 중간 수익률(Median) ${coreMedianPct.toFixed(
    2
  )}% / 상위 구간(Momentum) ${momentumTopPct.toFixed(2)}% / 상승 비율(Breadth) ${breadthPct.toFixed(0)}%.`;

  // ✅ BAROMETER scores (v1)
  const avgScore = scoreAvgReturn(avgReturn);
  const breadthScore = scoreBreadthPct(breadthPct);

  // Health: 평균(60) + breadth(40)
  const healthScore = clamp(avgScore * 0.6 + breadthScore * 0.4, 0, 1000);

  // Momentum
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