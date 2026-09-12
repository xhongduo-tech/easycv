#!/usr/local/bin/node
// Trusted root launcher. The SDK has no uid/gid option; this wrapper supplies that boundary.
import { spawn } from 'node:child_process';
import { readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

if (process.platform !== 'linux' || process.getuid?.() !== 0 || !process.env.JIANJI_JOB_DIRECTORY?.startsWith('/var/lib/jianji-jobs/task-')) process.exit(70);
const directory = process.env.JIANJI_JOB_DIRECTORY;
const args = process.argv.slice(2);
const schemaIndex = args.indexOf('--output-schema');
if (schemaIndex >= 0) {
  const schema = await readFile(args[schemaIndex + 1]);
  const target = join(directory, 'output-schema.json');
  await writeFile(target, schema, { mode: 0o644, flag: 'wx' });
  args[schemaIndex + 1] = target;
}
const sdkRequire = createRequire(import.meta.resolve('@openai/codex-sdk'));
const cliRoot = dirname(sdkRequire.resolve('@openai/codex/package.json'));
process.setgroups([]);
const env = Object.fromEntries(['PATH', 'LANG', 'HOME', 'CODEX_HOME', 'TMPDIR', 'CODEX_API_KEY', 'CODEX_INTERNAL_ORIGINATOR_OVERRIDE'].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
const child = spawn(process.execPath, [join(cliRoot, 'bin/codex.js'), ...args], {
  cwd: join(directory, 'work'), env, uid: 10001, gid: 10001, detached: true, stdio: 'inherit',
});
let stopped = false;
function stop() {
  if (stopped) return;
  stopped = true;
  try { process.kill(-child.pid, 'SIGKILL'); } catch { /* Already gone. */ }
}
process.on('SIGTERM', stop);
process.on('SIGINT', stop);
child.on('error', () => { stop(); process.exitCode = 71; });
child.on('exit', (code) => { stop(); process.exitCode = code ?? 72; });
