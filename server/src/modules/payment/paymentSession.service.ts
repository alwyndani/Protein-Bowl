import { Payment } from '@prisma/client';
import { prisma } from '../../config/database.js';
import { getPaymentConfig } from '../../config/paymentConfig.js';
import { AppError } from '../../middleware/error.middleware.js';
import { AuditContext, AuditService } from '../audit/audit.service.js';
import { toMinorUnits } from './money.js';
import { PaymentSettlementService, SettleOutcome } from './paymentSettlement.service.js';
import { adoptProviderOrder, lookupProviderOrderByReceipt, markSessionUnknown } from './paymentRecovery.ops.js';
import { lockOrder, lockSession, safeCode } from './paymentOps.js';

import type { Tx } from './paymentOps.js';
import { DECIDED_RECON, DEFAULT_CURRENCY, OPEN_SESSION_STATUSES, SESSION_STATUS } from './paymentStatus.js';
import { getPaymentProvider } from './providerRegistry.js';
import { PaymentProvider, ProviderDefiniteError, ProviderOrder, ProviderPaymentInfo, ProviderUnknownError } from './provider.types.js';

/** The ONLY data returned to a customer to open checkout: no secrets, no internal flags. */
export interface CheckoutSessionDto {
  attemptId: string;
  provider: string;
  keyId: string;
  providerOrderId: string;
  amountMinor: number;
  currency: string;
  orderNumber: string;
  expiresAt: Date;
  status: string;
}

export interface VerifyResult {
  httpStatus: 200 | 202;
  result: 'PAID' | 'PENDING';
  orderStatus: string;
  orderPaymentStatus: string;
}

const inProgress = () => new AppError('A payment session for this order is still being set up. Please retry in a moment.', 409, 'PAYMENT_ATTEMPT_IN_PROGRESS');
const unavailable = () => new AppError('The payment provider is temporarily unavailable. Please try again shortly.', 503, 'PAYMENT_PROVIDER_UNAVAILABLE');

export class PaymentSessionService {
  // ================================================================================================ create / reuse
  public static async createOrReuse(userId: string, orderId: string, context?: AuditContext): Promise<CheckoutSessionDto> {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (!profile) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
    const provider = getPaymentProvider();

    type Decision =
      | { kind: 'NEW'; session: Payment; orderNumber: string }
      | { kind: 'REUSE'; session: Payment; orderNumber: string }
      | { kind: 'RENEW'; session: Payment; orderNumber: string }
      | { kind: 'RESOLVE'; session: Payment; orderNumber: string };

    const decision: Decision = await prisma.$transaction(
      async (tx) => {
        await lockOrder(tx, orderId);
        const order = await tx.order.findFirst({
          where: { id: orderId, customerProfileId: profile.id },
          select: { id: true, orderNumber: true, status: true, paymentStatus: true, paymentMethod: true, orderType: true, netAmount: true, paidByProviderPaymentId: true }
        });
        if (!order) throw new AppError('Order not found', 404, 'ORDER_NOT_FOUND');
        if (order.paymentStatus === 'PAID' || order.paidByProviderPaymentId) throw new AppError('This order has already been paid', 409, 'PAYMENT_ALREADY_COMPLETED');
        if (order.orderType !== 'DIRECT' || order.paymentMethod !== 'ONLINE' || order.status !== 'PENDING') {
          throw new AppError('This order cannot be paid online', 409, 'ORDER_NOT_PAYABLE');
        }
        const amountMinor = toMinorUnits(order.netAmount);
        if (amountMinor < provider.minAmountMinor) {
          throw new AppError('This order total is below the minimum amount the payment provider accepts', 422, 'PAYMENT_AMOUNT_TOO_SMALL');
        }

        const open = await tx.payment.findFirst({
          where: { orderId, provider: provider.name, supersededById: null, status: { in: [...OPEN_SESSION_STATUSES] } },
          orderBy: { createdAt: 'desc' }
        });
        const now = new Date();

        if (!open) {
          const created = await this.insertSession(tx, { orderId, customerProfileId: profile.id, amount: order.netAmount, provider: provider.name });
          await AuditService.record(
            {
              actor: { userId, roles: ['CUSTOMER'] },
              action: 'PAYMENT_ATTEMPT_CREATED',
              entity: 'Payment',
              entityId: created.id,
              payload: { orderNumber: order.orderNumber, amountMinor, currency: DEFAULT_CURRENCY, provider: provider.name },
              context
            },
            tx
          );
          return { kind: 'NEW', session: created, orderNumber: order.orderNumber };
        }
        if (open.providerOrderId === null) return { kind: 'RESOLVE', session: open, orderNumber: order.orderNumber };
        if (open.status === SESSION_STATUS.PENDING && open.expiresAt && open.expiresAt > now) return { kind: 'REUSE', session: open, orderNumber: order.orderNumber };
        return { kind: 'RENEW', session: open, orderNumber: order.orderNumber };
      },
      { maxWait: 10000, timeout: 20000 }
    );

    switch (decision.kind) {
      case 'REUSE':
        return this.toCheckoutDto(decision.session, decision.orderNumber, provider);
      case 'NEW':
        return await this.callProviderAndPersist(decision.session, decision.orderNumber, provider, context);
      case 'RESOLVE':
        return await this.resolveUnfinished(decision.session, decision.orderNumber, provider);
      case 'RENEW':
        return await this.renewOrReplace(decision.session, decision.orderNumber, provider, context);
    }
  }

