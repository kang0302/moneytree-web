// src/lib/getBriefingUrl.ts
// 테마 브리핑 markdown URL 빌더.
// repo: kang0302/import_MT, 경로: data/briefing/{themeId}.md
//
// 브랜치 정책:
//   - briefing 은 main 브랜치 canonical (theme JSON 의 fix 와 다름)
//   - NEXT_PUBLIC_BRIEFING_BRANCH env 로 override 가능
//   - primary 없으면 NEXT_PUBLIC_THEME_BRANCH 도 fallback 시도

const GITHUB_OWNER = "kang0302";
const GITHUB_REPO = "import_MT";
const PRIMARY_BRANCH =
  process.env.NEXT_PUBLIC_BRIEFING_BRANCH || "main";
const FALLBACK_BRANCH =
  process.env.NEXT_PUBLIC_THEME_BRANCH || "main";

function url(branch: string, themeId: string): string {
  return `https://raw.githubusercontent.com/${GITHUB_OWNER}/${GITHUB_REPO}/${branch}/data/briefing/${themeId}.md`;
}

export function getBriefingUrl(themeId: string): string {
  return url(PRIMARY_BRANCH, themeId);
}

/** primary 브랜치에 파일 없을 때 시도할 fallback URL. 같은 브랜치면 null. */
export function getBriefingFallbackUrl(themeId: string): string | null {
  if (PRIMARY_BRANCH === FALLBACK_BRANCH) return null;
  return url(FALLBACK_BRANCH, themeId);
}
