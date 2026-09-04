import type { ResumeRecord, ResumeTemplate } from "@/types/resume";
import { getTemplateDesignMeta } from "@/lib/template-system";

export interface WebResumeOptions {
  includeContact?: boolean;
  template?: ResumeTemplate;
  variant?: "static" | "interactive";
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

const accessibleAccentText = (value: string) => {
  const parsed = value.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (!parsed) return "#4b32c4";
  let channels = parsed.slice(1).map((channel) => Number.parseInt(channel, 16));
  const paper = [255, 254, 251];
  while (contrastRatio(channels, paper) < 4.5) {
    channels = channels.map((channel) => Math.max(0, Math.floor(channel * 0.88)));
  }
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0")).join("")}`;
};

const contrastRatio = (left: number[], right: number[]) => {
  const luminance = (channels: number[]) => channels
    .map((channel) => channel / 255)
    .map((channel) => channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4)
    .reduce((total, channel, index) => total + channel * [0.2126, 0.7152, 0.0722][index], 0);
  const first = luminance(left);
  const second = luminance(right);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const list = (items: string[]) => items.length
  ? `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`
  : "";

const section = (id: string, title: string, body: string) => body
  ? `<section id="${id}"><h2>${escapeHtml(title)}</h2>${body}</section>`
  : "";

export function toStandaloneHtml(resume: ResumeRecord, options: WebResumeOptions = {}) {
  const content = resume.content;
  const accent = /^#[0-9a-f]{6}$/i.test(options.template?.accent ?? "") ? options.template!.accent : "#5c3ee8";
  const accentText = accessibleAccentText(accent);
  const design = getTemplateDesignMeta(options.template?.id ?? resume.templateId);
  const layout = options.template?.layout && ["classic", "modern", "compact", "editorial"].includes(options.template.layout)
    ? options.template.layout
    : "modern";
  const templateId = /^[a-z0-9-]+$/i.test(options.template?.id ?? resume.templateId)
    ? options.template?.id ?? resume.templateId
    : "custom";
  const includeContact = options.includeContact === true;
  const interactive = options.variant === "interactive";
  const websiteUrl = safeHttpUrl(content.basics.website);
  const contact = [
    includeContact && content.basics.email ? `<a href="mailto:${escapeHtml(content.basics.email)}">${escapeHtml(content.basics.email)}</a>` : "",
    includeContact && content.basics.phone ? `<span>${escapeHtml(content.basics.phone)}</span>` : "",
    includeContact && content.basics.location ? `<span>${escapeHtml(content.basics.location)}</span>` : "",
    websiteUrl ? `<a href="${escapeHtml(websiteUrl)}" rel="noreferrer">${escapeHtml(content.basics.website)}</a>` : "",
  ].filter(Boolean).join("<i>·</i>");

  const education = content.education.map((item) => `
    <article class="entry">
      <div class="entry-head"><div><h3>${escapeHtml(item.school)}</h3><p>${escapeHtml([item.degree, item.major].filter(Boolean).join(" · "))}</p></div><span>${escapeHtml([[item.startDate, item.endDate].filter(Boolean).join(" — "), includeContact ? item.location : ""].filter(Boolean).join(" · "))}</span></div>
      ${item.score ? `<strong class="meta">${escapeHtml(item.score)}</strong>` : ""}
      ${list(item.highlights)}
    </article>`).join("");
  const experience = content.experience.map((item) => `
    <article class="entry">
      <div class="entry-head"><div><h3>${escapeHtml(item.role)}</h3><p>${escapeHtml(item.organization)}</p></div><span>${escapeHtml([[item.startDate, item.endDate].filter(Boolean).join(" — "), includeContact ? item.location : ""].filter(Boolean).join(" · "))}</span></div>
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
  const navigation = [
    content.summary ? ["profile", "个人简介"] : null,
    content.education.length ? ["education", "教育经历"] : null,
    content.experience.length ? ["experience", "工作与实践"] : null,
    content.projects.length ? ["projects", "项目经历"] : null,
    extras ? ["extras", "技能与其他"] : null,
  ].filter((item): item is string[] => Boolean(item));
  const navigationLinks = navigation
    .map(([id, label], index) => `<a href="#${id}"><span>${String(index + 1).padStart(2, "0")}</span>${escapeHtml(label)}</a>`)
    .join("");
  const portfolioStart = interactive ? `<div class="portfolio-shell">
    <aside class="portfolio-nav" aria-label="简历章节">
      <a class="mini-brand" href="#top">${escapeHtml(content.basics.name || resume.title)}</a>
      <nav>${navigationLinks}</nav>
      <p>独立网页简历<br>可部署至 GitHub Pages</p>
    </aside>` : "";
  const portfolioEnd = interactive ? "</div>" : "";
  const mobileNavigation = interactive && navigationLinks
    ? `<details class="mobile-nav"><summary>浏览简历章节</summary><nav>${navigationLinks}</nav></details>`
    : "";

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
    :root { --accent: ${accent}; --accent-text: ${accentText}; --ink: #171822; --muted: #626574; --line: #dfddd7; --paper: #fffefb; }
    * { box-sizing: border-box; }
    html { scroll-behavior: smooth; }
    body { margin: 0; color: var(--ink); background: #f2f0eb; font-family: Inter, ui-sans-serif, -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", sans-serif; line-height: 1.55; }
    main { width: min(900px, calc(100% - 32px)); padding: clamp(32px, 7vw, 76px); margin: 40px auto; border-top: 8px solid var(--accent); background: var(--paper); box-shadow: 0 24px 70px rgba(24,24,32,.11); }
    header { padding-bottom: 34px; border-bottom: 1px solid var(--line); }
    h1 { margin: 0; font-size: clamp(2.6rem, 8vw, 5.3rem); line-height: .95; letter-spacing: -.06em; }
    header > p { max-width: 690px; margin: 16px 0 0; color: var(--muted); font-size: 1.05rem; }
    .contact { display: flex; flex-wrap: wrap; gap: 7px 11px; margin-top: 19px; font-size: .82rem; }
    .contact i { color: #aaa; font-style: normal; }
    a { color: var(--accent-text); text-decoration-thickness: 1px; text-underline-offset: 3px; overflow-wrap: anywhere; }
    section { display: grid; grid-template-columns: 145px minmax(0, 1fr); gap: 26px; padding: 30px 0; border-bottom: 1px solid var(--line); }
    section > h2 { margin: 0; color: var(--accent-text); font-size: .7rem; letter-spacing: .12em; text-transform: uppercase; }
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
    section[id] { scroll-margin-top: 24px; }
    .portfolio-shell { display: grid; width: min(1180px, calc(100% - 40px)); grid-template-columns: 220px minmax(0, 900px); align-items: start; gap: 26px; margin: 30px auto 70px; }
    .portfolio-shell main { width: 100%; margin: 0; }
    .portfolio-nav { position: sticky; top: 30px; display: grid; gap: 28px; padding: 22px; border: 1px solid #d8d5ce; border-radius: 18px; background: rgba(255,254,251,.92); box-shadow: 0 14px 42px rgba(24,24,32,.08); backdrop-filter: blur(12px); }
    .mini-brand { color: var(--ink); font-size: .78rem; font-weight: 800; text-decoration: none; }
    .portfolio-nav nav, .mobile-nav nav { display: grid; gap: 4px; }
    .portfolio-nav nav a, .mobile-nav nav a { display: grid; min-height: 40px; grid-template-columns: 27px 1fr; align-items: center; gap: 8px; padding: 0 9px; border-radius: 9px; color: var(--muted); font-size: .72rem; text-decoration: none; transition: color .18s ease, background .18s ease, transform .18s ease; }
    .portfolio-nav nav a:hover, .portfolio-nav nav a:focus-visible, .mobile-nav nav a:hover { color: var(--accent-text); background: color-mix(in srgb, var(--accent) 8%, white); transform: translateX(2px); }
    .portfolio-nav nav span, .mobile-nav nav span { color: var(--accent-text); font-size: .58rem; font-weight: 800; }
    .portfolio-nav > p { margin: 0; color: var(--muted); font-size: .58rem; line-height: 1.6; }
    .mobile-nav { display: none; }
    main.family-academic, main.family-research, main.family-editorial { font-family: Georgia, "Times New Roman", "Songti SC", serif; }
    main.family-academic { border-top-width: 2px; }
    main.family-academic h1 { font-weight: 600; letter-spacing: -.035em; }
    main.family-academic section > h2, main.family-research section > h2, main.family-editorial section > h2 { font-family: Inter, Arial, "PingFang SC", sans-serif; }
    main.family-research { border-top-color: #315952; }
    main.family-research section { grid-template-columns: 120px minmax(0, 1fr); padding-block: 23px; }
    main.family-international header { padding: 28px; border: 0; background: color-mix(in srgb, var(--accent) 9%, white); }
    main.family-product header { padding: 28px; border-left: 8px solid var(--accent); background: #f3f6fb; }
    main.family-product section > h2 { padding-left: 10px; border-left: 3px solid var(--accent); }
    main.family-finance { border-top-width: 2px; font-family: Arial, "Helvetica Neue", "PingFang SC", sans-serif; }
    main.family-finance h1 { font-size: clamp(2.2rem, 7vw, 4.2rem); font-weight: 650; letter-spacing: -.035em; }
    main.family-finance section { padding-block: 22px; }
    main.family-finance section > h2 { color: #1c2e3d; }
    main.family-engineering { border-top-color: #3f4b57; }
    main.family-engineering section > h2 { width: max-content; padding: 5px 8px; color: white; background: #3f4b57; }
    main.family-public { border-top-color: var(--accent); }
    main.family-public section > h2 { padding: 5px 8px; border-left: 4px solid var(--accent); color: #30323a; background: #f5f3f0; }
    main.family-editorial { border-top: 0; border-left: 9px solid var(--accent); }
    main.family-editorial h1 { font-weight: 550; }
    main.density-compact section { padding-block: 21px; }
    main.density-compact .entry + .entry { margin-top: 18px; }
    main.density-spacious section { padding-block: 36px; }
    main.layout-compact section { grid-template-columns: 112px minmax(0, 1fr); gap: 20px; }
    main.layout-compact h1 { font-size: clamp(2.15rem, 7vw, 4.25rem); }
    main.layout-editorial header { border-bottom-width: 2px; }
    main.template-sterling section { border-bottom-color: #cbd1d8; }
    main.template-orbit { border-top-width: 5px; }
    main.template-statecraft section > h2 { letter-spacing: .16em; }
    @media (max-width: 820px) {
      .portfolio-shell { display: block; width: 100%; margin: 0; }
      .portfolio-nav { display: none; }
      .mobile-nav { display: block; padding: 12px 18px; border-bottom: 1px solid var(--line); background: var(--paper); }
      .mobile-nav summary { cursor: pointer; color: var(--accent-text); font-size: .72rem; font-weight: 750; }
      .mobile-nav nav { padding-top: 9px; }
    }
    @media (max-width: 640px) {
      main { width: 100%; padding: 30px 22px; margin: 0; box-shadow: none; }
      section { grid-template-columns: 1fr; gap: 13px; }
      .entry-head { flex-direction: column; gap: 5px; }
      .extras { grid-template-columns: 1fr; }
    }
    @media (prefers-reduced-motion: reduce) {
      html { scroll-behavior: auto; }
      .portfolio-nav nav a, .mobile-nav nav a { transition: none; }
    }
    @media print {
      body { background: white; }
      main { width: 100%; padding: 0; margin: 0; box-shadow: none; }
      a { color: inherit; text-decoration: none; }
      .portfolio-shell { display: block; width: 100%; margin: 0; }
      .portfolio-nav, .mobile-nav { display: none; }
    }
  </style>
</head>
<body class="${interactive ? "interactive-site" : "static-site"}">
  ${mobileNavigation}
  ${portfolioStart}
  <main id="top" class="family-${design.family} layout-${layout} density-${design.density} template-${templateId}" data-template-family="${design.family}" data-template-id="${templateId}" data-web-variant="${interactive ? "interactive" : "static"}">
    <header>
      <h1>${escapeHtml(content.basics.name || "你的姓名")}</h1>
      ${content.basics.headline ? `<p>${escapeHtml(content.basics.headline)}</p>` : ""}
      ${contact ? `<div class="contact">${contact}</div>` : ""}
    </header>
    ${section("profile", "个人简介", content.summary ? `<p>${escapeHtml(content.summary)}</p>` : "")}
    ${section("education", "教育经历", education)}
    ${section("experience", "工作与实践", experience)}
    ${section("projects", "项目经历", projects)}
    ${section("extras", "技能与其他", extras ? `<div class="extras">${extras}</div>` : "")}
    <footer>由简迹 CV 导出 · 请以本人核验后的内容为准</footer>
  </main>
  ${portfolioEnd}
</body>
</html>`;
}
