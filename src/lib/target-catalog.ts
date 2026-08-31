import type { TargetProfile, Track } from "@/types/resume";

export interface TargetCatalogGroup {
  key: string;
  label: string;
  description: string;
}

export const targetCatalogGroups: Record<Track, TargetCatalogGroup[]> = {
  study: [
    { key: "中国香港", label: "香港院校", description: "港八大及特色院校" },
    { key: "中国内地", label: "中国内地", description: "综合、理工与财经强校" },
    { key: "英国", label: "英国", description: "G5 与主流研究型大学" },
    { key: "美国", label: "美国", description: "综合大学与理工强校" },
    { key: "加拿大", label: "加拿大", description: "研究型与就业导向项目" },
    { key: "澳洲", label: "澳洲", description: "澳八大与实践型项目" },
    { key: "欧洲", label: "欧洲", description: "欧陆理工、商科与社科" },
    { key: "新加坡", label: "新加坡", description: "综合、理工与商科院校" },
    { key: "日本与韩国", label: "日本与韩国", description: "东亚研究型名校" },
  ],
  career: [
    { key: "央企国企", label: "央企 / 国企", description: "能源、通信、基建与国有金融" },
    { key: "互联网大厂", label: "互联网大厂", description: "产品、研发、数据与运营" },
    { key: "金融与咨询", label: "金融 / 咨询", description: "投行、证券、银行与咨询" },
    { key: "国际科技", label: "国际科技", description: "全球科技与云计算企业" },
    { key: "制造与新能源", label: "制造 / 新能源", description: "汽车、硬件与先进制造" },
    { key: "快消与医药", label: "快消 / 医药", description: "品牌、供应链与生命科学" },
  ],
};

type TargetSeed = [id: string, name: string, group: string, category: string];

