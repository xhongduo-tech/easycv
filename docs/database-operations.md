# 数据库发布、备份与恢复手册

本文适用于简迹 CV 的生产 D1。所有命令都必须在确认账号、数据库和环境后由运维人员手动执行；文档中的 `JIANJI_D1_DATABASE` 是任务专用占位变量，不应直接复制为真实名称。

Cloudflare D1 的 Time Travel 默认启用，可按分钟恢复；Workers Free 与 Paid 的可恢复窗口不同。迁移命令在执行前会创建恢复点，失败的单个迁移会回滚。长期归档可额外使用 `wrangler d1 export` 输出 SQL。参考：[Time Travel 与备份](https://developers.cloudflare.com/d1/reference/time-travel/)、[Wrangler D1 命令](https://developers.cloudflare.com/d1/wrangler-commands/)。

## 运行目标

- 生产数据目标 RPO：5 分钟；目标 RTO：60 分钟。
- 发布前必须保存当前 Time Travel bookmark，并记录操作者、版本、时间和变更单。
- 每日至少一次检查健康接口、迁移版本、保留任务和模型对账；非 2xx 立即告警。
- 每月导出一次完整 SQL 到受访问控制、加密且与生产账号隔离的对象存储，保留 12 个月；导出文件不得进入 Git。
- 每季度在隔离环境做一次恢复演练，并记录实际 RPO/RTO。

## 发布前检查

1. 在待发布源码上运行：

   ```bash
   npm run verify:release
   ```

2. 明确生产数据库，不接受模糊 binding、通配符或默认账号：

   ```bash
   JIANJI_D1_DATABASE="<production-database-name-or-id>"
   npx wrangler d1 info "$JIANJI_D1_DATABASE"
   npx wrangler d1 migrations list "$JIANJI_D1_DATABASE" --remote
   npx wrangler d1 time-travel info "$JIANJI_D1_DATABASE"
   ```

3. 将当前 bookmark 保存到变更单。确认 `APP_ENV=production`、站点 URL、认证密钥、促销 pepper 和维护密钥均已通过生产配置检查。DeepSeek 或支付没有完整配置时必须保持关闭。

4. 先在全新本地数据库执行全部迁移，再在预览数据库验证。Sites 发布流程负责生产迁移时，不要在另一终端重复运行 `migrations apply`。

5. 发布后检查：

   - `GET /api/health` 返回 HTTP 200、`status=ok`、`database=ready`，且 schema 的 `actual/minimum/maximum` 均为 11；
   - 登录、协议确认、创建/保存/删除简历、账号数据导出均正常；
   - 使用维护密钥执行一批 retention，并调用 reconciliation dry-run，确认没有异常积压；
   - 日志中没有 `api.unhandled_error`、持续 settlement pending 或 schema mismatch。

## 日常维护

两个端点使用相同的独立 Bearer 凭据，但执行语义不同：

```text
POST /api/maintenance/retention
POST /api/maintenance/reconcile
Authorization: Bearer <MAINTENANCE_SECRET>
```

`retention` 每次调用都会直接执行一个有明确上限的维护批次；调度器应重复调用直至 due 指标归零，而不是扩大单次事务。`reconcile` 默认 dry-run，仅在人工或调度策略确认后使用 `?apply=true`；`settledPendingDeliveries.total` 非零表示结算状态与交付状态发生冲突，应立即告警并人工核查，不能由通用 stale 恢复路径覆盖。维护密钥必须至少 32 位、独立轮换，不能与认证或促销密钥共用。

长期 SQL 归档示例：

```bash
JIANJI_D1_DATABASE="<production-database-name-or-id>"
npx wrangler d1 export "$JIANJI_D1_DATABASE" --remote --output="./jianji-d1-export.sql"
```

导出后立即加密、上传到批准的备份位置、校验哈希并安全移除本地明文。不得把含简历正文的导出文件提交到仓库、工单或聊天。

## 恢复流程（破坏性）

Time Travel 会原地覆盖数据库并中断进行中的请求。必须由两名有权限人员确认目标数据库、事故时间与恢复点。

1. 宣布维护窗口，暂停写流量、调度器和后台任务。
2. 保存事故后当前 bookmark，并完成一次紧急 SQL 导出，以便撤销误恢复。
3. 用事故发生前的 RFC3339 时间获取候选 bookmark：

   ```bash
   JIANJI_D1_DATABASE="<production-database-name-or-id>"
   npx wrangler d1 time-travel info "$JIANJI_D1_DATABASE" --timestamp="<RFC3339>"
   ```

4. 第二位审批人核对 bookmark、schema 版本和影响范围。只有确认后才执行：

   ```bash
   npx wrangler d1 time-travel restore "$JIANJI_D1_DATABASE" --bookmark="<approved-bookmark>"
   ```

5. 保存命令返回的 `previous_bookmark`；它是撤销本次恢复的首选恢复点。
6. 依次验证 schema 版本、外键检查、用户/简历抽样、额度账本、登录与健康接口。必要时重新应用已审核且在恢复点之后发布的迁移。
7. 恢复流量，执行 reconciliation dry-run，再显式 apply；观察错误率和结算积压至少 30 分钟。
8. 如果恢复点错误，立即停止流量，并使用第 5 步的 `previous_bookmark` 撤销，不要尝试手工拼接生产数据。

## 事故升级条件

- schema 版本不匹配、外键检查失败或迁移台账出现非前缀状态；
- 额度 lot 与 ledger 漂移、已消费流水缺少成功成本记录；
- 大量 pending 尝试无法自动回收，或存在 consumed/succeeded 与 pending delivery 冲突；
- 导出、恢复或保留任务触及错误账号/数据库；
- 需要超出 Time Travel 窗口的数据。

出现任一条件时停止自动修复，保留 bookmark、日志和只读导出，交由数据库与安全负责人共同处理。
