// src/components/GraphRightPanel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";

type NodeT = {
  id: string;
  name?: string;
  type?: string;
  metrics?: {
    perFwd12m?: number;
    per?: number;
    pe?: number;
    [k: string]: any;
  };
  exposure?: {
    ticker?: string;
    exchange?: string;
    country?: string;
    [k: string]: any;
  };
  [k: string]: any;
};

export type ResearchLinkT = {
  url: string;
  title?: string;
  publishedAt?: string;
  source?: string;
  oneLine?: string;
};

type LinkPreviewT = {
  url: string;
  finalUrl?: string;
  title?: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
  error?: string;
};

// ✅ Compare Selector UI (기존 타입 유지: 다른 파일과의 의존성 안전)
export type CompareThemeOptionT = {
  themeId: string;
  themeName: string;
};

type Props = {
  themeName: string;

  // ✅ current theme id
  currentThemeId: string;

  selectedNode: NodeT | null;

  // ✅ nodes for movers & barometer
  nodes?: NodeT[];

  // ✅ (optional) overlap
  compareNodes?: NodeT[];

  researchLinks?: ResearchLinkT[];

  // ✅ period (헤더에서 제어됨)
  period: PeriodKey;
  onChangePeriod: (p: PeriodKey) => void;

  // ✅ ThemeReturnSummary (호환 유지를 위해 props는 유지하되, 우패널에서는 KPI 섹션 제거)
  themeReturn: ThemeReturnSummary;

  // ✅ Compare props (호환 유지)
  compareOptions?: CompareThemeOptionT[];
  compareThemeId?: string;
  onChangeCompareThemeId?: (themeId: string) => void;
  compareThemeName?: string;
  compareThemeReturn?: ThemeReturnSummary;
};

function normType(t?: string) {
  const x = (t ?? "").toUpperCase();
  if (x.includes("FIELD")) return "FIELD";
  if (x === "BUSINESS_FIELD") return "FIELD";
  if (x === "ASSET") return "ASSET";
  if (x === "THEME") return "THEME";
  return x || "-";
}

function fmtDate(s?: string) {
  if (!s) return "";
  try {
    const d = new Date(s);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  } catch {}
  return s.slice(0, 10);
}

function fmtNum(x?: number) {
  if (typeof x !== "number" || !isFinite(x)) return "-";
  return x.toFixed(2);
}

function fmtPct(x?: number, digits = 2) {
  if (typeof x !== "number" || !isFinite(x)) return "—";
  const sign = x > 0 ? "+" : "";
  return `${sign}${x.toFixed(digits)}%`;
}

// JSON에 0.12(=12%) 형태로 들어오면 100배 보정
function normalizePct(v: number) {
  return Math.abs(v) <= 1.5 ? v * 100 : v;
}

function getReturnByPeriodFromMetrics(metrics: any, period: PeriodKey): number | undefined {
  if (!metrics) return undefined;
  const pick = (v: any) => (typeof v === "number" && Number.isFinite(v) ? v : undefined);

  let raw: number | undefined;
  switch (period) {
    case "3D":
      raw = pick(metrics.ret3d) ?? pick(metrics.return3d) ?? pick(metrics.r3d) ?? pick(metrics["3d"]);
      break;
    case "7D":
      raw = pick(metrics.ret7d) ?? pick(metrics.return7d) ?? pick(metrics.r7d) ?? pick(metrics["7d"]);
      break;
    case "1M":
      raw =
        pick(metrics.ret1m) ??
        pick(metrics.return1m) ??
        pick(metrics.return30d) ??
        pick(metrics.ret30d) ??
        pick(metrics.r30d) ??
        pick(metrics.r1m) ??
        pick(metrics["30d"]);
      break;
    case "YTD":
      raw =
        pick(metrics.retYtd) ??
        pick(metrics.returnYtd) ??
        pick(metrics.ytd) ??
        pick(metrics.rYtd) ??
        pick(metrics["ytd"]);
      break;
    case "1Y":
      raw = pick(metrics.ret1y) ?? pick(metrics.return1y) ?? pick(metrics.r1y) ?? pick(metrics["1y"]);
      break;
    case "3Y":
      raw = pick(metrics.ret3y) ?? pick(metrics.return3y) ?? pick(metrics.r3y) ?? pick(metrics["3y"]);
      break;
  }

  if (typeof raw !== "number") return undefined;
  return normalizePct(raw);
}

