import fs from "fs";
import path from "path";
import BaggersClient, { type BaggersData } from "./BaggersClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "x3~x10 배거 포트폴리오 · MONEYTREE",
  description: "2023.7~2026.6 3년간 3~10배 이상 상승한 개별종목 포트폴리오",
};

function loadBaggers(): BaggersData | null {
  try {
    const p = path.join(process.cwd(), "public", "data", "baggers.json");
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return null;
  }
}

export default function BaggersPage() {
  const data = loadBaggers();
  if (!data) {
    return (
      <main className="min-h-screen bg-[#0a0e17] p-10 text-white/80">
        배거 데이터를 불러오지 못했습니다.
      </main>
    );
  }
  return <BaggersClient data={data} />;
}
