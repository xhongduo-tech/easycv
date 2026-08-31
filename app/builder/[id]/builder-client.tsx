"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Link from "next/link";
import {
  AlertCircle,
  AlertTriangle,
  ArrowLeft,
  Award,
  BookOpenCheck,
  BriefcaseBusiness,
  CalendarClock,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  ClipboardList,
  Download,
  Eye,
  ExternalLink,
  FileText,
  FolderKanban,
  Globe2,
  GraduationCap,
  Languages,
  LayoutTemplate,
  Lightbulb,
  Link2,
  ListChecks,
  LoaderCircle,
  Menu,
  Plus,
  Printer,
  Pencil,
  RefreshCw,
  Save,
  Sparkles,
  ShieldCheck,
  Target,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { AccountMenu } from "@/components/account-menu";
import { ResumePreview } from "@/components/resume-preview";
import { recommendGrowthGaps } from "@/lib/growth-data";
import { analyzeJobFit, extractRequirements, targetBriefSourceLabels } from "@/lib/job-fit";
import {
  applyRewriteProposal,
  getTextAtSourceRef,
  replaceTextAtSourceRef,
  type RewriteFocus,
} from "@/lib/rewrite-proposals";
import { shortId } from "@/lib/utils";
import { toStandaloneHtml } from "@/lib/web-resume";
import type {
  AdvisorResult,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeContent,
  ResumeRecord,
  ResumeTemplate,
  RewriteProposal,
  RewriteSourceRef,
  TargetBrief,
  TargetBriefSource,
} from "@/types/resume";
import styles from "./builder.module.css";

type SectionId = "basics" | "summary" | "education" | "experience" | "projects" | "extras";
type SaveState = "idle" | "saving" | "saved" | "error";
type MobileView = "edit" | "preview" | "advice";
type AdviceResponse = AdvisorResult & {
  provider: string;
  factPolicy: string;
  modelAvailable?: boolean;
  modelFallback?: boolean;
  fallbackReason?: "input-too-large" | "rate-limit" | "concurrency" | "provider-error";
  baseResumeRevision?: number;
  baseBriefRevision?: number;
};

type RewriteUndo = {
  sourceRef: RewriteSourceRef;
  previousText: string;
  appliedText: string;
  proposalId: string;
};

const mobileViews: MobileView[] = ["edit", "preview", "advice"];
const modelFallbackLabels: Record<NonNullable<AdviceResponse["fallbackReason"]>, string> = {
  "input-too-large": "内容超出单次模型处理上限，已使用基础分析",
  "rate-limit": "模型使用频率或当日额度已达上限，已使用基础分析",
  concurrency: "模型当前繁忙，已使用基础分析",
  "provider-error": "模型暂不可用，已使用基础分析",
};

const sections: Array<{ id: SectionId; label: string; icon: typeof CircleUserRound }> = [
  { id: "basics", label: "个人信息", icon: CircleUserRound },
  { id: "summary", label: "个人简介", icon: FileText },
  { id: "education", label: "教育经历", icon: GraduationCap },
  { id: "experience", label: "工作与实践", icon: BriefcaseBusiness },
  { id: "projects", label: "项目经历", icon: FolderKanban },
  { id: "extras", label: "技能与其他", icon: Award },
];

export function BuilderClient({ resumeId, initialExport = false }: { resumeId: string; initialExport?: boolean }) {
  const [resume, setResume] = useState<ResumeRecord | null>(null);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [activeSection, setActiveSection] = useState<SectionId>("basics");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const [saveMessage, setSaveMessage] = useState("");
  const [saveConflict, setSaveConflict] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [advice, setAdvice] = useState<AdviceResponse | null>(null);
  const [adviceLoading, setAdviceLoading] = useState(false);
  const [adviceError, setAdviceError] = useState("");
  const [modelAvailable, setModelAvailable] = useState(false);
  const [allowExternalModel, setAllowExternalModel] = useState(false);
  const [adviceSection, setAdviceSection] = useState<SectionId | null>(null);
  const [adviceFocus, setAdviceFocus] = useState<RewriteFocus | null>(null);
  const [rewriteUndo, setRewriteUndo] = useState<RewriteUndo | null>(null);
  const [appliedProposalIds, setAppliedProposalIds] = useState<string[]>([]);
  const [keptProposalIds, setKeptProposalIds] = useState<string[]>([]);
  const [mobileView, setMobileView] = useState<MobileView>("edit");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [exportOpen, setExportOpen] = useState(initialExport);
  const [briefOpen, setBriefOpen] = useState(false);
  const changeSequence = useRef(0);
  const saving = useRef(false);
  const resumeRef = useRef<ResumeRecord | null>(null);
  const dirtyRef = useRef(false);
  const adviceRequest = useRef<AbortController | null>(null);
  const sidebarRef = useRef<HTMLElement>(null);
  const sidebarTriggerRef = useRef<HTMLButtonElement>(null);
  const sidebarCloseRef = useRef<HTMLButtonElement>(null);
  const editorPanelRef = useRef<HTMLElement>(null);
  const editorHeadingRef = useRef<HTMLHeadingElement>(null);
  const adviceResultRef = useRef<HTMLHeadingElement>(null);
  const briefTriggerRef = useRef<HTMLButtonElement>(null);
  const closeExport = useCallback(() => setExportOpen(false), []);
  const closeBrief = useCallback(() => setBriefOpen(false), []);

  const loadResume = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const resumeResponse = await fetch(`/api/resumes/${resumeId}`);
      const resumeResult = (await resumeResponse.json()) as {
        resume?: ResumeRecord;
        error?: { message?: string };
      };
      if (!resumeResponse.ok || !resumeResult.resume) {
        throw new Error(resumeResult.error?.message ?? "无法打开这份简历");
      }
      const templateQuery = new URLSearchParams({ track: resumeResult.resume.track });
      if (resumeResult.resume.targetProfileId) {
        templateQuery.set("targetProfileId", resumeResult.resume.targetProfileId);
      }
      const [templateResponse, capability] = await Promise.all([
        fetch(`/api/templates?${templateQuery}`),
        fetch("/api/recommendations")
          .then(async (response) => response.ok ? await response.json() as { modelAvailable?: boolean } : {})
          .catch(() => ({} as { modelAvailable?: boolean })),
      ]);
      const templateResult = (await templateResponse.json()) as {
        templates?: ResumeTemplate[];
        error?: { message?: string };
      };
      if (!templateResponse.ok) {
        throw new Error(templateResult.error?.message ?? "模板加载失败");
      }
      setResume(resumeResult.resume);
      setTemplates(templateResult.templates ?? []);
      setModelAvailable(Boolean(capability.modelAvailable));
      setDirty(false);
      setSaveState("idle");
      setSaveConflict(false);
      setSaveMessage("");
    } catch (reason) {
      setLoadError((reason as Error).message);
    } finally {
      setLoading(false);
    }
  }, [resumeId]);

  useEffect(() => {
    // The editor loads its server-owned document after hydration.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadResume();
  }, [loadResume]);

  const saveResume = useCallback(async (confirmConflict = false) => {
    if (!resume || !dirty || saving.current || (saveConflict && !confirmConflict)) return;
    saving.current = true;
    const sequence = changeSequence.current;
    setSaveState("saving");
    setSaveMessage("");
    try {
      const response = await fetch(`/api/resumes/${resume.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: resume.title,
          templateId: resume.templateId,
          content: resume.content,
          expectedRevision: resume.revision,
        }),
      });
      const result = (await response.json()) as { resume?: ResumeRecord; error?: { message?: string; details?: { currentRevision?: number } } };
      if (response.status === 409 && result.error?.details?.currentRevision) {
        setResume((current) => current ? { ...current, revision: result.error!.details!.currentRevision! } : current);
        setSaveConflict(true);
        setSaveMessage("检测到另一页面的更新。确认后可用当前草稿覆盖，或刷新页面保留服务器版本。");
        setSaveState("error");
        return;
      }
      if (!response.ok || !result.resume) throw new Error(result.error?.message ?? "保存失败");
      setResume((current) => {
        if (!current) return result.resume!;
        return { ...current, revision: result.resume!.revision, updatedAt: result.resume!.updatedAt, progress: result.resume!.progress };
      });
      if (sequence === changeSequence.current) setDirty(false);
      setSaveConflict(false);
      setSaveState("saved");
      window.setTimeout(() => setSaveState((state) => (state === "saved" ? "idle" : state)), 2200);
    } catch (reason) {
      setSaveMessage((reason as Error).message || "保存失败，请稍后重试");
      setSaveState("error");
    } finally {
      saving.current = false;
    }
  }, [dirty, resume, saveConflict]);

  useEffect(() => {
    if (!dirty || !resume || saveConflict) return;
    const timer = window.setTimeout(() => void saveResume(), 900);
    return () => window.clearTimeout(timer);
  }, [dirty, resume, saveConflict, saveResume]);

  useEffect(() => {
    resumeRef.current = resume;
    dirtyRef.current = dirty;
  }, [dirty, resume]);

  useEffect(() => () => adviceRequest.current?.abort(), []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const trigger = sidebarTriggerRef.current;
    window.setTimeout(() => sidebarCloseRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        setSidebarOpen(false);
        return;
      }
      if (event.key !== "Tab" || !sidebarRef.current) return;
      const focusable = Array.from(sidebarRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => trigger?.focus(), 0);
    };
  }, [sidebarOpen]);

  useEffect(() => {
    const warnBeforeLeaving = (event: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    const saveBeforeLeaving = () => {
      const latest = resumeRef.current;
      if (!latest || !dirtyRef.current || saving.current) return;
      void fetch(`/api/resumes/${latest.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          title: latest.title,
          templateId: latest.templateId,
          content: latest.content,
          expectedRevision: latest.revision,
        }),
        keepalive: true,
      });
    };
    window.addEventListener("beforeunload", warnBeforeLeaving);
    window.addEventListener("pagehide", saveBeforeLeaving);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeLeaving);
      window.removeEventListener("pagehide", saveBeforeLeaving);
    };
  }, []);

  const invalidateAdvice = useCallback(() => {
    adviceRequest.current?.abort();
    adviceRequest.current = null;
    setAdviceLoading(false);
    setAdvice(null);
    setAdviceSection(null);
    setAdviceFocus(null);
    setAdviceError("");
    setRewriteUndo(null);
    setAppliedProposalIds([]);
    setKeptProposalIds([]);
  }, []);

  const updateResume = useCallback((updater: (current: ResumeRecord) => ResumeRecord) => {
    invalidateAdvice();
    changeSequence.current += 1;
    setResume((current) => (current ? updater(current) : current));
    setDirty(true);
    setSaveState("idle");
  }, [invalidateAdvice]);

  const updateContent = useCallback(
    (updater: (content: ResumeContent) => ResumeContent) => {
      updateResume((current) => ({ ...current, content: updater(current.content) }));
    },
    [updateResume],
  );

  const template = useMemo(
    () => templates.find((item) => item.id === resume?.templateId),
    [resume?.templateId, templates],
  );

  const learningHint = useMemo(
    () => resume ? recommendGrowthGaps(resume, 1)[0] : undefined,
    [resume],
  );

  const jobFit = useMemo(
    () => resume?.track === "career" && resume.targetBrief?.requirementsText
      ? analyzeJobFit(resume.content, resume.targetBrief)
      : undefined,
    [resume],
  );

  function selectSection(section: SectionId) {
    if (activeSection !== section) adviceRequest.current?.abort();
    setActiveSection(section);
    if (adviceSection && adviceSection !== section) {
      setAdvice(null);
      setAdviceSection(null);
      setAdviceError("");
    }
  }

  function moveMobileTab(event: React.KeyboardEvent<HTMLButtonElement>, current: MobileView) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = mobileViews.indexOf(current);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? mobileViews.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + mobileViews.length) % mobileViews.length;
    const next = mobileViews[nextIndex];
    setMobileView(next);
    window.requestAnimationFrame(() => document.getElementById(`builder-tab-${next}`)?.focus());
  }

  async function requestAdvice(rewriteFocus?: RewriteFocus) {
    if (!resume) return;
    adviceRequest.current?.abort();
    const controller = new AbortController();
    adviceRequest.current = controller;
    const requestedSection = rewriteFocus?.sourceRef.section ?? activeSection;
    setAdviceLoading(true);
    setAdviceError("");
    setMobileView("advice");
    try {
      const sectionMap: Record<SectionId, string> = {
        basics: "basics",
        summary: "summary",
        education: "education",
        experience: "experience",
        projects: "projects",
        extras: "extras",
      };
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          resumeId: resume.id,
          content: resume.content,
          track: resume.track,
          targetProfileId: resume.targetProfileId,
          targetName: resume.targetName,
          allowExternalModel: modelAvailable && allowExternalModel,
          section: sectionMap[requestedSection],
          ...(rewriteFocus ? {
            requirementId: rewriteFocus.requirementId,
            sourceRef: rewriteFocus.sourceRef,
          } : {}),
        }),
      });
      const result = (await response.json()) as AdviceResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "建议生成失败");
      if (controller.signal.aborted || adviceRequest.current !== controller) return;
      if (typeof result.modelAvailable === "boolean") setModelAvailable(result.modelAvailable);
      setAdvice(result);
      setAdviceSection(requestedSection);
      setAdviceFocus(rewriteFocus ?? null);
      setAppliedProposalIds([]);
      setKeptProposalIds([]);
      window.requestAnimationFrame(() => adviceResultRef.current?.focus());
    } catch (reason) {
      if ((reason as Error).name !== "AbortError" && adviceRequest.current === controller) {
        setAdviceError((reason as Error).message);
      }
    } finally {
      if (adviceRequest.current === controller) {
        adviceRequest.current = null;
        setAdviceLoading(false);
      }
    }
  }

  function applyProposal(proposal: RewriteProposal) {
    if (!resume || appliedProposalIds.includes(proposal.id)) return;
    if (advice?.baseBriefRevision !== undefined && advice.baseBriefRevision !== (resume.targetBrief?.revision ?? 0)) {
      setAdviceError("岗位要求已更新，请重新生成这条改写。");
      return;
    }
    const previousText = getTextAtSourceRef(resume.content, proposal.sourceRef);
    const nextContent = applyRewriteProposal(resume.content, proposal);
    if (!previousText || !nextContent) {
      setAdviceError("原文或事实边界已发生变化，请重新生成后再应用。");
      return;
    }
    changeSequence.current += 1;
    setResume((current) => current ? { ...current, content: nextContent } : current);
    setDirty(true);
    setSaveState("idle");
    setAdviceError("");
    setRewriteUndo({ sourceRef: proposal.sourceRef, previousText, appliedText: proposal.draftText.trim(), proposalId: proposal.id });
    setAppliedProposalIds((current) => [...current, proposal.id]);
    setKeptProposalIds((current) => current.filter((id) => id !== proposal.id));
    setActiveSection(proposal.sourceRef.section);
    setMobileView("edit");
  }

  function undoRewrite() {
    if (!rewriteUndo || !resume) return;
    const restored = replaceTextAtSourceRef(
      resume.content,
      rewriteUndo.sourceRef,
      rewriteUndo.appliedText,
      rewriteUndo.previousText,
    );
    if (!restored) {
      setRewriteUndo(null);
      setAdviceError("这条内容已被再次编辑，无法自动撤销；请直接在正文中修改。");
      return;
    }
    changeSequence.current += 1;
    setResume((current) => current ? { ...current, content: restored } : current);
    setDirty(true);
    setSaveState("idle");
    setAppliedProposalIds((current) => current.filter((id) => id !== rewriteUndo.proposalId));
    setRewriteUndo(null);
  }

  if (loading) {
    return (
      <main className={styles.statePage}>
        <Brand />
        <LoaderCircle className={styles.spin} size={28} />
        <h1>正在打开编辑器</h1>
        <p>加载内容、模板和最新修订…</p>
      </main>
    );
  }

  if (loadError || !resume) {
    return (
      <main className={styles.statePage}>
        <AlertCircle size={34} />
        <h1>暂时无法打开</h1>
        <p>{loadError || "这份简历不存在"}</p>
        <div>
          <button className="button button-primary" type="button" onClick={() => void loadResume()}><RefreshCw size={16} /> 重试</button>
          <Link className="button button-secondary" href="/dashboard">返回我的简历</Link>
        </div>
      </main>
    );
  }

  const usingModel = advice ? advice.provider !== "local-rules" : modelAvailable && allowExternalModel;
  const targetedAdvice = Boolean(adviceFocus);

  return (
    <main className={styles.builderPage}>
      <header className={styles.builderHeader}>
        <div className={styles.headerLeft}>
          <button ref={sidebarTriggerRef} className={styles.iconButton} type="button" onClick={() => setSidebarOpen(true)} aria-label="打开章节导航" aria-expanded={sidebarOpen} aria-controls="builder-sections"><Menu size={19} /></button>
          <Brand compact />
          <Link className={styles.backLink} href="/dashboard"><ArrowLeft size={16} /> 我的简历</Link>
        </div>
        <label className={styles.titleField}>
          <span className="sr-only">简历名称</span>
          <input value={resume.title} onChange={(event) => updateResume((current) => ({ ...current, title: event.target.value }))} />
        </label>
        <div className={styles.headerActions}>
          <div className={styles.saveStatus} aria-live="polite">
            {saveState === "saving" && <><LoaderCircle className={styles.spin} size={14} /> 保存中</>}
            {saveState === "saved" && <><CheckCircle2 size={14} /> 已保存</>}
            {saveState === "error" && <button type="button" title={saveMessage} onClick={() => void saveResume(saveConflict)}><AlertCircle size={14} /> {saveConflict ? "冲突，确认覆盖" : "保存失败，重试"}</button>}
            {saveState === "idle" && !dirty && <><Save size={14} /> 修订 {resume.revision}</>}
            {saveState === "idle" && dirty && <><span className={styles.dirtyDot} /> 待保存</>}
          </div>
          <label className={styles.templateSelect}>
            <LayoutTemplate size={16} />
            <span className="sr-only">选择模板</span>
            <select value={resume.templateId} onChange={(event) => updateResume((current) => ({ ...current, templateId: event.target.value }))}>
              {templates.map((item) => <option value={item.id} key={item.id}>{item.name}{item.familyLabel ? ` · ${item.familyLabel}` : ""}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <button className="button button-primary" type="button" onClick={() => setExportOpen(true)} aria-label="导出 PDF 或网页简历"><Download size={16} /> 导出</button>
          <div className={styles.builderAccount}><AccountMenu compact returnTo={`/builder/${resume.id}`} /></div>
        </div>
      </header>

      <div className={styles.mobileTabs} role="tablist" aria-label="编辑器视图">
        <button id="builder-tab-edit" type="button" role="tab" tabIndex={mobileView === "edit" ? 0 : -1} aria-selected={mobileView === "edit"} aria-controls="builder-edit" className={mobileView === "edit" ? styles.mobileTabActive : ""} onKeyDown={(event) => moveMobileTab(event, "edit")} onClick={() => setMobileView("edit")}><FileText size={16} /> 填写</button>
        <button id="builder-tab-preview" type="button" role="tab" tabIndex={mobileView === "preview" ? 0 : -1} aria-selected={mobileView === "preview"} aria-controls="builder-preview" className={mobileView === "preview" ? styles.mobileTabActive : ""} onKeyDown={(event) => moveMobileTab(event, "preview")} onClick={() => setMobileView("preview")}><Eye size={16} /> 预览</button>
        <button id="builder-tab-advice" type="button" role="tab" tabIndex={mobileView === "advice" ? 0 : -1} aria-selected={mobileView === "advice"} aria-controls="builder-advice" className={mobileView === "advice" ? styles.mobileTabActive : ""} onKeyDown={(event) => moveMobileTab(event, "advice")} onClick={() => setMobileView("advice")}><Sparkles size={16} /> 助手</button>
      </div>

      {sidebarOpen && <button className={styles.sidebarBackdrop} type="button" aria-label="关闭章节导航" onClick={() => setSidebarOpen(false)} />}
      <div className={styles.builderLayout}>
        <aside ref={sidebarRef} id="builder-sections" className={`${styles.sectionSidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sidebarHeader}>
            <span>简历结构</span>
            <button ref={sidebarCloseRef} type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭章节导航"><X size={17} /></button>
          </div>
          <div className={styles.targetBadge}>
            <Target size={17} />
            <div><span>当前目标</span><strong>{resume.targetName}{resume.targetBrief?.focusName ? ` · ${resume.targetBrief.focusName}` : ""}</strong></div>
          </div>
          {template && (
            <div className={styles.templateTrust}>
              <LayoutTemplate size={16} />
              <div><span>当前专业版式</span><strong>{template.familyLabel ?? template.name}</strong><p>{template.rationale ?? template.description}</p></div>
            </div>
          )}
          <div className={styles.mobileDocumentSettings}>
            <label><span>简历名称</span><input value={resume.title} onChange={(event) => updateResume((current) => ({ ...current, title: event.target.value }))} /></label>
            <label><span>模板</span><select value={resume.templateId} onChange={(event) => updateResume((current) => ({ ...current, templateId: event.target.value }))}>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}{item.familyLabel ? ` · ${item.familyLabel}` : ""}</option>)}</select></label>
          </div>
          <nav aria-label="简历章节">
            {sections.map((section, index) => {
              const Icon = section.icon;
              const completed = isSectionComplete(section.id, resume.content);
              return (
                <button
                  type="button"
                  key={section.id}
                  className={activeSection === section.id ? styles.activeSection : ""}
                  onClick={() => { selectSection(section.id); setSidebarOpen(false); }}
                >
                  <span className={styles.sectionIndex}>{completed ? <Check size={12} /> : index + 1}</span>
                  <Icon size={17} />
                  <span>{section.label}</span>
                </button>
              );
            })}
          </nav>
          <div className={styles.progressCard}>
            <div><span>内容完整度</span><strong>{resume.progress}%</strong></div>
            <i><span style={{ width: `${resume.progress}%` }} /></i>
            <p>{resume.progress >= 85 ? "已接近完成，建议运行一次目标检查。" : "继续补充证据，系统会自动更新进度。"}</p>
          </div>
        </aside>

        <section ref={editorPanelRef} id="builder-edit" role="tabpanel" aria-labelledby="builder-tab-edit" className={`${styles.editorPanel} ${mobileView !== "edit" ? styles.mobileHidden : ""}`}>
          <div className={styles.editorHeading}>
            <div>
              <span>{String(sections.findIndex((item) => item.id === activeSection) + 1).padStart(2, "0")}</span>
              <div><h1 ref={editorHeadingRef} tabIndex={-1}>{sections.find((item) => item.id === activeSection)?.label}</h1><p>{sectionDescription(activeSection, resume.track)}</p></div>
            </div>
            <button className="button button-ghost" type="button" onClick={() => void requestAdvice()} disabled={adviceLoading}>
              {adviceLoading ? <LoaderCircle className={styles.spin} size={16} /> : <WandSparkles size={16} />} 优化当前内容
            </button>
          </div>

          {rewriteUndo && (
            <div className={styles.undoBanner} role="status">
              <span>已精确替换所选原文，并进入自动保存。</span>
              <button type="button" onClick={undoRewrite}>撤销这次替换</button>
            </div>
          )}

          <div className={styles.formCanvas}>
            {activeSection === "basics" && <BasicsForm content={resume.content} update={updateContent} />}
            {activeSection === "summary" && <SummaryForm content={resume.content} update={updateContent} target={resume.targetName} />}
            {activeSection === "education" && <EducationForm content={resume.content} update={updateContent} />}
            {activeSection === "experience" && <ExperienceForm content={resume.content} update={updateContent} />}
            {activeSection === "projects" && <ProjectsForm content={resume.content} update={updateContent} />}
            {activeSection === "extras" && <ExtrasForm content={resume.content} update={updateContent} />}
          </div>
          {resume.track === "career" && (
            <JobEvidenceCard
              resume={resume}
              jobFit={jobFit}
              editButtonRef={briefTriggerRef}
              onEdit={() => setBriefOpen(true)}
              onOpenSection={(section) => {
                selectSection(section);
                setMobileView("edit");
                window.requestAnimationFrame(() => {
                  editorPanelRef.current?.scrollTo({ top: 0, behavior: "auto" });
                  editorHeadingRef.current?.focus({ preventScroll: true });
                });
              }}
              onRequestRewrite={(requirementId, sourceRef) => {
                selectSection(sourceRef.section);
                void requestAdvice({ requirementId, sourceRef });
              }}
            />
          )}
          {learningHint && (
            <details className={styles.learningHint} id="learning-hint">
              <summary><span><BookOpenCheck size={17} /> 可选补强建议</span><span>仅在发现相关证据缺口时显示</span></summary>
              <div>
                <p>{learningHint.reason}</p>
                <a href={learningHint.resource.officialUrl} target="_blank" rel="noreferrer">
                  <span><strong>{learningHint.resource.title}</strong><small>{learningHint.resource.provider}</small></span>
                  查看官方资源 <ExternalLink size={14} />
                </a>
                <small>{learningHint.resource.caveat} 这不是推广，也不代表目标机构要求。</small>
              </div>
            </details>
          )}
        </section>

        <section id="builder-preview" role="tabpanel" aria-labelledby="builder-tab-preview" className={`${styles.previewPanel} ${mobileView !== "preview" ? styles.mobileHidden : ""}`}>
          <div className={styles.previewToolbar}>
            <span><Eye size={15} /> 实时预览</span>
            <div><small>A4</small><span>超出自动续页</span></div>
          </div>
          <div className={styles.paperViewport}>
            <ResumePreview content={resume.content} template={template} scale="editor" className={styles.printResume} />
          </div>
        </section>

        <aside id="builder-advice" role="tabpanel" aria-labelledby="builder-tab-advice" className={`${styles.advicePanel} ${mobileView !== "advice" ? styles.mobileHidden : ""}`}>
          <div className={styles.adviceHeader}>
            <div><Sparkles size={17} /><span>{usingModel ? "AI 简历助手" : "简历助手"}</span></div>
            <span className={styles.offlineTag}>{usingModel ? "逐条确认" : "基础模式"}</span>
          </div>
          <div className={styles.modelMode}>
            {modelAvailable ? (
              <>
                <label><input type="checkbox" checked={allowExternalModel} onChange={(event) => { setAllowExternalModel(event.target.checked); setAdvice(null); }} /><span><Check size={12} /></span>使用 DeepSeek 大模型</label>
                <small>仅在你点击“优化”时发送当前章节、目标，以及你已填写的岗位描述；简历联系方式、地点、项目链接不发送，岗位文本中的常见邮箱、电话和微信号会先移除。当前只发送文字，不会发送截图或本地文件。</small>
              </>
            ) : (
              <p>当前环境尚未配置模型凭据，先使用基础分析；结果会明确标注，不冒充大模型。</p>
            )}
          </div>
          {!advice && !adviceLoading && (
            <div className={styles.adviceEmpty}>
              <span><Lightbulb size={23} /></span>
              <h2>把当前章节写得更好</h2>
              <p>助手会结合“{resume.targetName}{resume.targetBrief?.focusName ? ` · ${resume.targetBrief.focusName}` : ""}”与当前内容，指出缺失信息并给出可确认的表达建议。</p>
              <button className="button button-primary" type="button" onClick={() => void requestAdvice()}><WandSparkles size={16} /> 优化当前内容</button>
            </div>
          )}
          {adviceLoading && <div className={styles.adviceLoading} role="status" aria-live="polite"><LoaderCircle className={styles.spin} size={24} /><strong>正在分析当前内容</strong><span>只生成建议，不会修改你的简历。</span></div>}
          {advice && !adviceLoading && (
            <div className={styles.adviceContent}>
              <div className={styles.adviceResultHeader}>
                <span>{targetedAdvice ? "本次针对的岗位要求" : "当前内容检查"}</span>
                <h2 ref={adviceResultRef} tabIndex={-1}>{targetedAdvice ? advice.rewriteProposals.find((proposal) => proposal.requirement)?.requirement : advice.headline}</h2>
                <small>{advice.provider === "local-rules" ? (advice.modelFallback && advice.fallbackReason ? modelFallbackLabels[advice.fallbackReason] : "当前使用基础分析；不会冒充大模型结果") : "DeepSeek 生成建议；应用前仍需逐条确认"}</small>
              </div>
              {advice.rewriteProposals.length > 0 ? (
                <div className={styles.rewriteProposalList}>
                  {advice.rewriteProposals.map((proposal) => {
                    const applied = appliedProposalIds.includes(proposal.id);
                    const kept = keptProposalIds.includes(proposal.id);
                    const blocked = proposal.status !== "ready" || proposal.missingFacts.length > 0;
                    const reasonId = `rewrite-block-${proposal.id}`;
                    return (
                      <article className={styles.rewriteProposal} key={proposal.id}>
                        <div className={styles.rewriteProposalTop}>
                          <span><WandSparkles size={14} /> 逐条改写 · {proposal.generator === "model" ? "模型草稿" : "基础草稿"}</span>
                          <small className={blocked ? styles.proposalNeedsFacts : styles.proposalReady}>{blocked ? "需补事实" : applied ? "已应用" : kept ? "已保留" : "可确认"}</small>
                        </div>
                        {proposal.requirement && <p className={styles.proposalRequirement}><Target size={13} /> {proposal.requirement}</p>}
                        <div className={styles.rewriteComparison}>
                          <div><span>当前原文</span><p>{proposal.originalText}</p></div>
                          <div><span>改写草稿</span><p>{proposal.draftText}</p></div>
                        </div>
                        <div className={styles.proposalRationale}>
                          <strong>为什么这样改</strong>
                          <ul>{proposal.rationale.map((reason) => <li key={reason}>{reason}</li>)}</ul>
                        </div>
                        {proposal.evidence.length > 0 && (
                          <details className={styles.proposalEvidence}>
                            <summary>查看引用的简历证据（{proposal.evidence.length}）</summary>
                            <div>{proposal.evidence.map((evidence, index) => <q key={`${evidence.section}-${index}`}>{evidence.label}：{evidence.text}</q>)}</div>
                          </details>
                        )}
                        {proposal.missingFacts.length > 0 && (
                          <div className={styles.proposalMissing} id={reasonId}>
                            <strong><AlertTriangle size={13} /> 应用前还缺少</strong>
                            <ul>{proposal.missingFacts.map((fact) => <li key={fact}>{fact}</li>)}</ul>
                          </div>
                        )}
                        {blocked && proposal.missingFacts.length === 0 && <p className={styles.proposalBlockedNote} id={reasonId}>草稿包含待核实内容或未通过事实校验，不能直接写入简历。</p>}
                        <div className={styles.proposalActions}>
                          <button type="button" disabled={blocked || applied || kept} aria-describedby={blocked ? reasonId : undefined} onClick={() => applyProposal(proposal)}>{applied ? "已应用" : "确认并替换原文"}</button>
                          <button type="button" disabled={applied || kept} onClick={() => setKeptProposalIds((current) => [...current, proposal.id])}>{kept ? "已保留原文" : "保留原文"}</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className={styles.rewriteCard}>
                  <span><WandSparkles size={14} /> 写作框架</span>
                  <p>{advice.rewrite}</p>
                  <small>这只是写作参考，不会写入简历；先补充真实原文后才能生成可确认草稿。</small>
                </div>
              )}
              <details className={styles.adviceMore} open={!targetedAdvice}>
                <summary>其他检查建议（{advice.suggestions.length}）</summary>
                <div className={styles.suggestionList}>
                  {advice.suggestions.map((item) => (
                    <article key={item.id}>
                      <span className={`${styles.severity} ${styles[item.severity]}`}>{item.severity === "high" ? "优先" : item.severity === "medium" ? "建议" : "优化"}</span>
                      <h3>{item.title}</h3>
                      <p>{item.detail}</p>
                    </article>
                  ))}
                </div>
              </details>
              {!targetedAdvice && <div className={styles.keywordBlock}>
                <span>目标词汇</span>
                <div>{advice.keywords.map((keyword) => <small key={keyword}>{keyword}</small>)}</div>
              </div>}
              <p className={styles.factNote}><AlertCircle size={14} /> {advice.factPolicy}。请核实所有数字、成绩与经历事实。</p>
              <button className={styles.refreshAdvice} type="button" onClick={() => void requestAdvice(adviceFocus ?? undefined)}><RefreshCw size={14} /> 重新检查</button>
            </div>
          )}
          {adviceError && <p className={styles.adviceError} role="alert">{adviceError}</p>}
        </aside>
      </div>
      <div data-print-resume className={styles.printOnly} aria-hidden="true">
        <ResumePreview content={resume.content} template={template} scale="print" />
      </div>
      {exportOpen && <ExportDialog resume={resume} template={template} onClose={closeExport} />}
      {briefOpen && (
        <TargetBriefDialog
          resume={resume}
          onClose={closeBrief}
          returnFocusRef={briefTriggerRef}
          onSaved={(targetBrief) => {
            invalidateAdvice();
            setResume((current) => current ? { ...current, targetBrief } : current);
            setBriefOpen(false);
          }}
          onCleared={() => {
            invalidateAdvice();
            setResume((current) => {
              if (!current) return current;
              const { targetBrief: _targetBrief, ...withoutBrief } = current;
              void _targetBrief;
              return withoutBrief;
            });
            setBriefOpen(false);
          }}
        />
      )}
    </main>
  );
}

function JobEvidenceCard({
  resume,
  jobFit,
  editButtonRef,
  onEdit,
  onOpenSection,
  onRequestRewrite,
}: {
  resume: ResumeRecord;
  jobFit?: ReturnType<typeof analyzeJobFit>;
  editButtonRef: RefObject<HTMLButtonElement | null>;
  onEdit: () => void;
  onOpenSection: (section: SectionId) => void;
  onRequestRewrite: (requirementId: string, sourceRef: RewriteSourceRef) => void;
}) {
  const brief = resume.targetBrief;
  const capturedDate = brief?.capturedAt ? new Date(brief.capturedAt).toLocaleDateString("zh-CN") : "";
  return (
    <section className={styles.jobEvidence} aria-labelledby="job-evidence-title">
      <div className={styles.jobEvidenceHeader}>
        <div>
          <span><ClipboardList size={17} /></span>
          <div>
            <small>岗位证据地图</small>
            <h2 id="job-evidence-title">{resume.targetName}{brief?.focusName ? ` · ${brief.focusName}` : ""}</h2>
          </div>
        </div>
        <button ref={editButtonRef} type="button" onClick={onEdit}><Pencil size={14} /> {brief ? "编辑岗位依据" : "添加目标岗位"}</button>
      </div>

      {!brief && (
        <div className={styles.jobEvidenceEmpty}>
          <Target size={19} />
          <div><strong>先补充目标岗位</strong><p>岗位名称和 JD 会帮助确定写作重点，并辅助你选择更合适的版式。</p></div>
        </div>
      )}

      {brief && !brief.requirementsText && (
        <div className={styles.jobEvidenceEmpty}>
          <FileText size={19} />
          <div><strong>岗位已保存，下一步补充 JD</strong><p>粘贴单个岗位描述后，系统会优先提取最多 12 项要求并寻找你的真实证据；链接只做来源记录，不会自动访问。</p></div>
          <button type="button" onClick={onEdit}>补充岗位描述</button>
        </div>
      )}

      {brief && brief.requirementsText && jobFit && (
        <>
          <div className={styles.jobEvidenceMeta}>
            <span><ShieldCheck size={14} /> 文字证据：{jobFit.supportedCount} 项直接支持 · {jobFit.partialCount} 项有线索 · {jobFit.missingCount} 项待补</span>
            <span><ListChecks size={14} /> 已分析 {jobFit.totalRequirements} 项（最多 12 项）</span>
            <span><CalendarClock size={14} /> 用户记录于 {capturedDate}</span>
            {brief.sourceUrl ? (
              <a href={brief.sourceUrl} target="_blank" rel="noreferrer"><Link2 size={13} /> {targetBriefSourceLabels[brief.sourceType]}</a>
            ) : <span>{targetBriefSourceLabels[brief.sourceType]}</span>}
          </div>
          <div className={styles.jobRequirementList}>
            {jobFit.items.map((item) => (
              <details key={item.id}>
                <summary>
                  <span className={styles[`evidence_${item.status}`]}>{item.status === "supported" ? "有证据" : item.status === "partial" ? "有线索" : "待补充"}</span>
                  <strong>{item.requirement}</strong>
                  <ChevronDown size={14} />
                </summary>
                <div>
                  {item.evidence.length ? (
                    <div className={styles.evidenceQuotes}>
                      {item.evidence.map((evidence, index) => (
                        <div className={styles.evidenceQuote} key={`${evidence.section}-${index}`}>
                          <button
                            type="button"
                            onClick={() => onOpenSection(evidence.section === "skills" || evidence.section === "languages" || evidence.section === "awards" ? "extras" : evidence.section)}
                            aria-label={`查看原文：${evidence.text.slice(0, 48)}`}
                          >
                            <span>{evidence.label}</span>
                            <q>{evidence.text}</q>
                          </button>
                          {evidence.sourceRef && (
                            <button
                              className={styles.evidenceRewriteButton}
                              type="button"
                              onClick={() => onRequestRewrite(item.id, evidence.sourceRef!)}
                              aria-label={`针对岗位要求“${item.requirement.slice(0, 48)}”生成这条原文的改写`}
                            >
                              <WandSparkles size={13} /> 针对这条改写
                            </button>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className={styles.noEvidence}>当前简历没有找到可引用的原文证据。</p>}
                  <p className={styles.writingAction}><WandSparkles size={14} /> {item.action}</p>
                </div>
              </details>
            ))}
          </div>
          {jobFit.totalRequirements === 0 && <p className={styles.noEvidence}>没有从这段文字中识别出明确的职责或能力要求，请粘贴包含职责、任职资格或具体技能的岗位描述。</p>}
          <p className={styles.jobEvidenceCaveat}>这不是录用率或官方匹配分。系统最多优先提取 12 项要求；要求来自你保存的岗位材料，证据只引用你的简历原文，岗位变化请回到原页面核对。</p>
        </>
      )}
    </section>
  );
}

function TargetBriefDialog({
  resume,
  onClose,
  returnFocusRef,
  onSaved,
  onCleared,
}: {
  resume: ResumeRecord;
  onClose: () => void;
  returnFocusRef: RefObject<HTMLButtonElement | null>;
  onSaved: (brief: TargetBrief) => void;
  onCleared: () => void;
}) {
  const conflictMessage = "检测到另一页面的更新。当前输入仍保留；再次点击“确认覆盖”将以这份输入为准。";
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [focusName, setFocusName] = useState(resume.targetBrief?.focusName ?? "");
  const [requirementsText, setRequirementsText] = useState(resume.targetBrief?.requirementsText ?? "");
  const [sourceType, setSourceType] = useState<TargetBriefSource>(() => {
    const stored = resume.targetBrief?.sourceType ?? "manual";
    return stored === "boss" || stored === "zhaopin" ? "other-platform" : stored;
  });
  const [sourceUrl, setSourceUrl] = useState(resume.targetBrief?.sourceUrl ?? "");
  const [sourceDetailsOpen, setSourceDetailsOpen] = useState(Boolean(resume.targetBrief?.sourceUrl || (resume.targetBrief?.sourceType && resume.targetBrief.sourceType !== "manual")));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [expectedRevision, setExpectedRevision] = useState(resume.targetBrief?.revision ?? 0);
  const [conflict, setConflict] = useState(false);
  const savingRef = useRef(false);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const requirementPreview = useMemo(() => extractRequirements(requirementsText, 12), [requirementsText]);
  const requirementBytes = useMemo(() => new TextEncoder().encode(requirementsText.trim()).byteLength, [requirementsText]);
  const requirementsTooLarge = requirementBytes > 30_000;

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const fallbackFocus = returnFocusRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !savingRef.current) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [href]'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => {
        const focusTarget = fallbackFocus?.isConnected ? fallbackFocus : opener?.isConnected ? opener : null;
        focusTarget?.focus();
      }, 0);
    };
  }, [onClose, returnFocusRef]);

  async function saveBrief() {
    if (!focusName.trim()) return setError("请填写目标岗位");
    if (requirementsTooLarge) return setError("岗位文字超过 30 KB，请精简后再保存。建议只保留职责、任职要求和优先条件。");
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/resumes/${resume.id}/target-brief`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          expectedRevision,
          focusName,
          requirementsText,
          sourceType,
          sourceUrl,
        }),
      });
      const result = await response.json() as {
        targetBrief?: TargetBrief;
        error?: { message?: string; details?: { currentRevision?: number } };
      };
      if (response.status === 409 && typeof result.error?.details?.currentRevision === "number") {
        setExpectedRevision(result.error.details.currentRevision);
        setConflict(true);
        setError(conflictMessage);
        savingRef.current = false;
        setSaving(false);
        window.requestAnimationFrame(() => saveButtonRef.current?.focus());
        return;
      }
      if (!response.ok || !result.targetBrief) throw new Error(result.error?.message ?? "岗位依据保存失败");
      onSaved(result.targetBrief);
    } catch (reason) {
      setError((reason as Error).message);
      savingRef.current = false;
      setSaving(false);
    }
  }

  async function pasteRequirements() {
    if (!navigator.clipboard?.readText) {
      setError("当前浏览器不支持读取剪贴板，请使用 Ctrl/Command + V 粘贴岗位文字。");
      return;
    }
    try {
      const text = (await navigator.clipboard.readText()).trim();
      if (!text) {
        setError("剪贴板里没有可粘贴的文字。");
        return;
      }
      const encoder = new TextEncoder();
      let bytes = 0;
      let characters = 0;
      const accepted: string[] = [];
      for (const character of text) {
        const characterBytes = encoder.encode(character).byteLength;
        if (characters + character.length > 12_000 || bytes + characterBytes > 30_000) break;
        accepted.push(character);
        bytes += characterBytes;
        characters += character.length;
      }
      const clipped = accepted.join("");
      setRequirementsText(clipped);
      const wasClipped = text.length > characters;
      setError(wasClipped
        ? "岗位文字较长，已按 12000 字符与 30 KB 上限保留前段内容，请检查任职要求是否完整。"
        : conflict ? conflictMessage : "");
    } catch {
      setError("无法读取剪贴板，请直接在输入框中粘贴岗位文字。");
    }
  }

  async function clearBrief() {
    if (!resume.targetBrief || !window.confirm("清除后，岗位名称、JD 和来源记录都将从这份简历中删除。继续吗？")) return;
    savingRef.current = true;
    setSaving(true);
    setError("");
    try {
      const response = await fetch(`/api/resumes/${resume.id}/target-brief`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ expectedRevision }),
      });
      if (!response.ok) {
        const result = await response.json() as { error?: { message?: string; details?: { currentRevision?: number } } };
        if (response.status === 409 && typeof result.error?.details?.currentRevision === "number") {
          setExpectedRevision(result.error.details.currentRevision);
          setConflict(true);
          throw new Error("岗位资料已在另一页面更新。当前输入仍保留；再次保存会覆盖更新版，再次清除会删除更新版，请明确确认后继续。");
        }
        throw new Error(result.error?.message ?? "岗位依据清除失败");
      }
      onCleared();
    } catch (reason) {
      setError((reason as Error).message);
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <div className={styles.briefBackdrop} onMouseDown={(event) => { if (!savingRef.current && event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={styles.briefDialog} role="dialog" aria-modal="true" aria-labelledby="brief-dialog-title">
        <div className={styles.briefDialogHeader}>
          <div><span><ClipboardList size={18} /></span><div><small>{resume.targetName} · 以你确认的文字为准</small><h2 id="brief-dialog-title">添加目标岗位要求</h2></div></div>
          <button ref={closeRef} type="button" disabled={saving} onClick={onClose} aria-label="关闭岗位依据"><X size={20} /></button>
        </div>
        <div className={styles.briefDialogBody}>
          <ul className={styles.jdInputMethods} aria-label="岗位要求提供方式">
            <li className={styles.jdInputPrimary}>
              <FileText size={17} />
              <div><strong>粘贴文字</strong><small>推荐。内容最完整，分析前也最容易由你核对。</small></div>
              <span>当前方式</span>
            </li>
            <li>
              <ClipboardList size={17} />
              <div><strong>只有截图</strong><small>先用手机或电脑识别并复制文字，再粘贴；平台不上传原图。</small></div>
            </li>
            <li>
              <Link2 size={17} />
              <div><strong>只有链接</strong><small>链接可记录出处，但不会被自动打开或抓取，仍需粘贴文字。</small></div>
            </li>
          </ul>
          <label><span>目标岗位</span><input disabled={saving} value={focusName} onChange={(event) => setFocusName(event.target.value)} maxLength={160} placeholder="例如：后端开发工程师" /></label>
          <div className={styles.jdTextInput}>
            <div>
              <label htmlFor="job-requirements">粘贴岗位职责和任职要求</label>
              <span className={requirementsTooLarge ? styles.jdSizeExceeded : undefined}>{requirementsText.length} / 12000 字 · {(requirementBytes / 1_000).toFixed(1)} / 30 KB</span>
              <button type="button" disabled={saving} onClick={() => void pasteRequirements()}><ClipboardList size={14} /> 从剪贴板粘贴</button>
            </div>
            <textarea id="job-requirements" disabled={saving} value={requirementsText} onChange={(event) => setRequirementsText(event.target.value)} maxLength={12000} rows={12} placeholder="粘贴这一个岗位的完整 JD，例如：岗位职责、任职要求、优先条件。系统只分析你在这里确认过的文字。" />
            {requirementsTooLarge && <p className={styles.jdLimitError} role="alert">中文内容占用空间较多，当前已超过 30 KB。请精简重复介绍，保留岗位职责、任职要求和优先条件。</p>}
            <div className={styles.requirementPreview}>
              <span role="status">{requirementsText.trim() ? `已识别 ${requirementPreview.length} 项要求` : "等待粘贴岗位文字"}</span>
              {requirementPreview.length > 0 ? (
                <ol>{requirementPreview.slice(0, 3).map((item) => <li key={item}>{item}</li>)}</ol>
              ) : (
                <p>{requirementsText.trim() ? "暂未识别到明确要求，请尽量粘贴包含职责、经验或具体技能的完整文字。" : "保存前先查看系统理解到的内容，确认无误后再用于简历分析。"}</p>
              )}
              {requirementPreview.length > 3 && <small>另有 {requirementPreview.length - 3} 项，保存后在证据地图中展开。</small>}
            </div>
          </div>
          <details className={styles.briefSourceDetails} open={sourceDetailsOpen} onToggle={(event) => setSourceDetailsOpen(event.currentTarget.open)}>
            <summary><Link2 size={15} /> 补充来源记录（可选）</summary>
            <div className={styles.briefSourceGrid}>
              <label><span>你从哪里看到这份 JD？</span><select disabled={saving} value={sourceType} onChange={(event) => setSourceType(event.target.value as TargetBriefSource)}>
                <option value="manual">我自行整理或收到文字</option>
                <option value="employer-official">企业官方招聘页</option>
                <option value="other-platform">招聘平台、内推、邮件或其他渠道</option>
              </select></label>
              <label><span>原始链接（只记录，不读取）</span><input disabled={saving} value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} inputMode="url" placeholder="https://…" /></label>
            </div>
          </details>
          <div className={styles.briefPrivacy}><ShieldCheck size={17} /><p>简历分析只使用你在输入框中确认的文字。岗位文本不进入公共岗位库，也不会被本平台用于训练；链接只保存供你核对，服务端不会访问。</p></div>
          {error && <p className={styles.briefError} role="alert">{error}</p>}
        </div>
        <div className={styles.briefDialogFooter}>
          <span>{requirementsText.trim() ? "保存后将用这些要求生成证据地图；缺少证据时只会追问，不会编造。" : "可以先只保存岗位名称，之后再补充岗位文字。"}</span>
          <div>
            {resume.targetBrief && <button className={styles.clearBrief} type="button" disabled={saving} onClick={() => void clearBrief()}><Trash2 size={14} /> 清除岗位资料</button>}
            <button ref={saveButtonRef} className="button button-primary" type="button" disabled={saving || !focusName.trim() || requirementsTooLarge} onClick={() => void saveBrief()}>{saving ? <><LoaderCircle className={styles.spin} size={16} /> 保存中</> : <>{conflict ? "确认覆盖" : requirementsText.trim() ? "确认并生成证据地图" : "保存岗位"} <Sparkles size={16} /></>}</button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExportDialog({
  resume,
  template,
  onClose,
}: {
  resume: ResumeRecord;
  template?: ResumeTemplate;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [includeContact, setIncludeContact] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const webHtml = useMemo(() => toStandaloneHtml(resume, { includeContact, template }), [includeContact, resume, template]);

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), [href]'
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => { if (opener?.isConnected) opener.focus(); }, 0);
    };
  }, [onClose]);

  function printResume() {
    const previousTitle = document.title;
    document.title = safeFilename(resume.title);
    onClose();
    window.requestAnimationFrame(() => {
      window.print();
      window.setTimeout(() => { document.title = previousTitle; }, 800);
    });
  }

  return (
    <div className={styles.exportBackdrop} onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={styles.exportDialog} role="dialog" aria-modal="true" aria-labelledby="export-title">
        <div className={styles.exportHeader}>
          <div><span><Download size={18} /></span><div><small>当前简历</small><h2 id="export-title">导出与发布</h2></div></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="关闭导出"><X size={20} /></button>
        </div>
        <div className={styles.exportBody}>
          <section className={styles.pdfOutput}>
            <div><span><Printer size={22} /></span><div><small>PDF</small><h3>打印或存为 PDF</h3></div></div>
            <p>使用当前实时预览打开浏览器打印窗口。选择“存储为 PDF”即可保存，不会导出旧修订。</p>
            <button className="button button-primary" type="button" onClick={printResume}><Printer size={16} /> 打印 / 存为 PDF</button>
          </section>

          <section className={styles.webOutput}>
            <div className={styles.webOutputHeading}><div><span><Globe2 size={22} /></span><div><small>个人网页</small><h3>生成网页简历</h3></div></div><em>单文件 HTML</em></div>
            <div className={styles.webPreview}><iframe title="网页简历导出预览" srcDoc={webHtml} sandbox="" /></div>
            <div className={styles.exportPrivacy}>
              <p><AlertTriangle size={15} /> 网页可能被公开访问。默认隐藏邮箱、电话和所在地，正文中的敏感信息仍需你自行检查。</p>
              <label><input type="checkbox" checked={includeContact} onChange={(event) => setIncludeContact(event.target.checked)} /><span><Check size={12} /></span>包含邮箱、电话和所在地</label>
              <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><Check size={12} /></span>我已检查内容并理解网页可能公开</label>
            </div>
            <button className="button button-secondary" type="button" disabled={!acknowledged} onClick={() => downloadFile(webHtml, "text/html;charset=utf-8", "index.html")}><Globe2 size={16} /> 下载网页文件</button>
            <small className={styles.githubNote}>下载后可部署到 GitHub Pages 或其他静态托管服务；平台不会请求你的账号权限。</small>
          </section>
        </div>
        <div className={styles.moreFormats}>
          <div><strong>更多格式</strong><span>用于 ATS 检查或自行备份</span></div>
          <button type="button" onClick={() => downloadFile(toPlainText(resume), "text/plain;charset=utf-8", `${safeFilename(resume.title)}.txt`)}><FileText size={15} /> ATS 文本</button>
        </div>
      </div>
    </div>
  );
}

