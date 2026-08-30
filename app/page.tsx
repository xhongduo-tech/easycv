import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BadgeCheck,
  BookOpenCheck,
  BrainCircuit,
  Building2,
  Check,
  Download,
  Globe2,
  GraduationCap,
  Layers3,
  PencilLine,
  Route,
  ShieldCheck,
  Sparkles,
  Target,
} from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { createStarterContent, targetProfiles, templates } from "@/lib/sample-data";
import styles from "./home.module.css";

const featuredTemplates = templates.filter((template) =>
  ["atlas", "camber", "summit", "pillar"].includes(template.id),
);

export default function HomePage() {
  return (
    <main>
      <SiteHeader />
      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div className={styles.heroCopy}>
            <p className="eyebrow">留学申请 · 毕业求职</p>
            <h1>
              不是再写一份简历，
              <span>是为下一站精准作答。</span>
            </h1>
            <p className={styles.lead}>
              选择目标大学、国企或大厂，简迹 CV 会把常见关注点整理成清晰、可执行的写作路线。
            </p>
            <div className={styles.heroActions}>
              <Link className="button button-primary" href="/explore?track=study">
                <GraduationCap size={18} /> 为目标院校定制
              </Link>
              <Link className="button button-secondary" href="/explore?track=career">
                <Building2 size={18} /> 为目标企业定制
              </Link>
            </div>
            <div className={styles.trustLine}>
              <span><BadgeCheck size={16} /> {targetProfiles.length} 个目标适配方案</span>
              <span><BadgeCheck size={16} /> 无需外部 AI 密钥</span>
              <span><BadgeCheck size={16} /> 内容由你确认后保存</span>
              <span><BadgeCheck size={16} /> 可导出 ATS 纯文本</span>
            </div>
          </div>

          <div className={styles.heroVisual} aria-label="目标驱动简历编辑器预览">
            <div className={styles.targetCard}>
              <div className={styles.targetIcon}><Sparkles size={17} /></div>
              <div>
                <span>当前目标</span>
                <strong>腾讯 · 产品经理</strong>
              </div>
              <span className={styles.match}>规则检查</span>
            </div>
            <div className={styles.resumeStage}>
              <ResumePreview
                content={createStarterContent("career")}
                template={templates.find((item) => item.id === "summit")}
                scale="card"
              />
            </div>
            <div className={styles.adviceCard}>
              <span>01 · 经历建议</span>
              <strong>把“做了什么”升级为“改变了什么”</strong>
              <p>补充激活率提升 12.6% 的方法与协作范围，让结果更可信。</p>
              <Link href="/explore?track=career">查看目标建议 <ArrowRight size={14} /></Link>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.signalBar} aria-label="平台能力">
        <div className="shell">
          <span>{targetProfiles.length} 个院校与企业目标</span>
          <span>·</span>
          <span>{templates.length} 套共享视觉版式</span>
          <span>·</span>
          <span>实时预览</span>
          <span>·</span>
          <span>版本化保存</span>
          <span>·</span>
          <span>ATS 可读导出</span>
        </div>
      </section>

      <section className={styles.pathSection}>
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">从目标，而不是空白页开始</p>
              <h2>两条路径，同一套证据逻辑</h2>
            </div>
            <p>不把大学和企业做成两个孤岛。你的经历可以复用，但每份 CV 的重点、语言和结构都应该服务于具体目标。</p>
          </div>
          <div className={styles.pathGrid}>
            <article className={`${styles.pathCard} ${styles.studyCard}`}>
              <div className={styles.pathTop}>
                <span className={styles.pathIcon}><GraduationCap /></span>
                <span className={styles.pathIndex}>01 / STUDY</span>
              </div>
              <h3>留学申请 CV</h3>
              <p>根据国家、院校与项目类型，判断教育、科研、论文、课程与领导力的最佳顺序。</p>
              <ul>
                <li><Check size={15} /> 中国内地 / 港新 / 英美澳欧亚院校</li>
                <li><Check size={15} /> 学术证据与课程匹配检查</li>
                <li><Check size={15} /> 英文表达与一页/两页结构建议</li>
              </ul>
              <Link href="/explore?track=study">选择目标院校 <ArrowUpRight size={17} /></Link>
            </article>
            <article className={`${styles.pathCard} ${styles.careerCard}`}>
              <div className={styles.pathTop}>
                <span className={styles.pathIcon}><Building2 /></span>
                <span className={styles.pathIndex}>02 / CAREER</span>
              </div>
              <h3>毕业求职 CV</h3>
              <p>根据国企、大厂与岗位方向，突出专业匹配、业务影响、技术深度和协作边界。</p>
              <ul>
                <li><Check size={15} /> 央企国企 / 国内大厂 / 国际金融科技</li>
                <li><Check size={15} /> 结果量化与关键词覆盖检查</li>
                <li><Check size={15} /> 中文校招与国际求职表达建议</li>
              </ul>
              <Link href="/explore?track=career">选择目标企业 <ArrowUpRight size={17} /></Link>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.featureSection}>
        <div className="shell">
          <div className={styles.centerHeading}>
            <p className="eyebrow">不止是排版工具</p>
            <h2>把“我写过”变成“对方想看到”</h2>
            <p>结构、内容、目标与事实核验在同一条流程里完成。</p>
          </div>
          <div className={styles.bentoGrid}>
            <article className={styles.bentoLarge}>
              <div className={styles.featureBadge}><Target size={17} /> 目标画像</div>
              <h3>每个建议，都知道你要去哪里</h3>
              <p>目标画像将关注点、语气与关键词转换为可解释的建议，不把通用经验包装成“官方偏好”。</p>
              <div className={styles.radarDemo} aria-hidden="true">
                <div className={styles.radarRing}><span>示例</span><small>规则检查</small></div>
                <div className={styles.radarList}>
                  <span><i style={{ width: "88%" }} />学术/专业证据</span>
                  <span><i style={{ width: "72%" }} />可量化成果</span>
                  <span><i style={{ width: "64%" }} />目标关键词</span>
                </div>
              </div>
            </article>
            <article className={styles.bentoCard}>
              <div className={styles.featureBadge}><Sparkles size={17} /> 智能建议</div>
              <h3>先建议，再由你决定</h3>
              <p>系统不会静默覆盖内容。所有改写都保留原文，并明确提示核实数字与事实。</p>
              <div className={styles.suggestionDemo}>
                <span>高优先级</span>
                <strong>补充真实成果尺度</strong>
                <small>建议说明人数、周期或结果变化</small>
              </div>
            </article>
            <article className={styles.bentoCard}>
              <div className={styles.featureBadge}><Layers3 size={17} /> 多目标版本</div>
              <h3>同一份经历，多条目标路径</h3>
              <p>为院校或企业创建目标副本，切换模板不会丢内容，每次保存都有修订号。</p>
              <div className={styles.versionDemo}>
                <span>经历副本</span><ArrowRight size={15} /><span>剑桥 MPhil</span><span>腾讯产品</span>
              </div>
            </article>
            <article className={`${styles.bentoWide} ${styles.safetyCard}`}>
              <div>
                <div className={styles.featureBadge}><ShieldCheck size={17} /> 可信与隐私</div>
                <h3>不虚构成绩，不暗示官方背书</h3>
              </div>
              <p>内置规则建议不调用第三方 AI；目标画像统一标注为编辑建议。未来接入第三方模型前，需由用户确认数据用途。</p>
              <span className={styles.localTag}>RULE-BASED ADVISOR</span>
            </article>
          </div>
        </div>
      </section>

      <section className={styles.stepsSection} id="how-it-works">
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">3 步完成目标版本</p>
              <h2>先选方向，再写内容</h2>
            </div>
            <Link className="text-link" href="/explore">现在开始 <ArrowRight size={16} /></Link>
          </div>
          <div className={styles.stepsGrid}>
            {[
              { icon: Route, index: "01", title: "选择目标", text: "选择留学或求职，确定目标院校、企业与版本标签。" },
              { icon: PencilLine, index: "02", title: "编辑与检查", text: "在实时预览旁完善经历，逐条处理目标化建议。" },
              { icon: Download, index: "03", title: "确认并导出", text: "检查事实、进度与版式，打印为 PDF 或导出 ATS 文本。" },
            ].map((step) => (
              <article key={step.index}>
                <div><step.icon size={21} /><span>{step.index}</span></div>
                <h3>{step.title}</h3>
                <p>{step.text}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.templateSection}>
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div>
              <p className="eyebrow">原创模板系统</p>
              <h2>专业感，不靠花哨装饰</h2>
            </div>
            <p>内容与样式彻底分离。每套模板都说明适用目标、信息密度与阅读方式。</p>
          </div>
          <div className={styles.templateGrid}>
            {featuredTemplates.map((template) => (
              <Link
                key={template.id}
                href={`/explore?track=${template.track}&template=${template.id}`}
                className={styles.templateCard}
              >
                <div className={styles.templatePreview} style={{ "--card-tint": `${template.accent}16` } as React.CSSProperties}>
                  <ResumePreview
                    content={createStarterContent(template.track === "career" ? "career" : "study")}
                    template={template}
                    scale="card"
                  />
                  <span>{template.track === "study" ? "留学申请" : "毕业求职"}</span>
                </div>
                <div className={styles.templateInfo}>
                  <div><h3>{template.name}</h3><ArrowUpRight size={18} /></div>
                  <p>{template.description}</p>
                  <div>{template.tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
                </div>
              </Link>
            ))}
          </div>
          <div className={styles.templateMore}>
            <Link className="button button-secondary" href="/explore">浏览全部模板 <ArrowRight size={16} /></Link>
          </div>
        </div>
      </section>

      <section className={styles.ecosystemSection}>
        <div className="shell">
          <div className={styles.sectionHeading}>
            <div><p className="eyebrow">从一份文档到长期能力资产</p><h2>简历完成之后，继续向前。</h2></div>
            <p>把已经整理好的证据转成公开作品，再根据当前缺口安排学习路线；两项能力都由你主动选择，不会代替你做事实判断。</p>
          </div>
          <div className={styles.ecosystemGrid}>
            <Link href="/web-resume" className={styles.ecosystemCard}>
              <div><span><Globe2 size={22} /></span><small>GITHUB PAGES</small></div>
              <h3>导出个人网页简历</h3>
              <p>生成安全、独立的 index.html，默认隐藏敏感联系方式，可直接上传至 GitHub Pages。</p>
              <strong>生成网页简历 <ArrowUpRight size={16} /></strong>
            </Link>
            <Link href="/growth" className={styles.ecosystemCard}>
              <div><span><BrainCircuit size={22} /></span><small>GROWTH ROUTE</small></div>
              <h3>规划课程与证书路线</h3>
              <p>对照目标和现有能力证据，从官方资源中挑出最多三项优先补强建议。</p>
              <strong>查看成长建议 <ArrowUpRight size={16} /></strong>
            </Link>
          </div>
        </div>
      </section>

      <section className={styles.principlesSection}>
        <div className={`shell ${styles.principlesGrid}`}>
          <div>
            <p className="eyebrow">负责任的智能写作</p>
            <h2>系统给建议，事实由你掌握。</h2>
            <p>简历不是“生成得越多越好”。真正可靠的产品应该帮助你整理证据、发现缺口，并保留最后判断权。</p>
            <Link className="button button-dark" href="/explore">创建我的目标版本 <ArrowUpRight size={17} /></Link>
          </div>
          <div className={styles.principleList}>
            <article><BookOpenCheck size={21} /><div><strong>透明的目标画像</strong><p>所有画像都明确标注为编辑建议，不暗示学校或企业的官方偏好。</p></div></article>
            <article><ShieldCheck size={21} /><div><strong>事实保护</strong><p>任何量化结果都要求用户核验，绝不自动编造经历与成绩。</p></div></article>
            <article><Layers3 size={21} /><div><strong>修订可追溯</strong><p>服务端保存内容与版本号，避免多页面静默覆盖。</p></div></article>
          </div>
        </div>
      </section>

      <section className={styles.faqSection}>
        <div className={`shell ${styles.faqGrid}`}>
          <div>
            <p className="eyebrow">常见问题</p>
            <h2>开始前，你可能想知道</h2>
          </div>
          <div className={styles.faqList}>
            {[
              ["每个目标都需要一份不同的简历吗？", "不必从头重写。建议维护一份完整经历母版，再针对院校项目或企业岗位调整排序、摘要与证据重点。"],
              ["建议是学校或企业的官方要求吗？", "不是。简迹会区分公开事实与编辑建议；未找到公开依据时会明确标注，不暗示任何官方合作或录用承诺。"],
              ["没有配置 AI 密钥也能使用吗？", "可以。项目内置确定性的规则建议，目标检查、保存、模板切换与导出都可独立工作，不调用第三方 AI。"],
              ["如何导出和发布？", "编辑器支持浏览器另存为 PDF、ATS 纯文本和 JSON 备份；还可以生成单文件网页简历，再自行部署至 GitHub Pages。"],
            ].map(([question, answer], index) => (
              <details key={question} open={index === 0}>
                <summary>{question}<span>+</span></summary>
                <p>{answer}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      <section className={styles.finalCta}>
        <div className="shell">
          <div className={styles.finalCtaInner}>
            <span className={styles.ctaOrb}><Target /></span>
            <p>下一站，不该从一张空白页开始。</p>
            <h2>选择一个明确目标，<br />让每段经历都更有方向。</h2>
            <div>
              <Link className="button button-primary" href="/explore?track=study">留学申请 CV</Link>
              <Link className="button button-secondary" href="/explore?track=career">毕业求职 CV</Link>
            </div>
          </div>
        </div>
      </section>

      <SiteFooter />
    </main>
  );
}