  private static async insertSession(tx: Tx, data: { orderId: string; customerProfileId: string; amount: Payment['amount']; provider: string }): Promise<Payment> {
    return await tx.payment.create({
      data: {
        orderId: data.orderId,
        customerProfileId: data.customerProfileId,
        amount: data.amount, // snapshot of the persisted Order.netAmount - never client supplied
        currency: DEFAULT_CURRENCY,
        status: SESSION_STATUS.CREATED,
        provider: data.provider,
        // a crash between this insert and the provider call is recovered by the reconciliation worker
        nextAttemptAt: new Date(Date.now() + getPaymentConfig().unknownGraceMs + 5000)
      }
    });
  }

  private static toCheckoutDto(session: Payment, orderNumber: string, provider: PaymentProvider): CheckoutSessionDto {
    return {
      attemptId: session.id,
      provider: provider.name,
      keyId: provider.getPublicCheckoutConfig().keyId,
      providerOrderId: session.providerOrderId as string,
      amountMinor: toMinorUnits(session.amount),
      currency: session.currency,
      orderNumber,
      expiresAt: session.expiresAt as Date,
      status: session.status
    };
  }

  // ================================================================================================ provider call (outside any DB transaction)
  private static async callProviderAndPersist(session: Payment, orderNumber: string, provider: PaymentProvider, context?: AuditContext): Promise<CheckoutSessionDto> {
    const amountMinor = toMinorUnits(session.amount);
    let providerOrder: ProviderOrder;
    try {
      providerOrder = await provider.createOrder({
        receipt: session.id,
        amountMinor,
        currency: DEFAULT_CURRENCY,
        notes: { pbAttemptId: session.id, pbOrderNumber: orderNumber, source: 'protein-bowl' }
      });
    } catch (err) {
      if (err instanceof ProviderDefiniteError) {
        // The provider rejected the request: definitely nothing was created.
        await prisma.$transaction(async (tx) => {
          await tx.payment.update({ where: { id: session.id }, data: { status: SESSION_STATUS.FAILED, lastError: safeCode(err), nextAttemptAt: null } });
          await AuditService.record(
            { actor: null, action: 'PAYMENT_FAILED', entity: 'Payment', entityId: session.id, payload: { orderNumber, stage: 'PROVIDER_ORDER_CREATE', code: safeCode(err) }, context },
            tx
          );
        });
        throw unavailable();
      }
      // Unknown outcome (timeout, network, 5xx, bad answer): the provider MAY have created the order. Never abandon, never retry the create.
      await markSessionUnknown(session.id, safeCode(err, 'PROVIDER_UNKNOWN'));
      throw unavailable();
    }

    // Defensive: the provider's answer must describe OUR intent. Anything else is treated as unknown, never trusted.
    if (providerOrder.receipt !== session.id || providerOrder.amountMinor !== amountMinor || providerOrder.currency !== DEFAULT_CURRENCY) {
      await markSessionUnknown(session.id, 'PROVIDER_ORDER_MISMATCH');
      await prisma.payment.update({ where: { id: session.id }, data: { reviewFlag: 'PROVIDER_ORDER_MISMATCH' } }).catch(() => undefined);
      throw unavailable();
    }

    // Persist with a few bounded retries: we hold the provider order id in memory only until this succeeds.
    let lastErr: unknown;
    for (let i = 0; i < 3; i++) {
      try {
        const persisted = await this.persistProviderOrder(session.id, providerOrder);
        return this.toCheckoutDto(persisted, orderNumber, provider);
      } catch (err) {
        lastErr = err;
        await new Promise((r) => setTimeout(r, 50 * 2 ** i));
      }
    }
    void lastErr;
    // The local write kept failing although the provider order exists: stays UNKNOWN; reconciliation finds it by receipt.
    await markSessionUnknown(session.id, 'LOCAL_PERSIST_FAILED').catch(() => undefined);
    throw inProgress();
  }

