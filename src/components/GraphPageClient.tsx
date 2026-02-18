"use client";

// src/components/GraphPageClient.tsx
import { useMemo, useState } from "react";
import ForceGraphWrapper from "@/components/ForceGraphWrapper";
import GraphRightPanel from "@/components/GraphRightPanel";

type ThemeNode = {
  id: string;
  name: string;
  type?: string;
  [key: string]: any;
};

type ThemeEdge = {
  from: string;
  to: string;
  type?: string;
  relType?: string;
  label?: string;
  [key: string]: any;
};

export default function GraphPageClient({
  themeId,
  themeName,
  nodes,
  edges,
}: {
  themeId: string;
  themeName: string;
  nodes: ThemeNode[];
  edges: ThemeEdge[];
}) {
  // ✅ 선택 노드(클릭)
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const selectedNode = useMemo(() => {
    if (!selectedNodeId) return null;
    return nodes.find((n) => n.id === selectedNodeId) ?? null;
  }, [selectedNodeId, nodes]);

  return (
    <div className="min-h-[100vh] w-full px-8 py-8 text-white">
      {/* 상단 제목 */}
      <div className="mb-4">
        <div className="text-4xl font-extrabold tracking-tight">{themeName}</div>
        <div className="mt-1 text-sm text-white/60">Theme ID: {themeId}</div>
        <div className="mt-3 text-sm text-white/60">
          nodes: {nodes.length} / edges: {edges.length}
        </div>
      </div>

      {/* ✅ 2/3 그래프 + 1/3 우측 패널 */}
      <div className="grid w-full grid-cols-12 gap-6">
        {/* LEFT: Graph */}
        <div className="col-span-12 lg:col-span-8">
          <div className="rounded-2xl border border-white/10 bg-black/30 p-4">
            {/* 그래프 박스 높이 확보 */}
            <div className="h-[70vh] min-h-[520px] w-full">
              <ForceGraphWrapper
                nodes={nodes}
                edges={edges}
                themeId={themeId}
                selectedNodeId={selectedNodeId}
                onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
                onClearSelect={() => setSelectedNodeId(null)}
              />
            </div>
          </div>
        </div>

        {/* RIGHT: Panel */}
        <div className="col-span-12 lg:col-span-4">
          <GraphRightPanel themeName={themeName} selectedNode={selectedNode} />
        </div>
      </div>
    </div>
  );
}
