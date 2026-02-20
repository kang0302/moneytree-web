// src/app/graph/[themeId]/GraphClient.tsx
// UI COMPACT v1 - 2026-02-16
// - Header: THEME 고정 / Period toggle / Move to theme dropdown / Full theme map / Main home (small, far right)
// - Reduce margins, maximize graph area (flex layout, no 100vh calc)
// - Preserve existing compare logic, resolver logic, right panel props
//
// ✅ 2026-02-17 (Search v3)
// - Add SearchBar (ASSET/THEME/BF/MACRO) in header
// - Use GitHub raw search index: RAW_BASE + /data/search/search_index.json

"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ForceGraphWrapper from "@/components/ForceGraphWrapper";
import GraphRightPanel, { ResearchLinkT, CompareThemeOptionT } from "@/components/GraphRightPanel";

// ✅ Search
import SearchBar from "@/components/SearchBar";

import { computeThemeReturnSummary, PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";
import { getThemeJsonUrl } from "@/lib/getThemeJsonUrl";
import { fetchThemeIndex } from "@/lib/themeIndex";

type NodeT = {
  id: string;
  name: string;
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

  asset_name_ko?: string;
  asset_name_en?: string;
  business_field_ko?: string;
  business_field_en?: string;

  [k: string]: any;
};

type EdgeT = {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  type?: string;
  label?: string;
  relType?: string;
  relation?: string;
  [k: string]: any;
};

type ThemeJsonT = {
  schemaVersion?: string;
  themeId: string;
  themeName: string;
  meta?: any;
  nodes?: NodeT[];
  edges?: EdgeT[];
};

type RecentItem = { themeId: string; themeName: string; at: number };

const LS_RECENT = "mt_recent_themes_v1";

// ✅ Search index URL (GitHub raw)
const RAW_BASE = "https://raw.githubusercontent.com/kang0302/import_MT/main";
const SEARCH_INDEX_URL = `${RAW_BASE}/data/search/search_index.json`;

// ✅ Resolver master SSOT URLs
const ASSET_MASTER_URLS = [
  `${RAW_BASE}/data/ssot/asset_ssot.csv`,
  `${RAW_BASE}/data/master/asset.csv`,
];
const BF_MASTER_URLS = [
  `${RAW_BASE}/data/ssot/business_field_ssot.csv`,
  `${RAW_BASE}/data/master/business_field.csv`,
];

type AssetMasterItem = {
  ko?: string;
  en?: string;
  ticker?: string;
  exchange?: string;
  country?: string;
};

type BfMasterItem = {
  ko?: string;
  en?: string;
};

/* =========================
   ✅ Helpers
   ========================= */
function safeArray<T>(x: any): T[] {
  return Array.isArray(x) ? (x as T[]) : [];
}

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    const v = JSON.parse(s ?? "");
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function isThemeNode(n: NodeT, themeId: string) {
  return (n?.type ?? "").toUpperCase() === "THEME" || n?.id === themeId;
}

function isAsset(n: NodeT) {
  return (n?.type ?? "").toUpperCase() === "ASSET" || /^A_\d+$/i.test(n?.id ?? "");
}

function isBusinessField(n: NodeT) {
  const t = (n?.type ?? "").toUpperCase();
  return t.includes("BUSINESS_FIELD") || t.includes("FIELD") || /^BF_\d+$/i.test(n?.id ?? "");
}

async function fetchFirstOk(urls: string[]) {
  for (const u of urls) {
    try {
      const res = await fetch(u, { cache: "no-store" });
      if (res.ok) return await res.text();
    } catch {}
  }
  return "";
}

function parseCsv(text: string) {
  const lines = (text ?? "").split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = lines[0].split(",").map((x) => x.trim());
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",");
    const obj: any = {};
    header.forEach((h, idx) => (obj[h] = (cols[idx] ?? "").trim()));
    rows.push(obj);
  }
  return rows;
}

