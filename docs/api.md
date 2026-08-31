# API 说明

所有 JSON 错误采用统一结构：

```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "提交内容需要调整",
    "details": [{ "path": "track", "message": "参数无效" }]
  }
}
```

## 健康检查

- `GET /api/health`

## 目录

- `GET /api/templates?track=study|career&targetProfileId=`（目标推荐排序）
- `GET /api/targets?track=study|career&group=&q=`（返回分组、计数与目录总量）

## 简历

- `GET /api/resumes?track=&status=&limit=`
- `POST /api/resumes`
- `GET /api/resumes/:id`
- `PATCH /api/resumes/:id`
- `DELETE /api/resumes/:id`（软删除）

创建示例：

```json
{
  "track": "career",
  "targetProfileId": "tencent",
  "templateId": "summit",
  "title": "腾讯 · 产品经理",
  "targetBrief": { "focusName": "产品经理" }
}
```

更新示例：

```json
{
  "title": "腾讯 · 产品经理 · 秋招",
  "content": {},
  "expectedRevision": 3
}
```

修订冲突返回 `409` 和当前修订号。

## 岗位 / 项目依据

- `GET /api/resumes/:id/target-brief`
- `PUT /api/resumes/:id/target-brief`
- `DELETE /api/resumes/:id/target-brief`（要求独立 `expectedRevision`，硬删除岗位文本和来源记录，不影响简历正文）

```json
{
  "expectedRevision": 1,
  "focusName": "产品经理",
  "requirementsText": "岗位职责……任职要求……",
  "sourceType": "employer-official",
  "sourceUrl": "https://careers.example.com/job/123"
}
```

依据拥有独立修订号；首次创建使用 `expectedRevision: 0`。用户确认的 `requirementsText` 是唯一分析输入，来源链接只允许 HTTP(S)，仅用于用户核对，服务端不会打开链接、调用招聘平台 API 或抓取内容。岗位描述上限为 12,000 字符且不超过 30 KB。`sourceType` 当前写入 `employer-official`、`other-platform` 或 `manual`；接口继续接受 `boss`、`zhaopin` 仅用于兼容已有记录。

当前版本不接收岗位截图。用户可在设备端完成文字识别后，将结果粘贴并核对；这样岗位分析仍有一份可修改、可确认的规范文本输入。

求职编辑器在本地根据已保存 JD 生成可解释证据地图，不返回录用率或胜任力分数。系统按原文顺序优先提取最多 12 项职责或能力要求；每条证据逐字引用简历正文，没有证据时只提示补充真实事实。

## 建议

- `POST /api/recommendations`

```json
{
  "resumeId": "uuid",
  "section": "experience",
  "allowExternalModel": false,
  "requirementId": "requirement-1",
  "sourceRef": {
    "section": "experience",
    "field": "bullets",
    "itemId": "exp-1",
    "index": 0
  }
}
```

`requirementId` 与 `sourceRef` 是可选但必须同时出现的逐条改写焦点。服务端会重新计算岗位证据地图，确认该原文确实属于这条岗位要求；定位过期、跨章节或不匹配时拒绝生成。只有个人简介、教育亮点、工作经历要点与项目要点可以直接改写，学校、企业、职位、学历、技能标签、语言和奖项只能作为证据，不能被模型改名。

`GET /api/recommendations` 只返回当前环境是否已配置模型，不接收简历正文。

`resumeId` 必填，并且必须属于当前已有访客会话；可同时提交尚未自动保存的当前 `content`，服务端仍会先校验简历所有权。无会话、跨会话或只有任意正文的请求不能触发建议。

`POST` 响应包含 `suggestions`、`rewriteProposals`、`provider`、`baseResumeRevision`、`baseBriefRevision` 和事实策略。每条 proposal 包含稳定原文定位、当前原文、草稿、最多三条理由、待补事实、岗位要求和由服务端重新绑定的证据。草稿只有在原文仍完全一致、没有待补事实、没有占位符、没有新增数字或常见工具词时才可应用；应用是精确替换而不是追加。默认提供者为 `local-rules`；只有环境已配置且请求显式设置 `allowExternalModel: true` 时，才调用服务端 OpenAI Responses API。若简历保存了岗位依据，规则与模型建议都会使用岗位要求；模型只接收从 JD 优先提取的最多 12 项要求，不接收原始整段 JD 或来源 URL，所有送模自由文本还会先移除常见招聘联系方式。模型失败会返回基础分析并标明透明降级。基础建议本身也受会话、散列网络标识与全局用量上限约束，避免匿名写入或计算被无界消耗。

外部模型正文上限为 60 KB；单条 D1 条件插入会同时检查会话、散列网络标识与全局小时/日配额，避免多维配额部分扣减。每个会话最多一个活动模型请求，全站最多 4 路；客户端断开会取消上游请求。网络、超时、429 或 5xx 连续三次会开启 10 分钟供应商熔断；内容拒答、普通 4xx 和输出校验失败只影响当前请求。每次外部调用前持久化同意版本、用途、简历 ID 和时间，但不把 CV 正文写入同意或用量表。

## 导出

- `GET /api/resumes/:id/export?format=txt`
- `GET /api/resumes/:id/export?format=json`
- `GET /api/resumes/:id/export?format=github-pages&includeContact=false`

PDF 使用编辑器中的打印入口生成可选中文本的 A4 文档。`github-pages` 返回可直接上传的 `index.html`；默认隐藏邮箱、电话和所在地，正文经过 HTML 转义且链接仅允许 HTTP(S)。

## 编辑器内学习提示

- `POST /api/growth-recommendations`

```json
{
  "resumeId": "uuid"
}
```

该兼容接口返回官方学习资源、目标、排序理由和事实策略。当前前端不提供独立课程栏目，而是在编辑器填写区下方按证据缺口最多展示一条建议；未完成课程不会自动写入简历。

## 管理

- `GET /api/admin/overview`

当前管理端为演示读取面，生产版 CMS 写操作需要真实身份、RBAC、MFA、发布审批和审计。
