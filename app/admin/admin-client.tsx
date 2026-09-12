"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Activity,
  ArrowRight,
  BookOpenCheck,
  CheckCircle2,
  Clock3,
  Coins,
  Database,
  FileText,
  LayoutTemplate,
  LoaderCircle,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { formatDate } from "@/lib/utils";
import type { AdminAgentMetrics, AdminOverview, AdminResumeSummary } from "@/types/resume";
import styles from "./admin.module.css";

type OverviewResponse = AdminOverview & { currentAdmin: { role: string; mode: string } };

export function AdminClient() {
  const [overview, setOverview] = useState<OverviewResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/admin/overview");
      const result = (await response.json()) as OverviewResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "管理概览加载失败");
      setOverview(result);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Data fetching is intentionally started after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const maxBreakdown = useMemo(() => {
    if (!overview) return 1;
    return Math.max(1, ...overview.trackBreakdown.map((item) => Number(item.value)));
  }, [overview]);

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.adminShell}>
        <div className="shell">
          <div className={styles.adminHeader}>
            <div>
              <div className={styles.modeBadge}><ShieldCheck size={14} /> 管理员已验证</div>
              <h1>内容治理与运行概览</h1>
              <p>查看平台级汇总数据；用户身份、角色与停用状态在独立的用户管理页维护。</p>
            </div>
            <div className={styles.headerButtons}><Link className="button button-primary" href="/admin/users">用户管理 <ArrowRight size={15} /></Link><button className="button button-secondary" type="button" onClick={() => void load()} disabled={loading}><RefreshCw className={loading ? styles.spin : ""} size={16} /> 刷新数据</button></div>
          </div>

          {error && <div className={styles.error} role="alert">{error}</div>}
          {loading && !overview ? (
            <div className={styles.loading}><LoaderCircle className={styles.spin} size={27} /><strong>正在读取平台数据</strong></div>
          ) : overview ? (
            <>
              <div className={styles.metrics}>
                <Metric icon={FileText} label="有效简历" value={overview.metrics.totalResumes} note="未归档目标版本" />
                <Metric icon={LayoutTemplate} label="启用模板" value={overview.metrics.activeTemplates} note="原创布局模板" />
                <Metric icon={Target} label="目标画像" value={overview.metrics.targetProfiles} note="机构与职业目标画像" />
                <Metric icon={Sparkles} label="平均完整度" value={`${overview.metrics.averageProgress}%`} note="基于当前草稿" />
                <Metric icon={Activity} label="今日 DeepSeek 增强" value={overview.metrics.modelRunsToday} note={`DeepSeek 峰值估算 ¥${overview.metrics.estimatedModelCostTodayYuan.toFixed(3)}`} />
                <Metric icon={Coins} label="待使用简迹点" value={overview.metrics.outstandingAiCredits} note="赠送与已购有效余额" />
              </div>

              <AgentMetricsPanel metrics={overview.agentMetrics} />

              <div className={styles.dashboardGrid}>
                <section className={styles.recentPanel}>
                  <div className={styles.panelHeader}><div><span>全平台元数据</span><h2>最近更新的简历</h2></div><span>不读取正文</span></div>
                  {overview.recentResumes.length ? (
                    <div className={styles.tableWrap}>
                      <table>
                        <thead><tr><th>简历</th><th>用途</th><th>目标</th><th>进度</th><th>更新时间</th></tr></thead>
                        <tbody>{overview.recentResumes.map((resume) => <ResumeRow key={resume.id} resume={resume} />)}</tbody>
                      </table>
                    </div>
                  ) : <div className={styles.panelEmpty}><FileText size={22} /> 暂无用户简历，创建后会显示在这里。</div>}
                </section>

                <aside className={styles.breakdownPanel}>
                  <div className={styles.panelHeader}><div><span>目标分布</span><h2>材料用途</h2></div><Activity size={18} /></div>
                  <div className={styles.breakdownBars}>
                    {[{ label: "study", display: "学习与研究" }, { label: "career", display: "职业与合作" }].map((entry) => {
                      const value = Number(overview.trackBreakdown.find((item) => item.label === entry.label)?.value ?? 0);
                      return <div key={entry.label}><div><span>{entry.display}</span><strong>{value}</strong></div><i><span style={{ width: `${(value / maxBreakdown) * 100}%` }} /></i></div>;
                    })}
                  </div>
                  <div className={styles.statusList}>
                    <span>草稿状态</span>
                    {overview.statusBreakdown.length ? overview.statusBreakdown.map((item) => <div key={item.label}><span><i />{statusLabel(item.label)}</span><strong>{Number(item.value)}</strong></div>) : <p>暂无状态数据</p>}
                  </div>
                </aside>
              </div>

              <div className={styles.governanceGrid}>
                <GovernanceCard icon={BookOpenCheck} label="目标内容" title="画像资料与证据等级" text="每条院校/企业建议应区分公开事实、编辑经验与未知项，并记录复核日期。" tags={["8 个编辑示例画像", "需持续复核"]} />
                <GovernanceCard icon={LayoutTemplate} label="模板系统" title="受控组件与主题变量" text="模板只能调整布局与主题，不允许注入任意脚本，内容与表现层保持分离。" tags={["8 套模板", "ATS 纯文本"]} />
                <GovernanceCard icon={Database} label="数据治理" title="版本、审计与软删除" text="每次内容更新递增修订号并保存版本快照；高风险操作进入审计记录。" tags={["D1 持久化", "Revision 乐观锁"]} />
              </div>

              <section className={styles.systemPanel}>
                <div><span className={styles.healthIcon}><CheckCircle2 size={21} /></span><div><strong>平台汇总已读取</strong><p>执行服务状态请查看 Codex 面板；更多检查见健康接口。</p></div></div>
                <div className={styles.systemItems}><span><i /> 数据库查询完成</span><span><i /> 管理员权限已验证</span></div>
                <Link className="button button-dark" href="/api/health">查看健康检查 <ArrowRight size={15} /></Link>
              </section>
            </>
          ) : null}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}