function downloadFile(content: string, type: string, filename: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function safeFilename(value: string) {
  return value.replace(/[\\/:*?"<>|]/g, "-").trim() || "简历";
}

function toPlainText(resume: ResumeRecord) {
  const { content } = resume;
  return [
    content.basics.name,
    content.basics.headline,
    [content.basics.email, content.basics.phone, content.basics.location, content.basics.website].filter(Boolean).join(" | "),
    "",
    "个人简介",
    content.summary,
    "",
    "教育经历",
    ...content.education.flatMap((item) => [`${item.school} | ${item.degree} · ${item.major} | ${item.startDate} - ${item.endDate}`, item.score, ...item.highlights.map((line) => `- ${line}`)]),
    "",
    "工作与实践",
    ...content.experience.flatMap((item) => [`${item.organization} | ${item.role} | ${item.startDate} - ${item.endDate}`, ...item.bullets.map((line) => `- ${line}`)]),
    "",
    "项目经历",
    ...content.projects.flatMap((item) => [`${item.name} | ${item.role} | ${item.date}`, ...item.bullets.map((line) => `- ${line}`)]),
    "",
    `技能：${content.skills.join("、")}`,
    `语言：${content.languages.join("、")}`,
    `奖项：${content.awards.join("、")}`,
  ].join("\n");
}

function Field({ label, children, wide = false, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return <label className={wide ? styles.fieldWide : ""}><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>;
}

function BasicsForm({ content, update }: FormProps) {
  const set = (key: keyof ResumeContent["basics"], value: string) => update((current) => ({ ...current, basics: { ...current.basics, [key]: value } }));
  return (
    <div className={styles.formGrid}>
      <Field label="姓名"><input value={content.basics.name} onChange={(event) => set("name", event.target.value)} placeholder="你的姓名" /></Field>
      <Field label="专业定位 / 目标职位"><input value={content.basics.headline} onChange={(event) => set("headline", event.target.value)} placeholder="例如：产品策略 · 数据增长" /></Field>
      <Field label="邮箱"><input type="email" value={content.basics.email} onChange={(event) => set("email", event.target.value)} placeholder="name@example.com" /></Field>
      <Field label="电话"><input value={content.basics.phone} onChange={(event) => set("phone", event.target.value)} placeholder="+86 138 0000 0000" /></Field>
      <Field label="所在城市"><input value={content.basics.location} onChange={(event) => set("location", event.target.value)} placeholder="上海，中国" /></Field>
      <Field label="个人主页"><input value={content.basics.website} onChange={(event) => set("website", event.target.value)} placeholder="LinkedIn / GitHub / Portfolio" /></Field>
      <div className={styles.inlineTip}><ListChecks size={17} /><div><strong>只保留必要的联系信息</strong><p>照片、年龄、政治面貌等敏感字段不会默认加入；仅在申请方明确要求时考虑。</p></div></div>
    </div>
  );
}

function SummaryForm({ content, update, target }: FormProps & { target: string }) {
  return (
    <div className={styles.stackForm}>
      <Field label="个人简介" hint={`${content.summary.length} / 2000 字`}>
        <textarea rows={9} value={content.summary} onChange={(event) => update((current) => ({ ...current, summary: event.target.value }))} placeholder="用 3–4 句话说明你的定位、关键能力与一项可信成果。" />
      </Field>
      <div className={styles.guidanceCard}><Target size={18} /><div><strong>面向 {target}</strong><p>推荐结构：你是谁 → 最相关能力 → 一条可验证成果 → 与目标的自然连接。避免“认真负责、学习能力强”等空泛形容。</p></div></div>
    </div>
  );
}

function EducationForm({ content, update }: FormProps) {
  const change = (id: string, key: keyof EducationItem, value: string | string[]) => update((current) => ({ ...current, education: current.education.map((item) => item.id === id ? { ...item, [key]: value } : item) }));
  return (
    <div className={styles.itemStack}>
      {content.education.map((item, index) => (
        <ItemCard key={item.id} title={`教育经历 ${index + 1}`} onDelete={() => confirmDelete(() => update((current) => ({ ...current, education: current.education.filter((entry) => entry.id !== item.id) })))}>
          <div className={styles.formGrid}>
            <Field label="学校"><input value={item.school} onChange={(event) => change(item.id, "school", event.target.value)} /></Field>
            <Field label="学位"><input value={item.degree} onChange={(event) => change(item.id, "degree", event.target.value)} /></Field>
            <Field label="专业"><input value={item.major} onChange={(event) => change(item.id, "major", event.target.value)} /></Field>
            <Field label="地点"><input value={item.location} onChange={(event) => change(item.id, "location", event.target.value)} /></Field>
            <Field label="开始时间"><input value={item.startDate} onChange={(event) => change(item.id, "startDate", event.target.value)} /></Field>
            <Field label="结束时间"><input value={item.endDate} onChange={(event) => change(item.id, "endDate", event.target.value)} /></Field>
            <Field label="成绩 / 排名" wide><input value={item.score} onChange={(event) => change(item.id, "score", event.target.value)} /></Field>
            <Field label="课程、奖学金与亮点（每行一条）" wide><textarea rows={4} value={item.highlights.join("\n")} onChange={(event) => change(item.id, "highlights", lines(event.target.value))} /></Field>
          </div>
        </ItemCard>
      ))}
      <button className={styles.addButton} type="button" onClick={() => update((current) => ({ ...current, education: [...current.education, blankEducation()] }))}><Plus size={17} /> 添加教育经历</button>
    </div>
  );
}

function ExperienceForm({ content, update }: FormProps) {
  const change = (id: string, key: keyof ExperienceItem, value: string | string[]) => update((current) => ({ ...current, experience: current.experience.map((item) => item.id === id ? { ...item, [key]: value } : item) }));
  return (
    <div className={styles.itemStack}>
      {content.experience.map((item, index) => (
        <ItemCard key={item.id} title={`工作与实践 ${index + 1}`} onDelete={() => confirmDelete(() => update((current) => ({ ...current, experience: current.experience.filter((entry) => entry.id !== item.id) })))}>
          <div className={styles.formGrid}>
            <Field label="组织 / 公司"><input value={item.organization} onChange={(event) => change(item.id, "organization", event.target.value)} /></Field>
            <Field label="角色 / 职位"><input value={item.role} onChange={(event) => change(item.id, "role", event.target.value)} /></Field>
            <Field label="开始时间"><input value={item.startDate} onChange={(event) => change(item.id, "startDate", event.target.value)} /></Field>
            <Field label="结束时间"><input value={item.endDate} onChange={(event) => change(item.id, "endDate", event.target.value)} /></Field>
            <Field label="地点" wide><input value={item.location} onChange={(event) => change(item.id, "location", event.target.value)} /></Field>
            <Field label="成果描述（每行一条）" wide hint="建议使用：动作 + 方法 + 结果；数字必须真实"><textarea rows={6} value={item.bullets.join("\n")} onChange={(event) => change(item.id, "bullets", lines(event.target.value))} /></Field>
          </div>
        </ItemCard>
      ))}
      <button className={styles.addButton} type="button" onClick={() => update((current) => ({ ...current, experience: [...current.experience, blankExperience()] }))}><Plus size={17} /> 添加工作或实践</button>
    </div>
  );
}

function ProjectsForm({ content, update }: FormProps) {
  const change = (id: string, key: keyof ProjectItem, value: string | string[]) => update((current) => ({ ...current, projects: current.projects.map((item) => item.id === id ? { ...item, [key]: value } : item) }));
  return (
    <div className={styles.itemStack}>
      {content.projects.map((item, index) => (
        <ItemCard key={item.id} title={`项目经历 ${index + 1}`} onDelete={() => confirmDelete(() => update((current) => ({ ...current, projects: current.projects.filter((entry) => entry.id !== item.id) })))}>
          <div className={styles.formGrid}>
            <Field label="项目名称"><input value={item.name} onChange={(event) => change(item.id, "name", event.target.value)} /></Field>
            <Field label="个人角色"><input value={item.role} onChange={(event) => change(item.id, "role", event.target.value)} /></Field>
            <Field label="时间"><input value={item.date} onChange={(event) => change(item.id, "date", event.target.value)} /></Field>
            <Field label="链接"><input value={item.link} onChange={(event) => change(item.id, "link", event.target.value)} /></Field>
            <Field label="项目成果（每行一条）" wide><textarea rows={6} value={item.bullets.join("\n")} onChange={(event) => change(item.id, "bullets", lines(event.target.value))} /></Field>
          </div>
        </ItemCard>
      ))}
      <button className={styles.addButton} type="button" onClick={() => update((current) => ({ ...current, projects: [...current.projects, blankProject()] }))}><Plus size={17} /> 添加项目经历</button>
    </div>
  );
}

function ExtrasForm({ content, update }: FormProps) {
  const blocks: Array<{ key: "skills" | "languages" | "awards"; label: string; icon: typeof Award; hint: string }> = [
    { key: "skills", label: "技能", icon: ListChecks, hint: "使用逗号、顿号或换行分隔" },
    { key: "languages", label: "语言能力", icon: Languages, hint: "例如：英语（IELTS 7.5）" },
    { key: "awards", label: "奖项与荣誉", icon: Award, hint: "优先保留与目标相关、可验证的荣誉" },
  ];
  return (
    <div className={styles.extraStack}>
      {blocks.map((block) => {
        const Icon = block.icon;
        return <section key={block.key}><div><Icon size={18} /><div><strong>{block.label}</strong><small>{block.hint}</small></div></div><textarea rows={5} value={content[block.key].join("\n")} onChange={(event) => update((current) => ({ ...current, [block.key]: splitList(event.target.value) }))} /></section>;
      })}
    </div>
  );
}

function ItemCard({ title, onDelete, children }: { title: string; onDelete: () => void; children: React.ReactNode }) {
  return <section className={styles.itemCard}><div className={styles.itemHeader}><h2>{title}</h2><button type="button" onClick={onDelete} aria-label={`删除${title}`}><Trash2 size={15} /> 删除</button></div>{children}</section>;
}

type FormProps = { content: ResumeContent; update: (updater: (content: ResumeContent) => ResumeContent) => void };

function lines(value: string) { return value.split("\n").map((item) => item.trim()).filter(Boolean); }
function splitList(value: string) { return value.split(/[\n,，、]/).map((item) => item.trim()).filter(Boolean); }
function confirmDelete(action: () => void) { if (window.confirm("确认删除这条内容吗？该操作会在下一次自动保存中生效。")) action(); }
function blankEducation(): EducationItem { return { id: `edu-${shortId()}`, school: "", degree: "", major: "", startDate: "", endDate: "", location: "", score: "", highlights: [] }; }
function blankExperience(): ExperienceItem { return { id: `exp-${shortId()}`, organization: "", role: "", startDate: "", endDate: "", location: "", bullets: [] }; }
function blankProject(): ProjectItem { return { id: `project-${shortId()}`, name: "", role: "", date: "", link: "", bullets: [] }; }

function isSectionComplete(id: SectionId, content: ResumeContent) {
  if (id === "basics") return Boolean(content.basics.name && content.basics.email);
  if (id === "summary") return content.summary.length >= 40;
  if (id === "education") return content.education.some((item) => item.school);
  if (id === "experience") return content.experience.some((item) => item.organization && item.bullets.length);
  if (id === "projects") return content.projects.some((item) => item.name);
  return content.skills.length >= 3;
}

function sectionDescription(id: SectionId, track: "study" | "career") {
  const descriptions: Record<SectionId, string> = {
    basics: "建立清晰、专业且克制的第一印象。",
    summary: `用 3–4 句话说明你与${track === "study" ? "目标项目" : "目标岗位"}的连接。`,
    education: track === "study" ? "突出课程、成绩与学术准备度。" : "保留与岗位最相关的教育证据。",
    experience: "写清行动、协作边界与可验证结果。",
    projects: "说明问题、方法、个人贡献和最终影响。",
    extras: "用高密度信息补充技能、语言与可信荣誉。",
  };
  return descriptions[id];
}
