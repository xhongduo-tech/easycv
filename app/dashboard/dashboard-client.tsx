"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  Building2,
  Clock3,
  Copy,
  FilePlus2,
  GraduationCap,
  LayoutGrid,
  List,
  LoaderCircle,
  MoreHorizontal,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { TargetBrandMark } from "@/components/target-brand-mark";
import { formatDate } from "@/lib/utils";
import { authClient } from "@/lib/auth-client";
import type { ResumeRecord, ResumeSummary, Track } from "@/types/resume";
import { NewResumeDialog } from "./new-resume-dialog";
import styles from "./dashboard.module.css";

export function DashboardClient({ initialCreate = false, initialTrack }: { initialCreate?: boolean; initialTrack?: Track }) {
  const router = useRouter();
  const viewer = authClient.useSession();
  const [resumes, setResumes] = useState<ResumeSummary[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | Track>("all");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [busyId, setBusyId] = useState("");
  const [createOpen, setCreateOpen] = useState(initialCreate);
  const closeCreate = useCallback(() => {
    setCreateOpen(false);
    router.replace("/dashboard", { scroll: false });
  }, [router]);

  const load = useCallback(async (cursor?: string) => {
    const append = Boolean(cursor);
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ limit: "20" });
      if (filter !== "all") params.set("track", filter);
      if (query.trim()) params.set("q", query.trim());
      if (cursor) params.set("cursor", cursor);
      const resumeResponse = await fetch(`/api/resumes?${params}`, { cache: "no-store" });
      const result = (await resumeResponse.json()) as {
        resumes?: ResumeSummary[];
        nextCursor?: string | null;
        error?: { message?: string };
      };
      if (!resumeResponse.ok) throw new Error(result.error?.message ?? "简历列表加载失败");
      setResumes((current) => append ? [...current, ...(result.resumes ?? [])] : (result.resumes ?? []));
      setNextCursor(result.nextCursor ?? null);
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  }, [filter, query]);

  useEffect(() => {
    const timer = window.setTimeout(() => void load(), query.trim() ? 220 : 0);
    return () => window.clearTimeout(timer);
  }, [load, query]);

  useEffect(() => {
    const storedClaimError = window.sessionStorage.getItem("jianji:claim-error");
    let initialErrorTimer: number | undefined;
    if (storedClaimError) {
      window.sessionStorage.removeItem("jianji:claim-error");
      initialErrorTimer = window.setTimeout(() => setError(storedClaimError), 0);
    }
    const refreshAfterClaim = () => void load();
    const showClaimError = (event: Event) => setError((event as CustomEvent<string>).detail);
    window.addEventListener("jianji:guest-claimed", refreshAfterClaim);
    window.addEventListener("jianji:claim-error", showClaimError);
    return () => {
      if (initialErrorTimer !== undefined) window.clearTimeout(initialErrorTimer);
      window.removeEventListener("jianji:guest-claimed", refreshAfterClaim);
      window.removeEventListener("jianji:claim-error", showClaimError);
    };
  }, [load]);

  async function rename(resume: ResumeSummary) {
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

  async function duplicate(resume: ResumeSummary) {
    setBusyId(resume.id);
    try {
      const detailResponse = await fetch(`/api/resumes/${resume.id}`);
      const detailResult = (await detailResponse.json()) as { resume?: ResumeRecord; error?: { message?: string } };
      if (!detailResponse.ok || !detailResult.resume) {
        throw new Error(detailResult.error?.message ?? "读取原简历失败");
      }
      const source = detailResult.resume;
      const copySuffix = " · 副本";
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          track: source.track,
          ...(source.targetProfileId ? { targetProfileId: source.targetProfileId } : { targetName: source.targetName }),
          templateId: source.templateId,
          title: `${source.title.slice(0, 160 - copySuffix.length)}${copySuffix}`,
          content: source.content,
          ...(source.targetBrief ? {
            targetBrief: {
              focusName: source.targetBrief.focusName,
              requirementsText: source.targetBrief.requirementsText,
              sourceType: source.targetBrief.sourceType,
              sourceUrl: source.targetBrief.sourceUrl ?? "",
            },
          } : {}),
        }),
      });
      const result = (await response.json()) as { resume?: ResumeRecord; error?: { message?: string } };
      if (!response.ok || !result.resume) throw new Error(result.error?.message ?? "复制失败");
      setResumes((current) => [result.resume!, ...current]);
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusyId(""); }
  }

  async function remove(resume: ResumeSummary) {
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
              <p className="eyebrow">我的简历</p>
              <h1>所有简历，都在这里。</h1>
              <p>新建、继续编辑，并从同一个编辑器完成建议、预览与输出。</p>
            </div>
            <div className={styles.createActions}>
              <button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={17} /> 新建简历</button>
            </div>
          </div>

          {!viewer.isPending && !viewer.data?.user && (
            <aside className={styles.guestBanner}>
              <span><ShieldCheck size={21} /></span>
              <div><strong>当前是访客空间</strong><p>登录后可跨设备保存；当前浏览器里的简历会自动并入你的账号。</p></div>
              <div className={styles.guestBannerActions}><Link className="button button-primary" href="/auth/login?returnTo=%2Fdashboard">登录</Link><Link className="button button-secondary" href="/auth/register?returnTo=%2Fdashboard">创建账号</Link></div>
            </aside>
          )}

          <div className={styles.contentHeader}>
            <div><h2>我的简历</h2><span>{resumes.length}{nextCursor ? "+" : ""} 份</span></div>
            <div className={styles.toolbar}>
              <label><Search size={16} /><span className="sr-only">搜索简历</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称或目标" /></label>
              <div className={styles.filters}>
                {(["all", "study", "career"] as const).map((value) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? styles.filterActive : ""} onClick={() => setFilter(value)}>{value === "all" ? "全部" : value === "study" ? "留学" : "求职"}</button>)}
              </div>
              <div className={styles.views}><button type="button" aria-pressed={view === "grid"} className={view === "grid" ? styles.viewActive : ""} onClick={() => setView("grid")} aria-label="网格视图"><LayoutGrid size={16} /></button><button type="button" aria-pressed={view === "list"} className={view === "list" ? styles.viewActive : ""} onClick={() => setView("list")} aria-label="列表视图"><List size={16} /></button></div>
            </div>
          </div>

          {error && <div className={styles.error} role="alert"><span>{error}</span><button type="button" onClick={() => { setError(""); void load(); }}><RefreshCw size={14} /> 重试</button></div>}

          {loading ? (
            <div className={styles.loading}><LoaderCircle className={styles.spin} size={25} /><strong>正在整理你的简历</strong></div>
          ) : resumes.length === 0 ? (
            <div className={styles.empty}>
              <span><FilePlus2 size={29} /></span>
              <h2>{query.trim() || filter !== "all" ? "没有匹配的简历" : "创建你的第一份目标版本"}</h2>
              <p>{query.trim() || filter !== "all" ? "尝试调整搜索词或用途筛选。" : "选择用途与目标，系统会自动匹配版式并进入编辑器。"}</p>
              {!query.trim() && filter === "all" && <button className="button button-primary" type="button" onClick={() => setCreateOpen(true)}><Plus size={17} /> 新建简历</button>}
            </div>
          ) : (
            <div className={view === "grid" ? styles.resumeGrid : styles.resumeList}>
              {resumes.map((resume) => {
                return (
                  <article key={resume.id} className={styles.resumeCard}>
                    <button className={styles.previewButton} type="button" onClick={() => router.push(`/builder/${resume.id}`)} aria-label={`打开 ${resume.title}`}>
                      <div className={styles.summaryPreview} data-track={resume.track}>
                        <span /><strong>{resume.title.slice(0, 22)}</strong><i /><i /><i /><b /><b />
                      </div>
                      <span className={styles.trackTag}>{resume.track === "study" ? <GraduationCap size={12} /> : <Building2 size={12} />}{resume.track === "study" ? "学习研究" : "职业合作"}</span>
                    </button>
                    <div className={styles.cardBody}>
                      <div className={styles.cardTitle}><div><h3>{resume.title}</h3><span><TargetBrandMark size="small" targetId={resume.targetProfileId} targetName={resume.targetName} track={resume.track} /> {resume.targetName}</span></div><details><summary aria-label="更多操作"><MoreHorizontal size={18} /></summary><div><button type="button" onClick={() => void rename(resume)}><Pencil size={14} /> 重命名</button><button type="button" onClick={() => void duplicate(resume)}><Copy size={14} /> 创建副本</button><button type="button" className={styles.deleteAction} onClick={() => void remove(resume)}><Trash2 size={14} /> 删除草稿</button></div></details></div>
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
          {!loading && nextCursor && (
            <div className={styles.loadMore}>
              <button className="button button-secondary" type="button" disabled={loadingMore} onClick={() => void load(nextCursor)}>
                {loadingMore ? <LoaderCircle className={styles.spin} size={16} /> : <ArrowRight size={16} />}
                {loadingMore ? "正在加载" : "加载更多"}
              </button>
            </div>
          )}
        </div>
      </section>
      <SiteFooter />
      {createOpen && <NewResumeDialog initialTrack={initialTrack} onClose={closeCreate} />}
    </main>
  );
}
