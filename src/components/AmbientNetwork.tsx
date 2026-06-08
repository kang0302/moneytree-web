"use client";

// AmbientNetwork — 랜딩 페이지 배경 ambient 애니메이션 placeholder.
// 실제 구현은 미정. 빌드 통과용 stub — 빈 div 만 렌더.
// TODO: project_home_landing_design.md 의 Ambient 배경 디자인 구현 시 교체.

type Props = { className?: string };

export default function AmbientNetwork({ className }: Props) {
  return <div className={className} aria-hidden />;
}
