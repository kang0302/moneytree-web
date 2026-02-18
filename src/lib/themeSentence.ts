// src/lib/themeSentence.ts
import type { PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";

type NodeT = {
  id: string;
  type?: string;
  name?: string;
  metrics?: Record<string, any>;
  [k: string]: any;
};

type EdgeT = {
  from: string;
  to: string;
  type?: string;
  label?: string;
  [k: string]: any;
};

function normType(t?: string) {
  const x = (t ?? "").toUpperCase();
  if (x.includes("FIELD")) return "FIELD";
  if (x === "BUSINESS_FIELD") return "FIELD";
  if (x === "ASSET") return "ASSET";
  if (x === "THEME") return "THEME";
  return x || "-";
}

function fmtPct(x?: number, digits = 2) {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}%`;
}

function fmtPp(x?: number, digits = 2) {
  // percent-point 출력 (Core/Mom은 이미 % 단위로 들어온다고 가정)
  if (typeof x !== "number" || !isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}%p`;
}

function fmtIntDelta(x?: number) {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${Math.round(x)}`;
}

function pickOkSummary(tr?: ThemeReturnSummary) {
  const a: any = tr as any;
  if (!a?.ok) return null;
  return {
    core: a.coreMedianPct as number | undefined,
    mom: a.momentumTopPct as number | undefined,
    breadth: a.breadthPct as number | undefined,
    asset: a.assetCount as number | undefined,
    sentence: (a.sentence as string | undefined) ?? "",
  };
}

function countByType(nodes: NodeT[]) {
  let assets = 0;
  let fields = 0;
  for (const n of nodes) {
    const t = normType(n.type);
    if (t === "ASSET") assets++;
    else if (t === "FIELD") fields++;
  }
  return { assets, fields };
}

function toPeriodKo(p: PeriodKey) {
  switch (p) {
    case "3D":
      return "3일";
    case "7D":
      return "7일";
    case "1M":
      return "1개월";
    case "YTD":
      return "YTD";
    case "1Y":
      return "1년";
    case "3Y":
      return "3년";
    default:
      return p;
  }
}

function isSelfCompareById(currentThemeId?: string, compareThemeId?: string) {
  const a = (currentThemeId ?? "").trim();
  const b = (compareThemeId ?? "").trim();
  return !!a && !!b && a === b;
}

function isSelfCompareByName(compareThemeName?: string) {
  return (compareThemeName ?? "").toLowerCase().includes("self");
}

/**
 * DAY55-3: Compare Δ 문장 포함 규칙
 * - 기본: 테마 구조(ASSET/FIELD 수) + 현재 KPI(가능하면)
 * - Compare: ΔCore/ΔMom/ΔBreadth/ΔASSET 요약 추가
 * - Self compare: Δ 생략 안내
 */
export function makeThemeSentence(args: {
  themeId?: string;
  themeName: string;
  nodes: NodeT[];
  edges?: EdgeT[];
  period: PeriodKey;
  themeReturn?: ThemeReturnSummary;
  // compare
  compareThemeId?: string;
  compareThemeName?: string;
  compareThemeReturn?: ThemeReturnSummary;
}) {
  const {
    themeId,
    themeName,
    nodes,
    period,
    themeReturn,
    compareThemeId,
    compareThemeName,
    compareThemeReturn,
  } = args;

  const pKo = toPeriodKo(period);
  const { assets, fields } = countByType(Array.isArray(nodes) ? nodes : []);

  const cur = pickOkSummary(themeReturn);
  const cmp = pickOkSummary(compareThemeReturn);

  // Self compare 판단(둘 중 하나라도 맞으면 self로 간주)
  const self =
    isSelfCompareById(themeId, compareThemeId) || isSelfCompareByName(compareThemeName);

  // ✅ 기본 문장 (compare 없거나 KPI 계산 불가)
  const baseParts: string[] = [];
  baseParts.push(`"${themeName}" 테마는`);
  baseParts.push(`ASSET ${assets}개`);
  if (fields > 0) baseParts.push(`· FIELD ${fields}개`);
  baseParts.push(`구성으로 연결 구조를 보여줍니다.`);

  // ✅ 현재 KPI가 있으면 한 줄 덧붙임
  if (cur) {
    baseParts.push(
      `${pKo} 기준 Core ${fmtPct(cur.core)} · Mom ${fmtPct(cur.mom)} · Breadth ${
        typeof cur.breadth === "number" ? `${cur.breadth.toFixed(0)}%` : "—"
      }`
    );
  } else {
    baseParts.push(`${pKo} 기준 KPI는 데이터가 부족해 계산되지 않았습니다.`);
  }

  // ✅ Compare가 없다면 base로 끝
  if (!compareThemeId) return baseParts.join(" ");

  // ✅ Self compare면 Δ 안내
  if (self) {
    return `${baseParts.join(" ")} Self compare: 동일 테마 비교이므로 Δ는 표시하지 않습니다.`;
  }

  // ✅ Compare는 있는데 compare KPI가 없으면 안내
  if (!cmp || !cur) {
    const cn = compareThemeName ?? compareThemeId;
    return `${baseParts.join(" ")} 비교 테마(${cn})는 KPI 데이터가 부족해 Δ 비교를 표시할 수 없습니다.`;
  }

  // ✅ Δ 계산( Current - Compare )
  const dCore = (cur.core ?? 0) - (cmp.core ?? 0);
  const dMom = (cur.mom ?? 0) - (cmp.mom ?? 0);
  const dBreadth = (cur.breadth ?? 0) - (cmp.breadth ?? 0);
  const dAsset = (cur.asset ?? 0) - (cmp.asset ?? 0);

  const cn = compareThemeName ?? compareThemeId;

  return `${baseParts.join(" ")} 비교 테마(${cn}) 대비 ΔCore ${fmtPp(
    dCore
  )} · ΔMom ${fmtPp(dMom)} · ΔBreadth ${fmtPp(dBreadth)} · ΔASSET ${fmtIntDelta(
    dAsset
  )} 입니다.`;
}
