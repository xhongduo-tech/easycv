import type { Metadata } from "next";
import { AuthClient } from "../auth-client";

export const metadata: Metadata = { title: "登录", description: "登录简迹 CV，安全管理并跨设备保存简历。" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthClient mode="login" returnTo={params.returnTo} initialError={params.error} />;
}
