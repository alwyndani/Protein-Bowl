/**
 * CLI-ONLY bootstrap of the initial SUPER_ADMIN.   Usage (from /server):
 *
 *   npm run admin:bootstrap -- --email admin@yourcompany.com --name "Full Name"
 *
 * The password is NEVER a command-line argument and is never printed. Provide it by either:
 *   - typing it at the hidden prompt (interactive terminal; asked twice), or
 *   - piping it on stdin:        printf '%s' "$PW" | npm run admin:bootstrap -- --email ... --name ...
 *   - a ONE-TIME environment variable BOOTSTRAP_ADMIN_PASSWORD (unset it immediately afterwards; never commit it).
 *
 * Email/name may also come from BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_NAME.
 * It refuses to run when an active SUPER_ADMIN already exists. It is never invoked by application startup.
 */
import readline from 'readline';
import { PrismaClient } from '@prisma/client';
import { bootstrapSuperAdmin, BootstrapRefusedError } from '../src/modules/admin/bootstrap.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function promptHidden(question: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    // Echo suppression: everything typed after the prompt is swallowed.
    (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
      if (!muted) process.stdout.write(s);
    };
    rl.question(question, (answer) => {
      rl.close();
      process.stdout.write('\n');
      resolve(answer);
    });
    muted = true;
  });
}

async function readStdinLine(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString('utf8').split(/\r?\n/)[0] ?? '';
}

async function readPassword(): Promise<string> {
  if (process.env.BOOTSTRAP_ADMIN_PASSWORD) return process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (process.stdin.isTTY) {
    const first = await promptHidden('New SUPER_ADMIN password (min 12 chars): ');
    const second = await promptHidden('Repeat password: ');
    if (first !== second) throw new BootstrapRefusedError('Passwords do not match', 'INVALID_INPUT');
    return first;
  }
  return readStdinLine();
}

async function main() {
  const email = arg('email') ?? process.env.BOOTSTRAP_ADMIN_EMAIL;
  const fullName = arg('name') ?? process.env.BOOTSTRAP_ADMIN_NAME;
  if (!email || !fullName) {
    console.error('Usage: npm run admin:bootstrap -- --email <email> --name "<full name>"   (password via hidden prompt, stdin, or one-time env var)');
    process.exitCode = 2;
    return;
  }

  const password = await readPassword();
  const db = new PrismaClient();
  try {
    const result = await bootstrapSuperAdmin({ email, fullName, password }, db);
    console.log(`SUPER_ADMIN created: ${result.email} (id ${result.userId}, employee code ${result.employeeCode}).`);
    if (process.env.BOOTSTRAP_ADMIN_PASSWORD) {
      console.log('Reminder: unset BOOTSTRAP_ADMIN_PASSWORD from your environment now.');
    }
  } catch (err) {
    if (err instanceof BootstrapRefusedError) {
      console.error(`Bootstrap refused (${err.code}): ${err.message}`);
      process.exitCode = 1;
    } else {
      console.error('Bootstrap failed:', (err as Error).message);
      process.exitCode = 1;
    }
  } finally {
    await db.$disconnect();
  }
}

void main();
