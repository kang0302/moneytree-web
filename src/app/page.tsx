"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import AmbientNetwork from "@/components/AmbientNetwork";
import SearchBar from "@/components/SearchBar";
import { computeThemeReturnSummary, PeriodKey, normalizeToPct } from "@/lib/themeReturn";
import { resolvePlaceholderThemeNames } from "@/lib/themeIndex";
import {
  TEMP_BANDS,
  TempBand,
  bandOf,
  computeOverall,
  scoreBadgeColor,
  scoreLabel,
} from "@/lib/marketTemp";

type ThemeIndexItem = {
  themeId: string;
  themeName: string;
};

type ChangelogEntry = { date?: string; kind?: string; title?: string; detail?: string };

type ThemeJson = {
  themeId: string;
  themeName: string;
  nodes: any[];
  edges: any[];
  meta?: { changelog?: ChangelogEntry[] };
};

type ThemeRow = ThemeIndexItem & {
  score: number | null;
  note: string | null;
  topMover: { name: string; ret?: number } | null;
};

type UpdateItem = ChangelogEntry & { themeId: string; themeName: string };

const RECENT_DAYS = 7;
const KIND_COLOR: Record<string, string> = {
  신규: "#34d399",
  보강: "#38bdf8",
  변경: "#fbbf24",
  분할: "#e879f9",
  수정: "#94a3b8",
};

function parseDay(s?: string): number | null {
  if (!s) return null;
  const t = Date.parse(s);
  return Number.isNaN(t) ? null : t;
}
function daysSince(s?: string): number | null {
  const t = parseDay(s);
  return t === null ? null : Math.floor((Date.now() - t) / 86_400_000);
}
function fmtDay(s?: string): string {
  const t = parseDay(s);
  if (t === null) return s ?? "";
  const d = new Date(t);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}
function relLabel(d: number | null): string {
  if (d === null) return "";
  if (d <= 0) return "오늘";
  if (d === 1) return "어제";
  if (d < 7) return `${d}일 전`;
  if (d < 30) return `${Math.floor(d / 7)}주 전`;
  return `${Math.floor(d / 30)}개월 전`;
}

type RecentItem = { themeId: string; themeName: string; at: number };
type FavItem = { themeId: string; themeName: string; at: number };

const LS_RECENT = "mt_recent_themes_v1";
const LS_FAV = "mt_favorite_themes_v1";

const INDEX_URL_REMOTE = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/index.json";
const INDEX_URL_LOCAL = "/data/theme/index.json";

