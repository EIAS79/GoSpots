import { GdprRetentionProcessor } from './gdpr-retention.processor';

describe('GdprRetentionProcessor', () => {
  it('redacts aged guest PII and strips old audit identifiers', async () => {
    const prisma = {
      reservation: {
        updateMany: jest.fn().mockResolvedValue({ count: 2 }),
      },
      eventRequest: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      contactMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 3 }),
      },
      venueReview: {
        updateMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      guestChat: {
        findMany: jest.fn().mockResolvedValue([{ id: 'gc1' }]),
        update: jest.fn().mockResolvedValue({ id: 'gc1' }),
      },
      guestChatMessage: {
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
      auditLog: {
        updateMany: jest.fn().mockResolvedValue({ count: 4 }),
        create: jest.fn().mockResolvedValue({ id: 'a1' }),
      },
      analyticsEvent: {
        deleteMany: jest.fn().mockResolvedValue({ count: 5 }),
      },
      authSession: {
        deleteMany: jest.fn().mockResolvedValue({ count: 6 }),
      },
      $transaction: jest.fn(async (ops: unknown) => ops),
    };

    const config = {
      get: jest.fn().mockReturnValue('on'),
    };

    const processor = new GdprRetentionProcessor(
      prisma as never,
      config as never,
    );

    const summary = await processor.runRetentionPass(
      new Date('2026-07-21T00:00:00Z'),
    );

    expect(summary.reservations).toBe(2);
    expect(summary.eventRequests).toBe(1);
    expect(summary.contactMessages).toBe(3);
    expect(summary.guestChats).toBe(1);
    expect(summary.auditLogsStripped).toBe(4);
    expect(summary.analyticsDeleted).toBe(5);
    expect(summary.authSessionsDeleted).toBe(6);
    expect(prisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ action: 'gdpr.retention_pass' }),
      }),
    );
  });
});
