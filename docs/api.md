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
  "title": "腾讯 · 产品经理 CV"
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

## 建议

- `POST /api/recommendations`

```json
{
  "resumeId": "uuid",
  "section": "experience",
  "allowExternalModel": false
}
```

`GET /api/recommendations` 只返回当前环境是否已配置模型，不接收简历正文。

`resumeId` 必填，并且必须属于当前已有访客会话；可同时提交尚未自动保存的当前 `content`，服务端仍会先校验简历所有权。无会话、跨会话或只有任意正文的请求不能触发建议。

`POST` 响应包含 `score`、`suggestions`、`keywords`、`rewrite`、`provider` 和事实策略。默认提供者为 `local-rules`；只有环境已配置且请求显式设置 `allowExternalModel: true` 时，才调用服务端 OpenAI Responses API。模型失败会返回基础分析并标明透明降级。基础建议本身也受会话、散列网络标识与全局用量上限约束，避免匿名写入或计算被无界消耗。

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
