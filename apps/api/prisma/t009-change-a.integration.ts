/**
 * Disposable PostgreSQL 17 ONLY: complete migration, case audit and concurrency.
 * Refuses any URL except the named localhost fixture on port 55448.
 * Never sends a command to a real printer or Edge host.
 */
import assert from 'node:assert/strict';
import { PrismaClient, PrintIncidentState, PrintJobStatus, PrintJobType } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrintIncidentResolutionService } from '../src/modules/hardware/print-incident-resolution.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';

const url = new URL(process.env.DATABASE_URL ?? 'http://invalid/');
if (process.env.GOSPOTS_T009_CHANGE_A_DISPOSABLE !== 'YES'
  || url.hostname !== '127.0.0.1' || url.port !== '55448'
  || url.pathname !== '/gospots_t009_change_a_review' || url.protocol !== 'postgresql:') {
  throw new Error('REFUSED: only disposable localhost PG17 gospots_t009_change_a_review is allowed');
}

const prisma = new PrismaClient();
const service = new PrintIncidentResolutionService(prisma as never);
const shopA = 't009-change-a-shop-A';
const shopB = 't009-change-a-shop-B';
let ownerUserId = '';
let managerUserId = '';
const admin = (shopId = shopA) => ({
  shopId, shopRole: 'OWNER', sub: ownerUserId, perms: '*',
}) as unknown as JwtAccessPayload;
const staff = (shopId = shopA, perms = '') => ({
  shopId, shopRole: 'MANAGER', sub: managerUserId, perms,
}) as unknown as JwtAccessPayload;
const PERMS = 'hardware.print_incident.read,hardware.print_incident.investigate,hardware.print_incident.resolve';

let count = 0;
function check(value: unknown, name: string) {
  assert.ok(value, name);
  count++;
}
async function createJob(shopId: string, code = 'EDGE_PRINT_OUTCOME_UNKNOWN') {
  return prisma.printJob.create({
    data: {
      shopId, type: PrintJobType.KITCHEN, printerDeviceId: `${shopId}-printer`,
      sourceType: 'IntegrationTest', sourceId: randomUUID(), payload: { text: 'synthetic' },
      dedupeKey: randomUUID(), status: PrintJobStatus.PRINTING,
      claimedByEdgeDeviceId: `${shopId}-edge`, claimedAt: new Date(),
      lastErrorCode: code,
    },
  });
}
async function expectedReject(action: () => Promise<unknown>, name: string) {
  let rejected = false;
  try { await action(); } catch { rejected = true; }
  check(rejected, name);
}
function mutation(version: number, reason: string) {
  return { expectedVersion: version, idempotencyKey: randomUUID(), reason };
}

