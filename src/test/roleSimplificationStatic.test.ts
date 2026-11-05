import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { APPROVED_BACKEND_ROLES, RETIRED_BACKEND_ROLES } from '../utils/approvedRoles';
import { approvedRolesOf } from '../../server/src/authz/approvedRoles'; // a leaf module that imports nothing, so no server code, Prisma or database is loaded

/**
 * Role simplification: static guards over source files. Source-only: these tests read files from the repository and import only one server leaf module (authz/approvedRoles, which imports nothing);
 * no database, no network, no server process.
 */
const SRC = join(__dirname, '..');
const ROOT = join(SRC, '..');
const read = (...p: string[]) => readFileSync(join(ROOT, ...p), 'utf8');
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

function quotedList(src: string, name: string): string[] {
  const m = src.match(new RegExp(`export const ${name} = \\[([^\\]]*)\\]`));
  if (!m) throw new Error(`${name} not found`);
  return [...m[1].matchAll(/'([A-Z_]+)'/g)].map((x) => x[1]);
}

function productionWebFiles(dir = SRC, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name !== 'node_modules' && name !== 'data' && name !== 'test') productionWebFiles(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\./.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('role vocabulary', () => {
  it('the web and server approved / retired role lists are identical', () => {
    const server = read('server', 'src', 'authz', 'approvedRoles.ts');
    expect([...quotedList(server, 'APPROVED_ROLES')].sort()).toEqual([...APPROVED_BACKEND_ROLES].sort());
    expect([...quotedList(server, 'RETIRED_ROLES')].sort()).toEqual([...RETIRED_BACKEND_ROLES].sort());
    expect(APPROVED_BACKEND_ROLES).toHaveLength(6);
  });

  it('the approved and retired lists are disjoint and together are exactly the Prisma RoleEnum', () => {
    const schema = read('server', 'prisma', 'schema.prisma');
    const block = schema.match(/enum RoleEnum \{([^}]*)\}/);
    expect(block).not.toBeNull();
    const enumValues = block![1].split(/\s+/).filter((t) => /^[A-Z_]+$/.test(t));
    for (const r of APPROVED_BACKEND_ROLES) expect((RETIRED_BACKEND_ROLES as readonly string[]).includes(r), r).toBe(false);
    expect([...enumValues].sort()).toEqual([...APPROVED_BACKEND_ROLES, ...RETIRED_BACKEND_ROLES].sort());
  });
});

describe('seed role definitions', () => {
  it('server/prisma/seed.ts defines accounts with approved roles only (no retired role is ever seeded)', () => {
    const seed = strip(read('server', 'prisma', 'seed.ts'));
    const used = [...new Set([...seed.matchAll(/RoleEnum\.([A-Z_]+)/g)].map((m) => m[1]))];
    expect(used.length).toBeGreaterThan(0);
    for (const role of used) {
      expect((APPROVED_BACKEND_ROLES as readonly string[]).includes(role), `${role} is not an approved role`).toBe(true);
      expect((RETIRED_BACKEND_ROLES as readonly string[]).includes(role), `${role} is retired`).toBe(false);
    }
    for (const role of ['SUPER_ADMIN', 'CHEF', 'CUSTOMER']) expect(used).toContain(role);
  });
});

