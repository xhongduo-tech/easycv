import type { Metadata } from "next";
import { AdminUsersClient } from "./users-client";

export const metadata: Metadata = { title: "用户管理", description: "查询用户并管理角色与账号状态。" };
export default function AdminUsersPage() { return <AdminUsersClient />; }
