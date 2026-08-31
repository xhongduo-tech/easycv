import type { Metadata } from "next";
import { AuthClient } from "../auth-client";

export const metadata: Metadata = { title: "重置密码", description: "为简迹 CV 账号设置新密码。" };

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string; error?: string }> }) {
  const params = await searchParams;
  return <AuthClient mode="reset" token={params.token} initialError={params.error} />;
}
