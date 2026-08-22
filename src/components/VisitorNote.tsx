"use client";

// 방문자 소통 공간 — 홈에서는 안내 + 게시판(/board) 바로가기 버튼만. 실제 글/답글은 게시판에서.
import Link from "next/link";

export default function VisitorNote() {
  return (
    <section className="mb-4 overflow-hidden rounded-2xl border border-emerald-400/25 bg-gradient-to-br from-emerald-500/[0.10] via-emerald-500/[0.04] to-transparent px-6 py-5 backdrop-blur">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2">
            <span className="text-[15px]">💬</span>
            <span className="text-[12px] font-semibold uppercase tracking-wider text-emerald-200/85">
              Visitor Board
            </span>
          </div>
          <div className="text-[17px] font-bold text-white/95 sm:text-[18px]">방문자 게시판 — 발행자와 소통하세요</div>
          <p className="mt-1 text-[12.5px] leading-relaxed text-white/60 sm:text-[13px]">
            바라는 점·다뤄줬으면 하는 테마·오류 제보를 남기면 발행자가 직접 답글을 답니다. 다른 방문자 글도 함께 볼 수 있어요.
          </p>
        </div>
        <Link
          href="/board"
          className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-emerald-400/50 bg-emerald-500/20 px-5 py-3 text-[14px] font-semibold text-emerald-50 transition hover:border-emerald-300/70 hover:bg-emerald-500/35"
        >
          게시판 바로가기 <span className="text-[16px]">→</span>
        </Link>
      </div>
    </section>
  );
}
