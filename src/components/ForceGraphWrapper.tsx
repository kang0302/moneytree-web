// src/components/ForceGraphWrapper.tsx
// UI COMPACT v1 - 2026-02-16
// - Allow external control of lockTheme (header)
// PATCH 2026-02-23
// - Text size x1.5 for all graph labels
// - Tuning to reduce overlap: stronger collide, slightly longer links, slightly stronger charge
// PATCH 2026-02-23 (Bloomberg Hover)
// - Remove old 3 lines (type~PER block) in node hover
// - Show only return (top), divider, 2x2 grid, footer meta
// PATCH 2026-02-23 (FOCUS)
// - Read ?focus=NODE_ID from URL if focusId prop is not provided
// - Auto center/zoom & highlight the focused node

"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { forceRadial } from "d3-force";
import { staleLevel, staleLabel } from "@/components/GraphRightPanel";

const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

export type PeriodKey = "3D" | "7D" | "1M" | "YTD" | "1Y" | "3Y";

type MetricsT = {
  perFwd12m?: number;
  per?: number;
  pe?: number;

  ret3d?: number;
  ret7d?: number;
  ret1m?: number;
  retYtd?: number;
  ret1y?: number;
  ret3y?: number;

  return3d?: number;
  return7d?: number;
  return30d?: number;
  return1m?: number;
  returnYtd?: number;
  return1y?: number;
  return3y?: number;

  // ✅ Bloomberg hover: optional value fields (if present)
  last_price?: number;
  close?: number;
  market_cap?: number;
  marketCap?: number;
  valuationAsOf?: string;
  val_date?: string;
  asof?: string;

  ticker?: string;
  exchange?: string;
  country?: string;

  [key: string]: any;
};

type NodeT = {
  id: string;
  name: string;
  type?: string;
  metrics?: MetricsT;

  x?: number;
  y?: number;
  vx?: number;
  vy?: number;
  fx?: number | null;
  fy?: number | null;

  asset_name_ko?: string;
  asset_name_en?: string;
  business_field_ko?: string;
  business_field_en?: string;
  name_ko?: string;
  name_en?: string;
  label_ko?: string;
  label_en?: string;

  // optional meta (some datasets put these on node instead of metrics)
  ticker?: string;
  exchange?: string;
  country?: string;

  [key: string]: any;
};

type EdgeT = {
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  src?: string;
  dst?: string;

  type?: string;
  label?: string;
  relType?: string;
  relation?: string;

  [key: string]: any;
};

type Props = {
  themeId: string;
  themeName: string;
  nodes: NodeT[];
  edges: EdgeT[];

  period: PeriodKey;
  onChangePeriod: (p: PeriodKey) => void;

  onSelectNode?: (n: NodeT | null) => void;
  showPeriodButtons?: boolean;

  // ✅ external lock support (header)
  lockTheme?: boolean;
  onChangeLockTheme?: (v: boolean) => void;

  // ✅ overlay controls on/off (default true)
  showOverlayControls?: boolean;

  // ✅ focus node highlight (from search or external)
  focusId?: string | null;

  // ✅ hover에 표시할 테마 바로미터 요약 (선택). GraphClient에서 computeThemeReturnSummary 결과를 그대로 전달.
  themeReturn?: any;
};

// =========================
// TEXT SCALE + OVERLAP TUNING
// =========================
const TEXT_SCALE = 1.5; // ✅ 요청: 모든 그래프 텍스트 1.5배
const LABEL_GAP_BASE = 8;
const LABEL_GAP = Math.round(LABEL_GAP_BASE * TEXT_SCALE); // label x-offset gap

// Overlap tuning (physics)
const CHARGE_STRENGTH = -300; // radial 레이어가 주도 → charge는 적당히
const COLLIDE_PAD_BASE = 26;
const COLLIDE_PAD = Math.round(COLLIDE_PAD_BASE * TEXT_SCALE); // 26 -> 39

// 🎯 Radial layering (absolute px) — forceRadial이 타입별 반경으로 노드를 강제 배치
const RADIAL_BY_TYPE: Record<string, number> = {
  THEME: 0,
  MACRO: 80,
  ASSET: 180,
  FIELD: 260, // Business_Field
  CHARACTER: 320,
};
const RADIAL_DEFAULT = 220;
const getRadialR = (n: any): number => {
  const t = normType(n?.type);
  return RADIAL_BY_TYPE[t] ?? RADIAL_DEFAULT;
};

function normType(t?: string) {
  const x = (t ?? "").toUpperCase();
  if (x === "THEME") return "THEME";
  if (x === "ASSET") return "ASSET";
  if (x.includes("BUSINESS_FIELD")) return "FIELD";
  if (x.includes("FIELD")) return "FIELD";
  return x || "UNKNOWN";
}

