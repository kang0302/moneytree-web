// src/components/MiniThemeGraph.tsx
// 테마의 실제 노드/엣지로 Fruchterman-Reingold force 레이아웃을 계산(모듈 캐시)해
// 미니 네트워크 썸네일을 그린다. 노드는 실제 타입 색으로 채색.

"use client";

import React, { useMemo } from "react";
import { MiniGraph } from "@/lib/loadThemes";

// 그래프 노드 타입별 색 (ForceGraphWrapper.nodeBaseColor 와 동일 팔레트)
const TYPE_COLOR: Record<string, string> = {
  THEME: "#F2C94C",
  ASSET: "#22d3ee",
  FIELD: "#D946EF",
  MACRO: "#FB923C",
  CHARACTER: "#34d399",
  OTHER: "#9CA3AF",
};
const TYPE_R: Record<string, number> = {
  THEME: 6.5,
  ASSET: 4,
  FIELD: 3.2,
  MACRO: 3.2,
  CHARACTER: 3,
  OTHER: 3,
};

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Layout = {
  pos: { x: number; y: number }[];
  edges: [number, number][];
  types: string[];
};

// 모듈 레벨 캐시 (재렌더/재진입 시 재계산 방지)
const layoutCache = new Map<string, Layout>();

function computeLayout(seed: string, g: MiniGraph): Layout {
  const key = `${seed}:${g.nodes.length}:${g.edges.length}`;
  const cached = layoutCache.get(key);
  if (cached) return cached;

  const W = 260;
  const H = 128;
  const n = g.nodes.length;
  const idx = new Map(g.nodes.map((nd, i) => [nd.id, i]));
  const E: [number, number][] = [];
  for (const [a, b] of g.edges) {
    const ia = idx.get(a);
    const ib = idx.get(b);
    if (ia != null && ib != null && ia !== ib) E.push([ia, ib]);
  }

  const rnd = mulberry32(hashStr(seed || "x"));
  const px = new Float64Array(n);
  const py = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const ang = rnd() * Math.PI * 2;
    const r = 8 + rnd() * 40;
    px[i] = Math.cos(ang) * r;
    py[i] = Math.sin(ang) * r;
  }

  // Fruchterman-Reingold
  const area = W * H;
  const k = 0.62 * Math.sqrt(area / Math.max(1, n));
  const iters = 90;
  let temp = W / 8;
  const cool = temp / (iters + 1);
  const dispx = new Float64Array(n);
  const dispy = new Float64Array(n);

  for (let it = 0; it < iters; it++) {
    dispx.fill(0);
    dispy.fill(0);
    // 반발력
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        let dx = px[i] - px[j];
        let dy = py[i] - py[j];
        let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
        const f = (k * k) / d;
        const ux = dx / d;
        const uy = dy / d;
        dispx[i] += ux * f;
        dispy[i] += uy * f;
        dispx[j] -= ux * f;
        dispy[j] -= uy * f;
      }
    }
    // 인력 (엣지)
    for (const [a, b] of E) {
      let dx = px[a] - px[b];
      let dy = py[a] - py[b];
      let d = Math.sqrt(dx * dx + dy * dy) || 0.01;
      const f = (d * d) / k;
      const ux = dx / d;
      const uy = dy / d;
      dispx[a] -= ux * f;
      dispy[a] -= uy * f;
      dispx[b] += ux * f;
      dispy[b] += uy * f;
    }
    // 위치 갱신(온도 제한) + 약한 중심 인력
    for (let i = 0; i < n; i++) {
      let d = Math.sqrt(dispx[i] * dispx[i] + dispy[i] * dispy[i]) || 0.01;
      px[i] += (dispx[i] / d) * Math.min(d, temp);
      py[i] += (dispy[i] / d) * Math.min(d, temp);
      px[i] *= 0.995;
      py[i] *= 0.995;
    }
    temp -= cool;
  }

  // 바운딩 박스 → viewBox(패딩) 정규화
  let minx = Infinity,
    miny = Infinity,
    maxx = -Infinity,
    maxy = -Infinity;
  for (let i = 0; i < n; i++) {
    if (px[i] < minx) minx = px[i];
    if (py[i] < miny) miny = py[i];
    if (px[i] > maxx) maxx = px[i];
    if (py[i] > maxy) maxy = py[i];
  }
  const pad = 12;
  const bw = Math.max(1, maxx - minx);
  const bh = Math.max(1, maxy - miny);
  const s = Math.min((W - pad * 2) / bw, (H - pad * 2) / bh);
  const ox = (W - bw * s) / 2;
  const oy = (H - bh * s) / 2;
  const pos = g.nodes.map((_, i) => ({
    x: ox + (px[i] - minx) * s,
    y: oy + (py[i] - miny) * s,
  }));

  const out: Layout = { pos, edges: E, types: g.nodes.map((nd) => nd.t) };
  layoutCache.set(key, out);
  return out;
}

export default function MiniThemeGraph({ seed, graph }: { seed: string; graph: MiniGraph | null }) {
  const layout = useMemo(() => (graph && graph.nodes.length ? computeLayout(seed, graph) : null), [seed, graph]);
  if (!layout) {
    return <div className="flex h-full w-full items-center justify-center text-[10px] text-white/25">그래프 없음</div>;
  }
  const { pos, edges, types } = layout;
  return (
    <svg viewBox="0 0 260 128" className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      <g stroke="rgba(255,255,255,0.22)" strokeWidth={0.7}>
        {edges.map(([a, b], i) => {
          const p1 = pos[a];
          const p2 = pos[b];
          if (!p1 || !p2) return null;
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
        })}
      </g>
      <g>
        {pos.map((p, i) => {
          const ty = types[i] || "OTHER";
          return (
            <circle
              key={i}
              cx={p.x}
              cy={p.y}
              r={TYPE_R[ty] ?? 3}
              fill={TYPE_COLOR[ty] ?? TYPE_COLOR.OTHER}
              stroke="rgba(0,0,0,0.35)"
              strokeWidth={0.6}
            />
          );
        })}
      </g>
    </svg>
  );
}
