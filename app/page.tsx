import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDown, ArrowUpRight, Check, FilePlus2, FileText, FilePenLine, Globe2, FolderArchive, Plus, ShieldCheck } from "lucide-react";
import { HomepageStory } from "@/components/homepage-story";
import { HomepageOpportunities } from "@/components/homepage-opportunities";
import { HomepageTemplates } from "@/components/homepage-templates";
import { HomepageExperience } from "@/components/homepage-experience";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import styles from "./home.module.css";

export const metadata: Metadata = {
  title: { absolute: "简迹 CV｜你的个人材料工作室" },
  description: "为求职转岗、学习研究与项目合作整理真实经历。查看具体表达示例与专业简历版式，免费编辑并导出 PDF、Word、网页与 ATS 文本。",
};

const outputs = [
  { icon: FileText, format: "PDF", title: "一份正式的投递稿", text: "在 A4 预览中检查排版，通过打印保存为 PDF，保留你选好的纸面样式。" },
  { icon: FilePenLine, format: "WORD", title: "一份可继续修改的文档", text: "下载 Word 文档，继续调整文字，或交给信任的人一起审阅。" },
  { icon: Globe2, format: "HTML", title: "一份网页形式的介绍", text: "导出个人网页文件，也可下载 GitHub Pages 发布包，自行发布与分享。" },
  { icon: FolderArchive, format: "TXT / JSON", title: "一份留在手里的备份", text: "用 ATS 纯文本填写申请系统，以 JSON 备份资料，方便日后导入继续整理。" },
] as const;

