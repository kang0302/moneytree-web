"use client";

// 인사이트 아카이브 — 글 상세. 마크다운 렌더 + (로컬 저장본이면) 편집/삭제.
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import {
  getInsight,
  deleteLocal,
  isLocal,
  renderMarkdown,
  formatDate,
  type Insight,
} from "@/lib/insights";

export default function InsightDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = String(params?.id ?? "");
  const [article, setArticle] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [local, setLocal] = useState(false);

  useEffect(() => {
    (async () => {
      const a = await getInsight(id);
      setArticle(a);
      setLocal(isLocal(id));
      setLoading(false);
    })();
  }, [id]);

  const onDelete = () => {
    if (!window.confirm("이 글을 삭제할까요? (이 브라우저의 저장본에서 제거됩니다)")) return;
    if (deleteLocal(id)) router.push("/insights");
  };

  if (loading) {
    return (
      <main className="min-h-screen w-full bg-black text-white">
        <div className="py-24 text-center text-white/40">불러오는 중…</div>
      </main>
    );
  }

  if (!article) {
    return (
      <main className="min-h-screen w-full bg-black text-white">
        <div className="mx-auto max-w-3xl px-4 py-24 text-center">
          <div className="text-[18px] font-semibold text-white/70">글을 찾을 수 없습니다.</div>
          <Link
            href="/insights"
            className="mt-5 inline-block rounded-lg border border-sky-400/50 bg-sky-500/15 px-4 py-2 text-[13px] font-semibold text-sky-100 hover:bg-sky-500/25"
          >
            아카이브로 돌아가기
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen w-full bg-black text-white">
      <article className="mx-auto w-full max-w-3xl px-4 py-8 sm:py-12">
        <div className="mb-6 flex items-center justify-between gap-3">
          <Link
            href="/insights"
            className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-[13px] text-white/70 transition hover:bg-white/[0.08]"
          >
            ← 아카이브
          </Link>
          {local && (
            <div className="flex gap-2">
              <Link
                href={`/insights/new?id=${article.id}`}
                className="rounded-lg border border-white/12 bg-white/[0.04] px-3 py-2 text-[13px] text-white/75 transition hover:bg-white/[0.08]"
              >
                편집
              </Link>
              <button
                onClick={onDelete}
                className="rounded-lg border border-rose-400/40 bg-rose-500/10 px-3 py-2 text-[13px] text-rose-200 transition hover:bg-rose-500/20"
              >
                삭제
              </button>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2 text-[12.5px] text-white/45">
          <span>{formatDate(article.publishedAt)}</span>
          <span className="text-white/20">·</span>
          <span>{article.author}</span>
        </div>
        <h1 className="mt-2 text-[30px] font-extrabold leading-tight tracking-tight text-white sm:text-[38px]">
          {article.title}
        </h1>
        {article.tags.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {article.tags.map((t) => (
              <Link
                key={t}
                href={`/insights?tag=${encodeURIComponent(t)}`}
                className="rounded-full border border-white/10 bg-black/40 px-2.5 py-0.5 text-[12px] text-white/55 hover:bg-white/10"
              >
                #{t}
              </Link>
            ))}
          </div>
        )}

        <div
          className="mt-7 border-t border-white/10 pt-7 text-[15.5px]"
          dangerouslySetInnerHTML={{ __html: renderMarkdown(article.body) }}
        />
      </article>
    </main>
  );
}
