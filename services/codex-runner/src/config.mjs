import { readFile, access } from 'node:fs/promises';
import { resolve } from 'node:path';

export class RunnerError extends Error {
  constructor(code) { super(code); this.code = code; }
}

function positive(env, key, max) {
  const value = Number(env[key]);
  if (!Number.isSafeInteger(value) || value < 1 || value > max) throw new RunnerError(`CONFIG_${key}`);
  return value;
}

export function loadConfig(env = process.env) {
  if (env.NODE_ENV !== 'production') throw new RunnerError('PRODUCTION_CONTAINER_REQUIRED');
  if (!env.OPENAI_API_KEY || !env.CODEX_RUNNER_SECRET || env.CODEX_RUNNER_SECRET.length < 32) throw new RunnerError('CREDENTIALS_REQUIRED');
  const api = new URL(env.CODEX_BACKEND_URL);
  if (api.protocol !== 'https:' || api.username || api.password || api.search || api.hash || api.pathname !== '/') throw new RunnerError('HTTPS_BACKEND_ORIGIN_REQUIRED');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(env.CODEX_MODEL ?? '')) throw new RunnerError('MODEL_REQUIRED');
  if (!/^[A-Za-z0-9._-]{1,100}$/.test(env.CODEX_PRICE_VERSION ?? '')) throw new RunnerError('PRICE_VERSION_REQUIRED');
  if (env.CODEX_WORKER_ID && !/^[A-Za-z0-9._-]{1,100}$/.test(env.CODEX_WORKER_ID)) throw new RunnerError('INVALID_WORKER_ID');
  return {
    backendUrl: api.origin,
    backendSecret: env.CODEX_RUNNER_SECRET,
    apiKey: env.OPENAI_API_KEY,
    model: env.CODEX_MODEL,
    priceVersion: env.CODEX_PRICE_VERSION,
    // Integer USD microdollars per one million tokens; no guessed model prices.
    inputPrice: positive(env, 'CODEX_INPUT_MICROS_PER_MILLION', 1_000_000_000),
    cachedInputPrice: positive(env, 'CODEX_CACHED_INPUT_MICROS_PER_MILLION', 1_000_000_000),
    outputPrice: positive(env, 'CODEX_OUTPUT_MICROS_PER_MILLION', 1_000_000_000),
    maxInputTokens: positive(env, 'CODEX_MAX_INPUT_TOKENS', 200_000),
    maxOutputTokens: positive(env, 'CODEX_MAX_OUTPUT_TOKENS', 32_000),
    maxModelCalls: positive(env, 'CODEX_MAX_MODEL_CALLS', 10),
    maxBudgetMicros: positive(env, 'CODEX_MAX_BUDGET_MICROS', 100_000_000),
    timeoutMs: positive(env, 'CODEX_JOB_TIMEOUT_MS', 600_000),
    rootDirectory: '/var/lib/jianji-jobs',
    heartbeatMs: 10_000,
    pollMs: 2_000,
    workerId: env.CODEX_WORKER_ID || `runner-${process.pid}`,
  };
}

export async function assertIsolation(env = process.env) {
  if (process.platform !== 'linux' || process.getuid?.() !== 0 || env.CODEX_RUNNER_ISOLATION !== 'container-v1') throw new RunnerError('ISOLATED_LINUX_SUPERVISOR_REQUIRED');
  await access('/app/.jianji-runner-image');
  const status = await readFile('/proc/self/status', 'utf8');
  const mounts = await readFile('/proc/self/mountinfo', 'utf8');
  if (!/^NoNewPrivs:\s+1$/m.test(status)) throw new RunnerError('NO_NEW_PRIVILEGES_REQUIRED');
  const capabilities = BigInt(`0x${status.match(/^CapEff:\s+([a-f\d]+)$/m)?.[1] ?? 'ffffffff'}`);
  // CHOWN, DAC_OVERRIDE, KILL, SETGID, SETUID only. No SYS_ADMIN/ptrace/network administration.
  if ((capabilities & ~0xe3n) !== 0n) throw new RunnerError('EXCESS_CONTAINER_CAPABILITIES');
  const lines = mounts.split('\n').map((line) => line.split(' '));
  if (!lines.some((parts) => parts[4] === '/' && parts[5].split(',').includes('ro'))) throw new RunnerError('READ_ONLY_CONTAINER_REQUIRED');
  if (!lines.some((parts) => parts[4] === '/var/lib/jianji-jobs' && parts.includes('tmpfs'))) throw new RunnerError('EPHEMERAL_JOB_VOLUME_REQUIRED');
}

export function validateJob(job, config) {
  if (!job || !/^[A-Za-z0-9_-]{1,150}$/.test(job.id) || typeof job.leaseToken !== 'string' || job.leaseToken.length < 16) throw new RunnerError('INVALID_JOB');
  for (const key of ['attempt', 'budgetMicros', 'maxModelCalls', 'maxOutputTokens']) {
    if (!Number.isSafeInteger(job[key]) || job[key] < 1) throw new RunnerError('INVALID_JOB');
  }
  if (job.model !== config.model || job.budgetMicros > config.maxBudgetMicros || job.maxModelCalls > config.maxModelCalls || job.maxOutputTokens > config.maxOutputTokens) throw new RunnerError('JOB_EXCEEDS_RUNNER_POLICY');
  if (!Number.isFinite(Date.parse(job.expiresAt)) || Date.parse(job.expiresAt) <= Date.now()) throw new RunnerError('JOB_EXPIRED');
  if (job.input?.schemaVersion !== 1 || !Array.isArray(job.input.sources) || !Array.isArray(job.input.answers) || Buffer.byteLength(JSON.stringify(job.input)) > 200_000) throw new RunnerError('INVALID_INPUT');
  return job;
}

export function isWithin(parent, child) {
  return resolve(child).startsWith(`${resolve(parent)}/`) || (process.platform === 'win32' && resolve(child).startsWith(`${resolve(parent)}\\`));
}
