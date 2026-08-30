import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "简迹 CV｜面向目标的智能简历平台",
    template: "%s｜简迹 CV",
  },
  description: "面向留学申请与毕业求职，根据大学、企业和岗位目标生成更匹配的专业 CV。",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: "简迹 CV｜为下一站精准作答",
    description: "面向留学申请与毕业求职，根据大学、企业和岗位目标生成更匹配的专业 CV。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "简迹 CV — 为下一站精准作答" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "简迹 CV｜为下一站精准作答",
    description: "留学申请 · 毕业求职的目标驱动简历平台",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