describe('web client: retired roles', () => {
  const rel = (f: string) => relative(SRC, f).split(sep).join('/');

  it('no production web file quotes a retired role name except the vocabulary file', () => {
    const hits = productionWebFiles()
      .filter((f) => /['"](MD|DELIVERY|POS|BAKERY_FMCG|TEPACHE_ERP|SWIGGY_ZOMATO)['"]/.test(strip(readFileSync(f, 'utf8'))))
      .map(rel)
      .sort();
    expect(hits).toEqual(['utils/approvedRoles.ts']);
  });

  it('MESS_CUSTOMER appears only in the places that await the account-conversion decision (no new use may appear)', () => {
    const allowed = new Set(['App.tsx', 'context/AuthContext.tsx', 'utils/approvedRoles.ts', 'utils/messErrors.ts', 'utils/roleGuard.ts']);
    const hits = productionWebFiles()
      .filter((f) => /MESS_CUSTOMER/.test(strip(readFileSync(f, 'utf8'))))
      .map(rel);
    for (const h of hits) expect(allowed.has(h), h).toBe(true);
  });
});

// The one-off takeover script is deliberately NOT in the repository (.gitignore): it is hard-coded to the development database. These source-text checks
// therefore run wherever the file exists (the developer's machine) and are skipped, visibly, where it does not (a clean checkout such as CI). The file is read
// lazily inside each test, never while the suite is collected, so its absence cannot fail the other guards in this file.
const TAKEOVER_SCRIPT = join(ROOT, 'server', 'scripts', 'takeoverLiveDelivery.ts');

describe.skipIf(!existsSync(TAKEOVER_SCRIPT))('delivery takeover tool: no revert, safeguards preserved', () => {
  const source = () => strip(readFileSync(TAKEOVER_SCRIPT, 'utf8'));

  it('has no revert at all (there is no valid account to hand a job back to) and refuses an old --revert command line before anything else', () => {
    const script = source();
    expect(script).not.toMatch(/runRevert|TAKEOVER_REVERTED|isEligible|REFUSED_FORMER_DRIVER/);
    expect(script).toContain("argv.includes('--revert')");
    expect(script).toContain('REVERT_REMOVED');
    const main = script.slice(script.indexOf('async function main'));
    expect(main.indexOf('REVERT_REMOVED')).toBeGreaterThan(-1);
    expect(main.indexOf('REVERT_REMOVED')).toBeLessThan(main.indexOf('assertExactTarget()'));
    expect(main).not.toContain("value('revert')");
  });

  it('keeps the existing safeguards: exact target, live identity check, confirmation, new manifest, dry run first, built-in exclusion', () => {
    const script = source();
    for (const marker of [
      "host: 'localhost'",
      'assertExactTarget',
      'LIVE_TARGET_MISMATCH',
      'CONFIRMATION_MISSING_OR_WRONG',
      'MANIFEST_OUT_REQUIRED',
      'MANIFEST_ALREADY_EXISTS',
      'ACTOR_NOT_SUPER_ADMIN',
      'DRY RUN: nothing was changed',
      'EXCLUDED_ITEM_IN_PLAN'
    ]) {
      expect(script, marker).toContain(marker);
    }
    expect(script).toContain('const DEFAULT_EXCLUDED');
    expect(script).toContain("new Set(['PB-261011-H6PD4J'])"); // stays excluded until its purpose and state can be reviewed
  });

  it('a dry run returns before the manifest is written and before any takeover service is called', () => {
    const script = source();
    const run = script.slice(script.indexOf('async function runTakeover'));
    const dry = run.indexOf('if (!execute)');
    expect(dry).toBeGreaterThan(-1);
    expect(dry).toBeLessThan(run.indexOf('writeManifest(manifestPath!, manifest, true)'));
    expect(dry).toBeLessThan(run.indexOf('DeliveryOperateService.takeover'));
  });
});

describe('the one-off delivery takeover script stays out of the repository', () => {
  it('is listed in .gitignore (it is hard-coded to the development database and must never be committed by accident)', () => {
    expect(read('.gitignore')).toMatch(/^server\/scripts\/takeoverLiveDelivery\.ts\s*$/m);
  });
});

describe('access tokens carry only approved roles', () => {
  const SERVER_SRC = join(ROOT, 'server', 'src');
  const walkServer = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) {
        if (name !== 'tests' && name !== 'node_modules') walkServer(full, out);
      } else if (name.endsWith('.ts')) {
        out.push(full);
      }
    }
    return out;
  };

  it('AuthService is the only issuer, and each of its three sites (register, login, refresh) builds the claim roles with approvedRolesOf', () => {
    const issuers = walkServer(SERVER_SRC)
      .map((f) => relative(SERVER_SRC, f).split(sep).join('/'))
      .filter((f) => f !== 'utils/jwt.ts')
      .filter((f) => /generateAccessToken\(/.test(strip(readFileSync(join(SERVER_SRC, f), 'utf8'))));
    expect(issuers).toEqual(['modules/auth/auth.service.ts']);

    const code = strip(read('server', 'src', 'modules', 'auth', 'auth.service.ts'));
    expect(code.match(/generateAccessToken\(\{/g)).toHaveLength(3);
    expect(code.match(/const userRoles = approvedRolesOf\(/g)).toHaveLength(3);
    expect(code.match(/roles: userRoles/g)).toHaveLength(3);
    expect(code).not.toMatch(/const userRoles = \w+\.roles\.map\(/);
  });
  it('approvedRolesOf (the filter every token is built with) drops retired and unknown values and keeps approved ones in order', () => {
    expect(approvedRolesOf(['MD', 'CHEF', 'POS', 'SUPER_ADMIN', 'DELIVERY', 'CHEF'])).toEqual(['CHEF', 'SUPER_ADMIN', 'CHEF']);
    expect(approvedRolesOf(['MESS_CUSTOMER', 'BAKERY_FMCG', 'TEPACHE_ERP', 'SWIGGY_ZOMATO'])).toEqual([]);
    expect(approvedRolesOf([])).toEqual([]);
    expect(approvedRolesOf(['CUSTOMER', 'customer', 'ADMIN', ''])).toEqual(['CUSTOMER']);
    for (const r of APPROVED_BACKEND_ROLES) expect(approvedRolesOf([r])).toEqual([r]);
    for (const r of RETIRED_BACKEND_ROLES) expect(approvedRolesOf([r])).toEqual([]);
  });
});