function Metric({ icon: Icon, label, value, note }: { icon: typeof FileText; label: string; value: string | number; note: string }) {
  return <article><span><Icon size={19} /></span><div><small>{label}</small><strong>{value}</strong><p>{note}</p></div></article>;
}

function ResumeRow({ resume }: { resume: AdminResumeSummary }) {
  return <tr><td><span className={styles.resumeIdentity}><span className={styles.fileIcon}><FileText size={15} /></span><span><strong>{resume.title}</strong><small>修订 {resume.revision}</small></span></span></td><td><span className={styles.trackPill}>{resume.track === "study" ? "学习研究" : "职业合作"}</span></td><td>{resume.targetName}</td><td><div className={styles.tableProgress}><i><span style={{ width: `${resume.progress}%` }} /></i><strong>{resume.progress}%</strong></div></td><td><span className={styles.time}><Clock3 size={12} />{formatDate(resume.updatedAt)}</span></td></tr>;
}

const agentStatusLabels: Record<string, string> = {
  queued: "排队", running: "执行中", waiting_input: "等待补充", ready: "候选就绪",
  applied: "已应用", failed: "失败", cancelled: "已取消", expired: "已到期",
};
const usd = (micros: number) => `US$${(micros / 1_000_000).toFixed(4)}`;
const rate = (value: number | null) => value === null ? "—" : `${(value * 100).toFixed(1)}%`;

