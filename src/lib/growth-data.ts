import type { ResumeRecord, Track } from "@/types/resume";

export type GrowthArea = "communication" | "business" | "data" | "engineering" | "design" | "security-cloud";

export interface GrowthResource {
  id: string;
  title: string;
  provider: string;
  officialUrl: string;
  area: GrowthArea;
  tracks: Track[];
  skillTags: string[];
  audience: string;
  outcome: string;
  caveat: string;
  reviewedAt: string;
}

export const growthAreaLabels: Record<GrowthArea, string> = {
  communication: "英文与沟通",
  business: "商业与金融",
  data: "数据与 AI",
  engineering: "工程与作品",
  design: "产品与设计",
  "security-cloud": "安全与云计算",
};

export const growthResources: GrowthResource[] = [
  {
    id: "upenn-career-english",
    title: "English for Career Development",
    provider: "University of Pennsylvania · Coursera",
    officialUrl: "https://www.coursera.org/learn/careerdevelopment",
    area: "communication",
    tracks: ["study", "career"],
    skillTags: ["英文简历", "求职信", "面试表达"],
    audience: "希望增强英文申请或跨国求职表达的学习者",
    outcome: "系统练习职位理解、英文简历、社交与面试沟通",
    caveat: "不替代 IELTS、TOEFL 等语言成绩，也不保证录取或录用。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "wharton-business-foundations",
    title: "Business Foundations Specialization",
    provider: "Wharton · Coursera",
    officialUrl: "https://www.coursera.org/specializations/wharton-business-foundations",
    area: "business",
    tracks: ["study", "career"],
    skillTags: ["营销", "会计", "运营", "战略"],
    audience: "商科、管理、咨询或跨专业申请者",
    outcome: "建立营销、会计、金融、运营与战略的商业通识",
    caveat: "属于能力补充课程；学分或认可规则由目标机构决定。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "yale-financial-markets",
    title: "Financial Markets",
    provider: "Yale University · Coursera",
    officialUrl: "https://www.coursera.org/learn/financial-markets-global",
    area: "business",
    tracks: ["study", "career"],
    skillTags: ["资本市场", "风险管理", "行为金融"],
    audience: "金融、投行、银行、经济学方向申请者",
    outcome: "理解金融制度、市场运行、风险与行为金融基础",
    caveat: "仅供教育与能力补强，不构成投资建议或职业执照。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "google-data-analytics",
    title: "Google Data Analytics Professional Certificate",
    provider: "Google · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/google-data-analytics",
    area: "data",
    tracks: ["study", "career"],
    skillTags: ["SQL", "数据清洗", "可视化", "数据叙事"],
    audience: "数据分析、商业分析、运营与经济学方向学习者",
    outcome: "建立从数据清洗到分析表达的入门证据链",
    caveat: "建议同时展示可核验项目；证书本身不代表岗位胜任。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "ibm-data-science",
    title: "IBM Data Science Professional Certificate",
    provider: "IBM · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/ibm-data-science",
    area: "data",
    tracks: ["study", "career"],
    skillTags: ["Python", "SQL", "Jupyter", "机器学习"],
    audience: "数据科学、计算机、量化与科研方向学习者",
    outcome: "通过 Python、SQL、建模和项目实践积累可展示证据",
    caveat: "学分建议不等于自动转换学分，是否接受由院校决定。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "microsoft-power-bi",
    title: "Power BI Data Analyst Professional Certificate",
    provider: "Microsoft · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/microsoft-power-bi-data-analyst",
    area: "data",
    tracks: ["career"],
    skillTags: ["Excel", "Power BI", "数据建模", "仪表盘"],
    audience: "BI、数据分析、财务和运营岗位申请者",
    outcome: "练习数据准备、建模、报表与业务仪表盘",
    caveat: "课程结业与 PL-300 认证考试是不同凭证。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "google-project-management",
    title: "Google Project Management Professional Certificate",
    provider: "Google · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/google-project-management",
    area: "business",
    tracks: ["career"],
    skillTags: ["项目规划", "Agile", "风险", "协作"],
    audience: "项目、产品、运营及职能管理岗位申请者",
    outcome: "建立项目规划、敏捷协作与利益相关者沟通框架",
    caveat: "属于入门职业训练，不等同 PMP 等独立职业资格。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "google-ux-design",
    title: "Google UX Design Professional Certificate",
    provider: "Google · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/google-ux-design",
    area: "design",
    tracks: ["study", "career"],
    skillTags: ["用户研究", "线框图", "原型", "作品集"],
    audience: "UX/UI、产品设计与人机交互方向申请者",
    outcome: "练习从研究、原型到可用性测试的完整过程",
    caveat: "设计申请仍需作品集；证书不能替代作品质量。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "meta-front-end",
    title: "Meta Front-End Developer Professional Certificate",
    provider: "Meta · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/meta-front-end-developer",
    area: "engineering",
    tracks: ["study", "career"],
    skillTags: ["HTML", "CSS", "JavaScript", "React"],
    audience: "软件、前端及希望发布网页作品的学习者",
    outcome: "学习前端基础、React、版本控制并形成作品",
    caveat: "建议以代码仓库和部署作品证明能力；证书不免除技术考核。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "github-skills",
    title: "GitHub Skills",
    provider: "GitHub",
    officialUrl: "https://skills.github.com/",
    area: "engineering",
    tracks: ["study", "career"],
    skillTags: ["Git", "GitHub", "协作", "GitHub Pages"],
    audience: "需要建立代码作品集或网页简历的学习者",
    outcome: "用官方交互课程练习仓库、协作和部署基础",
    caveat: "公开仓库前请检查代码、历史记录和个人信息展示范围。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "google-cybersecurity",
    title: "Google Cybersecurity Professional Certificate",
    provider: "Google · Coursera",
    officialUrl: "https://www.coursera.org/professional-certificates/google-cybersecurity",
    area: "security-cloud",
    tracks: ["study", "career"],
    skillTags: ["Linux", "Python", "SQL", "SIEM"],
    audience: "网络安全、IT 与运维方向学习者",
    outcome: "补充风险、网络、SIEM、Linux 与自动化基础",
    caveat: "不等同独立安全认证，也不代表生产系统授权。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "machine-learning-specialization",
    title: "Machine Learning Specialization",
    provider: "DeepLearning.AI · Stanford Online · Coursera",
    officialUrl: "https://www.coursera.org/specializations/machine-learning-introduction",
    area: "data",
    tracks: ["study", "career"],
    skillTags: ["监督学习", "模型评估", "神经网络", "推荐系统"],
    audience: "AI、计算机、数据及科研方向学习者",
    outcome: "建立机器学习概念、评估方法与基础项目能力",
    caveat: "不等同学位课程、科研经历或论文成果。",
    reviewedAt: "2026-08-30",
  },
  {
    id: "aws-cloud-practitioner",
    title: "Cloud Practitioner Learning",
    provider: "AWS Skill Builder",
    officialUrl: "https://aws.amazon.com/training/learn-about/cloud-practitioner/",
    area: "security-cloud",
    tracks: ["study", "career"],
    skillTags: ["云服务", "定价", "安全", "架构"],
    audience: "云计算、IT、开发与技术产品方向学习者",
    outcome: "建立云服务、成本、安全和基础架构认知",
    caveat: "学习计划与认证考试相互独立，完成课程不代表取得认证。",
    reviewedAt: "2026-08-30",
  },
];

