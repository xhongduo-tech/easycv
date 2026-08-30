# 简迹 CV 架构说明

## 1. 架构决策

当前版本采用模块化单体，运行在 Sites / Cloudflare Worker 兼容环境中：

```mermaid
flowchart LR
  Browser[Web / Mobile Browser] --> App[Vinext App Router]
  App --> Routes[Route Handlers]
  Routes --> Domain[Validation + Domain Services]
  Domain --> D1[(Cloudflare D1)]
  Domain --> Advisor[Local Advisor]
  App --> Renderer[Canonical Resume Renderer]
  Renderer --> Print[Browser PDF / ATS Text / GitHub Pages HTML]
  Domain --> Growth[Growth Route Catalog]
```

选择模块化单体而非微服务，是为了在产品验证阶段保持一条可测试、可部署的完整链路。未来上传、AI 和 PDF 导出成为长任务后，可按边界拆为 Worker，而简历领域模型和 API 契约保持稳定。

## 2. 模块边界

- Identity：随机 HttpOnly 访客会话映射到独立用户，预留实名账号与角色模型。
- Target Catalog：101 所院校与 85 家企业的编辑适配方案，包含类别、地区、关键词、优先级、来源类型与复核时间。
- Template：16 套内容与样式分离的共享视觉版式，按目标策略推荐而不伪装成官方模板。
- Resume：简历项目、当前修订、内容 JSON 和软删除。
- Revision：每次内容更新生成不可变快照。
- Recommendation：目标化规则检查、评分和建议事件。
- Export：浏览器 A4 PDF、服务端 ATS 文本、JSON 与 GitHub Pages 单文件 HTML。
- Growth：官方课程资源目录与基于目标/现有技能证据的确定性优先级建议。
- Admin：聚合指标、内容治理与审计边界。

## 3. 数据模型

```mermaid
erDiagram
  USERS ||--o{ RESUMES : owns
  TARGET_PROFILES ||--o{ RESUMES : targets
  TEMPLATES ||--o{ RESUMES : renders
  RESUMES ||--o{ RESUME_VERSIONS : snapshots
  RESUMES ||--o{ SUGGESTION_EVENTS : receives
  USERS ||--o{ AUDIT_EVENTS : performs
  CATALOG_META ||--|| TARGET_PROFILES : versions

  USERS {
    text id PK
    text email UK
    text role
  }
  TARGET_PROFILES {
    text id PK
    text track
    text name
    text keywords_json
    text priorities_json
    text reviewed_at
  }
  TEMPLATES {
    text id PK
    text track
    text layout
    text tags_json
    integer active
  }
  RESUMES {
    text id PK
    text user_id FK
    text target_profile_id FK
    text template_id FK
    integer revision
    text content_json
    text deleted_at
  }
  RESUME_VERSIONS {
    text resume_id FK
    integer revision UK
    text content_json
  }
  CATALOG_META {
    text key PK
    integer version
    text updated_at
  }
```

简历正文使用带 `schema_version` 的规范化 JSON 文档。章节条目拥有稳定 ID，样式和内容分离。关系型字段用于用户归属、目标、模板、状态和常用索引。

## 4. 并发与版本

- 客户端更新携带 `expectedRevision`。
- 服务端发现修订不一致时返回 `409 CONFLICT`。
- 成功更新后 `revision + 1`，同时写入 `resume_versions`。
- 删除为软删除，并写入审计事件。

当前更新使用 `WHERE revision = ? ... RETURNING` 检查条件写入，零行统一返回 409；随后保存修订快照。规模增长后应把“更新当前版本 + 插入快照”放入更严格的事务封装，并为幂等创建加入 `Idempotency-Key` 表。

## 5. AI 安全边界

当前 Advisor 是运行在平台 API 内的确定性规则引擎：

- 只返回建议和改写草稿，不直接修改简历。
- 不生成不存在的学历、职位、奖项或成果数字。
- 缺失数字时输出待核实占位语义。
- 建议结合赛道、目标画像与当前章节。
- 事件表只保存评分、章节、提供者等必要元数据，不记录完整 CV。

接入外部模型时，供应商 SDK 只能存在于适配层。网关应负责超时、重试上限、结构化输出校验、提示词版本、费用预算、敏感信息最小化和用户同意。

## 6. 权限

当前访客会话只能访问自己的简历；演示治理页也只读取当前会话摘要，不返回正文。计划角色：

- `USER`：仅管理自己的简历。
- `CONTENT_EDITOR`：编辑目标资料草稿。
- `PUBLISHER`：发布画像和模板。
- `ADMIN`：运营管理。
- `SUPER_ADMIN`：角色和高风险配置。

产品 `SUPER_ADMIN` 不等于服务器或云账号超级权限。运维使用独立 IAM、MFA、临时授权和完整审计。

## 7. 生产演进

- Auth：平台会话 / OAuth，HttpOnly、Secure、SameSite Cookie。
- Files：R2 保存上传源文件与导出产物，D1 保存所有权和生命周期。
- Export Worker：固定 Chromium + 授权 CJK 字体，导出后再做文本抽取检查。
- Observability：结构化日志、请求 ID、OpenTelemetry 与错误监控。
- Data：备份恢复演练、账号导出/删除、保留期限和区域化部署。

## 8. 公开网页与外部资源边界

- GitHub Pages 导出是静态、无脚本、无远程依赖的单文件 HTML；所有用户内容经过 HTML 转义，链接只允许 HTTP(S)，响应和文档内同时设置 CSP。
- 联系方式默认不进入网页文件；用户需要单独勾选并确认公开风险。
- 当前不请求 GitHub OAuth 权限，也不代表用户创建或公开仓库。
- 成长路线只指向提供方官方页面，不把未完成课程自动写入简历，也不承诺证书认可、录取或录用结果。
