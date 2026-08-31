import type { AdvisorResult, ResumeContent, TargetProfile, Track } from "@/types/resume";

const metricPattern = /\d+(?:\.\d+)?\s*(?:%|名|人|次|万|千|周|月|项|篇|家|个|小时|天|倍|\+)/;

export function createAdvice(
  content: ResumeContent,
  track: Track,
  target?: TargetProfile,
  section = "overview",
): AdvisorResult {
  const targetLabel = target?.name ?? (track === "study" ? "目标院校" : "目标企业");
  const overviewBullets = [
    ...content.experience.flatMap((item) => item.bullets),
    ...content.projects.flatMap((item) => item.bullets),
    ...content.education.flatMap((item) => item.highlights),
  ];
  const scopedBullets = section === "experience"
    ? content.experience.flatMap((item) => item.bullets)
    : section === "projects"
      ? content.projects.flatMap((item) => item.bullets)
      : section === "education"
        ? content.education.flatMap((item) => item.highlights)
        : section === "summary"
          ? [content.summary].filter(Boolean)
          : section === "basics" || section === "extras"
            ? []
            : overviewBullets;
  const scopedContent = section === "summary"
    ? content.summary
    : section === "experience"
      ? content.experience
      : section === "projects"
        ? content.projects
        : section === "education"
          ? content.education
          : section === "basics"
            ? { headline: content.basics.headline }
            : section === "extras"
              ? { skills: content.skills, languages: content.languages, awards: content.awards }
              : content;
  const measurable = scopedBullets.filter((bullet) => metricPattern.test(bullet)).length;
  const keywordPool = target?.keywords ??
    (track === "study"
      ? ["研究潜力", "方法", "学术严谨", "独立探索"]
      : ["用户价值", "协同", "数据驱动", "业务影响"]);
  const haystack = JSON.stringify(scopedContent).toLowerCase();
  const matchedKeywords = keywordPool.filter((keyword) => haystack.includes(keyword.toLowerCase()));

  let score = 46;
  if (content.basics.name && content.basics.email) score += 8;
  if (content.summary.length >= 70) score += 10;
  if (content.education.length) score += 8;
  if (content.experience.length) score += 8;
  if (content.projects.length) score += 6;
  score += Math.min(8, measurable * 2);
  score += Math.min(6, matchedKeywords.length * 2);
  score = Math.min(96, score);

  const suggestions: AdvisorResult["suggestions"] = [];
  if ((section === "overview" || section === "summary") && content.summary.length < 70) {
    suggestions.push({
      id: "summary-evidence",
      severity: "high",
      title: "用证据补强个人简介",
      detail: `当前简介偏短。建议用“定位 + 一项关键能力 + 一条可验证成果”回应 ${targetLabel}，避免只写形容词。`,
    });
  }
  if (["overview", "experience", "projects", "education"].includes(section) && measurable < 2) {
    suggestions.push({
      id: "metric-density",
      severity: "high",
      title: "补充真实的成果尺度",
      detail: "至少再选择两条经历，补充人数、周期、效率或结果变化。若没有可靠数字，使用明确范围，不要虚构。",
    });
  }
  if (matchedKeywords.length < 2) {
    suggestions.push({
      id: "target-language",
      severity: "medium",
      title: `建立与${targetLabel}的语言连接`,
      detail: `可自然体现 ${keywordPool.slice(0, 3).join("、")}，但必须由真实经历支撑，避免关键词堆叠。`,
    });
  }
  if (track === "study" && (section === "overview" || section === "projects") && content.projects.length === 0) {
    suggestions.push({
      id: "research-readiness",
      severity: "high",
      title: "补充研究或课程项目",
      detail: "说明问题、方法、个人贡献和发现，让审阅者能判断你的研究准备度。",
    });
  }
  if (track === "career" && (section === "overview" || section === "experience") && content.experience.length === 0) {
    suggestions.push({
      id: "role-evidence",
      severity: "high",
      title: "增加一段岗位相关经历",
      detail: "实习、项目、社团均可，关键是把行动、协作边界与结果写清楚。",
    });
  }
  if (suggestions.length < 3) {
    suggestions.push(section === "basics" ? {
      id: "headline-focus",
      severity: "low",
      title: "让标题直接说明定位",
      detail: "用专业方向、目标角色或核心能力组成一句短标题，不在基本信息中堆叠自我评价。",
    } : section === "extras" ? {
      id: "skills-evidence",
      severity: "low",
      title: "只保留能被证明的技能",
      detail: "优先保留能在教育、经历或项目中找到证据的技能，并删除过宽或重复的标签。",
    } : {
      id: "verb-variety",
      severity: "low",
      title: "让每条经历从动作开始",
      detail: "优先使用“设计、分析、推动、建立、验证”等准确动词，并删除重复的职责描述。",
    });
  }

  const sourceText = scopedBullets[0] || sectionPlaceholder(section);
  const rewrite = section === "summary"
    ? `${sourceText.replace(/[。；;]$/, "")}；补充一项与${targetLabel}相关、可核实的能力或成果。`
    : metricPattern.test(sourceText)
      ? `${sourceText.replace(/[。；;]$/, "")}；补充所用方法与个人职责边界，使结果可复核。`
      : `${sourceText.replace(/[。；;]$/, "")}；通过【真实方法/工具】解决【具体问题】，最终带来【请核实后填写的结果】。`;

  return {
    score,
    headline:
      section === "overview"
        ? `已按${targetLabel}的目标画像完成检查`
        : `已完成${sectionLabel(section)}专项检查`,
    suggestions: suggestions.slice(0, 4),
    keywords: keywordPool,
    rewrite,
  };
}

function sectionPlaceholder(section: string) {
  const placeholders: Record<string, string> = {
    summary: "用一句话说明你的专业定位",
    education: "补充一项与目标相关的课程、研究或学术成果",
    experience: "补充一项与目标相关的工作或实践经历",
    projects: "补充一项与目标相关的项目经历",
    basics: "用一句话明确你的专业定位",
    extras: "补充与目标直接相关、且能被经历证明的技能",
  };
  return placeholders[section] ?? "完成一项与目标相关的项目";
}

function sectionLabel(section: string) {
  const labels: Record<string, string> = {
    summary: "个人简介",
    experience: "经历",
    education: "教育",
    projects: "项目",
    basics: "基本信息",
    extras: "技能与其他",
  };
  return labels[section] ?? "整体";
}
