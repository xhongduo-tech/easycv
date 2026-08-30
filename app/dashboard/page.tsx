import type { Metadata } from "next";
import { DashboardClient } from "./dashboard-client";

export const metadata: Metadata = {
  title: "我的工作台",
  description: "管理留学申请与毕业求职的多个目标简历版本。",
};

export default function DashboardPage() {
  return <DashboardClient />;
}
