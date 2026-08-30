"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowRight,
  ArrowUpRight,
  Check,
  Code2,
  Download,
  ExternalLink,
  Github,
  Globe2,
  LoaderCircle,
  LockKeyhole,
  UploadCloud,
} from "lucide-react";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { toStandaloneHtml } from "@/lib/web-resume";
import type { ResumeRecord, ResumeTemplate } from "@/types/resume";
import styles from "./web-resume.module.css";

export function WebResumeClient() {
  const [resumes, setResumes] = useState<ResumeRecord[]>([]);
  const [templates, setTemplates] = useState<ResumeTemplate[]>([]);
  const [resumeId, setResumeId] = useState("");
  const [includeContact, setIncludeContact] = useState(false);
  const [acknowledged, setAcknowledged] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const controller = new AbortController();
    Promise.all([
      fetch("/api/resumes", { signal: controller.signal }),
      fetch("/api/templates", { signal: controller.signal }),
    ]).then(async ([resumeResponse, templateResponse]) => {
      const resumeResult = await resumeResponse.json() as { resumes?: ResumeRecord[]; error?: { message?: string } };
      const templateResult = await templateResponse.json() as { templates?: ResumeTemplate[]; error?: { message?: string } };
      if (!resumeResponse.ok) throw new Error(resumeResult.error?.message ?? "简历加载失败");
      if (!templateResponse.ok) throw new Error(templateResult.error?.message ?? "模板加载失败");
      const items = resumeResult.resumes ?? [];
      setResumes(items);
      setTemplates(templateResult.templates ?? []);
      setResumeId(items[0]?.id ?? "");
    }).catch((reason: unknown) => {
      if ((reason as Error).name !== "AbortError") setError((reason as Error).message);
    }).finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const resume = useMemo(() => resumes.find((item) => item.id === resumeId), [resumeId, resumes]);
  const template = templates.find((item) => item.id === resume?.templateId);
  const previewHtml = useMemo(
    () => resume ? toStandaloneHtml(resume, { includeContact, template }) : "",
    [includeContact, resume, template],
  );
  const exportUrl = resume
    ? `/api/resumes/${resume.id}/export?format=github-pages&includeContact=${includeContact}`
    : "";

  function download() {
    if (!acknowledged || !exportUrl) return;
    window.location.assign(exportUrl);
  }

  return (
    <main className={styles.page}>
      <SiteHeader />
      <section className={styles.hero}>
        <div className={`shell ${styles.heroGrid}`}>
          <div>
            <p className="eyebrow">GitHub Pages 网页简历</p>
            <h1>把一份 CV，变成你的公开主页。</h1>
            <p>导出一个无远程依赖、可离线打开的 <code>index.html</code>。上传到 GitHub Pages，即可获得长期可分享的个人网页。</p>
            <div className={styles.heroBadges}><span><Code2 size={15} /> 单文件</span><span><LockKeyhole size={15} /> 严格转义</span><span><Globe2 size={15} /> 响应式页面</span></div>
          </div>
          <div className={styles.codeCard} aria-hidden="true">
            <div><i /><i /><i /><span>index.html</span></div>
            <pre><code>{`<!doctype html>\n<html lang="zh-CN">\n  <head>…</head>\n  <body>\n    <main>Your story</main>\n  </body>\n</html>`}</code></pre>
          </div>
        </div>
      </section>

      <section className={styles.exportSection}>
        <div className={`shell ${styles.exportGrid}`}>
          <div className={styles.controls}>
            <div className={styles.sectionTitle}><p className="eyebrow">生成部署文件</p><h2>选择要公开的目标版本</h2></div>
            {loading ? <p className={styles.loading}><LoaderCircle size={17} /> 正在读取你的草稿…</p> : resumes.length ? (
              <>
                <label className={styles.selectLabel}><span>目标版本</span><select value={resumeId} onChange={(event) => { setResumeId(event.target.value); setAcknowledged(false); }}>{resumes.map((item) => <option value={item.id} key={item.id}>{item.title}</option>)}</select></label>
                <div className={styles.privacyBox}>
                  <div><AlertTriangle size={19} /><div><strong>GitHub Pages 通常是公开网页</strong><p>默认隐藏邮箱、电话和所在地；网站链接仍会保留。导出前请再次检查正文是否包含敏感信息。</p></div></div>
                  <label><input type="checkbox" checked={includeContact} onChange={(event) => setIncludeContact(event.target.checked)} /><span><Check size={13} /></span>在网页中包含邮箱、电话和所在地</label>
                  <label><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} /><span><Check size={13} /></span>我已检查内容，并理解部署后任何人都可能访问</label>
                </div>
                <button className="button button-primary" type="button" disabled={!acknowledged || !resume} onClick={download}><Download size={17} /> 下载 index.html</button>
                <p className={styles.noOauth}>当前提供“上传即用”的导出文件，不会请求你的 GitHub 账号权限。</p>
              </>
            ) : (
              <div className={styles.empty}><Github size={27} /><h3>还没有可导出的简历</h3><p>先创建并填写一份目标版本，再回来生成网页。</p><Link className="button button-primary" href="/explore">开始创建 <ArrowRight size={16} /></Link></div>
            )}
            {error && <p className={styles.error} role="alert">{error}</p>}
          </div>
          <div className={styles.previewPanel}>
            <div className={styles.browserBar}><i /><i /><i /><span>实际导出内容预览 · your-name.github.io</span></div>
            <div className={styles.previewCanvas}>{resume ? <iframe title="网页简历导出预览" srcDoc={previewHtml} sandbox="" /> : <div><Globe2 size={30} /><span>网页预览将在这里出现</span></div>}</div>
          </div>
        </div>
      </section>

      <section className={styles.stepsSection}>
        <div className="shell">
          <div className={styles.stepsHeader}><div><p className="eyebrow">3 步部署</p><h2>不需要配置服务器</h2></div><a href="https://docs.github.com/en/pages/getting-started-with-github-pages" target="_blank" rel="noreferrer">GitHub Pages 官方文档 <ExternalLink size={15} /></a></div>
          <div className={styles.stepsGrid}>
            <article><span>01</span><Download size={21} /><h3>导出单文件</h3><p>下载名为 <code>index.html</code> 的网页简历，先在本地浏览器中打开并核对。</p></article>
            <article><span>02</span><Github size={21} /><h3>创建 GitHub 仓库</h3><p>建立新的公开仓库并上传文件。个人主页仓库可命名为 <code>用户名.github.io</code>。</p><a href="https://github.com/new" target="_blank" rel="noreferrer">新建仓库 <ArrowUpRight size={14} /></a></article>
            <article><span>03</span><UploadCloud size={21} /><h3>开启 GitHub Pages</h3><p>在仓库 Settings → Pages 选择主分支，等待部署完成后访问公开网址。</p></article>
          </div>
        </div>
      </section>
      <SiteFooter />
    </main>
  );
}
