import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, FileText } from "lucide-react";
import { HomepageStory } from "@/components/homepage-story";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import styles from "./home.module.css";

const steps = [
  { number: "01", title: "放进经历，也放进目标", description: "整理工作、项目与学习经历，写下这次机会的具体要求。" },
  { number: "02", title: "每一处表达，都有来处", description: "对照材料审阅建议，补充关键细节，逐条决定保留哪些修改。" },
  { number: "03", title: "带着适合的版本出发", description: "预览版式，检查内容，导出一份为这次机会准备的简历。" },
] as const;

export default function HomePage() {
  return (
    <main className={styles.home}>
      <SiteHeader minimal />

      <section className={styles.hero} aria-labelledby="home-title">
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}><span aria-hidden="true" /> 你的个人材料工作室</p>
            <h1 id="home-title">你的下一程，<span>从这一页开始。</span></h1>
            <p className={styles.lead}>
              把真实经历，整理成有说服力的材料。<br />
              从求职转岗，到研究申请与项目合作，<br className={styles.desktopBreak} />
              为每一次机会，准备一个更清晰的自己。
            </p>
            <div className={styles.heroActions}>
              <Link className={`button button-primary ${styles.primaryAction}`} href="/dashboard?new=1">
                开始整理我的简历 <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <Link className={styles.workspaceLink} href="/dashboard">
                进入工作台 <ArrowRight size={16} aria-hidden="true" />
              </Link>
            </div>
            <p className={styles.startNote}><Check size={14} aria-hidden="true" /> 免费创建与编辑 · 导出无水印</p>
            <a className={styles.exploreLink} href="#how-it-works">看看材料如何变清晰 <ArrowDown size={15} aria-hidden="true" /></a>
          </div>

          <HomepageStory />
        </div>
      </section>

      <section className={`shell ${styles.workflow}`} id="how-it-works" aria-labelledby="workflow-title">
        <div className={styles.sectionHeading}>
          <p className={styles.sectionKicker}>从经历，到表达</p>
          <h2 id="workflow-title">好的材料，从说清楚开始。</h2>
          <p>你决定写下什么，我们帮你把它组织得更好。</p>
        </div>
        <ol className={styles.stepList}>
          {steps.map((step) => (
            <li key={step.number}>
              <span className={styles.stepNumber}>{step.number}</span>
              <h3>{step.title}</h3>
              <p>{step.description}</p>
            </li>
          ))}
        </ol>
      </section>

      <section className={`shell ${styles.outputSection}`} aria-labelledby="output-title">
        <div className={styles.outputIntro}>
          <span className={styles.outputIcon}><FileText size={25} strokeWidth={1.5} aria-hidden="true" /></span>
          <div>
            <h2 id="output-title">内容用心，呈现也要得体。</h2>
            <p>多种简历版式，实时预览；按你的需要，导出 PDF、ATS 文本或网页文件。</p>
          </div>
        </div>
        <Link className={styles.outputLink} href="/dashboard?new=1">创建第一份简历 <ArrowUpRight size={18} aria-hidden="true" /></Link>
      </section>

      <SiteFooter />
    </main>
  );
}
