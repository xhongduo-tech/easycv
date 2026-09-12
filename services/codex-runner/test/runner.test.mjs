import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { BackendClient, buildPrompt, childEnvironment, claimJob, executeJob, validateResult } from '../src/runner.mjs';
import { loadConfig, assertIsolation } from '../src/config.mjs';

const input = { schemaVersion: 1, track: 'career', targetName: '后端工程师', focusName: '', requirementsText: '', language: 'zh-CN', sources: [{ id: 's1', sourceRef: { section: 'summary', field: 'summary' }, text: '参与权限模块开发。', label: '简介' }], answers: [] };
const result = { summary: '请核对以下表达。', questions: [], proposals: [{ id: 'p1', sourceId: 's1', originalText: input.sources[0].text, draftText: '参与开发权限模块。', rationale: '调整语序突出工作内容。', evidenceIds: ['s1'], warnings: [] }], interview: [] };
const job = () => ({ id: 'job-1', leaseToken: 'lease-token-at-least-16', attempt: 1, input: structuredClone(input), budgetMicros: 5000, maxModelCalls: 2, maxOutputTokens: 100, model: 'test-model', expiresAt: new Date(Date.now() + 60_000).toISOString(), maxDurationMs: 1000 });
const config = { model: 'test-model', maxBudgetMicros: 5000, maxModelCalls: 2, maxOutputTokens: 100, maxInputTokens: 1000, timeoutMs: 1000, heartbeatMs: 50 };
const metered = { inputTokens: 100, cachedInputTokens: 0, outputTokens: 10, costMicros: 280, modelCalls: 1 };

