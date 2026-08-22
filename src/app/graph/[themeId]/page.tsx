// src/app/graph/[themeId]/page.tsx
// UI COMPACT v1 - 2026-02-16
// - Server: loads theme JSON and passes to GraphClient
// - Remove big header here (moved into GraphClient header)
// - Reduce margins / maximize graph area (full-height flex, min paddings)

import path from "path";
import fs from "fs";
import { notFound } from "next/navigation";
import GraphClient from "./GraphClient";
const GITHUB_OWNER = "kang0302";
const GITHUB_REPO  = "import_MT";
const FALLBACK_BRANCH = "main";

// 서버(SSR) 전용 import_MT 원격 fetch — GITHUB_TOKEN 있으면 인증 API(private 대응), 없으면 raw.
function importMtRemote(pathRel: string): { url: string; headers: Record<string, string> } {
  const token = process.env.GITHUB_TOKEN;
  if (token) {
    return {
      url: `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${pathRel}?ref=${FALLBACK_BRANCH}`,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.raw",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "knowvest",
      },
    };
  }
  return {
    url: `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${FALLBACK_BRANCH}/${pathRel}`,
    headers: { Accept: "application/json" },
  };
}

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
  meta?: {
    description?: string;
    notes?: string;
    [k: string]: any;
  };
  nodes?: NodeT[];
  edges?: EdgeT[];
  links?: EdgeT[];
};

/** public/data/theme_descriptions.json 의 themeId → 큐레이션 설명. 매 요청 fresh read. */
function getCuratedDescription(themeId: string): string {
  try {
    const filePath = path.join(process.cwd(), "public", "data", "theme_descriptions.json");
    const text = fs.readFileSync(filePath, "utf8");
    const dict = JSON.parse(text) as Record<string, string>;
    return (dict?.[themeId] ?? "").trim();
  } catch {
    return "";
  }
}

async function tryFetchThemeJson(url: string, themeId: string, headers?: Record<string, string>): Promise<ThemeJsonT | null> {
  try {
    // GitHub raw는 Fastly CDN(~5분) 캐시 → 테마 데이터 편집 직후 stale 방지 위해 캐시버스팅.
    const bustedUrl = /^https?:/i.test(url)
      ? url + (url.includes("?") ? "&" : "?") + `_cb=${Date.now()}`
      : url;
    const res = await fetch(bustedUrl, { cache: "no-store", headers: headers ?? { Accept: "application/json" } });
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
  // 1) 원격(import_MT) — GITHUB_TOKEN 있으면 인증 API(private), 없으면 raw. 편집 직후 최신 반영.
  const { url, headers } = importMtRemote(`data/theme/${themeId}.json`);
  const primary = await tryFetchThemeJson(url, themeId, headers);
  if (primary) return primary;

  // 2) 로컬 파일 fallback (원격 실패·private 미인증·git conflict 시 안전망 — 배포 시 항상 동기)
  const local = tryReadLocalThemeJson(themeId);
  if (local) {
    console.log("[theme-json] ok (local file):", themeId);
    return local;
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
  // description 우선순위: meta.description (정식) > theme_descriptions.json (큐레이션). meta.notes 는 내부 메모라 제외.
  const themeDescription =
    (data.meta?.description ?? "").trim() || getCuratedDescription(themeId);
  // ✅ 테마 큐레이션 로그 (meta.changelog[])
  const changelog = Array.isArray(data.meta?.changelog) ? data.meta.changelog : [];
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
    <main className="min-h-screen w-full bg-black text-white">
      <div className="flex w-full flex-col px-2 py-2">
        {/* nodes/edges: page 로컬 NodeT/EdgeT ↔ GraphClient NodeT/EdgeT 구조 동일하나 선언이 분리돼
            TS가 별개 타입으로 인식 → 경계에서 캐스팅(런타임 동작 불변). */}
        <GraphClient
          themeId={themeId}
          themeName={themeName}
          themeDescription={themeDescription}
          changelog={changelog}
          nodes={nodes as never}
          edges={edges as never}
        />
      </div>
    </main>
  );
}