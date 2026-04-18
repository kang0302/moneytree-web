"use client";

import React, { useEffect, useMemo, useState } from "react";
import { computeThemeReturnSummary, PeriodKey, normalizeToPct } from "@/lib/themeReturn";
import { resolvePlaceholderThemeNames } from "@/lib/themeIndex";

type ThemeIndexItem = {
  themeId: string;
  themeName: string;
  nodeCount?: number;
  edgeCount?: number;
  source?: string;
  updatedAt?: string;
};

type ThemeIndexFile = {
  themes: ThemeIndexItem[];
};

type ThemeJson = {
  themeId: string;
  themeName: string;
  nodes: any[];
  edges: any[];
};

// ✅ Top mover: id 포함 (focus 파라미터로 사용)
type Top3MoverUI = { id: string; name: string; ret?: number };

type ThemeRow = ThemeIndexItem & {
  barometerOverall7D?: number | null; // 0~100
  barometerNote?: string | null;
  topMovers?: Top3MoverUI[] | null;
};

const LS_RECENT = "mt_recent_themes_v1";
const LS_FAV = "mt_favorite_themes_v1";

type RecentItem = { themeId: string; themeName: string; at: number };
type FavItem = { themeId: string; themeName: string; at: number };

const INDEX_URL_REMOTE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";
const INDEX_URL_LOCAL  = "/data/theme/index.json";

/**
 * GitHub raw index.json이 JSON 문법 오류를 포함할 수 있으므로
 * text 레벨에서 line-by-line으로 추출한다.
 */
function extractThemesFromText(text: string): ThemeIndexItem[] {
  const seen = new Set<string>();
  const out: ThemeIndexItem[] = [];
  const lines = text.split(/\r?\n/);
  for (const line of lines) {
    const idM = line.match(/"themeId"\s*:\s*"([^"]+)"/);
    const nmM = line.match(/"themeName"\s*:\s*"([^"]+)"/);
    if (!idM || !nmM) continue;
    const themeId = idM[1].trim();
    const themeName = nmM[1].trim();
    if (!themeId || !themeName) continue;
    if (seen.has(themeId)) continue;
    seen.add(themeId);
    const ncM = line.match(/"nodeCount"\s*:\s*(\d+)/);
    const ecM = line.match(/"edgeCount"\s*:\s*(\d+)/);
    const srcM = line.match(/"source"\s*:\s*"([^"]+)"/);
    const updM = line.match(/"updatedAt"\s*:\s*"([^"]+)"/);
    out.push({
      themeId,
      themeName,
      nodeCount: ncM ? parseInt(ncM[1]) : undefined,
      edgeCount: ecM ? parseInt(ecM[1]) : undefined,
      source: srcM ? srcM[1] : undefined,
      updatedAt: updM ? updM[1] : undefined,
    });
  }
  return out;
}

async function fetchIndexWithFallback(): Promise<ThemeIndexItem[]> {
  // 1) GitHub raw 시도
  try {
    const res = await fetch(INDEX_URL_REMOTE, { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      // JSON 파싱 시도
      try {
        const json = JSON.parse(text);
        const list = toThemeIndexList(json);
        if (list.length > 0) return list;
      } catch {
        // JSON 오류 → text fallback
      }
      const list = extractThemesFromText(text);
      if (list.length > 0) return list;
    }
  } catch {}

  // 2) 로컬 fallback
  try {
    const res = await fetch(INDEX_URL_LOCAL, { cache: "no-store" });
    if (res.ok) {
      const json = await res.json();
      return toThemeIndexList(json);
    }
  } catch {}

  return [];
}

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    const v = JSON.parse(s ?? "");
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
}

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