const areaEvidence: Record<GrowthArea, string[]> = {
  communication: ["english", "英语", "ielts", "toefl", "翻译", "口语", "写作"],
  business: ["商业", "business", "金融", "finance", "会计", "战略", "运营", "项目管理", "agile"],
  data: ["数据", "data", "sql", "python", "power bi", "tableau", "机器学习", "machine learning", "统计"],
  engineering: ["github", "git", "react", "javascript", "typescript", "java", "c++", "开发", "工程"],
  design: ["ux", "ui", "figma", "设计", "用户研究", "原型", "作品集"],
  "security-cloud": ["安全", "security", "aws", "azure", "cloud", "云", "linux", "siem"],
};

const areaIntent: Record<GrowthArea, RegExp> = {
  communication: /英文|英语|international|global|海外|留学|跨国|语言|communication/i,
  business: /商业|business|金融|finance|投行|银行|证券|高盛|goldman|咨询|consult|管理|项目管理|运营|市场|产品|product/i,
  data: /数据|data|人工智能|\bai\b|机器学习|machine learning|统计|量化|分析|analytics|计算机|computer/i,
  engineering: /研发|开发|工程|软件|前端|后端|算法|计算机|computer|科技|tech|制造|电网|汽车|芯片|硬件/i,
  design: /设计|design|用户体验|作品集|\bux\b|\bui\b|产品|product/i,
  "security-cloud": /安全|security|网络|运维|云计算|cloud|aws|azure|基础架构|infrastructure/i,
};

