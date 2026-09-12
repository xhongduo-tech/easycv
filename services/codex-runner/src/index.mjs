import { setTimeout as delay } from 'node:timers/promises';
import { loadConfig, assertIsolation } from './config.mjs';
import { BackendClient, claimJob, executeJob } from './runner.mjs';

try {
  const config = loadConfig();
  await assertIsolation();
  // Only the trusted supervisor retains real credentials. No full process environment reaches Codex.
  const client = new BackendClient(config);
  const shutdown = new AbortController();
  process.once('SIGTERM', () => shutdown.abort());
  process.once('SIGINT', () => shutdown.abort());
  console.info(JSON.stringify({ event: 'runner_started', workerId: config.workerId, model: config.model, priceVersion: config.priceVersion }));
  while (!shutdown.signal.aborted) {
    try {
      const claim = await claimJob(client, config, shutdown.signal);
      if (claim.job) {
        await executeJob(claim.job, config, client, { signal: shutdown.signal });
        console.info(JSON.stringify({ event: 'job_receipt_recorded', jobId: claim.job.id }));
      } else await delay(config.pollMs, undefined, { signal: shutdown.signal });
    } catch (error) {
      if (shutdown.signal.aborted) break;
      console.error(JSON.stringify({ event: 'runner_error', code: error.code || 'BACKEND_UNAVAILABLE' }));
      if (['RESULT_RECEIPT_UNCERTAIN', 'RUNNER_CLEANUP_FAILED'].includes(error.code)) throw error;
      await delay(5_000, undefined, { signal: shutdown.signal }).catch(() => {});
    }
  }
} catch (error) {
  console.error(JSON.stringify({ event: 'runner_stopped', code: error.code || 'RUNNER_CONFIGURATION_INVALID' }));
  process.exitCode = 1;
}
