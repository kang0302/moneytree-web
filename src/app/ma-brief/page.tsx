"use client";

// 관심종목 이동평균선(30/60/120일) 데일리 브리핑 뷰어.
// 데이터: kang0302/import_MT/main/data/ma_brief/latest.md (매일 GitHub Actions 로 갱신)

import React, { ReactNode, useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const BASE_DIR =
  "https://raw.githubusercontent.com/kang0302/import_MT/main/data/ma_brief";
const INDEX_URL = `${BASE_DIR}/index.json`;

// 상승 ▲=적색 / 하락 ▼=청색 (한국식). 문자열 자식에서 화살표만 색 span 으로 감싼다.
function colorArrows(node: ReactNode): ReactNode {
  if (typeof node === "string") {
    return node.split(/([▲▼])/).map((p, i) =>
      p === "▲" ? (
        <span key={i} style={{ color: "#dc2626" }}>▲</span>
      ) : p === "▼" ? (
        <span key={i} style={{ color: "#2563eb" }}>▼</span>
      ) : (
        <React.Fragment key={i}>{p}</React.Fragment>
      )
    );
  }
  if (Array.isArray(node)) return node.map((n, i) => <React.Fragment key={i}>{colorArrows(n)}</React.Fragment>);
  return node;
}

type ArchiveEntry = { date: string; asof?: string; bull?: number; bear?: number };

export default function MaBriefPage() {
  const [md, setMd] = useState<string>("");
  const [state, setState] = useState<"loading" | "ok" | "empty" | "error">("loading");
  const [dates, setDates] = useState<ArchiveEntry[]>([]);
  const [sel, setSel] = useState<string>("latest"); // "latest" 또는 YYYY-MM-DD
  const [nonce, setNonce] = useState(0);

  // 아카이브 인덱스(날짜 목록) 로드
  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`${INDEX_URL}?_cb=${Date.now()}`, { cache: "no-store" });
        if (r.ok) {
          const j = await r.json();
          if (Array.isArray(j)) setDates(j);
        }
      } catch {
        /* index 없으면 최신만 */
      }
    })();
  }, []);

  // 선택된 날짜(또는 최신) 브리핑 로드
  useEffect(() => {
    let cancelled = false;
    setState("loading");
    const url = sel === "latest" ? `${BASE_DIR}/latest.md` : `${BASE_DIR}/${sel}.md`;
    (async () => {
      try {
        const r = await fetch(`${url}?_cb=${Date.now()}`, { cache: "no-store" });
        if (!r.ok) {
          if (!cancelled) setState(r.status === 404 ? "empty" : "error");
          return;
        }
        const t = await r.text();
        if (!cancelled) {
          setMd(t);
          setState(t.trim() ? "ok" : "empty");
        }
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [sel, nonce]);

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <div className="mx-auto w-full max-w-3xl px-4 py-6">
        <div className="mb-4 flex items-center justify-between gap-2">
          <h1 className="text-lg font-semibold text-white/90">이동평균선 브리핑</h1>
          <div className="flex items-center gap-2">
            <select
              value={sel}
              onChange={(e) => setSel(e.target.value)}
              className="rounded-lg border border-white/15 bg-black/40 px-2 py-1 text-xs text-white/80 outline-none"
              title="날짜 선택 (지난 브리핑 다시보기)"
            >
              <option value="latest">최신</option>
              {dates.map((d) => (
                <option key={d.date} value={d.date}>
                  {d.date}
                  {typeof d.bull === "number" ? ` · 정${d.bull}/역${d.bear ?? 0}` : ""}
                </option>
              ))}
            </select>
            <button
              onClick={() => setNonce((n) => n + 1)}
              className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-1 text-xs text-white/70 hover:bg-white/10"
            >
              새로고침
            </button>
          </div>
        </div>
        {sel !== "latest" && (
          <div className="mb-2 text-xs text-amber-300/80">📅 {sel} 지난 브리핑을 보고 있습니다.</div>
        )}

        {state === "loading" && <div className="text-white/50">불러오는 중…</div>}
        {state === "error" && (
          <div className="text-rose-300/80">브리핑을 불러오지 못했습니다. 잠시 후 다시 시도해 주세요.</div>
        )}
        {state === "empty" && (
          <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-white/60">
            아직 생성된 브리핑이 없습니다. 데일리 워크플로우(<code className="text-white/80">ma-watchlist-brief</code>)가
            처음 실행되면 여기에 표시됩니다.
          </div>
        )}
        {state === "ok" && (
          <article className="ma-brief-prose">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                td: ({ children }) => <td>{colorArrows(children as ReactNode)}</td>,
              }}
            >
              {md}
            </ReactMarkdown>
          </article>
        )}
      </div>

      <style jsx global>{`
        .ma-brief-prose h1 { font-size: 1.25rem; font-weight: 700; margin: 0 0 0.5rem; }
        .ma-brief-prose p { color: rgba(255,255,255,0.75); margin: 0.4rem 0; font-size: 0.9rem; }
        .ma-brief-prose ul { margin: 0.4rem 0 0.8rem; padding-left: 1.1rem; list-style: disc; }
        .ma-brief-prose li { color: rgba(255,255,255,0.8); font-size: 0.9rem; margin: 0.15rem 0; }
        .ma-brief-prose strong { color: #fff; }
        .ma-brief-prose blockquote { border-left: 3px solid rgba(255,255,255,0.15); padding-left: 0.8rem; color: rgba(255,255,255,0.5); font-size: 0.8rem; margin: 0.8rem 0; }
        .ma-brief-prose table { width: 100%; border-collapse: collapse; margin: 0.6rem 0; font-size: 0.85rem; display: block; overflow-x: auto; }
        .ma-brief-prose th, .ma-brief-prose td { border: 1px solid rgba(255,255,255,0.1); padding: 0.4rem 0.6rem; text-align: left; white-space: nowrap; }
        .ma-brief-prose th { background: rgba(255,255,255,0.05); color: rgba(255,255,255,0.85); font-weight: 600; }
        .ma-brief-prose code { background: rgba(255,255,255,0.08); padding: 0.05rem 0.3rem; border-radius: 0.25rem; font-size: 0.8em; }
      `}</style>
    </main>
  );
}
