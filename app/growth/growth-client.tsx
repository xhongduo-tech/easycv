"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  CheckCircle2,
  GraduationCap,
  LoaderCircle,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { growthAreaLabels, growthResources, type GrowthArea, type GrowthResource } from "@/lib/growth-data";
import type { ResumeRecord, Track } from "@/types/resume";
import styles from "./growth.module.css";

type RecommendationResponse = {
  targetName: string;
  track: Track;
  recommendations: Array<GrowthResource & { reason: string }>;
  rationale: string[];
  policy: string;
};

export function GrowthClient() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [track, setTrack] = useState<"all" | Track>("all");
  const [area, setArea] = useState<"all" | GrowthArea>("all");
  const [recommendation, setRecommendation] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [recommendationLoading, setRecommendationLoading] = useState(false);
  const [error, setError] = useState("");
  const recommendationSequence = useRef(0);

  async function loadRecommendation(nextResumeId: string) {
    if (!nextResumeId) {
      setRecommendation(null);
      return;
    }
    const sequence = ++recommendationSequence.current;
    setRecommendationLoading(true);
    setError("");
    try {
      const response = await fetch("/api/growth-recommendations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ resumeId: nextResumeId }),
      });
      const result = await response.json() as RecommendationResponse & { error?: { message?: string } };
      if (!response.ok) throw new Error(result.error?.message ?? "成长建议加载失败");
      if (sequence === recommendationSequence.current) setRecommendation(result);
    } catch (reason) {
      if (sequence === recommendationSequence.current) setError((reason as Error).message);
    } finally {
      if (sequence === recommendationSequence.current) setRecommendationLoading(false);
    }
  }

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/resumes", { signal: controller.signal })
      .then(async (response) => {
        const result = await response.json() as { resumes?: ResumeRecord[]; error?: { message?: string } };
        if (!response.ok) throw new Error(result.error?.message ?? "简历加载失败");
        const items = result.resumes ?? [];
        setResumes(items);
        setResumeId(items[0]?.id ?? "");
        if (items[0]) void loadRecommendation(items[0].id);
      })
      .catch((reason: unknown) => {
        if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const filteredResources = useMemo(() => growthResources.filter((resource) =>
    (track === "all" || resource.tracks.includes(track)) && (area === "all" || resource.area === area),
  ), [area, track]);

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div>
            <p className="eyebrow">简历之外的证据路线</p>
            <h1>看见能力缺口，再决定学什么。</h1>
            <p>根据目标名称、版本标签和当前草稿中可识别的证据，给出最多三项待确认方向。课程来自提供方官方页面，建议不会自动写进简历。</p>
            <div className={styles.heroStats}>
              <span><strong>{growthResources.length}</strong> 项核验资源</span>
              <span><strong>6</strong> 类能力方向</span>
              <span><strong>≤3</strong> 项优先建议</span>
            </div>
          </div>
          <aside className={styles.promiseCard}>
            <ShieldCheck size={28} />
            <strong>先证据，后证书</strong>
            <p>完成课程后，优先补充可核验项目、作品或实践结果。证书只是一种学习佐证。</p>
          </aside>
        </div>
      </section>

      <section className={styles.planSection}>
        <div className="shell">
          <div className={styles.planHeader}>
            <div><p className="eyebrow">个人路线</p><h2>从一份目标简历开始分析</h2></div>
            {loading ? <span className={styles.loading}><LoaderCircle size={16} /> 正在读取草稿</span> : resumes.length ? (
              <label><span>选择目标版本</span><select value={resumeId} onChange={(event) => { setResumeId(event.target.value); void loadRecommendation(event.target.value); }}>{resumes.map((resume) => <option key={resume.id} value={resume.id}>{resume.title}</option>)}</select></label>
            ) : <Link className="button button-primary" href="/explore"><GraduationCap size={17} /> 先创建一份简历</Link>}
          </div>

          {error && <p className={styles.error} role="alert">{error}</p>}
          {recommendationLoading ? (
            <div className={styles.planLoading}><LoaderCircle size={24} /> 正在对照目标与已有证据…</div>
          ) : recommendation ? (
            <div className={styles.recommendationPanel}>
              <div className={styles.targetSummary}><Target size={19} /><div><small>当前目标</small><strong>{recommendation.targetName}</strong></div><span>{recommendation.track === "study" ? "留学申请" : "毕业求职"}</span></div>
              {recommendation.recommendations.length ? <div className={styles.priorityGrid}>
                {recommendation.recommendations.map((resource, index) => (
                  <article key={resource.id}>
                    <span>0{index + 1}</span>
                    <small>{growthAreaLabels[resource.area]}</small>
                    <h3>{resource.title}</h3>
                    <p className={styles.reason}>{resource.reason}</p>
                    <p>{resource.outcome}</p>
                    <a href={resource.officialUrl} target="_blank" rel="noreferrer">查看官方页面 <ArrowUpRight size={15} /></a>
                  </article>
                ))}
              </div> : <div className={styles.noMatch}>当前版本中的方向信息还不够明确。可先补充标题、专业/岗位标签或技能，再重新分析；下方资源库仍可自主浏览。</div>}
              <p className={styles.policy}><BadgeCheck size={15} /> {recommendation.policy}</p>
            </div>
          ) : (
            <div className={styles.noResume}><Route size={26} /><strong>还没有可分析的目标版本</strong><p>创建简历后，这里会按目标和已有技能给出优先路线。</p></div>
          )}
        </div>
      </section>

      <section className={styles.librarySection}>
        <div className="shell">
          <div className={styles.libraryHeader}>
            <div><p className="eyebrow">官方学习资源库</p><h2>按能力方向继续探索</h2></div>
            <div className={styles.filters}>
              <select aria-label="筛选赛道" value={track} onChange={(event) => setTrack(event.target.value as "all" | Track)}><option value="all">全部赛道</option><option value="study">留学申请</option><option value="career">毕业求职</option></select>
              <select aria-label="筛选能力方向" value={area} onChange={(event) => setArea(event.target.value as "all" | GrowthArea)}><option value="all">全部方向</option>{Object.entries(growthAreaLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
            </div>
          </div>
          <div className={styles.resourceGrid}>
            {filteredResources.map((resource) => (
              <article key={resource.id}>
                <div className={styles.resourceTop}><span>{resource.area === "data" ? <BrainCircuit size={17} /> : resource.area === "engineering" ? <Sparkles size={17} /> : <BookOpenCheck size={17} />}{growthAreaLabels[resource.area]}</span><small>复核于 {resource.reviewedAt}</small></div>
                <h3>{resource.title}</h3>
                <p className={styles.provider}>{resource.provider}</p>
                <p>{resource.audience}</p>
                <div>{resource.skillTags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                <p className={styles.caveat}><CheckCircle2 size={14} /> {resource.caveat}</p>
                <a href={resource.officialUrl} target="_blank" rel="noreferrer">打开官方课程页 <ArrowRight size={15} /></a>
              </article>
            ))}
          </div>
          <p className={styles.disclaimer}>简迹 CV 与所列平台、院校及雇主不存在赞助、合作、录取或招聘背书关系。课程内容、费用、语言、证书与考试政策以官方页面为准；完成课程或取得证书不保证学分转换、录取、面试、录用、晋升或薪资结果。</p>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
