# 简迹 Codex 执行服务

独立部署的 Node.js 24 服务，通过真实 `@openai/codex-sdk@0.154.0` 启动固定版本的 Codex CLI。Cloudflare Worker 保留用户鉴权、D1 队列、预算、候选校验和最终简历保存；浏览器不连接本服务，也不取得 OpenAI 凭据。

本轮实现设计 A/B 的规范文字流程：经历与岗位 → 关键追问 → 用户补充 → 有证据引用的候选与面试提纲 → 业务端审阅。每次领取使用全新 Codex 会话，恢复依据由业务端保存的来源和回答重建，不依赖本机聊天历史。用户确认与正文写入始终由业务 API 执行。

当前执行切片禁止 shell、网络搜索、MCP、托管工具、图片和远程文件；网关强制 `tools: []`、`tool_choice: none`，并拒绝工具调用输出。SDK 负责材料任务的分析、追问与结构化输出。完整服务端渲染、OCR、作品集生成、任意工具编排需要各自的隔离和计费契约，当前没有启用，也没有把本地规则伪装成 Codex 成功。

## 本地验证

```sh
cd services/codex-runner
pnpm install --frozen-lockfile --ignore-scripts
node --test test/*.test.mjs
```

仅做不调用模型的单元验证、且不需要本机 CLI 时，可以加 `--no-optional` 安装 SDK；生产镜像必须保留匹配 Linux 架构的 optional CLI 包。`Dockerfile` 在构建时执行测试以及 `codex --version`，不调用模型。SDK、CLI 与全部平台包的版本及完整性由独立 `pnpm-lock.yaml` 固定。

`src/result-schema.json` 由主应用 `src/lib/agent-contract.ts` 的 `agentResultJsonSchema` 导出。修改契约时同步此文件并运行主应用的契约测试。执行服务检查输出结构、来源、原文、重复改写和轮数，业务端再次校验资源归属、隐私、数字/角色/日期变化和简历修订。

## 配置与启动

复制 `runner.env.example` 到部署环境的私有 `runner.env`，填入实际凭据、精确模型、价格版本与额度。不要提交此文件。`CODEX_RUNNER_SECRET` 至少 32 字符，与 Worker 的内部接口凭据一致。真实 `OPENAI_API_KEY` 仅注入此独立执行服务，不注入 Worker、浏览器或 CLI。

所有价格必须显式设置，单位为 **每百万 token 的美元微元**。预算与回执 `costMicros` 为美元微元，`1 USD = 1,000,000 micros`，与旧 DeepSeek 人民币费用分开。模型名称、价格或额度缺失时拒绝启动。核对该精确模型的 API 可用性、价格和输入计数接口支持后，再启用试点。

```sh
docker build -t jianji-codex-runner services/codex-runner
docker run --rm --init --read-only \
  --cap-drop ALL \
  --cap-add CHOWN --cap-add DAC_OVERRIDE --cap-add KILL \
  --cap-add SETUID --cap-add SETGID \
  --security-opt no-new-privileges:true \
  --pids-limit 128 --memory 1g --cpus 2 \
  --tmpfs /tmp:rw,noexec,nosuid,size=64m,mode=1777 \
  --tmpfs /var/lib/jianji-jobs:rw,noexec,nosuid,size=256m,mode=0711 \
  --env-file runner.env jianji-codex-runner
```

使用专用容器与 PID/network namespace，不挂载宿主家目录、Docker socket、仓库或其他用户数据，不使用 `--privileged`、host PID/network。部署网络只允许业务 API 和 `api.openai.com:443` 出站；无需公开入站端口。启动检查要求 Linux、镜像标记、root 只读挂载、任务 tmpfs、no-new-privileges、限定 capabilities 与明确的 `container-v1` 配置；这些检查不能代替部署方对宿主挂载和网络策略的审查。

root 进程只运行受信任协调代码与凭据代理。专用 launcher 将 CLI 降权为 UID/GID 10001、清空附加组，并使用独立进程组；真实上游凭据不进入这个进程环境，其他 UID 无权读 root 的 `/proc/*/environ`。每个任务创建独立 `HOME`、`CODEX_HOME`、临时目录与工作目录。SDK 的临时输出 schema 被受信任 launcher 复制为可读文件后才交给 CLI。结束、失败、取消均清理任务目录；超时/取消杀掉 CLI 进程组，容器退出由 PID namespace 回收进程。

