import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "网页简历输出",
  description: "导出安全、独立、可部署至 GitHub Pages 或其他静态托管服务的个人网页简历。",
};

export default async function WebResumePage({ searchParams }: { searchParams: Promise<{ resumeId?: string }> }) {
  const { resumeId } = await searchParams;
  redirect(resumeId ? `/builder/${encodeURIComponent(resumeId)}?export=web` : "/dashboard");
}
