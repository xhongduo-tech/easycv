import { strFromU8, unzipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { toGitHubPagesBundle } from "@/lib/github-pages";
import { toDocxBlob } from "@/lib/resume-docx";
import { normalizeMammothHtml } from "@/lib/docx-html";
import { parseResumeImportText } from "@/lib/resume-import";
import { createStarterContent, templates } from "@/lib/sample-data";
import type { ResumeRecord } from "@/types/resume";

function fixture(): ResumeRecord {
  return {
    id: "00000000-0000-4000-8000-000000000001",
    userId: "user-private",
    title: "可发布简历",
    track: "career",
    targetName: "目标公司",
    templateId: "summit",
    status: "draft",
    progress: 100,
    revision: 3,
    content: createStarterContent("career"),
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
  };
}

describe("resume output formats", () => {
  it("generates a real OOXML Word package in the browser-compatible path", async () => {
    const resume = fixture();
    const blob = await toDocxBlob(resume, {
      template: templates.find((item) => item.id === resume.templateId),
    });
    const bytes = new Uint8Array(await blob.arrayBuffer());
    expect(blob.type).toBe("application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    expect(String.fromCharCode(...bytes.slice(0, 2))).toBe("PK");
    expect(bytes.byteLength).toBeGreaterThan(1_000);
  });

  it("can recover structured text from the product's editable DOCX", async () => {
    const resume = fixture();
    const blob = await toDocxBlob(resume);
    const arrayBuffer = await blob.arrayBuffer();
    const mammothModule = await import("mammoth");
    const extracted = await mammothModule.convertToHtml({ buffer: Buffer.from(arrayBuffer) }, { includeEmbeddedStyleMap: false });
    const draft = parseResumeImportText(normalizeMammothHtml(extracted.value), { sourceName: "resume.docx", sourceKind: "docx" });
    expect(draft.content.basics).toMatchObject({
      name: resume.content.basics.name,
      email: resume.content.basics.email,
      phone: resume.content.basics.phone,
      location: resume.content.basics.location,
      website: resume.content.basics.website,
      headline: resume.content.basics.headline,
    });
    expect(draft.content.experience).toHaveLength(resume.content.experience.length);
    expect(draft.content.experience[0]).toMatchObject({
      organization: resume.content.experience[0].organization,
      role: resume.content.experience[0].role,
      bullets: resume.content.experience[0].bullets,
    });
    expect(draft.content.education[0]).toMatchObject({
      school: resume.content.education[0].school,
      score: resume.content.education[0].score,
      highlights: resume.content.education[0].highlights,
    });
  });

  it("does not shift fields in DOCX when roles or dates are empty", async () => {
    const resume = fixture();
    resume.content.experience[0].role = "";
    resume.content.education[0].startDate = "";
    resume.content.education[0].endDate = "";
    const blob = await toDocxBlob(resume);
    const mammoth = await import("mammoth");
    const extracted = await mammoth.convertToHtml({ buffer: Buffer.from(await blob.arrayBuffer()) }, { includeEmbeddedStyleMap: false });
    const { content } = parseResumeImportText(normalizeMammothHtml(extracted.value), { sourceKind: "docx" });
    expect(content.experience[0]).toMatchObject({ role: "", startDate: resume.content.experience[0].startDate, endDate: resume.content.experience[0].endDate });
    expect(content.education[0]).toMatchObject({ startDate: "", endDate: "", location: resume.content.education[0].location });
  });

  it("packages a private-by-default interactive GitHub Pages micro-site", () => {
    const resume = fixture();
    const files = unzipSync(toGitHubPagesBundle(resume, {
      includeContact: false,
      variant: "interactive",
      template: templates.find((item) => item.id === resume.templateId),
    }));
    expect(Object.keys(files).sort()).toEqual([".nojekyll", "index.html", "发布说明.md"].sort());
    const html = strFromU8(files["index.html"]);
    expect(html).toContain('data-web-variant="interactive"');
    expect(html).toContain("portfolio-nav");
    expect(html).not.toContain(resume.content.basics.email);
    expect(html).not.toContain(resume.content.basics.phone);
    expect(html).not.toContain("user-private");
    expect(strFromU8(files["发布说明.md"])).toContain("Settings → Pages");
  });
});
