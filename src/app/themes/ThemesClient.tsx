// src/app/themes/themesClient.tsx
"use client";

import React, { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import type { ThemeIndexItem } from "@/lib/themeIndex";

type SortKey = "THEMEID_ASC" | "THEMEID_DESC" | "NAME_ASC" | "NAME_DESC";

const LS_RECENT = "mt_recentThemes"; // [{themeId, themeName, at}]
const LS_FAV = "mt_favThemes"; // { [themeId]: true }

type RecentItem = { themeId: string; themeName: string; at: number };

function safeArray<T>(v: any): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

function safeJsonParse<T>(raw: string | null, fallback: T): T {
  try {
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function loadRecent(): RecentItem[] {
  const arr = safeJsonParse<any>(localStorage.getItem(LS_RECENT), []);
  const list: RecentItem[] = Array.isArray(arr) ? arr : [];
  return list
    .filter((x) => x?.themeId)
    .sort((a, b) => (b.at ?? 0) - (a.at ?? 0))
    .slice(0, 8);
}

function loadFav(): Record<string, boolean> {
  const obj = safeJsonParse<any>(localStorage.getItem(LS_FAV), {});
  return obj && typeof obj === "object" ? obj : {};
}

function saveFav(obj: Record<string, boolean>) {
  try {
    localStorage.setItem(LS_FAV, JSON.stringify(obj));
  } catch {}
}

function sortThemes(items: ThemeIndexItem[], sort: SortKey) {
  const a = [...items];
  const byId = (x: ThemeIndexItem) => (x.themeId ?? "").toUpperCase();
  const byName = (x: ThemeIndexItem) => (x.themeName ?? "").toUpperCase();
  a.sort((p, q) => {
    switch (sort) {
      case "THEMEID_ASC":
        return byId(p).localeCompare(byId(q));
      case "THEMEID_DESC":
        return byId(q).localeCompare(byId(p));
      case "NAME_ASC":
        return byName(p).localeCompare(byName(q));
      case "NAME_DESC":
        return byName(q).localeCompare(byName(p));
      default:
        return 0;
    }
  });
  return a;
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-white/80 hover:bg-black/35"
    >
      {label}
    </button>
  );
}

function StarButton({
  active,
  onToggle,
  title,
}: {
  active: boolean;
  onToggle: () => void;
  title?: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      title={title}
      className={[
        "rounded-lg border px-2 py-1 text-[11px] transition",
        active
          ? "border-yellow-400/30 bg-yellow-400/10 text-yellow-200 hover:bg-yellow-400/15"
          : "border-white/10 bg-black/20 text-white/70 hover:bg-black/30",
      ].join(" ")}
    >
      {active ? "★" : "☆"}
    </button>
  );
}

function ThemeCard({
  item,
  isFav,
  onToggleFav,
}: {
  item: ThemeIndexItem;
  isFav: boolean;
  onToggleFav: () => void;
}) {
  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] text-white/45">{item.themeId}</div>
          <div className="mt-1 truncate text-[16px] font-extrabold text-white/90">
            {item.themeName}
          </div>
        </div>

        <div className="flex items-center gap-2">
          <StarButton active={isFav} onToggle={onToggleFav} title="즐겨찾기" />
          <a
            href={`/graph/${item.themeId}`}
            className="rounded-lg border border-white/10 bg-black/25 px-3 py-1 text-[11px] text-white/80 hover:bg-black/35"
          >
            Open Graph →
          </a>
        </div>
      </div>

      <div className="mt-3 text-[12px] text-white/55">
        * 이 페이지는 <b>index.json</b>만 사용합니다. (가볍게 유지)
      </div>
    </div>
  );
}

