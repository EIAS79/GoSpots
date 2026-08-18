import { PrismaService } from '../src/prisma/prisma.service';

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const prefix = 'phase10_upgrade_fixture';
  try {
    const owner = await prisma.user.upsert({
      where: { email: `${prefix}.owner@gospots.invalid` },
      create: {
        id: `${prefix}_owner`,
        email: `${prefix}.owner@gospots.invalid`,
        name: 'Phase 10 Upgrade Owner',
        passwordHash: 'x',
      },
      update: {},
    });
    const staff = await prisma.user.upsert({
      where: { email: `${prefix}.staff@gospots.invalid` },
      create: {
        id: `${prefix}_staff`,
        email: `${prefix}.staff@gospots.invalid`,
        name: 'Phase 10 Upgrade Staff',
        passwordHash: 'x',
      },
      update: {},
    });
    const shop = await prisma.shop.upsert({
      where: { slug: prefix },
      create: {
        id: `${prefix}_shop`,
        name: 'Phase 10 Upgrade Shop',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId: owner.id,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
      update: {},
    });
    const membership = await prisma.membership.upsert({
      where: { userId_shopId: { userId: staff.id, shopId: shop.id } },
      create: { shopId: shop.id, userId: staff.id, role: 'STAFF', isActive: true },
      update: {},
    });
    const role = await prisma.jobRole.upsert({
      where: { shopId_name: { shopId: shop.id, name: 'Legacy Counter' } },
      create: { shopId: shop.id, name: 'Legacy Counter', code: 'LEGACY_COUNTER' },
      update: {},
    });
    const rate = await prisma.employeeRate.create({
      data: {
        shopId: shop.id,
        membershipId: membership.id,
        jobRoleId: role.id,
        hourlyRateMinor: 4200,
        currency: 'PLN',
        effectiveFrom: new Date('2026-01-01T00:00:00.000Z'),
        createdById: owner.id,
      },
    });
    const schedule = await prisma.scheduleEntry.create({
      data: {
        shopId: shop.id,
        membershipId: membership.id,
        jobRoleId: role.id,
        startsAt: new Date('2026-08-18T08:00:00.000Z'),
        endsAt: new Date('2026-08-18T16:00:00.000Z'),
        note: 'Representative pre-Phase-10 schedule',
        createdById: owner.id,
      },
    });
    // Old schema did not enforce shift conflicts. Keep one deliberate overlap in
    // the representative upgrade DB to prove Phase 10 does not make deployment
    // destructive or fail on historical scheduling debt.
    const overlappingLegacySchedule = await prisma.scheduleEntry.create({
      data: {
        shopId: shop.id,
        membershipId: membership.id,
        jobRoleId: role.id,
        startsAt: new Date('2026-08-18T12:00:00.000Z'),
        endsAt: new Date('2026-08-18T18:00:00.000Z'),
        note: 'Representative legacy overlapping schedule',
        createdById: owner.id,
      },
    });
    console.log(
      JSON.stringify({
        shopId: shop.id,
        membershipId: membership.id,
        rateId: rate.id,
        scheduleId: schedule.id,
        overlappingLegacyScheduleId: overlappingLegacySchedule.id,
      }),
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});