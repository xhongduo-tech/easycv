import type { Metadata } from "next";
import { AuthBootstrap } from "@/components/auth-bootstrap";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: {
    default: "简迹 CV｜AI 简历助手",
    template: "%s｜简迹 CV",
  },
  description: "用 AI 梳理经历、优化表达并制作专业简历，支持打印或存为 PDF 与个人网页输出。",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    title: "简迹 CV｜AI 简历助手",
    description: "用 AI 梳理经历、优化表达并制作专业简历，支持 PDF 与个人网页输出。",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "简迹 CV — AI 简历助手" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "简迹 CV｜AI 简历助手",
    description: "用 AI 做好简历，完成 PDF 与个人网页输出。",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="zh-CN">
      <body><AuthBootstrap />{children}</body>
    </html>
  );
}