  private static async persistProviderOrder(sessionId: string, providerOrder: ProviderOrder): Promise<Payment> {
    const cfg = getPaymentConfig();
    return await prisma.$transaction(async (tx) => {
      const peek = await tx.payment.findUniqueOrThrow({ where: { id: sessionId }, select: { orderId: true } });
      await lockOrder(tx, peek.orderId);
      await lockSession(tx, sessionId);
      const current = await tx.payment.findUniqueOrThrow({ where: { id: sessionId } });
      if (current.providerOrderId) return current; // already adopted (e.g. by reconciliation): idempotent
      return await tx.payment.update({
        where: { id: sessionId },
        data: {
          providerOrderId: providerOrder.providerOrderId,
          providerStatus: providerOrder.status,
          status: SESSION_STATUS.PENDING,
          expiresAt: new Date(Date.now() + cfg.sessionTtlMs),
          lastError: null,
          nextAttemptAt: new Date(Date.now() + 120_000) // early safety check for a missed webhook
        }
      });
    });
  }

  // ================================================================================================ CREATED / UNKNOWN sessions
  private static async resolveUnfinished(session: Payment, orderNumber: string, provider: PaymentProvider): Promise<CheckoutSessionDto> {
    const cfg = getPaymentConfig();
    const ageMs = Date.now() - session.createdAt.getTime();
    // A CREATED session this young may still be mid-call in another request: do not interfere.
    if (session.status === SESSION_STATUS.CREATED && ageMs < cfg.unknownGraceMs) throw inProgress();

    let lookup;
    try {
      lookup = await lookupProviderOrderByReceipt(provider, session);
    } catch (err) {
      if (err instanceof ProviderUnknownError) throw unavailable();
      throw err;
    }
    if (lookup.kind === 'FOUND') {
      const result = await adoptProviderOrder(session.id, lookup.order, provider.name);
      if (!result.adopted && result.reason !== 'ALREADY_SET') throw inProgress();
      const fresh = await prisma.payment.findUniqueOrThrow({ where: { id: session.id } });
      if (fresh.status === SESSION_STATUS.PENDING && fresh.providerOrderId) return this.toCheckoutDto(fresh, orderNumber, provider);
      throw inProgress();
    }
    // NONE proves nothing (listing consistency is not documented); AMBIGUOUS needs a human. Either way: stay UNKNOWN, no replacement.
    await markSessionUnknown(session.id, lookup.kind === 'NONE' ? 'AWAITING_PROVIDER_LOOKUP' : 'AMBIGUOUS_PROVIDER_LOOKUP');
    if (lookup.kind === 'AMBIGUOUS') await prisma.payment.update({ where: { id: session.id }, data: { reviewFlag: 'AMBIGUOUS_PROVIDER_LOOKUP' } });
    throw inProgress();
  }

