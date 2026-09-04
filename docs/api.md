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

- `GET /api/health`：返回数据库状态以及 schema 的 `actual` / `minimum` / `maximum`；版本不一致返回 503。

## 认证与账号

- `ALL /api/auth/*`：Better Auth 认证入口；包含邮箱注册/登录/验证、密码重置、第三方 OAuth、手机号验证码、会话与账号管理。
- `GET /api/auth/providers`：返回当前环境已启用的邮箱、Google、GitHub、微信和手机号能力，不返回任何密钥。
- `POST /api/auth/claim-guest`：正式登录后认领当前浏览器访客草稿；访客 Cookie 只从服务端读取，不能在请求正文中指定其他访客。
- `GET /api/legal/acceptance`、`POST /api/legal/acceptance`：读取或幂等确认当前协议版本；应用数据访问要求当前版本已确认。
- `ALL /api/auth/two-factor/*`：TOTP 与一次性恢复码。启用双重验证后，OAuth、短信和密码登录得到的每个新会话都必须完成 step-up 才能访问应用数据。
- `POST /api/account/export`：要求同源、非模拟登录、当前 MFA assurance 及一小时内的新会话，返回不含密码、token、TOTP 密钥和建议正文副本的账号 JSON 数据包。同步导出先执行体量预检（最多 20,000 条记录、10 MiB 主要正文）；超限返回 `413 PAYLOAD_TOO_LARGE`，不会静默截断，需清理不再需要的简历或转入人工/异步导出流程。

邮箱密码至少 12 位且同时包含字母和数字。邮箱验证、密码重置链接有效期为 1 小时；中国大陆手机号统一保存为 `+86` E.164 格式，验证码为 6 位、5 分钟有效、最多尝试 3 次。认证敏感端点使用 D1 持久化限流，验证标识散列存储，OAuth token 加密存储。

## 目录

- `GET /api/templates?track=study|career&targetProfileId=`（目标推荐排序）
- `GET /api/targets?track=study|career&group=&q=`（返回分组、计数与目录总量）

## 简历

- `GET /api/resumes?track=&status=&q=&limit=&cursor=`
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

列表接口只返回摘要字段，不返回 `content_json`；按 `(updated_at, id)` 稳定降序分页，`limit` 最大 50。`nextCursor` 绑定账号与当前筛选，不能跨账号或换筛选复用。正文继续通过单份详情接口读取。

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

当前 target-brief API 不接收岗位截图，多源工作台的图片流程也不能写入 `requirementsText`；它只在本地预览 JPEG、PNG、WebP，并允许把用户手工核对的文字加入个人简介、技能或奖项。岗位截图仍需先在设备端识别并核对文字，再粘贴到岗位描述；原图不会发往服务端。

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

`GET /api/recommendations` 返回 `modelAvailable`、`modelProvider`、`modelSupportsImages`、`maxCreditCharge`，以及当前会话的 `creditBalance`、赠送/购买简迹点和 `accountKind`。它不接收简历正文，也不返回密钥、地址或具体模型 ID。访客获赠 5 简迹点；正式账号验证登录身份后首次另获 25 点。

`resumeId` 必填，并且必须属于当前已有访客会话；可同时提交尚未自动保存的当前 `content`，服务端仍会先校验简历所有权。无会话、跨会话或只有任意正文的请求不能触发建议。

`POST` 请求必须携带客户端生成的 `requestId`。响应包含 `suggestions`、`rewriteProposals`、`provider`、`baseResumeRevision`、`baseBriefRevision`、`creditCharged`、成功请求的 `creditChargeCap`、最新余额和事实策略。每条 proposal 包含稳定原文定位、当前原文、草稿、最多三条理由、待补事实、岗位要求和由服务端重新绑定的证据。可直接应用的草稿必须在原文仍完全一致时，严格等于已审计的确定性安全压缩结果；应用是精确替换而不是追加。默认提供者为 `local-rules`；只有 DeepSeek 环境已配置、请求显式同意且余额充足时，才调用 Responses API。系统根据最终 provider body 与输出上限原子冻结本次最高简迹点，模型成功后按实际 input/cache/output token 结算 1–5 点，并由数据库触发器在同一事务内退回差额；透明失败会释放全部预留。模型运行、积分、成本与 15 分钟可重放结果通过显式状态机结算。送模前还会验证点数仍为 reserved、delivery 仍为 prepared 且当前 Worker 持有未过期 owner lease，避免暂停恢复后的旧请求重复调用供应商。定向改写若没有任何草稿通过事实门，会作为失败释放点数，不收费。15 分钟到期后停止重放；每日受保护维护任务擦除建议正文，最小幂等元数据到 90 天后删除。纯本地分析不保存重放副本。