const studySeeds: TargetSeed[] = [
  ["hku", "香港大学", "中国香港", "综合研究型"],
  ["cuhk", "香港中文大学", "中国香港", "综合研究型"],
  ["hkust", "香港科技大学", "中国香港", "理工与商科"],
  ["cityu-hk", "香港城市大学", "中国香港", "综合研究型"],
  ["polyu-hk", "香港理工大学", "中国香港", "理工与应用"],
  ["hkbu", "香港浸会大学", "中国香港", "综合与传媒"],
  ["lingnan-hk", "岭南大学", "中国香港", "人文与社科"],
  ["eduhk", "香港教育大学", "中国香港", "教育与社科"],
  ["tsinghua", "清华大学", "中国内地", "综合与理工"],
  ["pku", "北京大学", "中国内地", "综合研究型"],
  ["ruc", "中国人民大学", "中国内地", "人文与社科"],
  ["buaa", "北京航空航天大学", "中国内地", "航空与理工"],
  ["bit", "北京理工大学", "中国内地", "理工研究型"],
  ["bnu", "北京师范大学", "中国内地", "教育与基础学科"],
  ["ucas", "中国科学院大学", "中国内地", "科研导向"],
  ["fudan", "复旦大学", "中国内地", "综合研究型"],
  ["sjtu", "上海交通大学", "中国内地", "综合与理工"],
  ["tongji", "同济大学", "中国内地", "工程与设计"],
  ["ecnu", "华东师范大学", "中国内地", "教育与人文"],
  ["sufe", "上海财经大学", "中国内地", "财经与商科"],
  ["zju", "浙江大学", "中国内地", "综合与理工"],
  ["nju", "南京大学", "中国内地", "综合研究型"],
  ["ustc", "中国科学技术大学", "中国内地", "基础科学与理工"],
  ["seu", "东南大学", "中国内地", "工程与建筑"],
  ["wuhan", "武汉大学", "中国内地", "综合研究型"],
  ["hust", "华中科技大学", "中国内地", "工程与医学"],
  ["sysu", "中山大学", "中国内地", "综合研究型"],
  ["xmu", "厦门大学", "中国内地", "综合与财经"],
  ["nankai", "南开大学", "中国内地", "综合与商科"],
  ["tju", "天津大学", "中国内地", "工程研究型"],
  ["hit", "哈尔滨工业大学", "中国内地", "工程与航天"],
  ["xjtu", "西安交通大学", "中国内地", "工程与管理"],
  ["scu", "四川大学", "中国内地", "综合与医学"],
  ["sdu", "山东大学", "中国内地", "综合研究型"],
  ["cambridge", "剑桥大学", "英国", "G5 综合研究型"],
  ["oxford", "牛津大学", "英国", "G5 综合研究型"],
  ["imperial", "帝国理工学院", "英国", "G5 理工与医学"],
  ["ucl", "伦敦大学学院", "英国", "G5 综合研究型"],
  ["lse", "伦敦政治经济学院", "英国", "G5 社科与商科"],
  ["edinburgh", "爱丁堡大学", "英国", "综合研究型"],
  ["manchester", "曼彻斯特大学", "英国", "综合研究型"],
  ["kcl", "伦敦国王学院", "英国", "综合与医学"],
  ["warwick", "华威大学", "英国", "商科与理工"],
  ["bristol", "布里斯托大学", "英国", "综合与工程"],
  ["glasgow", "格拉斯哥大学", "英国", "综合研究型"],
  ["southampton", "南安普顿大学", "英国", "工程与计算机"],
  ["harvard", "哈佛大学", "美国", "综合研究型"],
  ["stanford", "斯坦福大学", "美国", "综合与创新"],
  ["mit", "麻省理工学院", "美国", "理工研究型"],
  ["columbia", "哥伦比亚大学", "美国", "综合研究型"],
  ["upenn", "宾夕法尼亚大学", "美国", "综合与商科"],
  ["cornell", "康奈尔大学", "美国", "综合与工程"],
  ["cmu", "卡内基梅隆大学", "美国", "计算机与工程"],
  ["uc-berkeley", "加州大学伯克利分校", "美国", "综合与理工"],
  ["ucla", "加州大学洛杉矶分校", "美国", "综合研究型"],
  ["nyu", "纽约大学", "美国", "综合与艺术"],
  ["uchicago", "芝加哥大学", "美国", "综合与社科"],
  ["northwestern", "西北大学", "美国", "综合与传媒"],
  ["duke", "杜克大学", "美国", "综合与医学"],
  ["johns-hopkins", "约翰斯·霍普金斯大学", "美国", "医学与研究"],
  ["uiuc", "伊利诺伊大学厄巴纳-香槟分校", "美国", "工程与计算机"],
  ["usc", "南加州大学", "美国", "综合与工程"],
  ["utoronto", "多伦多大学", "加拿大", "综合研究型"],
  ["ubc", "英属哥伦比亚大学", "加拿大", "综合研究型"],
  ["mcgill", "麦吉尔大学", "加拿大", "综合与医学"],
  ["waterloo", "滑铁卢大学", "加拿大", "工程与就业"],
  ["ualberta", "阿尔伯塔大学", "加拿大", "综合研究型"],
  ["mcmaster", "麦克马斯特大学", "加拿大", "工程与医学"],
  ["melbourne", "墨尔本大学", "澳洲", "澳八大综合"],
  ["sydney", "悉尼大学", "澳洲", "澳八大综合"],
  ["unsw", "新南威尔士大学", "澳洲", "澳八大理工"],
  ["anu", "澳大利亚国立大学", "澳洲", "澳八大研究型"],
  ["monash", "莫纳什大学", "澳洲", "澳八大综合"],
  ["uq", "昆士兰大学", "澳洲", "澳八大综合"],
  ["uwa", "西澳大学", "澳洲", "澳八大综合"],
  ["adelaide", "阿德莱德大学", "澳洲", "澳八大综合"],
  ["uts", "悉尼科技大学", "澳洲", "应用与就业"],
  ["eth-zurich", "苏黎世联邦理工学院", "欧洲", "理工研究型"],
  ["epfl", "洛桑联邦理工学院", "欧洲", "理工研究型"],
  ["tum", "慕尼黑工业大学", "欧洲", "工程研究型"],
  ["lmu", "慕尼黑大学", "欧洲", "综合研究型"],
  ["tu-delft", "代尔夫特理工大学", "欧洲", "工程与设计"],
  ["uva", "阿姆斯特丹大学", "欧洲", "综合与社科"],
  ["ku-leuven", "鲁汶大学", "欧洲", "综合研究型"],
  ["sciences-po", "巴黎政治学院", "欧洲", "政治与社科"],
  ["bocconi", "博科尼大学", "欧洲", "商科与经济"],
  ["psl", "巴黎文理研究大学", "欧洲", "综合研究型"],
  ["polimi", "米兰理工大学", "欧洲", "工程与设计"],
  ["erasmus", "鹿特丹伊拉斯姆斯大学", "欧洲", "商科与社科"],
  ["nus", "新加坡国立大学", "新加坡", "综合研究型"],
  ["ntu-sg", "南洋理工大学", "新加坡", "理工研究型"],
  ["smu-sg", "新加坡管理大学", "新加坡", "商科与社科"],
  ["sutd", "新加坡科技设计大学", "新加坡", "工程与设计"],
  ["u-tokyo", "东京大学", "日本与韩国", "综合研究型"],
  ["kyoto", "京都大学", "日本与韩国", "综合研究型"],
  ["osaka", "大阪大学", "日本与韩国", "综合研究型"],
  ["tohoku", "东北大学（日本）", "日本与韩国", "理工研究型"],
  ["snu", "首尔大学", "日本与韩国", "综合研究型"],
  ["kaist", "韩国科学技术院", "日本与韩国", "理工研究型"],
  ["yonsei", "延世大学", "日本与韩国", "综合研究型"],
  ["korea-university", "高丽大学", "日本与韩国", "综合研究型"],
];

