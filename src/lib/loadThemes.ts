// src/lib/loadThemes.ts
// 전 테마 index + 각 테마 JSON을 로드해 7D 스코어를 계산한 목록을 반환 (온도 상세 페이지용)

import { computeThemeReturnSummary, normalizeToPct, PeriodKey } from "./themeReturn";
import { resolvePlaceholderThemeNames } from "./themeIndex";
import { computeOverall } from "./marketTemp";

export type MiniNode = { id: string; t: string };
export type MiniGraph = { nodes: MiniNode[]; edges: [string, string][] };

export type ScoredTheme = {
  themeId: string;
  themeName: string;
  score: number | null;
  note: string | null;
  topMover: { name: string; ret?: number } | null;
  nodeCount: number;
  edgeCount: number;
  assetCount: number;
  graph: MiniGraph | null;
};

// 노드 타입 정규화 → THEME/ASSET/FIELD/MACRO/CHARACTER
function normType(rawType: any, id: string): string {
  const t = String(rawType ?? "").toUpperCase();
  if (t.includes("BUSINESS") || t.includes("FIELD")) return "FIELD";
  if (t === "THEME" || t === "ASSET" || t === "MACRO" || t === "CHARACTER") return t;
  const p = String(id ?? "");
  if (/^A_/i.test(p)) return "ASSET";
  if (/^M_/i.test(p)) return "MACRO";
  if (/^BF_/i.test(p)) return "FIELD";
  if (/^C_/i.test(p)) return "CHARACTER";
  if (/^T_/i.test(p)) return "THEME";
  return "OTHER";
}

function buildMiniGraph(tj: any): MiniGraph | null {
  const rawNodes = Array.isArray(tj?.nodes) ? tj.nodes : [];
  if (!rawNodes.length) return null;
  const NODE_CAP = 52;
  const EDGE_CAP = 130;
  const nodes: MiniNode[] = rawNodes.slice(0, NODE_CAP).map((n: any) => ({
    id: String(n?.id ?? ""),
    t: normType(n?.type, n?.id),
  }));
  const idset = new Set(nodes.map((n) => n.id));
  const rawEdges = Array.isArray(tj?.edges) ? tj.edges : Array.isArray(tj?.links) ? tj.links : [];
  const edges: [string, string][] = [];
  for (const e of rawEdges) {
    const a = String(e?.from ?? e?.source ?? "");
    const b = String(e?.to ?? e?.target ?? "");
    if (a && b && idset.has(a) && idset.has(b)) edges.push([a, b]);
    if (edges.length >= EDGE_CAP) break;
  }
  return { nodes, edges };
}

type ThemeIndexItem = { themeId: string; themeName: string };

const INDEX_URL_REMOTE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";
const INDEX_URL_LOCAL = "/data/theme/index.json";

function toThemeIndexList(idx: any): ThemeIndexItem[] {
  const list = idx?.themes ?? (Array.isArray(idx) ? idx : []);
  if (!Array.isArray(list)) return [];
  return list
    .map((t: any) => {
      const themeId = String(t?.themeId ?? "").trim();
      const themeName = String(t?.themeName ?? "").trim() || themeId;
      return { themeId, themeName };
    })
    .filter((t: ThemeIndexItem) => t.themeId);
}

function extractThemesFromText(text: string): ThemeIndexItem[] {
  const seen = new Set<string>();
  const out: ThemeIndexItem[] = [];
  for (const line of text.split(/\r?\n/)) {
    const idM = line.match(/"themeId"\s*:\s*"([^"]+)"/);
    const nmM = line.match(/"themeName"\s*:\s*"([^"]+)"/);
    if (!idM || !nmM) continue;
    const themeId = idM[1].trim();
    const themeName = nmM[1].trim();
    if (!themeId || !themeName || seen.has(themeId)) continue;
    seen.add(themeId);
    out.push({ themeId, themeName });
  }
  return out;
}

async function fetchIndexWithFallback(): Promise<ThemeIndexItem[]> {
  try {
    const res = await fetch(INDEX_URL_REMOTE, { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      try {
        const list = toThemeIndexList(JSON.parse(text));
        if (list.length) return list;
      } catch {}
      const list = extractThemesFromText(text);
      if (list.length) return list;
    }
  } catch {}
  try {
    const res = await fetch(INDEX_URL_LOCAL, { cache: "no-store" });
    if (res.ok) return toThemeIndexList(await res.json());
  } catch {}
  return [];
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, () => worker()));
  return out;
}

export async function loadScoredThemes(period: PeriodKey = "7D"): Promise<ScoredTheme[]> {
  let list = await fetchIndexWithFallback();
  list = await resolvePlaceholderThemeNames(list);
  return mapLimit(list, 6, async (row) => {
    const localUrl = `/data/theme/${row.themeId}.json`;
    const remoteUrl = `https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/${row.themeId}.json`;
    const tj = (await fetchJson<any>(localUrl)) ?? (await fetchJson<any>(remoteUrl));
    if (!tj?.nodes)
      return { ...row, score: null, note: null, topMover: null, nodeCount: 0, edgeCount: 0, assetCount: 0, graph: null };
    const nodeCount = Array.isArray(tj.nodes) ? tj.nodes.length : 0;
    const edgeCount = Array.isArray(tj.edges) ? tj.edges.length : Array.isArray(tj.links) ? tj.links.length : 0;
    const assetCount = Array.isArray(tj.nodes)
      ? tj.nodes.filter((n: any) => (n?.type ?? "").toUpperCase() === "ASSET").length
      : 0;
    const graph = buildMiniGraph(tj);
    const summary: any = computeThemeReturnSummary({ nodes: tj.nodes, edges: tj.edges ?? tj.links, period, minAssets: 5, topMoversN: 1 });
    if (!summary || summary.ok === false) {
      return { ...row, score: null, note: summary?.sentence ?? null, topMover: null, nodeCount, edgeCount, assetCount, graph };
    }
    const score = computeOverall(summary);
    const tm = (summary.topMovers ?? [])[0];
    const topMover = tm ? { name: String(tm.name || tm.id || ""), ret: normalizeToPct(tm.ret) ?? undefined } : null;
    return { ...row, score, note: summary.note ?? null, topMover, nodeCount, edgeCount, assetCount, graph };
  });
}
