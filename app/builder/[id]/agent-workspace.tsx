"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertCircle, ArrowRight, Check, CheckCircle2, ChevronDown, CircleHelp,
  Clock3, Copy, Download, FileText, LoaderCircle, RefreshCw, ShieldCheck, Sparkles, X,
} from "lucide-react";
import type { AgentJob, AgentResult, AgentRuntime } from "@/lib/agent-contract";
import { safeFilename } from "@/lib/resume-document";
import type { ResumeRecord } from "@/types/resume";
import styles from "./agent-workspace.module.css";

type SaveStatus = "saved" | "saving" | "error" | "pending";
type JobResponse = { job: AgentJob; resume?: ResumeRecord };
type JobsResponse = { jobs: AgentJob[]; runtime: AgentRuntime };
const activeStatuses = new Set<AgentJob["status"]>(["queued", "running", "waiting_input"]);
const statusLabels: Record<AgentJob["status"], string> = {
  queued: "等待执行", running: "正在整理材料", waiting_input: "等待你的补充", ready: "候选材料已就绪",
  applied: "已应用所选修改", failed: "任务未完成", cancelled: "已取消", expired: "任务已到期",
};

class AgentRequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const timeout = AbortSignal.timeout(20_000);
  const response = await fetch(url, { cache: "no-store", ...init,
    signal: init?.signal ? AbortSignal.any([timeout, init.signal]) : timeout });
  const result = await response.json().catch(() => null) as (T & { error?: { message?: string } }) | null;
  if (!response.ok || !result) throw new AgentRequestError(result?.error?.message ?? "暂时无法连接任务服务，请稍后重试。", response.status);
  return result;
}

