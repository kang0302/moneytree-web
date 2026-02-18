// src/components/ForceGraphWrapper.tsx
// UI COMPACT v1 - 2026-02-16
// - Allow external control of lockTheme (header) + keep internal fallback
// - Allow hiding overlay controls (period buttons moved to header)
// - Preserve existing graph rendering / tooltips / edge mapping

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

function pickNum(v: any): number | undefined {
  return typeof v === "number" && Number.isFinite(v) ? v : undefined;
}

function getFwdPer(n: NodeT) {
  const m = n.metrics ?? {};
  return (
    pickNum(m.perFwd12m) ??
    pickNum(m.per_forward_12m) ??
    pickNum(m.forwardPER12m) ??
    pickNum(m.fwdPer12m) ??
    pickNum(m.fwd_per_12m) ??
    pickNum(m["per_fwd_12m"]) ??
    pickNum(m["perFwd12M"])
  );
}

function getTrailingPer(n: NodeT) {
  const m = n.metrics ?? {};
  return pickNum(m.per) ?? pickNum(m.pe) ?? pickNum(m.trailingPER) ?? pickNum(m.trailing_per) ?? pickNum(m.per_ttm);
}

function normalizePct(v: number) {
  return Math.abs(v) <= 1.5 ? v * 100 : v;
}

function getReturnByPeriod(n: NodeT, p: PeriodKey): number | undefined {
  const m = n.metrics ?? {};
  let v: number | undefined;

  switch (p) {
    case "3D":
      v = pickNum(m.ret3d) ?? pickNum(m.return3d) ?? pickNum(m.return_3d) ?? pickNum(m["3d"]);
      break;
    case "7D":
      v = pickNum(m.ret7d) ?? pickNum(m.return7d) ?? pickNum(m.return_7d) ?? pickNum(m["7d"]);
      break;
    case "1M":
      v =
        pickNum(m.ret1m) ??
        pickNum(m.return1m) ??
        pickNum(m.return30d) ??
        pickNum(m.return_30d) ??
        pickNum(m["30d"]);
      break;
    case "YTD":
      v = pickNum(m.retYtd) ?? pickNum(m.returnYtd) ?? pickNum(m.return_ytd) ?? pickNum(m["ytd"]);
      break;
    case "1Y":
      v = pickNum(m.ret1y) ?? pickNum(m.return1y) ?? pickNum(m.return_1y) ?? pickNum(m["1y"]);
      break;
    case "3Y":
      v = pickNum(m.ret3y) ?? pickNum(m.return3y) ?? pickNum(m.return_3y) ?? pickNum(m["3y"]);
      break;
  }

  if (typeof v !== "number") return undefined;
  return normalizePct(v);
}

function colorFromReturn(r?: number) {
  if (typeof r !== "number" || !Number.isFinite(r)) return "rgba(96,165,250,0.90)";

  const clamp = (x: number, a: number, b: number) => Math.max(a, Math.min(b, x));
  const v = clamp(r, -60, 60);
  const t = Math.abs(v) / 60;

  const base = { r: 148, g: 163, b: 184 };
  const pos = { r: 59, g: 130, b: 246 };
  const neg = { r: 239, g: 68, b: 68 };

  const mix = (a: any, b: any, tt: number) => ({
    r: Math.round(a.r + (b.r - a.r) * tt),
    g: Math.round(a.g + (b.g - a.g) * tt),
    b: Math.round(a.b + (b.b - a.b) * tt),
  });

  const target = v >= 0 ? pos : neg;
  const c = mix(base, target, t);
  return `rgba(${c.r},${c.g},${c.b},0.92)`;
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

      if (s === themeNodeId || t === themeNodeId) return 200;
      if ((st === "ASSET" && tt === "FIELD") || (st === "FIELD" && tt === "ASSET")) return 155;
      if (st === "ASSET" && tt === "ASSET") return 120;
      return 105;
    });

    fg.d3Force("charge")?.strength(-520);
    fg.d3Force("collide")?.radius((n: any) => {
      const isTheme = n?.id === themeNodeId;
      return nodeRadius(n, isTheme) + 22;
    });

    fg.d3Force("center")?.strength?.(0.06);
    fg.d3ReheatSimulation();
  }, [graphData.nodes, themeNodeId]);

  const drawNode = (node: any, ctx: CanvasRenderingContext2D) => {
    const isTheme = node.id === themeNodeId;
    const r = nodeRadius(node, isTheme);

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

    const fontSize = isTheme ? 11 : t === "ASSET" ? 10 : 9;
    ctx.font = `${fontSize}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.fillText(label, node.x + r + 8, node.y);
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

  const handleSelect = (n: NodeT | null) => onSelectNode?.(n);

  const tooltipStyle = (W = 260, H = 155) => {
    const pad = 14;
    let left = mousePos.x + pad;
    let top = mousePos.y + pad;

    if (left + W + 10 > size.w) left = mousePos.x - W - pad;
    if (top + H + 10 > size.h) top = mousePos.y - H - pad;

    left = Math.max(12, Math.min(size.w - W - 12, left));
    top = Math.max(12, Math.min(size.h - H - 12, top));

    return { left, top, width: W };
  };

  const isAssetHover = hoverNode && normType(hoverNode.type) === "ASSET";
  const hoverLabel = hoverNode ? resolveLabel(hoverNode, themeName) : "";

  const hoverLinkLabel = hoverLink?.type?.toString?.() || hoverLink?.label?.toString?.() || "";

  return (
    <div ref={wrapRef} className="relative h-full w-full">
      {/* ✅ Overlay controls (optional) */}
      {showOverlayControls && (
        <div className="absolute right-3 top-3 z-30 flex items-center gap-3">
          {/* Theme pin (if you still want to allow in-graph) */}
          <label className="flex items-center gap-2 rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white/80">
            <input type="checkbox" checked={lockTheme} onChange={(e) => setLockTheme(e.target.checked)} />
            <span className="font-semibold">THEME 고정</span>
          </label>

          {showPeriodButtons && (
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
          )}
        </div>
      )}

      {/* Node tooltip */}
      {hoverNode && (
        <div
          className="pointer-events-none absolute z-40 rounded-lg border border-white/10 bg-black/70 px-3 py-2 text-xs text-white/90"
          style={tooltipStyle(260, 155)}
        >
          <div className="font-semibold">{hoverLabel || hoverNode.id}</div>
          <div className="mt-1 text-white/60">type: {normType(hoverNode.type)}</div>

          {isAssetHover && (
            <>
              <div className="mt-2 text-white/80">
                PER (12M Fwd): <span className="text-white">{fmtPer(getFwdPer(hoverNode))}</span>
              </div>
              <div className="mt-1 text-white/80">
                PER (Trailing): <span className="text-white">{fmtPer(getTrailingPer(hoverNode))}</span>
              </div>
              <div className="mt-2 text-white/80">
                {period} return: <span className="text-white">{fmtReturn(getReturnByPeriod(hoverNode, period))}</span>
              </div>
            </>
          )}
        </div>
      )}

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
