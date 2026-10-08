import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { mapBackendRoleToUserRole } from '../../context/AuthContext';

const ADMIN_DIR = __dirname;
const SERVICE_FILES = [join(__dirname, '..', '..', 'services', 'adminService.ts'), join(__dirname, '..', '..', 'services', 'adminTypes.ts')];

const sourceFiles = readdirSync(ADMIN_DIR)
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\./.test(f))
  .map((f) => join(ADMIN_DIR, f))
  .concat(SERVICE_FILES);

/** Source with comments removed, so explanatory comments about what we do NOT do cannot trip the scans. */
const read = (file: string) =>
  readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');

describe('Super Admin workspace: secret handling (static source checks)', () => {
  it('covers the expected set of source files', () => {
    expect(sourceFiles.length).toBeGreaterThanOrEqual(15);
  });

  it('never touches localStorage, sessionStorage, IndexedDB or document.cookie (invitation links and step-up proofs stay in memory)', () => {
    for (const file of sourceFiles) {
      expect(read(file), file).not.toMatch(/localStorage|sessionStorage|indexedDB|document\.cookie/);
    }
  });

  it('never logs: no console.* calls anywhere in the admin workspace or service', () => {
    for (const file of sourceFiles) {
      expect(read(file), file).not.toMatch(/console\.(log|info|debug|warn|error|trace)/);
    }
  });

  it('contains no embedded demo/admin credentials', () => {
    for (const file of sourceFiles) {
      const text = read(file);
      expect(text, file).not.toMatch(/admin@proteinbowl|Password@123|Admin@123|demo[-_ ]?password/i);
    }
  });

  it('the step-up proof is only ever sent as the X-Step-Up-Token header (never in a body or query string)', () => {
    const service = read(SERVICE_FILES[0]);
    expect(service).toContain("STEP_UP_HEADER = 'X-Step-Up-Token'");
    expect(service).not.toMatch(/stepUpToken\s*[:=].*(body|JSON\.stringify)/);
    expect(service).not.toMatch(/\?stepUp|&stepUp|step_up=/);
  });

  it('the invitation token is only read from the URL fragment, never from the query string', () => {
    const accept = read(join(ADMIN_DIR, 'AcceptInvitePage.tsx'));
    expect(accept).toContain('window.location.hash');
    expect(accept).not.toMatch(/URLSearchParams\(\s*(window\.)?location\.search/);
    expect(accept).toContain('history.replaceState');
  });
});

describe('SUPER_ADMIN and MD are separate roles in the web client', () => {
  it('SUPER_ADMIN maps to its own super_admin workspace, not to md', () => {
    expect(mapBackendRoleToUserRole(['SUPER_ADMIN'])).toBe('super_admin');
    expect(mapBackendRoleToUserRole(['SUPER_ADMIN', 'MD'])).toBe('super_admin');
  });

  it('MD still maps to md and ordinary roles are unaffected', () => {
    expect(mapBackendRoleToUserRole(['MD'])).toBe('md');
    expect(mapBackendRoleToUserRole(['CHEF'])).toBe('chef');
    expect(mapBackendRoleToUserRole(['CUSTOMER'])).toBe('customer');
  });

  it('App renders the Admin workspace only for super_admin and keeps the MD dashboard on md only', () => {
    const app = read(join(__dirname, '..', '..', 'App.tsx'));
    expect(app).toMatch(/currentRole === 'super_admin' && <AdminWorkspace \/>/);
    expect(app).toMatch(/currentRole === 'md' && \(/);
    expect(app).not.toMatch(/currentRole === 'md' \|\| currentRole === 'super_admin'|currentRole === 'super_admin' \|\| currentRole === 'md'/);
  });
});
