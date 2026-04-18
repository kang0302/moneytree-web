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
const LINK_DIST_SCALE = 1.12; // 링크 거리 약 +12%
const CHARGE_STRENGTH = -620; // -520 -> -620 (약간 더 분산)
const COLLIDE_PAD_BASE = 22;
const COLLIDE_PAD = Math.round(COLLIDE_PAD_BASE * TEXT_SCALE); // 22 -> 33

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

  const graphData = useMemo(() => {
    const safeNodes = Array.isArray(nodes) ? nodes : [];
    const safeEdges = Array.isArray(edges) ? edges : [];

    const clonedNodes: NodeT[] = safeNodes.map((n) => ({
      ...n,
      metrics: n.metrics ? { ...n.metrics } : n.metrics,
    }));

    const links = safeEdges
      .map((e) => {
        const { s, t } = pickEdgeEndpoints(e);
        if (!s || !t) return null;

        const rel = pickRelType(e);
        return { source: s, target: t, type: rel, label: rel };
      })
      .filter(Boolean) as any[];

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
  }, [nodes, edges]);

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

    theme.fx = lockTheme ? cx : null;
    theme.fy = lockTheme ? cy : null;

    const rest = ns.filter((n) => n.id !== theme.id);
    const assets = rest.filter((n) => normType(n.type) === "ASSET");
    const fields = rest.filter((n) => normType(n.type) === "FIELD");
    const others = rest.filter((n) => {
      const t = normType(n.type);
      return t !== "ASSET" && t !== "FIELD";
    });

    const base = Math.min(size.w, size.h);
    const r1 = base * 0.30;
    const r2 = base * 0.46;
    const r3 = base * 0.36;

    const placeRing = (arr: NodeT[], radius: number, phase: number) => {
      if (!arr.length) return;
      arr.forEach((n, i) => {
        const a = phase + (i / arr.length) * Math.PI * 2;
        n.x = cx + Math.cos(a) * radius;
        n.y = cy + Math.sin(a) * radius;
        n.vx = 0;
        n.vy = 0;
        n.fx = null;
        n.fy = null;
      });
    };

    placeRing(assets, r1, -Math.PI / 10);
    placeRing(fields, r2, Math.PI / 7);
    placeRing(others, r3, Math.PI / 3);

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

    fg.d3Force("link")?.distance((l: any) => {
      const s = l.source?.id ?? l.source;
      const t = l.target?.id ?? l.target;

      const sn = graphData.nodes.find((n) => n.id === s);
      const tn = graphData.nodes.find((n) => n.id === t);

      const st = normType(sn?.type);
      const tt = normType(tn?.type);

      // 기존 값을 살짝 늘려 텍스트 확대에 따른 겹침 완화
      if (s === themeNodeId || t === themeNodeId) return Math.round(200 * LINK_DIST_SCALE); // 224
      if ((st === "ASSET" && tt === "FIELD") || (st === "FIELD" && tt === "ASSET"))
        return Math.round(155 * LINK_DIST_SCALE); // 174
      if (st === "ASSET" && tt === "ASSET") return Math.round(120 * LINK_DIST_SCALE); // 134
      return Math.round(105 * LINK_DIST_SCALE); // 118
    });

    fg.d3Force("charge")?.strength(CHARGE_STRENGTH);

    fg.d3Force("collide")?.radius((n: any) => {
      const isTheme = n?.id === themeNodeId;
      // 텍스트 확대에 맞춰 충돌 반경도 확대
      return nodeRadius(n, isTheme) + COLLIDE_PAD;
    });

    fg.d3Force("center")?.strength?.(0.06);
    fg.d3ReheatSimulation();
  }, [graphData.nodes, themeNodeId]);

  const drawNode = (node: any, ctx: CanvasRenderingContext2D) => {
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
                    <div className="text-sm font-semibold">{fmtDate(getValDate(hoverNode))}</div>
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
        linkColor={() => "rgba(255,255,255,0.45)"}
        linkWidth={0.8}
        linkHoverPrecision={8}
        linkLabel={(l: any) => (l?.type ?? l?.label ?? "").toString()}
        nodeCanvasObject={drawNode}
        nodeCanvasObjectMode={() => "after"}
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
        cooldownTicks={0}
        warmupTicks={70}
      />
    </div>
  );
}