function safeJsonParse<T>(s: string | null, fallback: T): T {
  try {
    const v = JSON.parse(s ?? "");
    return (v ?? fallback) as T;
  } catch {
    return fallback;
  }
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

async function fetchIndexWithFallback(): Promise<ThemeIndexItem[]> {
  try {
    const res = await fetch(INDEX_URL_REMOTE, { cache: "no-store" });
    if (res.ok) {
      const text = await res.text();
      try {
        const json = JSON.parse(text);
        const list = toThemeIndexList(json);
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

function useCountUp(target: number, duration = 1500) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (target <= 0) {
      setValue(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(eased * target));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, duration]);
  return value;
}

function StatCounter({ label, value }: { label: string; value: number }) {
  const display = useCountUp(value);
  return (
    <div className="flex flex-col items-center">
      <div className="font-mono text-[24px] font-extrabold tabular-nums text-white sm:text-[32px]">
        {display.toLocaleString()}
      </div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wider text-white/50 sm:text-[11px]">
        {label}
      </div>
    </div>
  );
}

export default function HomePage() {
  const router = useRouter();
  const [themes, setThemes] = useState<ThemeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [favs, setFavs] = useState<FavItem[]>([]);
  const [counts, setCounts] = useState({ themes: 0, assets: 0, macros: 0, edges: 0 });
  const [updates, setUpdates] = useState<UpdateItem[]>([]);

  // 최신 데일리 브리핑(5줄 요약) — /data/daily_briefs/index.json[0]
  const [dailyBrief, setDailyBrief] = useState<{
    date: string;
    title: string;
    themes: { rank?: string; id: string; name: string; strength: string; reason: string }[];
  } | null>(null);

  useEffect(() => {
    setRecent(safeJsonParse<RecentItem[]>(localStorage.getItem(LS_RECENT), []));
    setFavs(safeJsonParse<FavItem[]>(localStorage.getItem(LS_FAV), []));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/data/daily_briefs/index.json?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json();
        if (Array.isArray(j) && j.length) setDailyBrief(j[0]);
      } catch {
        /* 브리핑 없으면 조용히 무시 */
      }
    })();
  }, []);

  useEffect(() => {
    let alive = true;

    async function run() {
      setLoading(true);
      let list = await fetchIndexWithFallback();
      if (!alive) return;
      list = await resolvePlaceholderThemeNames(list);
      if (!alive) return;

      const assetIds = new Set<string>();
      const macroIds = new Set<string>();
      let totalEdges = 0;
      const collectedUpdates: UpdateItem[] = [];

      const period: PeriodKey = "7D";
      const enriched = await mapLimit(list, 6, async (row) => {
        const localUrl = `/data/theme/${row.themeId}.json`;
        const remoteUrl = `https://raw.githubusercontent.com/kang0302/import_MT/main/data/theme/${row.themeId}.json`;
        const tj = (await fetchJson<ThemeJson>(localUrl)) ?? (await fetchJson<ThemeJson>(remoteUrl));
        if (!tj?.nodes) {
          return { ...row, score: null, note: null, topMover: null } as ThemeRow;
        }
        const cl = tj.meta?.changelog;
        if (Array.isArray(cl)) {
          for (const e of cl) {
            if (e && (e.title || e.detail)) {
              collectedUpdates.push({ ...e, themeId: row.themeId, themeName: tj.themeName || row.themeName });
            }
          }
        }
        for (const n of tj.nodes) {
          const id = (n as any)?.id;
          const tp = (n as any)?.type;
          if (!id) continue;
          if (tp === "ASSET") assetIds.add(id);
          else if (tp === "MACRO") macroIds.add(id);
        }
        totalEdges += Array.isArray(tj.edges) ? tj.edges.length : 0;
        const summary: any = computeThemeReturnSummary({
          nodes: tj.nodes,
          edges: (tj as any).edges ?? (tj as any).links,
          period,
          minAssets: 5,
          topMoversN: 1,
        });
        if (!summary || summary.ok === false) {
          return { ...row, score: null, note: summary?.sentence ?? null, topMover: null } as ThemeRow;
        }
        const score = computeOverall(summary);
        const tm = (summary.topMovers ?? [])[0];
        const topMover = tm
          ? { name: String(tm.name || tm.id || ""), ret: normalizeToPct(tm.ret) ?? undefined }
          : null;
        return { ...row, score, note: summary.note ?? null, topMover } as ThemeRow;
      });

      if (!alive) return;
      setThemes(enriched);
      setCounts({ themes: list.length, assets: assetIds.size, macros: macroIds.size, edges: totalEdges });
      collectedUpdates.sort((a, b) => (parseDay(b.date) ?? 0) - (parseDay(a.date) ?? 0));
      setUpdates(collectedUpdates);
      setLoading(false);
    }

    run();
    return () => {
      alive = false;
    };
  }, []);

  // ✅ 시장의 온도 6단계: 밴드별 정렬 목록 + 분포
  const { perBand, bandCounts, scoredTotal } = useMemo(() => {
    const map: Record<string, (ThemeRow & { score: number })[]> = {};
    const cnt: Record<string, number> = {};
    for (const b of TEMP_BANDS) {
      map[b.key] = [];
      cnt[b.key] = 0;
    }
    let total = 0;
    for (const t of themes) {
      if (typeof t.score !== "number") continue;
      const b = bandOf(t.score);
      if (!b) continue;
      map[b.key].push(t as ThemeRow & { score: number });
      cnt[b.key]++;
      total++;
    }
    for (const k of Object.keys(map)) map[k].sort((a, b) => b.score - a.score);
    return { perBand: map, bandCounts: cnt, scoredTotal: total };
  }, [themes]);

  const openBand = (key: string) => router.push(`/temperature/${key}`);

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
    <main className="relative min-h-screen w-full overflow-hidden bg-black text-white">
      {/* Ambient background */}
      <div className="pointer-events-none fixed inset-0 z-0">
        <AmbientNetwork className="h-full w-full" />
        <div
          className="absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at 50% 35%, rgba(0,0,0,0) 0%, rgba(0,0,0,0.2) 75%, rgba(0,0,0,0.55) 100%)",
          }}
        />
      </div>

      {/* Foreground */}
      <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col px-4 py-6">
        {/* Header */}
        <header className="mb-6 flex h-12 items-center justify-between rounded-xl border border-white/10 bg-white/[0.03] px-3 backdrop-blur">
          <div className="text-[15px] font-extrabold tracking-tight">Know_vest</div>
          <nav className="flex items-center gap-2 text-[12px]">
            <Link
              href="/themes"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-white/85 transition hover:bg-black/45"
            >
              ⤴ Full Theme Map
            </Link>
          </nav>
        </header>

        {/* Hero Search */}
        <section className="mb-6 py-10 text-center sm:py-14">
          <div className="text-[28px] font-extrabold leading-tight tracking-tight text-white sm:text-[40px]">
            오늘, 어떤 시장을 들여다볼까요?
          </div>

          {/* 퀵 액션 버튼들 */}
          <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
            <a
              href="http://localhost:8501"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-indigo-400/40 bg-indigo-500/15 px-5 py-2 text-sm font-semibold text-indigo-100 transition hover:border-indigo-300/60 hover:bg-indigo-500/25"
              title="ETF 이평선 타이밍 + 인출/적립 백테스트 (로컬 앱)"
            >
              📈 투자퍼포먼스 시뮬레이션
            </a>
            <Link
              href="/ma-brief"
              className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/15 px-5 py-2 text-sm font-semibold text-sky-100 transition hover:border-sky-300/60 hover:bg-sky-500/25"
              title="관심종목 이동평균선(5·20·60·120) 데일리 트래킹"
            >
              📊 이동평균선 트래킹
            </Link>
          </div>

          <div className="mt-3 text-[12px] text-white/55 sm:text-[14px]">
            종목 · 티커 · 테마 · 산업 · 매크로 — 한 번에 검색
          </div>
          <div className="mx-auto mt-6 flex w-full max-w-3xl flex-wrap items-end justify-center gap-6 sm:gap-10">
            <StatCounter label="Themes" value={counts.themes} />
            <div className="h-8 w-px bg-white/15 sm:h-10" />
            <StatCounter label="Assets" value={counts.assets} />
            <div className="h-8 w-px bg-white/15 sm:h-10" />
            <StatCounter label="Macros" value={counts.macros} />
            <div className="h-8 w-px bg-white/15 sm:h-10" />
            <StatCounter label="인텔리전스 엣지" value={counts.edges} />
          </div>
          <div className="relative z-50 mx-auto mt-6 w-full max-w-2xl rounded-2xl border border-white/15 bg-black/55 p-2 shadow-[0_8px_40px_rgba(0,0,0,0.5)] backdrop-blur-md">
            <SearchBar
              indexUrl="/data/search/search_index.json"
              onGoTheme={(tid) => router.push(`/graph/${tid}`)}
              onGoThemeFocus={(tid, fid) => router.push(`/graph/${tid}?focus=${encodeURIComponent(fid)}`)}
              onGoAsset={(aid) => router.push(`/asset/${aid}`)}
            />
          </div>
        </section>

        {/* Daily Brief — 5줄 핵심 요약 + 아카이브 링크 */}
        <Link
          href="/daily-brief"
          className="mb-4 block rounded-2xl border border-sky-400/25 bg-sky-500/[0.05] px-4 py-3 backdrop-blur transition hover:border-sky-400/40 hover:bg-sky-500/[0.08]"
        >
          <div className="mb-2 flex items-end justify-between">
            <div className="flex items-center gap-2">
              <span className="text-[11px] uppercase tracking-wider text-sky-300/70">Daily Brief</span>
              {dailyBrief?.date ? <span className="text-[11px] text-white/45">{dailyBrief.date}</span> : null}
            </div>
            <span className="text-[11px] text-white/45">전체 브리핑 보기 →</span>
          </div>

          {dailyBrief && dailyBrief.themes?.length ? (
            <ol className="space-y-1">
              {dailyBrief.themes.slice(0, 5).map((t, i) => (
                <li key={i} className="flex items-baseline gap-2 text-[13px] leading-snug">
                  <span className="shrink-0 text-white/35">{i + 1}</span>
                  <span className="shrink-0 font-semibold text-white/90">{t.name}</span>
                  {t.strength ? <span className="shrink-0 text-amber-300/80">{t.strength}</span> : null}
                  <span className="min-w-0 flex-1 truncate text-white/55">{t.reason}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="text-[13px] text-white/60">오늘의 핫 테마 브리핑을 불러오는 중…</div>
          )}
        </Link>

        {/* Today's Pulse */}
        <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45">Today&apos;s Pulse</div>
              <div className="text-[18px] font-bold">시장의 온도</div>
            </div>
            <div className="text-[11px] text-white/45">
              {loading ? "loading…" : `7D · ${themes.length} themes`}
            </div>
          </div>

          {/* 6단계 온도 분포 스트립 (더블클릭 → 상세) */}
          <div className="mb-3 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {TEMP_BANDS.map((b) => {
              const n = bandCounts[b.key] ?? 0;
              const pct = scoredTotal > 0 ? Math.round((n / scoredTotal) * 100) : 0;
              return (
                <div
                  key={b.key}
                  onDoubleClick={() => openBand(b.key)}
                  className="flex cursor-pointer flex-col rounded-xl border px-2.5 py-2 transition hover:brightness-125"
                  style={{ borderColor: `${b.color}55`, background: `${b.color}14` }}
                  title={`${b.label}: ${n}개 테마 (${pct}%) — 더블클릭 시 상세 맵`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-semibold" style={{ color: b.color }}>
                    <span>{b.emoji}</span>
                    <span>{b.label}</span>
                  </div>
                  <div className="mt-0.5 flex items-end justify-between">
                    <span className="font-mono text-[18px] font-extrabold tabular-nums text-white/90">
                      {loading ? "—" : n}
                    </span>
                    <span className="text-[10px] text-white/40">{loading ? "" : `${pct}%`}</span>
                  </div>
                  <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-white/[0.06]">
                    <div className="h-full rounded-full" style={{ width: `${pct}%`, background: b.color }} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* 6단계 밴드별 Top 5 (밴드명 더블클릭 → 상세 맵) */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {TEMP_BANDS.map((b) => (
              <BandColumn
                key={b.key}
                band={b}
                rows={perBand[b.key] ?? []}
                total={bandCounts[b.key] ?? 0}
                loading={loading}
                onOpen={() => openBand(b.key)}
              />
            ))}
          </div>
        </section>

        {/* Theme Curation Updates */}
        {updates.length > 0 && (
          <section className="mb-4 rounded-2xl border border-emerald-400/25 bg-emerald-500/[0.04] px-4 py-4 backdrop-blur">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <div className="text-[11px] uppercase tracking-wider text-emerald-300/70">Curation Updates</div>
                <div className="flex items-center gap-2 text-[18px] font-bold">
                  🗒 테마 큐레이션 업데이트
                  {(() => {
                    const fresh = updates.filter((u) => {
                      const d = daysSince(u.date);
                      return d !== null && d <= RECENT_DAYS;
                    }).length;
                    return fresh > 0 ? (
                      <span className="animate-pulse rounded-full border border-emerald-400/40 bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-200">
                        최근 {fresh}건
                      </span>
                    ) : null;
                  })()}
                </div>
              </div>
              <Link href="/themes" className="text-[11px] text-white/45 hover:text-white/70">
                전체 테마 →
              </Link>
            </div>
            <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {updates.slice(0, 10).map((u, i) => {
                const d = daysSince(u.date);
                const recent = d !== null && d <= RECENT_DAYS;
                const clr = (u.kind && KIND_COLOR[u.kind]) || "#94a3b8";
                return (
                  <Link
                    key={`${u.themeId}-${i}`}
                    href={`/graph/${u.themeId}#theme-changelog`}
                    className={[
                      "group flex items-center gap-2 rounded-xl border px-3 py-2 transition",
                      recent
                        ? "border-emerald-400/30 bg-emerald-500/[0.06] hover:bg-emerald-500/[0.1]"
                        : "border-white/10 bg-black/25 hover:bg-white/[0.05]",
                    ].join(" ")}
                    title={u.detail || u.title}
                  >
                    <span
                      className="shrink-0 rounded border px-1.5 py-0.5 text-[10px] font-semibold"
                      style={{ color: clr, borderColor: `${clr}55`, background: `${clr}1a` }}
                    >
                      {u.kind || "변경"}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="truncate text-[12.5px] font-semibold text-white/90">{u.title || u.themeName}</span>
                      </div>
                      <div className="truncate text-[10.5px] text-white/45">
                        {u.themeName} · {u.themeId}
                      </div>
                    </div>
                    <div className="shrink-0 text-right">
                      <div className="text-[10px] text-white/40">{fmtDay(u.date)}</div>
                      {recent && (
                        <div className="text-[9.5px] font-bold text-emerald-300">{relLabel(d)}</div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </div>
          </section>
        )}

        {/* Markets by Region (placeholder counts; TBD click → region analysis) */}
        <section className="mb-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-4 backdrop-blur">
          <div className="mb-3 flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-wider text-white/45">Markets by Region</div>
              <div className="text-[18px] font-bold">지역별 시장</div>
            </div>
            <div className="text-[11px] text-white/45">click TBD</div>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {[
              { code: "KR", flag: "🇰🇷", name: "한국" },
              { code: "US", flag: "🇺🇸", name: "미국" },
              { code: "JP", flag: "🇯🇵", name: "일본" },
              { code: "CN", flag: "🇨🇳", name: "중국" },
              { code: "EU", flag: "🇪🇺", name: "유럽" },
              { code: "GLOBAL", flag: "🌍", name: "글로벌" },
            ].map((r) => (
              <button
                key={r.code}
                type="button"
                disabled
                className="group flex flex-col items-center justify-center gap-1 rounded-xl border border-white/10 bg-white/4 px-3 py-4 text-center transition hover:border-white/25 hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-90"
                title="국가별 테마 분석 (TBD)"
              >
                <div className="text-[32px] leading-none">{r.flag}</div>
                <div className="mt-1 text-[13px] font-semibold text-white/90">{r.name}</div>
                <div className="text-[10px] text-white/45">— themes</div>
                <div className="text-[10px] text-white/45">— assets</div>
              </button>
            ))}
          </div>
        </section>

        {/* Recent / Favorites */}
        <section className="mb-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">Recently Viewed</div>
            {recent.length ? (
              <div className="flex flex-wrap gap-2">
                {recent.slice(0, 8).map((r) => (
                  <Chip
                    key={r.themeId}
                    themeId={r.themeId}
                    themeName={r.themeName}
                    starred={isFav(r.themeId)}
                    onStar={() => toggleFav(r.themeId, r.themeName)}
                  />
                ))}
              </div>
            ) : (
              <div className="text-[12px] text-white/45">최근 방문한 테마가 없습니다.</div>
            )}
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 backdrop-blur">
            <div className="mb-2 text-[11px] uppercase tracking-wider text-white/45">Favorites</div>
            {favs.length ? (
              <div className="flex flex-wrap gap-2">
                {favs
                  .slice()
                  .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
                  .slice(0, 8)
                  .map((f) => (
                    <Chip
                      key={f.themeId}
                      themeId={f.themeId}
                      themeName={f.themeName}
                      starred
                      onStar={() => toggleFav(f.themeId, f.themeName)}
                    />
                  ))}
              </div>
            ) : (
              <div className="text-[12px] text-white/45">☆ 버튼으로 즐겨찾기를 추가할 수 있습니다.</div>
            )}
          </div>
        </section>

        {/* Constellation CTA */}
        <section className="mt-2 mb-6">
          <Link
            href="/themes"
            className="group block rounded-2xl border border-white/10 bg-white/[0.03] px-5 py-5 text-center backdrop-blur transition hover:bg-white/[0.06]"
            title="Theme Constellation (별도 라우트 예정)"
          >
            <div className="text-[11px] uppercase tracking-wider text-white/45">Explore</div>
            <div className="mt-1 text-[18px] font-bold">
              ▶ Full Theme Constellation 보기
            </div>
            <div className="mt-1 text-[12px] text-white/55">
              245개 테마를 한 화면에서 — (현재는 Full Theme Map 으로 이동)
            </div>
          </Link>
        </section>
      </div>
    </main>
  );
}

function BandColumn({
  band,
  rows,
  total,
  loading,
  onOpen,
}: {
  band: TempBand;
  rows: ThemeRow[];
  total: number;
  loading: boolean;
  onOpen: () => void;
}) {
  const top = rows.slice(0, 5);
  return (
    <div className="rounded-xl border bg-black/25 px-3 py-3" style={{ borderColor: `${band.color}33` }}>
      <div
        onDoubleClick={onOpen}
        className="mb-2 flex cursor-pointer items-center justify-between select-none"
        title={`${band.label} 구간 — 더블클릭 시 상세 맵으로 이동`}
      >
        <div className="flex items-center gap-1.5 text-[12px] font-semibold" style={{ color: band.color }}>
          <span>{band.emoji}</span>
          <span>{band.label}</span>
          <span className="text-white/40">Top 5</span>
        </div>
        <span className="text-[10px] text-white/40">{total}개 · 상세 ↗</span>
      </div>
      {loading && top.length === 0 ? (
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
          ))}
        </div>
      ) : top.length === 0 ? (
        <div className="py-2 text-[12px] text-white/40">해당 구간 테마 없음</div>
      ) : (
        <div className="space-y-1">
          {top.map((t) => (
            <Link
              key={t.themeId}
              href={`/graph/${t.themeId}`}
              className="grid grid-cols-[56px_1fr_auto] items-center gap-2 rounded-lg px-2 py-1.5 transition hover:bg-white/[0.05]"
            >
              <span className="font-mono text-[10.5px] text-white/55">{t.themeId}</span>
              <span className="min-w-0 truncate text-[12.5px] text-white/90" title={t.themeName}>
                {t.themeName}
              </span>
              <span
                className="text-[12.5px] font-extrabold tabular-nums"
                style={{ color: scoreBadgeColor(t.score) }}
                title={scoreLabel(t.score)}
              >
                {t.score === null ? "—" : Math.round(t.score)}
              </span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function Chip({
  themeId,
  themeName,
  starred,
  onStar,
}: {
  themeId: string;
  themeName: string;
  starred?: boolean;
  onStar?: () => void;
}) {
  return (
    <div className="flex items-center gap-1.5">
      <Link
        href={`/graph/${themeId}`}
        className="inline-flex items-center rounded-full border border-white/10 bg-black/30 px-3 py-1 text-[11px] text-white/80 hover:bg-black/45"
        title={themeName}
      >
        <span className="max-w-[240px] truncate">
          {themeName} ({themeId})
        </span>
      </Link>
      {onStar ? (
        <button
          type="button"
          onClick={onStar}
          className="rounded-full border border-white/10 bg-black/30 px-2 py-1 text-[11px] text-white/75 hover:bg-black/45"
          title={starred ? "즐겨찾기 해제" : "즐겨찾기 추가"}
        >
          {starred ? "★" : "☆"}
        </button>
      ) : null}
    </div>
  );
}
