"use client";

// src/components/ThemeInsights.tsx
// 그래프 페이지 하단 '투자 인사이트' 섹션.
// import_MT/data/insights/{T_xxx,A_xxx}.md 를 GitHub raw 에서 fetch 해 표시.
// frontmatter (updated_at·title·tags) 파싱 + 24h 내 인사이트는 NEW 배지.

import { useEffect, useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const GH_RAW = "https://raw.githubusercontent.com/kang0302/import_MT/main/data/insights";

type InsightDoc = {
  id: string;          // T_xxx 또는 A_xxx
  kind: "theme" | "asset";
  displayName: string; // theme name 또는 asset name
  title?: string;
  updatedAt?: Date;
  tags?: string[];
  body: string;
  isNew: boolean;      // updated_at 24h 이내
};

type Props = {
  themeId: string;
  themeName?: string;
  /** 테마 내 ASSET 노드의 {id, name} 리스트. asset 인사이트 fetch 용. */
  assets?: Array<{ id: string; name?: string }>;
  /** 24h 내 인사이트 개수가 변할 때 호출 — 헤더 배지 동기화용. */
  onNewCount?: (count: number) => void;
};

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

async function tryFetch(url: string): Promise<string | null> {
  try {
    const r = await fetch(url, { cache: "no-store" });
    if (!r.ok) return null;
    return await r.text();
  } catch {
    return null;
  }
}

/** 매우 단순한 YAML frontmatter 파서 — key: value 한 줄씩, 배열은 [a, b, c] 인라인. */
function parseFrontmatter(raw: string): { meta: Record<string, any>; body: string } {
  const m = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, any> = {};
  m[1].split(/\r?\n/).forEach((line) => {
    const mm = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/);
    if (!mm) return;
    const k = mm[1];
    let v: any = mm[2].trim();
    if (v.startsWith("[") && v.endsWith("]")) {
      v = v.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
    } else {
      v = v.replace(/^["']|["']$/g, "");
    }
    meta[k] = v;
  });
  return { meta, body: m[2] };
}

function parseDate(s: any): Date | undefined {
  if (typeof s !== "string") return undefined;
  const d = new Date(s);
  return isNaN(d.getTime()) ? undefined : d;
}

function fmtDate(d?: Date): string {
  if (!d) return "";
  return d.toISOString().slice(0, 10);
}

export default function ThemeInsights({ themeId, themeName, assets, onNewCount }: Props) {
  const [docs, setDocs] = useState<InsightDoc[] | null>(null);
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  // assets 배열은 부모가 매 렌더마다 새로 만들어 prop 으로 넘김 → useEffect 무한 트리거 방지
  // stable string key + displayName 매핑은 별도 useMemo 로 안정화
  const assetIds = useMemo(
    () =>
      (assets || [])
        .filter((a) => typeof a.id === "string" && a.id.startsWith("A_"))
        .map((a) => a.id)
        .sort()
        .join(","),
    [assets],
  );
  const assetNameMap = useMemo(() => {
    const m: Record<string, string> = {};
    (assets || []).forEach((a) => {
      if (typeof a.id === "string") m[a.id] = a.name || a.id;
    });
    return m;
    // assetIds 가 바뀔 때만 다시 만들면 됨 (assets 자체 의존 안 함)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assetIds]);

  // docs 변경될 때 새 NEW count 부모에 통보
  useEffect(() => {
    if (!onNewCount) return;
    onNewCount(docs ? docs.filter((d) => d.isNew).length : 0);
  }, [docs, onNewCount]);

  useEffect(() => {
    let cancelled = false;
    setDocs(null);

    (async () => {
      const targets: Array<{ id: string; kind: "theme" | "asset"; displayName: string }> = [
        { id: themeId, kind: "theme", displayName: themeName || themeId },
      ];
      assetIds.split(",").filter(Boolean).forEach((id) => {
        targets.push({ id, kind: "asset", displayName: assetNameMap[id] || id });
      });

      const now = Date.now();
      const results = await Promise.all(
        targets.map(async (t) => {
          const raw = await tryFetch(`${GH_RAW}/${t.id}.md`);
          if (!raw) return null;
          const { meta, body } = parseFrontmatter(raw);
          const updatedAt = parseDate(meta.updated_at);
          return {
            id: t.id,
            kind: t.kind,
            displayName: t.displayName,
            title: typeof meta.title === "string" ? meta.title : undefined,
            updatedAt,
            tags: Array.isArray(meta.tags) ? meta.tags : undefined,
            body: body.trim(),
            isNew: updatedAt ? now - updatedAt.getTime() < ONE_DAY_MS : false,
          } as InsightDoc;
        }),
      );

      if (cancelled) return;
      const filtered = results.filter((d): d is InsightDoc => !!d);
      // 정렬: NEW 먼저 → updatedAt 내림차순 → theme 우선
      filtered.sort((a, b) => {
        if (a.isNew !== b.isNew) return a.isNew ? -1 : 1;
        const ta = a.updatedAt?.getTime() ?? 0;
        const tb = b.updatedAt?.getTime() ?? 0;
        if (ta !== tb) return tb - ta;
        if (a.kind !== b.kind) return a.kind === "theme" ? -1 : 1;
        return a.displayName.localeCompare(b.displayName);
      });
      setDocs(filtered);
    })();

    return () => {
      cancelled = true;
    };
  }, [themeId, themeName, assetIds, assetNameMap]);

  if (!docs) {
    return (
      <section className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="text-[14px] font-semibold text-white/90">투자 인사이트</div>
        <div className="mt-2 text-[11px] text-white/40">로딩 중…</div>
      </section>
    );
  }

  const newCount = docs.filter((d) => d.isNew).length;

  if (docs.length === 0) {
    return (
      <section className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
        <div className="mb-1 flex items-baseline gap-2">
          <h3 className="text-[14px] font-semibold text-white/90">투자 인사이트</h3>
          <span className="text-[10px] text-white/40">data/insights/{themeId}.md 등</span>
        </div>
        <div className="text-[11px] text-white/40">
          이 테마·자산에 대한 인사이트가 아직 없습니다. <code className="rounded bg-white/10 px-1 py-px text-[10px]">import_MT/data/insights/{themeId}.md</code> 또는 <code className="rounded bg-white/10 px-1 py-px text-[10px]">A_xxx.md</code> 를 생성하면 자동 표시됩니다.
        </div>
      </section>
    );
  }

  return (
    <section id="theme-insights" className="mt-3 rounded-xl border border-white/10 bg-black/25 p-4">
      <div className="mb-3 flex items-baseline gap-2">
        <h3 className="text-[14px] font-semibold text-white/90">
          투자 인사이트 <span className="text-white/55">({docs.length})</span>
        </h3>
        {newCount > 0 && (
          <span
            className="rounded px-1.5 py-0.5 text-[10px] font-bold text-white"
            style={{ background: "#DC2626" }}
            title="24시간 이내 갱신"
          >
            NEW {newCount}
          </span>
        )}
        <span className="ml-auto text-[10px] text-white/40">import_MT/data/insights/</span>
      </div>

      <div className="flex flex-col gap-2">
        {docs.map((d) => {
          const isOpen = !collapsed[d.id];
          const headerColor = d.kind === "theme" ? "#FBBF24" : "#60A5FA";
          return (
            <div
              key={d.id}
              className="rounded-lg border border-white/10 bg-black/30"
            >
              <button
                type="button"
                onClick={() => setCollapsed((p) => ({ ...p, [d.id]: !p[d.id] }))}
                className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-white/3"
              >
                <span
                  className="rounded px-1.5 py-0.5 font-mono text-[9px] font-bold"
                  style={{ background: headerColor + "22", color: headerColor }}
                >
                  {d.kind === "theme" ? "THEME" : "ASSET"}
                </span>
                <span className="font-mono text-[11px] text-white/60">{d.id}</span>
                <span className="text-[13px] text-white/90">{d.displayName}</span>
                {d.title && <span className="text-[12px] text-white/55">— {d.title}</span>}
                {d.isNew && (
                  <span
                    className="rounded px-1 py-0.5 text-[9px] font-bold text-white"
                    style={{ background: "#DC2626" }}
                  >
                    NEW
                  </span>
                )}
                {d.updatedAt && (
                  <span className="ml-auto text-[10px] text-white/40">{fmtDate(d.updatedAt)}</span>
                )}
                <span className="text-[11px] text-white/30">{isOpen ? "▼" : "▶"}</span>
              </button>
              {isOpen && (
                <article className="border-t border-white/10 px-4 py-3 text-[13px] leading-relaxed text-white/85">
                  {d.tags && d.tags.length > 0 && (
                    <div className="mb-2 flex flex-wrap gap-1">
                      {d.tags.map((t, i) => (
                        <span
                          key={i}
                          className="rounded bg-white/8 px-1.5 py-0.5 text-[10px] text-white/70"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                  )}
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm]}
                    components={{
                      h1: ({ children }) => <h1 className="mt-2 mb-1 text-[15px] font-semibold text-white/95">{children}</h1>,
                      h2: ({ children }) => <h2 className="mt-2 mb-1 text-[13px] font-semibold text-white/90">{children}</h2>,
                      h3: ({ children }) => <h3 className="mt-2 mb-1 text-[12px] font-semibold text-white/85">{children}</h3>,
                      p: ({ children }) => <p className="my-1.5">{children}</p>,
                      ul: ({ children }) => <ul className="my-1 list-disc pl-5">{children}</ul>,
                      ol: ({ children }) => <ol className="my-1 list-decimal pl-5">{children}</ol>,
                      li: ({ children }) => <li className="my-0.5">{children}</li>,
                      a: ({ href, children }) => (
                        <a href={href} target="_blank" rel="noopener noreferrer" className="text-cyan-300 hover:underline">
                          {children}
                        </a>
                      ),
                      code: ({ children }) => (
                        <code className="rounded bg-white/10 px-1 py-px text-[11px] text-white/90">{children}</code>
                      ),
                      blockquote: ({ children }) => (
                        <blockquote className="my-2 border-l-2 border-white/20 pl-3 text-white/70">{children}</blockquote>
                      ),
                    }}
                  >
                    {d.body}
                  </ReactMarkdown>
                </article>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
