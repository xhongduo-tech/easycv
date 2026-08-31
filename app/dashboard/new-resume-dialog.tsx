"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Building2,
  Check,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Search,
  Sparkles,
  X,
} from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { createBlankContent, createStarterContent } from "@/lib/sample-data";
import { recommendedCareerTemplateIdsForRole, recommendedTemplateIdsFor } from "@/lib/target-catalog";
import type { ResumeTemplate, TargetProfile, Track } from "@/types/resume";
import styles from "./dashboard.module.css";

type TargetGroup = { key: string; label: string; description: string; count: number };

export function NewResumeDialog({
  initialTrack,
  onClose,
}: {
  initialTrack?: Track;
  onClose: () => void;
}) {
  const router = useRouter();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const creatingRef = useRef(false);
  const [track, setTrack] = useState<Track | "">(initialTrack ?? "");
  const [targets, setTargets] = useState<TargetProfile[]>([]);
  const [groups, setGroups] = useState<TargetGroup[]>([]);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [selectedGroup, setSelectedGroup] = useState("");
  const [selectedTarget, setSelectedTarget] = useState("");
  const [customTarget, setCustomTarget] = useState("");
  const [focusName, setFocusName] = useState("");
  const [selectedTemplate, setSelectedTemplate] = useState("");
  const [templateTouched, setTemplateTouched] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingRef.current) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
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
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      window.setTimeout(() => { if (opener?.isConnected) opener.focus(); }, 0);
    };
  }, [onClose]);

  useEffect(() => {
    if (!track) return;
    const controller = new AbortController();
    // The catalog request starts after the user chooses a purpose.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/targets?track=${track}`, { signal: controller.signal }).then(async (response) => {
        const result = await response.json() as { targets?: TargetProfile[]; groups?: TargetGroup[]; error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message ?? "目标加载失败");
        return result;
      }),
      fetch(`/api/templates?track=${track}`, { signal: controller.signal }).then(async (response) => {
        const result = await response.json() as { templates?: ResumeTemplate[]; error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message ?? "版式加载失败");
        return result;
      }),
    ]).then(([targetResult, templateResult]) => {
      const nextGroups = targetResult.groups ?? [];
      setTargets(targetResult.targets ?? []);
      setGroups(nextGroups);
      setTemplates(templateResult.templates ?? []);
      setSelectedGroup(nextGroups[0]?.key ?? "");
    }).catch((reason: unknown) => {
      if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [track]);

  const visibleTargets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (normalized) {
      return targets.filter((target) => [target.id, target.name, target.region, target.category]
        .join(" ").toLowerCase().includes(normalized));
    }
    return targets.filter((target) => (track === "study" ? target.region : target.category) === selectedGroup);
  }, [query, selectedGroup, targets, track]);

  const target = targets.find((item) => item.id === selectedTarget);
  const previewContent = useMemo(() => createStarterContent(track || "career"), [track]);
  const recommendedTemplates = useMemo(() => {
    const contextualIds = target
      ? recommendedTemplateIdsFor(target, focusName)
      : track === "career"
        ? recommendedCareerTemplateIdsForRole(focusName)
        : [];
    const ids = contextualIds.length
      ? contextualIds
      : track === "career"
        ? ["summit", "forge", "pillar"]
        : ["atlas", "meridian", "northstar"];
    const ordered = ids
      .map((id) => templates.find((template) => template.id === id))
      .filter((template): template is ResumeTemplate => Boolean(template));
    for (const template of templates) {
      if (ordered.length >= 3) break;
      if (!ordered.some((item) => item.id === template.id)) ordered.push(template);
    }
    if (templateTouched && selectedTemplate && !ordered.some((item) => item.id === selectedTemplate)) {
      const manuallySelected = templates.find((item) => item.id === selectedTemplate);
      if (manuallySelected) ordered.splice(Math.min(2, ordered.length), 1, manuallySelected);
    }
    return ordered.slice(0, 3);
  }, [focusName, selectedTemplate, target, templateTouched, templates, track]);
  const effectiveTemplateId = templateTouched && templates.some((item) => item.id === selectedTemplate)
    ? selectedTemplate
    : recommendedTemplates[0]?.id ?? templates[0]?.id ?? "";

  function changeTrack(nextTrack: Track) {
    setTrack(nextTrack);
    setTargets([]);
    setGroups([]);
    setTemplates([]);
    setSelectedGroup("");
    setSelectedTarget("");
    setCustomTarget("");
    setFocusName("");
    setSelectedTemplate("");
    setTemplateTouched(false);
    setQuery("");
    setError("");
  }

  async function createResume() {
    if (!track) return setError("请先选择这份简历的用途");
    if (!target && !customTarget.trim()) return setError(`请选择目标${track === "study" ? "院校" : "企业"}，或填写自定义目标`);
    if (track === "career" && !focusName.trim()) return setError("请填写目标岗位；进入编辑器后可以继续补充岗位描述");
    const templateId = effectiveTemplateId;
    if (!templateId) return setError("暂时无法匹配版式，请稍后重试");

    creatingRef.current = true;
    setCreating(true);
    setError("");
    try {
      const targetName = target?.name ?? customTarget.trim();
      const generatedTitle = `${targetName} · ${track === "study" ? "申请 CV" : focusName.trim()}`;
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          track,
          ...(target ? { targetProfileId: target.id } : { targetName }),
          templateId,
          title: generatedTitle.slice(0, 160),
          content: createBlankContent(),
          ...(focusName.trim() ? { targetBrief: { focusName: focusName.trim() } } : {}),
        }),
      });
      const result = await response.json() as { resume?: { id: string }; error?: { message?: string } };
      if (!response.ok || !result.resume) throw new Error(result.error?.message ?? "创建失败，请稍后重试");
      router.push(`/builder/${result.resume.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      creatingRef.current = false;
      setCreating(false);
    }
  }

  return (
    <div className={styles.dialogBackdrop} onMouseDown={(event) => { if (!creatingRef.current && event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={styles.newResumeDialog} role="dialog" aria-modal="true" aria-labelledby="new-resume-title" aria-busy={creating}>
        <div className={styles.dialogHeader}>
          <div><span><Sparkles size={17} /></span><div><small>新建简历</small><h2 id="new-resume-title">先告诉我们你的目标</h2></div></div>
          <button ref={closeRef} type="button" disabled={creating} onClick={onClose} aria-label="关闭新建简历"><X size={20} /></button>
        </div>

        <div className={styles.dialogBody}>
          <section className={styles.createSection}>
            <div className={styles.createSectionTitle}><span>1</span><div><h3>这份简历用于什么？</h3><p>后续建议会围绕这个用途展开。</p></div></div>
            <div className={styles.purposeChoices}>
              <button type="button" disabled={creating} aria-pressed={track === "study"} className={track === "study" ? styles.purposeActive : ""} onClick={() => changeTrack("study")}>
                <GraduationCap size={21} /><div><strong>留学申请</strong><small>院校 · 项目 · 学位</small></div>{track === "study" && <Check size={17} />}
              </button>
              <button type="button" disabled={creating} aria-pressed={track === "career"} className={track === "career" ? styles.purposeActive : ""} onClick={() => changeTrack("career")}>
                <BriefcaseBusiness size={21} /><div><strong>毕业求职</strong><small>企业 · 岗位 · 层级</small></div>{track === "career" && <Check size={17} />}
              </button>
            </div>
          </section>

          {track && (
            <section className={styles.createSection}>
              <div className={styles.createSectionTitle}><span>2</span><div><h3>目标是什么？</h3><p>选择具体{track === "study" ? "院校" : "企业"}后自动匹配版式；也可以直接搜索或自定义。</p></div></div>
              <div className={styles.groupChips} role="group" aria-label={track === "study" ? "院校地区" : "企业类型"}>
                {groups.map((group) => <button type="button" disabled={creating} key={group.key} aria-pressed={!query && selectedGroup === group.key} className={!query && selectedGroup === group.key ? styles.groupActive : ""} onClick={() => { setSelectedGroup(group.key); setQuery(""); setSelectedTarget(""); setCustomTarget(""); }}>{group.label}<small>{group.count}</small></button>)}
              </div>
              <label className={styles.targetSearch}><Search size={17} /><span className="sr-only">搜索目标</span><input disabled={creating} value={query} onChange={(event) => { setQuery(event.target.value); setSelectedTarget(""); }} placeholder={`搜索${track === "study" ? "院校或地区" : "企业或行业"}`} /></label>
              {loading ? <div className={styles.targetLoading}><LoaderCircle size={19} /> 正在加载目标…</div> : (
                <div className={styles.targetOptions}>
                  {visibleTargets.map((item) => <button type="button" disabled={creating} key={item.id} aria-pressed={selectedTarget === item.id} className={selectedTarget === item.id ? styles.targetActive : ""} onClick={() => {
                    setSelectedTarget(item.id);
                    setCustomTarget("");
                    const nextId = recommendedTemplateIdsFor(item, focusName).find((id) => templates.some((template) => template.id === id));
                    setSelectedTemplate(nextId ?? templates[0]?.id ?? "");
                    setTemplateTouched(false);
                    setError("");
                  }}><span>{track === "study" ? <GraduationCap size={16} /> : <Building2 size={16} />}</span><div><strong>{item.name}</strong><small>{item.region} · {item.category}</small></div>{selectedTarget === item.id && <Check size={15} />}</button>)}
                </div>
              )}
              <label className={styles.customTarget}><span>没有找到？</span><input disabled={creating} value={customTarget} onChange={(event) => {
                setCustomTarget(event.target.value);
                if (event.target.value) {
                  setSelectedTarget("");
                  if (!templateTouched) {
                    const fallbackId = track === "career" ? "summit" : "atlas";
                    setSelectedTemplate(templates.some((template) => template.id === fallbackId) ? fallbackId : templates[0]?.id ?? "");
                  }
                }
              }} maxLength={240} placeholder={`输入自定义${track === "study" ? "院校或项目" : "企业"}`} /></label>
            </section>
          )}

          {track === "career" && (target || customTarget.trim()) && (
            <section className={styles.createSection}>
              <div className={styles.createSectionTitle}><span>3</span><div><h3>目标岗位是什么？</h3><p>岗位名称会帮助我们推荐版式并确定写作重点；JD 可进入编辑器后补充。</p></div></div>
              <label className={styles.focusField}>
                <span>岗位名称</span>
                <input
                  value={focusName}
                  disabled={creating}
                  onChange={(event) => setFocusName(event.target.value)}
                  placeholder="例如：产品经理、后端开发工程师、投行分析师"
                  maxLength={160}
                />
              </label>
            </section>
          )}

          {track && (target || customTarget.trim()) && (
            <section className={styles.createSection}>
              <div className={styles.createSectionTitle}><span>{track === "career" ? "4" : "3"}</span><div><h3>选择专业版式</h3><p>这是基于阅读场景和岗位的推荐，不是目标单位官方模板。</p></div></div>
              <div className={styles.templateRecommendations}>
                {recommendedTemplates.map((item, index) => (
                  <article
                    key={item.id}
                    className={effectiveTemplateId === item.id ? styles.templateRecommendationActive : ""}
                  >
                    <span className={styles.templateMini} aria-hidden="true"><ResumePreview content={previewContent} template={item} scale="card" /></span>
                    <span className={styles.templateCopy}>
                      <small>{index === 0 ? "首选" : item.familyLabel ?? "备选"}</small>
                      <strong>{item.name}</strong>
                      <em>{item.rationale ?? item.description}</em>
                      <i>{(item.principles ?? item.tags).slice(0, 2).map((principle) => <b key={principle}>{principle}</b>)}</i>
                      <button
                        className={styles.templateChoose}
                        type="button"
                        disabled={creating}
                        aria-pressed={effectiveTemplateId === item.id}
                        aria-label={`${effectiveTemplateId === item.id ? "已选择" : "选择"}${item.name}，${item.familyLabel ?? item.description}`}
                        onClick={() => { setSelectedTemplate(item.id); setTemplateTouched(true); }}
                      >
                        {effectiveTemplateId === item.id ? <><Check size={14} /> 已选择</> : "选择此版式"}
                      </button>
                    </span>
                  </article>
                ))}
              </div>
              <p className={styles.previewNotice}><LayoutTemplate size={14} /> 缩略图使用示例内容，仅用于比较排版；创建后仍是空白草稿。</p>
            </section>
          )}

        </div>

        <div className={styles.dialogFooter}>
          <div>{error ? <p role="alert">{error}</p> : <span>创建空白草稿；示例内容不会写入你的简历。</span>}</div>
          <button className="button button-primary" type="button" disabled={creating || loading || !track || (!target && !customTarget.trim()) || (track === "career" && !focusName.trim())} onClick={() => void createResume()}>
            {creating ? <><LoaderCircle size={17} /> 正在创建…</> : <>创建并开始填写 <Sparkles size={17} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
