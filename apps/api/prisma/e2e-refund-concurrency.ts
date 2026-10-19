/**
 * PostgreSQL 17 independent-connection financial concurrency suite.
 * No production provider calls: injected deterministic fake connector only.
 * Requires a disposable localhost E2E database with applied migrations.
 */
import { randomUUID } from 'crypto';
import {
  PaymentOperationState,
  Prisma,
  PrismaClient,
  RefundState,
} from '@prisma/client';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import type { PrismaService } from '../src/prisma/prisma.service';
import type { FeatureFlagService } from '../src/modules/foundation/feature-flag.service';
import type {
  ConnectorRefundRequest,
  ConnectorRefundResult,
} from '../src/modules/device-payment/connectors/payment-connector';
import { FakePaymentConnector } from '../src/modules/device-payment/connectors/fake-payment.connector';
import { PaymentConnectorRegistry } from '../src/modules/device-payment/connectors/payment-connector.registry';
import { PaymentDomainService } from '../src/modules/device-payment/payment-domain.service';
import { PaymentOperationStateService } from '../src/modules/device-payment/payment-operation-state.service';

const database = process.env.DATABASE_URL;
if (
  !database ||
  !['localhost', '127.0.0.1'].includes(new URL(database).hostname) ||
  process.env.GOSPOTS_E2E_DB !== 'true' ||
  process.env.GOSPOTS_DISPOSABLE_E2E_DB !== 'I_UNDERSTAND_DELETE_AND_ROLES'
) {
  throw new Error(
    'Requires explicitly marked disposable localhost E2E PostgreSQL database',
  );
}
const clients = [new PrismaClient(), new PrismaClient()];
const shopId = 'e2e-shop-payment';
const otherShopId = 'e2e-shop-cash';
const actor = (shop: string): JwtAccessPayload =>
  ({
    sub: 'e2e-owner',
    shopId: shop,
    shopRole: 'OWNER',
    perms: '*',
  }) as JwtAccessPayload;
function assert(value: unknown, description: string): asserts value {
  if (!value) throw new Error('PG17 REFUND CONCURRENCY FAILED: ' + description);
}
const fail = async (action: Promise<unknown>, pattern: RegExp) => {
  try {
    await action;
  } catch (e) {
    assert(pattern.test(String(e)), 'unexpected error: ' + String(e));
    return;
  }
  throw new Error(
    'PG17 REFUND CONCURRENCY FAILED: mutation unexpectedly succeeded',
  );
};
let counter = 0;
let fixtureSnapshotId = '';
class DeferredFakeConnector extends FakePaymentConnector {
  mode: 'success' | 'failed' | 'unknown' | 'throw' | 'delay' = 'success';
  calls = 0;
  started: (() => void) | null = null;
  release: (() => void) | null = null;
  async refundPayment(
    request: ConnectorRefundRequest,
  ): Promise<ConnectorRefundResult> {
    this.calls += 1;
    if (this.mode === 'delay') {
      this.started?.();
      await new Promise<void>((resolve) => {
        this.release = resolve;
      });
    }
    if (this.mode === 'throw')
      throw new Error('Simulated provider network loss');
    return {
      providerRefundId: 'fake-refund-e2e-' + request.refundId,
      state:
        this.mode === 'failed'
          ? 'FAILED'
          : this.mode === 'unknown'
            ? 'UNKNOWN'
            : 'SUCCEEDED',
      providerPayload: { testOnly: true },
    };
  }
}
const connector = new DeferredFakeConnector();
const registry = new PaymentConnectorRegistry();
registry.register(connector);
const flags = {
  isFeatureEnabled: () => Promise.resolve(true),
} as unknown as FeatureFlagService;
const services = clients.map(
  (db) =>
    new PaymentDomainService(
      db as unknown as PrismaService,
      flags,
      registry,
      new PaymentOperationStateService(),
    ),
);
const suiteTag = 'W1-concurrent-' + randomUUID();
let assertions = 0;
function check(value: unknown, message: string) {
  assert(value, message);
  assertions += 1;
}
async function operation(amount = '100') {
  return clients[0].paymentOperation.create({
    data: {
      shopId,
      provider: 'fake',
      providerPaymentId: 'fixture-' + randomUUID(),
      idempotencyKey: suiteTag + '-' + ++counter,
      requestHash: 'fixture',
      amount: new Prisma.Decimal(amount),
      currency: 'PLN',
      state: PaymentOperationState.CAPTURED,
    },
  });
}
function refund(
  service: PaymentDomainService,
  id: string,
  value: string,
  key: string,
  shop = shopId,
) {
  return service.createRefund(
    actor(shop),
    id,
    {
      amount: value,
      reason: 'E2E controlled refund',
      allocations: [{ snapshotId: fixtureSnapshotId, amount: value }],
    },
    suiteTag + ':' + key,
  );
}
async function total(id: string) {
  const rows = await clients[0].refund.findMany({
    where: { paymentOperationId: id },
  });
  const reservingStates = new Set<RefundState>([
    RefundState.CREATED,
    RefundState.PROCESSING,
    RefundState.UNKNOWN,
    RefundState.SUCCEEDED,
  ]);
  return {
    rows,
    count: rows.length,
    reserved: rows
      .filter((r) => reservingStates.has(r.state))
      .reduce((sum, r) => sum.add(r.amount), new Prisma.Decimal(0)),
  };
}
async function delayStarted() {
  return new Promise<void>((resolve) => {
    connector.started = resolve;
  });
}

