"use client";

import { useEffect, useState } from "react";
import {
  ArrowRight,
  BriefcaseBusiness,
  Check,
  CircleCheck,
  Download,
  FileSearch,
  FileText,
  Globe2,
  Pause,
  Play,
  ShieldCheck,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import styles from "../../app/home.module.css";

const storySteps = [
  { number: "01", shortLabel: "读懂目标", title: "先找到这次机会看重什么" },
  { number: "02", shortLabel: "说清经历", title: "有事实依据，表达才更有说服力" },
  { number: "03", shortLabel: "完成交付", title: "确认每一处修改，再带着材料出发" },
] as const;

function TargetPanel() {
  return (
    <div className={styles.targetVisual}>
      <div className={styles.roleCard}>
        <div className={styles.roleIcon}><BriefcaseBusiness size={20} /></div>
        <div><span>目标岗位</span><strong>AI 产品经理</strong></div>
        <em>匹配中</em>
      </div>

      <div className={styles.requirementCard}>
        <div className={styles.miniHeading}>
          <span><FileSearch size={15} /> 岗位要求</span>
          <small>已提炼 5 项</small>
        </div>
        <div className={styles.requirementList}>
          <div><span>01</span><p>从 0 到 1 推进 AI 产品落地</p><CircleCheck size={16} /></div>
          <div><span>02</span><p>建立指标并持续验证效果</p><CircleCheck size={16} /></div>
          <div><span>03</span><p>跨产品、设计与研发协作</p><CircleCheck size={16} /></div>
        </div>
      </div>

      <div className={styles.matchResult}>
        <div className={styles.matchScore}>4<small>/ 5</small></div>
        <div><strong>经历证据已匹配</strong><p>知道该写什么，也知道还缺什么。</p></div>
      </div>
    </div>
  );
}

function RewritePanel() {
  return (
    <div className={styles.rewriteVisual}>
      <div className={styles.beforeCard}>
        <div className={styles.miniHeading}><span>原始经历</span><small>你的真实材料</small></div>
        <p>收集了 120+ 条用户反馈，和产品、研发改了 3 轮新手引导，关键步骤完成率提升 21%。</p>
      </div>

      <div className={styles.rewriteConnector} aria-hidden="true">
        <span><WandSparkles size={16} /></span><i /><small>依据已提供的事实，重新组织表达</small>
      </div>

      <div className={styles.afterCard}>
        <div className={styles.miniHeading}>
          <span><Sparkles size={15} /> 优化后</span><small>待你确认</small>
        </div>
        <p>
          收集并整理 <mark>120+ 条用户反馈</mark>，协同产品与研发完成 3 轮新手引导迭代，关键步骤完成率提升 <mark>21%</mark>。
        </p>
        <div className={styles.evidenceTags}>
          <span><Check size={13} /> 问题</span>
          <span><Check size={13} /> 行动</span>
          <span><Check size={13} /> 结果</span>
        </div>
      </div>

      <div className={styles.safetyNote}>
        <ShieldCheck size={17} />
        <span><strong>来源可追溯</strong> 数字与成果来自原始材料，仍需本人核对。</span>
      </div>
    </div>
  );
}

function DeliveryPanel() {
  return (
    <div className={styles.deliveryVisual}>
      <div className={styles.resumeMockup} aria-hidden="true">
        <div className={styles.mockupHeader}><div><span /><span /></div><i /></div>
        <div className={styles.mockupSection}><strong>个人简介</strong><span /><span /><span /></div>
        <div className={styles.mockupSection}><strong>项目经历</strong><span /><span /><span /><span /></div>
        <div className={styles.mockupSection}><strong>教育经历</strong><span /><span /></div>
      </div>

      <div className={styles.deliveryOptions}>
        <div className={styles.deliveryTitle}>
          <span><Target size={16} /> 专业版式</span><small>实时预览</small>
        </div>
        <div className={styles.outputOption}>
          <span><FileText size={18} /></span>
          <div><strong>PDF 简历</strong><small>清晰排版 · 随时投递</small></div>
          <CircleCheck size={17} />
        </div>
        <div className={styles.outputOption}>
          <span><Globe2 size={18} /></span>
          <div><strong>个人网页</strong><small>独立链接 · 灵活展示</small></div>
          <CircleCheck size={17} />
        </div>
        <div className={styles.readyBadge}><Download size={15} /> 已准备好投递</div>
      </div>
    </div>
  );
}

const panels = [
  <TargetPanel key="target" />,
  <RewritePanel key="rewrite" />,
  <DeliveryPanel key="delivery" />,
];

export function HomepageStory() {
  const [activeStep, setActiveStep] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [isHovering, setIsHovering] = useState(false);
  const [isFocusWithin, setIsFocusWithin] = useState(false);

  useEffect(() => {
    if (
      isPaused ||
      isHovering ||
      isFocusWithin ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    ) return;

    const timer = window.setInterval(() => {
      setActiveStep((current) => (current + 1) % storySteps.length);
    }, 7000);

    return () => window.clearInterval(timer);
  }, [activeStep, isFocusWithin, isHovering, isPaused]);

  const selectStep = (index: number) => {
    setActiveStep(index);
    setIsPaused(true);
  };

  const goToNextStep = () => {
    setActiveStep((current) => (current + 1) % storySteps.length);
    setIsPaused(true);
  };

  return (
    <aside
      className={styles.story}
      aria-label="简迹 CV 三步工作流程演示"
      onMouseEnter={() => setIsHovering(true)}
      onMouseLeave={() => setIsHovering(false)}
      onFocusCapture={() => setIsFocusWithin(true)}
      onBlurCapture={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setIsFocusWithin(false);
      }}
    >
      <div className={styles.storyGlow} aria-hidden="true" />

      <div className={styles.storyHeader}>
        <div><span className={styles.liveDot} aria-hidden="true" /><span>从目标到材料 · 示例</span></div>
        <span>示例数据</span>
      </div>

      <div className={styles.storyTabs} role="group" aria-label="能力演示步骤">
        {storySteps.map((step, index) => (
          <button
            key={step.number}
            className={index === activeStep ? styles.storyTabActive : undefined}
            type="button"
            aria-pressed={index === activeStep}
            aria-label={`${step.number} ${step.shortLabel}：${step.title}`}
            onClick={() => selectStep(index)}
          >
            <span>{step.number}</span><strong>{step.shortLabel}</strong>
          </button>
        ))}
      </div>

      <div className={styles.storyFrame}>
        {storySteps.map((step, index) => (
          <section
            key={step.number}
            id={`story-panel-${index}`}
            className={`${styles.storyPanel} ${index === activeStep ? styles.storyPanelActive : ""}`}
            aria-hidden={index !== activeStep}
          >
            <div className={styles.panelHeading}>
              <span>{step.number}</span>
              <div><small>{step.shortLabel}</small><h2>{step.title}</h2></div>
            </div>
            {panels[index]}
          </section>
        ))}
      </div>

      <div className={styles.storyFooter}>
        <div className={styles.storyProgress} aria-hidden="true">
          {storySteps.map((step, index) => (
            <span key={step.number} className={index === activeStep ? styles.storyProgressActive : undefined} />
          ))}
        </div>
        <p>真实材料 <ArrowRight size={13} /> AI 辅助 <ArrowRight size={13} /> 可投递版本</p>
        <div className={styles.storyControls}>
          <button
            type="button"
            onClick={() => setIsPaused((current) => !current)}
            aria-label={isPaused ? "继续自动演示" : "暂停自动演示"}
          >
            {isPaused ? <Play size={14} /> : <Pause size={14} />}
            <span>{isPaused ? "继续" : "暂停"}</span>
          </button>
          <button type="button" onClick={goToNextStep} aria-label="查看下一步">
            下一步 <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </aside>
  );
}
