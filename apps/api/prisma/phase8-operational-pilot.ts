import { ConfigService } from '@nestjs/config';
import { ResourceStatus, ResourceType } from '@prisma/client';
import { zonedWallTimeToUtc } from '../src/common/venue-timezone.util';
import { AuditService } from '../src/modules/audit/audit.service';
import type { JwtAccessPayload } from '../src/modules/auth/auth.service';
import { GrowthCapacityService } from '../src/modules/growth/growth-capacity.service';
import { Phase8ReservationService } from '../src/modules/growth/phase8-reservation.service';
import { ReservationGrowthService } from '../src/modules/growth/reservation-growth.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE8_PILOT: ${message}`);
}

function slot(dateKey: string, start: string, end: string) {
  return {
    startsAt: zonedWallTimeToUtc(dateKey, start, 'Europe/Warsaw'),
    endsAt: zonedWallTimeToUtc(dateKey, end, 'Europe/Warsaw'),
  };
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  const audit = new AuditService(prisma);
  const capacity = new GrowthCapacityService(prisma);
  const reservations = new ReservationGrowthService(prisma, audit, capacity);
  const phase8 = new Phase8ReservationService(prisma, new ConfigService(), audit);
  const prefix = `p8pilot_${Date.now()}`;
  const userId = `${prefix}_user`;
  const otherUserId = `${prefix}_other_user`;
  const shopId = `${prefix}_shop`;
  const otherShopId = `${prefix}_other_shop`;
  const actor: JwtAccessPayload = {
    sub: userId,
    shopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: `${prefix}@gospots.invalid`,
  };
  const otherActor: JwtAccessPayload = {
    sub: otherUserId,
    shopId: otherShopId,
    sysRole: 'USER',
    shopRole: 'OWNER',
    email: `${prefix}_other@gospots.invalid`,
  };

  try {
    await prisma.user.create({
      data: { id: userId, email: actor.email!, name: 'Phase 8 Pilot', passwordHash: 'x' },
    });
    await prisma.user.create({
      data: { id: otherUserId, email: otherActor.email!, name: 'Phase 8 Other Tenant', passwordHash: 'x' },
    });
    await prisma.shop.create({
      data: {
        id: shopId,
        name: 'Phase 8 Pilot',
        slug: prefix,
        dashboardKey: `${prefix}_key`,
        ownerId: userId,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });
    await prisma.shop.create({
      data: {
        id: otherShopId,
        name: 'Phase 8 Other Tenant',
        slug: `${prefix}_other`,
        dashboardKey: `${prefix}_other_key`,
        ownerId: otherUserId,
        currency: 'PLN',
        timezone: 'Europe/Warsaw',
      },
    });
    await prisma.openingHour.createMany({
      data: Array.from({ length: 7 }, (_, weekday) => ({
        shopId,
        weekday,
        opensAt: '00:00',
        closesAt: '23:59',
        isClosed: false,
      })),
    });

    const category = await prisma.resourceCategory.create({
      data: {
        shopId,
        type: ResourceType.BILLIARD,
        name: 'Phase 8 tables',
        slotMinutes: 60,
      },
    });
    const resource1 = await prisma.resource.create({
      data: {
        shopId,
        categoryId: category.id,
        name: 'Phase 8 Table 1',
        type: ResourceType.BILLIARD,
        hourlyRate: '30.00',
        status: ResourceStatus.AVAILABLE,
        capacity: 6,
        sortOrder: 1,
      },
    });
    const resource2 = await prisma.resource.create({
      data: {
        shopId,
        categoryId: category.id,
        name: 'Phase 8 Table 2',
        type: ResourceType.BILLIARD,
        hourlyRate: '30.00',
        status: ResourceStatus.AVAILABLE,
        capacity: 6,
        sortOrder: 2,
      },
    });
    await prisma.operationsRatePlan.create({
      data: {
        shopId,
        resourceCategoryId: category.id,
        name: 'Phase 8 billiard rate',
        hourlyRateMinor: 3000,
        active: true,
      },
    });

    const raceSlot = slot('2030-06-17', '10:00', '11:00');
    const booking = {
      startsAt: raceSlot.startsAt.toISOString(),
      endsAt: raceSlot.endsAt.toISOString(),
      partySize: 4,
      resourceId: resource1.id,
      guestName: 'Race Guest',
      guestEmail: 'race@gospots.invalid',
      sourceChannel: 'PHASE8_PILOT',
    };
    const raced = await Promise.allSettled([
      capacity.createStaff(actor, booking),
      capacity.createStaff(actor, booking),
    ]);
    const winners = raced.filter(
      (entry): entry is PromiseFulfilledResult<Awaited<ReturnType<typeof capacity.createStaff>>> =>
        entry.status === 'fulfilled',
    );
    const losers = raced.filter((entry) => entry.status === 'rejected');
    assert(winners.length === 1 && losers.length === 1, 'double-booking race did not admit exactly one winner');
    assert(
      (await prisma.reservation.count({
        where: {
          shopId,
          resourceId: resource1.id,
          startsAt: { lt: raceSlot.endsAt },
          endsAt: { gt: raceSlot.startsAt },
        },
      })) === 1,
      'double-booking race persisted more than one overlapping reservation',
    );

    const reservationId = winners[0].value.reservations[0].reservationId;
    await prisma.reservationDepositLedgerEntry.create({
      data: {
        shopId,
        reservationId,
        type: 'CAPTURE',
        amountMinor: 2500,
        currency: 'PLN',
        correlationId: `${prefix}-capture-arrival`,
        actorUserId: userId,
      },
    });
    const arrival = await phase8.arrive(actor, reservationId);
    const arrivalReplay = await phase8.arrive(actor, reservationId);
    assert(arrival.guestCheckId === arrivalReplay.guestCheckId, 'arrival retry created a second GuestCheck');
    assert(arrival.operationsSessionId === arrivalReplay.operationsSessionId, 'arrival retry created a second operations session');
    assert(arrival.depositApplicationMinor === 2500, 'captured deposit was not applied on arrival');
    assert(
      (await prisma.reservationDepositApplication.count({ where: { shopId, reservationId } })) === 1,
      'arrival retry double-applied the deposit',
    );
    assert(
      (await prisma.commercialAdjustment.count({
        where: {
          shopId,
          guestCheckId: arrival.guestCheckId,
          type: 'DEPOSIT_APPLICATION',
          targetSourceId: reservationId,
        },
      })) === 1,
      'deposit application did not reach canonical commercial adjustment authority',
    );

    let tenantBlocked = false;
    try {
      await phase8.arrive(otherActor, reservationId);
    } catch (error) {
      tenantBlocked = String(error).includes('Reservation not found');
    }
    assert(tenantBlocked, 'cross-tenant reservation arrival was not rejected');

    const noShowSlot = slot('2030-06-17', '12:00', '13:00');
    const noShowCreated = await capacity.createStaff(actor, {
      startsAt: noShowSlot.startsAt.toISOString(),
      endsAt: noShowSlot.endsAt.toISOString(),
      partySize: 2,
      resourceId: resource2.id,
      guestName: 'No Show Guest',
      guestEmail: 'noshow@gospots.invalid',
      sourceChannel: 'PHASE8_PILOT',
    });
    const noShowId = noShowCreated.reservations[0].reservationId;
    const policy = await reservations.createPolicy(actor, {
      name: 'Phase 8 no-show policy',
      depositKind: 'FIXED',
      depositFixedMinor: 1200,
      noShowForfeitPercent: 100,
      lateCancelForfeitPercent: 50,
      cancellationWindowMinutes: 1440,
    });
    await reservations.attachPolicy(actor, noShowId, { policyId: policy.id });
    await prisma.reservationDepositLedgerEntry.create({
      data: {
        shopId,
        reservationId: noShowId,
        type: 'CAPTURE',
        amountMinor: 1200,
        currency: 'PLN',
        correlationId: `${prefix}-capture-noshow`,
        actorUserId: userId,
      },
    });
    const noShow = await reservations.closeReservation(actor, noShowId, {
      outcome: 'NO_SHOW',
      reason: 'Phase 8 pilot no-show',
    });
    assert(noShow.reservation.status === 'NO_SHOW', 'no-show outcome was not persisted');
    assert(noShow.refundDueMinor === 0, '100% no-show forfeiture still left refund due');
    assert(
      (await prisma.reservationDepositLedgerEntry.findFirst({
        where: { shopId, reservationId: noShowId, type: 'FORFEIT' },
      }))?.amountMinor === -1200,
      'no-show policy was not represented as immutable forfeiture money',
    );

    const waitSlot = slot('2030-06-17', '14:00', '15:00');
    const wait = await reservations.createWaitlist(actor, {
      resourceId: resource2.id,
      guestName: 'Waitlist Guest',
      guestEmail: 'wait@gospots.invalid',
      partySize: 3,
      desiredStartsAt: waitSlot.startsAt.toISOString(),
      desiredEndsAt: waitSlot.endsAt.toISOString(),
    });
    const offered = await reservations.offerWaitlist(actor, wait.id, { offerMinutes: 15 });
    assert(offered.status === 'OFFERED', 'waitlist slot was not offered');
    const claimed = await reservations.convertWaitlist(actor, wait.id);
    assert(claimed.resourceId === resource2.id, 'waitlist claim did not create a reservation on the offered resource');
    assert(
      (await prisma.reservationWaitlistEntry.findUnique({ where: { id: wait.id } }))?.status === 'CLAIMED',
      'waitlist claim state was not persisted',
    );

    const holdSlot = slot('2030-06-17', '16:00', '17:00');
    await prisma.eventResourceHold.create({
      data: {
        shopId,
        eventRequestId: `${prefix}-private-event`,
        resourceId: resource2.id,
        startsAt: holdSlot.startsAt,
        endsAt: holdSlot.endsAt,
        status: 'CONFIRMED',
        createdById: userId,
      },
    });
    const heldCapacity = await capacity.capacity(actor, {
      startsAt: holdSlot.startsAt.toISOString(),
      endsAt: holdSlot.endsAt.toISOString(),
      partySize: 2,
      resourceId: resource2.id,
    });
    assert(heldCapacity.available.length === 0, 'private-event hold did not remove resource capacity');
    assert(
      heldCapacity.unavailable.some((row) => row.resourceId === resource2.id),
      'capacity engine did not explain the private-event block',
    );

    const timeline = await reservations.timeline(
      actor,
      zonedWallTimeToUtc('2030-06-17', '00:00', 'Europe/Warsaw'),
      zonedWallTimeToUtc('2030-06-17', '23:59', 'Europe/Warsaw'),
    );
    assert(timeline.reservations.length >= 3, 'staff timeline did not project pilot reservations');
    assert(timeline.waitlist.some((row) => row.id === wait.id), 'staff timeline did not project waitlist history');
    assert(timeline.eventHolds.some((row) => row.resourceId === resource2.id), 'staff timeline did not project event holds');

    console.log(
      `PHASE8_OPERATIONAL_PILOT=PASS reservation=${reservationId} check=${arrival.guestCheckId} session=${arrival.operationsSessionId} waitlist=${wait.id}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