// ✅ [COLOR RULE] return% -> font color (너가 원한 “배지 대신 글자색”)
function colorByReturnPct(r?: number): string {
  if (typeof r !== "number" || !Number.isFinite(r)) return "#aaaaaa";
  if (r >= 30) return "#b11226"; // Deep Red
  if (r >= 10) return "#ef476f"; // Red
  if (r > -10) return "#aaaaaa"; // Gray
  if (r > -30) return "#4d96ff"; // Blue
  return "#1f3c88"; // Deep Blue
}

// 동시 fetch 제한(브라우저 폭주 방지)
async function mapLimit<T, R>(items: T[], limit: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;

  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }

  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return out;
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

function toThemeIndexList(idx: any): ThemeIndexItem[] {
  // index.json 포맷 호환:
  // 1) { "themes": [ ... ] }
  // 2) [ ... ]
  const list = idx?.themes ?? (Array.isArray(idx) ? idx : []);
  if (!Array.isArray(list)) return [];
  return list
    .map((t: any) => {
      const themeId = String(t?.themeId ?? "").trim();
      // ✅ themeName이 비어 있어도 themeId만 있으면 일단 placeholder로 보존 (이후 resolvePlaceholderThemeNames에서 보정).
      const themeName = String(t?.themeName ?? "").trim() || themeId;
      return {
        themeId,
        themeName,
        nodeCount: typeof t?.nodeCount === "number" ? t.nodeCount : undefined,
        edgeCount: typeof t?.edgeCount === "number" ? t.edgeCount : undefined,
        source: typeof t?.source === "string" ? t.source : undefined,
        updatedAt: typeof t?.updatedAt === "string" ? t.updatedAt : undefined,
      };
    })
    .filter((t: ThemeIndexItem) => t.themeId);
}

function computeOverallFromSummary(summary: any): number | null {
  // themeReturn.ts에는 overallScore가 이미 있음
  if (typeof summary?.overallScore === "number") return clamp(summary.overallScore);
  // fallback
  const h = typeof summary?.healthScore === "number" ? summary.healthScore : null;
  const m = typeof summary?.momentumScore === "number" ? summary.momentumScore : null;
  if (h === null || m === null) return null;
  return clamp(h * 0.6 + m * 0.4);
}

