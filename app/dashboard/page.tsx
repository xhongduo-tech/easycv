import type { Metadata } from "next";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "我的简历",
  description: "新建、管理并继续编辑你的简历。",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ new?: string; track?: string }>;
}) {
  const params = await searchParams;
  const initialTrack = params.track === "study" || params.track === "career" ? params.track : undefined;
  return <DashboardClient key={`${params.new === "1"}-${initialTrack ?? "all"}`} initialCreate={params.new === "1"} initialTrack={initialTrack} />;
}
