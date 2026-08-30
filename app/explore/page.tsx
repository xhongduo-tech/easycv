import type { Metadata } from "next";
import { ExploreClient } from "./explore-client";

export const metadata: Metadata = {
  title: "选择目标与模板",
  description: "选择留学或求职目标，获得匹配的简历结构、模板与写作建议。",
};

export default async function ExplorePage({
  searchParams,
}: {
  searchParams: Promise<{ track?: string; template?: string }>;
}) {
  const params = await searchParams;
  return (
    <ExploreClient
      initialTrack={params.track === "career" ? "career" : "study"}
      initialTemplate={params.template}
    />
  );
}