## 成本边界

每个任务获得一个随机的短期 loopback token。代理只接受 `POST /v1/responses`，拒绝其他端点、WebSocket、压缩请求、重定向和不支持的请求字段，固定转发到官方 Responses 地址与领取时指定模型。上游服务端密钥只存在代理内存与受信任请求头，既不放在模型可执行的环境，也不复制到工作目录。

代理先调用官方 `/v1/responses/input_tokens`。输入超过显式 token 上限，或计数接口不可用，就拒绝执行。付费请求发出前，按**完整输入上限 × 非缓存最高适用输入单价 + 强制输出上限 × 输出单价**预留；剩余额度不足时不会发出模型请求。每次付费请求均计入模型调用上限。实际响应 usage 返回后按向上取整的整数美元微元结算。缓存仅在结算时减少成本，不会缩减预留上界。

响应流在受限内存中检查完成后才交给 CLI，因此候选不是逐 token 显示；业务端心跳仍持续。缺少 usage、连接丢失、取消或超时时保留整笔在途预留并报告失败，禁止把未知费用报告为零。该 `costMicros` 是已知成本或保守预留，未知 usage 的回执 token 字段只反映已测量部分；运营对账应以官方最终账单为准。停止不会撤销已发出的模型请求，平台承担中止前已发生费用。仅支持 default service tier、纯文本 token 定价；新的缓存写入等计价维度会失败关闭，需扩展定价契约后再开放。

平台在 D1 中为整个 job 保留预算；领取返回的是剩余预算和剩余累计模型调用次数。执行服务只使用该剩余额度，不自行重置。当前是限额免费试点，不扣用户点数。

每份 usage 回执包含 `priceVersion` 和 `costBasis`。全部调用有可核对 usage 时是 `measured`；只要任一付费调用最终用量未知，整个切片是 `reserved`，其中 `costMicros` 包括已测量费用与未知调用的保守预留。尚未发出付费请求的失败记为 `measured` 且模型成本为零。

费用验收使用所部署的 OpenAI API 项目与实际模型价格，而非桌面 Codex 套餐。上线前将官方价格页、价格生效日期和 `CODEX_PRICE_VERSION` 对应保存，并用试点账单核对输入、缓存、输出及计数接口是否有其他收费。这里没有为 `/input_tokens` 宣称免费，也没有把组织账单、运行容器或其他服务费用纳入 token 预算上界；未确认任何适用计价维度时保持功能关闭。

## 队列与故障

服务顺序执行任务并持续轮询 `/api/internal/agent-jobs/claim`，领取握手发送 `{ workerId, model }`。业务端只在模型与配置完全一致时记录 runner 在线，防止错误配置的服务被视为可用。每约 10 秒发送带 `leaseToken + attempt` 的 heartbeat。超过租约、取消、后台不可达或达到总时限就中止；最多三轮用户补充，第三轮不再提出新问题。终态只由带同一围栏的 `complete` 或 `fail` 回执写入。

完成回执丢失时，只对同一结果做有界重试，绝不重新调用 SDK；重试仍不确定时退出进程，让后台处理过期租约。所有接口拒绝重定向，失败日志只记录错误代码和 job ID，不记录用户来源、候选、模型错误原文或凭据。队列状态和实际费用故障对账由业务服务负责。

代理关闭或目录清理失败时仍保证停止心跳并报告围栏失败及用量，然后退出容器，避免给已中断的任务无限续租或复用未清理环境。

## 已验证与上线验收

本机 Node 测试使用合成来源、模拟 SDK 事件与模拟上游，覆盖代理限制、成本预留、调用次数、未知费用、来源引用、取消、失败、回执重试和清理。没有使用桌面登录态、没有调用真实模型。当前开发主机为 Windows，Linux 镜像与真实 API 端到端任务仍需在部署环境验收：构建镜像、隔离检查、SDK 结构化输出、取消收敛、一次缺字段追问和一次候选交付。验收失败应保持业务端功能不可用，不能对用户显示已完成 Codex 执行。

实现依据：[Codex SDK](https://learn.chatgpt.com/docs/codex-sdk)、[Codex 非交互模式](https://learn.chatgpt.com/docs/non-interactive-mode)、[Responses 输入 token 计数](https://developers.openai.com/api/reference/typescript/resources/responses/subresources/input_tokens/methods/count)。固定版本的实际 SDK 类型与进程启动实现亦已检查。
