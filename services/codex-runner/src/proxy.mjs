import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { RunnerError } from './config.mjs';

const UPSTREAM = 'https://api.openai.com/v1/responses';
const MAX_REQUEST_BYTES = 1_000_000;
const MAX_RESPONSE_BYTES = 8_000_000;
const ALLOWED_FIELDS = new Set(['model', 'instructions', 'input', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text', 'stream', 'include', 'store', 'max_output_tokens', 'metadata', 'prompt_cache_key', 'prompt_cache_retention', 'service_tier', 'truncation']);
const COUNT_FIELDS = ['model', 'instructions', 'input', 'tools', 'tool_choice', 'parallel_tool_calls', 'reasoning', 'text'];

export function tokenCost(input, cached, output, prices) {
  const numerator = BigInt(input - cached) * BigInt(prices.inputPrice) + BigInt(cached) * BigInt(prices.cachedInputPrice) + BigInt(output) * BigInt(prices.outputPrice);
  return Number((numerator + 999_999n) / 1_000_000n);
}

async function readBounded(stream, maximum) {
  const parts = []; let size = 0;
  for await (const part of stream) {
    const chunk = Buffer.from(part); size += chunk.length;
    if (size > maximum) throw new RunnerError('BODY_TOO_LARGE');
    parts.push(chunk);
  }
  return Buffer.concat(parts).toString('utf8');
}

export function normalizeRequest(body, job) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some((key) => !ALLOWED_FIELDS.has(key))) throw new RunnerError('UNSUPPORTED_REQUEST');
  if (body.model !== job.model || body.stream !== true) throw new RunnerError('UNSUPPORTED_REQUEST');
  // Phase A has no shell, hosted tools, MCP, remote files, conversation IDs or paid tools.
  // The SDK still plans and produces the structured material package. Tool execution is enabled only when a separately isolated, priced tool contract exists.
  if (body.input !== undefined && typeof body.input !== 'string' && !Array.isArray(body.input)) throw new RunnerError('UNSUPPORTED_REQUEST');
  if (Array.isArray(body.input)) {
    for (const item of body.input) {
      if (!item || typeof item !== 'object' || (item.type && !['message', 'reasoning'].includes(item.type))) throw new RunnerError('TEXT_INPUT_ONLY');
      if (item.type === 'reasoning') continue;
      if (Array.isArray(item.content) && item.content.some((part) => !part || !['input_text', 'output_text'].includes(part.type) || typeof part.text !== 'string')) throw new RunnerError('TEXT_INPUT_ONLY');
      if (!Array.isArray(item.content) && typeof item.content !== 'string') throw new RunnerError('TEXT_INPUT_ONLY');
    }
  }
  const serialized = JSON.stringify(body.input);
  if (serialized && /"(?:image_url|file_id|file_url|file_data|audio|video_url)"\s*:/.test(serialized)) throw new RunnerError('TEXT_INPUT_ONLY');
  return { ...body, tools: [], tool_choice: 'none', parallel_tool_calls: false, store: false, service_tier: 'default', prompt_cache_retention: 'in_memory', truncation: 'disabled', max_output_tokens: job.maxOutputTokens };
}

