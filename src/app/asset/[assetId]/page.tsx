// src/app/asset/[assetId]/page.tsx
// 자산 중심 그래프 — 한 자산이 속한 테마들 + 관계를 보여주는 view.
// Server component: dynamic route, client 에 assetId 만 전달.

import AssetClient from "./AssetClient";

export default async function AssetPage({ params }: { params: Promise<{ assetId: string }> }) {
  const { assetId } = await params;
  return <AssetClient assetId={assetId} />;
}
