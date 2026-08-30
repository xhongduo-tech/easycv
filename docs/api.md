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

- `GET /api/templates?track=study|career`
- `GET /api/targets?track=study|career`

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
  "section": "experience"
}
```

响应包含 `score`、`suggestions`、`keywords`、`rewrite`、`provider` 和事实策略。当前提供者为 `local-rules`。

## 导出

- `GET /api/resumes/:id/export?format=txt`
- `GET /api/resumes/:id/export?format=json`

PDF 使用编辑器中的打印入口生成可选中文本的 A4 文档。

## 管理

- `GET /api/admin/overview`

当前管理端为演示读取面，生产版 CMS 写操作需要真实身份、RBAC、MFA、发布审批和审计。