export async function createTaskProxy({ config, job, signal, fetchImpl = fetch }) {
  const token = randomBytes(32).toString('hex');
  const expected = Buffer.from(`Bearer ${token}`);
  const usage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, costMicros: 0, modelCalls: 0 };
  let busy = false; let closed = false; let failureCode = null; let hasReservedCost = false;
  const lifetime = new AbortController();
  const controllerSignal = signal ? AbortSignal.any([signal, lifetime.signal]) : lifetime.signal;
  const requests = new Set();
  async function upstream(url, body) {
    return fetchImpl(url, { method: 'POST', redirect: 'error', headers: { authorization: `Bearer ${config.apiKey}`, 'content-type': 'application/json' }, body: JSON.stringify(body), signal: AbortSignal.any([controllerSignal, AbortSignal.timeout(config.timeoutMs)]) });
  }
  const server = createServer((request, response) => {
    const task = handle(request, response).catch(() => { response.destroy(); });
    requests.add(task); task.finally(() => requests.delete(task));
  });
  async function handle(request, response) {
    function reject(status, code) {
      if (!response.headersSent) response.writeHead(status, { 'content-type': 'application/json' });
      response.end(JSON.stringify({ error: { code, message: code } }));
    }
    const received = Buffer.from(request.headers.authorization ?? '');
    if (received.length !== expected.length || !timingSafeEqual(received, expected)) return reject(401, 'UNAUTHORIZED');
    if (request.method !== 'POST' || request.url !== '/v1/responses') return reject(404, 'UNSUPPORTED_ENDPOINT');
    if (closed || controllerSignal.aborted) return reject(410, 'JOB_STOPPED');
    if (busy || usage.modelCalls >= job.maxModelCalls || failureCode) return reject(429, failureCode || 'CALL_LIMIT');
    busy = true;
    let reserved = 0; let settled = false; let paid = false;
    try {
      if (request.headers['content-encoding']) throw new RunnerError('UNSUPPORTED_ENCODING');
      const body = normalizeRequest(JSON.parse(await readBounded(request, MAX_REQUEST_BYTES)), job);
      const countBody = Object.fromEntries(COUNT_FIELDS.filter((key) => body[key] !== undefined).map((key) => [key, body[key]]));
      const countResponse = await upstream(`${UPSTREAM}/input_tokens`, countBody);
      if (!countResponse.ok) throw new RunnerError('TOKEN_COUNT_UNAVAILABLE');
      const count = JSON.parse(await readBounded(countResponse.body, 100_000)).input_tokens;
      if (!Number.isSafeInteger(count) || count < 0 || count > config.maxInputTokens) throw new RunnerError('INPUT_TOKEN_LIMIT');
      // Reserve the full accepted input ceiling, and the forced API output ceiling, before the paid request.
      // Cache hits never weaken the ceiling. An interrupted/unknown request consumes this conservative reservation.
      reserved = tokenCost(config.maxInputTokens, 0, job.maxOutputTokens, { ...config, inputPrice: Math.max(config.inputPrice, config.cachedInputPrice) });
      if (usage.costMicros + reserved > job.budgetMicros) throw new RunnerError('BUDGET_EXHAUSTED');
      usage.costMicros += reserved; usage.modelCalls += 1; paid = true;
      const remote = await upstream(UPSTREAM, body);
      if (!remote.ok || !remote.headers.get('content-type')?.includes('text/event-stream')) throw new RunnerError('MODEL_UPSTREAM_FAILED');
      // Bound and inspect the stream before forwarding. This prevents invented tool calls from reaching the CLI,
      // and ensures usage is accounted before the SDK receives a completed turn.
      const content = await readBounded(remote.body, MAX_RESPONSE_BYTES);
      let terminal = null;
      for (const block of content.split(/\r?\n\r?\n/)) {
        const data = block.split(/\r?\n/).filter((line) => line.startsWith('data:')).map((line) => line.slice(5).trimStart()).join('\n');
        if (!data || data === '[DONE]') continue;
        const event = JSON.parse(data);
        if (event.type?.startsWith('response.output_item.') && event.item?.type && !['message', 'reasoning'].includes(event.item.type)) throw new RunnerError('UNSUPPORTED_MODEL_TOOL');
        if (['response.completed', 'response.incomplete', 'response.failed'].includes(event.type)) terminal = event.response;
      }
      const measured = terminal?.usage;
      if (terminal?.output?.some((item) => !['message', 'reasoning'].includes(item.type))) throw new RunnerError('UNSUPPORTED_MODEL_TOOL');
      const input = measured?.input_tokens, output = measured?.output_tokens, cached = measured?.input_tokens_details?.cached_tokens ?? 0;
      if (![input, output, cached].every((value) => Number.isSafeInteger(value) && value >= 0) || cached > input || input > config.maxInputTokens || output > job.maxOutputTokens) throw new RunnerError('USAGE_UNVERIFIED');
      // Non-default service tiers, cache-write billing and other price dimensions require a new explicit price contract.
      if ((terminal.service_tier && terminal.service_tier !== 'default') || (measured.input_tokens_details?.cache_write_tokens ?? 0) > 0) throw new RunnerError('UNSUPPORTED_PRICE_DIMENSION');
      const cost = tokenCost(input, cached, output, config);
      if (cost > reserved) throw new RunnerError('USAGE_EXCEEDS_RESERVATION');
      usage.inputTokens += input; usage.cachedInputTokens += cached; usage.outputTokens += output;
      usage.costMicros -= reserved - cost; settled = true;
      if (terminal.status !== 'completed') throw new RunnerError('MODEL_INCOMPLETE');
      response.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store' });
      response.end(content);
    } catch (error) {
      failureCode = error instanceof RunnerError ? error.code : controllerSignal.aborted ? 'JOB_STOPPED' : 'PROXY_FAILED';
      // A failed preflight costs no model tokens; a paid call with unknown usage retains its reservation.
      if (paid && !settled) { hasReservedCost = true; failureCode = `${failureCode}_RESERVED`; }
      reject(502, failureCode);
    } finally { busy = false; }
  }
  server.requestTimeout = config.timeoutMs;
  server.headersTimeout = 10_000;
  server.on('upgrade', (_request, socket) => socket.destroy());
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`, token,
    getUsage: () => ({ ...usage, priceVersion: config.priceVersion, costBasis: hasReservedCost ? 'reserved' : 'measured' }),
    getFailure: () => failureCode,
    async close() {
      closed = true; lifetime.abort(); server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
      await Promise.allSettled([...requests]);
    },
  };
}