export default function GraphClient({
  themeId,
  themeName,
  nodes,
  edges,
  researchLinks,
}: {
  themeId: string;
  themeName: string;
  nodes: NodeT[];
  edges: EdgeT[];
  researchLinks: ResearchLinkT[];
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const focusId = searchParams.get("focus");

  // ✅ period (header control)
  const [period, setPeriod] = useState<PeriodKey>("7D");

  // ✅ right panel selected node
  const [selectedNode, setSelectedNode] = useState<NodeT | null>(null);

  // ✅ compare
  const [compareOptions, setCompareOptions] = useState<CompareThemeOptionT[]>([]);
  const [compareThemeId, setCompareThemeId] = useState<string>("");
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string>("");
  const [compareData, setCompareData] = useState<{ themeId: string; themeName?: string; nodes: NodeT[] } | null>(
    null
  );

  // ✅ Resolver master maps (SSOT 기반)
  const [assetMap, setAssetMap] = useState<Record<string, AssetMasterItem>>({});
  const [bfMap, setBfMap] = useState<Record<string, BfMasterItem>>({});

  // ✅ Header controls
  const [lockTheme, setLockTheme] = useState<boolean>(false);
  const [moveThemeId, setMoveThemeId] = useState<string>("");

  const safeResearchLinks = useMemo(() => {
    const arr = safeArray<ResearchLinkT>(researchLinks);
    return arr
      .filter((x) => x?.url)
      .map((x) => ({
        url: x.url,
        title: x.title,
        publishedAt: x.publishedAt,
        source: x.source,
        oneLine: (x as any).oneLine,
      }));
  }, [researchLinks]);

  /* =========================
     ✅ 1) Resolver SSOT CSV load
     ========================= */
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const assetText = await fetchFirstOk(ASSET_MASTER_URLS);
      if (!cancelled && assetText) {
        const rows = parseCsv(assetText);
        const map: Record<string, AssetMasterItem> = {};
        for (const r of rows) {
          const id = (r["asset_id"] || r["id"] || r["assetId"] || "").trim();
          if (!id) continue;
          map[id] = {
            ko: (r["asset_name_ko"] || r["name_ko"] || r["ko"] || "").trim() || undefined,
            en: (r["asset_name_en"] || r["name_en"] || r["en"] || "").trim() || undefined,
            ticker: (r["ticker"] || r["symbol"] || "").trim() || undefined,
            exchange: (r["exchange"] || "").trim() || undefined,
            country: (r["country"] || "").trim() || undefined,
          };
        }
        setAssetMap(map);
      }

      const bfText = await fetchFirstOk(BF_MASTER_URLS);
      if (!cancelled && bfText) {
        const rows = parseCsv(bfText);
        const map: Record<string, BfMasterItem> = {};
        for (const r of rows) {
          const id = (r["bf_id"] || r["business_field_id"] || r["id"] || "").trim();
          if (!id) continue;
          map[id] = {
            ko: (r["business_field_ko"] || r["name_ko"] || r["ko"] || "").trim() || undefined,
            en: (r["business_field_en"] || r["name_en"] || r["en"] || "").trim() || undefined,
          };
        }
        setBfMap(map);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, []);

  /* =========================
     ✅ 2) Resolver 적용: 현재 테마 nodes
     ========================= */
  const resolvedNodes = useMemo(() => {
    const ns = safeArray<NodeT>(nodes);

    return ns.map((n) => {
      if (isThemeNode(n, themeId)) {
        return { ...n, name: themeName };
      }

      if (isAsset(n)) {
        const m = assetMap[n.id];
        if (!m) return n;
        const ko = m.ko;
        const en = m.en;

        return {
          ...n,
          asset_name_ko: ko ?? n.asset_name_ko,
          asset_name_en: en ?? n.asset_name_en,
          name: ko ?? n.name,
          exposure: {
            ...(n.exposure ?? {}),
            ticker: m.ticker ?? n.exposure?.ticker,
            exchange: m.exchange ?? n.exposure?.exchange,
            country: m.country ?? n.exposure?.country,
          },
        };
      }

      if (isBusinessField(n)) {
        const m = bfMap[n.id];
        const ko = m?.ko;
        const en = m?.en;

        const rawName = (n.name ?? "").trim();
        const looksLikeId = rawName === "" || rawName === n.id || /^BF_\d+$/i.test(rawName);

        const finalName = !looksLikeId ? rawName : ko ?? rawName ?? n.id;

        return {
          ...n,
          business_field_ko: n.business_field_ko ?? ko,
          business_field_en: n.business_field_en ?? en,
          name: finalName,
        };
      }

      return n;
    });
  }, [nodes, assetMap, bfMap, themeId, themeName]);

  /* =========================
     ✅ 3) Resolver 적용: 비교 테마 nodes
     ========================= */
  const resolvedCompareNodes = useMemo(() => {
    const cn = safeArray<NodeT>(compareData?.nodes);
    if (!cn.length) return cn;

    return cn.map((n) => {
      if (isAsset(n)) {
        const m = assetMap[n.id];
        if (!m) return n;
        const ko = m.ko;
        const en = m.en;

        return {
          ...n,
          asset_name_ko: ko ?? n.asset_name_ko,
          asset_name_en: en ?? n.asset_name_en,
          name: ko ?? n.name,
          exposure: {
            ...(n.exposure ?? {}),
            ticker: m.ticker ?? n.exposure?.ticker,
            exchange: m.exchange ?? n.exposure?.exchange,
            country: m.country ?? n.exposure?.country,
          },
        };
      }

      if (isBusinessField(n)) {
        const m = bfMap[n.id];
        const ko = m?.ko;
        const en = m?.en;

        const rawName = (n.name ?? "").trim();
        const looksLikeId = rawName === "" || rawName === n.id || /^BF_\d+$/i.test(rawName);
        const finalName = !looksLikeId ? rawName : ko ?? rawName ?? n.id;

        return {
          ...n,
          business_field_ko: n.business_field_ko ?? ko,
          business_field_en: n.business_field_en ?? en,
          name: finalName,
        };
      }

      return n;
    });
  }, [compareData?.nodes, assetMap, bfMap]);

  // ✅ Theme Return Summary
  const themeReturn = useMemo(() => {
    return computeThemeReturnSummary({
      nodes: safeArray<NodeT>(resolvedNodes),
      period,
      minAssets: 5,
    });
  }, [resolvedNodes, period]);

  // 페이지 진입 시
  useEffect(() => {
    fetch("/api/mark-theme-visualized?themeId=" + themeId);
  }, [themeId]);

  // ✅ 최근 본 테마 기록
  useEffect(() => {
    try {
      const now = Date.now();
      const prev = safeJsonParse<any>(localStorage.getItem(LS_RECENT), []);
      const arr: RecentItem[] = Array.isArray(prev) ? prev : [];

      const next: RecentItem[] = [{ themeId, themeName, at: now }, ...arr.filter((x) => x?.themeId && x.themeId !== themeId)].slice(
        0,
        12
      );

      localStorage.setItem(LS_RECENT, JSON.stringify(next));
    } catch {}
  }, [themeId, themeName]);

  // ✅ theme index fetch → compare dropdown options (+ Move to theme dropdown source)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const list = await fetchThemeIndex();
      if (cancelled) return;

      if (list && list.length) {
        setCompareOptions(
          list
            .filter((x) => x?.themeId && x?.themeName)
            .map((x) => ({ themeId: String(x.themeId).trim(), themeName: String(x.themeName).trim() }))
            .filter((x) => x.themeId && x.themeName)
        );
      } else {
        setCompareOptions([{ themeId, themeName }]);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [themeId, themeName]);

  // ✅ 비교 테마 JSON fetch (기존 유지)
  useEffect(() => {
    let cancelled = false;

    async function run() {
      const tid = (compareThemeId ?? "").trim();
      setCompareError("");

      if (!tid) {
        setCompareData(null);
        setCompareLoading(false);
        return;
      }

      if (tid === themeId) {
        setCompareData({ themeId: tid, themeName, nodes: safeArray<NodeT>(nodes) });
        setCompareLoading(false);
        return;
      }

      setCompareLoading(true);

      try {
        const url = getThemeJsonUrl(tid);
        const res = await fetch(url, { cache: "no-store" });
        if (!res.ok) throw new Error(`fetch failed (${res.status})`);

        const json = (await res.json()) as ThemeJsonT;
        const fetchedNodes = safeArray<NodeT>(json?.nodes);

        if (cancelled) return;

        setCompareData({
          themeId: tid,
          themeName: json?.themeName ?? tid,
          nodes: fetchedNodes,
        });
      } catch (e: any) {
        if (cancelled) return;
        setCompareData(null);
        setCompareError(e?.message ?? "compare fetch error");
      } finally {
        if (cancelled) return;
        setCompareLoading(false);
      }
    }

    run();
    return () => {
      cancelled = true;
    };
  }, [compareThemeId, themeId, themeName, nodes]);

  const compareThemeNameRaw = useMemo(() => {
    if (!compareThemeId) return undefined;

    if (compareData?.themeId === compareThemeId && compareData?.themeName) return compareData.themeName;

    return compareOptions.find((x) => x.themeId === compareThemeId)?.themeName ?? compareThemeId;
  }, [compareThemeId, compareData, compareOptions]);

  const compareThemeNameDisplay = useMemo(() => {
    if (!compareThemeId) return undefined;

    if (compareThemeId.trim() === themeId.trim()) return `${compareThemeNameRaw ?? compareThemeId} (Self compare)`;

    return `${compareThemeNameRaw ?? compareThemeId}${compareLoading ? " (loading...)" : ""}${compareError ? " (error)" : ""}`;
  }, [compareThemeId, compareThemeNameRaw, compareLoading, compareError, themeId]);

  const compareThemeReturn: ThemeReturnSummary | undefined = useMemo(() => {
    if (!compareThemeId) return undefined;
    if (compareLoading || !!compareError || !compareData) return undefined;

    return computeThemeReturnSummary({
      nodes: safeArray<NodeT>(resolvedCompareNodes),
      period,
      minAssets: 5,
    });
  }, [compareThemeId, compareLoading, compareError, compareData, resolvedCompareNodes, period]);

  const compareNodes = useMemo(() => {
    if (!compareThemeId) return undefined;
    if (compareLoading || !!compareError || !compareData) return undefined;
    return safeArray<NodeT>(resolvedCompareNodes);
  }, [compareThemeId, compareLoading, compareError, compareData, resolvedCompareNodes]);

  const periods: { key: PeriodKey; label: string }[] = [
    { key: "3D", label: "3일" },
    { key: "7D", label: "7일" },
    { key: "1M", label: "1개월" },
    { key: "YTD", label: "YTD" },
    { key: "1Y", label: "1년" },
    { key: "3Y", label: "3년" },
  ];

  const onMoveTheme = (tid: string) => {
    const next = (tid ?? "").trim();
    if (!next) return;
    router.push(`/graph/${next}`);
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {/* ✅ Compact Top Header (single-line) */}
      <header className="mb-2 flex h-12 items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-2 py-1">
        {/* Left: ThemeId badge + Theme name */}
        <div className="flex min-w-0 items-center gap-2">
          <div className="shrink-0 rounded-lg border border-white/15 bg-black/30 px-2 py-1 text-[11px] font-semibold text-white/85">
            {themeId}
          </div>
          <div className="min-w-0 truncate text-[13px] font-semibold text-white/90" title={themeName}>
            {themeName}
          </div>
        </div>

        {/* ✅ SearchBar (ASSET/THEME/BF/MACRO) */}
        <div className="min-w-[320px] max-w-[520px] flex-1">
          <SearchBar
            indexUrl={SEARCH_INDEX_URL}
            onGoTheme={(tid) => router.push(`/graph/${tid}`)}
            onGoThemeFocus={(tid, fid) => router.push(`/graph/${tid}?focus=${encodeURIComponent(fid)}`)}
          />
        </div>

        {/* Controls in order: Theme fixation -> Period -> Move -> Full map */}
        <div className="flex items-center gap-2">
          {/* 1) Theme fixation */}
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/80">
            <input type="checkbox" checked={lockTheme} onChange={(e) => setLockTheme(e.target.checked)} />
            <span className="font-semibold">THEME 고정</span>
          </label>

          {/* 2) Period toggle */}
          <div className="flex items-center gap-1 rounded-lg border border-white/10 bg-black/30 p-1">
            {periods.map((p) => {
              const active = p.key === period;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPeriod(p.key)}
                  className={[
                    "rounded-md px-2 py-1 text-[11px] transition",
                    active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                  title={`수익률 기간: ${p.label}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>

          {/* 3) Move to theme dropdown (index.json 기반) */}
          <select
            className="h-9 w-[260px] rounded-lg border border-white/10 bg-black/30 px-2 text-[12px] text-white/85 outline-none focus:border-white/20"
            value={moveThemeId}
            onChange={(e) => {
              const v = e.target.value;
              setMoveThemeId(v);
              if (v) onMoveTheme(v);
            }}
            title="테마로 이동 (index.json 기반)"
          >
            <option value="">Move to theme…</option>
            {compareOptions.map((opt) => (
              <option key={opt.themeId} value={opt.themeId}>
                {opt.themeId} · {opt.themeName}
              </option>
            ))}
          </select>

          {/* 4) Full theme map */}
          <a
            href="/themes"
            className="flex h-9 items-center rounded-lg border border-white/15 bg-black/30 px-3 text-[11px] text-white/80 transition hover:bg-black/40 hover:text-white"
            title="Full Theme Map"
          >
            ⤴ Full Theme Map
          </a>
        </div>

        {/* Far right: Main Home small */}
        <a
          href="/"
          className="flex h-9 items-center rounded-lg border border-white/15 bg-black/25 px-2.5 text-[11px] text-white/75 transition hover:bg-black/35 hover:text-white"
          title="Main Home"
        >
          Home
        </a>
      </header>

      {/* ✅ Graph area maximized (flex-1, min-h-0) */}
      <div className="min-h-0 flex-1">
        {/* ✅ Right panel ratio ~ 60/40 유지 */}
        <div className="grid h-full min-h-0 grid-cols-1 gap-2 lg:grid-cols-[3fr_2fr]">
          {/* Graph */}
          <div className="relative min-h-0 rounded-xl border border-white/10 bg-black/25 p-1">
            <ForceGraphWrapper
              themeId={themeId}
              themeName={themeName}
              nodes={resolvedNodes}
              edges={edges}
              onSelectNode={(n) => setSelectedNode(n)}
              period={period}
              onChangePeriod={(p) => setPeriod(p)}
              showPeriodButtons={false} // ✅ 헤더로 이동
              lockTheme={lockTheme} // ✅ 헤더의 THEME 고정과 연동
              onChangeLockTheme={setLockTheme}
              focusId={focusId}
            />
          </div>

          {/* Right Panel */}
          <div className="min-h-0">
            <GraphRightPanel
              themeName={themeName}
              currentThemeId={themeId}
              selectedNode={selectedNode}
              nodes={safeArray<NodeT>(resolvedNodes)}
              compareNodes={compareNodes}
              researchLinks={safeResearchLinks}
              period={period}
              onChangePeriod={setPeriod}
              themeReturn={themeReturn}
              compareOptions={compareOptions}
              compareThemeId={compareThemeId}
              onChangeCompareThemeId={setCompareThemeId}
              compareThemeName={compareThemeNameDisplay}
              compareThemeReturn={compareThemeReturn}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
