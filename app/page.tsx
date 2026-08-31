import Link from "next/link";
import { ArrowRight, Check, Sparkles } from "lucide-react";
import { HomepageStory } from "@/components/homepage-story";
import { SiteHeader } from "@/components/site-header";
import styles from "./home.module.css";

export default function HomePage() {
  return (
    <main className={styles.home}>
      <SiteHeader />

      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className={styles.heroKicker}><Sparkles size={15} /> 从目标岗位，到投递版本</p>
            <h1>把真实经历，变成<span>有说服力的简历。</span></h1>
            <p className={styles.lead}>
              简迹先读懂岗位，再从你的真实经历中找到证据，逐条优化表达与版式。每一处修改都由你确认，最后直接导出 PDF 或个人网页。
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
              <span><Check size={14} /> 不编造经历</span>
              <span><Check size={14} /> 修改逐条确认</span>
              <span><Check size={14} /> 一处完成输出</span>
            </div>
          </div>

          <HomepageStory />
        </div>
      </section>
    </main>
  );
}
