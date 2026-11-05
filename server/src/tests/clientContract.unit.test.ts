import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import app from '../app.js';

/**
 * Frontend <-> backend contract: every endpoint the web services and the mobile API modules call must exist in the server's real route tree
 * (path shape only; no database, no network). A renamed, removed or misspelled endpoint fails here instead of in production.
 */
interface Layer {
  handle: { stack?: Layer[] };
  route?: { path: string; methods: Record<string, boolean> };
  regexp?: RegExp;
}

function mountOf(layer: Layer): string {
  const src = layer.regexp?.source ?? '';
  return src.replace('^\\/', '/').replace('\\/?(?=\\/|$)', '').replace(/\\\//g, '/').replace(/\$$/, '') || '';
}
function collect(stack: Layer[], prefix: string, out: Set<string>) {
  for (const l of stack) {
    if (l.route) out.add(`${prefix}${l.route.path}`);
    else if (l.handle?.stack) collect(l.handle.stack, `${prefix}${mountOf(l)}`, out);
  }
}
const norm = (p: string) => p.replace(/\/+$/, '').replace(/:[A-Za-z0-9_]+/g, ':p') || '/';

const serverPaths = new Set<string>();
collect(((app as unknown as { _router: { stack: Layer[] } })._router).stack, '', serverPaths);
const known = new Set([...serverPaths].map((p) => norm(p.replace(/^\/api\/v1/, ''))));
const knownList = [...known];

/** Reads the first argument of `request(`/`requestData(` calls and turns it into a path shape (dynamic parts become :p). */
function endpointsIn(source: string): string[] {
  const out: string[] = [];
  const re = /\b(?:requestData|request)(?:<[^()]*>)?\(\s*/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let arg = '';
    for (; i < source.length; i++) {
      const c = source[i];
      if (c === '`' || c === "'" || c === '"') {
        const q = c;
        arg += c;
        i++;
        for (; i < source.length && source[i] !== q; i++) {
          if (q === '`' && source[i] === '$' && source[i + 1] === '{') {
            let d = 0;
            for (; i < source.length; i++) {
              if (source[i] === '{') d++;
              if (source[i] === '}' && --d === 0) break;
              arg += source[i];
            }
            arg += '}';
            continue;
          }
          arg += source[i];
        }
        arg += q;
        continue;
      }
      if (c === '(' || c === '[' || c === '{') depth++;
      if (c === ')' || c === ']' || c === '}') {
        if (depth === 0) break;
        depth--;
      }
      if (c === ',' && depth === 0) break;
      arg += c;
    }
    out.push(shape(arg));
  }
  return out.filter((p) => p.startsWith('/'));
}

function shape(arg: string): string {
  const terms = arg.split(/\+(?=(?:[^`'"]*[`'"][^`'"]*[`'"])*[^`'"]*$)/); // top-level '+'
  let path = '';
  for (const t0 of terms) {
    const t = t0.trim();
    if ((t.startsWith('`') && t.endsWith('`')) || (t.startsWith("'") && t.endsWith("'")) || (t.startsWith('"') && t.endsWith('"'))) {
      path += t.slice(1, -1).replace(/\$\{[^}]*\}\}?/g, (seg) => (seg.endsWith('}}') ? ':p}' : ':p'));
    } else {
      path += ':p';
    }
  }
  path = path.replace(/\?.*$/, '');
  path = path.split(/[`)\s}]/)[0]; // what follows an unbalanced quote / closing bracket belongs to a surrounding expression, not to the path
  // a dynamic part glued to a word (a query-string helper such as `${qs}`), not a path segment, is dropped
  path = path.replace(/([A-Za-z0-9_-]):p/g, '$1');
  return norm(path);
}

function files(dir: string, filter: (f: string) => boolean): string[] {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p, filter) : filter(p) ? [p] : [];
  });
}

const ROOT = path.join(process.cwd(), '..');

/** A client path whose LAST segment is a variable (an action name such as accept / start-preparing / cancel) matches any route of the same shape. */
function exists(ep: string): boolean {
  if (known.has(ep)) return true;
  if (!ep.endsWith('/:p')) return false;
  const head = ep.slice(0, -2);
  return knownList.some((k) => k.startsWith(head) && k.split('/').length === ep.split('/').length);
}

describe('client endpoints exist on the server', () => {
  const webServices = files(path.join(ROOT, 'src', 'services'), (f) => /\.ts$/.test(f) && !/\.test\.ts$/.test(f));
  const mobileApis = [
    ...files(path.join(ROOT, 'apps', 'mobile', 'src'), (f) => /(api|Api)\.ts$/.test(f) && !f.includes('apiClient')),
    path.join(ROOT, 'apps', 'mobile', 'src', 'auth', 'sessionManager.ts')
  ].filter((f) => fs.existsSync(f));

  it('finds the clients and the server routes', () => {
    expect(webServices.length).toBeGreaterThan(10);
    expect(mobileApis.length).toBeGreaterThan(2);
    expect(known.size).toBeGreaterThan(100);
  });

  for (const [label, list] of [['web', webServices], ['mobile', mobileApis]] as const) {
    it(`every ${label} client endpoint is a real server route`, () => {
      const missing: string[] = [];
      let checked = 0;
      for (const f of list) {
        for (const ep of endpointsIn(fs.readFileSync(f, 'utf8'))) {
          checked++;
          if (!exists(ep)) missing.push(`${path.relative(ROOT, f)}: ${ep}`);
        }
      }
      expect(checked, 'endpoints examined').toBeGreaterThan(label === 'web' ? 40 : 10);
      expect(missing).toEqual([]);
    });
  }

  it('sanity: the matcher distinguishes a real route from a misspelled one', () => {
    expect(known.has('/trainer/clients/:p/plans')).toBe(true);
    expect(known.has('/trainer/clients/:p/plan')).toBe(false);
    expect(knownList.length).toBeGreaterThan(100);
  });
});
