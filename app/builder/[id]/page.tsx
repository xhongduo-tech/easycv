import type { Metadata } from "next";
import { BuilderClient } from "./builder-client";

export const metadata: Metadata = {
  title: "简历编辑器",
  description: "编辑、检查并导出目标定制简历。",
  openGraph: { images: [] },
  twitter: { images: [] },
};

export default async function BuilderPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ export?: string }> }) {
  const { id } = await params;
  const query = await searchParams;
  return <BuilderClient resumeId={id} initialExport={query.export === "web"} />;
}
