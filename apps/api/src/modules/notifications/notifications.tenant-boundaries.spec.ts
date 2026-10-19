import { NotificationsService } from './notifications.service';
import { NotificationsSseHub } from './notifications-sse.hub';
import type { JwtAccessPayload } from '../auth/auth.service';
import type { PrismaService } from '../../prisma/prisma.service';
import type { AuditService } from '../audit/audit.service';

const owner = {
  sub: 'user-a',
  shopId: 'shop-a',
  shopRole: 'OWNER',
  perms: '*',
} as JwtAccessPayload;

function harness() {
  const notification = {
    findMany: jest.fn().mockResolvedValue([]),
    findFirst: jest.fn().mockResolvedValue(null),
    update: jest.fn(),
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    deleteMany: jest.fn(),
  };
  const auditRecord = jest.fn();
  const hub = new NotificationsSseHub();
  const service = new NotificationsService(
    { notification } as unknown as PrismaService,
    { record: auditRecord } as unknown as AuditService,
    hub,
  );
  return { notification, auditRecord, hub, service };
}

describe('notification SSE/export/admin tenant boundary', () => {
  it('never streams another shop or another user targeted notification', () => {
    const { hub } = harness();
    const seen: string[] = [];
    const subscription = hub
      .forActor('shop-a', 'user-a')
      .subscribe((event) => seen.push(event.id));
    const event = {
      shopId: 'shop-a',
      userId: null,
      id: 'a',
      section: 'operations',
      title: 'title',
      body: 'body',
      href: '/sessions',
      createdAt: new Date().toISOString(),
    };
    hub.publish(event);
    hub.publish({ ...event, shopId: 'shop-b', id: 'foreign-shop' });
    hub.publish({ ...event, userId: 'user-b', id: 'foreign-user' });
    hub.publish({ ...event, userId: 'user-a', id: 'targeted-owner' });
    subscription.unsubscribe();
    expect(seen).toEqual(['a', 'targeted-owner']);
  });

  it('scopes CSV export by shop and actor and denies unprivileged access', async () => {
    const h = harness();
    await h.service.exportCsv(owner);
    const firstQuery = h.notification.findMany.mock.calls[0] as [
      {
        where: {
          shopId: string;
          OR: Array<{ userId: string | null }>;
          archivedAt: Date | null;
        };
        take: number;
      },
    ];
    expect(firstQuery[0].where).toMatchObject({
      shopId: 'shop-a',
      OR: [{ userId: null }, { userId: 'user-a' }],
      archivedAt: null,
    });
    expect(firstQuery[0].take).toBe(10_000);
    await expect(
      h.service.exportCsv({
        ...owner,
        shopRole: 'STAFF',
        perms: '',
      }),
    ).rejects.toThrow(/Missing notifications.read/);
    expect(h.notification.findMany).toHaveBeenCalledTimes(1);
  });

  it('rejects foreign notification ID without mutation even for owner', async () => {
    const h = harness();
    await expect(h.service.markRead(owner, 'foreign-id')).rejects.toThrow(
      'Notification not found',
    );
    expect(h.notification.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'foreign-id',
        shopId: 'shop-a',
        OR: [{ userId: null }, { userId: 'user-a' }],
      },
    });
    expect(h.notification.update).not.toHaveBeenCalled();
  });

  it('blocks staff destructive admin action before any database or audit side effect', async () => {
    const h = harness();
    await expect(
      h.service.removeMany(
        { ...owner, shopRole: 'STAFF', perms: '' },
        { ids: ['foreign-id'] },
      ),
    ).rejects.toThrow(/Only the venue owner/);
    expect(h.notification.deleteMany).not.toHaveBeenCalled();
    expect(h.auditRecord).not.toHaveBeenCalled();
  });

  it('denies read-state and archive mutations for staff without notifications.read before database access', async () => {
    const h = harness();
    const noPermission = { ...owner, shopRole: 'STAFF', perms: '' };
    await expect(h.service.markRead(noPermission, 'known-id')).rejects.toThrow(
      /Missing notifications.read/,
    );
    await expect(
      h.service.markUnread(noPermission, 'known-id'),
    ).rejects.toThrow(/Missing notifications.read/);
    await expect(h.service.markAllRead(noPermission)).rejects.toThrow(
      /Missing notifications.read/,
    );
    await expect(
      h.service.archive(noPermission, { ids: ['known-id'] }),
    ).rejects.toThrow(/Missing notifications.read/);
    await expect(
      h.service.unarchive(noPermission, { ids: ['known-id'] }),
    ).rejects.toThrow(/Missing notifications.read/);
    await expect(h.service.unarchive(noPermission, {})).rejects.toThrow(
      /Missing notifications.read/,
    );
    await expect(
      h.service.unarchive(noPermission, { allMatching: true }),
    ).rejects.toThrow(/Missing notifications.read/);
    expect(h.notification.updateMany).not.toHaveBeenCalled();
    expect(h.notification.findFirst).not.toHaveBeenCalled();
    expect(h.notification.update).not.toHaveBeenCalled();
    expect(h.notification.findMany).not.toHaveBeenCalled();
    expect(h.auditRecord).not.toHaveBeenCalled();
  });

  it('allows permissioned staff but keeps single-record writes tenant- and recipient-bound', async () => {
    const h = harness();
    const staff = { ...owner, shopRole: 'STAFF', perms: 'notifications.read' };
    const row = {
      id: 'owned-notification',
      shopId: 'shop-a',
      userId: 'user-a',
      type: 'SYSTEM',
      section: 'operations',
      title: 'Test',
      body: 'Test',
      href: '/sessions',
      readAt: null,
      archivedAt: null,
      createdAt: new Date('2026-10-14T10:00:00Z'),
    };
    h.notification.findFirst.mockResolvedValue(row);
    h.notification.update.mockResolvedValue(row);
    await h.service.markRead(staff, row.id);
    await h.service.markUnread(staff, row.id);
    expect(h.notification.findFirst).toHaveBeenCalledTimes(2);
    expect(h.notification.update).toHaveBeenCalledTimes(2);
    const updates = h.notification.update.mock.calls as unknown as Array<
      [
        {
          where: {
            id: string;
            shopId: string;
            OR: Array<{ userId: string | null }>;
          };
          data: { readAt: Date | null };
        },
      ]
    >;
    for (const [whereQuery] of updates) {
      expect(whereQuery.where).toEqual({
        id: row.id,
        shopId: 'shop-a',
        OR: [{ userId: null }, { userId: 'user-a' }],
      });
    }
    expect(updates[0][0].data.readAt).toBeInstanceOf(Date);
    expect(updates[1][0].data.readAt).toBeNull();
  });

  it('unarchive permits authorized owner and staff only within their shop and recipient, even on zero updates', async () => {
    const h = harness();
    const staff = { ...owner, shopRole: 'STAFF', perms: 'notifications.read' };
    const foreignIds = ['foreign-shop-id', 'foreign-user-id'];
    expect(await h.service.unarchive(staff, { ids: foreignIds })).toEqual({
      updated: 0,
    });
    expect(h.notification.updateMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-a',
        id: { in: foreignIds },
        archivedAt: { not: null },
        OR: [{ userId: null }, { userId: 'user-a' }],
      },
      data: { archivedAt: null },
    });
    // An independent transaction could reassign the row between lookup
    // and write; updateMany remains atomic and scoped by shop/user.
    expect(await h.service.unarchive(staff, { allMatching: true })).toEqual({
      updated: 0,
    });
    const unarchiveCalls = h.notification.updateMany.mock
      .calls as unknown as Array<
      [
        {
          where: {
            shopId: string;
            archivedAt: unknown;
            OR: Array<{ userId: string | null }>;
          };
        },
      ]
    >;
    expect(unarchiveCalls.at(-1)?.[0].where).toMatchObject({
      shopId: 'shop-a',
      archivedAt: { not: null },
      OR: [{ userId: null }, { userId: 'user-a' }],
    });
    expect(await h.service.unarchive(owner, {})).toEqual({ updated: 0 });
    expect(h.notification.updateMany).toHaveBeenCalledTimes(2);
  });

  it('does not allow foreign-shop owner identity to override the actor shop filter', async () => {
    const h = harness();
    await h.service.unarchive(
      { ...owner, shopId: 'shop-b' },
      {
        ids: ['shop-a-notification'],
      },
    );
    expect(h.notification.updateMany).toHaveBeenCalledWith({
      where: {
        shopId: 'shop-b',
        id: { in: ['shop-a-notification'] },
        archivedAt: { not: null },
        OR: [{ userId: null }, { userId: 'user-a' }],
      },
      data: { archivedAt: null },
    });
  });
});
