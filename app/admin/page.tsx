import type { Metadata } from "next";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = { title: "管理概览", description: "简迹 CV 平台运行与内容治理概览。" };

export default function AdminPage() {
  return <AdminClient />;
}