function resolveLabel(n: any, fallbackThemeName?: string) {
  const t = normType(n?.type);

  if (t === "THEME") {
    const v =
      (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
      (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
      (typeof n?.themeName === "string" && n.themeName.trim()) ||
      (typeof n?.name === "string" && n.name.trim()) ||
      (typeof fallbackThemeName === "string" && fallbackThemeName.trim()) ||
      n?.id;
    return String(v ?? "");
  }

  if (t === "ASSET") {
    const v =
      (typeof n?.asset_name_ko === "string" && n.asset_name_ko.trim()) ||
      (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
      (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
      (typeof n?.asset_name_en === "string" && n.asset_name_en.trim()) ||
      (typeof n?.name_en === "string" && n.name_en.trim()) ||
      (typeof n?.label_en === "string" && n.label_en.trim()) ||
      (typeof n?.name === "string" && n.name.trim()) ||
      n?.id;
    return String(v ?? "");
  }

  if (t === "FIELD") {
    const v =
      (typeof n?.business_field_ko === "string" && n.business_field_ko.trim()) ||
      (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
      (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
      (typeof n?.business_field_en === "string" && n.business_field_en.trim()) ||
      (typeof n?.name_en === "string" && n.name_en.trim()) ||
      (typeof n?.label_en === "string" && n.label_en.trim()) ||
      (typeof n?.name === "string" && n.name.trim()) ||
      n?.id;
    return String(v ?? "");
  }

  const v =
    (typeof n?.name_ko === "string" && n.name_ko.trim()) ||
    (typeof n?.label_ko === "string" && n.label_ko.trim()) ||
    (typeof n?.name === "string" && n.name.trim()) ||
    n?.id;
  return String(v ?? "");
}

function nodeRadius(n: NodeT, isTheme: boolean) {
  const t = normType(n.type);
  if (t === "ASSET") return 22;
  if (isTheme) return 10;
  if (t === "FIELD") return 8;
  return 8;
}

// ✅ PATCH: 문자열 숫자도 파싱
function pickNum(v: any): number | undefined {
  if (typeof v === "number" && Number.isFinite(v)) return v;
  if (typeof v === "string") {
    const s = v.trim().replace(/,/g, "");
    if (!s) return undefined;
    const n = Number(s);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

function getTrailingPer(n: NodeT) {
  const m = n.metrics ?? {};
  return pickNum(m.per) ?? pickNum(m.pe) ?? pickNum(m.trailingPER) ?? pickNum(m.trailing_per) ?? pickNum(m.per_ttm);
}

// PER 표시용: trailing 우선, 없으면 forward(perFwd12m)로 fallback. 어떤 종류인지 같이 반환.
function getDisplayPer(n: NodeT): { value: number | undefined; kind: "Trailing" | "Fwd" | null } {
  const m: any = n.metrics ?? {};
  const t = pickNum(m.per) ?? pickNum(m.pe) ?? pickNum(m.trailingPER) ?? pickNum(m.trailing_per) ?? pickNum(m.per_ttm);
  if (typeof t === "number") return { value: t, kind: "Trailing" };
  const f = pickNum(m.perFwd12m) ?? pickNum(m.per_fwd12m) ?? pickNum(m.forwardPE);
  if (typeof f === "number") return { value: f, kind: "Fwd" };
  return { value: undefined, kind: null };
}

function normalizePct(v: number) {
  return Math.abs(v) <= 1.5 ? v * 100 : v;
}

function getReturnByPeriod(n: NodeT, p: PeriodKey): number | undefined {
  const m: any = (n as any).metrics ?? {};

  // ✅ Yahoo Finance 실시간 폴백 값(GraphClient에서 주입)이 있으면 절대 우선.
  const live = m._liveReturn;
  if (typeof live === "number" && Number.isFinite(live)) return live;

  const P = String(p).toUpperCase() as PeriodKey;
  const pLower = P.toLowerCase();

  // ✅ PATCH: return_7D / return_3D / return_1M / return_YTD / return_1Y / return_3Y 대응 추가
  const candidates: string[] = (() => {
    switch (P) {
      case "3D":
        return [
          "ret3d",
          "r3d",
          "return3d",
          "return_3d",
          "return_3D", // ✅ 추가
          "ret_3d",
          "3d",
          "3D",
          "d3",
          "3day",
          "3days",
        ];
      case "7D":
        return [
          "ret7d",
          "r7d",
          "return7d",
          "return_7d",
          "return_7D", // ✅ 추가
          "ret_7d",
          "7d",
          "7D",
          "d7",
          "7day",
          "7days",
        ];
      case "1M":
        return [
          "ret1m",
          "r1m",
          "return1m",
          "return_1m",
          "return_1M", // ✅ 추가
          "ret_1m",
          "1m",
          "1M",
          "m1",
          "30d",
          "1mo",
          "1month",
        ];
      case "YTD":
        return [
          "retYtd", // ✅ 추가(대소문자 혼재 대응)
          "retytd",
          "rytd",
          "returnYtd",
          "returnytd",
          "return_ytd",
          "return_YTD", // ✅ 추가
          "ret_ytd",
          "ytd",
          "YTD",
        ];
      case "1Y":
        return [
          "ret1y",
          "r1y",
          "return1y",
          "return_1y",
          "return_1Y", // ✅ 추가
          "ret_1y",
          "1y",
          "1Y",
          "y1",
          "1yr",
          "1year",
        ];
      case "3Y":
        return [
          "ret3y",
          "r3y",
          "return3y",
          "return_3y",
          "return_3Y", // ✅ 추가
          "ret_3y",
          "3y",
          "3Y",
          "y3",
          "3yr",
          "3year",
        ];
      default:
        return [pLower, P];
    }
  })();

  const tryPick = (obj: any): number | undefined => {
    if (!obj || typeof obj !== "object") return undefined;
    for (const k of candidates) {
      const v = pickNum(obj[k]);
      if (v !== undefined) return v;
    }
    return undefined;
  };

  // 1) direct keys on metrics
  let v = tryPick(m);

  // 2) common nested shapes
  if (v === undefined) v = tryPick(m.returns);
  if (v === undefined) v = tryPick(m.return);
  if (v === undefined) v = tryPick(m.performance);
  if (v === undefined) v = tryPick(m.performance?.returns);
  if (v === undefined) v = tryPick(m.performance?.return);

  // 3) metrics.returns[pLower] style
  if (v === undefined && m?.returns && typeof m.returns === "object") {
    v = pickNum(m.returns[pLower] ?? m.returns[P] ?? m.returns[pLower.toUpperCase()]);
  }

  if (v === undefined) return undefined;

  // MoneyTree expectation: percent points (2.31 = +2.31%).
  // Heuristic: if a source gives decimals (0.0231), convert to percent.
  const abs = Math.abs(v);
  if (abs > 0 && abs < 1 && abs * 100 >= 1) return v * 100;

  return v;
}

function colorFromReturn(r?: number) {
  if (typeof r !== "number" || !Number.isFinite(r)) return "#888888"; // 수익률 없음 → 회색

  // ✅ 한국 주식 시장 관행: 빨강 = 상승, 파랑 = 하락 (수익률 크기별 농도 차등)
  if (r >= 50) return "#FF0000";   // +50% 이상 → 진한 빨강
  if (r >= 20) return "#FF4444";   // +20~50%   → 중간 빨강
  if (r >= 5)  return "#FF8888";   // +5~20%    → 연한 빨강
  if (r >= 0)  return "#FFCCCC";   // 0~+5%     → 아주 연한 빨강
  if (r >= -5) return "#CCCCFF";   // 0~-5%     → 아주 연한 파랑
  if (r >= -20) return "#8888FF";  // -5~-20%   → 연한 파랑
  return "#0000FF";                // -20% 이하 → 진한 파랑
}

function nodeBaseColor(n: NodeT, isTheme: boolean) {
  if (isTheme) return "#F2C94C";
  const t = normType(n.type);
  if (t === "FIELD") return "#34D399";
  return "#9CA3AF";
}

function pickEdgeEndpoints(e: EdgeT): { s?: string; t?: string } {
  const s =
    (typeof e.from === "string" && e.from.trim()) ||
    (typeof e.source === "string" && e.source.trim()) ||
    (typeof e.src === "string" && e.src.trim()) ||
    undefined;

  const t =
    (typeof e.to === "string" && e.to.trim()) ||
    (typeof e.target === "string" && e.target.trim()) ||
    (typeof e.dst === "string" && e.dst.trim()) ||
    undefined;

  return { s, t };
}

function pickRelType(e: EdgeT): string {
  return (
    (typeof e.type === "string" && e.type.trim()) ||
    (typeof e.label === "string" && e.label.trim()) ||
    (typeof e.relType === "string" && e.relType.trim()) ||
    (typeof e.relation === "string" && e.relation.trim()) ||
    ""
  );
}

export default function ForceGraphWrapper({
  themeId,
  themeName,
  nodes,
  edges,
  period,
  onChangePeriod,
  onSelectNode,
  showPeriodButtons = true,
  lockTheme: lockThemeProp,
  onChangeLockTheme,
  showOverlayControls = true,
  focusId,
  themeReturn,
}: Props) {
  const fgRef = useRef<any>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const [size, setSize] = useState({ w: 800, h: 560 });

  // ✅ internal fallback (if parent doesn't control)
  const [lockThemeInternal, setLockThemeInternal] = useState(false);
  const lockTheme = typeof lockThemeProp === "boolean" ? lockThemeProp : lockThemeInternal;

  const setLockTheme = (v: boolean) => {
    if (typeof lockThemeProp === "boolean") onChangeLockTheme?.(v);
    else setLockThemeInternal(v);
  };

  const [hoverNode, setHoverNode] = useState<NodeT | null>(null);
  const [hoverLink, setHoverLink] = useState<any | null>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // ──────────────────────────────────────────────────────────────
  // 🎬 Entrance animation: staggered by node type (theme → macro → asset → field → character)
  // ──────────────────────────────────────────────────────────────
  const REVEAL_DELAY_MS: Record<string, number> = {
    THEME: 0,
    MACRO: 1200,
    ASSET: 2400,
    FIELD: 3600, // Business_Field normType
    CHARACTER: 4800,
  };
  const NODE_ANIM_DUR_MS = 350;
  const EDGE_ANIM_DUR_MS = 250;
  const MAX_JITTER_MS = 120;
  const EXTRA_ASSET_STAGGER_MS = 120; // 확장 시 추가 asset 노드 간 간격
  const DEFAULT_ASSET_LIMIT = 10;
  const animStartRef = useRef<number | null>(null);
  const jitterMapRef = useRef<Map<string, number>>(new Map());
  const rafRef = useRef<number | null>(null);
  const [animTick, setAnimTick] = useState(0);

  // 🎯 Full Asset toggle — 기본은 상위 10개만 (return_7d desc), 클릭 시 전체 표시
  const [expanded, setExpanded] = useState(false);
  const expandStartRef = useRef<number | null>(null);
  const rafExpandRef = useRef<number | null>(null);

  const getJitter = (id: string) => {
    const m = jitterMapRef.current;
    if (!m.has(id)) m.set(id, Math.random() * MAX_JITTER_MS);
    return m.get(id)!;
  };

  const getNodeReveal = (node: any): number => {
    const base = animStartRef.current ?? 0;
    const nt = normType(node?.type);
    // Extra assets (top 10 밖)은 expand 클릭 시점부터 순차 등장
    if (nt === "ASSET" && !assetRankInfo.topAssetIds.has(node?.id)) {
      const expandBase = expandStartRef.current;
      if (expandBase == null) {
        // 아직 펼치기 전이면 기본 ASSET 타이밍 (필터링되어 렌더 안 되지만 안전망)
        return base + (REVEAL_DELAY_MS.ASSET ?? 0) + getJitter(node?.id ?? "");
      }
      const order = assetRankInfo.extraAssetOrderMap.get(node?.id) ?? 0;
      return expandBase + order * EXTRA_ASSET_STAGGER_MS + getJitter(node?.id ?? "");
    }
    const delay = REVEAL_DELAY_MS[nt] ?? 600;
    return base + delay + getJitter(node?.id ?? "");
  };

  // easeOutBack: 0 → ~1.1 overshoot → 1.0 (gives the "pop" feel the user asked for)
  const easeOutBack = (t: number): number => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    const x = Math.max(0, Math.min(1, t));
    return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2);
  };

  const getNodeAnimState = (node: any): { scale: number; opacity: number; visible: boolean } => {
    if (animStartRef.current === null) return { scale: 1, opacity: 1, visible: true };
    const elapsed = performance.now() - getNodeReveal(node);
    if (elapsed < 0) return { scale: 0, opacity: 0, visible: false };
    if (elapsed >= NODE_ANIM_DUR_MS) return { scale: 1, opacity: 1, visible: true };
    const p = elapsed / NODE_ANIM_DUR_MS;
    return { scale: easeOutBack(p), opacity: p, visible: true };
  };

  const getEdgeOpacity = (link: any): number => {
    if (animStartRef.current === null) return 1;
    const s = typeof link?.source === "object" ? link.source : null;
    const t = typeof link?.target === "object" ? link.target : null;
    if (!s || !t) return 1;
    const revealAt = Math.max(getNodeReveal(s), getNodeReveal(t));
    const elapsed = performance.now() - revealAt;
    if (elapsed < 0) return 0;
    if (elapsed >= EDGE_ANIM_DUR_MS) return 1;
    return elapsed / EDGE_ANIM_DUR_MS;
  };

  // ✅ URL ?focus=NODE_ID fallback (props가 없을 때만 사용)
  const [focusFromUrl, setFocusFromUrl] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const read = () => {
      try {
        const sp = new URLSearchParams(window.location.search);
        const f = sp.get("focus");
        setFocusFromUrl(f && f.trim() ? f.trim() : null);
      } catch {
        setFocusFromUrl(null);
      }
    };

    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);

  const effectiveFocusId = typeof focusId === "string" && focusId.trim() ? focusId.trim() : focusFromUrl;

  // 🎬 Start/restart entrance animation when the theme changes (first load + navigation).
  useEffect(() => {
    if (typeof window === "undefined") return;

    animStartRef.current = performance.now();
    jitterMapRef.current.clear();

    // 테마 전환 시 확장 상태 리셋 (기본=상위10 모드로 돌아감)
    expandStartRef.current = null;
    setExpanded(false);

    const END_MS = Math.max(...Object.values(REVEAL_DELAY_MS)) + NODE_ANIM_DUR_MS + MAX_JITTER_MS + EDGE_ANIM_DUR_MS;

    const loop = () => {
      const elapsed = performance.now() - (animStartRef.current ?? 0);
      if (elapsed >= END_MS) {
        rafRef.current = null;
        // one final refresh so any last easing frame lands on its end state
        setAnimTick((t) => t + 1);
        fgRef.current?.refresh?.();
        return;
      }
      setAnimTick((t) => t + 1);
      fgRef.current?.refresh?.();
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
    };
    // themeId drives it; we intentionally ignore the other helper constants (stable).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeId]);

  // 🎬 Expand animation: 숨겨진 asset 들이 순차 등장
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!expanded) return;

    expandStartRef.current = performance.now();
    const extraCount = assetRankInfo.extraAssetOrderMap.size;
    if (extraCount === 0) return;

    const END_MS =
      extraCount * EXTRA_ASSET_STAGGER_MS + NODE_ANIM_DUR_MS + MAX_JITTER_MS + EDGE_ANIM_DUR_MS;

    const loop = () => {
      const elapsed = performance.now() - (expandStartRef.current ?? 0);
      if (elapsed >= END_MS) {
        rafExpandRef.current = null;
        setAnimTick((t) => t + 1);
        fgRef.current?.refresh?.();
        return;
      }
      setAnimTick((t) => t + 1);
      fgRef.current?.refresh?.();
      rafExpandRef.current = requestAnimationFrame(loop);
    };

    rafExpandRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafExpandRef.current !== null) {
        cancelAnimationFrame(rafExpandRef.current);
        rafExpandRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expanded]);

  useEffect(() => {
    if (!wrapRef.current) return;
    const el = wrapRef.current;

    const ro = new ResizeObserver(() => {
      const rect = el.getBoundingClientRect();
      setSize({
        w: Math.max(320, Math.floor(rect.width)),
        h: Math.max(320, Math.floor(rect.height)),
      });
    });

    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // 🎯 Asset 순위 계산 (return_7d desc) → 상위 10개 vs 나머지 분리
  const assetRankInfo = useMemo(() => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const assetNodes = safeNodes.filter((n) => normType(n.type) === "ASSET");
    const sorted = [...assetNodes].sort((a, b) => {
      const ar = getReturnByPeriod(a as NodeT, "7D");
      const br = getReturnByPeriod(b as NodeT, "7D");
      const av = typeof ar === "number" && Number.isFinite(ar) ? ar : -Infinity;
      const bv = typeof br === "number" && Number.isFinite(br) ? br : -Infinity;
      return bv - av;
    });
    const topAssetIds = new Set<string>();
    const extraAssetOrderMap = new Map<string, number>();
    sorted.forEach((n, i) => {
      if (i < DEFAULT_ASSET_LIMIT) topAssetIds.add(n.id);
      else extraAssetOrderMap.set(n.id, i - DEFAULT_ASSET_LIMIT);
    });
    return {
      topAssetIds,
      extraAssetOrderMap,
      totalAssets: assetNodes.length,
      hiddenAssetCount: Math.max(0, assetNodes.length - DEFAULT_ASSET_LIMIT),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes]);

  // Clone nodes only when `nodes` prop identity changes, so x/y positions
  // persist across expand toggles.
  const allClonedNodes = useMemo<NodeT[]>(() => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    return safeNodes.map((n) => ({
      ...n,
      metrics: n.metrics ? { ...n.metrics } : n.metrics,
    }));
  }, [nodes]);

  const graphData = useMemo(() => {
    const safeEdges = Array.isArray(edges) ? edges : [];
    const { topAssetIds } = assetRankInfo;

    const clonedNodes: NodeT[] = expanded
      ? allClonedNodes
      : allClonedNodes.filter((n) => {
          if (normType(n.type) !== "ASSET") return true;
          return topAssetIds.has(n.id);
        });
    const visibleIds = new Set(clonedNodes.map((n) => n.id));

    const links = safeEdges
      .map((e) => {
        const { s, t } = pickEdgeEndpoints(e);
        if (!s || !t) return null;
        if (!visibleIds.has(s) || !visibleIds.has(t)) return null;

        const rel = pickRelType(e);
        return { source: s, target: t, type: rel, label: rel, curvature: 0 };
      })
      .filter(Boolean) as any[];

    // 🌀 Spread curvature among edges that share a source or target so parallel
    // lines fan out instead of overlapping. Key by unordered endpoints so pairs
    // of parallel edges (A→B and B→A) still separate.
    const pairCount = new Map<string, any[]>();
    const sourceBuckets = new Map<string, any[]>();
    for (const l of links) {
      const a = String(l.source);
      const b = String(l.target);
      const key = a < b ? `${a}\u0001${b}` : `${b}\u0001${a}`;
      if (!pairCount.has(key)) pairCount.set(key, []);
      pairCount.get(key)!.push(l);
      if (!sourceBuckets.has(a)) sourceBuckets.set(a, []);
      sourceBuckets.get(a)!.push(l);
    }
    // multi-edges between same pair: symmetric split
    pairCount.forEach((arr) => {
      if (arr.length <= 1) return;
      const step = 0.18;
      arr.forEach((l, i) => {
        const offset = i - (arr.length - 1) / 2;
        l.curvature = offset * step;
      });
    });
    // siblings from same source: fan out if no pair-curvature already set
    sourceBuckets.forEach((arr) => {
      if (arr.length <= 1) return;
      const maxCurve = Math.min(0.28, 0.06 + arr.length * 0.025);
      arr.forEach((l, i) => {
        if (l.curvature !== 0) return; // already set by multi-edge logic
        const t = arr.length === 1 ? 0 : i / (arr.length - 1);
        l.curvature = -maxCurve + t * 2 * maxCurve;
      });
    });

    if (typeof window !== "undefined") {
      // eslint-disable-next-line no-console
      console.log(
        "[ForceGraphWrapper] nodes:",
        clonedNodes.length,
        "edges(raw):",
        safeEdges.length,
        "links(mapped):",
        links.length
      );
    }

    return { nodes: clonedNodes, links };
  }, [allClonedNodes, edges, expanded, assetRankInfo]);

  const themeNodeId = useMemo(() => {
    const ns = graphData.nodes;
    const byType = ns.find((n) => normType(n.type) === "THEME");
    if (byType) return byType.id;

    const byId = ns.find((n) => n.id === themeId);
    if (byId) return byId.id;

    const byName = ns.find((n) => n.name === themeName);
    if (byName) return byName.id;

    return ns[0]?.id;
  }, [graphData.nodes, themeId, themeName]);

  useEffect(() => {
    const ns = graphData.nodes;
    if (!ns.length) return;

    const cx = size.w * 0.5;
    const cy = size.h * 0.52;

    const theme = ns.find((n) => n.id === themeNodeId) ?? ns[0];
    if (!theme) return;

    theme.x = cx;
    theme.y = cy;
    theme.vx = 0;
    theme.vy = 0;

    // Theme은 항상 중앙 고정 (radial 레이어 체계의 원점)
    theme.fx = cx;
    theme.fy = cy;

    const rest = ns.filter((n) => n.id !== theme.id);
    const byType = (type: string) => rest.filter((n) => normType(n.type) === type);
    const macros = byType("MACRO");
    const assets = byType("ASSET");
    const fields = byType("FIELD");
    const characters = byType("CHARACTER");
    const unknowns = rest.filter((n) => {
      const t = normType(n.type);
      return t !== "MACRO" && t !== "ASSET" && t !== "FIELD" && t !== "CHARACTER";
    });

    // 🎯 Radial layers (absolute px). 링 반경은 RADIAL_BY_TYPE와 일치해야 forceRadial과 정합.
    // 기존 위치가 있는 노드는 건드리지 않음 (expand 토글 시 점프 방지).
    const placeRing = (arr: NodeT[], radius: number, phase: number) => {
      if (!arr.length) return;
      const n = arr.length;
      arr.forEach((node, i) => {
        if (typeof node.x === "number" && typeof node.y === "number") return;
        const a = phase + (i / n) * Math.PI * 2;
        node.x = cx + Math.cos(a) * radius;
        node.y = cy + Math.sin(a) * radius;
        node.vx = 0;
        node.vy = 0;
        node.fx = null;
        node.fy = null;
      });
    };

    // 위상(phase)을 링마다 다르게 주어 방사형 스포크 정렬(같은 각도 겹침) 방지
    placeRing(macros, RADIAL_BY_TYPE.MACRO, 0);
    placeRing(assets, RADIAL_BY_TYPE.ASSET, Math.PI / 8);
    placeRing(fields, RADIAL_BY_TYPE.FIELD, Math.PI / 5);
    placeRing(characters, RADIAL_BY_TYPE.CHARACTER, Math.PI / 3);
    placeRing(unknowns, RADIAL_DEFAULT, Math.PI / 2);

    if (fgRef.current) {
      fgRef.current.d3ReheatSimulation();
      setTimeout(() => {
        try {
          fgRef.current.centerAt(cx, cy, 0);
          fgRef.current.zoomToFit(420, 90);
        } catch {}
      }, 120);
    }
  }, [graphData.nodes, size.w, size.h, themeNodeId, lockTheme]);

  // ✅ focus: center & zoom to searched node
  useEffect(() => {
    if (!effectiveFocusId) return;
    if (!fgRef.current) return;

    const n = (graphData.nodes as any[]).find((x) => x?.id === effectiveFocusId);
    if (!n || typeof n.x !== "number" || typeof n.y !== "number") return;

    try {
      fgRef.current.centerAt(n.x, n.y, 450);

      // mild zoom-in so highlight is obvious
      const currentZ = typeof fgRef.current.zoom === "function" ? fgRef.current.zoom() : 2.2;
      const z = Math.min(4, Math.max(2.2, currentZ ?? 2.2));
      fgRef.current.zoom(z, 450);

      // optional: also notify selection
      onSelectNode?.(n as NodeT);
    } catch {}
  }, [effectiveFocusId, graphData.nodes, onSelectNode]);

  useEffect(() => {
    if (!fgRef.current) return;
    const fg = fgRef.current;

    const cx = size.w * 0.5;
    const cy = size.h * 0.52;

    // 🔗 Link distance: 타입별 반경 차이(= 링 간 거리)에 맞춰 산정
    // 이 값은 forceRadial이 이미 노드를 해당 반경으로 끌어당기므로 보조 역할만.
    fg.d3Force("link")?.distance((l: any) => {
      const s = l.source?.id ?? l.source;
      const t = l.target?.id ?? l.target;
      const sn = graphData.nodes.find((n) => n.id === s);
      const tn = graphData.nodes.find((n) => n.id === t);
      const sr = sn ? getRadialR(sn) : RADIAL_DEFAULT;
      const tr = tn ? getRadialR(tn) : RADIAL_DEFAULT;
      // 링 간 거리 |r_s - r_t|, 같은 링이면 탄젠셜 간격(링 둘레/노드수)에 가까운 값
      const delta = Math.abs(sr - tr);
      return delta > 0 ? delta : 90;
    });
    // 링크가 강하면 radial을 왜곡 → strength 낮춤
    fg.d3Force("link")?.strength?.(0.15);

    // 🧲 Charge: 탄젠셜 간격 확보용 약한 반발
    fg.d3Force("charge")?.strength(CHARGE_STRENGTH);
    fg.d3Force("charge")?.distanceMax?.(260);

    // 🎯 Radial: 각 노드를 타입별 반경으로 강제
    fg.d3Force(
      "radial",
      forceRadial((n: any) => getRadialR(n), cx, cy).strength(0.95)
    );

    // 🧱 Collide: 노드 타입별 여유 반경
    fg.d3Force("collide")?.radius((n: any) => {
      const isTheme = n?.id === themeNodeId;
      const t = normType(n?.type);
      const extra = isTheme ? 6 : t === "ASSET" ? 14 : t === "FIELD" ? 4 : 2;
      return nodeRadius(n, isTheme) + COLLIDE_PAD + extra;
    });

    // ⛔ Center force 제거 — radial이 중앙 정렬 역할까지 담당
    fg.d3Force("center", null as any);

    fg.d3ReheatSimulation();
  }, [graphData.nodes, themeNodeId, size.w, size.h]);

  const drawNode = (node: any, ctx: CanvasRenderingContext2D) => {
    // 🎬 entrance animation gate
    const anim = getNodeAnimState(node);
    if (!anim.visible) return;

    const isTheme = node.id === themeNodeId;
    const isFocus = !!effectiveFocusId && node.id === effectiveFocusId;
    const baseR = nodeRadius(node, isTheme);
    const r = isFocus ? baseR + 6 : baseR;

    const label = resolveLabel(node, themeName) || node.id;

    const t = normType(node.type);
    let fill = nodeBaseColor(node, isTheme);

    if (t === "ASSET") {
      const rr = getReturnByPeriod(node, period);
      fill = colorFromReturn(rr);
    }

    ctx.save();
    ctx.globalAlpha = anim.opacity;
    if (anim.scale !== 1) {
      ctx.translate(node.x, node.y);
      ctx.scale(anim.scale, anim.scale);
      ctx.translate(-node.x, -node.y);
    }

    ctx.beginPath();
    ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
    ctx.fillStyle = fill;
    ctx.fill();

    if (isFocus) {
      // highlight ring
      ctx.beginPath();
      ctx.arc(node.x, node.y, r + 5, 0, 2 * Math.PI, false);
      ctx.strokeStyle = "rgba(255,255,255,0.95)";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    // ✅ 폰트 크기 1.5배
    const baseFont = isFocus ? 12 : isTheme ? 11 : t === "ASSET" ? 10 : 9;
    const fontSize = Math.max(9, Math.round(baseFont * TEXT_SCALE));

    ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = isFocus ? "rgba(255,255,255,0.98)" : "rgba(255,255,255,0.92)";

    // ✅ 텍스트 확대에 맞춰 x 오프셋도 증가
    const x = node.x + r + LABEL_GAP;
    const y = node.y;

    ctx.fillText(label, x, y);

    ctx.restore();
  };

  const periods: { key: PeriodKey; label: string }[] = [
    { key: "3D", label: "3일" },
    { key: "7D", label: "7일" },
    { key: "1M", label: "1개월" },
    { key: "YTD", label: "YTD" },
    { key: "1Y", label: "1년" },
    { key: "3Y", label: "3년" },
  ];

  const fmtReturn = (v?: number) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    const sign = v > 0 ? "+" : "";
    return `${sign}${v.toFixed(2)}%`;
  };

  const fmtPer = (v?: number) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return v.toFixed(2);
  };

  // ✅ Bloomberg hover helpers
  const fmtNum = (v?: number) => {
    if (typeof v !== "number" || !Number.isFinite(v)) return "—";
    return v.toLocaleString();
  };

  const fmtDate = (s?: string) => {
    if (!s) return "—";
    return String(s).slice(0, 10);
  };

  const ellipsis = (s?: string, max = 18) => {
    if (!s) return "—";
    const x = String(s);
    return x.length > max ? x.slice(0, max - 1) + "…" : x;
  };

  const getClose = (n: NodeT): number | undefined => {
    const m = n.metrics ?? {};
    return (
      pickNum(m.last_price) ??
      pickNum(m.close) ??
      pickNum((m as any).price) ??
      pickNum((m as any).lastPrice) ??
      pickNum(m["Close"]) ??
      pickNum(m["close"])
    );
  };

  const getMarketCap = (n: NodeT): number | undefined => {
    const m = n.metrics ?? {};
    return pickNum(m.market_cap) ?? pickNum(m.marketCap) ?? pickNum((m as any).mktcap) ?? pickNum((m as any).marketcap);
  };

  const getValDate = (n: NodeT): string | undefined => {
    const m = n.metrics ?? {};
    const s =
      (typeof m.valuationAsOf === "string" && m.valuationAsOf) ||
      (typeof (m as any).asof === "string" && (m as any).asof) ||
      (typeof (m as any).val_date === "string" && (m as any).val_date) ||
      (typeof (m as any).valuation_date === "string" && (m as any).valuation_date) ||
      (typeof (m as any).valuationDate === "string" && (m as any).valuationDate) ||
      undefined;
    return s;
  };

  const getTicker = (n: NodeT): string | undefined => {
    const m: any = n.metrics ?? {};
    const e: any = (n as any).exposure ?? {};
    return (
      (typeof e.ticker === "string" && e.ticker) ||
      (typeof m.ticker === "string" && m.ticker) ||
      (typeof n.ticker === "string" && n.ticker) ||
      undefined
    );
  };

  const getExchange = (n: NodeT): string | undefined => {
    const m: any = n.metrics ?? {};
    const e: any = (n as any).exposure ?? {};
    return (
      (typeof e.exchange === "string" && e.exchange) ||
      (typeof m.exchange === "string" && m.exchange) ||
      (typeof n.exchange === "string" && n.exchange) ||
      undefined
    );
  };

  const getCountry = (n: NodeT): string | undefined => {
    const m: any = n.metrics ?? {};
    const e: any = (n as any).exposure ?? {};
    return (
      (typeof e.country === "string" && e.country) ||
      (typeof m.country === "string" && m.country) ||
      (typeof n.country === "string" && n.country) ||
      undefined
    );
  };

  const handleSelect = (n: NodeT | null) => onSelectNode?.(n);

  const tooltipStyle = (W = 290, H = 215) => {
    const pad = 14;
    let left = mousePos.x + pad;
    let top = mousePos.y + pad;

    if (left + W + 10 > size.w) left = mousePos.x - W - pad;
    if (top + H + 10 > size.h) top = mousePos.y - H - pad;

    left = Math.max(12, Math.min(size.w - W - 12, left));
    top = Math.max(12, Math.min(size.h - H - 12, top));

    return { left, top, width: W };
  };

  const hoverType = hoverNode ? normType(hoverNode.type) : "";
  const isAssetHover = hoverType === "ASSET";
  const isThemeHover = hoverType === "THEME";
  const isFieldHover = hoverType === "FIELD";
  const isMacroHover = hoverType === "MACRO" || (hoverNode?.id ?? "").startsWith("M_");
  const isCharacterHover = hoverType === "CHARACTER" || (hoverNode?.id ?? "").startsWith("C_");
  const hoverLabel = hoverNode ? resolveLabel(hoverNode, themeName) : "";

  // ✅ 0~1000 scale, 10-tier (matches themeReturn.ts tempByScore)
  const tempByScore = (s: number) => {
    const v = Math.max(0, Math.min(1000, s));
    if (v >= 900) return { name: "BLAZING", color: "#7a0119" };
    if (v >= 800) return { name: "HOT", color: "#b11226" };
    if (v >= 700) return { name: "WARM+", color: "#d72638" };
    if (v >= 600) return { name: "WARM", color: "#ef476f" };
    if (v >= 500) return { name: "NEUTRAL+", color: "#ff9e5e" };
    if (v >= 400) return { name: "NEUTRAL", color: "#6b7280" };
    if (v >= 300) return { name: "COOL", color: "#4d96ff" };
    if (v >= 200) return { name: "COOL-", color: "#3a68c9" };
    if (v >= 100) return { name: "COLD", color: "#1f3c88" };
    return { name: "FROZEN", color: "#0a1f5c" };
  };

  const hoverLinkLabel = hoverLink?.type?.toString?.() || hoverLink?.label?.toString?.() || "";

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {/* 🎯 Full Asset toggle — 숨겨진 자산이 있을 때만 표시 */}
      {assetRankInfo.hiddenAssetCount > 0 && (
        <button
          type="button"
          onClick={() => setExpanded((e) => !e)}
          className="absolute bottom-3 right-3 z-30 rounded-lg px-3 py-1.5 text-[11px] font-medium transition hover:brightness-125"
          style={{
            background: "#1A3450",
            color: "#60A5FA",
            border: "1px solid #3B82F6",
          }}
          title={expanded ? "상위 10개만 보기" : "전체 종목 보기"}
        >
          {expanded
            ? "접기 ▲"
            : `전체 종목 보기 (+ ${assetRankInfo.hiddenAssetCount}개) ▼`}
        </button>
      )}

      {/* ✅ Overlay controls (period 버튼만, 필요 시 표시) */}
      {showOverlayControls && showPeriodButtons && (
        <div className="absolute right-3 top-3 z-30 flex items-center gap-3">
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-black/40 p-1">
            {periods.map((p) => {
              const active = p.key === period;
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => onChangePeriod(p.key)}
                  className={[
                    "rounded-lg px-2.5 py-1 text-[11px] transition",
                    active ? "bg-white/15 text-white" : "text-white/70 hover:bg-white/10 hover:text-white",
                  ].join(" ")}
                  title={`수익률 기간: ${p.label}`}
                >
                  {p.label}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ✅ Node tooltip (Bloomberg style) — per-type */}
      {hoverNode && (() => {
        const W = isAssetHover ? 290 : 240;
        const H = isAssetHover ? 220 : 110;
        const typeLabel =
          isAssetHover ? "ASSET"
          : isThemeHover ? "THEME"
          : isFieldHover ? "BUSINESS FIELD"
          : isMacroHover ? "MACRO"
          : isCharacterHover ? "CHARACTER"
          : (hoverNode.type ?? "NODE");

        const perDisp = isAssetHover ? getDisplayPer(hoverNode) : { value: undefined, kind: null };

        // THEME hover: barometer score
        const overall =
          themeReturn && (themeReturn as any).ok === true
            ? Number((themeReturn as any).overallScore)
            : NaN;
        const temp = Number.isFinite(overall) ? tempByScore(overall) : null;

        return (
          <div
            className="pointer-events-none absolute z-40 rounded-xl border border-white/10 bg-black/80 px-4 py-3 text-xs text-white/90 backdrop-blur"
            style={tooltipStyle(W, H)}
          >
            {/* Title row: TYPE badge + label */}
            <div className="flex items-center gap-2">
              <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-white/80">
                {typeLabel}
              </span>
              <div className="text-sm font-bold">{hoverLabel || hoverNode.id}</div>
            </div>

            {isAssetHover && (
              <>
                <div className="mt-2 text-[13px] font-semibold text-white/95">
                  {period} return:{" "}
                  <span style={{ color: (() => {
                    const rv = getReturnByPeriod(hoverNode, period);
                    if (typeof rv !== "number" || !Number.isFinite(rv)) return "#ffffff";
                    return rv > 0 ? "#FF4444" : rv < 0 ? "#4444FF" : "#ffffff";
                  })() }}>
                    {fmtReturn(getReturnByPeriod(hoverNode, period))}
                  </span>
                </div>

                <div className="my-3 h-px bg-white/10" />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <div className="text-white/60">Close</div>
                    <div className="text-sm font-semibold">{fmtNum(getClose(hoverNode))}</div>
                  </div>

                  <div>
                    <div className="text-white/60">MKT CAP</div>
                    <div className="text-sm font-semibold">{fmtNum(getMarketCap(hoverNode))}</div>
                  </div>

                  <div>
                    <div className="text-white/60">PER ({perDisp.kind ?? "Trailing"})</div>
                    <div className="text-sm font-semibold">{fmtPer(perDisp.value)}</div>
                  </div>

                  <div>
                    <div className="text-white/60">VAL DATE</div>
                    {(() => {
                      const raw = getValDate(hoverNode);
                      const s = staleLevel(raw);
                      const color = s === 0 ? "" : s === 1 ? "text-amber-300" : "text-red-400";
                      const badge = s === 0 ? null : staleLabel(raw);
                      return (
                        <div className={`text-sm font-semibold ${color}`}>
                          {fmtDate(raw)}
                          {badge ? (
                            <span className="ml-1 text-[10px] font-medium opacity-80">⚠ {badge}</span>
                          ) : null}
                        </div>
                      );
                    })()}
                  </div>
                </div>

                <div className="mt-3 space-y-1 text-white/80">
                  <div>
                    Ticker : <span className="text-white">{ellipsis(getTicker(hoverNode))}</span>
                  </div>
                  <div>
                    Exchange : <span className="text-white">{ellipsis(getExchange(hoverNode))}</span>
                  </div>
                  <div>
                    Country : <span className="text-white">{ellipsis(getCountry(hoverNode))}</span>
                  </div>
                </div>
              </>
            )}

            {isThemeHover && (
              <div className="mt-2 space-y-1.5">
                {temp ? (
                  <div className="flex items-center gap-2">
                    <span
                      className="rounded px-1.5 py-0.5 text-[10px] font-extrabold text-black"
                      style={{ background: temp.color, color: "#fff" }}
                    >
                      {temp.name}
                    </span>
                    <span className="text-sm font-bold text-white">{Math.round(overall)}</span>
                    <span className="text-white/60">/ 100</span>
                  </div>
                ) : (
                  <div className="text-white/60">Barometer 데이터 없음</div>
                )}
                <div className="text-white/60">{hoverNode.id}</div>
              </div>
            )}

            {isMacroHover && (
              <div className="mt-2 space-y-1 text-white/80">
                <div>
                  Type :{" "}
                  <span className="text-white">
                    {(hoverNode as any)?.macro_type ?? (hoverNode as any)?.macroType ?? "—"}
                  </span>
                </div>
                <div className="text-white/60">{hoverNode.id}</div>
              </div>
            )}

            {isFieldHover && (
              <div className="mt-2 text-white/60">{hoverNode.id}</div>
            )}

            {isCharacterHover && (
              <div className="mt-2 text-white/60">{hoverNode.id}</div>
            )}
          </div>
        );
      })()}

      {/* Edge tooltip */}
      {hoverLink && hoverLinkLabel && (
        <div
          className="pointer-events-none absolute z-40 rounded-lg border border-white/10 bg-black/75 px-3 py-2 text-xs text-white/90"
          style={tooltipStyle(240, 60)}
        >
          <div className="font-semibold">관계</div>
          <div className="mt-1 text-white/80">{hoverLinkLabel}</div>
        </div>
      )}

      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="rgba(0,0,0,0)"
        nodeRelSize={4}
        linkColor={(l: any) => {
          const a = getEdgeOpacity(l);
          return `rgba(255,255,255,${(0.45 * a).toFixed(3)})`;
        }}
        linkWidth={0.8}
        linkCurvature={(l: any) => l?.curvature ?? 0}
        linkDirectionalArrowLength={6}
        linkDirectionalArrowRelPos={0.92}
        linkDirectionalArrowColor={(l: any) => {
          const a = getEdgeOpacity(l);
          return `rgba(255,255,255,${(0.8 * a).toFixed(3)})`;
        }}
        linkHoverPrecision={8}
        linkLabel={(l: any) => (l?.type ?? l?.label ?? "").toString()}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "replace"}
        onNodeHover={(n: any) => {
          setHoverNode(n ? (n as NodeT) : null);
          if (n) setHoverLink(null);
        }}
        onLinkHover={(l: any) => {
          setHoverLink(l || null);
          if (l) setHoverNode(null);
        }}
        onBackgroundClick={() => {
          setHoverNode(null);
          setHoverLink(null);
          handleSelect(null);
        }}
        onNodeClick={(n: any) => handleSelect(n ? (n as NodeT) : null)}
        onMouseMove={(ev: any) => {
          const ox = ev?.offsetX;
          const oy = ev?.offsetY;

          if (typeof ox === "number" && typeof oy === "number") {
            setMousePos({ x: ox, y: oy });
            return;
          }

          const rect = wrapRef.current?.getBoundingClientRect();
          const cx = ev?.clientX;
          const cy = ev?.clientY;

          if (rect && typeof cx === "number" && typeof cy === "number") {
            setMousePos({
              x: Math.max(0, Math.min(rect.width, cx - rect.left)),
              y: Math.max(0, Math.min(rect.height, cy - rect.top)),
            });
            return;
          }

          setMousePos({ x: 0, y: 0 });
        }}
        cooldownTicks={120}
        warmupTicks={120}
        d3AlphaDecay={0.08}
        d3VelocityDecay={0.6}
      />
    </div>
  );
}