const careerSeeds: TargetSeed[] = [
  ["state-grid", "国家电网", "央企国企", "能源央企"],
  ["cnpc", "中国石油", "央企国企", "能源央企"],
  ["sinopec", "中国石化", "央企国企", "能源央企"],
  ["cnooc", "中国海油", "央企国企", "能源央企"],
  ["china-mobile", "中国移动", "央企国企", "通信央企"],
  ["china-telecom", "中国电信", "央企国企", "通信央企"],
  ["china-unicom", "中国联通", "央企国企", "通信央企"],
  ["crrc", "中国中车", "央企国企", "先进制造央企"],
  ["cscec", "中国建筑", "央企国企", "基建央企"],
  ["crec", "中国中铁", "央企国企", "基建央企"],
  ["china-merchants", "招商局集团", "央企国企", "综合央企"],
  ["china-resources", "华润集团", "央企国企", "综合央企"],
  ["china-post", "中国邮政", "央企国企", "综合服务央企"],
  ["avic", "中国航空工业集团", "央企国企", "航空央企"],
  ["casic", "中国航天科工", "央企国企", "航天央企"],
  ["icbc", "中国工商银行", "央企国企", "国有银行"],
  ["ccb", "中国建设银行", "央企国企", "国有银行"],
  ["abc-bank", "中国农业银行", "央企国企", "国有银行"],
  ["boc", "中国银行", "央企国企", "国有银行"],
  ["tencent", "腾讯", "互联网大厂", "综合互联网"],
  ["alibaba", "阿里巴巴", "互联网大厂", "综合互联网"],
  ["bytedance", "字节跳动", "互联网大厂", "内容与平台"],
  ["baidu", "百度", "互联网大厂", "搜索与人工智能"],
  ["jd", "京东", "互联网大厂", "零售与物流"],
  ["meituan", "美团", "互联网大厂", "本地生活"],
  ["netease", "网易", "互联网大厂", "内容与游戏"],
  ["kuaishou", "快手", "互联网大厂", "内容平台"],
  ["xiaomi", "小米", "互联网大厂", "消费电子与互联网"],
  ["huawei", "华为", "互联网大厂", "通信与科技"],
  ["pdd", "拼多多", "互联网大厂", "电商平台"],
  ["didi", "滴滴", "互联网大厂", "出行平台"],
  ["bilibili", "哔哩哔哩", "互联网大厂", "内容社区"],
  ["ant-group", "蚂蚁集团", "互联网大厂", "金融科技"],
  ["ctrip", "携程集团", "互联网大厂", "在线旅游"],
  ["goldman-sachs", "高盛", "金融与咨询", "国际投行"],
  ["jpmorgan", "摩根大通", "金融与咨询", "国际金融"],
  ["morgan-stanley", "摩根士丹利", "金融与咨询", "国际投行"],
  ["ubs", "瑞银", "金融与咨询", "国际金融"],
  ["citi", "花旗", "金融与咨询", "国际银行"],
  ["hsbc", "汇丰", "金融与咨询", "国际银行"],
  ["mckinsey", "麦肯锡", "金融与咨询", "战略咨询"],
  ["bcg", "波士顿咨询", "金融与咨询", "战略咨询"],
  ["bain", "贝恩", "金融与咨询", "战略咨询"],
  ["deloitte", "德勤", "金融与咨询", "专业服务"],
  ["pwc", "普华永道", "金融与咨询", "专业服务"],
  ["ey", "安永", "金融与咨询", "专业服务"],
  ["kpmg", "毕马威", "金融与咨询", "专业服务"],
  ["cicc", "中金公司", "金融与咨询", "证券与投行"],
  ["citic-securities", "中信证券", "金融与咨询", "证券与投行"],
  ["huatai-securities", "华泰证券", "金融与咨询", "证券与投行"],
  ["cmb", "招商银行", "金融与咨询", "股份制银行"],
  ["ping-an", "中国平安", "金融与咨询", "综合金融"],
  ["google", "Google", "国际科技", "全球科技"],
  ["microsoft", "Microsoft", "国际科技", "全球科技"],
  ["amazon", "Amazon", "国际科技", "电商与云计算"],
  ["apple", "Apple", "国际科技", "消费电子"],
  ["nvidia", "NVIDIA", "国际科技", "芯片与人工智能"],
  ["meta", "Meta", "国际科技", "社交与人工智能"],
  ["ibm", "IBM", "国际科技", "企业科技"],
  ["tesla", "Tesla", "国际科技", "智能汽车与能源"],
  ["oracle", "Oracle", "国际科技", "企业软件与云"],
  ["sap", "SAP", "国际科技", "企业软件"],
  ["salesforce", "Salesforce", "国际科技", "云软件"],
  ["byd", "比亚迪", "制造与新能源", "新能源汽车"],
  ["catl", "宁德时代", "制造与新能源", "动力电池"],
  ["dji", "大疆创新", "制造与新能源", "智能硬件"],
  ["haier", "海尔智家", "制造与新能源", "智能家电"],
  ["midea", "美的集团", "制造与新能源", "智能制造"],
  ["gree", "格力电器", "制造与新能源", "智能制造"],
  ["saic", "上汽集团", "制造与新能源", "汽车制造"],
  ["geely", "吉利汽车", "制造与新能源", "汽车制造"],
  ["li-auto", "理想汽车", "制造与新能源", "智能汽车"],
  ["nio", "蔚来", "制造与新能源", "智能汽车"],
  ["xpeng", "小鹏汽车", "制造与新能源", "智能汽车"],
  ["longi", "隆基绿能", "制造与新能源", "新能源"],
  ["procter-gamble", "宝洁", "快消与医药", "消费品"],
  ["unilever", "联合利华", "快消与医药", "消费品"],
  ["loreal", "欧莱雅", "快消与医药", "美妆与消费品"],
  ["nestle", "雀巢", "快消与医药", "食品与消费品"],
  ["coca-cola", "可口可乐", "快消与医药", "饮料与消费品"],
  ["johnson-johnson", "强生", "快消与医药", "医疗健康"],
  ["roche", "罗氏", "快消与医药", "生命科学"],
  ["pfizer", "辉瑞", "快消与医药", "生命科学"],
  ["astrazeneca", "阿斯利康", "快消与医药", "生命科学"],
  ["novartis", "诺华", "快消与医药", "生命科学"],
];

