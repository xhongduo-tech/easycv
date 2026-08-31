import type { Metadata } from "next";
import { AccountClient } from "./account-client";

export const metadata: Metadata = { title: "账号与安全", description: "管理个人资料、登录方式、密码与会话。" };
export default function AccountPage() { return <AccountClient />; }
