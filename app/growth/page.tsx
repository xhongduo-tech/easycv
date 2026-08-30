import type { Metadata } from "next";
import { GrowthClient } from "./growth-client";

export const metadata: Metadata = {
  title: "成长路线建议",
  description: "根据目标简历中的能力证据，规划课程、证书与作品补强路线。",
};

export default function GrowthPage() {
  return <GrowthClient />;
}