const globalCareerTargetIds = new Set([
  "goldman-sachs", "jpmorgan", "morgan-stanley", "ubs", "citi", "hsbc",
  "mckinsey", "bcg", "bain", "deloitte", "pwc", "ey", "kpmg",
  "google", "microsoft", "amazon", "apple", "nvidia", "meta", "ibm", "tesla", "oracle", "sap", "salesforce",
  "procter-gamble", "unilever", "loreal", "nestle", "coca-cola", "johnson-johnson", "roche", "pfizer", "astrazeneca", "novartis",
]);

const studyGuidance: Record<string, Pick<TargetProfile, "description" | "keywords" | "priorities" | "tone">> = {
  中国香港: {
    description: "建议兼顾学术基础、国际表达与实践连接，并按具体项目要求复核语言和材料规则。",
    keywords: ["academic foundation", "global outlook", "application", "communication"],
    priorities: ["课程与项目匹配", "学术或实践证据", "清晰的英文表达"],
    tone: "专业、清楚、国际化",
  },
  中国内地: {
    description: "建议突出专业基础、科研或竞赛证据，以及与项目方向一致的长期投入。",
    keywords: ["专业基础", "研究潜力", "项目成果", "持续投入"],
    priorities: ["课程与成绩证据", "科研/竞赛/项目", "个人贡献边界"],
    tone: "严谨、具体、证据优先",
  },
  英国: {
    description: "建议用高密度证据说明学术准备、方法训练与目标课程连接。",
    keywords: ["academic rigor", "research readiness", "methods", "course fit"],
    priorities: ["学术准备", "研究与方法", "课程匹配"],
    tone: "克制、严谨、结构清晰",
  },
  美国: {
    description: "建议兼顾学术能力、主动性、领导或协作，以及可验证的真实影响。",
    keywords: ["initiative", "impact", "leadership", "intellectual curiosity"],
    priorities: ["独特经历轨迹", "主动创造的成果", "研究或社会影响"],
    tone: "自信、具体、影响导向",
  },
  加拿大: {
    description: "建议平衡学术基础、研究或合作经历与可迁移的实践能力。",
    keywords: ["research", "collaboration", "technical foundation", "application"],
    priorities: ["基础能力", "研究或实习", "合作与落地"],
    tone: "清晰、务实、可信",
  },
  澳洲: {
    description: "建议突出课程准备、实践项目与职业方向，并逐项核对项目材料要求。",
    keywords: ["academic preparation", "practical experience", "professional goals", "projects"],
    priorities: ["教育背景", "实践项目", "职业连接"],
    tone: "直接、完整、应用导向",
  },
  欧洲: {
    description: "建议根据项目类型突出方法、跨文化协作与专业深度，避免用统一偏好替代官网要求。",
    keywords: ["methods", "specialization", "international collaboration", "project fit"],
    priorities: ["专业深度", "研究或项目方法", "跨文化经历"],
    tone: "理性、精炼、专业",
  },
  新加坡: {
    description: "建议兼顾扎实能力、国际视野、项目实践与团队协作。",
    keywords: ["technical depth", "global perspective", "application", "collaboration"],
    priorities: ["量化学术表现", "项目实践", "多元协作"],
    tone: "清晰、务实、国际化",
  },
  日本与韩国: {
    description: "建议突出研究兴趣、实验或项目方法、导师或项目连接，并核对具体语言要求。",
    keywords: ["research interest", "methodology", "lab fit", "technical foundation"],
    priorities: ["研究方向", "方法与成果", "项目或实验室连接"],
    tone: "严谨、谦逊、研究导向",
  },
};

