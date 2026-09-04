import { describe, expect, it } from "vitest";
import { normalizeMammothHtml } from "@/lib/docx-html";
import { parseResumeImportText } from "@/lib/resume-import";

function importHtml(html: string) {
  return parseResumeImportText(normalizeMammothHtml(html), { sourceKind: "docx" });
}

describe("DOCX semantic normalization", () => {
  it("preserves two employers under a bold paragraph section heading", () => {
    const result = importHtml(`<p>王小明</p><p><strong>工作经历</strong></p>
      <p><strong>甲公司</strong></p><p>产品经理 · 2020.01至2022.01 · 上海</p>
      <ul><li>完成项目</li></ul>
      <p><strong>乙公司</strong></p><p>设计师 | 2022.02-至今 | 北京</p>
      <p>将性能提升 <strong>50%</strong>，负责核心模块。</p>`);
    expect(result.confidence).toBe("review");
    expect(result.warnings.join(" ")).toContain("原版式");
    expect(result.content.experience).toHaveLength(2);
    expect(result.content.experience[0]).toMatchObject({
      organization: "甲公司", role: "产品经理", startDate: "2020.01", endDate: "2022.01", location: "上海", bullets: ["完成项目"],
    });
    expect(result.content.experience[1]).toMatchObject({
      organization: "乙公司", role: "设计师", startDate: "2022.02", endDate: "至今", location: "北京",
      bullets: ["将性能提升 50%，负责核心模块。"],
    });
  });

  it("does not turn ordinary prose after an employer into role metadata", () => {
    const { content } = importHtml("<h2>工作经历</h2><h3>甲公司</h3><p>负责核心模块并交付三个版本。</p>");
    expect(content.experience[0]).toMatchObject({ organization: "甲公司", role: "", bullets: ["负责核心模块并交付三个版本。"] });
  });

  it.each(["2020.01至2022.01", "2020.01到2022.01", "2020.01-2022.01", "2020.01 — 2022.01"])("keeps an empty role before date range %s", (dates) => {
    const { content } = importHtml(`<h2>工作经历</h2><h3>甲公司 ${dates} 上海</h3>`);
    expect(content.experience[0]).toMatchObject({ organization: "甲公司", role: "", startDate: "2020.01", endDate: "2022.01", location: "上海" });
  });

  it("preserves empty cells in simple table headers and separates complex cell paragraphs", () => {
    const { content } = importHtml(`<h2>工作经历</h2><table><tr><td><p>甲公司</p></td><td></td><td><p>2020 — 2022</p></td><td><p>上海</p></td></tr></table>
      <table><tr><td><p>第一段</p><p>第二段</p></td><td><ul><li>第三段</li></ul></td></tr></table>`);
    expect(content.experience[0]).toMatchObject({ organization: "甲公司", role: "", startDate: "2020", endDate: "2022", location: "上海", bullets: ["第一段", "第二段", "第三段"] });
  });

  it("keeps nested list text separate and decodes entities exactly once", () => {
    const result = normalizeMammothHtml(`<h2>个人简介</h2><p>使用 &lt;canvas&gt; 与 &amp;lt;script&amp;gt;；@@P@@ &#128512;</p>
      <h2>工作经历</h2><h3>甲公司</h3><ul><li>平台优化<ul><li>性能提升50%</li></ul></li></ul>`);
    expect(result).toContain("使用 <canvas> 与 &lt;script&gt;；@@P@@ 😀");
    expect(result).toContain("- 平台优化\n- 性能提升50%");
  });

  it("rejects deeply nested or oversized converted markup", () => {
    expect(() => normalizeMammothHtml("<div>".repeat(101) + "text" + "</div>".repeat(101))).toThrow(/嵌套过深/);
    expect(() => normalizeMammothHtml("x".repeat(500_001))).toThrow(/上限/);
  });
});
