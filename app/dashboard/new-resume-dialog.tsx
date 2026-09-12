"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BriefcaseBusiness,
  Check,
  GraduationCap,
  LayoutTemplate,
  LoaderCircle,
  Search,
  ShieldCheck,
  ArrowRight,
  FilePlus2,
  X,
} from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { TargetBrandMark } from "@/components/target-brand-mark";
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
  const purposeRef = useRef<HTMLButtonElement>(null);
  const targetSearchRef = useRef<HTMLInputElement>(null);
  const focusFieldRef = useRef<HTMLInputElement>(null);
  const selectedTargetRef = useRef<HTMLDivElement>(null);
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
  const [targetPickerOpen, setTargetPickerOpen] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !creatingRef.current) onClose();
      if (event.key !== "Tab" || !dialogRef.current) return;
      if (creatingRef.current) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), [href]'
      )).filter((element) => element.getClientRects().length > 0 && !element.closest('[aria-hidden="true"]'));
      if (!focusable.length) {
        event.preventDefault();
        dialogRef.current.focus({ preventScroll: true });
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (document.activeElement === dialogRef.current || !dialogRef.current.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      } else if (event.shiftKey && document.activeElement === first) {
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
  const hasTarget = Boolean(target || customTarget.trim());
  const needsFocus = track === "career" && !focusName.trim();
  const nextAction = !track ? "选择简历用途" : !hasTarget ? "选择目标" : needsFocus ? "填写岗位或方向" : "创建并开始填写";
  const nextHint = !track ? "先选择用途，随后选择目标。"
    : !hasTarget ? "请选择一个目标，也可以直接填写自己的目标。"
      : needsFocus ? "还需填写岗位或方向，例如「产品经理」。"
        : "已准备好。创建后进入编辑器，开始填写空白草稿。";

  function changeTrack(nextTrack: Track) {
    if (nextTrack === track) return;
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
    setTargetPickerOpen(true);
  }

  function advance() {
    if (!track) return purposeRef.current?.focus();
    if (!hasTarget) return targetSearchRef.current?.focus();
    if (needsFocus) {
      setTargetPickerOpen(false);
      return focusFieldRef.current?.focus();
    }
    void createResume();
  }

  async function createResume() {
    if (!track) return setError("请先选择这份简历的用途");
    if (!target && !customTarget.trim()) return setError(`请选择目标${track === "study" ? "院校或研究机构" : "企业或合作方"}，或填写自定义目标`);
    if (track === "career" && !focusName.trim()) return setError("请填写目标岗位或合作方向；进入编辑器后可以补充具体要求");
    const templateId = effectiveTemplateId;
    if (!templateId) return setError("暂时无法匹配版式，请稍后重试");

    creatingRef.current = true;
    dialogRef.current?.focus({ preventScroll: true });
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
      <div ref={dialogRef} className={styles.newResumeDialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="new-resume-title" aria-busy={creating}>
        <div className={styles.dialogHeader}>
          <div><span><FilePlus2 size={21} /></span><div><h2 id="new-resume-title">新建简历</h2><p>先确定用途和目标，版式可以随时更换。</p></div></div>
          <button ref={closeRef} type="button" disabled={creating} onClick={onClose} aria-label="关闭新建简历"><X size={20} /></button>
        </div>

        <div className={styles.dialogBody}>
          <section className={styles.createSection}>
            <div className={styles.createSectionTitle}><span>1</span><div><h3>选择用途</h3><p>决定材料的内容结构和推荐版式。</p></div></div>
            <div className={styles.purposeChoices}>
              <button ref={purposeRef} type="button" disabled={creating} aria-pressed={track === "study"} className={track === "study" ? styles.purposeActive : ""} onClick={() => changeTrack("study")}>
                <GraduationCap size={21} /><div><strong>学习与研究</strong><small>院校 · 研究项目 · 学位</small></div>{track === "study" && <Check size={17} />}
              </button>
              <button type="button" disabled={creating} aria-pressed={track === "career"} className={track === "career" ? styles.purposeActive : ""} onClick={() => changeTrack("career")}>
                <BriefcaseBusiness size={21} /><div><strong>职业与合作</strong><small>求职 · 转岗 · 项目合作</small></div>{track === "career" && <Check size={17} />}
              </button>
            </div>
          </section>

          {track && (
            <section className={styles.createSection}>
              <div className={styles.createSectionTitle}><span>2</span><div><h3>选择目标</h3><p>选择或填写{track === "study" ? "院校、机构或研究项目" : "企业、客户或合作项目"}。</p></div></div>
              {hasTarget && !targetPickerOpen ? (
                <div ref={selectedTargetRef} className={styles.selectedTarget} tabIndex={-1}><div><span>已选目标</span><strong>{target?.name ?? customTarget.trim()}</strong></div><button type="button" disabled={creating} onClick={() => { setTargetPickerOpen(true); requestAnimationFrame(() => targetSearchRef.current?.focus()); }}>更换目标</button></div>
              ) : <>
              <div className={styles.groupChips} role="group" aria-label={track === "study" ? "院校地区" : "企业类型"}>
                {groups.map((group) => <button type="button" disabled={creating} key={group.key} aria-pressed={!query && selectedGroup === group.key} className={!query && selectedGroup === group.key ? styles.groupActive : ""} onClick={() => { setSelectedGroup(group.key); setQuery(""); }}>{group.label}<small>{group.count}</small></button>)}
              </div>
              <label className={styles.targetSearch}><Search size={17} /><span className="sr-only">搜索目标</span><input ref={targetSearchRef} disabled={creating} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`搜索${track === "study" ? "院校或地区" : "企业或行业"}`} /></label>
              {loading ? <div className={styles.targetLoading}><LoaderCircle size={19} /> 正在加载目标…</div> : (
                <div className={styles.targetOptions}>
                  {visibleTargets.length === 0 && <p className={styles.noTargets}>没有找到匹配目标。可以在下方直接填写。</p>}
                  {visibleTargets.map((item) => <button type="button" disabled={creating} key={item.id} aria-pressed={selectedTarget === item.id} className={selectedTarget === item.id ? styles.targetActive : ""} onClick={() => {
                    setSelectedTarget(item.id);
                    setTargetPickerOpen(false);
                    requestAnimationFrame(() => (track === "career" ? focusFieldRef.current : selectedTargetRef.current)?.focus());
                    setCustomTarget("");
                    const nextId = recommendedTemplateIdsFor(item, focusName).find((id) => templates.some((template) => template.id === id));
                    setSelectedTemplate(nextId ?? templates[0]?.id ?? "");
                    setTemplateTouched(false);
                    setError("");
                  }}><TargetBrandMark className={styles.targetBrand} targetId={item.id} targetName={item.name} track={track} /><div><strong>{item.name}</strong><small>{item.region} · {item.category}</small></div>{selectedTarget === item.id && <Check size={15} />}</button>)}
                </div>
              )}
              {track === "career" && (
                <p className={styles.brandNotice}>
                  <ShieldCheck size={15} />
                  <span>企业名称及标识仅用于目标识别，不表示合作或背书。</span>
                </p>
              )}
              <label className={styles.customTarget}><span>自定义目标</span><input disabled={creating} value={customTarget} onChange={(event) => {
                setCustomTarget(event.target.value);
                setError("");
                if (event.target.value) {
                  setSelectedTarget("");
                  if (!templateTouched) {
                    const fallbackId = track === "career" ? "summit" : "atlas";
                    setSelectedTemplate(templates.some((template) => template.id === fallbackId) ? fallbackId : templates[0]?.id ?? "");
                  }
                }
              }} maxLength={240} placeholder={`输入自定义${track === "study" ? "院校、机构或项目" : "企业、客户或合作项目"}`} /></label>
              </>}
            </section>
          )}

          {track === "career" && (target || customTarget.trim()) && (
            <section className={styles.createSection}>
              <div className={styles.createSectionTitle}><span>3</span><div><h3>填写岗位或方向</h3><p>用于命名简历并推荐版式。具体要求可以稍后补充。</p></div></div>
              <label className={styles.focusField}>
                <span>岗位或方向（必填）</span>
                <input
                  ref={focusFieldRef}
                  required
                  value={focusName}
                  disabled={creating}
                  onChange={(event) => { setFocusName(event.target.value); setError(""); }}
                  placeholder="例如：产品经理、研发负责人、独立设计合作"
                  maxLength={160}
                />
              </label>
            </section>
          )}

          {track && (target || customTarget.trim()) && (
            <section className={styles.createSection}>
              <div className={styles.createSectionTitle}><span>{track === "career" ? "4" : "3"}</span><div><h3>确认版式</h3><p>已选好一套推荐版式，也可以自行更换。非目标单位官方模板。</p></div></div>
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
          <div id="create-next-hint" aria-live="polite">{error ? <p role="alert">{error}</p> : <span>{nextHint}</span>}</div>
          <button className="button button-primary" type="button" aria-describedby="create-next-hint" disabled={creating || loading || (Boolean(track) && hasTarget && !needsFocus && !effectiveTemplateId)} onClick={advance}>
            {creating ? <><LoaderCircle className={styles.spin} size={17} /> 正在创建…</> : <>{nextAction} <ArrowRight size={17} /></>}
          </button>
        </div>
      </div>
    </div>
  );
}