const careerGuidance: Record<string, Pick<TargetProfile, "description" | "keywords" | "priorities" | "tone">> = {
  央企国企: {
    description: "建议突出专业匹配、规范意识、可靠执行与组织协作；具体要求以招聘公告为准。",
    keywords: ["专业能力", "责任担当", "规范意识", "协同执行"],
    priorities: ["专业/证书匹配", "组织与实践经历", "可靠性与闭环"],
    tone: "稳健、正式、可信",
  },
  互联网大厂: {
    description: "建议突出用户或业务问题、数据判断、个人贡献与可核验结果。",
    keywords: ["用户价值", "数据驱动", "跨团队协作", "业务影响"],
    priorities: ["指标变化", "角色边界", "方法与复盘"],
    tone: "简洁、敏捷、结果导向",
  },
  金融与咨询: {
    description: "建议突出分析框架、商业判断、严谨表达与高强度协作，避免未经核实的交易或项目数字。",
    keywords: ["analytical rigor", "commercial judgment", "client communication", "execution"],
    priorities: ["分析与建模", "商业案例", "沟通与交付"],
    tone: "精炼、专业、数字敏感",
  },
  国际科技: {
    description: "建议突出可迁移的技术或产品能力、跨文化协作，以及面向用户的规模化影响。",
    keywords: ["technical depth", "customer impact", "ownership", "global collaboration"],
    priorities: ["硬核项目", "端到端责任", "规模与影响"],
    tone: "直接、国际化、证据驱动",
  },
  制造与新能源: {
    description: "建议突出工程基础、质量与安全意识、复杂系统协作和可验证的交付结果。",
    keywords: ["工程能力", "质量意识", "系统协作", "持续改进"],
    priorities: ["工程项目", "质量/效率指标", "现场与团队协作"],
    tone: "务实、严谨、交付导向",
  },
  快消与医药: {
    description: "建议突出消费者或客户洞察、品牌与渠道协作、合规意识和可验证的业务结果。",
    keywords: ["consumer insight", "brand growth", "cross-functional", "compliance"],
    priorities: ["洞察与策略", "跨职能执行", "合规与结果"],
    tone: "清晰、成熟、客户导向",
  },
};

