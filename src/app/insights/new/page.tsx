"use client";

// 인사이트 아카이브 — 새 글 작성/편집. 마크다운 입력 + 실시간 미리보기 + 게시.
// ?id=<기존글> 이면 로컬 저장본을 편집.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import {
  getInsight,
  upsertLocal,
  isLocal,
  renderMarkdown,
  type Insight,
} from "@/lib/insights";

function Editor() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get("id");

  const [title, setTitle] = useState("");
  const [author, setAuthor] = useState("발행자");
  const [tags, setTags] = useState("");
  const [body, setBody] = useState("");
  const [loaded, setLoaded] = useState(!editId);
  const [saved, setSaved] = useState<Insight | null>(null);
  const [copied, setCopied] = useState(false);
  const [showPreview, setShowPreview] = useState(false);

  useEffect(() => {
    if (!editId) return;
    (async () => {
      const a = await getInsight(editId);
      if (a) {
        setTitle(a.title);
        setAuthor(a.author);
        setTags(a.tags.join(", "));
        setBody(a.body);
      }
      setLoaded(true);
    })();
  }, [editId]);

  const taRef = useRef<HTMLTextAreaElement>(null);
  const canPublish = title.trim().length > 0 && body.trim().length > 0;
  const previewHtml = useMemo(() => renderMarkdown(body), [body]);

  // 커서 위치에 텍스트 삽입 (테마 그래프 토큰 등)
  const insertAtCursor = (text: string) => {
    const ta = taRef.current;
    if (!ta) {
      setBody((b) => b + text);
      return;
    }
    const start = ta.selectionStart ?? body.length;
    const end = ta.selectionEnd ?? body.length;
    const next = body.slice(0, start) + text + body.slice(end);
    setBody(next);
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + text.length;
      ta.setSelectionRange(pos, pos);
    });
  };

  // 테마 그래프 삽입 — 테마 ID 입력받아 [[T_xxx]] 토큰을 본문에 삽입
  const insertTheme = () => {
    const raw = window.prompt("삽입할 테마 ID를 입력하세요 (예: T_028)", "T_");
    if (!raw) return;
    const id = raw.trim().toUpperCase().replace(/\s+/g, "");
    if (!/^T_\d{1,4}$/.test(id)) {
      window.alert("테마 ID 형식이 올바르지 않습니다. 예: T_028");
      return;
    }
    insertAtCursor(`\n[[${id}]]\n`);
  };
  const editable = !editId || isLocal(editId); // 시드 글은 로컬 편집본으로 새로 저장

  const onPublish = () => {
    if (!canPublish) return;
    const article = upsertLocal({
      id: editId && editable ? editId : undefined,
      title,
      author,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      body,
    });
    setSaved(article);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const exportJson = (a: Insight) => {
    const rest = {
      id: a.id,
      title: a.title,
      body: a.body,
      tags: a.tags,
      author: a.author,
      publishedAt: a.publishedAt,
    };
    const json = JSON.stringify(rest, null, 2);
    navigator.clipboard?.writeText(json).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      },
      () => {},
    );
  };

  if (!loaded) {
    return <div className="py-20 text-center text-white/40">불러오는 중…</div>;
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-8 sm:py-10">
      <header className="mb-6 flex items-center justify-between gap-3">
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sky-300/80">
            {editId ? "EDIT" : "NEW"} INSIGHT
          </div>
          <h1 className="mt-1 text-[24px] font-extrabold tracking-tight sm:text-[28px]">
            {editId ? "글 편집" : "새 글 작성"}
          </h1>
        </div>
        <Link
          href="/insights"
          className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/[0.08]"
        >
          ← 아카이브
        </Link>
      </header>

      {/* 게시 완료 배너 */}
      {saved && (
        <div className="mb-5 rounded-2xl border border-emerald-400/30 bg-emerald-500/10 p-4">
          <div className="text-[14px] font-semibold text-emerald-200">
            ✅ 게시되었습니다 — 이 브라우저의 아카이브에 바로 표시됩니다.
          </div>
          <p className="mt-1.5 text-[12.5px] leading-relaxed text-white/60">
            모든 방문자에게 영구·공유 게시하려면 아래 JSON을 복사해{" "}
            <code className="rounded bg-white/10 px-1">public/data/insights.json</code> 배열에 추가·배포하세요.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href={`/insights/${saved.id}`}
              className="rounded-lg border border-white/15 bg-black/40 px-3.5 py-2 text-[13px] font-semibold text-white/85 hover:bg-black/60"
            >
              게시글 보기
            </Link>
            <button
              onClick={() => exportJson(saved)}
              className="rounded-lg border border-sky-400/50 bg-sky-500/15 px-3.5 py-2 text-[13px] font-semibold text-sky-100 hover:bg-sky-500/25"
            >
              {copied ? "복사됨!" : "게시용 JSON 복사"}
            </button>
            <button
              onClick={() => router.push("/insights")}
              className="rounded-lg border border-white/10 bg-white/[0.03] px-3.5 py-2 text-[13px] text-white/70 hover:bg-white/[0.08]"
            >
              아카이브로
            </button>
          </div>
        </div>
      )}

      {!editable && (
        <div className="mb-4 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-2.5 text-[12.5px] text-amber-100/90">
          이 글은 공유본(시드)입니다. 편집 후 게시하면 이 브라우저의 로컬 사본으로 저장됩니다.
        </div>
      )}

      {/* 메타 입력 */}
      <div className="flex flex-col gap-3">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="제목을 입력하세요"
          className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-5 py-4 font-bold text-white placeholder:text-white/30 outline-none focus:border-sky-400/50"
          style={{ fontSize: 22 }}
        />
        <div className="flex flex-col gap-3 sm:flex-row">
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            placeholder="작성자"
            className="rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-sky-400/50 sm:w-56"
          />
          <input
            value={tags}
            onChange={(e) => setTags(e.target.value)}
            placeholder="태그 (쉼표로 구분)  예: 반도체, HBM, 엔비디아"
            className="flex-1 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[14px] text-white placeholder:text-white/30 outline-none focus:border-sky-400/50"
          />
        </div>
      </div>

      {/* 툴바 */}
      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2">
        <button onClick={() => insertAtCursor("## ")} className="rounded-md px-2.5 py-1.5 text-[13px] font-semibold text-white/70 hover:bg-white/10" title="소제목">H</button>
        <button onClick={() => insertAtCursor("**굵게**")} className="rounded-md px-2.5 py-1.5 text-[13px] font-bold text-white/70 hover:bg-white/10" title="굵게">B</button>
        <button onClick={() => insertAtCursor("- ")} className="rounded-md px-2.5 py-1.5 text-[13px] text-white/70 hover:bg-white/10" title="목록">• 목록</button>
        <button onClick={() => insertAtCursor("> ")} className="rounded-md px-2.5 py-1.5 text-[13px] text-white/70 hover:bg-white/10" title="인용">❝ 인용</button>
        <button onClick={() => insertAtCursor("[링크](https://)")} className="rounded-md px-2.5 py-1.5 text-[13px] text-white/70 hover:bg-white/10" title="링크">🔗 링크</button>
        <span className="mx-1 h-4 w-px bg-white/15" />
        <button onClick={insertTheme} className="rounded-md border border-indigo-400/40 bg-indigo-500/15 px-2.5 py-1.5 text-[13px] font-semibold text-indigo-100 hover:bg-indigo-500/25" title="테마 그래프 삽입 ([[T_028]])">📊 테마 그래프</button>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={() => setShowPreview((v) => !v)}
            className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${showPreview ? "border border-sky-400/50 bg-sky-500/20 text-sky-100" : "border border-white/12 bg-white/[0.04] text-white/70 hover:bg-white/10"}`}
          >
            {showPreview ? "✕ 미리보기 닫기" : "👁 미리보기"}
          </button>
        </div>
      </div>

      {/* 집필 영역 */}
      <div className={`mt-3 grid gap-4 ${showPreview ? "lg:grid-cols-2" : "grid-cols-1"}`}>
        <textarea
          ref={taRef}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder={"여기에 본문을 작성하세요 (마크다운 지원)\n\n# 큰제목\n## 소제목\n- 목록 항목\n> 인용구\n**굵게**  *기울임*  `코드`\n[링크 텍스트](https://...)\n\n관련 테마 그래프는 [[T_028]] 처럼 삽입하면 카드로 표시됩니다."}
          className="w-full resize-y rounded-2xl border border-white/12 bg-white/[0.04] px-5 py-4 font-mono leading-relaxed text-white placeholder:text-white/25 outline-none focus:border-sky-400/50"
          style={{ minHeight: "60vh", fontSize: 15 }}
        />

        {showPreview && (
          <div
            className="w-full overflow-auto rounded-2xl border border-white/10 bg-white/[0.02] px-6 py-5"
            style={{ minHeight: "60vh" }}
          >
            <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/35">미리보기</div>
            <div className="font-extrabold leading-tight text-white" style={{ fontSize: 26 }}>
              {title || <span className="text-white/25">제목 미리보기</span>}
            </div>
            {tags.trim() && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                  <span key={t} className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-white/50">#{t}</span>
                ))}
              </div>
            )}
            <div className="mt-4 border-t border-white/10 pt-4" style={{ fontSize: 15.5 }}>
              {body.trim() ? (
                <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
              ) : (
                <div className="text-white/25">본문을 입력하면 여기에 렌더링됩니다.</div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 하단 게시 바 */}
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[12.5px] text-white/40">
          {body.length}자 · 마크다운 &amp; 테마 그래프([[T_028]]) 지원
        </span>
        <button
          onClick={onPublish}
          disabled={!canPublish}
          className={`rounded-xl px-7 py-3 text-[15px] font-bold transition ${
            canPublish
              ? "border border-sky-400/50 bg-sky-500/25 text-sky-50 hover:bg-sky-500/35"
              : "cursor-not-allowed border border-white/10 bg-white/[0.03] text-white/30"
          }`}
        >
          {editId ? "수정 게시" : "게시하기"}
        </button>
      </div>
    </div>
  );
}

export default function NewInsightPage() {
  return (
    <main className="min-h-screen w-full bg-black text-white">
      <Suspense fallback={<div className="py-20 text-center text-white/40">불러오는 중…</div>}>
        <Editor />
      </Suspense>
    </main>
  );
}
