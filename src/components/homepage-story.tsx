import { ArrowUpRight, Check, CornerDownRight } from "lucide-react";
import styles from "../../app/home.module.css";

export function HomepageStory() {
  return (
    <figure className={styles.story} aria-label="简历表达与材料来源示例">
      <div className={styles.storyCaption}>
        <span>一段经历，更清晰的表达</span>
        <span>示例 · 01</span>
      </div>

      <div className={styles.paperStack}>
        <article className={styles.resumePaper} aria-label="林予安的示例简历节选">
          <header className={styles.resumeHeader}>
            <div>
              <h2>林予安</h2>
              <p>产品经理 · 用户研究与产品体验</p>
            </div>
            <span className={styles.paperMonogram} aria-hidden="true">LY</span>
          </header>

          <section className={styles.resumeSection}>
            <h3>个人简介 <span>PROFILE</span></h3>
            <p>关注用户的真实需要，以访谈和反馈推动产品迭代。在产品、设计与研发的协作中，把问题转化为清晰的行动。</p>
          </section>

          <section className={styles.resumeSection}>
            <h3>项目经历 <span>EXPERIENCE</span></h3>
            <div className={styles.experienceHeading}>
              <strong>新用户引导体验优化</strong>
              <span>2025</span>
            </div>
            <p className={styles.rewrittenText}>
              访谈 <mark>12 位用户</mark>，归纳 <mark>68 条反馈</mark>，协同设计与研发完成 <mark>3 轮新手引导迭代</mark>，并整理上线后的用户反馈。
              <sup aria-label="对应材料来源一">1</sup>
            </p>
          </section>

          <div className={styles.paperFooter}>
            <span>为目标整理 · 保留真实</span>
            <span>01</span>
          </div>
        </article>
      </div>

      <aside className={styles.sourceNote} aria-label="改写所依据的示例原始材料">
        <div className={styles.noteHeading}>
          <span><CornerDownRight size={15} aria-hidden="true" /> 材料来源 <small>01</small></span>
          <ArrowUpRight size={16} aria-hidden="true" />
        </div>
        <p>“访谈了 12 位用户，整理了 68 条反馈；和设计、研发改了 3 轮新手引导，也收集了上线后的反馈。”</p>
        <div className={styles.noteFooter}><Check size={13} aria-hidden="true" /> 表达可以优化，事实由你确认。</div>
      </aside>

      <figcaption className={styles.exampleNotice}>虚构人物与材料，仅用于展示表达方式。</figcaption>
    </figure>
  );
}
