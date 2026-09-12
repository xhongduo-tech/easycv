/**
 * Browser acceptance of the real builder with synthetic API responses only.
 * Start a development server on port 3002, then run:
 *   PLAYWRIGHT_MODULE=/path/to/playwright/index.mjs node scripts/verify-agent-workspace.mjs
 * No Playwright production dependency, account creation, or model call is required.
 */
import assert from 'node:assert/strict';
import { mkdir, stat, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const baseUrl = new URL(process.env.AGENT_UI_BASE_URL || 'http://localhost:3002');
if (!['localhost', '127.0.0.1'].includes(baseUrl.hostname)) {
  throw new Error('Use an isolated local development server (default port 3002).');
}
let moduleName = process.env.PLAYWRIGHT_MODULE || 'playwright';
if (moduleName !== 'playwright') {
  const modulePath = resolve(moduleName);
  moduleName = pathToFileURL((await stat(modulePath)).isDirectory() ? resolve(modulePath, 'index.mjs') : modulePath).href;
}
const { chromium } = await import(moduleName);
const outputDirectory = resolve(process.env.AGENT_UI_SCREENSHOT_DIR || '.data/agent-ui-validation');
await mkdir(outputDirectory, { recursive: true });

const RESUME_ID = '41000000-0000-4000-8000-000000000001';
const JOB_ID = '42000000-0000-4000-8000-000000000001';
const SECOND_JOB_ID = '42000000-0000-4000-8000-000000000002';
const SOURCE_ID = 'src-synthetic-summary';
const ORIGINAL = '参与后台系统开发，完成权限配置模块。';
const DRAFT = '独立实现后台系统权限配置模块，供 3 个业务组使用。';
const ANSWER = '独立实现权限配置模块，供 3 个业务组使用，没有可确认的效率提升数据。';
const now = new Date().toISOString();
const expiresAt = new Date(Date.now() + 7 * 86_400_000).toISOString();
const template = { id: 'atlas', name: '合成验收模板', description: '清晰呈现经历与成果。', track: 'all', accent: '#3559e0', layout: 'classic', tags: ['清晰'], active: true, recommendedFor: ['后端研发'], family: 'engineering', familyLabel: '工程研发', density: 'balanced' };
const baseline = {
  id: RESUME_ID, userId: 'synthetic-owner', title: '材料工作台浏览器验收', track: 'career', targetName: '后端工程师',
  templateId: template.id, status: 'draft', progress: 85, revision: 1, createdAt: now, updatedAt: now,
  content: {
    basics: { name: '合成测试用户', email: 'synthetic@example.test', phone: '', location: '上海', website: '', headline: '后端研发 · 权限系统' },
    summary: ORIGINAL,
    education: [{ id: 'edu-1', school: '示例大学', degree: '本科', major: '计算机科学', startDate: '2019-09', endDate: '2023-06', location: '上海', score: '', highlights: ['完成数据库与软件工程课程项目。'] }],
    experience: [{ id: 'exp-1', organization: '示例科技', role: '后端工程师', startDate: '2023-07', endDate: '至今', location: '上海', bullets: ['实现权限配置模块，参与代码审查和接口联调。'] }],
    projects: [], skills: ['TypeScript', 'SQL', '权限管理'], languages: ['中文'], awards: [],
  },
  targetBrief: { resumeId: RESUME_ID, kind: 'career-job', focusName: '业务平台研发', requirementsText: '负责后台权限管理、接口设计和业务系统开发。重视真实个人贡献与沟通能力。', sourceType: 'manual', capturedAt: now, revision: 1, createdAt: now, updatedAt: now },
};

function makeJob(status = 'ready', resume = baseline, id = JOB_ID) {
  const input = {
    schemaVersion: 1, track: 'career', targetName: resume.targetName, focusName: resume.targetBrief.focusName,
    requirementsText: resume.targetBrief.requirementsText, language: 'zh-CN',
    sources: [{ id: SOURCE_ID, sourceRef: { section: 'summary', field: 'summary' }, text: resume.content.summary, label: '个人简介' }],
    answers: status === 'waiting_input' ? [] : [{ questionId: 'scope', question: '你具体完成哪个模块，供哪些人使用？', text: ANSWER }],
  };
  return {
    id, resumeId: resume.id, status, version: 3, baseResumeRevision: resume.revision, baseBriefRevision: resume.targetBrief.revision,
    input, result: status === 'waiting_input' ? questionResult() : readyResult(input), error: null,
    stage: status === 'waiting_input' ? '请补充关键事实' : '材料待你复核', createdAt: now, updatedAt: now, expiresAt, appliedRevision: null,
  };
}
function questionResult() {
  return { summary: '需要先明确个人完成的工作与使用范围。', questions: [{ id: 'scope', question: '你具体完成哪个模块，供哪些人使用？', reason: '区分个人贡献和团队成果，避免补造数据。' }], proposals: [], interview: [] };
}
function readyResult(input) {
  return {
    summary: '已结合你的补充整理一项候选和面试提纲，请确认事实后使用。', questions: [],
    proposals: [{ id: 'proposal-1', sourceId: SOURCE_ID, originalText: input.sources[0].text, draftText: DRAFT,
      rationale: '突出具体模块、个人贡献和已确认使用范围。', evidenceIds: [SOURCE_ID, 'answer:scope'],
      warnings: ['必须人工确认：新增数字与独立负责表述来自你的补充，请核对范围和成果归属。'] }],
    interview: [{ question: '请介绍你在权限模块中的个人贡献。', answerOutline: '说明权限配置需求、实现过程和 3 个业务组的使用范围。不编造效率提升比例。', evidenceIds: [SOURCE_ID, 'answer:scope'] }],
  };
}
function fixtureState() {
  return { resume: structuredClone(baseline), jobs: [], online: false, rejectApply: false, lostApplyAcks: 0,
    appliedBody: null, applyCommits: 0, created: 0, requests: [], unexpected: [] };
}

async function installFixture(page, state) {
  await page.route('**/*', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== baseUrl.origin) return route.abort();
    if (!url.pathname.startsWith('/api/')) return route.continue();
    const body = request.postData() ? JSON.parse(request.postData()) : null;
    state.requests.push({ method: request.method(), path: url.pathname, body });
    const respond = (value, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(value) });
    if (url.pathname.startsWith('/api/auth/')) return respond(null);
    if (url.pathname === '/api/templates') return respond({ templates: [template] });
    if (url.pathname === '/api/recommendations' && request.method() === 'GET') return respond({ modelAvailable: false, creditBalance: 0, maxCreditCharge: 1, accountKind: 'user' });
    if (url.pathname === `/api/resumes/${RESUME_ID}`) {
      if (request.method() === 'GET') return respond({ resume: state.resume });
      if (request.method() === 'PATCH') {
        assert.equal(body.expectedRevision, state.resume.revision, 'Autosave must use the current resume revision');
        state.resume = { ...state.resume, content: body.content, title: body.title, templateId: body.templateId, revision: state.resume.revision + 1, updatedAt: new Date().toISOString() };
        return respond({ resume: state.resume });
      }
    }
    if (url.pathname === '/api/agent-jobs') {
      if (request.method() === 'GET') return respond({ jobs: state.jobs, runtime: { enabled: state.online, reason: state.online ? null : 'Codex 执行服务暂未连接，请稍后再试', billingMode: 'sponsored-preview', maxJobsPerDay: 3 } });
      if (request.method() === 'POST') {
        assert.equal(body.consent, true);
        assert.equal(body.expectedRevision, state.resume.revision);
        assert.equal(body.expectedBriefRevision, state.resume.targetBrief.revision);
        assert.match(body.requestId, /^[\da-f-]{36}$/i);
        const job = makeJob('waiting_input', state.resume, state.created++ ? SECOND_JOB_ID : JOB_ID);
        state.jobs = [job, ...state.jobs];
        return respond({ job }, 202);
      }
    }
    const action = url.pathname.match(/^\/api\/agent-jobs\/([^/]+)(?:\/(answers|apply|cancel))?$/);
    if (action) {
      const index = state.jobs.findIndex((job) => job.id === action[1]);
      assert(index >= 0, 'UI must refer to an existing fixture job');
      let job = state.jobs[index];
      if (request.method() === 'GET') return respond({ job });
      if (!(action[2] === 'apply' && job.status === 'applied')) {
        assert.equal(body.expectedVersion, job.version, 'Mutation must fence the current job version');
      }
      if (action[2] === 'answers') {
        assert.deepEqual(body.answers, [{ questionId: 'scope', text: ANSWER }]);
        job = { ...job, status: 'queued', version: job.version + 1, result: null,
          input: { ...job.input, answers: [{ questionId: 'scope', question: questionResult().questions[0].question, text: ANSWER }] } };
      } else if (action[2] === 'apply') {
        if (state.rejectApply) return respond({ error: { code: 'CONFLICT', message: '简历、目标或候选已经变化，请基于最新版本创建任务' } }, 409);
        assert.deepEqual(body.proposalIds, ['proposal-1']);
        assert.equal(body.confirmed, true);
        if (job.status === 'applied') {
          assert.deepEqual(body, state.appliedBody, 'An uncertain apply must replay its exact original payload');
        } else {
          assert.equal(body.expectedRevision, state.resume.revision);
          assert.equal(body.expectedBriefRevision, state.resume.targetBrief.revision);
          state.appliedBody = structuredClone(body);
          state.applyCommits += 1;
          state.resume = { ...state.resume, content: { ...state.resume.content, summary: DRAFT }, revision: state.resume.revision + 1 };
          job = { ...job, status: 'applied', version: job.version + 1, appliedRevision: state.resume.revision };
        }
      } else if (action[2] === 'cancel') {
        job = { ...job, status: 'cancelled', version: job.version + 1 };
      } else throw new Error(`Unexpected fixture action: ${request.method()} ${url.pathname}`);
      state.jobs[index] = job;
      if (action[2] === 'apply' && state.lostApplyAcks > 0) {
        state.lostApplyAcks -= 1;
        return route.abort('failed'); // Commit precedes transport failure, as with a lost D1/API acknowledgement.
      }
      return respond({ job, ...(action[2] === 'apply' ? { resume: state.resume } : {}) });
    }
    state.unexpected.push(`${request.method()} ${url.pathname}`);
    return respond({ error: { code: 'TEST_BLOCKED', message: 'Unexpected API blocked by browser fixture' } }, 503);
  });
}

