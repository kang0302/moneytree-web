// src/app/graph/[themeId]/page.tsx
// UI COMPACT v1 - 2026-02-16
// - Server: loads theme JSON and passes to GraphClient
// - Remove big header here (moved into GraphClient header)
// - Reduce margins / maximize graph area (full-height flex, min paddings)

import path from "path";
import fs from "fs";
import { notFound } from "next/navigation";
import GraphClient from "./GraphClient";
import { getThemeJsonUrl } from "@/lib/getThemeJsonUrl";

const GITHUB_OWNER = "kang0302";
const GITHUB_REPO  = "import_MT";
/** 설정된 브랜치에 파일이 없을 때 사용하는 fallback 브랜치 */
const FALLBACK_BRANCH = "main";

type NodeT = {
  id: string;
  name?: string;
  label?: string;
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
  from?: string;
  to?: string;
  source?: string;
  target?: string;
  type?: string;
  label?: string;
  [k: string]: any;
};

type ThemeJsonT = {
  themeId?: string;
  themeName?: string;
  nodes?: NodeT[];
  edges?: EdgeT[];
  links?: EdgeT[];
};

async function tryFetchThemeJson(url: string, themeId: string): Promise<ThemeJsonT | null> {
  try {
    const res = await fetch(url, { cache: "no-store", headers: { Accept: "application/json" } });
    if (!res.ok) return null;
    const text = await res.text();
    const parsed = JSON.parse(text) as ThemeJsonT;
    console.log("[theme-json] ok:", url, "nodes:", Array.isArray(parsed?.nodes) ? parsed.nodes.length : 0);
    return parsed;
  } catch {
    return null;
  }
}

/** 로컬 public/data/theme/{themeId}.json 에서 직접 읽기 (git conflict 파일의 안전한 fallback) */
function tryReadLocalThemeJson(themeId: string): ThemeJsonT | null {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "theme", `${themeId}.json`);
    const text = fs.readFileSync(filePath, "utf8");
    return JSON.parse(text) as ThemeJsonT;
  } catch {
    return null;
  }
}

async function fetchThemeJson(themeId: string): Promise<ThemeJsonT | null> {
  // 1) 설정된 브랜치 시도
  const primaryUrl = getThemeJsonUrl(themeId);
  console.log("[theme-json] primary url =", primaryUrl);
  const primary = await tryFetchThemeJson(primaryUrl, themeId);
  if (primary) return primary;

  // 2) 로컬 파일 fallback (GitHub 파일에 git conflict 마커가 있을 때 유효)
  const local = tryReadLocalThemeJson(themeId);
  if (local) {
    console.log("[theme-json] ok (local file):", themeId);
    return local;
  }

  // 3) fallback: main 브랜치
  const fallbackUrl = `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${FALLBACK_BRANCH}/data/theme/${themeId}.json`;
  if (fallbackUrl !== primaryUrl) {
    console.log("[theme-json] fallback url =", fallbackUrl);
    const fallback = await tryFetchThemeJson(fallbackUrl, themeId);
    if (fallback) return fallback;
  }

  console.error("[theme-json] all sources failed for", themeId);
  return null;
}

export default async function GraphPage({
  params,
}: {
  params: Promise<{ themeId: string }> | { themeId: string };
}) {
  const p = await Promise.resolve(params as any);
  const themeId = (p?.themeId ?? "").trim();

  console.log("[graph-page] incoming themeId =", themeId);

  if (!themeId) {
    console.error("[graph-page] empty themeId");
    return notFound();
  }

  const data = await fetchThemeJson(themeId);

  if (!data) {
    console.error("[graph-page] no data returned for", themeId);
    return notFound();
  }

  const themeName = (data.themeName ?? data.themeId ?? themeId).trim();
  const nodes = Array.isArray(data.nodes) ? data.nodes : [];

  // edges 없고 links만 있는 파일도 흡수
  const rawEdges = Array.isArray(data.edges)
    ? data.edges
    : Array.isArray(data.links)
      ? data.links
      : [];

  // source/target 형식을 from/to로 정규화
  const edges: EdgeT[] = rawEdges.map((e) => ({
    ...e,
    from: e.from ?? e.source,
    to: e.to ?? e.target,
  }));

  console.log(
    "[graph-page] normalized:",
    JSON.stringify({
      themeId,
      themeName,
      nodeCount: nodes.length,
      edgeCount: edges.length,
    })
  );

  return (
    <main className="h-screen w-full bg-black text-white">
      <div className="flex h-full w-full flex-col px-2 py-2">
        <div className="min-h-0 flex-1">
          <GraphClient
            themeId={themeId}
            themeName={themeName}
            nodes={nodes}
            edges={edges}
          />
        </div>
      </div>
    </main>
  );
}