import type { Metadata } from "next";
import { AuthClient } from "../auth-client";

export const metadata: Metadata = { title: "检查邮箱" };
export default function CheckEmailPage() { return <AuthClient mode="check-email" />; }
