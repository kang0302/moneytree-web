"use client";

import { usePathname, useRouter } from "next/navigation";

/** 홈(/) 을 제외한 모든 페이지 좌상단에 표시되는 "이전" 버튼.
 *  브라우저 히스토리 back → 방문 직전 페이지(홈 버튼 상세·더블클릭·검색 상세 등)로 복귀. */
export default function GlobalBackButton() {
  const pathname = usePathname();
  const router = useRouter();
  if (!pathname || pathname === "/") return null;

  return (
    <button
      type="button"
      onClick={() => {
        if (typeof window !== "undefined" && window.history.length > 1) router.back();
        else router.push("/");
      }}
      title="이전 페이지로"
      aria-label="이전 페이지로"
      className="fixed bottom-4 left-4 z-[60] inline-flex items-center gap-1.5 rounded-full border border-white/20 bg-black/75 px-3.5 py-2 text-[12px] font-semibold text-white/85 shadow-lg backdrop-blur transition hover:border-white/50 hover:bg-black/95"
    >
      <span className="text-[14px] leading-none">←</span>
      Previous
    </button>
  );
}
