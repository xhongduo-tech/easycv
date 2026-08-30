"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle,
  ArrowLeft,
  Award,
  BookOpenCheck,
  BriefcaseBusiness,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleUserRound,
  Download,
  Eye,
  FileText,
  FolderKanban,
  Globe2,
  GraduationCap,
  Languages,
  LayoutTemplate,
  Lightbulb,
  ListChecks,
  LoaderCircle,
  Menu,
  Plus,
  Printer,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trash2,
  WandSparkles,
  X,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ResumePreview } from "@/components/resume-preview";
import { shortId } from "@/lib/utils";
import type {
  AdvisorResult,
  EducationItem,
  ExperienceItem,
  ProjectItem,
  ResumeContent,
  ResumeRecord,
  ResumeTemplate,
} from "@/types/resume";
import styles from "./builder.module.css";

type SectionId = "basics" | "summary" | "education" | "experience" | "projects" | "extras";
type SaveState = "idle" | "saving" | "saved" | "error";
type AdviceResponse = AdvisorResult & { provider: string; factPolicy: string };

const sections: Array<{ id: SectionId; label: string; icon: typeof CircleUserRound }> = [
  { id: "basics", label: "个人信息", icon: CircleUserRound },
  { id: "summary", label: "个人简介", icon: FileText },
  { id: "education", label: "教育经历", icon: GraduationCap },
  { id: "experience", label: "工作与实践", icon: BriefcaseBusiness },
  { id: "projects", label: "项目经历", icon: FolderKanban },
  { id: "extras", label: "技能与其他", icon: Award },
];

