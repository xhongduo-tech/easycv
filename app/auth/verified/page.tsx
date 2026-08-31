import type { Metadata } from "next";
import { AuthClient } from "../auth-client";

export const metadata: Metadata = { title: "邮箱已确认" };
export default function VerifiedPage() { return <AuthClient mode="verified" />; }
