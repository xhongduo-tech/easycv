"use client";

import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from "react";
import {
  AlertTriangle,
  Check,
  FileArchive,
  FileJson,
  FileText,
  Image as ImageIcon,
  LoaderCircle,
  Plus,
  ShieldCheck,
  UploadCloud,
  X,
} from "lucide-react";
import {
  createImageEvidenceDraft,
  getImportCapacityWarnings,
  mergeImportDrafts,
  mergeImportedContent,
  parseResumeImportJson,
  parseResumeImportText,
  type ResumeImportDraft,
} from "@/lib/resume-import";
import { assertSafeLocalDocx, assertSafeLocalImage } from "@/lib/local-file-safety";
import { normalizeMammothHtml } from "@/lib/docx-html";
import type { ResumeContent } from "@/types/resume";
import type { DocxWorkerResponse } from "./docx-import.worker";
import styles from "./builder.module.css";

type ImportMode = "documents" | "images";
type EvidenceDestination = "awards" | "skills" | "summary";

const MAX_TEXT_FILE_BYTES = 1_000_000;
const MAX_DOCX_FILE_BYTES = 8_000_000;
const MAX_IMAGE_FILE_BYTES = 12_000_000;
const ACCEPTED_IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

export function ImportDialog({
  current,
  onApply,
  onClose,
}: {
  current: ResumeContent;
  onApply: (content: ResumeContent) => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const imageRef = useRef<HTMLInputElement>(null);
  const imageUrlRef = useRef("");
  const pendingImageUrlRef = useRef("");
  const mountedRef = useRef(true);
  const busyRef = useRef(false);
  const cancelDocxRef = useRef<(() => void) | null>(null);
  const [mode, setMode] = useState<ImportMode>("documents");
  const [sourceText, setSourceText] = useState("");
  const [draft, setDraft] = useState<ResumeImportDraft | null>(null);
  const [sources, setSources] = useState<string[]>([]);
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [restoreExactContent, setRestoreExactContent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [error, setError] = useState("");
  const [imagePreview, setImagePreview] = useState<{ url: string; name: string; size: number } | null>(null);
  const [evidenceText, setEvidenceText] = useState("");
  const [evidenceDestination, setEvidenceDestination] = useState<EvidenceDestination>("awards");

  useEffect(() => {
    mountedRef.current = true;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.setTimeout(() => closeRef.current?.focus(), 0);
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        if (!busyRef.current) onClose();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        'button:not([disabled]):not([tabindex="-1"]), input:not([disabled]):not([tabindex="-1"]), textarea:not([disabled]), select:not([disabled]), [href]',
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKeyDown);
    return () => {
      mountedRef.current = false;
      cancelDocxRef.current?.();
      cancelDocxRef.current = null;
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", onKeyDown);
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      if (pendingImageUrlRef.current && pendingImageUrlRef.current !== imageUrlRef.current) {
        URL.revokeObjectURL(pendingImageUrlRef.current);
      }
      imageUrlRef.current = "";
      pendingImageUrlRef.current = "";
      window.setTimeout(() => { if (opener?.isConnected) opener.focus(); }, 0);
    };
  }, [onClose]);

  function addDraft(next: ResumeImportDraft) {
    if (!mountedRef.current) return;
    setDraft((currentDraft) => mergeImportDrafts(currentDraft, next));
    setSources((currentSources) => currentSources.includes(next.sourceName)
      ? currentSources
      : [...currentSources, next.sourceName].slice(0, 12));
    setRestoreExactContent(false);
    setError("");
  }

  function clearCandidate() {
    setDraft(null);
    setSources([]);
    setReplaceExisting(false);
    setRestoreExactContent(false);
    setSourceText("");
    setEvidenceText("");
    setError("");
    if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    if (pendingImageUrlRef.current && pendingImageUrlRef.current !== imageUrlRef.current) {
      URL.revokeObjectURL(pendingImageUrlRef.current);
    }
    imageUrlRef.current = "";
    pendingImageUrlRef.current = "";
    setImagePreview(null);
    if (fileRef.current) fileRef.current.value = "";
    if (imageRef.current) imageRef.current.value = "";
  }

  function parsePastedText() {
    setError("");
    try {
      const trimmed = sourceText.trim();
      if (!trimmed) throw new Error("请先粘贴文字或选择文件");
      const next = trimmed.startsWith("{")
        ? parseResumeImportJson(trimmed, "粘贴的 JSON")
        : parseResumeImportText(trimmed, { sourceName: "粘贴文字" });
      addDraft(next);
    } catch (reason) {
      setError((reason as Error).message || "无法识别这段内容");
    }
  }

  function handleModeKeyDown(event: ReactKeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const nextMode = event.key === "ArrowLeft" || event.key === "Home" ? "documents" : "images";
    setMode(nextMode);
    window.requestAnimationFrame(() => document.getElementById(`import-tab-${nextMode}`)?.focus());
  }

  async function handleFiles(fileList: FileList | File[]) {
    if (busyRef.current) {
      setError("另一份文件仍在读取，请完成后再继续添加");
      return;
    }
    const files = Array.from(fileList);
    if (!files.length) return;
    if (files.length > 8) {
      setError("一次最多读取 8 份资料，请分批添加；本次尚未读取文件");
      return;
    }
    if (files.filter((file) => ACCEPTED_IMAGE_TYPES.has(file.type)).length > 1) {
      setError("图片需要逐张选择、核对并加入候选稿，当前这次没有读取这些图片");
      return;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    try {
      for (const file of files) {
        if (!mountedRef.current) break;
        await handleFile(file);
      }
    } catch (reason) {
      if (mountedRef.current) setError((reason as Error).message || "文件读取失败");
    } finally {
      busyRef.current = false;
      if (mountedRef.current) setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
      if (imageRef.current) imageRef.current.value = "";
    }
  }

  async function handleFile(file: File) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (ACCEPTED_IMAGE_TYPES.has(file.type)) {
      if (file.size > MAX_IMAGE_FILE_BYTES) throw new Error(`${file.name} 超过 12 MB 图片上限`);
      assertSafeLocalImage(await file.arrayBuffer(), file.type);
      if (!mountedRef.current) return;
      const url = URL.createObjectURL(file);
      pendingImageUrlRef.current = url;
      try {
        await decodeLocalImage(url);
      } catch {
        if (pendingImageUrlRef.current === url) {
          URL.revokeObjectURL(url);
          pendingImageUrlRef.current = "";
        }
        throw new Error(`${file.name} 无法完整解码，请重新导出或转换图片后再试`);
      }
      if (!mountedRef.current) return;
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
      imageUrlRef.current = url;
      pendingImageUrlRef.current = "";
      setImagePreview({ url, name: file.name, size: file.size });
      setMode("images");
      return;
    }
    if (extension === "docx") {
      if (file.size > MAX_DOCX_FILE_BYTES) throw new Error(`${file.name} 超过 8 MB Word 本地解析上限`);
      const arrayBuffer = await file.arrayBuffer();
      await assertSafeLocalDocx(arrayBuffer);
      if (!mountedRef.current) return;
      const task = startDocxConversion(arrayBuffer);
      cancelDocxRef.current = task.cancel;
      const result = await task.result.finally(() => { cancelDocxRef.current = null; });
      if (!mountedRef.current) return;
      const candidate = parseResumeImportText(normalizeMammothHtml(result.html), {
        sourceName: file.name,
        sourceKind: "docx",
      });
      candidate.warnings.push(...result.messages.map((message) => `Word 转换提示：${message}`));
      addDraft(candidate);
      return;
    }
    if (!["txt", "md", "markdown", "json"].includes(extension ?? "")) {
      throw new Error(`${file.name} 的格式暂不支持；首版支持 TXT、Markdown、JSON、DOCX、JPEG、PNG、WebP`);
    }
    if (file.size > MAX_TEXT_FILE_BYTES) throw new Error(`${file.name} 超过 1 MB 文字文件上限`);
    const text = await file.text();
    addDraft(extension === "json"
      ? parseResumeImportJson(text, file.name)
      : parseResumeImportText(text, { sourceName: file.name }));
  }

  function addImageEvidence() {
    setError("");
    try {
      if (!imagePreview) throw new Error("请先选择一张图片");
      addDraft(createImageEvidenceDraft(evidenceText, evidenceDestination, imagePreview.name));
      setEvidenceText("");
    } catch (reason) {
      setError((reason as Error).message || "无法加入这条图片证据");
    }
  }

  function applyDraft() {
    if (!draft) {
      setError("还没有可合并的候选内容");
      return;
    }
    try {
      const canRestoreExact = draft.confidence === "exact" && sources.length === 1;
      onApply(canRestoreExact && restoreExactContent
        ? draft.content
        : mergeImportedContent(current, draft.content, { replaceExisting }));
      onClose();
    } catch (reason) {
      setError((reason as Error).message || "候选稿无法合并，请先精简内容");
    }
  }

  const canRestoreExact = draft?.confidence === "exact" && sources.length === 1;
  const reviewWarnings = draft
    ? [...new Set([
        ...draft.warnings,
        ...(!canRestoreExact || !restoreExactContent ? getImportCapacityWarnings(current, draft.content) : []),
      ])]
    : [];

  return (
    <div className={styles.importBackdrop} onMouseDown={(event) => { if (!busy && event.target === event.currentTarget) onClose(); }}>
      <div ref={dialogRef} className={styles.importDialog} role="dialog" aria-modal="true" aria-labelledby="import-title">
        <header className={styles.importHeader}>
          <div>
            <span><UploadCloud size={19} /></span>
            <div><small>多源资料工作台</small><h2 id="import-title">导入并整理资料</h2></div>
          </div>
          <button ref={closeRef} type="button" disabled={busy} onClick={onClose} aria-label={busy ? "正在读取文件，请稍候" : "关闭导入"}><X size={20} /></button>
        </header>

        <div className={styles.importPrivacy}>
          <ShieldCheck size={18} />
          <div><strong>原文件只在这台设备中读取</strong><p>Word、文字和图片原件不会上传；系统只会把你确认后的结构化文字合并进当前简历。</p></div>
        </div>

        <div className={styles.importTabs} role="tablist" aria-label="导入资料类型">
          <button id="import-tab-documents" type="button" role="tab" aria-controls="import-source-panel" aria-selected={mode === "documents"} tabIndex={mode === "documents" ? 0 : -1} className={mode === "documents" ? styles.importTabActive : ""} onKeyDown={handleModeKeyDown} onClick={() => setMode("documents")}><FileText size={16} /> 文档与文字</button>
          <button id="import-tab-images" type="button" role="tab" aria-controls="import-source-panel" aria-selected={mode === "images"} tabIndex={mode === "images" ? 0 : -1} className={mode === "images" ? styles.importTabActive : ""} onKeyDown={handleModeKeyDown} onClick={() => setMode("images")}><ImageIcon size={16} /> 图片与证书</button>
        </div>

        <div className={styles.importBody}>
          <section id="import-source-panel" className={styles.importSourcePanel} role="tabpanel" aria-labelledby={`import-tab-${mode}`}>
            {mode === "documents" ? (
              <>
                <div
                  className={`${styles.importDropzone} ${dragActive ? styles.importDropzoneActive : ""}`}
                  onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }}
                  onDragOver={(event) => event.preventDefault()}
                  onDragLeave={(event) => { if (event.currentTarget === event.target) setDragActive(false); }}
                  onDrop={(event) => { event.preventDefault(); setDragActive(false); void handleFiles(event.dataTransfer.files); }}
                >
                  <input ref={fileRef} type="file" multiple tabIndex={-1} aria-hidden="true" accept=".txt,.md,.markdown,.json,.docx,image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); }} />
                  <span><UploadCloud size={25} /></span>
                  <strong>拖入简历、经历材料或本产品备份</strong>
                  <p>支持 TXT、Markdown、JSON、DOCX。Word 保留可识别的章节与列表线索，原版式和图片不会保留；拖入图片会切换到人工摘录流程。</p>
                  <button type="button" onClick={() => fileRef.current?.click()} disabled={busy}>{busy ? <><LoaderCircle className={styles.spin} size={15} /> 正在本地读取</> : "选择本地文件"}</button>
                </div>
                <label className={styles.importPaste}>
                  <span>或粘贴现有简历文字</span>
                  <textarea rows={8} value={sourceText} onChange={(event) => setSourceText(event.target.value)} placeholder={'姓名与联系方式\n\n个人简介\n…\n\n教育经历\n…'} />
                </label>
                <button className="button button-secondary" type="button" disabled={busy} onClick={parsePastedText}><Plus size={15} /> 生成候选稿</button>
              </>
            ) : (
              <>
                <input ref={imageRef} className="sr-only" type="file" tabIndex={-1} aria-hidden="true" accept="image/jpeg,image/png,image/webp" onChange={(event) => { if (event.target.files) void handleFiles(event.target.files); }} />
                {imagePreview ? (
                  <div className={styles.imageEvidencePreview}>
                    {/* The URL is a local object URL and is revoked when the dialog closes. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={imagePreview.url} alt={`${imagePreview.name} 本地预览`} />
                    <div><strong>{imagePreview.name}</strong><span>{formatBytes(imagePreview.size)} · 仅本机预览</span></div>
                    <button type="button" disabled={busy} onClick={() => imageRef.current?.click()}>更换图片</button>
                  </div>
                ) : (
                  <button className={styles.imagePicker} type="button" disabled={busy} onClick={() => imageRef.current?.click()}>
                    <span><ImageIcon size={25} /></span><strong>选择证书、技能证明或项目截图</strong><small>JPEG / PNG / WebP，最大 12 MB</small>
                  </button>
                )}
                <div className={styles.imageEvidenceForm}>
                  <label><span>这张图可以证明什么</span><textarea rows={6} value={evidenceText} onChange={(event) => setEvidenceText(event.target.value)} placeholder="请根据原图核对后输入证书名称、技能或一段可验证经历；每行可写一项。" /></label>
                  <label><span>合并到</span><select value={evidenceDestination} onChange={(event) => setEvidenceDestination(event.target.value as EvidenceDestination)}><option value="awards">奖项与证书</option><option value="skills">技能</option><option value="summary">个人简介</option></select></label>
                  <button className="button button-secondary" type="button" onClick={addImageEvidence} disabled={!imagePreview || busy}><Check size={15} /> 确认文字并加入候选稿</button>
                </div>
                <p className={styles.imageBoundary}><AlertTriangle size={15} /> 当前版本不会自动 OCR，也不会保存原图；图片本身不会进入简历或导出。只有你核对后输入的文字会加入候选稿。</p>
              </>
            )}
          </section>

          <aside className={styles.importReviewPanel} aria-live="polite">
            <div className={styles.importReviewHeading}>
              <span>待确认候选稿</span>
              <div><em>{draft ? confidenceLabel(draft.confidence) : "等待资料"}</em>{draft && <button type="button" disabled={busy} onClick={clearCandidate}>清空候选稿</button>}</div>
            </div>
            {!draft ? (
              <div className={styles.importEmpty}><FileArchive size={28} /><strong>先加入一份或多份资料</strong><p>系统会在这里列出识别结果，再由你决定是否合并。</p></div>
            ) : (
              <>
                {sources.length > 0 && <div className={styles.importSources}><strong>资料来源</strong><div>{sources.map((source) => <span key={source}>{source.endsWith(".json") ? <FileJson size={13} /> : <FileText size={13} />}{source}</span>)}</div></div>}
                <div className={styles.importDetected}><strong>已识别</strong><div>{draft.detected.length ? draft.detected.map((item) => <span key={item}><Check size={12} /> {item}</span>) : <p>尚未识别到结构化字段</p>}</div></div>
                <CandidateDetails content={draft.content} />
                {reviewWarnings.length > 0 && <div className={styles.importWarnings}><strong><AlertTriangle size={14} /> 合并前请核对</strong><ul>{reviewWarnings.map((warning) => <li key={warning}>{warning}</li>)}</ul></div>}
                {canRestoreExact ? (
                  <label className={styles.importReplace}><input type="checkbox" checked={restoreExactContent} onChange={(event) => setRestoreExactContent(event.target.checked)} /><span><Check size={12} /></span><div><strong>用这份 JSON 完整替换当前简历正文</strong><small>恢复个人信息、简介、教育、经历、项目和列表；不会修改简历名称、目标、模板、状态或岗位依据。</small></div></label>
                ) : (
                  <label className={styles.importReplace}><input type="checkbox" checked={replaceExisting} onChange={(event) => setReplaceExisting(event.target.checked)} /><span><Check size={12} /></span><div><strong>允许候选稿覆盖已有的个人信息和简介</strong><small>经历、项目、技能、语言和奖项采用有限签名去重追加；多源差异请按上方警告核对。</small></div></label>
                )}
              </>
            )}
            {error && <p className={styles.importError} role="alert">{error}</p>}
          </aside>
        </div>

        <footer className={styles.importFooter}>
          <span>{draft ? "合并后会进入现有自动保存与修订冲突保护。" : "不会在你确认前修改简历。"}</span>
          <div><button className="button button-ghost" type="button" disabled={busy} onClick={onClose}>取消</button><button className="button button-primary" type="button" disabled={!draft || busy} onClick={applyDraft}><Check size={16} /> {canRestoreExact && restoreExactContent ? "完整恢复正文" : "合并到当前简历"}</button></div>
        </footer>
      </div>
    </div>
  );
}

function CandidateDetails({ content }: { content: ResumeContent }) {
  const basics = [
    ["姓名", content.basics.name],
    ["职业定位", content.basics.headline],
    ["邮箱", content.basics.email],
    ["电话", content.basics.phone],
    ["所在地", content.basics.location],
    ["个人链接", content.basics.website],
  ].filter(([, value]) => Boolean(value));
  const hasContent = basics.length > 0 || Boolean(content.summary) || content.education.length > 0
    || content.experience.length > 0 || content.projects.length > 0 || content.skills.length > 0
    || content.languages.length > 0 || content.awards.length > 0;
  return (
    <details open className={styles.importCandidateDetails}>
      <summary>展开并核对全部候选内容</summary>
      <div className={styles.importCandidateContent}>
        {!hasContent && <p>尚未形成可预览的字段。</p>}
        {basics.length > 0 && <section><h4>个人信息</h4><dl>{basics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
        {content.summary && <section><h4>个人简介</h4><p>{content.summary}</p></section>}
        {content.education.length > 0 && <section><h4>教育经历</h4>{content.education.map((item) => <article key={item.id}><strong>{item.school}</strong><span>{[item.degree, item.major, formatDateRange(item.startDate, item.endDate), item.location].filter(Boolean).join(" · ")}</span>{item.score && <p>{item.score}</p>}{item.highlights.length > 0 && <ul>{item.highlights.map((line, index) => <li key={`${item.id}-highlight-${index}`}>{line}</li>)}</ul>}</article>)}</section>}
        {content.experience.length > 0 && <section><h4>工作与实践</h4>{content.experience.map((item) => <article key={item.id}><strong>{[item.organization, item.role].filter(Boolean).join(" · ")}</strong><span>{[formatDateRange(item.startDate, item.endDate), item.location].filter(Boolean).join(" · ")}</span>{item.bullets.length > 0 && <ul>{item.bullets.map((line, index) => <li key={`${item.id}-bullet-${index}`}>{line}</li>)}</ul>}</article>)}</section>}
        {content.projects.length > 0 && <section><h4>项目经历</h4>{content.projects.map((item) => <article key={item.id}><strong>{[item.name, item.role].filter(Boolean).join(" · ")}</strong><span>{[item.date, item.link].filter(Boolean).join(" · ")}</span>{item.bullets.length > 0 && <ul>{item.bullets.map((line, index) => <li key={`${item.id}-bullet-${index}`}>{line}</li>)}</ul>}</article>)}</section>}
        <CandidateStringList title="技能" values={content.skills} />
        <CandidateStringList title="语言" values={content.languages} />
        <CandidateStringList title="奖项与证书" values={content.awards} />
      </div>
    </details>
  );
}

function CandidateStringList({ title, values }: { title: string; values: string[] }) {
  if (!values.length) return null;
  return <section><h4>{title}</h4><ul>{values.map((value, index) => <li key={`${title}-${index}`}>{value}</li>)}</ul></section>;
}

function formatDateRange(start: string, end: string) {
  return [start, end].filter(Boolean).join(" — ");
}

function confidenceLabel(value: ResumeImportDraft["confidence"]) {
  if (value === "exact") return "可恢复正文";
  if (value === "structured") return "自动识别";
  return "人工核对";
}

function formatBytes(bytes: number) {
  if (bytes < 1_000_000) return `${Math.max(1, Math.round(bytes / 1_000))} KB`;
  return `${(bytes / 1_000_000).toFixed(1)} MB`;
}

async function decodeLocalImage(url: string) {
  const image = new Image();
  image.decoding = "async";
  image.src = url;
  await image.decode();
  if (!image.naturalWidth || !image.naturalHeight) throw new Error("图片没有可读取的像素内容");
}

function startDocxConversion(arrayBuffer: ArrayBuffer) {
  const worker = new Worker(new URL("./docx-import.worker.ts", import.meta.url), {
    type: "module",
    name: "resume-docx-import",
  });
  let cancel = () => undefined as void;
  const result = new Promise<Extract<DocxWorkerResponse, { ok: true }>>((resolve, reject) => {
    let settled = false;
    const finish = (response: DocxWorkerResponse) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      worker.terminate();
      if (response.ok) resolve(response);
      else reject(new Error(response.error));
    };
    const timeout = setTimeout(() => finish({
      ok: false,
      error: "Word 转换时间过长，请另存为精简的 DOCX 或导入纯文字",
    }), 10_000);
    worker.onmessage = (event: MessageEvent<DocxWorkerResponse>) => finish(event.data);
    worker.onerror = () => finish({ ok: false, error: "Word 解析无法完成，请尝试导入纯文字" });
    worker.onmessageerror = () => finish({ ok: false, error: "Word 解析结果无法读取" });
    cancel = () => finish({ ok: false, error: "Word 导入已取消" });
    try {
      worker.postMessage({ arrayBuffer }, [arrayBuffer]);
    } catch {
      finish({ ok: false, error: "当前浏览器无法启动 Word 解析，请尝试导入纯文字" });
    }
  });
  return { result, cancel: () => cancel() };
}
