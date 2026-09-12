"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight } from "lucide-react";
import styles from "./homepage-opportunities.module.css";

const opportunities = [
  {
    label: "求职与转岗",
    track: "career",
    nextStep: "可以先准备一个目标岗位和一段相关经历，创建后再慢慢补充。",
    description: "让相关经历，先被看见。",
    document: "产品经理 · 求职简历",
    direction: "面向用户研究与产品体验方向",
    focus: "挑选与岗位相关的项目，写清你负责的部分，以及能够核实的成果。",
    sections: [
      { title: "个人简介", text: "从客户支持走向产品工作，关注用户反馈背后的共性问题。擅长把一线观察整理为清晰的需求，并推动跨团队协作。" },
      { title: "相关项目 · 新用户引导优化", text: "整理客服记录与用户访谈，归纳首次使用时的主要障碍；与设计、研发共同梳理引导流程，参与方案验证与上线后的反馈收集。" },
    ],
  },
  {
    label: "学习与研究",
    track: "study",
    nextStep: "可以先想好申请方向，再挑一段最能说明兴趣的学习或研究经历。",
    description: "把兴趣，连接到做过的探索。",
    document: "人机交互 · 申请 CV",
    direction: "面向学习申请与研究机会",
    focus: "围绕申请方向，呈现研究问题、采用的方法和你在项目中的贡献。",
    sections: [
      { title: "研究兴趣", text: "关注数字产品的可用性与新用户学习过程，希望进一步探索界面信息如何影响理解与决策。" },
      { title: "研究实践 · 新用户体验观察", text: "围绕首次使用产品的体验开展访谈，整理用户对操作流程的描述；使用主题归纳方法梳理共性问题，并在项目报告中记录方法与局限。" },
    ],
  },
  {
    label: "自由职业与合作",
    track: "career",
    nextStep: "从一个做过的项目开始，写清你能提供的服务和交付内容。",
    description: "让合作方知道，你能带来什么。",
    document: "用户研究 · 合作介绍",
    direction: "面向项目委托与合作沟通",
    focus: "说明你的服务方向、相关项目经验和交付范围，让对方更容易判断合作是否合适。",
    sections: [
      { title: "合作方向", text: "为早期产品团队整理用户反馈、开展体验访谈，将零散观察转化为可讨论的产品改进方向。" },
      { title: "项目经验 · 从反馈到改进建议", text: "参与新用户引导优化，负责访谈记录、问题归纳与研究报告整理。交付内容包括访谈摘要、主要问题清单与后续验证建议。" },
    ],
  },
  {
    label: "整理长期经历",
    track: null,
    nextStep: "还没有具体目标也没关系，先记下一件最近完成的事。",
    description: "先记下来，再为下一次机会取舍。",
    document: "阶段经历 · 个人底稿",
    direction: "记录工作、项目与学习的积累",
    focus: "趁细节还清楚，记下背景、行动和结果。准备新版本时，再挑选与目标相关的内容。",
    sections: [
      { title: "这一阶段，做过什么", text: "参与新用户引导优化：从一线反馈发现问题，协助访谈，整理需求，并跟进上线后的反馈。" },
      { title: "留给下一次的细节", text: "我负责哪些环节？当时为什么选择这个方案？有哪些报告或记录能帮助回忆？把这些内容补进经历，比只留下项目名称更有用。" },
    ],
  },
] as const;

export function HomepageOpportunities() {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const exampleHeadingRef = useRef<HTMLHeadingElement>(null);
  const selected = opportunities[selectedIndex];
  const createHref = `/dashboard?new=1${selected.track ? `&track=${selected.track}` : ""}`;

  function showExample() {
    const heading = exampleHeadingRef.current;
    if (!heading) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    heading.focus({ preventScroll: true });
    heading.scrollIntoView({ behavior: reducedMotion ? "instant" : "smooth", block: "start" });
  }

  return (
    <section className={styles.section} id="opportunities" aria-labelledby="opportunities-title" data-reveal>
      <div className="shell">
        <div className={styles.heading}>
          <div>
            <p className={styles.kicker}>为不同的下一程</p>
            <h2 id="opportunities-title">机会不同，<br />你的经历都有用。</h2>
          </div>
          <p className={styles.intro}>不用先给自己贴上标签。<br />从这次想做的事出发，找到适合的表达。</p>
        </div>

        <ol className={styles.guideTrail} aria-label="从用途开始的准备步骤">
          <li><span aria-hidden="true">01</span> 选用途</li>
          <li><span aria-hidden="true">02</span> 看示例</li>
          <li><span aria-hidden="true">03</span> 准备自己的材料</li>
        </ol>

        <div className={styles.layout}>
          <div className={styles.choices}>
            <div className={styles.choiceList} role="group" aria-label="选择用途示例">
              {opportunities.map((opportunity, index) => (
                <button
                  type="button"
                  key={opportunity.label}
                  className={styles.choice}
                  aria-pressed={selectedIndex === index}
                  aria-controls="opportunity-example"
                  onClick={() => setSelectedIndex(index)}
                >
                  <span className={styles.number} aria-hidden="true">0{index + 1}</span>
                  <span className={styles.choiceCopy}>
                    <strong>{opportunity.label}</strong>
                    <span>{opportunity.description}</span>
                  </span>
                  <ArrowRight size={19} strokeWidth={1.5} aria-hidden="true" />
                </button>
              ))}
            </div>
            <div className={styles.nextStep}>
              <p className={styles.nextStepTitle}>从这里开始 · {selected.label}</p>
              <p className={styles.nextStepCopy}>{selected.nextStep}</p>
              <div className={styles.nextStepActions}>
                <button type="button" className={styles.viewExample} onClick={showExample} aria-controls="opportunity-example">
                  查看所选示例 <ArrowDown size={16} aria-hidden="true" />
                </button>
                <Link className={styles.createLink} href={createHref}>
                  {selected.track === "study" ? "准备我的申请材料" : selected.track === "career" ? "准备我的职业材料" : "开始记录我的经历"}
                  <ArrowUpRight size={18} aria-hidden="true" />
                </Link>
              </div>
            </div>
            <p className={styles.srOnly} role="status" aria-live="polite" aria-atomic="true">
              已选择{selected.label}，示例已更新。{selected.nextStep}
            </p>
          </div>

          <div className={styles.example} id="opportunity-example">
            <div className={styles.exampleLabel}>
              <h3 ref={exampleHeadingRef} tabIndex={-1}>{selected.label}示例</h3>
              <span>0{selectedIndex + 1} / 04</span>
            </div>
            <div className={styles.exampleContent} key={selected.label}>
              <div className={styles.paperStack}>
                <article className={styles.paper} aria-label={selected.document}>
                  <header className={styles.paperHeader}>
                    <p>{selected.document}</p>
                    <p className={styles.paperName}>林予安</p>
                    <span>{selected.direction}</span>
                  </header>
                  {selected.sections.map((section) => (
                    <section className={styles.paperSection} key={section.title}>
                      <h4>{section.title}</h4>
                      <p>{section.text}</p>
                    </section>
                  ))}
                  <footer className={styles.paperFooter}>真实经历 · 按目标整理</footer>
                </article>
              </div>
              <div className={styles.focus}><strong>准备重点</strong><p>{selected.focus}</p></div>
            </div>
            <p className={styles.notice}>人物与内容均为虚构，仅用于说明材料的组织方式。</p>
          </div>
        </div>
      </div>
    </section>
  );
}