async function openBuilder(page) {
  await page.goto(new URL(`/builder/${RESUME_ID}`, baseUrl).href, { waitUntil: 'domcontentloaded' });
  await page.getByLabel('简历名称', { exact: true }).first().waitFor({ state: 'attached' });
  await page.getByRole('tab', { name: '材料助手', exact: true }).click();
  await page.getByRole('heading', { name: '目标材料工作台', exact: true }).waitFor();
  await page.getByRole('button', { name: '刷新任务', exact: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('[aria-labelledby="agent-workspace-title"]')?.getAttribute('aria-busy') === 'false');
}
async function verifyNoOverflow(page, name) {
  const layout = await page.evaluate(() => {
    const panel = document.querySelector('#builder-advice');
    const workspace = document.querySelector('[aria-labelledby="agent-workspace-title"]');
    return { viewport: window.innerWidth, document: document.documentElement.scrollWidth, panel: panel?.clientWidth, panelScroll: panel?.scrollWidth, workspace: workspace?.clientWidth, workspaceScroll: workspace?.scrollWidth };
  });
  assert(layout.document <= layout.viewport + 1, `${name}: page overflow ${JSON.stringify(layout)}`);
  assert(layout.panelScroll <= layout.panel + 1, `${name}: advice panel overflow ${JSON.stringify(layout)}`);
  assert(layout.workspaceScroll <= layout.workspace + 1, `${name}: workspace overflow ${JSON.stringify(layout)}`);
  return layout;
}
async function selectProposal(page) {
  const apply = page.getByRole('button', { name: /确认应用 \d 项修改/ });
  assert(await apply.isDisabled(), 'Apply must require explicit proposal selection and factual confirmation');
  await page.locator('article').filter({ hasText: '候选表达' }).getByRole('checkbox').check();
  assert(await apply.isDisabled(), 'Selecting a proposal alone must not authorize application');
  await page.getByLabel('我已核对所选内容及其来源，确认数字、职责和成果归属准确。', { exact: true }).check();
  assert(await apply.isEnabled());
  return apply;
}
async function screenshot(page, name) { await page.screenshot({ path: resolve(outputDirectory, `${name}.png`), fullPage: true }); }

const browser = await chromium.launch({ headless: true });
const report = { baseUrl: baseUrl.origin, mode: 'synthetic API interception; no account or model calls', checks: [], screenshots: outputDirectory };
const pageErrors = [];
const states = [];
async function pageWithState(viewport) {
  const page = await browser.newPage({ viewport });
  page.setDefaultTimeout(15_000);
  page.on('pageerror', (error) => pageErrors.push(error.message));
  const state = fixtureState();
  states.push(state);
  await installFixture(page, state);
  return { page, state };
}

try {
  const { page, state } = await pageWithState({ width: 1600, height: 1000 });
  await openBuilder(page);
  await page.getByText('Codex 执行服务暂未连接，请稍后再试', { exact: true }).waitFor();
  assert.equal(await page.getByRole('button', { name: '开始准备目标材料', exact: true }).count(), 0);
  report.checks.push({ name: 'desktop offline state and layout', layout: await verifyNoOverflow(page, 'desktop offline') });
  await screenshot(page, 'desktop-offline');

  state.online = true;
  await page.getByRole('button', { name: '刷新任务', exact: true }).click();
  const start = page.getByRole('button', { name: '开始准备目标材料', exact: true });
  await start.waitFor();
  assert(await start.isDisabled());
  await page.getByLabel(/同意将这份简历的经历/).check();
  await start.click();
  await page.getByRole('heading', { name: '让经历更具体，还需要你的补充' }).waitFor();
  const submit = page.getByRole('button', { name: '提交补充，继续准备', exact: true });
  assert(await submit.isDisabled());
  await page.locator('form textarea').fill(ANSWER);
  await screenshot(page, 'desktop-questions');
  await submit.click();
  await page.getByText('正在根据已保存的经历与目标准备材料。你可以离开此页，回来后继续查看。', { exact: true }).waitFor();
  assert(state.requests.some((request) => request.path.endsWith('/answers')));
  report.checks.push({ name: 'consent, create, required answer and fenced answer submission', passed: true });

  state.jobs[0] = { ...state.jobs[0], status: 'ready', version: state.jobs[0].version + 1, result: readyResult(state.jobs[0].input) };
  await page.getByRole('button', { name: '刷新任务', exact: true }).click();
  await page.getByRole('heading', { name: '简历修改候选', exact: true }).waitFor();
  const article = page.locator('article').filter({ hasText: '候选表达' });
  await article.locator('summary').click();
  await article.getByText(ANSWER, { exact: true }).waitFor();
  await article.getByText('来源是你提供的材料或补充，尚未经过外部核验。', { exact: true }).waitFor();
  report.checks.push({ name: 'ready sources, warnings and desktop layout', layout: await verifyNoOverflow(page, 'desktop ready') });
  await screenshot(page, 'desktop-ready');
  await (await selectProposal(page)).click();
  const undo = page.getByRole('button', { name: '撤销本次修改', exact: true });
  await undo.waitFor();
  assert.equal(state.resume.revision, 2);
  assert.equal(state.resume.content.summary, DRAFT);
  await page.getByRole('tab', { name: '编辑资料', exact: true }).click();
  await page.getByRole('navigation', { name: '简历章节' }).getByRole('button', { name: /个人简介/ }).click();
  assert.equal(await page.locator('#builder-edit textarea').inputValue(), DRAFT);
  await page.getByRole('tab', { name: '材料助手', exact: true }).click();
  await undo.click();
  await page.waitForFunction((text) => document.querySelector('#builder-edit textarea')?.value === text, ORIGINAL);
  const savedUndo = await page.waitForResponse((response) => response.url().endsWith(`/api/resumes/${RESUME_ID}`) && response.request().method() === 'PATCH' && response.ok());
  assert.equal((await savedUndo.json()).resume.revision, 3);
  assert.equal(state.resume.content.summary, ORIGINAL);
  assert.equal(state.requests.filter((request) => request.path.endsWith('/apply')).length, 1);
  report.checks.push({ name: 'apply changes the actual editor; undo saves original text as a new revision', passed: true });
  await screenshot(page, 'desktop-after-undo');

  for (const lostAcks of [1, 2]) {
    const recovered = await pageWithState({ width: 1600, height: 1000 });
    recovered.state.online = true;
    recovered.state.jobs = [makeJob()];
    recovered.state.lostApplyAcks = lostAcks;
    await openBuilder(recovered.page);
    await (await selectProposal(recovered.page)).click();
    const recoveredUndo = recovered.page.getByRole('button', { name: '撤销本次修改', exact: true });
    await recoveredUndo.waitFor();
    assert.equal(await recoveredUndo.count(), 1, 'Recovered application exposes one undo action');
    const requests = recovered.state.requests.filter((request) => request.path.endsWith('/apply'));
    assert.equal(requests.length, 2, 'Uncertain application performs one bounded replay');
    assert.deepEqual(requests[0].body, requests[1].body);
    assert.equal(recovered.state.applyCommits, 1, 'Idempotent replay must not commit another revision');
    assert.equal(recovered.state.resume.revision, 2);
    assert.equal(recovered.state.resume.content.summary, DRAFT);
    assert.equal(recovered.state.requests.filter((request) => request.method === 'POST' && request.path === '/api/agent-jobs').length, 0, 'Receipt recovery must not create a new model task');
    if (lostAcks === 2) {
      assert(recovered.state.requests.some((request) => request.method === 'GET' && request.path === `/api/agent-jobs/${JOB_ID}`), 'Double acknowledgement loss must reconcile the job');
      assert.equal(recovered.state.requests.filter((request) => request.method === 'GET' && request.path === `/api/resumes/${RESUME_ID}`).length, 2, 'Double acknowledgement loss must retrieve the authoritative resume after the initial load');
    }
    await recovered.page.getByRole('tab', { name: '编辑资料', exact: true }).click();
    await recovered.page.getByRole('navigation', { name: '简历章节' }).getByRole('button', { name: /个人简介/ }).click();
    assert.equal(await recovered.page.locator('#builder-edit textarea').inputValue(), DRAFT);
    await screenshot(recovered.page, `desktop-apply-recovered-${lostAcks}`);
    await recovered.page.getByRole('tab', { name: '材料助手', exact: true }).click();
    const undoSaved = recovered.page.waitForResponse((response) => response.url().endsWith(`/api/resumes/${RESUME_ID}`) && response.request().method() === 'PATCH' && response.ok());
    await recoveredUndo.click();
    assert.equal((await (await undoSaved).json()).resume.revision, 3);
    assert.equal(recovered.state.resume.content.summary, ORIGINAL);
    report.checks.push({ name: `${lostAcks} lost apply acknowledgement(s): identical bounded replay, one commit, editor recovery and one undo`, passed: true });
  }

  const stale = await pageWithState({ width: 1600, height: 1000 });
  stale.state.online = true;
  stale.state.jobs = [makeJob()];
  stale.state.rejectApply = true;
  await openBuilder(stale.page);
  await (await selectProposal(stale.page)).click();
  await stale.page.getByRole('alert').filter({ hasText: '简历、目标或候选已经变化' }).waitFor();
  assert.equal(stale.state.resume.revision, 1);
  assert.equal(await stale.page.getByRole('button', { name: '撤销本次修改', exact: true }).count(), 0);
  report.checks.push({ name: 'server CAS rejection leaves editor and undo state unchanged', passed: true });

  stale.state.rejectApply = false;
  stale.state.resume.revision = 2;
  await openBuilder(stale.page);
  await stale.page.getByText(/当前简历或目标已更新。此任务使用此前资料/).waitFor();
  assert(await stale.page.getByRole('button', { name: /确认应用 \d 项修改/ }).isDisabled());
  assert(await stale.page.locator('article').filter({ hasText: '候选表达' }).getByRole('checkbox').isDisabled());
  await stale.page.getByRole('button', { name: '结束审阅，保留当前简历', exact: true }).click();
  await stale.page.getByText('为当前资料创建新任务', { exact: true }).waitFor();
  await stale.page.getByLabel(/同意将这份简历的经历/).check();
  stale.state.created = 1;
  await stale.page.getByRole('button', { name: '开始准备目标材料', exact: true }).click();
  await stale.page.getByRole('heading', { name: '让经历更具体，还需要你的补充' }).waitFor();
  assert.equal(stale.state.jobs[0].baseResumeRevision, 2);
  assert.equal(stale.state.jobs[1].status, 'cancelled');
  report.checks.push({ name: 'stale proposals disabled; ready cancellation permits a new task from current revision', passed: true });

  const mobile = await pageWithState({ width: 390, height: 844 });
  mobile.state.online = true;
  mobile.state.jobs = [makeJob()];
  await openBuilder(mobile.page);
  await mobile.page.getByRole('heading', { name: '简历修改候选', exact: true }).waitFor();
  await mobile.page.locator('article').filter({ hasText: '候选表达' }).locator('summary').click();
  report.checks.push({ name: 'mobile assistant, evidence and layout', layout: await verifyNoOverflow(mobile.page, 'mobile ready') });
  await screenshot(mobile.page, 'mobile-ready');
  await (await selectProposal(mobile.page)).click();
  await mobile.page.getByRole('button', { name: '撤销本次修改', exact: true }).waitFor();
  assert.equal(mobile.state.resume.revision, 2);
  report.checks.push({ name: 'mobile selection and confirmed application', passed: true });
  await screenshot(mobile.page, 'mobile-applied');

  assert.deepEqual(states.flatMap((state) => state.unexpected), [], 'No unexpected API should leave the fixture');
  assert.deepEqual(pageErrors, [], 'The builder must not emit browser runtime errors');
  report.passed = true;
  await writeFile(resolve(outputDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} catch (error) {
  report.passed = false;
  report.error = error.stack || String(error);
  report.pageErrors = pageErrors;
  await writeFile(resolve(outputDirectory, 'report.json'), JSON.stringify(report, null, 2) + '\n');
  for (const [index, page] of browser.contexts().flatMap((context) => context.pages()).entries()) await screenshot(page, `failure-${index}`).catch(() => {});
  throw error;
} finally {
  await browser.close();
}
