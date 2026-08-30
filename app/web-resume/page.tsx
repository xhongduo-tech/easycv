import type { Metadata } from "next";
import { WebResumeClient } from "./web-resume-client";

export const metadata: Metadata = {
  title: "GitHub 网页简历",
  description: "导出安全、独立、可直接部署至 GitHub Pages 的个人网页简历。",
};

export default function WebResumePage() {
  return <WebResumeClient />;
}
