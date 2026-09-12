import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskProxy, normalizeRequest, tokenCost } from '../src/proxy.mjs';

const config = { apiKey: 'server-secret-never-in-child', priceVersion: 'test-price-v1', inputPrice: 2_000_000, cachedInputPrice: 500_000, outputPrice: 8_000_000, maxInputTokens: 1000, timeoutMs: 1000 };
const job = { model: 'test-model', maxOutputTokens: 100, maxModelCalls: 2, budgetMicros: 10_000 };
const requestBody = { model: job.model, input: 'authorized source', stream: true };
const terminal = (changes = {}) => ({ status: 'completed', service_tier: 'default', usage: { input_tokens: 100, input_tokens_details: { cached_tokens: 20 }, output_tokens: 10 }, ...changes });
const stream = (response) => new Response(`event: response.completed\ndata: ${JSON.stringify({ type: 'response.completed', response })}\n\n`, { headers: { 'content-type': 'text/event-stream' } });
const post = (proxy, body = requestBody, path = '/responses', token = proxy.token) => fetch(`${proxy.baseUrl}${path}`, { method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' }, body: JSON.stringify(body) });

async function fixture(t, { jobPatch = {}, count = 100, response = terminal(), fetchOverride } = {}) {
  const calls = [];
  const proxy = await createTaskProxy({ config, job: { ...job, ...jobPatch }, fetchImpl: async (url, init) => {
    calls.push({ url, init, body: JSON.parse(init.body) });
    if (fetchOverride) return fetchOverride(url, init);
    return url.endsWith('/input_tokens') ? Response.json({ object: 'response.input_tokens', input_tokens: count }) : stream(response);
  } });
  t.after(() => proxy.close());
  return { proxy, calls };
}

test('proxy authenticates task token and only exposes the Responses endpoint', async (t) => {
  const { proxy, calls } = await fixture(t);
  assert.equal((await post(proxy, requestBody, '/responses', 'wrong')).status, 401);
  assert.equal((await post(proxy, requestBody, '/responses/compact')).status, 404);
  assert.equal((await post(proxy, requestBody, '/responses?upstream=https://attacker.invalid')).status, 404);
  assert.equal(calls.length, 0);
});

test('fixed upstream, fixed model, text-only requests, and forced nonbillable tools', async (t) => {
  const { proxy, calls } = await fixture(t);
  const response = await post(proxy, { ...requestBody, tools: [{ type: 'web_search' }], store: true, service_tier: 'priority', max_output_tokens: 999_999 });
  assert.equal(response.status, 200);
  assert.equal(calls[0].url, 'https://api.openai.com/v1/responses/input_tokens');
  assert.equal(calls[1].url, 'https://api.openai.com/v1/responses');
  assert.equal(calls[1].init.headers.authorization, `Bearer ${config.apiKey}`);
  assert.equal(calls[1].init.redirect, 'error');
  assert.deepEqual(calls[1].body.tools, []);
  assert.equal(calls[1].body.tool_choice, 'none');
  assert.equal(calls[1].body.max_output_tokens, 100);
  assert.equal(calls[1].body.store, false);
  assert.equal(calls[1].body.service_tier, 'default');
  assert.equal(calls[1].body.truncation, 'disabled');
  assert.ok(!(await response.text()).includes(config.apiKey));
  assert.deepEqual(proxy.getUsage(), { inputTokens: 100, cachedInputTokens: 20, outputTokens: 10, costMicros: 250, modelCalls: 1, priceVersion: 'test-price-v1', costBasis: 'measured' });
});

test('input count over ceiling prevents a paid request', async (t) => {
  const { proxy, calls } = await fixture(t, { count: 1001 });
  assert.equal((await post(proxy)).status, 502);
  assert.equal(calls.length, 1);
  assert.equal(proxy.getUsage().costMicros, 0);
});

test('full per-call reservation must fit before invoking the model', async (t) => {
  const { proxy, calls } = await fixture(t, { jobPatch: { budgetMicros: 2799 } });
  assert.equal((await post(proxy)).status, 502);
  assert.equal(calls.length, 1);
  assert.equal(proxy.getUsage().modelCalls, 0);
  assert.equal(proxy.getUsage().costBasis, 'measured');
});

test('multi-call budget uses settled costs and enforces aggregate model-call cap', async (t) => {
  const { proxy, calls } = await fixture(t);
  assert.equal((await post(proxy)).status, 200);
  assert.equal((await post(proxy)).status, 200);
  assert.equal((await post(proxy)).status, 429);
  assert.equal(proxy.getUsage().costMicros, 500);
  assert.equal(calls.length, 4);
});

test('missing usage keeps the reservation and blocks any retry', async (t) => {
  const { proxy } = await fixture(t, { response: terminal({ usage: null }) });
  assert.equal((await post(proxy)).status, 502);
  assert.equal(proxy.getUsage().costMicros, 2800);
  assert.equal(proxy.getUsage().costBasis, 'reserved');
  assert.match(proxy.getFailure(), /USAGE_UNVERIFIED_RESERVED/);
  assert.equal((await post(proxy)).status, 429);
});

test('upstream transport failure after reservation cannot claim zero cost', async (t) => {
  const { proxy } = await fixture(t, { fetchOverride: async (url) => {
    if (url.endsWith('/input_tokens')) return Response.json({ input_tokens: 100 });
    throw new Error('network failure containing sensitive detail');
  } });
  const response = await post(proxy);
  assert.equal(response.status, 502);
  assert.equal(proxy.getUsage().costMicros, 2800);
  assert.ok(!(await response.text()).includes('sensitive detail'));
});

test('incomplete result is charged for measured usage but never treated as completed', async (t) => {
  const { proxy } = await fixture(t, { response: terminal({ status: 'incomplete' }) });
  assert.equal((await post(proxy)).status, 502);
  assert.equal(proxy.getUsage().costMicros, 250);
  assert.equal(proxy.getUsage().costBasis, 'measured');
  assert.equal(proxy.getFailure(), 'MODEL_INCOMPLETE');
});

test('an unknown second call makes cumulative cost reserved even after a measured first call', async (t) => {
  let generated = 0;
  const { proxy } = await fixture(t, { fetchOverride: async (url) => {
    if (url.endsWith('/input_tokens')) return Response.json({ input_tokens: 100 });
    generated += 1;
    return stream(generated === 1 ? terminal() : terminal({ usage: null }));
  } });
  assert.equal((await post(proxy)).status, 200);
  assert.equal((await post(proxy)).status, 502);
  assert.equal(proxy.getUsage().costMicros, 3050);
  assert.equal(proxy.getUsage().costBasis, 'reserved');
  assert.equal(proxy.getUsage().priceVersion, 'test-price-v1');
});

test('paid tool output is rejected before Codex sees the stream', async (t) => {
  const { proxy } = await fixture(t, { fetchOverride: async (url) => url.endsWith('/input_tokens') ? Response.json({ input_tokens: 100 }) : new Response('data: {"type":"response.output_item.added","item":{"type":"function_call"}}\n\n', { headers: { 'content-type': 'text/event-stream' } }) });
  assert.equal((await post(proxy)).status, 502);
  assert.match(proxy.getFailure(), /UNSUPPORTED_MODEL_TOOL/);
  assert.equal(proxy.getUsage().costMicros, 2800);
});

test('unknown fields and outside-model/remote content requests fail before upstream', () => {
  for (const patch of [{ model: 'other-model' }, { previous_response_id: 'resp_other_user' }, { input: [{ type: 'input_image', image_url: 'https://attacker.invalid' }] }, { input: [{ role: 'user', content: [{ type: 'input_file', file_data: 'base64' }] }] }, { background: true }]) {
    assert.throws(() => normalizeRequest({ ...requestBody, ...patch }, job));
  }
});

test('concurrent requests cannot pass the same in-flight reservation boundary', async (t) => {
  let releaseCount, markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const gate = new Promise((resolve) => { releaseCount = resolve; });
  const { proxy, calls } = await fixture(t, { fetchOverride: async (url) => {
    if (url.endsWith('/input_tokens')) { markStarted(); await gate; return Response.json({ input_tokens: 100 }); }
    return stream(terminal());
  } });
  const first = post(proxy);
  await started;
  assert.equal((await post(proxy)).status, 429);
  assert.equal(calls.length, 1);
  releaseCount();
  assert.equal((await first).status, 200);
  assert.equal(proxy.getUsage().modelCalls, 1);
});

test('cancellation aborts upstream and preserves the consumed in-flight reservation', async (t) => {
  const controller = new AbortController();
  let markStarted;
  const started = new Promise((resolve) => { markStarted = resolve; });
  const proxy = await createTaskProxy({ config, job, signal: controller.signal, fetchImpl: async (url, init) => {
    if (url.endsWith('/input_tokens')) return Response.json({ input_tokens: 100 });
    markStarted();
    return new Promise((_resolve, reject) => init.signal.addEventListener('abort', () => reject(init.signal.reason), { once: true }));
  } });
  t.after(() => proxy.close());
  const pending = post(proxy);
  await started;
  controller.abort();
  assert.equal((await pending).status, 502);
  assert.equal(proxy.getUsage().costMicros, 2800);
  assert.equal(proxy.getUsage().modelCalls, 1);
  assert.equal((await post(proxy)).status, 410);
});

test('cost uses integer microdollars with upward rounding', () => {
  assert.equal(tokenCost(1, 0, 0, { inputPrice: 1, cachedInputPrice: 1, outputPrice: 1 }), 1);
  assert.equal(tokenCost(100, 20, 10, config), 250);
});
