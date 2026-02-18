// src/lib/themeReturn.ts
// DAY50-3 - Theme Return Definition (PATCH)
// - Min ASSET count >= 5
// - NEW: if valid return count === 0 => ok:false (NO_RETURN_DATA)
// - Core = Median
// - Momentum = Top 30% mean (if 5~9 assets => top 2)
// - Breadth = % of assets with return > 0
// - Period same rule everywhere

export type PeriodKey = "3D" | "7D" | "1M" | "YTD" | "1Y" | "3Y";

export type ThemeReturnSummary =
  | {
      ok: true;
      assetCount: number;
      validReturnCount: number; // ✅ NEW: period return 데이터가 실제로 몇 개 있었는지
      coreMedianPct: number; // Median (%)
      momentumTopPct: number; // Top bucket mean (%)
      breadthPct: number; // % assets with return > 0
      sentence: string; // fixed template summary
    }
  | {
      ok: false;
      assetCount: number;
      validReturnCount: number; // ✅ NEW
      reason: "MIN_ASSET_NOT_MET" | "NO_RETURN_DATA"; // ✅ NEW
      sentence: string;
    };

type MetricsT = Record<string, any>;

export function normalizeToPct(vRaw: number): number {
  // 프로젝트에서 0.12(=12%)로 줄 수도 있고 12(=12%)로 줄 수도 있음
  // abs<=1.5면 비율로 보고 100배
  return Math.abs(vRaw) <= 1.5 ? vRaw * 100 : vRaw;
}

export function extractReturnByPeriod(metrics: MetricsT | undefined, p: PeriodKey): number | undefined {
  const m = metrics ?? {};
  const pick = (x: any) => (typeof x === "number" && Number.isFinite(x) ? x : undefined);

  let v: number | undefined;

  switch (p) {
    case "3D":
      v = pick(m.ret3d) ?? pick(m.return3d) ?? pick(m.r3d) ?? pick(m["3d"]);
      break;
    case "7D":
      v = pick(m.ret7d) ?? pick(m.return7d) ?? pick(m.r7d) ?? pick(m["7d"]);
      break;
    case "1M":
      v =
        pick(m.ret1m) ??
        pick(m.return1m) ??
        pick(m.return30d) ??
        pick(m.ret30d) ??
        pick(m.r30d) ??
        pick(m.r1m) ??
        pick(m["30d"]);
      break;
    case "YTD":
      v = pick(m.retYtd) ?? pick(m.returnYtd) ?? pick(m.ytd) ?? pick(m.rYtd) ?? pick(m["ytd"]);
      break;
    case "1Y":
      v = pick(m.ret1y) ?? pick(m.return1y) ?? pick(m.r1y) ?? pick(m["1y"]);
      break;
    case "3Y":
      v = pick(m.ret3y) ?? pick(m.return3y) ?? pick(m.r3y) ?? pick(m["3y"]);
      break;
  }

  if (typeof v !== "number" || !Number.isFinite(v)) return undefined;
  return normalizeToPct(v);
}

function median(xs: number[]): number {
  const a = [...xs].sort((x, y) => x - y);
  const n = a.length;
  if (n === 0) return 0;
  const mid = Math.floor(n / 2);
  if (n % 2 === 1) return a[mid];
  return (a[mid - 1] + a[mid]) / 2;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

export function computeThemeReturnSummary(args: {
  nodes: Array<{ id: string; type?: string; metrics?: MetricsT }>;
  period: PeriodKey;
  minAssets?: number; // default 5
}): ThemeReturnSummary {
  const { nodes, period } = args;
  const minAssets = args.minAssets ?? 5;

  const assets = (Array.isArray(nodes) ? nodes : []).filter((n) => (n.type ?? "").toUpperCase() === "ASSET");

  const returns = assets
    .map((a) => extractReturnByPeriod(a.metrics, period))
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x));

  const assetCount = assets.length;
  const validN = returns.length;

  // ✅ Hard Rule: ASSET >= 5
  if (assetCount < minAssets) {
    return {
      ok: false,
      assetCount,
      validReturnCount: validN,
      reason: "MIN_ASSET_NOT_MET",
      sentence: `이 테마는 아직 수익률을 대표하기에 충분한 종목 수(ASSET ${minAssets}개 이상)가 아닙니다.`,
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
    };
  }

  const coreMedianPct = median(returns);

  // Momentum: 상위 30% 평균, 단 5~9개면 상위 2개
  const sortedDesc = [...returns].sort((a, b) => b - a);
  const topN = validN >= 10 ? Math.ceil(validN * 0.3) : 2;
  const momentumTopPct = mean(sortedDesc.slice(0, clamp(topN, 1, validN)));

  const breadthPct = (returns.filter((x) => x > 0).length / validN) * 100;

  // ✅ 고정 문장 템플릿 (설명 가능)
  let tone = "중립";
  if (breadthPct >= 70 && coreMedianPct > 0) tone = "확산형 강세";
  else if (breadthPct < 45 && momentumTopPct > Math.max(5, coreMedianPct + 5)) tone = "소수 주도형";
  else if (coreMedianPct < 0 && breadthPct < 50) tone = "전반 약세";

  const sentence = `(${period} 기준) 이 테마는 ${tone} 흐름입니다. 중간 수익률(Median) ${coreMedianPct.toFixed(
    2
  )}% / 상위 구간(Momentum) ${momentumTopPct.toFixed(2)}% / 상승 비율(Breadth) ${breadthPct.toFixed(0)}%.`;

  return {
    ok: true,
    assetCount,
    validReturnCount: validN,
    coreMedianPct,
    momentumTopPct,
    breadthPct,
    sentence,
  };
}
