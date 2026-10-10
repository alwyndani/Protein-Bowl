import { Prisma } from '@prisma/client';
import type { Request } from 'express';
import { prisma } from '../../config/database.js';

/** Keys whose values must never be written to the audit log (matched case-insensitively, anywhere in the payload). */
const SENSITIVE_KEY_PATTERN = /pass(word)?|hash|token|secret|authorization|cookie|api[-_]?key|credential|otp|pin\b|signature|cvv|cvc|vpa|(?:^|[^a-z])card/i;
const REDACTED = '[REDACTED]';
const MAX_STRING_LENGTH = 500;
const MAX_DEPTH = 6;

export interface AuditActor {
  userId?: string | null;
  roles?: readonly string[];
}

export interface AuditContext {
  ipAddress?: string | null;
  userAgent?: string | null;
}

export interface AuditEntry {
  actor?: AuditActor | null;
  action: string;
  entity: string;
  entityId?: string | null;
  payload?: unknown;
  context?: AuditContext;
}

type Db = Prisma.TransactionClient | typeof prisma;

/**
 * Append-only audit writer. There is intentionally no update/delete API.
 * Pass the transaction client when the audited change itself runs in a transaction so both commit atomically.
 */
export class AuditService {
  /** Recursively redact sensitive keys, bound string/array/object size, survive circular references. */
  public static sanitize(value: unknown, depth = 0, seen = new WeakSet<object>()): Prisma.InputJsonValue | null {
    if (value === null || value === undefined) return null;
    if (typeof value === 'string') return value.length > MAX_STRING_LENGTH ? `${value.slice(0, MAX_STRING_LENGTH)}…` : value;
    if (typeof value === 'number' || typeof value === 'boolean') return value;
    if (typeof value === 'bigint') return value.toString();
    if (value instanceof Date) return value.toISOString();
    if (typeof value !== 'object') return String(value);
    if (depth >= MAX_DEPTH) return '[TRUNCATED]';
    if (seen.has(value as object)) return '[CIRCULAR]';
    seen.add(value as object);

    if (Array.isArray(value)) {
      return value.slice(0, 50).map((item) => this.sanitize(item, depth + 1, seen) ?? null) as Prisma.InputJsonArray;
    }

    const out: Record<string, Prisma.InputJsonValue | null> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = SENSITIVE_KEY_PATTERN.test(key) ? REDACTED : this.sanitize(val, depth + 1, seen);
    }
    return out as Prisma.InputJsonObject;
  }

  /** IP address and user agent from an Express request (never headers such as Authorization / Cookie). */
  public static contextFromRequest(req?: Pick<Request, 'ip' | 'headers'> | null): AuditContext {
    if (!req) return {};
    const ua = req.headers?.['user-agent'];
    return {
      ipAddress: req.ip ?? null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 300) : null
    };
  }

  /** Write one audit row. Throws on failure - use inside the same transaction as the audited change. */
  public static async record(entry: AuditEntry, db: Db = prisma) {
    const payload = this.sanitize(entry.payload);
    return await db.auditLog.create({
      data: {
        userId: entry.actor?.userId ?? null,
        role: entry.actor?.roles?.length ? entry.actor.roles.join(',') : null,
        action: entry.action,
        entity: entry.entity,
        entityId: entry.entityId ?? null,
        payload: payload === null ? Prisma.JsonNull : payload,
        ipAddress: entry.context?.ipAddress ?? null,
        userAgent: entry.context?.userAgent ?? null
      }
    });
  }

  /** Best-effort variant for security signals (denials): an audit failure must never mask the original outcome. */
  public static async recordSafe(entry: AuditEntry, db: Db = prisma): Promise<void> {
    try {
      await this.record(entry, db);
    } catch (err) {
      console.error('Audit write failed:', (err as Error).message);
    }
  }
}
