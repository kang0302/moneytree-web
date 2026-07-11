// src/components/MiniThemeGraph.tsx
// 테마의 노드/엣지 수를 기반으로 결정적(seed=themeId) 미니 네트워크 썸네일을 그린다.
// 온도 상세 페이지의 "그래프 모델 카드" 느낌을 재현.

"use client";

import React, { useMemo } from "react";

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

export default function MiniThemeGraph({
  seed,
  nodes,
  edges,
  color,
}: {
  seed: string;
  nodes: number;
  edges: number;
  color: string;
}) {
  const W = 260;
  const H = 132;

  const model = useMemo(() => {
    const rnd = mulberry32(hashStr(seed || "x"));
    const cx = W / 2;
    const cy = H / 2 + 2;
    const outer = Math.max(4, Math.min((nodes || 6) - 1, 15));
    const pts: { x: number; y: number; r: number }[] = [];
    for (let i = 0; i < outer; i++) {
      const ang = (i / outer) * Math.PI * 2 + (rnd() - 0.5) * 0.55;
      const rad = 30 + rnd() * 22;
      pts.push({
        x: cx + Math.cos(ang) * rad * 1.55,
        y: cy + Math.sin(ang) * rad * 0.92,
        r: 3.4 + rnd() * 2.6,
      });
    }
    const links: [number, number][] = [];
    for (let i = 0; i < outer; i++) links.push([-1, i]); // center hub → outer
    const cross = Math.max(0, Math.min(outer, Math.round(((edges || nodes) - nodes) / 2)));
    for (let i = 0; i < cross; i++) {
      const a = Math.floor(rnd() * outer);
      const b = Math.floor(rnd() * outer);
      if (a !== b) links.push([a, b]);
    }
    return { cx, cy, pts, links };
  }, [seed, nodes, edges]);

  const { cx, cy, pts, links } = model;

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="h-full w-full" preserveAspectRatio="xMidYMid meet">
      {/* edges */}
      <g stroke={color} strokeOpacity={0.35} strokeWidth={0.8}>
        {links.map(([a, b], i) => {
          const p1 = a === -1 ? { x: cx, y: cy } : pts[a];
          const p2 = b === -1 ? { x: cx, y: cy } : pts[b];
          if (!p1 || !p2) return null;
          return <line key={i} x1={p1.x} y1={p1.y} x2={p2.x} y2={p2.y} />;
        })}
      </g>
      {/* outer nodes */}
      <g>
        {pts.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.r}
            fill="rgba(255,255,255,0.9)"
            stroke={color}
            strokeWidth={1}
          />
        ))}
      </g>
      {/* center hub */}
      <circle cx={cx} cy={cy} r={6.5} fill={color} stroke="rgba(255,255,255,0.85)" strokeWidth={1.3} />
    </svg>
  );
}
