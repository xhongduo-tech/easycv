import type { Metadata } from "next";
import { AuthClient } from "../auth-client";

export const metadata: Metadata = { title: "注册", description: "创建简迹 CV 账号并安全保存简历。" };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ returnTo?: string }> }) {
  const params = await searchParams;
  return <AuthClient mode="register" returnTo={params.returnTo} />;
}
