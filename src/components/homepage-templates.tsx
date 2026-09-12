import Link from "next/link";
import { ArrowRight, ArrowUpRight } from "lucide-react";
import { ResumePreview } from "@/components/resume-preview";
import { createStarterContent, templates } from "@/lib/sample-data";
import styles from "./homepage-templates.module.css";

const featuredTemplates = [
  {
    id: "summit",
    label: "清晰通用",
    description: "分区明确，重点一眼可见。让项目、职责与成果拥有清楚的阅读顺序。",
    track: "career",
  },
  {
    id: "signal",
    label: "编辑表达",
    description: "舒展的留白与衬线标题，为策略、创意和跨学科经历留出叙述空间。",
    track: "career",
  },
  {
    id: "northstar",
    label: "研究密度",
    description: "紧凑的条目与侧边分区，将研究方法、实验和项目证据有序展开。",
    track: "study",
  },
] as const;

export function HomepageTemplates() {
  return (
    <section className={styles.section} id="templates" aria-labelledby="templates-title">
      <div className="shell">
        <div className={styles.heading}>
          <div>
            <p className={styles.eyebrow}>落在纸上，也要恰到好处</p>
            <h2 id="templates-title">好内容，值得一份好版式。</h2>
          </div>
          <p className={styles.intro}>
            清楚、舒展，或是更紧凑。<br />
            选择适合这次表达的阅读节奏。
          </p>
        </div>

        <p className={styles.mobileHint}>向左滑动，比较三种版式 <ArrowRight size={15} aria-hidden="true" /></p>

        <div
          className={styles.gallery}
          role="group"
          aria-label="三种现有简历版式示例，可横向滚动查看"
          tabIndex={0}
        >
          {featuredTemplates.map((featured, index) => {
            const template = templates.find((item) => item.id === featured.id);
            if (!template) return null;

            return (
              <figure className={styles.example} key={featured.id}>
                <div className={styles.paperStage} aria-hidden="true">
                  <div className={styles.paperStack}>
                    <ResumePreview
                      className={styles.paper}
                      content={createStarterContent(featured.track)}
                      template={template}
                      scale="editor"
                    />
                  </div>
                </div>
                <figcaption className={styles.caption}>
                  <div className={styles.captionTitle}>
                    <span className={styles.number}>0{index + 1}</span>
                    <h3>{featured.label}</h3>
                    <span className={styles.templateName}>{template.name.split(" ")[0]}</span>
                  </div>
                  <p>{featured.description}</p>
                </figcaption>
              </figure>
            );
          })}
        </div>

        <div className={styles.footer}>
          <p>以上均为现有版式；人物与经历为示例内容。</p>
          <Link className={styles.link} href="/dashboard?new=1">
            创建时选择版式 <ArrowUpRight size={18} aria-hidden="true" />
          </Link>
        </div>
      </div>
    </section>
  );
}
