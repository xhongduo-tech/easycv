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
              选择目标与岗位，提供真实经历和岗位要求。助手先建立证据地图，再帮你改写内容、套用专业版式，并输出 PDF 或个人网页。
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
              <span><BadgeCheck size={16} /> JD 证据映射</span>
              <span><BadgeCheck size={16} /> 专业版式系统</span>
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
              <h3>先找到岗位证据</h3>
              <p>把岗位要求逐条映射到你的经历原文，区分“有证据、有线索、待补充”，不把关键词命中伪装成录用概率。</p>
            </article>
            <article>
              <span><Target size={22} /></span>
              <h3>专业版式建立信任</h3>
              <p>按学术研究、金融咨询、科技产品、工程制造和央国企等阅读场景推荐版式；不是目标单位官方模板。</p>
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
            <p>岗位要求决定“写什么”，专业版式决定“如何被快速读懂”。两者都必须落在你的真实材料上。</p>
            <ul>
              <li><Check size={17} /> 每条岗位要求都能展开查看对应的简历原文</li>
              <li><Check size={17} /> 缺少证据时先追问事实，不自动补数字或成果</li>
              <li><Check size={17} /> 你粘贴并确认岗位文字；链接只记录，不自动抓取</li>
            </ul>
            <Link className="button button-primary" href="/dashboard?new=1">开始制作 <ArrowRight size={17} /></Link>
          </div>

          <div className={styles.assistantDemo} aria-label="简历助手对话示例">
            <div className={styles.demoHeader}><div><Sparkles size={17} /><strong>简历助手</strong></div><span>项目经历</span></div>
            <div className={styles.userMessage}>
              <span><MessageSquareText size={15} /></span>
              <p>岗位要求：能建立指标体系，并推动产品、设计和研发协作。</p>
            </div>
            <div className={styles.aiMessage}>
              <span><Sparkles size={15} /></span>
              <div><small>找到一条用户证据</small><strong>“协调 3 位同学完成需求分析与上线”</strong><p>下一步补充指标口径和真实结果；如果没有可靠数字，就不写数字。</p></div>
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