function post<T>(url: string, body: object) {
  return request<T>(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
}

function jobDate(date: string) {
  return new Date(date).toLocaleString("zh-CN", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

function evidenceFor(job: AgentJob, evidenceIds: string[]) {
  return evidenceIds.map((id) => {
    const source = job.input.sources.find((item) => item.id === id);
    if (source) return { id, label: source.label, text: source.text, kind: "原始材料" };
    const answer = job.input.answers.find((item) => `answer:${item.questionId}` === id);
    return { id, label: answer?.question ?? "来源暂不可用", text: answer?.text ?? "请核对原始材料后再使用。", kind: "本人补充" };
  });
}

function Evidence({ job, ids }: { job: AgentJob; ids: string[] }) {
  return (
    <details className={styles.evidence}>
      <summary><FileText size={13} /> 查看 {ids.length} 处来源 <ChevronDown size={13} /></summary>
      <div className={styles.evidenceBody}>
        {evidenceFor(job, ids).map((item) => <div key={item.id}><span>{item.kind} · {item.label}</span><p>{item.text}</p></div>)}
        <small>来源是你提供的材料或补充，尚未经过外部核验。</small>
      </div>
    </details>
  );
}

function interviewText(job: AgentJob, result: AgentResult) {
  return [
    `面试与沟通提纲 · ${job.input.focusName || job.input.targetName}`,
    "基于本次任务的材料快照。请核对事实，并按自己的实际经历准备回答。", "",
    ...result.interview.flatMap((item, index) => [
      `${index + 1}. ${item.question}`, item.answerOutline, "",
      ...evidenceFor(job, item.evidenceIds).map((source) => `来源（${source.kind} · ${source.label}）：${source.text}`), "",
    ]),
  ].join("\n");
}

export function AgentWorkspace({ resume, saveStatus, onApplied, onApplying }: {
  resume: ResumeRecord;
  saveStatus: SaveStatus;
  onApplied: (resume: ResumeRecord) => void;
  onApplying?: (applying: boolean) => void;
}) {
  const [jobs, setJobs] = useState<AgentJob[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [runtime, setRuntime] = useState<AgentRuntime | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [consent, setConsent] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [selection, setSelection] = useState<{ key: string; ids: string[]; confirmed: boolean }>({ key: "", ids: [], confirmed: false });
  const creating = useRef(false);
  const createRequest = useRef<{ signature: string; id: string } | null>(null);
  const job = jobs.find((item) => item.id === selectedId) ?? jobs[0] ?? null;
  const versionKey = job ? `${job.id}:${job.version}` : "";
  const selectedProposalIds = selection.key === versionKey ? selection.ids : [];
  const confirmed = selection.key === versionKey && selection.confirmed;
  const briefRevision = resume.targetBrief?.revision ?? 0;
  const stale = Boolean(job && (job.baseResumeRevision !== resume.revision || job.baseBriefRevision !== briefRevision));
  const saved = saveStatus === "saved";
  const hasSources = Boolean(resume.content.summary.trim()
    || resume.content.education.some((item) => item.highlights.some((text) => text.trim()))
    || resume.content.experience.some((item) => item.bullets.some((text) => text.trim()))
    || resume.content.projects.some((item) => item.bullets.some((text) => text.trim())));
  const hasTarget = Boolean(resume.targetBrief?.focusName.trim() && resume.targetBrief?.requirementsText.trim());
  const loginRequired = Boolean(runtime?.reason?.includes("登录"));
  const activeJob = jobs.find((item) => activeStatuses.has(item.status) || item.status === "ready");
  const result = job?.result;

  const mergeJob = useCallback((next: AgentJob) => {
    setJobs((current) => {
      const existing = current.find((item) => item.id === next.id);
      if (existing && existing.version > next.version) return current;
      return [next, ...current.filter((item) => item.id !== next.id)].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    });
  }, []);

  const loadJobs = useCallback(async (signal?: AbortSignal) => {
    const data = await request<JobsResponse>(`/api/agent-jobs?resumeId=${encodeURIComponent(resume.id)}`, { signal });
    if (signal?.aborted) return;
    setRuntime(data.runtime);
    setJobs((current) => {
      const merged = new Map(current.map((item) => [item.id, item]));
      for (const next of data.jobs) {
        const existing = merged.get(next.id);
        if (!existing || existing.version <= next.version) merged.set(next.id, next);
      }
      return Array.from(merged.values()).filter((item) => Date.parse(item.expiresAt) > Date.now())
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 20);
    });
  }, [resume.id]);

  useEffect(() => {
    const controller = new AbortController();
    // Restore server-owned tasks after hydration; state updates follow the request.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadJobs(controller.signal).catch((reason: unknown) => {
      if (!controller.signal.aborted) setError((reason as Error).message);
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [loadJobs]);

  const pollingId = activeJob?.id ?? (job?.status === "ready" ? job.id : null);
  useEffect(() => {
    if (!pollingId) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;
    const poll = async () => {
      try {
        const data = await request<JobResponse>(`/api/agent-jobs/${pollingId}`, { signal: controller.signal });
        if (!controller.signal.aborted) { mergeJob(data.job); setNotice(""); }
      } catch (reason) {
        if (!controller.signal.aborted) {
          if (reason instanceof AgentRequestError && reason.status === 410) {
            setJobs((current) => current.map((item) => item.id === pollingId
              ? { ...item, status: "expired", result: null, input: { ...item.input, sources: [], answers: [] } } : item));
            stopped = true;
          } else if (reason instanceof AgentRequestError && [401, 403, 404].includes(reason.status)) {
            setError(reason.message);
            stopped = true;
          } else setNotice("连接暂时中断，正在重新连接。任务保留在服务器上。");
        }
      } finally {
        if (!controller.signal.aborted && !stopped) timer = setTimeout(poll, 5000);
      }
    };
    timer = setTimeout(poll, 3500);
    return () => { controller.abort(); clearTimeout(timer); };
  }, [pollingId, mergeJob]);

  async function refresh() {
    setRefreshing(true);
    setError("");
    try { await loadJobs(); setNotice(""); } catch (reason) { setError((reason as Error).message); }
    finally { setRefreshing(false); }
  }

  async function createJob() {
    if (creating.current || busy || !runtime?.enabled || !saved || !consent || activeJob || !hasTarget || !hasSources) return;
    creating.current = true;
    setBusy("create");
    setError("");
    const signature = `${resume.id}:${resume.revision}:${briefRevision}`;
    if (createRequest.current?.signature !== signature) createRequest.current = { signature, id: crypto.randomUUID() };
    try {
      const data = await post<JobResponse>("/api/agent-jobs", {
        resumeId: resume.id, expectedRevision: resume.revision, expectedBriefRevision: briefRevision,
        consent: true, requestId: createRequest.current.id,
      });
      mergeJob(data.job);
      setSelectedId(data.job.id);
      setConsent(false);
      createRequest.current = null;
    } catch (reason) { setError((reason as Error).message); }
    finally { setBusy(""); creating.current = false; }
  }

  async function mutateJob(action: "answers" | "cancel" | "apply") {
    if (!job || busy) return;
    if (action === "apply" && (!saved || stale || !confirmed || !selectedProposalIds.length)) return;
    setBusy(action);
    if (action === "apply") onApplying?.(true);
    setError("");
    const body = action === "answers" ? {
      expectedVersion: job.version,
      answers: job.result?.questions.map((question) => ({ questionId: question.id, text: (answers[`${job.id}:${question.id}`] ?? "").trim() })),
    } : action === "apply" ? {
      expectedVersion: job.version, expectedRevision: resume.revision, expectedBriefRevision: briefRevision,
      proposalIds: selectedProposalIds, confirmed: true,
    } : { expectedVersion: job.version };
    try {
      const send = () => post<JobResponse>(`/api/agent-jobs/${job.id}/${action}`, body);
      let data: JobResponse;
      try { data = await send(); }
      catch (reason) {
        // Application is fenced and idempotent. Recover a lost acknowledgement
        // using the exact selection; never regenerate or silently choose again.
        if (action !== "apply" || (reason instanceof AgentRequestError && reason.status < 500)) throw reason;
        data = await send();
      }
      mergeJob(data.job);
      if (action === "apply" && data.resume) onApplied(data.resume);
    } catch (reason) {
      if (action === "apply" && (!(reason instanceof AgentRequestError) || reason.status >= 500)) {
        try {
          const latest = await request<JobResponse>(`/api/agent-jobs/${job.id}`);
          if (latest.job.status === "applied") {
            const recovered = await request<{ resume: ResumeRecord }>(`/api/resumes/${resume.id}`);
            mergeJob(latest.job);
            onApplied(recovered.resume);
            setNotice("已恢复服务器保存的简历，修改没有重复应用。");
            return;
          }
        } catch { /* Preserve the old draft and explain the uncertain outcome. */ }
        setError("保存回执暂时无法确认，请刷新页面同步服务器版本；系统会拦截旧修订覆盖。");
        void loadJobs().catch(() => undefined);
        return;
      }
      setError((reason as Error).message);
      void loadJobs().catch(() => undefined);
    } finally { setBusy(""); if (action === "apply") onApplying?.(false); }
  }

  async function copyInterview() {
    if (!job || !result) return;
    try { await navigator.clipboard.writeText(interviewText(job, result)); setNotice("面试提纲与来源已复制。"); }
    catch { setError("浏览器未允许复制，请使用下载提纲。"); }
  }

  function downloadInterview() {
    if (!job || !result) return;
    const url = URL.createObjectURL(new Blob([interviewText(job, result)], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `${safeFilename(resume.title)}-面试提纲.txt`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function toggleProposal(id: string) {
    setSelection({ key: versionKey, ids: selectedProposalIds.includes(id) ? selectedProposalIds.filter((item) => item !== id) : [...selectedProposalIds, id], confirmed: false });
  }

  const preparationMessage = !saved
    ? saveStatus === "error" ? "请先解决简历保存问题，再启动或应用任务。" : "正在等待资料保存，保存后即可启动任务。"
    : !hasTarget ? "先在「目标要求」中填写岗位或项目名称与具体要求。"
      : !hasSources ? "先填写个人简介、工作、项目或教育经历中的一项真实内容。" : "";

  return (
    <section className={styles.workspace} aria-labelledby="agent-workspace-title" aria-busy={loading}>
      <header className={styles.header}>
        <span className={styles.brandIcon}><Sparkles size={19} /></span>
        <div><span className={styles.eyebrow}>从真实经历，到下一次机会</span><h2 id="agent-workspace-title">目标材料工作台</h2></div>
        <button className={styles.iconButton} type="button" onClick={() => void refresh()} disabled={loading || refreshing || Boolean(busy)} aria-label="刷新任务"><RefreshCw size={16} className={refreshing ? styles.spin : undefined} /></button>
      </header>

      <p className={styles.intro}>整理证据，补齐关键问题，一起完成目标简历和面试提纲。</p>
      <div className={styles.meta}><span>Codex 执行</span><span>试点期间不扣简迹点</span></div>

      {loading ? <p className={styles.note} role="status"><LoaderCircle size={15} className={styles.spin} /> 正在恢复你的任务…</p>
        : runtime && !runtime.enabled ? <div className={styles.unavailable}><span><Clock3 size={15} /> {loginRequired ? "登录后准备目标材料" : runtime.reason?.includes("待配置") ? "执行服务待配置" : "执行服务暂不可用"}</span><p>{runtime.reason || "Codex 执行服务尚未启用。配置完成后，可在这里启动材料任务。"}</p>{loginRequired && <Link className={styles.loginLink} href={`/auth/login?returnTo=${encodeURIComponent(`/builder/${resume.id}`)}`}>登录并保留这份简历 <ArrowRight size={13} /></Link>}<small>你可以继续编辑、导入和导出简历。</small></div> : null}

      {!loading && runtime?.enabled && !activeJob && (
        <div className={styles.launch}>
          <div className={styles.launchTitle}><strong>{jobs.length ? "为当前资料创建新任务" : "从一个明确目标开始"}</strong><small>每日最多 {runtime.maxJobsPerDay} 个任务</small></div>
          {preparationMessage && <p className={styles.note}><CircleHelp size={15} />{preparationMessage}</p>}
          <label className={styles.checkLabel}><input type="checkbox" checked={consent} disabled={Boolean(busy)} onChange={(event) => setConsent(event.target.checked)} /><span>同意将这份简历的经历、目标要求及本次补充发送给 Codex 处理。候选修改由我核对后应用。</span></label>
          <button type="button" className={styles.primary} disabled={Boolean(busy) || !saved || !hasTarget || !hasSources || !consent} onClick={() => void createJob()}>{busy === "create" ? <LoaderCircle size={16} className={styles.spin} /> : <Sparkles size={16} />}{busy === "create" ? "正在创建…" : "开始准备目标材料"}<ArrowRight size={15} /></button>
        </div>
      )}

      {error && <p className={styles.error} role="alert"><AlertCircle size={15} /> {error}</p>}
      {notice && <p className={styles.note} role="status">{notice}</p>}

      {jobs.length > 1 && <details className={styles.history}><summary>任务记录 · {jobs.length}<ChevronDown size={14} /></summary><div>{jobs.map((item) => <button key={item.id} type="button" disabled={Boolean(busy)} aria-pressed={item.id === job?.id} onClick={() => { setSelectedId(item.id); setError(""); }}><span>{jobDate(item.createdAt)}<small>{item.input.focusName || item.input.targetName}</small></span><em>{statusLabels[item.status]}</em></button>)}</div></details>}
      {activeJob && job?.id !== activeJob.id && <button className={styles.secondary} type="button" disabled={Boolean(busy)} onClick={() => setSelectedId(activeJob.id)}>查看正在进行的任务 <ArrowRight size={14} /></button>}

      {job && <div className={styles.job}>
        <div className={styles.jobHeader}><strong aria-live="polite">{activeStatuses.has(job.status) && job.status !== "waiting_input" ? <LoaderCircle size={16} className={styles.spin} /> : job.status === "applied" || job.status === "ready" ? <CheckCircle2 size={16} /> : <Clock3 size={16} />}{statusLabels[job.status]}</strong><time dateTime={job.updatedAt}>{jobDate(job.updatedAt)}</time></div>
        <p className={styles.target}>{job.input.targetName}{job.input.focusName && ` · ${job.input.focusName}`}</p>

        {(activeStatuses.has(job.status) || job.status === "ready" || job.status === "applied") && <ol className={styles.steps} aria-label="任务进度">{["整理经历", "补充与生成", "审阅交付"].map((label, index) => {
          const step = job.status === "ready" || job.status === "applied" ? 2 : job.status === "waiting_input" || job.input.answers.length ? 1 : 0;
          return <li key={label} data-state={index < step ? "done" : index === step ? "current" : "next"}><span>{index < step ? <Check size={11} /> : index + 1}</span>{label}</li>;
        })}</ol>}

        {(job.status === "queued" || job.status === "running") && <p className={styles.note}>正在根据已保存的经历与目标准备材料。你可以离开此页，回来后继续查看。</p>}
        {stale && job.status !== "applied" && (activeStatuses.has(job.status) || job.status === "ready") && <p className={styles.warning}><AlertCircle size={15} />当前简历或目标已更新。此任务使用此前资料，候选无法直接应用；请根据最新资料创建任务。</p>}
        {job.error && <p className={styles.error} role="alert">{job.error}</p>}
        {(job.status === "cancelled" || job.status === "expired" || job.status === "failed") && <p className={styles.note}>{job.status === "expired" ? "这次任务已超过保留期限。可使用当前资料重新创建。" : job.status === "cancelled" ? "已停止本次任务，简历内容没有被应用修改。" : "简历已保留，可检查服务状态后重新创建任务。"}</p>}
        {result?.summary && <p className={styles.summary}>{result.summary}</p>}

        {job.status === "waiting_input" && result && <form className={styles.questions} onSubmit={(event) => { event.preventDefault(); void mutateJob("answers"); }}>
          <h3><CircleHelp size={16} /> 让经历更具体，还需要你的补充</h3>
          <p>只填写你能确认的信息。不清楚的地方可以直接写「暂时无法确认」。</p>
          {result.questions.map((question, index) => <label key={question.id} className={styles.question}><strong>{index + 1}. {question.question}</strong><span>{question.reason}</span><textarea required maxLength={2000} rows={3} disabled={Boolean(busy)} value={answers[`${job.id}:${question.id}`] ?? ""} onChange={(event) => setAnswers((current) => ({ ...current, [`${job.id}:${question.id}`]: event.target.value }))} placeholder="写下你实际做过的事、具体范围或可支持的结果…" /><small>{(answers[`${job.id}:${question.id}`] ?? "").length} / 2000</small></label>)}
          <button type="submit" className={styles.primary} disabled={Boolean(busy) || stale || !result.questions.length || result.questions.some((question) => !(answers[`${job.id}:${question.id}`] ?? "").trim())}>{busy === "answers" ? <LoaderCircle size={15} className={styles.spin} /> : <ArrowRight size={15} />}提交补充，继续准备</button>
        </form>}

        {(job.status === "ready" || job.status === "applied") && result && <>
          <div className={styles.resultHeading}><h3>简历修改候选</h3><span>{result.proposals.length} 项</span></div>
          <p className={styles.note}>逐条核对表达与来源，只选择你确认准确的修改。</p>
          {!result.proposals.length && <p className={styles.summary}>本次没有可应用的文字修改。可参考任务说明与面试提纲完善材料。</p>}
          <div className={styles.proposals}>{result.proposals.map((proposal, index) => <article key={proposal.id} className={styles.proposal} data-selected={selectedProposalIds.includes(proposal.id)}>
            <label className={styles.proposalSelect}>{job.status === "ready" && <input type="checkbox" disabled={Boolean(busy) || stale || !saved} checked={selectedProposalIds.includes(proposal.id)} onChange={() => toggleProposal(proposal.id)} />}<strong>{index + 1}. {job.input.sources.find((source) => source.id === proposal.sourceId)?.label ?? "经历表达"}</strong></label>
            <div className={styles.original}><span>原文</span><p>{proposal.originalText}</p></div>
            <div className={styles.draft}><span>候选表达</span><p>{proposal.draftText}</p></div>
            <p className={styles.rationale}>{proposal.rationale}</p>
            {proposal.warnings.length > 0 && <ul className={styles.warnings}>{proposal.warnings.map((warning) => <li key={warning}><AlertCircle size={13} />{warning}</li>)}</ul>}
            <Evidence job={job} ids={proposal.evidenceIds} />
          </article>)}</div>
          {job.status === "ready" && result.proposals.length > 0 && <div className={styles.apply}>
            {!saved && <p className={styles.warning}>请先保存编辑中的资料。内容更新后需要重新生成候选。</p>}
            <label className={styles.checkLabel}><input type="checkbox" disabled={Boolean(busy) || !selectedProposalIds.length || stale || !saved} checked={confirmed} onChange={(event) => setSelection({ key: versionKey, ids: selectedProposalIds, confirmed: event.target.checked })} /><span>我已核对所选内容及其来源，确认数字、职责和成果归属准确。</span></label>
            <button type="button" className={styles.primary} disabled={Boolean(busy) || !confirmed || !selectedProposalIds.length || stale || !saved} onClick={() => void mutateJob("apply")}>{busy === "apply" ? <LoaderCircle size={15} className={styles.spin} /> : <Check size={15} />}确认应用 {selectedProposalIds.length} 项修改</button>
          </div>}
          {job.status === "applied" && <p className={styles.success}><CheckCircle2 size={15} /> 所选候选已保存到简历，可预览并使用编辑器导出。</p>}
          {result.interview.length > 0 && <section className={styles.interview} aria-labelledby={`interview-${job.id}`}>
            <div className={styles.resultHeading}><h3 id={`interview-${job.id}`}>面试与沟通提纲</h3><span>{result.interview.length} 题</span></div>
            <p className={styles.note}>提纲使用本次任务的资料快照，请结合最终简历准备。</p>
            {result.interview.map((item, index) => <details key={`${index}:${item.question}`} className={styles.interviewItem}><summary>{index + 1}. {item.question}<ChevronDown size={14} /></summary><p>{item.answerOutline}</p><Evidence job={job} ids={item.evidenceIds} /></details>)}
            <div className={styles.exportActions}><button type="button" className={styles.secondary} onClick={() => void copyInterview()}><Copy size={14} />复制提纲</button><button type="button" className={styles.secondary} onClick={downloadInterview}><Download size={14} />下载提纲</button></div>
          </section>}
        </>}
        {(activeStatuses.has(job.status) || job.status === "ready") && <button className={styles.cancel} type="button" disabled={Boolean(busy)} onClick={() => void mutateJob("cancel")}>{busy === "cancel" ? <LoaderCircle size={13} className={styles.spin} /> : <X size={13} />}{job.status === "ready" ? "结束审阅，保留当前简历" : "取消本次任务"}</button>}
        <p className={styles.retention}>任务材料保留至 {jobDate(job.expiresAt)}</p>
      </div>}
      <footer className={styles.footer}><ShieldCheck size={14} /><span>有来源不代表事实已被核验。最终材料由你确认。</span></footer>
    </section>
  );
}