function AgentMetricsPanel({ metrics }: { metrics: AdminAgentMetrics }) {
  const runtime = metrics.runtime;
  const usage = metrics.usage24h;
  const cohort = metrics.sevenDays;
  return <section className={styles.agentPanel} aria-labelledby="agent-metrics-title">
    <div className={styles.panelHeader}><div><span>Codex 材料任务 · 平台汇总</span><h2 id="agent-metrics-title">从执行到用户确认</h2></div><span className={styles.agentAvailability} data-online={runtime.acceptingJobs}><i />{runtime.acceptingJobs ? "可接受任务" : runtime.switchEnabled ? "执行条件未就绪" : "任务开关已关闭"}</span></div>
    <div className={styles.agentBody}>
      <dl className={styles.agentRuntime}>
        <div><dt>任务开关 / 配置</dt><dd>{runtime.switchEnabled ? "已开启" : "已关闭"} / {runtime.configurationReady ? "已齐备" : "待配置"}</dd></div>
        <div><dt>执行服务</dt><dd>{runtime.runnerOnline ? "在线 · 最近 2 分钟有匹配心跳" : "离线或模型不匹配"}</dd></div>
        <div><dt>最近心跳</dt><dd>{runtime.lastHeartbeatAt ? <time dateTime={runtime.lastHeartbeatAt}>{new Date(runtime.lastHeartbeatAt).toLocaleString("zh-CN", { hour12: false })}</time> : "尚无记录"}</dd></div>
        <div><dt>配置模型 / 执行模型</dt><dd>{runtime.model || "未设置"} / {runtime.runnerModel || "未连接"}</dd></div>
      </dl>
      <div className={styles.agentCounts}>{metrics.statusCounts.map((item) => <div key={item.status} data-status={item.status}><span>{agentStatusLabels[item.status] ?? item.status}</span><strong>{item.count}</strong></div>)}</div>
      <div className={styles.agentQuality}>
        <div><small>近 7 天创建任务</small><strong>{cohort.createdJobs}</strong><span>{cohort.closedJobs} 个已结束</span></div>
        <div><small>候选交付率</small><strong>{rate(cohort.successRate)}</strong><span>{cohort.deliveredJobs} / {cohort.closedJobs} 个已结束任务</span></div>
        <div><small>用户应用率</small><strong>{rate(cohort.applicationRate)}</strong><span>{cohort.appliedJobs} / {cohort.deliveredJobs} 个已交付任务</span></div>
      </div>
      <p className={styles.agentDefinition}>交付指候选就绪或已应用；已结束包含失败、取消和到期。质量统计仅覆盖仍保留、近 7 天创建的任务，已删除任务不在其中。</p>
      <div className={styles.agentCostHeader}><h3>近 24 小时 · USD</h3><span>{runtime.maxJobsPerDay} 个任务 / 用户 / 日</span></div>
      <div className={styles.agentCosts}>
        <div><small>整任务预算预留</small><strong>{usd(usage.retainedReservedUsdMicros)}</strong><span>平台上限 {usage.platformCapUsdMicros > 0 ? usd(usage.platformCapUsdMicros) : "未配置"}</span></div>
        <div><small>已知 token 用量估算</small><strong>{usage.returnedRuns ? usd(usage.returnedEstimatedCostUsdMicros) : "—"}</strong><span>{usage.returnedRuns} 次已知用量回执</span></div>
        <div><small>回执保守占额</small><strong>{usage.conservativeRuns ? usd(usage.conservativeReportedCostUsdMicros) : "—"}</strong><span>{usage.conservativeRuns} 次按预留额记账</span></div>
      </div>
      <div className={styles.agentUncertainty} data-warning={usage.unknownRuns > 0 || usage.unsettledRuns > 0}><span>费用不确定 <strong>{usage.unknownRuns}</strong> 次</span><span>尚未结算 <strong>{usage.unsettledRuns}</strong> 次</span></div>
      <p className={styles.agentDefinition}>预留按完整任务上限计算，删除材料仍保留平台占额。费用统计覆盖近 24 小时启动且仍保留的执行；可计量回执是估算，保守占额与未知用量单列，不代表完整实际账单。USD 与 DeepSeek 人民币分开统计。</p>
    </div>
  </section>;
}

function GovernanceCard({ icon: Icon, label, title, text, tags }: { icon: typeof FileText; label: string; title: string; text: string; tags: string[] }) {
  return <article><div className={styles.governanceTop}><span><Icon size={19} /></span><small>{label}</small></div><h2>{title}</h2><p>{text}</p><div>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div><button type="button" disabled title="内容管理写入能力将在后续 CMS 阶段开放"><Settings2 size={14} /> 管理配置</button></article>;
}

function statusLabel(value: string) { return value === "draft" ? "草稿" : value === "ready" ? "已完成" : "已归档"; }