function getAssetReturnByPeriod(selectedNode: NodeT | null, period: PeriodKey): number | undefined {
  if (!selectedNode) return undefined;
  if (normType(selectedNode.type) !== "ASSET") return undefined;
  return getReturnByPeriodFromMetrics(selectedNode.metrics ?? {}, period);
}

/* =========================
   ✅ Barometer (계산/요약 자동 생성)
   - Tail 기준: ±15%
   - Hot/Cold 기준: Health/Momentum (60/40)
   - Diversification: 편중 경고 포함
   - Sticky: 우측 패널 상단
   ========================= */

type VolLevel = "GREEN" | "YELLOW" | "RED";
type HotCold = "HOT" | "NEUTRAL" | "COLD";

function clamp(n: number, a: number, b: number) {
  return Math.max(a, Math.min(b, n));
}

function percentile(sortedAsc: number[], p: number) {
  if (!sortedAsc.length) return 0;
  const idx = (sortedAsc.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sortedAsc[lo];
  const w = idx - lo;
  return sortedAsc[lo] * (1 - w) + sortedAsc[hi] * w;
}

function mean(arr: number[]) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function computeBarometer(nodes: NodeT[], period: PeriodKey) {
  const assets = (Array.isArray(nodes) ? nodes : [])
    .filter((n) => normType(n.type) === "ASSET")
    .map((n) => {
      const rP = getReturnByPeriodFromMetrics(n.metrics ?? {}, period);
      const r7 = getReturnByPeriodFromMetrics(n.metrics ?? {}, "7D");
      const r1m = getReturnByPeriodFromMetrics(n.metrics ?? {}, "1M");
      const r1y = getReturnByPeriodFromMetrics(n.metrics ?? {}, "1Y");
      return {
        id: n.id,
        name: n.name ?? n.id,
        rP,
        r7,
        r1m,
        r1y,
      };
    });

  const validP = assets.map((x) => x.rP).filter((v): v is number => typeof v === "number" && isFinite(v));
  const N = validP.length;

  // 계산 불가 처리
  if (N < 5) {
    return {
      ok: false,
      health: 0,
      momentum: 0,
      diversification: 0,
      volLevel: "YELLOW" as VolLevel,
      hotCold: "NEUTRAL" as HotCold,
      tailRatio: 0,
      breadthPct: 0,
      avgPct: 0,
      gap: 0,
      biasWarning: false,
      leaders: [] as string[],
      summaryLine: `ASSET ${N}개로는 바로미터 계산이 어렵습니다. (최소 5개 필요)`,
    };
  }

  // 기본 통계
  const avgPct = mean(validP);
  const pos = validP.filter((v) => v > 0).length;
  const breadthPct = (pos / N) * 100;

  const sorted = [...validP].sort((a, b) => a - b);
  const p20 = percentile(sorted, 0.2);
  const p80 = percentile(sorted, 0.8);
  const gap = p80 - p20;

  // Tail (±15%)
  const tail = validP.filter((v) => Math.abs(v) >= 15).length;
  const tailRatio = tail / N;

  // Health (0~100)
  const P = pos / N;
  const health = clamp(50 + 2.0 * avgPct + 30 * (P - 0.5) - 0.3 * gap, 0, 100);

  // Diversification (HHI 기반 0~100)
  const weights = validP.map((v) => Math.abs(v));
  const sumW = weights.reduce((a, b) => a + b, 0);
  const shares = sumW > 0 ? weights.map((w) => w / sumW) : weights.map(() => 1 / N);
  const hhi = shares.reduce((a, s) => a + s * s, 0);
  const minHHI = 1 / N;
  const maxHHI = 1;
  const hhiNorm = (hhi - minHHI) / (maxHHI - minHHI); // 0~1 (0이 분산, 1이 집중)
  const diversification = clamp(100 * (1 - hhiNorm), 0, 100);
  const biasWarning = diversification < 45;

  // Volatility Alert (G/Y/R)
  const volLevel: VolLevel =
    gap < 10 && tailRatio < 0.15 ? "GREEN" : gap < 20 || tailRatio < 0.3 ? "YELLOW" : "RED";

  // Momentum (0~100) : 0.5*R7 + 0.3*R1M + 0.2*R1Y
  const r7 = assets.map((x) => x.r7).filter((v): v is number => typeof v === "number" && isFinite(v));
  const r1m = assets.map((x) => x.r1m).filter((v): v is number => typeof v === "number" && isFinite(v));
  const r1y = assets.map((x) => x.r1y).filter((v): v is number => typeof v === "number" && isFinite(v));

  const R7 = r7.length ? mean(r7) : 0;
  const R1M = r1m.length ? mean(r1m) : 0;
  const R1Y = r1y.length ? mean(r1y) : 0;
  const M = 0.5 * R7 + 0.3 * R1M + 0.2 * R1Y;
  const momentum = clamp(50 + 2.0 * M, 0, 100);

  // Hot/Cold
  const hotCold: HotCold =
    health >= 60 && momentum >= 60 ? "HOT" : health <= 40 && momentum <= 40 ? "COLD" : "NEUTRAL";

  // Leaders (현재 period 기준 |수익률| 상위 2개)
  const leaders = assets
    .filter((x) => typeof x.rP === "number" && isFinite(x.rP))
    .sort((a, b) => Math.abs(b.rP as number) - Math.abs(a.rP as number))
    .slice(0, 2)
    .map((x) => x.name);

  const tone =
    hotCold === "HOT"
      ? "동행 상승이 강하고 모멘텀이 유지됩니다."
      : hotCold === "COLD"
      ? "전반 약세이며 모멘텀이 둔화/하락 중입니다."
      : "혼조 국면입니다(상승·하락 종목이 섞여 있음).";

  const biasText = biasWarning ? "다만 소수 종목 편중(쏠림) 주의." : "구성 종목 기여가 비교적 고릅니다.";

  const volText =
    volLevel === "RED" || tailRatio >= 0.3
      ? "변동성 경고(±15% 급등락 비중 ↑)."
      : volLevel === "YELLOW" || tailRatio >= 0.15
      ? "변동성 주의 구간."
      : "변동성은 비교적 안정적.";

  const leaderText = leaders.length ? `주도: ${leaders.join("·")}` : "";

  const summaryLine = [tone, biasText, volText, leaderText].filter(Boolean).join(" ").trim();

  return {
    ok: true,
    health,
    momentum,
    diversification,
    volLevel,
    hotCold,
    tailRatio,
    breadthPct,
    avgPct,
    gap,
    biasWarning,
    leaders,
    summaryLine,
  };
}

function Badge({ label, tone }: { label: string; tone: "good" | "warn" | "bad" | "neutral" }) {
  const cls =
    tone === "good"
      ? "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"
      : tone === "bad"
      ? "border-rose-400/20 bg-rose-400/10 text-rose-200"
      : tone === "warn"
      ? "border-amber-300/20 bg-amber-300/10 text-amber-100"
      : "border-white/10 bg-black/20 text-white/75";

  return (
    <span className={["inline-flex items-center rounded-full border px-2 py-1 text-[11px]", cls].join(" ")}>
      {label}
    </span>
  );
}

function PreviewCard({ item, preview }: { item: ResearchLinkT; preview: LinkPreviewT | null }) {
  const href = preview?.finalUrl || item.url;

  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="block rounded-xl border border-white/10 bg-black/25 p-3 transition hover:border-white/20 hover:bg-black/35"
    >
      <div className="flex gap-3">
        <div className="h-[68px] w-[108px] shrink-0 overflow-hidden rounded-lg border border-white/10 bg-black/40">
          {preview?.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={preview.image} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-[10px] text-white/30">no image</div>
          )}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {preview?.favicon ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.favicon} alt="" className="h-4 w-4 rounded-sm" loading="lazy" />
            ) : null}
            <div className="truncate text-[11px] text-white/50">
              {preview?.siteName || item.source || "link"}
              {item.publishedAt ? ` · ${fmtDate(item.publishedAt)}` : ""}
            </div>
          </div>

          <div className="mt-1 line-clamp-2 text-[13px] font-semibold text-white/90">
            {preview?.title || item.title || href}
          </div>
          <div className="mt-1 line-clamp-2 text-[11px] text-white/55">{preview?.description || item.oneLine || ""}</div>
        </div>
      </div>
    </a>
  );
}

