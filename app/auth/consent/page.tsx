import type { Metadata } from "next";
import { ConsentClient } from "./consent-client";

export const metadata: Metadata = {
  title: "确认协议",
  description: "确认简迹 CV 最新用户协议与隐私说明后继续使用。",
};

export default async function ConsentPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <ConsentClient returnTo={params.returnTo} />;
}
