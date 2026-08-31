import type { Metadata } from "next";
import { TwoFactorChallenge } from "./two-factor-client";

export const metadata: Metadata = {
  title: "双重验证",
  description: "完成简迹 CV 双重验证。",
};

export default async function TwoFactorPage({ searchParams }: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const params = await searchParams;
  return <TwoFactorChallenge returnTo={params.returnTo} />;
}
