"use client";

// 인사이트 아카이브 — 새 글 작성/편집. 마크다운 입력 + 실시간 미리보기 + 게시.
// ?id=<기존글> 이면 로컬 저장본을 편집.
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
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

  const canPublish = title.trim().length > 0 && body.trim().length > 0;
  const previewHtml = useMemo(() => renderMarkdown(body), [body]);
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

      <div className="grid gap-5 lg:grid-cols-2">
        {/* 입력 */}
        <div className="flex flex-col gap-3">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="제목"
            className="w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[17px] font-bold text-white placeholder:text-white/30 outline-none focus:border-sky-400/50"
          />
          <div className="flex gap-3">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="작성자"
              className="w-1/2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-sky-400/50"
            />
            <input
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="태그 (쉼표로 구분)"
              className="w-1/2 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-2.5 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-sky-400/50"
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={"본문 (마크다운)\n\n# 제목\n## 소제목\n- 목록\n> 인용\n**굵게**, *기울임*, `코드`, [링크](https://...)"}
            className="min-h-[420px] w-full resize-y rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 font-mono text-[13.5px] leading-relaxed text-white placeholder:text-white/25 outline-none focus:border-sky-400/50"
          />
          <div className="flex items-center justify-between">
            <span className="text-[12px] text-white/35">
              {body.length}자 · 마크다운(# 제목, - 목록, &gt; 인용, **굵게**) 지원
            </span>
            <button
              onClick={onPublish}
              disabled={!canPublish}
              className={`rounded-lg px-5 py-2.5 text-[14px] font-semibold transition ${
                canPublish
                  ? "border border-sky-400/50 bg-sky-500/20 text-sky-100 hover:bg-sky-500/30"
                  : "cursor-not-allowed border border-white/10 bg-white/[0.03] text-white/30"
              }`}
            >
              {editId ? "수정 게시" : "게시하기"}
            </button>
          </div>
        </div>

        {/* 미리보기 */}
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-5">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.15em] text-white/35">
            미리보기
          </div>
          <div className="text-[24px] font-extrabold leading-tight text-white">
            {title || <span className="text-white/25">제목 미리보기</span>}
          </div>
          {tags.trim() && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {tags.split(",").map((t) => t.trim()).filter(Boolean).map((t) => (
                <span key={t} className="rounded-full border border-white/10 bg-black/40 px-2 py-0.5 text-[11px] text-white/50">
                  #{t}
                </span>
              ))}
            </div>
          )}
          <div className="mt-4 border-t border-white/10 pt-4">
            {body.trim() ? (
              <div dangerouslySetInnerHTML={{ __html: previewHtml }} />
            ) : (
              <div className="text-white/25">본문을 입력하면 여기에 렌더링됩니다.</div>
            )}
          </div>
        </div>
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
