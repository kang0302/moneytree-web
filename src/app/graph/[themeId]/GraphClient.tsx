// src/app/graph/[themeId]/GraphClient.tsx
// UI COMPACT v1 - 2026-02-16
// - Header: Period toggle / Move to theme dropdown / Full theme map / Main home (small, far right)
// - Reduce margins, maximize graph area (flex layout, no 100vh calc)
// - Preserve existing compare logic, resolver logic, right panel props
//
// ✅ 2026-02-17 (Search v3)
// - Add SearchBar (ASSET/THEME/BF/MACRO) in header
// - Use GitHub raw search index: RAW_BASE + /data/search/search_index.json
//
// ✅ 2026-02-24 (Fix Barometer/Top movers)
// - Normalize node.type for ASSET/THEME/BUSINESS_FIELD (some theme JSONs may omit type)
// - Coerce metrics numeric fields (returns/valuation fields may be strings -> number)

"use client";

import React, { useMemo, useState, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import ForceGraphWrapper from "@/components/ForceGraphWrapper";
import GraphRightPanel, { CompareThemeOptionT } from "@/components/GraphRightPanel";

// ✅ Search import
import SearchBar from "@/components/SearchBar";

import { computeThemeReturnSummary, extractReturnByPeriod, PeriodKey, ThemeReturnSummary } from "@/lib/themeReturn";
import { getThemeJsonUrl } from "@/lib/getThemeJsonUrl";
import { fetchThemeIndex, resolvePlaceholderThemeNames } from "@/lib/themeIndex";

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
const ASSET_MASTER_URLS = [`${RAW_BASE}/data/ssot/asset_ssot.csv`, `${RAW_BASE}/data/master/asset.csv`];
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

/**
 * ✅ Some theme JSONs contain numeric-like fields as strings.
 *    Coerce known metrics fields (returns/valuation) into numbers where possible.
 */
function toNumberOrKeep(v: any) {
  if (v === null || v === undefined) return v;
  if (typeof v === "number") return Number.isFinite(v) ? v : v;
  if (typeof v === "string") {
    const s = v.trim();
    if (s === "") return v;
    // ✅ PATCH: "117,121,442,152,000" 같은 콤마 숫자도 파싱
    const n = Number(s.replace(/,/g, ""));
    if (Number.isFinite(n)) return n;
  }
  return v;
}

function coerceMetrics(metrics: any) {
  if (!metrics || typeof metrics !== "object") return metrics;

  const out: any = { ...metrics };

  // common valuation keys
  const valuationKeys = [
    "close",
    "marketCap",
    "market_cap",
    "mktCap",
    "mkt_cap",
    "pe_ttm",
    "per",
    "pe",
    "perFwd12m",
    "per_fwd12m",
  ];

  for (const k of valuationKeys) {
    if (k in out) out[k] = toNumberOrKeep(out[k]);
  }

  // return keys: ret7d, ret_7d, return_7d, return7d, ret1m, return_30d, etc.
  for (const k of Object.keys(out)) {
    const key = k.toLowerCase();
    const looksReturn =
      key.startsWith("ret") ||
      key.startsWith("return") ||
      key.includes("ret_") ||
      key.includes("return_") ||
      key.endsWith("d") ||
      key.endsWith("m") ||
      key.endsWith("y") ||
      key.includes("ytd");

    if (looksReturn) {
      out[k] = toNumberOrKeep(out[k]);
    }
  }

  return out;
}

/**
 * ✅ PATCH(핵심):
 * 일부 theme json에서 return_7d 등이 node.metrics 안이 아니라 "노드 루트"에 들어있음.
 * -> UI/Barometer/Top movers가 전부 '데이터 없음'으로 떨어지는 원인.
 * 해결: 노드 루트의 return/ret 키를 metrics로 승격(hoist)해서 통일.
 */
function hoistReturnKeysIntoMetrics(node: any, metrics: any) {
  const base: any = metrics && typeof metrics === "object" ? { ...metrics } : {};
  if (!node || typeof node !== "object") return base;

  for (const k of Object.keys(node)) {
    const key = k.toLowerCase();
    const looksReturn =
      key.startsWith("ret") ||
      key.startsWith("return") ||
      key.includes("ret_") ||
      key.includes("return_") ||
      key.includes("ytd") ||
      key.endsWith("d") ||
      key.endsWith("m") ||
      key.endsWith("y");

    if (!looksReturn) continue;
    if (k in base) continue;

    const v = node[k];
    if (typeof v === "number" || typeof v === "string") {
      base[k] = v;
    }
  }

  return base;
}

export default function GraphClient({
  themeId,
  themeName,
  nodes,
  edges,
}: {
  themeId: string;
  themeName: string;
  nodes: NodeT[];
  edges: EdgeT[];
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
  const [compareData, setCompareData] = useState<{ themeId: string; themeName?: string; nodes: NodeT[] } | null>(null);

  // ✅ Resolver master maps (SSOT 기반)
  const [assetMap, setAssetMap] = useState<Record<string, AssetMasterItem>>({});
  const [bfMap, setBfMap] = useState<Record<string, BfMasterItem>>({});

  // ✅ Header controls
  const [moveThemeId, setMoveThemeId] = useState<string>("");

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
      // ✅ PATCH: metrics 밖에 있는 return/ret 키를 metrics로 승격 후 coercion
      const metricsCoerced = coerceMetrics(hoistReturnKeysIntoMetrics(n, n.metrics));

      if (isThemeNode(n, themeId)) {
        return {
          ...n,
          type: "THEME", // ✅ ensure THEME type
          name: themeName,
          metrics: metricsCoerced,
        };
      }

      if (isAsset(n)) {
        const m = assetMap[n.id];
        const ko = m?.ko;
        const en = m?.en;

        // even if master not found, still normalize type/metrics
        const base = {
          ...n,
          type: "ASSET", // ✅ ensure ASSET type (critical)
          metrics: metricsCoerced,
        };

        if (!m) return base;

        return {
          ...base,
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
          type: n.type ?? "BUSINESS_FIELD", // ✅ best-effort normalize
          metrics: metricsCoerced,
          business_field_ko: n.business_field_ko ?? ko,
          business_field_en: n.business_field_en ?? en,
          name: finalName,
        };
      }

      return { ...n, metrics: metricsCoerced };
    });
  }, [nodes, assetMap, bfMap, themeId, themeName]);

  /* =========================
     ✅ 3) Resolver 적용: 비교 테마 nodes
     ========================= */
  const resolvedCompareNodes = useMemo(() => {
    const cn = safeArray<NodeT>(compareData?.nodes);
    if (!cn.length) return cn;

    return cn.map((n) => {
      // ✅ PATCH: compare도 동일하게 승격 + coercion
      const metricsCoerced = coerceMetrics(hoistReturnKeysIntoMetrics(n, n.metrics));

      if (isAsset(n)) {
        const m = assetMap[n.id];
        const ko = m?.ko;
        const en = m?.en;

        const base = {
          ...n,
          type: "ASSET", // ✅ ensure ASSET type
          metrics: metricsCoerced,
        };

        if (!m) return base;

        return {
          ...base,
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
          type: n.type ?? "BUSINESS_FIELD",
          metrics: metricsCoerced,
          business_field_ko: n.business_field_ko ?? ko,
          business_field_en: n.business_field_en ?? en,
          name: finalName,
        };
      }

      return { ...n, metrics: metricsCoerced };
    });
  }, [compareData?.nodes, assetMap, bfMap]);

  // ✅ Live return fetch (Yahoo Finance) for nodes with null return_*.
  //    Keyed as "PERIOD:TICKER" so period switches don't lose previously-fetched values.
  const [liveReturnMap, setLiveReturnMap] = useState<Record<string, number>>({});

  useEffect(() => {
    let cancelled = false;

    // Find ASSET nodes whose extractReturnByPeriod is null for the active period
    // and that expose a ticker+exchange we can query Yahoo Finance with.
    const nullAssets: Array<{ ticker: string; exchange: string }> = [];
    for (const n of resolvedNodes) {
      if ((n.type ?? "").toUpperCase() !== "ASSET") continue;
      const ticker = (n.exposure?.ticker ?? "").trim();
      const exchange = (n.exposure?.exchange ?? "").trim();
      if (!ticker || !exchange) continue;

      // Skip if already cached for this period+ticker
      const cacheKey = `${period}:${ticker}`;
      if (cacheKey in liveReturnMap) continue;

      // Only fetch if the JSON has no usable return for this period
      const existing = extractReturnByPeriod(n.metrics as any, period);
      if (existing !== null) continue;

      nullAssets.push({ ticker, exchange });
    }

    if (!nullAssets.length) return;

    const tickersParam = nullAssets.map((p) => `${p.ticker}:${p.exchange}`).join(",");
    const url = `/api/stock-returns?tickers=${encodeURIComponent(tickersParam)}&period=${encodeURIComponent(period)}`;

    fetch(url, { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: Record<string, number | null>) => {
        if (cancelled) return;
        const additions: Record<string, number> = {};
        for (const [ticker, ret] of Object.entries(data ?? {})) {
          if (typeof ret === "number" && Number.isFinite(ret)) {
            additions[`${period}:${ticker}`] = ret;
          }
        }
        if (Object.keys(additions).length) {
          setLiveReturnMap((prev) => ({ ...prev, ...additions }));
        }
      })
      .catch(() => {
        // silent; UI will continue showing "—"
      });

    return () => {
      cancelled = true;
    };
  }, [resolvedNodes, period, liveReturnMap]);

  // ✅ Merge liveReturnMap into nodes via the special `_liveReturn` metrics key.
  //    Downstream extractors (extractReturnByPeriod / getReturnByPeriodFromMetrics)
  //    check `_liveReturn` first, bypassing the decimal-heuristic used for string/number fields.
  const enrichedNodes = useMemo(() => {
    if (!Object.keys(liveReturnMap).length) return resolvedNodes;

    return resolvedNodes.map((n) => {
      if ((n.type ?? "").toUpperCase() !== "ASSET") return n;
      const ticker = (n.exposure?.ticker ?? "").trim();
      if (!ticker) return n;

      const live = liveReturnMap[`${period}:${ticker}`];
      if (typeof live !== "number" || !Number.isFinite(live)) return n;

      return {
        ...n,
        metrics: {
          ...(n.metrics ?? {}),
          _liveReturn: live,
          _liveReturnSource: "Yahoo Finance",
          _liveReturnPeriod: period,
        },
      };
    });
  }, [resolvedNodes, liveReturnMap, period]);

  // ✅ Theme Return Summary
  const themeReturn = useMemo(() => {
    return computeThemeReturnSummary({
      nodes: safeArray<NodeT>(enrichedNodes),
      period,
      minAssets: 5,
    });
  }, [enrichedNodes, period]);

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
        // 1차: index.json 그대로 즉시 표시 (placeholder 포함)
        const initial = list
          .filter((x) => x?.themeId && x?.themeName)
          .map((x) => ({ themeId: String(x.themeId).trim(), themeName: String(x.themeName).trim() }))
          .filter((x) => x.themeId && x.themeName);
        setCompareOptions(initial);

        // 2차: placeholder("T_006" 같은 themeName) 항목을 개별 JSON에서 보정
        const resolved = await resolvePlaceholderThemeNames(list);
        if (cancelled) return;
        setCompareOptions(
          resolved
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

        {/* Controls in order: Period -> Move -> Full map */}
        <div className="flex items-center gap-2">
          {/* 1) Period toggle */}
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

          {/* 2) Move to theme dropdown (index.json 기반) */}
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

          {/* 3) Full theme map */}
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
              nodes={enrichedNodes}
              edges={edges}
              onSelectNode={(n) => setSelectedNode(n)}
              period={period}
              onChangePeriod={(p) => setPeriod(p)}
              showPeriodButtons={false} // ✅ 헤더로 이동
              focusId={focusId}
              themeReturn={themeReturn} // ✅ THEME 노드 hover에 Barometer 점수 표시
            />
          </div>

          {/* Right Panel */}
          <div className="min-h-0">
            <GraphRightPanel
              themeName={themeName}
              currentThemeId={themeId}
              selectedNode={(() => {
                // Keep selectedNode's metrics in sync with the enriched (live-return-injected) version.
                if (!selectedNode) return selectedNode;
                const enriched = enrichedNodes.find((n) => n.id === selectedNode.id);
                return enriched ?? selectedNode;
              })()}
              nodes={safeArray<NodeT>(enrichedNodes)}
              compareNodes={compareNodes}
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