function ChipLink({
  themeId,
  themeName,
  onStar,
  starred,
}: {
  themeId: string;
  themeName: string;
  onStar?: () => void;
  starred?: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <a
        href={`/graph/${themeId}`}
        className="inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-white/80 hover:bg-black/35"
        title={themeName}
      >
        <span className="max-w-[280px] truncate">
          {themeName} ({themeId})
        </span>
      </a>
      {onStar ? (
        <button
          type="button"
          onClick={onStar}
          className="rounded-full border border-white/10 bg-black/25 px-2 py-1 text-[11px] text-white/75 hover:bg-black/35"
          title={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          {starred ? "★" : "☆"}
        </button>
      ) : null}
    </div>
  );
}

export default function ThemesPage() {
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [loading, setLoading] = useState(true);

  // ✅ 로딩/파싱 실패를 “보이게” 만든다 (문제 종결 포인트)
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastLoadedAt, setLastLoadedAt] = useState<string | null>(null);

  const [query, setQuery] = useState("");
  const [sortKey, setSortKey] = useState<
    "BARO_DESC" | "BARO_ASC" | "THEMEID_ASC" | "THEMEID_DESC" | "UPDATED_DESC"
  >("BARO_DESC");

  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [favs, setFavs] = useState<FavItem[]>([]);

  // ✅ 강제 재로딩 트리거
  const [reloadKey, setReloadKey] = useState(0);

  // ✅ 최근/즐겨찾기 로드
  useEffect(() => {
    const r = safeJsonParse<RecentItem[]>(localStorage.getItem(LS_RECENT), []);
    const f = safeJsonParse<FavItem[]>(localStorage.getItem(LS_FAV), []);
    setRecent(Array.isArray(r) ? r : []);
    setFavs(Array.isArray(f) ? f : []);
  }, []);

  // ✅ index.json 로드 + 각 테마 JSON에서 barometer/top movers 계산
  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      setLoadError(null);

      let list = await fetchIndexWithFallback();
      if (!alive) return;

      // ✅ index.json placeholder(themeName=themeId) 항목을 개별 JSON에서 보정
      list = await resolvePlaceholderThemeNames(list);
      if (!alive) return;

      if (!list.length) {
        setThemes([]);
        setLoading(false);
        setLoadError(
          `테마 목록을 불러오지 못했습니다.\n` +
            `- GitHub raw: ${INDEX_URL_REMOTE}\n` +
            `- Local fallback: ${INDEX_URL_LOCAL}\n` +
            `두 경로 모두 실패했습니다. 네트워크 상태와 파일 경로를 확인하세요.`
        );
        return;
      }

      const base: ThemeRow[] = list.map((t: ThemeIndexItem) => ({
        ...t,
        barometerOverall7D: null,
        barometerNote: null,
        topMovers: null,
      }));

      // 1) 일단 목록을 바로 렌더 (UX)
      setThemes(base);
      setLoading(false);
      setLastLoadedAt(new Date().toISOString());

      // 2) barometer/topMovers는 비동기로 채움
      const period: PeriodKey = "7D";

      const enriched = await mapLimit(base, 6, async (row) => {
        // 로컬 우선, 없으면 GitHub raw fallback
        const localUrl = `/data/theme/${row.themeId}.json`;
        const remoteUrl = `https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/${row.themeId}.json`;
        const tj = await fetchJson<ThemeJson>(localUrl) ?? await fetchJson<ThemeJson>(remoteUrl);
        if (!tj?.nodes) {
          return {
            ...row,
            barometerNote: row.barometerNote ?? "테마 JSON 로드 실패",
            barometerOverall7D: null,
            topMovers: null,
          };
        }

        const summary = computeThemeReturnSummary({
          nodes: tj.nodes,
          period,
          minAssets: 5,
          topMoversN: 7,
        });

        if (!summary || summary.ok === false) {
          return {
            ...row,
            barometerNote: summary?.sentence ?? "데이터 없음",
            barometerOverall7D: null,
            topMovers: null,
          };
        }

        const overall = computeOverallFromSummary(summary);

        // ✅ Top 3 movers 연결 (id 포함)
        const top3: Top3MoverUI[] = (summary.topMovers ?? [])
          .slice(0, 3)
          .map((m: any) => {
            const ret = normalizeToPct(m.ret) ?? undefined;
            return {
              id: String(m.id ?? ""),
              name: String(m.name || m.id || ""),
              ret,
            };
          })
          .filter((x) => x.id && x.name);

        return {
          ...row,
          barometerOverall7D: overall,
          barometerNote: summary.note ?? summary.sentence ?? null,
          topMovers: top3.length ? top3 : null,
        };
      });

      if (!alive) return;
      setThemes(enriched);
    }

    run();
    return () => {
      alive = false;
    };
  }, [reloadKey]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return themes;
    return themes.filter((t) => {
      return (t.themeId ?? "").toLowerCase().includes(q) || (t.themeName ?? "").toLowerCase().includes(q);
    });
  }, [themes, query]);

  const sorted = useMemo(() => {
    const arr = [...filtered];

    const byBaro = (a: ThemeRow, b: ThemeRow) => {
      const av = typeof a.barometerOverall7D === "number" ? a.barometerOverall7D : -1;
      const bv = typeof b.barometerOverall7D === "number" ? b.barometerOverall7D : -1;
      return bv - av; // desc
    };

    if (sortKey === "BARO_DESC") arr.sort(byBaro);
    else if (sortKey === "BARO_ASC") arr.sort((a, b) => -byBaro(a, b));
    else if (sortKey === "THEMEID_ASC") arr.sort((a, b) => (a.themeId ?? "").localeCompare(b.themeId ?? ""));
    else if (sortKey === "THEMEID_DESC") arr.sort((a, b) => (b.themeId ?? "").localeCompare(a.themeId ?? ""));
    else if (sortKey === "UPDATED_DESC") arr.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));

    return arr;
  }, [filtered, sortKey]);

  const toggleFav = (themeId: string, themeName: string) => {
    const now = Date.now();
    const exists = favs.some((x) => x.themeId === themeId);
    const next = exists
      ? favs.filter((x) => x.themeId !== themeId)
      : [{ themeId, themeName, at: now }, ...favs].slice(0, 60);

    setFavs(next);
    localStorage.setItem(LS_FAV, JSON.stringify(next));
  };

  const isFav = (themeId: string) => favs.some((x) => x.themeId === themeId);

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6">
      {/* ====== Header Row (압축) ====== */}
      <div className="mb-4">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_auto_auto] lg:items-end">
          {/* Left: title + desc */}
          <div className="min-w-0">
            <div className="text-3xl font-extrabold text-white">Full Theme Map</div>
            <div className="mt-2 text-sm text-white/60">전체 테마 목록을 검색하고, Barometer(7D) 점수로 정렬할 수 있습니다.</div>
            <div className="mt-2 text-xs text-white/45">
              source: <span className="text-white/70">GitHub raw → local</span> · count:{" "}
              <span className="text-white/70">{themes.length}</span>
              {loading ? <span className="ml-2 text-white/50">loading…</span> : null}
              {lastLoadedAt ? <span className="ml-2 text-white/40">loadedAt: {lastLoadedAt}</span> : null}
            </div>

            {/* ✅ 에러를 숨기지 말고 위에서 바로 보여준다 */}
            {loadError ? (
              <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200 whitespace-pre-line">
                {loadError}
                <div className="mt-2">
                  <button
                    type="button"
                    onClick={() => setReloadKey((x) => x + 1)}
                    className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-xs text-white/80 hover:bg-black/35"
                  >
                    Retry load
                  </button>
                </div>
              </div>
            ) : null}
          </div>

          {/* Middle: Search */}
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by Theme ID or Theme Name…"
            className="h-10 w-full rounded-xl border border-white/10 bg-black/30 px-4 text-sm text-white outline-none focus:border-white/20 lg:w-[360px]"
          />

          {/* Right: Sort */}
          <div className="flex items-center gap-2 justify-start lg:justify-end">
            <div className="text-xs text-white/60">Sort</div>
            <select
              value={sortKey}
              onChange={(e) => setSortKey(e.target.value as any)}
              className="h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white outline-none focus:border-white/20"
            >
              <option value="BARO_DESC">Barometer (7D) High → Low</option>
              <option value="BARO_ASC">Barometer (7D) Low → High</option>
              <option value="THEMEID_ASC">ThemeId (A→Z)</option>
              <option value="THEMEID_DESC">ThemeId (Z→A)</option>
              <option value="UPDATED_DESC">UpdatedAt (Latest)</option>
            </select>

            <button
              type="button"
              onClick={() => setReloadKey((x) => x + 1)}
              className="ml-1 h-10 rounded-xl border border-white/10 bg-black/30 px-3 text-sm text-white/85 hover:bg-black/35"
              title="index.json 다시 불러오기"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>

      {/* ====== RECENT / FAVORITES 2-column panels ====== */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Recently */}
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="mb-2 text-xs text-white/55">RECENTLY VIEWED</div>
          {recent.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {recent.slice(0, 8).map((r) => (
                <ChipLink
                  key={r.themeId}
                  themeId={r.themeId}
                  themeName={r.themeName}
                  onStar={() => toggleFav(r.themeId, r.themeName)}
                  starred={isFav(r.themeId)}
                />
              ))}
            </div>
          ) : (
            <div className="text-xs text-white/45">최근 방문 기록이 없습니다.</div>
          )}
        </div>

        {/* Favorites */}
        <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
          <div className="mb-2 text-xs text-white/55">FAVORITES</div>
          {favs.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {favs
                .slice()
                .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
                .slice(0, 8)
                .map((f) => (
                  <ChipLink
                    key={f.themeId}
                    themeId={f.themeId}
                    themeName={f.themeName}
                    onStar={() => toggleFav(f.themeId, f.themeName)}
                    starred={isFav(f.themeId)}
                  />
                ))}
            </div>
          ) : (
            <div className="text-xs text-white/45">☆ 버튼으로 즐겨찾기를 추가할 수 있습니다.</div>
          )}
        </div>
      </div>

      {/* ====== Theme table ====== */}
      <div className="rounded-2xl border border-white/10 bg-black/20">
        {/* header */}
        <div className="grid grid-cols-[120px_1fr_260px_110px_90px] gap-2 border-b border-white/10 px-4 py-3 text-xs text-white/55">
          <div>ThemeId</div>
          <div>Theme</div>
          <div className="text-left">Top 3 movers</div>
          <div className="text-right">Barometer</div>
          <div className="text-right">Fav</div>
        </div>

        {sorted.length === 0 ? (
          <div className="px-4 py-10 text-sm text-white/55">
            테마가 없습니다. (GitHub raw 및 로컬 index.json 로드 실패)
          </div>
        ) : (
          <div className="divide-y divide-white/10">
            {sorted.map((t) => {
              const score = typeof t.barometerOverall7D === "number" ? Math.round(t.barometerOverall7D) : null;

              return (
                <div
                  key={t.themeId}
                  className="grid grid-cols-[120px_1fr_260px_110px_90px] items-center gap-2 px-4 py-3"
                >
                  {/* ThemeId */}
                  <a href={`/graph/${t.themeId}`} className="text-xs font-semibold text-white/85 hover:text-white">
                    {t.themeId}
                  </a>

                  {/* Theme + sentence */}
                  <div className="min-w-0">
                    <a
                      href={`/graph/${t.themeId}`}
                      className="block truncate text-sm font-semibold text-white"
                      title={t.themeName}
                    >
                      {t.themeName}
                    </a>
                    <div className="mt-0.5 truncate text-[11px] text-white/50">{t.barometerNote ?? t.updatedAt ?? ""}</div>
                  </div>

                  {/* Top 3 movers (✅ 배지 제거 + 글자색 + 클릭 시 focus) */}
                  <div className="min-w-0">
                    {t.topMovers && t.topMovers.length ? (
                      <div className="flex items-center gap-4">
                        {t.topMovers.slice(0, 3).map((m, idx) => {
                          const href = `/graph/${t.themeId}?focus=${encodeURIComponent(m.id)}`;
                          const c = colorByReturnPct(m.ret);

                          return (
                            <a
                              key={`${t.themeId}-m-${idx}`}
                              href={href}
                              className="max-w-[150px] truncate text-[12px] font-semibold hover:underline"
                              style={{ color: c }}
                              title={typeof m.ret === "number" ? `${m.name} (${m.ret.toFixed(2)}%)` : m.name}
                            >
                              {m.name}
                            </a>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="text-[12px] text-white/35">—</div>
                    )}
                  </div>

                  {/* Barometer */}
                  <div className="text-right text-sm font-extrabold text-white">{score === null ? "—" : score}</div>

                  {/* Fav */}
                  <div className="text-right">
                    <button
                      type="button"
                      onClick={() => toggleFav(t.themeId, t.themeName)}
                      className="rounded-lg border border-white/10 bg-black/25 px-2 py-1 text-xs text-white/80 hover:bg-black/35"
                      title="즐겨찾기"
                    >
                      {isFav(t.themeId) ? "★" : "☆"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="mt-4 text-[11px] text-white/45">
        * Top 3 movers는 각 테마 JSON의 ASSET 수익률을 기준으로 상위 3개를 표시합니다. (클릭 시 해당 테마로 이동 + focus 적용)
      </div>
    </div>
  );
}