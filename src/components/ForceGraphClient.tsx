"use client";

import React, { useMemo, useRef, useState, useEffect } from "react";
import dynamic from "next/dynamic";
import type { ForceGraphMethods } from "react-force-graph-2d";

// ✅ SSR 방지: 동적 import
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), {
  ssr: false,
});

type NodeItem = {
  id: string;
  type: string;
  name: string;
};

type EdgeItem = {
  from: string;
  to: string;
  type: string;
};

export default function ForceGraphClient({
  nodes,
  edges,
  onSelectNode,
}: {
  nodes: NodeItem[];
  edges: EdgeItem[];
  onSelectNode?: (n: NodeItem | null) => void;
}) {
  const fgRef = useRef<ForceGraphMethods>();
  const [dims, setDims] = useState({ w: 640, h: 520 });

  // ✅ 화면 크기 대응 (파일럿용)
  useEffect(() => {
    const onResize = () => {
      const w = Math.min(820, Math.max(520, window.innerWidth - 420));
      const h = Math.min(640, Math.max(420, window.innerHeight - 220));
      setDims({ w, h });
    };
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // ✅ ForceGraph 데이터 변환
  const graphData = useMemo(() => {
    return {
      nodes: nodes.map((n) => ({ ...n })),
      links: edges.map((e) => ({
        source: e.from,
        target: e.to,
        type: e.type,
      })),
    };
  }, [nodes, edges]);

  // ✅ THEME 노드 중앙 고정
  useEffect(() => {
    const themeNode = (graphData.nodes as any[]).find(
      (n) => n.type === "THEME"
    );
    if (themeNode) {
      themeNode.x = 0;
      themeNode.y = 0;
      themeNode.fx = 0;
      themeNode.fy = 0;
    }
  }, [graphData]);

  // ✅ 타입별 색상
  const nodeColor = (type: string) => {
    if (type === "THEME") return "#ffd166";
    if (type === "ASSET") return "#5dade2";
    if (type === "BUSINESS_FIELD") return "#58d68d";
    if (type === "MACRO") return "#af7ac5";
    return "#aaaaaa";
  };

  // ✅ 타입별 크기
  const nodeSize = (type: string) => {
    if (type === "THEME") return 10;
    if (type === "ASSET") return 6;
    if (type === "BUSINESS_FIELD") return 5;
    return 4;
  };

  return (
    <div style={{ width: "100%", overflow: "hidden" }}>
      <ForceGraph2D
        ref={fgRef as any}
        graphData={graphData as any}
        width={dims.w}
        height={dims.h}
        backgroundColor="#0b0b0b"
        linkColor={() => "rgba(255,255,255,0.25)"}
        linkWidth={(link: any) => (link.type ? 2 : 1)}
        nodeRelSize={4}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const label = node.name || node.id;
          const r = nodeSize(node.type);

          // 노드 원
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI, false);
          ctx.fillStyle = nodeColor(node.type);
          ctx.fill();

          // 확대 시 라벨 표시
          const fontSize = 12 / globalScale;
          if (globalScale > 1.4) {
            ctx.font = `${fontSize}px Sans-Serif`;
            ctx.fillStyle = "rgba(255,255,255,0.85)";
            ctx.textAlign = "left";
            ctx.textBaseline = "middle";
            ctx.fillText(label, node.x + r + 2, node.y);
          }
        }}
        onNodeClick={(node: any) => {
          onSelectNode?.({
            id: node.id,
            type: node.type,
            name: node.name,
          });
        }}
        onBackgroundClick={() => onSelectNode?.(null)}
        cooldownTicks={120}
        d3VelocityDecay={0.25}
      />
    </div>
  );
}
