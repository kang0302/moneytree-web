// src/app/graph/page.tsx
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function GraphRootPage() {
  // /graph 로 들어오면, 실제 테마 목록 페이지(/themes)로 보냄
  redirect("/themes");
}
