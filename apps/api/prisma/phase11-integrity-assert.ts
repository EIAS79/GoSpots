import { PrismaService } from '../src/prisma/prisma.service';

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function expectReject(run: () => Promise<unknown>, message: string) {
  let rejected = false;
  try {
    await run();
  } catch {
    rejected = true;
  }
  invariant(rejected, message);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const prefix = `phase11_integrity_${Date.now()}`;
  try {
    const owner = await prisma.user.create({
      data: {
        email: `${prefix}.owner@gospots.invalid`,
        name: 'Phase 11 Integrity Owner',
        passwordHash: 'x',
      },
    });
    const [shopA, shopB] = await Promise.all([
      prisma.shop.create({
        data: {
          name: 'Phase 11 Shop A',
          slug: `${prefix}-a`,
          dashboardKey: `${prefix}-a-key`,
          ownerId: owner.id,
          currency: 'PLN',
          timezone: 'Europe/Warsaw',
        },
      }),
      prisma.shop.create({
        data: {
          name: 'Phase 11 Shop B',
          slug: `${prefix}-b`,
          dashboardKey: `${prefix}-b-key`,
          ownerId: owner.id,
          currency: 'PLN',
          timezone: 'Europe/Warsaw',
        },
      }),
    ]);
    const [zoneA, zoneB] = await Promise.all([
      prisma.accessZone.create({ data: { shopId: shopA.id, code: 'MAIN', name: 'Main gate', capacity: 2 } }),
      prisma.accessZone.create({ data: { shopId: shopB.id, code: 'MAIN', name: 'Other main gate', capacity: 2 } }),
    ]);

    // Same-tenant FK must reject a Shop A rule pointing at a Shop B zone.
    await expectReject(
      () => prisma.accessRule.create({ data: { shopId: shopA.id, zoneId: zoneB.id, name: 'Cross tenant rule' } }),
      'Cross-tenant access-zone reference was accepted.',
    );

    const [customerA1, customerA2] = await Promise.all([
      prisma.customerProfile.create({ data: { shopId: shopA.id, name: 'Guest One' } }),
      prisma.customerProfile.create({ data: { shopId: shopA.id, name: 'Guest Two' } }),
    ]);
    const [cred1, cred2] = await Promise.all([
      prisma.accessCredential.create({ data: { shopId: shopA.id, type: 'RFID', tokenHash: `${prefix}-cred-1`, customerId: customerA1.id } }),
      prisma.accessCredential.create({ data: { shopId: shopA.id, type: 'RFID', tokenHash: `${prefix}-cred-2`, customerId: customerA2.id } }),
    ]);

    await prisma.accessEvent.create({
      data: {
        shopId: shopA.id,
        zoneId: zoneA.id,
        credentialId: cred1.id,
        direction: 'ENTER',
        decision: 'ALLOWED',
        occupancyDelta: 1,
        idempotencyKey: `${prefix}:enter-1`,
        deviceId: `${prefix}-scanner`,
        deviceSequence: 1,
      },
    });
    await prisma.accessEvent.create({
      data: {
        shopId: shopA.id,
        zoneId: zoneA.id,
        credentialId: cred2.id,
        direction: 'ENTER',
        decision: 'ALLOWED',
        occupancyDelta: 1,
        idempotencyKey: `${prefix}:enter-2`,
        deviceId: `${prefix}-scanner`,
        deviceSequence: 2,
      },
    });
    const occupancy = await prisma.accessEvent.aggregate({
      where: { shopId: shopA.id, zoneId: zoneA.id, decision: 'ALLOWED' },
      _sum: { occupancyDelta: true },
    });
    invariant(occupancy._sum.occupancyDelta === 2, 'Occupancy is not derived from access-event deltas.');

    await expectReject(
      () => prisma.accessEvent.create({
        data: {
          shopId: shopA.id,
          zoneId: zoneA.id,
          credentialId: cred1.id,
          direction: 'ENTER',
          decision: 'DUPLICATE',
          occupancyDelta: 0,
          idempotencyKey: `${prefix}:duplicate-sequence`,
          deviceId: `${prefix}-scanner`,
          deviceSequence: 2,
        },
      }),
      'Duplicate scanner device sequence was accepted.',
    );

    await expectReject(
      () => prisma.accessEvent.create({
        data: {
          shopId: shopA.id,
          zoneId: zoneA.id,
          credentialId: cred1.id,
          direction: 'ENTER',
          decision: 'ALLOWED',
          occupancyDelta: 1,
          idempotencyKey: `${prefix}:enter-1`,
        },
      }),
      'Duplicate access-event idempotency key was accepted.',
    );

    const locker = await prisma.locker.create({ data: { shopId: shopA.id, code: 'L-01' } });
    const assignment = await prisma.lockerAssignment.create({
      data: { shopId: shopA.id, lockerId: locker.id, credentialId: cred1.id },
    });
    await expectReject(
      () => prisma.lockerAssignment.create({
        data: { shopId: shopA.id, lockerId: locker.id, credentialId: cred2.id },
      }),
      'Two active locker assignments were accepted for one locker.',
    );
    await prisma.lockerAssignment.update({
      where: { id: assignment.id },
      data: { status: 'RELEASED', releasedAt: new Date(), version: { increment: 1 } },
    });
    const replacement = await prisma.lockerAssignment.create({
      data: { shopId: shopA.id, lockerId: locker.id, credentialId: cred2.id },
    });
    invariant(replacement.id, 'Released locker could not be reassigned.');

    console.log(JSON.stringify({ ok: true, shopA: shopA.id, shopB: shopB.id, occupancy: 2, replacementAssignment: replacement.id }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
