"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Clock3,
  Copy,
  FilePlus2,
  FileText,
  GraduationCap,
  LayoutGrid,
  List,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Sparkles,
  Target,
  Trash2,
} from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { templates } from "@/lib/sample-data";
import { formatDate } from "@/lib/utils";
import type { ResumeRecord, Track } from "@/types/resume";
import styles from "./dashboard.module.css";

export function DashboardClient() {
  const router = useRouter();
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Track>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/resumes");
      const result = (await response.json()) as { resumes?: ResumeRecord[]; error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "工作台加载失败");
      setResumes(result.resumes ?? []);
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

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return resumes.filter((resume) => {
      const matchesTrack = filter === "all" || resume.track === filter;
      const matchesQuery = !normalized || [resume.title, resume.targetName].join(" ").toLowerCase().includes(normalized);
      return matchesTrack && matchesQuery;
    });
  }, [filter, query, resumes]);

  const stats = useMemo(() => ({
    total: resumes.length,
    study: resumes.filter((resume) => resume.track === "study").length,
    career: resumes.filter((resume) => resume.track === "career").length,
    average: resumes.length ? Math.round(resumes.reduce((sum, resume) => sum + resume.progress, 0) / resumes.length) : 0,
  }), [resumes]);

  async function rename(resume: ResumeRecord) {
    const nextTitle = window.prompt("输入新的简历名称", resume.title)?.trim();
    if (!nextTitle || nextTitle === resume.title) return;
    setBusyId(resume.id);
    try {
      const response = await fetch(`/api/resumes/${resume.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ title: nextTitle, expectedRevision: resume.revision }),
      });
      const result = (await response.json()) as { resume?: ResumeRecord; error?: { message?: string } };
      if (!response.ok || !result.resume) throw new Error(result.error?.message ?? "重命名失败");
      setResumes((current) => current.map((item) => item.id === resume.id ? result.resume! : item));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(""); }
  }

  async function duplicate(resume: ResumeRecord) {
    setBusyId(resume.id);
    try {
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          track: resume.track,
          ...(resume.targetProfileId ? { targetProfileId: resume.targetProfileId } : { targetName: resume.targetName }),
          templateId: resume.templateId,
          title: `${resume.title} · 副本`,
          content: resume.content,
        }),
      });
      const result = (await response.json()) as { resume?: ResumeRecord; error?: { message?: string } };
      if (!response.ok || !result.resume) throw new Error(result.error?.message ?? "复制失败");
      setResumes((current) => [result.resume!, ...current]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(""); }
  }

  async function remove(resume: ResumeRecord) {
    if (!window.confirm(`确认删除“${resume.title}”吗？当前演示版不提供恢复入口。`)) return;
    setBusyId(resume.id);
    try {
      const response = await fetch(`/api/resumes/${resume.id}`, { method: "DELETE" });
      if (!response.ok) {
        const result = (await response.json()) as { error?: { message?: string } };
        throw new Error(result.error?.message ?? "删除失败");
      }
      setResumes((current) => current.filter((item) => item.id !== resume.id));
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(""); }
  }

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.dashboard}>
        <div className="shell">
          <div className={styles.welcome}>
            <div>
              <p className="eyebrow">个人工作台</p>
              <h1>你好，继续向下一站靠近。</h1>
              <p>管理你的目标版本、检查完成度，并随时回到上次编辑的位置。</p>
            </div>
            <div className={styles.createActions}>
              <Link className="button button-primary" href="/explore?track=study"><GraduationCap size={17} /> 新建留学 CV</Link>
              <Link className="button button-secondary" href="/explore?track=career"><Building2 size={17} /> 新建求职 CV</Link>
            </div>
          </div>

          <div className={styles.statsGrid}>
            <article><span><FileText size={18} /></span><div><strong>{stats.total}</strong><small>全部目标版本</small></div></article>
            <article><span><GraduationCap size={18} /></span><div><strong>{stats.study}</strong><small>留学申请</small></div></article>
            <article><span><Building2 size={18} /></span><div><strong>{stats.career}</strong><small>毕业求职</small></div></article>
            <article><span><Sparkles size={18} /></span><div><strong>{stats.average}%</strong><small>平均完整度</small></div></article>
          </div>

          <div className={styles.contentHeader}>
            <div><h2>我的简历</h2><span>{filtered.length} 份</span></div>
            <div className={styles.toolbar}>
              <label><Search size={16} /><span className="sr-only">搜索简历</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或目标" /></label>
              <div className={styles.filters}>
                {(["all", "study", "career"] as const).map((value) => <button type="button" key={value} className={filter === value ? styles.filterActive : ""} onClick={() => setFilter(value)}>{value === "all" ? "全部" : value === "study" ? "留学" : "求职"}</button>)}
              </div>
              <div className={styles.views}><button type="button" className={view === "grid" ? styles.viewActive : ""} onClick={() => setView("grid")} aria-label="网格视图"><LayoutGrid size={16} /></button><button type="button" className={view === "list" ? styles.viewActive : ""} onClick={() => setView("list")} aria-label="列表视图"><List size={16} /></button></div>
            </div>
          </div>

          {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => { setError(""); void load(); }}><RefreshCw size={14} /> 重试</button></div>}

          {loading ? (
            <div className={styles.loading}><LoaderCircle className={styles.spin} size={25} /><strong>正在整理你的工作台</strong></div>
          ) : filtered.length === 0 ? (
            <div className={styles.empty}>
              <span><FilePlus2 size={29} /></span>
              <h2>{resumes.length ? "没有匹配的简历" : "创建你的第一份目标版本"}</h2>
              <p>{resumes.length ? "尝试调整搜索词或赛道筛选。" : "从明确目标开始，模板、结构与建议会一起匹配。"}</p>
              {!resumes.length && <Link className="button button-primary" href="/explore"><Plus size={17} /> 开始创建</Link>}
            </div>
          ) : (
            <div className={view === "grid" ? styles.resumeGrid : styles.resumeList}>
              {filtered.map((resume) => {
                const template = templates.find((item) => item.id === resume.templateId);
                return (
                  <article key={resume.id} className={styles.resumeCard}>
                    <button className={styles.previewButton} type="button" onClick={() => router.push(`/builder/${resume.id}`)} aria-label={`打开 ${resume.title}`}>
                      <div className={styles.preview}><ResumePreview content={resume.content} template={template} scale="card" /></div>
                      <span className={styles.trackTag}>{resume.track === "study" ? <GraduationCap size={12} /> : <Building2 size={12} />}{resume.track === "study" ? "留学申请" : "毕业求职"}</span>
                    </button>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTitle}><div><h3>{resume.title}</h3><span><Target size={12} /> {resume.targetName}</span></div><details><summary aria-label="更多操作"><MoreHorizontal size={18} /></summary><div><button type="button" onClick={() => void rename(resume)}><Pencil size={14} /> 重命名</button><button type="button" onClick={() => void duplicate(resume)}><Copy size={14} /> 创建副本</button><button type="button" className={styles.deleteAction} onClick={() => void remove(resume)}><Trash2 size={14} /> 删除草稿</button></div></details></div>
                      <div className={styles.cardMeta}><span><Clock3 size={12} /> {formatDate(resume.updatedAt)}</span><span>修订 {resume.revision}</span></div>
                      <div className={styles.progressRow}><i><span style={{ width: `${resume.progress}%` }} /></i><strong>{resume.progress}%</strong></div>
                      <Link href={`/builder/${resume.id}`}>继续编辑 <ArrowRight size={15} /></Link>
                      {busyId === resume.id && <span className={styles.busy}><LoaderCircle className={styles.spin} size={16} /></span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
