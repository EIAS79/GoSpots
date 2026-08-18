import { createHash, randomBytes } from 'node:crypto';
import { AuditService } from '../src/modules/audit/audit.service';
import { Phase9CustomerPortalProfileService } from '../src/modules/growth/phase9-customer-portal-profile.service';
import { Phase9CustomerPortalService } from '../src/modules/growth/phase9-customer-portal.service';
import { Phase9LoyaltyExpiryService } from '../src/modules/growth/phase9-loyalty-expiry.service';
import { PrismaService } from '../src/prisma/prisma.service';

function assert(value: unknown, message: string): asserts value {
  if (!value) throw new Error(`PHASE9_PORTAL_PROFILE: ${message}`);
}

async function main() {
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const shop = await prisma.shop.findFirst({
      where: { name: 'Phase 9 Pilot' },
      orderBy: { createdAt: 'desc' },
      select: { id: true },
    });
    assert(shop, 'pilot shop not found');
    const customer = await prisma.customerProfile.findFirst({
      where: { shopId: shop.id, name: 'Canonical Member' },
      orderBy: { createdAt: 'desc' },
    });
    assert(customer?.email, 'pilot customer with email not found');

    const oldEmail = customer.email;
    const reservation = await prisma.reservation.create({
      data: {
        shopId: shop.id,
        guestName: customer.name ?? 'Canonical Member',
        guestEmail: oldEmail,
        partySize: 2,
        startsAt: new Date(Date.now() - 2 * 60 * 60 * 1000),
        endsAt: new Date(Date.now() - 60 * 60 * 1000),
        status: 'COMPLETED',
        notes: 'Phase 9 historical-booking continuity proof',
      },
    });

    const rawToken = randomBytes(32).toString('base64url');
    await prisma.customerPortalAccessToken.create({
      data: {
        shopId: shop.id,
        customerId: customer.id,
        tokenHash: createHash('sha256').update(rawToken).digest('hex'),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    const audit = new AuditService(prisma);
    const portal = new Phase9CustomerPortalService(
      prisma,
      audit,
      new Phase9LoyaltyExpiryService(prisma),
    );
    const profile = new Phase9CustomerPortalProfileService(
      prisma,
      audit,
      portal,
    );

    const before = await portal.snapshot(rawToken);
    assert(
      before.bookingHistory.some((row) => row.id === reservation.id),
      'historical booking is not visible before profile edit',
    );

    const newEmail = `phase9.updated.${Date.now()}@gospots.invalid`;
    const updated = await profile.update(rawToken, {
      name: 'Canonical Member Updated',
      email: newEmail.toUpperCase(),
      phone: '+48 500 600 700',
    });
    assert(updated.email === newEmail, 'portal profile email was not normalized');
    assert(updated.phone === '+48500600700', 'portal profile phone was not normalized');

    const oldAlias = await prisma.customerIdentity.findUnique({
      where: {
        shopId_kind_normalizedValue: {
          shopId: shop.id,
          kind: 'EMAIL',
          normalizedValue: oldEmail,
        },
      },
    });
    assert(
      oldAlias?.customerId === customer.id,
      'historical identity alias was lost after profile update',
    );

    const after = await portal.snapshot(rawToken);
    assert(
      after.bookingHistory.some((row) => row.id === reservation.id),
      'historical booking disappeared after contact detail update',
    );
    assert(after.customer.email === newEmail, 'portal did not project the updated profile');

    const conflictingEmail = `phase9.conflict.${Date.now()}@gospots.invalid`;
    const conflictingCustomer = await prisma.customerProfile.create({
      data: {
        shopId: shop.id,
        name: 'Conflicting Customer',
        email: conflictingEmail,
      },
    });
    await prisma.customerIdentity.create({
      data: {
        shopId: shop.id,
        customerId: conflictingCustomer.id,
        kind: 'EMAIL',
        normalizedValue: conflictingEmail,
      },
    });
    let conflictBlocked = false;
    try {
      await profile.update(rawToken, { email: conflictingEmail });
    } catch (error) {
      conflictBlocked = String(error).includes('already linked to another customer');
    }
    assert(conflictBlocked, 'portal allowed a customer to claim another customer identity');

    console.log(
      `PHASE9_PORTAL_PROFILE=PASS customer=${customer.id} reservation=${reservation.id} oldAliasPreserved=true conflictBlocked=true`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
