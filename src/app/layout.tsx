import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import GlobalBackButton from "@/components/GlobalBackButton";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://getknowvest.com"),
  title: {
    default: "Knowvest — 지식그래프 기반 글로벌 투자 테마 리서치",
    template: "%s · Knowvest",
  },
  description:
    "Knowvest는 지식그래프(knowledge graph)에 기반한 글로벌 투자 테마 리서치 서비스입니다. 국내외 뉴스·리포트·공시를 온톨로지로 구조화해 투자 테마를 구성합니다.",
  applicationName: "Knowvest",
  openGraph: {
    type: "website",
    siteName: "Knowvest",
    url: "https://getknowvest.com",
    title: "Knowvest — 지식그래프 기반 글로벌 투자 테마 리서치",
    description:
      "국내외 뉴스·리포트·공시를 온톨로지로 구조화한 글로벌 투자 테마 지식그래프. 시세는 전일 종가 기준.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Knowvest — 지식그래프 기반 글로벌 투자 테마 리서치",
    description:
      "국내외 뉴스·리포트·공시를 온톨로지로 구조화한 글로벌 투자 테마 지식그래프.",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
        suppressHydrationWarning
      >
        <GlobalBackButton />
        {children}
      </body>
    </html>
  );
}
