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
import type { AdminOverview, AdminResumeSummary } from "@/types/resume";
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
                <Metric icon={Target} label="目标画像" value={overview.metrics.targetProfiles} note="大学与企业画像" />
                <Metric icon={Sparkles} label="平均完整度" value={`${overview.metrics.averageProgress}%`} note="基于当前草稿" />
                <Metric icon={Activity} label="今日增强优化" value={overview.metrics.modelRunsToday} note={`峰值估算成本 ¥${overview.metrics.estimatedModelCostTodayYuan.toFixed(3)}`} />
                <Metric icon={Coins} label="待使用额度" value={overview.metrics.outstandingAiCredits} note="赠送与已购有效余额" />
              </div>

              <div className={styles.dashboardGrid}>
                <section className={styles.recentPanel}>
                  <div className={styles.panelHeader}><div><span>全平台元数据</span><h2>最近更新的简历</h2></div><span>不读取正文</span></div>
                  {overview.recentResumes.length ? (
                    <div className={styles.tableWrap}>
                      <table>
                        <thead><tr><th>简历</th><th>赛道</th><th>目标</th><th>进度</th><th>更新时间</th></tr></thead>
                        <tbody>{overview.recentResumes.map((resume) => <ResumeRow key={resume.id} resume={resume} />)}</tbody>
                      </table>
                    </div>
                  ) : <div className={styles.panelEmpty}><FileText size={22} /> 暂无用户简历，创建后会显示在这里。</div>}
                </section>

                <aside className={styles.breakdownPanel}>
                  <div className={styles.panelHeader}><div><span>目标分布</span><h2>赛道构成</h2></div><Activity size={18} /></div>
                  <div className={styles.breakdownBars}>
                    {[{ label: "study", display: "留学申请" }, { label: "career", display: "毕业求职" }].map((entry) => {
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
                <div><span className={styles.healthIcon}><CheckCircle2 size={21} /></span><div><strong>平台运行正常</strong><p>数据库绑定、模板目录与本地建议引擎均可用。</p></div></div>
                <div className={styles.systemItems}><span><i /> D1 数据库</span><span><i /> 本地建议引擎</span><span><i /> 版本审计</span></div>
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
  return <tr><td><span className={styles.resumeIdentity}><span className={styles.fileIcon}><FileText size={15} /></span><span><strong>{resume.title}</strong><small>修订 {resume.revision}</small></span></span></td><td><span className={styles.trackPill}>{resume.track === "study" ? "留学" : "求职"}</span></td><td>{resume.targetName}</td><td><div className={styles.tableProgress}><i><span style={{ width: `${resume.progress}%` }} /></i><strong>{resume.progress}%</strong></div></td><td><span className={styles.time}><Clock3 size={12} />{formatDate(resume.updatedAt)}</span></td></tr>;
}

function GovernanceCard({ icon: Icon, label, title, text, tags }: { icon: typeof FileText; label: string; title: string; text: string; tags: string[] }) {
  return <article><div className={styles.governanceTop}><span><Icon size={19} /></span><small>{label}</small></div><h2>{title}</h2><p>{text}</p><div>{tags.map((tag) => <span key={tag}>{tag}</span>)}</div><button type="button" disabled title="内容管理写入能力将在后续 CMS 阶段开放"><Settings2 size={14} /> 管理配置</button></article>;
}

function statusLabel(value: string) { return value === "draft" ? "草稿" : value === "ready" ? "已完成" : "已归档"; }
