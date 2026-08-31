import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "简历补强建议",
  description: "根据目标简历中的能力证据，在编辑器内提示可选的学习与作品补强方向。",
};

export default async function GrowthPage({ searchParams }: { searchParams: Promise<{ resumeId?: string }> }) {
  const { resumeId } = await searchParams;
  redirect(resumeId ? `/builder/${encodeURIComponent(resumeId)}?panel=assist#learning-hint` : "/dashboard");
}
