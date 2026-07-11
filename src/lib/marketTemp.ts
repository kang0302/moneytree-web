// src/lib/marketTemp.ts
// 시장의 온도 6단계 밴드 + 스코어 헬퍼 (Home / 온도 상세 페이지 공용)

export type TempBand = { key: string; label: string; min: number; color: string; emoji: string };

// 점수 0~1000 → Blazing/Hot/Warm/Neutral/Cool/Cold
export const TEMP_BANDS: TempBand[] = [
  { key: "blazing", label: "Blazing", min: 850, color: "#b11226", emoji: "🔥" },
  { key: "hot", label: "Hot", min: 700, color: "#ef476f", emoji: "🌶️" },
  { key: "warm", label: "Warm", min: 550, color: "#ff9f45", emoji: "☀️" },
  { key: "neutral", label: "Neutral", min: 420, color: "#a3a3a3", emoji: "⚖️" },
  { key: "cool", label: "Cool", min: 280, color: "#4d96ff", emoji: "💧" },
  { key: "cold", label: "Cold", min: 0, color: "#1f3c88", emoji: "❄️" },
];

export function clamp(n: number, a = 0, b = 1000) {
  return Math.max(a, Math.min(b, n));
}

export function computeOverall(summary: any): number | null {
  if (typeof summary?.overallScore === "number") return clamp(summary.overallScore);
  const h = typeof summary?.healthScore === "number" ? summary.healthScore : null;
  const m = typeof summary?.momentumScore === "number" ? summary.momentumScore : null;
  if (h === null || m === null) return null;
  return clamp(h * 0.6 + m * 0.4);
}

export function bandOf(score: number | null): TempBand | null {
  if (score === null) return null;
  for (const b of TEMP_BANDS) {
    if (score >= b.min) return b;
  }
  return TEMP_BANDS[TEMP_BANDS.length - 1];
}

export function bandByKey(key: string | null | undefined): TempBand | undefined {
  return TEMP_BANDS.find((b) => b.key === key);
}

export function scoreBadgeColor(score: number | null): string {
  return bandOf(score)?.color ?? "rgba(255,255,255,0.45)";
}

export function scoreLabel(score: number | null): string {
  return bandOf(score)?.label ?? "—";
}
