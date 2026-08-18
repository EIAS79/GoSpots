import { Injectable, NotFoundException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { effectiveMembershipState } from './phase9.rules';
import { Phase9LoyaltyExpiryService } from './phase9-loyalty-expiry.service';

@Injectable()
export class Phase9CustomerPortalService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly expiry: Phase9LoyaltyExpiryService,
  ) {}

  async snapshot(rawToken: string) {
    const access = await this.requireAccess(rawToken);
    const customer = await this.prisma.customerProfile.findFirst({
      where: { id: access.customerId, shopId: access.shopId },
    });
    if (!customer) throw new NotFoundException('Customer not found.');

    await this.expiry.processDue(access.shopId, customer.id, null);
    await this.prisma.customerPortalAccessToken.update({
      where: { id: access.id },
      data: { lastUsedAt: new Date() },
    });

    const now = new Date();
    const identityOr = [
      ...(customer.email ? [{ guestEmail: customer.email }] : []),
      ...(customer.phone ? [{ guestPhone: customer.phone }] : []),
    ];
    const reservationSelect = {
      id: true,
      resourceId: true,
      guestName: true,
      partySize: true,
      startsAt: true,
      endsAt: true,
      status: true,
      notes: true,
    } as const;
    const [
      membership,
      loyalty,
      packageAccounts,
      storedAccounts,
      visits,
      preferences,
      consentEvents,
      upcomingReservations,
      bookingHistory,
    ] = await Promise.all([
      this.prisma.customerMembership.findFirst({
        where: { shopId: access.shopId, customerId: customer.id },
      }),
      this.prisma.loyaltyLedgerEntry.findMany({
        where: { shopId: access.shopId, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      this.prisma.customerPackageAccount.findMany({
        where: { shopId: access.shopId, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.storedValueAccount.findMany({
        where: { shopId: access.shopId, customerId: customer.id },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.customerVisit.findMany({
        where: { shopId: access.shopId, customerId: customer.id },
        orderBy: { completedAt: 'desc' },
        take: 200,
      }),
      this.prisma.customerPreference.findMany({
        where: { shopId: access.shopId, customerId: customer.id },
        orderBy: { key: 'asc' },
      }),
      this.prisma.customerConsentEvent.findMany({
        where: { shopId: access.shopId, customerId: customer.id },
        orderBy: { occurredAt: 'desc' },
        take: 200,
      }),
      identityOr.length
        ? this.prisma.reservation.findMany({
            where: {
              shopId: access.shopId,
              startsAt: { gte: now },
              status: { in: ['PENDING', 'CONFIRMED', 'CHECKED_IN'] },
              OR: identityOr,
            },
            select: reservationSelect,
            orderBy: { startsAt: 'asc' },
            take: 100,
          })
        : Promise.resolve([]),
      identityOr.length
        ? this.prisma.reservation.findMany({
            where: {
              shopId: access.shopId,
              OR: identityOr,
              AND: [
                {
                  OR: [
                    { endsAt: { lt: now } },
                    {
                      status: {
                        in: ['COMPLETED', 'CANCELLED', 'NO_SHOW'],
                      },
                    },
                  ],
                },
              ],
            },
            select: reservationSelect,
            orderBy: { startsAt: 'desc' },
            take: 100,
          })
        : Promise.resolve([]),
    ]);

    const guestCheckIds = visits
      .map((row) => row.guestCheckId)
      .filter((id): id is string => Boolean(id));
    const documents = guestCheckIds.length
      ? await this.prisma.complianceDocument.findMany({
          where: {
            shopId: access.shopId,
            sourceId: { in: guestCheckIds },
            kind: { in: ['RECEIPT', 'INVOICE', 'CORRECTION', 'REFUND'] },
          },
          select: {
            id: true,
            kind: true,
            state: true,
            sourceId: true,
            documentNumber: true,
            issueDate: true,
            currency: true,
            grossAmount: true,
            ksefNumber: true,
          },
          orderBy: { issueDate: 'desc' },
          take: 200,
        })
      : [];

    const packages = await Promise.all(
      packageAccounts.map(async (account) => {
        const rows = await this.prisma.customerPackageLedgerEntry.findMany({
          where: { shopId: access.shopId, accountId: account.id },
          select: { units: true },
        });
        return {
          account,
          balanceUnits: rows.reduce((sum, row) => sum + row.units, 0),
        };
      }),
    );
    const storedValue = await Promise.all(
      storedAccounts.map(async (account) => {
        const rows = await this.prisma.storedValueLedgerEntry.findMany({
          where: { shopId: access.shopId, accountId: account.id },
          select: { amountMinor: true },
        });
        return {
          account: {
            id: account.id,
            currency: account.currency,
            status: account.status,
          },
          balanceMinor: rows.reduce((sum, row) => sum + row.amountMinor, 0),
        };
      }),
    );

    return {
      customer: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        phone: customer.phone,
        marketingConsent: Boolean(customer.marketingConsentAt),
        consentSource: customer.consentSource,
      },
      upcomingReservations,
      bookingHistory,
      visitHistory: visits,
      membership: membership
        ? {
            ...membership,
            effectiveStatus: effectiveMembershipState(
              membership.status,
              membership.expiresAt,
            ),
          }
        : null,
      loyalty: {
        balance: loyalty.reduce((sum, row) => sum + row.points, 0),
        entries: loyalty,
      },
      packages,
      storedValue,
      documents,
      preferences,
      consentEvents,
    };
  }

  async setMarketingConsent(rawToken: string, granted: boolean) {
    const access = await this.requireAccess(rawToken);
    const occurredAt = new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const customer = await tx.customerProfile.findFirst({
        where: { id: access.customerId, shopId: access.shopId },
      });
      if (!customer) throw new NotFoundException('Customer not found.');
      const updated = await tx.customerProfile.update({
        where: { id: customer.id },
        data: {
          marketingConsentAt: granted ? occurredAt : null,
          consentSource: 'CUSTOMER_PORTAL',
        },
      });
      const event = await tx.customerConsentEvent.create({
        data: {
          shopId: access.shopId,
          customerId: customer.id,
          purpose: 'MARKETING',
          state: granted ? 'GRANTED' : 'REVOKED',
          source: 'CUSTOMER_PORTAL',
          occurredAt,
        },
      });
      return { customer: updated, event };
    });
    await this.audit.recordForShop(access.shopId, {
      section: 'customer',
      action: granted
        ? 'customer.portal.consent.grant'
        : 'customer.portal.consent.revoke',
      summary: granted
        ? 'Customer granted marketing consent in portal'
        : 'Customer revoked marketing consent in portal',
      meta: {
        customerId: access.customerId,
        consentEventId: result.event.id,
      },
      actorName: 'Customer portal',
    });
    return {
      marketingConsent: Boolean(result.customer.marketingConsentAt),
      consentSource: result.customer.consentSource,
      occurredAt: result.event.occurredAt,
    };
  }

  async accessContext(rawToken: string) {
    return this.requireAccess(rawToken);
  }

  private async requireAccess(rawToken: string) {
    const tokenHash = createHash('sha256').update(rawToken).digest('hex');
    const access = await this.prisma.customerPortalAccessToken.findUnique({
      where: { tokenHash },
    });
    if (!access || access.revokedAt || access.expiresAt <= new Date()) {
      throw new NotFoundException(
        'Customer portal access is invalid or expired.',
      );
    }
    return access;
  }
}
