import type { Metadata } from "next";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = {
  title: "治理演示台",
  description: "当前访客空间的摘要、目标画像、模板与内容治理演示。",
};

export default function AdminPage() {
  return <AdminClient />;
}
