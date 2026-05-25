"use client";

// src/app/asset/[assetId]/AssetClient.tsx
// 자산 중심 그래프 — public/data/asset/index.json 에서 entry fetch → 자산 + 연결 테마들 ForceGraph 시각화.

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import ForceGraphWrapper from "@/components/ForceGraphWrapper";
import SearchBar from "@/components/SearchBar";
import type { PeriodKey } from "@/lib/themeReturn";

type ThemeRel = { themeId: string; themeName: string; relation: string; score7d?: number | null };
type AssetRel = { assetId: string; name: string; relation: string; direction: "in" | "out"; themeId: string; themeName: string };
type BriefingInfo = {
  gFinanceUrl?: string | null;
  coreBiz?: string;
  ecosystem?: string;
  driver?: string;
  sourceTheme?: string;
};

type AssetEntry = {
  id: string;
  name: string;
  name_en?: string;
  ticker: string;
  exchange: string;
  country: string;
  asset_type: string;
  themes: ThemeRel[];
  relatedAssets: AssetRel[];
  info?: BriefingInfo;
};

const INDEX_URL_LOCAL = "/data/asset/index.json";
const INDEX_URL_REMOTE = "https://raw.githubusercontent.com/kang0302/moneytree-web/main/public/data/asset/index.json";

/** briefing 셀 — <br> 개행 + 들여쓰기 - 처리 */
function BriefingCell({ title, body }: { title: string; body?: string }) {
  if (!body) return null;
  const lines = body.split(/<br\s*\/?>/i).map((s) => s.trim()).filter(Boolean);
  return (
    <div>
      <div className="mb-0.5 text-[10px] font-semibold uppercase tracking-wider text-white/55">{title}</div>
      <ul className="ml-1 list-disc space-y-0.5 pl-3 text-[11.5px] leading-relaxed text-white/80">
        {lines.map((l, i) => (
          <li key={i}>{l.replace(/^[-·]\s*/, "")}</li>
        ))}
      </ul>
    </div>
  );
}

/** 7D EW 수익률 배지 — 양수=빨강, 음수=파랑, null=dash */
function ScoreBadge({ value }: { value?: number | null }) {
  if (value == null || !Number.isFinite(value)) {
    return <span className="shrink-0 text-[10px] text-white/35">—</span>;
  }
  const up = value >= 0;
  const cls = up ? "text-red-400" : "text-sky-400";
  const sign = up ? "+" : "";
  return (
    <span className={`shrink-0 font-mono text-[10.5px] font-semibold tabular-nums ${cls}`}>
      {sign}
      {value.toFixed(2)}%
    </span>
  );
}

