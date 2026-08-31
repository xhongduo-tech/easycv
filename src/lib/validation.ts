import { z, type ZodError } from "zod";

const requiredText = (label: string, max: number) =>
  z.string().trim().min(1, `${label}不能为空`).max(max, `${label}不能超过 ${max} 个字符`);

const optionalText = (max: number) => z.string().trim().max(max);
const itemIdSchema = requiredText("条目 ID", 100);
const bulletSchema = requiredText("描述", 800);

export const trackSchema = z.enum(["study", "career"]);
export const resumeStatusSchema = z.enum(["draft", "ready", "archived"]);
export const targetBriefSourceSchema = z.enum(["employer-official", "boss", "zhaopin", "other-platform", "manual"]);

const optionalHttpUrl = z.union([
  z.literal(""),
  z.string().trim().url("来源链接格式不正确").max(2_048).refine((value) => {
    try {
      const protocol = new URL(value).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }, "来源链接只支持 http 或 https"),
]);

const requirementsTextSchema = z.string().trim().max(12_000, "岗位描述不能超过 12000 个字符").superRefine((value, context) => {
  if (new TextEncoder().encode(value).byteLength > 30_000) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "岗位描述不能超过 30 KB" });
  }
});

export const createTargetBriefSchema = z.object({
  focusName: requiredText("目标岗位或项目", 160),
  requirementsText: requirementsTextSchema.default(""),
  sourceType: targetBriefSourceSchema.default("manual"),
  sourceUrl: optionalHttpUrl.optional(),
}).strict();

export const putTargetBriefSchema = z.object({
  expectedRevision: z.number().int().min(0),
  focusName: requiredText("目标岗位或项目", 160),
  requirementsText: requirementsTextSchema,
  sourceType: targetBriefSourceSchema,
  sourceUrl: optionalHttpUrl.optional(),
}).strict();

export const deleteTargetBriefSchema = z.object({
  expectedRevision: z.number().int().positive(),
}).strict();

export const basicsSchema = z
  .object({
    name: optionalText(120),
    email: z.union([z.string().trim().email("邮箱格式不正确").max(254), z.literal("")]),
    phone: optionalText(50),
    location: optionalText(160),
    website: optionalText(500),
    headline: optionalText(240),
  })
  .strict();

export const educationItemSchema = z
  .object({
    id: itemIdSchema,
    school: optionalText(240),
    degree: optionalText(160),
    major: optionalText(160),
    startDate: optionalText(40),
    endDate: optionalText(40),
    location: optionalText(160),
    score: optionalText(160),
    highlights: z.array(bulletSchema).max(30),
  })
  .strict();

export const experienceItemSchema = z
  .object({
    id: itemIdSchema,
    organization: optionalText(240),
    role: optionalText(160),
    startDate: optionalText(40),
    endDate: optionalText(40),
    location: optionalText(160),
    bullets: z.array(bulletSchema).max(30),
  })
  .strict();

export const projectItemSchema = z
  .object({
    id: itemIdSchema,
    name: optionalText(240),
    role: optionalText(160),
    date: optionalText(80),
    link: optionalText(500),
    bullets: z.array(bulletSchema).max(30),
  })
  .strict();

export const resumeContentSchema = z
  .object({
    basics: basicsSchema,
    summary: optionalText(2_000),
    education: z.array(educationItemSchema).max(30),
    experience: z.array(experienceItemSchema).max(50),
    projects: z.array(projectItemSchema).max(50),
    skills: z.array(requiredText("技能", 120)).max(100),
    languages: z.array(requiredText("语言", 120)).max(30),
    awards: z.array(requiredText("奖项", 300)).max(50),
  })
  .strict();

const targetSelectionShape = {
  targetProfileId: requiredText("目标画像 ID", 100).optional(),
  targetName: requiredText("目标名称", 240).optional(),
};

export const createResumeSchema = z
  .object({
    title: requiredText("简历标题", 160).optional(),
    track: trackSchema,
    ...targetSelectionShape,
    templateId: requiredText("模板 ID", 100).optional(),
    status: resumeStatusSchema.optional(),
    content: resumeContentSchema.optional(),
    targetBrief: createTargetBriefSchema.optional(),
  })
  .strict()
  .refine((value) => value.targetProfileId !== undefined || value.targetName !== undefined, {
    message: "targetProfileId 和 targetName 至少需要提供一个",
    path: ["targetProfileId"],
  });

export const updateResumeSchema = z
  .object({
    title: requiredText("简历标题", 160).optional(),
    track: trackSchema.optional(),
    ...targetSelectionShape,
    templateId: requiredText("模板 ID", 100).optional(),
    status: resumeStatusSchema.optional(),
    content: resumeContentSchema.optional(),
    expectedRevision: z.number().int().positive(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0, "至少需要提供一个可更新字段");

export const resumeListQuerySchema = z
  .object({
    track: trackSchema.optional(),
    status: resumeStatusSchema.optional(),
    limit: z.coerce.number().int().min(1).max(100).default(50),
  })
  .strict();

export const templateListQuerySchema = z
  .object({
    track: trackSchema.optional(),
    targetProfileId: requiredText("目标画像 ID", 100).optional(),
  })
  .strict();

export const targetListQuerySchema = z
  .object({
    track: trackSchema.optional(),
    group: optionalText(100).optional(),
    q: optionalText(120).optional(),
  })
  .strict();

export const resumeIdParamSchema = z.object({ id: z.string().uuid("简历 ID 格式不正确") }).strict();

export const exportQuerySchema = z
  .object({
    format: z.enum(["txt", "json", "github-pages"]).default("txt"),
    includeContact: z.enum(["true", "false"]).default("false").transform((value) => value === "true"),
  })
  .strict();

export const growthRecommendationRequestSchema = z
  .object({
    resumeId: z.string().uuid("简历 ID 格式不正确"),
  })
  .strict();

export const recommendationRequestSchema = z
  .object({
    resumeId: z.string().uuid("简历 ID 格式不正确"),
    content: resumeContentSchema.optional(),
    track: trackSchema.optional(),
    targetProfileId: requiredText("目标画像 ID", 100).optional(),
    targetId: requiredText("目标画像 ID", 100).optional(),
    targetName: requiredText("目标名称", 240).optional(),
    allowExternalModel: z.boolean().default(false),
    section: z.enum(["overview", "basics", "summary", "experience", "education", "projects", "extras"]).default("overview"),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.targetProfileId !== undefined &&
      value.targetId !== undefined &&
      value.targetProfileId !== value.targetId
    ) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "targetProfileId 与 targetId 不能冲突",
        path: ["targetProfileId"],
      });
    }
  });

export type CreateResumeInput = z.infer<typeof createResumeSchema>;
export type UpdateResumeInput = z.infer<typeof updateResumeSchema>;
export type RecommendationRequest = z.infer<typeof recommendationRequestSchema>;

export interface ApiValidationIssue {
  path: string;
  message: string;
}

export const formatValidationIssues = (error: ZodError): ApiValidationIssue[] =>
  error.issues.map((issue) => ({
    path: issue.path.join("."),
    message: issue.message,
  }));