function RowItem({
  rank,
  name,
  id,
  value,
}: {
  rank: number;
  name: string;
  id: string;
  value: number | undefined;
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-black/15 px-3 py-2">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[11px] text-white/45">#{rank}</span>
          <div className="truncate text-[12px] font-semibold text-white/90">{name}</div>
        </div>
        <div className="mt-0.5 text-[11px] text-white/40">{id}</div>
      </div>
      <div className="shrink-0 text-[12px] font-semibold text-white">{fmtPct(value)}</div>
    </div>
  );
}

export default function GraphRightPanel({
  themeName,
  currentThemeId,
  selectedNode,
  nodes = [],
  compareNodes,
  researchLinks = [],
  period,
  onChangePeriod,
  themeReturn, // 호환 유지용(현재 UI에서는 미사용)
  compareOptions = [], // 호환 유지용(미사용)
  compareThemeId, // 호환 유지용(미사용)
  onChangeCompareThemeId, // 호환 유지용(미사용)
  compareThemeName, // 호환 유지용(미사용)
  compareThemeReturn, // 호환 유지용(미사용)
}: Props) {
  const [openMovers, setOpenMovers] = useState(false);
  const [openLinks, setOpenLinks] = useState(false);

  const [previewMap, setPreviewMap] = useState<Record<string, LinkPreviewT>>({});

  const uniqueLinks = useMemo(() => {
    const m = new Map<string, ResearchLinkT>();
    for (const it of researchLinks) {
      if (!it?.url) continue;
      if (!m.has(it.url)) m.set(it.url, it);
    }
    return Array.from(m.values());
  }, [researchLinks]);

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const base = openLinks ? uniqueLinks : uniqueLinks.slice(0, 2);
      const toFetch = base.map((x) => x.url).filter((u) => u && !previewMap[u]);
      if (!toFetch.length) return;

      const chunk = async (urls: string[]) => {
        const results = await Promise.all(
          urls.map(async (url) => {
            try {
              const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`, { cache: "no-store" });
              const json = (await res.json()) as LinkPreviewT;
              return [url, json] as const;
            } catch (e: any) {
              return [url, { url, error: e?.message ?? "fetch error" }] as const;
            }
          })
        );
        return results;
      };

      const all: Array<readonly [string, LinkPreviewT]> = [];
      for (let i = 0; i < toFetch.length; i += 6) {
        const part = await chunk(toFetch.slice(i, i + 6));
        all.push(...part);
      }

      if (cancelled) return;

      setPreviewMap((prev) => {
        const next = { ...prev };
        for (const [url, data] of all) next[url] = data;
        return next;
      });
    }

    run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueLinks, openLinks]);

  const forwardPER = selectedNode?.metrics?.perFwd12m ?? undefined;

  const selectedAssetReturn = useMemo(() => {
    return getAssetReturnByPeriod(selectedNode, period);
  }, [selectedNode, period]);

  // ✅ Barometer 계산
  const barometer = useMemo(() => {
    return computeBarometer(Array.isArray(nodes) ? nodes : [], period);
  }, [nodes, period]);

  // ✅ Top Movers (현재 period 기준)
  const movers = useMemo(() => {
    const assets = (Array.isArray(nodes) ? nodes : [])
      .filter((n) => normType(n.type) === "ASSET")
      .map((n) => {
        const ret = getReturnByPeriodFromMetrics(n.metrics ?? {}, period);
        return { id: n.id, name: n.name ?? n.id, ret };
      })
      .filter((x) => typeof x.ret === "number" && Number.isFinite(x.ret));

    const sortedDesc = [...assets].sort((a, b) => (b.ret ?? -999999) - (a.ret ?? -999999));
    const top = sortedDesc.slice(0, 3);

    const sortedAsc = [...assets].sort((a, b) => (a.ret ?? 999999) - (b.ret ?? 999999));
    const bottom = sortedAsc.slice(0, 3);

    return { count: assets.length, top, bottom };
  }, [nodes, period]);

  const linksToShow = openLinks ? uniqueLinks : uniqueLinks.slice(0, 2);

  return (
    <aside className="h-full w-full rounded-2xl border border-white/10 bg-black/25 p-4">
      {/* ✅ Sticky Barometer (Top Right) */}
      <div className="sticky top-0 z-30">
        <div className="rounded-2xl border border-white/10 bg-black/30 p-4 backdrop-blur">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[11px] tracking-wider text-white/45">THEME BAROMETER</div>
              <div className="mt-1 truncate text-[13px] font-semibold text-white/90">
                {themeName} <span className="text-white/50">({currentThemeId})</span>
              </div>
              <div className="mt-2 text-[12px] text-white/75">{barometer.summaryLine}</div>
            </div>

            <div className="shrink-0 flex flex-col items-end gap-1">
              <Badge
                label={barometer.hotCold === "HOT" ? "HOT 🔥" : barometer.hotCold === "COLD" ? "COLD ❄" : "NEUTRAL"}
                tone={barometer.hotCold === "HOT" ? "good" : barometer.hotCold === "COLD" ? "bad" : "neutral"}
              />
              <Badge
                label={
                  barometer.volLevel === "GREEN"
                    ? "VOL GREEN"
                    : barometer.volLevel === "YELLOW"
                    ? "VOL YELLOW"
                    : "VOL RED"
                }
                tone={barometer.volLevel === "GREEN" ? "good" : barometer.volLevel === "YELLOW" ? "warn" : "bad"}
              />
            </div>
          </div>

          <div className="mt-3 grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] tracking-wider text-white/45">HEALTH</div>
              <div className="mt-1 text-[18px] font-extrabold text-white">{Math.round(barometer.health)}</div>
              <div className="mt-1 text-[11px] text-white/55">
                Avg {fmtPct(barometer.avgPct)} · Breadth {barometer.breadthPct.toFixed(0)}%
              </div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] tracking-wider text-white/45">MOMENTUM</div>
              <div className="mt-1 text-[18px] font-extrabold text-white">{Math.round(barometer.momentum)}</div>
              <div className="mt-1 text-[11px] text-white/55">기본: 7D/1M/1Y 혼합</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[10px] tracking-wider text-white/45">DIVERSIFICATION</div>
                {barometer.biasWarning ? (
                  <span className="text-[10px] text-amber-200/90">쏠림 있음</span>
                ) : (
                  <span className="text-[10px] text-white/35">양호</span>
                )}
              </div>
              <div className="mt-1 text-[18px] font-extrabold text-white">{Math.round(barometer.diversification)}</div>
              <div className="mt-1 text-[11px] text-white/55">편중 경고는 45 미만</div>
            </div>

            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="text-[10px] tracking-wider text-white/45">TAIL (±15%)</div>
              <div className="mt-1 text-[18px] font-extrabold text-white">{(barometer.tailRatio * 100).toFixed(0)}%</div>
              <div className="mt-1 text-[11px] text-white/55">Gap {barometer.gap.toFixed(1)}pt</div>
            </div>
          </div>
        </div>
      </div>

      {/* spacer under sticky */}
      <div className="h-3" />

      {/* Selected Node */}
      <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="text-[11px] tracking-wider text-white/45">SELECTED</div>

        <div className="mt-2 text-xl font-extrabold text-white">
          {selectedNode?.name ?? selectedNode?.id ?? "노드를 클릭하세요"}
        </div>

        <div className="mt-2 text-sm text-white/70">
          type: <span className="font-semibold text-white/80">{normType(selectedNode?.type)}</span>
        </div>

        {typeof forwardPER === "number" ? (
          <div className="mt-2 text-sm text-white/70">
            <span className="text-white/50">PER (12M Forward)</span> :{" "}
            <span className="font-semibold text-white">{fmtNum(forwardPER)}</span>
          </div>
        ) : null}

        {normType(selectedNode?.type) === "ASSET" ? (
          <div className="mt-2 text-sm text-white/70">
            <span className="text-white/50">{period} Return</span> :{" "}
            <span className="font-semibold text-white">{fmtPct(selectedAssetReturn)}</span>
          </div>
        ) : null}

        {selectedNode?.exposure ? (
          <div className="mt-3 space-y-1 text-[12px] text-white/65">
            {selectedNode.exposure.ticker ? (
              <div>
                <span className="text-white/45">Ticker</span> : {selectedNode.exposure.ticker}
              </div>
            ) : null}
            {selectedNode.exposure.exchange ? (
              <div>
                <span className="text-white/45">Exchange</span> : {selectedNode.exposure.exchange}
              </div>
            ) : null}
            {selectedNode.exposure.country ? (
              <div>
                <span className="text-white/45">Country</span> : {selectedNode.exposure.country}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      {/* Top Movers */}
      <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3">
          <div className="text-[11px] tracking-wider text-white/45">TOP MOVERS</div>
          <div className="flex items-center gap-2">
            <div className="text-[11px] text-white/45">
              {period} · ASSET {movers.count}
            </div>
            <button
              type="button"
              onClick={() => setOpenMovers((v) => !v)}
              className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/75 hover:bg-black/30"
              title="Top Movers 펼치기/접기"
            >
              {openMovers ? "접기" : "펼치기"}
            </button>
          </div>
        </div>

        {movers.count === 0 ? (
          <div className="mt-2 text-[12px] text-white/60">
            아직 {period} 수익률이 없습니다. (ASSET metrics에 ret7d/retYtd 등 값이 있어야 함)
          </div>
        ) : (
          <div className="mt-3">
            <div className="text-[11px] text-white/45">상승 TOP 3</div>
            <div className="mt-2 space-y-2">
              {movers.top.map((x, i) => (
                <RowItem key={x.id} rank={i + 1} name={x.name} id={x.id} value={x.ret} />
              ))}
            </div>

            {openMovers ? (
              <>
                <div className="mt-3 text-[11px] text-white/45">하락 TOP 3</div>
                <div className="mt-2 space-y-2">
                  {movers.bottom.map((x, i) => (
                    <RowItem key={x.id} rank={i + 1} name={x.name} id={x.id} value={x.ret} />
                  ))}
                </div>
              </>
            ) : null}
          </div>
        )}
      </div>

      {/* Research Links (✅ 유지) */}
      <div className="mt-4 flex items-center justify-between">
        <div className="text-base font-extrabold text-white">Research Links</div>
        <div className="flex items-center gap-2">
          <div className="text-[11px] text-white/45">Preview auto</div>
          {uniqueLinks.length > 2 ? (
            <button
              type="button"
              onClick={() => setOpenLinks((v) => !v)}
              className="rounded-lg border border-white/10 bg-black/20 px-2 py-1 text-[11px] text-white/75 hover:bg-black/30"
              title="링크 더보기/접기"
            >
              {openLinks ? "접기" : `더보기 +${uniqueLinks.length - 2}`}
            </button>
          ) : null}
        </div>
      </div>

      {uniqueLinks.length === 0 ? (
        <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/55">
          아직 링크가 없습니다. (Perplexity Page URL + 한 줄 요약 + 날짜를 JSON에 넣으면 자동 표시됩니다.)
        </div>
      ) : (
        <div className="mt-3 space-y-3">
          {linksToShow.map((item) => (
            <PreviewCard key={item.url} item={item} preview={previewMap[item.url] ?? null} />
          ))}
        </div>
      )}

      <div className="mt-4 text-[11px] text-white/45">
        * PER 표시는 <b>12M Forward PER</b>만 사용합니다.
      </div>
    </aside>
  );
}
