import type { Metadata } from "next";
import { AuthClient } from "../auth-client";

export const metadata: Metadata = { title: "找回密码", description: "通过邮箱或手机号重置简迹 CV 密码。" };

export default function ForgotPasswordPage() { return <AuthClient mode="forgot" />; }
