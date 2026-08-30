import { describe, expect, it } from "vitest";
import { createStarterContent, templates } from "@/lib/sample-data";
import { toStandaloneHtml } from "@/lib/web-resume";
import type { ResumeRecord } from "@/types/resume";

function fixture(): ResumeRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "guest-test",
    title: "测试简历",
    track: "career",
    targetName: "高盛",
    templateId: "sterling",
    status: "draft",
    progress: 100,
    revision: 1,
    content: createStarterContent("career"),
    createdAt: "2026-08-30T00:00:00.000Z",
    updatedAt: "2026-08-30T00:00:00.000Z",
  };
}

describe("standalone web resume", () => {
  it("escapes untrusted content, rejects unsafe links and hides contact by default", () => {
    const resume = fixture();
    resume.content.basics.name = `</title><script>alert("x")</script>`;
    resume.content.basics.website = "javascript:alert(1)";
    resume.content.summary = `<img src=x onerror="alert(1)">`;
    resume.content.projects[0].link = "javascript:alert(2)";

    const html = toStandaloneHtml(resume, { template: templates.find((item) => item.id === "sterling") });

    expect(html).toContain("Content-Security-Policy");
    expect(html).toContain("default-src 'none'");
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).not.toContain('href="javascript:');
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain(resume.content.basics.phone);
    expect(html).not.toContain(resume.content.basics.email);
  });

  it("includes contact only after explicit opt-in", () => {
    const resume = fixture();
    const html = toStandaloneHtml(resume, { includeContact: true });
    expect(html).toContain(resume.content.basics.email);
    expect(html).toContain(resume.content.basics.phone);
  });
});
