import type { MetadataRoute } from "next";

// getknowvest.com 검색 노출 정책. API·프록시 경로는 크롤링 제외.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/"],
    },
    sitemap: "https://getknowvest.com/sitemap.xml",
    host: "https://getknowvest.com",
  };
}