  // ================================================================================================ expired / stale PENDING sessions
  private static async renewOrReplace(session: Payment, orderNumber: string, provider: PaymentProvider, context?: AuditContext): Promise<CheckoutSessionDto> {
    const providerOrderId = session.providerOrderId as string;
    let providerOrder: ProviderOrder | null;
    let payments: ProviderPaymentInfo[];
    try {
      providerOrder = await provider.fetchOrder(providerOrderId);
      payments = providerOrder ? await provider.listOrderPayments(providerOrderId) : [];
    } catch (err) {
      if (err instanceof ProviderUnknownError) throw unavailable(); // uncertain: never replace on uncertainty
      throw err;
    }

    // Any captured payment is trusted evidence: ledger + settle it first (idempotent), then refuse to open a new session.
    let paidNow = false;
    let authorized = false;
    for (const p of payments) {
      if (p.providerOrderId !== providerOrderId) continue;
      const res = await PaymentSettlementService.settle({ paymentId: session.id, payment: p, provider: provider.name, via: 'RECONCILIATION', context });
      if (res.orderPaymentStatus === 'PAID') paidNow = true;
      if (p.status === 'AUTHORIZED') authorized = true;
    }
    if (paidNow) throw new AppError('This order has already been paid', 409, 'PAYMENT_ALREADY_COMPLETED');
    if (authorized) throw inProgress();

    const unusable = providerOrder === null || providerOrder.amountMinor !== toMinorUnits(session.amount) || providerOrder.currency !== DEFAULT_CURRENCY;
    if (providerOrder && providerOrder.status === 'paid') throw inProgress(); // provider says paid but no captured payment visible yet: wait

    if (!unusable) {
      // RENEW: same provider order, new application TTL (Razorpay allows several attempts on one order).
      const cfg = getPaymentConfig();
      const renewed = await prisma.$transaction(async (tx) => {
        await lockOrder(tx, session.orderId);
        await lockSession(tx, session.id);
        const cur = await tx.payment.findUniqueOrThrow({ where: { id: session.id } });
        if (cur.status === SESSION_STATUS.SUCCESS || cur.supersededById) throw inProgress();
        return await tx.payment.update({
          where: { id: session.id },
          data: { status: SESSION_STATUS.PENDING, expiresAt: new Date(Date.now() + cfg.sessionTtlMs), providerStatus: providerOrder!.status, lastError: null }
        });
      });
      return this.toCheckoutDto(renewed, orderNumber, provider);
    }

    // REPLACE: only because the old provider order is PROVEN unusable (definitively missing, or amount/currency mismatch).
    const replacement = await prisma.$transaction(async (tx) => {
      await lockOrder(tx, session.orderId);
      await lockSession(tx, session.id);
      const cur = await tx.payment.findUniqueOrThrow({ where: { id: session.id } });
      if (cur.status === SESSION_STATUS.SUCCESS || cur.supersededById) throw inProgress(); // someone else already decided
      const order = await tx.order.findUniqueOrThrow({ where: { id: session.orderId }, select: { netAmount: true } });
      const fresh = await this.insertSession(tx, { orderId: session.orderId, customerProfileId: session.customerProfileId as string, amount: order.netAmount, provider: provider.name });
      await tx.payment.update({ where: { id: session.id }, data: { status: SESSION_STATUS.EXPIRED, supersededById: fresh.id, reviewFlag: 'REPLACED_UNUSABLE_PROVIDER_ORDER' } });
      await AuditService.record(
        { actor: null, action: 'PAYMENT_ATTEMPT_CREATED', entity: 'Payment', entityId: fresh.id, payload: { orderNumber, replaces: session.id, reason: 'PROVIDER_ORDER_UNUSABLE' }, context },
        tx
      );
      return fresh;
    });
    return await this.callProviderAndPersist(replacement, orderNumber, provider, context);
  }

  // ================================================================================================ read
  public static async getOwned(userId: string, orderId: string, attemptId: string) {
    const session = await this.findOwned(userId, orderId, attemptId);
    return {
      attemptId: session.id,
      status: session.status,
      expiresAt: session.expiresAt,
      lastError: session.lastError,
      orderStatus: session.order.status,
      orderPaymentStatus: session.order.paymentStatus
    };
  }

  private static async findOwned(userId: string, orderId: string, attemptId: string) {
    const profile = await prisma.customerProfile.findUnique({ where: { userId }, select: { id: true } });
    const session = profile
      ? await prisma.payment.findFirst({
          where: { id: attemptId, orderId, order: { customerProfileId: profile.id } },
          include: { order: { select: { id: true, orderNumber: true, status: true, paymentStatus: true, netAmount: true } } }
        })
      : null;
    // Another customer's (or a missing) session is indistinguishable from "not found".
    if (!session) throw new AppError('Payment attempt not found', 404, 'PAYMENT_ATTEMPT_NOT_FOUND');
    return session;
  }

