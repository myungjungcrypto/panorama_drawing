import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "치과 파노라마 3D 시각화",
  description: "파노라마 X-ray 기반 치아 3D 시각화 상담 도구",
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