async function main() {
  const [{ version }] = await prisma.$queryRawUnsafe<Array<{ version: string }>>(
    'SELECT current_setting(\'server_version\') AS version',
  );
  check(version.startsWith('17.'), 'postgresql 17 only');
  // All test IDs belong to this brand-new disposable database.
  const user = await prisma.user.create({
    data: { email: `t009-${randomUUID()}@example.invalid`, name: 'Synthetic Test Owner', passwordHash: 'fixture-not-a-real-password' },
  });
  ownerUserId = user.id;
  const manager = await prisma.user.create({
    data: { email: `t009-manager-${randomUUID()}@example.invalid`, name: 'Synthetic Test Manager', passwordHash: 'fixture-not-a-real-password' },
  });
  managerUserId = manager.id;
  for (const [id, slug] of [[shopA, 'shop-a'], [shopB, 'shop-b']] as const) {
    await prisma.shop.upsert({
      where: { id }, update: { ownerId: user.id }, create: { id, slug: `t009-change-a-${slug}`, name: 'T009 disposable test shop',
        dashboardKey: randomUUID(), ownerId: user.id },
    });
    await prisma.device.upsert({
      where: { id: `${id}-printer` }, update: {}, create: {
        id: `${id}-printer`, shopId: id, label: 'Synthetic printer', type: 'PRINTER',
      },
    });
    await prisma.device.upsert({
      where: { id: `${id}-edge` }, update: {}, create: {
        id: `${id}-edge`, shopId: id, label: 'Synthetic Edge', type: 'EDGE_HUB',
      },
    });
  }
  const membership = await prisma.membership.create({
    data: { userId: managerUserId, shopId: shopA, role: 'MANAGER', isActive: true },
  });
  const job = await createJob(shopA);
  await createJob(shopB);
  const investigator = staff(shopA, PERMS);
  await expectedReject(() => service.read(staff(shopA, ''), job.id), 'ungranted manager cannot read');
  await expectedReject(() => service.investigate(staff(shopA, 'hardware.print_incident.read'), job.id, mutation(1, 'Valid reason for test')), 'investigate requires second grant');
  await expectedReject(() => service.investigate(staff(shopB, PERMS), job.id, mutation(1, 'Cross venue forbidden')), 'foreign venue cannot investigate');
  await prisma.membership.update({ where: { id: membership.id }, data: { isActive: false } });
  await expectedReject(() => service.investigate(staff(shopA, PERMS), job.id, mutation(1, 'Inactive membership cannot act')), 'inactive membership cannot investigate');
  await prisma.membership.update({ where: { id: membership.id }, data: { isActive: true } });
  const otherShopOwnerAttempt = service.investigate(admin(shopB), job.id, mutation(1, 'Wrong venue owner denied'));
  await expectedReject(() => otherShopOwnerAttempt, 'foreign venue owner cannot act on job');
  const initial = await service.read(investigator, job.id);
  check(initial.incident === null, 'unopened legacy job does not implicitly write a case');
  const legacyManager = await service.read(staff(shopA, 'shop.manage'), job.id);
  check(legacyManager.originalJob.id === job.id, 'legacy owner-granted shop.manage manager can inspect case');
  await expectedReject(() => service.read({
    ...staff(shopA, 'shop.manage'), shopRole: 'STAFF',
  } as JwtAccessPayload, job.id), 'staff cannot use shop.manage to inspect incident');
  const crossVenueJob = await prisma.printJob.findFirstOrThrow({ where: { shopId: shopB } });
  await expectedReject(() => service.read(investigator, crossVenueJob.id),
    'manager with read permission cannot inspect another tenant case');
  const begin = mutation(1, 'Investigating the physical ticket output');
  const started = await service.investigate(investigator, job.id, begin);
  check(started.version === 2, 'investigation version increments');
  check(started.openedById === managerUserId, 'original investigator provenance persisted');
  const repeat = await service.investigate(investigator, job.id, begin);
  check(repeat.id === started.id, 'identical idempotency key replays');
  await expectedReject(() => service.investigate(investigator, job.id,
    { ...begin, expectedVersion: 2 }), 'same idempotency key with changed expected version is rejected');
  await expectedReject(() => service.investigate(admin(), job.id,
    { ...begin }), 'idempotency key cannot replay under a different actor');
  await expectedReject(() => service.investigate(admin(), job.id, mutation(2, 'Second investigator cannot overwrite opener')), 'no silent investigator reassignment');
  const afterRepeat = await service.read(investigator, job.id);
  check(afterRepeat.incident?.openedById === managerUserId, 'openedById stays original after second investigator');
  const otherOriginal = await createJob(shopA);
  await expectedReject(() => prisma.printIncidentEvent.create({
    data: {
      shopId: shopA, caseId: started.id, originalPrintJobId: otherOriginal.id,
      kind: 'INTEGRITY_NEGATIVE', reason: 'Deliberate mismatched original job identity',
    },
  }), 'PostgreSQL 17 rejects different original job with same tenant');
  const foreignOriginal = await prisma.printJob.findFirstOrThrow({ where: { shopId: shopB } });
  await expectedReject(() => prisma.printIncidentEvent.create({
    data: {
      shopId: shopA, caseId: started.id, originalPrintJobId: foreignOriginal.id,
      kind: 'INTEGRITY_NEGATIVE', reason: 'Deliberate cross-venue original job identity',
    },
  }), 'PostgreSQL 17 rejects cross-tenant event original job');
  await expectedReject(() => service.investigate(investigator, job.id,
    { ...begin, reason: 'Changed reason cannot reuse existing key' }), 'changed payload idempotency conflict');
  const evidence = {
    ...mutation(2, 'Visually checked output and Edge print log'),
    method: 'VISUAL_INSPECTION', reference: 'synthetic-runbook-page-001',
    observedAt: new Date().toISOString(),
  };
  const evid = await service.addEvidence(investigator, job.id, evidence);
  check(evid.version === 3, 'physical evidence committed');
  await expectedReject(() => service.decide(staff(shopA, 'hardware.print_incident.read,hardware.print_incident.investigate'),
    job.id, { ...mutation(3, 'Print not found in physical tray'), physicalOutcome: 'CONFIRMED_NOT_PRINTED' as const }), 'resolve requires explicit resolve permission');

  const result = await service.decide(investigator, job.id, {
    ...mutation(3, 'Verified duplicate-safe physical non-output'),
    physicalOutcome: 'CONFIRMED_NOT_PRINTED' as const,
  });
  check(result.state === PrintIncidentState.RESOLVED, 'confirmed outcome closes case');
  check(result.physicalOutcome === 'CONFIRMED_NOT_PRINTED', 'classification persists');
  const orig = await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } });
  check(orig.status === PrintJobStatus.PRINTING, 'original status not reset');
  check(orig.claimedByEdgeDeviceId === `${shopA}-edge`, 'original Edge ownership never released');
  const history = await service.read(investigator, job.id);
  check(history.incident?.events.length === 4, 'detect/start/evidence/decision all durable');
  check(history.incident?.events.some(e => e.kind === 'DECISION_RECORDED'
    && e.actorUserId === investigator.sub && e.actorMembershipId === membership.id
    && e.reason.length > 8), 'actor, authoritative membership, reason retained');
  check(history.incident?.events.filter(e => e.actorUserId === managerUserId)
    .every(e => e.actorMembershipId === membership.id), 'all manager decisions use authentic membership identity');
  await expectedReject(() => service.decide(investigator, job.id, {
    ...mutation(4, 'Repeated resolution should fail'),
    physicalOutcome: 'CONFIRMED_PRINTED' as const,
  }), 'duplicate resolution rejected');

  await expectedReject(() => prisma.$executeRawUnsafe(
    'UPDATE "PrintIncidentEvent" SET "reason"=\'tampered\' WHERE "caseId"=$1',
    result.id,
  ), 'DB prohibits direct evidence UPDATE');
  await expectedReject(() => prisma.$executeRawUnsafe(
    'DELETE FROM "PrintIncidentEvent" WHERE "caseId"=$1',
    result.id,
  ), 'DB prohibits direct evidence DELETE');
  await expectedReject(() => prisma.$executeRawUnsafe(
    'UPDATE "PrintIncidentCase" SET "shopId"=$1 WHERE "id"=$2',
    shopB, result.id,
  ), 'DB prohibits tenant reassignment');

  // Original Edge can still acknowledge its already-emitted physical output.
  await prisma.$transaction(async tx => {
    await tx.printJob.updateMany({
      where: { id: job.id, shopId: shopA, claimedByEdgeDeviceId: `${shopA}-edge` },
      data: { status: PrintJobStatus.SUCCEEDED, printedAt: new Date(), lastErrorCode: null },
    });
    await PrintIncidentResolutionService.recordTransition(tx, job, 'LATE_EDGE_SUCCESS',
      'Signed original Edge reported physical completion');
  });
  const conflicting = await service.read(investigator, job.id);
  check(conflicting.incident?.state === PrintIncidentState.CONFLICT,
    'late Edge success contradicting not-printed result escalates');
  check(conflicting.incident?.events.some(e => e.kind === 'LATE_EDGE_SUCCESS'), 'late acknowledgement appended');
  check(conflicting.incident?.events.some(e => e.kind === 'DECISION_RECORDED'), 'previous decision preserved');
  check((await prisma.printJob.findUniqueOrThrow({ where: { id: job.id } })).status === 'SUCCEEDED',
    'original signed success remains authoritative');
  // Another case: concurrent decisions only one durable mutation may win.
  const jobRace = await createJob(shopA);
  await service.investigate(admin(), jobRace.id, mutation(1, 'Begin competing investigator case'));
  await service.addEvidence(admin(), jobRace.id, {
    ...mutation(2, 'Observed simulator tray and inspected spool'),
    method: 'PRINTER_STATUS', reference: 'simulator-tray-009', observedAt: new Date().toISOString(),
  });
  const ownerInvestigation = await service.read(admin(), jobRace.id);
  check(ownerInvestigation.incident?.events.some(e => e.kind === 'INVESTIGATION_STARTED'
    && e.actorUserId === ownerUserId && e.actorMembershipId === null),
    'owner without Membership records authenticated user and null membership');
  const decisions = await Promise.allSettled([
    service.decide(admin(), jobRace.id, {
      ...mutation(3, 'Simulator verified as physically printed'),
      physicalOutcome: 'CONFIRMED_PRINTED',
    }),
    service.decide(admin(), jobRace.id, {
      ...mutation(3, 'Concurrent contradictory physical decision'),
      physicalOutcome: 'CONFIRMED_NOT_PRINTED',
    }),
  ]);
  check(decisions.filter(d => d.status === 'fulfilled').length === 1, 'exactly one concurrent decision commits');
  const uniqueHistory = await service.read(admin(), jobRace.id);
  check(uniqueHistory.incident?.events.filter(e => e.kind === 'DECISION_RECORDED').length === 1,
    'one durable decision event after concurrent requests');
  // Restart simulation: new PrismaClient and service sees durable history.
  const reopenedClient = new PrismaClient();
  try {
    const reopened = new PrintIncidentResolutionService(reopenedClient as never);
    const saved = await reopened.read(admin(), jobRace.id);
    check(saved.incident?.events.length === 4, 'case and events survive backend client restart');
  } finally { await reopenedClient.$disconnect(); }
  const allOriginalJobs = await prisma.printJob.findMany({
    where: { shopId: shopA }, select: { id: true, status: true, claimedAt: true },
  });
  check(allOriginalJobs.every(j => j.status !== PrintJobStatus.QUEUED), 'no incident operation requeued any original');
  console.log(`T009_CHANGE_A_PG17_ASSERTIONS ${count} PASS`);
}
main().catch(err => { console.error(err); process.exitCode = 1; })
  .finally(async () => { await prisma.$disconnect(); console.log('T009_CHANGE_A_PG17_DISCONNECT_COMPLETE'); });
