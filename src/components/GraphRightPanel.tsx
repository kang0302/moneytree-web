// src/components/GraphRightPanel.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import type { PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";
import { tempByScore as tempByScoreFn } from "@/lib/themeReturn";

type NodeT = {
  id: string;
  name?: string;
  type?: string;
  metrics?: {
    per?: number;
    pe?: number;
    pe_ttm?: number;
    valuationAsOf?: string;
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
};

type Props = {
  themeId: string;
  themeName: string;
  selectedNode?: NodeT | null;
  period?: PeriodKey;

  themeReturnSummary?: ThemeReturnSummary | null;
  researchLinks?: ResearchLinkT[];
};

function pickNum(v: any): number | null {
  if (typeof v !== "number") return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function fmtPct(v: number | null | undefined, digits = 2): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(digits)}%`;
}

function fmtInt(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toLocaleString();
}

function fmtMarketCapKRW(mcap: number | null | undefined): string {
  if (mcap === null || mcap === undefined) return "—";
  if (!Number.isFinite(mcap)) return "—";
  const n = mcap;
  const trillion = 1_000_000_000_000;
  const hundredMillion = 100_000_000;

  if (n >= trillion) return `${(n / trillion).toFixed(2)}조`;
  if (n >= hundredMillion) return `${(n / hundredMillion).toFixed(0)}억`;
  return n.toLocaleString();
}

function normalizePct(v?: number | null): number | null {
  if (v === undefined || v === null) return null;
  if (!Number.isFinite(v)) return null;
  return v;
}

function getTrailingPER(metrics?: Record<string, any>): number | null {
  if (!metrics) return null;
  const m = metrics as Record<string, any>;
  return pickNum(m.per) ?? pickNum(m.pe) ?? pickNum(m.pe_ttm) ?? null;
}

function getClose(metrics?: Record<string, any>): number | null {
  if (!metrics) return null;
  const m = metrics as Record<string, any>;
  return pickNum(m.close) ?? pickNum(m.last_price) ?? pickNum(m.lastPrice) ?? null;
}

function getMarketCap(metrics?: Record<string, any>): number | null {
  if (!metrics) return null;
  const m = metrics as Record<string, any>;
  return pickNum(m.marketCap) ?? pickNum(m.market_cap) ?? pickNum(m.mktCap) ?? null;
}

function getReturnByPeriodFromMetrics(metrics?: Record<string, any>, period?: PeriodKey): number | null {
  if (!metrics || !period) return null;
  const m = metrics as Record<string, any>;

  let v: number | null = null;
  switch (period) {
    case "3D":
      v =
        pickNum(m.ret3d) ??
        pickNum(m.ret_3d) ??
        pickNum(m.return3d) ??
        pickNum(m.return_3d) ??
        pickNum(m.return_3D);
      break;
    case "7D":
      v =
        pickNum(m.ret7d) ??
        pickNum(m.ret_7d) ??
        pickNum(m.return7d) ??
        pickNum(m.return_7d) ??
        pickNum(m.return_7D);
      break;
    case "1M":
      v =
        pickNum(m.ret1m) ??
        pickNum(m.ret_1m) ??
        pickNum(m.ret30d) ??
        pickNum(m.ret_30d) ??
        pickNum(m.return1m) ??
        pickNum(m.return_1m) ??
        pickNum(m.return30d) ??
        pickNum(m.return_30d) ??
        pickNum(m.return_30D);
      break;
    case "YTD":
      v =
        pickNum(m.retYtd) ??
        pickNum(m.ret_ytd) ??
        pickNum(m.returnYtd) ??
        pickNum(m.return_ytd) ??
        pickNum(m.return_YTD);
      break;
    case "1Y":
      v =
        pickNum(m.ret1y) ??
        pickNum(m.ret_1y) ??
        pickNum(m.return1y) ??
        pickNum(m.return_1y) ??
        pickNum(m.return_1Y);
      break;
    case "3Y":
      v =
        pickNum(m.ret3y) ??
        pickNum(m.ret_3y) ??
        pickNum(m.return3y) ??
        pickNum(m.return_3y) ??
        pickNum(m.return_3Y);
      break;
    default:
      v = null;
  }

  return normalizePct(v);
}

function uniqByUrl(items: ResearchLinkT[]): ResearchLinkT[] {
  const seen = new Set<string>();
  const out: ResearchLinkT[] = [];
  for (const it of items) {
    const u = (it.url ?? "").trim();
    if (!u) continue;
    if (seen.has(u)) continue;
    seen.add(u);
    out.push({ ...it, url: u });
  }
  return out;
}

function PreviewCard({ item, preview }: { item: ResearchLinkT; preview: LinkPreviewT | null }) {
  const title = item.title ?? preview?.title ?? item.url;
  const desc = item.oneLine ?? preview?.description ?? "";
  const meta = [item.source, item.publishedAt].filter(Boolean).join(" · ");

  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="block rounded-2xl border border-white/10 bg-black/20 p-3 hover:bg-black/30"
      title={item.url}
    >
      <div className="flex gap-3">
        {preview?.image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview.image} alt="" className="h-14 w-14 flex-none rounded-xl object-cover" />
        ) : (
          <div className="h-14 w-14 flex-none rounded-xl border border-white/10 bg-white/5" />
        )}

        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold text-white">{title}</div>
          {meta ? <div className="mt-0.5 truncate text-[11px] text-white/55">{meta}</div> : null}
          {desc ? <div className="mt-2 line-clamp-2 text-[12px] text-white/70">{desc}</div> : null}
        </div>
      </div>
    </a>
  );
}

function fmtScore(v: number | null | undefined): string {
  if (v === null || v === undefined) return "—";
  if (!Number.isFinite(v)) return "—";
  return Math.round(v).toString();
}

/** Google Finance URL */
function googleFinanceSymbol(ticker?: string, exchange?: string): string | null {
  const t = (ticker ?? "").trim();
  if (!t) return null;
  if (t.includes(":")) return t;

  const ex = (exchange ?? "").trim().toUpperCase();
  if (!ex) return null;

  if (ex === "KOSDAQ") return `${t}:KOSDAQ`;
  if (ex === "KOSPI") return `${t}:KRX`;
  if (ex === "KRX") return `${t}:KRX`;

  if (ex === "NASDAQ") return `${t}:NASDAQ`;
  if (ex === "NYSE") return `${t}:NYSE`;
  if (ex === "AMEX") return `${t}:AMEX`;

  return null;
}

function googleFinanceUrl(ticker?: string, exchange?: string): string | null {
  const sym = googleFinanceSymbol(ticker, exchange);
  if (sym) return `https://www.google.com/finance/quote/${encodeURIComponent(sym)}`;

  const t = (ticker ?? "").trim();
  if (!t) return null;
  return `https://www.google.com/finance/search?q=${encodeURIComponent(t)}`;
}

