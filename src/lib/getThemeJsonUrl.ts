// src/lib/getThemeJsonUrl.ts

const GITHUB_OWNER = "kang0302";
const GITHUB_REPO = "import_MT";

// 개발 중에는 env로 브랜치 전환 가능
const GITHUB_THEME_BRANCH =
  process.env.NEXT_PUBLIC_THEME_BRANCH || "main";

export function getThemeJsonUrl(themeId: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${GITHUB_THEME_BRANCH}/data/theme/${themeId}.json`;
}