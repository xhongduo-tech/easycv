// Installation smoke test only. --version never authenticates or calls a model.
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const sdkRequire = createRequire(import.meta.resolve('@openai/codex-sdk'));
const cliRoot = dirname(sdkRequire.resolve('@openai/codex/package.json'));
const version = execFileSync(process.execPath, [join(cliRoot, 'bin/codex.js'), '--version'], { encoding: 'utf8', timeout: 30_000, env: { PATH: '/usr/local/bin:/usr/bin:/bin' } });
if (!version.includes('0.154.0')) throw new Error('CLI_VERSION_MISMATCH');
console.info(version.trim());
