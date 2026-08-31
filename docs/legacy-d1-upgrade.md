# Legacy D1 无损升级手册

本文只适用于线上库由旧版请求期初始化器创建、业务数据仍在，但没有完整
`d1_migrations` 台账的情况。升级只补记已经存在的 `0000`–`0004`，随后由
Sites 的标准迁移阶段执行 `0005`–`0011`。不要用本流程修复未知或半成品结构。

## 安全不变量

- `drizzle/0000_silly_thanos.sql` 至 `0004_complete_auth.sql` 不得改写。
- bridge 只允许创建 `d1_migrations` 并补齐 `0000`–`0004` 的缺失名称；不得
  创建、删除或修改任何业务表和业务行。
- bridge 部署包中必须完全没有 `dist/.openai/drizzle`。目录为空也不合格。
- 只接受 21 张旧表、149 个规范化字段、26 个逻辑索引、10 个外键，以及
  `users.updated_at` 无空值、`PRAGMA foreign_key_check` 无结果的严格指纹。
- Cloudflare 自有的 `_cf_METADATA` 由 closed allowlist 忽略；其他未知表（包括
  其他 `_cf_*` 名称）仍必须拒绝。PRAGMA 联合查询每批最多五项，以符合 D1
  的 compound SELECT 限制并将 bridge 总查询数控制在 50 以内。
- 已有台账只可为按 `id` 排序的合法前缀：空、`0000`、……、`0000`–`0004`。
  非前缀、未知名称、`0005` 以后条目或畸形台账全部拒绝。
- 发现任何 `ai_credit_*`、`model_advice_deliveries`、`app_schema_meta` 等后续
  结构时，不得猜测或补记 `0005` 以后迁移。

发布前运行：

```sh
npm run db:verify
shasum -a 256 \
  drizzle/0000_silly_thanos.sql \
  drizzle/0001_catalog_meta.sql \
  drizzle/0002_model_usage_guards.sql \
  drizzle/0003_resume_target_briefs.sql \
  drizzle/0004_complete_auth.sql
```

五个摘要必须依次为：

```text
82dddd17e48084be920101214a1c3f6709e1697cfd312b16e5594be0e1cea450
ac58572c44764658eed6d533e9717fdf930a0fb8b4d815c61b82a8246a252160
5a4c2ab221973b785e708208561737b7621c482df25aad089b9df3769cfcfbe2
ed104644e7a68e727221a03efae8ca697b1cae812a31e45bfef8b19822197ef6
0413adaeeecad11f67a220819763d798f2e0b31bafaa9b4f15f1c29ac906ac93
```

## 1. 建立独立 bridge worktree

从 Sites 当前正在运行版本记录的精确提交 SHA 建立独立 worktree，不要从有
未提交修改的主工作区或新的定价版本开始：

```sh
git worktree add ../personalcv-d1-bridge -b codex/d1-legacy-bridge <deployed-commit-sha>
cd ../personalcv-d1-bridge
```

在该分支以补丁方式加入经验证的 `scripts/legacy-schema-adoption.mjs`，并加入
一个临时、受维护密钥保护的 API 路由。路由必须：

1. 直接使用 `env.DB`，不得调用新版 `ensureDatabase()`；
2. `GET` 只执行 `inspectLegacyD1()` 与 `planLegacySchemaAdoption()`；
3. 只有显式 `POST ?apply=true` 才调用 `adoptLegacyD1()`；
4. GET、POST 都要求至少 32 字节的 `MAINTENANCE_SECRET` Bearer 凭据；
5. 返回 `cache-control: private, no-store`；异常只返回通用错误，不回显密钥；
6. 最终版本必须删除此临时路由。

bridge 应基于旧版应用，因此收养期间原有页面仍可工作。把 bridge 分支中的
`drizzle/` 删除并提交；这是独立临时分支，不能在主工作区删除迁移。

```sh
test ! -d drizzle
npm ci
node scripts/verify-legacy-schema-adoption.mjs
npm run build
```

