// src/app/graph/[themeId]/page.tsx
// UI COMPACT v1 - 2026-02-16
// - Server: loads theme JSON and passes to GraphClient
// - Remove big header here (moved into GraphClient header)
// - Reduce margins / maximize graph area (full-height flex, min paddings)

import { notFound } from "next/navigation";
import GraphClient from "./GraphClient";
import { getThemeJsonUrl } from "@/lib/getThemeJsonUrl";

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
  [k: string]: any;
};

type EdgeT = {
  from: string;
  to: string;
  type?: string;
  label?: string;
  [k: string]: any;
};

type ResearchLinkT = {
  title?: string;
  url: string;
  oneLine?: string;
  publishedAt?: string;
  source?: string;
};

type ThemeJsonT = {
  themeId?: string;
  themeName?: string;
  nodes?: NodeT[];
  edges?: EdgeT[];
  researchLinks?: ResearchLinkT[];
};

async function fetchThemeJson(themeId: string): Promise<ThemeJsonT | null> {
  try {
    const url = getThemeJsonUrl(themeId);
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as ThemeJsonT;
  } catch {
    return null;
  }
}

export default async function GraphPage({
  params,
}: {
  params: Promise<{ themeId: string }> | { themeId: string };
}) {
  const p = await Promise.resolve(params as any);
  const themeId = (p?.themeId ?? "").trim();
  if (!themeId) return notFound();

  const data = await fetchThemeJson(themeId);
  if (!data) return notFound();

  const themeName = (data.themeName ?? themeId).trim();
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];
  const edges = Array.isArray(data.edges) ? data.edges : [];
  const researchLinks = Array.isArray(data.researchLinks) ? data.researchLinks : [];

  return (
    <main className="h-screen w-full bg-black text-white">
      {/* ✅ 최소 여백 + full height */}
      <div className="flex h-full w-full flex-col px-2 py-2">
        <div className="min-h-0 flex-1">
          <GraphClient
            themeId={themeId}
            themeName={themeName}
            nodes={nodes}
            edges={edges}
            researchLinks={researchLinks}
          />
        </div>
      </div>
    </main>
  );
}
