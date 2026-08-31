import type { CSSProperties } from "react";
import { cn } from "@/lib/utils";
import { getTemplateDesignMeta } from "@/lib/template-system";
import type { ResumeContent, ResumeTemplate } from "@/types/resume";

type PreviewProps = {
  content: ResumeContent;
  template?: Pick<ResumeTemplate, "id" | "layout" | "accent" | "name" | "family" | "density">;
  className?: string;
  scale?: "card" | "editor" | "print";
};

export function ResumePreview({ content, template, className, scale = "editor" }: PreviewProps) {
  const layout = template?.layout ?? "modern";
  const accent = template?.accent ?? "#3559e0";
  const design = template?.family && template?.density
    ? { family: template.family, density: template.density }
    : getTemplateDesignMeta(template?.id);

  return (
    <article
      className={cn(
        "resume-paper",
        `resume-${layout}`,
        `resume-family-${design.family}`,
        `resume-density-${design.density}`,
        template?.id && `resume-template-${template.id}`,
        `resume-scale-${scale}`,
        className,
      )}
      style={{ "--resume-accent": accent } as CSSProperties}
      aria-label="简历实时预览"
    >
      <header className="resume-head">
        <div>
          <h1>{content.basics.name || "你的姓名"}</h1>
          <p className="resume-headline">{content.basics.headline || "专业方向 / 目标职位"}</p>
        </div>
        <div className="resume-contact">
          {content.basics.email && <span>{content.basics.email}</span>}
          {content.basics.phone && <span>{content.basics.phone}</span>}
          {content.basics.location && <span>{content.basics.location}</span>}
          {content.basics.website && <span>{content.basics.website}</span>}
        </div>
      </header>

      {content.summary && (
        <ResumeSection title="Profile">
          <p>{content.summary}</p>
        </ResumeSection>
      )}

      {content.education.length > 0 && (
        <ResumeSection title="Education">
          {content.education.map((item) => (
            <ResumeEntry
              key={item.id}
              title={item.school}
              meta={[item.degree, item.major].filter(Boolean).join(" · ")}
              date={[item.startDate, item.endDate].filter(Boolean).join(" — ")}
              location={item.location}
              bullets={[item.score, ...item.highlights].filter(Boolean)}
            />
          ))}
        </ResumeSection>
      )}

      {content.experience.length > 0 && (
        <ResumeSection title="Experience">
          {content.experience.map((item) => (
            <ResumeEntry
              key={item.id}
              title={item.role}
              meta={item.organization}
              date={[item.startDate, item.endDate].filter(Boolean).join(" — ")}
              location={item.location}
              bullets={item.bullets}
            />
          ))}
        </ResumeSection>
      )}

      {content.projects.length > 0 && (
        <ResumeSection title="Selected Projects">
          {content.projects.map((item) => (
            <ResumeEntry
              key={item.id}
              title={item.name}
              meta={item.role}
              date={item.date}
              location={item.link}
              bullets={item.bullets}
            />
          ))}
        </ResumeSection>
      )}

      <div className="resume-bottom-grid">
        {content.skills.length > 0 && (
          <ResumeSection title="Skills" compact>
            <p>{content.skills.join(" · ")}</p>
          </ResumeSection>
        )}
        {content.languages.length > 0 && (
          <ResumeSection title="Languages" compact>
            <p>{content.languages.join(" · ")}</p>
          </ResumeSection>
        )}
      </div>

      {content.awards.length > 0 && (
        <ResumeSection title="Awards" compact>
          <p>{content.awards.join(" · ")}</p>
        </ResumeSection>
      )}
    </article>
  );
}

function ResumeSection({
  title,
  children,
  compact = false,
}: {
  title: string;
  children: React.ReactNode;
  compact?: boolean;
}) {
  return (
    <section className={cn("resume-section", compact && "resume-section-compact")}>
      <h2>{title}</h2>
      <div>{children}</div>
    </section>
  );
}

function ResumeEntry({
  title,
  meta,
  date,
  location,
  bullets,
}: {
  title: string;
  meta: string;
  date: string;
  location: string;
  bullets: string[];
}) {
  return (
    <div className="resume-entry">
      <div className="resume-entry-heading">
        <div>
          <h3>{title}</h3>
          {meta && <strong>{meta}</strong>}
        </div>
        <div className="resume-entry-meta">
          <span>{date}</span>
          <span>{location}</span>
        </div>
      </div>
      {bullets.length > 0 && (
        <ul>
          {bullets.map((bullet, index) => (
            <li key={`${bullet}-${index}`}>{bullet}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