export default function HomePage() {
  return (
    <HomepageExperience className={styles.home}>
      <SiteHeader variant="marketing" />

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
                创建简历 <ArrowUpRight size={19} aria-hidden="true" />
              </Link>
              <a className={styles.exploreLink} href="#opportunities">查看用途示例 <ArrowDown size={16} aria-hidden="true" /></a>
            </div>
            <p className={styles.startNote}><Check size={14} aria-hidden="true" /> 免费创建与编辑 · 导出无水印</p>
          </div>

          <HomepageStory />
        </div>
      </section>

      <nav className={`shell ${styles.pageGuide}`} aria-label="首页内容导航">
        <span>了解简迹</span>
        <a href="#opportunities">适用场景 <ArrowDown size={14} aria-hidden="true" /></a>
        <a href="#how-it-works">整理与审阅 <ArrowDown size={14} aria-hidden="true" /></a>
        <a href="#templates">简历版式 <ArrowDown size={14} aria-hidden="true" /></a>
        <a href="#questions">常见问题 <ArrowDown size={14} aria-hidden="true" /></a>
      </nav>

      <HomepageOpportunities />

      <section className={`shell ${styles.workflow}`} id="how-it-works" aria-labelledby="workflow-title">
        <div className={styles.sectionHeading} data-reveal>
          <p className={styles.sectionKicker}>整理与审阅</p>
          <h2 id="workflow-title">把经历写具体，<br />每一处修改都有依据。</h2>
          <p>先整理已有事实，再补齐关键细节。<br />最后由你核对来源，决定保留哪些修改。</p>
        </div>
        <figure className={styles.evidenceExample}>
          <ol className={styles.evidenceFlow}>
            <li data-reveal>
              <div className={styles.exampleStep}><h3>记录原始经历</h3></div>
              <div className={styles.originalNote}>
                <span>你已有的经历</span>
                <blockquote>“参与后台系统开发，<br />负责权限相关功能。”</blockquote>
                <p>先把做过的事写下来，<br />不必一开始就想好怎么措辞。</p>
              </div>
            </li>
            <li data-reveal data-reveal-delay="70">
              <div className={styles.exampleStep}><h3>补充具体贡献</h3></div>
              <div className={styles.questionNote}>
                <span>一个值得补充的问题</span>
                <p className={styles.exampleQuestion}>你具体完成了哪个模块？<br />它被谁使用？</p>
                <div className={styles.exampleAnswer}><small>你补充的细节</small><p>“我独立实现了权限配置模块，目前供 3 个业务组使用。”</p></div>
              </div>
            </li>
            <li data-reveal data-reveal-delay="140">
              <div className={styles.exampleStep}><h3>核对候选表达</h3></div>
              <div className={styles.resultNote}>
                <span>等待你审阅的候选</span>
                <blockquote>独立实现后台权限配置模块，<mark>供 3 个业务组使用</mark>。</blockquote>
                <p><Check size={15} aria-hidden="true" /> 依据：原始经历与补充回答</p>
                <small>没有效果数据时，就如实写清职责与范围。</small>
              </div>
            </li>
          </ol>
          <figcaption>虚构经历，仅用于说明材料助手的追问与审阅方式。材料助手正限额试点，开放情况以工作台为准。</figcaption>
        </figure>
      </section>

      <HomepageTemplates />

      <section className={`shell ${styles.deliverables}`} aria-labelledby="output-title">
        <div className={styles.sectionHeading} data-reveal>
          <p className={styles.sectionKicker}>导出与留存</p>
          <h2 id="output-title">按使用场景，<br />选择合适的文件格式。</h2>
          <p>同一份内容，按使用场景选择输出。<br />从正式投递，到继续编辑与留存。</p>
        </div>
        <div className={styles.outputGrid}>
          {outputs.map(({ icon: Icon, format, title, text }, index) => <article key={format} data-reveal data-reveal-delay={index * 45}>
            <div><Icon size={24} strokeWidth={1.5} aria-hidden="true" /><span>{format}</span></div>
            <h3>{title}</h3><p>{text}</p>
          </article>)}
        </div>
        <div className={styles.freeNote} data-reveal>
          <p><ShieldCheck size={20} aria-hidden="true" /><span>从第一份简历开始，就可以免费编辑与导出。</span></p>
          <Link href="/pricing">了解免费范围与增强功能 <ArrowUpRight size={15} aria-hidden="true" /></Link>
        </div>
      </section>

      <section className={styles.questions} id="questions" aria-labelledby="questions-title">
        <div className={`shell ${styles.questionsGrid}`} data-reveal>
          <div className={styles.questionsIntro}>
            <p className={styles.sectionKicker}>使用说明</p>
            <h2 id="questions-title">常见问题</h2>
            <p>不必准备一份完美的旧简历。<br />从一段经历、一个目标开始就好。</p>
            <Link href="/privacy">了解资料与 AI 使用说明 <ArrowUpRight size={15} aria-hidden="true" /></Link>
          </div>
          <div className={styles.faqList}>
            <details open><summary>还没有完整的简历，也能开始吗？<Plus size={18} aria-hidden="true" /></summary><p>可以。从空白草稿逐项填写，也可以粘贴旧经历，或导入 Word（.docx）、文本和 JSON 文件。导入后先预览，再决定如何合并到当前简历。</p></details>
            <details><summary>只能用来求职吗？<Plus size={18} aria-hidden="true" /></summary><p>也可以为学习研究、项目合作和其他机会准备个人简历。选择材料用途，再写下自己的具体目标；不要求你属于某种职业或人生阶段。</p></details>
            <details><summary>面对不同目标，需要从头再写吗？<Plus size={18} aria-hidden="true" /></summary><p>可以在工作台为已有简历创建副本，分别调整目标要求、表达重点和版式。不同版本独立保存，方便为每一次机会做准备。</p></details>
            <details><summary>AI 的建议会直接改掉我的简历吗？<Plus size={18} aria-hidden="true" /></summary><p>材料助手会呈现候选表达、引用来源与待确认事项，经过你选择并确认后才写入。应用后可撤销本次修改。你也可以始终使用手动编辑和基础检查。</p></details>
            <details><summary>哪些功能免费？一定要登录吗？<Plus size={18} aria-hidden="true" /></summary><p>访客可以创建、编辑和导出简历，登录后可跨设备继续。章节增强优化按用量使用简迹点；材料助手为需登录的限额试点，开放情况与额度以工作台为准。<Link href="/pricing">查看完整说明</Link>。</p></details>
          </div>
        </div>
      </section>

      <section className={`shell ${styles.closing}`} aria-labelledby="closing-title">
        <div data-reveal>
          <h2 id="closing-title">好机会，<br />从一份好表达开始。</h2>
          <p className={styles.closingLead}>选一个具体目标，留下一份独立版本。<br />下一段经历，由你书写。</p>
          <Link className="button button-primary" href="/dashboard?new=1"><Plus size={18} aria-hidden="true" /> 创建第一份简历</Link>
        </div>
        <div className={styles.closingArtwork} aria-hidden="true" data-reveal data-reveal-delay="100">
          <div className={styles.closingPaper}><FilePlus2 size={29} strokeWidth={1.3} /><span>你的名字</span><small>下一段经历，由你书写</small><i /><i /><i /><b /><i /><i /></div>
          <span>每个目标，都值得认真准备</span>
        </div>
      </section>

      <SiteFooter />
    </HomepageExperience>
  );
}