export default function AssetClient({ assetId }: { assetId: string }) {
  const router = useRouter();
  const [data, setData] = useState<Record<string, AssetEntry> | null>(null);
  const [period, setPeriod] = useState<PeriodKey>("7D");
  const [showRelated, setShowRelated] = useState(false);
  const [showAllThemes, setShowAllThemes] = useState(false);
  const [colorByReturn, setColorByReturn] = useState(false);
  const THEME_LIMIT = 8;

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        let res = await fetch(INDEX_URL_LOCAL, { cache: "no-store" });
        if (!res.ok) res = await fetch(INDEX_URL_REMOTE, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = await res.json();
        if (!cancelled) setData(j);
      } catch (e) {
        console.error("asset index fetch failed", e);
        if (!cancelled) setData({});
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const entry: AssetEntry | null = useMemo(() => {
    if (!data) return null;
    return data[assetId] ?? null;
  }, [data, assetId]);

  // ForceGraph 입력용 nodes/edges 구성
  const { nodes, edges } = useMemo(() => {
    if (!entry) return { nodes: [], edges: [] };
    const nodes: any[] = [];
    const edges: any[] = [];

    // 1) 중심 자산 노드
    nodes.push({
      id: entry.id,
      type: "ASSET",
      name: entry.name,
      exposure: {
        ticker: entry.ticker,
        exchange: entry.exchange,
        country: entry.country,
      },
    });

    // 2) 테마 노드 + 자산→테마 엣지 (default: 첫 THEME_LIMIT 개만, 토글 시 전체)
    const themesToRender = showAllThemes ? entry.themes : entry.themes.slice(0, THEME_LIMIT);
    for (const t of themesToRender) {
      nodes.push({ id: t.themeId, type: "THEME", name: t.themeName });
      edges.push({ from: entry.id, to: t.themeId, type: t.relation });
    }

    // 3) (옵션) 관련 자산 노드 + 자산간 엣지
    if (showRelated) {
      const seenAssets = new Set<string>([entry.id]);
      for (const r of entry.relatedAssets) {
        if (!seenAssets.has(r.assetId)) {
          nodes.push({ id: r.assetId, type: "ASSET", name: r.name });
          seenAssets.add(r.assetId);
        }
        const from = r.direction === "out" ? entry.id : r.assetId;
        const to = r.direction === "out" ? r.assetId : entry.id;
        edges.push({ from, to, type: r.relation });
      }
    }

    return { nodes, edges };
  }, [entry, showRelated, showAllThemes]);

  // grouped themes by relation type (사이드 패널용)
  const themesByRel = useMemo(() => {
    if (!entry) return {} as Record<string, ThemeRel[]>;
    const m: Record<string, ThemeRel[]> = {};
    for (const t of entry.themes) {
      (m[t.relation] ??= []).push(t);
    }
    return m;
  }, [entry]);

  if (!data) {
    return <div className="p-6 text-white/70">자산 인덱스 로딩 중…</div>;
  }
  if (!entry) {
    return (
      <div className="p-6 text-white/70">
        자산을 찾을 수 없습니다: <span className="font-mono">{assetId}</span>
        <div className="mt-4">
          <Link href="/" className="text-cyan-400 underline">
            홈으로
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-7xl px-4 py-4">
        {/* 헤더 */}
        <div className="mb-3 flex flex-wrap items-center gap-3">
          <Link href="/" className="text-[12px] text-white/55 hover:text-white">
            ← Home
          </Link>
          <div className="flex-1 min-w-[200px]">
            <SearchBar
              indexUrl="/data/search/search_index.json"
              onGoTheme={(tid) => router.push(`/graph/${tid}`)}
              onGoThemeFocus={(tid, fid) => router.push(`/graph/${tid}?focus=${encodeURIComponent(fid)}`)}
              onGoAsset={(aid) => router.push(`/asset/${aid}`)}
            />
          </div>
          <Link href="/themes" className="text-[12px] text-white/55 hover:text-white">
            Full Theme Map ↗
          </Link>
        </div>

        {/* 자산 정보 */}
        <div className="mb-3 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur">
          <div className="text-[11px] uppercase tracking-wider text-white/45">ASSET</div>
          <div className="mt-1 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <div className="text-[20px] font-bold">{entry.name}</div>
            <div className="text-[13px] text-white/55">
              {entry.id}
              {entry.ticker ? ` · ${entry.ticker}` : ""}
              {entry.exchange ? ` · ${entry.exchange}` : ""}
              {entry.country ? ` (${entry.country})` : ""}
              {entry.asset_type ? ` · ${entry.asset_type}` : ""}
            </div>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3 text-[12px] text-white/65">
            <span>
              연결 테마: <span className="font-semibold text-white">{entry.themes.length}</span>
            </span>
            <span>
              관련 자산: <span className="font-semibold text-white">{entry.relatedAssets.length}</span>
            </span>
            <div className="ml-auto flex flex-wrap items-center gap-3">
              {entry.themes.length > THEME_LIMIT ? (
                <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-white/65">
                  <input
                    type="checkbox"
                    checked={showAllThemes}
                    onChange={(e) => setShowAllThemes(e.target.checked)}
                    className="cursor-pointer"
                  />
                  전체 테마 보기 ({entry.themes.length})
                </label>
              ) : null}
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-white/65">
                <input
                  type="checkbox"
                  checked={showRelated}
                  onChange={(e) => setShowRelated(e.target.checked)}
                  className="cursor-pointer"
                />
                관련 자산 함께 보기 (2궤도)
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-[12px] text-white/65">
                <input
                  type="checkbox"
                  checked={colorByReturn}
                  onChange={(e) => setColorByReturn(e.target.checked)}
                  className="cursor-pointer"
                />
                자산 수익률 색 표시
              </label>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[260px_1fr_300px]">
          {/* 좌측 — 회사 정보 (briefing 기반) */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur">
            <div className="mb-2 flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-wider text-white/45">회사 정보</div>
              {entry.info?.gFinanceUrl ? (
                <a
                  href={entry.info.gFinanceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[11px] text-cyan-400 hover:underline"
                  title="Google Finance"
                >
                  Google Finance ↗
                </a>
              ) : null}
            </div>
            {entry.info ? (
              <div className="flex flex-col gap-3 text-[12px] text-white/85">
                <BriefingCell title="핵심 사업" body={entry.info.coreBiz} />
                <BriefingCell title="사업 생태계" body={entry.info.ecosystem} />
                <BriefingCell title="주가 핵심 동인" body={entry.info.driver} />
                {entry.info.sourceTheme ? (
                  <div className="mt-1 text-[10px] text-white/35">
                    출처: {entry.info.sourceTheme} briefing
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="text-[12px] text-white/55">briefing 정보 미연결.</div>
            )}
          </div>

          {/* 그래프 */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-2" style={{ minHeight: 560 }}>
            <ForceGraphWrapper
              themeId={entry.id}
              themeName={entry.name}
              nodes={nodes as any}
              edges={edges as any}
              period={period}
              onChangePeriod={setPeriod}
              onSelectNode={(n) => {
                if (!n) return;
                if (n.type === "THEME") router.push(`/graph/${n.id}`);
                else if (n.type === "ASSET" && n.id !== entry.id) router.push(`/asset/${n.id}`);
              }}
              showPeriodButtons={false}
              showOverlayControls={false}
              themeDescription={`${entry.name} 가 속한 테마 ${entry.themes.length}개 · 관련 자산 ${entry.relatedAssets.length}개`}
              assetColorMode={colorByReturn ? "return" : "type"}
            />
          </div>

          {/* 우측 — 관계별 테마 + 점수 */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">테마 (관계별 · 7D EW)</div>
            {entry.themes.length === 0 ? (
              <div className="text-[12px] text-white/55">아직 어떤 테마에도 속하지 않습니다.</div>
            ) : (
              Object.entries(themesByRel).map(([rel, list]) => (
                <div key={rel} className="mb-3 last:mb-0">
                  <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-cyan-400/80">
                    {rel} · {list.length}
                  </div>
                  <div className="flex flex-col gap-1">
                    {list.map((t) => (
                      <Link
                        key={t.themeId + rel}
                        href={`/graph/${t.themeId}`}
                        className="flex items-center justify-between gap-2 rounded-md px-2 py-1.5 text-[12px] text-white/85 hover:bg-white/10 hover:text-white"
                        title={t.themeName}
                      >
                        <span className="min-w-0 flex-1 truncate">
                          <span className="mr-1.5 font-mono text-[10px] text-white/45">{t.themeId}</span>
                          {t.themeName}
                        </span>
                        <ScoreBadge value={t.score7d} />
                      </Link>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
