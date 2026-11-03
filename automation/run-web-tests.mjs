#!/usr/bin/env node
/**
 * Web test runner that never reads an .env file (the approved "Gate 0" approach).
 *
 *   node automation/run-web-tests.mjs                      full web suite
 *   node automation/run-web-tests.mjs src/foo.test.ts ...  only matching test files
 *   node automation/run-web-tests.mjs [files] --max-workers=2
 *
 * What it does: runs Vitest through its Node API with `envFile: false`, a discard-port API URL (nothing can reach a real backend),
 * and a tripwire that refuses and records any attempt to read a file named .env / .env.* while the run is in progress.
 * Exit codes: 0 all passed, 1 test failures / errors / no tests, 2 bad arguments, 3 the .env tripwire fired (treat as a stop-and-report event).
 * It prints no environment values. It does not run server or mobile tests, and it is not a sandbox: it only guards the file-read APIs patched below.
 */
import fs from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// --- arguments: plain relative test-file filters and one optional worker cap; nothing else is accepted ---
const filters = [];
let maxWorkers = 3;
for (const arg of process.argv.slice(2)) {
  const w = arg.match(/^--max-workers=(\d)$/);
  if (w && Number(w[1]) >= 1) {
    maxWorkers = Number(w[1]);
  } else if (/^[A-Za-z0-9_./@-]+$/.test(arg) && !arg.startsWith('-') && !arg.includes('..') && !/(^|[\\/])\.env/i.test(arg)) {
    filters.push(arg);
  } else {
    console.error('REFUSED: unsupported argument (only relative test-file filters and --max-workers=1..9 are allowed)');
    process.exit(2);
  }
}

process.chdir(ROOT);
process.env.CI = 'true';
process.env.VITE_API_BASE_URL = 'http://127.0.0.1:9/api/v1'; // discard port: any accidental request fails immediately

// --- .env read tripwire (installed BEFORE Vitest / Vite are imported) ---
const ENV_FILE = /(^|[\\/])\.env(\.|$)/;
let tripped = false;
const guarded = (original) =>
  function (p, ...rest) {
    if (ENV_FILE.test(String(p))) {
      tripped = true;
      throw new Error('BLOCKED: attempt to read an .env file');
    }
    return original.call(this, p, ...rest);
  };
for (const name of ['readFileSync', 'readFile', 'openSync', 'open', 'createReadStream']) {
  if (typeof fs[name] === 'function') fs[name] = guarded(fs[name]);
}
if (typeof fs.promises?.readFile === 'function') {
  const original = fs.promises.readFile;
  fs.promises.readFile = async function (p, ...rest) {
    if (ENV_FILE.test(String(p))) {
      tripped = true;
      throw new Error('BLOCKED: attempt to read an .env file');
    }
    return original.call(this, p, ...rest);
  };
}
syncBuiltinESMExports();

const { startVitest } = await import('vitest/node');
const ctx = await startVitest('test', filters, { run: true, watch: false, maxWorkers }, { envFile: false });

let failed = true; // no context means nothing ran
if (ctx) {
  const files = ctx.state.getFiles();
  failed = files.length === 0 || files.some((f) => f.result?.state === 'fail') || ctx.state.getUnhandledErrors().length > 0 || (process.exitCode ?? 0) !== 0;
  if (!ctx.shouldKeepServer()) await ctx.exit();
}
if (tripped) console.error('STOP: an .env read was attempted and refused. Report this; do not retry.');
process.exit(tripped ? 3 : failed ? 1 : 0);