export const targetProfiles: TargetProfile[] = [
  ...studySeeds.map(([id, name, region, category]) => ({
    id,
    name,
    track: "study" as const,
    region,
    category,
    ...studyGuidance[region],
  })),
  ...careerSeeds.map(([id, name, category, detail]) => ({
    id,
    name,
    track: "career" as const,
    region: globalCareerTargetIds.has(id) ? "全球" : "中国",
    category,
    description: `${careerGuidance[category].description} 当前为面向“${name}”的编辑建议包，不代表企业官方模板。`,
    keywords: careerGuidance[category].keywords,
    priorities: [detail, ...careerGuidance[category].priorities].slice(0, 3),
    tone: careerGuidance[category].tone,
  })),
];

export function recommendedTemplateIdsFor(
  target: Pick<TargetProfile, "track" | "region" | "category">,
  focusName = "",
) {
  if (target.track === "study") {
    if (target.region === "中国香港" || target.region === "新加坡") return ["harbour", "meridian", "camber"];
    if (target.region === "英国") return ["oxbridge", "atlas", "northstar"];
    if (target.region === "澳洲") return ["pacific", "meridian", "camber"];
    if (target.region === "欧洲") return ["continental", "northstar", "atlas"];
    if (target.region === "美国" || target.region === "加拿大") return ["atlas", "northstar", "meridian"];
    if (target.region === "日本与韩国") return ["northstar", "atlas", "continental"];
    return ["atlas", "camber", "northstar"];
  }

  const roleRecommendations = recommendedCareerTemplateIdsForRole(focusName);
  if (roleRecommendations.length) return roleRecommendations;
  if (target.category === "央企国企") return ["statecraft", "pillar", "forge"];
  if (target.category === "金融与咨询") return ["sterling", "venture", "pillar"];
  if (target.category === "国际科技") return ["orbit", "forge", "summit"];
  if (target.category === "制造与新能源") return ["forge", "statecraft", "summit"];
  if (target.category === "快消与医药") return ["venture", "signal", "pillar"];
  return ["summit", "forge", "signal"];
}

export function recommendedCareerTemplateIdsForRole(focusName: string) {
  const role = focusName.trim().toLowerCase();
  if (!role) return [];
  if (/(研发|开发|工程师|算法|架构|测试|运维|数据工程|software|developer|engineer|algorithm|sre)/i.test(role)) {
    return ["forge", "orbit", "summit"];
  }
  if (/(投行|投资|证券|基金|研究员|审计|会计|咨询|战略|finance|bank|investment|consult|audit|analyst)/i.test(role)) {
    return ["sterling", "venture", "pillar"];
  }
  if (/(产品|运营|增长|商业分析|数据分析|product|operation|growth|business analyst|data analyst)/i.test(role)) {
    return ["summit", "orbit", "venture"];
  }
  if (/(市场|品牌|销售|商务|公关|marketing|brand|sales|business development|communications)/i.test(role)) {
    return ["venture", "signal", "summit"];
  }
  if (/(制造|质量|工艺|供应链|机械|电气|土木|生产|manufactur|quality|supply chain|mechanical|electrical)/i.test(role)) {
    return ["forge", "statecraft", "pillar"];
  }
  if (/(管培|职能|人力|行政|法务|公共事务|management trainee|human resources|legal)/i.test(role)) {
    return ["pillar", "statecraft", "venture"];
  }
  return [];
}