使用当前 Sites 插件的 `scripts/package-site.sh` 打包后，必须检查归档：

```sh
if tar -tzf <bridge-archive.tgz> | rg -q '^dist/.openai/drizzle(?:/|$)'; then
  echo "拒绝部署：bridge 归档含有迁移"
  exit 1
fi
```

只有命令没有输出时才可保存并部署 bridge 版本。部署前再次确认 Site 仍是
owner-only；bridge 源码提交、构建产物和归档必须来自同一个 worktree 提交。

## 2. 先读、再补、再读

通过已登录的 owner-only Site 会话调用临时路由；维护密钥只放在 Authorization
请求头，不放入 URL、提交、日志或聊天记录。

1. 调用 GET dry-run。可继续的唯一结果是：
   - `state: "adoptable"`，且 `missingNames` 只是 `0000`–`0004` 的后缀；或
   - `state: "already_baselined"`，且已应用名称恰为五条。
2. `fresh` 表示空库：不要写基线；直接让最终标准迁移从 `0000` 开始。
3. `refused` 或 HTTP 500：立即停止，不得部署最终版本，不得手工猜测台账。
4. 仅在 dry-run 可继续时调用 `POST ?apply=true`。预期结果是 `adopted` 或
   `already_baselined`。
5. 再次 GET。必须得到 `already_baselined`、`missingNames: []`，且 appliedNames
   严格等于以下五项：

```text
0000_silly_thanos.sql
0001_catalog_meta.sql
0002_model_usage_guards.sql
0003_resume_target_briefs.sql
0004_complete_auth.sql
```

复读时三组结构指纹必须仍为：

```text
columns      fdf171af155990ca2178fff0b46f4e72306d1f9c9f47e05827265ea0643b8de5 / 149
indexes      b612ff2118b5586ee0506f9604b20760896911e7fd8fb1e72db7ced23ed3a1d2 / 26
foreignKeys  f57b6e2123ec650aa432dd8b8cb564b89b494f1c8719a1109981f383014285eb / 10
```

响应丢失时不要再次猜测写入结果；重新 GET。收养操作具有幂等性，复读是唯一
判定依据。

## 3. 部署最终版本

最终主分支必须恢复完整的 `drizzle/`，包含连续的 `0000`–`0011`。重新运行：

```sh
npm run verify:release
npm run build
```

用 Sites 官方打包脚本创建最终归档，并确认 12 个迁移文件均位于
`dist/.openai/drizzle/`。随后保存并部署 owner-only 最终版本。标准迁移器会跳过
已记账的 `0000`–`0004`，只执行 `0005`–`0011`；不得把这些后续迁移预先写入
台账。

部署成功后验证：

- `/api/health` 返回 HTTP 200、`database: "ready"`；
- `app_schema_meta.key = 'app'` 的版本为 11；
- 新表、`0010` 的 advice lifecycle 字段和 `0011` 的完整性约束存在；
- 正常读取一份既有简历，确认旧业务数据仍可访问；
- 删除临时 bridge 路由，并移除临时维护密钥。

## 拒绝与回滚

- **bridge dry-run 拒绝：** 没有业务写入。保持或重新部署此前稳定版本，保存
  reason 与三组实际指纹，先离线分析；不要修改迁移文件或手工补台账。
- **台账补齐后最终迁移失败：** 保持 bridge/此前稳定版本在线。不要删除
  `d1_migrations`，修复新的、尚未成功执行的迁移后重试最终部署。
- **最终部署成功但应用回归：** 可重新部署此前稳定应用；旧应用可以忽略新增
  表和列。不要逆向删除表、列或迁移记录。
- **数据完整性异常：** 停止所有写入，使用 D1 的备份/时间点恢复能力或平台
  支持处理。禁止把“删除迁移记录后重跑”当作回滚。

整个过程中，任何“结构大致相似”都不是继续条件；只有严格指纹、合法前缀和
写后复读同时成立才允许进入最终部署。