function TempBadge({ score }: { score: number }) {
  const t = tempByScoreFn(score);
  return (
    <div className="flex items-center gap-2">
      <div
        className="h-9 w-9 rounded-md flex items-center justify-center text-[11px] font-extrabold text-white"
        style={{ backgroundColor: t.color }}
        title={t.name}
      >
        {t.name}
      </div>
      <div className="text-white font-extrabold text-2xl leading-none">{Math.round(score)}</div>
    </div>
  );
}

export default function GraphRightPanel({
  themeId,
  themeName,
  selectedNode,
  period = "7D",
  themeReturnSummary,
  researchLinks = [],
}: Props) {
  const [previewMap, setPreviewMap] = useState<Record<string, LinkPreviewT | null>>({});
  const [openLinks, setOpenLinks] = useState(false);

  const uniqueLinks = useMemo(() => uniqByUrl(researchLinks), [researchLinks]);
  const linksToShow = useMemo(() => (openLinks ? uniqueLinks : uniqueLinks.slice(0, 2)), [uniqueLinks, openLinks]);

  useEffect(() => {
    let alive = true;

    async function run() {
      const need = uniqueLinks.filter((x) => !(x.url in previewMap));
      if (need.length === 0) return;

      for (const it of need.slice(0, 6)) {
        try {
          const res = await fetch(`/api/link-preview?url=${encodeURIComponent(it.url)}`, { cache: "no-store" });
          const data = res.ok ? ((await res.json()) as LinkPreviewT) : null;
          if (!alive) return;
          setPreviewMap((prev) => ({ ...prev, [it.url]: data }));
        } catch {
          if (!alive) return;
          setPreviewMap((prev) => ({ ...prev, [it.url]: null }));
        }
      }
    }

    run();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uniqueLinks]);

  const nodeType = (selectedNode?.type ?? "").toUpperCase();

  const perTtm = getTrailingPER(selectedNode?.metrics);
  const close = getClose(selectedNode?.metrics);
  const mcap = getMarketCap(selectedNode?.metrics);

  const ret = nodeType === "ASSET" ? getReturnByPeriodFromMetrics(selectedNode?.metrics, period) : null;

  const ticker = selectedNode?.exposure?.ticker;
  const exchange = selectedNode?.exposure?.exchange;
  const country = selectedNode?.exposure?.country;

  const gfUrl = googleFinanceUrl(ticker, exchange);

  const themeSummary = themeReturnSummary;
  const ok = !!themeSummary && (themeSummary as any).ok === true;

  const healthScore = ok ? ((themeSummary as any).healthScore as number) : null;
  const momentumScore = ok ? ((themeSummary as any).momentumScore as number) : null;
  const divScore = ok ? ((themeSummary as any).divScore as number) : null;
  const tailPct = ok ? ((themeSummary as any).tailPct as number) : null;
  const gapPct = ok ? ((themeSummary as any).gapPct as number) : null;

  const avgReturn = ok ? ((themeSummary as any).avgReturn as number) : null;
  const breadthPct = ok ? ((themeSummary as any).breadthPct as number) : null;

  const overallScore = ok ? ((themeSummary as any).overallScore as number) : null;

  const assetCount = ok ? ((themeSummary as any).assetCount as number) : ((themeSummary as any)?.assetCount ?? 0);

  return (
    <aside className="h-full w-full overflow-auto rounded-2xl border border-white/10 bg-black/30 p-4">
      {/* Title + Overall Badge */}
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs text-white/55">THEME BAROMETER</div>
          <div className="mt-1 text-base font-extrabold text-white truncate">
            {themeName} <span className="text-white/50">({themeId})</span>
          </div>
        </div>

        {typeof overallScore === "number" && Number.isFinite(overallScore) ? <TempBadge score={overallScore} /> : null}
      </div>

      {/* Summary */}
      <div className="mt-2 text-[12px] text-white/60">
        {(themeSummary as any)?.note ?? (ok ? "테마 상태 요약이 준비되어 있습니다." : "아직 테마 수익률/지표 데이터가 없습니다.")}
      </div>

      {/* KPI */}
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">HEALTH</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtScore(healthScore)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">
            Avg {fmtPct(avgReturn, 2)} · Breadth {fmtPct(breadthPct, 0)}
          </div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">MOMENTUM</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtScore(momentumScore)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">기본: 7D/1M/1Y 혼합</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">DIVERSIFICATION</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtScore(divScore)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">편중 경고는 45 미만</div>
        </div>

        <div className="rounded-2xl border border-white/10 bg-black/20 px-3 py-2">
          <div className="flex items-baseline justify-between gap-2">
            <div className="text-[11px] font-semibold tracking-wide text-white/55">TAIL (±15%)</div>
            <div className="text-[20px] font-black leading-none text-white">{fmtPct(tailPct, 0)}</div>
          </div>
          <div className="mt-1 truncate text-[11px] text-white/60">Gap {fmtPct(gapPct, 1)}</div>
        </div>
      </div>

      {/* SELECTED (컴팩트: mt-3 / p-3 / gap-3) */}
      <div className="mt-3 text-xs text-white/55">SELECTED</div>

      {!selectedNode ? (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="text-lg font-extrabold text-white">노드를 클릭하세요</div>
          <div className="mt-1 text-sm text-white/55">type: -</div>
        </div>
      ) : (
        <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3">
          <div className="flex items-start justify-between gap-3">
            {/* LEFT */}
            <div className="min-w-0 flex-1">
              <div className="truncate text-lg font-extrabold text-white">{selectedNode.name ?? selectedNode.id}</div>
              <div className="mt-1 text-sm text-white/60">type: {nodeType || "-"}</div>

              {nodeType === "ASSET" ? (
                <div className="mt-3 space-y-1 text-sm text-white/80">
                  <div>
                    <span className="text-white/55">{period} Return :</span>{" "}
                    <span className="font-bold text-white">{fmtPct(ret, 2)}</span>
                  </div>
                  <div>
                    <span className="text-white/55">Ticker :</span>{" "}
                    <span className="font-semibold text-white">{ticker ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-white/55">Exchange :</span>{" "}
                    <span className="text-white/80">{exchange ?? "—"}</span>
                  </div>
                  <div>
                    <span className="text-white/55">Country :</span>{" "}
                    <span className="text-white/80">{country ?? "—"}</span>
                  </div>
                </div>
              ) : (
                <div className="mt-3 text-sm text-white/70">선택된 노드는 ASSET이 아닙니다.</div>
              )}
            </div>

            {/* RIGHT compact box (컴팩트: mt-2) */}
            <div className="w-[260px] shrink-0 rounded-2xl border border-white/10 bg-black/20 p-3">
              <div className="text-[11px] leading-snug text-white/70 break-all">
                {gfUrl ? (
                  <a
                    href={gfUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="underline underline-offset-2 hover:text-white"
                    title="Google Finance"
                  >
                    {gfUrl}
                  </a>
                ) : (
                  <span className="text-white/40">Google Finance</span>
                )}
              </div>

              <div className="mt-2 grid grid-cols-2 gap-3 text-sm">
                <div>
                  <div className="text-[11px] text-white/45">MKT CAP</div>
                  <div className="text-sm font-bold text-white">{fmtMarketCapKRW(mcap)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/45">Close</div>
                  <div className="text-sm font-bold text-white">{fmtInt(close)}</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/45">VAL DATE</div>
                  <div className="text-sm font-bold text-white">{selectedNode?.metrics?.valuationAsOf ?? "—"}</div>
                </div>
                <div>
                  <div className="text-[11px] text-white/45">PER (Trailing)</div>
                  <div className="text-sm font-bold text-white">{perTtm === null ? "—" : perTtm.toFixed(2)}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOP MOVERS (컴팩트: mt-3 / p-3) */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-xs text-white/55">TOP MOVERS</div>
        <div className="text-xs text-white/55">
          {period} · ASSET {assetCount ?? 0}
        </div>
      </div>

      <div className="mt-2 rounded-2xl border border-white/10 bg-black/20 p-3 text-sm text-white/55">
        {(themeSummary as any)?.topMovers && (themeSummary as any).topMovers.length > 0 ? (
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
            {(themeSummary as any).topMovers.slice(0, 8).map((m: any) => (
              <div key={m.id} className="flex items-center justify-between gap-3">
                <div className="min-w-0 truncate">{m.name ?? m.id}</div>
                <div className="flex-none font-semibold text-white">{fmtPct(m.ret ?? null, 2)}</div>
              </div>
            ))}
          </div>
        ) : (
          <div>아직 {period} 수익률이 없습니다.</div>
        )}
      </div>

      {/* Research Links (컴팩트: mt-3 / mt-2) */}
      <div className="mt-3 flex items-center justify-between">
        <div className="text-base font-extrabold text-white">Research Links</div>
        <div className="flex items-center gap-2">
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
        <div className="mt-2 rounded-xl border border-white/10 bg-black/20 p-3 text-sm text-white/55">아직 링크가 없습니다.</div>
      ) : (
        <div className="mt-2 space-y-2">
          {linksToShow.map((item) => (
            <PreviewCard key={item.url} item={item} preview={previewMap[item.url] ?? null} />
          ))}
        </div>
      )}

      <div className="mt-3 text-[11px] text-white/45">
        * PER 표시는 <b>Trailing PER</b>만 사용합니다.
      </div>
    </aside>
  );
}