export default function ThemesClient({
  themes,
  sourceLabel,
}: {
  themes: ThemeIndexItem[];
  sourceLabel?: string;
}) {
  const router = useRouter();

  const [q, setQ] = useState("");
  const [sort, setSort] = useState<SortKey>("THEMEID_ASC");

  // localStorage 기반
  const [recent, setRecent] = useState<RecentItem[]>([]);
  const [fav, setFav] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setRecent(loadRecent());
    setFav(loadFav());
  }, []);

  // ✅ DAY52-3: “마지막 그래프 복귀” 대상
  const lastViewed = useMemo(() => {
    return recent.length ? recent[0] : null;
  }, [recent]);

  const filtered = useMemo(() => {
    const query = q.trim().toUpperCase();
    const base = Array.isArray(themes) ? themes : [];
    const hit = !query
      ? base
      : base.filter((x) => {
          const id = (x.themeId ?? "").toUpperCase();
          const name = (x.themeName ?? "").toUpperCase();
          return id.includes(query) || name.includes(query);
        });

    return sortThemes(hit, sort);
  }, [themes, q, sort]);

  const favList = useMemo(() => {
    const base = Array.isArray(themes) ? themes : [];
    const only = base.filter((x) => !!fav[x.themeId]);
    return sortThemes(only, "THEMEID_ASC");
  }, [themes, fav]);

  const toggleFav = (themeId: string) => {
    setFav((prev) => {
      const next = { ...prev };
      next[themeId] = !next[themeId];
      saveFav(next);
      return next;
    });
  };

  const goGraph = (themeId: string) => {
    router.push(`/graph/${themeId}`);
  };

  return (
    <main className="min-h-screen w-full bg-black px-10 py-10 text-white">
      <header className="mb-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h1 className="text-4xl font-extrabold tracking-tight">
              Full Theme Map
            </h1>
            <div className="mt-2 text-white/60">
              전체 테마 목록에서 검색하고, 클릭하면 그래프 페이지로 이동합니다.
            </div>
            <div className="mt-3 text-xs text-white/40">
              source: {sourceLabel ?? "theme index"} · count: {themes.length}
            </div>
          </div>

          {/* ✅ DAY52-3: Back to last graph */}
          {lastViewed ? (
            <button
              type="button"
              onClick={() => goGraph(lastViewed.themeId)}
              className="w-fit rounded-xl border border-white/15 bg-black/25 px-4 py-2 text-[12px] text-white/85 hover:bg-black/35"
              title="가장 최근에 보던 그래프로 돌아갑니다."
            >
              ⤴ Back to last graph ·{" "}
              <span className="text-white/70">
                {lastViewed.themeName} ({lastViewed.themeId})
              </span>
            </button>
          ) : (
            <div className="text-[12px] text-white/35">
              최근 방문 기록이 없습니다.
            </div>
          )}
        </div>
      </header>

      {/* 검색/정렬 */}
      <section className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search by Theme ID or Theme Name..."
          className="w-full rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/85 outline-none focus:border-white/20 lg:flex-1"
        />

        <div className="flex items-center justify-between gap-3 lg:justify-end">
          <div className="text-[11px] text-white/45">Sort</div>
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortKey)}
            className="rounded-xl border border-white/10 bg-black/25 px-3 py-2 text-[12px] text-white/85 outline-none focus:border-white/20"
          >
            <option value="THEMEID_ASC">ThemeId (A→Z)</option>
            <option value="THEMEID_DESC">ThemeId (Z→A)</option>
            <option value="NAME_ASC">ThemeName (A→Z)</option>
            <option value="NAME_DESC">ThemeName (Z→A)</option>
          </select>
        </div>
      </section>

      {/* ✅ DAY52-2: 최근 본 테마 */}
      <section className="mb-6">
        <div className="flex items-center justify-between">
          <div className="text-[12px] tracking-wider text-white/55">
            RECENTLY VIEWED
          </div>
          {recent.length ? (
            <div className="text-[11px] text-white/45">last {recent.length}</div>
          ) : (
            <div className="text-[11px] text-white/45">
              아직 방문 기록이 없습니다.
            </div>
          )}
        </div>

        <div className="mt-3 flex flex-wrap gap-2">
          {recent.map((r) => (
            <Chip
              key={r.themeId}
              label={`${r.themeName} (${r.themeId})`}
              onClick={() => goGraph(r.themeId)}
            />
          ))}
        </div>
      </section>

      {/* ✅ DAY52-2: 즐겨찾기 */}
      <section className="mb-6">
        <div className="text-[12px] tracking-wider text-white/55">FAVORITES</div>
        {favList.length === 0 ? (
          <div className="mt-2 text-[12px] text-white/45">
            ☆ 버튼으로 즐겨찾기를 추가할 수 있습니다.
          </div>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-4 lg:grid-cols-3">
            {favList.map((t) => (
              <ThemeCard
                key={t.themeId}
                item={t}
                isFav={!!fav[t.themeId]}
                onToggleFav={() => toggleFav(t.themeId)}
              />
            ))}
          </div>
        )}
      </section>

      {/* 전체 리스트 */}
      <section className="mt-2">
        <div className="mb-3 text-[11px] text-white/45">
          showing {filtered.length} / {themes.length}
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          {filtered.map((t) => (
            <ThemeCard
              key={t.themeId}
              item={t}
              isFav={!!fav[t.themeId]}
              onToggleFav={() => toggleFav(t.themeId)}
            />
          ))}
        </div>
      </section>
    </main>
  );
}