async function setup(t, events) {
  const directory = await mkdtemp(join(tmpdir(), 'jianji-runner-test-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const calls = []; const instances = [];
  class FakeCodex {
    constructor(options) { instances.push(options); }
    startThread(options) {
      instances.push(options);
      return { runStreamed: async (prompt, options) => {
        instances.push({ prompt, ...options });
        return { events: events ? events(options.signal) : (async function* () {
          yield { type: 'item.completed', item: { type: 'agent_message', text: JSON.stringify(result) } };
          yield { type: 'turn.completed', usage: {} };
        })() };
      } };
    }
  }
  const client = { post: async (path, body) => { calls.push({ path, body }); return { continue: true }; } };
  const proxy = { token: 'one-job-only-token', baseUrl: 'http://127.0.0.1:1/v1', getUsage: () => metered, getFailure: () => null, close: async () => {} };
  return { directory, calls, instances, client, dependencies: { CodexClass: FakeCodex, proxyFactory: async () => proxy }, proxy };
}

test('completed material requires SDK completion, metered call, schema and evidence checks', async (t) => {
  const fixture = await setup(t);
  await executeJob(job(), { ...config, rootDirectory: fixture.directory }, fixture.client, fixture.dependencies);
  const receipt = fixture.calls.find((call) => call.path.endsWith('/complete'));
  assert.deepEqual(receipt.body.result, result);
  assert.deepEqual(receipt.body.usage, metered);
  assert.equal(receipt.body.leaseToken, 'lease-token-at-least-16');
  assert.equal(fixture.instances[0].apiKey, 'one-job-only-token');
  assert.ok(!('OPENAI_API_KEY' in fixture.instances[0].env));
  assert.equal(fixture.instances[1].sandboxMode, 'read-only');
  assert.equal(fixture.instances[1].approvalPolicy, 'never');
  assert.equal(fixture.instances[2].outputSchema.type, 'object');
  assert.deepEqual(await readdir(fixture.directory), []);
});

test('SDK stream failure never fabricates a ready candidate', async (t) => {
  const fixture = await setup(t, () => (async function* () { yield { type: 'turn.failed', error: { message: 'private source' } }; })());
  await executeJob(job(), { ...config, rootDirectory: fixture.directory }, fixture.client, fixture.dependencies);
  assert.ok(!fixture.calls.some((call) => call.path.endsWith('/complete')));
  const failed = fixture.calls.find((call) => call.path.endsWith('/fail'));
  assert.equal(failed.body.code, 'CODEX_EXECUTION_FAILED');
  assert.deepEqual(failed.body.usage, metered);
  assert.deepEqual(await readdir(fixture.directory), []);
});

test('heartbeat cancellation aborts SDK execution and cleans task data', async (t) => {
  const fixture = await setup(t, (signal) => (async function* () {
    await new Promise((resolve) => signal.aborted ? resolve() : signal.addEventListener('abort', resolve, { once: true }));
    signal.throwIfAborted();
  })());
  let beat = 0;
  fixture.client.post = async (path, body) => { fixture.calls.push({ path, body }); return { continue: !path.endsWith('/heartbeat') || ++beat === 1 }; };
  await executeJob(job(), { ...config, rootDirectory: fixture.directory }, fixture.client, fixture.dependencies);
  assert.ok(fixture.calls.some((call) => call.path.endsWith('/fail')));
  assert.ok(!fixture.calls.some((call) => call.path.endsWith('/complete')));
  assert.deepEqual(await readdir(fixture.directory), []);
});

test('uncertain completion stops polling instead of reexecuting SDK', async (t) => {
  const fixture = await setup(t);
  fixture.client.post = async (path) => { if (path.endsWith('/complete')) throw new Error('receipt lost'); return { continue: true }; };
  await assert.rejects(() => executeJob(job(), { ...config, rootDirectory: fixture.directory }, fixture.client, fixture.dependencies), { code: 'RESULT_RECEIPT_UNCERTAIN' });
  assert.equal(fixture.instances.length, 3);
});

test('proxy cleanup failure stops heartbeat, settles failure and retires the container', async (t) => {
  const fixture = await setup(t);
  fixture.proxy.close = async () => { throw new Error('close failed'); };
  await assert.rejects(() => executeJob(job(), { ...config, rootDirectory: fixture.directory }, fixture.client, fixture.dependencies), { code: 'RUNNER_CLEANUP_FAILED' });
  const failure = fixture.calls.find((call) => call.path.endsWith('/fail'));
  assert.equal(failure.body.code, 'RUNNER_CLEANUP_FAILED');
  assert.deepEqual(failure.body.usage, metered);
  assert.ok(!fixture.calls.some((call) => call.path.endsWith('/complete')));
  const heartbeatCount = fixture.calls.filter((call) => call.path.endsWith('/heartbeat')).length;
  await new Promise((resolve) => setTimeout(resolve, config.heartbeatMs * 2));
  assert.equal(fixture.calls.filter((call) => call.path.endsWith('/heartbeat')).length, heartbeatCount);
  assert.deepEqual(await readdir(fixture.directory), []);
});

test('backend retry resends identical fenced payload and suppresses secret errors', async () => {
  const bodies = [];
  const backend = new BackendClient({ backendUrl: 'https://backend.invalid', backendSecret: 'secret' }, async (_url, init) => {
    bodies.push(init.body);
    if (bodies.length === 1) throw new Error('network');
    return Response.json({ continue: false });
  });
  assert.deepEqual(await backend.post('/job/complete', { leaseToken: 'same', result }), { continue: false });
  assert.equal(bodies.length, 2);
  assert.equal(bodies[0], bodies[1]);
});

test('evidence mismatch, unchanged output and duplicate source are rejected', () => {
  assert.throws(() => validateResult({ ...result, proposals: [{ ...result.proposals[0], draftText: input.sources[0].text }] }, input));
  assert.throws(() => validateResult({ ...result, proposals: [{ ...result.proposals[0], originalText: 'different' }] }, input));
  assert.throws(() => validateResult({ ...result, proposals: [result.proposals[0], result.proposals[0]] }, input));
  assert.throws(() => validateResult({ ...result, proposals: [{ ...result.proposals[0], evidenceIds: ['other-user'] }] }, input));
  assert.throws(() => validateResult({ ...result, extra: 'unexpected' }, input));
});

test('claim handshake sends exact model and disables ambiguous automatic claim retry', async () => {
  let call;
  const client = { post: async (...args) => { call = args; return { job: null }; } };
  await claimJob(client, { model: 'provisioned-model', workerId: 'runner-1' });
  assert.deepEqual(call[0], '/claim');
  assert.deepEqual(call[1], { workerId: 'runner-1', model: 'provisioned-model' });
  assert.equal(call[2].retries, 0);
});

test('no host credentials or PATH are inherited and prompts handle final answer round', () => {
  assert.deepEqual(Object.keys(childEnvironment('/task')).sort(), ['CODEX_HOME', 'HOME', 'JIANJI_JOB_DIRECTORY', 'LANG', 'PATH', 'TMPDIR']);
  assert.match(buildPrompt({ ...job(), attempt: 3 }), /questions必须为空/);
  assert.match(buildPrompt(job()), /不可信的用户数据/);
});

test('missing explicit price/model and nonproduction environment fail closed', async () => {
  assert.throws(() => loadConfig({ NODE_ENV: 'development' }), /PRODUCTION_CONTAINER_REQUIRED/);
  assert.throws(() => loadConfig({ NODE_ENV: 'production' }), /CREDENTIALS_REQUIRED/);
  const valid = {
    NODE_ENV: 'production', OPENAI_API_KEY: 'secret', CODEX_RUNNER_SECRET: '12345678901234567890123456789012', CODEX_BACKEND_URL: 'https://backend.invalid',
    CODEX_MODEL: 'provisioned-model', CODEX_PRICE_VERSION: 'verified-price-version',
    CODEX_INPUT_MICROS_PER_MILLION: '2000000', CODEX_CACHED_INPUT_MICROS_PER_MILLION: '500000', CODEX_OUTPUT_MICROS_PER_MILLION: '8000000',
    CODEX_MAX_INPUT_TOKENS: '1000', CODEX_MAX_OUTPUT_TOKENS: '100', CODEX_MAX_MODEL_CALLS: '2', CODEX_MAX_BUDGET_MICROS: '5000', CODEX_JOB_TIMEOUT_MS: '1000',
  };
  assert.equal(loadConfig(valid).model, 'provisioned-model');
  assert.throws(() => loadConfig({ ...valid, CODEX_INPUT_MICROS_PER_MILLION: '' }), /CONFIG_CODEX_INPUT_MICROS_PER_MILLION/);
  assert.throws(() => loadConfig({ ...valid, CODEX_MODEL: '' }), /MODEL_REQUIRED/);
  assert.throws(() => loadConfig({ ...valid, CODEX_BACKEND_URL: 'http://backend.invalid' }), /HTTPS_BACKEND_ORIGIN_REQUIRED/);
  await assert.rejects(() => assertIsolation({}), /ISOLATED_LINUX_SUPERVISOR_REQUIRED/);
});

test('SDK dependency and transitive CLI are pinned in lockfile', async () => {
  const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8'));
  const lock = await readFile(new URL('../pnpm-lock.yaml', import.meta.url), 'utf8');
  assert.equal(pkg.dependencies['@openai/codex-sdk'], '0.154.0');
  assert.match(lock, /'@openai\/codex@0\.154\.0'/);
  assert.match(lock, /integrity: sha512-/);
});
