import type { ResumeRecord, ResumeTemplate } from "@/types/resume";

export interface WebResumeOptions {
  includeContact?: boolean;
  template?: ResumeTemplate;
}

const escapeHtml = (value: unknown) => String(value ?? "")
  .replaceAll("&", "&amp;")
  .replaceAll("<", "&lt;")
  .replaceAll(">", "&gt;")
  .replaceAll('"', "&quot;")
  .replaceAll("'", "&#39;");

const safeHttpUrl = (value: string) => {
  try {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const candidate = /^[a-z][a-z0-9+.-]*:/i.test(trimmed) ? trimmed : `https://${trimmed}`;
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
};

const list = (items: string[]) => items.length
  ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
  : "";

const section = (title: string, body: string) => body
  ? `<section><h2>${escapeHtml(title)}</h2>${body}</section>`
  : "";

export function toStandaloneHtml(resume: ResumeRecord, options: WebResumeOptions = {}) {
  const content = resume.content;
  const accent = /^#[0-9a-f]{6}$/i.test(options.template?.accent ?? "") ? options.template!.accent : "#5c3ee8";
  const includeContact = options.includeContact === true;
  const websiteUrl = safeHttpUrl(content.basics.website);
  const contact = [
    includeContact && content.basics.email ? `<a href="mailto:${escapeHtml(content.basics.email)}">${escapeHtml(content.basics.email)}</a>` : "",
    includeContact && content.basics.phone ? `<span>${escapeHtml(content.basics.phone)}</span>` : "",
    includeContact && content.basics.location ? `<span>${escapeHtml(content.basics.location)}</span>` : "",
    websiteUrl ? `<a href="${escapeHtml(websiteUrl)}" rel="noreferrer">${escapeHtml(content.basics.website)}</a>` : "",
  ].filter(Boolean).join("<i>·</i>");

  const education = content.education.map((item) => `
    <article class="entry">
      <div class="entry-head"><div><h3>${escapeHtml(item.school)}</h3><p>${escapeHtml([item.degree, item.major].filter(Boolean).join(" · "))}</p></div><span>${escapeHtml([item.startDate, item.endDate].filter(Boolean).join(" — "))}</span></div>
      ${item.score ? `<strong class="meta">${escapeHtml(item.score)}</strong>` : ""}
      ${list(item.highlights)}
    </article>`).join("");
  const experience = content.experience.map((item) => `
    <article class="entry">
      <div class="entry-head"><div><h3>${escapeHtml(item.organization)}</h3><p>${escapeHtml(item.role)}</p></div><span>${escapeHtml([item.startDate, item.endDate].filter(Boolean).join(" — "))}</span></div>
      ${list(item.bullets)}
    </article>`).join("");
  const projects = content.projects.map((item) => {
    const projectUrl = safeHttpUrl(item.link);
    const projectName = projectUrl
      ? `<a href="${escapeHtml(projectUrl)}" rel="noreferrer">${escapeHtml(item.name)}</a>`
      : escapeHtml(item.name);
    return `
      <article class="entry">
        <div class="entry-head"><div><h3>${projectName}</h3><p>${escapeHtml(item.role)}</p></div><span>${escapeHtml(item.date)}</span></div>
        ${list(item.bullets)}
      </article>`;
  }).join("");
  const extras = [
    content.skills.length ? `<div><h3>技能</h3><p>${escapeHtml(content.skills.join(" · "))}</p></div>` : "",
    content.languages.length ? `<div><h3>语言</h3><p>${escapeHtml(content.languages.join(" · "))}</p></div>` : "",
    content.awards.length ? `<div><h3>奖项与证书</h3><p>${escapeHtml(content.awards.join(" · "))}</p></div>` : "",
  ].filter(Boolean).join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; img-src data:; base-uri 'none'; form-action 'none'">
  <meta name="description" content="${escapeHtml(content.basics.headline || resume.targetName)}">
  <title>${escapeHtml(content.basics.name || resume.title)} · Resume</title>
  <style>
    :root { --accent: ${accent}; --ink: #171822; --muted: #626574; --line: #dfddd7; --paper: #fffefb; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; color: var(--ink); background: #f2f0eb; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; line-height: 1.55; }
    main { width: min(900px, calc(100% - 32px)); padding: clamp(32px, 7vw, 76px); margin: 40px auto; border-top: 8px solid var(--accent); background: var(--paper); box-shadow: 0 24px 70px rgba(24,24,32,.11); }
    header { padding-bottom: 34px; border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: clamp(2.6rem, 8vw, 5.3rem); line-height: .95; letter-spacing: -.06em; }
    header > p { max-width: 690px; margin: 16px 0 0; color: var(--muted); font-size: 1.05rem; }
    .contact { display: flex; flex-wrap: wrap; gap: 7px 11px; margin-top: 19px; font-size: .82rem; }
    .contact i { color: #aaa; font-style: normal; }
    a { color: var(--accent); text-decoration-thickness: 1px; text-underline-offset: 3px; overflow-wrap: anywhere; }
    section { display: grid; grid-template-columns: 145px minmax(0, 1fr); gap: 26px; padding: 30px 0; border-bottom: 1px solid var(--line); }
    section > h2 { margin: 0; color: var(--accent); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; }
    section > p { margin: 0; color: #343643; }
    .entry + .entry { margin-top: 25px; }
    .entry-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 18px; }
    h3 { margin: 0; font-size: .96rem; }
    .entry-head p, .extras p { margin: 3px 0 0; color: var(--muted); font-size: .82rem; }
    .entry-head > span { flex: none; color: var(--muted); font-size: .72rem; }
    .meta { display: block; margin-top: 8px; color: var(--muted); font-size: .74rem; }
    ul { padding-left: 18px; margin: 11px 0 0; }
    li { padding-left: 3px; margin-top: 5px; font-size: .82rem; }
    .extras { display: grid; grid-template-columns: repeat(2, 1fr); gap: 20px; }
    footer { padding-top: 24px; color: var(--muted); font-size: .65rem; text-align: center; }
    @media (max-width: 640px) {
      main { width: 100%; padding: 30px 22px; margin: 0; box-shadow: none; }
      section { grid-template-columns: 1fr; gap: 13px; }
      .entry-head { flex-direction: column; gap: 5px; }
      .extras { grid-template-columns: 1fr; }
    }
    @media print {
      body { background: white; }
      main { width: 100%; padding: 0; margin: 0; box-shadow: none; }
      a { color: inherit; text-decoration: none; }
    }
  </style>
</head>
<body>
  <main>
    <header>
      <h1>${escapeHtml(content.basics.name || "你的姓名")}</h1>
      ${content.basics.headline ? `<p>${escapeHtml(content.basics.headline)}</p>` : ""}
      ${contact ? `<div class="contact">${contact}</div>` : ""}
    </header>
    ${section("个人简介", content.summary ? `<p>${escapeHtml(content.summary)}</p>` : "")}
    ${section("教育经历", education)}
    ${section("工作与实践", experience)}
    ${section("项目经历", projects)}
    ${section("技能与其他", extras ? `<div class="extras">${extras}</div>` : "")}
    <footer>由简迹 CV 导出 · 请以本人核验后的内容为准</footer>
  </main>
</body>
</html>`;
}
