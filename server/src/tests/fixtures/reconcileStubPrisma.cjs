// TEMPORARY-H1-DO-NOT-MERGE
// Test-only preload (node --require) for the isolated reconciliation-CLI subprocess tests. It installs a stub Prisma client on
// globalThis.prismaGlobal BEFORE any application module is loaded, so config/database.ts never constructs a real PrismaClient and no
// database can be reached. Every call is appended to the file named by PB_STUB_LOG.
//
//   PB_STUB_MODE   NEVER | LATE_RESOLVE | LATE_REJECT | DB
//   PB_STUB_DB     database name answered by `select current_database()` (DB / LATE_RESOLVE modes)
//   PB_STUB_ID_DB / PB_STUB_ID_ADDR / PB_STUB_ID_PORT / PB_STUB_ID_MARKER  override one field of the identity row (the literal __NULL__ answers null)
//   PB_STUB_FATAL  exception | rejection: raise a real uncaught exception / unhandled rejection 500 ms after the query starts
//   PB_STUB_PATCH_EXIT=1  after the first query, process.exit is wrapped: it logs EXIT <code>, settles the pending query late
//                         (LATE_* modes) one second later, and performs the real exit three seconds later.
const fs = require('node:fs');

// must equal RECONCILE_REQUIRED_MARKER in reconcileTargetGuard.ts (a test compares them)
const DEFAULT_MARKER = 'DISPOSABLE reconciliation test copy of protein_bowl_p11c_test (P11C-2); safe to drop';
const logFile = process.env.PB_STUB_LOG;
const mode = process.env.PB_STUB_MODE || 'DB';
const log = (line) => {
  try {
    fs.appendFileSync(logFile, `${line}\n`);
  } catch {
    /* never throw from the stub */
  }
};

const prismaAlreadyLoaded = Object.keys(require.cache).some((k) => k.includes('@prisma'));
log(`LOADED pid=${process.pid} prismaAlreadyLoaded=${prismaAlreadyLoaded}`);

let patched = false;
let settleLate = null;
function patchExit() {
  if (patched || process.env.PB_STUB_PATCH_EXIT !== '1') return;
  patched = true;
  const realExit = process.exit.bind(process);
  process.exit = (code) => {
    log(`EXIT ${code} pid=${process.pid}`);
    if (settleLate) setTimeout(settleLate, 1000);
    setTimeout(() => realExit(code), 3000);
  };
}

const field = (name, fallback) => {
  const v = process.env[name];
  return v === undefined ? fallback : v === '__NULL__' ? null : v;
};
// The row answered to the guard's identity query (current_database, host(inet_server_addr()), inet_server_port()::text, database comment).
const identityRow = () => ({
  db: field('PB_STUB_ID_DB', process.env.PB_STUB_DB ?? null),
  addr: field('PB_STUB_ID_ADDR', '127.0.0.1'),
  port: field('PB_STUB_ID_PORT', '5432'),
  marker: field('PB_STUB_ID_MARKER', DEFAULT_MARKER)
});

const base = {
  $queryRaw() {
    log(`QUERY pid=${process.pid}`);
    patchExit();
    // PB_STUB_FATAL: a REAL uncaught exception / unhandled rejection raised in this process while the guard query is pending
    if (process.env.PB_STUB_FATAL === 'exception') {
      setTimeout(() => {
        throw new Error('fatal postgresql://leakuser:LEAKSECRET@127.0.0.1:1/x');
      }, 500);
    } else if (process.env.PB_STUB_FATAL === 'rejection') {
      setTimeout(() => {
        Promise.reject(new Error('fatal postgresql://leakuser:LEAKSECRET@127.0.0.1:1/x'));
      }, 500);
    }
    if (mode === 'DB') return Promise.resolve([identityRow()]);
    return new Promise((resolve, reject) => {
      if (mode === 'LATE_RESOLVE') settleLate = () => resolve([identityRow()]);
      else if (mode === 'LATE_REJECT') settleLate = () => reject(new Error('connect failed postgresql://leakuser:LEAKSECRET@127.0.0.1:1/x'));
      // NEVER: this promise never settles
    });
  },
  $disconnect() {
    log(`DISCONNECT pid=${process.pid}`);
    return Promise.resolve();
  }
};

const stubClient = new Proxy(base, {
  get(target, prop) {
    if (prop in target) return target[prop];
    if (typeof prop === 'symbol' || prop === 'then') return undefined;
    log(`UNEXPECTED ${String(prop)} pid=${process.pid}`);
    return () => {
      throw new Error('unexpected stub call');
    };
  }
});

// config/database.ts READS this property when it is evaluated (and assigns it afterwards): a read proves the application database module ran.
// Importing @prisma/client itself is detected at exit through require.cache. Both are logged so tests can prove a refusal happened BEFORE either.
Object.defineProperty(globalThis, 'prismaGlobal', {
  configurable: true,
  enumerable: true,
  get() {
    log(`PRISMA_GLOBAL_READ pid=${process.pid}`);
    return stubClient;
  },
  set() {
    log(`PRISMA_GLOBAL_SET pid=${process.pid}`); // the application stores its client here; the stub stays in place
  }
});
process.on('exit', () => {
  log(`PRISMA_MODULE_LOADED=${Object.keys(require.cache).some((k) => k.includes('@prisma'))} pid=${process.pid}`);
});