async function main() {
  const shops = await clients[0].shop.findMany({
    where: { id: { in: [shopId, otherShopId] } },
  });
  check(shops.length === 2, 'both source shops must be seeded');
  const seedSnapshot = await clients[0].chargeSnapshot.findFirst({
    where: { shopId },
    select: { id: true },
  });
  check(
    seedSnapshot !== null,
    'checkout E2E must create a real charge snapshot before concurrency suite',
  );
  fixtureSnapshotId = seedSnapshot!.id;
  // Concurrent different-key requests: first provider I/O hangs OUTSIDE locked DB txn.
  const op = await operation();
  connector.mode = 'delay';
  const began = delayStarted();
  const first = refund(services[0], op.id, '60', 'diff-A');
  await began;
  const independentQuery = await clients[1].paymentOperation.findUniqueOrThrow({
    where: { id: op.id },
  });
  check(
    independentQuery.id === op.id,
    'other DB connection must read while external provider is blocked',
  );
  await fail(
    refund(services[1], op.id, '60', 'diff-B'),
    /including pending refunds/i,
  );
  check(
    (await total(op.id)).reserved.eq('60'),
    'pending capacity conserved under concurrency',
  );
  check(
    connector.calls === 1,
    'provider called once before first refund callback is released',
  );
  connector.release?.();
  const result = await first;
  check(
    result.state === RefundState.SUCCEEDED,
    'first refund success is persisted',
  );
  check(
    (await total(op.id)).count === 1,
    'second request must not leave a financial row',
  );

  // Same-key concurrent replay: second request returns existing PROCESSING without calling provider.
  const replayOp = await operation();
  connector.mode = 'delay';
  const started = delayStarted();
  const replayA = refund(services[0], replayOp.id, '100', 'duplicate');
  await started;
  const replayB = await refund(services[1], replayOp.id, '100', 'duplicate');
  check(
    replayB.state === RefundState.PROCESSING,
    'replay observes existing durable in-flight state',
  );
  check(
    connector.calls === 2,
    'same idempotency key never launches another provider action',
  );
  connector.release?.();
  const replayDone = await replayA;
  check(
    replayDone.id === replayB.id,
    'both callers share one durable refund ID',
  );
  check(
    (await total(replayOp.id)).count === 1,
    'single refund row for identical simultaneous key',
  );
  await fail(
    refund(services[1], replayOp.id, '99', 'duplicate'),
    /different refund request/i,
  );
  const completedReplay = await refund(
    services[1],
    replayOp.id,
    '100',
    'duplicate',
  );
  check(
    completedReplay.id === replayDone.id,
    'completed duplicate replay works after fully refunded state',
  );
  check(connector.calls === 2, 'replayed request never calls provider');

  // Two independently confirmed partial refunds must atomically promote
  // the provider operation to REFUNDED (not leave stale PARTIALLY_REFUNDED).
  const twoHalves = await operation();
  connector.mode = 'success';
  const halves = await Promise.all([
    refund(services[0], twoHalves.id, '50', 'half-a'),
    refund(services[1], twoHalves.id, '50', 'half-b'),
  ]);
  check(
    halves.every((row) => row.state === RefundState.SUCCEEDED),
    'both independent partial refunds are confirmed',
  );
  const bothTotal = await total(twoHalves.id);
  check(
    bothTotal.count === 2 && bothTotal.reserved.eq('100'),
    'both partial refunds conserve exactly 100 captured currency',
  );
  const promoted = await clients[0].paymentOperation.findUniqueOrThrow({
    where: { id: twoHalves.id },
  });
  check(
    promoted.state === PaymentOperationState.REFUNDED,
    'two simultaneous successful halves must be recorded REFUNDED, not stale partial',
  );

  // UNKNOWN reserves capacity until explicit provider reconciliation resolves it.
  const unknownOp = await operation();
  connector.mode = 'unknown';
  const unknown = await refund(services[0], unknownOp.id, '75', 'unknown');
  check(
    unknown.state === RefundState.UNKNOWN,
    'provider UNKNOWN state recorded',
  );
  await fail(
    refund(services[1], unknownOp.id, '30', 'blocked'),
    /including pending refunds/i,
  );
  check(
    (await total(unknownOp.id)).reserved.eq('75'),
    'UNKNOWN reserves balance',
  );
  check(
    (await refund(services[1], unknownOp.id, '75', 'unknown')).id ===
      unknown.id,
    'UNKNOWN replay returns same operation',
  );
  // Provider-confirmed failed webhook/reconciliation is represented as a state correction.
  await clients[0].refund.update({
    where: { id: unknown.id },
    data: { state: RefundState.FAILED, failedAt: new Date() },
  });
  connector.mode = 'success';
  const recovered = await refund(services[1], unknownOp.id, '100', 'resolved');
  check(
    recovered.state === RefundState.SUCCEEDED,
    'explicitly failed UNKNOWN frees capacity for retry',
  );

  // Provider failure must not record success or retain capacity.
  const failOp = await operation();
  connector.mode = 'failed';
  const failed = await refund(services[0], failOp.id, '100', 'failed');
  check(
    failed.state === RefundState.FAILED,
    'explicitly declined refund persists FAILED',
  );
  check((await total(failOp.id)).reserved.isZero(), 'FAILED releases capacity');
  connector.mode = 'success';
  const retry = await refund(services[1], failOp.id, '100', 'retry');
  check(
    retry.state === RefundState.SUCCEEDED,
    'separate key succeeds after known failure',
  );
  const throwOp = await operation();
  connector.mode = 'throw';
  const lost = await refund(services[0], throwOp.id, '100', 'network-loss');
  check(
    lost.state === RefundState.UNKNOWN,
    'transport loss becomes UNKNOWN, never success',
  );
  await fail(
    refund(services[1], throwOp.id, '1', 'unsafe-retry'),
    /including pending refunds/i,
  );

  // Direct cross-shop refund must fail with unchanged financial records.
  await fail(
    refund(services[1], op.id, '10', 'foreign', otherShopId),
    /not found/i,
  );
  check(
    (await total(op.id)).count === 1,
    'foreign shop refund cannot mutate original finance',
  );

  // Independent transaction rollback under a forced failure after an insert.
  const rollbackOp = await operation();
  try {
    await clients[1].$transaction(async (tx) => {
      await tx.refund.create({
        data: {
          shopId,
          paymentOperationId: rollbackOp.id,
          idempotencyKey: suiteTag + ':rollback',
          requestHash: 'rollback',
          state: RefundState.PROCESSING,
          amount: new Prisma.Decimal(100),
          currency: 'PLN',
        },
      });
      throw new Error('INTENTIONAL_ROLLBACK');
    });
    throw new Error('ROLLBACK_WAS_NOT_RAISED');
  } catch (err) {
    check(
      String(err).includes('INTENTIONAL_ROLLBACK'),
      'test rollback failure was delivered',
    );
  }
  check(
    (await total(rollbackOp.id)).count === 0,
    'failed transaction has no orphan refund row',
  );
  connector.mode = 'success';
  const afterRollback = await refund(
    services[1],
    rollbackOp.id,
    '100',
    'post-rollback',
  );
  check(
    afterRollback.state === RefundState.SUCCEEDED,
    'post-rollback request succeeds exactly once',
  );

  console.log(
    'W1_REFUND_PG17_CONCURRENCY_PASS assertions=' +
      assertions +
      ' providerCalls=' +
      connector.calls +
      ' independentPrismaConnections=2; amount cap, same key, UNKNOWN, failed/throw, cross tenant, rollback PASS',
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await clients[0].refundAllocation.deleteMany({
      where: {
        shopId,
        refund: {
          paymentOperation: { idempotencyKey: { startsWith: suiteTag } },
        },
      },
    });
    await clients[0].refund.deleteMany({
      where: { paymentOperation: { idempotencyKey: { startsWith: suiteTag } } },
    });
    await clients[0].paymentOperation.deleteMany({
      where: { idempotencyKey: { startsWith: suiteTag } },
    });
    await Promise.all(clients.map((db) => db.$disconnect()));
  });
