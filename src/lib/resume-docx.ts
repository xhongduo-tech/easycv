import { toResumeDocument } from "@/lib/resume-document";
import type { ResumeRecord, ResumeTemplate } from "@/types/resume";

export async function toDocxBlob(
  resume: ResumeRecord,
  options: { includeContact?: boolean; template?: ResumeTemplate } = {},
) {
  const {
    AlignmentType,
    BorderStyle,
    Document,
    HeadingLevel,
    Packer,
    Paragraph,
    TextRun,
  } = await import("docx");
  const model = toResumeDocument(resume.content, options.includeContact !== false);
  const accent = normalizeWordColor(options.template?.accent);
  const children: InstanceType<typeof Paragraph>[] = [
    new Paragraph({
      alignment: AlignmentType.LEFT,
      spacing: { after: 80 },
      children: [new TextRun({ text: model.name, bold: true, size: 38, color: "171822" })],
    }),
  ];
  if (model.headline) {
    children.push(new Paragraph({
      spacing: { after: 100 },
      children: [new TextRun({ text: model.headline, bold: true, size: 20, color: accent })],
    }));
  }
  if (model.contact.length) {
    children.push(new Paragraph({
      border: { bottom: { color: accent, style: BorderStyle.SINGLE, size: 8, space: 8 } },
      spacing: { after: 260 },
      children: [new TextRun({ text: model.contact.join("  ·  "), size: 17, color: "626574" })],
    }));
  }

  for (const section of model.sections) {
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      spacing: { before: 180, after: 90 },
      border: { bottom: { color: "D9D8D4", style: BorderStyle.SINGLE, size: 3, space: 4 } },
      children: [new TextRun({ text: section.title, bold: true, size: 18, color: accent })],
    }));
    for (const entry of section.entries) {
      if (entry.title || entry.subtitle || entry.meta || entry.location) {
        const identity = section.id === "experience"
          ? [entry.subtitle, entry.title]
          : [entry.title, entry.subtitle];
        const headerParts = [...identity, entry.meta, entry.location].map((part) => part ?? "");
        while (headerParts.length > 1 && !headerParts.at(-1)) headerParts.pop();
        children.push(new Paragraph({
          keepNext: true,
          spacing: { before: 70, after: 30 },
          children: headerParts.map((part, index) => new TextRun({
            text: `${index > 0 ? "  |  " : ""}${part}`,
            bold: index === 0,
            size: index < 2 ? 19 : 16,
            color: index === 0 ? "20212A" : index === 1 ? "4D505C" : "676A75",
          })),
        }));
      }
      if (entry.body) {
        children.push(new Paragraph({
          spacing: { after: 80, line: 300 },
          children: [new TextRun({ text: entry.body, size: 19, color: "343641" })],
        }));
      }
      for (const bullet of entry.bullets ?? []) {
        children.push(new Paragraph({
          bullet: { level: 0 },
          spacing: { after: 35, line: 285 },
          children: [new TextRun({ text: bullet, size: 18, color: "343641" })],
        }));
      }
    }
  }

  const doc = new Document({
    creator: "简迹 CV",
    title: resume.title,
    description: "由简迹 CV 生成的可编辑 Word 简历",
    styles: {
      default: {
        document: {
          run: { font: "Aptos", size: 19, color: "20212A" },
          paragraph: { spacing: { line: 285 } },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          margin: { top: 900, right: 900, bottom: 900, left: 900 },
        },
      },
      children,
    }],
  });
  return Packer.toBlob(doc);
}

function normalizeWordColor(value?: string) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value!.slice(1).toUpperCase() : "5C3EE8";
}
