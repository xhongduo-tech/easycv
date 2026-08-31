import type { ResumeTemplate, TemplateDensity, TemplateFamily } from "@/types/resume";

export interface TemplateDesignMeta {
  family: TemplateFamily;
  familyLabel: string;
  density: TemplateDensity;
  rationale: string;
  principles: string[];
}

const fallbackMeta: TemplateDesignMeta = {
  family: "corporate",
  familyLabel: "通用专业",
  density: "balanced",
  rationale: "使用清楚的单栏层级与稳定的日期列，优先保证快速阅读和纯文本导出。",
  principles: ["单栏信息流", "明确日期列", "无装饰性图表"],
};

export const templateDesignMeta: Record<string, TemplateDesignMeta> = {
  atlas: {
    family: "academic",
    familyLabel: "学术申请",
    density: "balanced",
    rationale: "细分隔线、克制标题与稳定日期列，让学术准备、研究经历和成果先被看见。",
    principles: ["研究证据优先", "传统学术层级", "英文 CV 友好"],
  },
  camber: {
    family: "editorial",
    familyLabel: "跨学科表达",
    density: "spacious",
    rationale: "用编辑式标题和更充足的留白容纳跨学科叙事，同时保持单栏阅读顺序。",
    principles: ["跨学科叙事", "留白充足", "单栏可解析"],
  },
  northstar: {
    family: "research",
    familyLabel: "科研高密度",
    density: "compact",
    rationale: "压缩段间距并强化条目层级，为论文、实验、竞赛和技术项目保留更多有效空间。",
    principles: ["高信息密度", "方法与成果", "长履历适配"],
  },
  meridian: {
    family: "international",
    familyLabel: "国际项目",
    density: "balanced",
    rationale: "轻量色块与清楚分区平衡教育和实践，适合授课型项目与国际化经历。",
    principles: ["教育实践平衡", "国际化语气", "清楚分区"],
  },
  harbour: {
    family: "international",
    familyLabel: "港新申请",
    density: "compact",
    rationale: "紧凑的国际申请结构突出课程、项目与实习之间的连接，不依赖装饰性元素。",
    principles: ["课程项目连接", "紧凑单栏", "重点快速扫描"],
  },
  oxbridge: {
    family: "academic",
    familyLabel: "研究型申请",
    density: "spacious",
    rationale: "传统学术排版和更明确的研究层级，适合方法、论文与学术准备占比较高的材料。",
    principles: ["研究准备度", "克制衬线标题", "方法证据"],
  },
  pacific: {
    family: "international",
    familyLabel: "实践型申请",
    density: "balanced",
    rationale: "更直接的标题和结果层级，突出教育背景如何连接项目、实习与职业方向。",
    principles: ["实践连接", "直接表达", "结果层级"],
  },
  continental: {
    family: "editorial",
    familyLabel: "欧陆项目",
    density: "balanced",
    rationale: "细致的编辑式层级突出专业深度、项目方法与跨文化经历，保持理性克制。",
    principles: ["专业深度", "方法叙事", "跨文化经历"],
  },
  summit: {
    family: "product",
    familyLabel: "科技产品",
    density: "balanced",
    rationale: "高识别度标题、紧凑结果条目与清楚技能区，帮助快速定位角色边界和业务影响。",
    principles: ["结果优先", "技能可扫描", "角色边界"],
  },
  pillar: {
    family: "public",
    familyLabel: "稳健组织",
    density: "balanced",
    rationale: "正式的字号比例、低饱和强调色与规整分隔，突出可靠执行和组织协作。",
    principles: ["正式稳健", "组织经历", "低装饰度"],
  },
  signal: {
    family: "editorial",
    familyLabel: "品牌增长",
    density: "spacious",
    rationale: "以有节制的编辑感呈现洞察、策略和创意成果，不使用技能条或主观评级。",
    principles: ["策略叙事", "品牌表达", "不使用主观图表"],
  },
  forge: {
    family: "engineering",
    familyLabel: "工程技术",
    density: "compact",
    rationale: "近单色、高密度和清楚的技术条目层级，突出系统边界、工具与可验证指标。",
    principles: ["技术深度", "系统边界", "高密度交付"],
  },
  statecraft: {
    family: "public",
    familyLabel: "央国企校招",
    density: "balanced",
    rationale: "端正规整的标题和分隔系统，优先呈现专业匹配、组织实践与可靠闭环。",
    principles: ["专业匹配", "组织协作", "正式单栏"],
  },
  sterling: {
    family: "finance",
    familyLabel: "金融咨询",
    density: "compact",
    rationale: "窄日期列、细规则线和高信息密度，适合分析、案例、交易与交付证据的快速核验。",
    principles: ["分析与数字", "交付证据", "一页优先"],
  },
  orbit: {
    family: "product",
    familyLabel: "全球科技",
    density: "balanced",
    rationale: "现代但克制的标题系统兼顾技术深度、端到端责任与跨团队影响。",
    principles: ["端到端责任", "规模化影响", "全球协作"],
  },
  venture: {
    family: "finance",
    familyLabel: "商业策略",
    density: "balanced",
    rationale: "清楚的论点式标题和结果条目适合商业分析、咨询、快消与跨职能项目。",
    principles: ["商业判断", "跨职能执行", "结果条目"],
  },
};

export function getTemplateDesignMeta(templateId?: string): TemplateDesignMeta {
  return templateId ? templateDesignMeta[templateId] ?? fallbackMeta : fallbackMeta;
}

export function withTemplateDesignMeta<T extends Pick<ResumeTemplate, "id">>(template: T) {
  return { ...template, ...getTemplateDesignMeta(template.id) };
}
