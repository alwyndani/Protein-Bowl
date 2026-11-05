#!/usr/bin/env node
/**
 * pb-guard: PreToolUse guard for Protein Bowl. Runs before Bash / PowerShell / Read / Grep / Glob / Edit / Write / NotebookEdit / MCP tool calls.
 *
 * Reads the hook JSON on stdin. Outcomes: exit 0 with no output = no objection (normal permission rules still apply);
 * exit 0 with an "ask" JSON = force a permission prompt; exit 2 + a message on stderr = block.
 * Fails CLOSED: unparsable input or an internal error blocks. It cannot help if `node` itself fails to start (then Claude Code treats the hook as a non-blocking error).
 *
 * This is best-effort pattern matching, NOT a sandbox. It cannot see what an allowed program does internally (a test or build that reads files itself),
 * and it cannot defeat every shell obfuscation. The permission rules in .claude/settings.json are the second layer.
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PROJECT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const fwd = (p) => String(p).replace(/\\/g, '/');

class Verdict extends Error {
  constructor(kind, why) {
    super(why);
    this.kind = kind;
  }
}
const deny = (why) => {
  throw new Verdict('deny', why);
};
const ask = (why) => {
  throw new Verdict('ask', why);
};

// ---------- files ----------
const ENV_TEXT = /(^|[^A-Za-z0-9_])\.env(?![A-Za-z0-9_-])/i; // ".env", ".env.local", "server/.env" - not "process.env" or "dotenv"
const ENV_GLOB = /\.e[*?[]/i; // ".e*", ".e?v" style obfuscation
const GUARD_PREFIXES = ['.claude/', '.git/', 'automation/run-web-tests.mjs']; // never writable by the agent
const PROTECTED = [
  'server/scripts/reconcilepayments.ts',
  'server/src/modules/payment/reconcilecli.ts',
  'server/src/modules/payment/reconciletargetguard.ts',
  'server/src/tests/p11c2.reconcileguard.test.ts',
  'server/src/tests/fixtures/',
  'server/src/tests/setup.ts',
  'server/prisma/migrations/'
]; // writable only after an explicit prompt

const gitBashToWin = (p) => p.replace(/^\/([a-zA-Z])(?=\/|$)/, '$1:');
const toAbs = (p, base) => path.resolve(base || PROJECT, gitBashToWin(String(p)));
const relOf = (abs) => fwd(path.relative(PROJECT, abs)).toLowerCase();

function checkPath(p, cwd, writing) {
  if (typeof p !== 'string' || !p) return;
  const f = fwd(p);
  if (path.basename(f).toLowerCase().startsWith('.env') || ENV_TEXT.test(f) || ENV_GLOB.test(f)) deny('.env files must never be read, listed, searched or edited');
  if (!writing) return;
  const abs = toAbs(p, cwd);
  const rel = relOf(abs);
  const full = fwd(abs).toLowerCase();
  if (GUARD_PREFIXES.some((g) => (g.endsWith('/') ? `${rel}/`.startsWith(g) : rel === g))) deny('the guard files (.claude/**, .git/**, automation/run-web-tests.mjs) can only be changed by the user');
  if (PROTECTED.some((g) => (g.endsWith('/') ? `${rel}/`.startsWith(g) : rel === g))) ask('protected project file: edit only if the task names it and you approve');
  if (/(^|\/)pb-backups(\/|$)/.test(full) || /\.(dump|bak)$/.test(full)) ask('backup location: do not touch without explicit approval');
}

// ---------- shell commands ----------
const BLOCKED_PROGRAMS = new Set([
  // databases and external services
  'psql', 'pg_dump', 'pg_restore', 'pg_dumpall', 'createdb', 'dropdb', 'createuser', 'dropuser', 'curl', 'wget', 'invoke-webrequest', 'iwr', 'irm', 'invoke-restmethod', 'ssh', 'scp', 'sftp', 'ftp', 'nc', 'ncat', 'docker', 'gh', 'pnpm', 'yarn', 'bun', 'bunx',
  // arbitrary-code runners and nested shells
  'tsx', 'ts-node', 'python', 'python3', 'py', 'perl', 'ruby', 'php', 'deno', 'bash', 'sh', 'zsh', 'cmd', 'powershell', 'pwsh', 'wsl', 'eval', 'invoke-expression', 'iex', 'xargs', 'source', 'sudo', 'runas',
  // destructive / overwriting / persistence / process control
  'rm', 'rmdir', 'del', 'erase', 'rd', 'remove-item', 'ri', 'mv', 'move', 'move-item', 'cp', 'copy', 'copy-item', 'shred', 'truncate', 'dd', 'ln', 'mklink', 'new-item', 'ni', 'rename-item', 'ren', 'rename',
  'tee', 'set-content', 'sc', 'add-content', 'ac', 'out-file', 'clear-content', 'chmod', 'icacls', 'takeown', 'reg', 'regedit',
  'nohup', 'start', 'start-process', 'start-job', 'schtasks', 'at', 'kill', 'taskkill', 'stop-process', 'printenv'
]);
const GIT_READ = new Set(['status', 'diff', 'log', 'show', 'rev-parse', 'ls-files', 'check-ignore', 'blame', 'shortlog', 'describe', 'grep', 'cat-file', 'ls-tree', 'rev-list', 'name-rev', 'diff-tree', 'diff-index', 'diff-files', 'show-ref', 'count-objects', 'merge-base', 'version', '--version']);
const NPM_SCRIPTS = new Set(['typecheck:web', 'typecheck:server', 'typecheck:mobile', 'typecheck:all', 'typecheck', 'build', 'lint']);
const WATCH = /^--?(watch|watchall|w)$|^--watch/i;

const normProg = (t) => fwd(t).split('/').pop().toLowerCase().replace(/\.(exe|cmd|bat|ps1)$/, '');

function areaOf(dir) {
  if (!dir) return 'unknown';
  const r = relOf(dir);
  if (r.startsWith('..') || path.isAbsolute(r)) return 'outside';
  if (r === 'server' || r.startsWith('server/')) return 'server';
  if (r === 'apps/mobile' || r.startsWith('apps/mobile/')) return 'mobile';
  return 'web';
}

function testRun(what, args, area) {
  if (args.some((a) => WATCH.test(a))) deny(`${what}: watch mode never ends and is not allowed`);
  if (area === 'web') deny(`${what}: web tests must run through "node automation/run-web-tests.mjs" (the approved .env-free runner)`);
  if (area === 'server' || area === 'unknown' || area === 'outside') ask(`${what}: server tests are DATABASE tests that write rows; name the exact database and files and approve first`);
}

function tool(pkg, args, area) {
  const sub = args.find((a) => !a.startsWith('-'));
  switch (pkg) {
    case 'tsc':
      if (!args.includes('--noEmit')) deny('tsc is allowed only as "tsc --noEmit"');
      return;
    case 'vitest':
      if (sub !== 'run') deny('vitest is allowed only as "vitest run" (no watch mode)');
      return testRun('vitest', args, area);
    case 'jest':
      if (area !== 'mobile') deny('jest belongs to apps/mobile only');
      return testRun('jest', args, area);
    case 'vite':
      if (sub !== 'build') deny('vite is allowed only as "vite build" (no dev server or preview)');
      return;
    case 'prisma':
      if (sub !== 'validate') deny('prisma commands other than the offline "validate" are database or install operations and need explicit approval');
      return ask('prisma validate loads the env file by itself; allowed only after the schema datasource configuration was inspected');
    default:
      deny(`npx package "${pkg}" is not on the allow-list`);
  }
}

function git(args, dir) {
  let i = 0;
  while (i < args.length && args[i].startsWith('-')) {
    if (args[i] === '-C') i += 2;
    else if (args[i] === '--no-pager' || args[i] === '--no-optional-locks') i += 1;
    else if (args[i] === '--version') break;
    else deny(`git option "${args[i]}" is not allowed before the subcommand`);
  }
  const sub = args[i];
  const rest = args.slice(i + 1);
  if (sub === undefined) deny('git without a subcommand');
  if (sub === 'branch') {
    const ok = new Set(['--show-current', '-a', '-r', '-v', '-vv', '--list', '-l', '--all', '--remotes']);
    if (!rest.every((a) => ok.has(a))) deny('git branch is allowed only for listing');
    return;
  }
  if (sub === 'remote') {
    if (!rest.every((a) => a === '-v' || a === '--verbose')) deny('git remote is allowed only as "git remote -v"');
    return;
  }
  if (!GIT_READ.has(sub)) deny(`git ${sub} is not allowed (only read-only git; staging, commits, pushes, stash, reset, checkout, restore, clean, merge, rebase need the user)`);
  if (rest.some((a) => /^--output/.test(a) || /^-O/.test(a) || /^--open-files/.test(a) || /^--ext-diff$/.test(a))) deny('git option writes a file or runs an external program');
}

function guardCommand(cmd, cwd, background) {
  if (background) deny('background execution is not allowed (run bounded foreground commands only)');
  const flat = cmd.replace(/["'`^]/g, '');
  if (ENV_TEXT.test(cmd) || ENV_TEXT.test(flat) || ENV_GLOB.test(flat)) deny('.env files must never be read, listed, searched or edited, by any command');
  const unq = cmd.replace(/"[^"]*"|'[^']*'/g, '""'); // quoted text removed for structural checks (fail-closed: quoted arguments become "")
  const probe = unq.replace(/\d*>\s*\/dev\/null|\d*>\s*nul\b|\d*>&\d+|&>\s*\/dev\/null/gi, ' ');
  if (/>/.test(probe)) deny('output redirection is not allowed (use the Write tool for files)');
  if (/(^|[^&])&([^&]|$)/.test(probe)) deny('background or chained "&" execution is not allowed');

  let dir = cwd || PROJECT;
  for (const seg of unq.split(/&&|\|\||[;&|\n\r`(){}]|\$\(/)) {
    let t = seg.trim().split(/\s+/).filter(Boolean);
    while (t.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(t[0]) || ['command', 'builtin', 'time', 'exec', 'nice'].includes(t[0].toLowerCase()))) t = t.slice(1);
    if (!t.length) continue;
    let prog = normProg(t[0]);
    let args = t.slice(1);
    if (prog === 'env') {
      while (args.length && (/^[A-Za-z_][A-Za-z0-9_]*=/.test(args[0]) || args[0].startsWith('-'))) args = args.slice(1);
      if (!args.length) deny('dumping the environment is not allowed');
      prog = normProg(args[0]);
      args = args.slice(1);
    }
    if (['cd', 'chdir', 'set-location', 'sl', 'pushd'].includes(prog)) {
      const target = args.find((a) => !a.startsWith('-'));
      dir = !target || target === '""' || target === '-' ? null : toAbs(target, dir || PROJECT);
      continue;
    }
    if (BLOCKED_PROGRAMS.has(prog)) deny(`"${prog}" is outside the approved development workflow`);
    if (prog === 'sed' && args.some((a) => /^-[a-z]*i/i.test(a) || a.startsWith('--in-place'))) deny('sed -i edits files in place');
    if (prog === 'find' && args.some((a) => /^-(delete|exec|execdir|ok|okdir|fprint\w*|fls)$/.test(a))) deny('find may not delete, execute or write');
    if (prog === 'git') {
      git(args, dir);
      continue;
    }
    if (prog === 'node') {
      const script = args[0] ? fwd(args[0]).replace(/^\.\//, '') : '';
      const ok = args.length === 1 && (args[0] === '--version' || args[0] === '-v');
      if (!ok && !(script === 'automation/run-web-tests.mjs' && args.every((a, i) => i === 0 || !a.startsWith('-') || /^--max-workers=\d$/.test(a)))) deny('node is allowed only for automation/run-web-tests.mjs (and --version)');
      if (!ok && areaOf(dir) !== 'web') deny('run the web test wrapper from the repository root');
      continue;
    }
    if (prog === 'npm') {
      const pi = args.indexOf('--prefix');
      const area = pi >= 0 && args[pi + 1] ? areaOf(toAbs(args[pi + 1], dir || PROJECT)) : areaOf(dir);
      const rest = args.filter((a, i) => !(pi >= 0 && (i === pi || i === pi + 1)));
      const sub = rest.find((a) => !a.startsWith('-'));
      if (sub === 'run' || sub === 'run-script') {
        const script = rest.slice(rest.indexOf(sub) + 1).find((a) => !a.startsWith('-'));
        if (script === 'test') testRun('npm run test', rest, area);
        else if (!script || !NPM_SCRIPTS.has(script)) deny(`npm script "${script}" is not on the allow-list (database, payment, seed, dev-server and clean scripts need explicit approval)`);
      } else if (sub === 'test' || sub === 't' || sub === 'tst') {
        testRun('npm test', rest, area);
      } else if (!['ls', 'list', 'root', 'prefix', 'help'].includes(sub ?? '') && !rest.every((a) => a === '--version' || a === '-v')) {
        deny(`npm ${sub ?? ''} is not allowed (installs, updates, publishing and package execution need explicit approval)`);
      }
      continue;
    }
    if (prog === 'npx' || prog === 'npm-exec') {
      let i = 0;
      const flags = [];
      while (i < args.length && args[i].startsWith('-')) flags.push(args[i++]);
      if (!flags.some((f) => f === '--no-install' || f === '--no')) deny('npx requires --no-install (never download anything)');
      if (flags.some((f) => f === '-y' || f === '--yes' || f === '-p' || f === '--package' || f === '-c' || f === '--call')) deny('npx option is not allowed');
      const pkg = (args[i] || '').startsWith('@') ? args[i] : (args[i] || '').split('@')[0];
      tool(pkg, args.slice(i + 1), areaOf(dir));
      continue;
    }
    if (['tsc', 'vitest', 'jest', 'vite', 'prisma', 'expo'].includes(prog)) {
      tool(prog, args, areaOf(dir));
    }
  }
}

// ---------- entry ----------
async function main() {
  let raw = '';
  for await (const chunk of process.stdin) raw += chunk;
  const input = JSON.parse(raw);
  const name = String(input.tool_name || '');
  const ti = input.tool_input || {};
  const cwd = typeof input.cwd === 'string' ? input.cwd : PROJECT;

  if (name === 'Bash' || name === 'PowerShell') {
    guardCommand(String(ti.command ?? ''), cwd, ti.run_in_background === true);
  } else if (name === 'Read') {
    checkPath(ti.file_path, cwd, false);
  } else if (name === 'Grep' || name === 'Glob') {
    for (const v of [ti.path, ti.glob, name === 'Glob' ? ti.pattern : undefined]) checkPath(v, cwd, false);
  } else if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name)) {
    checkPath(ti.file_path ?? ti.notebook_path, cwd, true);
  } else if (name === 'mcp__terminal__run_in_terminal') {
    deny('commands cannot be sent to the user terminal (they would bypass this guard)');
  } else if (name.startsWith('mcp__')) {
    if (ENV_TEXT.test(JSON.stringify(ti).replace(/\\\\/g, '/'))) deny('.env files must never be read, listed, searched or edited');
  }
}

function emit(stream, text, code) {
  stream.write(text, () => process.exit(code));
}

try {
  await main();
  emit(process.stdout, '', 0);
} catch (e) {
  if (e instanceof Verdict && e.kind === 'ask') {
    emit(process.stdout, JSON.stringify({ hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'ask', permissionDecisionReason: `pb-guard: ${e.message}` } }), 0);
  } else if (e instanceof Verdict) {
    emit(process.stderr, `pb-guard BLOCKED: ${e.message}\n`, 2);
  } else {
    emit(process.stderr, 'pb-guard BLOCKED: internal error, failing closed\n', 2);
  }
}
