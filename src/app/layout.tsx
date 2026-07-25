import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "난발치 — 치과 AI 상담 · 커뮤니티",
    template: "%s | 난발치",
  },
  description:
    "AI 파노라마 분석과 3D 치아 모식도로 환자가 이해하는 상담을. 치과의사 케이스 토론, 세미나, 구인구직 커뮤니티.",
  openGraph: {
    siteName: "난발치",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
