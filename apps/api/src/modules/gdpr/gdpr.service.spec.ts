import {
  BadRequestException,
  ForbiddenException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { hashPassword } from '../../common/security/password';
import { GdprService } from './gdpr.service';

describe('GdprService', () => {
  const shopId = 'shop_a';
  const actor = {
    sub: 'owner_1',
    shopId,
    shopRole: 'OWNER',
  } as never;
  const erasePassword = 'OwnerPass12';
  let ownerPasswordHash: string;

  beforeAll(async () => {
    ownerPasswordHash = await hashPassword(erasePassword);
  });

  function makeAudit() {
    return {
      record: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      recordForShop: jest.fn().mockResolvedValue({ id: 'audit_1' }),
    };
  }

  function makePrisma(overrides: Record<string, unknown> = {}) {
    return {
      user: {
        findUnique: jest
          .fn()
          .mockResolvedValue({ passwordHash: ownerPasswordHash }),
        update: jest.fn().mockResolvedValue({ id: 'owner_1' }),
      },
      shop: {
        findFirst: jest.fn().mockResolvedValue({
          id: shopId,
          slug: 'arcade',
          name: 'Arcade',
          displayName: null,
          email: 'venue@example.com',
          phone: '+1000',
          address: '1 Main',
          city: 'City',
          country: 'US',
          ownerId: 'owner_1',
          createdAt: new Date('2026-01-01T00:00:00Z'),
          updatedAt: new Date('2026-01-02T00:00:00Z'),
        }),
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({ id: shopId }),
      },
      reservation: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            guestName: 'Guest',
            guestEmail: 'g@example.com',
            guestPhone: null,
            partySize: 2,
            startsAt: new Date('2026-07-01T12:00:00Z'),
            endsAt: new Date('2026-07-01T13:00:00Z'),
            status: 'CONFIRMED',
            notes: null,
            createdAt: new Date('2026-06-01T00:00:00Z'),
            updatedAt: new Date('2026-06-01T00:00:00Z'),
          },
        ]),
        findFirst: jest.fn().mockResolvedValue({ id: 'r1' }),
        update: jest.fn().mockResolvedValue({ id: 'r1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      eventRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'er1' }),
        update: jest.fn().mockResolvedValue({ id: 'er1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      contactMessage: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'cm1' }),
        update: jest.fn().mockResolvedValue({ id: 'cm1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      guestChat: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'gc1' }),
        update: jest.fn().mockResolvedValue({ id: 'gc1' }),
      },
      guestChatMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      venueReview: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({ id: 'vr1' }),
        update: jest.fn().mockResolvedValue({ id: 'vr1' }),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      consentRecord: { findMany: jest.fn().mockResolvedValue([]) },
      guestDsarRequest: {
        findMany: jest.fn().mockResolvedValue([]),
        findFirst: jest.fn().mockResolvedValue({
          id: 'dsar1',
          type: 'ACCESS',
          status: 'OPEN',
        }),
        update: jest.fn().mockResolvedValue({
          id: 'dsar1',
          type: 'ACCESS',
          status: 'CLOSED',
        }),
        create: jest.fn().mockResolvedValue({
          id: 'dsar1',
          type: 'ACCESS',
          status: 'OPEN',
        }),
      },
      auditLog: {
        findMany: jest.fn().mockResolvedValue([]),
        create: jest.fn().mockResolvedValue({ id: 'audit_1' }),
      },
      authSession: {
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      mfaRecoveryCode: {
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      transaction: { count: jest.fn().mockResolvedValue(3) },
      shopOrder: { count: jest.fn().mockResolvedValue(2) },
      shopLoss: { count: jest.fn().mockResolvedValue(0) },
      playSession: { count: jest.fn().mockResolvedValue(1) },
      membership: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'm1',
            role: 'OWNER',
            isActive: true,
            invitedBy: null,
            acceptedAt: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
            updatedAt: new Date('2026-01-01T00:00:00Z'),
            user: {
              id: 'owner_1',
              email: 'owner@example.com',
              name: 'Owner',
              accountType: 'VENUE_OWNER',
              staffHandle: null,
              emailVerified: true,
              createdAt: new Date('2026-01-01T00:00:00Z'),
              updatedAt: new Date('2026-01-01T00:00:00Z'),
            },
          },
        ]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      $transaction: jest.fn(async (ops: unknown) => ops),
      ...overrides,
    };
  }

  function makeNotifications() {
    return {
      recordOperationsEvent: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makeMail() {
    return {
      send: jest.fn().mockResolvedValue(undefined),
    };
  }

  function makeService(
    prisma: ReturnType<typeof makePrisma>,
    audit = makeAudit(),
  ) {
    return new GdprService(
      prisma as never,
      audit as never,
      makeNotifications() as never,
      makeMail() as never,
    );
  }

  function eraseDto(
    partial: Partial<{
      entityType:
        | 'reservation'
        | 'eventRequest'
        | 'guestChat'
        | 'contactMessage'
        | 'venueReview';
      entityId: string;
      password?: string;
    }> = {},
  ) {
    return {
      entityType: 'reservation' as const,
      entityId: 'r1',
      password: erasePassword,
      ...partial,
    };
  }

  it('rejects non-owner', async () => {
    const service = makeService(makePrisma());
    await expect(
      service.exportShopPersonalData({
        sub: 'staff_1',
        shopId,
        shopRole: 'STAFF',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects missing shopId', async () => {
    const service = makeService(makePrisma());
    await expect(
      service.exportShopPersonalData({
        sub: 'owner_1',
        shopRole: 'OWNER',
      } as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('exports shop-scoped personal data and scopes queries by shopId', async () => {
    const prisma = makePrisma();
    const service = makeService(prisma);

    const pack = await service.exportShopPersonalData(actor);

    expect(prisma.shop.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: shopId } }),
    );
    expect(prisma.membership.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId } }),
    );
    expect(prisma.reservation.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { shopId } }),
    );

    expect(pack.meta.shopId).toBe(shopId);
    expect(pack.meta.requestedByUserId).toBe('owner_1');
    expect(pack.shop?.email).toBe('venue@example.com');
    expect(pack.memberships).toHaveLength(1);
    expect(pack.memberships[0].user.email).toBe('owner@example.com');
    expect(pack.reservations[0].guestEmail).toBe('g@example.com');
    expect(pack.financeSummary.transactionCount).toBe(3);
    expect(pack.meta.limitations.length).toBeGreaterThan(0);
    // No secrets in package shape
    expect(JSON.stringify(pack)).not.toMatch(/passwordHash|guestToken/i);
  });

  describe('eraseGuest', () => {
    it('rejects non-owner', async () => {
      const service = makeService(makePrisma());
      await expect(
        service.eraseGuest(
          { sub: 'staff_1', shopId, shopRole: 'STAFF' } as never,
          eraseDto(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects missing shopId', async () => {
      const service = makeService(makePrisma());
      await expect(
        service.eraseGuest(
          { sub: 'owner_1', shopRole: 'OWNER' } as never,
          eraseDto(),
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });

    it('rejects missing password confirmation', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);

      await expect(
        service.eraseGuest(actor, eraseDto({ password: undefined })),
      ).rejects.toBeInstanceOf(BadRequestException);

      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('rejects wrong password before mutating', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);

      await expect(
        service.eraseGuest(actor, eraseDto({ password: 'WrongPass99' })),
      ).rejects.toBeInstanceOf(UnauthorizedException);

      expect(prisma.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'owner_1' },
        select: { passwordHash: true },
      });
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('accepts password from X-Confirm-Password header', async () => {
      const prisma = makePrisma();
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.eraseGuest(
        actor,
        eraseDto({ password: undefined }),
        erasePassword,
      );

      expect(result.ok).toBe(true);
      expect(prisma.reservation.update).toHaveBeenCalled();
    });

    it('404 when reservation is outside this shop', async () => {
      const prisma = makePrisma({
        reservation: {
          findMany: jest.fn(),
          findFirst: jest.fn().mockResolvedValue(null),
          update: jest.fn(),
        },
      });
      const service = makeService(prisma);

      await expect(
        service.eraseGuest(actor, eraseDto({ entityId: 'other_shop_r' })),
      ).rejects.toBeInstanceOf(NotFoundException);

      expect(prisma.reservation.findFirst).toHaveBeenCalledWith({
        where: { id: 'other_shop_r', shopId },
        select: { id: true },
      });
      expect(prisma.reservation.update).not.toHaveBeenCalled();
    });

    it('redacts reservation PII, keeps shop scope, audits', async () => {
      const prisma = makePrisma();
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.eraseGuest(actor, eraseDto());

      expect(prisma.reservation.findFirst).toHaveBeenCalledWith({
        where: { id: 'r1', shopId },
        select: { id: true },
      });
      expect(prisma.reservation.update).toHaveBeenCalledWith({
        where: { id: 'r1' },
        data: expect.objectContaining({
          guestName: '[redacted]',
          guestEmail: null,
          guestPhone: null,
          notes: null,
          guestToken: null,
          guestTokenHash: null,
        }),
      });
      expect(audit.record).toHaveBeenCalledWith(
        actor,
        expect.objectContaining({
          section: 'system',
          action: 'gdpr.erase_guest',
          meta: expect.objectContaining({
            entityType: 'reservation',
            entityId: 'r1',
            shopId,
          }),
        }),
      );
      expect(result.ok).toBe(true);
      expect(result.redactedFields).toContain('guestEmail');
      expect(result.meta.limitations.length).toBeGreaterThan(0);
      expect(result.meta.limitations.join(' ')).toMatch(/money|accounting/i);
      expect(result.meta.limitations.join(' ')).toMatch(/Lemon|operator/i);
    });

    it('redacts eventRequest PII', async () => {
      const prisma = makePrisma();
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      await service.eraseGuest(
        actor,
        eraseDto({ entityType: 'eventRequest', entityId: 'er1' }),
      );

      expect(prisma.eventRequest.findFirst).toHaveBeenCalledWith({
        where: { id: 'er1', shopId },
        select: { id: true },
      });
      expect(prisma.eventRequest.update).toHaveBeenCalledWith({
        where: { id: 'er1' },
        data: expect.objectContaining({
          guestName: '[redacted]',
          guestEmail: null,
          guestPhone: null,
          message: null,
        }),
      });
      expect(audit.record).toHaveBeenCalled();
    });

    it('redacts guestChat contact fields and message bodies', async () => {
      const prisma = makePrisma();
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.eraseGuest(
        actor,
        eraseDto({ entityType: 'guestChat', entityId: 'gc1' }),
      );

      expect(prisma.guestChat.findFirst).toHaveBeenCalledWith({
        where: { id: 'gc1', shopId },
        select: { id: true },
      });
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(prisma.guestChat.update).toHaveBeenCalledWith({
        where: { id: 'gc1' },
        data: expect.objectContaining({
          guestName: '[redacted]',
          guestEmail: null,
          guestPhone: null,
        }),
      });
      expect(prisma.guestChatMessage.updateMany).toHaveBeenCalledWith({
        where: { chatId: 'gc1' },
        data: { body: '[redacted]' },
      });
      expect(result.redactedFields).toContain('messages.body');
      expect(audit.record).toHaveBeenCalled();
    });

    it('redacts contactMessage and venueReview', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);

      await service.eraseGuest(
        actor,
        eraseDto({ entityType: 'contactMessage', entityId: 'cm1' }),
      );
      expect(prisma.contactMessage.update).toHaveBeenCalledWith({
        where: { id: 'cm1' },
        data: expect.objectContaining({
          guestName: '[redacted]',
          guestEmail: null,
          message: '[redacted]',
        }),
      });

      await service.eraseGuest(
        actor,
        eraseDto({ entityType: 'venueReview', entityId: 'vr1' }),
      );
      expect(prisma.venueReview.update).toHaveBeenCalledWith({
        where: { id: 'vr1' },
        data: expect.objectContaining({
          guestName: '[redacted]',
          guestEmail: null,
          comment: null,
        }),
      });
    });
  });

  describe('eraseAccount', () => {
    it('rejects wrong confirm phrase', async () => {
      const prisma = makePrisma();
      const service = makeService(prisma);
      await expect(
        service.eraseAccount(actor, {
          password: erasePassword,
          confirmPhrase: 'nope',
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('soft-wipes user and redacts owned shops', async () => {
      const prisma = makePrisma({
        shop: {
          findFirst: jest.fn(),
          findMany: jest
            .fn()
            .mockResolvedValue([{ id: shopId, slug: 'arcade' }]),
          update: jest.fn().mockResolvedValue({ id: shopId }),
        },
        reservation: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 2 }),
        },
        eventRequest: {
          findMany: jest.fn().mockResolvedValue([]),
          findFirst: jest.fn(),
          update: jest.fn(),
          updateMany: jest.fn().mockResolvedValue({ count: 0 }),
        },
        user: {
          findUnique: jest
            .fn()
            .mockResolvedValue({ passwordHash: ownerPasswordHash }),
          update: jest.fn().mockResolvedValue({ id: 'owner_1' }),
        },
      });
      const audit = makeAudit();
      const service = makeService(prisma, audit);

      const result = await service.eraseAccount(actor, {
        password: erasePassword,
        confirmPhrase: 'DELETE MY ACCOUNT',
      });

      expect(result.ok).toBe(true);
      expect(result.ownedShopsRedacted).toBe(1);
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'owner_1' },
          data: expect.objectContaining({
            email: 'deleted+owner_1@redacted.local',
            name: null,
            totpEnabled: false,
            totpSecretEnc: null,
            totpVerifiedAt: null,
          }),
        }),
      );
      expect(prisma.authSession.updateMany).toHaveBeenCalled();
      expect(prisma.mfaRecoveryCode.deleteMany).toHaveBeenCalledWith({
        where: { userId: 'owner_1' },
      });
      expect(audit.recordForShop).toHaveBeenCalledWith(
        shopId,
        expect.objectContaining({ action: 'gdpr.erase_account' }),
      );
      expect(result.meta.limitations.join(' ')).toMatch(/accounting|money/i);
    });
  });
});
