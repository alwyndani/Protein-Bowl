/**
 * OPERATIONAL payment recovery (CLI only - there is deliberately no HTTP endpoint for any of this).
 *
 *   npm run payments:recovery -- adopt   --session <paymentSessionId> --provider-order <providerOrderId> --operator <name> --reason "<why>"
 *   npm run payments:recovery -- abandon --session <paymentSessionId> --operator <name> --reason "<why>"
 *   npm run payments:recovery -- replay  --event <webhookEventRowId>  --operator <name> --reason "<why>"
 *
 * Every action re-verifies provider state where it matters, requires an operator and a reason, and writes an AuditLog row.
 * None of them can mark an order PAID: only trusted CAPTURED provider evidence processed by the settlement service can.
 */
import { prisma } from '../src/config/database.js';
import { PaymentManualRecoveryService } from '../src/modules/payment/paymentManualRecovery.service.js';

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const command = process.argv[2];
  const op = { operator: arg('operator') ?? '', reason: arg('reason') ?? '' };
  if (command === 'adopt') {
    const result = await PaymentManualRecoveryService.adoptProviderOrder(arg('session') ?? '', arg('provider-order') ?? '', op);
    console.log(JSON.stringify({ ok: true, command, result }));
  } else if (command === 'abandon') {
    const result = await PaymentManualRecoveryService.abandonSession(arg('session') ?? '', op);
    console.log(JSON.stringify({ ok: true, command, result }));
  } else if (command === 'replay') {
    const result = await PaymentManualRecoveryService.replayEvent(arg('event') ?? '', op);
    console.log(JSON.stringify({ ok: true, command, result }));
  } else {
    console.error('Usage: payments:recovery -- <adopt|abandon|replay> ...  (see the header of scripts/paymentsRecovery.ts)');
    return 1;
  }
  return 0;
}

main()
  .then(async (code) => {
    await prisma.$disconnect();
    process.exit(code);
  })
  .catch(async (err) => {
    console.error(JSON.stringify({ ok: false, error: (err as { errorCode?: string }).errorCode ?? 'ERROR', message: (err as Error).message }));
    await prisma.$disconnect().catch(() => undefined);
    process.exit(1);
  });