  // ================================================================================================ checkout verification
  public static async verifyCheckout(
    userId: string,
    orderId: string,
    attemptId: string,
    body: { providerOrderId: string; providerPaymentId: string; signature: string },
    context?: AuditContext
  ): Promise<VerifyResult> {
    const session = await this.findOwned(userId, orderId, attemptId);
    const provider = getPaymentProvider();
    const reject = async (reason: string): Promise<never> => {
      await AuditService.recordSafe({
        actor: { userId, roles: ['CUSTOMER'] },
        action: 'PAYMENT_VERIFICATION_REJECTED',
        entity: 'Payment',
        entityId: session.id,
        payload: { reason },
        context
      });
      throw new AppError('The payment could not be verified', 400, 'PAYMENT_VERIFICATION_FAILED');
    };

    // The STORED provider order id is authoritative, never the client's.
    if (!session.providerOrderId || session.providerOrderId !== body.providerOrderId) return await reject('PROVIDER_ORDER_MISMATCH');
    if (!provider.verifyCheckoutSignature({ providerOrderId: session.providerOrderId, providerPaymentId: body.providerPaymentId, signature: body.signature })) {
      return await reject('SIGNATURE_INVALID');
    }

    // Idempotent repeat: a decided ledger row for THIS session needs no provider round-trip.
    const known = await prisma.providerPayment.findUnique({ where: { provider_providerPaymentId: { provider: provider.name, providerPaymentId: body.providerPaymentId } } });
    if (known && known.paymentId === session.id && DECIDED_RECON.includes(known.reconciliationStatus)) {
      const order = await prisma.order.findUniqueOrThrow({ where: { id: session.orderId }, select: { status: true, paymentStatus: true } });
      return this.toVerifyResult(known.reconciliationStatus as never as SettleOutcome | string, order.status, order.paymentStatus);
    }

    // A valid signature is NOT enough: the payment must be confirmed as CAPTURED by the provider, server-side.
    let info: ProviderPaymentInfo | null;
    try {
      info = await provider.fetchPayment(body.providerPaymentId);
    } catch (err) {
      if (err instanceof ProviderUnknownError) {
        await prisma.payment.update({ where: { id: session.id }, data: { nextAttemptAt: new Date(), lastError: 'VERIFY_FETCH_UNAVAILABLE' } }).catch(() => undefined);
        return { httpStatus: 202, result: 'PENDING', orderStatus: session.order.status, orderPaymentStatus: session.order.paymentStatus };
      }
      throw err;
    }
    if (!info || info.providerOrderId !== session.providerOrderId) return await reject('PAYMENT_NOT_FOUND_OR_WRONG_ORDER');

    const settled = await PaymentSettlementService.settle({
      paymentId: session.id,
      payment: info,
      provider: provider.name,
      via: 'CHECKOUT_VERIFY',
      actor: { userId, roles: ['CUSTOMER'] },
      context
    });
    if (settled.outcome === 'NOT_CAPTURED') {
      if (info.status === 'FAILED') return await reject('PROVIDER_REPORTS_FAILED');
      return { httpStatus: 202, result: 'PENDING', orderStatus: settled.orderStatus, orderPaymentStatus: settled.orderPaymentStatus };
    }
    return this.toVerifyResult(settled.outcome, settled.orderStatus, settled.orderPaymentStatus);
  }

  private static toVerifyResult(outcome: string, orderStatus: string, orderPaymentStatus: string): VerifyResult {
    switch (outcome) {
      case 'APPLIED':
      case 'ALREADY_APPLIED':
      case 'DUPLICATE':
      case 'REVIEWED':
        return { httpStatus: 200, result: 'PAID', orderStatus, orderPaymentStatus };
      case 'AMOUNT_MISMATCH':
        throw new AppError('The payment amount does not match the order', 422, 'PAYMENT_AMOUNT_MISMATCH');
      case 'CURRENCY_MISMATCH':
        throw new AppError('The payment currency does not match the order', 422, 'PAYMENT_CURRENCY_MISMATCH');
      case 'AFTER_CANCELLATION':
        throw new AppError('This order is no longer payable', 409, 'ORDER_NOT_PAYABLE');
      default:
        return { httpStatus: 202, result: 'PENDING', orderStatus, orderPaymentStatus };
    }
  }
}