function recommendationContext(resume: ResumeRecord) {
  const evidence = JSON.stringify(resume.content).toLowerCase();
  const intent = [resume.title, resume.targetName, resume.content.basics.headline, resume.content.summary]
    .join(" ")
    .toLowerCase();
  return { evidence, intent };
}

function preferredResource(area: GrowthArea, resume: ResumeRecord, intent: string) {
  const byId = (id: string) => growthResources.find((item) => item.id === id && item.tracks.includes(resume.track));
  if (area === "business") {
    if (/金融|finance|投行|银行|bank|高盛|goldman|证券/.test(intent)) return byId("yale-financial-markets");
    if (resume.track === "career" && /项目|product|产品|运营|管理/.test(intent)) return byId("google-project-management");
    return byId("wharton-business-foundations");
  }
  if (area === "data") {
    if (/人工智能|\bai\b|机器学习|machine learning|算法|计算机|computer/.test(intent)) return byId("machine-learning-specialization") ?? byId("ibm-data-science");
    if (/power bi|商业智能|\bbi\b/.test(intent)) return byId("microsoft-power-bi");
    return byId("google-data-analytics");
  }
  if (area === "engineering") {
    if (/github|网页|作品集|portfolio/.test(intent)) return byId("github-skills");
    return byId("meta-front-end") ?? byId("github-skills");
  }
  if (area === "design") return byId("google-ux-design");
  if (area === "security-cloud") {
    return /安全|security|网络|siem/.test(intent) ? byId("google-cybersecurity") : byId("aws-cloud-practitioner");
  }
  return byId("upenn-career-english");
}

export function recommendGrowthResources(resume: ResumeRecord, limit = 3) {
  const { evidence, intent } = recommendationContext(resume);
  const scores = new Map<GrowthArea, number>();

  for (const area of Object.keys(growthAreaLabels) as GrowthArea[]) {
    const hasEvidence = areaEvidence[area].some((keyword) => evidence.includes(keyword));
    const matchesIntent = areaIntent[area].test(intent);
    scores.set(area, (hasEvidence ? 1 : 0) + (matchesIntent ? 7 : 0));
  }

  if (resume.track === "study") scores.set("communication", (scores.get("communication") ?? 0) + 3);
  if (resume.track === "career") scores.set("business", (scores.get("business") ?? 0) + 1);

  const orderedAreas = [...scores.entries()]
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([area]) => area);
  const recommendations: GrowthResource[] = [];
  for (const area of orderedAreas) {
    const resource = preferredResource(area, resume, intent);
    if (resource) recommendations.push(resource);
    if (recommendations.length >= limit) break;
  }
  return recommendations;
}

export function explainGrowthRecommendation(resume: ResumeRecord, resource: GrowthResource) {
  const { evidence, intent } = recommendationContext(resume);
  const label = growthAreaLabels[resource.area];
  if (areaEvidence[resource.area].some((keyword) => evidence.includes(keyword))) {
    return `当前草稿已出现${label}相关线索；可继续用课程项目或公开作品把它变成更可核验的证据。`;
  }
  if (areaIntent[resource.area].test(intent)) {
    return `你的目标名称或版本标签与${label}相关；这是一项待你确认的学习方向，不代表目标机构的硬性要求。`;
  }
  if (resource.area === "communication" && resume.track === "study") {
    return "留学版本通常需要处理英文申请材料；请结合具体项目官网确认语言与材料要求。";
  }
  return `这是一项通用的${label}参考；请先确认它与你的真实目标和时间投入匹配。`;
}