外部模型正文上限为 32 KB；公开的简迹点计价只允许使用 DeepSeek V4 Flash，Pro 不会共用该价格表。固定峰值成本基准为未缓存输入 ¥3/百万 token、缓存输入 ¥0.10/百万 token、输出 ¥9/百万 token；每点承载 ¥0.034 成本基准并向上取整，成功请求最低 1 点、最高 5 点。独立安全阀限制用户 20 次/小时、100 次/日，另有网络、全站小时/日和峰值人民币成本预算。每个会话最多一个活动模型请求，全站最多 4 路；客户端断开会取消上游请求。网络、超时、鉴权/余额/模型配置、429 或 5xx 连续三次会开启 10 分钟供应商熔断。模型运行成本表只记录模型、状态、input/output/cache token、价格版本与估算成本，不记录 CV 正文。

## 定价与简迹点

- `GET /api/billing`

返回当前访客或正式账号简迹点、公开点数包、最近订单与支付通道状态。公开套餐由服务端固定配置为 100 点 ¥9.9、400 点 ¥34.9、1,000 点 ¥69.9；客户端不能提交价格。当前 `checkoutAvailable` 为 `false`，因为尚未选定并配置真实支付服务商，系统不会模拟购买成功。

注册启动赠点只向已验证登录身份发放一次。服务端使用独立 pepper 生成 HMAC 摘要；摘要防滥用记录保留 730 天，即使删号后也不会在期限内对同一身份重复发放。

## 数据保留维护

- `POST /api/maintenance/retention`：使用 `Authorization: Bearer <MAINTENANCE_SECRET>` 调用并始终执行一批有界维护：返还安全可恢复的过期 pending 额度、擦除过期建议正文、删除超过 90 天的幂等 tombstone 与模型成本明细、到期的防滥用摘要、超期访客数据和旧版本。调度器应重复调用直至 due 指标归零。账务记录不会在账号删除时直接丢失，而会先去标识化。
- `POST /api/maintenance/reconcile`：相同鉴权和 dry-run / `?apply=true` 语义；报告 stale attempt、额度流水/成本不一致、delivery 缺失、lot 漂移，以及“额度或模型运行已结算但 delivery 仍 pending”的总数与最多 4 条脱敏定位样本；仅在取得 owner lease 后恢复有确定结论的悬挂请求。

生产环境至少每天执行一次预览与应用，并对非 2xx、持续 pending、ledger/run mismatch 或 lot drift 告警。数据库恢复步骤见 `docs/database-operations.md`。

## 导出

- `GET /api/resumes/:id/export?format=txt`
- `GET /api/resumes/:id/export?format=json`
- `GET /api/resumes/:id/export?format=github-pages&includeContact=false`
- `POST /api/account/export`（完整账号数据包；要求近期登录与当前会话 MFA）

PDF 使用编辑器中的打印入口生成可选中文本的 A4 文档。`GET ...?format=github-pages` 返回已保存修订的静态单栏 `index.html`，不返回交互版或 ZIP；默认隐藏邮箱、电话和所在地。用户填写的网站和项目链接只允许 HTTP(S)，包含邮箱时使用 `mailto:`。

可编辑 DOCX、A4 首图、PNG 长图、静态/交互 HTML 和 GitHub Pages ZIP 按编辑器当前内存状态在浏览器本地生成，可包含尚待自动保存的修改；上述 GET 端点读取已保存修订。客户端与服务端 TXT / JSON 共用正文序列化逻辑，但单份简历 JSON 回导只消费 `content`，服务端简历 JSON 也不包含独立存储的 `targetBrief`。当前没有二进制上传 API；ZIP 由用户手动上传，平台不读取仓库或执行发布。

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
- `GET /api/auth/admin/list-users`：分页查询和搜索用户。
- `POST /api/auth/admin/set-role`：调整 `user` / `admin` 角色。
- `POST /api/auth/admin/ban-user`、`POST /api/auth/admin/unban-user`：停用或恢复账号。

所有管理接口要求已认证、已确认当前协议、角色为 `admin`、已启用 TOTP 且当前会话在 12 小时 assurance 窗口内；角色调整与停用等敏感操作还要求 15 分钟内的新会话。管理员不能关闭自己的 TOTP，不能通过用户管理页读取简历正文，也不能把产品角色提升为云端运维权限。
