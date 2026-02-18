// src/app/themes/page.tsx
import ThemesClient from "./ThemesClient";
import { fetchThemeIndex } from "@/lib/themeIndex";

export const dynamic = "force-dynamic";

export default async function ThemesPage() {
  const themes = (await fetchThemeIndex()) ?? [];

  return (
    <ThemesClient
      themes={themes}
      sourceLabel="data/theme/index.json"
    />
  );
}
