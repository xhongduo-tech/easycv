import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  Check,
  Download,
  FileText,
  Globe2,
  MessageSquareText,
  Sparkles,
  Target,
  WandSparkles,
} from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createStarterContent, templates } from "@/lib/sample-data";
import styles from "./home.module.css";

const previewTemplate = templates.find((item) => item.id === "summit");

export default function HomePage() {
  return (
    <main>
      <SiteHeader />

      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className="eyebrow">AI 简历助手</p>
            <h1>用 AI，<span>做好你的简历。</span></h1>
            <p className={styles.lead}>
              告诉我们你的目标和真实经历，助手帮你梳理重点、优化表达并完成专业简历。留学申请或毕业求职，在创建时选择。
            </p>
            <div className={styles.heroActions}>
              <Link className="button button-primary" href="/dashboard?new=1">
                <Sparkles size={18} /> 创建简历
              </Link>
              <Link className="button button-ghost" href="/dashboard">
                我的简历 <ArrowRight size={17} />
              </Link>
            </div>
            <div className={styles.trustLine}>
              <span><BadgeCheck size={16} /> AI 辅助写作</span>
              <span><BadgeCheck size={16} /> 针对目标优化</span>
              <span><BadgeCheck size={16} /> 实时预览</span>
              <span><BadgeCheck size={16} /> PDF / 网页输出</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="AI 简历编辑器预览">
            <div className={styles.assistantStatus}>
              <span><Sparkles size={16} /></span>
              <div><small>助手正在优化</small><strong>项目经历 · 第 2 条</strong></div>
              <em>逐条确认</em>
            </div>
            <div className={styles.resumeStage}>
              <ResumePreview content={createStarterContent("career")} template={previewTemplate} scale="card" />
            </div>
            <div className={styles.suggestionCard}>
              <span>优化建议</span>
              <strong>把职责描述改成可验证的成果</strong>
              <p>说明你解决的问题、采用的方法与真实结果，所有修改都由你确认。</p>
              <div aria-hidden="true"><span>采用建议</span><span>继续修改</span></div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.coreSection}>
        <div className="shell">
          <div className={styles.sectionHeading}>
            <p className="eyebrow">一处完成</p>
            <h2>从真实经历，到可以投递的简历。</h2>
            <p>不再把模板、课程和发布方式拆成多个产品。你只需要专注这一份简历。</p>
          </div>
          <div className={styles.coreGrid}>
            <article>
              <span><WandSparkles size={22} /></span>
              <h3>助手帮你写</h3>
              <p>整理零散材料、提炼项目成果、优化摘要与经历表达；不会替你编造学历、数字或成绩。</p>
            </article>
            <article>
              <span><Target size={22} /></span>
              <h3>围绕目标优化</h3>
              <p>创建时选择留学申请或毕业求职，再选择院校、企业与方向，让建议服务于真实目标。</p>
            </article>
            <article>
              <span><Download size={22} /></span>
              <h3>一次完成，多种输出</h3>
              <p>同一份内容实时预览，完成后可打印或存为 PDF，也可生成独立的个人网页。</p>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.workspaceSection}>
        <div className={`shell ${styles.workspaceGrid}`}>
          <div className={styles.workspaceCopy}>
            <p className="eyebrow">以事实为起点</p>
            <h2>你提供经历，助手负责把它说清楚。</h2>
            <p>空白章节可以从材料开始整理；已有内容可以逐段优化；完成后再做整份简历检查。</p>
            <ul>
              <li><Check size={17} /> 生成、改写和检查都在编辑器里完成</li>
              <li><Check size={17} /> 每条建议先看内容，再决定是否采用</li>
              <li><Check size={17} /> 发现能力缺口时，才显示一条可选学习提示</li>
            </ul>
            <Link className="button button-primary" href="/dashboard?new=1">开始制作 <ArrowRight size={17} /></Link>
          </div>

          <div className={styles.assistantDemo} aria-label="简历助手对话示例">
            <div className={styles.demoHeader}><div><Sparkles size={17} /><strong>简历助手</strong></div><span>项目经历</span></div>
            <div className={styles.userMessage}>
              <span><MessageSquareText size={15} /></span>
              <p>我负责校园活动报名系统，协调 3 位同学，主要做需求和数据分析。</p>
            </div>
            <div className={styles.aiMessage}>
              <span><Sparkles size={15} /></span>
              <div><small>建议先补充两个事实</small><strong>上线用了多久？报名效率或参与人数有什么真实变化？</strong><p>确认后，我可以把材料整理成一条成果描述。</p></div>
            </div>
            <div className={styles.outputBar}>
              <span><FileText size={16} /> PDF</span>
              <span><Globe2 size={16} /> 网页简历</span>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className="shell">
          <div>
            <span><Sparkles size={24} /></span>
            <h2>现在，用 AI 完成你的简历。</h2>
            <p>一份简历，一个编辑器，一条清晰流程。</p>
            <Link className="button button-primary" href="/dashboard?new=1">创建简历 <ArrowRight size={17} /></Link>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
