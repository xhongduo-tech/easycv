import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { HomepageStory } from "@/components/homepage-story";
import { SiteHeader } from "@/components/site-header";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <main className={styles.home}>
      <SiteHeader minimal />

      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}><Sparkles size={15} /> 为你的下一次机会，准备好材料</p>
            <h1>让真实经历，<span>更有说服力。</span></h1>
            <p className={styles.lead}>
              求职、转岗、研究申请或项目合作，都从说清你的经历开始。把目标与材料放在一起，找到依据、补齐细节，逐条确认修改，再导出适合这次机会的简历。
            </p>
            <div className={styles.heroActions}>
              <Link className="button button-primary" href="/dashboard?new=1">
                <Sparkles size={18} /> 创建简历
              </Link>
              <Link className="button button-ghost" href="/dashboard">
                我的简历 <ArrowRight size={17} />
              </Link>
            </div>
            <div className={styles.promiseLine}>
              <span><Check size={14} /> 从真实材料出发</span>
              <span><Check size={14} /> 修改逐条确认</span>
              <span><Check size={14} /> 面向不同目标</span>
            </div>
          </div>

          <HomepageStory />
        </div>
      </section>
    </main>
  );
}
