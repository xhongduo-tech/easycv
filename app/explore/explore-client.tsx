"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpen,
  BriefcaseBusiness,
  Building2,
  Check,
  ChevronRight,
  GraduationCap,
  LoaderCircle,
  MapPin,
  Search,
  Sparkles,
  Target,
} from "lucide-react";
import { Brand } from "@/components/brand";
import { ResumePreview } from "@/components/resume-preview";
import { createBlankContent, createStarterContent } from "@/lib/sample-data";
import type { ResumeTemplate, TargetProfile, Track } from "@/types/resume";
import styles from "./explore.module.css";

type Props = { initialTrack: Track; initialTemplate?: string };
type ApiError = { error?: { message?: string } };

const studyOptions = {
  "申请层次": ["硕士", "博士", "本科转学"],
  "专业方向": ["计算机 / AI", "商科 / 金融", "工程", "人文社科", "艺术设计"],
};

const careerOptions = {
  "经验层级": ["应届生", "1–3 年", "3 年以上"],
  "岗位方向": ["产品", "研发", "数据", "运营 / 市场", "职能 / 管培"],
};

export function ExploreClient({ initialTrack, initialTemplate }: Props) {
  const router = useRouter();
  const [track, setTrack] = useState<Track>(initialTrack);
  const [targets, setTargets] = useState<TargetProfile[]>([]);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [selectedTarget, setSelectedTarget] = useState<string>("");
  const [selectedTemplate, setSelectedTemplate] = useState(initialTemplate ?? "");
  const [filters, setFilters] = useState<Record<string, string>>(
    initialTrack === "study"
      ? { 申请层次: "硕士", 专业方向: "计算机 / AI" }
      : { 经验层级: "应届生", 岗位方向: "产品" },
  );
  const [query, setQuery] = useState("");
  const [customTarget, setCustomTarget] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    // A track change starts a fresh catalog request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true);
    setError("");
    Promise.all([
      fetch(`/api/targets?track=${track}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("目标画像加载失败");
        return response.json() as Promise<{ targets: TargetProfile[] }>;
      }),
      fetch(`/api/templates?track=${track}`, { signal: controller.signal }).then((response) => {
        if (!response.ok) throw new Error("模板加载失败");
        return response.json() as Promise<{ templates: ResumeTemplate[] }>;
      }),
    ])
      .then(([targetResult, templateResult]) => {
        setTargets(targetResult.targets);
        setTemplates(templateResult.templates);
        setSelectedTarget((current) =>
          targetResult.targets.some((target) => target.id === current) ? current : "",
        );
        setSelectedTemplate((current) =>
          templateResult.templates.some((template) => template.id === current)
            ? current
            : templateResult.templates[0]?.id ?? "",
        );
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, [track]);

  const visibleTargets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return targets;
    return targets.filter((target) =>
      [target.name, target.category, target.region, target.description]
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [query, targets]);

  const target = targets.find((item) => item.id === selectedTarget);
  const template = templates.find((item) => item.id === selectedTemplate);
  const optionGroups = track === "study" ? studyOptions : careerOptions;

  function changeTrack(nextTrack: Track) {
    setTrack(nextTrack);
    setQuery("");
    setCustomTarget("");
    setSelectedTarget("");
    setFilters(
      nextTrack === "study"
        ? { 申请层次: "硕士", 专业方向: "计算机 / AI" }
        : { 经验层级: "应届生", 岗位方向: "产品" },
    );
  }

  async function createResume() {
    if (!selectedTarget && !customTarget.trim()) {
      setError(`请选择目标${track === "study" ? "院校" : "企业"}，或填写自定义目标`);
      return;
    }
    if (!selectedTemplate) {
      setError("请选择一套模板");
      return;
    }
    setCreating(true);
    setError("");
    try {
      const targetLabel = target?.name ?? customTarget.trim();
      const response = await fetch("/api/resumes", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          track,
          ...(selectedTarget ? { targetProfileId: selectedTarget } : { targetName: customTarget.trim() }),
          templateId: selectedTemplate,
          title: `${targetLabel} · ${Object.values(filters).join(" · ")} CV`,
          content: createBlankContent(),
        }),
      });
      const result = (await response.json()) as { resume?: { id: string } } & ApiError;
      if (!response.ok || !result.resume) throw new Error(result.error?.message ?? "创建失败，请稍后重试");
      router.push(`/builder/${result.resume.id}`);
    } catch (reason) {
      setError((reason as Error).message);
      setCreating(false);
    }
  }

  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Brand />
        <div className={styles.progress} aria-label="创建进度">
          <span className={styles.progressActive}>1 <small>确定目标</small></span>
          <i />
          <span>2 <small>编辑内容</small></span>
          <i />
          <span>3 <small>检查导出</small></span>
        </div>
        <button className="button button-ghost" type="button" onClick={() => router.back()}>
          <ArrowLeft size={16} /> 返回
        </button>
      </header>

      <div className={styles.layout}>
        <section className={styles.formArea}>
          <div className={styles.intro}>
            <p className="eyebrow">目标优先创建器</p>
            <h1>这份简历，准备投向哪里？</h1>
            <p>先把方向说清楚，我们再为内容结构与模板做匹配。</p>
          </div>

          <div className={styles.trackTabs} role="tablist" aria-label="选择简历赛道">
            <button
              type="button"
              role="tab"
              aria-selected={track === "study"}
              className={track === "study" ? styles.activeTab : ""}
              onClick={() => changeTrack("study")}
            >
              <span><GraduationCap size={21} /></span>
              <div><strong>留学申请</strong><small>大学 · 项目 · 学位</small></div>
              <ChevronRight size={18} />
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={track === "career"}
              className={track === "career" ? styles.activeTab : ""}
              onClick={() => changeTrack("career")}
            >
              <span><BriefcaseBusiness size={21} /></span>
              <div><strong>毕业求职</strong><small>企业 · 岗位 · 层级</small></div>
              <ChevronRight size={18} />
            </button>
          </div>

          <section className={styles.stepBlock}>
            <div className={styles.stepHeading}>
              <span>01</span>
              <div><h2>选择{track === "study" ? "院校" : "企业"}目标</h2><p>可搜索已有画像，也可以创建通用目标。</p></div>
            </div>
            <label className={styles.searchBox}>
              <Search size={18} />
              <span className="sr-only">搜索目标</span>
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={`搜索${track === "study" ? "大学、地区或项目类型" : "企业、行业或岗位类型"}`}
              />
            </label>

            {loading ? (
              <div className={styles.loading}><LoaderCircle className={styles.spin} size={22} /> 正在加载目标画像…</div>
            ) : (
              <div className={styles.targetGrid}>
                {visibleTargets.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={selectedTarget === item.id}
                    className={selectedTarget === item.id ? styles.selectedTarget : ""}
                    onClick={() => { setSelectedTarget(item.id); setCustomTarget(""); setError(""); }}
                  >
                    <span className={styles.targetLogo}>{track === "study" ? <BookOpen size={19} /> : <Building2 size={19} />}</span>
                    <div><strong>{item.name}</strong><small><MapPin size={12} /> {item.region} · {item.category}</small></div>
                    {selectedTarget === item.id && <span className={styles.check}><Check size={14} /></span>}
                  </button>
                ))}
                {visibleTargets.length === 0 && <p className={styles.noResults}>没有匹配结果，可在下方填写自定义目标。</p>}
              </div>
            )}

            <label className={styles.customTarget}>
              <span>没有找到？</span>
              <input
                value={customTarget}
                onChange={(event) => { setCustomTarget(event.target.value); if (event.target.value) setSelectedTarget(""); }}
                placeholder={`输入自定义${track === "study" ? "院校或项目" : "企业或岗位"}`}
              />
            </label>
          </section>

          <section className={styles.stepBlock}>
            <div className={styles.stepHeading}>
              <span>02</span>
              <div><h2>补充版本标签</h2><p>用于命名和管理目标版本；正文语言与事实仍由你填写。</p></div>
            </div>
            <div className={styles.optionGrid}>
              {Object.entries(optionGroups).map(([label, options]) => (
                <label key={label}>
                  <span>{label}</span>
                  <select
                    value={filters[label]}
                    onChange={(event) => setFilters((current) => ({ ...current, [label]: event.target.value }))}
                  >
                    {options.map((option) => <option key={option}>{option}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className={styles.stepBlock}>
            <div className={styles.stepHeading}>
              <span>03</span>
              <div><h2>选择推荐模板</h2><p>模板只改变表现层，后续随时可以切换。</p></div>
            </div>
            <div className={styles.templateGrid}>
              {templates.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  aria-pressed={selectedTemplate === item.id}
                  className={selectedTemplate === item.id ? styles.selectedTemplate : ""}
                  onClick={() => { setSelectedTemplate(item.id); setError(""); }}
                >
                  <div className={styles.miniPaper} style={{ borderTopColor: item.accent }}>
                    <i style={{ background: item.accent }} />
                    <span /><span /><span /><span />
                  </div>
                  <div><strong>{item.name}</strong><small>{item.tags.slice(0, 2).join(" · ")}</small></div>
                  {selectedTemplate === item.id && <span className={styles.check}><Check size={14} /></span>}
                </button>
              ))}
            </div>
          </section>
        </section>

        <aside className={styles.summaryPanel}>
          <div className={styles.summarySticky}>
            <div className={styles.summaryTop}>
              <span><Target size={15} /> 创建摘要</span>
              <small>STEP 1 / 3</small>
            </div>
            <div className={styles.previewWrap}>
              <span className={styles.sampleLabel}>模板示例 · 不会写入你的简历</span>
              <ResumePreview content={createStarterContent(track)} template={template} scale="card" />
            </div>
            <div className={styles.summaryRows}>
              <div><span>赛道</span><strong>{track === "study" ? "留学申请" : "毕业求职"}</strong></div>
              <div><span>目标</span><strong>{target?.name || customTarget || "待选择"}</strong></div>
              <div><span>模板</span><strong>{template?.name || "待选择"}</strong></div>
              <div><span>版本标签</span><strong>{Object.values(filters).join(" · ")}</strong></div>
            </div>
            {target && (
              <div className={styles.targetInsight}>
                <span><Sparkles size={14} /> 目标画像摘要</span>
                <p>{target.description}</p>
                <div>{target.keywords.slice(0, 3).map((keyword) => <small key={keyword}>{keyword}</small>)}</div>
              </div>
            )}
            <p className={styles.disclaimer}><BadgeCheck size={14} /> 画像是编辑建议，不代表官方背书。当前为访客空间，请勿填写证件号等非必要敏感信息；清除浏览器数据后可能无法找回草稿。</p>
            {error && <p className={styles.error} role="alert">{error}</p>}
            <button className="button button-primary" type="button" onClick={createResume} disabled={creating || loading || (!selectedTarget && !customTarget.trim()) || !selectedTemplate}>
              {creating ? <><LoaderCircle className={styles.spin} size={17} /> 正在创建…</> : <>进入编辑器 <ArrowRight size={17} /></>}
            </button>
            <button className="button button-ghost" type="button" onClick={() => router.push("/dashboard")}>先去我的工作台</button>
          </div>
        </aside>
      </div>
    </main>
  );
}