export function BuilderClient({ resumeId }: { resumeId: string }) {
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
  const [adviceSection, setAdviceSection] = useState<SectionId | null>(null);
  const [undoContent, setUndoContent] = useState<ResumeContent | null>(null);
  const [mobileView, setMobileView] = useState<"edit" | "preview" | "advice">("edit");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const changeSequence = useRef(0);
  const saving = useRef(false);
  const resumeRef = useRef<ResumeRecord | null>(null);
  const dirtyRef = useRef(false);

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
      const templateResponse = await fetch(`/api/templates?${templateQuery}`);
      const templateResult = (await templateResponse.json()) as {
        templates?: ResumeTemplate[];
        error?: { message?: string };
      };
      if (!templateResponse.ok) {
        throw new Error(templateResult.error?.message ?? "模板加载失败");
      }
      setResume(resumeResult.resume);
      setTemplates(templateResult.templates ?? []);
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

  const updateResume = useCallback((updater: (current: ResumeRecord) => ResumeRecord) => {
    changeSequence.current += 1;
    setResume((current) => (current ? updater(current) : current));
    setDirty(true);
    setSaveState("idle");
  }, []);

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

  async function requestAdvice() {
    if (!resume) return;
    setAdviceLoading(true);
    setAdviceError("");
    try {
      const sectionMap: Record<SectionId, string> = {
        basics: "overview",
        summary: "summary",
        education: "education",
        experience: "experience",
        projects: "projects",
        extras: "overview",
      };
      const response = await fetch("/api/recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          resumeId: resume.id,
          content: resume.content,
          track: resume.track,
          targetProfileId: resume.targetProfileId,
          targetName: resume.targetName,
          section: sectionMap[activeSection],
        }),
      });
      const result = (await response.json()) as AdviceResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "建议生成失败");
      setAdvice(result);
      setAdviceSection(activeSection);
      setMobileView("advice");
    } catch (reason) {
      setAdviceError((reason as Error).message);
    } finally {
      setAdviceLoading(false);
    }
  }

  function applyRewrite() {
    if (!advice || !resume || adviceSection !== "experience") return;
    if (resume.content.experience.length > 0) {
      setUndoContent(resume.content);
      updateContent((content) => ({
        ...content,
        experience: content.experience.map((item, index) =>
          index === 0 ? { ...item, bullets: [...item.bullets, advice.rewrite] } : item,
        ),
      }));
      setActiveSection("experience");
      setMobileView("edit");
    } else {
      setAdviceError("请先添加一段工作或实践经历，再接受改写示例。");
    }
  }

  function undoRewrite() {
    if (!undoContent) return;
    const previous = undoContent;
    setUndoContent(null);
    updateContent(() => previous);
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
          <Link className="button button-secondary" href="/dashboard">返回工作台</Link>
        </div>
      </main>
    );
  }

  return (
    <main className={styles.builderPage}>
      <header className={styles.builderHeader}>
        <div className={styles.headerLeft}>
          <button className={styles.iconButton} type="button" onClick={() => setSidebarOpen(true)} aria-label="打开章节导航"><Menu size={19} /></button>
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
              {templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
            </select>
            <ChevronDown size={13} />
          </label>
          <button className="button button-secondary" type="button" onClick={() => window.print()}><Printer size={16} /> <span>导出 PDF</span></button>
        </div>
      </header>

      <div className={styles.mobileTabs} role="tablist" aria-label="编辑器视图">
        <button type="button" role="tab" aria-selected={mobileView === "edit"} aria-controls="builder-edit" className={mobileView === "edit" ? styles.mobileTabActive : ""} onClick={() => setMobileView("edit")}><FileText size={16} /> 填写</button>
        <button type="button" role="tab" aria-selected={mobileView === "preview"} aria-controls="builder-preview" className={mobileView === "preview" ? styles.mobileTabActive : ""} onClick={() => setMobileView("preview")}><Eye size={16} /> 预览</button>
        <button type="button" role="tab" aria-selected={mobileView === "advice"} aria-controls="builder-advice" className={mobileView === "advice" ? styles.mobileTabActive : ""} onClick={() => setMobileView("advice")}><Sparkles size={16} /> 建议</button>
      </div>

      <div className={styles.builderLayout}>
        <aside className={`${styles.sectionSidebar} ${sidebarOpen ? styles.sidebarOpen : ""}`}>
          <div className={styles.sidebarHeader}>
            <span>简历结构</span>
            <button type="button" onClick={() => setSidebarOpen(false)} aria-label="关闭章节导航"><X size={17} /></button>
          </div>
          <div className={styles.targetBadge}>
            <Target size={17} />
            <div><span>当前目标</span><strong>{resume.targetName}</strong></div>
          </div>
          <div className={styles.mobileDocumentSettings}>
            <label><span>简历名称</span><input value={resume.title} onChange={(event) => updateResume((current) => ({ ...current, title: event.target.value }))} /></label>
            <label><span>模板</span><select value={resume.templateId} onChange={(event) => updateResume((current) => ({ ...current, templateId: event.target.value }))}>{templates.map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}</select></label>
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
                  onClick={() => { setActiveSection(section.id); setSidebarOpen(false); }}
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
          <a className={styles.textExport} href={`/api/resumes/${resume.id}/export?format=txt`} download><Download size={15} /> 导出 ATS 文本</a>
          <div className={styles.nextActions}>
            <Link href="/web-resume"><Globe2 size={15} /> 网页简历</Link>
            <Link href="/growth"><BookOpenCheck size={15} /> 成长路线</Link>
          </div>
        </aside>

        <section id="builder-edit" role="tabpanel" className={`${styles.editorPanel} ${mobileView !== "edit" ? styles.mobileHidden : ""}`}>
          <div className={styles.editorHeading}>
            <div>
              <span>{String(sections.findIndex((item) => item.id === activeSection) + 1).padStart(2, "0")}</span>
              <div><h1>{sections.find((item) => item.id === activeSection)?.label}</h1><p>{sectionDescription(activeSection, resume.track)}</p></div>
            </div>
            <button className="button button-ghost" type="button" onClick={() => void requestAdvice()} disabled={adviceLoading}>
              {adviceLoading ? <LoaderCircle className={styles.spin} size={16} /> : <WandSparkles size={16} />} 智能检查
            </button>
          </div>

          <div className={styles.formCanvas}>
            {activeSection === "basics" && <BasicsForm content={resume.content} update={updateContent} />}
            {activeSection === "summary" && <SummaryForm content={resume.content} update={updateContent} target={resume.targetName} />}
            {activeSection === "education" && <EducationForm content={resume.content} update={updateContent} />}
            {activeSection === "experience" && <ExperienceForm content={resume.content} update={updateContent} />}
            {activeSection === "projects" && <ProjectsForm content={resume.content} update={updateContent} />}
            {activeSection === "extras" && <ExtrasForm content={resume.content} update={updateContent} />}
          </div>
        </section>

        <section id="builder-preview" role="tabpanel" className={`${styles.previewPanel} ${mobileView !== "preview" ? styles.mobileHidden : ""}`}>
          <div className={styles.previewToolbar}>
            <span><Eye size={15} /> 实时预览</span>
            <div><small>A4</small><span>100%</span></div>
          </div>
          <div className={styles.paperViewport}>
            <ResumePreview content={resume.content} template={template} scale="editor" className={styles.printResume} />
            <div data-print-resume className={styles.printOnly}>
              <ResumePreview content={resume.content} template={template} scale="print" />
            </div>
          </div>
        </section>

        <aside id="builder-advice" role="tabpanel" className={`${styles.advicePanel} ${mobileView !== "advice" ? styles.mobileHidden : ""}`}>
          <div className={styles.adviceHeader}>
            <div><Sparkles size={17} /><span>目标建议</span></div>
            <span className={styles.offlineTag}>规则建议</span>
          </div>
          {!advice && !adviceLoading && (
            <div className={styles.adviceEmpty}>
              <span><Lightbulb size={23} /></span>
              <h2>让建议跟随目标</h2>
              <p>系统会结合“{resume.targetName}”的画像，检查证据强度、量化结果与关键词连接。</p>
              <button className="button button-primary" type="button" onClick={() => void requestAdvice()}><WandSparkles size={16} /> 检查当前章节</button>
            </div>
          )}
          {adviceLoading && <div className={styles.adviceLoading}><LoaderCircle className={styles.spin} size={24} /><strong>正在分析当前内容</strong><span>只生成建议，不会修改你的简历。</span></div>}
          {advice && !adviceLoading && (
            <div className={styles.adviceContent}>
              <div className={styles.scoreCard}>
                <div className={styles.scoreRing} style={{ "--score": `${advice.score * 3.6}deg` } as React.CSSProperties}><strong>{advice.score}</strong><span>/ 100</span></div>
                <div><span>规则检查完成度</span><strong>{advice.headline}</strong><small>检查方式：确定性本地规则</small></div>
              </div>
              <div className={styles.suggestionList}>
                {advice.suggestions.map((item) => (
                  <article key={item.id}>
                    <span className={`${styles.severity} ${styles[item.severity]}`}>{item.severity === "high" ? "优先" : item.severity === "medium" ? "建议" : "优化"}</span>
                    <h3>{item.title}</h3>
                    <p>{item.detail}</p>
                  </article>
                ))}
              </div>
              <div className={styles.rewriteCard}>
                <span><WandSparkles size={14} /> 改写草稿</span>
                <p>{advice.rewrite}</p>
                <div>
                  {adviceSection === "experience" && <button type="button" onClick={applyRewrite}>添加为待核实草稿</button>}
                  {undoContent && <button type="button" onClick={undoRewrite}>撤销上次添加</button>}
                  <button type="button" onClick={() => setAdvice(null)}>保留原文</button>
                </div>
                {adviceSection !== "experience" && <small>当前章节仅提供写作参考，不会写入工作经历。</small>}
              </div>
              <div className={styles.keywordBlock}>
                <span>目标词汇</span>
                <div>{advice.keywords.map((keyword) => <small key={keyword}>{keyword}</small>)}</div>
              </div>
              <p className={styles.factNote}><AlertCircle size={14} /> {advice.factPolicy}。请核实所有数字、成绩与经历事实。</p>
              <button className={styles.refreshAdvice} type="button" onClick={() => void requestAdvice()}><RefreshCw size={14} /> 重新检查</button>
            </div>
          )}
          {adviceError && <p className={styles.adviceError} role="alert">{adviceError}</p>}
        </aside>
      </div>
    </main>
  );
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
